import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { BeatGallery } from "./BeatGallery";
import { useShell } from "./shellContext";
import { Settings } from "./Settings";
import type { ModalClose } from "./useModalLifecycle";

type Library = {
  id: string;
  name: string;
  root: string;
  beat_count: number;
  schema_version: number;
};
type LibraryStatus = { library: Library | null; error: string | null };

export function LibraryPanel({
  view,
  onView,
  connected,
  onRetry,
}: {
  view: "prods" | "beatmakers" | "songs";
  onView: (view: "prods" | "beatmakers" | "songs") => void;
  connected: boolean;
  onRetry: () => void;
}) {
  const shell = useShell();
  const setOpened = (value: boolean) =>
    shell.setSettings(value ? "library" : null);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [path, setPath] = useState("");
  const [name, setName] = useState("Mes prods");
  const [mode, setMode] = useState<"open" | "create">("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeModal = useRef<ModalClose | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const focusSelection = useRef(false);
  useLayoutEffect(() => {
    if (focusSelection.current && !shell.settings) {
      focusSelection.current = false;
      queueMicrotask(() => {
        if (!document.querySelector("dialog[open]"))
          document
            .querySelector<HTMLInputElement>(".catalog-search input")
            ?.focus({ preventScroll: true });
      });
    }
  }, [status?.library?.id, shell.settings]);
  function finishClose() {
    setOpened(false);
    afterClose.current?.();
    afterClose.current = null;
  }
  function commitSelection(selected: LibraryStatus) {
    const apply = () => {
      focusSelection.current =
        !!selected.library && selected.library.id !== status?.library?.id;
      setStatus(selected);
      setPath("");
    };
    if (closeModal.current) {
      afterClose.current = apply;
      closeModal.current(true);
    } else {
      apply();
      setOpened(false);
    }
  }
  const handleIndexed = useCallback((count: number) => {
    setStatus((current) =>
      current?.library
        ? { ...current, library: { ...current.library, beat_count: count } }
        : current,
    );
  }, []);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    api<LibraryStatus>("/api/library", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setStatus(value);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Le catalogue est indisponible.",
          );
      });
    return () => controller.abort();
  }, [connected]);
  async function select(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const selected = await api<LibraryStatus>("/api/library", {
        method: "POST",
        body: JSON.stringify({ path, create: mode === "create", name }),
      });
      commitSelection(selected);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d’ouvrir ce dossier.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function chooseFolder(nextMode: "open" | "create") {
    setMode(nextMode);
    setBusy(true);
    setError("");
    try {
      const selected = await api<{ path: string | null }>(
        "/api/library/pick-folder",
        { method: "POST" },
      );
      if (selected.path !== null) setPath(selected.path);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sélecteur de dossiers indisponible. Tu peux saisir le chemin.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true);
    setError("");
    try {
      commitSelection(
        await api<LibraryStatus>("/api/library/close", { method: "POST" }),
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de fermer la bibliothèque.",
      );
    } finally {
      setBusy(false);
    }
  }
  const library = status?.library;
  const setTotal = shell.setTotal;
  useEffect(
    () => setTotal(library?.beat_count ?? null),
    [library?.beat_count, setTotal],
  );
  const form = (
    <form
      className="library-form"
      onSubmit={(event) => {
        void select(event);
      }}
    >
      <div className="mode-selector" aria-label="Action sur la bibliothèque">
        <button
          type="button"
          aria-pressed={mode === "open"}
          onClick={() => {
            void chooseFolder("open");
          }}
          disabled={busy || !connected}
        >
          Ouvrir un dossier
        </button>
        <button
          type="button"
          aria-pressed={mode === "create"}
          onClick={() => setMode("create")}
          disabled={busy || !connected}
        >
          Créer une bibliothèque
        </button>
      </div>
      <label>
        Dossier de bibliothèque
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="Choisis un dossier ou saisis son chemin"
          required
          disabled={busy || !connected}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {
        <button
          type="button"
          aria-hidden={mode !== "create"}
          tabIndex={mode === "create" ? 0 : -1}
          style={{ visibility: mode === "create" ? "visible" : "hidden" }}
          disabled={busy || !connected || mode !== "create"}
          onClick={() => {
            void chooseFolder("create");
          }}
        >
          Choisir un dossier
        </button>
      }
      {
        <label
          aria-hidden={mode !== "create"}
          style={{ visibility: mode === "create" ? "visible" : "hidden" }}
        >
          Nom de la bibliothèque
          <input
            tabIndex={mode === "create" ? 0 : -1}
            disabled={mode !== "create" || busy || !connected}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </label>
      }
      <p className="form-hint">
        {mode === "create"
          ? "Choisis un nouveau dossier ou un dossier vide. Il contiendra tes MP3, pochettes et annotations."
          : "Choisis le dossier contenant library.json. Il peut se trouver sur ton disque externe."}
      </p>
      <button
        type="submit"
        className="primary"
        disabled={busy || !connected || !path.trim()}
      >
        {busy
          ? "Un instant…"
          : mode === "create"
            ? "Créer la bibliothèque"
            : "Ouvrir la bibliothèque"}
      </button>
    </form>
  );
  const heading = (count?: number) => (
    <div className="section-heading">
      <h2 id="library-heading">Bibliothèque</h2>
      <span className="phase sr-only">
        {!connected
          ? "—"
          : library
            ? `${count ?? library.beat_count} prod${(count ?? library.beat_count) > 1 ? "s" : ""}`
            : "Dossier portable"}
      </span>
    </div>
  );

  return (
    <section className="library-placeholder" aria-labelledby="library-heading">
      {library || !connected ? (
        <BeatGallery
          view={view}
          onView={onView}
          key={library?.id || "offline"}
          onIndexed={handleIndexed}
          heading={heading}
          tools={null}
          libraryName={library?.name || ""}
          connected={connected}
          onRetry={onRetry}
          onDiagnostic={() => shell.setSettings("diagnostic")}
          onLibrary={() => {
            setError("");
            setOpened(true);
          }}
        />
      ) : (
        <div className="library-center">
          {heading()}
          {!status && !error && (
            <p className="form-hint" role="status">
              Ouverture du catalogue…
            </p>
          )}
          {form}
        </div>
      )}
      {!shell.settings && connected && (error || status?.error) && (
        <p className="library-error" role="alert">
          {error || status?.error}
        </p>
      )}
      {shell.settings && (
        <Settings
          closeRef={closeModal}
          onClose={finishClose}
          busy={busy}
          retry={onRetry}
          library={
            <>
              <div className="library-summary">
                <strong>
                  {library?.name || "Aucune bibliothèque ouverte"}
                </strong>
                <span>{library?.beat_count || 0} prods</span>
                <p className="library-path">{library?.root}</p>
              </div>
              <div className="library-form-feedback" role="alert">
                {error}
              </div>
              {form}
              <button
                className="close-library"
                disabled={busy || !connected || !library}
                onClick={() => {
                  void close();
                }}
              >
                Fermer la bibliothèque
              </button>
            </>
          }
        />
      )}
    </section>
  );
}
