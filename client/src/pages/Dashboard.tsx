import { useCallback, useEffect, useState } from 'react';
import { Activity, Factory, Flame, Package, ShieldAlert, ClipboardCheck } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../services/api';

type DashboardData = { plannedToday: number; actualToday: number; activeSchedules: number; completedToday: number; furnaceCount: number; furnacesRunning: number; furnaceAlerts: number; furnacesStopped: number; lowStock: number; heldSchedules: { _id: string; productType: string; inProcessHoldQuantity: number; status: string; inspectionStatus: string }[]; finalPending: number; furnaces: { _id: string; name: string; status: string; isRunning: boolean; temperature: number; minTemperature: number; maxTemperature: number }[]; lowStockItems: { _id: string; name: string; quantity: number; minimumLevel: number; unit: string }[]; recentNotifications: { _id: string; type: string; message: string; createdAt: string }[] };
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null); const [error, setError] = useState('');
  const refresh = useCallback(() => api.get('/analytics/dashboard').then(response => { setData(response.data); setError(''); }).catch(() => setError('Live overview is unavailable. Check the backend connection.')), []);
  useEffect(() => {
    refresh(); const timer = window.setInterval(refresh, 30000);
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token: localStorage.getItem('sb_token') } });
    socket.on('furnace:update', refresh); socket.on('notification:new', refresh);
    return () => { window.clearInterval(timer); socket.disconnect(); };
  }, [refresh]);
  const cards = [
    ['Planned today', data?.plannedToday ?? '—', 'units', Activity], ['Actual output today', data?.actualToday ?? '—', 'units recorded', Factory],
    ['Schedules in progress', data?.activeSchedules ?? '—', 'active production runs', ClipboardCheck], ['Needs attention', (data?.heldSchedules.length ?? 0) + (data?.furnaceAlerts ?? 0) + (data?.lowStock ?? 0), 'holds, furnace and stock alerts', ShieldAlert]
  ];
  return <><div className="page-title"><div><h2>Operations dashboard</h2><p>Live shift snapshot · refreshes automatically</p></div><span className="live-indicator"><i /> LIVE</span></div>{error && <div className="error form-feedback">{error}</div>}
    <div className="cards">{cards.map(([label, value, helper, Icon]: any) => <div className="card dashboard-card" key={label}><div className="icon"><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>)}</div>
    <div className="grid2"><div className="panel"><div className="section-heading"><div><h3>Furnace floor</h3><p className="muted">Current simulated status</p></div><Flame size={19} /></div><div className="metric"><span>Running</span><b>{data?.furnacesRunning ?? '—'} / {data?.furnaceCount ?? '—'}</b></div><div className="metric"><span>Stopped by admin</span><b>{data?.furnacesStopped ?? '—'}</b></div><div className="metric"><span>Temperature alerts</span><b className={data?.furnaceAlerts ? 'danger' : ''}>{data?.furnaceAlerts ?? '—'}</b></div>{data?.furnaces.slice(0, 4).map(furnace => <div className="status-row" key={furnace._id}><span>{furnace.name} · {furnace.isRunning ? `${furnace.temperature}°C` : 'Stopped'}</span><span className={`badge ${['CRITICAL', 'WARNING'].includes(furnace.status) ? 'danger-bg' : ''}`}>{furnace.status}</span></div>)}</div>
      <div className="panel"><div className="section-heading"><div><h3>Quality & stock attention</h3><p className="muted">Items that need an operator action</p></div><Package size={19} /></div><div className="metric"><span>Completed · final inspection pending</span><b>{data?.finalPending ?? '—'}</b></div><div className="metric"><span>Held production schedules</span><b>{data?.heldSchedules.length ?? '—'}</b></div>{data?.heldSchedules.map(item => <div className="status-row" key={item._id}><span>{item.productType} · {item.inProcessHoldQuantity > 0 ? `${item.inProcessHoldQuantity} units held` : item.inspectionStatus === 'FAIL' ? 'Final rework required' : 'Release on hold'}</span><span className="badge danger-bg">ON HOLD</span></div>)}<div className="metric"><span>Low-stock materials</span><b>{data?.lowStock ?? '—'}</b></div>{data?.lowStockItems.slice(0, 3).map(item => <div className="status-row" key={item._id}><span>{item.name} · {item.quantity} {item.unit}</span><small>Min {item.minimumLevel}</small></div>)}</div></div>
    <div className="panel"><div className="section-heading"><div><h3>Latest operational updates</h3><p className="muted">Schedule, inspection, inventory and furnace events</p></div></div>{data?.recentNotifications.length ? data.recentNotifications.map(item => <div className="notification" key={item._id}><div><span className="badge">{item.type}</span><p>{item.message}</p></div><small>{new Date(item.createdAt).toLocaleTimeString()}</small></div>) : <p className="muted">No operational alerts yet.</p>}</div>
  </>;
}
