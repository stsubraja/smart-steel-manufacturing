import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type Notification = { _id: string; type: string; message: string; createdAt: string; readBy: string[] };
export default function Notifications() {
  const { user } = useAuth(); const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState('');
  const load = async () => { const response = await api.get('/notifications'); setItems(response.data); };
  useEffect(() => {
    load().catch(() => setError('Could not load notifications.'));
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token: localStorage.getItem('sb_token') } });
    socket.on('notification:new', (notification: Notification) => setItems(current => [notification, ...current.filter(item => item._id !== notification._id)].slice(0, 50)));
    return () => { socket.disconnect(); };
  }, []);
  const unread = (item: Notification) => !item.readBy?.includes(String(user?.id));
  async function markRead(item: Notification) { try { await api.patch(`/notifications/${item._id}/read`); await load(); window.dispatchEvent(new Event('notifications:refresh')); } catch { setError('Could not mark notification as read.'); } }
  async function markAllRead() { try { await api.patch('/notifications/read-all'); await load(); window.dispatchEvent(new Event('notifications:refresh')); } catch { setError('Could not mark notifications as read.'); } }
  return <><div className="page-title"><div><h2>Notifications</h2><p>Live schedule, quality, stock and furnace updates.</p></div>{items.some(unread) && <button className="small" onClick={markAllRead}>Mark all as read</button>}</div>{error && <div className="error form-feedback" role="alert">{error}</div>}<div className="panel"><div className="notification-list">{items.length ? items.map(item => <article className={`notification ${unread(item) ? 'unread' : ''}`} key={item._id}><div className="notification-copy"><div className="notification-title"><span className={`notification-dot ${item.type.toLowerCase()}`} /><b>{item.type}</b>{unread(item) && <span className="unread-label">NEW</span>}</div><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>{unread(item) && <button className="small" onClick={() => markRead(item)}>Mark read</button>}</article>) : <p className="muted">No notifications yet. Schedule production or update furnace/material/quality records to see operational alerts here.</p>}</div></div></>;
}
