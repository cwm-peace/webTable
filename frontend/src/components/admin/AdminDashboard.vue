<!--
  管理员列表页

  职责：展示所有已完成提交的列表，提供查看详情、导出 PDF 和导出 Excel 的入口。
  对应路由：/admin/dashboard
  窄屏下表格改为卡片列表展示。
-->
<template>
  <div class="min-h-screen bg-background">
    <div class="px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <!-- 顶部导航 -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight">提交管理</h1>
          <p class="text-muted-foreground text-sm mt-1">共 {{ pagination.total }} 条提交记录</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" @click="loadSubmissions()">刷新</Button>
          <Button variant="outline" size="sm" @click="handleExportExcel">导出 Excel</Button>
          <Button variant="ghost" size="sm" @click="handleLogout" class="text-muted-foreground">退出登录</Button>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="text-center py-20 text-muted-foreground">加载中...</div>

      <!-- 空状态 -->
      <Card v-else-if="submissions.length === 0" class="text-center py-16">
        <CardContent>
          <p class="text-muted-foreground">暂无提交记录</p>
        </CardContent>
      </Card>

      <!-- 桌面端：表格展示（md 以上显示） -->
      <Card v-else class="hidden md:block">
        <CardContent class="p-0">
          <table class="w-full">
            <thead>
              <tr class="border-b bg-muted/50">
                <th class="text-left p-3 text-sm font-semibold">ID</th>
                <th class="text-left p-3 text-sm font-semibold">当前步骤</th>
                <th class="text-left p-3 text-sm font-semibold">完成状态</th>
                <th class="text-left p-3 text-sm font-semibold">创建时间</th>
                <th class="text-left p-3 text-sm font-semibold">更新时间</th>
                <th class="text-right p-3 text-sm font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in submissions" :key="item.id" class="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td class="p-3 text-sm">#{{ item.id }}</td>
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
      <div v-if="!loading && submissions.length > 0" class="md:hidden space-y-3">
        <Card v-for="item in submissions" :key="item.id"
          v-motion
          :initial="{ opacity: 0, y: 10 }"
          :enter="{ opacity: 1, y: 0 }"
        >
          <CardContent class="py-4">
            <div class="flex items-center justify-between mb-3">
              <span class="font-semibold">#{{ item.id }}</span>
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

      <!-- 分页控制 -->
      <div v-if="!loading && pagination.total > 0" class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
        <div class="text-muted-foreground">
          第 {{ pagination.page }} / {{ pagination.totalPages }} 页，每页
          <select
            v-model.number="pagination.pageSize"
            class="mx-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
            @change="changePageSize"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          条
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button variant="outline" size="sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">上一页</Button>
          <Button variant="outline" size="sm" :disabled="pagination.page >= pagination.totalPages" @click="changePage(pagination.page + 1)">下一页</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 管理员列表页逻辑
 *
 * 加载所有提交记录，展示在表格或卡片列表中。
 * 未登录时自动跳转到登录页。
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSubmissionList, exportPdf, adminLogout } from '../../api/admin'
import { exportAll } from '../../api/export'
import { clearAdminToken } from '../../lib/adminAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const router = useRouter()
const submissions = ref([])
const loading = ref(true)
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1
})

onMounted(async () => {
  await loadSubmissions()
})

/**
 * 加载提交列表
 */
async function loadSubmissions(page = pagination.value.page) {
  loading.value = true
  try {
    const res = await getSubmissionList(page, pagination.value.pageSize)
    const data = res.data || {}
    submissions.value = data.records || []
    pagination.value = {
      page: data.page || page,
      pageSize: data.pageSize || pagination.value.pageSize,
      total: data.total || 0,
      totalPages: Math.max(data.totalPages || 1, 1)
    }
  } catch (error) {
    console.error('加载提交列表失败：', error)
  } finally {
    loading.value = false
  }
}

/**
 * 切换页码
 */
async function changePage(page) {
  const nextPage = Math.min(Math.max(page, 1), pagination.value.totalPages)
  await loadSubmissions(nextPage)
}

/**
 * 切换每页数量后回到第一页
 */
async function changePageSize() {
  await loadSubmissions(1)
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
    alert(error.message || 'PDF 导出失败')
  }
}

/**
 * 导出所有已完成提交为 Excel
 */
async function handleExportExcel() {
  try {
    await exportAll()
  } catch (error) {
    console.error('Excel 导出失败：', error)
    alert(error.message || 'Excel 导出失败')
  }
}

/**
 * 退出登录
 */
async function handleLogout() {
  try {
    await adminLogout()
  } catch (error) {
    console.error('退出登录请求失败：', error)
  } finally {
    clearAdminToken()
    router.replace('/admin')
  }
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
