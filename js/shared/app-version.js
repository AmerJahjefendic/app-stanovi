/**
 * Single source of truth for the AppStanovi application version.
 *
 * Kept as a classic script so both window contexts and the classic
 * service worker can load the same value without duplicating it.
 */
globalThis.APPSTANOVI_APP_VERSION = "1.4.0";
