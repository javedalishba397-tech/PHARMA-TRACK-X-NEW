from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal

# --- AUTH & USER ---
class UserLogin(BaseModel):
    username: str
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str  # Administrator, Pharmacist, Sales Clerk
    email: Optional[EmailStr] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None

class UserOut(BaseModel):
    user_id: int
    full_name: str
    username: str
    role: str
    email: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# --- MEDICINES & BATCHES ---
class MedicineCreate(BaseModel):
    name: str = Field(..., min_length=1)
    generic_name: str = Field(..., min_length=1)
    category: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    manufacturer: Optional[str] = None
    barcode: Optional[str] = None
    unit_price: Decimal = Field(..., gt=0)
    reorder_level: int = Field(..., ge=0)
    requires_prescription: bool = False

    @field_validator("name", "generic_name")
    @classmethod
    def validate_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty or blank")
        return v.strip()

class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    category: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    manufacturer: Optional[str] = None
    barcode: Optional[str] = None
    unit_price: Optional[Decimal] = None
    reorder_level: Optional[int] = None
    requires_prescription: Optional[bool] = None
    is_active: Optional[bool] = None

class BatchOut(BaseModel):
    batch_id: int
    medicine_id: int
    po_item_id: Optional[int] = None
    batch_number: str
    expiry_date: date
    received_date: date
    qty_received: int
    qty_remaining: int
    purchase_price: Decimal
    status: str
    sell_first: bool
    days_to_expiry: int = 0

    class Config:
        from_attributes = True

class MedicineOut(BaseModel):
    medicine_id: int
    name: str
    generic_name: str
    category: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    manufacturer: Optional[str] = None
    barcode: Optional[str] = None
    unit_price: Decimal
    reorder_level: int
    requires_prescription: bool
    is_active: bool
    total_stock: int = 0
    batches: List[BatchOut] = []

    class Config:
        from_attributes = True

class BatchCreate(BaseModel):
    medicine_id: int
    batch_number: str
    expiry_date: date
    qty_received: int = Field(..., gt=0)
    purchase_price: Decimal = Field(..., ge=0)
    received_date: Optional[date] = None

# --- SUPPLIERS ---
class SupplierCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    stated_lead_time_days: int = Field(..., gt=0)

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    stated_lead_time_days: Optional[int] = None
    is_active: Optional[bool] = None

class SupplierOut(BaseModel):
    supplier_id: int
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    stated_lead_time_days: int
    observed_lead_time_days: Optional[Decimal] = None
    effective_lead_time_days: float = 7.0
    is_active: bool

    class Config:
        from_attributes = True

# --- PURCHASE ORDERS ---
class POItemCreate(BaseModel):
    medicine_id: int = Field(..., gt=0)
    qty_ordered: int = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)

class POCreate(BaseModel):
    supplier_id: int = Field(..., gt=0)
    items: List[POItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = None

class POItemOut(BaseModel):
    po_item_id: int
    po_id: int
    medicine_id: int
    medicine_name: Optional[str] = None
    qty_ordered: int
    qty_received: int
    unit_cost: Decimal

    class Config:
        from_attributes = True

class POOut(BaseModel):
    po_id: int
    supplier_id: int
    supplier_name: Optional[str] = None
    created_by: int
    creator_name: Optional[str] = None
    order_date: date
    expected_delivery_date: date
    actual_delivery_date: Optional[date] = None
    status: str
    total_amount: Decimal
    cancel_reason: Optional[str] = None
    notes: Optional[str] = None
    is_overdue: bool = False
    items: List[POItemOut] = []

    class Config:
        from_attributes = True

class POReceiptLine(BaseModel):
    po_item_id: int
    qty_received: int = Field(..., gt=0)
    batch_number: str
    expiry_date: date
    purchase_price: Optional[Decimal] = None

class POReceipt(BaseModel):
    actual_delivery_date: Optional[date] = None
    lines: List[POReceiptLine]

class POCancel(BaseModel):
    reason: str

# --- CUSTOMERS ---
class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    address: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None

class CustomerOut(BaseModel):
    customer_id: int
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- SALES & BILLING ---
class SaleItemInput(BaseModel):
    medicine_id: int
    quantity: int = Field(..., gt=0)

class SaleCreate(BaseModel):
    customer_id: Optional[int] = None
    discount_percent: Decimal = Field(default=Decimal("0.0"), ge=0)
    items: List[SaleItemInput]

class SaleItemOut(BaseModel):
    sale_item_id: int
    batch_id: int
    batch_number: Optional[str] = None
    medicine_name: Optional[str] = None
    expiry_date: Optional[date] = None
    quantity: int
    unit_price: Decimal
    line_total: Decimal

    class Config:
        from_attributes = True

class SaleOut(BaseModel):
    sale_id: int
    invoice_no: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    user_id: int
    cashier_name: Optional[str] = None
    sale_datetime: datetime
    subtotal: Decimal
    discount_percent: Decimal
    total_amount: Decimal
    status: str
    void_reason: Optional[str] = None
    items: List[SaleItemOut] = []

    class Config:
        from_attributes = True

class SaleVoid(BaseModel):
    reason: str

# --- STOCK & ALERTS ---
class StockAdjustmentCreate(BaseModel):
    batch_id: int
    adjustment_type: str  # Write-Off Expired, Damage, Correction
    quantity_change: int
    reason: str

class StockAdjustmentOut(BaseModel):
    adjustment_id: int
    batch_id: int
    batch_number: Optional[str] = None
    medicine_name: Optional[str] = None
    user_id: int
    user_name: Optional[str] = None
    adjustment_type: str
    quantity_change: int
    reason: str
    adjusted_at: datetime

    class Config:
        from_attributes = True

# --- RECOMMENDATIONS & DECISION LOGS ---
class RecommendationOut(BaseModel):
    recommendation_id: int
    batch_id: int
    batch_number: str
    medicine_id: int
    medicine_name: str
    stock: int
    days_to_expiry: int
    expected_demand: float
    lower_bound: float
    upper_bound: float
    confidence_level: str
    lead_time_days_used: float
    risk_score: int
    risk_band: str
    action: str
    suggested_qty: Optional[int] = None
    explanation: str
    status: str
    generated_at: datetime

class RecommendationDecision(BaseModel):
    decision: str  # Approved, Rejected, Modified
    final_action: Optional[str] = None
    final_qty: Optional[int] = None
    comment: Optional[str] = None

class DecisionLogOut(BaseModel):
    decision_id: int
    recommendation_id: int
    user_id: int
    user_name: Optional[str] = None
    medicine_name: Optional[str] = None
    batch_number: Optional[str] = None
    decision: str
    final_action: str
    final_qty: Optional[int] = None
    comment: Optional[str] = None
    decided_at: datetime

    class Config:
        from_attributes = True

# --- SETTINGS & AUDIT ---
class SettingUpdate(BaseModel):
    setting_key: str
    setting_value: str

class SettingOut(BaseModel):
    setting_key: str
    setting_value: str
    description: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AuditLogOut(BaseModel):
    log_id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    entity: Optional[str] = None
    entity_id: Optional[str] = None
    result: str
    ip_address: Optional[str] = None
    logged_at: datetime

    class Config:
        from_attributes = True

# --- DASHBOARD ---
class DashboardMetrics(BaseModel):
    low_stock_count: int
    near_expiry_count: int
    expired_count: int
    pending_recommendations_count: int
    today_sales_total: Decimal
    today_bills_count: int
