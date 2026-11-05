export const TAWK_WIDGET_URL = "https://embed.tawk.to/6aeae0a2dad6cf3c2ea6cd1c/1k6inqv68";
export const TAWK_SCRIPT_ID = "attelier-tawk-widget-script";

const STATE_KEY = "__ATTELIER_TAWK_WIDGET_STATE__";

export function isAdminPath(pathname) {
  const normalizedPath = pathname.toLowerCase();
  return normalizedPath === "/admin" || normalizedPath.startsWith("/admin/");
}

function getState(browserWindow) {
  browserWindow[STATE_KEY] ||= {
    desiredVisible: true,
    lastAppliedVisibility: null,
    loadPromise: null,
    script: null,
    onLoadInstalled: false,
  };
  return browserWindow[STATE_KEY];
}

function applyVisibility(browserWindow, state) {
  const api = browserWindow.Tawk_API;
  if (!api) return false;

  const method = state.desiredVisible ? "showWidget" : "hideWidget";
  if (typeof api[method] !== "function") return false;
  if (state.lastAppliedVisibility === state.desiredVisible) return true;

  try {
    api[method]();
    state.lastAppliedVisibility = state.desiredVisible;
    return true;
  } catch {
    return false;
  }
}

function installLoadHandler(browserWindow, state) {
  const api = browserWindow.Tawk_API ||= {};
  if (state.onLoadInstalled) return;

  const previousHandler = api.onLoad;
  api.onLoad = function onTawkLoad(...args) {
    try {
      if (typeof previousHandler === "function") previousHandler.apply(this, args);
    } catch {
      // Keep a pre-existing Tawk callback from blocking this widget's visibility sync.
    }
    applyVisibility(browserWindow, state);
  };
  state.onLoadInstalled = true;
}

export function setTawkVisibility(visible) {
  if (typeof window === "undefined") return false;
  const state = getState(window);
  state.desiredVisible = Boolean(visible);
  return applyVisibility(window, state);
}

export function syncTawkRoute(pathname) {
  const isAdmin = isAdminPath(pathname);
  setTawkVisibility(!isAdmin);
  return isAdmin ? Promise.resolve(false) : initializeTawk();
}

function findExistingScript(documentRef) {
  const byId = documentRef.getElementById(TAWK_SCRIPT_ID);
  if (byId) return byId;

  return Array.from(documentRef.querySelectorAll("script[src]"))
    .find((script) => script.src === TAWK_WIDGET_URL || script.getAttribute("src") === TAWK_WIDGET_URL) || null;
}

export function initializeTawk() {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);

  const browserWindow = window;
  const documentRef = document;
  const state = getState(browserWindow);
  installLoadHandler(browserWindow, state);

  if (state.loadPromise) return state.loadPromise;
  if (typeof browserWindow.Tawk_API?.showWidget === "function" || typeof browserWindow.Tawk_API?.hideWidget === "function") {
    applyVisibility(browserWindow, state);
    state.loadPromise = Promise.resolve(true);
    return state.loadPromise;
  }

  const existingScript = findExistingScript(documentRef);
  if (existingScript) {
    state.script = existingScript;
    state.loadPromise = Promise.resolve(true);
    return state.loadPromise;
  }

  const script = documentRef.createElement("script");
  script.id = TAWK_SCRIPT_ID;
  script.async = true;
  script.src = TAWK_WIDGET_URL;
  script.charset = "UTF-8";
  script.setAttribute("crossorigin", "*");
  state.script = script;

  state.loadPromise = new Promise((resolve) => {
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      applyVisibility(browserWindow, state);
      resolve(true);
    };
    const onError = () => {
      cleanup();
      state.loadPromise = null;
      state.script = null;
      script.remove();
      resolve(false);
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    try {
      documentRef.head.appendChild(script);
    } catch {
      onError();
    }
  });

  return state.loadPromise;
}
