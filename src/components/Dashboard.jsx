import React, { useState, useEffect } from 'react';
import { useLeads } from '../context/LeadContext';
import { 
  Users, Sparkles, TrendingUp, AlertCircle, Phone, Mail, 
  MapPin, Calendar, DollarSign, Archive, CheckCircle, Clock, 
  Copy, Check, LogOut, ChevronRight, MessageSquare, Upload, Edit2, Save, X 
} from 'lucide-react';

const Dashboard = () => {
  const { 
    leads, 
    threshold, 
    updateLeadStatus, 
    logoutAdmin,
    products,
    importProducts,
    updateProductSettings
  } = useLeads();
  
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id || null);
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);
  const [visitorSessions, setVisitorSessions] = useState([]);
  const [filter, setFilter] = useState('All'); // All, Hot, Pending, Archived
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('leads'); // leads, catalog
  const [editingSku, setEditingSku] = useState(null);
  const [editBulkPrice, setEditBulkPrice] = useState('');
  const [editBulkEnabled, setEditBulkEnabled] = useState(true);
  const [csvError, setCsvError] = useState('');

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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      try {
        const lines = text.split('\n');
        if (lines.length < 2) {
          setCsvError('CSV file must have at least a header row and one data row.');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        if (!headers.some(h => h.includes('sku'))) {
          setCsvError('CSV file must contain an "sku" column.');
          return;
        }
        if (!headers.some(h => h.includes('title'))) {
          setCsvError('CSV file must contain a "title" column.');
          return;
        }

        const parsedProducts = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Split by comma handling optional quoted values
          const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());

          const prod = {
            number: i,
            title: '',
            sku: '',
            variant_price: 0,
            bulk_price: 0,
            bulk_enabled: true
          };

          headers.forEach((header, index) => {
            const val = values[index];
            if (val === undefined) return;

            if (header.includes('variant') || header === 'variant_price' || (header.includes('price') && !header.includes('bulk'))) {
              prod.variant_price = parseFloat(val) || 0;
            } else if (header.includes('bulk') && (header.includes('price') || header === 'bulk_price')) {
              prod.bulk_price = parseFloat(val) || 0;
            } else if (header.includes('enabled') || header.includes('bulk enabled') || header === 'bulk_enabled') {
              prod.bulk_enabled = val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'yes' || val.toLowerCase() === 'checked';
            } else if (header === 'number' || header === 'no' || header === 'id') {
              prod.number = parseInt(val, 10) || i;
            } else if (header === 'title') {
              prod.title = val;
            } else if (header === 'sku') {
              prod.sku = val;
            }
          });

          if (prod.sku && prod.title) {
            parsedProducts.push(prod);
          }
        }

        if (parsedProducts.length === 0) {
          setCsvError('No valid rows could be parsed from the CSV.');
          return;
        }

        setCsvError('');
        const success = await importProducts(parsedProducts);
        if (success) {
          alert(`Successfully imported ${parsedProducts.length} products!`);
        } else {
          setCsvError('Failed to save imported products to server.');
        }
      } catch (err) {
        console.error('Error parsing CSV:', err);
        setCsvError('Invalid CSV formatting. Please check the file.');
      }
    };
    reader.readAsText(file);
  };

  const handleEditClick = (product) => {
    setEditingSku(product.sku);
    setEditBulkPrice(product.bulk_price);
    setEditBulkEnabled(product.bulk_enabled);
  };

  const handleSaveProduct = async (sku) => {
    const success = await updateProductSettings(sku, editBulkPrice, editBulkEnabled);
    if (success) {
      setEditingSku(null);
    } else {
      alert('Failed to update product details.');
    }
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

      {/* Admin Tab Switcher */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setActiveTab('leads')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'leads' ? '2px solid var(--color-primary-light)' : 'none',
            color: activeTab === 'leads' ? '#f1f5f9' : 'var(--color-text-muted)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        >
          Leads Feed
        </button>
        <button 
          onClick={() => setActiveTab('catalog')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'catalog' ? '2px solid var(--color-primary-light)' : 'none',
            color: activeTab === 'catalog' ? '#f1f5f9' : 'var(--color-text-muted)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        >
          Product Catalog
        </button>
      </div>

      {/* Metrics Row */}
      {activeTab === 'leads' ? (
        <>
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
      </>
      ) : (
        <div className="glass-card" style={{ padding: '2rem', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', color: '#f1f5f9', marginBottom: '0.25rem' }}>
                Inventory Product Catalog
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                Import CSV spreadsheets containing SKU numbers, titles, and variant prices, then manage bulk pricing thresholds.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label 
                className="btn btn-primary" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  cursor: 'pointer',
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem'
                }}
              >
                <Upload size={16} />
                Import CSV File
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileUpload} 
                  style={{ display: 'none' }} 
                />
              </label>
            </div>
          </div>

          {csvError && (
            <div style={{ background: 'var(--color-danger-glow)', border: '1px solid rgba(244,63,94,0.3)', color: '#fda4af', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              ⚠️ {csvError}
            </div>
          )}

          {products.length === 0 ? (
            <div className="empty-placeholder" style={{ padding: '6rem 1rem', textAlign: 'center' }}>
              <Upload size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', opacity: '0.5' }} />
              <h4 style={{ color: '#e2e8f0', fontSize: '1.1rem', marginBottom: '0.5rem' }}>No Products Loaded</h4>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', maxWidth: '380px', margin: '0 auto' }}>
                Please import a `.csv` file with columns for **number, title, sku, variant price, bulk price, bulk enabled** to initialize the AI qualification catalogue.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', flexGrow: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--color-text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>#</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>SKU</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Product Name</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Variant Price</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Bulk Price</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Bulk Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: '700', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod, idx) => {
                    const isEditing = editingSku === prod.sku;
                    return (
                      <tr key={prod.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', verticalAlign: 'middle', transition: 'background 0.2s' }}>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--color-text-muted)' }}>{prod.number || idx + 1}</td>
                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontWeight: '600' }}>{prod.sku}</td>
                        <td style={{ padding: '0.85rem 1rem', color: '#f1f5f9', fontWeight: '600' }}>{prod.title}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>Rs. {prod.variant_price}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editBulkPrice}
                              onChange={(e) => setEditBulkPrice(e.target.value)}
                              style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                padding: '0.2rem 0.5rem',
                                color: '#fff',
                                width: '80px',
                                fontSize: '0.85rem'
                              }}
                            />
                          ) : (
                            <span>Rs. {prod.bulk_price}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isEditing ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={editBulkEnabled}
                                onChange={(e) => setEditBulkEnabled(e.target.checked)}
                                style={{ accentColor: 'var(--color-primary)' }}
                              />
                              <span style={{ fontSize: '0.75rem' }}>Bulk Enabled</span>
                            </label>
                          ) : (
                            <span className={`badge ${prod.bulk_enabled ? 'qualified' : 'pending'}`} style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}>
                              {prod.bulk_enabled ? 'Bulk Enabled' : 'Disabled'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button 
                                className="action-badge" 
                                onClick={() => handleSaveProduct(prod.sku)} 
                                style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                                title="Save"
                              >
                                <Save size={14} />
                              </button>
                              <button 
                                className="action-badge" 
                                onClick={() => setEditingSku(null)} 
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button 
                              className="action-badge" 
                              onClick={() => handleEditClick(prod)} 
                              style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-primary-light)', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                              title="Edit Bulk Configuration"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
