<!--
  第3步：接受程度自评组件（v3 - Tailwind 版）

  职责：展示和编辑范本中接受程度自评 Sheet 的左右双栏数据。
  数据绑定到 Pinia store，按 typeName 分组展示，PC 端左右并排，手机端上下堆叠。
-->
<template>
  <div>
    <div class="mb-6"
      v-motion
      :initial="{ opacity: 0, y: 20 }"
      :enter="{ opacity: 1, y: 0, transition: { duration: 400 } }"
    >
      <h2 class="text-2xl font-bold tracking-tight">接受程度自评</h2>
      <p class="text-muted-foreground mt-1">请根据自己的真实感受为每个项目选择接受级别</p>
    </div>

    <!-- 级别说明 -->
    <div class="flex flex-wrap items-center gap-2 mb-6 text-sm"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0, transition: { delay: 100 } }"
    >
      <span class="font-semibold text-muted-foreground">级别：</span>
      <Badge class="bg-emerald-500 hover:bg-emerald-500">A 超级喜欢</Badge>
      <Badge class="bg-blue-500 hover:bg-blue-500">B 喜欢</Badge>
      <Badge class="bg-amber-500 hover:bg-amber-500">C 不喜欢但接受</Badge>
      <Badge class="bg-red-400 hover:bg-red-400">D 强迫才接受</Badge>
      <Badge variant="secondary">E 绝对不接受</Badge>
    </div>

    <!-- PC 端两列，手机端单列 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-10"
      v-motion
      :initial="{ opacity: 0, y: 20 }"
      :enter="{ opacity: 1, y: 0, transition: { delay: 150 } }"
    >
      <!-- 左栏：所有分组在同一列容器内流式堆叠 -->
      <div>
        <div v-for="group in leftGroups" :key="'left-' + group.typeName">
          <div class="flex items-center gap-2 mt-6 mb-2">
            <span class="text-xs font-semibold text-primary">{{ group.typeName }}</span>
            <div class="flex-1 h-px bg-border"></div>
          </div>
          <div v-for="row in group.items" :key="rowKey(row, 'left')"
            class="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5"
          >
            <TruncatedText :text="row.itemName" class="text-sm" />
            <select
              v-model="row.level"
              class="h-8 w-[6.5rem] sm:w-32 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">—</option>
              <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <Input v-model="row.remark" placeholder="备注" class="h-8 w-[5rem] sm:w-28 text-sm" />
          </div>
        </div>
      </div>

      <!-- 右栏：所有分组在同一列容器内流式堆叠 -->
      <div>
        <div v-for="group in rightGroups" :key="'right-' + group.typeName">
          <div class="flex items-center gap-2 mt-6 mb-2">
            <span class="text-xs font-semibold text-primary">{{ group.typeName }}</span>
            <div class="flex-1 h-px bg-border"></div>
          </div>
          <div v-for="row in group.items" :key="rowKey(row, 'right')"
            class="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5"
          >
            <TruncatedText :text="row.itemName" class="text-sm" />
            <select
              v-model="row.level"
              class="h-8 w-[6.5rem] sm:w-32 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">—</option>
              <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <Input v-model="row.remark" placeholder="备注" class="h-8 w-[5rem] sm:w-28 text-sm" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 第3步：接受程度自评组件逻辑（v3）
 *
 * 数据直接从 Pinia store 读取和修改。
 * 按 typeName 分组，扁平行式布局，减少视觉噪音。
 */
import { computed } from 'vue'
import { useFormStore } from '../stores/form'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import TruncatedText from './TruncatedText.vue'

const store = useFormStore()

const levelOptions = [
  { value: 'A', label: 'A 超级喜欢' },
  { value: 'B', label: 'B 喜欢' },
  { value: 'C', label: 'C 不喜欢但接受' },
  { value: 'D', label: 'D 强迫才接受' },
  { value: 'E', label: 'E 绝对不接受' }
]

/**
 * 按 typeName 对行数据分组（保持原始顺序）。
 */
function groupRows(rows) {
  const groups = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (!last || last.typeName !== row.typeName) {
      groups.push({ typeName: row.typeName, items: [row] })
    } else {
      last.items.push(row)
    }
  }
  return groups
}

const leftGroups = computed(() => groupRows(store.leftRows))
const rightGroups = computed(() => groupRows(store.rightRows))

function rowKey(row, side) {
  return `${side}-${row.rowOrder ?? row.itemName}`
}
</script>
