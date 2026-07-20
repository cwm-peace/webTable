package com.peace.webtable.config;

import com.peace.webtable.dto.ApiResponse;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 统一 API 响应 HTTP 状态处理器。
 *
 * 职责：当控制器返回 {@link ApiResponse} 且业务 code 为 4xx/5xx 时，将 HTTP 状态同步为相同状态码。
 * 这样前端、网关和监控系统可以直接通过 HTTP 状态识别鉴权失败、限流和参数错误。
 */
@RestControllerAdvice
public class ApiResponseStatusAdvice implements ResponseBodyAdvice<Object> {

    /**
     * 仅处理可能包含 ApiResponse 的控制器返回值。
     */
    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return ApiResponse.class.isAssignableFrom(returnType.getParameterType())
                || returnType.getGenericParameterType().getTypeName().contains(ApiResponse.class.getName());
    }

    /**
     * 将 ApiResponse.code 中的客户端/服务端错误同步到 HTTP 状态。
     */
    @Override
    public Object beforeBodyWrite(Object body,
                                  MethodParameter returnType,
                                  MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request,
                                  ServerHttpResponse response) {
        if (body instanceof ApiResponse<?> apiResponse) {
            int code = apiResponse.getCode();
            if (code >= 400 && code <= 599) {
                response.setStatusCode(HttpStatusCode.valueOf(code));
            }
        }
        return body;
    }
}
