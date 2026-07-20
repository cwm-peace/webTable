package com.peace.webtable.controller;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.AssessmentLeft;
import com.peace.webtable.entity.AssessmentLeftTemplate;
import com.peace.webtable.entity.AssessmentRight;
import com.peace.webtable.entity.AssessmentRightTemplate;
import com.peace.webtable.entity.PersonalInfo;
import com.peace.webtable.entity.Photo;
import com.peace.webtable.service.AdminService;
import com.peace.webtable.service.FormService;
import com.peace.webtable.service.PhotoService;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 照片控制器鉴权边界测试。
 */
class PhotoControllerTest {

    @Test
    void adminDownloadRejectsPhotoFromDraftSubmission() {
        PhotoController controller = new PhotoController(
                photoService(photo(7L, 18L)),
                formService(false),
                adminService(true, false));

        ResponseEntity<byte[]> response = controller.downloadPhoto(null, "admin-token", 7L);

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void adminDownloadAllowsPhotoFromCompletedSubmission() {
        PhotoController controller = new PhotoController(
                photoService(photo(7L, 18L)),
                formService(false),
                adminService(true, true));

        ResponseEntity<byte[]> response = controller.downloadPhoto(null, "admin-token", 7L);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).containsExactly(1, 2, 3);
    }

    @Test
    void ownerSessionCanStillDownloadDraftPhoto() {
        PhotoController controller = new PhotoController(
                photoService(photo(7L, 18L)),
                formService(true),
                adminService(false, false));

        ResponseEntity<byte[]> response = controller.downloadPhoto("session-token", null, 7L);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).containsExactly(1, 2, 3);
    }

    private Photo photo(Long id, Long submissionId) {
        Photo photo = new Photo();
        photo.setId(id);
        photo.setSubmissionId(submissionId);
        photo.setPhotoType("image/png");
        photo.setPhotoData(new byte[]{1, 2, 3});
        photo.setCreateTime(LocalDateTime.of(2026, 7, 18, 12, 0));
        return photo;
    }

    private PhotoService photoService(Photo photo) {
        return new PhotoService() {
            @Override
            public ApiResponse<Void> uploadPhoto(Long submissionId, String category, MultipartFile file) {
                return ApiResponse.ok();
            }

            @Override
            public List<Photo> listPhotos(Long submissionId, String category) {
                return List.of(photo);
            }

            @Override
            public Photo getPhoto(Long photoId) {
                return photoId.equals(photo.getId()) ? photo : null;
            }

            @Override
            public byte[] downloadPhoto(Long photoId) {
                return photo.getPhotoData();
            }

            @Override
            public String getPhotoType(Long photoId) {
                return photo.getPhotoType();
            }

            @Override
            public ApiResponse<Void> deletePhoto(Long photoId) {
                return ApiResponse.ok();
            }
        };
    }

    private FormService formService(boolean ownsSession) {
        return new FormService() {
            @Override
            public ApiResponse<Map<String, Object>> createSubmission(String clientIdentifier) {
                return ApiResponse.ok(Map.of());
            }

            @Override
            public Map<String, Object> getStatus(String sessionToken) {
                return Map.of();
            }

            @Override
            public ApiResponse<Void> completeSubmission(String sessionToken) {
                return ApiResponse.ok();
            }

            @Override
            public PersonalInfo getStep1(String sessionToken, Long submissionId) {
                return null;
            }

            @Override
            public ApiResponse<Void> saveStep1(String sessionToken, Long submissionId, PersonalInfo info) {
                return ApiResponse.ok();
            }

            @Override
            public List<AssessmentLeft> getStep3Left(String sessionToken, Long submissionId) {
                return List.of();
            }

            @Override
            public ApiResponse<Void> saveStep3Left(String sessionToken, Long submissionId, List<AssessmentLeft> rows) {
                return ApiResponse.ok();
            }

            @Override
            public List<AssessmentRight> getStep3Right(String sessionToken, Long submissionId) {
                return List.of();
            }

            @Override
            public ApiResponse<Void> saveStep3Right(String sessionToken, Long submissionId, List<AssessmentRight> rows) {
                return ApiResponse.ok();
            }

            @Override
            public boolean validateSession(String sessionToken, Long submissionId) {
                return ownsSession;
            }

            @Override
            public List<AssessmentLeftTemplate> getLeftTemplate() {
                return List.of();
            }

            @Override
            public List<AssessmentRightTemplate> getRightTemplate() {
                return List.of();
            }
        };
    }

    private AdminService adminService(boolean validToken, boolean completedSubmission) {
        return new AdminService() {
            @Override
            public ApiResponse<Map<String, Object>> login(String password, String clientIdentifier) {
                return ApiResponse.ok(Map.of());
            }

            @Override
            public ApiResponse<Void> logout(String adminToken) {
                return ApiResponse.ok();
            }

            @Override
            public boolean validateToken(String adminToken) {
                return validToken;
            }

            @Override
            public boolean validateCompletedSubmission(Long submissionId) {
                return completedSubmission;
            }

            @Override
            public ApiResponse<Map<String, Object>> getSubmissionList(long page, long pageSize) {
                return ApiResponse.ok(Map.of());
            }

            @Override
            public ApiResponse<Map<String, Object>> getSubmissionDetail(Long submissionId) {
                return ApiResponse.ok(Map.of());
            }

            @Override
            public ByteArrayOutputStream exportPdf(Long submissionId) {
                return new ByteArrayOutputStream();
            }
        };
    }
}
