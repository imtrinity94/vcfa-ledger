/**
 * "Open from URL": download a .vcfapkg from a link and hand it to the parser.
 * The browser downloads directly whenever the site allows it (no server involved). Only when a
 * site blocks that (no CORS headers) does it fall back to the small /api/fetch-package proxy.
 */

const PROXY_MAX_MB = 4.4;

/** Turn common "view" links into direct-download links. */
export function normalizePackageUrl(input: string): string {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a link. Paste a full URL starting with https://");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https links are supported.");

  // github.com/<owner>/<repo>/blob/<ref>/<path>  ->  raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
  const gh = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
  if (u.hostname === "github.com" && gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;

  // gitlab.com/<group>/<project>/-/blob/<ref>/<path>  ->  .../-/raw/<ref>/<path>
  if (u.hostname === "gitlab.com" && u.pathname.includes("/-/blob/")) {
    u.pathname = u.pathname.replace("/-/blob/", "/-/raw/");
    return u.toString();
  }

  // Dropbox share links: ask for the file itself instead of the preview page
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) {
    u.searchParams.set("dl", "1");
    return u.toString();
  }
  return u.toString();
}

/** A readable file name from the URL, e.g. "my-org_20261030.vcfapkg". */
export function fileNameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    if (last) return /\.(vcfapkg|zip)$/i.test(last) ? last : `${last}.vcfapkg`;
  } catch {
    /* fall through */
  }
  return "downloaded.vcfapkg";
}

export interface FetchedPackage {
  file: File;
  /** "direct" when the browser downloaded it, "proxy" when the fallback was used */
  via: "direct" | "proxy";
}

export type Progress = (loaded: number, total?: number) => void;

/** Read a response body while reporting progress. */
async function readWithProgress(res: Response, onProgress?: Progress): Promise<Blob> {
  const total = Number(res.headers.get("content-length")) || undefined;
  if (!res.body || !onProgress) return res.blob();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  onProgress(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(parts as BlobPart[]);
}

async function asError(res: Response): Promise<Error> {
  let msg = `${res.status} ${res.statusText}`.trim();
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) msg = j.error;
  } catch {
    /* not JSON */
  }
  if (msg === "too-large")
    return new Error(`That package is larger than ${PROXY_MAX_MB} MB, the most the online download helper can carry. Download it yourself and drop the file here instead.`);
  return new Error(msg);
}

/** A .vcfapkg is a zip: it starts with "PK". Anything else (a web page, a login screen) is reported plainly. */
async function asPackage(blob: Blob, name: string, url: string): Promise<File> {
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) {
    const text = new TextDecoder().decode(head).trimStart().toLowerCase();
    const page = text.startsWith("<!doctype") || text.startsWith("<html") || text.startsWith("<");
    throw new Error(
      page
        ? `${new URL(url).hostname} returned a web page, not a .vcfapkg. Use the direct download link of the file (on GitHub, the "Raw" link).`
        : "That link didn't return a .vcfapkg (zip) file.",
    );
  }
  return new File([blob], name);
}

export async function fetchPackage(input: string, onProgress?: Progress): Promise<FetchedPackage> {
  const url = normalizePackageUrl(input);
  const name = fileNameFromUrl(url);

  // 1. Direct, in the browser. Fails with a TypeError when the site doesn't allow cross-site downloads.
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit", redirect: "follow" });
    if (res.ok) return { file: await asPackage(await readWithProgress(res, onProgress), name, url), via: "direct" };
    if (res.status === 404) throw new Error("Nothing was found at that link (404).");
    if (res.status === 401 || res.status === 403)
      throw new Error("That link needs a sign-in, so VCFA Ledger can't open it. Download the file yourself and drop it here instead.");
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
  }

  // 2. Fallback: the small proxy on this site.
  const res = await fetch(`/api/fetch-package?url=${encodeURIComponent(url)}`, { credentials: "omit" });
  if (!res.ok) throw await asError(res);
  if (/text\/html/i.test(res.headers.get("content-type") ?? ""))
    throw new Error(`${new URL(url).hostname} doesn't allow direct browser downloads, and the download helper isn't available here. Download the file yourself and drop it on this page.`);
  return { file: await asPackage(await readWithProgress(res, onProgress), name, url), via: "proxy" };
}

/** Link that opens a package straight in VCFA Ledger. */
export function shareLink(packageUrl: string): string {
  return `${location.origin}/?url=${encodeURIComponent(packageUrl)}`;
}
