# Viewer changelog

Year-based versions (YEAR.MINOR.PATCH), single source in `package.json`.

## 2026.3.0 - 2026-10-29

- New **Catalog** page (top bar, or the Catalog Items tile) laid out like VCF Automation Service Broker > Consume > Catalog: item count, project filter, search, sort, card and list views, read-only
- Cards show the real catalog icon when the package has it (collector 2026.1.4 and later), otherwise VCFA's default icon for the item type
- Nothing is hidden: long descriptions expand in place, and every card also shows type, content source, the template it publishes and whether it has a custom form; the list view has all of these as columns
- Clicking a card opens the full catalog item page, which now shows its icon and description too

## 2026.2.0 - 2026-10-29

- Content sharing policies now open as a read-only replica of the VCF Automation Service Broker policy page: Type, Name, Description, Scope (Organization / Multiple Projects or Project), Content sharing grid (items shared and their content source), Entitlement type (User / Role based) and Users
- Shared items in the grid link to the content source or catalog item in the package

## 2026.1.0 - 2026-10-29

First version.

- Opens `.vcfapkg` packages (format 1.0) in the browser, by file picker or drag and drop; nothing is uploaded
- Shares the vRO Peekage design: Clarity City font, navy top bar, grey side panel, cards, tiles, code blocks, light / dark / system theme
- Sidebar by object type, grouped by project, policy type or event topic; filter box
- Overview: export facts, counts per type, solutions (linked objects), source details, every API call the collector made
- Cloud templates: YAML for the current draft and every version, released versions marked, version description and change log
- Catalog items: type, request inputs, custom form
- Policies: friendly type (Approval, Lease, Day 2 Actions, Content Sharing, Quota, Limits), enforcement, scope, criteria, definition
- Subscriptions: event topic, condition and runnable laid out left to right, plus blocking, priority, timeout, projects and recover runnable
- ABX actions and action flows: runtime, entry point, memory, timeout, source code, default inputs, dependencies
- Property groups: properties table
- Solution diagram on every linked object, and Uses / Used by lists; vRO workflows show as external boxes
- Works with packages from collector 2026.1.0-2026.1.2 too: fills in catalog item projects and catalog item -> template links that those versions missed
- Sample package on the front page
