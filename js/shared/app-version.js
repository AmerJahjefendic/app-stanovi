/**
 * Central release metadata for AppStanovi.
 *
 * APP_VERSION is the user-facing application version.
 * APP_SHELL_REVISION is an internal cache generation for deployments that
 * change precached files without changing the public application version.
 *
 * Normally APP_SHELL_REVISION changes only during development/hotfixes within
 * the same APP_VERSION. A normal new release changes APP_VERSION and may reset
 * APP_SHELL_REVISION to "1".
 */
globalThis.APPSTANOVI_APP_VERSION = "1.5.0";
globalThis.APPSTANOVI_APP_SHELL_REVISION = "2";
