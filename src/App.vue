<!-- 独立本机填写入口；两套风格的装饰不参与交互，键盘用户可直达主要内容。 -->
<script setup>
import FormWizard from "./components/FormWizard.vue";
</script>
<template>
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <div class="theme-atmosphere" aria-hidden="true">
    <span class="theme-glow glow-one"></span>
    <span class="theme-glow glow-two"></span>
    <span class="theme-glow glow-three"></span>
    <div class="theme-dust"><i v-for="point in 6" :key="point"></i></div>
  </div>
  <FormWizard />
</template>
