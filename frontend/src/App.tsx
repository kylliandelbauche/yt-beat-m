import { useShell } from "./shellContext";
import { useCallback, useEffect, useState } from "react";
import { LibraryPanel } from "./LibraryPanel";
import { Icon } from "./Modal";
import { ShellProvider, PaneIcon } from "./Shell";
import { useEngineConnection } from "./useEngineConnection";
import "./Themes.css";
import "./Redesign.css";
import "./Songs.css";
function Workspace() {
  const [view, setView] = useState<"prods" | "beatmakers" | "songs">("prods");
  const shell = useShell(),
    engine = useEngineConnection();
  const { setNavImport, setNavTools } = shell;
  const updateImport = useCallback(
    (el: HTMLElement | null) => setNavImport(el),
    [setNavImport],
  );
  const updateTools = useCallback(
    (el: HTMLElement | null) => setNavTools(el),
    [setNavTools],
  );
  const connected = engine.state !== "offline";
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (shell.left || !importOpen) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (
          e.key !== "Escape" ||
          e.defaultPrevented ||
          document.querySelector("dialog[open]")
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setImportOpen(false);
        document
          .querySelector<HTMLButtonElement>(".collapsed-import")
          ?.focus({ preventScroll: true });
      } else if (
        !(
          e.target instanceof Element &&
          e.target.closest(".navigation-import, .collapsed-import")
        )
      )
        setImportOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close, true);
    };
  }, [shell.left, importOpen]);

  return (
    <main
      className={`workspace${shell.left ? "" : " left-collapsed"}${shell.right ? " detail-open" : ""}`}
    >
      <svg
        className="workspace-decoration"
        width="620"
        height="900"
        viewBox="0 0 620 900"
        aria-hidden="true"
      >
        <path
          d="M720 -80C130 120 140 460 440 720C510 790 540 850 560 940"
          fill="none"
          stroke="var(--highlight)"
          strokeWidth="72"
          opacity="0.4"
        />
        <path
          d="M670 -80C140 180 210 470 470 716C540 790 558 860 576 940"
          fill="none"
          stroke="var(--highlight)"
          strokeWidth="2"
          opacity="0.9"
        />
        <path
          d="M740 10C270 180 330 530 560 680"
          fill="none"
          stroke="var(--selected)"
          strokeWidth="112"
          opacity="0.25"
        />
      </svg>
      <aside className="navigation-sidebar" aria-label="Navigation principale">
        <div className="navigation-surface" />
        <a
          className="brand"
          href="/"
          aria-label="YT Beat M, accueil"
          onClick={(e) => {
            e.preventDefault();
            shell.setFavorites(false);
            setView("prods");
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <path
              d="M4 11v6M10 6v16M16 9v10M22 3v22"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span>beat m</span>
        </a>
        <button
          className="icon-button nav-collapse"
          title={shell.left ? "Replier la navigation" : "Ouvrir la navigation"}
          aria-label={
            shell.left ? "Replier la navigation" : "Ouvrir la navigation"
          }
          aria-expanded={shell.left}
          onClick={() => {
            shell.setLeft(!shell.left);
            setImportOpen(false);
          }}
        >
          <PaneIcon side="left" open={shell.left} />
        </button>
        <nav className="primary-nav">
          <button
            aria-label="Prods"
            aria-current={
              view === "prods" && !shell.favorites ? "page" : undefined
            }
            onClick={() => {
              shell.setFavorites(false);
              setView("prods");
            }}
          >
            <Icon name="grid" />
            <span>Prods</span>
            <span className="nav-count">{shell.total ?? "—"}</span>
          </button>
          <button
            aria-label="Beatmakers"
            aria-current={view === "beatmakers" ? "page" : undefined}
            onClick={() => setView("beatmakers")}
          >
            <Icon name="person" />
            <span>Beatmakers</span>
          </button>
          <button
            aria-label="Mes sons"
            aria-current={view === "songs" ? "page" : undefined}
            onClick={() => {
              shell.setFavorites(false);
              setView("songs");
            }}
          >
            <Icon name="music" />
            <span>Mes sons</span>
          </button>
          <button
            aria-label="Favoris"
            aria-current={
              shell.favorites && view !== "beatmakers" ? "page" : undefined
            }
            onClick={() => {
              shell.setFavorites(!shell.favorites);
              if (view === "beatmakers") setView("prods");
            }}
          >
            <Icon name="heart" />
            <span>Favoris</span>
          </button>
        </nav>
        <button
          className="icon-button collapsed-import"
          aria-label="Ajouter une prod"
          aria-expanded={importOpen}
          onClick={() => setImportOpen(!importOpen)}
        >
          <Icon name="plus" />
        </button>
        <div
          className={`navigation-import${importOpen ? " import-open" : ""}`}
          ref={updateImport}
        />
        <div className="navigation-tools">
          <div ref={updateTools} />
          <button
            onClick={() => shell.setSettings("diagnostic")}
            aria-label="Réglages"
          >
            <Icon name="settings" />
            <span>Réglages</span>
          </button>
          <div className="engine-status" role="status">
            <span className={`dot ${!connected ? "offline" : ""}`} />
            <span>
              {!connected
                ? "Déconnecté"
                : engine.state === "online"
                  ? "Moteur connecté"
                  : "Connexion…"}
            </span>
          </div>
        </div>
      </aside>
      <LibraryPanel
        view={view}
        onView={setView}
        connected={connected}
        onRetry={engine.retry}
      />
    </main>
  );
}
export default function App() {
  return (
    <ShellProvider>
      <Workspace />
    </ShellProvider>
  );
}
