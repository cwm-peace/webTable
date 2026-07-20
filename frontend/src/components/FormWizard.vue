<!--
  填写向导页面（从 App.vue 拆分）

  职责：管理三步向导的整体布局和步骤切换逻辑。
  对应路由：/
-->
<template>
  <div class="form-shell min-h-screen">
    <div class="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <!-- 顶部标题 -->
      <header class="mb-6 sm:mb-8 overflow-hidden rounded-lg border bg-card shadow-sm"
        v-motion
        :initial="{ opacity: 0, y: -20 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 500 } }"
      >
        <div class="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p class="text-xs font-semibold uppercase text-muted-foreground">Personal Information Form</p>
            <h1 class="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">奴测-v3.0-Release</h1>
            <p class="text-muted-foreground mt-2 text-sm sm:text-base">认真详实地填写相关信息，当前草稿会自动保存。</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center sm:min-w-80">
            <div class="rounded-md border bg-muted/30 px-3 py-2">
              <div class="text-lg font-semibold">3</div>
              <div class="text-xs text-muted-foreground">步骤</div>
            </div>
            <div class="rounded-md border bg-muted/30 px-3 py-2">
              <div class="text-lg font-semibold">16</div>
              <div class="text-xs text-muted-foreground">照片上限</div>
            </div>
            <div class="rounded-md border bg-muted/30 px-3 py-2">
              <div class="text-lg font-semibold">自动</div>
              <div class="text-xs text-muted-foreground">草稿</div>
            </div>
          </div>
        </div>
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
        </CardContent>
      </Card>

      <!-- 向导步骤 -->
      <Card v-else class="border-border/70 shadow-sm">
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
import { Card, CardContent } from '@/components/ui/card'
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
</script>

<style scoped>
.form-shell {
  background: #f8fafc;
  background: linear-gradient(180deg, color-mix(in srgb, var(--muted) 52%, var(--background)), var(--background) 18rem);
}

@supports not (background: color-mix(in srgb, white 50%, black)) {
  .form-shell {
    background: linear-gradient(180deg, #f8fafc, #ffffff 18rem);
  }
}
</style>
