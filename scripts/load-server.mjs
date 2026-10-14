/** 静态负载测试专用子进程，用 IPC 返回随机端口和独立服务进程的内存指标。 */
import { createStaticServer } from "./static-server.mjs";

const server = createStaticServer({ root: process.env.LOAD_TEST_ROOT });
let timer;

/**
 * 回传当前服务进程内存，避免把负载发生器的内存计入服务端。
 * @returns {void} 无返回值。
 */
function sampleMemory() {
  process.send?.({
    type: "memory",
    timestamp: Date.now(),
    ...process.memoryUsage(),
  });
}

server.listen(0, "127.0.0.1", () => {
  process.send?.({ type: "ready", port: server.address().port });
  sampleMemory();
  timer = setInterval(sampleMemory, 1000);
});
server.on("error", (error) => {
  process.send?.({ type: "error", message: error.message });
  process.exitCode = 1;
});
process.on("message", (message) => {
  if (message?.type !== "stop") return;
  clearInterval(timer);
  sampleMemory();
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
});
process.on("disconnect", () => {
  clearInterval(timer);
  server.close();
  server.closeAllConnections?.();
});
