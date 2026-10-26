import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import './BeatGallery.css'
import { ImportPanel } from './ImportPanel'
import { BeatDetailsPanel } from './BeatDetailsPanel'
import { ScrollingTitle } from './ScrollingTitle'
import { duration, musicalKeyLabel } from './beat'
import { Artwork } from './Artwork'
import { Icon } from './Modal'
import type { Beat } from './beat'
import { ActiveFilters, CatalogFilters } from './CatalogFilters'
import { emptyFilters, emptyOptions, filterQuery } from './filterState'
import type { Filters, FilterOptions } from './filterState'
type BeatPage = { beats: Beat[]; total: number }
type Selection = { beat: Beat; play: boolean }
type Scan = { added: number; skipped: number; errors: { name: string; message: string }[]; library: { beat_count: number } }

export function BeatGallery({ onIndexed, heading, tools, libraryName }: { onIndexed: (count: number) => void; heading: ReactNode; tools: ReactNode; libraryName: string }) {
  const [layout, setLayout] = useState<'covers' | 'horizontal'>(() => { try { return localStorage.getItem('beat-m-layout') === 'horizontal' ? 'horizontal' : 'covers' } catch { return 'covers' } })
  useEffect(() => { try { localStorage.setItem('beat-m-layout', layout) } catch { /* The layout remains usable when storage is unavailable. */ } }, [layout])
  const [page, setPage] = useState<BeatPage | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [options, setOptions] = useState<FilterOptions>(emptyOptions)
  const [sort, setSort] = useState('added_desc')
  const [details, setDetails] = useState<string | null>(null)
  const detailsRef = useRef<string | null>(null)
  useEffect(() => { detailsRef.current = details }, [details])
  const pendingDetails = useRef<string[]>([])
  const showImported = useCallback((identity: string) => {
    if (detailsRef.current && detailsRef.current !== identity) {
      if (!pendingDetails.current.includes(identity)) pendingDetails.current.push(identity)
    } else { detailsRef.current = identity; setDetails(identity) }
  }, [])
  function closeDetails() {
    const next = pendingDetails.current.shift() || null
    detailsRef.current = next; setDetails(next)
  }
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [favoriteBusy, setFavoriteBusy] = useState(new Set<string>())
  const audio = useRef<HTMLAudioElement>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const params = filterQuery(filters)
  params.set('q', query); params.set('favorites', String(favoritesOnly)); params.set('sort', sort)
  const catalogQuery = params.toString()
  const activeQuery = useRef(catalogQuery)
  useEffect(() => { activeQuery.current = catalogQuery }, [catalogQuery])
  const hasFilters = Boolean(query || favoritesOnly || filterQuery(filters).size)
  const refreshImported = useCallback(async () => {
    setReload((value) => value + 1)
    const status = await api<{ library: { beat_count: number } | null }>('/api/library')
    if (status.library) onIndexed(status.library.beat_count)
  }, [onIndexed])

  useEffect(() => {
    const controller = new AbortController()
    void api<FilterOptions>('/api/catalog/filters', { signal: controller.signal }).then(setOptions).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Filtres indisponibles.')
    })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => { void api<BeatPage>(`/api/beats?${catalogQuery}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setPage(result)
        setSelection((current) => current || (result.beats[0] ? { beat: result.beats[0], play: false } : null))
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Catalogue indisponible.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [catalogQuery, reload])

  useEffect(() => {
    const player = audio.current
    if (selection?.play && player) startPlayback(player)
  }, [selection])

  function startPlayback(player: HTMLAudioElement) {
    void player.play().catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (audio.current === player) {
        setPlayingId(null)
        setError('La lecture n’a pas pu démarrer. Utilise le bouton du lecteur.')
      }
    })
  }

  function togglePlayback(beat: Beat) {
    setError('')
    const player = audio.current
    if (selection?.beat.id === beat.id && player) {
      if (!player.paused && !player.ended) player.pause()
      else { if (player.ended) player.currentTime = 0; startPlayback(player) }
    } else {
      setPlayingId(null)
      setSelection({ beat, play: true })
    }
  }

  async function scan() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<Scan & { beatmakers: { updated: number; preserved: number } }>('/api/library/refresh', { method: 'POST' })
      await refreshImported()
      setNotice(`${result.added} ajouté(s) · ${result.skipped} déjà présent(s) · ${result.beatmakers.updated} beatmaker(s) actualisé(s) · ${result.beatmakers.preserved} correction(s) conservée(s).${result.errors.length ? ` ${result.errors.length} fichier(s) illisible(s) : ${result.errors.map((item) => item.name).join(', ')}.` : ''}`)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Indexage impossible.')
    } finally { setBusy(false) }
  }

  async function more() {
    if (!page) return
    setBusy(true)
    setError('')
    try {
      const next = await api<BeatPage>(`/api/beats?${catalogQuery}&offset=${page.beats.length}`)
      setPage((current) => current === page && activeQuery.current === catalogQuery ? { beats: [...page.beats, ...next.beats], total: next.total } : current)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Chargement impossible.')
    } finally { setBusy(false) }
  }

  async function toggleFavorite(beat: Beat) {
    setFavoriteBusy((current) => new Set(current).add(beat.id))
    try {
      const result = await api<{ favorite: boolean }>(`/api/beats/${beat.id}/favorite`, { method: 'PATCH', body: JSON.stringify({ favorite: !beat.favorite }) })
      setPage((current) => current ? {
        beats: favoritesOnly && !result.favorite ? current.beats.filter((item) => item.id !== beat.id) : current.beats.map((item) => item.id === beat.id ? { ...item, favorite: result.favorite } : item),
        total: current.total - (favoritesOnly && !result.favorite && current.beats.some((item) => item.id === beat.id) ? 1 : 0),
      } : current)
      return result.favorite
    } finally { setFavoriteBusy((current) => { const next = new Set(current); next.delete(beat.id); return next }) }
  }

  const activeBeat = page?.beats.find((beat) => beat.id === selection?.beat.id) || selection?.beat

  function filtersChanged() { setLoading(true); setError('') }

  return <div className="beat-collection">
    <ImportPanel onImported={refreshImported} onShowBeat={showImported} />
    {heading}
    <div className="catalog-filters">
      <label className="catalog-search"><span className="sr-only">Rechercher une prod</span><Icon name="search" /><input type="search" value={query} placeholder="Titre…" onChange={(event) => { filtersChanged(); setQuery(event.target.value) }} /></label>
      <CatalogFilters value={filters} options={options} onChange={(next) => { filtersChanged(); setFilters(next) }} />
      <button className="catalog-favorites" aria-pressed={favoritesOnly} onClick={() => { filtersChanged(); setFavoritesOnly((value) => !value) }} aria-label="Favoris uniquement"><Icon name="heart" filled={favoritesOnly} />Favoris</button>
      <div className="catalog-order"><label className="catalog-sort"><span className="sr-only">Trier les prods</span><select value={sort} onChange={(e) => { filtersChanged(); setSort(e.target.value) }}><option value="added_desc">Ajout · récentes</option><option value="added_asc">Ajout · anciennes</option><option value="published_desc">Publication · récentes</option><option value="published_asc">Publication · anciennes</option></select></label>
      <div className="layout-selector" role="group" aria-label="Disposition de la bibliothèque"><button className="icon-button" aria-label="Grandes pochettes" aria-pressed={layout === 'covers'} onClick={() => setLayout('covers')}><Icon name="grid" /></button><button className="icon-button" aria-label="Cartes horizontales" aria-pressed={layout === 'horizontal'} onClick={() => setLayout('horizontal')}><Icon name="rows" /></button></div></div>
      {hasFilters && <button onClick={() => { filtersChanged(); setQuery(''); setFavoritesOnly(false); setFilters(emptyFilters) }}>Effacer les filtres</button>}
    </div>
    <ActiveFilters filters={filters} onChange={(next) => { filtersChanged(); setFilters(next) }} />
    {query && <button className="text-filter-chip" onClick={() => { filtersChanged(); setQuery('') }}>Recherche : {query} ×</button>}
    {!loading && page && <p className="catalog-count" role="status">{page.total} prod{page.total > 1 ? 's' : ''}{sort.startsWith('published') ? ' · publications inconnues à la fin' : ''}</p>}
    {error && <p className="library-error" role="alert">{error}</p>}
    {notice && <p className="scan-notice" role="status">{notice}</p>}
    {loading && <div className="loading-grid" role="status" aria-label="Chargement des prods"><span /><span /><span /></div>}
    {!loading && !page && error && <button onClick={() => { setError(''); setLoading(true); setReload((value) => value + 1) }}>Réessayer</button>}
    {!loading && page?.total === 0 && <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">♫</span>
      <h3>{hasFilters ? 'Aucune prod ne correspond à ces filtres.' : 'Une place pour tes premières prods.'}</h3>
      <p>{hasFilters ? 'Essaie une autre recherche ou efface les filtres.' : 'Colle un lien YouTube ou dépose un MP3 dans le dossier audio.'}</p>
    </div>}
    {!loading && <div className={`beat-grid ${layout === 'horizontal' ? 'horizontal-grid' : 'covers-grid'}`}>{page?.beats.map((beat) => <article className={`beat-card${selection?.beat.id === beat.id ? ' selected' : ''}`} key={beat.id}>
      <button className="beat-favorite" disabled={favoriteBusy.has(beat.id)} aria-pressed={beat.favorite} aria-label={`${beat.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} ${beat.title}`} onClick={() => { void toggleFavorite(beat).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Favori non enregistré.')) }}><Icon name="heart" filled={beat.favorite} /></button>
      {layout === 'horizontal' ? <>
        <button className="horizontal-cover" aria-label={`${playingId === beat.id ? 'Mettre en pause' : 'Écouter'} ${beat.title}`} onClick={() => togglePlayback(beat)}><Artwork beat={beat} /><span className={`cover-play${playingId === beat.id ? ' is-playing' : ''}`} aria-hidden="true"><Icon name={playingId === beat.id ? 'pause' : 'play'} filled /></span></button>
        <button className="horizontal-details" aria-label={`Détails de ${beat.title}`} onClick={() => setDetails(beat.id)}>
          <span className="horizontal-title" title={beat.title}>{beat.title}</span>
          <span className="horizontal-maker" title={beat.beatmaker || beat.channel || undefined}>{beat.beatmaker || beat.channel || 'Fichier local'}</span>
          <span className="horizontal-music">{beat.bpm ?? '—'} <span aria-hidden="true">|</span> {musicalKeyLabel(beat.musical_key)}</span>
          <span className="horizontal-footer"><span>{duration(beat.duration_seconds)}</span><span>Détails ↗</span></span>
        </button>
      </> : <>
      <button className="beat-select" aria-label={`${playingId === beat.id ? 'Mettre en pause' : 'Écouter'} ${beat.title}`} onClick={() => togglePlayback(beat)}>
        <span className="card-cover"><Artwork beat={beat} /><span className={`cover-play${playingId === beat.id ? ' is-playing' : ''}`} aria-hidden="true"><Icon name={playingId === beat.id ? 'pause' : 'play'} filled /></span></span>
        <span className="beat-card-info"><ScrollingTitle title={beat.title} /><span className="beat-subtitle"><span className="beat-maker" title={beat.beatmaker || beat.channel || undefined}>{beat.beatmaker || (beat.channel || 'Fichier local')}</span><span className="beat-duration">{duration(beat.duration_seconds)}</span></span></span>
        <span className="listen-label"><Icon name={playingId === beat.id ? 'pause' : 'play'} filled />{playingId === beat.id ? 'Pause' : 'Écouter'}</span>
      </button>
      <button className="beat-details-button" aria-label={`Détails de ${beat.title}`} onClick={() => setDetails(beat.id)}>Détails ↗</button>
      </>}

    </article>)}</div>}
    {!loading && page && page.beats.length < page.total && <button disabled={busy} onClick={() => { void more() }}>Afficher plus de prods</button>}
    <div className="collection-toolbar">
      <p>● Bibliothèque locale · {libraryName}</p>
      <div className="collection-tools"><button disabled={busy} onClick={() => { void scan() }}><Icon name="refresh" />{busy ? 'Actualisation…' : 'Actualiser'}</button>{tools}</div>
    </div>
    {details && <BeatDetailsPanel key={details} identity={details} playing={playingId === details} onTogglePlayback={togglePlayback} onClose={closeDetails} onFavorite={toggleFavorite} onChanged={() => { setReload((value) => value + 1) }} />}
    {selection && activeBeat && createPortal(<aside className="local-player glass" aria-label="Lecteur audio">
      <button type="button" className="player-description player-details" aria-label={`Détails depuis le lecteur : ${activeBeat.title}`} aria-haspopup="dialog" onClick={() => setDetails(activeBeat.id)}><Artwork beat={activeBeat} className="player-artwork" /><div><p>{activeBeat.title}</p><span>{activeBeat.beatmaker || 'Audio local'} · {duration(activeBeat.duration_seconds)}</span></div></button>
      <audio key={selection.beat.id} ref={audio} src={selection.beat.audio_url} controls preload="metadata" aria-label={`Lecteur : ${selection.beat.title}`} onPlay={(event) => { if (audio.current === event.currentTarget) setPlayingId(selection.beat.id) }} onPause={(event) => { if (audio.current === event.currentTarget) setPlayingId(null) }} onEnded={(event) => { if (audio.current === event.currentTarget) setPlayingId(null) }} onError={(event) => { if (audio.current === event.currentTarget) { setPlayingId(null); setError('Fichier audio indisponible ou illisible. Vérifie le disque.') } }} />
    </aside>, document.body)}
  </div>
}
