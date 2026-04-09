package com.peace.webtable.service.impl;

import com.peace.webtable.entity.*;
import com.peace.webtable.mapper.*;
import com.peace.webtable.service.ExportService;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

/**
 * Excel 导出服务实现类
 *
 * 职责：将所有已完成提交的数据导出为 Excel 文件。
 * 导出格式参照范本文件，包含三个 Sheet：
 * 1. 基础信息 — 所有提交者的基础信息汇总
 * 2. 接受程度自评 — 左右两侧栏的自评数据汇总
 * 使用 SXSSFWorkbook 流式写入，支持大数据量导出。
 */
@Slf4j
@Service
public class ExportServiceImpl implements ExportService {

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
     */
    @Override
    public ByteArrayOutputStream exportAllToExcel() {
        log.info("开始导出 Excel 数据");

        // 使用流式工作簿，避免大数据量导出时 OOM
        // 内存中保留 100 行，超出部分写入临时文件
        SXSSFWorkbook workbook = new SXSSFWorkbook(100);

        try {
            List<Submission> submissions = submissionMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Submission>()
                            .eq("completed", true));

            // 生成三个 Sheet
            writePersonalInfoSheet(workbook, submissions);
            writeAssessmentSheet(workbook, submissions);

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            workbook.write(bos);

            log.info("Excel 导出完成：提交数={}", submissions.size());
            return bos;

        } catch (IOException e) {
            log.error("Excel 导出失败", e);
            throw new RuntimeException("Excel 导出失败", e);
        } finally {
            workbook.dispose();
        }
    }

    /**
     * 写入基础信息 Sheet
     *
     * 表头对应范本文件中的所有基础字段。
     */
    private void writePersonalInfoSheet(Workbook workbook, List<Submission> submissions) {
        Sheet sheet = workbook.createSheet("基础信息");

        // 表头：对应范本中 B 列的字段名
        Row header = sheet.createRow(0);
        String[] headers = {
                "提交ID", "名字", "身高cm", "体重kg", "学历", "职业", "鞋码EU",
                "所在地(省)", "所在地(市)", "QQ号", "微信号", "微博名", "电话号码",
                "第一次自慰年龄", "破处年龄", "是否单身", "是否绿过伴侣", "是否被伴侣绿过",
                "最长带锁时间", "做爱频率", "自慰频率", "自慰工具",
                "菊穴可完全插入尺寸", "尿道可完全插入尺寸", "犬龄", "约调次数", "侍主人数",
                "精液量ml", "每日最高射精次数", "喜欢被叫的称呼", "一句话形容自己", "备注"
        };
        for (int i = 0; i < headers.length; i++) {
            header.createCell(i).setCellValue(headers[i]);
        }

        int rowNum = 1;
        for (Submission submission : submissions) {
            PersonalInfo info = personalInfoMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<PersonalInfo>()
                            .eq("submission_id", submission.getId()));

            if (info != null) {
                Row row = sheet.createRow(rowNum++);
                int col = 0;
                row.createCell(col++).setCellValue(submission.getId());
                row.createCell(col++).setCellValue(safeStr(info.getName()));
                row.createCell(col++).setCellValue(safeStr(info.getHeight()));
                row.createCell(col++).setCellValue(safeStr(info.getWeight()));
                row.createCell(col++).setCellValue(safeStr(info.getEducation()));
                row.createCell(col++).setCellValue(safeStr(info.getOccupation()));
                row.createCell(col++).setCellValue(safeStr(info.getShoeSize()));
                row.createCell(col++).setCellValue(safeStr(info.getProvince()));
                row.createCell(col++).setCellValue(safeStr(info.getCity()));
                row.createCell(col++).setCellValue(safeStr(info.getQq()));
                row.createCell(col++).setCellValue(safeStr(info.getWechat()));
                row.createCell(col++).setCellValue(safeStr(info.getWeibo()));
                row.createCell(col++).setCellValue(safeStr(info.getPhone()));
                row.createCell(col++).setCellValue(safeStr(info.getFirstMasturbationAge()));
                row.createCell(col++).setCellValue(safeStr(info.getFirstSexAge()));
                row.createCell(col++).setCellValue(safeStr(info.getIsSingle()));
                row.createCell(col++).setCellValue(safeStr(info.getCheatedOnPartner()));
                row.createCell(col++).setCellValue(safeStr(info.getBeenCheated()));
                row.createCell(col++).setCellValue(safeStr(info.getLongestLockTime()));
                row.createCell(col++).setCellValue(safeStr(info.getSexFrequency()));
                row.createCell(col++).setCellValue(safeStr(info.getMasturbationFrequency()));
                row.createCell(col++).setCellValue(safeStr(info.getMasturbationTool()));
                row.createCell(col++).setCellValue(safeStr(info.getAnalInsertableSize()));
                row.createCell(col++).setCellValue(safeStr(info.getUrethraInsertableSize()));
                row.createCell(col++).setCellValue(safeStr(info.getDogAge()));
                row.createCell(col++).setCellValue(safeStr(info.getMeetingCount()));
                row.createCell(col++).setCellValue(safeStr(info.getMasterCount()));
                row.createCell(col++).setCellValue(safeStr(info.getSemenVolume()));
                row.createCell(col++).setCellValue(safeStr(info.getDailyMaxEjaculation()));
                row.createCell(col++).setCellValue(safeStr(info.getPreferredName()));
                row.createCell(col++).setCellValue(safeStr(info.getSelfDescription()));
                row.createCell(col).setCellValue(safeStr(info.getRemark()));
            }
        }
    }

    /**
     * 写入接受程度自评 Sheet
     *
     * 合并左右两侧栏数据，表头：提交ID | 左侧类型 | 左侧项目 | 左侧级别 | 左侧备注 | 右侧类型 | 右侧项目 | 右侧级别 | 右侧备注
     */
    private void writeAssessmentSheet(Workbook workbook, List<Submission> submissions) {
        Sheet sheet = workbook.createSheet("接受程度自评");

        Row header = sheet.createRow(0);
        String[] headers = {
                "提交ID", "类型(左)", "项目(左)", "级别(左)", "备注(左)",
                "类型(右)", "项目(右)", "级别(右)", "备注(右)"
        };
        for (int i = 0; i < headers.length; i++) {
            header.createCell(i).setCellValue(headers[i]);
        }

        int rowNum = 1;
        for (Submission submission : submissions) {
            List<AssessmentLeft> leftList = assessmentLeftMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<AssessmentLeft>()
                            .eq("submission_id", submission.getId())
                            .orderByAsc("row_order"));

            List<AssessmentRight> rightList = assessmentRightMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<AssessmentRight>()
                            .eq("submission_id", submission.getId())
                            .orderByAsc("row_order"));

            // 按最大行数遍历，左右对齐
            int maxRows = Math.max(leftList.size(), rightList.size());
            for (int i = 0; i < maxRows; i++) {
                Row row = sheet.createRow(rowNum++);
                int col = 0;
                row.createCell(col++).setCellValue(submission.getId());

                // 左侧数据
                if (i < leftList.size()) {
                    AssessmentLeft left = leftList.get(i);
                    row.createCell(col++).setCellValue(safeStr(left.getTypeName()));
                    row.createCell(col++).setCellValue(safeStr(left.getItemName()));
                    row.createCell(col++).setCellValue(safeStr(left.getLevel()));
                    row.createCell(col++).setCellValue(safeStr(left.getRemark()));
                } else {
                    col += 4;
                }

                // 右侧数据
                if (i < rightList.size()) {
                    AssessmentRight right = rightList.get(i);
                    row.createCell(col++).setCellValue(safeStr(right.getTypeName()));
                    row.createCell(col++).setCellValue(safeStr(right.getItemName()));
                    row.createCell(col++).setCellValue(safeStr(right.getLevel()));
                    row.createCell(col).setCellValue(safeStr(right.getRemark()));
                }
            }
        }
    }

    /**
     * 安全字符串转换，null 返回空字符串
     */
    private String safeStr(String s) {
        return s != null ? s : "";
    }
}
