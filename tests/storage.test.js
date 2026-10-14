/** 本机草稿事务回归：隔离数据库验证租约、并发、清除失效与原子写入。 */
import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { openRepository } from "../src/lib/storage.js";

/**
 * 为单项测试打开独立仓库并登记连接释放。
 * @param {import('node:test').TestContext} context 当前测试上下文。
 * @param {object} options owner、name 与可选测试时钟。
 * @returns {Promise<object>} 草稿仓库。
 */
async function repository(context, options = {}) {
  const store = await openRepository({
    owner: "page-a",
    name: `storage-${crypto.randomUUID()}`,
    ...options,
  });
  context.after(() => store.close());
  return store;
}

/**
 * 生成含原图及预览的虚构草稿。
 * @param {string} value 用于区分版本的文本内容。
 * @returns {object} 具有图片 Blob 的可保存草稿。
 */
function draft(value = "first") {
  return {
    formatVersion: 1,
    ageConfirmedAt: "2026-10-14T12:00:00.000Z",
    id: "synthetic-draft",
    basicInfo: { name: value },
    answers: [{ questionId: 1, grade: "A", remark: value }],
    photos: [
      {
        category: "selfie",
        slot: 1,
        blob: new Blob([value], { type: "image/png" }),
        previewBlob: new Blob([`preview-${value}`], { type: "image/jpeg" }),
      },
    ],
  };
}

test("only one simultaneous claimant can edit a shared draft", async (context) => {
  const name = `shared-${crypto.randomUUID()}`;
  const first = await repository(context, { name, owner: "first" });
  const second = await repository(context, { name, owner: "second" });
  const claims = await Promise.all([first.claim(0), second.claim(0)]);
  assert.equal(claims.filter((claim) => claim.acquired).length, 1);
  assert.equal(claims[0].control.owner, claims[1].control.owner);
  const loser = claims[0].acquired ? second : first;
  await assert.rejects(loser.save(draft(), claims[0].control, true), {
    status: 409,
  });
});

test("an expired lease can be recovered by the same page, while a takeover still rejects the former owner", async (context) => {
  let time = 1000;
  const name = `expiry-${crypto.randomUUID()}`;
  const first = await repository(context, {
    name,
    owner: "first",
    now: () => time,
  });
  const second = await repository(context, {
    name,
    owner: "second",
    now: () => time,
  });
  const claimed = await first.claim(0);
  time = claimed.control.leaseUntil;
  const renewed = await first.renew(claimed.control);
  assert.ok(renewed.leaseUntil > time);
  const saved = await first.save(draft("wake"), renewed, true);
  assert.equal(saved.version, 1);
  time = saved.leaseUntil;
  const takeover = await second.claim(0);
  assert.equal(takeover.acquired, true);
  await assert.rejects(first.renew(saved), { status: 409 });
  await assert.rejects(first.save(draft("stale"), saved, true), {
    status: 409,
  });
  await first.release();
  assert.equal((await second.load()).control.owner, "second");
});

test("renewal extends an active lease and explicit release allows another page", async (context) => {
  let time = 10;
  const name = `release-${crypto.randomUUID()}`;
  const first = await repository(context, {
    name,
    owner: "first",
    now: () => time,
  });
  const second = await repository(context, {
    name,
    owner: "second",
    now: () => time,
  });
  const claimed = await first.claim(0);
  time += 1000;
  const renewed = await first.renew(claimed.control);
  assert.ok(renewed.leaseUntil > claimed.control.leaseUntil);
  await first.release();
  assert.equal((await second.claim(0)).acquired, true);
});

test("concurrent writes carrying the same version cannot overwrite one another", async (context) => {
  const store = await repository(context);
  const { control } = await store.claim(0);
  const results = await Promise.allSettled([
    store.save(draft("first"), control, true),
    store.save(draft("second"), control, true),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.find((result) => result.status === "rejected").reason.status,
    409,
  );
  const loaded = await store.load();
  assert.equal(loaded.control.version, 1);
  assert.equal(loaded.draft.basicInfo.name, "first");
  assert.equal(await loaded.draft.photos[0].blob.text(), "first");
});

test("text saves retain image bytes and explicit image saves replace the slot set", async (context) => {
  const store = await repository(context);
  let { control } = await store.claim(0);
  control = await store.save(draft("original"), control, true);
  const textOnly = draft("edited");
  textOnly.photos = [];
  control = await store.save(textOnly, control, false);
  let loaded = await store.load();
  assert.equal(loaded.draft.basicInfo.name, "edited");
  assert.equal(await loaded.draft.photos[0].blob.text(), "original");
  assert.equal(
    await loaded.draft.photos[0].previewBlob.text(),
    "preview-original",
  );
  assert.equal(Object.hasOwn(loaded.draft.photos[0], "key"), false);
  control = await store.save(textOnly, control, true);
  loaded = await store.load();
  assert.deepEqual(loaded.draft.photos, []);
  assert.equal(loaded.control.version, control.version);
});

test("failed image writes roll back text, photos and version in the same transaction", async (context) => {
  const store = await repository(context);
  let { control } = await store.claim(0);
  control = await store.save(draft("original"), control, true);
  const invalid = draft("must-not-persist");
  invalid.photos[0].uncloneable = () => null;
  await assert.rejects(store.save(invalid, control, true), {
    name: "DataCloneError",
  });
  const loaded = await store.load();
  assert.equal(loaded.control.version, control.version);
  assert.equal(loaded.draft.basicInfo.name, "original");
  assert.equal(await loaded.draft.photos[0].blob.text(), "original");
});

test("clearing removes all content and blocks old saves, claims and renewals", async (context) => {
  const store = await repository(context);
  let { control } = await store.claim(0);
  control = await store.save(draft("private-value"), control, true);
  const next = await store.clear(control);
  assert.equal(next.generation, 1);
  assert.equal(next.version, 0);
  assert.equal(next.owner, null);
  assert.equal((await store.load()).draft, null);
  await assert.rejects(store.save(draft("resurrection"), control, true), {
    status: 409,
  });
  await assert.rejects(store.claim(control.generation), { status: 409 });
  await assert.rejects(store.renew(control), { status: 409 });
  const renewed = await store.claim(next.generation);
  await store.save(draft("new-draft"), renewed.control, true);
  await assert.rejects(store.save(draft("stale"), control, true), {
    status: 409,
  });
  assert.equal((await store.load()).draft.basicInfo.name, "new-draft");
});

test("queued clear commits before a delayed old-generation save", async (context) => {
  const store = await repository(context);
  let { control } = await store.claim(0);
  control = await store.save(draft(), control, true);
  const results = await Promise.allSettled([
    store.clear(control),
    store.save(draft("late-write"), control, true),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.status, 409);
  assert.equal((await store.load()).draft, null);
});

test("age confirmation and supported draft format are required before persistence", async (context) => {
  const store = await repository(context);
  const { control } = await store.claim(0);
  const missingAge = draft();
  missingAge.ageConfirmedAt = null;
  await assert.rejects(store.save(missingAge, control, true), /确认年龄/);
  const wrongFormat = draft();
  wrongFormat.formatVersion = 9;
  await assert.rejects(store.save(wrongFormat, control, true), /确认年龄/);
  assert.equal((await store.load()).draft, null);
  assert.equal((await store.load()).control.version, 0);
});

test("stored blobs survive closing and reopening the local repository", async (context) => {
  const name = `reopen-${crypto.randomUUID()}`;
  const first = await repository(context, { name });
  const { control } = await first.claim(0);
  await first.save(draft("restored"), control, true);
  await first.release();
  first.close();
  const reopened = await repository(context, { name, owner: "new-page" });
  const loaded = await reopened.load();
  assert.equal(loaded.draft.basicInfo.name, "restored");
  assert.equal(await loaded.draft.photos[0].blob.text(), "restored");
  assert.equal(
    (await reopened.claim(loaded.control.generation)).acquired,
    true,
  );
});

/**
 * 直接读取底层图片条目，验证持久化格式与公开加载结果不同。
 * @param {string} name 隔离测试数据库名称。
 * @param {Function} action 接收photos存储的同步事务操作。
 * @param {string} mode 事务模式。
 * @returns {Promise<unknown>} 操作请求的结果。
 */
async function rawPhotoTransaction(name, action, mode = "readonly") {
  const db = await new Promise((accept, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => accept(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((accept, reject) => {
      const transaction = db.transaction("photos", mode);
      let result;
      const request = action(transaction.objectStore("photos"));
      if (request)
        request.onsuccess = () => {
          result = request.result;
        };
      transaction.oncomplete = () => accept(result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
  } finally {
    db.close();
  }
}

/**
 * 为图片预转换注入可控延时，模拟缓慢设备读取图片。
 * @param {Blob} blob 原始图片。
 * @returns {{entered:Promise<void>,release:Function}} 进入读取的信号与恢复方法。
 */
function pauseBlobRead(blob) {
  const originalRead = blob.arrayBuffer.bind(blob);
  let release, entered;
  const gate = new Promise((accept) => {
    release = accept;
  });
  const started = new Promise((accept) => {
    entered = accept;
  });
  blob.arrayBuffer = async () => {
    entered();
    await gate;
    return originalRead();
  };
  return { entered: started, release };
}

test("photos persist as ArrayBuffers and restore exact bytes and MIME without internal fields", async (context) => {
  const name = `bytes-${crypto.randomUUID()}`;
  const store = await repository(context, { name });
  const { control } = await store.claim(0);
  const value = draft("binary");
  value.photos[0].blob = new File(
    [new Uint8Array([0, 255, 1, 254])],
    "raw.png",
    { type: "image/png" },
  );
  await store.save(value, control, true);
  const [raw] = await rawPhotoTransaction(name, (photos) => photos.getAll());
  assert.ok(raw.blobBytes instanceof ArrayBuffer);
  assert.ok(raw.previewBytes instanceof ArrayBuffer);
  assert.equal(raw.blobType, "image/png");
  assert.equal(raw.previewType, "image/jpeg");
  assert.equal(Object.hasOwn(raw, "blob"), false);
  assert.equal(Object.hasOwn(raw, "previewBlob"), false);
  const photo = (await store.load()).draft.photos[0];
  assert.deepEqual(
    new Uint8Array(await photo.blob.arrayBuffer()),
    new Uint8Array([0, 255, 1, 254]),
  );
  assert.equal(photo.blob.type, "image/png");
  assert.equal(photo.previewBlob.type, "image/jpeg");
  for (const field of [
    "key",
    "blobBytes",
    "blobType",
    "previewBytes",
    "previewType",
  ])
    assert.equal(Object.hasOwn(photo, field), false);
});

test("legacy Blob records remain readable during the ArrayBuffer format transition", async (context) => {
  const name = `legacy-${crypto.randomUUID()}`;
  const store = await repository(context, { name });
  const { control } = await store.claim(0);
  const value = draft("legacy");
  await store.save(value, control, true);
  await rawPhotoTransaction(
    name,
    (photos) => photos.put({ ...value.photos[0], key: "selfie-1" }),
    "readwrite",
  );
  const photo = (await store.load()).draft.photos[0];
  assert.equal(await photo.blob.text(), "legacy");
  assert.equal(await photo.previewBlob.text(), "preview-legacy");
  assert.equal(photo.blob.type, "image/png");
});

test("failed byte conversion preserves the previous text, images and version", async (context) => {
  const store = await repository(context);
  let { control } = await store.claim(0);
  control = await store.save(draft("saved"), control, true);
  const broken = draft("must-not-write");
  broken.photos[0].blob.arrayBuffer = async () => {
    throw new Error("synthetic read failure");
  };
  await assert.rejects(
    store.save(broken, control, true),
    /synthetic read failure/,
  );
  const loaded = await store.load();
  assert.equal(loaded.control.version, control.version);
  assert.equal(loaded.draft.basicInfo.name, "saved");
  assert.equal(await loaded.draft.photos[0].blob.text(), "saved");
});

test("a new owner can claim while byte conversion runs and the former save is rejected", async (context) => {
  let time = 1000;
  const name = `convert-lease-${crypto.randomUUID()}`;
  const first = await repository(context, {
    name,
    owner: "first",
    now: () => time,
  });
  const second = await repository(context, {
    name,
    owner: "second",
    now: () => time,
  });
  const { control } = await first.claim(0);
  const slow = draft("stale");
  const gate = pauseBlobRead(slow.photos[0].blob);
  const pending = first.save(slow, control, true);
  await gate.entered;
  time = control.leaseUntil;
  const takeover = await second.claim(0);
  assert.equal(
    takeover.acquired,
    true,
    "conversion must not hold an IndexedDB write transaction",
  );
  gate.release();
  await assert.rejects(pending, { status: 409 });
  assert.equal((await second.load()).draft, null);
});

test("clear during byte conversion invalidates the delayed image save", async (context) => {
  const store = await repository(context);
  let { control } = await store.claim(0);
  control = await store.save(draft("original"), control, true);
  const slow = draft("stale");
  const gate = pauseBlobRead(slow.photos[0].blob);
  const pending = store.save(slow, control, true);
  await gate.entered;
  await store.clear(control);
  gate.release();
  await assert.rejects(pending, { status: 409 });
  assert.equal((await store.load()).draft, null);
});
