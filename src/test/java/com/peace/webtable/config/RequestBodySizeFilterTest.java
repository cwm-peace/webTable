package com.peace.webtable.config;

import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * API 请求体大小过滤器测试。
 */
class RequestBodySizeFilterTest {

    @Test
    void rejectsOversizedNonMultipartApiRequestBeforeController() throws Exception {
        RequestBodySizeFilter filter = requestBodySizeFilter(1024L);
        MockHttpServletRequest request = apiRequest("POST", "/api/form/step1/1", "application/json", 1025);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store, no-cache, must-revalidate, max-age=0");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo("{\"code\":413,\"message\":\"请求体大小不能超过 1KB\",\"data\":null}");
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void allowsNonMultipartApiRequestAtLimit() throws Exception {
        RequestBodySizeFilter filter = requestBodySizeFilter(1024L);
        MockHttpServletRequest request = apiRequest("PUT", "/api/form/step3/left/1", "application/json", 1024);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_OK);
        assertThat(chain.getRequest()).isSameAs(request);
    }

    @Test
    void skipsMultipartApiRequestsSoPhotoLimitUsesMultipartConfiguration() throws Exception {
        RequestBodySizeFilter filter = requestBodySizeFilter(1024L);
        MockHttpServletRequest request = apiRequest("POST", "/api/photo/1", "multipart/form-data; boundary=abc", 50_000_000);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_OK);
        assertThat(chain.getRequest()).isSameAs(request);
    }

    @Test
    void skipsNonApiRequests() throws Exception {
        RequestBodySizeFilter filter = requestBodySizeFilter(1024L);
        MockHttpServletRequest request = apiRequest("POST", "/assets/index.js", "application/json", 4096);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_OK);
        assertThat(chain.getRequest()).isSameAs(request);
    }

    @Test
    void rejectsInvalidLimitConfiguration() {
        RequestBodySizeFilter filter = requestBodySizeFilter(0L);
        MockHttpServletRequest request = apiRequest("POST", "/api/form", "application/json", 1);
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThatThrownBy(() -> filter.doFilter(request, response, new MockFilterChain()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("请求体大小限制必须为正数");
    }

    private RequestBodySizeFilter requestBodySizeFilter(long maxBytes) {
        RequestBodySizeFilter filter = new RequestBodySizeFilter();
        ReflectionTestUtils.setField(filter, "maxJsonBodyBytes", maxBytes);
        return filter;
    }

    private MockHttpServletRequest apiRequest(String method, String path, String contentType, int contentLength) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setContentType(contentType);
        request.setContent(new byte[contentLength]);
        return request;
    }
}
