from sqlalchemy.orm import Session
from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import or_, func

from backend.app.models.entities import Medicine, Batch, SaleItem
from backend.app.schemas.schemas import MedicineCreate, MedicineUpdate, BatchCreate
from backend.app.services.audit_service import log_audit
from backend.app.services.settings_service import get_setting_int

def update_batch_statuses(db: Session):
    """
    FR-12: Maintain batch status (Active, Near-Expiry, Expired, Depleted, Written-Off)
    and update it automatically every day and after every stock change.
    """
    today = date.today()
    near_expiry_days = get_setting_int(db, "near_expiry_days", 90)

    batches = db.query(Batch).filter(Batch.status != "Written-Off").all()
    for b in batches:
        if b.qty_remaining <= 0:
            b.status = "Depleted"
        elif b.expiry_date < today:
            b.status = "Expired"
            b.sell_first = False  # DEF-05: Reset sell_first when batch is expired
        elif (b.expiry_date - today).days <= near_expiry_days:
            b.status = "Near-Expiry"
        else:
            b.status = "Active"
    db.commit()

def create_medicine(db: Session, data: MedicineCreate, user_id: int) -> Medicine:
    # DEF-01: Server-side validation against blank strings or non-positive price
    name_clean = (data.name or "").strip()
    generic_clean = (data.generic_name or "").strip()
    if not name_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Medicine Name is required and cannot be blank."
        )
    if not generic_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generic Name is required and cannot be blank."
        )
    if data.unit_price is None or Decimal(str(data.unit_price)) <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Retail Unit Price must be greater than zero."
        )

    # FR-07: Check duplicate with same name, strength, dosage_form and manufacturer
    existing = db.query(Medicine).filter(
        func.lower(Medicine.name) == name_clean.lower(),
        func.lower(Medicine.strength) == (data.strength or "").strip().lower(),
        func.lower(Medicine.dosage_form) == (data.dosage_form or "").strip().lower(),
        func.lower(Medicine.manufacturer) == (data.manufacturer or "").strip().lower(),
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A medicine with the same name, strength, dosage form and manufacturer already exists."
        )

    if data.barcode:
        existing_barcode = db.query(Medicine).filter(Medicine.barcode == data.barcode.strip()).first()
        if existing_barcode:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Barcode '{data.barcode}' is already in use by another medicine."
            )

    medicine = Medicine(
        name=data.name.strip(),
        generic_name=data.generic_name.strip(),
        category=data.category.strip() if data.category else None,
        dosage_form=data.dosage_form.strip() if data.dosage_form else None,
        strength=data.strength.strip() if data.strength else None,
        manufacturer=data.manufacturer.strip() if data.manufacturer else None,
        barcode=data.barcode.strip() if data.barcode else None,
        unit_price=data.unit_price,
        reorder_level=data.reorder_level,
        requires_prescription=data.requires_prescription,
        is_active=True,
    )
    db.add(medicine)
    db.commit()
    db.refresh(medicine)
    log_audit(db, action="CREATE_MEDICINE", user_id=user_id, entity="medicines", entity_id=str(medicine.medicine_id), result="Success")
    return medicine

def update_medicine(db: Session, medicine_id: int, data: MedicineUpdate, user_id: int) -> Medicine:
    medicine = db.query(Medicine).filter(Medicine.medicine_id == medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    update_dict = data.dict(exclude_unset=True)
    for k, v in update_dict.items():
        if k == "barcode" and v:
            existing = db.query(Medicine).filter(Medicine.barcode == v.strip(), Medicine.medicine_id != medicine_id).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Barcode already assigned to another medicine.")
        setattr(medicine, k, v)

    db.commit()
    db.refresh(medicine)
    log_audit(db, action="UPDATE_MEDICINE", user_id=user_id, entity="medicines", entity_id=str(medicine.medicine_id), result="Success")
    return medicine

def deactivate_medicine(db: Session, medicine_id: int, user_id: int) -> Medicine:
    medicine = db.query(Medicine).filter(Medicine.medicine_id == medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    # FR-08: A medicine that has batch or sales records shall be deactivated, not deleted
    medicine.is_active = False
    db.commit()
    db.refresh(medicine)
    log_audit(db, action="DEACTIVATE_MEDICINE", user_id=user_id, entity="medicines", entity_id=str(medicine.medicine_id), result="Success")
    return medicine

def search_medicines(
    db: Session,
    query: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True
) -> List[dict]:
    """FR-09: Search medicines by name, generic name, category or barcode using partial matching."""
    q = db.query(Medicine)
    if active_only:
        q = q.filter(Medicine.is_active == True)

    if category:
        q = q.filter(Medicine.category.ilike(f"%{category}%"))

    if query:
        search_pattern = f"%{query.strip()}%"
        q = q.filter(
            or_(
                Medicine.name.ilike(search_pattern),
                Medicine.generic_name.ilike(search_pattern),
                Medicine.category.ilike(search_pattern),
                Medicine.barcode.ilike(search_pattern),
            )
        )

    medicines = q.order_by(Medicine.name).all()
    today = date.today()
    results = []
    for med in medicines:
        # Sum non-expired, non-written-off batches for usable stock (FR-31)
        usable_batches = [
            b for b in med.batches
            if b.status in ("Active", "Near-Expiry") and b.expiry_date >= today and b.qty_remaining > 0
        ]
        total_stock = sum(b.qty_remaining for b in usable_batches)
        
        # Sort batches ascending by expiry date (FR-11)
        sorted_batches = sorted(med.batches, key=lambda b: b.expiry_date)
        batch_outs = []
        for b in sorted_batches:
            days = (b.expiry_date - today).days
            batch_outs.append({
                "batch_id": b.batch_id,
                "medicine_id": b.medicine_id,
                "po_item_id": b.po_item_id,
                "batch_number": b.batch_number,
                "expiry_date": b.expiry_date,
                "received_date": b.received_date,
                "qty_received": b.qty_received,
                "qty_remaining": b.qty_remaining,
                "purchase_price": b.purchase_price,
                "status": b.status,
                "sell_first": b.sell_first,
                "days_to_expiry": days,
            })

        results.append({
            "medicine_id": med.medicine_id,
            "name": med.name,
            "generic_name": med.generic_name,
            "category": med.category,
            "dosage_form": med.dosage_form,
            "strength": med.strength,
            "manufacturer": med.manufacturer,
            "barcode": med.barcode,
            "unit_price": med.unit_price,
            "reorder_level": med.reorder_level,
            "requires_prescription": med.requires_prescription,
            "is_active": med.is_active,
            "total_stock": total_stock,
            "batches": batch_outs,
        })
    return results

def create_batch(db: Session, data: BatchCreate, user_id: int) -> Batch:
    """
    FR-10: Create batch record.
    Reject expiry date not in future, qty <= 0, and batch number that already exists for that medicine.
    """
    today = date.today()
    if data.expiry_date <= today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiry date must be in the future."
        )

    if data.qty_received <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity received must be greater than zero."
        )

    existing = db.query(Batch).filter(
        Batch.medicine_id == data.medicine_id,
        Batch.batch_number == data.batch_number.strip()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch number '{data.batch_number}' already exists for this medicine."
        )

    medicine = db.query(Medicine).filter(Medicine.medicine_id == data.medicine_id).first()
    if not medicine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    near_expiry_days = get_setting_int(db, "near_expiry_days", 90)
    days_to_expiry = (data.expiry_date - today).days
    batch_status = "Near-Expiry" if days_to_expiry <= near_expiry_days else "Active"

    batch = Batch(
        medicine_id=data.medicine_id,
        batch_number=data.batch_number.strip(),
        expiry_date=data.expiry_date,
        received_date=data.received_date or today,
        qty_received=data.qty_received,
        qty_remaining=data.qty_received,
        purchase_price=data.purchase_price,
        status=batch_status,
        sell_first=False,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    log_audit(db, action="CREATE_BATCH", user_id=user_id, entity="batches", entity_id=str(batch.batch_id), result="Success")
    return batch
