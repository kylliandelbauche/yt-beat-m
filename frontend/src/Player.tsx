import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, ReactNode } from "react";
import { Artwork } from "./Artwork";
import { Icon } from "./Modal";
import { Floating } from "./Floating";
import { duration, makerLabel } from "./beat";
import type { Beat } from "./beat";
export function Player({
  beat,
  audio,
  playing,
  failed,
  onToggle,
  onDetails,
  previous,
  next,
  children,
  onLevel,
  onSeek,
}: {
  beat: Beat | null;
  audio: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  failed?: boolean;
  onToggle: () => void;
  onDetails: () => void;
  previous?: () => void;
  next?: () => void;
  children: ReactNode;
  onLevel: (level: number, muted: boolean) => void;
  onSeek: (seconds: number) => void;
}) {
  const [time, setTime] = useState(0),
    [length, setLength] = useState(0),
    [volume, setVolume] = useState(1),
    [muted, setMuted] = useState(false),
    [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const beforeMute = useRef(1);
  const close = useCallback(() => setAnchor(null), []);
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const sync = () => {
      setTime(el.currentTime || 0);
      setLength(
        Number.isFinite(el.duration)
          ? el.duration
          : beat?.duration_seconds || 0,
      );
      setVolume(el.volume);
      setMuted(el.muted || el.volume === 0);
    };
    sync();
    for (const name of [
      "timeupdate",
      "durationchange",
      "volumechange",
      "loadedmetadata",
    ])
      el.addEventListener(name, sync);
    return () => {
      for (const name of [
        "timeupdate",
        "durationchange",
        "volumechange",
        "loadedmetadata",
      ])
        el.removeEventListener(name, sync);
    };
  }, [audio, beat?.id, beat?.duration_seconds]);
  function setLevel(v: number) {
    onLevel(v, v === 0);
    if (v > 0) beforeMute.current = v;
  }
  function mute() {
    if (muted || !volume) onLevel(volume || beforeMute.current || 1, false);
    else {
      beforeMute.current = volume;
      onLevel(volume, true);
    }
  }
  return (
    <aside
      className={`local-player${!beat ? " empty-player" : ""}`}
      aria-label="Lecteur audio"
    >
      <button
        type="button"
        className="player-description"
        aria-label={
          beat
            ? `Détails depuis le lecteur : ${beat.title}`
            : "Aucune prod sélectionnée"
        }
        disabled={!beat}
        onClick={onDetails}
      >
        {beat ? (
          <Artwork beat={beat} className="player-artwork" />
        ) : (
          <span className="player-artwork placeholder" />
        )}
        <span>
          <strong title={beat?.title}>
            {beat?.title || "Aucune prod sélectionnée"}
          </strong>
          <small>
            {beat ? makerLabel(beat) : "Prêt pour ta première écoute"}
          </small>
        </span>
      </button>
      <div className="audio-controls">
        <button
          className="icon-button"
          aria-label="Prod précédente"
          disabled={!previous}
          onClick={previous}
        >
          <Icon name="previous" />
        </button>
        <button
          className="icon-button player-toggle"
          aria-label={
            failed ? "Réessayer la lecture" : playing ? "Pause" : "Lire"
          }
          disabled={!beat}
          onClick={onToggle}
        >
          <Icon name={playing ? "pause" : "play"} filled />
        </button>
        <button
          className="icon-button"
          aria-label="Prod suivante"
          disabled={!next}
          onClick={next}
        >
          <Icon name="next" />
        </button>
        <span className="player-time">{duration(time)}</span>
        <input
          type="range"
          aria-label="Position de lecture"
          min={0}
          max={length || 1}
          step={0.01}
          value={Math.min(time, length || 1)}
          disabled={!beat}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <span className="player-time">{duration(length)}</span>
        <button
          className="icon-button volume-trigger"
          aria-label="Volume"
          aria-expanded={!!anchor}
          disabled={!beat}
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        >
          <Icon name={muted ? "mute" : "volume"} />
        </button>
      </div>
      {children}
      {anchor && (
        <Floating
          above
          align="center"
          anchor={anchor}
          onClose={close}
          label="Volume du lecteur"
          className="volume-popover"
        >
          <output>{muted ? 0 : Math.round(volume * 100)} %</output>
          <input
            type="range"
            aria-label="Volume du lecteur"
            min={0}
            max={100}
            step={1}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => setLevel(Number(e.target.value) / 100)}
          />
          <button
            className="icon-button"
            aria-label={muted ? "Rétablir le son" : "Couper le son"}
            aria-pressed={muted}
            onClick={mute}
          >
            <Icon name={muted ? "mute" : "volume"} />
          </button>
        </Floating>
      )}
    </aside>
  );
}
