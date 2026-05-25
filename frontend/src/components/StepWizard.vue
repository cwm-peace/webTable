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
          class="mt-2 text-xs sm:text-sm font-medium transition-colors duration-300"
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
      <div class="flex items-center gap-2 order-3 sm:order-1">
        <Button
          v-if="formStore.currentStep > 1"
          variant="outline"
          @click="handlePrev"
          :disabled="formStore.saving"
          class="h-11 sm:h-9"
        >
          ← 上一步
        </Button>

        <!-- 自动保存状态指示 -->
        <span class="text-xs text-muted-foreground ml-2" v-if="formStore.autoSaveStatus === 'saving'">
          <span class="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full mr-1 animate-pulse"></span>
          保存中...
        </span>
        <span class="text-xs text-muted-foreground ml-2" v-else-if="formStore.autoSaveStatus === 'saved'">
          <span class="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1"></span>
          已保存
        </span>
        <span class="text-xs text-destructive ml-2" v-else-if="formStore.autoSaveStatus === 'error'">
          <span class="inline-block w-1.5 h-1.5 bg-destructive rounded-full mr-1"></span>
          保存失败
        </span>
      </div>

      <div class="flex gap-3 order-1 sm:order-2">
        <Button
          v-if="formStore.currentStep < 3"
          @click="handleNext"
          :disabled="formStore.saving"
          class="flex-1 sm:flex-none h-11 sm:h-9"
        >
          {{ formStore.saving ? '保存中...' : '下一步 →' }}
        </Button>
        <Button
          v-if="formStore.currentStep === 3"
          variant="default"
          @click="handlePreview"
          :disabled="formStore.saving"
          class="flex-1 sm:flex-none h-11 sm:h-9 bg-emerald-600 hover:bg-emerald-700"
        >
          {{ formStore.saving ? '保存中...' : '保存提交' }}
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

const emit = defineEmits(['showPreview'])

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

async function handlePrev() {
  await formStore.prevStep()
}

async function handleNext() {
  await formStore.nextStep()
}

async function handlePreview() {
  const ready = await formStore.preparePreview()
  if (ready) {
    emit('showPreview')
  }
}

async function onStepClick(stepNum) {
  if (stepNum <= formStore.currentStep) {
    await formStore.goToStep(stepNum)
  }
}
</script>
