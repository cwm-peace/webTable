package com.peace.webtable.config;

import com.peace.webtable.dto.ApiResponse;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.lang.reflect.Method;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ApiResponse HTTP 状态同步测试。
 */
class ApiResponseStatusAdviceTest {

    private final ApiResponseStatusAdvice advice = new ApiResponseStatusAdvice();

    @Test
    void supportsDirectApiResponseReturnType() throws NoSuchMethodException {
        MethodParameter returnType = returnType("directApiResponse");

        boolean supported = advice.supports(returnType, MappingJackson2HttpMessageConverter.class);

        assertThat(supported).isTrue();
    }

    @Test
    void setsHttpStatusFromErrorApiResponseCode() throws NoSuchMethodException {
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        Object body = advice.beforeBodyWrite(
                ApiResponse.error(429, "请求过于频繁"),
                returnType("directApiResponse"),
                null,
                MappingJackson2HttpMessageConverter.class,
                servletRequest("/api/form"),
                new ServletServerHttpResponse(servletResponse));

        assertThat(body).isInstanceOf(ApiResponse.class);
        assertThat(servletResponse.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    void keepsSuccessApiResponseHttpStatusUnchanged() throws NoSuchMethodException {
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        advice.beforeBodyWrite(
                ApiResponse.ok(Map.of("ok", true)),
                returnType("directApiResponse"),
                null,
                MappingJackson2HttpMessageConverter.class,
                servletRequest("/api/form"),
                new ServletServerHttpResponse(servletResponse));

        assertThat(servletResponse.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void ignoresNonApiResponseBody() throws NoSuchMethodException {
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        Object body = advice.beforeBodyWrite(
                "plain",
                returnType("plainString"),
                null,
                MappingJackson2HttpMessageConverter.class,
                servletRequest("/health"),
                new ServletServerHttpResponse(servletResponse));

        assertThat(body).isEqualTo("plain");
        assertThat(servletResponse.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    private MethodParameter returnType(String methodName) throws NoSuchMethodException {
        Method method = getClass().getDeclaredMethod(methodName);
        return new MethodParameter(method, -1);
    }

    private ServletServerHttpRequest servletRequest(String path) {
        return new ServletServerHttpRequest(new MockHttpServletRequest("GET", path));
    }

    private ApiResponse<Map<String, Object>> directApiResponse() {
        return ApiResponse.ok(Map.of());
    }

    private String plainString() {
        return "plain";
    }
}
