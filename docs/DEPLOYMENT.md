# 静态部署

构建需要Node.js≥22.13：`npm ci && npm run build`。只将`dist/`发布到静态托管或Nginx，站点根目录不提供源码、测试、恢复目录或目录浏览。没有后端进程、数据库账号、Redis或环境密钥。

本机验证使用`npm run serve:static`，默认127.0.0.1:5174；`HOST`和`PORT`可以修改。此脚本只服务静态文件，并为同一资源合并冷缓存压缩请求。长期公开部署优先使用托管平台或Nginx，不以Vite开发服务器代替生产站点。

`deploy/nginx.conf`提供HTTPS、安全头、GET/HEAD限制、缓存和gzip示例。`npm run build`已经预生成`.gz`（级别9）和`.br`（质量11）；将完整`dist/`一次性发布，Nginx若编译了`http_gzip_static_module`，可启用示例中的`gzip_static on`读取gzip旁文件；未编译时使用内置gzip动态压缩，不可直接添加该指令。不要单独更新原文件而留下旧压缩文件。部署者须配置真实域名、实际证书和站点路径，运行`nginx -t`后再启用。Brotli需要另装模块，配置中默认注释。2026-10-17 已对既有 Linux/Nginx 站点执行部署验证，范围见下文。

HTTPS为必需；普通远程HTTP（包括原TCP FRP地址）不提供可靠的Web Crypto安全环境，会阻止摘要校验。可以让FRP服务于有HTTPS的入口，但不再转发API。若使用子路径构建，需设置`WEBTABLE_BASE_PATH`并配置对应静态挂载；2026-10-17 已额外验证 `/bdsm/` 子路径，其他挂载路径仍需独立验收。

应配置CSP同源脚本、字体、Worker，禁止外部连接与嵌入对象；禁用框架嵌入和来源头，禁止地理定位/麦克风/相机接口权限。文件选择由浏览器原生选择器处理。静态资源包含题库，年龄确认不构成题库访问控制。

部署示例关闭访问日志，但平台、CDN、代理和服务商仍可能保存IP与访问记录。实际部署者应核对自己控制的配置；如果他人自行部署，不将其日志或服务器管理直接归为工具作者的义务。当前发布版本不包含统计、远程字体、第三方错误上报或上传SDK。

验证最终域名的CSP、缓存、无API、无上传及无外部请求后再验收。作者自带题库的法律性质尚未形成结论，详见`LEGAL_REVIEW.md`；不得将使用者自行填写、展示或部署直接写成作者的行为。

## 10 Mbps 入口与字体

网页界面使用访问者设备上的系统字体。Linux 主机只提供静态文件；在该主机执行 `fc-cache` 或安装字体包不会使手机、PC浏览器自动取得字体，也不会替代浏览器生成 PDF 所需的字体字节。无需额外安装 Linux 字体包。

PDF 字库仅导出时按同源 URL 加载，内容哈希文件名可缓存一年；更换字库会生成新 URL。Nginx 示例对 `/fonts/` 显式设置 `font/otf`，避免部分系统 `mime.types` 没有 OTF 条目导致 gzip 不生效。Brotli 是额外优化，只有安装并加载对应 Nginx 模块后才启用注释配置；普通 gzip 部署也可使用。

部署后检查真实 HTTPS 地址的字体响应：`Content-Type: font/otf`、gzip 或 br 的 `Content-Encoding`、`Vary: Accept-Encoding` 和一年 `immutable` 缓存；HTML 应保持 `no-cache`。第一次访问以冷缓存验证，第二次普通访问应复用已缓存的内容版本资源。完整构建的字节预算和10 Mbps并发等待估算见 `BANDWIDTH.md`。通用模板不能直接覆盖任意现场配置；部署者须对目标 Linux/Nginx 执行 `nginx -t` 并检查响应。

## 2026-10-17 既有 Linux 站点验收

本次通过用户提供的 SSH 连接更新既有 CentOS Stream 9 / Nginx 1.31.6 站点。采用 `WEBTABLE_BASE_PATH=/bdsm/ npm run build`，发布到独立目录，逐文件校验后平滑重载。原静态目录、配置备份与回滚脚本保留；新发布目录同时保留旧哈希脚本及旧字体，避免已经打开的标签页在延迟导出时遇到资源404。只有静态构建进入发布目录。

现场二进制没有 `http_gzip_static_module` 或 Brotli 模块，因此实际服务使用内置动态 gzip 级别6；`.gz`/`.br`旁文件并未被当作线上已生效的优化。补齐 `font/otf` 映射后，压缩字库公网响应实测5,879,355字节，解压后SHA-256与本地一致。HTML重新验证，哈希脚本与版本化字库长期缓存，304响应通过检查。配置保持证书与ACME续期入口，关闭新访问日志，既有日志不删除。

公网 Chromium/WebKit 在隔离上下文中完成合成渐进JPG导入、损坏图失败后保留原图、PDF生成、16附件取回和下载后草稿保留验证。未验证移动真机或Firefox。机器结果见 `verification/deployment-20261017.json`；具体服务器路径、备份和回滚命令保存在本机忽略目录 `artifacts/webtable-20261017-160826/DEPLOYMENT.md`。

## 同日加固后的部署方式

实际站点随后迁移到经官方签名验证的Nginx稳定版1.30.6，配置由`/etc/nginx/nginx.conf`和systemd管理；启用`gzip_static`直接发送构建旁文件，TLS使用发行版动态库，ACME重载改为`systemctl reload nginx`。Brotli仍未启用。上文“动态gzip、无gzip_static”的描述保留为迁移前记录。站点静态目录与证书/HTTP验证路径不变，回滚和具体服务器信息见本机忽略目录`artifacts/hardening-20261017/`。

## 2026-11-01 照片修复发布

发布代码 `49ae8f4` 包含此前线上 `42071ba` 的完整界面与流程。本次按 `/bdsm/` 构建，在服务器校验29个新文件并保留41个旧资源；只替换现有配置中的WebTable发布根目录，不覆盖相邻站点、证书、安全头和日志设置。原配置和静态目录已备份，配置校验与平滑重载成功。本机/公网双引擎照片与PDF验收、TLS、内容摘要、gzip及304检查通过。证据见 [deployment-20261101.json](verification/deployment-20261101.json)，私有路径与回滚命令保存在忽略目录 `artifacts/release-20261101/DEPLOYMENT.md`。
