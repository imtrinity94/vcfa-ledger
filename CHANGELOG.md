# Changelog

## 2026.3.0 - 2026-10-29

- Infrastructure configuration is now captured: **cloud accounts, cloud zones, image mappings, flavor mappings, network profiles, storage profiles and tags**, under `infrastructure/`
- Regions are saved as a reference (`infrastructure/regions.json`), and every zone and profile records its cloud account and region by name
- Network profiles also save the fabric networks they use and those networks' IP ranges (`infrastructure/fabric-networks.json`, `infrastructure/network-ip-ranges.json`)
- New links: template → image / flavor mapping it uses (`image:` / `flavor:` in the YAML), template → tags in its constraints (`needs-tag`), zone / profile / account → its capability tags (`has-tag`), zone / profile → cloud account (`in-account`)
- With `-Select`, picking a template also pulls in the image and flavor mappings it uses; tag and account links never pull objects in on their own

## 2026.2.0 - 2026-10-29

- Catalog item and content source icons are downloaded from `/icon/api/icons/<iconId>` into `icons/`, so the viewer can show the real catalog icons
- Catalog items record their type name (`meta.typeName`)

## 2026.1.3 - 2026-10-29

Fixes from the first real VCFA 9 export (vmapps-org):

- Catalog item → template link now read from the item's `externalId`; on 9.x the item and template ids differ
- Catalog item project read from `sourceProjectId`
- New `applies-to` link: a policy that names a content source or catalog item (e.g. content sharing) now links to it. These links never pull objects in on their own with `-Select`

## 2026.1.2 - 2026-10-29

- ABX action flows now come from the ABX actions list (they are actions with `actionType` FLOW); the separate `/abx/api/resources/action-flows` call is removed, it was never a real endpoint
- Flow definitions are saved as `abx/<name>/source.yaml`, and the actions a flow runs are linked and pulled in with `-Select`

## 2026.1.1 - 2026-10-29

- An endpoint the server does not have is now reported as "not available" instead of "FAILED", including VCFA 9's 500 "No static resource" reply (seen for ABX action flows)

## 2026.1.0 - 2026-10-29

First version of the collector.

- `Export-VCFALedgerPackage.ps1` for VCF Automation 9.x VM Apps, Windows PowerShell 5.1
- Exports cloud templates (all versions), content sources, catalog items and custom forms, policies, subscriptions with their event topics, ABX actions with source, ABX action flows, property groups, custom resource types, resource actions and projects
- Login through `/cloudapi/1.0.0/sessions` (same as the config workbook collector), or an org API token with `-UseApiToken`
- `-Select` to pick objects, with related objects added automatically
- Links between objects recorded in `manifest.json`
- Output: `VM Apps - <org>\<org>_<yyyymmdd>` folder plus `.vcfapkg` zip, with an index suffix when a same-day export exists
- `.vcfapkg` format 1.0 documented in `docs/vcfapkg-format.md`
