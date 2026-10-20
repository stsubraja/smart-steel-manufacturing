import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Flame, Boxes, ClipboardCheck, BarChart3, Users, LogOut, Bell, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import api from '../services/api';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem('smartsteel-theme') === 'dark');
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('smartsteel-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    let active = true;
    const refresh = () => api.get('/notifications').then(response => { if (active) setUnread(response.data.filter((item: any) => !item.readBy?.some((id: string) => String(id) === user?.id)).length); }).catch(() => {});
    refresh();
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token: localStorage.getItem('sb_token') } });
    socket.on('notification:new', () => { if (active) setUnread(count => count + 1); });
    window.addEventListener('notifications:refresh', refresh);
    return () => { active = false; socket.disconnect(); window.removeEventListener('notifications:refresh', refresh); };
  }, [user?.id]);
  const nav = [['/', 'Dashboard', LayoutDashboard], ['/production', 'Production', CalendarDays], ['/furnaces', 'Furnace Monitoring', Flame], ['/materials', 'Raw Materials', Boxes], ['/quality', 'Quality Inspection', ClipboardCheck], ['/analytics', 'Analytics', BarChart3], ['/notifications', 'Notifications', Bell]] as const;
  return <div className="app"><aside><div className="brand"><div className="logo">SS</div><div><b>Smart Steel</b><small>Manufacturing</small></div></div><nav>{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={18} />{label}{label === 'Notifications' && unread > 0 && <span className="nav-count">{unread > 99 ? '99+' : unread}</span>}</NavLink>)}{user?.role === 'ADMIN' && <NavLink to="/users"><Users size={18} />Users</NavLink>}</nav><div className="sidebar-bottom"><button className="theme-toggle" onClick={() => setDark(value => !value)}><span>{dark ? <Sun size={17} /> : <Moon size={17} />}{dark ? 'Light theme' : 'Dark theme'}</span><span className={`switch ${dark ? 'on' : ''}`} /></button><button className="logout" onClick={() => { logout(); navigate('/login'); }}><LogOut size={18} />Logout</button></div></aside><main><header><div><h1>Smart Steel Manufacturing</h1><p>Production operations control center</p></div><div className="profile"><span>{user?.name}</span><small>{user?.role}</small></div></header><section className="content">{children}</section></main></div>;
}
