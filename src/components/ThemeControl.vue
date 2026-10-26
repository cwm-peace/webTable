<!-- 浏览器显示设置：仅保留原型色板与日间/夜间模式，原生控件支持键盘与触屏。 -->
<script setup>
import { useThemeStore } from "../stores/theme";
const theme = useThemeStore();
</script>
<template>
  <div class="flex flex-wrap gap-3" aria-label="外观设置">
    <label class="field"
      ><span>显示模式</span
      ><select
        :value="theme.mode"
        @change="theme.setMode($event.target.value)"
        class="control compact"
      >
        <option value="system">跟随系统</option>
        <option value="light">日间</option>
        <option value="dark">夜间</option>
      </select></label
    >
  </div>
</template>
