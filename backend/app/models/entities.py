from sqlalchemy import (
    Column, Integer, BigInteger, String, Boolean, DateTime, Date, Numeric, Text, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(100), nullable=False)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # Administrator, Pharmacist, Sales Clerk
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    purchase_orders = relationship("PurchaseOrder", back_populates="creator")
    sales = relationship("Sale", foreign_keys="Sale.user_id", back_populates="user")
    stock_adjustments = relationship("StockAdjustment", back_populates="user")
    decision_logs = relationship("DecisionLog", back_populates="user")
    sessions = relationship("ActiveSession", back_populates="user", cascade="all, delete-orphan")


class Medicine(Base):
    __tablename__ = "medicines"

    medicine_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, index=True)
    generic_name = Column(String(100), nullable=False, index=True)
    category = Column(String(50), nullable=True, index=True)
    dosage_form = Column(String(30), nullable=True)
    strength = Column(String(30), nullable=True)
    manufacturer = Column(String(100), nullable=True)
    barcode = Column(String(30), unique=True, nullable=True, index=True)
    unit_price = Column(Numeric(10, 2), nullable=False, default=0.0)
    reorder_level = Column(Integer, nullable=False, default=10)
    requires_prescription = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("name", "strength", "dosage_form", "manufacturer", name="uq_medicine_spec"),
    )

    batches = relationship("Batch", back_populates="medicine")
    demand_forecasts = relationship("DemandForecast", back_populates="medicine")
    po_items = relationship("PurchaseOrderItem", back_populates="medicine")


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, index=True)
    contact_person = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    address = Column(String(200), nullable=True)
    stated_lead_time_days = Column(Integer, nullable=False, default=7)
    observed_lead_time_days = Column(Numeric(5, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")


class Batch(Base):
    __tablename__ = "batches"

    batch_id = Column(Integer, primary_key=True, autoincrement=True)
    medicine_id = Column(Integer, ForeignKey("medicines.medicine_id"), nullable=False, index=True)
    po_item_id = Column(Integer, ForeignKey("purchase_order_items.po_item_id"), nullable=True)
    batch_number = Column(String(50), nullable=False)
    expiry_date = Column(Date, nullable=False, index=True)
    received_date = Column(Date, nullable=False)
    qty_received = Column(Integer, nullable=False)
    qty_remaining = Column(Integer, nullable=False)
    purchase_price = Column(Numeric(10, 2), nullable=False, default=0.0)
    status = Column(String(15), nullable=False, default="Active")  # Active, Near-Expiry, Expired, Depleted, Written-Off
    sell_first = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("medicine_id", "batch_number", name="uq_medicine_batch"),
    )

    medicine = relationship("Medicine", back_populates="batches")
    po_item = relationship("PurchaseOrderItem", back_populates="batch")
    sale_items = relationship("SaleItem", back_populates="batch")
    stock_adjustments = relationship("StockAdjustment", back_populates="batch")
    recommendations = relationship("Recommendation", back_populates="batch")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    order_date = Column(Date, nullable=False)
    expected_delivery_date = Column(Date, nullable=False)
    actual_delivery_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="Draft")  # Draft, Pending, Partially Received, Received, Cancelled
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.0)
    cancel_reason = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)

    supplier = relationship("Supplier", back_populates="purchase_orders")
    creator = relationship("User", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    po_item_id = Column(Integer, primary_key=True, autoincrement=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.po_id"), nullable=False, index=True)
    medicine_id = Column(Integer, ForeignKey("medicines.medicine_id"), nullable=False, index=True)
    qty_ordered = Column(Integer, nullable=False)
    qty_received = Column(Integer, default=0, nullable=False)
    unit_cost = Column(Numeric(10, 2), nullable=False, default=0.0)

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    medicine = relationship("Medicine", back_populates="po_items")
    batch = relationship("Batch", back_populates="po_item", uselist=False)


class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False, index=True)
    email = Column(String(100), nullable=True)
    address = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    sales = relationship("Sale", back_populates="customer")


class Sale(Base):
    __tablename__ = "sales"

    sale_id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_no = Column(String(20), unique=True, nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    sale_datetime = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0.0)
    discount_percent = Column(Numeric(5, 2), nullable=False, default=0.0)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.0)
    status = Column(String(10), nullable=False, default="Completed")  # Completed, Voided
    void_reason = Column(String(200), nullable=True)
    voided_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    voided_at = Column(DateTime, nullable=True)

    customer = relationship("Customer", back_populates="sales")
    user = relationship("User", foreign_keys=[user_id], back_populates="sales")
    voided_by_user = relationship("User", foreign_keys=[voided_by])
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"

    sale_item_id = Column(Integer, primary_key=True, autoincrement=True)
    sale_id = Column(Integer, ForeignKey("sales.sale_id"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("batches.batch_id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    sale = relationship("Sale", back_populates="items")
    batch = relationship("Batch", back_populates="sale_items")


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    adjustment_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batches.batch_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    adjustment_type = Column(String(20), nullable=False)  # Write-Off Expired, Damage, Correction
    quantity_change = Column(Integer, nullable=False)  # negative for decrease, positive for increase
    reason = Column(String(200), nullable=False)
    adjusted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    batch = relationship("Batch", back_populates="stock_adjustments")
    user = relationship("User", back_populates="stock_adjustments")


class DemandForecast(Base):
    __tablename__ = "demand_forecasts"

    forecast_id = Column(Integer, primary_key=True, autoincrement=True)
    medicine_id = Column(Integer, ForeignKey("medicines.medicine_id"), nullable=False, index=True)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    horizon_days = Column(Integer, nullable=False, default=30)
    expected_demand = Column(Numeric(10, 2), nullable=False)
    lower_bound = Column(Numeric(10, 2), nullable=False)
    upper_bound = Column(Numeric(10, 2), nullable=False)
    confidence_pct = Column(Integer, default=80, nullable=False)
    confidence_level = Column(String(6), nullable=False)  # High, Medium, Low
    history_days = Column(Integer, nullable=False, default=0)
    daily_cv = Column(Numeric(6, 3), nullable=False, default=0.0)
    model_name = Column(String(50), nullable=False)

    medicine = relationship("Medicine", back_populates="demand_forecasts")
    recommendations = relationship("Recommendation", back_populates="forecast")


class Recommendation(Base):
    __tablename__ = "recommendations"

    recommendation_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batches.batch_id"), nullable=False, index=True)
    forecast_id = Column(Integer, ForeignKey("demand_forecasts.forecast_id"), nullable=False, index=True)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    lead_time_days_used = Column(Numeric(5, 2), nullable=False)
    risk_score = Column(Integer, nullable=False)  # 0 to 100
    risk_band = Column(String(6), nullable=False)  # Low, Medium, High
    action = Column(String(20), nullable=False)  # Reorder, Hold, Prioritize FEFO, Review
    suggested_qty = Column(Integer, nullable=True)
    explanation = Column(Text, nullable=False)
    status = Column(String(12), nullable=False, default="Pending")  # Pending, Approved, Rejected, Superseded

    batch = relationship("Batch", back_populates="recommendations")
    forecast = relationship("DemandForecast", back_populates="recommendations")
    decision_logs = relationship("DecisionLog", back_populates="recommendation")


class DecisionLog(Base):
    __tablename__ = "decision_logs"

    decision_id = Column(Integer, primary_key=True, autoincrement=True)
    recommendation_id = Column(Integer, ForeignKey("recommendations.recommendation_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    decision = Column(String(10), nullable=False)  # Approved, Rejected, Modified
    final_action = Column(String(20), nullable=False)
    final_qty = Column(Integer, nullable=True)
    comment = Column(String(255), nullable=True)
    decided_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    recommendation = relationship("Recommendation", back_populates="decision_logs")
    user = relationship("User", back_populates="decision_logs")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    setting_key = Column(String(50), primary_key=True)
    setting_value = Column(String(100), nullable=False)
    description = Column(String(200), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)  # LOGIN, VOID_BILL, WRITE_OFF, ADJUST_STOCK, etc.
    entity = Column(String(100), nullable=True)
    entity_id = Column(String(100), nullable=True)
    result = Column(String(20), nullable=False)  # Success, Failure
    ip_address = Column(String(45), nullable=True)
    logged_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User")


class ActiveSession(Base):
    __tablename__ = "active_sessions"

    session_id = Column(String(64), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)

    user = relationship("User", back_populates="sessions")
