package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.peace.webtable.entity.AssessmentLeft;
import com.peace.webtable.entity.AssessmentRight;
import com.peace.webtable.entity.PersonalInfo;
import com.peace.webtable.entity.Submission;
import com.peace.webtable.mapper.AssessmentLeftMapper;
import com.peace.webtable.mapper.AssessmentRightMapper;
import com.peace.webtable.mapper.PersonalInfoMapper;
import com.peace.webtable.mapper.SubmissionMapper;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Excel 导出服务测试。
 *
 * 覆盖分批分页导出，避免全量数据一次性加载到内存。
 */
class ExportServiceImplTest {

    @Test
    void exportAllToExcelPaginatesSubmissionsAndWritesAllBatches() throws Exception {
        List<Submission> submissions = new ArrayList<>();
        Map<Long, PersonalInfo> infoMap = new HashMap<>();
        for (long id = 1; id <= 501; id++) {
            submissions.add(submission(id));
            infoMap.put(id, personalInfo(id, "用户" + id));
        }
        AtomicInteger submissionQueryCount = new AtomicInteger();
        AtomicLong requestedPageSize = new AtomicLong();
        ExportServiceImpl service = exportService(submissions, infoMap, Map.of(), Map.of(),
                submissionQueryCount, requestedPageSize);

        try (Workbook workbook = new XSSFWorkbook()) {
            long exportedCount = service.writeExportWorkbook(workbook);

            assertThat(exportedCount).isEqualTo(501);
            assertThat(submissionQueryCount).hasValue(2);
            assertThat(requestedPageSize).hasValue(500);
            assertThat(workbook.getNumberOfSheets()).isEqualTo(2);
            assertThat(workbook.getSheet("基础信息").getLastRowNum()).isEqualTo(501);
            assertThat(workbook.getSheet("基础信息").getRow(1).getCell(0).getNumericCellValue()).isEqualTo(1D);
            assertThat(workbook.getSheet("基础信息").getRow(501).getCell(0).getNumericCellValue()).isEqualTo(501D);
            assertThat(workbook.getSheet("基础信息").getRow(501).getCell(1).getStringCellValue()).isEqualTo("用户501");
        }
    }

    @Test
    void exportAllToExcelKeepsHeadersWhenNoSubmissionsExist() throws Exception {
        ExportServiceImpl service = exportService(List.of(), Map.of(), Map.of(), Map.of(),
                new AtomicInteger(), new AtomicLong());

        try (Workbook workbook = new XSSFWorkbook()) {
            long exportedCount = service.writeExportWorkbook(workbook);

            assertThat(exportedCount).isZero();
            assertThat(workbook.getNumberOfSheets()).isEqualTo(2);
            assertThat(workbook.getSheet("基础信息").getRow(0).getCell(0).getStringCellValue()).isEqualTo("提交ID");
            assertThat(workbook.getSheet("接受程度自评").getRow(0).getCell(0).getStringCellValue()).isEqualTo("提交ID");
            assertThat(workbook.getSheet("基础信息").getLastRowNum()).isZero();
            assertThat(workbook.getSheet("接受程度自评").getLastRowNum()).isZero();
        }
    }

    @Test
    void exportAllToExcelReturnsWorkbookBytesForEmptyDataset() throws Exception {
        ExportServiceImpl service = exportService(List.of(), Map.of(), Map.of(), Map.of(),
                new AtomicInteger(), new AtomicLong());

        ByteArrayOutputStream output = service.exportAllToExcel();

        assertThat(output.size()).isGreaterThan(0);
        try (Workbook workbook = new XSSFWorkbook(new ByteArrayInputStream(output.toByteArray()))) {
            assertThat(workbook.getNumberOfSheets()).isEqualTo(2);
            assertThat(workbook.getSheet("基础信息").getRow(0).getCell(0).getStringCellValue()).isEqualTo("提交ID");
        }
    }

    @Test
    void exportAllToExcelEscapesFormulaLikeUserInput() throws Exception {
        Long submissionId = 1L;
        PersonalInfo info = personalInfo(submissionId, "=HYPERLINK(\"http://example.com\")");
        info.setEducation("本科");
        info.setOccupation("+SUM(1,1)");
        info.setCity("-cmd");
        info.setRemark("@external");

        AssessmentLeft left = assessmentLeft(submissionId, "=左侧类型", "+左侧项目", "-B", "@左侧备注");
        AssessmentRight right = assessmentRight(submissionId, "正常类型", "正常项目", "A", "=右侧备注");

        ExportServiceImpl service = exportService(
                List.of(submission(submissionId)),
                Map.of(submissionId, info),
                Map.of(submissionId, List.of(left)),
                Map.of(submissionId, List.of(right)),
                new AtomicInteger(),
                new AtomicLong());

        try (Workbook workbook = new XSSFWorkbook()) {
            long exportedCount = service.writeExportWorkbook(workbook);

            assertThat(exportedCount).isEqualTo(1);
            assertThat(workbook.getSheet("基础信息").getRow(1).getCell(1).getStringCellValue())
                    .isEqualTo("'=HYPERLINK(\"http://example.com\")");
            assertThat(workbook.getSheet("基础信息").getRow(1).getCell(4).getStringCellValue()).isEqualTo("本科");
            assertThat(workbook.getSheet("基础信息").getRow(1).getCell(5).getStringCellValue()).isEqualTo("'+SUM(1,1)");
            assertThat(workbook.getSheet("基础信息").getRow(1).getCell(8).getStringCellValue()).isEqualTo("'-cmd");
            assertThat(workbook.getSheet("基础信息").getRow(1).getCell(32).getStringCellValue()).isEqualTo("'@external");

            assertThat(workbook.getSheet("接受程度自评").getRow(1).getCell(1).getStringCellValue()).isEqualTo("'=左侧类型");
            assertThat(workbook.getSheet("接受程度自评").getRow(1).getCell(2).getStringCellValue()).isEqualTo("'+左侧项目");
            assertThat(workbook.getSheet("接受程度自评").getRow(1).getCell(3).getStringCellValue()).isEqualTo("'-B");
            assertThat(workbook.getSheet("接受程度自评").getRow(1).getCell(4).getStringCellValue()).isEqualTo("'@左侧备注");
            assertThat(workbook.getSheet("接受程度自评").getRow(1).getCell(5).getStringCellValue()).isEqualTo("正常类型");
            assertThat(workbook.getSheet("接受程度自评").getRow(1).getCell(8).getStringCellValue()).isEqualTo("'=右侧备注");
        }
    }

    private ExportServiceImpl exportService(List<Submission> submissions,
                                            Map<Long, PersonalInfo> infoMap,
                                            Map<Long, List<AssessmentLeft>> leftMap,
                                            Map<Long, List<AssessmentRight>> rightMap,
                                            AtomicInteger submissionQueryCount,
                                            AtomicLong requestedPageSize) {
        return new ExportServiceImpl(
                submissionMapper(submissions, submissionQueryCount, requestedPageSize),
                listMapper(PersonalInfoMapper.class, infoMap),
                listMapper(AssessmentLeftMapper.class, leftMap),
                listMapper(AssessmentRightMapper.class, rightMap));
    }

    private SubmissionMapper submissionMapper(List<Submission> submissions,
                                             AtomicInteger queryCount,
                                             AtomicLong requestedPageSize) {
        return (SubmissionMapper) Proxy.newProxyInstance(
                SubmissionMapper.class.getClassLoader(),
                new Class<?>[]{SubmissionMapper.class},
                (proxy, method, args) -> {
                    if ("selectPage".equals(method.getName())) {
                        @SuppressWarnings("unchecked")
                        Page<Submission> page = (Page<Submission>) args[0];
                        queryCount.incrementAndGet();
                        requestedPageSize.set(page.getSize());
                        int fromIndex = (int) ((page.getCurrent() - 1) * page.getSize());
                        int toIndex = (int) Math.min(fromIndex + page.getSize(), submissions.size());
                        List<Submission> records = fromIndex >= submissions.size()
                                ? List.of()
                                : submissions.subList(fromIndex, toIndex);
                        page.setRecords(records);
                        return page;
                    }
                    return defaultValue(method.getReturnType());
                }
        );
    }

    private <T> T listMapper(Class<T> mapperType, Map<Long, ?> rowsBySubmissionId) {
        return mapperType.cast(Proxy.newProxyInstance(
                mapperType.getClassLoader(),
                new Class<?>[]{mapperType},
                (proxy, method, args) -> {
                    if ("selectList".equals(method.getName())) {
                        return rowsBySubmissionId.values().stream()
                                .flatMap(value -> value instanceof List<?> list ? list.stream() : Collections.singletonList(value).stream())
                                .toList();
                    }
                    return defaultValue(method.getReturnType());
                }
        ));
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

    private Submission submission(Long id) {
        Submission submission = new Submission();
        submission.setId(id);
        submission.setCompleted(true);
        return submission;
    }

    private PersonalInfo personalInfo(Long submissionId, String name) {
        PersonalInfo info = new PersonalInfo();
        info.setSubmissionId(submissionId);
        info.setName(name);
        return info;
    }

    private AssessmentLeft assessmentLeft(Long submissionId, String typeName, String itemName, String level, String remark) {
        AssessmentLeft assessment = new AssessmentLeft();
        assessment.setSubmissionId(submissionId);
        assessment.setTypeName(typeName);
        assessment.setItemName(itemName);
        assessment.setLevel(level);
        assessment.setRemark(remark);
        assessment.setRowOrder(1);
        return assessment;
    }

    private AssessmentRight assessmentRight(Long submissionId, String typeName, String itemName, String level, String remark) {
        AssessmentRight assessment = new AssessmentRight();
        assessment.setSubmissionId(submissionId);
        assessment.setTypeName(typeName);
        assessment.setItemName(itemName);
        assessment.setLevel(level);
        assessment.setRemark(remark);
        assessment.setRowOrder(1);
        return assessment;
    }
}
