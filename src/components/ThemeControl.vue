<!-- 浏览器外观设置：主题和明暗分别选择，原生控件支持键盘与触屏。 -->
<script setup>
import { useThemeStore } from "../stores/theme";
const theme = useThemeStore();
</script>
<template>
  <div class="flex flex-wrap gap-3" aria-label="外观设置">
    <label class="field"
      ><span>界面风格</span
      ><select
        :value="theme.theme"
        @change="theme.setTheme($event.target.value)"
        class="control compact"
      >
        <option
          v-for="item in theme.themes"
          :key="item.value"
          :value="item.value"
        >
          {{ item.label }}
        </option>
      </select></label
    >
    <label class="field"
      ><span>明暗模式</span
      ><select
        :value="theme.mode"
        @change="theme.setMode($event.target.value)"
        class="control compact"
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select></label
    >
  </div>
</template>
