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
     * 允许任意来源访问（内网穿透场景下域名不固定，无法穷举）。
     * 通过 addAllowedOriginPattern("**") 匹配所有来源，
     * 配合 allowCredentials(true) 使用 Origin 反射模式。
     *
     * @return CorsFilter 实例
     */
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        // 允许任意来源（内网穿透域名不固定）
        config.addAllowedOriginPattern("**");
        // 允许所有请求头
        config.addAllowedHeader("*");
        // 允许必要的 HTTP 方法
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
