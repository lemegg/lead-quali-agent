import React from 'react';
import { useLeads } from '../context/LeadContext';
import { Sparkles, Shield, UserPlus } from 'lucide-react';

const Settings = () => {
  const { 
    threshold, 
    setThreshold, 
    addMockLeads
  } = useLeads();

  const handleInjectMockLead = (type) => {
    addMockLeads(type);
  };

  return (
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="view-title">System Settings</h1>
          <p className="view-description">Configure the qualification threshold parameters and seed simulated lead records.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Qualification Threshold Configuration */}
        <div className="glass-card settings-section">
          <h3 className="settings-sec-title">
            <Shield size={18} color="var(--color-success)" />
            Qualification Grading Criteria
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
            Specify the threshold score required for a lead to be flagged as "Highly Qualified" (Hot). Qualified leads are highlighted in emerald.
          </p>

          <div className="form-group" style={{ maxWidth: '240px' }}>
            <label className="form-label">Minimum Qualification Score ({threshold}%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="range"
                min="30"
                max="90"
                step="5"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                style={{
                  flexGrow: 1,
                  accentColor: 'var(--color-primary)'
                }}
              />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', minWidth: '40px' }}>
                {threshold}%
              </span>
            </div>
          </div>
        </div>

        {/* Developer Sandbox / Mock injection */}
        <div className="glass-card settings-section">
          <h3 className="settings-sec-title">
            <Sparkles size={18} color="var(--color-warning)" />
            Developer Seed Sandbox
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
            Quickly inject mock leads into your Neon DB database to verify metrics calculation, filters, and list views.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => handleInjectMockLead('hot')}
              style={{ gap: '0.4rem', border: '1px solid rgba(16, 185, 129, 0.25)' }}
            >
              <UserPlus size={16} color="var(--color-success)" />
              Seed 1 Highly Qualified (Hot) Lead
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => handleInjectMockLead('cold')}
              style={{ gap: '0.4rem', border: '1px solid rgba(244, 63, 94, 0.25)' }}
            >
              <UserPlus size={16} color="var(--color-danger)" />
              Seed 1 Unqualified (Cold) Lead
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
