from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from decimal import Decimal

from backend.app.models.entities import Medicine, Batch, StockAdjustment, Sale, Recommendation
from backend.app.schemas.schemas import StockAdjustmentCreate, DashboardMetrics
from backend.app.services.audit_service import log_audit
from backend.app.services.settings_service import get_setting_int
from backend.app.services.medicine_service import update_batch_statuses

def get_stock_overview(db: Session) -> Dict[str, Any]:
    """FR-31: Display current usable stock and batch breakdowns."""
    update_batch_statuses(db)
    today = date.today()
    near_expiry_threshold = get_setting_int(db, "near_expiry_days", 90)

    medicines = db.query(Medicine).filter(Medicine.is_active == True).order_by(Medicine.name).all()
    
    stock_list = []
    low_stock_list = []
    near_expiry_batches = []
    expired_batches = []

    for med in medicines:
        usable_batches = [
            b for b in med.batches
            if b.status in ("Active", "Near-Expiry") and b.expiry_date >= today and b.qty_remaining > 0
        ]
        usable_stock = sum(b.qty_remaining for b in usable_batches)

        med_info = {
            "medicine_id": med.medicine_id,
            "name": med.name,
            "generic_name": med.generic_name,
            "category": med.category,
            "strength": med.strength,
            "dosage_form": med.dosage_form,
            "reorder_level": med.reorder_level,
            "usable_stock": usable_stock,
            "is_low_stock": usable_stock <= med.reorder_level,
        }

        stock_list.append(med_info)

        # FR-32: low-stock alert
        if usable_stock <= med.reorder_level:
            low_stock_list.append(med_info)

        # Batches analysis
        for b in med.batches:
            days = (b.expiry_date - today).days
            b_info = {
                "batch_id": b.batch_id,
                "medicine_id": med.medicine_id,
                "medicine_name": med.name,
                "batch_number": b.batch_number,
                "expiry_date": b.expiry_date,
                "days_to_expiry": days,
                "qty_remaining": b.qty_remaining,
                "purchase_price": b.purchase_price,
                "status": b.status,
                "sell_first": False if (b.status == "Expired" or b.expiry_date < today) else b.sell_first,
            }

            # FR-33: Near-expiry alert
            if b.status == "Near-Expiry" and b.qty_remaining > 0:
                near_expiry_batches.append(b_info)

            # FR-34: Expired screen
            if b.status == "Expired" and b.qty_remaining > 0:
                expired_batches.append(b_info)

    return {
        "stock": stock_list,
        "low_stock": low_stock_list,
        "near_expiry": near_expiry_batches,
        "expired": expired_batches,
    }

def write_off_stock(db: Session, batch_id: int, quantity: int, reason: str, user_id: int) -> Batch:
    """FR-35: Write off expired or damaged quantity, reduce batch quantity, create stock adjustment."""
    if quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Write-off quantity must be greater than zero.")

    if not reason or not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A reason is required for write-off.")

    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    if quantity > batch.qty_remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot write off {quantity} units. Batch has only {batch.qty_remaining} units remaining."
        )

    batch.qty_remaining -= quantity
    if batch.qty_remaining == 0:
        batch.status = "Written-Off"

    adjustment = StockAdjustment(
        batch_id=batch.batch_id,
        user_id=user_id,
        adjustment_type="Write-Off Expired",
        quantity_change=-quantity,
        reason=reason.strip(),
        adjusted_at=datetime.utcnow(),
    )
    db.add(adjustment)
    db.commit()
    db.refresh(batch)

    log_audit(db, action="WRITE_OFF", user_id=user_id, entity="batches", entity_id=str(batch.batch_id), result="Success")
    return batch

def adjust_stock(db: Session, batch_id: int, quantity_change: int, reason: str, user_id: int, adjustment_type: str = "Correction") -> Batch:
    """FR-36: Adjust batch quantity (increase or decrease) with mandatory reason."""
    if quantity_change == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity change cannot be zero.")

    if not reason or not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A reason is required for stock adjustment.")

    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    new_qty = batch.qty_remaining + quantity_change
    if new_qty < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Adjustment would result in negative stock ({new_qty}). Maximum reduction is {batch.qty_remaining}."
        )

    batch.qty_remaining = new_qty
    update_batch_statuses(db)

    adjustment = StockAdjustment(
        batch_id=batch.batch_id,
        user_id=user_id,
        adjustment_type=adjustment_type,
        quantity_change=quantity_change,
        reason=reason.strip(),
        adjusted_at=datetime.utcnow(),
    )
    db.add(adjustment)
    db.commit()
    db.refresh(batch)

    log_audit(db, action="STOCK_ADJUSTMENT", user_id=user_id, entity="batches", entity_id=str(batch.batch_id), result="Success")
    return batch

def get_dashboard_metrics(db: Session) -> DashboardMetrics:
    """FR-37: Counts of low-stock, near-expiry, expired items, pending recommendations, and today's sales total."""
    overview = get_stock_overview(db)
    low_stock_count = len(overview["low_stock"])
    near_expiry_count = len(overview["near_expiry"])
    expired_count = len(overview["expired"])

    pending_rec_count = db.query(Recommendation).filter(Recommendation.status == "Pending").count()

    today_start = datetime.combine(date.today(), datetime.min.time())
    today_sales = db.query(Sale).filter(
        Sale.sale_datetime >= today_start,
        Sale.status == "Completed"
    ).all()

    today_total = sum(s.total_amount for s in today_sales) if today_sales else Decimal("0.0")

    return DashboardMetrics(
        low_stock_count=low_stock_count,
        near_expiry_count=near_expiry_count,
        expired_count=expired_count,
        pending_recommendations_count=pending_rec_count,
        today_sales_total=Decimal(f"{today_total:.2f}"),
        today_bills_count=len(today_sales),
    )
