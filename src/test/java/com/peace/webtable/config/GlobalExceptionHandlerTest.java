package com.peace.webtable.config;

import com.peace.webtable.dto.ApiResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 全局异常处理测试。
 *
 * 确保常见 API 异常会转换为统一响应，并避免内部异常细节泄露到前端。
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        request = new MockHttpServletRequest("POST", "/api/form/status");
    }

    @Test
    void missingRequestHeaderReturnsBadRequest() {
        MissingRequestHeaderException exception = new MissingRequestHeaderException("X-Session-Token", null);

        ResponseEntity<ApiResponse<Void>> response = handler.handleMissingRequestHeader(exception, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(400);
        assertThat(response.getBody().getMessage()).isEqualTo("缺少必要请求头：X-Session-Token");
    }

    @Test
    void invalidJsonReturnsSanitizedMessage() {
        HttpMessageNotReadableException exception = new HttpMessageNotReadableException(
                "JSON parse error: Unrecognized token 'attack'", httpInputMessage());

        ResponseEntity<ApiResponse<Void>> response = handler.handleMessageNotReadable(exception, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(400);
        assertThat(response.getBody().getMessage()).isEqualTo("请求体格式不正确");
        assertThat(response.getBody().getMessage()).doesNotContain("Unrecognized token");
    }

    @Test
    void maxUploadSizeExceededReturnsPayloadTooLarge() {
        MaxUploadSizeExceededException exception = new MaxUploadSizeExceededException(50L * 1024 * 1024);

        ResponseEntity<ApiResponse<Void>> response = handler.handleMaxUploadSizeExceeded(exception, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(413);
        assertThat(response.getBody().getMessage()).isEqualTo("上传文件大小不能超过 50MB");
    }

    @Test
    void responseStatusExceptionReturnsConfiguredStatusAndMessage() {
        ResponseStatusException exception = new ResponseStatusException(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "该提交照片总量超过 PDF 导出上限，请减少照片体积后重试");

        ResponseEntity<ApiResponse<Void>> response = handler.handleResponseStatusException(exception, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(413);
        assertThat(response.getBody().getMessage()).isEqualTo("该提交照片总量超过 PDF 导出上限，请减少照片体积后重试");
    }

    @Test
    void dataAccessExceptionDoesNotExposeDatabaseDetails() {
        DataAccessException exception = new DataAccessException("SQL syntax near password='secret'") {
        };

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataAccessException(exception, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(500);
        assertThat(response.getBody().getMessage()).isEqualTo("服务暂时不可用，请稍后重试");
        assertThat(response.getBody().getMessage()).doesNotContain("SQL", "secret");
    }

    @Test
    void unknownExceptionDoesNotExposeInternalDetails() {
        RuntimeException exception = new RuntimeException("NullPointerException at com.peace.webtable.Secret");

        ResponseEntity<ApiResponse<Void>> response = handler.handleException(exception, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(500);
        assertThat(response.getBody().getMessage()).isEqualTo("服务暂时不可用，请稍后重试");
        assertThat(response.getBody().getMessage()).doesNotContain("NullPointerException", "Secret");
    }

    private HttpInputMessage httpInputMessage() {
        return new HttpInputMessage() {
            @Override
            public InputStream getBody() {
                return new ByteArrayInputStream("attack".getBytes());
            }

            @Override
            public HttpHeaders getHeaders() {
                return new HttpHeaders();
            }
        };
    }
}
