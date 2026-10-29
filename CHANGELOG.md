# Changelog

## 2026.1.0 - 2026-10-29

First version of the collector.

- `Export-VCFALedgerPackage.ps1` for VCF Automation 9.x VM Apps, Windows PowerShell 5.1
- Exports cloud templates (all versions), content sources, catalog items and custom forms, policies, subscriptions with their event topics, ABX actions with source, ABX action flows, property groups, custom resource types, resource actions and projects
- Login through `/cloudapi/1.0.0/sessions` (same as the config workbook collector), or an org API token with `-UseApiToken`
- `-Select` to pick objects, with related objects added automatically
- Links between objects recorded in `manifest.json`
- Output: `VM Apps - <org>\<org>_<yyyymmdd>` folder plus `.vcfapkg` zip, with an index suffix when a same-day export exists
- `.vcfapkg` format 1.0 documented in `docs/vcfapkg-format.md`
