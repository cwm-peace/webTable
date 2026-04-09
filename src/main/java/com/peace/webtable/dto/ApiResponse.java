package com.peace.webtable.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 统一 API 响应包装类
 *
 * 职责：所有 REST 接口的返回值统一格式，便于前端解析。
 * 包含状态码、提示消息和实际数据三部分。
 *
 * 使用示例：
 * - 成功：ApiResponse.ok(data)
 * - 失败：ApiResponse.error("参数错误")
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {

    /** 状态码：200 成功，其他为错误码 */
    private int code;

    /** 提示消息 */
    private String message;

    /** 响应数据 */
    private T data;

    /**
     * 构造成功响应（无数据）
     *
     * @return 成功的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> ok() {
        return new ApiResponse<>(200, "success", null);
    }

    /**
     * 构造成功响应（带数据）
     *
     * @param data 响应数据
     * @return 成功的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(200, "success", data);
    }

    /**
     * 构造错误响应
     *
     * @param message 错误消息
     * @return 错误的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> error(String message) {
        return new ApiResponse<>(500, message, null);
    }

    /**
     * 构造自定义状态码的错误响应
     *
     * @param code 状态码
     * @param message 错误消息
     * @return 错误的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
