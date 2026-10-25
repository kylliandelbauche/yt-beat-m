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
    const detail = Array.isArray(error?.detail) ? error.detail.map((item: { loc?: string[]; msg?: string }) => `${item.loc?.slice(1).join('.') || 'Champ'} : ${item.msg || 'valeur invalide'}`).join(' · ') : error?.detail
    throw new Error(typeof detail === 'string' ? detail : 'Cette opération a échoué. Vérifie le dossier et réessaie.')
  }
  return response.json() as Promise<T>
}
