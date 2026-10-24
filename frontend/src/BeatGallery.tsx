import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './BeatGallery.css'

type Beat = {
  id: string
  title: string
  beatmaker: string | null
  duration_seconds: number | null
  artwork_url: string | null
  audio_url: string
}
type BeatPage = { beats: Beat[]; total: number }
type Selection = { beat: Beat; play: boolean }
type Scan = { added: number; skipped: number; errors: { name: string; message: string }[]; library: { beat_count: number } }

function duration(seconds: number | null) {
  if (seconds === null) return '—'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function Artwork({ beat }: { beat: Beat }) {
  const [failed, setFailed] = useState(false)
  return <div className="beat-artwork">
    {beat.artwork_url && !failed
      ? <img src={beat.artwork_url} alt={`Pochette de ${beat.title}`} loading="lazy" onError={() => setFailed(true)} />
      : <><span className="cover-note" aria-hidden="true">♫</span><span className="cover-label">AUDIO LOCAL</span></>}
  </div>
}

export function BeatGallery({ onIndexed }: { onIndexed: (count: number) => void }) {
  const [page, setPage] = useState<BeatPage | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    api<BeatPage>('/api/beats', { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setPage(result)
        setSelection(result.beats[0] ? { beat: result.beats[0], play: false } : null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Catalogue indisponible.')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (selection?.play) {
      void audio.current?.play().catch(() => setError('La lecture n’a pas pu démarrer. Utilise le bouton du lecteur.'))
    }
  }, [selection])

  async function scan() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<Scan>('/api/library/scan', { method: 'POST' })
      const refreshed = await api<BeatPage>('/api/beats')
      setPage(refreshed)
      setSelection((current) => current || (refreshed.beats[0] ? { beat: refreshed.beats[0], play: false } : null))
      onIndexed(result.library.beat_count)
      setNotice(`${result.added} ajouté(s) · ${result.skipped} déjà présent(s).${result.errors.length ? ` ${result.errors.length} fichier(s) illisible(s) : ${result.errors.map((item) => item.name).join(', ')}.` : ''}`)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Indexage impossible.')
    } finally { setBusy(false) }
  }

  async function more() {
    if (!page) return
    setBusy(true)
    setError('')
    try {
      const next = await api<BeatPage>(`/api/beats?offset=${page.beats.length}`)
      setPage({ beats: [...page.beats, ...next.beats], total: next.total })
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Chargement impossible.')
    } finally { setBusy(false) }
  }

  return <div className="beat-collection">
    <div className="collection-toolbar">
      <p>Les MP3 de ton dossier <strong>audio</strong>, à portée d’écoute.</p>
      <button disabled={busy} onClick={() => { void scan() }}>{busy ? 'Un instant…' : 'Actualiser les fichiers'}</button>
    </div>
    {error && <p className="library-error" role="alert">{error}</p>}
    {notice && <p className="scan-notice" role="status">{notice}</p>}
    {!page && !error && <p role="status" className="form-hint">Chargement des prods…</p>}
    {page?.total === 0 && <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">♫</span>
      <h3>Une place pour tes premières prods.</h3>
      <p>Dépose un MP3 dans le dossier audio, puis clique sur « Actualiser les fichiers ».</p>
    </div>}
    <div className="beat-grid">{page?.beats.map((beat) => <article className={`beat-card${selection?.beat.id === beat.id ? ' selected' : ''}`} key={beat.id}>
      <button className="beat-select" aria-label={`Écouter ${beat.title}`} onClick={() => { setError(''); setSelection({ beat, play: true }) }}>
        <Artwork beat={beat} />
        <span className="beat-card-info"><span className="beat-title">{beat.title}</span><span className="beat-subtitle">{beat.beatmaker || 'Fichier local'}<span>{duration(beat.duration_seconds)}</span></span></span>
        <span className="listen-label">▶ Écouter</span>
      </button>
    </article>)}</div>
    {page && page.beats.length < page.total && <button disabled={busy} onClick={() => { void more() }}>Afficher plus de prods</button>}
    {selection && <aside className="local-player glass" aria-label="Lecteur audio">
      <div className="player-description"><span className="player-note" aria-hidden="true">♫</span><div><p>{selection.beat.title}</p><span>{selection.beat.beatmaker || 'Audio local'} · {duration(selection.beat.duration_seconds)}</span></div></div>
      <audio key={selection.beat.id} ref={audio} src={selection.beat.audio_url} controls preload="metadata" aria-label={`Lecteur : ${selection.beat.title}`} onError={() => setError('Fichier audio indisponible ou illisible. Vérifie le disque.')} />
    </aside>}
  </div>
}
