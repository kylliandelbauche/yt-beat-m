import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api } from './api'
import { BeatGallery } from './BeatGallery'

type Library = { id: string; name: string; root: string; beat_count: number; schema_version: number }
type LibraryStatus = { library: Library | null; error: string | null }

export function LibraryPanel({ diagnostic }: { diagnostic: ReactNode }) {
  const [status, setStatus] = useState<LibraryStatus | null>(null)
  const [path, setPath] = useState('')
  const [name, setName] = useState('Mes prods')
  const [mode, setMode] = useState<'open' | 'create'>('open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const handleIndexed = useCallback((count: number) => {
    setStatus((current) => current?.library ? { ...current, library: { ...current.library, beat_count: count } } : current)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    api<LibraryStatus>('/api/library', { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setStatus(value) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Le catalogue est indisponible.')
      })
    return () => controller.abort()
  }, [])

  async function select(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const selected = await api<LibraryStatus>('/api/library', {
        method: 'POST', body: JSON.stringify({ path, create: mode === 'create', name }),
      })
      setStatus(selected)
      setPath('')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’ouvrir ce dossier.')
    } finally { setBusy(false) }
  }

  async function close() {
    setBusy(true)
    setError('')
    try { setStatus(await api<LibraryStatus>('/api/library/close', { method: 'POST' })) }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Impossible de fermer la bibliothèque.') }
    finally { setBusy(false) }
  }

  const library = status?.library
  const form = <form className="library-form" onSubmit={(event) => { void select(event) }}>
    <div className="mode-selector" aria-label="Action sur la bibliothèque">
      <button type="button" aria-pressed={mode === 'open'} onClick={() => setMode('open')} disabled={busy}>Ouvrir un dossier</button>
      <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')} disabled={busy}>Créer une bibliothèque</button>
    </div>
    <label>Dossier de bibliothèque
      <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Colle le chemin complet du dossier" required disabled={busy} autoComplete="off" spellCheck={false} />
    </label>
    {mode === 'create' && <label>Nom de la bibliothèque
      <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} disabled={busy} />
    </label>}
    <p className="form-hint">{mode === 'create' ? 'Choisis un nouveau dossier ou un dossier vide. Il contiendra tes MP3, pochettes et annotations.' : 'Choisis le dossier contenant library.json. Il peut se trouver sur ton disque externe.'}</p>
    <button type="submit" className="primary" disabled={busy}>{busy ? 'Un instant…' : mode === 'create' ? 'Créer la bibliothèque' : 'Ouvrir la bibliothèque'}</button>
  </form>

  const heading = <>
    <div className="section-heading">
      <div><h2 id="library-heading">{library?.name || 'Bibliothèque locale'}</h2></div>
      <span className="phase">{library ? `${library.beat_count} prod${library.beat_count > 1 ? 's' : ''}` : 'Dossier portable'}</span>
    </div>
  </>
  const tools = <>
    <details className="library-switch"><summary>Bibliothèque</summary><p className="library-path">{library?.root}</p>{form}<button className="close-library" disabled={busy} onClick={() => { void close() }}>Fermer la bibliothèque</button></details>
    {diagnostic}
  </>

  return <section className="library-placeholder" aria-labelledby="library-heading">
    {!library && heading}
    {(error || status?.error) && <p className="library-error" role="alert">{error || status?.error}</p>}
    {!status && !error && <p className="form-hint" role="status">Ouverture du catalogue…</p>}
    {library ? <>
      <BeatGallery key={library.id} onIndexed={handleIndexed} heading={heading} tools={tools} libraryName={library.name} />
    </> : <>{form}{diagnostic}</>}
  </section>
}
