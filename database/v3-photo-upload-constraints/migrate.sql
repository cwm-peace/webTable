-- ============================================================
-- 迭代 v3：照片上传约束与容量修正
-- 变更说明：
--   1. 将 photos.photo_data 从 MEDIUMBLOB 调整为 LONGBLOB，匹配 50MB 上传限制。
--   2. 按 submission_id + photo_category 重排历史 photo_order，避免旧重复槽位阻塞唯一索引。
--   3. 增加 (submission_id, photo_category, photo_order) 唯一索引，防止并发上传产生重复槽位。
-- 注意：重排行号使用 MySQL 8 窗口函数，不删除任何历史照片。
-- ============================================================

ALTER TABLE photos
    MODIFY COLUMN photo_data LONGBLOB COMMENT '照片二进制数据';

UPDATE photos p
JOIN (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY submission_id, photo_category
            ORDER BY photo_order, create_time, id
        ) AS new_photo_order
    FROM photos
) ordered ON p.id = ordered.id
SET p.photo_order = ordered.new_photo_order;

ALTER TABLE photos
    ADD UNIQUE KEY uk_submission_category_order (submission_id, photo_category, photo_order);
