<!--
  管理员登录页

  职责：管理员输入密码登录，验证通过后跳转到列表页。
  对应路由：/admin
  使用 shadcn-vue Card + Input + Button 组件，居中卡片布局。
-->
<template>
  <div class="min-h-screen bg-background flex items-center justify-center px-4">
    <Card class="w-full max-w-md"
      v-motion
      :initial="{ opacity: 0, y: 20 }"
      :enter="{ opacity: 1, y: 0, transition: { duration: 400 } }"
    >
      <CardHeader class="text-center">
        <CardTitle class="text-xl">管理员登录</CardTitle>
        <CardDescription>请输入管理员密码</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="password">密码</Label>
            <Input
              id="password"
              type="password"
              v-model="password"
              placeholder="请输入密码"
              class="h-11"
              @keyup.enter="handleLogin"
            />
          </div>
          <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
          <Button class="w-full h-11" @click="handleLogin" :disabled="loading">
            {{ loading ? '登录中...' : '登录' }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup>
/**
 * 管理员登录页逻辑
 *
 * 输入密码后调用登录 API，成功则保存 token 到 localStorage 并跳转到列表页。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminLogin } from '../../api/admin'
import { setAdminToken } from '../../lib/adminAuth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const router = useRouter()
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

/**
 * 处理登录
 */
async function handleLogin() {
  if (!password.value) {
    errorMsg.value = '请输入密码'
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    const res = await adminLogin(password.value)
    setAdminToken(res.data.adminToken)
    // 跳转到列表页
    router.push('/admin/dashboard')
  } catch (error) {
    errorMsg.value = error.message || '密码错误'
  } finally {
    loading.value = false
  }
}
</script>
