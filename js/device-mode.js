(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DeviceMode = api;
})(typeof window !== "undefined" ? window : null, function () {
  const MODE_KEY = "cat-newsroom-ui-mode-v1";
  const VIEW_KEY = "cat-newsroom-last-view-v1";
  const VALID_MODES = new Set(["auto", "desktop", "mobile"]);

  function resolveMode(options = {}) {
    const preference = VALID_MODES.has(options.preference) ? options.preference : "auto";
    if (preference !== "auto") return preference;
    const width = Number(options.width || 0);
    return width <= 820 || (Boolean(options.coarsePointer) && width <= 1024) ? "mobile" : "desktop";
  }

  function getPreference(storage = window.localStorage) {
    const value = storage.getItem(MODE_KEY);
    return VALID_MODES.has(value) ? value : "auto";
  }

  function getCurrentMode() {
    return resolveMode({
      preference: getPreference(),
      width: window.innerWidth,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    });
  }

  function pageFor(mode) {
    return mode === "mobile" ? "workbench-mobile.html" : "workbench-desktop.html";
  }

  function saveView(view, storage = window.sessionStorage) {
    if (view) storage.setItem(VIEW_KEY, view);
  }

  function restoreView(storage = window.sessionStorage) {
    return storage.getItem(VIEW_KEY) || "home";
  }

  function setPreference(mode, view) {
    if (!VALID_MODES.has(mode)) return false;
    window.localStorage.setItem(MODE_KEY, mode);
    saveView(view);
    const resolved = getCurrentMode();
    window.location.assign(pageFor(resolved));
    return true;
  }

  function redirectFromEntry() {
    window.location.replace(pageFor(getCurrentMode()));
  }

  function redirectIfNeeded(currentMode) {
    const target = getCurrentMode();
    if (target === currentMode) return false;
    window.location.replace(pageFor(target));
    return true;
  }

  function mountSwitcher(container, currentMode, getView) {
    if (!container) return;
    const preference = getPreference();
    container.innerHTML = `<div class="device-switcher" aria-label="界面模式">
      <span class="device-switcher-label">界面</span>
      <div class="device-switcher-options">
        ${["auto", "desktop", "mobile"].map(mode => `<button type="button" data-device-mode="${mode}" class="${preference === mode ? "on" : ""}">${mode === "auto" ? `自动·${currentMode === "mobile" ? "移动" : "桌面"}` : mode === "desktop" ? "桌面" : "移动"}</button>`).join("")}
      </div>
    </div>`;
    container.querySelectorAll("[data-device-mode]").forEach(button => {
      button.addEventListener("click", () => setPreference(button.dataset.deviceMode, getView?.()));
    });
  }

  return {
    MODE_KEY,
    VIEW_KEY,
    resolveMode,
    getPreference,
    getCurrentMode,
    pageFor,
    saveView,
    restoreView,
    setPreference,
    redirectFromEntry,
    redirectIfNeeded,
    mountSwitcher,
  };
});
