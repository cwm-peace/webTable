<!--
  第3步：接受程度自评组件（v3 - Tailwind 版）

  职责：展示和编辑范本中接受程度自评 Sheet 的左右双栏数据。
  数据绑定到 Pinia store，改为按类型分组的卡片式表单，提升手机端连续填写体验。
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
    <Card class="mb-6"
      v-motion
      :initial="{ opacity: 0, y: 20 }"
      :enter="{ opacity: 1, y: 0, transition: { delay: 100 } }"
    >
      <CardContent class="py-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold mr-2">级别说明：</span>
          <Badge class="bg-emerald-500 hover:bg-emerald-500">A 超级喜欢</Badge>
          <Badge class="bg-blue-500 hover:bg-blue-500">B 喜欢</Badge>
          <Badge class="bg-amber-500 hover:bg-amber-500">C 不喜欢但接受</Badge>
          <Badge class="bg-red-400 hover:bg-red-400">D 强迫才接受</Badge>
          <Badge variant="secondary">E 绝对不接受</Badge>
        </div>
      </CardContent>
    </Card>

    <!-- 上下分区布局 -->
    <div class="space-y-6">
      <!-- 左侧栏 -->
      <Card v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 200 } }">
        <CardHeader>
          <CardTitle class="text-base">左侧栏</CardTitle>
          <CardDescription>性奴、狗奴、玩偶奴、家奴等</CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div v-for="group in leftGroups" :key="'left-' + group.typeName" class="space-y-3">
            <div class="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <h3 class="text-sm font-semibold text-primary">{{ group.typeName }}</h3>
            </div>
            <div class="space-y-3">
              <div
                v-for="row in group.items"
                :key="rowKey(row, 'left')"
                class="rounded-lg border bg-card p-4 shadow-sm"
              >
                <div class="space-y-3">
                  <div>
                    <div class="text-sm font-medium leading-6">{{ row.itemName }}</div>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <Label>接受级别</Label>
                      <select
                        v-model="row.level"
                        class="w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">请选择</option>
                        <option v-for="option in levelOptions" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </option>
                      </select>
                    </div>
                    <div class="space-y-1.5">
                      <Label>备注</Label>
                      <Input v-model="row.remark" placeholder="可选填" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 右侧栏 -->
      <Card v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 300 } }">
        <CardHeader>
          <CardTitle class="text-base">右侧栏</CardTitle>
          <CardDescription>刑奴、脚厕奴、野奴暴露奴、兽奴等</CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div v-for="group in rightGroups" :key="'right-' + group.typeName" class="space-y-3">
            <div class="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <h3 class="text-sm font-semibold text-primary">{{ group.typeName }}</h3>
            </div>
            <div class="space-y-3">
              <div
                v-for="row in group.items"
                :key="rowKey(row, 'right')"
                class="rounded-lg border bg-card p-4 shadow-sm"
              >
                <div class="space-y-3">
                  <div>
                    <div class="text-sm font-medium leading-6">{{ row.itemName }}</div>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <Label>接受级别</Label>
                      <select
                        v-model="row.level"
                        class="w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">请选择</option>
                        <option v-for="option in levelOptions" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </option>
                      </select>
                    </div>
                    <div class="space-y-1.5">
                      <Label>备注</Label>
                      <Input v-model="row.remark" placeholder="可选填" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup>
/**
 * 第3步：接受程度自评组件逻辑（v3）
 *
 * 数据直接从 Pinia store 读取和修改，不再独立管理。
 * 改为按类型分组的卡片式布局，减少移动端横向滚动和内层滚动。
 */
import { computed } from 'vue'
import { useFormStore } from '../stores/form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const store = useFormStore()

const levelOptions = [
  { value: 'A', label: 'A - 超级喜欢' },
  { value: 'B', label: 'B - 喜欢' },
  { value: 'C', label: 'C - 不喜欢但接受' },
  { value: 'D', label: 'D - 强迫才接受' },
  { value: 'E', label: 'E - 绝对不接受' }
]

/**
 * 按 typeName 对行数据分组。
 *
 * @param {Array} rows 原始行数据
 * @returns {Array} 分组结果
 */
function groupRows(rows) {
  const groups = []
  for (const row of rows) {
    const lastGroup = groups[groups.length - 1]
    if (!lastGroup || lastGroup.typeName !== row.typeName) {
      groups.push({ typeName: row.typeName, items: [row] })
    } else {
      lastGroup.items.push(row)
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
