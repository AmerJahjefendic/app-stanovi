import { exportBackupFile, restoreBackupFileAtomic } from "../backup/backup.service.js";
import { printMonthlyReport } from "./report-print.action.js";
import { loadReportContext } from "./report-context.js";

const btnPrint = document.getElementById("morePrint");
const btnBackup = document.getElementById("moreBackup");
const btnRestore = document.getElementById("moreRestore");
const restoreInput = document.getElementById("moreRestoreInput");


btnPrint?.addEventListener("click", async () => {
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

btnBackup?.addEventListener("click", async () => {
  try {
    await exportBackupFile();
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    alert(err?.message || "Backup greška");
  }
});

btnRestore?.addEventListener("click", () => restoreInput?.click());

restoreInput?.addEventListener("change", async () => {
  const file = restoreInput.files?.[0];
  if (!file) return;
  try {
    const result = await restoreBackupFileAtomic(file);
    if (result) {
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
