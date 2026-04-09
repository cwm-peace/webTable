<!--
  第3步：接受程度自评组件（v3 - Tailwind 版）

  职责：展示和编辑范本中接受程度自评 Sheet 的左右双栏数据。
  数据绑定到 Pinia store，去掉保存按钮。
  保留 vxe-table（因为编辑功能复杂），外层用 Tailwind Card 包裹。
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
        <CardContent>
          <vxe-table
            :data="store.leftRows"
            border
            show-overflow
            :row-config="{ height: 44 }"
            max-height="500"
            :scroll-y="{ enabled: true }"
            class="w-full"
          >
            <vxe-column field="typeName" title="类型" width="110">
              <template #default="{ row, rowIndex }">
                <span class="font-bold text-primary text-sm" v-if="isTypeGroupStart(store.leftRows, rowIndex)">
                  {{ row.typeName }}
                </span>
              </template>
            </vxe-column>
            <vxe-column field="itemName" title="项目" min-width="140" />
            <vxe-column field="level" title="级别" width="180">
              <template #default="{ row }">
                <select v-model="row.level" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">请选择</option>
                  <option value="A">A - 超级喜欢</option>
                  <option value="B">B - 喜欢</option>
                  <option value="C">C - 不喜欢但接受</option>
                  <option value="D">D - 强迫才接受</option>
                  <option value="E">E - 绝对不接受</option>
                </select>
              </template>
            </vxe-column>
            <vxe-column field="remark" title="备注" min-width="150">
              <template #default="{ row }">
                <input v-model="row.remark" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="可选填" />
              </template>
            </vxe-column>
          </vxe-table>
        </CardContent>
      </Card>

      <!-- 右侧栏 -->
      <Card v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 300 } }">
        <CardHeader>
          <CardTitle class="text-base">右侧栏</CardTitle>
          <CardDescription>刑奴、脚厕奴、野奴暴露奴、兽奴等</CardDescription>
        </CardHeader>
        <CardContent>
          <vxe-table
            :data="store.rightRows"
            border
            show-overflow
            :row-config="{ height: 44 }"
            max-height="500"
            :scroll-y="{ enabled: true }"
            class="w-full"
          >
            <vxe-column field="typeName" title="类型" width="110">
              <template #default="{ row, rowIndex }">
                <span class="font-bold text-primary text-sm" v-if="isTypeGroupStart(store.rightRows, rowIndex)">
                  {{ row.typeName }}
                </span>
              </template>
            </vxe-column>
            <vxe-column field="itemName" title="项目" min-width="140" />
            <vxe-column field="level" title="级别" width="180">
              <template #default="{ row }">
                <select v-model="row.level" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">请选择</option>
                  <option value="A">A - 超级喜欢</option>
                  <option value="B">B - 喜欢</option>
                  <option value="C">C - 不喜欢但接受</option>
                  <option value="D">D - 强迫才接受</option>
                  <option value="E">E - 绝对不接受</option>
                </select>
              </template>
            </vxe-column>
            <vxe-column field="remark" title="备注" min-width="150">
              <template #default="{ row }">
                <input v-model="row.remark" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="可选填" />
              </template>
            </vxe-column>
          </vxe-table>
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
 * 去掉了保存按钮。
 */
import { useFormStore } from '../stores/form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const store = useFormStore()

function isTypeGroupStart(rows, idx) {
  if (idx === 0) return true
  return rows[idx].typeName !== rows[idx - 1].typeName
}
</script>
