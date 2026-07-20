package com.peace.webtable.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;
import java.util.List;

/**
 * 跨域配置类
 *
 * 职责：允许前端开发服务器访问后端 API。
 * 安全限制：只允许配置中的来源域名，限制 HTTP 方法和请求头。
 */
@Configuration
public class CorsConfig {

    /**
     * 允许访问 API 的前端来源模式。
     *
     * 默认只放开本机 Vite 开发地址；部署或手机局域网调试时通过配置显式追加域名或 IP。
     */
    @Value("${app.cors.allowed-origin-patterns:http://localhost:5173,http://127.0.0.1:5173}")
    private String allowedOriginPatterns;

    /**
     * 创建 CORS 过滤器
     *
     * 按配置放开来源模式，避免默认允许任意网站跨域访问。
     * 下载接口需要前端读取 Content-Disposition 文件名，因此显式暴露该响应头。
     *
     * @return CorsFilter 实例
     */
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();

        for (String originPattern : parseAllowedOriginPatterns()) {
            config.addAllowedOriginPattern(originPattern);
        }

        config.setAllowedHeaders(List.of(
                HttpHeaders.ACCEPT,
                HttpHeaders.CONTENT_TYPE,
                HttpHeaders.ORIGIN,
                "X-Requested-With",
                "X-Session-Token",
                "X-Admin-Token"
        ));
        config.setAllowedMethods(List.of(
                HttpMethod.GET.name(),
                HttpMethod.POST.name(),
                HttpMethod.PUT.name(),
                HttpMethod.DELETE.name(),
                HttpMethod.OPTIONS.name()
        ));
        config.setExposedHeaders(List.of(HttpHeaders.CONTENT_DISPOSITION));
        config.setMaxAge(3600L);
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }

    /**
     * 解析逗号分隔的来源配置，过滤空值。
     *
     * @return 允许的来源模式列表
     */
    private List<String> parseAllowedOriginPatterns() {
        return Arrays.stream(allowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(pattern -> !pattern.isEmpty())
                .toList();
    }
}
