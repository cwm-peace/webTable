# 合成图片测试样本

`progressive.jpg` 是 Pillow 12.3.0 生成的 80×60 RGB 渐变，不含个人资料或相机照片。使用 JPEG 渐进编码（SOF2），用于实际浏览器解码及多扫描标记回归。

重建（需要 Pillow；不在运行应用时生成）：

```python
from PIL import Image
image = Image.new("RGB", (80, 60))
for x in range(80):
    for y in range(60):
        image.putpixel((x, y), (x * 3, y * 4, (x + y) * 2 % 256))
image.save("tests/fixtures/progressive.jpg", quality=85, progressive=True)
```

EXIF 方向、填充标记、截断和厂商尾部数据由测试在内存中添加。
