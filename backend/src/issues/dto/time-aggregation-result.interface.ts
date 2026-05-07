export interface TimeAggregationResult {
  totalMinutes: number;
  formattedHours: string;
}

interface RawSumRow {
  total: string | number | null;
}

export function toAggregationResult(
  raw: RawSumRow | undefined,
): TimeAggregationResult {
  const value = raw?.total;
  const totalMinutes =
    value === null || value === undefined ? 0 : Number(value);
  const safeMinutes = Number.isFinite(totalMinutes) ? totalMinutes : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return {
    totalMinutes: safeMinutes,
    formattedHours: `${hours}h ${minutes}m`,
  };
}
