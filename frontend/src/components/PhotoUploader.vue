<!--
  照片上传组件（v3 - Tailwind 版）

  职责：单个类别的照片上传和展示组件。
  4 槽位田字格布局，上传后即时展示缩略图。
  照片即时上传到后端（不变），上传完成后更新 store 计数。
-->
<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="text-base">{{ categoryLabel }}</CardTitle>
        <Badge variant="secondary">{{ photos.length }}/4</Badge>
      </div>
    </CardHeader>
    <CardContent>
      <!-- 4 槽位田字格 -->
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="slot in 4"
          :key="slot"
          class="aspect-square rounded-lg overflow-hidden relative border-2 transition-all duration-200"
          :class="photos[slot - 1] ? 'border-transparent' : 'border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'"
        >
          <!-- 已上传：显示缩略图 -->
          <template v-if="photos[slot - 1]">
            <img
              :src="getPhotoUrl(photos[slot - 1].id)"
              :alt="photos[slot - 1].photoName"
              class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Button variant="destructive" size="sm" @click="handleDelete(photos[slot - 1].id)">
                删除
              </Button>
            </div>
          </template>

          <!-- 未上传：显示上传按钮 -->
          <label v-else class="w-full h-full flex flex-col items-center justify-center cursor-pointer text-muted-foreground">
            <span class="text-2xl font-light">+</span>
            <span class="text-xs mt-1">上传</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" @change="handleFileSelect" class="hidden" :disabled="uploading" />
          </label>
        </div>
      </div>

      <!-- 上传状态 -->
      <div v-if="uploading" class="flex items-center gap-2 mt-3 text-sm text-primary">
        <div class="w-3.5 h-3.5 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
        上传中...
      </div>
    </CardContent>
  </Card>
</template>

<script setup>
/**
 * 照片上传组件逻辑（v3）
 *
 * 固定 4 个槽位，上传后即时展示缩略图。
 */
import { ref, onMounted } from 'vue'
import { uploadPhoto, listPhotos, deletePhoto, getPhotoUrl } from '../api/photo'
import { useFormStore } from '../stores/form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const props = defineProps({
  category: { type: String, required: true },
  categoryLabel: { type: String, required: true }
})

const store = useFormStore()
const photos = ref([])
const uploading = ref(false)

onMounted(async () => {
  await loadPhotos()
})

async function loadPhotos() {
  if (!store.submissionId) return
  try {
    const res = await listPhotos(store.submissionId, props.category)
    photos.value = res.data || []
    store.updatePhotoCount(props.category, photos.value.length)
  } catch (error) {
    console.error('加载照片列表失败：', error)
  }
}

async function handleFileSelect(event) {
  const file = event.target.files[0]
  if (!file) return

  if (photos.value.length >= 4) {
    alert('每个类别最多上传 4 张照片')
    event.target.value = ''
    return
  }

  uploading.value = true
  try {
    await uploadPhoto(store.submissionId, props.category, file)
    await loadPhotos()
  } catch (error) {
    console.error('照片上传失败：', error)
  } finally {
    uploading.value = false
    event.target.value = ''
  }
}

async function handleDelete(photoId) {
  try {
    await deletePhoto(photoId)
    await loadPhotos()
  } catch (error) {
    console.error('删除照片失败：', error)
  }
}
</script>
