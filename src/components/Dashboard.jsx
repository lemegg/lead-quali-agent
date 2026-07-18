import React, { useState, useEffect } from 'react';
import { useLeads } from '../context/LeadContext';
import { 
  Users, Sparkles, TrendingUp, AlertCircle, Phone, Mail, 
  MapPin, Calendar, DollarSign, Archive, CheckCircle, Clock, 
  Copy, Check, LogOut, ChevronRight, MessageSquare 
} from 'lucide-react';

const Dashboard = () => {
  const { leads, threshold, updateLeadStatus, logoutAdmin } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id || null);
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);
  const [visitorSessions, setVisitorSessions] = useState([]);
  const [filter, setFilter] = useState('All'); // All, Hot, Pending, Archived
  const [copied, setCopied] = useState(false);

  const selectedLead = leads.find(l => l.id === selectedLeadId) || null;
  const displayLead = selectedLeadDetails || selectedLead;

  // Initialize selectedLeadId once leads are loaded
  useEffect(() => {
    if (!selectedLeadId && leads.length > 0) {
      setSelectedLeadId(leads[0].id);
    }
  }, [leads, selectedLeadId]);

  // Fetch full details (including transcript messages) for selected lead
  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      if (!selectedLeadId) {
        setSelectedLeadDetails(null);
        return;
      }
      try {
        const res = await fetch(`/api/leads/${selectedLeadId}`);
        if (res.ok && active) {
          const data = await res.json();
          setSelectedLeadDetails(data);
        }
      } catch (err) {
        console.error('Error fetching lead details:', err);
      }
    };

    fetchDetails();
    
    // Poll to keep admin view live
    const interval = setInterval(fetchDetails, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedLeadId]);

  // Fetch all chat session threads for the selected visitor
  useEffect(() => {
    const fetchSessions = async () => {
      const visitorId = displayLead?.visitor_id;
      if (!visitorId) {
        setVisitorSessions(displayLead ? [displayLead] : []);
        return;
      }
      try {
        const res = await fetch(`/api/leads/visitor/${visitorId}/sessions`);
        if (res.ok) {
          const data = await res.json();
          setVisitorSessions(data);
        }
      } catch (err) {
        console.error('Error fetching visitor sessions:', err);
      }
    };

    if (displayLead) {
      fetchSessions();
    } else {
      setVisitorSessions([]);
    }
  }, [displayLead?.id, displayLead?.visitor_id]);

  // Filter logic
  const filteredLeads = leads.filter(lead => {
    if (filter === 'Hot') return lead.score >= threshold && lead.status !== 'Archived';
    if (filter === 'Pending') return lead.score < threshold && lead.status !== 'Archived';
    if (filter === 'Archived') return lead.status === 'Archived';
    return lead.status !== 'Archived'; // 'All' filters out archived by default to keep clean
  });

  // Calculate Metrics
  const totalLeads = leads.length;
  const hotLeads = leads.filter(l => l.score >= threshold && l.status !== 'Archived').length;
  const avgScore = totalLeads ? Math.round(leads.reduce((acc, curr) => acc + curr.score, 0) / totalLeads) : 0;
  
  // Calculate pipeline value estimate based on budget parsing
  const pipelineValue = leads.reduce((acc, curr) => {
    if (curr.status === 'Archived') return acc;
    const budgetStr = curr.criteria?.budget || '';
    const numberMatch = budgetStr.replace(/[^0-9]/g, '');
    if (numberMatch) {
      let val = parseInt(numberMatch, 10);
      if (budgetStr.toLowerCase().includes('k')) val *= 1000;
      if (budgetStr.toLowerCase().includes('m') || budgetStr.toLowerCase().includes('million')) val *= 1000000;
      return acc + (isNaN(val) ? 0 : val);
    }
    return acc;
  }, 0);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const handleCopyNumber = (phoneNumber) => {
    if (!phoneNumber) return;
    navigator.clipboard.writeText(phoneNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStatusChange = (leadId, newStatus) => {
    updateLeadStatus(leadId, newStatus);
  };

  return (
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* View Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="view-title">Sales Qualification Dashboard</h1>
          <p className="view-description">Monitor qualified leads, evaluate extracted BANT profiles, and make direct phone outreach.</p>
        </div>
        <button className="btn btn-secondary" onClick={logoutAdmin} style={{ gap: '0.4rem' }}>
          <LogOut size={16} />
          Lock Dashboard
        </button>
      </div>

      {/* Metrics Row */}
      <div className="dashboard-grid">
        <div className="glass-card metric-card">
          <div className="metric-icon-box primary">
            <Users size={22} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Leads</span>
            <span className="metric-value">{totalLeads}</span>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-icon-box success">
            <Sparkles size={22} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Highly Qualified (Hot)</span>
            <span className="metric-value">{hotLeads}</span>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-icon-box warning">
            <TrendingUp size={22} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Avg. Lead Score</span>
            <span className="metric-value">{avgScore}%</span>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-icon-box danger">
            <DollarSign size={22} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Est. Pipeline Value</span>
            <span className="metric-value">{formatCurrency(pipelineValue)}</span>
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="dashboard-content-layout">
        
        {/* Left Side: Lead Feed */}
        <div className="glass-card leads-pane">
          <div className="pane-header flex-between" style={{ padding: '1rem 1.25rem' }}>
            <h3 className="pane-title">Active Leads</h3>
            <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              {['All', 'Hot', 'Pending', 'Archived'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    background: filter === tab ? 'var(--color-primary-glow)' : 'transparent',
                    border: 'none',
                    color: filter === tab ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="leads-list">
            {filteredLeads.length === 0 ? (
              <div className="empty-placeholder" style={{ padding: '3rem 1rem' }}>
                <AlertCircle size={32} className="empty-placeholder-icon" />
                <p style={{ fontSize: '0.85rem' }}>No leads matching this filter.</p>
              </div>
            ) : (
              filteredLeads.map(lead => {
                const isSelected = lead.id === selectedLeadId;
                const isHot = lead.score >= threshold;
                return (
                  <div
                    key={lead.id}
                    className={`lead-item-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                    <div className="lead-card-header">
                      <span className="lead-card-name">{lead.name || 'Anonymous Lead'}</span>
                      <span className={`score-badge ${isHot ? 'hot' : lead.score >= 40 ? 'warm' : 'cold'}`}>
                        {lead.score}%
                      </span>
                    </div>
                    
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                      {lead.company || 'Independent/No Company'}
                    </div>

                    <div className="lead-card-meta flex-between">
                      <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} />
                        {new Date(lead.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {lead.phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-success)', fontWeight: '600' }}>
                          <Phone size={10} /> Call Ready
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Lead Details Panel */}
        <div className="glass-card detail-pane">
          {!displayLead ? (
            <div className="empty-placeholder">
              <Users size={64} className="empty-placeholder-icon" />
              <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>No Lead Selected</h3>
              <p style={{ color: 'var(--color-text-muted)', maxWidth: '320px', fontSize: '0.9rem' }}>
                Select a lead from the active feed to analyze their BANT parameters and retrieve direct contact number details.
              </p>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="detail-header">
                <div className="detail-header-left">
                  <span className="detail-name">{displayLead.name || 'Anonymous Lead'}</span>
                  <span className="detail-company">{displayLead.company || 'Company Unspecified'}</span>
                  {visitorSessions.length > 1 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Session:</span>
                      <select 
                        value={selectedLeadId} 
                        onChange={(e) => setSelectedLeadId(e.target.value)}
                        style={{
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid var(--border-color)',
                          color: '#f1f5f9',
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {visitorSessions.map((sess, idx) => (
                          <option key={sess.id} value={sess.id}>
                            {new Date(sess.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ({sess.score}%)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {/* Status Badges */}
                  <span className={`badge ${displayLead.score >= threshold ? 'qualified' : 'pending'}`}>
                    {displayLead.score >= threshold ? 'Highly Qualified' : 'Pending Review'}
                  </span>
                  
                  {/* Actions */}
                  {displayLead.status !== 'Archived' ? (
                    <button 
                      className="action-badge" 
                      onClick={() => handleStatusChange(displayLead.id, 'Archived')}
                      title="Archive Lead"
                    >
                      <Archive size={14} /> Archive
                    </button>
                  ) : (
                    <button 
                      className="action-badge" 
                      onClick={() => handleStatusChange(displayLead.id, 'Pending')}
                      title="Restore Lead"
                    >
                      <CheckCircle size={14} /> Restore
                    </button>
                  )}
                </div>
              </div>

              {/* Detail Grid */}
              <div className="detail-body-grid">
                
                {/* Info Column */}
                <div className="info-column">
                  
                  {/* 1. PRIMARY CONTACT CARD (Requested by user: phone number highly visible) */}
                  <div className="contact-highlight-card">
                    <div className="contact-card-label">
                      <Phone size={12} /> Primary Sales Contact
                    </div>
                    
                    {displayLead.phone ? (
                      <>
                        <a 
                          href={`tel:${displayLead.phone}`} 
                          className="contact-phone-link"
                          title="Click to dial number"
                        >
                          {displayLead.phone}
                        </a>
                        <p style={{ fontSize: '0.75rem', color: '#c7d2fe', marginBottom: '1rem', lineHeight: '1.4' }}>
                          Out-of-app outreach is required. Click the number above to launch your phone app or dial directly.
                        </p>
                        
                        <div className="contact-action-row">
                          <button 
                            className="btn btn-secondary" 
                            style={{ flexGrow: 1, padding: '0.5rem', fontSize: '0.8rem', borderRadius: '8px' }}
                            onClick={() => handleCopyNumber(displayLead.phone)}
                          >
                            {copied ? (
                              <><Check size={14} color="#10b981" /> Copied</>
                            ) : (
                              <><Copy size={14} /> Copy Number</>
                            )}
                          </button>
                          
                          {displayLead.email && (
                            <a 
                              href={`mailto:${displayLead.email}`}
                              className="btn btn-secondary"
                              style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                              title="Email Lead"
                            >
                              <Mail size={14} />
                            </a>
                          )}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: '#fda4af', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertCircle size={16} />
                        <span>No contact number extracted yet.</span>
                      </div>
                    )}
                  </div>

                  {/* 2. Score Indicator */}
                  <div className="score-widget-container" style={{ padding: '1.25rem' }}>
                    <svg width="60" height="60" className="score-circle-svg" style={{ flexShrink: 0 }}>
                      <circle cx="30" cy="30" r="24" className="score-circle-bg" strokeWidth="6" />
                      <circle 
                        cx="30" 
                        cy="30" 
                        r="24" 
                        className="score-circle-fill"
                        strokeWidth="6"
                        stroke={displayLead.score >= threshold ? '#10b981' : displayLead.score >= 40 ? '#f59e0b' : '#f43f5e'}
                        strokeDasharray={2 * Math.PI * 24}
                        strokeDashoffset={2 * Math.PI * 24 * (1 - displayLead.score / 100)}
                      />
                    </svg>
                    <div className="score-widget-info">
                      <span className="score-widget-label" style={{ fontSize: '0.7rem' }}>AI Graded Score</span>
                      <span className="score-widget-value" style={{ fontSize: '1.75rem' }}>{displayLead.score}%</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Conversion probability is {displayLead.score >= threshold ? 'HIGH' : displayLead.score >= 40 ? 'MEDIUM' : 'LOW'}.
                      </span>
                    </div>
                  </div>

                  {/* 3. BANT Attributes */}
                  <div>
                    <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: '700', letterSpacing: '0.05em' }}>
                      BANT Struct Variables
                    </h4>
                    <div className="bant-grid">
                      <div className="bant-item flex-between" style={{ padding: '0.75rem 1rem' }}>
                        <div>
                          <div className="bant-label">Product</div>
                          <div className="bant-value">{displayLead.criteria?.product || 'Unspecified'}</div>
                        </div>
                        <span style={{ color: displayLead.criteria?.product ? 'var(--color-success)' : 'var(--color-text-dark)' }}>
                          <CheckCircle size={16} />
                        </span>
                      </div>

                      <div className="bant-item flex-between" style={{ padding: '0.75rem 1rem' }}>
                        <div>
                          <div className="bant-label">Scale / Quantity</div>
                          <div className="bant-value">{displayLead.criteria?.quantity || 'Unspecified'}</div>
                        </div>
                        <span style={{ color: displayLead.criteria?.quantity ? 'var(--color-success)' : 'var(--color-text-dark)' }}>
                          <CheckCircle size={16} />
                        </span>
                      </div>

                      <div className="bant-item flex-between" style={{ padding: '0.75rem 1rem' }}>
                        <div>
                          <div className="bant-label">Estimated Budget</div>
                          <div className="bant-value" style={{ color: displayLead.criteria?.budget ? 'var(--color-warning)' : 'inherit', fontWeight: displayLead.criteria?.budget ? '700' : 'inherit' }}>
                            {displayLead.criteria?.budget || 'Unspecified'}
                          </div>
                        </div>
                        <span style={{ color: displayLead.criteria?.budget ? 'var(--color-success)' : 'var(--color-text-dark)' }}>
                          <CheckCircle size={16} />
                        </span>
                      </div>

                      <div className="bant-item flex-between" style={{ padding: '0.75rem 1rem' }}>
                        <div>
                          <div className="bant-label">Timeline</div>
                          <div className="bant-value">{displayLead.criteria?.timeline || 'Unspecified'}</div>
                        </div>
                        <span style={{ color: displayLead.criteria?.timeline ? 'var(--color-success)' : 'var(--color-text-dark)' }}>
                          <CheckCircle size={16} />
                        </span>
                      </div>

                      <div className="bant-item flex-between" style={{ padding: '0.75rem 1rem' }}>
                        <div>
                          <div className="bant-label">Organization Location</div>
                          <div className="bant-value" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <MapPin size={12} color="var(--color-text-muted)" />
                            {displayLead.criteria?.location || 'Unspecified'}
                          </div>
                        </div>
                        <span style={{ color: displayLead.criteria?.location ? 'var(--color-success)' : 'var(--color-text-dark)' }}>
                          <CheckCircle size={16} />
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Transcript Column */}
                <div className="transcript-column">
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '1rem', fontWeight: '700', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MessageSquare size={14} /> Full Qualification Chat Logs
                  </h4>
                  
                  <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '0.5rem' }}>
                    {selectedLeadDetails?.transcript ? (
                      selectedLeadDetails.transcript.map((msg, index) => (
                        <div 
                          key={index} 
                          style={{ 
                            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            background: msg.sender === 'user' ? 'rgba(148, 214, 125, 0.15)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid',
                            borderColor: msg.sender === 'user' ? 'rgba(148, 214, 125, 0.25)' : 'var(--border-color)',
                            padding: '0.75rem 1rem',
                            borderRadius: '12px',
                            borderBottomRightRadius: msg.sender === 'user' ? '2px' : '12px',
                            borderBottomLeftRadius: msg.sender === 'bot' ? '2px' : '12px',
                          }}
                        >
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', fontWeight: '700', textTransform: 'uppercase' }}>
                            {msg.sender === 'user' ? 'Lead' : 'AI Assistant'}
                          </div>
                          <div style={{ fontSize: '0.9rem', lineHeight: '1.45', color: '#f1f5f9' }}>
                            {msg.text}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                        Loading chat transcripts...
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
