import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Factory } from 'lucide-react';

export default function Auth({ register = false }: { register?: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('smartsteel-theme') === 'dark');
  const { login, register: reg } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('smartsteel-theme', dark ? 'dark' : 'light');
  }, [dark]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    try { if (register) await reg(name, email, password); else await login(email, password); nav('/'); }
    catch (err: any) { setError(err?.response?.data?.message || 'Something went wrong. Please try again.'); }
  }
  return <div className="auth">
    <section className="auth-visual">
      <div className="auth-visual-content">
        <div className="auth-mark" aria-label="Smart Steel factory"><Factory size={34} strokeWidth={2.3} /></div>
        <p className="eyebrow">SMART STEEL MANUFACTURING</p>
        <h2>Built for better<br />production flow.</h2>
        <p>One clear view of schedules, furnace operations, inventory and quality.</p>
        <div className="visual-caption">
          <span className="live-dot" /> OPERATIONS CONTROL CENTER</div>
          </div>
      <small className="auth-photo-credit">Steelmaking imagery · Alfa Laval</small>
          </section>
    <section className="auth-side"><button className="auth-theme" type="button" onClick={() => setDark(value => !value)} aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><div className="auth-card"><div className="logo large"><Factory size={38} strokeWidth={2.2} /></div><h1>{register ? 'Create account' : 'Welcome back'}</h1><p>{register ? 'Create a Smart Steel user account' : 'Sign in to the manufacturing control center'}</p><form onSubmit={submit}>{register && <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />}<input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required /><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />{error && <div className="error" role="alert">{error}</div>}<button className="primary">{register ? 'Create account' : 'Sign in'}</button></form><button className="link" onClick={() => nav(register ? '/login' : '/register')}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></div></section>
  </div>;
}
