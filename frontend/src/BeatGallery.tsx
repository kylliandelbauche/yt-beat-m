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

export function BeatGallery({ onIndexed, heading, tools, libraryName, connected, onRetry, onDiagnostic, onLibrary }: { onIndexed: (count: number) => void; heading: (count?: number) => ReactNode; tools: ReactNode; libraryName: string; connected: boolean; onRetry: () => void; onDiagnostic: () => void; onLibrary: () => void }) {
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
  const pendingDetails = useRef<{ identity: string; onShown: () => void }[]>([])
  const showImported = useCallback((identity: string, onShown: () => void) => {
    if (detailsRef.current && detailsRef.current !== identity) {
      const queued = pendingDetails.current.find((item) => item.identity === identity)
      if (queued) { const previous = queued.onShown; queued.onShown = () => { previous(); onShown() } }
      else pendingDetails.current.push({ identity, onShown })
    } else { detailsRef.current = identity; setDetails(identity); onShown() }
  }, [])
  function closeDetails() {
    const next = pendingDetails.current.shift()
    detailsRef.current = next?.identity || null; setDetails(next?.identity || null); next?.onShown()
  }
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [favoriteBusy, setFavoriteBusy] = useState(new Set<string>())
  const audio = useRef<HTMLAudioElement>(null)
  const audioPreferences = useRef({ volume: 1, muted: false })
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [activatedId, setActivatedId] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const stageContent = useRef<HTMLDivElement>(null)
  const [stageHeight, setStageHeight] = useState(416)
  const recoveryFocus = useRef(false)
  useEffect(() => {
    if (connected && recoveryFocus.current) {
      recoveryFocus.current = false
      if (document.activeElement === document.body) document.querySelector<HTMLInputElement>('.catalog-search input')?.focus({ preventScroll: true })
    }
  }, [connected])
  useEffect(() => {
    const content = stageContent.current
    if (!content) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setStageHeight((height) => Math.max(height, entry.contentRect.height))
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
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
    if (!connected) return
    const controller = new AbortController()
    void api<FilterOptions>('/api/catalog/filters', { signal: controller.signal }).then(setOptions).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Filtres indisponibles.')
    })
    return () => controller.abort()
  }, [reload, connected])

  useEffect(() => {
    if (!connected) return
    const controller = new AbortController()
    const timer = setTimeout(() => { void api<BeatPage>(`/api/beats?${catalogQuery}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setPage(result)
        setError('')
        setSelection((current) => current || (result.beats[0] ? { beat: result.beats[0], play: false } : null))
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Catalogue indisponible.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [catalogQuery, reload, connected])

  useEffect(() => {
    const player = audio.current
    if (!player) return
    player.volume = audioPreferences.current.volume
    player.muted = audioPreferences.current.muted
    if (selection?.play) startPlayback(player)
  }, [selection])

  function startPlayback(player: HTMLAudioElement) {
    void player.play().catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (audio.current === player) {
        setPlayingId(null)
        setError(player.error ? 'Fichier audio indisponible ou illisible. Vérifie le disque.' : 'La lecture n’a pas pu démarrer. Utilise le bouton du lecteur.')
      }
    })
  }

  function togglePlayback(beat: Beat) {
    setError('')
    const player = audio.current
    if (selection?.beat.id === beat.id && player) {
      if (!player.paused && !player.ended) player.pause()
      else { if (player.error) player.load(); else if (player.ended) player.currentTime = 0; startPlayback(player) }
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
      const result = await api<Scan & { beatmakers: { updated: number; preserved: number }; musical_keys?: { updated: number } }>('/api/library/refresh', { method: 'POST' })
      await refreshImported()
      setNotice(`${result.added} ajouté(s) · ${result.skipped} déjà présent(s) · ${result.beatmakers.updated} beatmaker(s) actualisé(s) · ${result.beatmakers.preserved} correction(s) conservée(s) · ${result.musical_keys?.updated ?? 0} tonalité(s) complétée(s).${result.errors.length ? ` ${result.errors.length} fichier(s) illisible(s) : ${result.errors.map((item) => item.name).join(', ')}.` : ''}`)
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

  function filtersChanged() { setStageHeight(Math.max(416, stage.current?.getBoundingClientRect().height || 416)); setLoading(true); setError('') }
  function focusSearch() { document.querySelector<HTMLInputElement>('.catalog-search input')?.focus({ preventScroll: true }) }
  function resetFilters() { filtersChanged(); setFavoritesOnly(false); setFilters(emptyFilters); focusSearch() }

  return <div className="beat-collection">
    <ImportPanel onImported={refreshImported} onShowBeat={showImported} connected={connected} />
    {heading(page?.total)}
    <div className="catalog-filters" inert={!connected} aria-disabled={!connected}>
      <label className="catalog-search"><span className="sr-only">Rechercher une prod</span><Icon name="search" /><input type="search" value={query} placeholder="Titre…" onChange={(event) => { filtersChanged(); setQuery(event.target.value) }} /></label>
      <CatalogFilters value={filters} options={options} onChange={(next) => { filtersChanged(); setFilters(next) }} />
      <button className="catalog-favorites" aria-pressed={favoritesOnly} onClick={() => { filtersChanged(); setFavoritesOnly((value) => !value) }} aria-label="Favoris uniquement"><Icon name="heart" filled={favoritesOnly} />Favoris</button>
      <div className="catalog-order"><label className="catalog-sort"><span className="sr-only">Trier les prods</span><select value={sort} onChange={(e) => { filtersChanged(); setSort(e.target.value) }}><option value="added_desc">Ajout · récentes</option><option value="added_asc">Ajout · anciennes</option><option value="published_desc">Publication · récentes</option><option value="published_asc">Publication · anciennes</option></select></label>
      <div className="layout-selector" role="group" aria-label="Disposition de la bibliothèque"><button className="icon-button" aria-label="Grandes pochettes" aria-pressed={layout === 'covers'} onClick={() => setLayout('covers')}><Icon name="grid" /></button><button className="icon-button" aria-label="Cartes horizontales" aria-pressed={layout === 'horizontal'} onClick={() => setLayout('horizontal')}><Icon name="rows" /></button></div></div>
    </div>
    <div className="catalog-feedback">
      <span className="catalog-status" role="status">{connected && loading ? 'Recherche…' : ''}</span>
      {sort.startsWith('published') && <span className="sr-only" role="status">Tri par publication · publications inconnues à la fin</span>}
      <div className="catalog-filter-actions" inert={!connected}>
        <ActiveFilters filters={filters} onChange={(next) => { filtersChanged(); setFilters(next); focusSearch() }} />
        {query && <button className="text-filter-chip" onClick={() => { filtersChanged(); setQuery(''); focusSearch() }}>Recherche : {query} ×</button>}
        {hasFilters && <button onClick={() => { resetFilters(); setQuery('') }}>Effacer les filtres</button>}
      </div>
      {connected && (error || notice) && <div className="catalog-operation-feedback" role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="Masquer le message" onClick={() => { setError(''); setNotice('') }}>×</button></div>}
    </div>
    <div className="catalog-stage" ref={stage} style={{ minHeight: stageHeight }}>
    {!connected && <div onFocusCapture={() => { recoveryFocus.current = true }} onBlurCapture={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) recoveryFocus.current = false }}><EngineOffline retry={onRetry} diagnostic={onDiagnostic} /></div>}
    <div ref={stageContent} hidden={!connected}>
    {loading && !page && <div className="loading-grid" role="status" aria-label="Chargement des prods"><span /><span /><span /></div>}
    {!loading && !page && error && <button onClick={() => { setError(''); setLoading(true); setReload((value) => value + 1) }}>Réessayer</button>}
    {!loading && page?.total === 0 && <div className="empty-state">
      <span className="empty-mark" aria-hidden="true"><Icon name={hasFilters ? 'search' : 'folder'} /></span>
      <h3>{hasFilters ? 'Aucune prod ne correspond' : 'Ta première prod t’attend'}</h3>
      <p>{hasFilters ? 'Essaie un autre titre ou retire un filtre.' : 'Colle un lien YouTube dans le champ au-dessus.'}</p>
      <div className="empty-actions">{hasFilters ? <><button disabled={!query} onClick={() => { filtersChanged(); setQuery(''); focusSearch() }}>Effacer la recherche</button><button disabled={!favoritesOnly && !filterQuery(filters).size} onClick={resetFilters}>Réinitialiser les filtres</button></> : <><button className="primary" onClick={() => document.getElementById('youtube-url')?.focus({ preventScroll: true })}>Importer une prod</button><button onClick={onLibrary}>Ouvrir une bibliothèque</button></>}</div>
    </div>}
    {page && <div aria-busy={loading} className={`beat-grid ${layout === 'horizontal' ? 'horizontal-grid' : 'covers-grid'}`}>{page?.beats.map((beat) => <article className={`beat-card${activatedId === beat.id ? ' selected' : ''}${playingId === beat.id ? ' is-playing' : ''}`} key={beat.id}>
      <button className="beat-favorite" disabled={favoriteBusy.has(beat.id)} aria-pressed={beat.favorite} aria-label={`${beat.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} ${beat.title}`} onClick={() => { void toggleFavorite(beat).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Favori non enregistré.')) }}><Icon name="heart" filled={beat.favorite} /></button>
      {layout === 'horizontal' ? <>
        <button className="horizontal-cover" aria-label={`${playingId === beat.id ? 'Mettre en pause' : 'Écouter'} ${beat.title}`} onClick={() => togglePlayback(beat)}><Artwork beat={beat} /><span className={`cover-play${playingId === beat.id ? ' is-playing' : ''}`} aria-hidden="true"><Icon name={playingId === beat.id ? 'pause' : 'play'} filled /></span></button>
        <button className="horizontal-details" aria-label={`Détails de ${beat.title}`} onClick={() => setDetails(beat.id)}>
          <ScrollingTitle className="horizontal-title" title={beat.title} />
          <span className="horizontal-maker" title={beat.beatmaker || beat.channel || undefined}>{beat.beatmaker || beat.channel || 'Fichier local'}</span>
          <span className="horizontal-music">{beat.bpm ?? '—'} <span aria-hidden="true">|</span> {musicalKeyLabel(beat.musical_key)}</span>
          <span className="horizontal-footer"><span>{duration(beat.duration_seconds)}</span><span>Détails ↗</span></span>
        </button>
      </> : <>
      <button className="beat-select" aria-label={`${playingId === beat.id ? 'Mettre en pause' : 'Écouter'} ${beat.title}`} onClick={() => togglePlayback(beat)}>
        <span className="card-cover"><Artwork beat={beat} /><span className={`cover-play${playingId === beat.id ? ' is-playing' : ''}`} aria-hidden="true"><Icon name={playingId === beat.id ? 'pause' : 'play'} filled /></span></span>
      </button>
      <button className="beat-card-info beat-details-button" aria-label={`Détails de ${beat.title}`} onClick={() => setDetails(beat.id)}>
        <ScrollingTitle title={beat.title} />
        <span className="beat-subtitle"><span className="beat-maker" title={beat.beatmaker || beat.channel || undefined}>{beat.beatmaker || beat.channel || 'Fichier local'}</span><span className="beat-duration">{duration(beat.duration_seconds)}</span></span>
        <span className="beat-card-footer"><span className="beat-music"><span className="beat-bpm">{beat.bpm ?? '—'}</span><span className="music-separator" aria-hidden="true">|</span><span className="beat-musical-key" title={beat.musical_key || undefined}>{musicalKeyLabel(beat.musical_key)}</span></span><span className="details-hint">Détails ↗</span></span>
      </button>
      </>}

    </article>)}</div>}
    {page && page.beats.length < page.total && <button disabled={busy || loading} onClick={() => { void more() }}>Afficher plus de prods</button>}
    </div>
    </div>
    <div className="collection-toolbar">
      <p>● Bibliothèque locale · {libraryName}</p>
      <div className="collection-tools"><button disabled={busy || !connected} aria-busy={busy} onClick={() => { void scan() }}><Icon name="refresh" />Actualiser</button>{tools}</div>
    </div>
    {details && <BeatDetailsPanel key={details} identity={details} playing={playingId === details} onTogglePlayback={togglePlayback} onClose={closeDetails} onFavorite={toggleFavorite} onChanged={() => { setReload((value) => value + 1) }} />}
    {selection && activeBeat && createPortal(<aside className="local-player glass" aria-label="Lecteur audio">
      <button type="button" disabled={!connected} className="player-description player-details" aria-label={`Détails depuis le lecteur : ${activeBeat.title}`} aria-haspopup="dialog" onClick={() => setDetails(activeBeat.id)}><Artwork beat={activeBeat} className="player-artwork" /><div><p>{activeBeat.title}</p><span>{activeBeat.beatmaker || 'Audio local'} · {duration(activeBeat.duration_seconds)}</span></div></button>
      <audio key={selection.beat.id} ref={audio} src={selection.beat.audio_url} controls preload="metadata" aria-label={`Lecteur : ${selection.beat.title}`} onVolumeChange={(event) => { if (audio.current === event.currentTarget) audioPreferences.current = { volume: event.currentTarget.volume, muted: event.currentTarget.muted } }} onPlay={(event) => { if (audio.current === event.currentTarget) { setPlayingId(selection.beat.id); setActivatedId(selection.beat.id) } }} onPause={(event) => { if (audio.current === event.currentTarget) setPlayingId(null) }} onEnded={(event) => { if (audio.current === event.currentTarget) setPlayingId(null) }} onError={(event) => { if (audio.current === event.currentTarget) { setPlayingId(null); setError('Fichier audio indisponible ou illisible. Vérifie le disque.') } }} />
    </aside>, document.body)}
    {!selection && createPortal(<aside className="local-player glass empty-player" aria-label="Lecteur audio"><div className="player-description"><span className="player-note" aria-hidden="true" /><div><p>Aucune prod sélectionnée</p><span>{connected ? 'Prêt pour ta première écoute' : 'Moteur déconnecté'}</span></div></div><audio controls aria-label="Lecteur sans prod sélectionnée" inert /></aside>, document.body)}
  </div>
}

function EngineOffline({ retry, diagnostic }: { retry: () => void; diagnostic: () => void }) {
  return <div className="empty-state engine-offline" role="status">
    <Icon name="diagnostic" />
    <h3>Le moteur local ne répond pas</h3>
    <p>Relance Beat m, puis réessaie. Tes fichiers restent sur ton disque.</p>
    <div className="empty-actions"><button className="primary" onClick={retry}>Réessayer</button><button onClick={diagnostic}>Ouvrir le diagnostic</button></div>
  </div>
}
