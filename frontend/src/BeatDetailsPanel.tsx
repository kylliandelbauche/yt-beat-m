import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api'
import { beatmakerSourceLabel, duration, externalLink, musicalKeyLabel } from './beat'
import type { Beat, BeatDetails } from './beat'
import { Artwork } from './Artwork'
import { Icon, Modal } from './Modal'
import { useTitleMarquee } from './useTitleMarquee'
import type { ModalClose } from './useModalLifecycle'

type Draft = { title: string; beatmaker: string; bpm: string; musical_key: string; description: string; sale_url: string }
function draftFor(beat: BeatDetails): Draft {
  return { title: beat.title, beatmaker: beat.beatmaker || '', bpm: beat.bpm === null ? '' : String(beat.bpm), musical_key: beat.musical_key ? musicalKeyLabel(beat.musical_key) : '', description: beat.description || '', sale_url: beat.links[0]?.url || '' }
}
function dateLabel(value: string | null, dateOnly = false) {
  if (!value) return 'Non renseignée'
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.valueOf()) ? 'Non renseignée' : new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(date)
}

export function BeatDetailsPanel({ identity, playing, onTogglePlayback, onClose, onFavorite, onChanged }: { identity: string; playing: boolean; onTogglePlayback: (beat: Beat) => void; onClose: () => void; onFavorite: (beat: Beat) => Promise<boolean>; onChanged: () => void }) {
  const form = useRef<HTMLFormElement>(null)
  const closeModal = useRef<ModalClose | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const titlePosition = useRef(0)
  // Chromium may reset native input scroll on blur, before the mode button clicks.
  const titleBlurred = useRef(false)
  const saveFocus = useRef<HTMLElement | null>(null)
  const descriptionInput = useRef<HTMLTextAreaElement>(null)
  const view = useRef({ description: 0, descriptionLeft: 0, content: 0, left: 0 })
  const [beat, setBeat] = useState<BeatDetails | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState(false)
  const [invalid, setInvalid] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  useTitleMarquee(titleInput, Boolean(beat) && !editing, titlePosition)
  useLayoutEffect(() => {
    const description = descriptionInput.current
    if (description) { description.scrollTop = view.current.description; description.scrollLeft = view.current.descriptionLeft }
    if (titleInput.current) titleInput.current.scrollLeft = titlePosition.current
    if (form.current) {
      form.current.scrollTop = view.current.content
      const left = form.current.querySelector('.detail-left')
      if (left) left.scrollTop = view.current.left
    }
  }, [editing])
  useLayoutEffect(() => {
    if (!busy && saveFocus.current) {
      if (document.activeElement === document.body) {
        const target = saveFocus.current.isConnected ? saveFocus.current : form.current?.closest('dialog')?.querySelector<HTMLButtonElement>('.edit-save')
        target?.focus({ preventScroll: true })
      }
      saveFocus.current = null
    }
  }, [busy])
  function rememberView() {
    const description = descriptionInput.current
    if (description) { view.current.description = description.scrollTop; view.current.descriptionLeft = description.scrollLeft }
    if (titleInput.current && !titleBlurred.current) titlePosition.current = titleInput.current.scrollLeft
    view.current.content = form.current?.scrollTop || 0
    view.current.left = form.current?.querySelector('.detail-left')?.scrollTop || 0
  }
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
  function update<T extends keyof Draft>(field: T, value: Draft[T]) { setError(''); setSaveError(false); setInvalid([]); setDraft((current) => current ? { ...current, [field]: value } : current) }
  function canClose() {
    if (busy) return false
    if (editing && beat && draft && JSON.stringify(draft) !== JSON.stringify(draftFor(beat))) { setConfirmDiscard(true); return false }
    return true
  }
  function focusEditor() { form.current?.closest('dialog')?.querySelector<HTMLButtonElement>('.edit-save')?.focus({ preventScroll: true }) }
  function cancel() { rememberView(); if (beat) setDraft(draftFor(beat)); setEditing(false); setConfirmDiscard(false); setError(''); setInvalid([]); setSaveError(false); focusEditor() }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!beat || !draft || !editing || busy) return
    rememberView()
    const bad = Array.from(form.current?.querySelectorAll<HTMLInputElement>('input:invalid') || [])
    if (draft.sale_url && !externalLink(draft.sale_url) && !bad.some((input) => input.id === 'detail-sale')) bad.push(form.current!.querySelector<HTMLInputElement>('#detail-sale')!)
    if (bad.length) {
      setInvalid(bad.map((input) => input.id))
      const labels: Record<string, string> = { 'detail-title': 'Titre : indique un titre non vide.', 'detail-bpm': 'BPM : indique un nombre supérieur à 0 et inférieur ou égal à 1000.', 'detail-sale': 'Page de vente : indique une adresse HTTP ou HTTPS valide.' }
      setError(bad.map((input) => labels[input.id] || 'Vérifie les informations saisies.').join(' ')); setSaveError(false)
      return
    }
    saveFocus.current = document.activeElement as HTMLElement
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
      rememberView()
      setBeat(result); setDraft(draftFor(result)); setEditing(false); setConfirmDiscard(false); setNotice('Informations enregistrées.'); onChanged()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Informations non enregistrées.'
      setError(message); setSaveError(true)
      const fields: Record<string, string> = { Titre: 'detail-title', BPM: 'detail-bpm', Tonalité: 'detail-key', Beatmaker: 'detail-maker', Description: 'detail-description', Liens: 'detail-sale' }
      setInvalid(Object.entries(fields).filter(([label]) => message.includes(`${label} :`)).map(([, id]) => id))
    }
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
  return <Modal label={beat?.title || 'Détails de la prod'} title={<div className="detail-mode-title"><p className="eyebrow">DÉTAILS DE LA PROD</p><button className="cancel-detail" type="button" disabled={!editing || busy} aria-hidden={!editing} tabIndex={editing ? 0 : -1} aria-label="Annuler les modifications" onClick={cancel}>Annuler</button></div>} closeLabel="Fermer la fiche" onClose={onClose} canClose={canClose} closeRef={closeModal} className={`beat-details${editing ? ' is-editing' : ''}`} actions={<>
    <button className="icon-button details-favorite" disabled={busy || !beat} aria-label={beat?.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={beat?.favorite || false} onClick={() => { void favorite() }}><Icon name="heart" filled={beat?.favorite} /></button>
    <button className={`icon-button edit-save${editing ? ' saving-mode' : notice ? ' saved-mode' : ''}`} disabled={busy || !beat} aria-busy={busy && editing} type="button" aria-label={editing ? 'Enregistrer les modifications' : 'Modifier la prod'} title={editing ? 'Enregistrer les modifications' : notice ? 'Informations enregistrées. Modifier la prod' : 'Modifier la prod'} onClick={() => { if (editing) form.current?.requestSubmit(); else { rememberView(); if (beat) setDraft(draftFor(beat)); setEditing(true); setError(''); setNotice(''); setInvalid([]); setSaveError(false) } }}><Icon name={editing ? 'save' : notice ? 'check' : 'edit'} /></button>
  </>}>
    <div className="sr-only" role="status" aria-atomic="true">{notice}</div>
    {error && <div className="detail-feedback has-error">
      <div className="detail-error"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 6V13M12 16V18" stroke="currentColor" strokeWidth="1.6" /></svg><p id="detail-error-message" className="library-error" role="alert" tabIndex={0} title={error}>{error}</p>{editing && <button type="button" className="cancel-save-error" disabled={busy} aria-label="Annuler les modifications" onClick={cancel}>Annuler</button>}{saveError && editing && <button type="button" className="retry-save" disabled={busy} onClick={() => form.current?.requestSubmit()}>Réessayer</button>}{beat && <button type="button" aria-label="Masquer le message d’erreur" onClick={() => { setError(''); setInvalid([]); focusEditor() }}>✕</button>}</div>
    </div>}
    {confirmDiscard && <div className="detail-feedback discard-feedback"><div className="discard-prompt" role="alert"><p>Des modifications ne sont pas enregistrées.</p><button onClick={() => { setConfirmDiscard(false); focusEditor() }}>Continuer l’édition</button><button onClick={() => closeModal.current?.(true)}>Abandonner et fermer</button></div></div>}
    {!beat && !error && <p className="form-hint" role="status">Chargement de la fiche…</p>}
    {!beat && error && <button onClick={() => { setError(''); setAttempt((n) => n + 1) }}>Réessayer</button>}
    {beat && draft && <form ref={form} id="beat-edit-form" className="details-content details-columns" noValidate onSubmit={(event) => { void save(event) }}>
      <div className="detail-left">
        <div className="detail-cover"><Artwork beat={beat} className="detail-artwork" /><button type="button" className="detail-play cover-play" aria-label={`${playing ? 'Mettre en pause' : 'Écouter'} ${beat.title}`} onClick={() => onTogglePlayback(beat)}><Icon name={playing ? 'pause' : 'play'} filled /></button></div>
        <dl className="detail-music">
          <div><dt>Durée</dt><dd><span className="detail-value">{duration(beat.duration_seconds)}</span></dd></div>
          <div><dt><label htmlFor="detail-bpm">BPM</label></dt><dd><input className="detail-value" id="detail-bpm" type="number" step="any" min="0.01" max="1000" readOnly={!editing || busy} aria-invalid={invalid.includes('detail-bpm')} aria-describedby={invalid.includes('detail-bpm') ? 'detail-error-message' : undefined} placeholder="—" value={draft.bpm} onChange={(e) => update('bpm', e.target.value)} /></dd></div>
          <div><dt><label htmlFor="detail-key">Tonalité</label></dt><dd><input className="detail-value" id="detail-key" readOnly={!editing || busy} aria-invalid={invalid.includes('detail-key')} aria-describedby={invalid.includes('detail-key') ? 'detail-error-message' : undefined} maxLength={80} value={draft.musical_key} placeholder="—" onChange={(e) => update('musical_key', e.target.value)} /></dd></div>
        </dl>
        <div className="detail-links">
          <button type="button" className="reveal-file" disabled={revealing} aria-busy={revealing} onClick={() => { void reveal() }}>Afficher le fichier ↗</button>
          <div className={`sale-field${editing ? ' sale-link-input' : saleLink ? ' sale-link-container' : ' sale-link-empty'}`}><label className="sale-label" htmlFor="detail-sale">Page de vente</label><input id="detail-sale" type="url" readOnly={!editing || busy} tabIndex={editing ? 0 : -1} aria-hidden={!editing} aria-invalid={invalid.includes('detail-sale')} aria-describedby={invalid.includes('detail-sale') ? 'detail-error-message' : undefined} maxLength={2048} placeholder="https://…" value={draft.sale_url} onChange={(e) => update('sale_url', e.target.value)} />{!editing && saleLink && <a className="sale-link sale-target" aria-label="Page de vente ↗" title={saleLink} href={saleLink} target="_blank" rel="noreferrer"><span className="sale-arrow" aria-hidden="true">↗</span></a>}</div>
          {source && <a className="youtube-link" href={source} target="_blank" rel="noreferrer">Voir sur YouTube ↗</a>}
        </div>
      </div>
      <div className="detail-right">
        <h2 id="beat-details-title" aria-label={beat.title} tabIndex={0}><label className="detail-title-input"><span className="sr-only">Titre de la prod</span><input ref={titleInput} id="detail-title" title={beat.title} type="text" required maxLength={500} readOnly={!editing || busy} aria-invalid={invalid.includes('detail-title')} aria-describedby={invalid.includes('detail-title') ? 'detail-error-message' : undefined} value={draft.title} onFocus={() => { titleBlurred.current = false }} onBlur={(event) => { if (event.currentTarget.scrollLeft) titlePosition.current = event.currentTarget.scrollLeft; titleBlurred.current = true; const input = event.currentTarget; requestAnimationFrame(() => { if (input.isConnected && titleBlurred.current) input.scrollLeft = titlePosition.current }) }} onScroll={(event) => { if (!titleBlurred.current) titlePosition.current = event.currentTarget.scrollLeft }} onChange={(e) => update('title', e.target.value)} /></label></h2>
        <dl className="detail-identity">
          <div><dt><label htmlFor="detail-maker">Beatmaker</label></dt><dd><input className="identity-value" id="detail-maker" aria-label="Nom du beatmaker" title={beatmakerSourceLabel(beat.beatmaker_source)} aria-description={beatmakerSourceLabel(beat.beatmaker_source)} aria-invalid={invalid.includes('detail-maker')} aria-describedby={invalid.includes('detail-maker') ? 'detail-error-message' : undefined} maxLength={200} readOnly={!editing || busy} placeholder="Non renseigné" value={draft.beatmaker} onChange={(e) => update('beatmaker', e.target.value)} /></dd></div>
          <div className="source-identity"><dt>Chaîne YouTube</dt><dd title={beat.channel || undefined}><span className="identity-value">{beat.channel || 'Non renseignée'}</span></dd></div>
        </dl>
        <dl className="detail-dates"><div><dt>Publication YouTube</dt><dd>{dateLabel(beat.published_on, true)}</dd></div><div><dt>Ajout à la bibliothèque</dt><dd>{dateLabel(beat.added_at)}</dd></div></dl>
        <section className="detail-description"><label htmlFor="detail-description">{beat.metadata_provenance?.description === 'manual' ? 'Description corrigée' : 'Description d’origine'}</label><textarea ref={descriptionInput} className="description-scroll" id="detail-description" aria-label="Description de la prod" maxLength={100000} readOnly={!editing || busy} aria-invalid={invalid.includes('detail-description')} aria-describedby={invalid.includes('detail-description') ? 'detail-error-message' : undefined} placeholder="Aucune description disponible." value={draft.description} onChange={(e) => update('description', e.target.value)} /></section>
      </div>

    </form>}
  </Modal>
}
