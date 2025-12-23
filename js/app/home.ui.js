// js/app/home.ui.js
import { periodKeyToYM } from "../shared/utils.js";
import { periodLabel } from "../shared/parseFilename.js";

export function setPickerLabel(btn, key) {
  if (!btn) return;
  btn.textContent = key ? periodLabel(periodKeyToYM(key)) : "—";
}

export function hidePops(els) {
  els.fromPop?.classList.add("is-hidden");
  els.toPop?.classList.add("is-hidden");
}

export function showPop(els, which) {
  hidePops(els);
  if (which === "FROM") els.fromPop?.classList.remove("is-hidden");
  if (which === "TO") els.toPop?.classList.remove("is-hidden");
}
