import { useEffect, useState } from 'react'
import './App.css'
import { LibraryPanel } from './LibraryPanel'
import './PaperV1.css'
import './Official.css'
import './Refinements.css'
import './Typography.css'
import './BeatDetails.css'
import './CoverCards.css'
import './Fluid.css'
import './Dashboard.css'
import { Icon, Modal } from './Modal'
import { useEngineConnection } from './useEngineConnection'

type Dependency = { name: string; version: string | null; available: boolean; hint: string }
type Diagnostic = { ready: boolean; dependencies: Dependency[] }

function App() {
  const [view, setView] = useState<'prods' | 'beatmakers'>('prods')
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const engine = useEngineConnection()
  const connected = engine.state !== 'offline'

  useEffect(() => {
    if (!connected) return
    const controller = new AbortController()
    fetch('/api/diagnostics', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Le moteur local ne répond pas correctement.')
        return response.json() as Promise<Diagnostic>
      })
      .then((value) => { setError(''); setDiagnostic(value) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Connexion au moteur impossible.')
        }
      })
    return () => controller.abort()
  }, [attempt, connected])

  const diagnosticPanel = <>
    <button onClick={() => setShowDiagnostic(true)}><Icon name="diagnostic" />Diagnostic</button>
    {showDiagnostic && <Modal label="Diagnostic" title={<h2>Diagnostic</h2>} closeLabel="Fermer la fenêtre Diagnostic" onClose={() => setShowDiagnostic(false)} className="diagnostic-modal">
      <section className="modal-content diagnostic" aria-label="État du moteur local">
        <h3>{!connected ? 'Moteur déconnecté' : diagnostic?.ready ? 'Prêt à importer' : 'État du moteur'}</h3>
        <p role="status">{!connected ? 'Le moteur local ne répond pas. Cette connexion est indépendante de l’accès à Internet.' : error || (diagnostic ? diagnostic.ready ? 'Les dépendances nécessaires à l’import sont disponibles.' : 'Une dépendance doit être configurée avant les imports.' : 'Vérification des dépendances locales…')}</p>
        {diagnostic && <ul className="dependency-list">{diagnostic.dependencies.map((item) => <li key={item.name}><span>{item.name}</span><span className={item.available ? 'dependency-ok' : 'dependency-missing'}>{item.available ? item.version : item.hint}</span></li>)}</ul>}
        <button onClick={() => { engine.retry(); setError(''); setDiagnostic(null); setAttempt((value) => value + 1) }}>Vérifier à nouveau</button>
      </section>
    </Modal>}
  </>

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/" aria-label="YT Beat M, accueil" onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setView('prods') } }}>
          <span className="brand-mark">b.</span> beat m
        </a>
        <nav className="primary-nav" aria-label="Navigation principale"><button aria-current={view === 'prods' ? 'page' : undefined} onClick={() => setView('prods')}>Prods</button><button aria-current={view === 'beatmakers' ? 'page' : undefined} onClick={() => setView('beatmakers')}>Beatmakers</button></nav>
        <span className="status" role="status"><span className={!connected ? 'dot warning-dot' : 'dot'} />
          {!connected ? 'Déconnecté' : engine.state === 'online' ? 'Moteur connecté' : 'Connexion…'}
        </span>
      </header>
      <LibraryPanel view={view} onView={setView} diagnostic={diagnosticPanel} connected={connected} onRetry={engine.retry} onDiagnostic={() => setShowDiagnostic(true)} />

    </main>
  )
}

export default App
