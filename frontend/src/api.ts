import type { CompareResponse, TelemetrySeries, TestDetailResponse, TestListItem } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore body parse failure, fall back to statusText
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function importTest(file: File): Promise<TestDetailResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/tests/import`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<TestDetailResponse>(res);
}

export async function listTests(): Promise<TestListItem[]> {
  const res = await fetch(`${API_BASE}/api/tests`);
  return handleResponse<TestListItem[]>(res);
}

export async function getTest(id: number): Promise<TestDetailResponse> {
  const res = await fetch(`${API_BASE}/api/tests/${id}`);
  return handleResponse<TestDetailResponse>(res);
}

export async function getTelemetry(id: number): Promise<TelemetrySeries> {
  const res = await fetch(`${API_BASE}/api/tests/${id}/telemetry`);
  return handleResponse<TelemetrySeries>(res);
}

export async function compareTests(beforeId: number, afterId: number): Promise<CompareResponse> {
  const params = new URLSearchParams({ before_id: String(beforeId), after_id: String(afterId) });
  const res = await fetch(`${API_BASE}/api/tests/compare?${params.toString()}`);
  return handleResponse<CompareResponse>(res);
}
