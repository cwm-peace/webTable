/** 失焦即时校验、错误分组聚合与界面偏好持久化的单元测试。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBasicField,
  summarizeIssues,
  validateRevision,
  newDraft,
} from "../src/lib/formValidation.js";
import {
  GROUPS_STORAGE_KEY,
  loadOpenGroups,
  saveOpenGroups,
} from "../src/lib/uiState.js";

/** 简易 Storage 模拟，只实现本次测试用到的方法。 */
function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
}

test("单字段校验：必填、空白与不可见字符", () => {
  assert.match(validateBasicField("name", ""), /请填写/);
  assert.match(validateBasicField("name", "   \u200b  "), /请填写/);
  assert.equal(validateBasicField("name", "阿测"), "");
});

test("单字段校验：超长与未知键名", () => {
  const over = "字".repeat(101);
  assert.match(validateBasicField("name", over), /最多/);
  assert.equal(validateBasicField("not-a-field", "任意"), "");
  assert.equal(validateBasicField("", "任意"), "");
});

test("单字段校验：电话、QQ、数字字段的格式与“无”豁免", () => {
  assert.match(validateBasicField("phone", "abc"), /电话/);
  assert.match(validateBasicField("phone", "123"), /电话/);
  assert.equal(validateBasicField("phone", "13800000000"), "");
  assert.equal(validateBasicField("phone", "无"), "");
  assert.match(validateBasicField("qq", "0123"), /QQ/);
  assert.equal(validateBasicField("qq", "123456"), "");
  assert.match(validateBasicField("height", "-5"), /非负数/);
  assert.match(validateBasicField("height", "一百八"), /非负数/);
  assert.equal(validateBasicField("height", "180"), "");
  assert.equal(validateBasicField("height", "61.5"), "");
  assert.equal(validateBasicField("height", "不适用"), "");
});

test("单字段校验与整表校验规则一致", () => {
  const draft = newDraft();
  draft.ageConfirmedAt = Date.now();
  draft.basicInfo.phone = "abc";
  const issue = validateRevision(draft).find((item) => item.id === "basic-phone");
  assert.equal(issue.message, validateBasicField("phone", "abc"));
});

test("错误聚合：空列表、排序、计数与首项", () => {
  assert.deepEqual(summarizeIssues([]), []);
  assert.deepEqual(summarizeIssues(null), []);
  const issues = [
    { step: 3, id: "photo-selfie-1", message: "c" },
    { step: 1, id: "basic-name", message: "a" },
    { step: 2, id: "grade-1", message: "b1" },
    { step: 2, id: "remark-1", message: "b2" },
  ];
  const groups = summarizeIssues(issues);
  assert.deepEqual(
    groups.map((group) => [group.step, group.label, group.count]),
    [
      [1, "基础信息", 1],
      [2, "喜好自评", 2],
      [3, "照片及导出", 1],
    ],
  );
  assert.equal(groups[1].first.id, "grade-1");
  assert.equal(groups[1].issues.length, 2);
});

test("错误聚合：未知步骤归入“其他”且排在最后", () => {
  const groups = summarizeIssues([
    { step: 9, id: "x", message: "m" },
    { step: 1, id: "basic-name", message: "a" },
  ]);
  assert.equal(groups[0].step, 1);
  assert.equal(groups[1].step, 0);
  assert.equal(groups[1].label, "其他");
  assert.equal(summarizeIssues([{ id: "y", message: "m" }])[0].label, "其他");
});

test("分组展开持久化：缺省、损坏数据与类型过滤", () => {
  assert.deepEqual([...loadOpenGroups(mockStorage(), "g-1")], ["g-1"]);
  assert.deepEqual(
    [...loadOpenGroups(mockStorage({ [GROUPS_STORAGE_KEY]: "not-json" }), "g-1")],
    ["g-1"],
  );
  assert.deepEqual(
    [
      ...loadOpenGroups(
        mockStorage({ [GROUPS_STORAGE_KEY]: '{"a":1}' }),
        "g-1",
      ),
    ],
    ["g-1"],
  );
  const mixed = mockStorage({
    [GROUPS_STORAGE_KEY]: JSON.stringify(["a", 1, "", "a", null, "b"]),
  });
  assert.deepEqual([...loadOpenGroups(mixed, "g-1")], ["a", "b"]);
  // 空数组没有可用键，回退默认分组
  const empty = mockStorage({ [GROUPS_STORAGE_KEY]: "[]" });
  assert.deepEqual([...loadOpenGroups(empty, "g-1")], ["g-1"]);
});

test("分组展开持久化：往返一致、去重、上限与存储异常静默", () => {
  const storage = mockStorage();
  saveOpenGroups(storage, ["x", "y", "x"]);
  assert.deepEqual([...loadOpenGroups(storage, "g-1")], ["x", "y"]);
  const many = Array.from({ length: 100 }, (_, index) => `g-${index}`);
  saveOpenGroups(storage, many);
  assert.equal(loadOpenGroups(storage, "g-1").size, 64);
  // 存储抛错（隐私模式）不应中断填写
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.deepEqual([...loadOpenGroups(broken, "g-1")], ["g-1"]);
  saveOpenGroups(broken, ["x"]);
  saveOpenGroups(null, ["x"]);
  assert.deepEqual([...loadOpenGroups(null, "g-1")], ["g-1"]);
});
