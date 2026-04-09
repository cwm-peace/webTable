<!--
  预览弹窗组件

  职责：展示所有填写内容的摘要预览，用户确认后才真正保存。
  使用 shadcn-vue Dialog 组件，包含：
  - 基础信息摘要（关键字段）
  - 照片上传统计
  - 自评完成度（进度条）
  - 底部："返回修改"和"确认保存"按钮
-->
<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>填写预览</DialogTitle>
        <DialogDescription>
          请确认以下信息无误后，点击"确认保存"提交
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <!-- 基础信息摘要 -->
        <div>
          <h4 class="text-sm font-semibold mb-3 flex items-center gap-2">
            <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
            基础信息
          </h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div v-for="item in basicInfoSummary" :key="item.key" class="flex justify-between">
              <span class="text-muted-foreground">{{ item.label }}：</span>
              <span class="font-medium">{{ item.value || '—' }}</span>
            </div>
          </div>
        </div>

        <Separator />

        <!-- 照片统计 -->
        <div>
          <h4 class="text-sm font-semibold mb-3 flex items-center gap-2">
            <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
            照片上传
          </h4>
          <div class="grid grid-cols-4 gap-3">
            <div v-for="cat in photoCategories" :key="cat.key" class="text-center">
              <div class="text-2xl font-bold">{{ store.photoCounts[cat.key] }}</div>
              <div class="text-xs text-muted-foreground">{{ cat.label }}</div>
            </div>
          </div>
        </div>

        <Separator />

        <!-- 自评完成度 -->
        <div>
          <h4 class="text-sm font-semibold mb-3 flex items-center gap-2">
            <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
            自评完成度
          </h4>
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span>左侧栏</span>
                <span class="text-muted-foreground">{{ leftCompleted }}/65 项</span>
              </div>
              <div class="h-2 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all duration-500" :style="{ width: (leftCompleted / 65 * 100) + '%' }"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span>右侧栏</span>
                <span class="text-muted-foreground">{{ rightCompleted }}/60 项</span>
              </div>
              <div class="h-2 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all duration-500" :style="{ width: (rightCompleted / 60 * 100) + '%' }"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="font-medium">总完成度</span>
                <span class="font-medium">{{ totalCompleted }}/125 项</span>
              </div>
              <div class="h-2.5 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full transition-all duration-500" :style="{ width: (totalCompleted / 125 * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="dialogOpen = false">返回修改</Button>
        <Button
          @click="handleConfirm"
          :disabled="store.saving"
          class="bg-emerald-600 hover:bg-emerald-700"
        >
          {{ store.saving ? '保存中...' : '确认保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
/**
 * 预览弹窗组件逻辑
 *
 * 展示填写摘要，计算完成度，确认后调用 store.submitAll() 一次性保存。
 */
import { computed } from 'vue'
import { useFormStore } from '../stores/form'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const props = defineProps({
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['update:open', 'saved'])

const store = useFormStore()

const dialogOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

// 基础信息摘要：只展示关键字段
const basicInfoSummary = computed(() => [
  { key: 'name', label: '名字', value: store.basicInfo.name },
  { key: 'height', label: '身高', value: store.basicInfo.height ? store.basicInfo.height + 'cm' : '' },
  { key: 'weight', label: '体重', value: store.basicInfo.weight ? store.basicInfo.weight + 'kg' : '' },
  { key: 'phone', label: '电话', value: store.basicInfo.phone },
  { key: 'wechat', label: '微信', value: store.basicInfo.wechat },
  { key: 'province', label: '所在地', value: [store.basicInfo.province, store.basicInfo.city].filter(Boolean).join(' ') }
])

const photoCategories = [
  { key: 'selfie', label: '自拍' },
  { key: 'nude', label: '裸照' },
  { key: 'dick', label: '狗屌' },
  { key: 'other', label: '其他' }
]

// 左侧自评完成数（选择了级别的项）
const leftCompleted = computed(() =>
  store.leftRows.filter(r => r.level).length
)

// 右侧自评完成数
const rightCompleted = computed(() =>
  store.rightRows.filter(r => r.level).length
)

// 总完成度
const totalCompleted = computed(() =>
  leftCompleted.value + rightCompleted.value
)

/**
 * 确认保存
 *
 * 调用 store 的 submitAll() 方法，一次性保存所有数据并标记完成。
 */
async function handleConfirm() {
  const success = await store.submitAll()
  if (success) {
    dialogOpen.value = false
    emit('saved')
  }
}
</script>
