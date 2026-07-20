<!--
  管理员详情页

  职责：展示单个提交的完整详情，包括基础信息、照片展示、自评表格。
  对应路由：/admin/detail/:id
  提供导出 PDF 按钮。手机端自适应布局。
-->
<template>
  <div class="min-h-screen bg-background">
    <div class="px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <!-- 顶部导航 -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="sm" @click="router.push('/admin/dashboard')">← 返回列表</Button>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight">提交详情 #{{ route.params.id }}</h1>
        </div>
        <Button @click="handleExportPdf" class="w-full sm:w-auto">
          导出 PDF
        </Button>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="text-center py-20 text-muted-foreground">加载中...</div>

      <template v-else-if="detail">
        <!-- 基础信息 -->
        <Card class="mb-6"
          v-motion
          :initial="{ opacity: 0, y: 20 }"
          :enter="{ opacity: 1, y: 0 }"
        >
          <CardHeader>
            <CardTitle class="text-base">基础信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <div v-for="field in infoFields" :key="field.key" class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 p-2 rounded-lg bg-muted/30">
                <span class="text-sm font-medium text-muted-foreground sm:w-32 sm:flex-shrink-0">{{ field.label }}</span>
                <span class="text-sm">{{ getFieldValue(field.key) || '—' }}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 照片展示 -->
        <Card class="mb-6"
          v-motion
          :initial="{ opacity: 0, y: 20 }"
          :enter="{ opacity: 1, y: 0, transition: { delay: 100 } }"
        >
          <CardHeader>
            <CardTitle class="text-base">附图</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="detail.photos && detail.photos.length > 0">
              <div v-for="category in photoCategories" :key="category.key" class="mb-6 last:mb-0">
                <h4 class="text-sm font-semibold mb-3">{{ category.label }}</h4>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  <div v-for="photo in getPhotosByCategory(category.key)" :key="photo.id"
                    class="aspect-square rounded-lg overflow-hidden border bg-muted/20"
                  >
                    <img
                      v-if="blobUrls[photo.id]"
                      :src="blobUrls[photo.id]"
                      :alt="photo.photoName"
                      class="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                      @click="previewPhoto(photo.id)"
                    />
                    <div v-else class="w-full h-full flex items-center justify-center text-xs text-muted-foreground">加载中</div>
                  </div>
                </div>
              </div>
              <div v-if="detail.photos.length === 0" class="text-muted-foreground text-sm">暂无照片</div>
            </div>
            <div v-else class="text-muted-foreground text-sm">暂无照片</div>
          </CardContent>
        </Card>

        <!-- 自评表格 -->
        <Card
          v-motion
          :initial="{ opacity: 0, y: 20 }"
          :enter="{ opacity: 1, y: 0, transition: { delay: 200 } }"
        >
          <CardHeader>
            <CardTitle class="text-base">接受程度自评</CardTitle>
          </CardHeader>
          <CardContent>
            <!-- 桌面端：分组表格 -->
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b bg-muted/50">
                    <th class="text-left p-2 w-24">项目</th>
                    <th class="text-center p-2 w-14">级别</th>
                    <th class="text-left p-2">备注</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="group in assessmentGroups" :key="group.typeName">
                    <!-- 分组标题行 -->
                    <tr class="bg-muted/30">
                      <td colspan="3" class="px-2 py-1 text-xs font-semibold text-primary">{{ group.typeName }}</td>
                    </tr>
                    <!-- 数据行 -->
                    <tr v-for="row in group.items" :key="row.id" class="border-b last:border-0 hover:bg-muted/20">
                      <td class="p-2">{{ row.itemName }}</td>
                      <td class="p-2 text-center">
                        <Badge :class="levelBadgeClass(row.level)">{{ row.level || '—' }}</Badge>
                      </td>
                      <td class="p-2 text-muted-foreground">{{ row.remark || '' }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- 移动端：分组卡片 -->
            <div class="md:hidden space-y-4">
              <div v-for="group in assessmentGroups" :key="group.typeName">
                <div class="text-xs font-semibold text-primary mb-1.5 px-1">{{ group.typeName }}</div>
                <div class="space-y-1.5">
                  <div v-for="row in group.items" :key="row.id" class="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border">
                    <span class="text-sm">{{ row.itemName }}</span>
                    <div class="flex items-center gap-2 shrink-0">
                      <span v-if="row.remark" class="text-xs text-muted-foreground">{{ row.remark }}</span>
                      <Badge :class="levelBadgeClass(row.level)" class="text-xs">{{ row.level || '—' }}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>
    </div>

    <!-- 照片预览弹窗 -->
    <Dialog v-model:open="photoPreviewOpen">
      <DialogContent class="sm:max-w-[800px]">
        <img v-if="previewPhotoId && blobUrls[previewPhotoId]" :src="blobUrls[previewPhotoId]" class="w-full rounded-lg" />
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
/**
 * 管理员详情页逻辑
 *
 * 加载单个提交的完整数据，展示基础信息、照片、自评。
 * 提供 PDF 导出和照片预览功能。
 */
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSubmissionDetail, exportPdf } from '../../api/admin'
import { getAdminToken, handleAdminUnauthorized, hasAdminToken } from '../../lib/adminAuth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'

const route = useRoute()
const router = useRouter()
const detail = ref(null)
const loading = ref(true)
const photoPreviewOpen = ref(false)
const previewPhotoId = ref(null)

// photoId -> blob object URL，管理端用 X-Admin-Token 鉴权
const blobUrls = reactive({})

const photoCategories = [
  { key: 'selfie', label: '自拍' },
  { key: 'nude', label: '裸照' },
  { key: 'dick', label: '狗屌' },
  { key: 'other', label: '其他' }
]

const infoFields = [
  { key: 'name', label: '名字' },
  { key: 'height', label: '身高' },
  { key: 'weight', label: '体重' },
  { key: 'education', label: '学历' },
  { key: 'occupation', label: '职业' },
  { key: 'shoeSize', label: '鞋码' },
  { key: 'province', label: '所在省' },
  { key: 'city', label: '所在市' },
  { key: 'qq', label: 'QQ' },
  { key: 'wechat', label: '微信' },
  { key: 'weibo', label: '微博' },
  { key: 'phone', label: '电话' },
  { key: 'isSingle', label: '是否单身' },
  { key: 'dogAge', label: '犬龄' },
  { key: 'preferredName', label: '喜欢的称呼' },
  { key: 'selfDescription', label: '自我描述' },
  { key: 'remark', label: '备注' },
  { key: 'trainingIntention', label: '培养意向' }
]

onMounted(async () => {
  try {
    const res = await getSubmissionDetail(route.params.id)
    detail.value = res.data
    // 预取所有照片的 blob URL
    if (res.data && res.data.photos) {
      for (const photo of res.data.photos) {
        fetchBlobUrl(photo.id)
      }
    }
  } catch (error) {
    console.error('加载提交详情失败：', error)
    if (hasAdminToken()) {
      router.push('/admin/dashboard')
    }
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  for (const [id, url] of Object.entries(blobUrls)) {
    if (url) URL.revokeObjectURL(url)
    blobUrls[id] = null
  }
})

/**
 * 用 fetch 携带 X-Admin-Token 下载照片，转为 blob URL 供 img 使用。
 */
async function fetchBlobUrl(photoId) {
  try {
    const adminToken = getAdminToken()
    if (!adminToken) return
    const res = await fetch(`/api/photo/download/${photoId}`, {
      headers: { 'X-Admin-Token': adminToken }
    })
    if (res.status === 401 || res.status === 403) {
      handleAdminUnauthorized()
      return
    }
    if (!res.ok) return
    const blob = await res.blob()
    blobUrls[photoId] = URL.createObjectURL(blob)
  } catch (error) {
    console.error('加载照片预览失败：photoId=', photoId, error)
  }
}

function getFieldValue(key) {
  if (!detail.value || !detail.value.personalInfo) return ''
  const val = detail.value.personalInfo[key]
  // 身高体重添加单位
  if (key === 'height' && val) return val + 'cm'
  if (key === 'weight' && val) return val + 'kg'
  return val
}

function getPhotosByCategory(category) {
  if (!detail.value || !detail.value.photos) return []
  return detail.value.photos.filter(p => p.photoCategory === category)
}

function previewPhoto(photoId) {
  previewPhotoId.value = photoId
  photoPreviewOpen.value = true
}

async function handleExportPdf() {
  try {
    await exportPdf(route.params.id)
  } catch (error) {
    console.error('PDF 导出失败：', error)
    alert(error.message || 'PDF 导出失败')
  }
}

function levelBadgeClass(level) {
  const map = {
    A: 'bg-emerald-500 hover:bg-emerald-500',
    B: 'bg-blue-500 hover:bg-blue-500',
    C: 'bg-amber-500 hover:bg-amber-500',
    D: 'bg-red-400 hover:bg-red-400'
  }
  return map[level] || ''
}

/**
 * 将左右两栏自评数据合并，按 typeName 分组
 * 顺序：先左栏各组，再右栏各组
 */
const assessmentGroups = computed(() => {
  if (!detail.value) return []
  const all = [
    ...(detail.value.assessmentLeft || []),
    ...(detail.value.assessmentRight || [])
  ]
  const map = new Map()
  for (const row of all) {
    if (!map.has(row.typeName)) map.set(row.typeName, [])
    map.get(row.typeName).push(row)
  }
  return Array.from(map.entries()).map(([typeName, items]) => ({ typeName, items }))
})
</script>
