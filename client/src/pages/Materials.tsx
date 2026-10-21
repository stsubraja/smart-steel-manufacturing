import { FormEvent, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Feedback from '../components/Feedback';

type Material = { _id: string; name: string; quantity: number; unit: string; minimumLevel: number; supplier?: string };
export default function Materials() {
  const { user } = useAuth(); const isAdmin = user?.role === 'ADMIN';
  const [list, setList] = useState<Material[]>([]); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'kg', minimumLevel: '', supplier: '' });
  const [restocking, setRestocking] = useState<Material | null>(null); const [quantityAdded, setQuantityAdded] = useState('');
  const restockPanelRef = useRef<HTMLDivElement>(null);
  async function load() { const r = await api.get('/materials'); setList(r.data); }
  useEffect(() => { load().catch(() => setError('Could not load raw materials.')); }, []);
  useEffect(() => {
    if (!restocking) return;
    requestAnimationFrame(() => {
      restockPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      restockPanelRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }, [restocking]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try { await api.post('/materials', { ...form, name: form.name.trim(), quantity: Number(form.quantity), minimumLevel: Number(form.minimumLevel) }); setForm({ name: '', quantity: '', unit: 'kg', minimumLevel: '', supplier: '' }); setMessage('Raw material added.'); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Could not add raw material.'); }
  }
  async function consumeStock(material: Material) {
    const raw = prompt(`Quantity to use (${material.unit}; available: ${material.quantity})`);
    if (raw === null) return;
    const quantityUsed = Number(raw); if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) return setError('Enter a quantity greater than zero.');
    setError(''); setMessage('');
    try { await api.post(`/materials/${material._id}/use`, { quantityUsed }); setMessage(`Stock updated for ${material.name}.`); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Could not update stock.'); }
  }
  async function restock(event: FormEvent) {
    event.preventDefault(); if (!restocking) return;
    setError(''); setMessage('');
    try {
      await api.post(`/materials/${restocking._id}/restock`, { quantityAdded: Number(quantityAdded) });
      setMessage(`${restocking.name} restocked successfully.`); setRestocking(null); setQuantityAdded(''); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Could not restock this material.'); }
  }
  async function remove(material: Material) {
    if (!window.confirm(`Delete ${material.name} from inventory?`)) return;
    setError(''); setMessage('');
    try { await api.delete(`/materials/${material._id}`); setMessage(`${material.name} deleted from inventory.`); await load(); }
    catch (err: any) { setError(err.response?.data?.message || 'Could not delete this material.'); }
  }
  return <><div className="page-title"><div><h2>Raw Materials</h2><p>Track stock levels, usage and reorder thresholds.</p></div></div>
    <Feedback message={error} className="form-feedback" /><Feedback message={message} type="success" className="form-feedback" />
    {isAdmin && <div className="panel"><h3>Add raw material</h3><form className="form-grid" onSubmit={submit}><input placeholder="Material name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={100} /><input type="number" min="0" step="any" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required /><input placeholder="Unit (kg, tonnes...)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} required /><input type="number" min="0" step="any" placeholder="Minimum level" value={form.minimumLevel} onChange={e => setForm({ ...form, minimumLevel: e.target.value })} required /><input placeholder="Supplier (optional)" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /><button className="primary">Add Material</button></form></div>}
    {isAdmin && restocking && <div className="panel" ref={restockPanelRef} tabIndex={-1}><h3>Restock {restocking.name}</h3><p className="muted">Current available quantity: {restocking.quantity} {restocking.unit}. Enter the amount being added.</p><form className="form-grid restock-form" onSubmit={restock}><label>Quantity to add ({restocking.unit})<input type="number" min="0.001" step="any" value={quantityAdded} onChange={e => setQuantityAdded(e.target.value)} required /></label><div className="action-cell"><button className="primary">Add quantity</button><button type="button" className="small" onClick={() => { setRestocking(null); setQuantityAdded(''); }}>Cancel</button></div></form></div>}
    <div className="panel"><h3>Inventory</h3><div className="table-wrap"><table><thead><tr><th>Material</th><th>Quantity</th><th>Unit</th><th>Minimum</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>{list.map(item => <tr key={item._id}><td>{item.name}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{item.minimumLevel}</td><td><span className={`badge ${item.quantity <= item.minimumLevel ? 'danger-bg' : ''}`}>{item.quantity <= item.minimumLevel ? 'LOW STOCK' : 'IN STOCK'}</span></td>{isAdmin && <td className="action-cell"><button className="small" onClick={() => consumeStock(item)}>Use Stock</button><button className="small" onClick={() => { setRestocking(item); setQuantityAdded(''); setError(''); }}>Restock</button><button className="small danger-outline" onClick={() => remove(item)}>Delete</button></td>}</tr>)}</tbody></table></div>{list.length === 0 && <p className="muted">No materials in inventory yet.</p>}</div>
  </>;
}
