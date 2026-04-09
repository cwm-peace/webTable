<!--
  第2步：附图部分组件（v3 - Tailwind 版）

  职责：展示 4 个照片类别的上传区域。
  照片即时上传到后端（这个不变），上传后更新 store 中的计数。
-->
<template>
  <div>
    <div class="mb-6"
      v-motion
      :initial="{ opacity: 0, y: 20 }"
      :enter="{ opacity: 1, y: 0, transition: { duration: 400 } }"
    >
      <h2 class="text-2xl font-bold tracking-tight">附图部分</h2>
      <p class="text-muted-foreground mt-1">每个类别最多上传 4 张照片</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <PhotoUploader
        v-for="(cat, index) in categories"
        :key="cat.key"
        :category="cat.key"
        :category-label="cat.label"
        v-motion
        :initial="{ opacity: 0, y: 30 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: (index + 1) * 100 } }"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * 第2步：附图部分组件逻辑（v3）
 */
import PhotoUploader from './PhotoUploader.vue'

const categories = [
  { key: 'selfie', label: '自拍' },
  { key: 'nude', label: '裸照' },
  { key: 'dick', label: '狗屌' },
  { key: 'other', label: '其他' }
]
</script>
