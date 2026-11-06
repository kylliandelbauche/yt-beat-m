import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { externalLink } from "./beat";
import { Modal } from "./Modal";
import type { ModalClose } from "./useModalLifecycle";

export type MarketField = "bpm" | "musical_key" | "beatmaker" | "tags";
export type MarketProposal = {
  field: MarketField;
  value: number | string | string[];
  sources: { url: string; data_url: string; field: string; source: string }[];
  names: string[];
};
export type MarketStatus = {
  state: "idle" | "queued" | "running" | "ready" | "failed";
  updated_at: string | null;
  error_message: string | null;
  result: {
    proposals?: MarketProposal[];
    products?: {
      title: string;
      url: string;
      source: string;
      published_on: string | null;
    }[];
    failures?: { url: string; message: string }[];
    applied?: string[];
  };
};
const labels: Record<MarketField, string> = {
  bpm: "BPM",
  musical_key: "Tonalité",
  beatmaker: "Beatmaker",
  tags: "Tags",
};
function display(value: unknown) {
  return Array.isArray(value)
    ? value.length
      ? value.join(" · ")
      : "Aucun"
    : value === null || value === ""
      ? "Non renseigné"
      : String(value);
}
export function MarketplaceDialog({
  identity,
  values,
  onClose,
  onUse,
  onResolved,
}: {
  identity: string;
  values: Record<MarketField, string | string[] | number | null>;
  onClose: () => void;
  onUse: (proposals: MarketProposal[]) => void;
  onResolved: () => void;
}) {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const close = useRef<ModalClose | null>(null);
  const chosen = useRef<MarketProposal[] | null>(null);
  const resolved = useRef<string | null>(null);
  const resolvedCallback = useRef(onResolved);
  useEffect(() => {
    resolvedCallback.current = onResolved;
  });
  const pending =
    busy ||
    (!status && !error) ||
    (!!status && ["queued", "running"].includes(status.state));
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        let result = await api<MarketStatus>(
          `/api/beats/${identity}/enrichment`,
          { signal: controller.signal },
        );
        if (result.state === "idle")
          result = await api<MarketStatus>(
            `/api/beats/${identity}/enrichment`,
            { method: "POST", signal: controller.signal },
          );
        if (!controller.signal.aborted) {
          setStatus(result);
          setError("");
          if (
            !["queued", "running", "idle"].includes(result.state) &&
            result.updated_at !== resolved.current
          ) {
            resolved.current = result.updated_at;
            resolvedCallback.current();
          }
          if (["queued", "running"].includes(result.state))
            timer = setTimeout(() => void poll(), 500);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [identity, attempt]);
  async function retry() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<MarketStatus>(
        `/api/beats/${identity}/enrichment`,
        { method: "POST" },
      );
      setStatus(result);
      setSelected({});
      setAttempt((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const proposals = status?.result.proposals || [];
  return (
    <Modal
      label="Informations de la page de vente"
      title="Compléter les informations"
      closeLabel="Fermer les informations de vente"
      onClose={() => {
        onClose();
        if (chosen.current) onUse(chosen.current);
      }}
      closeRef={close}
      className="marketplace-modal"
    >
      <p className="marketplace-intro">
        Les champs manquants sont complétés sans remplacer tes corrections.
        Sélectionne d’autres valeurs pour ton brouillon, puis utilise
        Enregistrer dans la fiche.
      </p>
      <div className="marketplace-results" aria-busy={pending}>
        {pending && <p role="status">Lecture des informations publiques…</p>}
        {!pending && !proposals.length && (
          <p>Aucune proposition disponible pour le moment.</p>
        )}
        {proposals.map((proposal, index) => {
          const current = values[proposal.field];
          const same =
            proposal.field === "tags"
              ? (proposal.value as string[]).every((tag) =>
                  (current as string[]).includes(tag),
                )
              : String(proposal.value) === String(current ?? "");
          return (
            <div
              className="marketplace-proposal"
              key={`${proposal.field}:${index}`}
            >
              <label>
                <input
                  type="checkbox"
                  aria-label={`Utiliser ${labels[proposal.field]} : ${display(proposal.value)}`}
                  checked={selected[proposal.field] === index}
                  disabled={pending || status?.state !== "ready" || same}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = { ...s };
                      if (e.target.checked) next[proposal.field] = index;
                      else delete next[proposal.field];
                      return next;
                    })
                  }
                />
                <span>
                  <strong>
                    {labels[proposal.field]} · {display(proposal.value)}
                  </strong>
                  <small>
                    {same
                      ? "Déjà présent"
                      : `Actuellement : ${display(current)}`}
                  </small>
                </span>
              </label>
              <div className="marketplace-sources">
                {proposal.sources.map((source) => (
                  <a
                    key={source.url}
                    href={externalLink(source.url) || undefined}
                    target="_blank"
                    rel="noreferrer"
                    title={source.field}
                  >
                    {source.source} ↗
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        {status?.result.products?.map((product) => (
          <p className="marketplace-date" key={product.url}>
            {product.source} · Publication boutique :{" "}
            {product.published_on
              ? new Intl.DateTimeFormat("fr-BE", {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(`${product.published_on}T00:00:00Z`))
              : "non renseignée"}
            <small>La date YouTube reste inchangée.</small>
          </p>
        ))}
        {status?.result.failures?.map((failure) => (
          <p className="marketplace-failure" key={failure.url}>
            {failure.message}
          </p>
        ))}
      </div>
      <div
        className="marketplace-feedback"
        role={error || status?.error_message ? "alert" : "status"}
      >
        {error || status?.error_message || ""}
      </div>
      <footer className="marketplace-actions">
        <button
          type="button"
          onClick={() => void retry()}
          disabled={
            busy || (!!status && ["queued", "running"].includes(status.state))
          }
        >
          Relire la page
        </button>
        <button
          type="button"
          className="primary"
          disabled={
            pending ||
            status?.state !== "ready" ||
            !Object.keys(selected).length
          }
          onClick={() => {
            chosen.current = Object.values(selected).map(
              (index) => proposals[index],
            );
            close.current?.(true);
          }}
        >
          Utiliser la sélection
        </button>
      </footer>
    </Modal>
  );
}
