export type Beat = {
  id: string
  title: string
  beatmaker: string | null
  beatmaker_source: 'explicit_credit' | 'channel' | 'channel_alias' | 'ambiguous_credit' | 'manual' | 'legacy' | null
  channel: string | null
  bpm: number | null
  musical_key: string | null
  duration_seconds: number | null
  favorite: boolean
  artwork_url: string | null
  audio_url: string
}

export type BeatDetails = Beat & {
  source_url: string | null
  published_on: string | null
  added_at: string
  description: string | null
  can_remember_channel: boolean
  channel_id_known: boolean
  channel_alias: { beatmaker: string; uses_channel_id: boolean } | null
  metadata_provenance: Record<string, unknown>
  styles: string[]
  moods: string[]
  links: { url: string; label: string | null }[]
}

export function duration(seconds: number | null) {
  if (seconds === null) return '—'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function externalLink(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function musicalKeyLabel(value: string | null | undefined) {
  if (!value) return '—'
  const match = value.match(/^([A-G])([#b]?)\s*(minor|min|m|major|maj)$/i)
  if (!match) return value
  return `${match[1].toUpperCase()}${match[2].toLowerCase()} ${['minor', 'min', 'm'].includes(match[3].toLowerCase()) ? 'minor' : 'major'}`
}
