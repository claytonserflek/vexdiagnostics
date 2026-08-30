import type { TestListItem } from "../types";
import { StatusBadge } from "./StatusBadge";
import { formatTestDate } from "../dateFormat";

export function TestHistoryList({
  tests,
  onSelect,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  tests: TestListItem[];
  onSelect: (id: number) => void;
  selectable?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (id: number) => void;
}) {
  if (tests.length === 0) {
    return (
      <div className="card">
        <p className="muted">No tests yet. Import a telemetry CSV to get started.</p>
      </div>
    );
  }

  return (
    <div className="card">
      {tests.map((t) => (
        <div key={t.id} className="history-row" onClick={() => onSelect(t.id)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {selectable && (
              <input
                type="checkbox"
                checked={selectedIds?.includes(t.id) ?? false}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelect?.(t.id)}
              />
            )}
            <div className="history-meta">
              <span className="history-name">{t.name}</span>
              <span className="history-sub">
                {t.robot_name ?? "Unnamed robot"} &middot; {formatTestDate(t.recorded_at, t.imported_at)}
                {t.commanded_cruise_rpm ? ` · ${t.commanded_cruise_rpm} RPM cruise` : ""}
              </span>
            </div>
          </div>
          <StatusBadge classification={t.overall_classification} />
        </div>
      ))}
    </div>
  );
}
