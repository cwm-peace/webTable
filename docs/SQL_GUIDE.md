# SQL 脚本说明

本文档说明数据库初始化、存量升级和脚本维护方式。完整表结构和模板数据以 `src/main/resources/schema.sql` 为准。

## 1. 数据库对象

系统包含 7 张业务表：

| 表名 | 用途 |
|---|---|
| `submissions` | 提交主表，记录会话、当前步骤、完成状态和时间 |
| `personal_info` | 第 1 步基础信息，一次提交对应一条基础信息 |
| `photos` | 第 2 步附图，按提交和类别存储照片元信息与二进制数据 |
| `assessment_left` | 第 3 步左侧自评数据 |
| `assessment_right` | 第 3 步右侧自评数据 |
| `assessment_left_template` | 左侧自评模板，共 65 条 |
| `assessment_right_template` | 右侧自评模板，共 60 条 |

## 2. 新库初始化

新环境执行：

```bash
mysql -u root -p < src/main/resources/schema.sql
```

该脚本会：

- 创建 `webtable` 数据库。
- 创建全部 7 张业务表。
- 初始化左侧 65 条、右侧 60 条自评模板。
- 创建管理员列表分页索引 `idx_completed_create_id`。
- 创建照片槽位唯一索引 `uk_submission_category_order`。

初始化后可用预检脚本验证表结构和模板数量：

```bash
scripts/preflight-check.sh
```

## 3. 存量升级顺序

如果数据库来自旧版本，请按版本顺序执行迁移脚本：

```bash
mysql -u webtable -p webtable < database/v2-add-training-intention/migrate.sql
mysql -u webtable -p webtable < database/v3-photo-upload-constraints/migrate.sql
mysql -u webtable -p webtable < database/v4-admin-list-pagination/migrate.sql
```

迁移说明：

| 版本 | 脚本 | 作用 |
|---|---|---|
| v2 | `database/v2-add-training-intention/migrate.sql` | 给 `personal_info` 新增 `training_intention` 字段 |
| v3 | `database/v3-photo-upload-constraints/migrate.sql` | 将照片字段升级为 `LONGBLOB`，重排历史照片槽位，增加槽位唯一索引 |
| v4 | `database/v4-admin-list-pagination/migrate.sql` | 给 `submissions` 增加 `(completed, create_time, id)` 分页索引 |

执行迁移前建议先备份数据库。

## 4. 备份建议

```bash
mysqldump -u root -p --single-transaction --routines --triggers webtable > backup-webtable-$(date +%Y%m%d_%H%M%S).sql
```

照片以二进制形式存储在 MySQL 中，备份文件可能较大。生产环境建议保留至少一个最近可恢复备份，并定期做恢复演练。

## 5. 字符集与排序规则

数据库和表默认使用：

```sql
DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
```

该设置用于支持中文和常见多字节字符。PDF 导出会过滤 emoji 等 Unicode 增补平面字符，避免 OpenPDF CJK 字体宽度异常。

## 6. 索引说明

| 索引 | 表 | 用途 |
|---|---|---|
| `submissions.session_token` unique | `submissions` | 填写会话查找 |
| `idx_completed_create_id` | `submissions` | 管理员已完成提交列表分页 |
| `personal_info.submission_id` unique | `personal_info` | 一次提交只保留一条基础信息 |
| `photos.idx_submission_id` | `photos` | 按提交查询照片 |
| `uk_submission_category_order` | `photos` | 防止同提交同类别并发产生重复照片槽位 |
| `assessment_left.idx_submission_id` | `assessment_left` | 按提交查询左侧自评 |
| `assessment_right.idx_submission_id` | `assessment_right` | 按提交查询右侧自评 |

## 7. 数据权限建议

应用账号只需要业务库权限。推荐权限：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON webtable.* TO 'webtable'@'%';
```

如果数据库结构已经初始化完成，生产运行期可以收窄为：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON webtable.* TO 'webtable'@'%';
```

迁移或初始化时再临时授予 `CREATE`、`ALTER`、`INDEX`。
