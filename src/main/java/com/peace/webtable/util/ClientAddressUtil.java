package com.peace.webtable.util;

import jakarta.servlet.http.HttpServletRequest;

/**
 * HTTP 客户端地址工具类。
 *
 * 职责：集中获取 Servlet 容器解析后的远端地址，供登录和公开创建接口做限流。
 */
public final class ClientAddressUtil {

    private ClientAddressUtil() {
    }

    /**
     * 获取客户端地址。
     *
     * 默认使用 Servlet 容器解析后的 remoteAddr；部署在反向代理后时，应由网关或容器负责可信转发头处理。
     *
     * @param request HTTP 请求
     * @return 客户端地址，不可用时返回 unknown
     */
    public static String clientAddress(HttpServletRequest request) {
        String remoteAddr = request != null ? request.getRemoteAddr() : null;
        return remoteAddr != null && !remoteAddr.isBlank() ? remoteAddr : "unknown";
    }
}
