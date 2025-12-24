import { LS_KEYS } from "./constants.js";

export function getShareRule() {
  const v = localStorage.getItem(LS_KEYS.shareRule);
  return v === "INCOME" ? "INCOME" : "NIGHTS";
}

export function setShareRule(v) {
  const val = (v === "INCOME" || v === "NIGHTS" || v === "HALF") ? v : "NIGHTS";
  localStorage.setItem(LS_KEYS.shareRule, val);
  // obavijesti druge stranice/tabove
  window.dispatchEvent(new StorageEvent("storage", { key: LS_KEYS.shareRule, newValue: val }));
}
