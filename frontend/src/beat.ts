export type Beat = {
  id: string;
  tags?: string[];
  styles?: string[];
  moods?: string[];
  title: string;
  beatmakers?: { id: string; name: string; photo_url?: string | null }[];
  beatmaker: string | null;
  beatmaker_source:
    | "explicit_credit"
    | "channel"
    | "channel_alias"
    | "ambiguous_credit"
    | "channel_self_credit"
    | "channel_alias_self_credit"
    | "unresolved_self_credit"
    | "manual"
    | "legacy"
    | null;
  channel: string | null;
  bpm: number | null;
  musical_key: string | null;
  duration_seconds: number | null;
  favorite: boolean;
  artwork_url: string | null;
  audio_url: string;
};

export type BeatDetails = Beat & {
  source_url: string | null;
  published_on: string | null;
  added_at: string;
  description: string | null;
  can_remember_channel: boolean;
  channel_id_known: boolean;
  channel_alias: { beatmaker: string; uses_channel_id: boolean } | null;
  metadata_provenance: Record<string, unknown>;
  tags: string[];
  styles: string[];
  moods: string[];
  links: { url: string; label: string | null }[];
};

export function duration(seconds: number | null) {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function externalLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function musicalKeyLabel(value: string | null | undefined) {
  if (!value) return "—";
  const match = value.match(/^([A-G])([#b]?)\s*(minor|min|m|major|maj)$/i);
  if (!match) return value;
  return `${match[1].toUpperCase()}${match[2].toLowerCase()} ${["minor", "min", "m"].includes(match[3].toLowerCase()) ? "minor" : "major"}`;
}

export function beatmakerSourceLabel(source: Beat["beatmaker_source"]) {
  if (source === "channel_self_credit")
    return "Auteur proposé depuis la chaîne YouTube ; les collaborateurs explicitement crédités sont conservés. À vérifier.";
  if (source === "channel_alias_self_credit")
    return "Auteur résolu avec la règle de chaîne mémorisée ; les collaborateurs explicitement crédités sont conservés.";
  if (source === "unresolved_self_credit")
    return "Auteur du crédit non identifié. Les collaborateurs connus sont conservés ; corrige le nom du beatmaker.";
  if (source === "channel")
    return "Proposition depuis la chaîne YouTube ; le nom reste corrigeable.";
  if (source === "channel_alias")
    return "Nom proposé avec la règle de chaîne mémorisée.";
  if (source === "explicit_credit")
    return "Crédit explicite du titre ou de la description.";
  if (source === "ambiguous_credit")
    return "Crédits contradictoires ; une correction est nécessaire.";
  return source === "manual"
    ? "Nom corrigé manuellement."
    : "Nom du beatmaker à vérifier.";
}

export function makerLabel(beat: Beat) {
  return beat.beatmakers?.length
    ? beat.beatmakers.map((p) => p.name).join(" × ")
    : beat.beatmaker || beat.channel || "Fichier local";
}
