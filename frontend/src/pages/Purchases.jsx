import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { suppliersApi, purchasesApi, medicinesApi } from '../api/client';
import { PageLoader } from '../components/Spinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { FormField, Input, Select, Btn, ErrorAlert, Textarea } from '../components/FormComponents';
import { Plus, Truck, FileText, Trash2, XCircle } from 'lucide-react';
import { safeFormatDate } from '../utils/date';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Supplier Modal ────────────────────────────────────────────────────────────
function SupplierModal({ existing, onClose, onSaved }) {
  const [form, setForm] = useState({ name: existing?.name ?? '', contact_person: existing?.contact_person ?? '', phone: existing?.phone ?? '', email: existing?.email ?? '', stated_lead_time_days: existing?.stated_lead_time_days ?? 7 });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const save = async () => {
    setError(''); setLoading(true);
    try { if (existing) await suppliersApi.update(existing.supplier_id, form); else await suppliersApi.create(form); onSaved(); }
    catch (err) { setError(err.response?.data?.detail ?? 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Modal title={existing ? 'Edit Supplier' : 'Add Supplier'} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Save'}</Btn></>}>
      <div className="space-y-4"><ErrorAlert message={error} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name" required><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></FormField>
          <FormField label="Contact Person"><Input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} /></FormField>
          <FormField label="Phone"><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></FormField>
          <FormField label="Email"><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></FormField>
          <FormField label="Stated Lead Time (days)"><Input type="number" min={1} value={form.stated_lead_time_days} onChange={e => setForm({...form, stated_lead_time_days: +e.target.value})} /></FormField>
        </div>
      </div>
    </Modal>
  );
}

// ── Create PO Modal ───────────────────────────────────────────────────────────
function CreatePOModal({ suppliers, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState('');
  const [medicines, setMedicines] = useState([]);
  const [lines, setLines] = useState([{ medicine_id: '', quantity: '', unit_cost: '' }]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);

  useEffect(() => { medicinesApi.list().then(r => setMedicines(r.data.filter(m => m.is_active))); }, []);

  const addLine = () => setLines([...lines, { medicine_id: '', quantity: '', unit_cost: '' }]);
  const updateLine = (i, f, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, [f]: v } : l));
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!supplierId) {
      setError('Please select a supplier.');
      return;
    }
    const validLines = lines.filter(l => l.medicine_id && +l.quantity > 0 && +l.unit_cost >= 0);
    if (validLines.length === 0) {
      setError('Please select a medicine and enter a valid quantity and unit cost.');
      return;
    }
    setError(''); setLoading(true);
    try {
      await purchasesApi.create({
        supplier_id: +supplierId,
        items: validLines.map(l => ({ medicine_id: +l.medicine_id, qty_ordered: +l.quantity, unit_cost: +l.unit_cost }))
      });
      onSaved();
    } catch (err) { setError(err.response?.data?.detail ?? err.message ?? 'Failed to create purchase order'); } finally { setLoading(false); }
  };

  return (
    <Modal title="Create Purchase Order" onClose={onClose} size="lg"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={loading}>{loading ? 'Creating…' : 'Create PO'}</Btn></>}>
      <div className="space-y-4"><ErrorAlert message={error} />
        <FormField label="Supplier" required>
          <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Select supplier…</option>
            {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}
          </Select>
        </FormField>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Line Items</span>
            <Btn size="sm" onClick={addLine}><Plus size={14} />Add Item</Btn>
          </div>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-7 gap-2 mb-2 items-end">
              <div className="col-span-3">
                <Select value={line.medicine_id} onChange={e => updateLine(i, 'medicine_id', e.target.value)}>
                  <option value="">Medicine…</option>
                  {medicines.map(m => <option key={m.medicine_id} value={m.medicine_id}>{m.name}</option>)}
                </Select>
              </div>
              <div className="col-span-2"><Input type="number" placeholder="Qty" min={1} value={line.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} /></div>
              <div className="col-span-1"><Input type="number" placeholder="Unit Cost" min={0} step="0.01" value={line.unit_cost} onChange={e => updateLine(i, 'unit_cost', e.target.value)} /></div>
              <div className="col-span-1"><button onClick={() => removeLine(i)} className="p-2 text-red-400 hover:bg-red-50 rounded"><Trash2 size={15} /></button></div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Receive PO Modal ──────────────────────────────────────────────────────────
function ReceivePOModal({ po, onClose, onSaved }) {
  const [items, setItems] = useState(po.items?.map(item => ({
    ...item,
    batch_number: '',
    expiry_date: '',
    qty_received: item.qty_ordered,
  })) ?? []);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const updateItem = (i, f, v) => setItems(items.map((it, idx) => idx === i ? { ...it, [f]: v } : it));

  const save = async () => {
    setError(''); setLoading(true);
    try {
      await purchasesApi.receive(po.po_id, {
        lines: items.map(it => ({
          po_item_id: it.po_item_id,
          batch_number: it.batch_number,
          expiry_date: it.expiry_date,
          qty_received: +it.qty_received,
          purchase_price: +it.unit_cost,
        }))
      });
      onSaved();
    } catch (err) { setError(err.response?.data?.detail ?? 'Failed'); } finally { setLoading(false); }
  };

  return (
    <Modal title={`Receive Goods — PO #${po.po_id}`} onClose={onClose} size="lg"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="success" onClick={save} disabled={loading}>{loading ? 'Processing…' : 'Mark Received'}</Btn></>}>
      <div className="space-y-4"><ErrorAlert message={error} />
        {items.map((item, i) => (
          <div key={i} className="p-3 border border-gray-200 rounded-lg">
            <p className="text-sm font-medium text-gray-800 mb-2">{item.medicine_name ?? `Item #${i + 1}`} (Ordered: {item.qty_ordered})</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Batch Number" required><Input value={item.batch_number} onChange={e => updateItem(i, 'batch_number', e.target.value)} placeholder="e.g. B-9901" /></FormField>
              <FormField label="Expiry Date" required><Input type="date" value={item.expiry_date} onChange={e => updateItem(i, 'expiry_date', e.target.value)} /></FormField>
              <FormField label="Qty Received" required><Input type="number" min={1} value={item.qty_received} onChange={e => updateItem(i, 'qty_received', e.target.value)} /></FormField>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Purchases() {
  const { isRole } = useAuth();
  const canManage = isRole('pharmacist');
  const [tab, setTab] = useState('pos');
  const [suppliers, setSuppliers] = useState([]);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addSupplier, setAddSupplier] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [createPO, setCreatePO] = useState(false);
  const [receivePO, setReceivePO] = useState(null);
  const [cancelPO, setCancelPO] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([suppliersApi.list(), purchasesApi.list()])
      .then(([s, p]) => {
        setSuppliers(Array.isArray(s.data) ? s.data : []);
        setPos(Array.isArray(p.data) ? p.data : []);
      })
      .catch((err) => {
        console.error('Failed to load purchases/suppliers:', err);
        setSuppliers([]);
        setPos([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const doCancel = async () => {
    setCancelling(true);
    try { await purchasesApi.cancel(cancelPO.po_id, { reason: cancelReason }); setCancelPO(null); load(); }
    catch (err) { alert(err.response?.data?.detail ?? 'Failed'); } finally { setCancelling(false); }
  };

  const downloadPdf = async (poId) => {
    setPdfLoading(true);
    try { const r = await purchasesApi.pdf(poId); downloadBlob(r.data, `po_${poId}.pdf`); }
    finally { setPdfLoading(false); }
  };

  const tabs = [{ id: 'pos', label: 'Purchase Orders' }, { id: 'suppliers', label: 'Suppliers' }];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6"><Truck size={22} className="text-blue-600" /><h1 className="text-2xl font-bold text-gray-900">Purchases</h1></div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-fast ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : tab === 'suppliers' ? (
        <>
          {canManage && (
            <div className="flex justify-end mb-4">
              <Btn onClick={() => setAddSupplier(true)}><Plus size={16} />Add Supplier</Btn>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['Name','Contact','Phone','Stated Lead','Observed Lead','Status'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>)}
                  {canManage && <th className="px-4 py-3"></th>}</tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.supplier_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.contact_person ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3">{s.stated_lead_time_days}d</td>
                    <td className="px-4 py-3">{s.observed_lead_time_days != null ? `${s.observed_lead_time_days}d` : '—'}</td>
                    <td className="px-4 py-3"><Badge label={s.is_active ? 'Active' : 'Inactive'} /></td>
                    {canManage && (
                      <td className="px-4 py-3"><button onClick={() => setEditSupplier(s)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Truck size={15} /></button></td>
                    )}
                  </tr>
                ))}
                {suppliers.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="py-8 text-center text-gray-400">No suppliers yet</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {canManage && (
            <div className="flex justify-end mb-4">
              <Btn onClick={() => setCreatePO(true)}><Plus size={16} />Create PO</Btn>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['PO #','Supplier','Order Date','Expected','Items','Status'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>)}
                  <th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {pos.map(p => (
                  <tr key={p.po_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{p.po_id}</td>
                    <td className="px-4 py-3">{p.supplier_name ?? p.supplier_id}</td>
                    <td className="px-4 py-3 text-xs">{safeFormatDate(p.order_date)}</td>
                    <td className="px-4 py-3 text-xs">{safeFormatDate(p.expected_delivery_date)}</td>
                    <td className="px-4 py-3">{p.items?.length ?? 0}</td>
                    <td className="px-4 py-3"><Badge label={p.is_overdue ? 'Overdue' : p.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => downloadPdf(p.po_id)} disabled={pdfLoading} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Download PDF"><FileText size={15} /></button>
                        {canManage && p.status === 'Ordered' && <button onClick={() => setReceivePO(p)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Receive Goods"><Plus size={15} /></button>}
                        {canManage && ['Draft','Ordered'].includes(p.status) && <button onClick={() => { setCancelPO(p); setCancelReason(''); }} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" title="Cancel PO"><XCircle size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {pos.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">No purchase orders yet</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {addSupplier && <SupplierModal onClose={() => setAddSupplier(false)} onSaved={() => { setAddSupplier(false); load(); }} />}
      {editSupplier && <SupplierModal existing={editSupplier} onClose={() => setEditSupplier(null)} onSaved={() => { setEditSupplier(null); load(); }} />}
      {createPO && <CreatePOModal suppliers={suppliers} onClose={() => setCreatePO(false)} onSaved={() => { setCreatePO(false); load(); }} />}
      {receivePO && <ReceivePOModal po={receivePO} onClose={() => setReceivePO(null)} onSaved={() => { setReceivePO(null); load(); }} />}
      {cancelPO && (
        <Modal title="Cancel Purchase Order" onClose={() => setCancelPO(null)} size="sm"
          footer={<><Btn variant="secondary" onClick={() => setCancelPO(null)}>Back</Btn><Btn variant="danger" onClick={doCancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel PO'}</Btn></>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Cancel PO #{cancelPO.po_id}?</p>
            <FormField label="Reason" required><Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation…" /></FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
