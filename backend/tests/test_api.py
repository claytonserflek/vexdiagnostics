"""End-to-end API test: import two CSVs through the real HTTP layer and
exercise list/detail/telemetry/compare, the way the frontend actually
uses this service. Uses one shared TestClient/db for the whole module --
tests are written to be order-independent by asserting on the specific
ids/labels returned rather than global counts.
"""

import io
import os

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAMPLE_DIR = os.path.join(REPO_ROOT, "sample-data")


def _import_sample(filename: str) -> dict:
    path = os.path.join(SAMPLE_DIR, filename)
    with open(path, "rb") as f:
        content = f.read()
    resp = client.post(
        "/api/tests/import",
        files={"file": (filename, io.BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_import_baseline_and_after_and_compare():
    baseline = _import_sample("baseline_test.csv")
    after = _import_sample("after_adjustment_test.csv")

    assert baseline["test"]["name"] == "Baseline before gear adjustment"
    assert baseline["diagnostics"]["overall_classification"] in ("high", "possible")
    assert baseline["diagnostics"]["worse_side"] == "R"

    assert after["diagnostics"]["overall_classification"] in ("normal", "possible")

    baseline_id = baseline["test"]["id"]
    after_id = after["test"]["id"]

    # List should include both imported tests.
    list_resp = client.get("/api/tests")
    assert list_resp.status_code == 200
    ids = {t["id"] for t in list_resp.json()}
    assert {baseline_id, after_id} <= ids

    # Detail endpoint should recompute the same classification.
    detail_resp = client.get(f"/api/tests/{baseline_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["diagnostics"]["overall_classification"] == baseline["diagnostics"]["overall_classification"]

    # Telemetry endpoint should return per-motor time series.
    telemetry_resp = client.get(f"/api/tests/{baseline_id}/telemetry")
    assert telemetry_resp.status_code == 200
    telemetry = telemetry_resp.json()
    assert set(telemetry.keys()) == {"FL", "FR", "BL", "BR"}
    assert len(telemetry["FL"]) > 0
    assert "actual_velocity_rpm" in telemetry["FL"][0]

    # Compare endpoint should show improvement.
    compare_resp = client.get("/api/tests/compare", params={"before_id": baseline_id, "after_id": after_id})
    assert compare_resp.status_code == 200
    comparison = compare_resp.json()["comparison"]
    assert comparison["side_asymmetry_after_pts"] < comparison["side_asymmetry_before_pts"]


def test_import_rejects_invalid_csv():
    resp = client.post(
        "/api/tests/import",
        files={"file": ("bad.csv", io.BytesIO(b"not,a,valid,telemetry,file\n1,2,3,4,5"), "text/csv")},
    )
    assert resp.status_code == 422


def test_get_missing_test_returns_404():
    resp = client.get("/api/tests/999999")
    assert resp.status_code == 404


def test_health_check():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
