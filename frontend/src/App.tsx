import { useEffect, useState } from 'react'
import './App.css'
import { LibraryPanel } from './LibraryPanel'
import './PaperV1.css'
import './Official.css'
import { Modal } from './Modal'

type Dependency = { name: string; version: string | null; available: boolean; hint: string }
type Diagnostic = { ready: boolean; dependencies: Dependency[] }

function App() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showDiagnostic, setShowDiagnostic] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/diagnostics', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Le moteur local ne répond pas correctement.')
        return response.json() as Promise<Diagnostic>
      })
      .then(setDiagnostic)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Connexion au moteur impossible.')
        }
      })
    return () => controller.abort()
  }, [attempt])

  const diagnosticPanel = <>
    <button onClick={() => setShowDiagnostic(true)}>Diagnostic</button>
    {showDiagnostic && <Modal label="Diagnostic" title={<h2>Diagnostic</h2>} closeLabel="Fermer la fenêtre Diagnostic" onClose={() => setShowDiagnostic(false)} className="diagnostic-modal">
      <section className="modal-content diagnostic" aria-label="État du moteur local">
        <h3>{diagnostic?.ready ? 'Prêt à importer' : 'État du moteur'}</h3>
        <p role="status">{error || (diagnostic ? diagnostic.ready ? 'Les dépendances nécessaires à l’import sont disponibles.' : 'Une dépendance doit être configurée avant les imports.' : 'Vérification des dépendances locales…')}</p>
        {diagnostic && <ul className="dependency-list">{diagnostic.dependencies.map((item) => <li key={item.name}><span>{item.name}</span><span className={item.available ? 'dependency-ok' : 'dependency-missing'}>{item.available ? item.version : item.hint}</span></li>)}</ul>}
        <button onClick={() => { setError(''); setDiagnostic(null); setAttempt((value) => value + 1) }}>Vérifier à nouveau</button>
      </section>
    </Modal>}
  </>

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/" aria-label="YT Beat M, accueil">
          <span className="brand-mark">b.</span> beat m
        </a>
        <span className="status"><span className={error ? 'dot error-dot' : 'dot'} />
          {error ? 'Moteur indisponible' : diagnostic ? 'Moteur connecté' : 'Connexion…'}
        </span>
      </header>
      <LibraryPanel diagnostic={diagnosticPanel} />

    </main>
  )
}

export default App
