import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { duration, externalLink, musicalKeyLabel } from './beat'
import type { Beat, BeatDetails } from './beat'
import { Artwork } from './Artwork'
import { Icon, Modal } from './Modal'

type Draft = { title: string; beatmaker: string; bpm: string; musical_key: string; description: string; sale_url: string }
function draftFor(beat: BeatDetails): Draft {
  return { title: beat.title, beatmaker: beat.beatmaker || '', bpm: beat.bpm === null ? '' : String(beat.bpm), musical_key: beat.musical_key || '', description: beat.description || '', sale_url: beat.links[0]?.url || '' }
}
function dateLabel(value: string | null, dateOnly = false) {
  if (!value) return 'Non renseignée'
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.valueOf()) ? 'Non renseignée' : new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(date)
}

export function BeatDetailsPanel({ identity, playing, onTogglePlayback, onClose, onFavorite, onChanged }: { identity: string; playing: boolean; onTogglePlayback: (beat: Beat) => void; onClose: () => void; onFavorite: (beat: Beat) => Promise<boolean>; onChanged: () => void }) {
  const form = useRef<HTMLFormElement>(null)
  const [beat, setBeat] = useState<BeatDetails | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api<BeatDetails>(`/api/beats/${identity}`, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) { setBeat(value); setDraft(draftFor(value)) }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Fiche indisponible.') })
    return () => controller.abort()
  }, [identity, attempt])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])
  function update<T extends keyof Draft>(field: T, value: Draft[T]) { setError(''); setDraft((current) => current ? { ...current, [field]: value } : current) }
  function close() {
    if (busy) return
    if (editing && beat && draft && JSON.stringify(draft) !== JSON.stringify(draftFor(beat))) setConfirmDiscard(true)
    else onClose()
  }
  function focusEditor() { form.current?.closest('dialog')?.querySelector<HTMLButtonElement>('.edit-save')?.focus() }
  function cancel() { if (beat) setDraft(draftFor(beat)); setEditing(false); setConfirmDiscard(false); setError(''); focusEditor() }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!beat || !draft) return
    setBusy(true); setError(''); setNotice('')
    const original = draftFor(beat)
    const patch: Record<string, unknown> = {}
    for (const key of ['title', 'description', 'beatmaker', 'musical_key'] as const) if (draft[key] !== original[key]) patch[key] = key === 'title' ? draft[key] : draft[key].trim() || null
    if (draft.bpm !== original.bpm) patch.bpm = draft.bpm.trim() ? Number(draft.bpm) : null
    if (draft.sale_url !== original.sale_url) patch.links = [
      ...(draft.sale_url.trim() ? [{ url: draft.sale_url.trim(), label: beat.links[0]?.label || null }] : []),
      ...beat.links.slice(1),
    ]
    try {
      const result = await api<BeatDetails>(`/api/beats/${beat.id}/metadata`, { method: 'PATCH', body: JSON.stringify(patch) })
      setBeat(result); setDraft(draftFor(result)); setEditing(false); setConfirmDiscard(false); setNotice('Informations enregistrées.'); onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Informations non enregistrées.') }
    finally { setBusy(false) }
  }
  async function favorite() {
    if (!beat) return
    setBusy(true); setError('')
    try { const value = await onFavorite(beat); setBeat((current) => current ? { ...current, favorite: value } : current) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Favori non enregistré.') }
    finally { setBusy(false) }
  }
  async function reveal() {
    setRevealing(true); setError('')
    try { await api(`/api/beats/${identity}/reveal`, { method: 'POST' }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’afficher le fichier. Réessaie.') }
    finally { setRevealing(false) }
  }
  const source = externalLink(beat?.source_url || null)
  const saleLink = externalLink(beat?.links[0]?.url || null)
  return <Modal label={beat?.title || 'Détails de la prod'} title={<div className="detail-mode-title"><p className="eyebrow">{editing ? 'MODIFICATION DES INFORMATIONS' : 'DÉTAILS DE LA PROD'}</p>{editing && <button type="button" disabled={busy} aria-label="Annuler les modifications" onClick={cancel}>Annuler</button>}</div>} closeLabel="Fermer la fiche" onClose={close} className={`beat-details${editing ? ' is-editing' : ''}`} actions={<>
    <button className="icon-button details-favorite" disabled={busy || !beat} aria-label={beat?.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={beat?.favorite || false} onClick={() => { void favorite() }}><Icon name="heart" filled={beat?.favorite} /></button>
    <button className={`icon-button edit-save${editing ? ' saving-mode' : notice ? ' saved-mode' : ''}`} disabled={busy || !beat} type="button" aria-label={editing ? 'Enregistrer les modifications' : 'Modifier la prod'} title={editing ? 'Enregistrer les modifications' : notice ? 'Informations enregistrées. Modifier la prod' : 'Modifier la prod'} onClick={() => { if (editing) form.current?.requestSubmit(); else { if (beat) setDraft(draftFor(beat)); setEditing(true); setError(''); setNotice('') } }}><Icon name={editing ? 'save' : notice ? 'check' : 'edit'} /></button>
  </>}>
    <div className="sr-only" role="status" aria-atomic="true">{notice}</div>
    {(error || confirmDiscard) && <div className="detail-feedback">
      {error && <div className="detail-error"><p className="library-error" role="alert">{error}</p>{beat && <button type="button" aria-label="Masquer le message d’erreur" onClick={() => { setError(''); focusEditor() }}>✕</button>}</div>}
      {confirmDiscard && <div className="discard-prompt" role="alert"><p>Des modifications ne sont pas enregistrées.</p><button onClick={() => { setConfirmDiscard(false); focusEditor() }}>Continuer l’édition</button><button onClick={onClose}>Abandonner et fermer</button></div>}
    </div>}
    {!beat && !error && <p className="form-hint" role="status">Chargement de la fiche…</p>}
    {!beat && error && <button onClick={() => { setError(''); setAttempt((n) => n + 1) }}>Réessayer</button>}
    {beat && draft && <form ref={form} id="beat-edit-form" className="details-content details-columns" onSubmit={(event) => { void save(event) }}>
      <div className="detail-left">
        <div className="detail-cover"><Artwork beat={beat} className="detail-artwork" /><button type="button" className="detail-play cover-play" aria-label={`${playing ? 'Mettre en pause' : 'Écouter'} ${beat.title}`} onClick={() => onTogglePlayback(beat)}><Icon name={playing ? 'pause' : 'play'} filled /></button></div>
        <dl className="detail-music">
          <div><dt>Durée</dt><dd>{duration(beat.duration_seconds)}</dd></div>
          <div><dt>{editing ? <label htmlFor="detail-bpm">BPM</label> : 'BPM'}</dt><dd>{editing ? <input id="detail-bpm" type="number" step="any" min="0.01" max="1000" disabled={busy} value={draft.bpm} onChange={(e) => update('bpm', e.target.value)} /> : beat.bpm ?? '—'}</dd></div>
          <div><dt>{editing ? <label htmlFor="detail-key">Tonalité</label> : 'Tonalité'}</dt><dd>{editing ? <input id="detail-key" disabled={busy} maxLength={80} value={draft.musical_key} placeholder="F mineur" onChange={(e) => update('musical_key', e.target.value)} /> : <span title={beat.musical_key || undefined}>{musicalKeyLabel(beat.musical_key)}</span>}</dd></div>
        </dl>
        <div className="detail-links">
          <button type="button" className="reveal-file" disabled={revealing} aria-busy={revealing} onClick={() => { void reveal() }}>Afficher le fichier ↗</button>
          {editing ? <label className="sale-link-input">Page de vente<input type="url" disabled={busy} maxLength={2048} placeholder="https://…" value={draft.sale_url} onChange={(e) => update('sale_url', e.target.value)} /></label> : saleLink ? <a className="sale-link" href={saleLink} target="_blank" rel="noreferrer">Page de vente ↗</a> : <span className="sale-link-empty">Aucune page de vente</span>}
          {source && <a className="youtube-link" href={source} target="_blank" rel="noreferrer">Voir sur YouTube ↗</a>}
        </div>
      </div>
      <div className="detail-right">
        {editing ? <label className="detail-title-input"><span className="sr-only">Titre de la prod</span><textarea required maxLength={500} disabled={busy} value={draft.title} onChange={(e) => update('title', e.target.value)} /></label> : <h2 id="beat-details-title" title={beat.title}>{beat.title}</h2>}
        <dl className="detail-identity">
          <div><dt>{editing ? <label htmlFor="detail-maker">Beatmaker</label> : 'Beatmaker'}</dt><dd>{editing ? <input id="detail-maker" aria-label="Nom du beatmaker" maxLength={200} disabled={busy} value={draft.beatmaker} onChange={(e) => update('beatmaker', e.target.value)} /> : beat.beatmaker || 'Non renseigné'}</dd></div>
          <div><dt>Chaîne YouTube</dt><dd title={beat.channel || undefined}>{beat.channel || 'Non renseignée'}</dd></div>
        </dl>
        <dl className="detail-dates"><div><dt>Publication YouTube</dt><dd>{dateLabel(beat.published_on, true)}</dd></div><div><dt>Ajout à la bibliothèque</dt><dd>{dateLabel(beat.added_at)}</dd></div></dl>
        <section className="detail-description"><label htmlFor={editing ? 'detail-description' : undefined}>{beat.metadata_provenance?.description === 'manual' ? 'Description corrigée' : 'Description d’origine'}</label>{editing ? <textarea id="detail-description" aria-label="Description de la prod" maxLength={100000} disabled={busy} value={draft.description} onChange={(e) => update('description', e.target.value)} /> : <div className="description-scroll" tabIndex={0}>{beat.description || 'Aucune description disponible.'}</div>}</section>
      </div>

    </form>}
  </Modal>
}
