package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.peace.webtable.config.AdminConfig;
import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.*;
import com.peace.webtable.mapper.*;
import com.peace.webtable.service.AdminService;
import com.peace.webtable.util.RedisUtil;
import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.pdf.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 管理员业务服务实现类
 *
 * 职责：实现管理员系统的所有业务逻辑。
 * 包括密码验证、数据查询和 PDF 生成。
 */
@Slf4j
@Service
public class AdminServiceImpl implements AdminService {

    /** Redis 管理员 token key 前缀 */
    private static final String ADMIN_TOKEN_PREFIX = "wt:admin:";
    /** 管理员 token 过期时间：24 小时 */
    private static final long ADMIN_TOKEN_TTL_HOURS = 24;

    private final AdminConfig adminConfig;
    private final RedisUtil redisUtil;
    private final SubmissionMapper submissionMapper;
    private final PersonalInfoMapper personalInfoMapper;
    private final PhotoMapper photoMapper;
    private final AssessmentLeftMapper assessmentLeftMapper;
    private final AssessmentRightMapper assessmentRightMapper;

    public AdminServiceImpl(AdminConfig adminConfig, RedisUtil redisUtil,
                            SubmissionMapper submissionMapper, PersonalInfoMapper personalInfoMapper,
                            PhotoMapper photoMapper, AssessmentLeftMapper assessmentLeftMapper,
                            AssessmentRightMapper assessmentRightMapper) {
        this.adminConfig = adminConfig;
        this.redisUtil = redisUtil;
        this.submissionMapper = submissionMapper;
        this.personalInfoMapper = personalInfoMapper;
        this.photoMapper = photoMapper;
        this.assessmentLeftMapper = assessmentLeftMapper;
        this.assessmentRightMapper = assessmentRightMapper;
    }

    /**
     * 管理员登录验证
     *
     * 比对输入密码与配置密码，匹配时生成 UUID token 存入 Redis。
     */
    @Override
    public ApiResponse<Map<String, Object>> login(String password) {
        if (password == null || !password.equals(adminConfig.getPassword())) {
            log.warn("管理员登录失败：密码错误");
            return ApiResponse.error("密码错误");
        }

        // 生成管理员 token
        String token = UUID.randomUUID().toString().replace("-", "");
        String key = ADMIN_TOKEN_PREFIX + token;
        redisUtil.set(key, "admin", ADMIN_TOKEN_TTL_HOURS, TimeUnit.HOURS);

        log.info("管理员登录成功");
        Map<String, Object> result = new HashMap<>();
        result.put("adminToken", token);
        return ApiResponse.ok(result);
    }

    /**
     * 验证管理员 token
     */
    @Override
    public boolean validateToken(String adminToken) {
        if (adminToken == null || adminToken.isEmpty()) {
            return false;
        }
        return redisUtil.hasKey(ADMIN_TOKEN_PREFIX + adminToken);
    }

    /**
     * 获取所有已提交的列表
     *
     * 查询所有已完成的提交记录，按创建时间倒序排列。
     */
    @Override
    public ApiResponse<Object> getSubmissionList() {
        List<Submission> submissions = submissionMapper.selectList(
                new QueryWrapper<Submission>()
                        .eq("completed", true)
                        .orderByDesc("create_time"));

        // 转换为安全的数据格式（不暴露 session_token）
        List<Map<String, Object>> list = new ArrayList<>();
        for (Submission s : submissions) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", s.getId());
            item.put("currentStep", s.getCurrentStep());
            item.put("completed", s.getCompleted());
            item.put("createTime", s.getCreateTime());
            item.put("updateTime", s.getUpdateTime());
            list.add(item);
        }

        return ApiResponse.ok(list);
    }

    /**
     * 获取单个提交的完整详情
     *
     * 查询基础信息、照片列表（不含二进制数据）、左右自评数据。
     */
    @Override
    public ApiResponse<Map<String, Object>> getSubmissionDetail(Long submissionId) {
        Map<String, Object> detail = new HashMap<>();

        // 查询提交记录
        Submission submission = submissionMapper.selectById(submissionId);
        if (submission == null) {
            return ApiResponse.error("提交记录不存在");
        }

        // 查询基础信息
        PersonalInfo personalInfo = personalInfoMapper.selectOne(
                new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));
        detail.put("personalInfo", personalInfo);

        // 查询照片列表（不含二进制数据，只返回元信息）
        List<Photo> photos = photoMapper.selectList(
                new QueryWrapper<Photo>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("photo_category")
                        .orderByAsc("photo_order")
                        .select("id", "submission_id", "photo_category", "photo_order", "photo_name", "photo_type", "create_time"));
        detail.put("photos", photos);

        // 查询左侧自评
        List<AssessmentLeft> leftList = assessmentLeftMapper.selectList(
                new QueryWrapper<AssessmentLeft>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("row_order"));
        detail.put("assessmentLeft", leftList);

        // 查询右侧自评
        List<AssessmentRight> rightList = assessmentRightMapper.selectList(
                new QueryWrapper<AssessmentRight>()
                        .eq("submission_id", submissionId)
                        .orderByAsc("row_order"));
        detail.put("assessmentRight", rightList);

        detail.put("submission", submission);
        return ApiResponse.ok(detail);
    }

    /**
     * 导出单个提交的 PDF
     *
     * 使用 OpenPDF 生成 PDF 文件，包含：
     * 1. 标题
     * 2. 基础信息字段列表
     * 3. 照片（一行一张大图，按类别分组）
     * 4. 自评表格（左右两侧合并）
     */
    @Override
    public ByteArrayOutputStream exportPdf(Long submissionId) {
        log.info("开始生成 PDF：submissionId={}", submissionId);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();

        try {
            Document document = new Document(PageSize.A4, 36, 36, 36, 36);
            PdfWriter.getInstance(document, bos);
            document.open();

            // 根据操作系统选择合适的 Unicode 中文字体
            BaseFont baseFont = createCjkBaseFont();
            Font titleFont = new Font(baseFont, 18, Font.BOLD);
            Font sectionFont = new Font(baseFont, 14, Font.BOLD);
            Font labelFont = new Font(baseFont, 10, Font.BOLD);
            Font valueFont = new Font(baseFont, 10, Font.NORMAL);
            Font tableHeaderFont = new Font(baseFont, 9, Font.BOLD);
            Font tableCellFont = new Font(baseFont, 9, Font.NORMAL);

            // ===== 标题 =====
            Paragraph title = new Paragraph("个人信息收集表", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(20);
            document.add(title);

            // ===== 基础信息 =====
            PersonalInfo info = personalInfoMapper.selectOne(
                    new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));

            if (info != null) {
                Paragraph section1 = new Paragraph("一、基础信息", sectionFont);
                section1.setSpacingBefore(10);
                section1.setSpacingAfter(10);
                document.add(section1);

                String[][] basicFields = {
                    {"名字", safeStr(info.getName())},
                    {"身高", safeStr(info.getHeight()) + "cm"},
                    {"体重", safeStr(info.getWeight()) + "kg"},
                    {"学历", safeStr(info.getEducation())},
                    {"职业", safeStr(info.getOccupation())},
                    {"鞋码", safeStr(info.getShoeSize()) + "EU"},
                    {"所在地", safeStr(info.getProvince()) + " " + safeStr(info.getCity())},
                    {"QQ", safeStr(info.getQq())},
                    {"微信", safeStr(info.getWechat())},
                    {"微博", safeStr(info.getWeibo())},
                    {"电话", safeStr(info.getPhone())},
                    {"第一次自慰年龄", safeStr(info.getFirstMasturbationAge())},
                    {"破处年龄", safeStr(info.getFirstSexAge())},
                    {"是否单身", safeStr(info.getIsSingle())},
                    {"是否绿过伴侣", safeStr(info.getCheatedOnPartner())},
                    {"是否被伴侣绿过", safeStr(info.getBeenCheated())},
                    {"最长带锁时间", safeStr(info.getLongestLockTime())},
                    {"做爱频率", safeStr(info.getSexFrequency())},
                    {"自慰频率", safeStr(info.getMasturbationFrequency())},
                    {"自慰工具", safeStr(info.getMasturbationTool())},
                    {"犬龄", safeStr(info.getDogAge())},
                    {"约调次数", safeStr(info.getMeetingCount())},
                    {"侍主人数", safeStr(info.getMasterCount())},
                    {"喜欢被叫的称呼", safeStr(info.getPreferredName())},
                    {"一句话形容自己", safeStr(info.getSelfDescription())},
                    {"备注", safeStr(info.getRemark())},
                    {"培养意向", safeStr(info.getTrainingIntention())}
                };

                PdfPTable infoTable = new PdfPTable(2);
                infoTable.setWidthPercentage(100);
                infoTable.setWidths(new float[]{2, 5});

                for (String[] field : basicFields) {
                    PdfPCell labelCell = new PdfPCell(new Phrase(field[0] + "：", labelFont));
                    labelCell.setBackgroundColor(new Color(245, 245, 245));
                    labelCell.setPadding(6);
                    labelCell.setBorderWidth(0.5f);
                    infoTable.addCell(labelCell);

                    PdfPCell valueCell = new PdfPCell(new Phrase(field[1], valueFont));
                    valueCell.setPadding(6);
                    valueCell.setBorderWidth(0.5f);
                    infoTable.addCell(valueCell);
                }
                document.add(infoTable);
            }

            // ===== 照片部分 =====
            List<Photo> photos = photoMapper.selectList(
                    new QueryWrapper<Photo>()
                            .eq("submission_id", submissionId)
                            .orderByAsc("photo_order"));

            if (!photos.isEmpty()) {
                Paragraph section2 = new Paragraph("二、附图", sectionFont);
                section2.setSpacingBefore(15);
                section2.setSpacingAfter(10);
                document.add(section2);

                // 固定类别顺序（业务顺序，非字母序）
                List<String> categoryOrder = List.of("selfie", "nude", "dick", "other");
                Map<String, String> categoryNames = Map.of(
                        "selfie", "自拍", "nude", "裸照", "dick", "狗屌", "other", "其他");

                // 按类别分组
                Map<String, List<Photo>> grouped = photos.stream()
                        .collect(Collectors.groupingBy(Photo::getPhotoCategory, LinkedHashMap::new, Collectors.toList()));

                // 按固定顺序输出
                float maxWidth = document.getPageSize().getWidth() - document.leftMargin() - document.rightMargin();

                for (String cat : categoryOrder) {
                    List<Photo> group = grouped.get(cat);
                    if (group == null || group.isEmpty()) continue;

                    // 类别标题
                    String catName = categoryNames.getOrDefault(cat, cat);
                    Paragraph catTitle = new Paragraph("【" + catName + "】", labelFont);
                    catTitle.setSpacingBefore(8);
                    catTitle.setSpacingAfter(5);
                    document.add(catTitle);

                    // 照片
                    for (Photo photo : group) {
                        if (photo.getPhotoData() == null || photo.getPhotoData().length == 0) continue;

                        Image img = Image.getInstance(photo.getPhotoData());
                        // 按页面宽度等比缩放
                        if (img.getWidth() > maxWidth) {
                            float scale = maxWidth / img.getWidth();
                            img.scaleAbsolute(maxWidth, img.getHeight() * scale);
                        }
                        img.setAlignment(Element.ALIGN_CENTER);
                        Paragraph imgParagraph = new Paragraph();
                        imgParagraph.add(img);
                        imgParagraph.setSpacingAfter(8);
                        document.add(imgParagraph);
                    }
                }
            }

            // ===== 自评部分 =====
            List<AssessmentLeft> leftList = assessmentLeftMapper.selectList(
                    new QueryWrapper<AssessmentLeft>()
                            .eq("submission_id", submissionId)
                            .orderByAsc("row_order"));

            List<AssessmentRight> rightList = assessmentRightMapper.selectList(
                    new QueryWrapper<AssessmentRight>()
                            .eq("submission_id", submissionId)
                            .orderByAsc("row_order"));

            if (!leftList.isEmpty() || !rightList.isEmpty()) {
                Paragraph section3 = new Paragraph("三、接受程度自评", sectionFont);
                section3.setSpacingBefore(15);
                section3.setSpacingAfter(10);
                document.add(section3);

                // 级别说明
                Paragraph levelNote = new Paragraph("A=超级喜欢 B=喜欢 C=不喜欢但接受 D=强迫才接受 E=绝对不接受", valueFont);
                levelNote.setSpacingAfter(8);
                document.add(levelNote);

                // 合并左右自评，按 typeName 分组
                List<Object[]> allRows = new ArrayList<>();
                for (AssessmentLeft r : leftList) allRows.add(new Object[]{r.getTypeName(), r.getItemName(), r.getLevel(), r.getRemark()});
                for (AssessmentRight r : rightList) allRows.add(new Object[]{r.getTypeName(), r.getItemName(), r.getLevel(), r.getRemark()});

                // 按 typeName 保持顺序分组（LinkedHashMap 保持插入顺序）
                Map<String, List<Object[]>> grouped = new LinkedHashMap<>();
                for (Object[] row : allRows) {
                    String type = (String) row[0];
                    grouped.computeIfAbsent(type, k -> new ArrayList<>()).add(row);
                }

                PdfPTable table = new PdfPTable(3);
                table.setWidthPercentage(100);
                table.setWidths(new float[]{3, 1, 3});

                // 表头
                for (String h : new String[]{"项目", "级别", "备注"}) {
                    PdfPCell cell = new PdfPCell(new Phrase(h, tableHeaderFont));
                    cell.setBackgroundColor(new Color(79, 140, 255));
                    cell.setPadding(6);
                    cell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    table.addCell(cell);
                }

                // 按分组输出：每组前加一行分组标题（跨3列）
                for (Map.Entry<String, List<Object[]>> entry : grouped.entrySet()) {
                    // 分组标题行
                    PdfPCell groupCell = new PdfPCell(new Phrase(entry.getKey(), labelFont));
                    groupCell.setColspan(3);
                    groupCell.setBackgroundColor(new Color(235, 240, 255));
                    groupCell.setPadding(5);
                    table.addCell(groupCell);

                    // 数据行
                    for (Object[] row : entry.getValue()) {
                        addAssessmentRow(table, (String) row[1], (String) row[2], (String) row[3], tableCellFont);
                    }
                }

                document.add(table);
            }

            document.close();
            log.info("PDF 生成完成：submissionId={}", submissionId);

        } catch (Exception e) {
            log.error("PDF 生成失败：submissionId={}", submissionId, e);
            throw new RuntimeException("PDF 生成失败", e);
        }

        return bos;
    }

    /**
     * 添加自评表格行（3列：项目、级别、备注）
     */
    private void addAssessmentRow(PdfPTable table, String itemName, String level, String remark, Font font) {
        PdfPCell c1 = new PdfPCell(new Phrase(safeStr(itemName), font));
        c1.setPadding(5);
        table.addCell(c1);

        PdfPCell c2 = new PdfPCell(new Phrase(safeStr(level), font));
        c2.setPadding(5);
        c2.setHorizontalAlignment(Element.ALIGN_CENTER);
        if ("A".equals(level)) c2.setBackgroundColor(new Color(220, 255, 220));
        else if ("B".equals(level)) c2.setBackgroundColor(new Color(220, 235, 255));
        else if ("C".equals(level)) c2.setBackgroundColor(new Color(255, 245, 220));
        else if ("D".equals(level)) c2.setBackgroundColor(new Color(255, 230, 230));
        else if ("E".equals(level)) c2.setBackgroundColor(new Color(240, 240, 240));
        table.addCell(c2);

        PdfPCell c3 = new PdfPCell(new Phrase(safeStr(remark), font));
        c3.setPadding(5);
        table.addCell(c3);
    }

    /**
     * 根据操作系统选择合适的 Unicode CJK 字体
     *
     * STSong-Light 仅支持 GB2312，遇到 Unicode 字符会 ArrayIndexOutOfBoundsException。
     * 按系统选择对应的 Unicode 字体，每个系统提供主备两个选项。
     */
    private BaseFont createCjkBaseFont() {
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] candidates;
        if (os.contains("mac")) {
            candidates = new String[]{"STHeiti", "PingFang SC", "Hiragino Sans GB"};
        } else if (os.contains("linux")) {
            candidates = new String[]{"WenQuanYi Micro Hei", "Noto Sans CJK SC", "Droid Sans Fallback"};
        } else {
            // Windows
            candidates = new String[]{"SimSun", "Microsoft YaHei", "KaiTi"};
        }
        for (String name : candidates) {
            try {
                return BaseFont.createFont(name, "UniGB-UCS2-H", BaseFont.NOT_EMBEDDED);
            } catch (Exception ignored) {
                // 字体不存在，尝试下一个
            }
        }
        // 兜底：所有候选都失败时回退 STSong-Light（可能再次报错，但至少有明确日志）
        log.warn("未找到可用的 Unicode CJK 字体，回退到 STSong-Light");
        try {
            return BaseFont.createFont("STSong-Light", "UniGB-UCS2-H", BaseFont.NOT_EMBEDDED);
        } catch (Exception e) {
            throw new RuntimeException("无法加载任何中文字体", e);
        }
    }

    /**
     * 安全字符串转换，null 返回空字符串，并过滤 OpenPDF 无法处理的 Unicode 增补平面字符（emoji 等）
     */
    private String safeStr(String s) {
        if (s == null) return "";
        // OpenPDF CJKFont 宽度表仅 16 位（65536），SMP 字符（U+10000+）会越界
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            int cp = s.codePointAt(i);
            if (cp <= 0xFFFF) {
                sb.appendCodePoint(cp);
            }
            // SMP 字符（cp > 0xFFFF）直接跳过
            if (Character.isSupplementaryCodePoint(cp)) i++; // 跳过 surrogate pair 的第二个 char
        }
        return sb.toString();
    }
}
