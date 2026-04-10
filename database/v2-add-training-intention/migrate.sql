-- ============================================================
-- 迭代 v2：新增"培养意向"字段
-- 变更说明：
--   在 personal_info 表的 remark 列之后新增 training_intention 列。
--   该字段用于记录主人对奴隶的培养方向与意向，TEXT 类型允许较长描述。
--   存量数据默认 NULL，无需回填。
-- ============================================================

ALTER TABLE personal_info
    ADD COLUMN training_intention TEXT COMMENT '培养意向' AFTER remark;
