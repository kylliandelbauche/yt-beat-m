import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'

type Job = {
  id: string; source_url: string; state: string; stage: string | null
  progress: number | null; error_message: string | null; beat_id: string | null
}
type Queued = { job: Job | null; beat_id: string | null; duplicate: boolean }
const stages: Record<string, string> = {
  queued: 'En attente', extracting: 'Lecture des informations', downloading: 'Téléchargement',
  converting: 'Conversion MP3', verifying: 'Vérification audio', completed: 'Prête à écouter',
  failed: 'Import échoué', interrupted: 'Import interrompu',
}

export function ImportPanel({ onImported, onShowBeat }: { onImported: () => Promise<void>; onShowBeat: (id: string) => void }) {
  const [url, setUrl] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const completed = useRef(new Set<string>())
  const initialized = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await api<{ jobs: Job[] }>('/api/imports', { signal: controller.signal })
        if (controller.signal.aborted) return
        setJobs(result.jobs)
        for (const job of result.jobs) {
          if (job.state === 'completed' && !completed.current.has(job.id)) {
            completed.current.add(job.id)
            if (initialized.current) await onImported()
          }
        }
        initialized.current = true
        timer = setTimeout(() => { void poll() }, result.jobs.some((job) => ['queued', 'running'].includes(job.state)) ? 1000 : 4000)
      } catch (cause: unknown) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Suivi des imports indisponible.')
          timer = setTimeout(() => { void poll() }, 4000)
        }
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [onImported, refresh])

  async function enqueue(value: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<Queued>('/api/imports', { method: 'POST', body: JSON.stringify({ url: value }) })
      initialized.current = true
      if (result.beat_id) {
        await onImported()
        onShowBeat(result.beat_id)
        setNotice('Cette prod est déjà dans ta bibliothèque.')
      } else {
        setNotice(result.duplicate ? 'Cette vidéo est déjà dans la file d’import.' : 'Vidéo ajoutée à la file d’import.')
        setRefresh((current) => current + 1)
      }
      setUrl('')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Impossible de lancer cet import.')
    } finally { setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void enqueue(url)
  }

  return <section className="import-panel" aria-labelledby="import-heading">
    <div><h3 id="import-heading">Une nouvelle prod ?</h3><p>Colle son lien YouTube. Le MP3 et la pochette resteront sur ton disque.</p></div>
    <form className="import-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="youtube-url">Lien YouTube de la prod</label>
      <input id="youtube-url" type="url" placeholder="https://youtu.be/…" value={url} onChange={(event) => setUrl(event.target.value)} required disabled={busy} />
      <button className="import-submit" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Importer la prod'}</button>
    </form>
    {error && <p className="library-error" role="alert">{error}</p>}
    {notice && <p className="scan-notice" role="status">{notice}</p>}
    {jobs.length > 0 && <details className="import-history" open={jobs.some((job) => job.state !== 'completed')}>
      <summary>Imports récents</summary>
      <ul>{jobs.slice(0, 5).map((job) => <li key={job.id}>
        <div className="job-heading"><a href={job.source_url} target="_blank" rel="noreferrer">Vidéo YouTube ↗</a><span role="status">{stages[job.stage || job.state] || 'Import en cours'}{job.stage === 'downloading' && job.progress !== null ? ` · ${Math.floor(job.progress)} %` : ''}</span></div>
        {job.stage === 'downloading' && job.progress !== null && <progress aria-label="Progression du téléchargement" value={job.progress} max={100} />}
        {job.error_message && <p className="job-error">{job.error_message}</p>}
        {['failed', 'interrupted'].includes(job.state) && <button disabled={busy} onClick={() => { void enqueue(job.source_url) }}>Réessayer</button>}
        {job.state === 'completed' && job.beat_id && <button onClick={() => { if (job.beat_id) onShowBeat(job.beat_id) }}>Voir la prod</button>}
      </li>)}</ul>
    </details>}
  </section>
}
