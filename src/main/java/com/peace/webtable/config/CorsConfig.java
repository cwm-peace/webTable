package com.peace.webtable.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * 跨域配置类
 *
 * 职责：允许前端开发服务器访问后端 API。
 * 安全限制：只允许指定的来源域名，限制 HTTP 方法和请求头。
 */
@Configuration
public class CorsConfig {

    /**
     * 创建 CORS 过滤器
     *
     * 安全配置：
     * - 只允许前端开发服务器来源（localhost:5173）
     * - 只允许必要的 HTTP 方法
     * - 只允许必要的请求头
     *
     * @return CorsFilter 实例
     */
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        // 只允许前端开发服务器来源，生产环境需改为实际域名
        config.addAllowedOrigin("http://localhost:5173");
        config.addAllowedOriginPattern("http://*.frp.one:*");
        config.addAllowedOriginPattern("https://*.frp.one:*");
        // config.addAllowedOriginPattern("http://*.lsj-2.frp.one:*");
        // config.addAllowedOriginPattern("https://*.lsj-2.frp.one:*");
        // 只允许必要的请求头
        config.addAllowedHeader("Content-Type");
        config.addAllowedHeader("X-Session-Token");
        config.addAllowedHeader("X-Admin-Token");
        // 只允许必要的 HTTP 方法
        config.addAllowedMethod("GET");
        config.addAllowedMethod("POST");
        config.addAllowedMethod("PUT");
        config.addAllowedMethod("DELETE");
        // 允许携带凭证
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
