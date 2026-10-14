/** 合并组件样式并消除互相冲突的 Tailwind 类名。 */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并条件样式和调用方覆盖样式。
 * @param {...*} inputs clsx 支持的样式值
 * @returns {string} 去除冲突后的类名字符串
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
