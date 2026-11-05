import type { Beat } from "./beat";

export const songStates = [
  "Topline",
  "Maquette",
  "Mixage",
  "Master",
  "Out",
] as const;
export type SongState = (typeof songStates)[number];
export type CatalogTag = { id: number; label: string };
export type TagChoice = { id: number | null; label: string };
export type SongTag = CatalogTag & { direct: boolean; inherited: boolean };
export type Song = {
  id: string;
  title: string;
  state: SongState;
  favorite: boolean;
  created_on: string | null;
  released_on: string | null;
  added_at: string;
  beat_id: string | null;
  beat_title: string | null;
  artwork_url: string | null;
  duration_seconds: number;
  revision: number;
  file_available: boolean;
  audio_url: string;
  tags: SongTag[];
  notes?: string;
  lyrics?: string;
};
export type SongPage = { songs: Song[]; total: number };
export type FileSelection = {
  selection_id: string;
  name: string;
  duration_seconds: number;
};

// A namespace for the shared player's UI identity; API IDs remain unchanged.
export function songTrack(song: Song): Beat {
  return {
    id: `song:${song.id}`,
    title: song.title,
    channel: song.state,
    beatmaker: null,
    beatmaker_source: null,
    bpm: null,
    musical_key: null,
    favorite: song.favorite,
    duration_seconds: song.duration_seconds,
    artwork_url: song.artwork_url,
    audio_url: song.audio_url,
  };
}
