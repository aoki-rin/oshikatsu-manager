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

    @Override
    public void load() {
        // Cronet 引擎构建一次复用：每请求新建会重复初始化 QUIC/缓存，且拖慢首个请求。
        engine = new CronetEngine.Builder(getContext()).build();
        executor = Executors.newCachedThreadPool();
    }

    @Override
    protected void handleOnDestroy() {
        if (executor != null) {
            executor.shutdown();
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

        UrlRequest.Builder builder = engine.newUrlRequestBuilder(url, new BodyCollector(call, timeoutMs), executor);
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
        builder.build().start();
    }

    /** 累积响应体；成功/失败都只 resolve/reject 一次。 */
    private static class BodyCollector extends UrlRequest.Callback {
        private final PluginCall call;
        private final long deadline;
        private final ByteArrayOutputStream body = new ByteArrayOutputStream();
        private boolean settled = false;

        BodyCollector(PluginCall call, int timeoutMs) {
            this.call = call;
            this.deadline = System.currentTimeMillis() + timeoutMs;
        }

        private boolean expired(UrlRequest request) {
            if (System.currentTimeMillis() <= deadline) {
                return false;
            }
            request.cancel();
            return true;
        }

        @Override
        public void onRedirectReceived(UrlRequest request, UrlResponseInfo info, String newLocationUrl) {
            if (expired(request)) {
                return;
            }
            request.followRedirect();
        }

        @Override
        public void onResponseStarted(UrlRequest request, UrlResponseInfo info) {
            if (expired(request)) {
                return;
            }
            request.read(ByteBuffer.allocateDirect(32 * 1024));
        }

        @Override
        public void onReadCompleted(UrlRequest request, UrlResponseInfo info, ByteBuffer buffer) {
            if (expired(request)) {
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
