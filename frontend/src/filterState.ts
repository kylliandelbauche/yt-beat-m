export type Filters = { bpm_min: string; bpm_max: string; bpm_missing: boolean; keys: string[]; makers: string[]; channels: string[]; styles: string[]; moods: string[]; key_missing: boolean; maker_missing: boolean; channel_missing: boolean; style_missing: boolean; mood_missing: boolean }
export const emptyFilters: Filters = { bpm_min: '', bpm_max: '', bpm_missing: false, keys: [], makers: [], channels: [], styles: [], moods: [], key_missing: false, maker_missing: false, channel_missing: false, style_missing: false, mood_missing: false }
export type FilterOptions = { keys: string[]; makers: string[]; channels: string[]; styles: string[]; moods: string[] }
export const emptyOptions: FilterOptions = { keys: [], makers: [], channels: [], styles: [], moods: [] }
export function filterQuery(filters: Filters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else if (value) params.set(key, String(value))
  }
  return params
}
export function bpmError(min: string, max: string) {
  if ([min, max].some((v) => v !== '' && (!Number.isFinite(Number(v)) || Number(v) <= 0 || Number(v) > 1000))) return 'BPM : indique des bornes entre 0 exclu et 1000.'
  return min && max && Number(min) > Number(max) ? 'BPM : le minimum doit être inférieur ou égal au maximum.' : ''
}
