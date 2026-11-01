<!-- 本机外观设置：单按钮切换两套风格，共用日间/夜间/系统模式，支持键盘与触屏。 -->
<script setup>
import { useId } from "vue";
import { Button } from "./ui/button";
import { useThemeStore } from "../stores/theme";
const theme = useThemeStore();
const descriptionId = useId();
</script>
<template>
  <div
    class="appearance-controls flex flex-wrap items-end gap-3"
    aria-label="外观设置"
  >
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
    <Button
      type="button"
      variant="outline"
      class="style-switch"
      aria-label="切换界面风格"
      :aria-pressed="theme.style === 'midnight'"
      :aria-describedby="descriptionId"
      :title="
        theme.style === 'submission' ? '切换到午夜风格' : '切换到臣服风格'
      "
      @click="theme.toggleStyle"
    >
      风格：{{ theme.style === "submission" ? "臣服" : "午夜" }}
    </Button>
    <span :id="descriptionId" class="sr-only">
      当前为{{
        theme.style === "submission" ? "臣服" : "午夜"
      }}风格，点击切换到{{
        theme.style === "submission" ? "午夜" : "臣服"
      }}风格；沿用当前显示模式。
    </span>
  </div>
</template>
