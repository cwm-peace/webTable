# 部署指南

本文档说明 WebTable 在本机、局域网和生产环境中的部署方式。部署前请先阅读 `README.md` 中的安全配置，并确认管理员密码、数据库密码和 CORS 来源都已按实际环境设置。

## 1. 环境要求

| 组件 | 要求 | 说明 |
|---|---|---|
| JDK | 21 | 后端基于 Spring Boot 3.5.13 |
| MySQL | 8.0+ | 使用 `utf8mb4` 字符集，照片二进制字段为 `LONGBLOB` |
| Redis | 6+ | 存储填写会话、草稿缓存、管理员 token 和限流计数 |
| Node.js | 18+ | 构建 Vue/Vite 前端 |
| npm | 随 Node.js 安装 | 安装和构建前端依赖 |

## 2. 数据库准备

新环境初始化时执行完整建表脚本：

```bash
mysql -u root -p < src/main/resources/schema.sql
```

推荐创建独立数据库账号，不要使用 root 账号运行应用：

```sql
CREATE USER IF NOT EXISTS 'webtable'@'%' IDENTIFIED BY 'replace-with-strong-db-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON webtable.* TO 'webtable'@'%';
FLUSH PRIVILEGES;
```

存量环境请按版本顺序执行迁移脚本，详见 `docs/SQL_GUIDE.md`。

## 3. 必需环境变量

后端不内置生产密码。启动前至少设置：

```bash
export WEBTABLE_DB_URL='jdbc:mysql://127.0.0.1:3306/webtable?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true'
export WEBTABLE_DB_USERNAME='webtable'
export WEBTABLE_DB_PASSWORD='replace-with-strong-db-password'
export WEBTABLE_ADMIN_PASSWORD='replace-with-strong-admin-password'
```

可选安全与限流配置：

```bash
export WEBTABLE_ADMIN_LOGIN_MAX_FAILURES='5'
export WEBTABLE_ADMIN_LOGIN_FAILURE_WINDOW_MINUTES='15'
export WEBTABLE_ADMIN_LOGIN_LOCK_MINUTES='15'
export WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_ENABLED='true'
export WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_MAX_REQUESTS='20'
export WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_WINDOW_MINUTES='10'
export WEBTABLE_PDF_MAX_PHOTO_BYTES='104857600'
```

`WEBTABLE_ADMIN_PASSWORD` 必须不少于 12 位，且不能使用默认弱密码；否则后端会拒绝启动。
`WEBTABLE_PDF_MAX_PHOTO_BYTES` 用于限制单次 PDF 导出可嵌入的照片总字节数，默认 100MB；照片总量超限时接口返回 HTTP 413，管理员可引导填写者压缩照片后重新提交。

## 4. 联调前置检查

运行预检脚本：

```bash
scripts/preflight-check.sh
```

预检会检查 Java、Node.js、Maven Wrapper、必要环境变量、Redis、MySQL、7 张业务表、左右自评模板数量和 8081/5173 端口占用。预检失败时不要继续部署，先按输出修复环境。

## 5. 后端构建与启动

构建：

```bash
./mvnw clean package
```

开发运行：

```bash
./mvnw spring-boot:run
```

生产运行 jar：

```bash
java -jar target/webTable-0.0.1-SNAPSHOT.jar
```

默认端口为 `8081`。如果需要更改端口，可设置 Spring Boot 参数：

```bash
java -jar target/webTable-0.0.1-SNAPSHOT.jar --server.port=8081
```

## 6. 前端构建与部署

安装依赖并构建：

```bash
cd frontend
npm install
npm run build
```

构建产物位于 `frontend/dist/`。生产环境建议由 Nginx 或其他 Web 服务器托管静态文件，并把 `/api/` 反向代理到后端 `8081`。

## 7. Nginx 示例

以下示例假设前端部署在 `/var/www/webtable`，后端运行在 `127.0.0.1:8081`：

```nginx
server {
    listen 80;
    server_name form.example.com;

    root /var/www/webtable;
    index index.html;

    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://127.0.0.1:8081/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

如果使用 HTTPS，建议在网关或 Nginx 层配置 TLS 证书，并只对外暴露 HTTPS。

## 8. 跨端访问配置

手机、平板、安卓、iOS、鸿蒙设备通过浏览器访问时，前端来源必须加入 CORS 白名单。示例：

```yaml
app:
  cors:
    allowed-origin-patterns: http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.10:5173,https://form.example.com
```

生产域名部署时，建议只保留正式 HTTPS 域名和必要的内网调试来源。

## 9. 生产检查清单

- `WEBTABLE_ADMIN_PASSWORD` 已设置为强密码。
- `WEBTABLE_DB_PASSWORD` 已设置，应用不使用 root 数据库账号。
- `scripts/preflight-check.sh` 通过或仅有已确认的非阻断警告。
- `app.cors.allowed-origin-patterns` 只包含可信前端来源。
- Redis 和 MySQL 不直接暴露到公网。
- Nginx 或网关已限制上传大小至少 50MB。
- `WEBTABLE_PDF_MAX_PHOTO_BYTES` 已按服务器内存和业务需要设置，默认 100MB。
- 后端日志中不打印完整 session token 或管理员 token。
- 已执行 `./mvnw test` 和 `npm run build`。

## 10. 常见排障

| 现象 | 排查方向 |
|---|---|
| 后端启动失败，提示管理员密码未配置 | 设置 `WEBTABLE_ADMIN_PASSWORD`，且长度至少 12 位 |
| 后端启动失败，数据库连接异常 | 检查 `WEBTABLE_DB_URL`、账号、密码、MySQL 服务和防火墙 |
| 管理端登录后很快失效 | 检查 Redis 是否稳定，管理员 token 存储在 Redis 中 |
| 手机无法访问 API | 检查前端来源是否在 CORS 白名单中，确认设备能访问后端或网关 |
| 上传照片失败 | 检查文件格式、大小、Nginx `client_max_body_size` 和后端 50MB 限制 |
| PDF 导出提示照片总量超过上限 | 压缩或减少该提交照片，或在确认服务器内存充足后调整 `WEBTABLE_PDF_MAX_PHOTO_BYTES` |
| 管理端看不到记录 | 只有最终提交后的数据会出现在管理端列表和详情中 |
