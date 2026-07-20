package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.peace.webtable.config.AdminConfig;
import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.AssessmentLeft;
import com.peace.webtable.entity.AssessmentRight;
import com.peace.webtable.entity.PersonalInfo;
import com.peace.webtable.entity.Photo;
import com.peace.webtable.entity.Submission;
import com.peace.webtable.mapper.AssessmentLeftMapper;
import com.peace.webtable.mapper.AssessmentRightMapper;
import com.peace.webtable.mapper.PersonalInfoMapper;
import com.peace.webtable.mapper.PhotoMapper;
import com.peace.webtable.mapper.SubmissionMapper;
import com.peace.webtable.util.RedisUtil;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 管理员服务安全测试。
 *
 * 覆盖管理员登录限流、成功后清理失败记录、token 存储与退出吊销。
 */
class AdminServiceImplTest {

    @Test
    void loginCreatesValidTokenAndLogoutRevokesIt() {
        InMemoryRedisUtil redisUtil = new InMemoryRedisUtil();
        AdminServiceImpl service = adminService(redisUtil);

        ApiResponse<Map<String, Object>> loginResponse = service.login("Change-Me-2026-Strong", "127.0.0.1");

        assertThat(loginResponse.getCode()).isEqualTo(200);
        String token = (String) loginResponse.getData().get("adminToken");
        assertThat(token).isNotBlank();
        assertThat(service.validateToken(token)).isTrue();

        ApiResponse<Void> logoutResponse = service.logout(token);

        assertThat(logoutResponse.getCode()).isEqualTo(200);
        assertThat(service.validateToken(token)).isFalse();
    }

    @Test
    void loginLocksClientAfterConfiguredFailures() {
        InMemoryRedisUtil redisUtil = new InMemoryRedisUtil();
        AdminServiceImpl service = adminService(redisUtil);

        ApiResponse<Map<String, Object>> firstFailure = service.login("wrong-password", "10.0.0.8");
        ApiResponse<Map<String, Object>> secondFailure = service.login("still-wrong", "10.0.0.8");
        ApiResponse<Map<String, Object>> lockedEvenWithCorrectPassword = service.login("Change-Me-2026-Strong", "10.0.0.8");

        assertThat(firstFailure.getCode()).isEqualTo(401);
        assertThat(secondFailure.getCode()).isEqualTo(429);
        assertThat(lockedEvenWithCorrectPassword.getCode()).isEqualTo(429);
        assertThat(lockedEvenWithCorrectPassword.getMessage()).contains("登录失败次数过多");
    }

    @Test
    void successfulLoginClearsPreviousFailuresForSameClient() {
        InMemoryRedisUtil redisUtil = new InMemoryRedisUtil();
        AdminServiceImpl service = adminService(redisUtil);

        service.login("wrong-password", "10.0.0.9");

        ApiResponse<Map<String, Object>> success = service.login("Change-Me-2026-Strong", "10.0.0.9");
        ApiResponse<Map<String, Object>> nextFailure = service.login("wrong-again", "10.0.0.9");

        assertThat(success.getCode()).isEqualTo(200);
        assertThat(nextFailure.getCode()).isEqualTo(401);
    }

    @Test
    void getSubmissionListReturnsPagedRecordsWithoutSessionToken() {
        AtomicLong requestedPage = new AtomicLong();
        AtomicLong requestedPageSize = new AtomicLong();
        SubmissionMapper submissionMapper = submissionMapper(requestedPage, requestedPageSize,
                List.of(submission(9L, "secret-token-9"), submission(8L, "secret-token-8")), 42L);
        AdminServiceImpl service = adminService(new InMemoryRedisUtil(), submissionMapper);

        ApiResponse<Map<String, Object>> response = service.getSubmissionList(2, 20);

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(requestedPage).hasValue(2);
        assertThat(requestedPageSize).hasValue(20);
        assertThat(response.getData()).containsEntry("total", 42L);
        assertThat(response.getData()).containsEntry("page", 2L);
        assertThat(response.getData()).containsEntry("pageSize", 20L);
        assertThat(response.getData()).containsEntry("totalPages", 3L);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> records = (List<Map<String, Object>>) response.getData().get("records");
        assertThat(records).hasSize(2);
        assertThat(records.getFirst()).containsEntry("id", 9L);
        assertThat(records.getFirst()).doesNotContainKey("sessionToken");
        assertThat(records.toString()).doesNotContain("secret-token");
    }

    @Test
    void getSubmissionListClampsInvalidPaginationParameters() {
        AtomicLong requestedPage = new AtomicLong();
        AtomicLong requestedPageSize = new AtomicLong();
        SubmissionMapper submissionMapper = submissionMapper(requestedPage, requestedPageSize, List.of(), 0L);
        AdminServiceImpl service = adminService(new InMemoryRedisUtil(), submissionMapper);

        ApiResponse<Map<String, Object>> response = service.getSubmissionList(0, 500);

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(requestedPage).hasValue(1);
        assertThat(requestedPageSize).hasValue(100);
    }

    @Test
    void getSubmissionDetailDoesNotExposeSessionToken() {
        SubmissionMapper submissionMapper = submissionMapperWithDetail(submission(18L, "secret-session-token"));
        AdminServiceImpl service = adminServiceWithReadMappers(new InMemoryRedisUtil(), submissionMapper);

        ApiResponse<Map<String, Object>> response = service.getSubmissionDetail(18L);

        assertThat(response.getCode()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        Map<String, Object> submission = (Map<String, Object>) response.getData().get("submission");
        assertThat(submission).containsEntry("id", 18L);
        assertThat(submission).doesNotContainKey("sessionToken");
        assertThat(response.getData().toString()).doesNotContain("secret-session-token");
    }

    @Test
    void getSubmissionDetailRejectsDraftSubmission() {
        SubmissionMapper submissionMapper = submissionMapperWithDetail(draftSubmission(18L, "draft-session-token"));
        AdminServiceImpl service = adminServiceWithReadMappers(new InMemoryRedisUtil(), submissionMapper);

        ApiResponse<Map<String, Object>> response = service.getSubmissionDetail(18L);

        assertThat(response.getCode()).isEqualTo(404);
        assertThat(response.getMessage()).contains("尚未完成");
        assertThat(response.getData()).isNull();
    }

    @Test
    void exportPdfHandlesChineseTextAndEmojiInputWithCjkFallbackFont() {
        AdminServiceImpl service = adminServiceForPdf(
                submission(18L, "secret-session-token"),
                personalInfoWithChineseAndEmoji(),
                List.of(assessmentLeftWithEmojiType()),
                List.of(assessmentRightWithEmojiRemark()));

        ByteArrayOutputStream outputStream = service.exportPdf(18L);

        assertThat(outputStream.size()).isGreaterThan(100);
        assertThat(outputStream.toByteArray()).startsWith((byte) '%', (byte) 'P', (byte) 'D', (byte) 'F');
    }

    @Test
    void exportPdfRejectsDraftSubmission() {
        AdminServiceImpl service = adminServiceForPdf(
                draftSubmission(18L, "draft-session-token"),
                personalInfoWithChineseAndEmoji(),
                List.of(assessmentLeftWithEmojiType()),
                List.of(assessmentRightWithEmojiRemark()));

        assertThatThrownBy(() -> service.exportPdf(18L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("尚未完成");
    }

    @Test
    void exportPdfRejectsWhenPhotoBytesExceedConfiguredBudgetBeforeLoadingBlobs() {
        AdminServiceImpl service = adminServiceForPdf(
                submission(18L, "secret-session-token"),
                personalInfoWithChineseAndEmoji(),
                photoMapperForPdf(101L, List.of()),
                List.of(assessmentLeftWithEmojiType()),
                List.of(assessmentRightWithEmojiRemark()));
        ReflectionTestUtils.setField(service, "pdfMaxPhotoBytes", 100L);

        assertThatThrownBy(() -> service.exportPdf(18L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException exception = (ResponseStatusException) error;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
                    assertThat(exception.getReason()).contains("照片总量超过 PDF 导出上限");
                });
    }

    private AdminServiceImpl adminService(InMemoryRedisUtil redisUtil) {
        return adminService(redisUtil, null);
    }

    private AdminServiceImpl adminService(InMemoryRedisUtil redisUtil, SubmissionMapper submissionMapper) {
        return new AdminServiceImpl(adminConfig(), redisUtil, submissionMapper, null, null, null, null);
    }

    private AdminServiceImpl adminServiceWithReadMappers(InMemoryRedisUtil redisUtil, SubmissionMapper submissionMapper) {
        return new AdminServiceImpl(
                adminConfig(),
                redisUtil,
                submissionMapper,
                selectListMapper(PersonalInfoMapper.class),
                selectListMapper(PhotoMapper.class),
                selectListMapper(AssessmentLeftMapper.class),
                selectListMapper(AssessmentRightMapper.class));
    }

    private AdminServiceImpl adminServiceForPdf(Submission submission,
                                                PersonalInfo personalInfo,
                                                List<AssessmentLeft> leftRows,
                                                List<AssessmentRight> rightRows) {
        return new AdminServiceImpl(
                adminConfig(),
                new InMemoryRedisUtil(),
                submissionMapperWithDetail(submission),
                personalInfoMapper(personalInfo),
                photoMapperForPdf(0L, List.of()),
                assessmentLeftMapper(leftRows),
                assessmentRightMapper(rightRows));
    }

    private AdminServiceImpl adminServiceForPdf(Submission submission,
                                                PersonalInfo personalInfo,
                                                PhotoMapper photoMapper,
                                                List<AssessmentLeft> leftRows,
                                                List<AssessmentRight> rightRows) {
        return new AdminServiceImpl(
                adminConfig(),
                new InMemoryRedisUtil(),
                submissionMapperWithDetail(submission),
                personalInfoMapper(personalInfo),
                photoMapper,
                assessmentLeftMapper(leftRows),
                assessmentRightMapper(rightRows));
    }

    private SubmissionMapper submissionMapper(AtomicLong requestedPage, AtomicLong requestedPageSize,
                                             List<Submission> records, long total) {
        return (SubmissionMapper) Proxy.newProxyInstance(
                SubmissionMapper.class.getClassLoader(),
                new Class<?>[]{SubmissionMapper.class},
                (proxy, method, args) -> {
                    if ("selectPage".equals(method.getName())) {
                        @SuppressWarnings("unchecked")
                        Page<Submission> page = (Page<Submission>) args[0];
                        requestedPage.set(page.getCurrent());
                        requestedPageSize.set(page.getSize());
                        page.setRecords(records);
                        page.setTotal(total);
                        return page;
                    }
                    return defaultValue(method.getReturnType());
                }
        );
    }

    private SubmissionMapper submissionMapperWithDetail(Submission submission) {
        return (SubmissionMapper) Proxy.newProxyInstance(
                SubmissionMapper.class.getClassLoader(),
                new Class<?>[]{SubmissionMapper.class},
                (proxy, method, args) -> {
                    if ("selectById".equals(method.getName())) {
                        return submission;
                    }
                    return defaultValue(method.getReturnType());
                }
        );
    }

    private <T> T selectListMapper(Class<T> mapperType) {
        return mapperType.cast(Proxy.newProxyInstance(
                mapperType.getClassLoader(),
                new Class<?>[]{mapperType},
                (proxy, method, args) -> {
                    if ("selectList".equals(method.getName())) {
                        return List.of();
                    }
                    return defaultValue(method.getReturnType());
                }
        ));
    }

    private PhotoMapper photoMapperForPdf(Long totalBytes, List<Photo> photos) {
        return (PhotoMapper) Proxy.newProxyInstance(
                PhotoMapper.class.getClassLoader(),
                new Class<?>[]{PhotoMapper.class},
                (proxy, method, args) -> {
                    if ("sumPhotoDataBytesBySubmissionId".equals(method.getName())) {
                        return totalBytes;
                    }
                    if ("selectList".equals(method.getName())) {
                        return photos;
                    }
                    return defaultValue(method.getReturnType());
                }
        );
    }

    private PersonalInfoMapper personalInfoMapper(PersonalInfo personalInfo) {
        return (PersonalInfoMapper) Proxy.newProxyInstance(
                PersonalInfoMapper.class.getClassLoader(),
                new Class<?>[]{PersonalInfoMapper.class},
                (proxy, method, args) -> {
                    if ("selectOne".equals(method.getName())) {
                        return personalInfo;
                    }
                    return defaultValue(method.getReturnType());
                }
        );
    }

    private AssessmentLeftMapper assessmentLeftMapper(List<AssessmentLeft> rows) {
        return (AssessmentLeftMapper) Proxy.newProxyInstance(
                AssessmentLeftMapper.class.getClassLoader(),
                new Class<?>[]{AssessmentLeftMapper.class},
                (proxy, method, args) -> {
                    if ("selectList".equals(method.getName())) {
                        return rows;
                    }
                    return defaultValue(method.getReturnType());
                }
        );
    }

    private AssessmentRightMapper assessmentRightMapper(List<AssessmentRight> rows) {
        return (AssessmentRightMapper) Proxy.newProxyInstance(
                AssessmentRightMapper.class.getClassLoader(),
                new Class<?>[]{AssessmentRightMapper.class},
                (proxy, method, args) -> {
                    if ("selectList".equals(method.getName())) {
                        return rows;
                    }
                    return defaultValue(method.getReturnType());
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

    private Submission submission(Long id, String sessionToken) {
        Submission submission = new Submission();
        submission.setId(id);
        submission.setSessionToken(sessionToken);
        submission.setCurrentStep(3);
        submission.setCompleted(true);
        submission.setCreateTime(LocalDateTime.of(2026, 7, 18, 10, 0));
        submission.setUpdateTime(LocalDateTime.of(2026, 7, 18, 10, 5));
        return submission;
    }

    private Submission draftSubmission(Long id, String sessionToken) {
        Submission submission = submission(id, sessionToken);
        submission.setCompleted(false);
        return submission;
    }

    private PersonalInfo personalInfoWithChineseAndEmoji() {
        PersonalInfo info = new PersonalInfo();
        info.setSubmissionId(18L);
        info.setName("测试用户" + emoji(0x1F680));
        info.setHeight("178");
        info.setWeight("68");
        info.setEducation("本科");
        info.setOccupation("工程师");
        info.setShoeSize("42");
        info.setProvince("广东");
        info.setCity("深圳");
        info.setQq("10001");
        info.setWechat("wechat-user");
        info.setWeibo("weibo-user");
        info.setPhone("13800000000");
        info.setFirstMasturbationAge("18");
        info.setFirstSexAge("20");
        info.setIsSingle("是");
        info.setCheatedOnPartner("否");
        info.setBeenCheated("否");
        info.setLongestLockTime("0");
        info.setSexFrequency("每周");
        info.setMasturbationFrequency("每周");
        info.setMasturbationTool("无");
        info.setDogAge("0");
        info.setMeetingCount("1");
        info.setMasterCount("0");
        info.setPreferredName("昵称" + emoji(0x1F603));
        info.setSelfDescription("包含中文和 emoji 的自我描述" + emoji(0x1F603));
        info.setRemark("备注内容");
        info.setTrainingIntention("训练意向");
        return info;
    }

    private AssessmentLeft assessmentLeftWithEmojiType() {
        AssessmentLeft row = new AssessmentLeft();
        row.setSubmissionId(18L);
        row.setTypeName("左侧类型" + emoji(0x1F525));
        row.setItemName("左侧项目");
        row.setLevel("A");
        row.setRemark("左侧备注");
        row.setRowOrder(1);
        return row;
    }

    private AssessmentRight assessmentRightWithEmojiRemark() {
        AssessmentRight row = new AssessmentRight();
        row.setSubmissionId(18L);
        row.setTypeName("右侧类型");
        row.setItemName("右侧项目");
        row.setLevel("B");
        row.setRemark("右侧备注" + emoji(0x1F603));
        row.setRowOrder(1);
        return row;
    }

    private String emoji(int codePoint) {
        return new String(Character.toChars(codePoint));
    }

    private AdminConfig adminConfig() {
        AdminConfig config = new AdminConfig();
        ReflectionTestUtils.setField(config, "password", "Change-Me-2026-Strong");
        ReflectionTestUtils.setField(config, "loginMaxFailures", 2);
        ReflectionTestUtils.setField(config, "loginFailureWindowMinutes", 15L);
        ReflectionTestUtils.setField(config, "loginLockMinutes", 15L);
        return config;
    }

    /**
     * 面向服务单元测试的内存 Redis 实现。
     */
    private static class InMemoryRedisUtil extends RedisUtil {
        private final Map<String, Object> values = new HashMap<>();

        InMemoryRedisUtil() {
            super(null);
        }

        @Override
        public void set(String key, Object value, long timeout, TimeUnit unit) {
            values.put(key, value);
        }

        @Override
        public Object get(String key) {
            return values.get(key);
        }

        @Override
        public Long increment(String key) {
            long nextValue = ((Number) values.getOrDefault(key, 0L)).longValue() + 1L;
            values.put(key, nextValue);
            return nextValue;
        }

        @Override
        public Boolean delete(String key) {
            return values.remove(key) != null;
        }

        @Override
        public Boolean hasKey(String key) {
            return values.containsKey(key);
        }

        @Override
        public Boolean expire(String key, long timeout, TimeUnit unit) {
            return values.containsKey(key);
        }
    }
}
