import { useEffect, useState } from 'react'
import './App.css'
import { LibraryPanel } from './LibraryPanel'

type Dependency = { name: string; version: string | null; available: boolean; hint: string }
type Diagnostic = { ready: boolean; dependencies: Dependency[] }

function App() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

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

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/" aria-label="YT Beat M, accueil">
          <span className="brand-mark">b.</span> beat m
          <span className="brand-caption">YOUR LOCAL CRATE</span>
        </a>
        <span className="status"><span className={error ? 'dot error-dot' : 'dot'} />
          {error ? 'Moteur indisponible' : diagnostic ? 'Moteur connecté' : 'Connexion…'}
        </span>
      </header>
      <section className="intro">
        <p className="eyebrow">MOINS CHERCHER. PLUS CRÉER.</p>
        <h1>Ta prochaine idée<br />commence ici.</h1>
        <p className="intro-copy">Un espace pour tes prods, leurs pochettes et les sons à venir.<br />Ta bibliothèque reste avec toi, sur ton disque.</p>
      </section>
      <LibraryPanel />
      <section className="glass diagnostic" aria-label="État du moteur local">
        <div className="section-heading">
          <div><h2>État du moteur</h2>
            <p role="status">{error || (diagnostic ? diagnostic.ready ? 'Les dépendances nécessaires à l’import sont disponibles.' : 'Une dépendance doit être configurée avant les imports.' : 'Vérification des dépendances locales…')}</p>
          </div>
          <button onClick={() => { setError(''); setDiagnostic(null); setAttempt((value) => value + 1) }}>Actualiser</button>
        </div>
        {diagnostic && <details open={!diagnostic.ready}>
          <summary>Voir le diagnostic</summary>
          <ul className="dependency-list">{diagnostic.dependencies.map((item) => <li key={item.name}>
            <span>{item.name}</span>
            <span className={item.available ? 'dependency-ok' : 'dependency-missing'}>{item.available ? item.version : item.hint}</span>
          </li>)}</ul>
        </details>}
      </section>
      <footer>Stockage local · Mac & Windows <span>MVP en construction</span></footer>
    </main>
  )
}

export default App
