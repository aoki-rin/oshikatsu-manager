package com.aoki.oshikatsumgr;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.chromium.net.CronetEngine;
import org.chromium.net.CronetException;
import org.chromium.net.UrlRequest;
import org.chromium.net.UrlResponseInfo;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 用 Chromium 的网络栈（Cronet）发 HTTP 请求。
 *
 * 为什么需要它：l-tike.com（ローチケ）背后是 Akamai Bot Manager，它按
 * 「TLS ClientHello 指纹 + HTTP/2 行为 + 头集与所声称 UA 的一致性」判定客户端。
 * 实测（2026-07-28，见 docs/adr/0005）在同一个出口 IP 下：
 *   curl / Python / OkHttp(CapacitorHttp) → TLS 握手走完后被静默丢弃（表现为超时）
 *   Node undici / Chromium              → 正常返回
 * 出口 IP 不是判据（住宅与运营商 IP 下 Chromium 都通），客户端栈才是。
 */
@CapacitorPlugin(name = "CronetHttp")
public class CronetHttpPlugin extends Plugin {

    private static final int DEFAULT_TIMEOUT_MS = 20000;

    private CronetEngine engine;
    private ScheduledExecutorService timeoutScheduler;

    @Override
    public void load() {
        // 引擎构建一次复用：每请求新建会重复初始化 QUIC/缓存，且拖慢首个请求。
        engine = new CronetEngine.Builder(getContext()).build();
        timeoutScheduler = Executors.newSingleThreadScheduledExecutor();
    }

    @Override
    protected void handleOnDestroy() {
        if (timeoutScheduler != null) {
            timeoutScheduler.shutdown();
        }
        if (engine != null) {
            engine.shutdown();
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        JSObject headers = call.getObject("headers", new JSObject());
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);

        // 每请求一个单线程 executor。Cronet 只保证「回调在该 executor 的线程上」，
        // **不保证串行**：共享线程池时相邻回调会落在不同线程并在时间上重叠
        // （典型：onReadCompleted 尚未返回，超时线程的 cancel 已触发 onCanceled）。
        // 单线程 executor 让「上一个回调提交 → 下一个回调执行」有 Executor 契约级的
        // happens-before，body 的可见性与互斥才是被保证的而非碰巧成立。
        // 代价是每请求一个线程，settle 时立即 shutdown。
        ExecutorService requestExecutor = Executors.newSingleThreadExecutor();
        BodyCollector collector = new BodyCollector(call, requestExecutor);
        UrlRequest.Builder builder = engine.newUrlRequestBuilder(url, collector, requestExecutor);

        // 用 getString 而非 optString：Android 的 org.json 里 JSON null 会存成 JSONObject.NULL
        // 这个「非 null 的哨兵对象」，optString(key, null) 对它返回字符串 "null"，
        // 于是 `value != null` 永远成立（死分支），最终把 `X-Foo: null` 发上网——
        // 而本插件存在的理由正是 Akamai 会校验头集，一个多余的假头足以让请求被重置。
        // Capacitor 的 JSObject.getString 内部走 isNull(key)，才是真的 null 感知。
        for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
            String key = it.next();
            String value = headers.getString(key, null);
            if (value != null) {
                builder.addHeader(key, value);
            }
        }

        UrlRequest request = builder.build();
        // 硬超时必须用调度取消，不能只在回调里比时间：连接若在任何回调触发前就卡住
        // （TCP 黑洞 / TLS 后被静默丢弃——正是 Akamai 拒绝时的表现），回调永远不来，
        // 那种写法就永远不判超时，PluginCall 也永远不 settle。
        collector.armTimeout(timeoutScheduler, request, timeoutMs);
        request.start();
    }

    /** 累积响应体；无论成功/失败/取消，都只 settle 一次。 */
    private static class BodyCollector extends UrlRequest.Callback {
        // 响应体上限：真实搜索页约 180KB。留 8MB 余量，超出即视为异常响应并中止——
        // 否则一个畸形/超大响应会把整个页面读进内存。
        private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

        private final PluginCall call;
        private final ExecutorService requestExecutor;
        private final ByteArrayOutputStream body = new ByteArrayOutputStream();
        // check-then-set 不是原子的；用 CAS 而不是 volatile boolean，正确性不靠「实现上
        // 两个终态回调不可能并发」这种无法从 javadoc 引用的不变量。
        private final AtomicBoolean settled = new AtomicBoolean(false);
        // 取消原因：cancel() 的两个来源（超时 / 响应体超限）都落到 onCanceled，
        // 不区分就会把「响应过大」误报成「连接超时」，让人去查网络。
        private volatile String cancelReason = "cronet timeout";
        private ScheduledFuture<?> timeoutTask;

        BodyCollector(PluginCall call, ExecutorService requestExecutor) {
            this.call = call;
            this.requestExecutor = requestExecutor;
        }

        void armTimeout(ScheduledExecutorService scheduler, UrlRequest request, int timeoutMs) {
            timeoutTask = scheduler.schedule(request::cancel, timeoutMs, TimeUnit.MILLISECONDS);
        }

        /** 唯一的收尾出口：抢到 CAS 的那次负责解除定时器、关闭线程、答复 JS。 */
        private boolean claimSettle() {
            if (!settled.compareAndSet(false, true)) {
                return false;
            }
            if (timeoutTask != null) {
                timeoutTask.cancel(false);
            }
            // 从该 executor 自己的线程上调 shutdown 是安全的：不打断当前任务，只是不再接新任务。
            requestExecutor.shutdown();
            return true;
        }

        @Override
        public void onRedirectReceived(UrlRequest request, UrlResponseInfo info, String newLocationUrl) {
            // 不自己数跳数：Cronet 内部硬编码上限 20（net/url_request/url_request.h kMaxRedirects，
            // 无 setter），超出会在回调前就失败成 ERR_TOO_MANY_REDIRECTS 走到 onFailed。
            request.followRedirect();
        }

        @Override
        public void onResponseStarted(UrlRequest request, UrlResponseInfo info) {
            request.read(ByteBuffer.allocateDirect(32 * 1024));
        }

        @Override
        public void onReadCompleted(UrlRequest request, UrlResponseInfo info, ByteBuffer buffer) {
            if (body.size() > MAX_BODY_BYTES) {
                cancelReason = "cronet response too large (>" + (MAX_BODY_BYTES / 1024 / 1024) + "MB)";
                request.cancel();
                return;
            }
            buffer.flip();
            byte[] chunk = new byte[buffer.remaining()];
            buffer.get(chunk);
            body.write(chunk, 0, chunk.length);
            buffer.clear();
            request.read(buffer);
        }

        @Override
        public void onSucceeded(UrlRequest request, UrlResponseInfo info) {
            if (!claimSettle()) {
                return;
            }
            JSObject result = new JSObject();
            result.put("status", info.getHttpStatusCode());
            result.put("url", info.getUrl());
            result.put("negotiatedProtocol", info.getNegotiatedProtocol());
            result.put("data", new String(body.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(result);
        }

        @Override
        public void onFailed(UrlRequest request, UrlResponseInfo info, CronetException error) {
            if (!claimSettle()) {
                return;
            }
            call.reject("cronet failed: " + error.getMessage());
        }

        @Override
        public void onCanceled(UrlRequest request, UrlResponseInfo info) {
            if (!claimSettle()) {
                return;
            }
            call.reject(cancelReason);
        }
    }
}
