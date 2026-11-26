import { useState, useCallback, useEffect } from 'react';
import { medicinesApi, salesApi, customersApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/Spinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { FormField, Input, Select, Btn, ErrorAlert, Textarea } from '../components/FormComponents';
import { Search, Plus, Trash2, FileText, XCircle, ShoppingCart, UserPlus, ShieldAlert, ArrowRight } from 'lucide-react';
import { safeFormatDate } from '../utils/date';
import { Link } from 'react-router-dom';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function NewCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await customersApi.create({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      });
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to register customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Register New Customer" onClose={onClose} size="sm"
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={loading}>{loading ? 'Registering…' : 'Save Customer'}</Btn>
        </>
      }>
      <div className="space-y-3">
        <ErrorAlert message={error} />
        <FormField label="Full Name" required>
          <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Tariq Mehmood" autoFocus />
        </FormField>
        <FormField label="Phone Number" required>
          <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="e.g. 0300-1234567" />
        </FormField>
        <FormField label="Email (Optional)">
          <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="customer@example.com" />
        </FormField>
        <FormField label="Address (Optional)">
          <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="e.g. Street 4, Block B" />
        </FormField>
      </div>
    </Modal>
  );
}

export default function Sales() {
  const { isRole, user } = useAuth();
  const canDispense = isRole('pharmacist', 'clerk');

  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadRecent = useCallback(() => {
    salesApi.list({ limit: 50 }).then(r => setRecentSales(r.data)).catch(() => {});
  }, []);

  const loadCustomers = useCallback(() => {
    customersApi.list().then(r => setCustomers(r.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadRecent();
    if (canDispense) loadCustomers();
  }, [loadRecent, loadCustomers, canDispense]);

  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearchQ(val);
    if (val.trim().length < 2) { setResults([]); return; }
    try {
      const r = await medicinesApi.list({ query: val.trim() });
      setResults(r.data.filter(m => m.is_active));
    } catch { setResults([]); }
  };

  const addToCart = (medicine) => {
    const existing = cart.find(c => c.medicine_id === medicine.medicine_id);
    if (existing) {
      setCart(cart.map(c => c.medicine_id === medicine.medicine_id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      const activeBatches = (medicine.batches ?? []).filter(b => b.status !== 'Expired' && b.qty_remaining > 0);
      setCart([...cart, {
        medicine_id: medicine.medicine_id,
        name: medicine.name,
        dosage_form: medicine.dosage_form,
        strength: medicine.strength,
        requires_prescription: medicine.requires_prescription,
        quantity: 1,
        unit_price: Number(medicine.unit_price),
        batches: activeBatches,
      }]);
    }
    setResults([]);
    setSearchQ('');
  };

  const removeFromCart = (medicine_id) => setCart(cart.filter(c => c.medicine_id !== medicine_id));
  const updateQty = (medicine_id, qty) => setCart(cart.map(c => c.medicine_id === medicine_id ? { ...c, quantity: Math.max(1, +qty) } : c));

  const subtotal = cart.reduce((s, c) => s + c.quantity * c.unit_price, 0);
  const discountAmt = subtotal * (discount / 100);
  const total = subtotal - discountAmt;
  const hasPrescription = cart.some(c => c.requires_prescription);

  const handleDiscountChange = (val) => {
    const num = val === '' ? 0 : Math.max(0, +val);
    setDiscount(num);
    if (num > 10) {
      setError(`Discount of ${num}% exceeds the allowed maximum of 10.0%.`);
    } else if (error && error.includes('Discount')) {
      setError('');
    }
  };

  const handleSell = async () => {
    if (cart.length === 0) return;
    if (discount > 10) {
      setError(`Discount of ${discount}% exceeds the allowed maximum of 10.0%.`);
      return;
    }
    setError(''); setLoading(true);
    try {
      const payload = {
        customer_id: customerId ? +customerId : null,
        discount_percent: discount,
        items: cart.map(c => ({ medicine_id: c.medicine_id, quantity: c.quantity })),
      };
      const r = await salesApi.create(payload);
      setInvoiceModal(r.data);
      setCart([]);
      setCustomerId('');
      setDiscount(0);
      loadRecent();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Sale transaction failed');
    } finally { setLoading(false); }
  };

  const downloadPdf = async (saleId) => {
    setPdfLoading(true);
    try {
      const r = await salesApi.pdf(saleId);
      downloadBlob(r.data, `invoice_${saleId}.pdf`);
    } catch { alert('Failed to download PDF invoice.'); }
    finally { setPdfLoading(false); }
  };

  const doVoid = async () => {
    setVoiding(true);
    try {
      await salesApi.void(voidTarget.sale_id, { reason: voidReason });
      setVoidTarget(null);
      setVoidReason('');
      loadRecent();
    } catch (err) { alert(err.response?.data?.detail ?? 'Failed to void bill'); }
    finally { setVoiding(false); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingCart size={24} className="text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {canDispense ? 'Point of Sale (POS)' : 'Sales & Invoices (Audit View)'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {canDispense
                ? 'Search medicines, verify FEFO batches, and process counter transactions'
                : 'Browse completed sales transactions, cashier audit trails, and tax invoices'}
            </p>
          </div>
        </div>

        {!canDispense && (
          <Link
            to="/medicines"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-fast">
            Go to Medicines Catalog <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Admin Notice Banner */}
      {!canDispense && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Administrator Role: View-Only Access (SRS Table 3.5)</p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              In accordance with pharmacy separation of duties, live counter dispensing and register billing are restricted to licensed <strong>Pharmacists</strong> (<code className="bg-amber-100 px-1 rounded">pharmacist</code>) and <strong>Sales Clerks</strong> (<code className="bg-amber-100 px-1 rounded">clerk</code>). As Administrator, you have full audit access to view transaction histories and download official PDF receipts below.
            </p>
          </div>
        </div>
      )}

      {/* Dispensing Register - Shown only to Pharmacist & Sales Clerk */}
      {canDispense ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          {/* Left: Cart & Search */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Scan Barcode or Search Medicine</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={searchQ} onChange={handleSearch} placeholder="Type medicine name (e.g. 'Amox', 'Panadol') or scan barcode…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              {results.length > 0 && (
                <ul className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white shadow-lg max-h-56 overflow-y-auto z-10 relative">
                  {results.map(m => (
                    <li key={m.medicine_id} onClick={() => addToCart(m)}
                      className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-fast">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900">{m.name}</span>
                          {m.requires_prescription && (
                            <span className="px-1.5 py-0.2 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200">Rx</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {m.generic_name} {m.strength ? `· ${m.strength}` : ''} | Stock: <strong className="text-gray-700">{m.total_stock}</strong> | ₨{m.unit_price}
                        </p>
                      </div>
                      <Btn size="sm" variant="secondary"><Plus size={14} />Add to Cart</Btn>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Rx notification */}
            {hasPrescription && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-900 flex items-center gap-2">
                <span className="font-bold text-base">⚠️ Rx</span> Cart contains prescription-required medicine(s). Verify prescription before dispensing.
              </div>
            )}

            {/* Cart Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 font-medium text-sm text-gray-700 flex justify-between items-center bg-gray-50/50">
                <span className="font-semibold text-gray-800">Dispensing Cart ({cart.length} items)</span>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear Cart</button>
                )}
              </div>
              {cart.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">
                  <ShoppingCart size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="font-medium text-gray-500">Cart is empty</p>
                  <p className="text-xs text-gray-400 mt-1">Search medicines above to add items and calculate bill</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Medicine & FEFO Batches</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Qty</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Unit Price</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Line Total</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(c => {
                      const sortedBatches = (c.batches ?? []).sort((a,b) => {
                        if (a.sell_first !== b.sell_first) return b.sell_first ? 1 : -1;
                        return new Date(a.expiry_date) - new Date(b.expiry_date);
                      });
                      const primaryBatch = sortedBatches[0];
                      return (
                        <tr key={c.medicine_id} className="border-b border-gray-100">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{c.name}</p>
                            {primaryBatch && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                Next Batch: <span className="font-mono">{primaryBatch.batch_number}</span> (Exp: {primaryBatch.expiry_date})
                                {primaryBatch.sell_first && <span className="text-orange-600 font-bold ml-1">★ SELL FIRST</span>}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min={1} value={c.quantity}
                              onChange={e => updateQty(c.medicine_id, e.target.value)}
                              className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm font-semibold" />
                          </td>
                          <td className="px-4 py-3 text-right">₨{c.unit_price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">₨{(c.quantity * c.unit_price).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => removeFromCart(c.medicine_id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right: Summary & Customer */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Selection Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">Customer Profile</h3>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline">
                  <UserPlus size={14} /> + New Customer
                </button>
              </div>

              <FormField label="Assign Customer (Optional)">
                <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Walk-in Customer (General Public)</option>
                  {customers.map(cust => (
                    <option key={cust.customer_id} value={cust.customer_id}>
                      {cust.name} — {cust.phone}
                    </option>
                  ))}
                </Select>
              </FormField>

              {customerId ? (
                <div className="text-xs text-blue-800 bg-blue-50/80 border border-blue-200 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{customers.find(c => c.customer_id === +customerId)?.name}</p>
                    <p className="text-blue-600">{customers.find(c => c.customer_id === +customerId)?.phone}</p>
                  </div>
                  <button type="button" onClick={() => setCustomerId('')} className="text-red-500 hover:text-red-700 text-xs font-medium">
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Walk-in customer selected. If you want this bill tied to a customer account for prescription and purchase history tracking, select or register a customer.
                </p>
              )}
            </div>

            {/* Bill Calculation Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Bill Calculation</h3>
              
              <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-gray-500">Items Subtotal</span>
                <span className="font-semibold text-gray-900">₨{subtotal.toFixed(2)}</span>
              </div>

              <FormField label="Discount % (Max allowed: 10%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={discount}
                  onChange={e => handleDiscountChange(e.target.value)}
                  placeholder="0"
                />
              </FormField>

              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600 py-1">
                  <span>Discount ({discount}%)</span>
                  <span>-₨{discountAmt.toFixed(2)}</span>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3 flex justify-between items-baseline">
                <span className="font-bold text-gray-700">Net Payable Total</span>
                <span className="text-2xl font-black text-blue-600">₨{total.toFixed(2)}</span>
              </div>

              <ErrorAlert message={error} />

              <Btn
                className="w-full justify-center mt-2"
                size="lg"
                onClick={handleSell}
                disabled={cart.length === 0 || loading}>
                {loading ? 'Processing Sale…' : cart.length === 0 ? 'Add Items to Cart to Bill' : `Complete Sale (₨${total.toFixed(2)})`}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sales History Table (Viewable by All Roles including Admin) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Completed Invoices & Audit Trail</h2>
            <p className="text-xs text-gray-500">Real-time ledger of all counter sales and cashier receipts</p>
          </div>
          <span className="text-xs font-semibold text-gray-500 bg-gray-200/70 px-2.5 py-1 rounded-full">
            {recentSales.length} Total Records
          </span>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cashier</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total (PKR)</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date & Time</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {recentSales.map(s => (
              <tr key={s.sale_id} className="border-b border-gray-100 hover:bg-gray-50 transition-fast">
                <td className="px-4 py-3 font-mono font-medium text-xs text-blue-700">{s.invoice_no}</td>
                <td className="px-4 py-3 text-xs text-gray-700 font-medium">{s.cashier_name ?? `#${s.user_id}`}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{s.customer_name ?? 'Walk-in'}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">₨{Number(s.total_amount).toFixed(2)}</td>
                <td className="px-4 py-3"><Badge label={s.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {safeFormatDate(s.sale_datetime, 'dd MMM yyyy HH:mm')}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => downloadPdf(s.sale_id)} disabled={pdfLoading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-fast" title="Download Tax Invoice PDF">
                      <FileText size={14} /> PDF
                    </button>
                    {isRole('pharmacist') && s.status !== 'Voided' && (
                      <button onClick={() => { setVoidTarget(s); setVoidReason(''); }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-fast" title="Void Bill">
                        <XCircle size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {recentSales.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-gray-400">No sales recorded yet</td></tr>}
          </tbody>
        </table>
      </div>

      {/* New Customer Modal */}
      {showNewCustomer && (
        <NewCustomerModal
          onClose={() => setShowNewCustomer(false)}
          onCreated={(newCust) => {
            setShowNewCustomer(false);
            setCustomers(prev => [...prev, newCust]);
            setCustomerId(String(newCust.customer_id));
          }}
        />
      )}

      {/* Invoice Complete Modal */}
      {invoiceModal && (
        <Modal title="Sale Completed Successfully" onClose={() => setInvoiceModal(null)} size="sm"
          footer={
            <>
              <Btn variant="secondary" onClick={() => setInvoiceModal(null)}>Close</Btn>
              <Btn onClick={() => downloadPdf(invoiceModal.sale_id)} disabled={pdfLoading}>
                <FileText size={15} /> Download PDF Invoice
              </Btn>
            </>
          }>
          <div className="text-center space-y-3 py-2">
            <div className="text-5xl">🧾</div>
            <p className="text-2xl font-bold text-gray-900">₨{Number(invoiceModal.total_amount).toFixed(2)}</p>
            <p className="text-sm font-mono text-blue-700 bg-blue-50 py-1 px-3 rounded-lg inline-block">
              {invoiceModal.invoice_no}
            </p>
            <p className="text-xs text-gray-500">
              Allocated batches deducted using FEFO. Transaction permanently audited.
            </p>
          </div>
        </Modal>
      )}

      {/* Void Confirmation Modal */}
      {voidTarget && (
        <Modal title="Void Sale" onClose={() => setVoidTarget(null)} size="sm"
          footer={
            <>
              <Btn variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={doVoid} disabled={voiding || !voidReason.trim()}>
                {voiding ? 'Voiding…' : 'Confirm Void'}
              </Btn>
            </>
          }>
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Are you sure you want to void invoice <strong className="font-mono">{voidTarget.invoice_no}</strong>?
              All deducted stock quantities will be restored to their original batches.
            </p>
            <FormField label="Mandatory Reason for Void" required>
              <Textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Customer returned items, wrong medicine entered…" />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
