const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../js/api-client.js");

test("API 客户端解析成功 JSON 并发送超时信号", async () => {
  let request;
  const result = await api.requestJson({
    url: "https://example.test/function",
    body: { force: true },
    timeoutMs: 100,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ report: { editor_note: "ok" } }), { status: 200 });
    },
  });
  assert.deepEqual(result, { report: { editor_note: "ok" } });
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.signal.aborted, false);
});

test("API 客户端保留服务端错误信息", async () => {
  await assert.rejects(() => api.requestJson({
    url: "https://example.test/function",
    fetchImpl: async () => new Response(JSON.stringify({ error: "未配置 AIXLUV_API_KEY" }), { status: 500 }),
  }), /未配置 AIXLUV_API_KEY/);
});

test("API 客户端把超时转换成可行动的错误", async () => {
  await assert.rejects(() => api.requestJson({
    url: "https://example.test/function",
    timeoutMs: 1,
    fetchImpl: (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); });
    }),
  }), /请求超时/);
});
