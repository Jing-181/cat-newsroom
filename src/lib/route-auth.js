// Full cleanup/activation policy, not a callback detection rule; metadata keys are common app queries.
export const AUTH_CALLBACK_KEYS = Object.freeze(['code','access_token','refresh_token','provider_token','provider_refresh_token','token_type','expires_in','expires_at','type','error','error_description','error_code']);
export function hasAuthCallback(location) {
  const query = new URLSearchParams(location.search || '');
  const rawHash = location.hash || '';
  const hash = new URLSearchParams(rawHash.startsWith('#/') ? '' : rawHash.replace(/^#/, ''));
  const credentials = ['code','access_token','refresh_token','provider_token','provider_refresh_token'];
  if (credentials.some(key => query.has(key) || hash.has(key))) return true;
  // Supabase implicit errors use the raw fragment. Never interpret routed hash queries.
  if (hash.has('error') || hash.has('error_description')) return true;
  // A generic ?error=... belongs to the app unless it is a structured OAuth error.
  const oauthErrors = ['access_denied','invalid_request','unauthorized_client','unsupported_response_type','invalid_scope','server_error','temporarily_unavailable'];
  return oauthErrors.includes(query.get('error')) && (query.has('error_description') || query.has('error_code'));
}
export async function settleAuthCallback({ location, initialize, beforeActivate = () => {}, timeoutMs = 15000 }) {
  if (!hasAuthCallback(location)) return { callback: false, ready: true };
  const controller = new AbortController();
  let timer, accepted = false;
  try {
    const prepared = await Promise.race([
      Promise.resolve().then(() => initialize({ signal: controller.signal, callbackKeys: AUTH_CALLBACK_KEYS })).then(result => {
        if (controller.signal.aborted) { result?.cancel?.(); return false; }
        return result;
      }),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs); }),
    ]);
    clearTimeout(timer);
    if (!prepared || controller.signal.aborted) return { callback: true, ready: false };
    beforeActivate();
    const ready = typeof prepared.activate === 'function' ? prepared.activate() : prepared === true;
    accepted = Boolean(ready);
    return { callback: true, ready: accepted };
  } catch { return { callback: true, ready: false }; }
  finally { clearTimeout(timer); if (!accepted) controller.abort(); }
}
// Only called after SDK consumption succeeds. Never remove unrelated query parameters.
export function cleanAuthCallbackUrl(location) {
  const url = new URL(location.href);
  for (const key of AUTH_CALLBACK_KEYS) url.searchParams.delete(key);
  // Never carry a raw callback hash into the router, including malformed mixed fragments.
  url.hash = '/';
  return url.pathname + url.search + url.hash;
}
