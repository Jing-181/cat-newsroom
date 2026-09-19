(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ApiClient = api;
})(typeof window !== "undefined" ? window : null, function () {
  async function requestJson({ fetchImpl = fetch, url, headers = {}, body, timeoutMs = 45000 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {}),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error || payload?.message || `请求失败（${response.status}）`;
        throw new Error(String(message));
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("请求超时，请稍后重试；如果持续失败，请检查 AI 服务配置");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { requestJson };
});
