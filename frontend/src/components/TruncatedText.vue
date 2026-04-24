<!--
  截断文本组件

  职责：文本超长时显示省略号，点击后弹出浮层展示完整内容。
  自动检测是否发生溢出，未溢出时不显示点击手势。
-->
<template>
  <div class="relative inline-block max-w-full" ref="containerRef">
    <span
      ref="textRef"
      class="block truncate cursor-pointer"
      :class="{ 'select-none': true }"
      @click="handleClick"
    >{{ text }}</span>
    <!-- 浮层 -->
    <Transition name="tooltip">
      <div
        v-if="visible"
        class="absolute z-50 bottom-full left-0 mb-1.5 px-3 py-1.5 rounded-md bg-popover text-popover-foreground text-sm shadow-md border border-border whitespace-normal min-w-[120px] max-w-[280px]"
      >
        {{ text }}
        <!-- 小三角 -->
        <div class="absolute left-4 -bottom-1.5 w-3 h-3 rotate-45 bg-popover border-b border-r border-border"></div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
/**
 * 截断文本组件逻辑
 *
 * 仅在文本实际发生溢出时才允许弹出浮层，
 * 避免短文本也出现不必要的点击交互。
 */
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({
  text: { type: String, required: true }
})

const textRef = ref(null)
const containerRef = ref(null)
const visible = ref(false)
const isOverflowing = ref(false)

function checkOverflow() {
  if (textRef.value) {
    isOverflowing.value = textRef.value.scrollWidth > textRef.value.clientWidth
  }
}

function handleClick() {
  if (isOverflowing.value) {
    visible.value = !visible.value
  }
}

/** 点击外部关闭浮层 */
function handleOutsideClick(event) {
  if (visible.value && containerRef.value && !containerRef.value.contains(event.target)) {
    visible.value = false
  }
}

onMounted(() => {
  checkOverflow()
  // 监听窗口大小变化，重新检测溢出
  window.addEventListener('resize', checkOverflow)
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkOverflow)
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<style scoped>
.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
