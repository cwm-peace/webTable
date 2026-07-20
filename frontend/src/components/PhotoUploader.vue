<!--
  照片上传组件（v3 - Tailwind 版）

  职责：单个类别的照片上传和展示组件。
  4 槽位田字格布局，上传后即时展示缩略图。
  照片即时上传到后端（不变），上传完成后更新 store 计数。
-->
<template>
  <Card class="overflow-hidden border-border/70 bg-card/95 shadow-sm">
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
          :ref="el => registerSlot(el, slot)"
          class="group aspect-square rounded-lg overflow-hidden relative border transition-all duration-200"
          :class="photosBySlot[slot] ? 'border-border bg-muted/30' : 'border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'"
        >
          <!-- 已上传：显示缩略图 -->
          <template v-if="photosBySlot[slot]">
            <img
              v-if="blobUrls[photosBySlot[slot].id]"
              :src="blobUrls[photosBySlot[slot].id]"
              :alt="photosBySlot[slot].photoName"
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover"
            />
            <div v-else class="h-full w-full bg-muted/40 px-3 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
              <div v-if="previewLoading[photosBySlot[slot].id]" class="flex flex-col items-center gap-2">
                <div class="h-5 w-5 rounded-full border-2 border-muted border-t-primary animate-spin"></div>
                <span class="text-xs">加载预览</span>
              </div>
              <button
                v-else-if="previewErrors[photosBySlot[slot].id]"
                type="button"
                class="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                @click.stop="loadSlotPreview(slot, true)"
              >
                <RotateCcw class="size-3.5" />
                重试
              </button>
              <button
                v-else
                type="button"
                class="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                @click.stop="loadSlotPreview(slot)"
              >
                <ImageIcon class="size-3.5" />
                预览
              </button>
            </div>
            <Button
              variant="destructive"
              size="icon-sm"
              class="absolute right-2 top-2 h-7 w-7 opacity-95 shadow-sm sm:opacity-0 sm:group-hover:opacity-95"
              :aria-label="`删除${categoryLabel}第${slot}张`"
              :disabled="uploading"
              @click.stop="handleDelete(photosBySlot[slot].id)"
            >
              <Trash2 class="size-3.5" />
            </Button>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-6 opacity-0 transition-opacity sm:group-hover:opacity-100">
              <span class="block truncate text-[11px] text-white/90">{{ photosBySlot[slot].photoName || '已上传照片' }}</span>
            </div>
          </template>

          <!-- 上传中：占位反馈 -->
          <div v-else-if="uploading" class="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/30">
            <div class="h-5 w-5 rounded-full border-2 border-muted border-t-primary animate-spin"></div>
            <span class="text-xs mt-2">处理中</span>
          </div>

          <!-- 未上传：显示上传按钮 -->
          <label v-else class="w-full h-full flex flex-col items-center justify-center cursor-pointer text-muted-foreground">
            <UploadCloud class="size-6" />
            <span class="text-xs mt-1">上传</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" @change="handleFileSelect" class="hidden" />
          </label>
        </div>
      </div>

      <!-- 上传状态 -->
      <div v-if="uploading" class="mt-4 space-y-2 text-sm text-primary">
        <div class="flex items-center justify-between gap-3">
          <span class="truncate">{{ uploadHint }}</span>
          <span class="shrink-0 tabular-nums">{{ uploadProgress }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: uploadProgress + '%' }"></div>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-3 text-sm text-destructive">{{ errorMessage }}</p>
    </CardContent>
  </Card>
</template>

<script setup>
/**
 * 照片上传组件逻辑（v3）
 *
 * 固定 4 个槽位，上传后即时展示缩略图。
 * 下载接口需要 X-Session-Token，img 标签无法携带自定义 header，
 * 因此用 fetch 获取 Blob 后转为 object URL 供 img 使用。
 * 弱网优化：预览按可视区域懒加载，上传前压缩大图并显示进度。
 */
import { ref, reactive, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { ImageIcon, RotateCcw, Trash2, UploadCloud } from 'lucide-vue-next'
import { uploadPhoto, listPhotos, deletePhoto } from '../api/photo'
import { useFormStore } from '../stores/form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const props = defineProps({
  category: { type: String, required: true },
  categoryLabel: { type: String, required: true }
})

const PREVIEW_TIMEOUT_MS = 45000
const UPLOAD_TIMEOUT_MS = 120000
const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_SIDE = 1600
const JPEG_QUALITY = 0.84

const store = useFormStore()
const photos = ref([])
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadHint = ref('上传中')
const errorMessage = ref('')
const previewLoading = reactive({})
const previewErrors = reactive({})
// photoId -> blob object URL，避免重复 fetch
const blobUrls = reactive({})

const slotElements = new Map()
let previewObserver = null

const photosBySlot = computed(() => {
  const slots = {}
  for (const photo of photos.value) {
    const order = Number(photo.photoOrder)
    if (order >= 1 && order <= 4) {
      slots[order] = photo
    }
  }
  return slots
})

// 等 sessionToken 和 submissionId 都就绪后再加载照片
// initForm 是异步的，onMounted 时两者可能还是空值
// 同时监听两者：token 先就绪时 submissionId 可能还为空，反之亦然
watch(
  [() => store.sessionToken, () => store.submissionId],
  ([token, submissionId]) => {
    if (token && submissionId) loadPhotos()
  },
  { immediate: true }
)

onMounted(() => {
  if ('IntersectionObserver' in window) {
    previewObserver = new IntersectionObserver(handlePreviewIntersection, { rootMargin: '160px' })
  }
  observePhotoSlots()
})

onUnmounted(() => {
  previewObserver?.disconnect()
  for (const [id, url] of Object.entries(blobUrls)) {
    if (url) URL.revokeObjectURL(url)
    blobUrls[id] = null
  }
})

function registerSlot(el, slot) {
  if (!el) {
    slotElements.delete(slot)
    return
  }
  el.dataset.photoSlot = String(slot)
  slotElements.set(slot, el)
  observeSlot(slot)
}

function observePhotoSlots() {
  for (let slot = 1; slot <= 4; slot++) {
    observeSlot(slot)
  }
}

function observeSlot(slot) {
  const photo = photosBySlot.value[slot]
  const el = slotElements.get(slot)
  if (!photo || !el || blobUrls[photo.id] || previewLoading[photo.id]) return
  if (previewObserver) {
    previewObserver.observe(el)
  } else {
    loadSlotPreview(slot)
  }
}

function handlePreviewIntersection(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    const slot = Number(entry.target.dataset.photoSlot)
    loadSlotPreview(slot)
    previewObserver?.unobserve(entry.target)
  }
}

async function loadPhotos() {
  if (!store.submissionId) return
  try {
    const res = await listPhotos(store.submissionId, props.category)
    photos.value = res.data || []
    store.updatePhotoCount(props.category, photos.value.length)
    errorMessage.value = ''
    await nextTick()
    observePhotoSlots()
  } catch (error) {
    console.error('加载照片列表失败：', error)
    errorMessage.value = error.message || '照片列表加载失败，请稍后重试'
  }
}

function loadSlotPreview(slot, force = false) {
  const photo = photosBySlot.value[slot]
  if (!photo) return
  fetchBlobUrl(photo.id, force)
}

/**
 * 用 fetch 携带鉴权 header 下载照片，转为 blob URL 供 img 使用。
 * 直接从 localStorage 读取 token，与 axios 拦截器保持一致，
 * 避免 store 响应式值在异步时序下读到空值。
 *
 * @param {number} photoId
 * @param {boolean} force 是否忽略已有失败状态强制重试
 */
async function fetchBlobUrl(photoId, force = false) {
  if (!force && (blobUrls[photoId] || previewLoading[photoId])) return
  previewLoading[photoId] = true
  previewErrors[photoId] = ''

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS)

  try {
    const headers = {}
    // 与 axios 拦截器保持一致：直接读 localStorage/sessionStorage
    const sessionToken = (() => {
      try { return localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken') || '' } catch { return '' }
    })()
    if (sessionToken) headers['X-Session-Token'] = sessionToken

    const res = await fetch(`/api/photo/download/${photoId}`, { headers, signal: controller.signal })
    if (!res.ok) {
      console.error('照片下载失败：photoId=', photoId, 'status=', res.status, 'token=', sessionToken ? '已设置' : '为空')
      previewErrors[photoId] = '照片预览加载失败'
      return
    }
    const blob = await res.blob()
    if (blobUrls[photoId]) URL.revokeObjectURL(blobUrls[photoId])
    blobUrls[photoId] = URL.createObjectURL(blob)
  } catch (error) {
    console.error('加载照片预览失败：photoId=', photoId, error)
    previewErrors[photoId] = error.name === 'AbortError' ? '网络较慢，预览已超时' : '照片预览加载失败'
  } finally {
    window.clearTimeout(timeoutId)
    previewLoading[photoId] = false
  }
}

async function handleFileSelect(event) {
  const file = event.target.files[0]
  if (!file) return

  if (photos.value.length >= 4) {
    errorMessage.value = '每个类别最多上传 4 张照片'
    event.target.value = ''
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  uploadHint.value = '准备图片'
  errorMessage.value = ''

  try {
    const prepared = await prepareImageForUpload(file)
    uploadHint.value = prepared.optimized
      ? `已压缩为 ${formatBytes(prepared.file.size)}，正在上传`
      : `正在上传 ${formatBytes(prepared.file.size)}`
    await uploadPhoto(store.submissionId, props.category, prepared.file, {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (progressEvent) => {
        if (!progressEvent.total) return
        uploadProgress.value = Math.min(99, Math.round((progressEvent.loaded * 100) / progressEvent.total))
      }
    })
    uploadProgress.value = 100
    uploadHint.value = '上传完成，正在刷新'
    await loadPhotos()
  } catch (error) {
    console.error('照片上传失败：', error)
    errorMessage.value = error.message || '照片上传失败，请稍后重试'
  } finally {
    uploading.value = false
    event.target.value = ''
  }
}

async function handleDelete(photoId) {
  if (uploading.value) return
  errorMessage.value = ''
  try {
    await deletePhoto(photoId)
    // 释放对应的 blob URL（赋 null 而非 delete，保持 Vue reactive 响应性）
    if (blobUrls[photoId]) {
      URL.revokeObjectURL(blobUrls[photoId])
      blobUrls[photoId] = null
    }
    previewErrors[photoId] = ''
    await loadPhotos()
  } catch (error) {
    console.error('删除照片失败：', error)
    errorMessage.value = error.message || '删除照片失败，请稍后重试'
  }
}

/**
 * 压缩大图后再上传，降低弱网等待时间和后端存储压力。
 * GIF 保留原文件，避免破坏动图帧；压缩失败时回退原文件。
 *
 * @param {File} file 用户选择的图片
 * @returns {Promise<{file: File, optimized: boolean}>} 上传文件和是否已压缩
 */
async function prepareImageForUpload(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < COMPRESS_THRESHOLD_BYTES) {
    return { file, optimized: false }
  }

  try {
    const image = await loadImage(file)
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
    if (scale === 1 && file.size < COMPRESS_THRESHOLD_BYTES * 1.5) {
      return { file, optimized: false }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas)
    if (!blob || blob.size >= file.size) {
      return { file, optimized: false }
    }

    return {
      file: new File([blob], replaceExtension(file.name, 'jpg'), { type: 'image/jpeg', lastModified: Date.now() }),
      optimized: true
    }
  } catch (error) {
    console.error('图片压缩失败，使用原图上传：', error)
    return { file, optimized: false }
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas.toBlob) {
      resolve(null)
      return
    }
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
}

function replaceExtension(name, extension) {
  const baseName = name && name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : (name || 'photo')
  return `${baseName}.${extension}`
}

function formatBytes(bytes) {
  if (!bytes) return '0KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
</script>
