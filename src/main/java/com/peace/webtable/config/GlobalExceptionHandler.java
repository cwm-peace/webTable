package com.peace.webtable.config;

import com.peace.webtable.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.server.ResponseStatusException;

/**
 * 全局 API 异常处理器。
 *
 * 职责：将 Spring MVC、上传和系统异常统一转换为 ApiResponse，避免默认错误页或内部异常信息暴露给前端。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 处理缺少请求头异常。
     *
     * @param ex      缺少请求头异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingRequestHeader(
            MissingRequestHeaderException ex, HttpServletRequest request) {
        log.warn("请求缺少必要请求头：path={}, header={}", requestPath(request), ex.getHeaderName());
        return error(HttpStatus.BAD_REQUEST, "缺少必要请求头：" + ex.getHeaderName());
    }

    /**
     * 处理缺少查询参数异常。
     *
     * @param ex      缺少请求参数异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingRequestParameter(
            MissingServletRequestParameterException ex, HttpServletRequest request) {
        log.warn("请求缺少必要参数：path={}, parameter={}", requestPath(request), ex.getParameterName());
        return error(HttpStatus.BAD_REQUEST, "缺少必要请求参数：" + ex.getParameterName());
    }

    /**
     * 处理缺少 multipart 文件或表单字段异常。
     *
     * @param ex      缺少上传片段异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingRequestPart(
            MissingServletRequestPartException ex, HttpServletRequest request) {
        log.warn("上传请求缺少必要部分：path={}, part={}", requestPath(request), ex.getRequestPartName());
        return error(HttpStatus.BAD_REQUEST, "缺少必要上传文件或表单字段：" + ex.getRequestPartName());
    }

    /**
     * 处理参数类型转换异常。
     *
     * @param ex      类型转换异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        log.warn("请求参数格式错误：path={}, parameter={}", requestPath(request), ex.getName());
        return error(HttpStatus.BAD_REQUEST, "请求参数格式不正确");
    }

    /**
     * 处理 JSON 请求体格式错误。
     *
     * @param ex      请求体解析异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(
            HttpMessageNotReadableException ex, HttpServletRequest request) {
        log.warn("请求体解析失败：path={}, exception={}", requestPath(request), ex.getClass().getSimpleName());
        return error(HttpStatus.BAD_REQUEST, "请求体格式不正确");
    }

    /**
     * 处理方法参数校验异常。
     *
     * @param ex      参数校验异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        log.warn("请求参数校验失败：path={}, errorCount={}", requestPath(request), ex.getErrorCount());
        return error(HttpStatus.BAD_REQUEST, "请求参数不正确");
    }

    /**
     * 处理不支持的 HTTP 方法。
     *
     * @param ex      方法不支持异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        log.warn("请求方法不支持：path={}, method={}", requestPath(request), ex.getMethod());
        return error(HttpStatus.METHOD_NOT_ALLOWED, "请求方法不支持");
    }

    /**
     * 处理不支持的请求内容类型。
     *
     * @param ex      内容类型不支持异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMediaTypeNotSupported(
            HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        log.warn("请求内容类型不支持：path={}, contentType={}", requestPath(request), ex.getContentType());
        return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "请求内容类型不支持");
    }

    /**
     * 处理上传大小超过限制异常。
     *
     * @param ex      上传大小异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleMaxUploadSizeExceeded(
            MaxUploadSizeExceededException ex, HttpServletRequest request) {
        log.warn("上传文件超过大小限制：path={}, maxUploadSize={}", requestPath(request), ex.getMaxUploadSize());
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "上传文件大小不能超过 50MB");
    }

    /**
     * 处理 multipart 请求格式异常。
     *
     * @param ex      上传请求异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMultipartException(
            MultipartException ex, HttpServletRequest request) {
        log.warn("上传请求格式错误：path={}, exception={}", requestPath(request), ex.getClass().getSimpleName());
        return error(HttpStatus.BAD_REQUEST, "文件上传请求不正确");
    }

    /**
     * 处理主动抛出的参数异常。
     *
     * @param ex      参数异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(
            IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("请求参数异常：path={}, exception={}", requestPath(request), ex.getClass().getSimpleName());
        return error(HttpStatus.BAD_REQUEST, "请求参数不正确");
    }

    /**
     * 处理业务主动指定 HTTP 状态的异常。
     *
     * @param ex      带 HTTP 状态的业务异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleResponseStatusException(
            ResponseStatusException ex, HttpServletRequest request) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        log.warn("请求被业务规则拒绝：path={}, status={}", requestPath(request), status.value());
        String message = ex.getReason() != null ? ex.getReason() : "请求无法处理";
        return error(status, message);
    }

    /**
     * 处理数据库异常。
     *
     * @param ex      数据库异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataAccessException(
            DataAccessException ex, HttpServletRequest request) {
        log.error("数据库访问异常：path={}", requestPath(request), ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "服务暂时不可用，请稍后重试");
    }

    /**
     * 兜底处理未预期异常。
     *
     * @param ex      未预期异常
     * @param request HTTP 请求
     * @return 统一错误响应
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleException(Exception ex, HttpServletRequest request) {
        log.error("接口处理异常：path={}", requestPath(request), ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "服务暂时不可用，请稍后重试");
    }

    /**
     * 构造统一错误响应。
     */
    private ResponseEntity<ApiResponse<Void>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(ApiResponse.error(status.value(), message));
    }

    /**
     * 获取请求路径，避免日志中直接拼接空对象。
     */
    private String requestPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) {
            return "unknown";
        }
        return request.getRequestURI();
    }
}
