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

/**
 * 用 Chromium 的网络栈（Cronet）发 HTTP 请求。
 *
 * 为什么需要它：l-tike.com（ローチケ）背后是 Akamai Bot Manager，它按 TLS ClientHello 指纹
 * （JA3/JA4）判定客户端。实测（2026-07-28，见 docs/adr/0005）在同一个出口 IP 下：
 *   curl / Python / OkHttp(CapacitorHttp) → TLS 握手走完后被静默丢弃（表现为超时）
 *   Node undici / Chromium              → 正常返回
 * 出口 IP 不是判据（住宅与运营商 IP 下 Chromium 都通），客户端栈才是。
 * Cronet 就是 Chrome 用的那套网络栈，因此在设备本地即可拿到页面，无需住宅代理。
 */
@CapacitorPlugin(name = "CronetHttp")
public class CronetHttpPlugin extends Plugin {

    private static final int DEFAULT_TIMEOUT_MS = 20000;
    private CronetEngine engine;
    private ExecutorService executor;
    private ScheduledExecutorService timeoutScheduler;

    @Override
    public void load() {
        // Cronet 引擎构建一次复用：每请求新建会重复初始化 QUIC/缓存，且拖慢首个请求。
        engine = new CronetEngine.Builder(getContext()).build();
        executor = Executors.newCachedThreadPool();
        timeoutScheduler = Executors.newSingleThreadScheduledExecutor();
    }

    @Override
    protected void handleOnDestroy() {
        if (executor != null) {
            executor.shutdown();
        }
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

        BodyCollector collector = new BodyCollector(call);
        UrlRequest.Builder builder = engine.newUrlRequestBuilder(url, collector, executor);
        if (headers != null) {
            // JSObject 继承 JSONObject，用 keys() 迭代（没有 entrySet）。
            for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
                String key = it.next();
                String value = headers.optString(key, null);
                if (value != null) {
                    builder.addHeader(key, value);
                }
            }
        }
        UrlRequest request = builder.build();
        // 硬超时必须用调度取消,不能只在回调里比时间：连接若在任何回调触发前就卡住
        // （TCP 黑洞 / TLS 后被静默丢弃——正是 Akamai 拒绝时的表现），回调永远不来,
        // 那种写法就永远不判超时,PluginCall 也永远不 settle。
        collector.armTimeout(timeoutScheduler, request, timeoutMs);
        request.start();
    }

    /** 累积响应体；成功/失败都只 resolve/reject 一次。 */
    private static class BodyCollector extends UrlRequest.Callback {
        // 响应体上限：真实搜索页约 180KB。留 8MB 余量,超出即视为异常响应并中止——
        // 否则一个畸形/超大响应会把整个页面读进内存。
        private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

        private final PluginCall call;
        private final ByteArrayOutputStream body = new ByteArrayOutputStream();
        // settled 跨 Cronet 执行线程与超时调度线程读写,必须 volatile 才有可见性。
        private volatile boolean settled = false;
        private ScheduledFuture<?> timeoutTask;

        BodyCollector(PluginCall call) {
            this.call = call;
        }

        void armTimeout(ScheduledExecutorService scheduler, UrlRequest request, int timeoutMs) {
            timeoutTask = scheduler.schedule(request::cancel, timeoutMs, TimeUnit.MILLISECONDS);
        }

        private void disarmTimeout() {
            if (timeoutTask != null) {
                timeoutTask.cancel(false);
            }
        }

        @Override
        public void onRedirectReceived(UrlRequest request, UrlResponseInfo info, String newLocationUrl) {
            request.followRedirect();
        }

        @Override
        public void onResponseStarted(UrlRequest request, UrlResponseInfo info) {
            request.read(ByteBuffer.allocateDirect(32 * 1024));
        }

        @Override
        public void onReadCompleted(UrlRequest request, UrlResponseInfo info, ByteBuffer buffer) {
            if (body.size() > MAX_BODY_BYTES) {
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
            if (settled) {
                return;
            }
            settled = true;
            disarmTimeout();
            disarmTimeout();
            disarmTimeout();
            JSObject result = new JSObject();
            result.put("status", info.getHttpStatusCode());
            result.put("url", info.getUrl());
            result.put("negotiatedProtocol", info.getNegotiatedProtocol());
            result.put("data", new String(body.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(result);
        }

        @Override
        public void onFailed(UrlRequest request, UrlResponseInfo info, CronetException error) {
            if (settled) {
                return;
            }
            settled = true;
            call.reject("cronet failed: " + error.getMessage());
        }

        @Override
        public void onCanceled(UrlRequest request, UrlResponseInfo info) {
            if (settled) {
                return;
            }
            settled = true;
            call.reject("cronet timeout");
        }
    }
}
