# Viewer changelog

Year-based versions (YEAR.MINOR.PATCH), single source in `package.json`.

## 2026.7.0 - 2026-10-30

- vRO workflows show by name everywhere: subscription cards (with folder), recover runnable, links, solution diagrams and the Orchestrator / Library workflow lists (needs collector 2026.4.0 or later)
- New workflow page: folder, version, description, inputs and outputs, what runs it, and the step outline with the Orchestrator step icons. Scripts are not shown, by design
- Workflow ids the collector could not find in Orchestrator are marked **not found** (deleted, or on an external vRO)

## 2026.6.2 - 2026-10-30

- Live at https://vcfa-ledger.vercel.app (deployed from GitHub on every push to `main`)
- Canonical URL and link-preview metadata for the live site

## 2026.6.1 - 2026-10-29

- Infrastructure pages now say when a package was made with a collector older than 2026.3.0 (which did not capture infrastructure), instead of only showing 0 items

## 2026.6.0 - 2026-10-29

- New **Infrastructure** tab, laid out like VCFA: Connections > Cloud Accounts; Configure > Cloud Zones, Flavor Mappings, Image Mappings, Network Profiles, Storage Profiles, Tags (needs collector 2026.3.0 or later)
- Image and flavor mapping lists show one row per mapping name per account / region, as in VCFA
- Detail pages: cloud accounts (connection properties, regions, everything configured on the account), cloud zones (placement policy, folder, capability tags, compute filter), image / flavor mapping tables with the templates that use them, network profiles with their networks, CIDRs, tags and IP ranges, storage profiles with disk properties, and tags with everything they are on and every template that requires them
- Tags are clickable everywhere they appear
- Template solution diagrams now include the image and flavor mappings the template uses
- Every infrastructure page keeps the full Details list and raw JSON

## 2026.5.0 - 2026-10-29

- VCF Automation style top tabs: **Home, Consume, Design, Content & Policies, Extensibility, Orchestrator**
- Each tab has its own VCFA left navigation, and each entry opens its own list page (Clarity datagrid with search, sortable columns and item count) instead of one combined tree:
  - Consume: Catalog
  - Design: Templates, Custom Resources, Custom Actions, Property Groups
  - Content & Policies: Content Sources, Content, Policies > Definitions (with a policy type filter)
  - Extensibility: Subscriptions, Event Topics (expand a row for its payload schema), Library > Actions, Library > Workflows
  - Orchestrator: Workflows, listing every vRO workflow the package runs and what uses it
- Opening an object keeps its tab and left-nav entry selected, with a back link to its list
- Home shows the package overview full width, without a left nav, as in VCFA
- The combined object tree from earlier versions is removed

## 2026.4.0 - 2026-10-29

- Catalog items now open with a live **New Request** preview laid out like VCF Automation: project, deployment name and every input, in a page you can click through and type into. Nothing is ever submitted
- Built from the custom form when the item has one: pages as tabs, labels, required markers, signposts, defaults, static value lists, read-only fields, data grids (add / remove rows) and visibility rules, which update live as you change values
- Without a custom form it is built from the item's request schema (types, enums, min / max, defaults)
- Nothing is lost: values or defaults that come from a vRO action or a binding show which action feeds them; conditional and read-only fields are tagged; each signpost also lists the field id, type, pattern and limits; fields hidden by a rule are listed under the form; and "Request inputs as they would be sent" shows the current values as JSON
- The custom form JSON, request inputs table and raw JSON stay on the page below the preview

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
