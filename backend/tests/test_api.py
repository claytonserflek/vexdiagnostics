"""End-to-end API test: import two CSVs through the real HTTP layer and
exercise list/detail/telemetry/compare, the way the frontend actually
uses this service. Uses one shared TestClient/db for the whole module --
tests are written to be order-independent by asserting on the specific
ids/labels returned rather than global counts.
"""

import io
import os

import pytest
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


GENERIC_CSV = b"""timestamp,motor_name,velocity_rpm,current_amp,voltage_v,temperature_c,torque_nm
0.0,front_left,198,1.21,11.92,31.2,0.18
0.0,back_left,201,1.18,11.94,30.8,0.17
0.0,front_right,164,2.08,11.71,35.4,0.31
0.0,back_right,197,1.24,11.90,31.5,0.18
"""


def test_import_generic_csv_with_no_metadata():
    """The exact example from the feature request: no "# key=value" lines
    at all, generic column names, time in seconds, current in amps,
    voltage in volts. Must auto-detect the 4 motors and import cleanly."""
    resp = client.post(
        "/api/tests/import",
        files={"file": ("generic.csv", io.BytesIO(GENERIC_CSV), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert set(body["test"]["motors"].keys()) == {"front_left", "back_left", "front_right", "back_right"}
    # No "# test_type=" was given, but the motor names resolve to a left
    # and a right side, so the default label reflects that.
    assert body["test"]["test_type"] == "drivetrain_resistance_v1"
    assert body["test"]["commanded_cruise_rpm"] is None

    diagnostics = body["diagnostics"]
    by_label = {s["label"]: s for s in diagnostics["motor_summaries"]}
    # Units were converted: 2.08 A -> 2080 mA.
    assert by_label["front_right"]["current_mean"] == pytest.approx(2080.0, rel=0.01)
    # No commanded data anywhere, so velocity-deficit diagnostics are
    # unavailable rather than invented, but current-based comparison and
    # per-motor findings still work.
    assert all(s["velocity_deficit_mean"] is None for s in diagnostics["motor_summaries"])
    findings_by_label = {f["label"]: f for f in diagnostics["motor_findings"]}
    assert findings_by_label["front_right"]["classification"] in ("High Resistance", "Possible High Resistance")

    test_id = body["test"]["id"]
    telemetry_resp = client.get(f"/api/tests/{test_id}/telemetry")
    assert telemetry_resp.status_code == 200
    assert set(telemetry_resp.json().keys()) == {"front_left", "back_left", "front_right", "back_right"}


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
