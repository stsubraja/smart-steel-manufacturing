import { FormEvent, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type Reading = { temperature: number; recordedAt: string };
type Furnace = {
  _id: string;
  name: string;
  temperature: number;
  status: string;
  lastUpdated: string;
  minTemperature: number;
  maxTemperature: number;
  isRunning: boolean;
  temperatureHistory?: Reading[];
};

export default function Furnaces() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [minTemperature, setMinTemperature] = useState('1400');
  const [maxTemperature, setMaxTemperature] = useState('1650');
  const [startingTemperature, setStartingTemperature] = useState('1450');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');

  async function loadFurnaces() {
    const response = await api.get('/furnaces');
    setFurnaces(response.data);
  }

  useEffect(() => {
    loadFurnaces().catch(() => setError('Could not load furnaces. Check the backend and database connection.'));
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token: localStorage.getItem('sb_token') } });
    socket.on('furnace:update', (updated: Furnace[]) => setFurnaces(updated));
    return () => { socket.disconnect(); };
  }, []);

  async function simulate() {
    setError('');
    try { await api.post('/furnaces/simulate'); await loadFurnaces(); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not update simulated temperatures.'); }
  }

  async function setRunning(furnace: Furnace) {
    setError(''); setMessage('');
    try { await api.put(`/furnaces/${furnace._id}`, { isRunning: !furnace.isRunning }); await loadFurnaces(); setMessage(`${furnace.name} ${furnace.isRunning ? 'stopped' : 'resumed'}.`); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not update furnace state.'); }
  }

  function editRange(furnace: Furnace) { setEditingId(furnace._id); setRangeMin(String(furnace.minTemperature)); setRangeMax(String(furnace.maxTemperature)); setError(''); setMessage(''); }
  async function saveRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingId) return;
    const min = Number(rangeMin), max = Number(rangeMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max <= min) return setError('Maximum temperature must be greater than the minimum.');
    try { await api.put(`/furnaces/${editingId}`, { minTemperature: min, maxTemperature: max }); await loadFurnaces(); setEditingId(null); setMessage('Furnace operating range updated.'); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not update furnace range.'); }
  }

  async function addFurnace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const min = Number(minTemperature);
    const max = Number(maxTemperature);
    const initial = Number(startingTemperature);
    if (!name.trim()) return setError('Enter a furnace name.');
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max <= min) return setError('Maximum temperature must be greater than the minimum temperature.');
    if (!Number.isFinite(initial) || initial < 1 || initial > max + 80) return setError('Starting temperature must be positive and no more than 80°C above the maximum.');
    setSaving(true);
    try {
      await api.post('/furnaces', { name: name.trim(), minTemperature: min, maxTemperature: max, temperature: initial });
      await loadFurnaces();
      setName(''); setMinTemperature('1400'); setMaxTemperature('1650'); setStartingTemperature('1450');
      setShowForm(false);
      setMessage('Furnace added successfully. Its temperature will update automatically in simulation mode.');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not add furnace. Please try again.');
    } finally { setSaving(false); }
  }

  return <>
    <div className="page-title">
      <div><h2>Furnace Monitoring</h2><p>Simulated telemetry updates automatically every 5 seconds. No physical sensor is connected.</p></div>
      {isAdmin && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="small" onClick={() => { setShowForm(v => !v); setError(''); setMessage(''); }}>{showForm ? 'Cancel' : '+ Add Furnace'}</button>
        <button className="primary" onClick={simulate}>Simulate Update Now</button>
      </div>}
    </div>

    {error && <div className="error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
    {message && <div className="success-message" role="status" style={{ marginBottom: 14 }}>{message}</div>}

    {isAdmin && editingId && <form className="panel form-grid range-form" onSubmit={saveRange}><div><h3>Edit operating range</h3><p className="muted">Adjust the simulated normal operating limits.</p></div><label>Minimum °C<input type="number" min="1" value={rangeMin} onChange={e => setRangeMin(e.target.value)} required /></label><label>Maximum °C<input type="number" min="2" value={rangeMax} onChange={e => setRangeMax(e.target.value)} required /></label><div className="action-cell"><button className="primary">Save range</button><button type="button" className="small" onClick={() => setEditingId(null)}>Cancel</button></div></form>}

    {isAdmin && showForm && <form className="panel" onSubmit={addFurnace}>
      <h3>Add a new furnace</h3>
      <div className="form-grid">
        <input aria-label="Furnace name" placeholder="Furnace name (e.g. Furnace 3)" value={name} onChange={e => setName(e.target.value)} maxLength={80} required />
        <input aria-label="Minimum temperature" type="number" placeholder="Minimum °C" value={minTemperature} onChange={e => setMinTemperature(e.target.value)} min="1" required />
        <input aria-label="Maximum temperature" type="number" placeholder="Maximum °C" value={maxTemperature} onChange={e => setMaxTemperature(e.target.value)} min="2" required />
        <input aria-label="Starting temperature" type="number" placeholder="Starting temperature °C" value={startingTemperature} onChange={e => setStartingTemperature(e.target.value)} min="1" required />
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Save Furnace'}</button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>This creates a simulated furnace record in MongoDB. These readings are not from physical equipment.</p>
    </form>}

    {furnaces.length === 0 ? <div className="panel">No furnaces found.{isAdmin ? ' Use Add Furnace to create the first one.' : ''}</div> :
      <div className="cards">{furnaces.map(furnace => {
        const history = (furnace.temperatureHistory || []).slice(-10);
        const values = history.map(item => item.temperature);
        const min = Math.min(furnace.minTemperature, ...values);
        const max = Math.max(furnace.maxTemperature, ...values);
        const points = history.map((item, index) => `${history.length <= 1 ? 0 : index * 100 / (history.length - 1)},${38 - (item.temperature - min) / Math.max(1, max - min) * 30}`).join(' ');
        return <div className="card" key={furnace._id}>
          <div className="furnace-heading"><span>{furnace.name}</span>{isAdmin && <div className="action-cell"><button className="small" onClick={() => editRange(furnace)}>Edit range</button><button className={`small ${furnace.isRunning ? 'danger-outline' : ''}`} onClick={() => setRunning(furnace)}>{furnace.isRunning ? 'Stop' : 'Resume'}</button></div>}</div>
          <strong>{furnace.temperature}°C</strong>
          <small className={furnace.status === 'CRITICAL' ? 'danger' : furnace.status === 'WARNING' ? 'warning' : ''}>{furnace.isRunning ? furnace.status : 'STOPPED · SIMULATION PAUSED'}</small>
          <small>Updated {new Date(furnace.lastUpdated).toLocaleTimeString()}</small>
          <div style={{ marginTop: 12 }}><small>Recent temperature trend (last 10 readings)</small>
            {history.length > 1 ? <svg viewBox="0 0 100 42" role="img" aria-label={`${furnace.name} simulated temperature trend`} style={{ width: '100%', height: 70 }}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg> : <small>Collecting readings…</small>}
          </div>
          <small>Operating range: {furnace.minTemperature}–{furnace.maxTemperature}°C</small>
        </div>;
      })}</div>
    }
  </>;
}
