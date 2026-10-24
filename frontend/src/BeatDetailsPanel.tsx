import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { duration, externalLink } from './beat'
import type { Beat, BeatDetails } from './beat'

function dateLabel(value: string | null, dateOnly = false) {
  if (!value) return 'Non renseignée'
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.valueOf()) ? 'Non renseignée' : new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(date)
}

export function BeatDetailsPanel({ identity, onClose, onFavorite }: {
  identity: string
  onClose: () => void
  onFavorite: (beat: Beat) => Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [beat, setBeat] = useState<BeatDetails | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const panel = dialog.current
    const previous = document.activeElement
    panel?.showModal()
    return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    api<BeatDetails>(`/api/beats/${identity}`, { signal: controller.signal })
      .then(setBeat)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Fiche indisponible.')
      })
    return () => controller.abort()
  }, [identity, attempt])

  async function favorite() {
    if (!beat) return
    setBusy(true)
    setError('')
    try {
      const value = await onFavorite(beat)
      setBeat((current) => current ? { ...current, favorite: value } : current)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Le favori n’a pas pu être enregistré.')
    } finally { setBusy(false) }
  }

  const source = externalLink(beat?.source_url || null)
  return <dialog ref={dialog} className="beat-details" aria-labelledby="beat-details-title" onCancel={onClose}>
    <header className="details-header"><p className="eyebrow">DANS TA COLLECTION</p><button autoFocus onClick={onClose} aria-label="Fermer la fiche">✕</button></header>
    <h2 id="beat-details-title">{beat?.title || 'Détails de la prod'}</h2>
    {error && <p className="library-error" role="alert">{error}</p>}
    {!beat && !error && <p className="form-hint" role="status">Chargement de la fiche…</p>}
    {!beat && error && <button onClick={() => { setError(''); setAttempt((value) => value + 1) }}>Réessayer</button>}
    {beat && <>
      <button className="details-favorite" disabled={busy} aria-pressed={beat.favorite} onClick={() => { void favorite() }}>{beat.favorite ? '♥ Dans tes favoris' : '♡ Ajouter aux favoris'}</button>
      <dl className="metadata-grid">
        <div><dt>Beatmaker</dt><dd>{beat.beatmaker || 'Non renseigné'}</dd></div>
        <div><dt>Chaîne YouTube</dt><dd>{beat.channel || 'Non renseignée'}</dd></div>
        <div><dt>Durée</dt><dd>{duration(beat.duration_seconds)}</dd></div>
        <div><dt>BPM</dt><dd>{beat.bpm ?? 'Non renseigné'}</dd></div>
        <div><dt>Tonalité</dt><dd>{beat.musical_key || 'Non renseignée'}</dd></div>
        <div><dt>Publication YouTube</dt><dd>{dateLabel(beat.published_on, true)}</dd></div>
        <div><dt>Ajout à la bibliothèque</dt><dd>{dateLabel(beat.added_at)}</dd></div>
      </dl>
      <section className="details-section"><h3>Styles et ambiances</h3>
        {beat.styles.length || beat.moods.length ? <div className="tag-list">{beat.styles.map((tag) => <span key={`style:${tag}`}>{tag}</span>)}{beat.moods.map((tag) => <span key={`mood:${tag}`}>{tag}</span>)}</div> : <p>Pas encore renseignés.</p>}
      </section>
      {source && <a className="source-link" href={source} target="_blank" rel="noreferrer">Voir la vidéo YouTube ↗</a>}
      {beat.links.some((link) => externalLink(link.url)) && <section className="details-section"><h3>Liens de la description</h3><ul className="source-links">{beat.links.map((link) => externalLink(link.url) ? <li key={link.url}><a href={externalLink(link.url)!} target="_blank" rel="noreferrer">{link.label || new URL(link.url).hostname} ↗</a></li> : null)}</ul></section>}
      {beat.description && <section className="details-section"><h3>Description d’origine</h3><p className="source-description">{beat.description}</p></section>}
    </>}
  </dialog>
}
