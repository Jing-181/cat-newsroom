/* 同步钩子桥接（经典脚本）：必须在 supabase-sync.js 之后、Vue 入口之前加载。
   supabase-sync.js 用顶层 let 声明两个空钩子，并在「全量同步完成」与「Realtime 收到远端变更」时回调：
   onSyncReady(cloudData) / onRemoteUpdate(change)。
   Vue 入口（src/main.js）是 ES module，执行时机晚于所有经典脚本，因此只能把回调挂到
   window.__onSyncReady / window.__onRemoteUpdate；这里用包装函数把两者接起来，
   转发时再读取 window 属性，所以不依赖两者的加载先后顺序。 */
(function (root) {
  if (!root) return;
  // supabase-sync.js 未加载或加载失败时静默跳过，不污染全局、不阻断页面
  if (typeof onSyncReady === "undefined" || typeof onRemoteUpdate === "undefined") return;

  onSyncReady = function (cloudData) {
    const handler = root.__onSyncReady;
    if (typeof handler !== "function") return;
    try {
      handler(cloudData);
    } catch (error) {
      // 渲染层异常不应被 supabase-sync 当成「同步失败」
      console.error("[sync-hooks] onSyncReady 处理失败:", error);
    }
  };

  onRemoteUpdate = function (change) {
    const handler = root.__onRemoteUpdate;
    if (typeof handler !== "function") return;
    try {
      handler(change);
    } catch (error) {
      console.error("[sync-hooks] onRemoteUpdate 处理失败:", error);
    }
  };
})(typeof window !== "undefined" ? window : null);
