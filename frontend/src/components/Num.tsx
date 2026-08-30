/** Renders a numeric telemetry value in monospace with a unit suffix.
 * Centralizes the "numbers are mono, everything else is sans" rule. */
export function Num({
  value,
  digits = 1,
  unit,
  placeholder = "—",
}: {
  value: number | null | undefined;
  digits?: number;
  unit?: string;
  placeholder?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="mono">{placeholder}</span>;
  }
  return (
    <span className="mono">
      {value.toFixed(digits)}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}
