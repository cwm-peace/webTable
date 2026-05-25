<!--
  预览弹窗组件

  职责：展示所有填写内容的摘要预览，用户确认后才真正提交。
  使用 shadcn-vue Dialog 组件，包含：
  - 基础信息摘要（关键字段）
  - 照片上传统计
  - 自评完成度（进度条）
  - 底部："返回修改"和"确认提交"按钮
-->
<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>填写预览</DialogTitle>
        <DialogDescription>
          请确认以下信息无误后，点击"确认提交"完成填写
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
            <div v-for="item in basicInfoSummary" :key="item.key" class="flex justify-between gap-3">
              <span class="text-muted-foreground shrink-0">{{ item.label }}：</span>
              <span class="font-medium text-right break-all">{{ item.value || '—' }}</span>
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
              <div class="text-2xl font-bold" :class="store.photoCounts[cat.key] < 4 ? 'text-destructive' : 'text-emerald-600'">
                {{ store.photoCounts[cat.key] }}/4
              </div>
              <div class="text-xs text-muted-foreground">{{ cat.label }}</div>
            </div>
          </div>
          <p v-if="!photosComplete" class="text-destructive text-xs mt-2">
            每个类别必须上传满 4 张照片才能提交
          </p>
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
                <span class="text-muted-foreground">{{ leftCompleted }}/{{ store.leftRows.length }} 项</span>
              </div>
              <div class="h-2 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all duration-500" :style="{ width: leftProgress + '%' }"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span>右侧栏</span>
                <span class="text-muted-foreground">{{ rightCompleted }}/{{ store.rightRows.length }} 项</span>
              </div>
              <div class="h-2 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all duration-500" :style="{ width: rightProgress + '%' }"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="font-medium">总完成度</span>
                <span class="font-medium">{{ totalCompleted }}/{{ totalCount }} 项</span>
              </div>
              <div class="h-2.5 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full transition-all duration-500" :style="{ width: totalProgress + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="dialogOpen = false">返回修改</Button>
        <Button
          @click="handleConfirm"
          :disabled="store.saving || !photosComplete"
          class="bg-emerald-600 hover:bg-emerald-700"
        >
          {{ store.saving ? '提交中...' : '确认提交' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
/**
 * 预览弹窗组件逻辑
 *
 * 展示填写摘要，计算完成度，确认后调用 store.submitAll() 完成提交。
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

const emit = defineEmits(['update:open'])

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

/** 所有 4 个类别都上传满 4 张照片 */
const photosComplete = computed(() =>
  photoCategories.every(cat => store.photoCounts[cat.key] >= 4)
)

const leftCompleted = computed(() =>
  store.leftRows.filter(r => r.level).length
)

const rightCompleted = computed(() =>
  store.rightRows.filter(r => r.level).length
)

const totalCompleted = computed(() =>
  leftCompleted.value + rightCompleted.value
)

const totalCount = computed(() =>
  store.leftRows.length + store.rightRows.length
)

const leftProgress = computed(() =>
  store.leftRows.length ? (leftCompleted.value / store.leftRows.length) * 100 : 0
)

const rightProgress = computed(() =>
  store.rightRows.length ? (rightCompleted.value / store.rightRows.length) * 100 : 0
)

const totalProgress = computed(() =>
  totalCount.value ? (totalCompleted.value / totalCount.value) * 100 : 0
)

/**
 * 确认提交
 *
 * 调用 store 的 submitAll() 方法，保存所有数据并标记完成。
 */
async function handleConfirm() {
  const success = await store.submitAll()
  if (success) {
    dialogOpen.value = false
  }
}
</script>
