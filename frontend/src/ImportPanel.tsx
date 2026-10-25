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
  const [refresh, setRefresh] = useState(0)
  const completed = useRef(new Set<string>())
  const initialized = useRef(false)
  const watched = useRef(new Set<string>())
  const [focusedJob, setFocusedJob] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await api<{ jobs: Job[] }>('/api/imports', { signal: controller.signal })
        if (controller.signal.aborted) return
        setJobs(result.jobs)
        for (const job of result.jobs) {
          if (['queued', 'running'].includes(job.state)) watched.current.add(job.id)
          if (job.state === 'completed' && !completed.current.has(job.id)) {
            if ((initialized.current || watched.current.has(job.id)) && job.beat_id) {
              await onImported()
              if (controller.signal.aborted) return
              setFocusedJob(job.id)
              onShowBeat(job.beat_id)
            }
            completed.current.add(job.id)
          }
        }
        initialized.current = true
        timer = setTimeout(() => { void poll() }, result.jobs.some((job) => ['queued', 'running'].includes(job.state)) ? 250 : 4000)
      } catch (cause: unknown) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Suivi des imports indisponible.')
          timer = setTimeout(() => { void poll() }, 4000)
        }
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [onImported, onShowBeat, refresh])

  async function enqueue(value: string) {
    setBusy(true)
    setError('')
    try {
      const result = await api<Queued>('/api/imports', { method: 'POST', body: JSON.stringify({ url: value }) })
      if (result.job) {
        watched.current.add(result.job.id)
        completed.current.delete(result.job.id)
        setFocusedJob(result.job.id)
        setJobs((current) => [result.job!, ...current.filter((job) => job.id !== result.job!.id)])
      }
      const readyId = result.beat_id || (result.job?.state === 'completed' ? result.job.beat_id : null)
      if (readyId) {
        await onImported()
        if (result.job) completed.current.add(result.job.id)
        onShowBeat(readyId)
      } else setRefresh((current) => current + 1)
      setUrl('')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Impossible de lancer cet import.')
    } finally { setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void enqueue(url)
  }

  const currentJob = jobs.find((job) => job.state === 'running') || jobs.find((job) => job.state === 'queued') || jobs.find((job) => job.id === focusedJob) || jobs.find((job) => ['failed', 'interrupted'].includes(job.state))
  const visibleJobs = currentJob ? [currentJob] : []
  return <section className="import-panel" aria-label="Importer une prod">
    <form className="import-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="youtube-url">Lien YouTube de la prod</label>
      <input id="youtube-url" type="url" placeholder="https://youtu.be/…" value={url} onChange={(event) => setUrl(event.target.value)} required disabled={busy} />
      <button className="import-submit" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Importer la prod'}</button>
    </form>
    {error && <p className="library-error" role="alert">{error}</p>}
    <div className="import-progress-list">{visibleJobs.map((job) => {
      const ready = job.state === 'completed'
      const failed = ['failed', 'interrupted'].includes(job.state)
      const measured = job.stage === 'downloading' && job.progress !== null && Number.isFinite(job.progress) && job.progress >= 0 && job.progress < 100 ? Math.floor(job.progress) : undefined
      const progress = ready ? 100 : measured
      return <div className="import-job" key={job.id}>
        <div className="import-progress">{!failed && <div className={`import-progress-track${progress === undefined ? ' indeterminate' : ''}`} role="progressbar" aria-label="Progression de l’import" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className="import-progress-fill" style={progress === undefined ? undefined : { width: `${progress}%` }} /></div>}<span role="status">{(failed ? stages[job.state] : stages[job.stage || job.state]) || 'Import en cours'}{progress !== undefined ? ` · ${progress} %` : ''}</span></div>
        {failed && <p className="job-error" role="alert">{job.error_message || 'Import interrompu. Tu peux le relancer.'}</p>}
        {failed && <button disabled={busy} onClick={() => { void enqueue(job.source_url) }}>Réessayer</button>}
      </div>
    })}</div>
  </section>
}
