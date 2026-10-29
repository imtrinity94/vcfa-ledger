import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes, parseLedger, type Ledger } from "./lib/ledger";
import { Sidebar } from "./components/Sidebar";
import { Overview } from "./components/Overview";
import { ObjectView } from "./components/ObjectView";
import { Landing } from "./components/Landing";
import { BackToTop } from "./components/BackToTop";
import { Logo } from "./components/Icons";
import { APP_VERSION } from "./version";

type View = { kind: "overview" } | { kind: "object"; key: string };
type Theme = "system" | "light" | "dark";

const HOME_TITLE = typeof document !== "undefined" ? document.title : "VCFA Ledger";

function readHash(): View {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = /^\/o\/(.+)$/.exec(h);
  return m ? { kind: "object", key: m[1] } : { kind: "overview" };
}
function writeHash(v: View) {
  const h = v.kind === "object" ? `#/o/${encodeURIComponent(v.key)}` : "#/";
  if (location.hash !== h) history.pushState(null, "", h);
}

export default function App() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [drag, setDrag] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState<{ title: string; detail?: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const landingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const go = useCallback((v: View) => {
    setView(v);
    writeHash(v);
    setNavOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const loadBuffer = useCallback(
    async (buf: ArrayBuffer, name: string, size: number) => {
      setBusy(true);
      setError(null);
      setLoading({ title: "Reading package…", detail: `${name} · ${formatBytes(size)}` });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      try {
        const l = await parseLedger(buf, name);
        setLedger(l);
        document.title = `${l.manifest.source.organization || name} · VCFA Ledger`;
        const h = readHash();
        if (h.kind === "object" && l.byKey.has(h.key)) setView(h);
        else go({ kind: "overview" });
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg.includes("end of central directory") || msg.includes("zip") ? "That file isn't a valid .vcfapkg (zip) archive." : msg);
      } finally {
        setBusy(false);
        setLoading(null);
      }
    },
    [go],
  );

  const load = useCallback(async (f: File) => loadBuffer(await f.arrayBuffer(), f.name, f.size), [loadBuffer]);

  const loadSample = useCallback(async () => {
    try {
      const r = await fetch("/sample.vcfapkg");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.arrayBuffer();
      await loadBuffer(b, "sample.vcfapkg", b.byteLength);
    } catch (e) {
      setError(`Couldn't load the sample: ${(e as Error).message}`);
    }
  }, [loadBuffer]);

  const goHome = useCallback(() => {
    setLedger(null);
    setError(null);
    setNavOpen(false);
    setView({ kind: "overview" });
    document.title = HOME_TITLE;
    if (location.hash) history.pushState(null, "", location.pathname);
  }, []);

  useEffect(() => {
    const onPop = () => setView(readHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      depth++;
      setDrag(true);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDrag(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDrag(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) load(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [load]);

  const obj = view.kind === "object" && ledger ? ledger.byKey.get(view.key) : undefined;

  return (
    <div className="app">
      <input
        ref={inputRef}
        type="file"
        accept=".vcfapkg,.zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) load(f);
          e.target.value = "";
        }}
      />
      {loading && (
        <div className="load-overlay" role="status" aria-live="polite">
          <div className="load-card">
            <span className="load-logo">
              <Logo size={56} />
            </span>
            <strong>{loading.title}</strong>
            {loading.detail && <span className="load-detail">{loading.detail}</span>}
            <span className="load-bar indeterminate">
              <span />
            </span>
          </div>
        </div>
      )}
      {drag && (
        <div className="drop-overlay">
          <div>Drop your .vcfapkg file</div>
        </div>
      )}
      <header className="topbar">
        {ledger && (
          <button className="btn-ghost only-mobile" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation">
            ☰
          </button>
        )}
        <button className="brand" onClick={() => ledger && go({ kind: "overview" })}>
          <Logo size={30} />{" "}
          <span className="brand-name">
            <b>VCFA</b> Ledger
          </span>
          <span className="brand-version" title={`VCFA Ledger version ${APP_VERSION}`}>
            v{APP_VERSION}
          </span>
        </button>
        {ledger && (
          <>
            <span className="pkg-name ellipsis" title={ledger.fileName}>
              {ledger.manifest.source.organization || ledger.fileName}
            </span>
            <div className="spacer" />
            <button className="btn-ghost home-btn" onClick={goHome} aria-label="Home" title="Close this package and go to the front page">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" />
              </svg>
              <span>Home</span>
            </button>
            <button className={`btn-ghost ${view.kind === "overview" ? "on" : ""}`} onClick={() => go({ kind: "overview" })}>
              Overview
            </button>
            <button className="btn" onClick={() => inputRef.current?.click()}>
              Open…
            </button>
          </>
        )}
        {!ledger && <div className="spacer" />}
        <button
          className="btn-ghost icon-btn"
          title={`Theme: ${theme} (click to change)`}
          aria-label={`Theme: ${theme}`}
          onClick={() => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {theme === "dark" ? (
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
            ) : theme === "light" ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
              </>
            )}
          </svg>
        </button>
      </header>

      {!ledger ? (
        <Landing scrollRef={landingRef} onPick={() => inputRef.current?.click()} onSample={loadSample} busy={busy} error={error} />
      ) : (
        <div className={`shell ${navOpen ? "nav-open" : ""}`}>
          <Sidebar ledger={ledger} selected={obj?.key} onSelect={(key) => go({ kind: "object", key })} />
          <main className="main" ref={mainRef}>
            {error && <div className="callout warn">{error}</div>}
            {view.kind === "overview" && <Overview ledger={ledger} onNav={(key) => go({ kind: "object", key })} />}
            {view.kind === "object" && obj && <ObjectView key={obj.key} o={obj} ledger={ledger} onNav={(key) => go({ kind: "object", key })} />}
            {view.kind === "object" && !obj && <p className="muted">Object not found in this package.</p>}
          </main>
        </div>
      )}
      <BackToTop key={ledger ? "app" : "home"} target={ledger ? mainRef : landingRef} />
    </div>
  );
}
