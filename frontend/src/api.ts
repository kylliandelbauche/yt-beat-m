export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.method && options.method !== 'GET') {
    const session = await fetch('/api/session')
    if (!session.ok) throw new Error('Le moteur local est indisponible. Relance-le puis réessaie.')
    const { token } = await session.json() as { token: string }
    headers.set('X-Session-Token', token)
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...options, headers })
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: unknown } | null
    throw new Error(typeof error?.detail === 'string' ? error.detail : 'Cette opération a échoué. Vérifie le dossier et réessaie.')
  }
  return response.json() as Promise<T>
}
