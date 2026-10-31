export type Filters = {
  bpm_min: string;
  bpm_max: string;
  bpm_missing: boolean;
  keys: string[];
  makers: string[];
  channels: string[];
  tags: string[];
  key_missing: boolean;
  maker_missing: boolean;
  channel_missing: boolean;
  tag_missing: boolean;
};
export const emptyFilters: Filters = {
  bpm_min: "",
  bpm_max: "",
  bpm_missing: false,
  keys: [],
  makers: [],
  channels: [],
  tags: [],
  key_missing: false,
  maker_missing: false,
  channel_missing: false,
  tag_missing: false,
};
export type FilterOptions = {
  keys: string[];
  makers: string[];
  channels: string[];
  tags: string[];
};
export const emptyOptions: FilterOptions = {
  keys: [],
  makers: [],
  channels: [],
  tags: [],
};
export function filterQuery(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value) params.set(key, String(value));
  }
  return params;
}
export function bpmError(min: string, max: string) {
  if (
    [min, max].some(
      (v) =>
        v !== "" &&
        (!Number.isFinite(Number(v)) || Number(v) <= 0 || Number(v) > 1000),
    )
  )
    return "0 < BPM ≤ 1000";
  return min && max && Number(min) > Number(max) ? "Min. > max." : "";
}
