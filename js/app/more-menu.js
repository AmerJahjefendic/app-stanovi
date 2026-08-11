import { exportBackupFile, restoreBackupFileAtomic } from "../backup/backup.service.js";
import { printMonthlyReport } from "./report-print.action.js";
import { loadReportContext } from "./report-context.js";

function createMenu() {
  if (document.getElementById("moreMenuOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "moreMenuOverlay";
  overlay.className = "moreMenuOverlay";
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="moreMenuPanel" role="dialog" aria-modal="true" aria-label="Više">
      <div class="moreMenuHeader">
        <div>
          <div class="moreMenuTitle">Više</div>
          <div class="moreMenuSubtitle">Dodatne opcije</div>
        </div>
        <button class="moreMenuClose" type="button" aria-label="Zatvori">×</button>
      </div>

      <div class="moreMenuSectionLabel">PODACI</div>

      <a class="moreMenuItem" href="index.html#open-import">
        <span class="moreMenuIcon">↑</span><span>Import Troškovnik (XLSX)</span><span class="moreMenuChevron">›</span>
      </a>

      <button class="moreMenuItem" type="button" data-action="print">
        <span class="moreMenuIcon">▣</span><span>PDF / Print izvještaj</span><span class="moreMenuChevron">›</span>
      </button>

      <button class="moreMenuItem" type="button" data-action="backup">
        <span class="moreMenuIcon">↓</span><span>Backup</span><span class="moreMenuChevron">›</span>
      </button>

      <button class="moreMenuItem" type="button" data-action="restore">
        <span class="moreMenuIcon">↻</span><span>Restore</span><span class="moreMenuChevron">›</span>
      </button>

      <div class="moreMenuSectionLabel moreMenuSystemLabel">SISTEM</div>

      <a class="moreMenuItem" href="settings.html">
        <span class="moreMenuIcon">⚙</span><span>Settings — apartmani, provizije</span><span class="moreMenuChevron">›</span>
      </a>

      <input id="moreMenuRestoreInput" type="file" accept=".json,application/json" hidden />
    </div>
  `;

  document.body.appendChild(overlay);

  const panel = overlay.querySelector(".moreMenuPanel");
  const closeBtn = overlay.querySelector(".moreMenuClose");
  const restoreInput = overlay.querySelector("#moreMenuRestoreInput");

  const close = () => {
    overlay.hidden = true;
    document.body.classList.remove("moreMenuOpen");
    document.querySelectorAll('[data-more-trigger="true"]').forEach((el) => el.classList.remove("is-menu-open"));
  };

  const open = () => {
    overlay.hidden = false;
    document.body.classList.add("moreMenuOpen");
    document.querySelectorAll('[data-more-trigger="true"]').forEach((el) => el.classList.add("is-menu-open"));
  };

  const toggle = () => overlay.hidden ? open() : close();

  document.querySelectorAll('a[href="more.html"]').forEach((trigger) => {
    trigger.dataset.moreTrigger = "true";
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      toggle();
    });
  });

  closeBtn?.addEventListener("click", close);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  panel?.addEventListener("click", (event) => event.stopPropagation());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });

  overlay.querySelector('[data-action="print"]')?.addEventListener("click", async () => {
    close();

    const returnToOverview = () => {
      window.location.href = "index.html";
    };

    window.addEventListener("afterprint", returnToOverview, { once: true });

    try {
      const context = loadReportContext();
      await printMonthlyReport(context || {});
    } catch (err) {
      window.removeEventListener("afterprint", returnToOverview);
      console.error(err);
      alert(err?.message || "Greška prilikom pripreme PDF-a.");
    }
  });

  overlay.querySelector('[data-action="backup"]')?.addEventListener("click", async () => {
    try {
      await exportBackupFile();
      close();
      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      alert(err?.message || "Backup greška");
    }
  });

  overlay.querySelector('[data-action="restore"]')?.addEventListener("click", () => {
    restoreInput?.click();
  });

  restoreInput?.addEventListener("change", async () => {
    const file = restoreInput.files?.[0];
    if (!file) return;

    try {
      const result = await restoreBackupFileAtomic(file);
      if (result) {
        close();
        alert("Restore je uspješno završen.");
        window.location.href = "index.html";
      }
    } catch (err) {
      console.error(err);
      alert(err?.message || "Restore greška");
    } finally {
      restoreInput.value = "";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", createMenu, { once: true });
} else {
  createMenu();
}
