import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { TagsSettings } from "./TagsSettings";
import { api } from "./api";
import { Icon, Modal } from "./Modal";
import type { ModalClose } from "./useModalLifecycle";
import { useShell } from "./shellContext";
import type { Palette } from "./shellContext";
type Diagnostic = {
  ready: boolean;
  dependencies: {
    name: string;
    available: boolean;
    version: string | null;
    hint: string;
  }[];
};
export function Settings({
  library,
  busy,
  closeRef,
  onClose,
  retry,
}: {
  library: ReactNode;
  busy: boolean;
  closeRef: { current: ModalClose | null };
  onClose: () => void;
  retry: () => void;
}) {
  const shell = useShell();
  const [tagsBusy, setTagsBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<Diagnostic>("/api/diagnostics", { signal: controller.signal })
      .then(setDiagnostic)
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Diagnostic indisponible.");
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <Modal
      label="Réglages"
      title={<h2>Réglages</h2>}
      closeLabel="Fermer les réglages"
      onClose={onClose}
      canClose={() => !busy && !tagsBusy}
      closeRef={closeRef}
      className="settings-modal"
    >
      <nav aria-label="Rubriques des réglages">
        {(
          [
            ["diagnostic", "Diagnostic", "diagnostic"],
            ["library", "Bibliothèque", "folder"],
            ["tags", "Tags", "tag"],
            ["themes", "Thèmes", "grid"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            aria-current={shell.settings === id ? "page" : undefined}
            disabled={busy || tagsBusy}
            onClick={() => shell.setSettings(id)}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
      <section className="settings-body">
        <div hidden={shell.settings !== "diagnostic"}>
          <h3>Diagnostic</h3>
          <p className="settings-intro">
            État du moteur et des outils nécessaires aux imports.
          </p>
          <div className="diagnostic-state">
            <Icon name="diagnostic" />
            <div>
              <strong>
                {diagnostic?.ready ? "Prêt à importer" : "État du moteur"}
              </strong>
              <p role="status">
                {error ||
                  (!diagnostic
                    ? "Vérification…"
                    : diagnostic.ready
                      ? "Les outils nécessaires sont disponibles."
                      : "Une dépendance doit être configurée.")}
              </p>
            </div>
          </div>
          <ul className="dependency-list">
            {diagnostic?.dependencies.map((d) => (
              <li key={d.name}>
                <span>{d.name}</span>
                <span>{d.available ? d.version : d.hint}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              retry();
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            <Icon name="refresh" />
            Vérifier à nouveau
          </button>
        </div>
        <div hidden={shell.settings !== "library"}>
          <h3>Bibliothèque</h3>
          <p className="settings-intro">
            Tes fichiers et ton catalogue restent sur ton disque.
          </p>
          {library}
        </div>
        <div hidden={shell.settings !== "tags"}>
          <TagsSettings onBusy={setTagsBusy} />
        </div>
        <div hidden={shell.settings !== "themes"}>
          <h3>Thèmes</h3>
          <p className="settings-intro">
            Choisis les couleurs de ton espace de travail.
          </p>
          <div
            className="theme-mode"
            role="group"
            aria-label="Mode d’affichage"
          >
            <button
              aria-pressed={!shell.dark}
              onClick={() => shell.setDark(false)}
            >
              Clair
            </button>
            <button
              aria-pressed={shell.dark}
              onClick={() => shell.setDark(true)}
            >
              Sombre
            </button>
          </div>
          <div className="theme-options">
            {(["sobre", "lin", "sauge", "brume"] as Palette[]).map((p) => (
              <button
                key={p}
                aria-label={`Palette ${p}`}
                aria-pressed={shell.palette === p}
                onClick={() => shell.setPalette(p)}
              >
                <span
                  className={`theme-preview ${p} ${shell.dark ? "dark" : ""}`}
                >
                  <i />
                  <b />
                  <em />
                  <em />
                </span>
                <strong>{p[0].toUpperCase() + p.slice(1)}</strong>
                <Icon name={shell.palette === p ? "check" : "grid"} />
              </button>
            ))}
          </div>
          <p className="settings-note">
            Le thème est conservé sur cet appareil.
          </p>
        </div>
      </section>
    </Modal>
  );
}
