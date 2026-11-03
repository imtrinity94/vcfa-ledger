/**
 * "Export documentation": builds a zip in the browser with
 *   report.html     self-contained report (styles, fonts and diagrams inline), prints to PDF
 *   <org> - LLD.docx  the same content as a Word low level design document
 *   report.md       the same content as Markdown (wiki / git)
 *   inventory.csv / inventory.md   one row per object
 *   diagrams/       each solution diagram as SVG and PNG
 *   sources/        every file of the package (template YAML of every version, ABX code, forms, raw JSON)
 * With `redact`, host names and user names are replaced with placeholders everywhere, file names included.
 */
import JSZip from "jszip";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import powershell from "highlight.js/lib/languages/powershell";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import plaintext from "highlight.js/lib/languages/plaintext";
import cityRegular from "@cds/city/Webfonts/WOFF2/ClarityCity-Regular.woff2?inline";
import citySemiBold from "@cds/city/Webfonts/WOFF2/ClarityCity-SemiBold.woff2?inline";
import cityBold from "@cds/city/Webfonts/WOFF2/ClarityCity-Bold.woff2?inline";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Ledger } from "./ledger";
import { APP_VERSION as APP } from "../version";
import { INVENTORY_HEAD, buildReport, inventoryRows, makeRedactor, safeName, type Block, type ReportDoc } from "./report";

for (const [n, f] of Object.entries({ javascript, python, powershell, json, yaml, plaintext })) if (!hljs.getLanguage(n)) hljs.registerLanguage(n, f);


export interface ExportOptions {
  redact: boolean;
  onProgress?: (msg: string) => void;
}

export async function exportDocumentation(l: Ledger, opt: ExportOptions): Promise<{ blob: Blob; name: string }> {
  const say = opt.onProgress ?? (() => {});
  const tick = () => new Promise((r) => setTimeout(r, 0));
  say("Reading the package");
  await tick();
  const red = makeRedactor(l, opt.redact);
  const doc = buildReport(l, red);
  const org = safeName(l.manifest.source.organization || l.fileName.replace(/\.vcfapkg$/i, ""));
  const date = (l.manifest.exportedAt ?? new Date().toISOString()).slice(0, 10).replace(/-/g, "");
  const zip = new JSZip();

  say("Drawing diagrams");
  await tick();
  const pngs = new Map<string, Uint8Array>();
  for (const b of doc.blocks) {
    if (b.t !== "diagram") continue;
    zip.file(`${b.file}.svg`, b.svg);
    const png = await rasterize(b.svg, b.width, b.height);
    if (png) {
      pngs.set(b.file, png);
      zip.file(`${b.file}.png`, png);
    }
  }

  say("Writing the HTML and Markdown reports");
  await tick();
  zip.file("report.html", reportHtml(doc, opt.redact));
  zip.file("report.md", reportMd(doc));
  const inv = inventoryRows(l, red);
  zip.file("inventory.csv", "﻿" + [INVENTORY_HEAD, ...inv].map((r) => r.map(csv).join(",")).join("\r\n") + "\r\n");
  zip.file("inventory.md", `# ${doc.title}\n\n${mdTable(INVENTORY_HEAD, inv)}\n`);

  say("Writing the Word document");
  await tick();
  zip.file(`${org} - LLD.docx`, await reportDocx(doc, pngs, opt.redact));

  say("Adding the source files");
  await tick();
  for (const [path, text] of l.files) zip.file(`sources/${red(path)}`, red(text));
  for (const [path, url] of l.images) zip.file(`sources/${path}`, url.slice(url.indexOf(",") + 1), { base64: true });

  zip.file("README.txt", readme(doc, l, opt.redact, org));
  say("Compressing");
  await tick();
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, name: `${org}_${date}_ledger-docs${opt.redact ? "_redacted" : ""}.zip` };
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------------------------------------------------------- helpers

function rasterize(svg: string, width: number, height: number, scale = 2): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return resolve(null);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : resolve(null)), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const csv = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const mdCell = (v: string) => (v || " ").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
const mdTable = (head: string[], rows: string[][]) => [`| ${head.map(mdCell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`)].join("\n");

function highlight(code: string, lang: string) {
  try {
    return hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : esc(code);
  } catch {
    return esc(code);
  }
}

function generated(redact: boolean) {
  return `Generated by VCFA Ledger${APP ? ` ${APP}` : ""} on ${new Date().toISOString().slice(0, 10)}${redact ? " · host names and user names redacted" : ""}`;
}

// ---------------------------------------------------------------- HTML

const CSS = `
@font-face{font-family:"Clarity City";font-weight:400;src:url(${cityRegular}) format("woff2")}
@font-face{font-family:"Clarity City";font-weight:600;src:url(${citySemiBold}) format("woff2")}
@font-face{font-family:"Clarity City";font-weight:700;src:url(${cityBold}) format("woff2")}
:root{--fg:#1b2230;--muted:#5b6475;--line:#d9dee7;--soft:#f4f6f9;--accent:#0072a3;--code:#f7f8fa}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--fg);font:15px/1.55 "Clarity City","Segoe UI",Helvetica,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:32px 24px 64px}
header.cover{border-bottom:3px solid var(--accent);padding-bottom:18px;margin-bottom:24px}
header.cover .k{color:var(--accent);font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:12px}
header.cover h1{font-size:30px;margin:6px 0 4px;line-height:1.2}
header.cover .sub{color:var(--muted)}
header.cover .gen{color:var(--muted);font-size:12px;margin-top:8px}
nav.toc{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:14px 20px;margin:0 0 28px}
nav.toc h2{margin:0 0 6px;font-size:15px;border:0;padding:0}
nav.toc ol{margin:0;padding-left:18px;columns:2;column-gap:32px}
nav.toc li{break-inside:avoid;margin:2px 0}
nav.toc ul{margin:2px 0 6px;padding-left:18px;font-size:14px;list-style:circle}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
h1{font-size:24px;margin:40px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--line)}
h2{font-size:19px;margin:30px 0 10px;color:#0b3a53}
h3{font-size:16.5px;margin:26px 0 8px;padding:6px 10px;background:var(--soft);border-left:4px solid var(--accent);border-radius:3px}
h4{font-size:14px;margin:16px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
p{margin:6px 0 10px}
p.muted{color:var(--muted);font-size:13.5px}
table{border-collapse:collapse;width:100%;margin:6px 0 12px;font-size:13.5px}
th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:var(--soft);font-weight:600}
table.kv th{width:30%;font-weight:600}
pre{background:var(--code);border:1px solid var(--line);border-radius:6px;padding:10px 12px;font:12.5px/1.45 ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 12px}
.ct{font:600 12px/1.4 ui-monospace,Consolas,monospace;color:var(--muted);margin:8px 0 -2px}
details{margin:6px 0 10px}
details>summary{cursor:pointer;color:var(--accent);font-size:13.5px}
.diag{border:1px solid var(--line);border-radius:8px;padding:8px;overflow:auto;margin:8px 0 12px;background:#fff}
.diag svg{max-width:100%;height:auto;display:block}
.hljs-keyword,.hljs-built_in,.hljs-literal,.hljs-selector-tag{color:#7c3aed}
.hljs-string,.hljs-regexp{color:#0a7d3e}
.hljs-number{color:#b45309}
.hljs-comment,.hljs-meta{color:#6b7280;font-style:italic}
.hljs-title{color:#2563eb}
.hljs-attr,.hljs-attribute,.hljs-name,.hljs-variable,.hljs-property{color:#0b5c8a}
footer{margin-top:48px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:10px}
@media (max-width:700px){nav.toc ol{columns:1}.wrap{padding:20px 16px 48px}}
@media print{
  body{font-size:11pt}
  .wrap{max-width:none;padding:0}
  nav.toc{break-after:page}
  h1{break-before:page}
  h1,h2,h3,h4{break-after:avoid}
  table,pre,.diag{break-inside:auto}
  tr{break-inside:avoid}
  details:not([open])>*:not(summary){display:none}
  details>summary{color:var(--muted)}
  a{color:inherit}
}
@page{margin:16mm 14mm}
`;

function blockHtml(b: Block): string {
  switch (b.t) {
    case "h":
      return `<h${b.level}${b.id ? ` id="${b.id}"` : ""}>${esc(b.text)}</h${b.level}>`;
    case "p":
      return `<p${b.muted ? ' class="muted"' : ""}>${esc(b.text)}</p>`;
    case "kv":
      return `<table class="kv"><tbody>${b.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
    case "table":
      return `<table><thead><tr>${b.head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    case "list":
      return `<ul>${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    case "code": {
      const pre = `<pre><code class="hljs">${highlight(b.code, b.lang)}</code></pre>`;
      if (b.detail) return `<details><summary>${esc(b.title ?? "Show")}</summary>${pre}</details>`;
      return `${b.title ? `<div class="ct">${esc(b.title)}</div>` : ""}${pre}`;
    }
    case "diagram":
      return `<div class="diag">${b.svg.replace(/id="ah"/g, `id="ah-${b.file.length}${b.title.length}"`).replace(/url\(#ah\)/g, `url(#ah-${b.file.length}${b.title.length})`)}</div>`;
  }
}

export function reportHtml(doc: ReportDoc, redact: boolean) {
  // nested: chapters numbered, their pages as a sub-list
  let toc = "";
  let open = false;
  for (const [id, t, lv] of doc.toc) {
    if (lv === 1) {
      toc += `${open ? "</ul></li>" : ""}<li><a href="#${id}">${esc(t)}</a><ul>`;
      open = true;
    } else if (lv === 2) toc += `<li><a href="#${id}">${esc(t)}</a></li>`;
  }
  if (open) toc += "</ul></li>";
  toc = toc.replace(/<ul><\/ul>/g, "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)}</title><style>${CSS}</style></head>
<body><div class="wrap">
<header class="cover"><div class="k">VCFA Ledger · configuration report</div><h1>${esc(doc.title)}</h1><div class="sub">${esc(doc.subtitle)}</div><div class="gen">${esc(generated(redact))}</div></header>
<nav class="toc"><h2>Contents</h2><ol>${toc}</ol></nav>
<main>${doc.blocks.map(blockHtml).join("\n")}</main>
<footer>${esc(generated(redact))}. Read-only documentation of the exported package; open the .vcfapkg in VCFA Ledger to browse it interactively.</footer>
</div></body></html>`;
}

// ---------------------------------------------------------------- Markdown

function fence(code: string) {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  return "`".repeat(longest + 1);
}

export function reportMd(doc: ReportDoc) {
  const out: string[] = [`# ${doc.title}`, "", doc.subtitle, ""];
  for (const b of doc.blocks) {
    switch (b.t) {
      case "h":
        out.push(`${"#".repeat(Math.min(6, b.level + 1))} ${b.text}`, "");
        break;
      case "p":
        out.push(b.muted ? `_${b.text}_` : b.text, "");
        break;
      case "kv":
        out.push(mdTable(["", ""], b.rows), "");
        break;
      case "table":
        out.push(mdTable(b.head, b.rows), "");
        break;
      case "list":
        out.push(...b.items.map((x) => `- ${x}`), "");
        break;
      case "code":
        if (b.detail) out.push(`${b.title ?? "File"}: \`sources/${b.file ?? ""}\``, "");
        else {
          const f = fence(b.code);
          if (b.title) out.push(`**${b.title}**`, "");
          out.push(`${f}${b.lang === "plaintext" ? "" : b.lang}`, b.code.replace(/\s+$/, ""), f, "");
        }
        break;
      case "diagram":
        out.push(`![${b.title}](${encodeURI(b.file)}.svg)`, "");
        break;
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- Word

const FONT = "Segoe UI";
const MONO = "Consolas";
const ACCENT = "0072A3";
const LINE = "D9DEE7";
const SOFT = "F4F6F9";
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
// A4 / Letter text width at 2 cm margins is about 17 cm: 9638 twips
const TEXT_TWIPS = 9638;

function cell(text: string, opts: { head?: boolean; width?: number } = {}) {
  const lines = text.split(/\r?\n/);
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.head ? { type: ShadingType.CLEAR, color: "auto", fill: SOFT } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: lines.flatMap((ln, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: ln, bold: opts.head, size: 18, font: FONT })]) })],
  });
}

function docxTable(head: string[] | null, rows: string[][], widths?: number[]) {
  const n = head?.length ?? rows[0]?.length ?? 1;
  const w = widths ?? Array.from({ length: n }, () => Math.floor(TEXT_TWIPS / n));
  return new Table({
    width: { size: TEXT_TWIPS, type: WidthType.DXA },
    columnWidths: w,
    borders,
    rows: [
      ...(head ? [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { head: true, width: w[i] })) })] : []),
      ...rows.map((r) => new TableRow({ children: Array.from({ length: n }, (_, i) => cell(r[i] ?? "", { width: w[i], head: !head && i === 0 })) })),
    ],
  });
}

function codeParas(code: string): Paragraph[] {
  const lines = code.replace(/\s+$/, "").split(/\r?\n/);
  return lines.map(
    (ln, i) =>
      new Paragraph({
        spacing: { before: 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7F8FA" },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: LINE, space: 6 } },
        children: [new TextRun({ text: ln.replace(/\t/g, "    ") || " ", font: MONO, size: 16 })],
      }),
  );
}

export async function reportDocx(doc: ReportDoc, pngs: Map<string, Uint8Array>, redact: boolean): Promise<Blob> {
  const body: (Paragraph | Table | TableOfContents)[] = [];
  const HL = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 } as const;
  let firstH1 = true;
  for (const b of doc.blocks) {
    switch (b.t) {
      case "h":
        body.push(new Paragraph({ heading: HL[b.level], pageBreakBefore: b.level === 1 && !firstH1, children: [new TextRun(b.text)] }));
        if (b.level === 1) firstH1 = false;
        break;
      case "p":
        body.push(new Paragraph({ children: [new TextRun({ text: b.text, italics: b.muted, color: b.muted ? "5B6475" : undefined })] }));
        break;
      case "kv":
        body.push(docxTable(null, b.rows, [Math.round(TEXT_TWIPS * 0.3), TEXT_TWIPS - Math.round(TEXT_TWIPS * 0.3)]), new Paragraph({ text: "" }));
        break;
      case "table":
        body.push(docxTable(b.head, b.rows), new Paragraph({ text: "" }));
        break;
      case "list":
        body.push(...b.items.map((x) => new Paragraph({ text: x, bullet: { level: 0 } })));
        break;
      case "code":
        if (b.detail) body.push(new Paragraph({ children: [new TextRun({ text: `${b.title ?? "File"}: `, color: "5B6475" }), new TextRun({ text: `sources/${b.file ?? ""}`, font: MONO, size: 18, color: "5B6475" })] }));
        else {
          if (b.title) body.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: b.title, font: MONO, size: 16, bold: true, color: "5B6475" })] }));
          body.push(...codeParas(b.code));
        }
        break;
      case "diagram": {
        const png = pngs.get(b.file);
        if (!png) {
          body.push(new Paragraph({ children: [new TextRun({ text: `Diagram: ${b.file}.svg`, italics: true })] }));
          break;
        }
        const maxW = 640;
        const k = Math.min(1, maxW / b.width);
        body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: png, transformation: { width: Math.round(b.width * k), height: Math.round(b.height * k) }, altText: { name: b.title, title: b.title, description: b.title } })] }));
        break;
      }
    }
  }

  const cover = [
    new Paragraph({ spacing: { before: 2400 }, children: [new TextRun({ text: "VCFA LEDGER · LOW LEVEL DESIGN", bold: true, color: ACCENT, size: 22 })] }),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: doc.title, bold: true, size: 52 })] }),
    new Paragraph({ children: [new TextRun({ text: doc.subtitle, color: "5B6475", size: 26 })] }),
    new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: generated(redact), color: "5B6475", size: 18 })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Contents")] }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({ children: [new TextRun({ text: "If the contents list is empty, right-click it and choose Update Field.", italics: true, color: "5B6475", size: 16 })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const d = new Document({
    creator: "VCFA Ledger",
    title: doc.title,
    description: "VCF Automation configuration exported with VCFA Ledger",
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { after: 100 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 34, bold: true, color: "1B2230", font: FONT }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, color: "0B3A53", font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 2, keepNext: true } },
        { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 19, bold: true, color: "5B6475", allCaps: true, font: FONT }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3, keepNext: true } },
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 34, bold: true, font: FONT }, paragraph: { spacing: { after: 200 } } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${doc.title}${redact ? " (redacted)" : ""} · page `, size: 16, color: "5B6475" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "5B6475" })] })],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });
  return Packer.toBlob(d);
}

// ---------------------------------------------------------------- README

function readme(doc: ReportDoc, l: Ledger, redact: boolean, org: string) {
  return [
    doc.title,
    "=".repeat(Math.min(80, doc.title.length)),
    "",
    generated(redact) + ".",
    `Package: ${redact ? "(file name kept) " : ""}${l.fileName}`,
    "",
    "report.html          The full report. Opens in any browser, works offline, prints to PDF (File > Print > Save as PDF).",
    `${org} - LLD.docx`.padEnd(21) + "The same content as a Word low level design document.",
    "report.md            The same content as Markdown, for a wiki or a git repo.",
    "inventory.csv / .md  One row per object: type, name, project, links, file.",
    "diagrams/            Each solution diagram as SVG and PNG.",
    "sources/             Every file of the package: template YAML (all versions), ABX code, custom forms, raw JSON.",
    "",
    redact
      ? "Host names (the VCF Automation FQDN, vCenter / NSX and other endpoints, names in the same DNS domain) and user names (created by / updated by, owners, user principals, e-mail addresses) are replaced with placeholders such as host-1.redacted.example and user-1. The same value always gets the same placeholder. IP addresses, project names and object names are kept. Check the output before sharing it outside your team."
      : "Nothing is redacted. Export again with 'Hide host names and user names' before sharing outside your team.",
    "",
  ].join("\r\n");
}
