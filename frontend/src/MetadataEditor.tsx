import { useState } from 'react'
import { api } from './api'
import type { BeatDetails } from './beat'

function formValues(beat: BeatDetails) {
  return { bpm: beat.bpm === null ? '' : String(beat.bpm), musical_key: beat.musical_key || '', styles: beat.styles.join(', '), moods: beat.moods.join(', '), links: beat.links }
}

export function MetadataEditor({ beat, onSaved }: { beat: BeatDetails; onSaved: (beat: BeatDetails) => void }) {
  const originals = beat.metadata_provenance?.original_metadata as Record<string, { value: unknown; source: string | null }> | undefined
  const labels: Record<string, string> = { bpm: 'BPM', musical_key: 'Tonalité', styles: 'Styles', moods: 'Ambiances', links: 'Liens d’achat' }
  function originalLabel(value: unknown): string {
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) return 'Non renseigné'
    if (Array.isArray(value)) return value.map((v: unknown) => typeof v === 'object' && v !== null && 'url' in v ? String(v.url) : String(v)).join(', ')
    return String(value)
  }
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(() => formValues(beat))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const original = formValues(beat)
    const patch: Record<string, unknown> = {}
    if (values.bpm !== original.bpm) patch.bpm = values.bpm.trim() ? Number(values.bpm) : null
    if (values.musical_key !== original.musical_key) patch.musical_key = values.musical_key.trim() || null
    for (const field of ['styles', 'moods'] as const) if (values[field] !== original[field]) patch[field] = values[field].split(',').map((s) => s.trim()).filter(Boolean)
    if (JSON.stringify(values.links) !== JSON.stringify(original.links)) patch.links = values.links
    try {
      const updated = await api<BeatDetails>(`/api/beats/${beat.id}/metadata`, { method: 'PATCH', body: JSON.stringify(patch) })
      onSaved(updated); setValues(formValues(updated)); setEditing(false); setNotice('Informations enregistrées.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Informations non enregistrées.') }
    finally { setBusy(false) }
  }
  return <section className="metadata-editor details-section">
    {!editing && <button onClick={() => { setValues(formValues(beat)); setEditing(true); setNotice(''); setError('') }}>Modifier les informations</button>}
    {notice && <p className="form-hint" role="status">{notice}</p>}
    {editing && <form onSubmit={(event) => { void save(event) }}>
      <h3>Informations musicales</h3>
      <p className="form-hint">Tes corrections sont conservées en priorité. Vide un champ pour le laisser non renseigné.</p>
      <div className="edit-columns">
        <label>BPM<input type="number" min="0.01" max="1000" step="any" value={values.bpm} onChange={(e) => setValues({ ...values, bpm: e.target.value })} /></label>
        <label>Tonalité<input value={values.musical_key} placeholder="F mineur, C major…" maxLength={80} onChange={(e) => setValues({ ...values, musical_key: e.target.value })} /></label>
      </div>
      <label>Styles<input value={values.styles} placeholder="R&B, drill…" onChange={(e) => setValues({ ...values, styles: e.target.value })} /></label>
      <label>Ambiances<input value={values.moods} placeholder="Mélancolique, sombre…" onChange={(e) => setValues({ ...values, moods: e.target.value })} /></label>
      <p className="form-hint">Sépare les tags par des virgules (30 maximum par catégorie).</p>
      <fieldset><legend>Liens d’achat</legend>{values.links.map((link, i) => <div className="edit-link" key={i}>
        <label>URL du lien {i + 1}<input type="url" required maxLength={2048} value={link.url} onChange={(e) => setValues({ ...values, links: values.links.map((l, n) => n === i ? { ...l, url: e.target.value } : l) })} /></label>
        <label>Libellé du lien {i + 1}<input maxLength={120} value={link.label || ''} onChange={(e) => setValues({ ...values, links: values.links.map((l, n) => n === i ? { ...l, label: e.target.value || null } : l) })} /></label>
        <button type="button" aria-label={`Retirer le lien ${i + 1}`} onClick={() => setValues({ ...values, links: values.links.filter((_, n) => n !== i) })}>Retirer</button>
      </div>)}<button type="button" disabled={values.links.length >= 20} onClick={() => setValues({ ...values, links: [...values.links, { url: '', label: null }] })}>Ajouter un lien</button></fieldset>
      {error && <p className="library-error" role="alert">{error}</p>}
      <div className="edit-actions"><button disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer les informations'}</button><button disabled={busy} type="button" onClick={() => setEditing(false)}>Annuler</button></div>
    </form>}
    {beat.metadata_provenance && ['bpm', 'musical_key', 'styles', 'moods', 'links'].some((f) => beat.metadata_provenance[f] === 'manual') && <details className="metadata-origins"><summary>Valeurs d’origine avant correction</summary><p className="form-hint">Les corrections manuelles remplacent l’affichage ; la description d’origine reste disponible plus bas.</p><dl>{Object.entries(originals || {}).map(([field, original]) => <div key={field}><dt>{labels[field] || field}</dt><dd>{originalLabel(original.value)}</dd></div>)}</dl></details>}
  </section>
}
