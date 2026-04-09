<!--
  管理员详情页

  职责：展示单个提交的完整详情，包括基础信息、照片展示、自评表格。
  对应路由：/admin/detail/:id
  提供导出 PDF 按钮。手机端自适应布局。
-->
<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-[1100px] mx-auto px-4 sm:px-5 py-6 sm:py-8">
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
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <div v-for="photo in getPhotosByCategory(category.key)" :key="photo.id"
                    class="aspect-square rounded-lg overflow-hidden border bg-muted/20"
                  >
                    <img
                      :src="getPhotoUrl(photo.id)"
                      :alt="photo.photoName"
                      class="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                      @click="previewPhoto(photo.id)"
                    />
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
            <!-- 桌面端：表格 -->
            <div class="hidden md:block space-y-6">
              <div>
                <h4 class="text-sm font-semibold mb-2 text-primary">左侧栏</h4>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b bg-muted/50">
                        <th class="text-left p-2">类型</th>
                        <th class="text-left p-2">项目</th>
                        <th class="text-center p-2">级别</th>
                        <th class="text-left p-2">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in detail.assessmentLeft" :key="row.id" class="border-b last:border-0">
                        <td class="p-2 font-medium text-primary">{{ row.typeName }}</td>
                        <td class="p-2">{{ row.itemName }}</td>
                        <td class="p-2 text-center">
                          <Badge :class="levelBadgeClass(row.level)">{{ row.level || '—' }}</Badge>
                        </td>
                        <td class="p-2 text-muted-foreground">{{ row.remark || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h4 class="text-sm font-semibold mb-2 text-primary">右侧栏</h4>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b bg-muted/50">
                        <th class="text-left p-2">类型</th>
                        <th class="text-left p-2">项目</th>
                        <th class="text-center p-2">级别</th>
                        <th class="text-left p-2">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in detail.assessmentRight" :key="row.id" class="border-b last:border-0">
                        <td class="p-2 font-medium text-primary">{{ row.typeName }}</td>
                        <td class="p-2">{{ row.itemName }}</td>
                        <td class="p-2 text-center">
                          <Badge :class="levelBadgeClass(row.level)">{{ row.level || '—' }}</Badge>
                        </td>
                        <td class="p-2 text-muted-foreground">{{ row.remark || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- 移动端：卡片列表 -->
            <div class="md:hidden space-y-6">
              <div>
                <h4 class="text-sm font-semibold mb-2 text-primary">左侧栏</h4>
                <div class="space-y-2">
                  <div v-for="row in detail.assessmentLeft" :key="row.id" class="p-3 rounded-lg bg-muted/30 border">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm font-medium">{{ row.itemName }}</span>
                      <Badge :class="levelBadgeClass(row.level)" class="text-xs">{{ row.level || '—' }}</Badge>
                    </div>
                    <div class="text-xs text-muted-foreground">{{ row.typeName }}</div>
                    <div v-if="row.remark" class="text-xs text-muted-foreground mt-1">备注：{{ row.remark }}</div>
                  </div>
                </div>
              </div>
              <div>
                <h4 class="text-sm font-semibold mb-2 text-primary">右侧栏</h4>
                <div class="space-y-2">
                  <div v-for="row in detail.assessmentRight" :key="row.id" class="p-3 rounded-lg bg-muted/30 border">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm font-medium">{{ row.itemName }}</span>
                      <Badge :class="levelBadgeClass(row.level)" class="text-xs">{{ row.level || '—' }}</Badge>
                    </div>
                    <div class="text-xs text-muted-foreground">{{ row.typeName }}</div>
                    <div v-if="row.remark" class="text-xs text-muted-foreground mt-1">备注：{{ row.remark }}</div>
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
        <img v-if="previewPhotoId" :src="getPhotoUrl(previewPhotoId)" class="w-full rounded-lg" />
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSubmissionDetail, exportPdf, getPhotoUrl } from '../../api/admin'
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
  { key: 'selfDescription', label: '自我描述' }
]

onMounted(async () => {
  if (!localStorage.getItem('adminToken')) {
    router.push('/admin')
    return
  }

  try {
    const res = await getSubmissionDetail(route.params.id)
    detail.value = res.data
  } catch {
    router.push('/admin/dashboard')
  } finally {
    loading.value = false
  }
})

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
</script>
