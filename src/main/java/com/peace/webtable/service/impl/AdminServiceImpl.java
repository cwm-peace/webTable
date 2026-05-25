package com.peace.webtable.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.itextpdf.io.image.ImageDataFactory;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Image;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.peace.webtable.config.AdminConfig;
import com.peace.webtable.dto.ApiResponse;
import com.peace.webtable.entity.*;
import com.peace.webtable.mapper.*;
import com.peace.webtable.service.AdminService;
import com.peace.webtable.util.RedisUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.*;
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

    /** 自评级别对应的文字说明 */
    private static final Map<String, String> LEVEL_TEXT = Map.of(
            "A", "A 超级喜欢",
            "B", "B 喜欢",
            "C", "C 不喜欢但接受",
            "D", "D 强迫才接受",
            "E", "E 绝对不接受"
    );

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
     * 使用 iText7 生成 PDF 文件，包含：
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
            PdfWriter writer = new PdfWriter(bos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document document = new Document(pdfDoc, PageSize.A4);
            document.setMargins(36, 36, 36, 36);

            // 创建 CJK 字体，注册 emoji 字体作为回退
            PdfFont baseFont = createCjkFont();

            // ===== 标题 =====
            document.add(new Paragraph("个人信息收集表")
                    .setFont(baseFont).setFontSize(18).setBold()
                    .setTextAlignment(TextAlignment.CENTER)
                    .setMarginBottom(20));

            // ===== 基础信息 =====
            PersonalInfo info = personalInfoMapper.selectOne(
                    new QueryWrapper<PersonalInfo>().eq("submission_id", submissionId));

            if (info != null) {
                document.add(new Paragraph("一、基础信息")
                        .setFont(baseFont).setFontSize(14).setBold()
                        .setMarginTop(10).setMarginBottom(10));

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

                SolidBorder cellBorder = new SolidBorder(new DeviceRgb(200, 200, 200), 0.5f);
                Table infoTable = new Table(new float[]{2, 5}).useAllAvailableWidth();

                for (String[] field : basicFields) {
                    infoTable.addCell(new Cell()
                            .add(new Paragraph(field[0] + "：").setFont(baseFont).setFontSize(10).setBold())
                            .setBackgroundColor(new DeviceRgb(245, 245, 245))
                            .setPadding(6).setBorder(cellBorder));
                    infoTable.addCell(new Cell()
                            .add(new Paragraph(field[1]).setFont(baseFont).setFontSize(10))
                            .setPadding(6).setBorder(cellBorder));
                }
                document.add(infoTable);
            }

            // ===== 照片部分 =====
            List<Photo> photos = photoMapper.selectList(
                    new QueryWrapper<Photo>()
                            .eq("submission_id", submissionId)
                            .orderByAsc("photo_order"));

            if (!photos.isEmpty()) {
                document.add(new Paragraph("二、附图")
                        .setFont(baseFont).setFontSize(14).setBold()
                        .setMarginTop(15).setMarginBottom(10));

                List<String> categoryOrder = List.of("selfie", "nude", "dick", "other");
                Map<String, String> categoryNames = Map.of(
                        "selfie", "自拍", "nude", "裸照", "dick", "狗屌", "other", "其他");

                Map<String, List<Photo>> grouped = photos.stream()
                        .collect(Collectors.groupingBy(Photo::getPhotoCategory, LinkedHashMap::new, Collectors.toList()));

                // 四宫格：每张照片占页面宽度一半，减去间距
                float pageWidth = pdfDoc.getDefaultPageSize().getWidth()
                        - document.getLeftMargin() - document.getRightMargin();
                float cellWidth = (pageWidth - 6) / 2; // 6pt 为两列间距

                for (String cat : categoryOrder) {
                    List<Photo> group = grouped.get(cat);
                    if (group == null || group.isEmpty()) continue;

                    String catName = categoryNames.getOrDefault(cat, cat);
                    document.add(new Paragraph("【" + catName + "】")
                            .setFont(baseFont).setFontSize(10).setBold()
                            .setMarginTop(8).setMarginBottom(5));

                    // 四宫格：2 列 x N 行
                    Table photoGrid = new Table(new float[]{1, 1}).useAllAvailableWidth();
                    photoGrid.setMarginBottom(8);

                    for (int i = 0; i < group.size(); i += 2) {
                        // 左列
                        Cell leftCell = buildPhotoCell(group.get(i), cellWidth);
                        photoGrid.addCell(leftCell);

                        // 右列（可能为空）
                        if (i + 1 < group.size()) {
                            photoGrid.addCell(buildPhotoCell(group.get(i + 1), cellWidth));
                        } else {
                            photoGrid.addCell(new Cell().setBorder(Border.NO_BORDER));
                        }
                    }
                    document.add(photoGrid);
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
                document.add(new Paragraph("三、接受程度自评")
                        .setFont(baseFont).setFontSize(14).setBold()
                        .setMarginTop(15).setMarginBottom(10));

                // 合并左右自评，按 typeName 分组
                List<Object[]> allRows = new ArrayList<>();
                for (AssessmentLeft r : leftList)
                    allRows.add(new Object[]{r.getTypeName(), r.getItemName(), r.getLevel(), r.getRemark()});
                for (AssessmentRight r : rightList)
                    allRows.add(new Object[]{r.getTypeName(), r.getItemName(), r.getLevel(), r.getRemark()});

                Map<String, List<Object[]>> groupedAssess = new LinkedHashMap<>();
                for (Object[] row : allRows) {
                    groupedAssess.computeIfAbsent((String) row[0], k -> new ArrayList<>()).add(row);
                }

                Table table = new Table(new float[]{3, 1, 3}).useAllAvailableWidth();

                // 表头
                for (String h : new String[]{"项目", "级别", "备注"}) {
                    table.addCell(new Cell()
                            .add(new Paragraph(h).setFont(baseFont).setFontSize(9).setBold()
                                    .setTextAlignment(TextAlignment.CENTER))
                            .setBackgroundColor(new DeviceRgb(79, 140, 255))
                            .setPadding(6)
                            .setHorizontalAlignment(HorizontalAlignment.CENTER));
                }

                // 按分组输出
                for (Map.Entry<String, List<Object[]>> entry : groupedAssess.entrySet()) {
                    table.addCell(new Cell(1, 3)
                            .add(new Paragraph(entry.getKey()).setFont(baseFont).setFontSize(10).setBold())
                            .setBackgroundColor(new DeviceRgb(235, 240, 255))
                            .setPadding(5));

                    for (Object[] row : entry.getValue()) {
                        addAssessmentRow(table, (String) row[1], (String) row[2], (String) row[3], baseFont);
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
     * 构建四宫格中的单张照片 Cell
     */
    private Cell buildPhotoCell(Photo photo, float cellWidth) {
        if (photo.getPhotoData() == null || photo.getPhotoData().length == 0) {
            return new Cell().setBorder(Border.NO_BORDER);
        }
        Image img = new Image(ImageDataFactory.create(photo.getPhotoData()));
        img.scaleToFit(cellWidth, Float.MAX_VALUE);
        img.setHorizontalAlignment(HorizontalAlignment.CENTER);
        return new Cell()
                .add(img)
                .setPadding(3)
                .setBorder(Border.NO_BORDER);
    }

    /**
     * 添加自评表格行（3列：项目、级别、备注）
     *
     * 级别列显示字母+文字（如 "A 超级喜欢"），并保留颜色编码。
     */
    private void addAssessmentRow(Table table, String itemName, String level, String remark, PdfFont font) {
        table.addCell(new Cell()
                .add(new Paragraph(safeStr(itemName)).setFont(font).setFontSize(9))
                .setPadding(5));

        String levelDisplay = LEVEL_TEXT.getOrDefault(level, safeStr(level));
        DeviceRgb bgColor = switch (level) {
            case "A" -> new DeviceRgb(220, 255, 220);
            case "B" -> new DeviceRgb(220, 235, 255);
            case "C" -> new DeviceRgb(255, 245, 220);
            case "D" -> new DeviceRgb(255, 230, 230);
            case "E" -> new DeviceRgb(240, 240, 240);
            default -> null;
        };
        Cell levelCell = new Cell()
                .add(new Paragraph(levelDisplay).setFont(font).setFontSize(9)
                        .setTextAlignment(TextAlignment.CENTER))
                .setPadding(5);
        if (bgColor != null) levelCell.setBackgroundColor(bgColor);
        table.addCell(levelCell);

        table.addCell(new Cell()
                .add(new Paragraph(safeStr(remark)).setFont(font).setFontSize(9))
                .setPadding(5));
    }

    /**
     * 创建支持 CJK 和 Emoji 的 PdfFont
     *
     * 优先加载内嵌 NotoEmoji-Regular.ttf（支持 SMP U+10000+ 字符），
     * 同时按操作系统加载 CJK 字体作为 fallback。
     * iText7 的 FontProvider 会自动处理字形回退。
     */
    private PdfFont createCjkFont() {
        // 1. 尝试加载内嵌 NotoEmoji TTF（支持完整 Unicode + emoji）
        try {
            PdfFont font = PdfFontFactory.createFont(
                    "fonts/NotoEmoji-Regular.ttf",
                    PdfFontFactory.EmbeddingStrategy.PREFER_EMBEDDED);
            log.info("使用内嵌 NotoEmoji 字体");
            return font;
        } catch (Exception e) {
            log.warn("NotoEmoji 字体加载失败，回退到系统 CJK 字体：{}", e.getMessage());
        }

        // 2. 回退：按操作系统选择 CJK 字体
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] candidates;
        if (os.contains("mac")) {
            candidates = new String[]{
                    "/System/Library/Fonts/STHeiti Light.ttc",
                    "/System/Library/Fonts/PingFang.ttc",
                    "/System/Library/Fonts/Hiragino Sans GB.ttc"};
        } else if (os.contains("linux")) {
            candidates = new String[]{
                    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
                    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"};
        } else {
            candidates = new String[]{
                    "C:/Windows/Fonts/msyh.ttc",
                    "C:/Windows/Fonts/simsun.ttc",
                    "C:/Windows/Fonts/simkai.ttf"};
        }
        for (String path : candidates) {
            try {
                return PdfFontFactory.createFont(path,
                        PdfFontFactory.EmbeddingStrategy.PREFER_NOT_EMBEDDED);
            } catch (Exception ignored) {
            }
        }

        // 3. 最后尝试内置字体名
        log.warn("未找到系统 CJK 字体，尝试 STSong-Light");
        try {
            return PdfFontFactory.createFont("STSong-Light",
                    PdfFontFactory.EmbeddingStrategy.PREFER_NOT_EMBEDDED);
        } catch (Exception e) {
            throw new RuntimeException("无法加载任何中文字体", e);
        }
    }

    /**
     * 安全字符串转换，null 返回空字符串
     */
    private String safeStr(String s) {
        return s != null ? s : "";
    }
}
