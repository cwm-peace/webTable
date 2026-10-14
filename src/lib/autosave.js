/** 草稿自动保存队列：防抖合并输入，按顺序写入，失败后保留编辑供重试。 */

/**
 * 创建一条串行保存队列；reset 后的旧任务只能完成，不能恢复已丢弃的编辑。
 * @param {object} options 保存行为配置。
 * @param {Function} options.snapshot 生成与当前响应式数据分离的快照。
 * @param {Function} options.save 持久化一个快照，返回完成时兑现的 Promise。
 * @param {Function} [options.onState] 接收 status 和 error，供页面显示保存状态。
 * @param {number} [options.delay=1000] 距最后一次输入的防抖等待毫秒数。
 * @returns {object} changed、flush、resume、reset、dispose 以及 dirty、paused 状态。
 */
export function createAutosave({
  snapshot,
  save,
  onState = () => {},
  delay = 1000,
}) {
  let timer = null;
  let running = null;
  let dirty = false;
  let paused = false;
  let disposed = false;
  let revision = 0;
  let generation = 0;

  /**
   * 执行待保存编辑；快照或存储失败都保留 dirty，等待显式重试。
   * @returns {Promise<boolean>} 当前队列的编辑是否全部持久化。
   */
  function drain() {
    if (disposed || paused) return Promise.resolve(false);
    if (running) return running;
    // 下一微任务才读取快照，使 running 在同步抛错前已指向当前任务。
    const operation = Promise.resolve().then(async () => {
      while (dirty && !paused && !disposed) {
        dirty = false;
        const startedRevision = revision;
        const startedGeneration = generation;
        try {
          onState({ status: "saving", error: null });
          const payload = snapshot();
          await save(payload);
          // 重新加载或清除后，旧写入的返回值不能改变新草稿的状态。
          if (startedGeneration !== generation) continue;
          if (startedRevision !== revision) dirty = true;
          onState({ status: dirty ? "pending" : "saved", error: null });
        } catch (error) {
          if (startedGeneration !== generation) continue;
          dirty = true;
          paused = true;
          onState({
            status: error?.status === 409 ? "conflict" : "error",
            error,
          });
          return false;
        }
      }
      return !dirty && !disposed && !paused;
    });
    running = operation.finally(() => {
      running = null;
    });
    return running;
  }

  return {
    /**
     * 标记输入变化并重置防抖时间；暂停期间仍记住最新编辑。
     * @returns {void} 无返回值。
     */
    changed() {
      if (disposed) return;
      revision += 1;
      dirty = true;
      clearTimeout(timer);
      if (paused) return;
      onState({ status: "pending", error: null });
      timer = setTimeout(drain, delay);
    },

    /**
     * 在切换步骤、导出或关闭页面前等待所有已知编辑写入。
     * @returns {Promise<boolean>} 是否全部保存成功。
     */
    flush() {
      clearTimeout(timer);
      return drain();
    },

    /**
     * 重试失败的保存；版本冲突须由调用者先读取正确版本。
     * @returns {Promise<boolean>} 重试后是否全部保存成功。
     */
    resume() {
      paused = false;
      return drain();
    },

    /**
     * 丢弃待保存编辑并使旧异步回调失效，正在执行的写入仍按顺序结束。
     * @returns {void} 无返回值。
     */
    reset() {
      if (disposed) return;
      generation += 1;
      clearTimeout(timer);
      dirty = false;
      paused = false;
      onState({ status: "saved", error: null });
    },

    /**
     * 停止当前队列，取消定时器并忽略所有旧任务的状态回调。
     * @returns {void} 无返回值。
     */
    dispose() {
      generation += 1;
      disposed = true;
      dirty = false;
      clearTimeout(timer);
    },

    /**
     * 判断是否还有未落库编辑或正在进行的写入。
     * @returns {boolean} 是否应提示等待保存。
     */
    get dirty() {
      return dirty || Boolean(running);
    },

    /**
     * 判断是否因失败或版本冲突暂停自动写入。
     * @returns {boolean} 是否需要用户处理错误。
     */
    get paused() {
      return paused;
    },
  };
}
