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

  async function loadFurnaces() {
    const response = await api.get('/furnaces');
    setFurnaces(response.data);
  }

  useEffect(() => {
    loadFurnaces().catch(() => setError('Could not load furnaces. Check the backend and database connection.'));
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    socket.on('furnace:update', (updated: Furnace[]) => setFurnaces(updated));
    return () => { socket.disconnect(); };
  }, []);

  async function simulate() {
    setError('');
    try { await api.post('/furnaces/simulate'); await loadFurnaces(); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not update simulated temperatures.'); }
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
          <span>{furnace.name}</span><strong>{furnace.temperature}°C</strong>
          <small className={furnace.status === 'CRITICAL' ? 'danger' : furnace.status === 'WARNING' ? 'warning' : ''}>{furnace.status}</small>
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
