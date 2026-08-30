import { useEffect, useMemo, useState } from "react";
import { getTest } from "../api";
import type { TestListItem } from "../types";
import { computeHealthScore, formatTestType, overallStatus, worstMotorFinding, type StatusTier } from "../health";
import { StatusPill } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { formatTestDate } from "../dateFormat";

interface Row {
  test: TestListItem;
  score: number | null;
  status: StatusTier | "unknown";
  flaggedMotor: string | null;
}

const STATUS_OPTIONS: { value: StatusTier | "unknown" | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "healthy", label: "Healthy" },
  { value: "monitor", label: "Monitor" },
  { value: "inspect", label: "Inspect" },
  { value: "critical", label: "Critical" },
];

export function TestHistoryPage({
  tests,
  onOpenTest,
  onRunDiagnostic,
}: {
  tests: TestListItem[];
  onOpenTest: (id: number) => void;
  onRunDiagnostic: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTier | "unknown" | "all">("all");

  useEffect(() => {
    if (tests.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    Promise.all(
      tests.map((t) =>
        getTest(t.id).then((detail) => ({
          test: t,
          score: computeHealthScore(detail.diagnostics),
          status: overallStatus(detail.diagnostics),
          flaggedMotor: worstMotorFinding(detail.diagnostics.motor_findings)?.label ?? null,
        })),
      ),
    ).then((result) => {
      if (!cancelled) setRows(result);
    });
    return () => {
      cancelled = true;
    };
  }, [tests]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.test.name.toLowerCase().includes(q) || (r.test.robot_name ?? "").toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Test History</h1>
        <p className="page-subtitle">Every imported diagnostic run for this robot, across any mechanism.</p>
      </div>

      {tests.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No tests recorded yet"
            hint="Imported diagnostic runs, for any mechanism, will show up here so you can track how your robot changes across a season."
            action={
              <button type="button" className="btn primary" onClick={onRunDiagnostic}>
                Run Diagnostic
              </button>
            }
          />
        </div>
      ) : (
        <div className="panel">
          <div className="flex-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Search by test or robot name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minWidth: 220, flex: 1 }}
              aria-label="Search tests"
            />
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusTier | "unknown" | "all")}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Test</th>
                  <th>Type</th>
                  <th>Robot</th>
                  <th>Health</th>
                  <th>Flagged Motor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!filtered
                  ? tests.map((t) => (
                      <tr key={t.id}>
                        <td colSpan={7}>
                          <Skeleton width="100%" height={16} />
                        </td>
                      </tr>
                    ))
                  : filtered.map((r) => (
                      <tr key={r.test.id} onClick={() => onOpenTest(r.test.id)} tabIndex={0} role="button">
                        <td>{formatTestDate(r.test.recorded_at, r.test.imported_at)}</td>
                        <td>{r.test.name}</td>
                        <td className="muted">{formatTestType(r.test.test_type)}</td>
                        <td>{r.test.robot_name ?? "—"}</td>
                        <td className="mono">{r.score ?? "—"}</td>
                        <td className="mono">{r.flaggedMotor ?? "—"}</td>
                        <td>
                          <StatusPill status={r.status} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {filtered && filtered.length === 0 && (
              <p className="muted" style={{ padding: "16px 4px", fontSize: "0.85rem" }}>
                No tests match this search/filter.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
