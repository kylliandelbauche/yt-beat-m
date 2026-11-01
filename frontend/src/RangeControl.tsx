import type { CSSProperties } from "react";

// Keep native range interaction and keyboard support; paint a contained track/thumb.
export function RangeControl({
  label,
  min,
  max,
  step,
  value,
  onChange,
  disabled = false,
  vertical = false,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  vertical?: boolean;
}) {
  const level = Math.max(
    0,
    Math.min(100, (100 * (value - min)) / (max - min || 1)),
  );
  return (
    <span
      className={`range-control${vertical ? " vertical-range" : ""}`}
      style={{ "--range-level": `${level}%` } as CSSProperties}
    >
      <span className="range-rail" aria-hidden="true">
        <span className="range-fill" />
        <span className="range-thumb" />
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            onChange(e.key === "Home" ? min : max);
          }
        }}
      />
    </span>
  );
}
