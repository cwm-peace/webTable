/** IndexedDB本机草稿仓库；事务版本、写入租约和清除代次阻止旧页面覆盖或复活数据。 */
export const DB_NAME = "webtable-local-v1";
const LEASE_MS = 9000;
const TRANSACTION_TIMEOUT_MS = 30_000;

/** 生成可向界面显示的冲突错误。
 * @param {string} message 冲突原因
 * @returns {Error} 带409状态的错误
 */
function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}
/** 将IDB请求转换成Promise，不在事务内等待任何外部异步任务。
 * @param {IDBRequest} request 数据库请求
 * @returns {Promise<unknown>} 请求结果
 */
function requested(request) {
  const result = new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // 后续put可能同步抛错并中止前面的请求，仍需处理这些请求的拒绝。
  result.catch(() => {});
  return result;
}
/** 等待事务提交；请求成功不等于事务已经持久化。
 * @param {IDBTransaction} tx 当前事务
 * @returns {Promise<void>} 事务提交完成
 */
function completed(tx) {
  let settled = false;
  const result = new Promise((resolve, reject) => {
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        tx.abort();
      } catch {}
      finish(new Error("本机存储写入超时，请关闭其他标签页后重试"));
    }, TRANSACTION_TIMEOUT_MS);
    tx.oncomplete = () => finish();
    tx.onabort = () => finish(tx.error || new Error("本机存储事务未完成"));
    tx.onerror = () => {};
  });
  // 请求失败和事务中止可能先于调用者await，立即登记拒绝处理避免未处理异常。
  result.catch(() => {});
  return result;
}

/**
 * 事务开始前将图片转换为字节，兼容无法直接向IndexedDB写入Blob的WebKit环境。
 * @param {Array} items 带blob和previewBlob的图片快照。
 * @returns {Promise<Array>} 只含ArrayBuffer、MIME和图片元数据的存储条目。
 */
async function encodePhotos(items) {
  if (!Array.isArray(items)) throw new Error("照片数据无效，请重新选择");
  const encoded = [];
  for (const item of items) {
    if (!(item?.blob instanceof Blob) || !(item?.previewBlob instanceof Blob)) {
      throw new Error("照片文件缺失，请重新选择");
    }
    const { blob, previewBlob, ...metadata } = item;
    // 顺序读取，避免16个原件与预览同时分配临时字节缓冲区。
    const blobBytes = await blob.arrayBuffer();
    const previewBytes = await previewBlob.arrayBuffer();
    encoded.push({
      ...metadata,
      key: `${item.category}-${item.slot}`,
      blobBytes,
      blobType: blob.type,
      previewBytes,
      previewType: previewBlob.type,
    });
  }
  return encoded;
}

/**
 * 恢复可直接用于预览和导出的Blob，同时兼容早期直接保存Blob的记录。
 * @param {object} stored IndexedDB中的图片条目。
 * @returns {object} 不包含存储内部字段的图片对象。
 */
function decodePhoto(stored) {
  const { key, blobBytes, blobType, previewBytes, previewType, ...photo } =
    stored;
  if (blobBytes instanceof ArrayBuffer || ArrayBuffer.isView(blobBytes)) {
    photo.blob = new Blob([blobBytes], { type: blobType || photo.mime || "" });
  }
  if (previewBytes instanceof ArrayBuffer || ArrayBuffer.isView(previewBytes)) {
    photo.previewBlob = new Blob([previewBytes], {
      type: previewType || "image/jpeg",
    });
  }
  return photo;
}
/** 打开草稿库，升级被旧标签页阻塞时明确失败。
 * @param {string} name 独立数据库名，测试可使用隔离名称
 * @returns {Promise<IDBDatabase>} 已打开的数据库
 */
function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    let abandoned = false;
    const timer = setTimeout(() => {
      abandoned = true;
      reject(new Error("本机存储打开超时，请关闭其他标签页后重试"));
    }, 5000);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("state");
      req.result.createObjectStore("photos", { keyPath: "key" });
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      if (abandoned) req.result.close();
      else resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
    req.onblocked = () => {
      abandoned = true;
      clearTimeout(timer);
      reject(new Error("存储升级被其他标签页阻塞，请先关闭它们"));
    };
  });
}
/** 创建一页独占写入的本地仓库，并探测读写删除能力。
 * @param {object} options owner当前页面随机标识、name数据库名、now可注入测试时钟
 * @returns {Promise<object>} 加载、保存、清理及租约操作接口
 */
export async function openRepository({
  owner,
  name = DB_NAME,
  now = () => Date.now(),
}) {
  const db = await openDatabase(name);
  db.onversionchange = () => db.close();
  try {
    const tx = db.transaction("state", "readwrite"),
      done = completed(tx),
      st = tx.objectStore("state");
    st.put("ok", `probe-${owner}`);
    const value = await requested(st.get(`probe-${owner}`));
    st.delete(`probe-${owner}`);
    await done;
    if (value !== "ok") throw new Error("本机存储读写检查失败");
  } catch (error) {
    db.close();
    throw error;
  }
  /** 在同一事务中执行状态操作，统一处理主动终止与错误。
   * @param {string} mode readonly或readwrite
   * @param {Function} action 接收state/photos存储和控制记录的事务函数
   * @returns {Promise<unknown>} 提交后的操作结果
   */
  async function transaction(mode, action) {
    const tx = db.transaction(["state", "photos"], mode),
      done = completed(tx);
    const st = tx.objectStore("state"),
      photos = tx.objectStore("photos");
    const actionTask = (async () => {
      const control = (await requested(st.get("control"))) || {
        generation: 0,
        version: 0,
        owner: null,
        leaseUntil: 0,
      };
      return action(st, photos, control);
    })();
    try {
      // 同时等待操作和提交。事务超时或中止时，不会被一个永不回调的请求挂住。
      const [result] = await Promise.all([actionTask, done]);
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  /**
   * 检查写入者、代次和版本；同一页面从后台恢复时可重新建立过期租约。
   * 租约到期本身不会证明页面失去所有权。只有另一个 owner 成功接管、代次被清除或版本已变化时，旧页面才必须冲突。
   * @param {object} control 当前数据库控制记录
   * @param {object} expected 调用者读取到的代次和版本
   * @returns {void} 不匹配时抛出冲突
   */
  function check(control, expected) {
    if (control.generation !== expected.generation)
      throw conflict("草稿已被其他页面清除，请重新读取");
    if (control.owner !== owner)
      throw conflict("另一标签页正在编辑，或本页已失去编辑权，请重新读取");
    if (control.version !== expected.version)
      throw conflict("草稿版本已变化，请重新读取，避免覆盖已保存内容");
  }
  return {
    /** 仅读取无填写内容的控制记录，周期续租不重复加载图片。
     * @returns {Promise<object>} 当前代次、版本与租约
     */
    getControl() {
      return transaction("readonly", (st, photos, control) => control);
    },
    /** 读取文字与图片，原图只在本地读取。
     * @returns {Promise<object>} 控制记录及完整草稿
     */
    load() {
      return transaction("readonly", async (st, photos, control) => {
        const draft = await requested(st.get("draft"));
        if (draft)
          draft.photos = (await requested(photos.getAll())).map(decodePhoto);
        return { control, draft: draft || null };
      });
    },
    /** 仅在没有其他有效租约时取得写入权。
     * @param {number} generation 已读取代次
     * @returns {Promise<object>} 当前控制记录及是否取得编辑权
     */
    claim(generation) {
      return transaction("readwrite", (st, photos, control) => {
        if (control.generation !== generation)
          throw conflict("草稿已清除，请重新读取");
        const acquired =
          control.owner === owner ||
          !control.owner ||
          control.leaseUntil <= now();
        if (acquired) {
          control.owner = owner;
          control.leaseUntil = now() + LEASE_MS;
          st.put(control, "control");
        }
        return { control, acquired };
      });
    },
    /** 续期当前页面的租约，不能抢占他人已接管的草稿。
     * @param {object} expected 读取到的控制代次和版本
     * @returns {Promise<object>} 更新后的控制记录
     */
    renew(expected) {
      return transaction("readwrite", (st, photos, control) => {
        check(control, expected);
        control.leaseUntil = now() + LEASE_MS;
        st.put(control, "control");
        return control;
      });
    },
    /** 原子保存草稿，文本自动保存不会重写所有图片Blob。
     * @param {object} draft 已脱离Vue响应式代理的快照
     * @param {object} expected 控制代次和版本
     * @param {boolean} syncPhotos 是否同步图片存储
     * @returns {Promise<object>} 提交后的控制记录
     */
    async save(draft, expected, syncPhotos = false) {
      if (draft?.formatVersion !== 1 || !draft.ageConfirmedAt) {
        throw new Error("请先确认年龄后再保存");
      }
      const { photos: items, ...text } = draft;
      const encoded = syncPhotos ? await encodePhotos(items) : null;
      return transaction("readwrite", async (st, photos, control) => {
        // 转换图片期间租约可能已被接管，必须在真正写入的事务中重新验证。
        check(control, expected);
        const requests = [requested(st.put(text, "draft"))];
        if (syncPhotos) {
          requests.push(requested(photos.clear()));
          for (const item of encoded)
            requests.push(requested(photos.put(item)));
        }
        control.version++;
        control.leaseUntil = now() + LEASE_MS;
        requests.push(requested(st.put(control, "control")));
        await Promise.all(requests);
        return control;
      });
    },
    /** 原子删除内容并保留不含个人信息的失效代次，阻止旧任务重建数据。
     * @param {object} expected 当前代次和版本
     * @returns {Promise<object>} 清理后的控制记录
     */
    clear(expected) {
      return transaction("readwrite", (st, photos, control) => {
        check(control, expected);
        st.delete("draft");
        photos.clear();
        const next = {
          generation: control.generation + 1,
          version: 0,
          owner: null,
          leaseUntil: 0,
        };
        st.put(next, "control");
        return next;
      });
    },
    /** 页面离开时释放自己的租约，不影响其他标签页。
     * @returns {Promise<void>} 释放完成
     */
    async release() {
      await transaction("readwrite", (st, photos, control) => {
        if (control.owner === owner) {
          control.owner = null;
          control.leaseUntil = 0;
          st.put(control, "control");
        }
      });
    },
    /** 关闭数据库连接。
     * @returns {void} 无返回值
     */
    close() {
      db.close();
    },
  };
}
