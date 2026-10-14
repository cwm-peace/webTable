<!-- 单个本地图片槽：预览URL只存在于组件生命周期，替换和卸载时立即释放。 -->
<script setup>
import { ref, watch, onBeforeUnmount, computed } from "vue";
import { ImagePlus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
const props = defineProps({
  photo: { type: Object, default: null },
  category: { type: String, required: true },
  label: { type: String, required: true },
  slot: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["change"]);
const preview = ref("");
/**
 * 说明这张图片在本机被如何处理：动图取首帧、超限自动缩小或已压缩附件。
 * @returns {string} 没有需要说明的处理时为空串
 */
const notice = computed(() => {
  const photo = props.photo;
  if (!photo) return "";
  const prefix = photo.animated ? "动图已取用第一帧。" : "";
  if (photo.autoShrunk)
    return `${prefix}原图 ${photo.sourceWidth}×${photo.sourceHeight} 超过限制，已自动缩小为 ${photo.width}×${photo.height}，PDF 将使用缩小后的版本。`;
  if (photo.compressed)
    return `${prefix}此图片已生成压缩附件，PDF 将使用压缩版本。`;
  return prefix;
});
/**
 * 释放组件持有的图片地址，防止大图在替换后仍占用内存。
 * @returns {void} 无返回值
 */
function release() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = "";
}
/**
 * 用当前预览Blob创建临时地址，浏览器不支持时保留文字与替换入口。
 * @param {Blob|undefined} blob 本地预览图或原图
 * @returns {void} 无返回值
 */
function setPreview(blob) {
  release();
  if (blob instanceof Blob) preview.value = URL.createObjectURL(blob);
}
/**
 * 将文件交给表单状态处理，重置控件以允许再次选择同一文件。
 * @param {Event} event 文件选择事件
 * @returns {void} 无返回值
 */
function choose(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) emit("change", file);
}
watch(() => props.photo?.previewBlob || props.photo?.blob, setPreview, {
  immediate: true,
});
onBeforeUnmount(release);
</script>
<template>
  <div class="photo-slot" :class="error ? 'photo-slot-error' : ''">
    <div class="photo-preview">
      <img
        v-if="preview"
        :src="preview"
        :alt="`${label}第${slot}张预览`"
        loading="lazy"
      />
      <div v-else class="text-center text-muted-foreground p-4">
        <ImagePlus class="size-7 mx-auto mb-2" aria-hidden="true" />
        <p>{{ photo ? "图片已加入" : `第 ${slot} 张` }}</p>
      </div>
    </div>
    <div class="p-3 space-y-3">
      <label
        :for="`photo-${category}-${slot}`"
        class="text-sm font-medium block"
        >{{ label }}第{{ slot }}张
        <span class="text-muted-foreground">必填</span></label
      >
      <input
        :id="`photo-${category}-${slot}`"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,image/tiff,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff,.svg"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="
          error ? `photo-${category}-${slot}-error` : undefined
        "
        class="photo-file"
        @change="choose"
      />
      <p v-if="photo" class="text-xs text-muted-foreground break-all">
        {{ photo.name || photo.filename || "已选择本地图片" }}
      </p>
      <p v-if="notice" class="notice text-xs">{{ notice }}</p>
      <Button
        v-if="photo"
        variant="outline"
        class="w-full"
        :disabled="disabled"
        :aria-label="`移除${label}第${slot}张`"
        @click="emit('change', null)"
        ><Trash2 class="size-4" aria-hidden="true" />移除图片</Button
      >
      <p
        v-if="error"
        :id="`photo-${category}-${slot}-error`"
        class="text-sm text-destructive"
      >
        {{ error }}
      </p>
    </div>
  </div>
</template>
