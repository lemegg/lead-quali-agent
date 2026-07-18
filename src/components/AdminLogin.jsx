import React, { useState } from 'react';
import { useLeads } from '../context/LeadContext';
import { Lock, User, AlertCircle, ShieldAlert } from 'lucide-react';

const AdminLogin = () => {
  const { loginAdmin } = useLeads();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Artificial delay to look like secure check
    setTimeout(() => {
      const success = loginAdmin(username, password);
      setLoading(false);
      if (!success) {
        setError('Invalid username or password. Try admin / admin123');
      }
    }, 800);
  };

  return (
    <div className="login-container">
      <div className="glass-card login-card">
        <div className="login-header">
          <div className="login-logo">
            <Lock size={24} color="#ffffff" />
          </div>
          <h2 className="login-title">Secure Portal</h2>
          <p className="login-subtitle">Enter admin credentials to access the sales dashboard</p>
        </div>

        {error && (
          <div className="login-error">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">Username</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                <User size={16} />
              </span>
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ textAlign: 'left', marginBottom: '2rem' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                <Lock size={16} />
              </span>
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', py: '0.85rem' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', color: '#64748b', fontSize: '0.8rem' }}>
          <ShieldAlert size={14} />
          <span>Demo Access: admin / admin123</span>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
