<!--
  填写向导页面（从 App.vue 拆分）

  职责：管理三步向导的整体布局和步骤切换逻辑。
  对应路由：/
-->
<template>
  <div class="min-h-screen bg-background">
    <div class="px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <!-- 顶部标题 -->
      <header class="text-center mb-6 sm:mb-8"
        v-motion
        :initial="{ opacity: 0, y: -20 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 500 } }"
      >
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">奴测-v3.0-Release</h1>
        <p class="text-muted-foreground mt-2 text-sm sm:text-base">认真详实的填写相关信息,相关数据完全本地存储</p>
      </header>

      <!-- 加载状态 -->
      <Card v-if="formStore.loading" class="text-center py-20">
        <CardContent>
          <div class="w-10 h-10 border-3 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p class="text-muted-foreground">正在加载...</p>
        </CardContent>
      </Card>

      <!-- 已完成状态 -->
      <Card v-else-if="formStore.completed" class="text-center py-12 sm:py-16 max-w-xl lg:mx-auto"
        v-motion
        :initial="{ opacity: 0, scale: 0.95 }"
        :enter="{ opacity: 1, scale: 1, transition: { duration: 400 } }"
      >
        <CardContent>
          <div class="w-16 h-16 rounded-full bg-emerald-500 text-white text-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/30">
            ✓
          </div>
          <h2 class="text-xl sm:text-2xl font-bold text-emerald-600 mb-2">提交成功</h2>
          <p class="text-muted-foreground mb-6">感谢您的认真填写！</p>
          <Button variant="outline" @click="handleExport">导出 Excel</Button>
        </CardContent>
      </Card>

      <!-- 向导步骤 -->
      <Card v-else>
        <CardContent class="pt-4 sm:pt-6">
          <StepWizard @showPreview="showPreview = true">
            <Step1BasicInfo v-if="formStore.currentStep === 1" :key="1" />
            <Step2Photos v-else-if="formStore.currentStep === 2" :key="2" />
            <Step3Assessment v-else-if="formStore.currentStep === 3" :key="3" />
          </StepWizard>
        </CardContent>
      </Card>

    </div>

    <!-- 预览弹窗 -->
    <PreviewDialog v-model:open="showPreview" />
  </div>
</template>

<script setup>
/**
 * 填写向导页面逻辑
 */
import { ref, onMounted } from 'vue'
import { useFormStore } from '../stores/form'
import { exportAll } from '../api/export'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StepWizard from './StepWizard.vue'
import Step1BasicInfo from './Step1BasicInfo.vue'
import Step2Photos from './Step2Photos.vue'
import Step3Assessment from './Step3Assessment.vue'
import PreviewDialog from './PreviewDialog.vue'

const formStore = useFormStore()
const showPreview = ref(false)

onMounted(async () => {
  await formStore.initForm()
})

async function handleExport() {
  try {
    await exportAll()
  } catch (error) {
    console.error('导出失败：', error)
  }
}
</script>
