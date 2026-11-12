// A second allowlist at the presentation boundary keeps unexpected bridge fields out of copies.
const pick = (value, allowed) => allowed.includes(value) ? value : 'unknown';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 'unknown';
const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : '未记录';
const flag = value => value === true ? '是' : value === false ? '否' : '未知';

export function formatSyncDiagnostics(snapshot) {
  if (!snapshot) return '同步诊断：同步脚本未就绪，未启动认证或联网检测。';
  const env = snapshot.environment || {};
  const queue = snapshot.queue || {};
  const error = snapshot.error;
  return [
    '同步诊断（只读脱敏快照）',
    `采集时间：${time(snapshot.capturedAt)}；最近同步：${time(snapshot.lastSyncAt)}`,
    `状态：${pick(snapshot.status, ['offline', 'connecting', 'online', 'error'])}；客户端就绪：${flag(snapshot.clientReady)}；会话：${pick(snapshot.session, ['none', 'anonymous', 'account'])}`,
    `环境：网络在线提示=${flag(env.online)}；安全上下文=${flag(env.secure)}；协议=${pick(env.protocol, ['https:', 'http:', 'file:'])}`,
    `队列（本机全部归属）：存储=${pick(queue.storage, ['ok', 'invalid', 'unavailable'])}；总数=${count(queue.total)}；记录=${count(queue.record)}；删除=${count(queue.delete)}；元数据=${count(queue.meta)}；其他=${count(queue.other)}；当前账号=${count(queue.currentAccount)}；其他账号=${count(queue.otherAccount)}；无归属=${count(queue.unowned)}`,
    error ? `最近捕获错误：阶段=${pick(error.stage, ['auth_init', 'full_sync', 'outbox', 'access_token', 'settings'])}；类别=${pick(error.category, ['auth', 'permission', 'rate_limit', 'timeout', 'server', 'conflict', 'network'])}；代码=${pick(error.code, ['401', '403', '408', '429', '500', '502', '503', '504', '42501', '23505', 'PGRST301', 'refresh_token_not_found', 'refresh_token_already_used'])}；时间=${time(error.at)}` : '最近捕获错误：本页尚未记录（不代表从未出错）',
    '仅保留本页最近一次捕获错误，刷新后清空；网络在线提示不代表云端可达。未登录时当前账号计数为 0，有归属项计入其他账号；存储异常时队列数量不可据此判断。',
  ].join('\n');
}

export function readSyncDiagnostics(host = globalThis.window) {
  try {
    return formatSyncDiagnostics(typeof host?.getSyncDiagnostics === 'function' ? host.getSyncDiagnostics() : null);
  } catch (_) {
    return '同步诊断：本地快照暂不可用，未执行修复或联网检测。';
  }
}
