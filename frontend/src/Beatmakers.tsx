import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api'
import { Icon, Modal } from './Modal'
import type { ModalClose } from './useModalLifecycle'
import type { Beat } from './beat'
import { duration, externalLink, musicalKeyLabel, makerLabel } from './beat'
import { Artwork } from './Artwork'
import './Beatmakers.css'

export type Producer = { id: string; name: string; photo_url: string | null; socials: string[]; stores: string[]; beat_count: number; aliases?: string[]; attribution?: string; photo_origin?: string | null; youtube_channels?: { url: string; label: string }[] }
type ProducerPage = { profiles: Producer[]; total: number; unassigned_count: number; photos_pending?: boolean }
type Profile = Producer & { beats: Beat[] }
export function Avatar({ profile, photo }: { profile: Pick<Producer, 'name' | 'photo_url'>; photo?: string | null }) {
  const src = photo === undefined ? profile.photo_url : photo
  const [broken, setBroken] = useState('')
  return <span className="producer-avatar">{src && broken !== src ? <img src={src} alt="" onError={() => setBroken(src)} /> : <span aria-hidden="true">{profile.name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('') || 'b.'}</span>}</span>
}
function useProducers(query: string, revision: number) {
  const [result, setResult] = useState<ProducerPage | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const limit = 60
  const activeQuery = useRef(query)
  useEffect(() => { activeQuery.current = query }, [query])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => { setLoading(true); void api<ProducerPage>(`/api/beatmakers?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 100)}`, { signal: controller.signal }).then((r) => { if (!controller.signal.aborted) { setResult(r); setError('') } }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Profils indisponibles.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) }) }, 150)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [query, revision, attempt, limit])
  useEffect(() => {
    if (!result?.photos_pending) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const count = Math.max(60, result.profiles.length)
      const pages = Array.from({ length: Math.ceil(count / 100) }, (_, i) => api<ProducerPage>(`/api/beatmakers?q=${encodeURIComponent(query)}&offset=${i * 100}&limit=${Math.min(100, count - i * 100)}`, { signal: controller.signal }))
      void Promise.all(pages).then((values) => { if (!controller.signal.aborted) setResult((r) => r === result ? { ...values[0], profiles: values.flatMap((p) => p.profiles) } : r) }).catch(() => {})
    }, 2500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [result, query])
  async function more() {
    if (!result || loading) return
    setLoading(true)
    try { const next = await api<ProducerPage>(`/api/beatmakers?q=${encodeURIComponent(query)}&offset=${result.profiles.length}&limit=60`); setResult((r) => r === result && activeQuery.current === query ? { ...next, profiles: [...r.profiles, ...next.profiles] } : r) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Profils indisponibles.') }
    finally { setLoading(false) }
  }
  return { result, error, loading, retry: () => { setAttempt((n) => n + 1) }, more }
}
export function BeatmakersPage({ revision, onOpen, onUnassigned }: { revision: number; onOpen: (id: string) => void; onUnassigned: () => void }) {
  const [query, setQuery] = useState('')
  const { result, error, loading, retry, more } = useProducers(query, revision)
  const grid = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(120)
  useEffect(() => { const el = grid.current; if (!el) return; const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.height > 0) setHeight((h) => Math.max(h, entry.contentRect.height)) }); observer.observe(el); return () => observer.disconnect() }, [])
  return <section className="producers-page" aria-labelledby="producers-heading">
    <div className="producers-heading"><h2 id="producers-heading">Beatmakers</h2><button className="primary" onClick={() => onOpen('new')}>＋ Créer un profil</button></div>
    <div className="producers-search"><label><Icon name="search" /><input type="search" aria-label="Rechercher un beatmaker" placeholder="Rechercher un beatmaker…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><span>{result ? `${result.total} profil${result.total > 1 ? 's' : ''}` : '—'}</span></div>
    <div className="producer-status">{error ? <div className="producer-list-error" role="alert">{error}<button onClick={retry}>Réessayer</button></div> : <span role="status">{loading ? 'Recherche…' : ''}</span>}</div>
    <div className="producer-stage" style={{ minHeight: height }}><div ref={grid} className="producer-grid" aria-busy={loading}>{result?.profiles.map((p) => <button className="producer-card" key={p.id} onClick={() => onOpen(p.id)} aria-label={`Profil de ${p.name}`}><Avatar profile={p} /><span className="producer-card-info"><strong title={p.name}>{p.name}</strong><span>{p.beat_count} prod{p.beat_count > 1 ? 's' : ''}</span><small>{p.socials.length || p.stores.length ? 'Profil renseigné' : 'Profil à compléter'}</small></span><span aria-hidden="true">↗</span></button>)}</div>
    {result?.total === 0 && !loading && <div className="empty-state"><h3>{query ? 'Aucun beatmaker ne correspond' : 'Tes beatmakers, au même endroit'}</h3><p>{query ? 'Essaie un autre nom.' : 'Crée un profil, puis associe-le à tes prods.'}</p><button onClick={() => query ? setQuery('') : onOpen('new')}>{query ? 'Effacer la recherche' : 'Créer un profil'}</button></div>}
    {result && result.profiles.length < result.total && <button disabled={loading} onClick={() => { void more() }}>Afficher plus de profils</button>}
    </div><div className="unassigned-producers"><span>Les crédits non associés restent disponibles dans les fiches.</span><button onClick={onUnassigned}>Voir les prods sans profil ↗{result ? ` (${result.unassigned_count})` : ''}</button></div>
  </section>
}
export function ProducerProfile({ identity, revision, onClose, onChanged, onBeat, onViewBeats, onPlay, playingId }: { identity: string; revision: number; onClose: () => void; onChanged: (p?: Producer) => void; onBeat: (b: Beat) => void; onViewBeats: (p: Producer) => void; onPlay: (b: Beat) => void; playingId: string | null }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState({ name: '', socials: [''], stores: [''] })
  const [original, setOriginal] = useState(draft)
  const [photo, setPhoto] = useState<string | null | undefined>()
  const [editing, setEditing] = useState(identity === 'new')
  const isEditing = useRef(editing)
  useLayoutEffect(() => { isEditing.current = editing }, [editing])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(identity !== 'new')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [management, setManagement] = useState<'merge' | 'delete' | null>(null)
  const managementTrigger = useRef<HTMLElement | null>(null)
  function openManagement(mode: 'merge' | 'delete') { managementTrigger.current = document.activeElement as HTMLElement; setManagement(mode) }
  function closeManagement() { setManagement(null); requestAnimationFrame(() => { if (managementTrigger.current?.isConnected) managementTrigger.current.focus({ preventScroll: true }) }) }
  const [photoWaiting, setPhotoWaiting] = useState(false)
  const changed = useRef(onChanged)
  useLayoutEffect(() => { changed.current = onChanged }, [onChanged])
  const [photoMessage, setPhotoMessage] = useState('')
  const [discard, setDiscard] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const close = useRef<ModalClose | null>(null)
  const afterClose = useRef<(() => void) | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  const identityRef = useRef(identity)
  const dirty = editing && (JSON.stringify(draft) !== JSON.stringify(original) || photo !== undefined)
  useEffect(() => {
    if (identityRef.current === 'new') return
    const controller = new AbortController()
    void api<Profile>(`/api/beatmakers/${identityRef.current}`, { signal: controller.signal }).then((p) => { if (!controller.signal.aborted) { setProfile(p); identityRef.current = p.id; const d = { name: p.name, socials: p.socials.length ? p.socials : [''], stores: p.stores.length ? p.stores : [''] }; if (!isEditing.current) { setDraft(d); setOriginal(d) } setError('') } }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Profil indisponible.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt, revision])
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 3000); return () => clearTimeout(timer) }, [saved])
  useEffect(() => {
    if (!photoWaiting) return
    let count = 0
    const controller = new AbortController()
    const timer = setInterval(() => {
      void api<Profile>(`/api/beatmakers/${identityRef.current}`, { signal: controller.signal }).then((p) => {
        if (controller.signal.aborted) return
        if (p.photo_url) { setProfile(p); setPhotoWaiting(false); setPhotoMessage('Portrait YouTube récupéré.'); changed.current(p) }
        else if (++count >= 15) { setPhotoWaiting(false); setPhotoMessage('Portrait indisponible pour le moment. Tu peux réessayer.') }
      }).catch(() => { if (!controller.signal.aborted) { setPhotoWaiting(false); setPhotoMessage('Portrait indisponible. Réessaie plus tard.') } })
    }, 2000)
    return () => { clearInterval(timer); controller.abort() }
  }, [photoWaiting])
  async function youtubePhoto() {
    setError(''); setPhotoMessage('')
    try { await api(`/api/beatmakers/${identityRef.current}/photo-refresh`, { method: 'POST' }); setPhotoWaiting(true); setPhotoMessage('Recherche du portrait YouTube…') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Portrait indisponible.') }
  }
  function cancel() { setDraft(original); setPhoto(undefined); setEditing(false); setDiscard(false); setError(''); action.current?.focus({ preventScroll: true }) }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || loading) return
    setBusy(true); setError('')
    try {
      const body = { name: draft.name, socials: draft.socials.filter((v) => v.trim()), stores: draft.stores.filter((v) => v.trim()), ...(photo !== undefined ? { photo: photo ? photo.split(',')[1] : null } : {}) }
      const p = await api<Producer>(identityRef.current === 'new' ? '/api/beatmakers' : `/api/beatmakers/${identityRef.current}`, { method: identityRef.current === 'new' ? 'POST' : 'PATCH', body: JSON.stringify(body) })
      identityRef.current = p.id
      setProfile((old) => ({ ...p, beats: old?.beats || [] })); setOriginal(draft); setPhoto(undefined); setEditing(false); setSaved(true); onChanged(p)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Profil non enregistré.') }
    finally { setBusy(false); requestAnimationFrame(() => action.current?.focus({ preventScroll: true })) }
  }
  async function choosePhoto(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Photo : choisis un JPEG ou PNG de 2 Mo maximum.'); return }
    try { const value = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) }); setPhoto(value); setError('') }
    catch { setError('Photo illisible. Choisis un autre fichier.') }
  }
  function linkList(kind: 'socials' | 'stores', label: string) {
    return <section className="producer-links"><h3>{label}</h3><div className="producer-link-scroll">{draft[kind].map((url, index) => <div className="producer-link-row" key={index}><input type="url" aria-label={`${label} ${index + 1}`} readOnly={!editing || busy} tabIndex={editing ? 0 : -1} value={url} placeholder={editing ? "https://…" : "—"} onChange={(e) => setDraft((d) => ({ ...d, [kind]: d[kind].map((v, i) => i === index ? e.target.value : v) }))} />{!editing && externalLink(url) && <a href={externalLink(url)!} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${label.toLowerCase()} ${index + 1}`} />}{editing && url && <button type="button" disabled={busy} aria-label={`Retirer ${label.toLowerCase()} ${index + 1}`} onClick={() => setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, i) => i !== index).concat(d[kind].length === 1 ? [''] : []) }))}>×</button>}</div>)}</div><button type="button" disabled={!editing || busy || draft[kind].length >= 10} className="add-producer-link" aria-hidden={!editing} tabIndex={editing ? 0 : -1} onClick={() => setDraft((d) => ({ ...d, [kind]: [...d[kind], ''] }))}>＋ Ajouter {kind === 'socials' ? 'un réseau' : 'un site'}</button></section>
  }
  function leave(action: () => void) { afterClose.current = action; close.current?.(true) }
  return <Modal label={profile ? `Profil de ${profile.name}` : 'Créer un profil beatmaker'} title={<div className="producer-mode"><p className="eyebrow">PROFIL BEATMAKER</p><button type="button" className="producer-cancel" style={{ visibility: editing && profile ? 'visible' : 'hidden' }} disabled={!editing || busy} onClick={cancel}>Annuler</button></div>} closeLabel="Fermer le profil beatmaker" closeRef={close} onClose={() => { onClose(); afterClose.current?.() }} canClose={() => { if (busy) return false; if (dirty) { setDiscard(true); return false } return true }} className={`producer-modal${editing ? ' is-editing' : ''}`} actions={<button ref={action} className={`icon-button${editing ? ' saving-mode' : saved ? ' saved-mode' : ''}`} disabled={busy || loading} aria-label={editing ? 'Enregistrer le profil' : 'Modifier le profil'} aria-busy={busy} onClick={() => { if (editing) form.current?.requestSubmit(); else { setEditing(true); setSaved(false) } }}><Icon name={editing ? 'save' : saved ? 'check' : 'edit'} /></button>}>
    <span className="sr-only" role="status">{saved ? 'Profil enregistré.' : loading ? 'Chargement du profil…' : photoMessage}</span>
    {error && <div className="detail-feedback"><p role="alert">{error}</p><button onClick={() => { setError(''); if (editing) form.current?.requestSubmit(); else setAttempt((n) => n + 1) }}>Réessayer</button></div>}
    {discard && <div className="detail-feedback discard-feedback"><p>Des modifications ne sont pas enregistrées.</p><button onClick={() => setDiscard(false)}>Continuer l’édition</button><button onClick={() => close.current?.(true)}>Abandonner et fermer</button></div>}
    <form ref={form} onSubmit={(e) => { void save(e) }} className="producer-columns">
      <div className="producer-identity"><Avatar profile={{ name: draft.name, photo_url: profile?.photo_url || null }} photo={photo} /><div className="producer-photo-actions"><label aria-disabled={!editing || busy}>Photo de profil<input type="file" accept="image/png,image/jpeg" aria-label="Photo de profil" disabled={!editing || busy} onChange={(e) => { void choosePhoto(e.target.files?.[0]) }} /></label><button type="button" disabled={!editing || busy || (!photo && !profile?.photo_url)} onClick={() => setPhoto(null)}>Retirer la photo</button></div><strong>{profile?.beat_count || 0} prod{(profile?.beat_count || 0) > 1 ? 's' : ''}</strong><span>dans cette bibliothèque</span><div className="producer-channel-slot">{profile?.youtube_channels?.length ? profile.youtube_channels.map((c) => <a key={c.url} href={externalLink(c.url) || undefined} target="_blank" rel="noreferrer" title={c.label}>{profile.youtube_channels!.length === 1 ? 'Chaîne YouTube ↗' : `${c.label} ↗`}</a>) : <span>Chaîne non renseignée</span>}</div><div className="producer-aliases" title={(profile?.aliases || []).join(', ')}>{profile?.aliases?.length ? `Alias : ${profile.aliases.join(', ')}` : profile?.attribution === 'channel' ? 'Proposé depuis la chaîne YouTube' : ''}</div><div className="producer-management-actions"><button type="button" disabled={!profile || editing || busy || photoWaiting || profile.photo_origin === 'manual' && !!profile.photo_url} onClick={() => { void youtubePhoto() }}>{photoWaiting ? 'Recherche…' : 'Photo YouTube'}</button><button type="button" disabled={!profile || editing || busy} onClick={() => openManagement('merge')}>Fusionner</button><button type="button" disabled={!profile || editing || busy} onClick={() => openManagement('delete')}>Supprimer</button></div></div>
      <div className="producer-fields"><input className="producer-name" type="text" aria-label="Nom du profil" required maxLength={200} readOnly={!editing || busy} value={draft.name} placeholder="Nom du beatmaker" title={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /><div className="producer-link-columns">{linkList('socials', 'Réseaux')}{linkList('stores', 'Sites de vente')}</div><section className="producer-beats"><h3>Prods dans ma bibliothèque</h3><div className="producer-beat-scroll">{profile?.beats.map((b) => <div className="producer-beat-card" key={b.id}><button type="button" className="producer-beat-cover" onClick={() => onPlay(b)} aria-label={`${playingId === b.id ? 'Mettre en pause' : 'Écouter'} ${b.title}`}><Artwork beat={b} /><Icon name={playingId === b.id ? 'pause' : 'play'} filled /></button><button className="producer-beat-info" type="button" onClick={() => leave(() => onBeat(b))}><strong title={b.title}>{b.title}</strong><span>{makerLabel(b)}</span><span>{b.bpm ?? '—'} | {musicalKeyLabel(b.musical_key)}</span><small>{duration(b.duration_seconds)} · Détails ↗</small></button></div>)}{!profile?.beat_count && <p>Aucune prod associée.</p>}</div><button type="button" disabled={!profile || editing} onClick={() => { if (profile) leave(() => onViewBeats(profile)) }}>Voir les prods de {profile?.name || 'ce beatmaker'} ↗</button></section></div>
    </form>
    {management && profile && <ProducerManagement profile={profile} mode={management} revision={revision} onClose={closeManagement} onDeleted={() => { setManagement(null); leave(() => onChanged()) }} onMerged={(p) => { identityRef.current = p.id; setProfile({ ...p, beats: [] }); const d = { name: p.name, socials: p.socials.length ? p.socials : [''], stores: p.stores.length ? p.stores : [''] }; setDraft(d); setOriginal(d); setManagement(null); setAttempt((n) => n + 1); onChanged(p) }} />}
  </Modal>
}
export function ProducerPicker({ selected, revision, onSelect, onClose, onCreate }: { selected: { id: string; name: string }[]; revision: number; onSelect: (values: { id: string; name: string }[]) => void; onClose: () => void; onCreate: () => void }) {
  const [query, setQuery] = useState('')
  const [values, setValues] = useState(selected)
  const { result, error, loading, retry, more } = useProducers(query, revision)
  return <Modal label="Associer des beatmakers" title={<p className="eyebrow">ASSOCIER DES BEATMAKERS</p>} closeLabel="Fermer la sélection de beatmakers" onClose={onClose} className="producer-modal producer-picker">
    <input type="search" aria-label="Rechercher un profil" placeholder="Rechercher un profil…" value={query} onChange={(e) => setQuery(e.target.value)} />
    <p className="producer-selection-count" role="status">{values.length} profil{values.length > 1 ? 's' : ''} sélectionné{values.length > 1 ? 's' : ''}</p>
    {error && <div className="detail-feedback" role="alert">{error}<button onClick={retry}>Réessayer</button></div>}
    <div className="producer-options" aria-busy={loading}>{result?.profiles.map((p) => <label key={p.id} className="producer-option"><Avatar profile={p} /><strong>{p.name}</strong><span>{p.beat_count} prod{p.beat_count > 1 ? 's' : ''}</span><input type="checkbox" aria-label={p.name} checked={values.some((v) => v.id === p.id)} onChange={(e) => setValues((old) => e.target.checked ? [...old, { id: p.id, name: p.name }] : old.filter((v) => v.id !== p.id))} /></label>)}{result?.total === 0 && <p>Aucun profil. Crée un profil pour l’associer.</p>}{result && result.profiles.length < result.total && <button disabled={loading} onClick={() => { void more() }}>Afficher plus de profils</button>}</div>
    <button type="button" onClick={onCreate}>＋ Créer un profil</button><div className="producer-picker-actions"><button type="button" onClick={() => setValues([])}>Retirer les associations</button><button className="primary" type="button" onClick={() => onSelect(values)}>Utiliser la sélection</button></div>
  </Modal>
}

type MergePreview = { target_name: string; beat_count: number; aliases: string[]; conflicts: string[] }
function ProducerManagement({ profile, mode, revision, onClose, onDeleted, onMerged }: { profile: Producer; mode: 'merge' | 'delete'; revision: number; onClose: () => void; onDeleted: () => void; onMerged: (p: Producer) => void }) {
  const [query, setQuery] = useState('')
  const { result, error: listError, loading, more } = useProducers(query, revision)
  const [target, setTarget] = useState('')
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = useRef<ModalClose | null>(null)
  const completion = useRef<(() => void) | null>(null)
  async function submit() {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (mode === 'delete') {
        await api(`/api/beatmakers/${profile.id}`, { method: 'DELETE' })
        completion.current = onDeleted; close.current?.(true)
      } else if (!preview) {
        setPreview(await api<MergePreview>(`/api/beatmakers/${profile.id}/merge-preview`, { method: 'POST', body: JSON.stringify({ target_id: target }) }))
      } else {
        const r = await api<{ profile: Producer }>(`/api/beatmakers/${profile.id}/merge`, { method: 'POST', body: JSON.stringify({ target_id: target }) })
        completion.current = () => onMerged(r.profile); close.current?.(true)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Opération impossible.') }
    finally { setBusy(false) }
  }
  return <Modal label={mode === 'delete' ? `Supprimer ${profile.name}` : `Fusionner ${profile.name}`} title={<p className="eyebrow">{mode === 'delete' ? 'SUPPRIMER LE PROFIL' : 'FUSIONNER LES PROFILS'}</p>} closeLabel="Fermer la gestion du profil" closeRef={close} canClose={() => !busy} onClose={() => { onClose(); completion.current?.() }} className="producer-manage-modal">
    <h2 title={profile.name}>{profile.name}</h2>
    <div className="producer-manage-body">
      {mode === 'delete' ? <><p>Supprimer ce profil détachera ses {profile.beat_count} prod{profile.beat_count > 1 ? 's' : ''}.</p><p>Les prods, les MP3 et les autres collaborateurs seront conservés. Ce profil ne sera plus recréé automatiquement.</p><p>Pour retirer un doublon en gardant ses associations, utilise plutôt Fusionner.</p></> : <>
        <label className="producer-target-search">Profil à conserver<input type="search" aria-label="Chercher le profil à conserver" value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy} /></label>
        <div className="producer-merge-options" aria-busy={loading}>{result?.profiles.filter((p) => p.id !== profile.id).map((p) => <label key={p.id}><input type="radio" aria-label={p.name} name="merge-target" checked={target === p.id} disabled={busy} onChange={() => { setTarget(p.id); setPreview(null); setError('') }} /><Avatar profile={p} /><span>{p.name}<small>{p.beat_count} prods</small></span></label>)}{result && result.profiles.length < result.total && <button disabled={loading || busy} onClick={() => { void more() }}>Afficher plus de profils</button>}</div>
        <div className="producer-merge-preview" aria-live="polite">{preview ? <><strong>{preview.beat_count} prod{preview.beat_count > 1 ? 's réunies' : ' réunie'} sur {preview.target_name}</strong>{preview.conflicts.map((v) => <p key={v}>{v}</p>)}<p>Réseaux et sites réunis. Les autres collaborateurs et les fichiers seront conservés.</p></> : <p>Choisis un profil puis vérifie l’aperçu avant de confirmer.</p>}</div>
      </>}
    </div>
    <div className="producer-manage-status" role="alert">{error || listError}</div>
    <div className="producer-manage-footer"><button disabled={busy} onClick={() => close.current?.()}>Annuler</button><button className="primary" disabled={busy || mode === 'merge' && !target} aria-busy={busy} onClick={() => { void submit() }}>{mode === 'delete' ? 'Confirmer la suppression' : preview ? 'Confirmer la fusion' : 'Vérifier la fusion'}</button></div>
  </Modal>
}
