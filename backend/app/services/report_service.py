from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import func
from decimal import Decimal
import io
import csv

from backend.app.models.entities import (
    Sale, SaleItem, Medicine, Batch, PurchaseOrder, PurchaseOrderItem, Supplier, User, StockAdjustment, Recommendation, DecisionLog
)
from backend.app.services.medicine_service import update_batch_statuses

def get_sales_report(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    group_by: str = "day"  # day, medicine, user
) -> Dict[str, Any]:
    """FR-52: Sales report for a date range, grouped by day, medicine or user, with totals."""
    start = start_date or (date.today() - timedelta(days=30))
    end = end_date or date.today()
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    q = db.query(Sale).filter(
        Sale.sale_datetime >= start_dt,
        Sale.sale_datetime <= end_dt,
        Sale.status == "Completed"
    )
    sales = q.all()

    total_sales_amount = sum(s.total_amount for s in sales)
    total_bills = len(sales)

    rows = []
    if group_by == "medicine":
        med_map = {}
        for s in sales:
            for item in s.items:
                med_name = item.batch.medicine.name if item.batch and item.batch.medicine else "Unknown"
                if med_name not in med_map:
                    med_map[med_name] = {"quantity": 0, "amount": Decimal("0.0")}
                med_map[med_name]["quantity"] += item.quantity
                med_map[med_name]["amount"] += item.line_total
        for med_name, data in sorted(med_map.items(), key=lambda x: x[1]["amount"], reverse=True):
            rows.append({
                "group_key": med_name,
                "quantity": data["quantity"],
                "total_amount": float(data["amount"]),
            })
    elif group_by == "user":
        user_map = {}
        for s in sales:
            u_name = s.user.full_name if s.user else f"User {s.user_id}"
            if u_name not in user_map:
                user_map[u_name] = {"bills": 0, "amount": Decimal("0.0")}
            user_map[u_name]["bills"] += 1
            user_map[u_name]["amount"] += s.total_amount
        for u_name, data in user_map.items():
            rows.append({
                "group_key": u_name,
                "bills_count": data["bills"],
                "total_amount": float(data["amount"]),
            })
    else:  # default by day
        day_map = {}
        for s in sales:
            day_str = s.sale_datetime.strftime("%d/%m/%Y")
            if day_str not in day_map:
                day_map[day_str] = {"bills": 0, "amount": Decimal("0.0")}
            day_map[day_str]["bills"] += 1
            day_map[day_str]["amount"] += s.total_amount
        for day_str, data in day_map.items():
            rows.append({
                "group_key": day_str,
                "bills_count": data["bills"],
                "total_amount": float(data["amount"]),
            })

    return {
        "report_type": "sales",
        "start_date": start.strftime("%d/%m/%Y"),
        "end_date": end.strftime("%d/%m/%Y"),
        "group_by": group_by,
        "total_amount": float(total_sales_amount),
        "total_bills": total_bills,
        "rows": rows,
    }

def get_stock_expiry_report(db: Session) -> Dict[str, Any]:
    """FR-53: Stock and expiry report listing current stock, near-expiry batches and expired batches."""
    update_batch_statuses(db)
    today = date.today()
    batches = db.query(Batch).filter(Batch.qty_remaining > 0, Batch.status != "Written-Off").order_by(Batch.expiry_date.asc()).all()

    usable_rows = []
    near_expiry_rows = []
    expired_rows = []

    for b in batches:
        days = (b.expiry_date - today).days
        med_name = b.medicine.name if b.medicine else "Unknown"
        item = {
            "medicine_name": med_name,
            "batch_number": b.batch_number,
            "expiry_date": b.expiry_date.strftime("%d/%m/%Y"),
            "days_to_expiry": days,
            "qty_remaining": b.qty_remaining,
            "purchase_price": float(b.purchase_price),
            "stock_value": float(b.purchase_price * b.qty_remaining),
            "status": b.status,
        }
        if b.status == "Expired" or days < 0:
            expired_rows.append(item)
        elif b.status == "Near-Expiry" or days <= 90:
            near_expiry_rows.append(item)
        else:
            usable_rows.append(item)

    total_stock_value = sum(r["stock_value"] for r in usable_rows + near_expiry_rows)
    all_rows = expired_rows + near_expiry_rows + usable_rows

    return {
        "report_type": "stock_expiry",
        "generated_on": today.strftime("%d/%m/%Y"),
        "total_stock_value": total_stock_value,
        "usable_count": len(usable_rows),
        "near_expiry_count": len(near_expiry_rows),
        "expired_count": len(expired_rows),
        "usable_batches": usable_rows,
        "near_expiry_batches": near_expiry_rows,
        "expired_batches": expired_rows,
        "rows": all_rows,
        "summary": {
            "usable_batches": len(usable_rows),
            "near_expiry_batches": len(near_expiry_rows),
            "expired_batches": len(expired_rows),
            "total_stock_value": round(total_stock_value, 2),
        }
    }

def get_purchase_report(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    supplier_id: Optional[int] = None
) -> Dict[str, Any]:
    """FR-54: Purchase report by date range and supplier."""
    start = start_date or (date.today() - timedelta(days=90))
    end = end_date or date.today()

    q = db.query(PurchaseOrder).filter(
        PurchaseOrder.order_date >= start,
        PurchaseOrder.order_date <= end,
    )
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == supplier_id)

    orders = q.order_by(PurchaseOrder.order_date.desc()).all()
    rows = []
    total_purchases_amount = Decimal("0.0")

    for po in orders:
        total_purchases_amount += po.total_amount
        rows.append({
            "po_id": po.po_id,
            "order_date": po.order_date.strftime("%d/%m/%Y"),
            "supplier_name": po.supplier.name if po.supplier else "Unknown",
            "expected_delivery_date": po.expected_delivery_date.strftime("%d/%m/%Y"),
            "actual_delivery_date": po.actual_delivery_date.strftime("%d/%m/%Y") if po.actual_delivery_date else "-",
            "status": po.status,
            "total_amount": float(po.total_amount),
            "items_count": len(po.items),
        })

    return {
        "report_type": "purchase",
        "start_date": start.strftime("%d/%m/%Y"),
        "end_date": end.strftime("%d/%m/%Y"),
        "total_amount": float(total_purchases_amount),
        "total_orders": len(orders),
        "rows": rows,
    }

def get_wastage_report(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> Dict[str, Any]:
    """FR-55: Wastage report showing quantity and cost value of written-off and expired stock in a period."""
    start = start_date or (date.today() - timedelta(days=90))
    end = end_date or date.today()
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    # Written off adjustments
    adjustments = db.query(StockAdjustment).filter(
        StockAdjustment.adjusted_at >= start_dt,
        StockAdjustment.adjusted_at <= end_dt,
        StockAdjustment.adjustment_type.in_(["Write-Off Expired", "Damage"])
    ).all()

    rows = []
    total_qty = 0
    total_cost = Decimal("0.0")

    for adj in adjustments:
        batch = adj.batch
        med_name = batch.medicine.name if batch and batch.medicine else "Unknown"
        qty = abs(adj.quantity_change)
        cost_per_unit = batch.purchase_price if batch else Decimal("0.0")
        val = cost_per_unit * qty

        total_qty += qty
        total_cost += val

        rows.append({
            "date": adj.adjusted_at.strftime("%d/%m/%Y"),
            "medicine_name": med_name,
            "batch_number": batch.batch_number if batch else "",
            "type": adj.adjustment_type,
            "quantity": qty,
            "cost_value": float(val),
            "reason": adj.reason,
            "pharmacist": adj.user.full_name if adj.user else "",
        })

    return {
        "report_type": "wastage",
        "start_date": start.strftime("%d/%m/%Y"),
        "end_date": end.strftime("%d/%m/%Y"),
        "total_waste_quantity": total_qty,
        "total_waste_value": float(total_cost),
        "rows": rows,
    }

def get_recommendation_report(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> Dict[str, Any]:
    """FR-56: Recommendation report showing number of recommendations by action, decisions taken, and approval rate."""
    start = start_date or (date.today() - timedelta(days=90))
    end = end_date or date.today()
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    recs = db.query(Recommendation).filter(
        Recommendation.generated_at >= start_dt,
        Recommendation.generated_at <= end_dt
    ).order_by(Recommendation.generated_at.desc()).all()

    by_action = {"Reorder": 0, "Hold": 0, "Prioritize FEFO": 0, "Review": 0}
    by_status = {"Pending": 0, "Approved": 0, "Rejected": 0, "Modified": 0, "Superseded": 0}

    rec_rows = []
    for r in recs:
        by_action[r.action] = by_action.get(r.action, 0) + 1
        by_status[r.status] = by_status.get(r.status, 0) + 1
        med_name = r.batch.medicine.name if (r.batch and r.batch.medicine) else "Unknown"
        batch_no = r.batch.batch_number if r.batch else "Unknown"
        rec_rows.append({
            "generated_date": r.generated_at.strftime("%d/%m/%Y"),
            "medicine_name": med_name,
            "batch_number": batch_no,
            "action": r.action,
            "risk_band": r.risk_band,
            "risk_score": r.risk_score,
            "suggested_qty": r.suggested_qty if r.suggested_qty is not None else "—",
            "status": r.status,
        })

    decided = by_status["Approved"] + by_status["Modified"] + by_status["Rejected"]
    approved_total = by_status["Approved"] + by_status["Modified"]
    approval_rate = (approved_total / float(decided) * 100.0) if decided > 0 else 0.0

    return {
        "report_type": "recommendations",
        "start_date": start.strftime("%d/%m/%Y"),
        "end_date": end.strftime("%d/%m/%Y"),
        "total_recommendations": len(recs),
        "by_action": by_action,
        "by_status": by_status,
        "approval_rate": round(approval_rate, 1),
        "rows": rec_rows,
        "summary": {
            "total_recommendations": len(recs),
            "approval_rate": f"{round(approval_rate, 1)}%",
            "approved": by_status.get("Approved", 0),
            "pending": by_status.get("Pending", 0),
        }
    }

def export_report_csv(report_data: Dict[str, Any]) -> str:
    """FR-57: Export any report as CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    
    rep_type = report_data.get("report_type")
    if rep_type == "sales":
        writer.writerow(["PharmaTrack-X Sales Report", f"{report_data['start_date']} to {report_data['end_date']}"])
        writer.writerow(["Total Bills", report_data["total_bills"], "Total Amount (PKR)", report_data["total_amount"]])
        writer.writerow([])
        writer.writerow(["Group / Key", "Count / Bills", "Total Amount (PKR)"])
        for r in report_data.get("rows", []):
            writer.writerow([r.get("group_key"), r.get("quantity", r.get("bills_count", 1)), r.get("total_amount")])
    elif rep_type == "stock_expiry":
        writer.writerow(["PharmaTrack-X Stock & Expiry Report", f"Generated: {report_data['generated_on']}"])
        writer.writerow(["Total Stock Value (PKR)", report_data["total_stock_value"]])
        writer.writerow([])
        writer.writerow(["Medicine", "Batch", "Expiry Date", "Days to Expiry", "Remaining Qty", "Unit Price", "Status"])
        for r in report_data.get("usable_batches", []) + report_data.get("near_expiry_batches", []) + report_data.get("expired_batches", []):
            writer.writerow([r["medicine_name"], r["batch_number"], r["expiry_date"], r["days_to_expiry"], r["qty_remaining"], r["purchase_price"], r["status"]])
    elif rep_type == "purchase":
        writer.writerow(["PharmaTrack-X Purchase Report", f"{report_data['start_date']} to {report_data['end_date']}"])
        writer.writerow(["Total Orders", report_data["total_orders"], "Total Amount (PKR)", report_data["total_amount"]])
        writer.writerow([])
        writer.writerow(["PO #", "Order Date", "Supplier", "Expected Delivery", "Status", "Amount (PKR)"])
        for r in report_data.get("rows", []):
            writer.writerow([r["po_id"], r["order_date"], r["supplier_name"], r["expected_delivery_date"], r["status"], r["total_amount"]])
    elif rep_type == "wastage":
        writer.writerow(["PharmaTrack-X Wastage Report", f"{report_data['start_date']} to {report_data['end_date']}"])
        writer.writerow(["Total Waste Qty", report_data["total_waste_quantity"], "Total Cost (PKR)", report_data["total_waste_value"]])
        writer.writerow([])
        writer.writerow(["Date", "Medicine", "Batch", "Type", "Quantity", "Cost Value (PKR)", "Reason", "Pharmacist"])
        for r in report_data.get("rows", []):
            writer.writerow([r["date"], r["medicine_name"], r["batch_number"], r["type"], r["quantity"], r["cost_value"], r["reason"], r["pharmacist"]])
    elif rep_type == "recommendations":
        writer.writerow(["PharmaTrack-X Recommendation Report", f"{report_data['start_date']} to {report_data['end_date']}"])
        writer.writerow(["Total Generated", report_data["total_recommendations"], "Approval Rate", f"{report_data['approval_rate']}%"])
        writer.writerow([])
        writer.writerow(["Action", "Count"])
        for act, cnt in report_data.get("by_action", {}).items():
            writer.writerow([act, cnt])
        writer.writerow([])
        writer.writerow(["Status", "Count"])
        for st, cnt in report_data.get("by_status", {}).items():
            writer.writerow([st, cnt])

    return output.getvalue()
