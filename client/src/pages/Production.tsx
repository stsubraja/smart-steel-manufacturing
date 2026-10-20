import { FormEvent, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type Schedule = { _id: string; productType: string; productionDate: string; plannedQuantity: number; actualQuantity: number; status: string; inspectionStatus: string; releaseStatus: string; inProcessHoldQuantity: number; notes?: string };
export default function Production() {
  const { user } = useAuth(); const isAdmin = user?.role === 'ADMIN';
  const [list, setList] = useState<Schedule[]>([]); const [actuals, setActuals] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ productType: 'Steel Coil', productionDate: '', plannedQuantity: '', notes: '' });
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  async function load() { const response = await api.get('/production'); setList(response.data); setActuals(current => Object.fromEntries(response.data.map((row: Schedule) => [row._id, current[row._id] ?? String(row.actualQuantity)]))); }
  useEffect(() => { load().catch(() => setError('Could not load schedules. Check the backend and database connection.')); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true);
    try { await api.post('/production', { ...form, plannedQuantity: Number(form.plannedQuantity) }); setMessage('Production schedule created.'); setForm({ productType: 'Steel Coil', productionDate: '', plannedQuantity: '', notes: '' }); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Could not create this schedule.'); }
    finally { setSaving(false); }
  }
  async function update(row: Schedule, changes: Record<string, unknown>) {
    setError(''); setMessage('');
    try { await api.put(`/production/${row._id}`, changes); await load(); setMessage('Production record updated.'); }
    catch (err: any) { setError(err.response?.data?.message || 'Could not update this production record.'); }
  }
  return <><div className="page-title"><div><h2>Production Scheduling</h2><p>{isAdmin ? 'Plan production and record completed output.' : 'View manufacturing schedules and production output.'}</p></div></div>
    {error && <div className="error form-feedback" role="alert">{error}</div>}{message && <div className="success-message form-feedback" role="status">{message}</div>}
    {isAdmin && <div className="panel"><h3>New production schedule</h3><form className="form-grid" onSubmit={submit}><input aria-label="Product type" placeholder="Product type" value={form.productType} onChange={e => setForm({ ...form, productType: e.target.value })} required maxLength={100} /><input aria-label="Production date" type="date" value={form.productionDate} onChange={e => setForm({ ...form, productionDate: e.target.value })} required /><input aria-label="Planned quantity" type="number" min="1" placeholder="Planned quantity (units)" value={form.plannedQuantity} onChange={e => setForm({ ...form, plannedQuantity: e.target.value })} required /><input aria-label="Notes" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /><button className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create Schedule'}</button></form></div>}
    <div className="panel"><h3>Schedules and output</h3><div className="table-wrap"><table><thead><tr><th>Product</th><th>Date</th><th>Planned units</th><th>Actual units</th><th>Status</th><th>Final check</th><th>Release</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>{list.map(row => <tr key={row._id}><td>{row.productType}</td><td>{new Date(row.productionDate).toLocaleDateString()}</td><td>{row.plannedQuantity}</td><td>{isAdmin ? <input className="quantity-input" aria-label={`Actual quantity for ${row.productType}`} type="number" min="0" max="100000000" value={actuals[row._id] ?? row.actualQuantity} onChange={e => setActuals({ ...actuals, [row._id]: e.target.value })} /> : row.actualQuantity}</td><td><span className="badge">{row.status}</span></td><td><span className={`badge ${row.inspectionStatus === 'FAIL' ? 'danger-bg' : ''}`}>{row.status === 'COMPLETED' ? row.inspectionStatus : row.inProcessHoldQuantity > 0 ? `${row.inProcessHoldQuantity} ON HOLD` : '—'}</span></td><td><span className={`badge ${row.releaseStatus === 'ON_HOLD' ? 'danger-bg' : ''}`}>{row.releaseStatus || (row.status === 'COMPLETED' ? 'PENDING_FINAL' : 'NOT_READY')}</span></td>{isAdmin && <td className="action-cell"><button className="small" onClick={() => update(row, { actualQuantity: Number(actuals[row._id] ?? row.actualQuantity) })}>Save output</button><select aria-label={`Status for ${row.productType}`} value={row.status} onChange={e => update(row, { status: e.target.value, actualQuantity: Number(actuals[row._id] ?? row.actualQuantity) })}><option>PLANNED</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option></select></td>}</tr>)}</tbody></table></div>{list.length === 0 && <p className="muted">No production schedules yet.</p>}</div>
  </>;
}
