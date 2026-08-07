import { DB_VER } from "../db/db.js";

const version = String(globalThis.APPSTANOVI_APP_VERSION || "—");
const shellRevision = String(globalThis.APPSTANOVI_APP_SHELL_REVISION || "—");

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.navigator.standalone === true;
}

function renderStaticInfo() {
  setText("appInfoVersion", `v${version}`);
  setText("appInfoShell", `${version}-r${shellRevision}`);
  setText("appInfoDb", String(DB_VER));
}

async function renderPwaStatus() {
  if (!("serviceWorker" in navigator)) {
    setText("appInfoPwa", "Service Worker nije podržan");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const controlled = Boolean(navigator.serviceWorker.controller);
    const mode = isStandalone() ? "Standalone" : "Browser";
    const offlineReady = registration?.active && controlled;

    setText(
      "appInfoPwa",
      offlineReady ? `${mode} · Offline spremno` : `${mode} · Inicijalizacija PWA`
    );
  } catch {
    setText("appInfoPwa", "PWA status nije dostupan");
  }
}

renderStaticInfo();
void renderPwaStatus();

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  void renderPwaStatus();
});
