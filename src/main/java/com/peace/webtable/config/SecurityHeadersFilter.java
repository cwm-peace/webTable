package com.peace.webtable.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * API 安全响应头过滤器。
 *
 * 职责：为所有 `/api/*` 响应设置基础安全头和禁缓存策略，降低敏感表单、照片、导出文件被浏览器或中间层缓存、嗅探或嵌入的风险。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    /** 禁止浏览器和代理缓存敏感 API 响应。 */
    private static final String CACHE_CONTROL_VALUE = "no-store, no-cache, must-revalidate, max-age=0";

    /**
     * 只过滤 API 响应，避免影响 Vite/静态资源的浏览器缓存策略。
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request != null ? request.getRequestURI() : null;
        return uri == null || !uri.startsWith("/api/");
    }

    /**
     * 写入安全响应头后继续执行后续过滤器和控制器。
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        response.setHeader("Cache-Control", CACHE_CONTROL_VALUE);
        response.setHeader("Pragma", "no-cache");
        response.setDateHeader("Expires", 0L);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        filterChain.doFilter(request, response);
    }
}
