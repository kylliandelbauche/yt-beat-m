import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { duration, externalLink, musicalKeyLabel } from './beat'
import type { Beat, BeatDetails } from './beat'
import { Artwork } from './Artwork'
import { Icon, Modal } from './Modal'

type Draft = { title: string; beatmaker: string; bpm: string; musical_key: string; description: string; styles: string; moods: string; links: BeatDetails['links']; remember: boolean; reset: boolean; forget: boolean }
function draftFor(beat: BeatDetails): Draft {
  return { title: beat.title, beatmaker: beat.beatmaker || '', bpm: beat.bpm === null ? '' : String(beat.bpm), musical_key: beat.musical_key || '', description: beat.description || '', styles: beat.styles.join(', '), moods: beat.moods.join(', '), links: beat.links.map((link) => ({ ...link })), remember: false, reset: false, forget: false }
}
function dateLabel(value: string | null, dateOnly = false) {
  if (!value) return 'Non renseignée'
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.valueOf()) ? 'Non renseignée' : new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(date)
}
const origins: Record<string, string> = { explicit_credit: 'Crédit explicite du titre ou de la description.', channel: 'Proposé depuis la chaîne YouTube ; le nom reste corrigeable.', channel_alias: 'Nom mémorisé pour cette chaîne.', ambiguous_credit: 'Plusieurs crédits différents : à préciser.', manual: 'Nom corrigé pour cette prod.', legacy: 'Nom déjà présent dans ta bibliothèque.' }

export function BeatDetailsPanel({ identity, onClose, onFavorite, onChanged }: { identity: string; onClose: () => void; onFavorite: (beat: Beat) => Promise<boolean>; onChanged: () => void }) {
  const form = useRef<HTMLFormElement>(null)
  const [beat, setBeat] = useState<BeatDetails | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
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
    for (const key of ['title', 'description', 'beatmaker', 'musical_key'] as const) if (draft[key] !== original[key] && !(key === 'beatmaker' && draft.reset)) patch[key] = key === 'title' ? draft[key] : draft[key].trim() || null
    if (draft.bpm !== original.bpm) patch.bpm = draft.bpm.trim() ? Number(draft.bpm) : null
    for (const key of ['styles', 'moods'] as const) if (draft[key] !== original[key]) patch[key] = draft[key].split(',').map((v) => v.trim()).filter(Boolean)
    if (JSON.stringify(draft.links) !== JSON.stringify(original.links)) patch.links = draft.links
    if (draft.remember && !draft.reset) patch.remember_channel = true
    if (draft.reset) patch.reset_beatmaker = true
    if (draft.forget) patch.forget_channel_alias = true
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
  const source = externalLink(beat?.source_url || null)
  const links = beat?.links.filter((link) => externalLink(link.url)) || []
  const originals = beat?.metadata_provenance?.original_metadata as Record<string, { value: unknown }> | undefined
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
        <Artwork beat={beat} className="detail-artwork" />
        <dl className="detail-music">
          <div><dt>Durée</dt><dd>{duration(beat.duration_seconds)}</dd></div>
          <div><dt>{editing ? <label htmlFor="detail-bpm">BPM</label> : 'BPM'}</dt><dd>{editing ? <input id="detail-bpm" type="number" step="any" min="0.01" max="1000" disabled={busy} value={draft.bpm} onChange={(e) => update('bpm', e.target.value)} /> : beat.bpm ?? '—'}</dd></div>
          <div><dt>{editing ? <label htmlFor="detail-key">Tonalité</label> : 'Tonalité'}</dt><dd>{editing ? <input id="detail-key" disabled={busy} maxLength={80} value={draft.musical_key} placeholder="F mineur" onChange={(e) => update('musical_key', e.target.value)} /> : <span title={beat.musical_key || undefined}>{musicalKeyLabel(beat.musical_key)}</span>}</dd></div>
        </dl>
        <details className="detail-annotations" open={editing || undefined}><summary>Annotations et origine</summary><div>
          <p className="form-hint">{origins[beat.beatmaker_source || ''] || 'Aucun crédit de producteur identifié.'}</p>
          {editing ? <>
            <label>Styles<input disabled={busy} value={draft.styles} placeholder="R&B, drill" onChange={(e) => update('styles', e.target.value)} /></label>
            <label>Ambiances<input disabled={busy} value={draft.moods} placeholder="Mélancolique, sombre" onChange={(e) => update('moods', e.target.value)} /></label>
            <p className="form-hint">Sépare les tags par des virgules. Un champ vide reste non renseigné.</p>
            {beat.can_remember_channel && <label className="check-label"><input type="checkbox" disabled={busy || !draft.beatmaker.trim() || draft.reset || draft.forget || beat.beatmaker_source === 'ambiguous_credit'} checked={draft.remember} onChange={(e) => update('remember', e.target.checked)} />Mémoriser pour les prochains imports de cette chaîne</label>}
            {beat.can_remember_channel && <p className="form-hint">{beat.channel_id_known ? 'La règle suit l’identifiant de cette chaîne.' : 'Identifiant indisponible : la règle suit le nom affiché, avec un risque d’homonymie.'} Les crédits différents et collaborations restent distincts ; Actualiser applique la règle aux anciennes prods.</p>}
            {['manual', 'legacy'].includes(beat.beatmaker_source || '') && <label className="check-label"><input type="checkbox" checked={draft.reset} disabled={busy} onChange={(e) => { update('reset', e.target.checked); update('remember', false) }} />Revenir à la proposition</label>}
            {beat.channel_alias && <label className="check-label"><input type="checkbox" disabled={busy} checked={draft.forget} onChange={(e) => { update('forget', e.target.checked); update('remember', false) }} />Supprimer la règle de chaîne</label>}
          </> : <><div className="tag-list">{[...beat.styles, ...beat.moods].map((v, i) => <span key={i}>{v}</span>)}</div>{!beat.styles.length && !beat.moods.length && <p className="form-hint">Pas encore de tags.</p>}{beat.channel_alias && <p className="form-hint">Nom mémorisé pour cette chaîne : {beat.channel_alias.beatmaker}</p>}</>}
          {originals && <details className="metadata-origins"><summary>Valeurs d’origine avant correction</summary><dl>{Object.entries(originals).map(([key, item]) => <div key={key}><dt>{({ bpm: 'BPM', musical_key: 'Tonalité', title: 'Titre', description: 'Description', styles: 'Styles', moods: 'Ambiances', links: 'Liens' } as Record<string, string>)[key] || key}</dt><dd>{item.value === null || item.value === '' ? 'Non renseigné' : Array.isArray(item.value) ? item.value.map((v: unknown) => typeof v === 'object' && v !== null && 'url' in v ? String(v.url) : String(v)).join(', ') || 'Non renseigné' : String(item.value)}</dd></div>)}</dl></details>}
        </div></details>
        <div className="detail-links">
          {editing ? <fieldset disabled={busy}><legend>Liens d’achat</legend>{draft.links.map((link, i) => <div className="edit-link" key={i}>
            <label>URL du lien {i + 1}<input type="url" required maxLength={2048} value={link.url} onChange={(e) => update('links', draft.links.map((v, n) => n === i ? { ...v, url: e.target.value } : v))} /></label>
            <label>Libellé du lien {i + 1}<input maxLength={120} value={link.label || ''} onChange={(e) => update('links', draft.links.map((v, n) => n === i ? { ...v, label: e.target.value || null } : v))} /></label>
            <button type="button" aria-label={`Retirer le lien ${i + 1}`} onClick={() => update('links', draft.links.filter((_, n) => n !== i))}>Retirer</button>
          </div>)}<button type="button" disabled={draft.links.length >= 20} onClick={() => update('links', [...draft.links, { url: '', label: null }])}>Ajouter un lien</button></fieldset> : links.map((link, i) => <a className="sale-link" key={link.url} href={externalLink(link.url)!} target="_blank" rel="noreferrer">{i ? link.label || `Page de vente ${i + 1}` : 'Page de vente'} ↗</a>)}
          {source && <a className="youtube-link" href={source} target="_blank" rel="noreferrer">Voir sur YouTube ↗</a>}
        </div>
      </div>
      <div className="detail-right">
        {editing ? <label className="detail-title-input"><span className="sr-only">Titre de la prod</span><textarea required maxLength={500} disabled={busy} value={draft.title} onChange={(e) => update('title', e.target.value)} /></label> : <h2 id="beat-details-title" title={beat.title}>{beat.title}</h2>}
        <dl className="detail-identity">
          <div><dt>{editing ? <label htmlFor="detail-maker">Beatmaker</label> : 'Beatmaker'}</dt><dd>{editing ? <input id="detail-maker" aria-label="Nom du beatmaker" maxLength={200} disabled={busy || draft.reset} value={draft.beatmaker} onChange={(e) => { update('beatmaker', e.target.value); if (!e.target.value.trim()) update('remember', false) }} /> : beat.beatmaker || 'Non renseigné'}</dd></div>
          <div><dt>Chaîne YouTube</dt><dd title={beat.channel || undefined}>{beat.channel || 'Non renseignée'}</dd></div>
        </dl>
        <dl className="detail-dates"><div><dt>Publication YouTube</dt><dd>{dateLabel(beat.published_on, true)}</dd></div><div><dt>Ajout à la bibliothèque</dt><dd>{dateLabel(beat.added_at)}</dd></div></dl>
        <section className="detail-description"><label htmlFor={editing ? 'detail-description' : undefined}>{beat.metadata_provenance?.description === 'manual' ? 'Description corrigée' : 'Description d’origine'}</label>{editing ? <textarea id="detail-description" aria-label="Description de la prod" maxLength={100000} disabled={busy} value={draft.description} onChange={(e) => update('description', e.target.value)} /> : <div className="description-scroll" tabIndex={0}>{beat.description || 'Aucune description disponible.'}</div>}</section>
      </div>

    </form>}
  </Modal>
}
