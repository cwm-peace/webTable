package com.peace.webtable.service.impl;

import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.AssessmentLeft;
import com.peace.webtable.entity.AssessmentRight;
import com.peace.webtable.entity.PersonalInfo;
import com.peace.webtable.entity.Submission;
import com.peace.webtable.mapper.AssessmentLeftMapper;
import com.peace.webtable.mapper.AssessmentLeftTemplateMapper;
import com.peace.webtable.mapper.AssessmentRightMapper;
import com.peace.webtable.mapper.AssessmentRightTemplateMapper;
import com.peace.webtable.mapper.PersonalInfoMapper;
import com.peace.webtable.mapper.SubmissionMapper;
import com.peace.webtable.util.RedisUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 表单服务安全边界测试。
 *
 * 覆盖填写端服务层输入规模限制，避免只依赖前端控制请求体大小。
 */
class FormServiceImplTest {

    @Test
    void saveStep3LeftRejectsRowsBeyondTemplateLimitBeforeDeletingExistingRows() {
        AtomicInteger deleteCount = new AtomicInteger();
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(deleteCount, insertCount),
                rightMapper(new AtomicInteger(), new AtomicInteger()));

        ApiResponse<Void> response = service.saveStep3Left("session-token", 1L, leftRows(66));

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("左侧自评最多允许 65 行");
        assertThat(deleteCount).hasValue(0);
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void saveStep3RightRejectsRowsBeyondTemplateLimitBeforeDeletingExistingRows() {
        AtomicInteger deleteCount = new AtomicInteger();
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(deleteCount, insertCount));

        ApiResponse<Void> response = service.saveStep3Right("session-token", 1L, rightRows(61));

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("右侧自评最多允许 60 行");
        assertThat(deleteCount).hasValue(0);
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void saveStep3AcceptsRowsAtTemplateLimit() {
        AtomicInteger leftDeleteCount = new AtomicInteger();
        AtomicInteger leftInsertCount = new AtomicInteger();
        AtomicInteger rightDeleteCount = new AtomicInteger();
        AtomicInteger rightInsertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(leftDeleteCount, leftInsertCount),
                rightMapper(rightDeleteCount, rightInsertCount));

        ApiResponse<Void> leftResponse = service.saveStep3Left("session-token", 1L, leftRows(65));
        ApiResponse<Void> rightResponse = service.saveStep3Right("session-token", 1L, rightRows(60));

        assertThat(leftResponse.getCode()).isEqualTo(200);
        assertThat(rightResponse.getCode()).isEqualTo(200);
        assertThat(leftDeleteCount).hasValue(1);
        assertThat(leftInsertCount).hasValue(65);
        assertThat(rightDeleteCount).hasValue(1);
        assertThat(rightInsertCount).hasValue(60);
    }

    @Test
    void saveStep1RejectsNullPersonalInfoBeforeQueryingExistingRows() {
        AtomicInteger personalInfoSelectCount = new AtomicInteger();
        AtomicInteger personalInfoInsertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()),
                personalInfoMapper(personalInfoSelectCount, personalInfoInsertCount));

        ApiResponse<Void> response = service.saveStep1("session-token", 1L, null);

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("基础信息不能为空");
        assertThat(personalInfoSelectCount).hasValue(0);
        assertThat(personalInfoInsertCount).hasValue(0);
    }

    @Test
    void saveStep1RejectsOverlongTextBeforeDatabaseWrite() {
        AtomicInteger personalInfoSelectCount = new AtomicInteger();
        AtomicInteger personalInfoInsertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()),
                personalInfoMapper(personalInfoSelectCount, personalInfoInsertCount));
        PersonalInfo info = new PersonalInfo();
        info.setSelfDescription(repeat("a", 501));

        ApiResponse<Void> response = service.saveStep1("session-token", 1L, info);

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("一句话形容自己长度不能超过 500 个字符");
        assertThat(personalInfoSelectCount).hasValue(0);
        assertThat(personalInfoInsertCount).hasValue(0);
    }

    @Test
    void saveStep1AcceptsTextAtConfiguredLimit() {
        AtomicInteger personalInfoSelectCount = new AtomicInteger();
        AtomicInteger personalInfoInsertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()),
                personalInfoMapper(personalInfoSelectCount, personalInfoInsertCount));
        PersonalInfo info = new PersonalInfo();
        info.setName(repeat("n", 100));
        info.setSelfDescription(repeat("s", 500));
        info.setRemark(repeat("r", 2000));
        info.setTrainingIntention(repeat("t", 2000));

        ApiResponse<Void> response = service.saveStep1("session-token", 1L, info);

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(personalInfoSelectCount).hasValue(1);
        assertThat(personalInfoInsertCount).hasValue(1);
    }

    @Test
    void saveStep3LeftRejectsOverlongRemarkBeforeDeletingExistingRows() {
        AtomicInteger deleteCount = new AtomicInteger();
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(deleteCount, insertCount),
                rightMapper(new AtomicInteger(), new AtomicInteger()));
        List<AssessmentLeft> rows = leftRows(1);
        rows.getFirst().setRemark(repeat("r", 501));

        ApiResponse<Void> response = service.saveStep3Left("session-token", 1L, rows);

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("左侧第1行备注长度不能超过 500 个字符");
        assertThat(deleteCount).hasValue(0);
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void saveStep3RightRejectsInvalidLevelBeforeDeletingExistingRows() {
        AtomicInteger deleteCount = new AtomicInteger();
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(deleteCount, insertCount));
        List<AssessmentRight> rows = rightRows(1);
        rows.getFirst().setLevel("F");

        ApiResponse<Void> response = service.saveStep3Right("session-token", 1L, rows);

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("右侧第1行级别只能是 A-E");
        assertThat(deleteCount).hasValue(0);
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void saveStep3RightRejectsNullRowBeforeDeletingExistingRows() {
        AtomicInteger deleteCount = new AtomicInteger();
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(deleteCount, insertCount));
        List<AssessmentRight> rows = new ArrayList<>();
        rows.add(null);

        ApiResponse<Void> response = service.saveStep3Right("session-token", 1L, rows);

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("右侧第1行不能为空");
        assertThat(deleteCount).hasValue(0);
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void saveStep3LeftRejectsOutOfRangeRowOrderBeforeDeletingExistingRows() {
        AtomicInteger deleteCount = new AtomicInteger();
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token"),
                leftMapper(deleteCount, insertCount),
                rightMapper(new AtomicInteger(), new AtomicInteger()));
        List<AssessmentLeft> rows = leftRows(1);
        rows.getFirst().setRowOrder(66);

        ApiResponse<Void> response = service.saveStep3Left("session-token", 1L, rows);

        assertThat(response.getCode()).isEqualTo(400);
        assertThat(response.getMessage()).isEqualTo("左侧第1行排序号不正确");
        assertThat(deleteCount).hasValue(0);
        assertThat(insertCount).hasValue(0);
    }

    @Test
    void completedSubmissionCannotBeModifiedWithOldSessionToken() {
        AtomicInteger personalInfoSelectCount = new AtomicInteger();
        AtomicInteger personalInfoInsertCount = new AtomicInteger();
        FormServiceImpl service = formService(
                submission(1L, "session-token", true),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()),
                personalInfoMapper(personalInfoSelectCount, personalInfoInsertCount));

        ApiResponse<Void> response = service.saveStep1("session-token", 1L, new PersonalInfo());

        assertThat(response.getCode()).isEqualTo(403);
        assertThat(response.getMessage()).isEqualTo("当前草稿无权访问或已失效");
        assertThat(personalInfoSelectCount).hasValue(0);
        assertThat(personalInfoInsertCount).hasValue(0);
    }

    @Test
    void validateSessionRejectsCompletedSubmissionAndClearsCachedDraftToken() {
        InMemoryRedisUtil redisUtil = new InMemoryRedisUtil();
        Submission submission = submission(1L, "session-token", true);
        redisUtil.set("wt:session:session-token", submission.getId(), 2, TimeUnit.HOURS);
        FormServiceImpl service = formService(
                submission,
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()),
                nullMapper(PersonalInfoMapper.class),
                redisUtil);

        boolean valid = service.validateSession("session-token", 1L);

        assertThat(valid).isFalse();
        assertThat(redisUtil.get("wt:session:session-token")).isNull();
    }

    @Test
    void getStatusStillReportsCompletedSubmissionForFrontendCleanup() {
        FormServiceImpl service = formService(
                submission(1L, "session-token", true),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()));

        Map<String, Object> status = service.getStatus("session-token");

        assertThat(status).containsEntry("submissionId", 1L);
        assertThat(status).containsEntry("completed", true);
    }

    @Test
    void createSubmissionRateLimitsSameClientBeforeInsertingSubmission() {
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(submissionMapper(insertCount));
        ReflectionTestUtils.setField(service, "createRateLimitMaxRequests", 2);
        ReflectionTestUtils.setField(service, "createRateLimitWindowMinutes", 10L);

        ApiResponse<Map<String, Object>> first = service.createSubmission("127.0.0.1");
        ApiResponse<Map<String, Object>> second = service.createSubmission("127.0.0.1");
        ApiResponse<Map<String, Object>> third = service.createSubmission("127.0.0.1");

        assertThat(first.getCode()).isEqualTo(200);
        assertThat(second.getCode()).isEqualTo(200);
        assertThat(third.getCode()).isEqualTo(429);
        assertThat(third.getMessage()).isEqualTo("创建草稿过于频繁，请稍后再试");
        assertThat(insertCount).hasValue(2);
    }

    @Test
    void createSubmissionRateLimitIsIsolatedPerClient() {
        AtomicInteger insertCount = new AtomicInteger();
        FormServiceImpl service = formService(submissionMapper(insertCount));
        ReflectionTestUtils.setField(service, "createRateLimitMaxRequests", 1);

        ApiResponse<Map<String, Object>> firstClient = service.createSubmission("127.0.0.1");
        ApiResponse<Map<String, Object>> secondClient = service.createSubmission("127.0.0.2");
        ApiResponse<Map<String, Object>> firstClientAgain = service.createSubmission("127.0.0.1");

        assertThat(firstClient.getCode()).isEqualTo(200);
        assertThat(secondClient.getCode()).isEqualTo(200);
        assertThat(firstClientAgain.getCode()).isEqualTo(429);
        assertThat(insertCount).hasValue(2);
    }

    private FormServiceImpl formService(SubmissionMapper submissionMapper) {
        return new FormServiceImpl(
                submissionMapper,
                nullMapper(PersonalInfoMapper.class),
                leftMapper(new AtomicInteger(), new AtomicInteger()),
                rightMapper(new AtomicInteger(), new AtomicInteger()),
                nullMapper(AssessmentLeftTemplateMapper.class),
                nullMapper(AssessmentRightTemplateMapper.class),
                new InMemoryRedisUtil());
    }

    private FormServiceImpl formService(Submission submission,
                                        AssessmentLeftMapper leftMapper,
                                        AssessmentRightMapper rightMapper) {
        InMemoryRedisUtil redisUtil = new InMemoryRedisUtil();
        redisUtil.set("wt:session:" + submission.getSessionToken(), submission.getId(), 2, TimeUnit.HOURS);
        return formService(submission, leftMapper, rightMapper, nullMapper(PersonalInfoMapper.class), redisUtil);
    }

    private FormServiceImpl formService(Submission submission,
                                        AssessmentLeftMapper leftMapper,
                                        AssessmentRightMapper rightMapper,
                                        PersonalInfoMapper personalInfoMapper) {
        InMemoryRedisUtil redisUtil = new InMemoryRedisUtil();
        redisUtil.set("wt:session:" + submission.getSessionToken(), submission.getId(), 2, TimeUnit.HOURS);
        return formService(submission, leftMapper, rightMapper, personalInfoMapper, redisUtil);
    }

    private FormServiceImpl formService(Submission submission,
                                        AssessmentLeftMapper leftMapper,
                                        AssessmentRightMapper rightMapper,
                                        PersonalInfoMapper personalInfoMapper,
                                        RedisUtil redisUtil) {
        return new FormServiceImpl(
                submissionMapper(submission),
                personalInfoMapper,
                leftMapper,
                rightMapper,
                nullMapper(AssessmentLeftTemplateMapper.class),
                nullMapper(AssessmentRightTemplateMapper.class),
                redisUtil);
    }

    private SubmissionMapper submissionMapper(Submission submission) {
        return (SubmissionMapper) Proxy.newProxyInstance(
                SubmissionMapper.class.getClassLoader(),
                new Class<?>[]{SubmissionMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "selectById" -> submission;
                    case "selectOne" -> submission;
                    case "updateById" -> 1;
                    case "update" -> 1;
                    default -> defaultValue(method.getReturnType());
                });
    }

    private SubmissionMapper submissionMapper(AtomicInteger insertCount) {
        return (SubmissionMapper) Proxy.newProxyInstance(
                SubmissionMapper.class.getClassLoader(),
                new Class<?>[]{SubmissionMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "insert" -> {
                        insertCount.incrementAndGet();
                        Submission submission = (Submission) args[0];
                        submission.setId((long) insertCount.get());
                        yield 1;
                    }
                    default -> defaultValue(method.getReturnType());
                });
    }

    private PersonalInfoMapper personalInfoMapper(AtomicInteger selectCount, AtomicInteger insertCount) {
        return (PersonalInfoMapper) Proxy.newProxyInstance(
                PersonalInfoMapper.class.getClassLoader(),
                new Class<?>[]{PersonalInfoMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "selectOne" -> {
                        selectCount.incrementAndGet();
                        yield null;
                    }
                    case "insert" -> insertCount.incrementAndGet();
                    default -> defaultValue(method.getReturnType());
                });
    }

    private AssessmentLeftMapper leftMapper(AtomicInteger deleteCount, AtomicInteger insertCount) {
        return (AssessmentLeftMapper) Proxy.newProxyInstance(
                AssessmentLeftMapper.class.getClassLoader(),
                new Class<?>[]{AssessmentLeftMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "deleteBySubmissionId" -> deleteCount.incrementAndGet();
                    case "insert" -> insertCount.incrementAndGet();
                    default -> defaultValue(method.getReturnType());
                });
    }

    private AssessmentRightMapper rightMapper(AtomicInteger deleteCount, AtomicInteger insertCount) {
        return (AssessmentRightMapper) Proxy.newProxyInstance(
                AssessmentRightMapper.class.getClassLoader(),
                new Class<?>[]{AssessmentRightMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "deleteBySubmissionId" -> deleteCount.incrementAndGet();
                    case "insert" -> insertCount.incrementAndGet();
                    default -> defaultValue(method.getReturnType());
                });
    }

    private <T> T nullMapper(Class<T> mapperType) {
        return mapperType.cast(Proxy.newProxyInstance(
                mapperType.getClassLoader(),
                new Class<?>[]{mapperType},
                (proxy, method, args) -> defaultValue(method.getReturnType())));
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
        submission.setCompleted(false);
        submission.setCurrentStep(1);
        return submission;
    }

    private Submission submission(Long id, String sessionToken, boolean completed) {
        Submission submission = submission(id, sessionToken);
        submission.setCompleted(completed);
        return submission;
    }

    private List<AssessmentLeft> leftRows(int count) {
        List<AssessmentLeft> rows = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            AssessmentLeft row = new AssessmentLeft();
            row.setTypeName("左侧类型");
            row.setItemName("左侧项目" + i);
            rows.add(row);
        }
        return rows;
    }

    private List<AssessmentRight> rightRows(int count) {
        List<AssessmentRight> rows = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            AssessmentRight row = new AssessmentRight();
            row.setTypeName("右侧类型");
            row.setItemName("右侧项目" + i);
            rows.add(row);
        }
        return rows;
    }

    private String repeat(String value, int count) {
        return value.repeat(count);
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
        public Boolean expire(String key, long timeout, TimeUnit unit) {
            return values.containsKey(key);
        }
    }
}
