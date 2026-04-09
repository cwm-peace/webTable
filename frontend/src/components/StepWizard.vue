<!--
  步骤指示器组件（v3 - Tailwind 版）

  职责：显示当前填写进度，提供步骤间的导航。
  v3 变更：去掉步骤内保存按钮，第3步底部出现"保存提交"按钮。
  点击"保存提交"会触发 showPreview 事件，由 App.vue 弹出预览 Dialog。
-->
<template>
  <div>
    <!-- 步骤条 -->
    <div class="flex justify-center items-start mb-10">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="flex flex-col items-center relative flex-1 max-w-[180px] cursor-pointer"
        @click="onStepClick(index + 1)"
      >
        <!-- 步骤圆形 -->
        <div
          class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 relative z-10"
          :class="stepCircleClass(index)"
        >
          <span v-if="formStore.currentStep > index + 1" class="text-base">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </div>

        <!-- 步骤标签 -->
        <div
          class="mt-2 text-sm font-medium transition-colors duration-300"
          :class="stepLabelClass(index)"
        >
          {{ step.label }}
        </div>

        <!-- 连接线 -->
        <div
          v-if="index < steps.length - 1"
          class="absolute top-5 h-0.5 transition-colors duration-300"
          :class="formStore.currentStep > index + 1 ? 'bg-emerald-500' : 'bg-border'"
          :style="{
            left: 'calc(50% + 24px)',
            right: 'calc(-50% + 24px)'
          }"
        ></div>
      </div>
    </div>

    <!-- 步骤内容 -->
    <div
      v-motion
      :key="formStore.currentStep"
      :initial="{ opacity: 0, x: 30 }"
      :enter="{ opacity: 1, x: 0, transition: { duration: 300 } }"
    >
      <slot></slot>
    </div>

    <!-- 导航按钮 -->
    <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mt-8 pt-6 border-t">
      <Button
        v-if="formStore.currentStep > 1"
        variant="outline"
        @click="formStore.prevStep()"
        class="order-2 sm:order-1"
      >
        ← 上一步
      </Button>
      <div v-else class="hidden sm:block"></div>

      <div class="flex gap-3 order-1 sm:order-2">
        <Button
          v-if="formStore.currentStep < 3"
          @click="formStore.nextStep()"
          class="flex-1 sm:flex-none"
        >
          下一步 →
        </Button>
        <Button
          v-if="formStore.currentStep === 3"
          variant="default"
          @click="$emit('showPreview')"
          class="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
        >
          保存提交
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 步骤指示器组件逻辑（v3）
 */
import { useFormStore } from '../stores/form'
import { Button } from '@/components/ui/button'

defineEmits(['showPreview'])

const formStore = useFormStore()

const steps = [
  { label: '基础信息' },
  { label: '附图部分' },
  { label: '接受程度自评' }
]

function stepCircleClass(index) {
  if (formStore.currentStep > index + 1) {
    return 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
  }
  if (formStore.currentStep === index + 1) {
    return 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110'
  }
  return 'bg-muted text-muted-foreground'
}

function stepLabelClass(index) {
  if (formStore.currentStep > index + 1) return 'text-emerald-600'
  if (formStore.currentStep === index + 1) return 'text-primary font-semibold'
  return 'text-muted-foreground'
}

function onStepClick(stepNum) {
  if (stepNum <= formStore.currentStep) {
    formStore.goToStep(stepNum)
  }
}
</script>
