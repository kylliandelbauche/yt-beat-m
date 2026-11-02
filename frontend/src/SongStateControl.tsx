import { songStates } from "./song";
import type { SongState } from "./song";

export function SongStateIcon({ state }: { state: SongState }) {
  const paths: Record<SongState, string> = {
    Topline:
      "M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0ZM6 10v2a6 6 0 0 0 12 0v-2M12 18v4M9 22h6",
    Maquette: "M3 21V11h6V6h6V3h6v18ZM3 16h18M9 11h12M15 6h6M9 16v5M15 11v5",
    Mixage:
      "M6 3v7M6 14v7M12 3v12M12 19v2M18 3v3M18 10v11M3 10h6v4H3ZM9 15h6v4H9ZM15 6h6v4h-6Z",
    Master:
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM6 12a6 6 0 0 1 6-6",
    Out: "M14 3h7v7M21 3 10 14M10 4H4v16h16v-6",
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[state]} />
    </svg>
  );
}

export function SongStateControl({
  value,
  onChange,
  disabled,
  label,
}: {
  value: SongState;
  onChange: (value: SongState) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="song-state-control">
      <SongStateIcon state={value} />
      <span>{value}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m7 10 5 5 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SongState)}
      >
        {songStates.map((state) => (
          <option key={state}>{state}</option>
        ))}
      </select>
    </label>
  );
}
