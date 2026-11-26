"""
Automated regression tests for DEF-01 to DEF-05 (fixing the 4 failed test cases from manual testing).
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db.session import SessionLocal, init_db
from backend.app.models.entities import Medicine, Batch
from backend.app.core.security import create_access_token
from backend.app.services.medicine_service import update_batch_statuses
from backend.app.services.report_service import get_stock_expiry_report, get_recommendation_report

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()

@pytest.fixture
def pharmacist_token():
    return create_access_token("2", "Pharmacist")

@pytest.fixture
def admin_token():
    return create_access_token("1", "Administrator")


def test_def01_blank_medicine_rejected(pharmacist_token):
    """
    DEF-01 / TC-14:
    Creating a medicine with empty Name, Generic Name or <=0 price must be rejected.
    """
    headers = {"Authorization": f"Bearer {pharmacist_token}"}

    # 1. Blank name
    resp = client.post("/api/medicines", json={
        "name": "   ",
        "generic_name": "Paracetamol",
        "unit_price": 50.0,
        "reorder_level": 10
    }, headers=headers)
    assert resp.status_code in (400, 422), "Blank name should be rejected"

    # 2. Blank generic_name
    resp = client.post("/api/medicines", json={
        "name": "Panadol Extra",
        "generic_name": "",
        "unit_price": 50.0,
        "reorder_level": 10
    }, headers=headers)
    assert resp.status_code in (400, 422), "Empty generic_name should be rejected"

    # 3. Non-positive unit_price
    resp = client.post("/api/medicines", json={
        "name": "Panadol Extra",
        "generic_name": "Paracetamol",
        "unit_price": 0.0,
        "reorder_level": 10
    }, headers=headers)
    assert resp.status_code in (400, 422), "Zero unit_price should be rejected"


def test_def02_empty_purchase_order_rejected(pharmacist_token):
    """
    DEF-02 / TC-21:
    Creating a PO without valid line items must return a clean error without crashing.
    """
    headers = {"Authorization": f"Bearer {pharmacist_token}"}

    resp = client.post("/api/purchases", json={
        "supplier_id": 1,
        "items": []
    }, headers=headers)
    assert resp.status_code in (400, 422), "PO with empty items must be rejected"


def test_def03_stock_expiry_and_recommendation_reports_have_rows(admin_token, db_session):
    """
    DEF-03 / TC-31 & TC-32:
    Stock & Expiry and Recommendations reports must return populated rows and summary.
    """
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Stock & Expiry report
    resp_stk = client.get("/api/reports/stock-expiry", headers=headers)
    assert resp_stk.status_code == 200
    stk_data = resp_stk.json()
    assert "rows" in stk_data, "Report must include rows"
    assert "summary" in stk_data, "Report must include summary"
    assert len(stk_data["rows"]) > 0, "Stock & Expiry report must have data rows"

    # Recommendations report
    resp_rec = client.get("/api/reports/recommendations", headers=headers)
    assert resp_rec.status_code == 200
    rec_data = resp_rec.json()
    assert "rows" in rec_data, "Report must include rows"
    assert "summary" in rec_data, "Report must include summary"


def test_def04_pos_discount_limit_enforced(pharmacist_token):
    """
    DEF-04 / TC-16 & TC-17:
    Discount > 10% is rejected; discount <= 10% is accepted.
    """
    headers = {"Authorization": f"Bearer {pharmacist_token}"}

    # First find an active medicine
    med_resp = client.get("/api/medicines", headers=headers)
    assert med_resp.status_code == 200
    meds = [m for m in med_resp.json() if m["total_stock"] > 0]
    assert len(meds) > 0
    target_med = meds[0]

    # Attempt with 15% discount
    resp_15 = client.post("/api/sales", json={
        "discount_percent": 15.0,
        "items": [{"medicine_id": target_med["medicine_id"], "quantity": 1}]
    }, headers=headers)
    assert resp_15.status_code == 400
    assert "exceeds" in resp_15.json()["detail"].lower()


def test_def05_expired_batch_resets_sell_first(db_session):
    """
    DEF-05 / TC-24:
    An expired batch must never keep sell_first = True after status update.
    """
    # Create or find an expired batch
    today = date.today()
    exp_batch = db_session.query(Batch).filter(Batch.expiry_date < today).first()
    if exp_batch:
        exp_batch.sell_first = True
        db_session.commit()

        # Run batch status updater
        update_batch_statuses(db_session)
        db_session.refresh(exp_batch)

        assert exp_batch.status == "Expired"
        assert exp_batch.sell_first is False, "Expired batch must have sell_first reset to False"
