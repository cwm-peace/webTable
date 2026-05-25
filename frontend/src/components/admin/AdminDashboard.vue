<!--
  管理员列表页

  职责：展示所有提交的列表，提供筛选、查看详情和导出 PDF 的入口。
  对应路由：/admin/dashboard
  筛选维度：当前步骤、完成状态、名字模糊匹配。
  窄屏下表格改为卡片列表展示。
-->
<template>
  <div class="min-h-screen bg-background">
    <div class="px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <!-- 顶部导航 -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight">提交管理</h1>
          <p class="text-muted-foreground text-sm mt-1">共 {{ filteredSubmissions.length }} 条记录</p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="loadSubmissions">刷新</Button>
          <Button variant="ghost" size="sm" @click="handleLogout" class="text-muted-foreground">退出登录</Button>
        </div>
      </div>

      <!-- 筛选栏 -->
      <Card class="mb-6">
        <CardContent class="py-4">
          <div class="flex flex-col sm:flex-row gap-3">
            <!-- 名字搜索 -->
            <div class="flex-1">
              <Input v-model="filters.name" placeholder="搜索名字..." class="h-9" />
            </div>
            <!-- 步骤筛选 -->
            <select
              v-model="filters.step"
              class="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">全部步骤</option>
              <option value="1">第1步</option>
              <option value="2">第2步</option>
              <option value="3">第3步</option>
            </select>
            <!-- 完成状态筛选 -->
            <select
              v-model="filters.completed"
              class="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">全部状态</option>
              <option value="true">已完成</option>
              <option value="false">未完成</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <!-- 加载状态 -->
      <div v-if="loading" class="text-center py-20 text-muted-foreground">加载中...</div>

      <!-- 空状态 -->
      <Card v-else-if="filteredSubmissions.length === 0" class="text-center py-16">
        <CardContent>
          <p class="text-muted-foreground">{{ submissions.length === 0 ? '暂无提交记录' : '没有匹配的记录' }}</p>
        </CardContent>
      </Card>

      <!-- 有数据时：桌面端表格 + 移动端卡片 -->
      <template v-else>
        <!-- 桌面端：表格展示（md 以上显示） -->
        <Card class="hidden md:block">
          <CardContent class="p-0">
            <table class="w-full">
              <thead>
                <tr class="border-b bg-muted/50">
                  <th class="text-left p-3 text-sm font-semibold">名字</th>
                  <th class="text-left p-3 text-sm font-semibold">当前步骤</th>
                  <th class="text-left p-3 text-sm font-semibold">完成状态</th>
                  <th class="text-left p-3 text-sm font-semibold">创建时间</th>
                  <th class="text-left p-3 text-sm font-semibold">更新时间</th>
                  <th class="text-right p-3 text-sm font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredSubmissions" :key="item.id" class="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td class="p-3 text-sm font-medium">{{ item.name || '未填写' }}</td>
                  <td class="p-3 text-sm">第{{ item.currentStep }}步</td>
                  <td class="p-3">
                    <Badge :variant="item.completed ? 'default' : 'secondary'">
                      {{ item.completed ? '已完成' : '未完成' }}
                    </Badge>
                  </td>
                  <td class="p-3 text-sm text-muted-foreground">{{ formatDate(item.createTime) }}</td>
                  <td class="p-3 text-sm text-muted-foreground">{{ formatDate(item.updateTime) }}</td>
                  <td class="p-3 text-right">
                    <div class="flex justify-end gap-2">
                      <Button variant="outline" size="sm" @click="goToDetail(item.id)">查看详情</Button>
                      <Button variant="outline" size="sm" @click="handleExportPdf(item.id)">导出 PDF</Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <!-- 移动端：卡片列表（md 以下显示） -->
        <div class="md:hidden space-y-3">
          <Card v-for="item in filteredSubmissions" :key="item.id"
            v-motion
            :initial="{ opacity: 0, y: 10 }"
            :enter="{ opacity: 1, y: 0 }"
          >
            <CardContent class="py-4">
              <div class="flex items-center justify-between mb-3">
                <span class="font-semibold">{{ item.name || '未填写' }}</span>
                <Badge :variant="item.completed ? 'default' : 'secondary'">
                  {{ item.completed ? '已完成' : '未完成' }}
                </Badge>
              </div>
              <div class="text-sm text-muted-foreground space-y-1 mb-3">
                <div>步骤：第{{ item.currentStep }}步</div>
                <div>创建：{{ formatDate(item.createTime) }}</div>
                <div>更新：{{ formatDate(item.updateTime) }}</div>
              </div>
              <div class="flex gap-2">
                <Button variant="outline" class="flex-1 h-11 text-sm" @click="goToDetail(item.id)">查看详情</Button>
                <Button variant="outline" class="flex-1 h-11 text-sm" @click="handleExportPdf(item.id)">导出 PDF</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * 管理员列表页逻辑
 *
 * 加载所有提交记录，支持按名字、步骤、完成状态筛选。
 * 未登录时自动跳转到登录页。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSubmissionList, exportPdf } from '../../api/admin'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const router = useRouter()
const submissions = ref([])
const loading = ref(true)

const filters = reactive({
  name: '',
  step: '',
  completed: ''
})

/** 筛选后的列表 */
const filteredSubmissions = computed(() => {
  return submissions.value.filter(item => {
    // 名字模糊匹配
    if (filters.name && !(item.name || '').toLowerCase().includes(filters.name.toLowerCase())) {
      return false
    }
    // 步骤筛选
    if (filters.step && String(item.currentStep) !== filters.step) {
      return false
    }
    // 完成状态筛选
    if (filters.completed !== '' && String(item.completed) !== filters.completed) {
      return false
    }
    return true
  })
})

onMounted(async () => {
  if (!localStorage.getItem('adminToken')) {
    router.push('/admin')
    return
  }
  await loadSubmissions()
})

/**
 * 加载提交列表
 */
async function loadSubmissions() {
  loading.value = true
  try {
    const res = await getSubmissionList()
    submissions.value = res.data || []
  } catch {
    localStorage.removeItem('adminToken')
    router.push('/admin')
  } finally {
    loading.value = false
  }
}

/**
 * 跳转到详情页
 */
function goToDetail(id) {
  router.push(`/admin/detail/${id}`)
}

/**
 * 导出 PDF
 */
async function handleExportPdf(id) {
  try {
    await exportPdf(id)
  } catch (error) {
    console.error('PDF 导出失败：', error)
  }
}

/**
 * 退出登录
 */
function handleLogout() {
  localStorage.removeItem('adminToken')
  router.push('/admin')
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN')
}
</script>
