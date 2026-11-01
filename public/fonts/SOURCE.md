# PDF 字体来源与构建

当前发布字体：`WebTableSansSC-Regular-c5b729f69005.otf`。这是从 Noto Sans SC Regular 派生的本机 PDF 字库，网页界面继续使用访问者设备上的系统字体。

- 官方源仓库：`notofonts/noto-cjk`。
- 固定提交：`f8d157532fbfaeda587e826d4cd5b21a49186f7c`。
- 原文件：<https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf>。
- 原文件大小：8,331,336 字节；SHA-256：`faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9`。
- 衍生文件大小：6,935,324 字节；SHA-256：`c5b729f69005f2cf0da1790c93b11ff565ed8308caa4734698b24c4ea7c589d6`。
- 工具：FontTools 4.60.1；保留全部 30,890 个 Unicode 码位及排版特性，去掉 hinting 与不可达字形。2026-10-17 逐码位核对字形轮廓和水平度量均与源字体相同；屏幕栅格化时不再使用原 hinting 指令。
- 衍生字体名：WebTable Sans SC Regular；不改变原字体版权和许可。
- 许可：随附 `OFL.txt`（SIL Open Font License 1.1）；许可文件 SHA-256：`6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`。

普通 `npm ci` / `npm run build` 直接使用已提交字库，不需要 Python。仅重新制作字库时，在独立虚拟环境安装 `fonttools==4.60.1`，从上述固定地址取得原文件，再执行：

```bash
python scripts/prepare-pdf-font.py /path/to/NotoSansSC-Regular.otf public/fonts
```

脚本先检查源文件摘要，再检查全部字符覆盖和水平度量；新输出文件名含 SHA-256 前 12 位。若输出版本改变，同步 `src/lib/pdfFont.js` 并重新验证 PDF。

字库随站点同源发布，仅在生成 PDF 时加载；构建时另生成 `.gz` 和 `.br`，浏览器按协商下载一个表示，字体 URL 使用长期缓存。PDF 仍嵌入完整字库，避免运行时 CFF 子集问题；原字体无法表示的字符（如 emoji）用 □ 代替并列出码位，草稿原文不变。
