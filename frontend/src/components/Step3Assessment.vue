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
    <div class="rounded-lg border bg-muted/25 p-3 sm:p-4 mb-6"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0, transition: { delay: 100 } }"
    >
      <div class="mb-2 text-xs font-semibold text-muted-foreground">级别说明</div>
      <div class="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-2 text-sm">
        <Badge class="justify-center bg-emerald-500 hover:bg-emerald-500">A 超级喜欢</Badge>
        <Badge class="justify-center bg-blue-500 hover:bg-blue-500">B 喜欢</Badge>
        <Badge class="justify-center bg-amber-500 hover:bg-amber-500">C 不喜欢但接受</Badge>
        <Badge class="justify-center bg-red-400 hover:bg-red-400">D 强迫才接受</Badge>
        <Badge variant="secondary" class="justify-center">E 绝对不接受</Badge>
      </div>
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
          <div class="sticky top-0 z-10 flex items-center gap-2 mt-6 mb-2 bg-background/95 py-1 backdrop-blur sm:static sm:bg-transparent sm:py-0 sm:backdrop-blur-none">
            <span class="text-xs font-semibold text-primary">{{ group.typeName }}</span>
            <div class="flex-1 h-px bg-border"></div>
          </div>
          <div v-for="row in group.items" :key="rowKey(row, 'left')"
            class="assessment-row"
          >
            <TruncatedText :text="row.itemName" class="assessment-row__name" />
            <select
              v-model="row.level"
              class="assessment-row__select"
            >
              <option value="">—</option>
              <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <Input v-model="row.remark" placeholder="备注" class="assessment-row__remark" />
          </div>
        </div>
      </div>

      <!-- 右栏：所有分组在同一列容器内流式堆叠 -->
      <div>
        <div v-for="group in rightGroups" :key="'right-' + group.typeName">
          <div class="sticky top-0 z-10 flex items-center gap-2 mt-6 mb-2 bg-background/95 py-1 backdrop-blur sm:static sm:bg-transparent sm:py-0 sm:backdrop-blur-none">
            <span class="text-xs font-semibold text-primary">{{ group.typeName }}</span>
            <div class="flex-1 h-px bg-border"></div>
          </div>
          <div v-for="row in group.items" :key="rowKey(row, 'right')"
            class="assessment-row"
          >
            <TruncatedText :text="row.itemName" class="assessment-row__name" />
            <select
              v-model="row.level"
              class="assessment-row__select"
            >
              <option value="">—</option>
              <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <Input v-model="row.remark" placeholder="备注" class="assessment-row__remark" />
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

<style scoped>
.assessment-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 9rem) minmax(0, 8rem);
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0;
}

.assessment-row__name {
  min-width: 0;
  font-size: 0.875rem;
}

.assessment-row__select,
.assessment-row__remark {
  height: 2rem;
  min-width: 0;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.assessment-row__select {
  width: 100%;
  border: 1px solid var(--input);
  background: transparent;
  padding: 0 0.5rem;
}

.assessment-row__select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 35%, transparent);
}

@media (max-width: 640px) {
  .assessment-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--muted) 25%, transparent);
  }

  .assessment-row + .assessment-row {
    margin-top: 0.5rem;
  }

  .assessment-row__select,
  .assessment-row__remark {
    height: 2.75rem;
    width: 100%;
    font-size: 1rem;
  }
}

@supports not (background: color-mix(in srgb, white 50%, black)) {
  .assessment-row__select:focus-visible {
    box-shadow: 0 0 0 2px rgb(148 163 184 / 0.35);
  }

  @media (max-width: 640px) {
    .assessment-row {
      background: #f8fafc;
    }
  }
}
</style>
