package com.peace.webtable.service.impl;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.Photo;
import com.peace.webtable.mapper.PhotoMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 照片服务单元测试。
 *
 * 覆盖服务端照片类别、数量和槽位规则，避免只依赖前端限制。
 */
class PhotoServiceImplTest {

    @Test
    void uploadPhotoRejectsInvalidCategory() {
        AtomicInteger insertCount = new AtomicInteger();
        PhotoMapper photoMapper = photoMapper(List.of(), ignored -> insertCount.incrementAndGet());
        PhotoServiceImpl service = new PhotoServiceImpl(photoMapper);

        ApiResponse<Void> response = service.uploadPhoto(1L, "avatar", imageFile());

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("照片类别不正确");
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void uploadPhotoRejectsMoreThanFourPhotosInSameCategory() {
        AtomicInteger insertCount = new AtomicInteger();
        PhotoMapper photoMapper = photoMapper(List.of(
                photoOrder(1), photoOrder(2), photoOrder(3), photoOrder(4)
        ), ignored -> insertCount.incrementAndGet());
        PhotoServiceImpl service = new PhotoServiceImpl(photoMapper);

        ApiResponse<Void> response = service.uploadPhoto(1L, "selfie", imageFile());

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("每个类别最多上传 4 张照片");
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void uploadPhotoFillsFirstAvailableSlotAfterDelete() {
        AtomicReference<Photo> inserted = new AtomicReference<>();
        PhotoMapper photoMapper = photoMapper(List.of(
                photoOrder(1), photoOrder(3), photoOrder(4)
        ), inserted::set);
        PhotoServiceImpl service = new PhotoServiceImpl(photoMapper);

        ApiResponse<Void> response = service.uploadPhoto(1L, " Selfie ", imageFile());

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(inserted.get()).isNotNull();
        assertThat(inserted.get().getPhotoCategory()).isEqualTo("selfie");
        assertThat(inserted.get().getPhotoOrder()).isEqualTo(2);
        assertThat(inserted.get().getPhotoType()).isEqualTo("image/jpeg");
    }

    @Test
    void uploadPhotoRejectsForgedImageContentType() {
        AtomicInteger insertCount = new AtomicInteger();
        PhotoMapper photoMapper = photoMapper(List.of(), ignored -> insertCount.incrementAndGet());
        PhotoServiceImpl service = new PhotoServiceImpl(photoMapper);

        ApiResponse<Void> response = service.uploadPhoto(1L, "selfie", textDisguisedAsImage());

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("图片内容与文件类型不匹配");
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void uploadPhotoRejectsMismatchedDeclaredAndDetectedType() {
        AtomicInteger insertCount = new AtomicInteger();
        PhotoMapper photoMapper = photoMapper(List.of(), ignored -> insertCount.incrementAndGet());
        PhotoServiceImpl service = new PhotoServiceImpl(photoMapper);

        ApiResponse<Void> response = service.uploadPhoto(1L, "selfie", pngDeclaredAsJpeg());

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("图片内容与文件类型不匹配");
        assertThat(insertCount).hasValue(0);
    }

    private PhotoMapper photoMapper(List<Photo> existingPhotos, Consumer<Photo> onInsert) {
        return (PhotoMapper) Proxy.newProxyInstance(
                PhotoMapper.class.getClassLoader(),
                new Class<?>[]{PhotoMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "selectList" -> existingPhotos;
                    case "insert" -> {
                        onInsert.accept((Photo) args[0]);
                        yield 1;
                    }
                    default -> defaultValue(method.getReturnType());
                }
        );
    }

    private Object defaultValue(Class<?> returnType) {
        if (!returnType.isPrimitive()) {
            return null;
        }
        if (returnType == boolean.class) {
            return false;
        }
        return 0;
    }

    private MockMultipartFile imageFile() {
        return new MockMultipartFile(
                "file",
                "test.jpg",
                "IMAGE/JPEG",
                new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00, 0x01}
        );
    }

    private MockMultipartFile textDisguisedAsImage() {
        return new MockMultipartFile(
                "file",
                "attack.jpg",
                "image/jpeg",
                "not an image".getBytes(StandardCharsets.UTF_8)
        );
    }

    private MockMultipartFile pngDeclaredAsJpeg() {
        return new MockMultipartFile(
                "file",
                "wrong.jpg",
                "image/jpeg",
                new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
        );
    }

    private Photo photoOrder(int order) {
        Photo photo = new Photo();
        photo.setPhotoOrder(order);
        return photo;
    }
}
