import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FormEvent } from 'react';

type Notification = { _id: string; type: string; message: string; createdAt: string; readBy: string[] };
export default function Notifications() {
  const { user } = useAuth(); const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState('');
  const [users, setUsers] = useState<any[]>([]); const [audience, setAudience] = useState<'ALL_USERS'|'USERS'>('ALL_USERS'); const [recipients, setRecipients] = useState<string[]>([]); const [message, setMessage] = useState(''); const [type, setType] = useState('INFO'); const [success, setSuccess] = useState('');
  const load = async () => { const response = await api.get('/notifications'); setItems(response.data); };
  useEffect(() => {
    load().catch(() => setError('Could not load notifications.'));
    if (user?.role === 'ADMIN') api.get('/users').then(response => setUsers(response.data.filter((person: any) => person.status === 'ACTIVE'))).catch(() => {});
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token: localStorage.getItem('sb_token') } });
    socket.on('notification:new', (notification: Notification) => setItems(current => [notification, ...current.filter(item => item._id !== notification._id)].slice(0, 50)));
    return () => { socket.disconnect(); };
  }, []);
  async function createAnnouncement(e: FormEvent) { e.preventDefault(); setError(''); setSuccess(''); try { await api.post('/notifications', { message, type, audience, recipients: audience === 'USERS' ? recipients : [] }); setMessage(''); setRecipients([]); setSuccess(audience === 'ALL_USERS' ? 'Announcement sent to all approved users.' : 'Notification sent to selected users.'); await load(); } catch (err: any) { setError(err?.response?.data?.message || 'Could not create notification.'); } }
  const unread = (item: Notification) => !item.readBy?.includes(String(user?.id));
  async function markRead(item: Notification) { try { await api.patch(`/notifications/${item._id}/read`); await load(); window.dispatchEvent(new Event('notifications:refresh')); } catch { setError('Could not mark notification as read.'); } }
  async function markAllRead() { try { await api.patch('/notifications/read-all'); await load(); window.dispatchEvent(new Event('notifications:refresh')); } catch { setError('Could not mark notifications as read.'); } }
  return <><div className="page-title"><div><h2>Notifications</h2><p>Live operational updates and admin announcements.</p></div>{items.some(unread) && <button className="small" onClick={markAllRead}>Mark all as read</button>}</div>{error && <div className="error form-feedback" role="alert">{error}</div>}{success && <div className="success-message form-feedback" role="status">{success}</div>}
    {user?.role==='ADMIN' && <div className="panel"><h3>Create announcement</h3><p className="muted">General announcements are also visible to users approved in the future.</p><form className="form-grid notification-form" onSubmit={createAnnouncement}><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write an announcement" required maxLength={500}/><select value={type} onChange={e=>setType(e.target.value)}><option value="INFO">Information</option><option value="WARNING">Warning</option><option value="SUCCESS">Success</option><option value="ALERT">Alert</option></select><select value={audience} onChange={e=>{setAudience(e.target.value as 'ALL_USERS'|'USERS');setRecipients([])}}><option value="ALL_USERS">All approved users</option><option value="USERS">Selected users</option></select>{audience==='USERS' && <select multiple value={recipients} onChange={e=>setRecipients(Array.from(e.target.selectedOptions,option=>option.value))} aria-label="Select notification recipients">{users.map(person=><option key={person._id} value={person._id}>{person.name} · {person.email}</option>)}</select>}<button className="primary" disabled={audience==='USERS'&&!recipients.length}>Send notification</button></form></div>}
    <div className="panel"><div className="notification-list">{items.length ? items.map(item => <article className={`notification ${unread(item) ? 'unread' : ''}`} key={item._id}><div className="notification-copy"><div className="notification-title"><span className={`notification-dot ${item.type.toLowerCase()}`} /><b>{item.type}</b>{unread(item) && <span className="unread-label">NEW</span>}</div><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>{unread(item) && <button className="small" onClick={() => markRead(item)}>Mark read</button>}</article>) : <p className="muted">No notifications yet. Updates for your account will appear here.</p>}</div></div></>;
}
