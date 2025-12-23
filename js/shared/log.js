// js/shared/log.js
export const debug = (...args) => (localStorage.getItem("debug") === "1" ? console.log(...args) : null);
