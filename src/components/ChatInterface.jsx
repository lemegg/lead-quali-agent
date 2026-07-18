import React, { useState, useRef, useEffect } from 'react';
import { useLeads } from '../context/LeadContext';
import { Send, Sparkles, MessageSquarePlus, RefreshCw, UserCheck, Bot, Building, Smartphone, Calendar, BadgeDollarSign, MapPin } from 'lucide-react';

const ChatInterface = ({ mode = 'admin' }) => {
  const { 
    activeChatId, 
    customerChatId,
    customerLeadDetails,
    lookupLeadByPhone,
    createNewLeadChat, 
    sendMessage,
    activeLeadDetails,
  } = useLeads();

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);
  
  const messagesEndRef = useRef(null);

  const isCustomerMode = mode === 'customer';
  const activeLead = isCustomerMode ? customerLeadDetails : activeLeadDetails;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeLead?.transcript, isTyping]);

  const handleStartNewChat = () => {
    createNewLeadChat();
  };

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activeLead) return;

    if (!textToSend) setInputText('');

    setIsTyping(true);
    
    // Call unified context method which updates the backend and local state
    await sendMessage(activeLead.id, text);
    
    setIsTyping(false);
  };

  const handlePreChatSubmit = async (e) => {
    e.preventDefault();
    if (!leadPhone.trim()) return;
    setSubmittingLead(true);
    await lookupLeadByPhone(leadName, leadPhone, leadEmail);
    setSubmittingLead(false);
  };

  // Quick Action Chips to ease testing/demoing
  const quickChips = [
    "Hi, I want to order 4 Inch Coir Pots in bulk",
    "Looking for Amaryllis & Rain Lily Bulbs Combo",
    "Can I get 150 Betel Paan Saplings?",
    "I need 50 Beginner's Pro Garden Kits",
    "My name is John, phone +91 98765-43210, in Pune",
    "Our nursery has a budget of Rs. 15,000"
  ];

  const renderChatPanelContent = () => {
    if (!activeLead) {
      return (
        <div className="glass-card empty-placeholder" style={{ flexGrow: 1 }}>
          <Sparkles size={64} className="empty-placeholder-icon" style={{ animation: 'pulseGlow 2s infinite' }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontFamily: 'var(--font-display)' }}>No Active Chat Session</h3>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: '380px', marginBottom: '1.5rem' }}>
            Click the button below to start a simulated chat session and test how the agent qualifies prospects.
          </p>
          <button className="btn btn-primary" onClick={handleStartNewChat}>
            Start New Session
          </button>
        </div>
      );
    }

    return (
      <div className="chat-panel" style={{ height: '100%' }}>
        {/* Header */}
        <div className="pane-header flex-between" style={{ background: 'rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="status-indicator active"></span>
            <div>
              <h3 className="pane-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-primary-light)' }}>
                QualiFlow AI Assistant
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {isCustomerMode ? 'Live Chat Support' : `Assisting Lead: ${activeLead.name || 'Anonymous'}`}
              </p>
            </div>
          </div>
          {!isCustomerMode && (
            <div>
              <span className={`score-badge ${activeLead.score >= 70 ? 'hot' : activeLead.score >= 40 ? 'warm' : 'cold'}`}>
                Score: {activeLead.score}%
              </span>
            </div>
          )}
        </div>

        {/* Message Area */}
        <div className="chat-messages" style={{ flexGrow: 1 }}>
          {activeLead.transcript && activeLead.transcript.map((msg, index) => (
            <div key={index} className={`chat-msg-row ${msg.sender}`}>
              <div className="chat-msg-bubble">
                {msg.text}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="typing-indicator">
              <span className="typing-dot"></span>
              <span className="typing-dot"></span>
              <span className="typing-dot"></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick action chips */}
        <div className="chat-chips-container">
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', width: '100%', marginBottom: '0.25rem' }}>
            Suggested responses:
          </span>
          {quickChips.map((chip, idx) => (
            <button 
              key={idx} 
              className="chat-chip"
              onClick={() => handleSend(chip)}
              disabled={isTyping}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form 
          className="chat-input-bar" 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <input
            type="text"
            className="chat-input"
            placeholder="Type your message to the sales agent..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isTyping}
          />
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ padding: '0.75rem 1.25rem' }}
            disabled={isTyping}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    );
  };

  if (isCustomerMode) {
    if (!customerChatId) {
      return (
        <div className="customer-container">
          <div className="glass-card customer-chat-card" style={{ display: 'flex', flexDirection: 'column', padding: '2.5rem', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(148, 214, 125, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                <Bot size={36} color="var(--color-primary-light)" />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: '#f1f5f9', marginBottom: '0.5rem' }}>QualiFlow Botanical Assistant</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', maxWidth: '340px', margin: '0 auto' }}>
                Enter your contact details below to resume your previous conversation or start a new gardening consultation thread.
              </p>
            </div>

            <form onSubmit={handlePreChatSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontWeight: '700' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your name..."
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    color: '#f1f5f9',
                    outline: 'none',
                    fontSize: '0.9rem',
                    width: '100%'
                  }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontWeight: '700' }}>
                  Phone Number <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  required
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    color: '#f1f5f9',
                    outline: 'none',
                    fontSize: '0.9rem',
                    width: '100%'
                  }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontWeight: '700' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="name@example.com (optional)"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    color: '#f1f5f9',
                    outline: 'none',
                    fontSize: '0.9rem',
                    width: '100%'
                  }}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', fontWeight: '600', justifyContent: 'center' }}
                disabled={submittingLead}
              >
                {submittingLead ? (
                  <span>Loading...</span>
                ) : (
                  'Start Consulting Chat'
                )}
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="customer-container">
        <div className="glass-card customer-chat-card">
          {renderChatPanelContent()}
        </div>
      </div>
    );
  }

  // Admin Mode Layout (has header titles & real-time extraction tracker)
  return (
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="view-title">Lead Chat Simulator</h1>
          <p className="view-description">Simulate a customer-facing chat session. The AI agent will steer the conversation to qualify the lead.</p>
        </div>
        <button className="btn btn-primary" onClick={handleStartNewChat}>
          <MessageSquarePlus size={18} />
          Start New Chat
        </button>
      </div>

      <div className="chat-simulator-layout">
        {/* Conversational Screen */}
        <div className="glass-card chat-panel">
          {renderChatPanelContent()}
        </div>

        {/* Real-time BANT Tracker Side Pane */}
        <div className="glass-card chat-side-pane">
          <div className="chat-side-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>
              <Sparkles size={16} />
              Real-Time AI Extraction
            </h3>
          </div>

          {activeLead && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Score Widget */}
              <div className="score-widget-container">
                <svg width="50" height="50" className="score-circle-svg">
                  <circle cx="25" cy="25" r="20" className="score-circle-bg" />
                  <circle 
                    cx="25" 
                    cy="25" 
                    r="20" 
                    className="score-circle-fill"
                    stroke={activeLead.score >= 70 ? '#c3e2b4' : activeLead.score >= 40 ? '#f0e2b4' : '#f0c4b4'}
                    strokeDasharray={2 * Math.PI * 20}
                    strokeDashoffset={2 * Math.PI * 20 * (1 - activeLead.score / 100)}
                  />
                </svg>
                <div className="score-widget-info">
                  <span className="score-widget-label">Likelihood</span>
                  <span className="score-widget-value">{activeLead.score}%</span>
                  <span className="score-widget-status" style={{ color: activeLead.score >= 70 ? 'var(--color-success)' : activeLead.score >= 40 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                    {activeLead.score >= 70 ? 'Hot Lead' : activeLead.score >= 40 ? 'Warm Lead' : 'Cold Lead'}
                  </span>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Contact Details</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="bant-item" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                    <div className="bant-label">Name</div>
                    <div className={`bant-value ${!activeLead.name ? 'empty' : ''}`}>
                      {activeLead.name || 'Not provided'}
                    </div>
                  </div>

                  <div className="bant-item" style={{ borderLeft: '3px solid var(--color-success)' }}>
                    <div className="bant-label">Contact Number</div>
                    <div className={`bant-value ${!activeLead.phone ? 'empty' : ''}`} style={{ color: activeLead.phone ? 'var(--color-primary)' : 'inherit', fontWeight: activeLead.phone ? '700' : 'inherit' }}>
                      {activeLead.phone || 'Not provided'}
                    </div>
                  </div>

                  <div className="bant-item">
                    <div className="bant-label">Company</div>
                    <div className={`bant-value ${!activeLead.company ? 'empty' : ''}`}>
                      {activeLead.company || 'Not provided'}
                    </div>
                  </div>
                </div>
              </div>

              {/* BANT Parameters */}
              <div>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>BANT Qualification</h4>
                <div className="bant-grid">
                  <div className="bant-item">
                    <div className="bant-label">Product</div>
                    <div className={`bant-value ${!activeLead.criteria?.product ? 'empty' : ''}`}>
                      {activeLead.criteria?.product || 'Scanning...'}
                    </div>
                  </div>

                  <div className="bant-item">
                    <div className="bant-label">Scale / Qty</div>
                    <div className={`bant-value ${!activeLead.criteria?.quantity ? 'empty' : ''}`}>
                      {activeLead.criteria?.quantity || 'Awaiting scale...'}
                    </div>
                  </div>

                  <div className="bant-item">
                    <div className="bant-label">Budget</div>
                    <div className={`bant-value ${!activeLead.criteria?.budget ? 'empty' : ''}`}>
                      {activeLead.criteria?.budget || 'Pricing budget not set...'}
                    </div>
                  </div>

                  <div className="bant-item">
                    <div className="bant-label">Timeline</div>
                    <div className={`bant-value ${!activeLead.criteria?.timeline ? 'empty' : ''}`}>
                      {activeLead.criteria?.timeline || 'Timeline unconfirmed...'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
