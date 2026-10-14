<!-- DialogClose 组件：统一表单控件的外观与可访问语义。 -->
<script setup>
import { DialogClose } from "reka-ui";

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
});
</script>

<template>
  <DialogClose data-slot="dialog-close" v-bind="props">
    <slot />
  </DialogClose>
</template>
