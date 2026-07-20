package com.peace.webtable.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * API 请求体大小过滤器。
 *
 * 职责：在请求进入控制器和 JSON 反序列化前，拒绝明显超大的非 multipart API 请求，降低恶意大包对内存和线程的消耗。
 * 照片上传属于 multipart，继续使用 Spring Multipart 的 50MB 限制。
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestBodySizeFilter extends OncePerRequestFilter {

    /** 需要检查请求体大小的 HTTP 方法。 */
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH");

    /** 默认非 multipart API 请求体上限：1MB。 */
    @Value("${app.request.max-json-body-bytes:1048576}")
    private long maxJsonBodyBytes = 1024L * 1024L;

    /**
     * 只过滤携带请求体的 `/api/*` 非 multipart 请求。
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request != null ? request.getRequestURI() : null;
        if (uri == null || !uri.startsWith("/api/")) {
            return true;
        }
        String method = request.getMethod() != null ? request.getMethod().toUpperCase(Locale.ROOT) : "";
        if (!BODY_METHODS.contains(method)) {
            return true;
        }
        String contentType = request.getContentType();
        return contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith(MediaType.MULTIPART_FORM_DATA_VALUE);
    }

    /**
     * 根据 Content-Length 快速拒绝超大 JSON/表单请求。
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (maxJsonBodyBytes < 1) {
            throw new IllegalStateException("非 multipart API 请求体大小限制必须为正数");
        }

        long contentLength = request.getContentLengthLong();
        if (contentLength > maxJsonBodyBytes) {
            log.warn("API 请求体超过大小限制：path={}, contentLength={}, maxBytes={}",
                    request.getRequestURI(), contentLength, maxJsonBodyBytes);
            writePayloadTooLarge(response);
            return;
        }

        filterChain.doFilter(request, response);
    }

    /**
     * 返回统一 ApiResponse 结构，方便前端错误拦截器直接显示脱敏提示。
     */
    private void writePayloadTooLarge(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store, no-cache, must-revalidate, max-age=0");
        response.getWriter().write("{\"code\":413,\"message\":\"请求体大小不能超过 "
                + maxBodySizeLabel() + "\",\"data\":null}");
    }

    /**
     * 生成人类可读的大小上限提示。
     */
    private String maxBodySizeLabel() {
        if (maxJsonBodyBytes % (1024L * 1024L) == 0) {
            return (maxJsonBodyBytes / (1024L * 1024L)) + "MB";
        }
        if (maxJsonBodyBytes % 1024L == 0) {
            return (maxJsonBodyBytes / 1024L) + "KB";
        }
        return maxJsonBodyBytes + "B";
    }
}
