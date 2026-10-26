import { useEffect, useState } from 'react'

import { bpmError } from './filterState'
import { Icon } from './Modal'
import type { Filters, FilterOptions } from './filterState'
function normalized(v: string) { return v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() }
function FilterSummary({ label, count }: { label: string; count: number }) {
  return <summary data-active={count > 0}><span>{label}</span><span className="filter-indicator" aria-hidden="true"><Icon name="chevron" /><span className="filter-count">{count > 9 ? '9+' : count}</span></span>{count > 0 && <span className="sr-only">, {count} filtre{count > 1 ? 's' : ''} actif{count > 1 ? 's' : ''}</span>}</summary>
}
function Choices({ label, choices, selected, missing, onValues, onMissing, children }: { label: string; choices: string[]; selected: string[]; missing: boolean; onValues: (values: string[]) => void; onMissing: (value: boolean) => void; children?: React.ReactNode }) {
  const [search, setSearch] = useState('')
  const options = [...new Set([...choices, ...selected])].filter((v) => normalized(v).includes(normalized(search)))
  return <details className="filter-menu" name="catalog-filter"><FilterSummary label={label} count={selected.length + Number(missing)} /><div className="filter-popover">
    {children}
    <label className="filter-option"><input type="checkbox" checked={missing} onChange={(e) => onMissing(e.target.checked)} />Non renseigné</label>
    <label className="filter-search">Chercher dans {label.toLowerCase()}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="filter-choices">{options.map((value) => <label className="filter-option" key={value}><input type="checkbox" checked={selected.includes(value)} onChange={(e) => onValues(e.target.checked ? [...selected, value] : selected.filter((v) => v !== value))} />{value}</label>)}{!options.length && <p className="form-hint">Aucune valeur disponible.</p>}</div>
  </div></details>
}
export function CatalogFilters({ value, options, onChange }: { value: Filters; options: FilterOptions; onChange: (next: Filters) => void }) {
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key !== 'Escape' : event.target instanceof Element && event.target.closest('.filter-menu')) return
      document.querySelectorAll<HTMLDetailsElement>('.filter-menu[open]').forEach((menu) => { menu.open = false })
    }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [])
  const [error, setError] = useState('')
  const [note, setNote] = useState('C')
  const [mode, setMode] = useState('minor')
  const categories = [['keys', 'key_missing', 'Tonalité'], ['makers', 'maker_missing', 'Beatmaker'], ['channels', 'channel_missing', 'Chaîne YouTube'], ['styles', 'style_missing', 'Style'], ['moods', 'mood_missing', 'Ambiance']] as const
  return <>
    <details className="filter-menu" name="catalog-filter"><FilterSummary label="BPM" count={Number(Boolean(value.bpm_min || value.bpm_max)) + Number(value.bpm_missing)} /><div className="filter-popover">
      <form key={`${value.bpm_min}/${value.bpm_max}`} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); const min = String(data.get("min") || ""); const max = String(data.get("max") || ""); const problem = bpmError(min, max); setError(problem); if (!problem) onChange({ ...value, bpm_min: min, bpm_max: max }) }}>
        <p className="form-hint">Bornes incluses. Pour une valeur exacte, utilise deux bornes identiques.</p>
        <div className="edit-columns"><label>BPM minimum<input type="number" step="any" name="min" defaultValue={value.bpm_min} /></label><label>BPM maximum<input type="number" step="any" name="max" defaultValue={value.bpm_max} /></label></div>
        {error && <p className="library-error" role="alert">{error}</p>}<button type="submit">Appliquer les BPM</button>
      </form>
      <label className="filter-option"><input type="checkbox" checked={value.bpm_missing} onChange={(e) => onChange({ ...value, bpm_missing: e.target.checked })} />Non renseigné</label>
    </div></details>
    {categories.map(([key, missing, label]) => <Choices key={key} label={label} choices={options[key]} selected={value[key]} missing={value[missing]} onValues={(next) => onChange({ ...value, [key]: next })} onMissing={(next) => onChange({ ...value, [missing]: next })}>
      {key === 'keys' && <form className="key-composer" onSubmit={(e) => { e.preventDefault(); const key = `${note} ${mode}`; if (!value.keys.includes(key)) onChange({ ...value, keys: [...value.keys, key] }) }}>
        <label>Note<select value={note} onChange={(e) => setNote(e.target.value)}>{['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Mode<select value={mode} onChange={(e) => setMode(e.target.value)}><option value="minor">Mineur</option><option value="major">Majeur</option></select></label><button type="submit">Ajouter cette tonalité</button>
      </form>}
    </Choices>)}
  </>
}
export function ActiveFilters({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  const labels: Record<string, string> = { keys: 'Tonalité', makers: 'Beatmaker', channels: 'Chaîne', styles: 'Style', moods: 'Ambiance', bpm_missing: 'BPM', key_missing: 'Tonalité', maker_missing: 'Beatmaker', channel_missing: 'Chaîne', style_missing: 'Style', mood_missing: 'Ambiance' }
  return <div className="active-filters" aria-label="Filtres actifs">
    {(filters.bpm_min || filters.bpm_max) && <button onClick={() => onChange({ ...filters, bpm_min: '', bpm_max: '' })}>BPM : {filters.bpm_min || '…'} – {filters.bpm_max || '…'} ×</button>}
    {Object.entries(filters).flatMap(([key, value]) => Array.isArray(value) ? value.map((v) => <button key={key + v} onClick={() => onChange({ ...filters, [key]: value.filter((s) => s !== v) })}>{labels[key]} : {v} ×</button>) : typeof value === 'boolean' && value ? [<button key={key} onClick={() => onChange({ ...filters, [key]: false })}>{labels[key]} : non renseigné ×</button>] : [])}
  </div>
}
