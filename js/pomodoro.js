(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Pomodoro = api;
})(typeof window !== "undefined" ? window : null, function () {
  const RUNTIME_KEY = "cat-newsroom-pomodoro-runtime-v1";
  const COMPLETED_KEY = "cat-newsroom-pomodoro-completed-v1";
  const FOCUS_SEC = 25 * 60;
  const BREAK_SEC = 5 * 60;

  const makeId = () => `pomo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function createRunning(phase = "focus", now = Date.now(), focusRecord = null) {
    const durationSec = phase === "break" ? BREAK_SEC : FOCUS_SEC;
    return {
      version: 1,
      id: makeId(),
      phase,
      status: "running",
      durationSec,
      startedAt: now,
      endsAt: now + durationSec * 1000,
      pausedRemainSec: null,
      focusRecord,
    };
  }

  function remainingSec(state, now = Date.now()) {
    if (!state) return FOCUS_SEC;
    if (state.status === "paused") return Math.max(0, state.pausedRemainSec || 0);
    return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  }

  function pause(state, now = Date.now()) {
    return { ...state, status: "paused", pausedRemainSec: remainingSec(state, now), endsAt: null };
  }

  function resume(state, now = Date.now()) {
    const remain = Math.max(0, state.pausedRemainSec || 0);
    return { ...state, status: "running", endsAt: now + remain * 1000, pausedRemainSec: null };
  }

  function progress(state, now = Date.now()) {
    if (!state) return 0;
    return Math.min(1, Math.max(0, 1 - remainingSec(state, now) / state.durationSec));
  }

  function formatTime(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  function readJson(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }

  function mount(options = {}) {
    const storage = options.storage || window.localStorage;
    const originalTitle = document.title;
    let state = readJson(storage, RUNTIME_KEY, null);
    let timer = null;
    let completing = false;

    const style = document.createElement("style");
    style.textContent = `
      body.pomodoro-active { overflow:hidden; }
      .focus-mode { position:fixed; inset:0; z-index:9999; display:none; align-items:center; justify-content:center; padding:24px; color:#f7f0df; background:#202923; }
      .focus-mode.show { display:flex; }
      .focus-shell { width:min(620px,100%); text-align:center; }
      .focus-kicker { font-size:12px; font-weight:800; letter-spacing:.14em; opacity:.68; }
      .focus-title { margin:10px 0 28px; font-size:clamp(18px,4vw,28px); font-weight:750; overflow-wrap:anywhere; }
      .focus-ring { width:min(72vw,330px); aspect-ratio:1; margin:auto; padding:12px; border-radius:50%; background:conic-gradient(#e6b877 var(--focus-progress),rgba(255,255,255,.12) 0); }
      .focus-ring-inner { width:100%; height:100%; border-radius:50%; display:grid; place-items:center; background:#202923; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
      .focus-time { font-size:clamp(58px,15vw,104px); font-weight:800; font-variant-numeric:tabular-nums; line-height:1; }
      .focus-status { margin-top:10px; font-size:14px; opacity:.7; }
      .focus-actions { display:flex; justify-content:center; flex-wrap:wrap; gap:10px; margin-top:30px; }
      .focus-actions button { min-height:44px; padding:0 18px; border:1px solid rgba(255,255,255,.22); border-radius:8px; color:#f7f0df; background:transparent; cursor:pointer; }
      .focus-actions .primary { color:#202923; border-color:#f7f0df; background:#f7f0df; font-weight:750; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "focus-mode";
    overlay.innerHTML = `<div class="focus-shell">
      <div class="focus-kicker" id="focus-kicker">POMODORO · 专注</div>
      <div class="focus-title" id="focus-title">把注意力留给此刻</div>
      <div class="focus-ring" id="focus-ring"><div class="focus-ring-inner"><div><div class="focus-time" id="focus-time">25:00</div><div class="focus-status" id="focus-status">准备开始</div></div></div></div>
      <div class="focus-actions"><button type="button" class="primary" id="focus-toggle">暂停</button><button type="button" id="focus-stop">结束本轮</button><button type="button" id="focus-hide">返回工作台</button></div>
    </div>`;
    document.body.appendChild(overlay);

    const timeEl = overlay.querySelector("#focus-time");
    const statusEl = overlay.querySelector("#focus-status");
    const kickerEl = overlay.querySelector("#focus-kicker");
    const titleEl = overlay.querySelector("#focus-title");
    const toggleEl = overlay.querySelector("#focus-toggle");
    const ringEl = overlay.querySelector("#focus-ring");

    function writeState(next) {
      state = next;
      if (state) storage.setItem(RUNTIME_KEY, JSON.stringify(state));
      else storage.removeItem(RUNTIME_KEY);
      render();
    }

    function show() {
      overlay.classList.add("show");
      document.body.classList.add("pomodoro-active");
    }

    function hide() {
      overlay.classList.remove("show");
      document.body.classList.remove("pomodoro-active");
      document.title = originalTitle;
    }

    async function complete() {
      if (!state || completing) return;
      completing = true;
      const completed = readJson(storage, COMPLETED_KEY, []);
      const firstCompletion = !completed.includes(state.id);
      if (firstCompletion) {
        completed.push(state.id);
        storage.setItem(COMPLETED_KEY, JSON.stringify(completed.slice(-80)));
        if (state.phase === "focus") await options.onComplete?.(state.durationSec);
      }
      const finishedPhase = state.phase;
      writeState(null);
      hide();
      completing = false;
      if (finishedPhase === "focus" && window.confirm("本轮专注完成，开始 5 分钟休息？")) start("break");
    }

    function render() {
      if (!state) {
        options.onState?.(null);
        return;
      }
      const remain = remainingSec(state);
      const phaseName = state.phase === "break" ? "休息" : "专注";
      timeEl.textContent = formatTime(remain);
      statusEl.textContent = state.status === "paused" ? `${phaseName}已暂停` : `${phaseName}中`;
      kickerEl.textContent = state.phase === "break" ? "POMODORO · 休息" : "POMODORO · 专注";
      titleEl.textContent = state.focusRecord?.title || (state.phase === "break" ? "放松一下，准备下一轮" : "把注意力留给此刻");
      toggleEl.textContent = state.status === "paused" ? "继续" : "暂停";
      ringEl.style.setProperty("--focus-progress", `${Math.round(progress(state) * 360)}deg`);
      document.title = `${formatTime(remain)} · ${phaseName}中`;
      options.onState?.({ ...state, remain });
      if (remain <= 0) complete();
    }

    function start(phase = "focus", focusRecord = null) {
      writeState(createRunning(phase, Date.now(), focusRecord));
      show();
    }

    function toggle() {
      if (!state) return start("focus");
      writeState(state.status === "paused" ? resume(state) : pause(state));
      show();
    }

    function stop() {
      writeState(null);
      hide();
    }

    toggleEl.addEventListener("click", () => writeState(state.status === "paused" ? resume(state) : pause(state)));
    overlay.querySelector("#focus-stop").addEventListener("click", () => {
      if (window.confirm("确定结束当前计时？本轮不会计为完整番茄。")) { writeState(null); hide(); }
    });
    overlay.querySelector("#focus-hide").addEventListener("click", hide);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && overlay.classList.contains("show")) hide(); });
    window.addEventListener("storage", event => {
      if (event.key === RUNTIME_KEY) { state = readJson(storage, RUNTIME_KEY, null); state ? show() : hide(); render(); }
    });

    timer = window.setInterval(render, 500);
    if (state) { show(); render(); }
    return { start, toggle, stop, show, hide, getState: () => state, destroy: () => window.clearInterval(timer) };
  }

  return { RUNTIME_KEY, COMPLETED_KEY, FOCUS_SEC, BREAK_SEC, createRunning, remainingSec, pause, resume, progress, formatTime, mount };
});
