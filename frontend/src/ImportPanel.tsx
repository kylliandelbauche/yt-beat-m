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

export function ImportPanel({ onImported, onShowBeat, connected }: { onImported: () => Promise<void>; onShowBeat: (id: string, onShown: () => void) => void; connected: boolean }) {
  const [url, setUrl] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [trackingError, setTrackingError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const completed = useRef(new Set<string>())
  const initialized = useRef(false)
  const watched = useRef(new Set<string>())
  const [focusedJob, setFocusedJob] = useState<string | null>(null)
  const [shownJobs, setShownJobs] = useState(new Set<string>())
  function acknowledge(id: string) { setShownJobs((current) => new Set(current).add(id)) }

  useEffect(() => {
    if (!connected) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await api<{ jobs: Job[] }>('/api/imports', { signal: controller.signal })
        if (controller.signal.aborted) return
        setJobs(result.jobs)
        setTrackingError('')
        if (!initialized.current) {
          const resumable = result.jobs.find((job) => ['running', 'queued'].includes(job.state)) || result.jobs.find((job) => ['failed', 'interrupted'].includes(job.state))
          if (resumable?.source_url) setUrl((current) => current || resumable.source_url)
        }
        for (const job of result.jobs) {
          if (['queued', 'running'].includes(job.state)) watched.current.add(job.id)
          if (job.state === 'completed' && !completed.current.has(job.id)) {
            if ((initialized.current || watched.current.has(job.id)) && job.beat_id) {
              await onImported()
              if (controller.signal.aborted) return
              setFocusedJob(job.id)
              onShowBeat(job.beat_id, () => acknowledge(job.id))
            }
            completed.current.add(job.id)
          }
        }
        initialized.current = true
        timer = setTimeout(() => { void poll() }, result.jobs.some((job) => ['queued', 'running'].includes(job.state)) ? 250 : 4000)
      } catch (cause: unknown) {
        if (!controller.signal.aborted) {
          setTrackingError(cause instanceof Error ? cause.message : 'Suivi des imports indisponible.')
          timer = setTimeout(() => { void poll() }, 4000)
        }
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [onImported, onShowBeat, refresh, connected])

  async function enqueue(value: string) {
    setBusy(true)
    setError('')
    try {
      const result = await api<Queued>('/api/imports', { method: 'POST', body: JSON.stringify({ url: value }) })
      if (result.job) {
        watched.current.add(result.job.id)
        completed.current.delete(result.job.id)
        setFocusedJob(result.job.id)
        setShownJobs((current) => { const next = new Set(current); next.delete(result.job!.id); return next })
        setJobs((current) => [result.job!, ...current.filter((job) => job.id !== result.job!.id)])
      }
      const readyId = result.beat_id || (result.job?.state === 'completed' ? result.job.beat_id : null)
      if (readyId) {
        await onImported()
        if (result.job) completed.current.add(result.job.id)
        onShowBeat(readyId, () => { if (result.job) acknowledge(result.job.id) })
      } else setRefresh((current) => current + 1)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Impossible de lancer cet import.')
    } finally { setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connected) return
    if (trackingError && !error) { setTrackingError(''); setRefresh((value) => value + 1); return }
    const value = url.trim() || (currentJob && ['failed', 'interrupted'].includes(currentJob.state) ? currentJob.source_url : '')
    try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error() }
    catch { setError('Colle un lien YouTube valide.'); return }
    setUrl(value)
    void enqueue(value)
  }

  const currentJob = jobs.find((job) => job.state === 'running') || jobs.find((job) => job.state === 'queued') || jobs.find((job) => job.id === focusedJob) || jobs.find((job) => ['failed', 'interrupted'].includes(job.state))
  const active = currentJob && ['queued', 'running'].includes(currentJob.state)
  const failed = currentJob && ['failed', 'interrupted'].includes(currentJob.state)
  const problem = error || trackingError || (failed ? currentJob.error_message || 'Import interrompu. Tu peux le relancer.' : '')
  return <section className="import-panel" aria-label="Importer une prod">
    <form className="import-form" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="youtube-url">Lien YouTube de la prod</label>
      <input id="youtube-url" type="url" placeholder="https://youtu.be/…" value={url} onChange={(event) => { setUrl(event.target.value); setError('') }} required aria-invalid={!!error} aria-describedby="import-feedback" disabled={busy || !connected} />
      <button className="import-submit" type="submit" disabled={busy || (!!active && !problem) || !connected}>{busy ? 'Ajout…' : problem ? 'Réessayer' : active ? currentJob.stage === 'converting' ? 'Conversion…' : currentJob.stage === 'extracting' ? 'Lecture…' : currentJob.stage === 'verifying' ? 'Vérification…' : 'Import en cours' : 'Importer la prod'}</button>
    </form>
    <div className="import-progress-list">
    {problem ? <div id="import-feedback" className="import-error-slot" role="alert" tabIndex={0}>{problem}</div> : currentJob && !shownJobs.has(currentJob.id) ? (() => {
      const job = currentJob
      const ready = job.state === 'completed'
      const measured = job.stage === 'downloading' && job.progress !== null && Number.isFinite(job.progress) && job.progress >= 0 && job.progress < 100 ? Math.floor(job.progress) : undefined
      const progress = ready ? 100 : measured
      return <div className="import-job" key={job.id}>
        <div className="import-progress"><div className={`import-progress-track${progress === undefined ? ' indeterminate' : ''}`} role="progressbar" aria-label="Progression de l’import" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className="import-progress-fill" style={progress === undefined ? undefined : { width: `${progress}%` }} /></div><span role="status"><span className="sr-only">{stages[job.stage || job.state] || 'Import en cours'}{progress !== undefined ? ' · ' : ''}</span>{progress !== undefined ? `${progress} %` : '—'}</span></div>
      </div>
    })() : null}
    {!problem && <span className="sr-only" id="import-feedback" />}
    </div>
  </section>
}
