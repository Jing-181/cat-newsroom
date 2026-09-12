const test = require("node:test");
const assert = require("node:assert/strict");
const RecordMedia = require("../js/record-media.js");

test("默认配图会按模块和卡片样式给出稳定选择", () => {
  assert.equal(RecordMedia.defaultPresetId("checkin"), "window-cat");
  assert.equal(RecordMedia.defaultPresetId("sport"), "dumbbell-card");
  assert.equal(RecordMedia.defaultPresetId("note", "quote"), "quote-card");
});

test("记录未上传图片时回退到模块默认配图", () => {
  const image = RecordMedia.resolveRecordImage({ title: "散步", layout: "feature" }, "checkin");
  assert.match(image, /^data:image\/svg\+xml;charset=UTF-8,/);
  assert.equal(image, RecordMedia.getPreset("window-cat").src);
});

test("用户图片 URL 优先于默认配图", () => {
  const url = "https://example.com/photo.webp";
  assert.equal(RecordMedia.resolveRecordImage({ image: url, image_preset: "paper-note" }, "todo"), url);
});
