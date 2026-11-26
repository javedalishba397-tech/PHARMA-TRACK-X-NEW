import { useState } from 'react';
import { reportsApi } from '../api/client';
import { PageLoader } from '../components/Spinner';
import { FormField, Input, Select, Btn } from '../components/FormComponents';
import { BarChart3, Download, FileText } from 'lucide-react';
import { format } from 'date-fns';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const REPORT_TYPES = [
  { id: 'sales', label: 'Sales Report', endpoint: reportsApi.sales },
  { id: 'stock-expiry', label: 'Stock & Expiry Report', endpoint: reportsApi.stockExpiry },
  { id: 'purchases', label: 'Purchases Report', endpoint: reportsApi.purchases },
  { id: 'wastage', label: 'Wastage Report', endpoint: reportsApi.wastage },
  { id: 'recommendations', label: 'Recommendations Report', endpoint: reportsApi.recommendations },
];

export default function Reports() {
  const [type, setType] = useState('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = { start_date: dateFrom || undefined, end_date: dateTo || undefined };

  const handleRun = async () => {
    setError(''); setLoading(true);
    const rt = REPORT_TYPES.find(r => r.id === type);
    try { const r = await rt.endpoint(params); setData(r.data); }
    catch (err) { setError(err.response?.data?.detail ?? 'Report failed'); }
    finally { setLoading(false); }
  };

  const handleExport = async (fmt) => {
    setExporting(true);
    try {
      const r = fmt === 'pdf'
        ? await reportsApi.export(type, params)
        : await reportsApi.exportCsv(type, params);
      downloadBlob(r.data, `report_${type}_${format(new Date(), 'yyyyMMdd')}.${fmt}`);
    } finally { setExporting(false); }
  };

  const rows = data?.rows ??
    (data?.usable_batches ? [...(data?.expired_batches || []), ...(data?.near_expiry_batches || []), ...(data?.usable_batches || [])] : null) ??
    data?.items ??
    (Array.isArray(data) ? data : []);
  const summary = data?.summary ?? data?.totals ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 size={22} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <FormField label="Report Type">
            <Select value={type} onChange={e => { setType(e.target.value); setData(null); }} className="w-56">
              {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </FormField>
          <FormField label="From Date"><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" /></FormField>
          <FormField label="To Date"><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" /></FormField>
          <Btn onClick={handleRun} disabled={loading}>{loading ? 'Running…' : 'Run Report'}</Btn>
          {data && (
            <>
              <Btn variant="secondary" onClick={() => handleExport('pdf')} disabled={exporting}><FileText size={15} />PDF</Btn>
              <Btn variant="secondary" onClick={() => handleExport('csv')} disabled={exporting}><Download size={15} />CSV</Btn>
            </>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 capitalize">{k.replace(/_/g, ' ')}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{typeof v === 'number' ? (Number.isInteger(v) ? v : `₨${v.toFixed(2)}`) : v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {Object.keys(rows[0]).map(k => (
                    <th key={k} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 capitalize">{k.replace(/_/g,' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-4 py-3 text-sm text-gray-700">
                        {v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data !== null && rows.length === 0 && (
        <div className="py-16 text-center text-gray-400">No data for selected criteria</div>
      )}
    </div>
  );
}
