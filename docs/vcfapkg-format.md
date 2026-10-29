# .vcfapkg format (1.0)

A `.vcfapkg` is a plain zip of a folder. Every file inside is readable JSON, YAML or source code, so the unzipped folder works well in git and in diff tools.

## Layout

```
manifest.json                      index of everything (see below)
projects.json                      id + name of every project, to resolve scopes
templates/<name>/
  template.json                    template metadata (without content)
  content.yaml                     current template YAML
  versions/<version>.json          version metadata
  versions/<version>.yaml          version YAML
catalog/sources/<name>.json        content sources
catalog/items/<name>.json          catalog items
catalog/items/<name>.form.json     custom request form, when the item has one
policies/<type>/<name>.json        type = approval, deployment.lease, deployment.action,
                                   catalog.entitlement, resource.quota, deployment.limit ...
subscriptions/<name>.json          extensibility subscriptions
event-topics/<id>.json             only the topics the exported subscriptions use
abx/<name>/action.json             ABX action metadata (without source)
abx/<name>/source.py|.js|.ps1      ABX source code
abx/<name>/source.yaml             flow definition, for action flows (actionType FLOW)
property-groups/<name>.json
custom-resources/<name>.json       custom resource types
resource-actions/<name>.json       custom day-2 actions (form definition included)
```

Names are the object's display name with characters that are not allowed in file names replaced by `_`. When two objects of the same type share a name, the second gets the first 8 characters of its id appended.

Each JSON file holds the object exactly as the API returned it, apart from the long text fields that are split out into their own file (`content`, `source`).

## manifest.json

```json
{
  "format": "vcfapkg",
  "formatVersion": "1.0",
  "tool": { "name": "VCFA Ledger Collector", "version": "2026.1.0" },
  "source": {
    "product": "VCF Automation", "orgType": "VM Apps",
    "fqdn": "auto.vmw.lab", "organization": "lab",
    "apiVersion": "...", "cloudApiVersion": "40.0", "auth": "..."
  },
  "exportedAt": "2026-10-29T13:39:00Z",
  "exportedBy": "admin",
  "selection": "all | user-selected",
  "counts": { "template": 1, "subscription": 2 },
  "objects": [ ... ],
  "links": [ ... ],
  "eventTopics": [ ... ],
  "log": [ ... ]
}
```

### objects[]

| Field | Meaning |
|---|---|
| `key` | `<type>|<id>`, used by `links` |
| `type` | `template`, `catalog-item`, `content-source`, `policy`, `subscription`, `abx-action` (action flows included, `meta.actionType` = `FLOW`), `property-group`, `custom-resource`, `resource-action` |
| `id`, `name`, `project` | as in VCFA (project resolved to its name) |
| `selectedBy` | `user`, or `dependency` when it was pulled in by a link |
| `path` | main file of the object |
| `files` | every file written for the object |
| `meta` | quick-view fields so the viewer can draw cards without opening each file, e.g. for subscriptions: `eventTopicId`, `blocking`, `priority`, `timeout`, `criteria`, `runnableType`, `runnableId`, `projects` |

### links[]

```json
{ "from": "subscription|<id>", "to": "abx-action|<id>", "rel": "runs" }
```

| rel | from → to |
|---|---|
| `publishes` | catalog item → template (from the item's `externalId`) |
| `from-source` | catalog item → content source |
| `uses-property-group` | template → property group |
| `uses-custom-resource` | template → custom resource type |
| `uses-template` | anything → template (id found in its definition) |
| `runs` | subscription / resource action / custom resource / action flow → ABX action or `vro-workflow|<id>` |
| `recovers-with` | subscription → recover workflow |
| `applies-to` | policy (or anything else) → content source or catalog item named in its definition, e.g. a content sharing policy → the source it shares |

`vro-workflow|<id>` targets are external: the workflow lives in the vRO package, and the viewer can match it when both are loaded.

### log[]

One entry per list call (`OK`, `FAILED` or `NOT_AVAILABLE`) plus one per failed detail call: `section`, `endpoint`, `status`, `count`, `message`.
