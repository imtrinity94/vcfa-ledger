# VCFA Ledger

**Viewer:** https://vcfa-ledger.vercel.app

Capture, track and view everything you customise in a **VCF Automation 9.x VM Apps** organization: cloud templates, catalog, custom forms, policies, subscriptions, ABX actions, property groups and custom resources, plus the infrastructure configuration behind them (cloud accounts, cloud zones, image and flavor mappings, network and storage profiles, tags).

Think of it as the "vRO package" for the VCF Automation side of a solution. A static IP solution, for example, touches a template, a property group, a subscription (topic + condition) and a workflow. VCFA Ledger captures the VCFA half into one package, and records the links between the pieces.

The project has two parts:

| Part | Status | What it does |
|---|---|---|
| `collector/Export-VCFALedgerPackage.ps1` | 2026.4.0 | PowerShell 5.1 script. Logs into one VM Apps org and writes a `.vcfapkg` package (read-only, GET calls only). |
| `viewer/` | 2026.9.0 | Web app that opens a `.vcfapkg` in the browser, laid out like the VCF Automation UI (tabs, left nav, list pages, catalog, request forms, policy pages), read-only. |

## Collector

### Requirements

- Windows PowerShell 5.1 (also runs on PowerShell 7)
- No modules to install
- Network access to the VCF Automation FQDN
- An org user who can read the org's content (Organization Administrator for a full export), or an org API token

### Run it

```powershell
.\Export-VCFALedgerPackage.ps1
```

It asks for the FQDN, organization, TLS check and credentials. Useful switches:

| Switch | Effect |
|---|---|
| `-Fqdn`, `-Organization`, `-Credential` | Skip the prompts |
| `-UseApiToken` | Log in with an org API token (`/oauth/tenant/<org>/token`) instead of username/password |
| `-SkipCertificateCheck` | Lab / self-signed certificates |
| `-Select` | Pick what to export (grid window on Windows, numbered menu elsewhere). Related objects are added automatically. |
| `-SkipTemplateVersions` | Only the current content of each template, not every version |
| `-IncludeSystemSubscriptions` | Keep built-in / system subscriptions (left out by default) |
| `-NoArchive` | Write the folder only, no `.vcfapkg` zip |
| `-OutputPath` | Where the `VM Apps - <org>` folder goes (default: current folder) |

There is also a `$Preset` block at the top of the script to pre-fill FQDN, org and credentials for repeat runs.

### Output

```
VM Apps - <org>\
  <org>_<yyyymmdd>\          folder - commit this to git to track changes
  <org>_<yyyymmdd>.vcfapkg   the same folder zipped - open this in the viewer
```

A second run on the same day gets `_2`, `_3` and so on. Nothing is overwritten.

### Login

Same order as the config workbook collector: `POST /cloudapi/1.0.0/sessions` with basic auth (`user@org`), trying API versions 40.0, 41.0, 39.1 and 39.0, and the session token is then used as a bearer token for every API. If the token expires mid-run, it logs in again once.

### Dependencies picked up automatically

When you use `-Select`, these are added for you:

- catalog item → the cloud template it publishes (from its `externalId`)
- template → property groups (`propertyGroups.<name>`) and custom resource types (`Custom.*`) it uses
- subscription, resource action, custom resource → the ABX action it runs
- ABX action flow → the actions inside it
- template → the image and flavor mappings it uses

vRO workflows the package runs are looked up in the built-in Orchestrator and saved as a summary (name, folder, version, description, inputs / outputs, step outline). Their scripts are not exported; they belong in the vRO package.

## Viewer

```bash
cd viewer
npm install
npm run dev        # local, http://localhost:5173
npm run build      # static build in dist/ (Vercel-ready, vercel.json included)
npm run build:single   # one self-contained HTML file in dist-single/
```

### Hosting

The repo deploys to Vercel as is: the root `vercel.json` installs and builds the `viewer` folder and serves `viewer/dist`. Import the repo in Vercel with the default settings; every push to `main` redeploys.

The site also serves the collector script at `/collector/Export-VCFALedgerPackage.ps1` (copied from `collector/` at build time) and explains how to run it under **How do I get a .vcfapkg?**.

The package is read in the browser only; nothing is uploaded. **Try the sample** on the front page loads `public/sample.vcfapkg`, made from test data.

## Package format

See [docs/vcfapkg-format.md](docs/vcfapkg-format.md).

## Versioning

Year-based `YEAR.MINOR.PATCH`, kept separately for the collector and the viewer:

- **MINOR** goes up with every new feature (and resets each new year)
- **PATCH** goes up for fixes and small tweaks

Collector changes are in [CHANGELOG.md](CHANGELOG.md), viewer changes in [viewer/CHANGELOG.md](viewer/CHANGELOG.md).
