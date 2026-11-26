import { useState, useCallback, useEffect } from 'react';
import { stockApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/Spinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { FormField, Input, Select, Btn, ErrorAlert, Textarea } from '../components/FormComponents';
import { Package, AlertTriangle, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function WriteOffModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ batch_id: '', quantity: '', reason: '' });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const save = async () => {
    setError(''); setLoading(true);
    try {
      await stockApi.writeOff({
        batch_id: +form.batch_id,
        adjustment_type: 'Write-Off Expired',
        quantity_change: +form.quantity,
        reason: form.reason,
      });
      onSaved();
    } catch (err) { setError(err.response?.data?.detail ?? 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Modal title="Write Off Stock" onClose={onClose} size="sm"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={save} disabled={loading}>{loading ? 'Processing…' : 'Write Off'}</Btn></>}>
      <div className="space-y-4"><ErrorAlert message={error} />
        <FormField label="Batch ID" required><Input type="number" value={form.batch_id} onChange={e => setForm({...form, batch_id: e.target.value})} placeholder="Enter batch ID" /></FormField>
        <FormField label="Quantity to Write Off" required><Input type="number" min={1} value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></FormField>
        <FormField label="Reason" required><Textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="e.g. Expired, damaged…" /></FormField>
      </div>
    </Modal>
  );
}

function AdjustModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ batch_id: '', quantity_change: '', reason: '' });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const save = async () => {
    setError(''); setLoading(true);
    try {
      await stockApi.adjust({
        batch_id: +form.batch_id,
        adjustment_type: 'Correction',
        quantity_change: +form.quantity_change,
        reason: form.reason,
      });
      onSaved();
    } catch (err) { setError(err.response?.data?.detail ?? 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Modal title="Adjust Stock" onClose={onClose} size="sm"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Adjust'}</Btn></>}>
      <div className="space-y-4"><ErrorAlert message={error} />
        <FormField label="Batch ID" required><Input type="number" value={form.batch_id} onChange={e => setForm({...form, batch_id: e.target.value})} /></FormField>
        <FormField label="Quantity Change (use - for reduction)" required><Input type="number" value={form.quantity_change} onChange={e => setForm({...form, quantity_change: e.target.value})} placeholder="+10 or -5" /></FormField>
        <FormField label="Reason" required><Textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="e.g. Count correction…" /></FormField>
      </div>
    </Modal>
  );
}

export default function Stock() {
  const { isRole } = useAuth();
  const [tab, setTab] = useState('all');
  const [data, setData] = useState({ stock: [], low_stock: [], near_expiry: [], expired: [] });
  const [loading, setLoading] = useState(true);
  const [writeOff, setWriteOff] = useState(false);
  const [adjust, setAdjust] = useState(false);

  const tabs = [
    { id: 'all', label: 'All Stock', count: data.stock?.length },
    { id: 'low', label: 'Low Stock', count: data.low_stock?.length },
    { id: 'near_expiry', label: 'Near Expiry', count: data.near_expiry?.length },
    { id: 'expired', label: 'Expired', count: data.expired?.length },
  ];

  const load = useCallback(() => {
    setLoading(true);
    stockApi.overview()
      .then(r => setData(r.data ?? { stock: [], low_stock: [], near_expiry: [], expired: [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const isBatchTab = tab === 'near_expiry' || tab === 'expired';
  const currentList = tab === 'all'
    ? data.stock
    : tab === 'low'
    ? data.low_stock
    : tab === 'near_expiry'
    ? data.near_expiry
    : data.expired;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Package size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Stock & Alerts</h1>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Btn>
          {isRole('pharmacist') && (
            <>
              <Btn variant="warning" size="sm" onClick={() => setWriteOff(true)}><AlertTriangle size={14} />Write Off</Btn>
              <Btn variant="secondary" size="sm" onClick={() => setAdjust(true)}>Adjust Stock</Btn>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-fast flex items-center gap-1.5 ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.2 rounded-full ${tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isBatchTab ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Medicine','Batch #','Expiry','Days Left','Qty Remaining','Unit Cost','Status','Batch ID'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentList?.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 ${tab === 'expired' ? 'bg-red-50/50' : 'bg-orange-50/30'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.medicine_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.batch_number} {row.sell_first && tab !== 'expired' && row.status !== 'Expired' && <span className="text-orange-600 font-bold ml-1">★ SELL FIRST</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">{row.expiry_date}</td>
                    <td className={`px-4 py-3 text-xs font-semibold ${row.days_to_expiry < 0 ? 'text-red-600' : row.days_to_expiry <= 30 ? 'text-orange-600' : 'text-amber-600'}`}>
                      {row.days_to_expiry < 0 ? `${Math.abs(row.days_to_expiry)}d ago` : `${row.days_to_expiry}d`}
                    </td>
                    <td className="px-4 py-3 font-bold">{row.qty_remaining}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">₨{row.purchase_price}</td>
                    <td className="px-4 py-3"><Badge label={row.status ?? (tab === 'expired' ? 'Expired' : 'Near Expiry')} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">#{row.batch_id}</td>
                  </tr>
                ))}
                {(!currentList || currentList.length === 0) && (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">No {tab === 'expired' ? 'expired' : 'near-expiry'} batches found</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Medicine Name','Generic Name','Category','Dosage / Strength','Reorder Level','Usable Stock','Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentList?.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 text-gray-500">{row.generic_name}</td>
                    <td className="px-4 py-3 text-gray-600">{row.category ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.dosage_form} {row.strength ? `· ${row.strength}` : ''}</td>
                    <td className="px-4 py-3 text-gray-600">{row.reorder_level}</td>
                    <td className={`px-4 py-3 font-bold ${row.is_low_stock ? 'text-red-600' : 'text-gray-900'}`}>
                      {row.usable_stock}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={row.is_low_stock ? 'Low' : 'Adequate'} />
                    </td>
                  </tr>
                ))}
                {(!currentList || currentList.length === 0) && (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-400">No records found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {writeOff && <WriteOffModal onClose={() => setWriteOff(false)} onSaved={() => { setWriteOff(false); load(); }} />}
      {adjust && <AdjustModal onClose={() => setAdjust(false)} onSaved={() => { setAdjust(false); load(); }} />}
    </div>
  );
}
