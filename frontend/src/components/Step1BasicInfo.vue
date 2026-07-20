<!--
  第1步：基础信息组件（v3 - shadcn-vue 版）

  职责：展示和编辑范本中基础信息 Sheet 的所有字段。
  使用 shadcn-vue 的 Card、Input、Label 组件，Tailwind CSS 布局。
  数据绑定到 Pinia store，不再独立调用 API 保存。
  去掉了保存按钮，三步全填完后由 App.vue 统一保存。
-->
<template>
  <div>
    <div class="mb-6"
      v-motion
      :initial="{ opacity: 0, y: 20 }"
      :enter="{ opacity: 1, y: 0, transition: { duration: 400 } }"
    >
      <h2 class="text-2xl font-bold tracking-tight">基础信息</h2>
      <p class="text-muted-foreground mt-1">以下部分未知或记不清可不填</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      <!-- 基本身体信息 -->
      <Card class="field-section" v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 100 } }">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3.5">
          <div v-for="field in basicFields" :key="field.key" class="space-y-1.5">
            <Label :for="field.key">{{ field.label }}</Label>
            <Input :id="field.key" v-model="store.basicInfo[field.key]" :placeholder="'请输入' + field.label" />
          </div>
        </CardContent>
      </Card>

      <!-- 联系方式 -->
      <Card class="field-section" v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 200 } }">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">联系方式</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3.5">
          <div v-for="field in contactFields" :key="field.key" class="space-y-1.5">
            <Label :for="field.key">{{ field.label }}</Label>
            <Input :id="field.key" v-model="store.basicInfo[field.key]" :placeholder="'请输入' + field.label" />
          </div>
        </CardContent>
      </Card>

      <!-- 个人经历 -->
      <Card class="field-section" v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 300 } }">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">个人经历</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3.5">
          <div v-for="field in experienceFields" :key="field.key" class="space-y-1.5">
            <Label :for="field.key">{{ field.label }}</Label>
            <Input :id="field.key" v-model="store.basicInfo[field.key]" :placeholder="'请输入'" />
          </div>
        </CardContent>
      </Card>

      <!-- 个人习惯 -->
      <Card class="field-section lg:col-span-2" v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 400 } }">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">个人习惯</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3.5">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div v-for="field in habitFields" :key="field.key" class="space-y-1.5">
              <Label :for="field.key">{{ field.label }}</Label>
              <Input :id="field.key" v-model="store.basicInfo[field.key]" :placeholder="field.placeholder || '请输入'" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 其他 -->
      <Card class="field-section md:col-span-2 lg:col-span-3" v-motion :initial="{ opacity: 0, y: 30 }" :enter="{ opacity: 1, y: 0, transition: { delay: 500 } }">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">其他</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div v-for="field in otherFields" :key="field.key" class="space-y-1.5">
              <Label :for="field.key">{{ field.label }}</Label>
              <Textarea v-if="field.key === 'remark' || field.key === 'trainingIntention'" :id="field.key" v-model="store.basicInfo[field.key]" placeholder="补充说明..." rows="3" />
              <Input v-else :id="field.key" v-model="store.basicInfo[field.key]" placeholder="请输入" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup>
/**
 * 第1步：基础信息组件逻辑（v3）
 *
 * 所有字段直接绑定 Pinia store 中的 basicInfo 对象。
 * 不再独立管理表单数据，不再调用保存 API。
 */
import { useFormStore } from '../stores/form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const store = useFormStore()

const basicFields = [
  { key: 'name', label: '名字' },
  { key: 'height', label: '身高cm' },
  { key: 'weight', label: '体重kg' },
  { key: 'education', label: '学历' },
  { key: 'occupation', label: '职业' },
  { key: 'shoeSize', label: '鞋码EU' },
  { key: 'province', label: '所在地(省)' },
  { key: 'city', label: '所在地(市)' }
]

const contactFields = [
  { key: 'qq', label: 'QQ号' },
  { key: 'wechat', label: '微信号' },
  { key: 'weibo', label: '微博名' },
  { key: 'phone', label: '电话号码' }
]

const experienceFields = [
  { key: 'firstMasturbationAge', label: '第一次自慰年龄' },
  { key: 'firstSexAge', label: '破处年龄' },
  { key: 'isSingle', label: '是否单身' },
  { key: 'cheatedOnPartner', label: '是否绿过伴侣' },
  { key: 'beenCheated', label: '是否被伴侣绿过' },
  { key: 'longestLockTime', label: '最长带锁时间' }
]

const habitFields = [
  { key: 'sexFrequency', label: '做爱频率' },
  { key: 'masturbationFrequency', label: '自慰频率' },
  { key: 'masturbationTool', label: '自慰工具' },
  { key: 'analInsertableSize', label: '菊穴可完全插入尺寸', placeholder: '直径*长度cm' },
  { key: 'urethraInsertableSize', label: '尿道可完全插入尺寸', placeholder: '直径*长度cm' }
]

const otherFields = [
  { key: 'dogAge', label: '犬龄(做犬的时间)' },
  { key: 'meetingCount', label: '约调次数' },
  { key: 'masterCount', label: '侍主人数' },
  { key: 'semenVolume', label: '精液量ml' },
  { key: 'dailyMaxEjaculation', label: '每日最高射精次数' },
  { key: 'preferredName', label: '喜欢被叫的称呼' },
  { key: 'selfDescription', label: '一句话形容自己' },
  { key: 'remark', label: '备注' },
  { key: 'trainingIntention', label: '培养意向' }
]
</script>

<style scoped>
.field-section {
  border-color: var(--border);
  background: var(--card);
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.04);
}
</style>
