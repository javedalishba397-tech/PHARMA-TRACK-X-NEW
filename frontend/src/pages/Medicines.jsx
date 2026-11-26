import { useEffect, useState, useCallback } from 'react';
import { medicinesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/Spinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { FormField, Input, Select, Btn, ErrorAlert } from '../components/FormComponents';
import { Search, Plus, ChevronDown, ChevronRight, Pill, Edit, XCircle } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';

// ── Expiry chip helper ────────────────────────────────────────────────────────
function ExpiryChip({ expiry }) {
  if (!expiry) return <span className="text-xs text-gray-400">—</span>;
  try {
    const days = differenceInDays(parseISO(expiry), new Date());
    if (isNaN(days)) return <span className="text-xs text-gray-400">—</span>;
    if (days < 0)   return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Expired</span>;
    if (days <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">{days}d left</span>;
    if (days <= 90) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">{days}d left</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">{days}d left</span>;
  } catch {
    return <span className="text-xs text-gray-400">—</span>;
  }
}

// ── Add Medicine Modal ────────────────────────────────────────────────────────
function MedicineModal({ onClose, onSaved, existing }) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    generic_name: existing?.generic_name ?? '',
    category: existing?.category ?? '',
    dosage_form: existing?.dosage_form ?? 'Tablet',
    strength: existing?.strength ?? '',
    manufacturer: existing?.manufacturer ?? '',
    barcode: existing?.barcode ?? '',
    unit_price: existing?.unit_price ?? '',
    reorder_level: existing?.reorder_level ?? 50,
    requires_prescription: existing?.requires_prescription ?? false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!form.name.trim()) {
      setError('Medicine Name is required and cannot be blank.');
      return;
    }
    if (!form.generic_name.trim()) {
      setError('Generic Name is required and cannot be blank.');
      return;
    }
    if (form.unit_price === '' || isNaN(+form.unit_price) || +form.unit_price <= 0) {
      setError('Retail Unit Price must be greater than zero.');
      return;
    }
    setError(''); setLoading(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        generic_name: form.generic_name.trim(),
        unit_price: +form.unit_price,
        reorder_level: +form.reorder_level,
      };
      if (existing) await medicinesApi.update(existing.medicine_id, payload);
      else await medicinesApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Save failed');
    } finally { setLoading(false); }
  };

  return (
    <Modal title={existing ? 'Edit Medicine' : 'Add Medicine'} onClose={onClose} size="md"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Save'}</Btn></>}>
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Medicine Name" required><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></FormField>
          <FormField label="Generic Name" required><Input value={form.generic_name} onChange={e => setForm({...form, generic_name: e.target.value})} /></FormField>
          <FormField label="Category"><Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="e.g. Antibiotic" /></FormField>
          <FormField label="Dosage Form">
            <Select value={form.dosage_form} onChange={e => setForm({...form, dosage_form: e.target.value})}>
              {['Tablet','Capsule','Syrup','Injection','Cream','Drops','Sachet','Inhaler','Suspension'].map(u => <option key={u}>{u}</option>)}
            </Select>
          </FormField>
          <FormField label="Strength"><Input value={form.strength} onChange={e => setForm({...form, strength: e.target.value})} placeholder="e.g. 500 mg" /></FormField>
          <FormField label="Manufacturer"><Input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} /></FormField>
          <FormField label="Barcode"><Input value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} /></FormField>
          <FormField label="Retail Unit Price (PKR)" required><Input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})} /></FormField>
          <FormField label="Reorder Level" required><Input type="number" min={0} value={form.reorder_level} onChange={e => setForm({...form, reorder_level: e.target.value})} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.requires_prescription} onChange={e => setForm({...form, requires_prescription: e.target.checked})} className="rounded text-blue-600" />
          Requires Prescription (Rx)
        </label>
      </div>
    </Modal>
  );
}

// ── Add Batch Modal ───────────────────────────────────────────────────────────
function BatchModal({ medicine, onClose, onSaved }) {
  const [form, setForm] = useState({
    batch_number: '',
    expiry_date: '',
    qty_received: '',
    purchase_price: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setError(''); setLoading(true);
    try {
      await medicinesApi.createBatch({
        medicine_id: medicine.medicine_id,
        batch_number: form.batch_number,
        expiry_date: form.expiry_date,
        qty_received: +form.qty_received,
        purchase_price: +form.purchase_price,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to add batch');
    } finally { setLoading(false); }
  };

  return (
    <Modal title={`Add Batch — ${medicine.name}`} onClose={onClose} size="md"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={loading}>{loading ? 'Adding…' : 'Add Batch'}</Btn></>}>
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Batch Number" required><Input value={form.batch_number} onChange={e => setForm({...form, batch_number: e.target.value})} placeholder="e.g. B-1002" /></FormField>
          <FormField label="Expiry Date" required><Input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} /></FormField>
          <FormField label="Quantity Received" required><Input type="number" min={1} value={form.qty_received} onChange={e => setForm({...form, qty_received: e.target.value})} /></FormField>
          <FormField label="Purchase Price (PKR)" required><Input type="number" min={0} step="0.01" value={form.purchase_price} onChange={e => setForm({...form, purchase_price: e.target.value})} /></FormField>
        </div>
      </div>
    </Modal>
  );
}

// ── Batch Drawer ──────────────────────────────────────────────────────────────
function BatchDrawer({ medicine, onBatchAdded }) {
  const [addBatch, setAddBatch] = useState(false);
  const { isRole } = useAuth();
  const canEdit = isRole('pharmacist');
  const batches = medicine.batches ?? [];

  return (
    <div className="bg-gray-50 border-t border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Batches (FEFO Order: Sell First then Earliest Expiry)</span>
        {canEdit && (
          <Btn size="sm" onClick={() => setAddBatch(true)}><Plus size={14} />Add Batch</Btn>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="text-left pb-1">Batch #</th>
              <th className="text-left pb-1">Expiry Date</th>
              <th className="text-right pb-1">Remaining</th>
              <th className="text-right pb-1">Received</th>
              <th className="text-right pb-1">Cost (PKR)</th>
              <th className="text-left pb-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.batch_id} className="border-b border-gray-100">
                <td className="py-2 font-mono font-medium">
                  {b.batch_number}
                  {b.sell_first && <span className="text-orange-600 font-bold ml-1.5">★ SELL FIRST</span>}
                </td>
                <td className="py-2">
                  <span className="mr-2">{b.expiry_date}</span>
                  <ExpiryChip expiry={b.expiry_date} />
                </td>
                <td className="py-2 text-right font-bold">{b.qty_remaining}</td>
                <td className="py-2 text-right text-gray-400">{b.qty_received}</td>
                <td className="py-2 text-right">₨{b.purchase_price}</td>
                <td className="py-2"><Badge label={b.status} /></td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">No batches in stock</td></tr>}
          </tbody>
        </table>
      </div>
      {addBatch && (
        <BatchModal
          medicine={medicine}
          onClose={() => setAddBatch(false)}
          onSaved={() => { setAddBatch(false); onBatchAdded(); }}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Medicines() {
  const { isRole } = useAuth();
  const canEdit = isRole('pharmacist');
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback((q = '') => {
    setLoading(true);
    medicinesApi.list(q ? { query: q } : {})
      .then(r => setMedicines(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e) => {
    setQuery(e.target.value);
    clearTimeout(window._mSearch);
    window._mSearch = setTimeout(() => load(e.target.value), 350);
  };

  const doDeactivate = async () => {
    setDeactivating(true);
    try { await medicinesApi.deactivate(deactivateTarget.medicine_id); setDeactivateTarget(null); load(query); }
    catch (err) { alert(err.response?.data?.detail ?? 'Failed'); }
    finally { setDeactivating(false); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Pill size={22} className="text-blue-600" /> Medicines</h1>
          <p className="text-sm text-gray-500 mt-1">
            {canEdit ? 'Manage medicine catalog and batch inventory' : 'View medicine catalog, retail prices, and batch stock levels (Read-Only)'}
          </p>
        </div>
        {canEdit && (
          <Btn onClick={() => setAddModal(true)}><Plus size={16} />Add Medicine</Btn>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={handleSearch} placeholder="Search by name, generic, barcode, or category…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </div>

      {loading ? <PageLoader /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Medicine</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Price</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Stock</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reorder</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                {canEdit && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {medicines.map(m => (
                <div key={m.medicine_id} style={{ display: 'contents' }}>
                  <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === m.medicine_id ? null : m.medicine_id)}>
                    <td className="px-4 py-3 text-gray-400">
                      {expanded === m.medicine_id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{m.name}</span>
                        {m.requires_prescription && (
                          <span className="px-1.5 py-0.2 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200">Rx</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{m.generic_name} {m.strength ? `· ${m.strength}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{m.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">₨{m.unit_price}</td>
                    <td className={`px-4 py-3 text-right font-bold ${(m.total_stock ?? 0) <= m.reorder_level ? 'text-red-600' : 'text-gray-900'}`}>
                      {m.total_stock ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{m.reorder_level}</td>
                    <td className="px-4 py-3"><Badge label={m.is_active ? 'Active' : 'Inactive'} /></td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditModal(m)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-fast" title="Edit"><Edit size={15} /></button>
                          {m.is_active && <button onClick={() => setDeactivateTarget(m)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-fast" title="Deactivate"><XCircle size={15} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                  {expanded === m.medicine_id && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={canEdit ? 8 : 7} className="p-0">
                        <BatchDrawer medicine={m} onBatchAdded={() => load(query)} />
                      </td>
                    </tr>
                  )}
                </div>
              ))}
              {medicines.length === 0 && (
                <tr><td colSpan={canEdit ? 8 : 7} className="py-12 text-center text-gray-400">No medicines found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {addModal && <MedicineModal onClose={() => setAddModal(false)} onSaved={() => { setAddModal(false); load(query); }} />}
      {editModal && <MedicineModal existing={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); load(query); }} />}
      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate Medicine"
          message={`Deactivate "${deactivateTarget.name}"? It will no longer appear in POS search.`}
          confirmLabel="Deactivate" danger
          loading={deactivating}
          onConfirm={doDeactivate}
          onClose={() => setDeactivateTarget(null)} />
      )}
    </div>
  );
}
