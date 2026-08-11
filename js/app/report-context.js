const STORAGE_KEY = "appstanovi-report-context-v1";

export function saveReportContext({ selectedPeriodKey, aptFilter }) {
  try {
    const payload = {
      selectedPeriodKey: typeof selectedPeriodKey === "string" ? selectedPeriodKey : null,
      aptFilter: typeof aptFilter === "string" && aptFilter ? aptFilter : "ALL",
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function loadReportContext() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const selectedPeriodKey = /^(\d{4})-(\d{2})$/.test(String(parsed?.selectedPeriodKey || ""))
      ? String(parsed.selectedPeriodKey)
      : null;
    const aptFilter = typeof parsed?.aptFilter === "string" && parsed.aptFilter
      ? parsed.aptFilter
      : "ALL";
    return { selectedPeriodKey, aptFilter };
  } catch {
    return null;
  }
}
