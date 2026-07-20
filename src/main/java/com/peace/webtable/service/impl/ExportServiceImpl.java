package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.peace.webtable.entity.*;
import com.peace.webtable.mapper.*;
import com.peace.webtable.service.ExportService;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Excel 导出服务实现类
 *
 * 职责：将所有已完成提交的数据导出为 Excel 文件。
 * 导出格式参照范本文件，包含两个 Sheet：
 * 1. 基础信息 — 所有提交者的基础信息汇总
 * 2. 接受程度自评 — 左右两侧栏的自评数据汇总
 * 使用分批查询写入工作簿，避免一次性加载所有数据库记录。
 */
@Slf4j
@Service
public class ExportServiceImpl implements ExportService {

    /** 每批导出的提交数，避免一次性加载所有关联数据。 */
    private static final int EXPORT_BATCH_SIZE = 500;
    /** Excel 会将这些字符开头的文本解析为公式或命令，需要转义。 */
    private static final String EXCEL_FORMULA_PREFIXES = "=+-@";

    private final SubmissionMapper submissionMapper;
    private final PersonalInfoMapper personalInfoMapper;
    private final AssessmentLeftMapper assessmentLeftMapper;
    private final AssessmentRightMapper assessmentRightMapper;

    public ExportServiceImpl(SubmissionMapper submissionMapper,
                             PersonalInfoMapper personalInfoMapper,
                             AssessmentLeftMapper assessmentLeftMapper,
                             AssessmentRightMapper assessmentRightMapper) {
        this.submissionMapper = submissionMapper;
        this.personalInfoMapper = personalInfoMapper;
        this.assessmentLeftMapper = assessmentLeftMapper;
        this.assessmentRightMapper = assessmentRightMapper;
    }

    /**
     * 导出所有已完成提交的数据为 Excel
     *
     * 使用分批查询避免 N+1 问题和一次性加载全部导出数据。
     */
    @Override
    public ByteArrayOutputStream exportAllToExcel() {
        log.info("开始导出 Excel 数据");

        Workbook workbook = new XSSFWorkbook();

        try {
            long exportedCount = writeExportWorkbook(workbook);

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            workbook.write(bos);

            log.info("Excel 导出完成：提交数={}", exportedCount);
            return bos;

        } catch (IOException e) {
            log.error("Excel 导出失败", e);
            throw new RuntimeException("Excel 导出失败", e);
        } finally {
            try {
                workbook.close();
            } catch (IOException e) {
                log.warn("Excel 工作簿关闭失败：{}", e.getMessage());
            }
        }
    }

    /**
     * 将导出数据写入工作簿。
     *
     * 该方法承载分页查询和写入逻辑，便于用普通 Workbook 做单元测试。
     *
     * @param workbook Excel 工作簿
     * @return 导出的提交数量
     */
    long writeExportWorkbook(Workbook workbook) {
        Sheet personalInfoSheet = createPersonalInfoSheet(workbook);
        Sheet assessmentSheet = createAssessmentSheet(workbook);
        int personalInfoRowNum = 1;
        int assessmentRowNum = 1;
        long exportedCount = 0;

        for (long pageNo = 1; ; pageNo++) {
            Page<Submission> page = submissionMapper.selectPage(
                    new Page<>(pageNo, EXPORT_BATCH_SIZE, false),
                    new QueryWrapper<Submission>()
                            .eq("completed", true)
                            .select("id")
                            .orderByAsc("id"));
            List<Submission> submissions = page.getRecords();
            if (submissions.isEmpty()) {
                break;
            }

            List<Long> ids = submissions.stream().map(Submission::getId).collect(Collectors.toList());

            // 批量查询当前批次的关联数据，避免全量导出时把所有自评行同时放进内存。
            Map<Long, PersonalInfo> infoMap = personalInfoMapper.selectList(
                    new QueryWrapper<PersonalInfo>().in("submission_id", ids))
                    .stream().collect(Collectors.toMap(PersonalInfo::getSubmissionId, p -> p));

            Map<Long, List<AssessmentLeft>> leftMap = assessmentLeftMapper.selectList(
                    new QueryWrapper<AssessmentLeft>().in("submission_id", ids).orderByAsc("row_order"))
                    .stream().collect(Collectors.groupingBy(AssessmentLeft::getSubmissionId));

            Map<Long, List<AssessmentRight>> rightMap = assessmentRightMapper.selectList(
                    new QueryWrapper<AssessmentRight>().in("submission_id", ids).orderByAsc("row_order"))
                    .stream().collect(Collectors.groupingBy(AssessmentRight::getSubmissionId));

            personalInfoRowNum = appendPersonalInfoRows(personalInfoSheet, personalInfoRowNum, submissions, infoMap);
            assessmentRowNum = appendAssessmentRows(assessmentSheet, assessmentRowNum, submissions, leftMap, rightMap);
            exportedCount += submissions.size();

            if (submissions.size() < EXPORT_BATCH_SIZE) {
                break;
            }
        }
        return exportedCount;
    }

    /**
     * 创建基础信息 Sheet 并写入表头。
     *
     * 表头对应范本文件中的所有基础字段。
     */
    private Sheet createPersonalInfoSheet(Workbook workbook) {
        Sheet sheet = workbook.createSheet("基础信息");

        Row header = sheet.createRow(0);
        String[] headers = {
                "提交ID", "名字", "身高cm", "体重kg", "学历", "职业", "鞋码EU",
                "所在地(省)", "所在地(市)", "QQ号", "微信号", "微博名", "电话号码",
                "第一次自慰年龄", "破处年龄", "是否单身", "是否绿过伴侣", "是否被伴侣绿过",
                "最长带锁时间", "做爱频率", "自慰频率", "自慰工具",
                "菊穴可完全插入尺寸", "尿道可完全插入尺寸", "犬龄", "约调次数", "侍主人数",
                "精液量ml", "每日最高射精次数", "喜欢被叫的称呼", "一句话形容自己",
                "培养意向", "备注"
        };
        for (int i = 0; i < headers.length; i++) {
            header.createCell(i).setCellValue(headers[i]);
        }
        return sheet;
    }

    /**
     * 追加基础信息行。
     *
     * @param infoMap 批量查询结果，key 为 submissionId
     * @return 下一行行号
     */
    private int appendPersonalInfoRows(Sheet sheet, int rowNum, List<Submission> submissions,
                                       Map<Long, PersonalInfo> infoMap) {
        for (Submission submission : submissions) {
            PersonalInfo info = infoMap.get(submission.getId());
            if (info != null) {
                Row row = sheet.createRow(rowNum++);
                int col = 0;
                row.createCell(col++).setCellValue(submission.getId());
                writeTextCell(row, col++, info.getName());
                writeTextCell(row, col++, info.getHeight());
                writeTextCell(row, col++, info.getWeight());
                writeTextCell(row, col++, info.getEducation());
                writeTextCell(row, col++, info.getOccupation());
                writeTextCell(row, col++, info.getShoeSize());
                writeTextCell(row, col++, info.getProvince());
                writeTextCell(row, col++, info.getCity());
                writeTextCell(row, col++, info.getQq());
                writeTextCell(row, col++, info.getWechat());
                writeTextCell(row, col++, info.getWeibo());
                writeTextCell(row, col++, info.getPhone());
                writeTextCell(row, col++, info.getFirstMasturbationAge());
                writeTextCell(row, col++, info.getFirstSexAge());
                writeTextCell(row, col++, info.getIsSingle());
                writeTextCell(row, col++, info.getCheatedOnPartner());
                writeTextCell(row, col++, info.getBeenCheated());
                writeTextCell(row, col++, info.getLongestLockTime());
                writeTextCell(row, col++, info.getSexFrequency());
                writeTextCell(row, col++, info.getMasturbationFrequency());
                writeTextCell(row, col++, info.getMasturbationTool());
                writeTextCell(row, col++, info.getAnalInsertableSize());
                writeTextCell(row, col++, info.getUrethraInsertableSize());
                writeTextCell(row, col++, info.getDogAge());
                writeTextCell(row, col++, info.getMeetingCount());
                writeTextCell(row, col++, info.getMasterCount());
                writeTextCell(row, col++, info.getSemenVolume());
                writeTextCell(row, col++, info.getDailyMaxEjaculation());
                writeTextCell(row, col++, info.getPreferredName());
                writeTextCell(row, col++, info.getSelfDescription());
                writeTextCell(row, col++, info.getTrainingIntention());
                writeTextCell(row, col, info.getRemark());
            }
        }
        return rowNum;
    }

    /**
     * 创建接受程度自评 Sheet 并写入表头。
     *
     * 合并左右两侧栏数据，表头：提交ID | 左侧类型 | 左侧项目 | 左侧级别 | 左侧备注 | 右侧类型 | 右侧项目 | 右侧级别 | 右侧备注
     */
    private Sheet createAssessmentSheet(Workbook workbook) {
        Sheet sheet = workbook.createSheet("接受程度自评");

        Row header = sheet.createRow(0);
        String[] headers = {
                "提交ID", "类型(左)", "项目(左)", "级别(左)", "备注(左)",
                "类型(右)", "项目(右)", "级别(右)", "备注(右)"
        };
        for (int i = 0; i < headers.length; i++) {
            header.createCell(i).setCellValue(headers[i]);
        }
        return sheet;
    }

    /**
     * 追加接受程度自评行。
     *
     * @param leftMap  左侧自评数据，key 为 submissionId
     * @param rightMap 右侧自评数据，key 为 submissionId
     * @return 下一行行号
     */
    private int appendAssessmentRows(Sheet sheet, int rowNum, List<Submission> submissions,
                                     Map<Long, List<AssessmentLeft>> leftMap,
                                     Map<Long, List<AssessmentRight>> rightMap) {
        for (Submission submission : submissions) {
            List<AssessmentLeft> leftList = leftMap.getOrDefault(submission.getId(), List.of());
            List<AssessmentRight> rightList = rightMap.getOrDefault(submission.getId(), List.of());

            // 按最大行数遍历，左右对齐
            int maxRows = Math.max(leftList.size(), rightList.size());
            for (int i = 0; i < maxRows; i++) {
                Row row = sheet.createRow(rowNum++);
                int col = 0;
                row.createCell(col++).setCellValue(submission.getId());

                // 左侧数据
                if (i < leftList.size()) {
                    AssessmentLeft left = leftList.get(i);
                    writeTextCell(row, col++, left.getTypeName());
                    writeTextCell(row, col++, left.getItemName());
                    writeTextCell(row, col++, left.getLevel());
                    writeTextCell(row, col++, left.getRemark());
                } else {
                    col += 4;
                }

                // 右侧数据
                if (i < rightList.size()) {
                    AssessmentRight right = rightList.get(i);
                    writeTextCell(row, col++, right.getTypeName());
                    writeTextCell(row, col++, right.getItemName());
                    writeTextCell(row, col++, right.getLevel());
                    writeTextCell(row, col, right.getRemark());
                }
            }
        }
        return rowNum;
    }

    /**
     * 写入文本单元格，并转义可能被 Excel 解释为公式的用户输入。
     */
    private void writeTextCell(Row row, int columnIndex, String value) {
        Cell cell = row.createCell(columnIndex);
        cell.setCellValue(escapeExcelFormula(value));
    }

    /**
     * 转义 Excel 公式前缀，防止用户输入在管理员打开导出文件时被执行。
     */
    private String escapeExcelFormula(String value) {
        String safeValue = safeStr(value);
        if (safeValue.isEmpty()) {
            return safeValue;
        }
        char first = safeValue.charAt(0);
        return EXCEL_FORMULA_PREFIXES.indexOf(first) >= 0 ? "'" + safeValue : safeValue;
    }

    /**
     * 安全字符串转换，null 返回空字符串
     */
    private String safeStr(String s) {
        return s != null ? s : "";
    }
}
