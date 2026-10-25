import { useState } from 'react'
import { api } from './api'
import type { BeatDetails } from './beat'

const origins: Record<string, string> = {
  explicit_credit: 'Crédit explicite du titre ou de la description.',
  channel: 'Proposé depuis la chaîne YouTube ; le nom reste corrigeable.',
  channel_alias: 'Nom mémorisé pour cette chaîne.',
  ambiguous_credit: 'Plusieurs crédits différents : à préciser.',
  manual: 'Nom corrigé pour cette prod.',
  legacy: 'Nom déjà présent dans ta bibliothèque.',
}

export function BeatmakerEditor({ beat, onSaved }: { beat: BeatDetails; onSaved: (value: BeatDetails) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(beat.beatmaker || '')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function change(path: string, method: string, message: string, body?: object) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<BeatDetails>(`/api/beats/${beat.id}/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      onSaved(result)
      setName(result.beatmaker || '')
      setRemember(false)
      setNotice(message)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Le nom n’a pas pu être enregistré.')
    } finally { setBusy(false) }
  }

  return <section className="beatmaker-editor" aria-label="Correction du beatmaker">
    <p className="form-hint">{origins[beat.beatmaker_source || ''] || 'Aucun crédit de producteur identifié.'}</p>
    {!editing && <button type="button" onClick={() => setEditing(true)}>Corriger le beatmaker</button>}
    {editing && <form onSubmit={(event) => {
      event.preventDefault()
      void change('beatmaker', 'PATCH', 'Nom enregistré.', { beatmaker: name.trim() || null, remember_channel: remember })
    }}>
      <label>Nom du beatmaker<input autoFocus value={name} maxLength={200} disabled={busy} onChange={(event) => { setName(event.target.value); if (!event.target.value.trim()) setRemember(false) }} /></label>
      <p className="form-hint">Laisser vide pour garder cette prod sans beatmaker.</p>
      {beat.can_remember_channel && <label className="remember-channel"><input type="checkbox" checked={remember} disabled={busy || !name.trim() || beat.beatmaker_source === 'ambiguous_credit'} onChange={(event) => setRemember(event.target.checked)} />Mémoriser pour les prochains imports de cette chaîne</label>}
      {beat.can_remember_channel && <p className="form-hint">Les collaborations et crédits différents restent distincts. Les prods déjà importées se mettent à jour avec « Actualiser les beatmakers ».</p>}
      {beat.can_remember_channel && <p className="form-hint">{beat.channel_id_known ? 'La règle suivra cette chaîne même si elle change de nom.' : 'Identifiant de chaîne indisponible : la règle utilisera son nom affiché.'}</p>}
      <div className="beatmaker-actions"><button type="submit" disabled={busy || (remember && !name.trim())}>{busy ? 'Enregistrement…' : 'Enregistrer le beatmaker'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Fermer l’édition</button></div>
    </form>}
    {beat.channel_alias && <div className="saved-alias"><p className="form-hint">Nom mémorisé pour cette chaîne : {beat.channel_alias.beatmaker}</p>{!beat.channel_alias.uses_channel_id && <p className="form-hint">Cette règle existante suit le nom affiché : elle peut aussi correspondre à une autre chaîne portant ce nom.</p>}<button type="button" disabled={busy} onClick={() => { void change('channel-alias', 'DELETE', 'Règle supprimée. Les corrections par prod sont conservées.') }}>Supprimer la règle de chaîne</button></div>}
    {(beat.beatmaker_source === 'manual' || beat.beatmaker_source === 'legacy') && <button type="button" disabled={busy} onClick={() => { void change('beatmaker', 'DELETE', 'Proposition recalculée.') }}>Revenir à la proposition</button>}
    {error && <p className="library-error" role="alert">{error}</p>}
    {notice && <p className="scan-notice" role="status">{notice}</p>}
  </section>
}
