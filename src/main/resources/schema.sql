-- ============================================================
-- 个人信息收集系统 - 数据库建表脚本（根据范本重构）
-- 数据库：webtable
-- ============================================================

CREATE DATABASE IF NOT EXISTS webtable DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webtable;

-- 主表：每次提交创建一条记录
CREATE TABLE IF NOT EXISTS submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    session_token VARCHAR(64) NOT NULL UNIQUE COMMENT '会话令牌，关联浏览器会话',
    current_step INT NOT NULL DEFAULT 1 COMMENT '当前步骤：1-基础信息 2-附图 3-接受程度自评',
    completed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已完成：0-未完成 1-已完成',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_session_token (session_token),
    INDEX idx_completed (completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提交主表';

-- 第1步：基础信息（一个人一条记录，包含范本中所有基础字段）
CREATE TABLE IF NOT EXISTS personal_info (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    submission_id BIGINT NOT NULL UNIQUE COMMENT '关联的提交ID（一人一条）',
    name VARCHAR(100) COMMENT '名字',
    height VARCHAR(20) COMMENT '身高cm',
    weight VARCHAR(20) COMMENT '体重kg',
    education VARCHAR(50) COMMENT '学历',
    occupation VARCHAR(100) COMMENT '职业',
    shoe_size VARCHAR(20) COMMENT '鞋码EU',
    province VARCHAR(50) COMMENT '所在地(省)',
    city VARCHAR(50) COMMENT '所在地(市)',
    qq VARCHAR(30) COMMENT 'QQ号',
    wechat VARCHAR(50) COMMENT '微信号',
    weibo VARCHAR(50) COMMENT '微博名',
    phone VARCHAR(20) COMMENT '电话号码',
    first_masturbation_age VARCHAR(20) COMMENT '第一次自慰年龄',
    first_sex_age VARCHAR(20) COMMENT '破处年龄',
    is_single VARCHAR(10) COMMENT '是否单身',
    cheated_on_partner VARCHAR(10) COMMENT '是否绿过伴侣',
    been_cheated VARCHAR(10) COMMENT '是否被伴侣绿过',
    longest_lock_time VARCHAR(50) COMMENT '最长带锁时间',
    sex_frequency VARCHAR(50) COMMENT '做爱频率',
    masturbation_frequency VARCHAR(50) COMMENT '自慰频率',
    masturbation_tool VARCHAR(100) COMMENT '自慰工具',
    anal_insertable_size VARCHAR(50) COMMENT '菊穴可完全插入尺寸(直径*长度cm)',
    urethra_insertable_size VARCHAR(50) COMMENT '尿道可完全插入尺寸(直径*长度cm)',
    dog_age VARCHAR(50) COMMENT '犬龄(做犬的时间)',
    meeting_count VARCHAR(20) COMMENT '约调次数',
    master_count VARCHAR(20) COMMENT '侍主人数',
    semen_volume VARCHAR(20) COMMENT '精液量ml',
    daily_max_ejaculation VARCHAR(20) COMMENT '每日最高射精次数',
    preferred_name VARCHAR(100) COMMENT '喜欢被叫的称呼',
    self_description VARCHAR(500) COMMENT '一句话形容自己',
    remark TEXT COMMENT '备注',
    training_intention TEXT COMMENT '培养意向',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_submission_id (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='基础信息表（第1步）';

-- 第2步：附图（多张照片，分类存储）
CREATE TABLE IF NOT EXISTS photos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    submission_id BIGINT NOT NULL COMMENT '关联的提交ID',
    photo_category VARCHAR(50) COMMENT '照片类别：selfie-自拍 nude-裸照 dick-狗屌 other-其他',
    photo_order INT NOT NULL DEFAULT 0 COMMENT '同类别内的排序号',
    photo_data MEDIUMBLOB COMMENT '照片二进制数据',
    photo_name VARCHAR(255) COMMENT '照片原始文件名',
    photo_type VARCHAR(100) COMMENT '照片 MIME 类型',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_submission_id (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='附图表（第2步）';

-- 第3步：接受程度自评（左侧栏：性奴/玩偶奴/家奴等）
CREATE TABLE IF NOT EXISTS assessment_left (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    submission_id BIGINT NOT NULL COMMENT '关联的提交ID',
    type_name VARCHAR(50) COMMENT '类型（性奴、狗奴、玩偶奴、家奴等）',
    item_name VARCHAR(100) COMMENT '项目名称',
    level VARCHAR(10) COMMENT '级别：A-超级喜欢 B-喜欢 C-不喜欢但接受 D-强迫才接受 E-绝对不接受',
    remark VARCHAR(500) COMMENT '备注',
    row_order INT NOT NULL DEFAULT 0 COMMENT '行排序号',
    INDEX idx_submission_id (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='接受程度自评-左侧栏';

-- 第3步：接受程度自评（右侧栏：刑奴/脚厕奴/野奴暴露奴等）
CREATE TABLE IF NOT EXISTS assessment_right (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    submission_id BIGINT NOT NULL COMMENT '关联的提交ID',
    type_name VARCHAR(50) COMMENT '类型（刑奴、脚厕奴、野奴暴露奴等）',
    item_name VARCHAR(100) COMMENT '项目名称',
    level VARCHAR(10) COMMENT '级别：A/B/C/D/E',
    remark VARCHAR(500) COMMENT '备注',
    row_order INT NOT NULL DEFAULT 0 COMMENT '行排序号',
    INDEX idx_submission_id (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='接受程度自评-右侧栏';

-- ============================================================
-- 评估项目预设模板（从范本文件提取，不关联 submission_id）
-- 新用户创建提交时，前端根据模板初始化表格行
-- ============================================================

-- 左侧栏预设模板
CREATE TABLE IF NOT EXISTS assessment_left_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    type_name VARCHAR(50) COMMENT '类型名称',
    item_name VARCHAR(100) COMMENT '项目名称',
    row_order INT NOT NULL DEFAULT 0 COMMENT '行排序号'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='左侧栏评估项目模板';

-- 右侧栏预设模板
CREATE TABLE IF NOT EXISTS assessment_right_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    type_name VARCHAR(50) COMMENT '类型名称',
    item_name VARCHAR(100) COMMENT '项目名称',
    row_order INT NOT NULL DEFAULT 0 COMMENT '行排序号'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='右侧栏评估项目模板';

-- ============================================================
-- 初始化左侧栏预设数据（从范本文件提取）
-- ============================================================
INSERT INTO assessment_left_template (type_name, item_name, row_order) VALUES
('性奴(淫奴)', '强奸', 1),
('性奴(淫奴)', '轮奸', 2),
('性奴(淫奴)', '口爆', 3),
('性奴(淫奴)', '颜射', 4),
('性奴(淫奴)', '控制高潮', 5),
('性奴(淫奴)', '拒绝高潮', 6),
('性奴(淫奴)', '无套内射', 7),
('性奴(淫奴)', '器具折磨', 8),
('性奴(淫奴)', '强制射精', 9),
('性奴(淫奴)', '禁欲贞操锁', 10),
('性奴(淫奴)', '潮吹失禁', 11),
('性奴(淫奴)', '扩肛', 12),
('性奴(淫奴)', '扩尿道', 13),
('性奴(淫奴)', '炮机/木马', 14),
('狗奴', '狗姿', 15),
('狗奴', '狗笼', 16),
('狗奴', '项圈镣铐', 17),
('狗奴', '嗅觉调教', 18),
('狗奴', '嘴巴叨、咬训练', 19),
('狗奴', '狗盆吃喝', 20),
('狗奴', '圈禁饲养', 21),
('狗奴', '爬行', 22),
('狗奴', '钻裆', 23),
('狗奴', '舔足', 24),
('狗奴', '踩踏', 25),
('狗奴', '狗装(头套、尾巴)', 26),
('狗奴', '遛玩/骑行', 27),
('玩偶奴/性玩具', '乳胶衣/床', 28),
('玩偶奴/性玩具', '制服诱惑', 29),
('玩偶奴/性玩具', '乳环', 30),
('玩偶奴/性玩具', 'Pa环', 31),
('玩偶奴/性玩具', '肛环', 32),
('玩偶奴/性玩具', '龟头折磨', 33),
('玩偶奴/性玩具', '睾丸折磨', 34),
('玩偶奴/性玩具', '肛塞', 35),
('玩偶奴/性玩具', '身上写字(不洗)', 36),
('玩偶奴/性玩具', '身上写字(可洗)', 37),
('玩偶奴/性玩具', '剃毛', 38),
('玩偶奴/性玩具', '性工具玩弄', 39),
('玩偶奴/性玩具', '固定桌椅', 40),
('玩偶奴/性玩具', '导尿', 41),
('玩偶奴/性玩具', '灌肠(温和液体)', 42),
('玩偶奴/性玩具', '灌肠(刺激液体)', 43),
('玩偶奴/性玩具', '拍照/录像(露脸)', 44),
('玩偶奴/性玩具', '拍照/录像(不露脸)', 45),
('家奴', '长期圈养', 46),
('家奴', '短期圈养', 47),
('家奴', '多奴调教', 48),
('家奴', '多主调教', 49),
('家奴', '生人旁观', 50),
('家奴', '熟人旁观', 51),
('家奴', '生人侮辱', 52),
('家奴', '熟人侮辱', 53),
('家奴', '剥夺睡眠', 54),
('家奴', '催眠', 55),
('其他', '语言侮辱', 56),
('其他', '人格侮辱', 57),
('其他', '思维控制', 58),
('其他', '网络控制', 59),
('其他', '网络公调', 60),
('其他', '长期带锁', 61),
('其他', '跳蛋', 62),
('其他', '办公室调教', 63),
('其他', '狭小空间禁锢', 64),
('其他', '纹身/烙印', 65);

-- ============================================================
-- 初始化右侧栏预设数据（从范本文件提取）
-- ============================================================
INSERT INTO assessment_right_template (type_name, item_name, row_order) VALUES
('刑奴', '耳光', 1),
('刑奴', '藤条抽打', 2),
('刑奴', '鞭打', 3),
('刑奴', '木板拍打', 4),
('刑奴', '毛刷', 5),
('刑奴', '拳交', 6),
('刑奴', '口塞', 7),
('刑奴', '拉扯头发', 8),
('刑奴', '罚跪', 9),
('刑奴', '吊缚', 10),
('刑奴', '拘束/捆绑', 11),
('刑奴', '室息', 12),
('刑奴', '乳夹', 13),
('刑奴', '乳头承重', 14),
('刑奴', '阴茎夹子', 15),
('刑奴', '阴囊夹子', 16),
('刑奴', '阴茎吊重物', 17),
('刑奴', '阴囊吊重物', 18),
('刑奴', '鞭打阳具', 19),
('刑奴', '踢裆', 20),
('刑奴', '瘙痒', 21),
('刑奴', '电击', 22),
('刑奴', '滴蜡', 23),
('刑奴', '针刺', 24),
('刑奴', '穿孔', 25),
('刑奴', '体罚', 26),
('刑奴', '木乃伊', 27),
('刑奴', '舔脚', 28),
('刑奴', '喝洗脚水', 29),
('刑奴', '吃脚踩食物', 30),
('刑奴', '闻舔鞋袜', 31),
('脚厕奴', '舔精', 32),
('脚厕奴', '吞精', 33),
('脚厕奴', '喝尿', 34),
('脚厕奴', '尿浴(尿身上可以)', 35),
('脚厕奴', '舔肛', 36),
('脚厕奴', '唾液', 37),
('脚厕奴', '伺候排便', 38),
('脚厕奴', '伺候放尿', 39),
('脚厕奴', '人体马桶', 40),
('脚厕奴', '人体小便器', 41),
('脚厕奴', '马桶刷', 42),
('脚厕奴', '脏内裤', 43),
('脚厕奴', '公厕', 44),
('野奴暴露奴', '野外暴露', 45),
('野奴暴露奴', '野外奴役', 46),
('野奴暴露奴', '野外流放', 47),
('野奴暴露奴', '野外玩弄', 48),
('野奴暴露奴', '公共场合暴露', 49),
('野奴暴露奴', '公共场合捆绑', 50),
('野奴暴露奴', '公共场合器具', 51),
('野奴暴露奴', '公共场合玩弄', 52),
('野奴暴露奴', '露阳(生人)', 53),
('野奴暴露奴', '露阳(熟人)', 54),
('野奴暴露奴', '裸奔', 55),
('兽奴', '兽交', 56),
('兽奴', '群兽轮交', 57),
('兽奴', '人兽同交', 58),
('兽奴', '兽虐', 59),
('兽奴', '昆虫爬身', 60);
