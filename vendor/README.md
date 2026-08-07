# Local SheetJS dependency

AppStanovi v1.4.0 uses the same SheetJS build that was previously loaded from jsDelivr:

- package: `xlsx`
- version: `0.18.5`
- file: `dist/xlsx.full.min.js`

The runtime file `vendor/xlsx.full.min.js` must be present before testing or deploying the PWA. It is intentionally local so XLSX import remains available offline and is part of the atomic app-shell cache.
