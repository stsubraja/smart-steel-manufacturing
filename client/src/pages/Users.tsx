import { useEffect, useState } from 'react';
import api from '../services/api';
import Feedback from '../components/Feedback';

type ManagedUser = { _id: string; name: string; email: string; role: 'ADMIN'|'USER'; status: 'PENDING'|'ACTIVE'|'DISABLED' };
export default function Users() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string|null>(null);
  const load = async () => { const { data } = await api.get('/users'); setUsers(data); };
  useEffect(() => { load().catch(() => setError('Could not load users.')); }, []);
  async function update(id: string, changes: Partial<Pick<ManagedUser, 'role'|'status'>>) {
    setBusy(id); setError(''); setMessage('');
    try { await api.put(`/users/${id}`, changes); await load(); setMessage('User account updated.'); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not update this account.'); }
    finally { setBusy(null); }
  }
  return <><div className="page-title"><div><h2>User Management</h2><p>Review new registrations and manage account access.</p></div><span className="badge">{users.filter(user => user.status === 'PENDING').length} awaiting approval</span></div>
    <Feedback message={error} className="form-feedback" /><Feedback message={message} type="success" className="form-feedback" />
    <div className="panel"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account status</th><th>Action</th></tr></thead><tbody>{users.map(user=><tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td><select disabled={busy===user._id} value={user.role} onChange={e=>update(user._id,{role:e.target.value as ManagedUser['role']})}><option value="USER">USER</option><option value="ADMIN">ADMIN</option></select></td><td><span className={`badge ${user.status==='DISABLED'?'danger-bg':''}`}>{user.status}</span></td><td>{user.status==='PENDING' ? <button className="primary small-primary" disabled={busy===user._id} onClick={()=>update(user._id,{status:'ACTIVE'})}>{busy===user._id?'Approving…':'Approve account'}</button> : user.status==='ACTIVE' ? <button className="small danger-outline" disabled={busy===user._id} onClick={()=>update(user._id,{status:'DISABLED'})}>Disable</button> : <button className="small" disabled={busy===user._id} onClick={()=>update(user._id,{status:'ACTIVE'})}>Re-enable</button>}</td></tr>)}</tbody></table></div></div>
  </>;
}
