import React, { createContext, useState, useEffect, useContext } from 'react';

const LeadContext = createContext();

export const LeadProvider = ({ children }) => {
  const [leads, setLeads] = useState([]);
  const [activeChatId, setActiveChatId] = useState(() => {
    return localStorage.getItem('qualiflow_active_chat_id') || '';
  });
  const [customerChatId, setCustomerChatId] = useState(() => {
    return sessionStorage.getItem('qualiflow_customer_chat_id') || '';
  });
  const [customerLeadDetails, setCustomerLeadDetails] = useState(null);
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem('qualiflow_threshold');
    return saved ? parseInt(saved, 10) : 70;
  });
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return sessionStorage.getItem('qualiflow_admin_auth') === 'true';
  });
  const [activeLeadDetails, setActiveLeadDetails] = useState(null);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Sync activeChatId to localStorage for reload persistence
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('qualiflow_active_chat_id', activeChatId);
    } else {
      localStorage.removeItem('qualiflow_active_chat_id');
    }
  }, [activeChatId]);

  // Sync customerChatId to sessionStorage for reload persistence
  useEffect(() => {
    if (customerChatId) {
      sessionStorage.setItem('qualiflow_customer_chat_id', customerChatId);
    } else {
      sessionStorage.removeItem('qualiflow_customer_chat_id');
    }
  }, [customerChatId]);

  // Load detailed customer lead transcript when customerChatId changes
  useEffect(() => {
    const fetchCustomerLeadDetails = async () => {
      if (!customerChatId) {
        setCustomerLeadDetails(null);
        return;
      }
      try {
        const res = await fetch(`/api/leads/${customerChatId}`);
        if (res.ok) {
          const data = await res.json();
          setCustomerLeadDetails(data);
        }
      } catch (err) {
        console.error('Error fetching customer lead details:', err);
      }
    };
    fetchCustomerLeadDetails();
  }, [customerChatId]);

  // Sync threshold
  useEffect(() => {
    localStorage.setItem('qualiflow_threshold', threshold.toString());
  }, [threshold]);

  // Load all leads on mount and when admin logs in
  const fetchLeads = async () => {
    setLoadingLeads(true);
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [isAdminLoggedIn]);

  // Load detailed lead transcript when activeChatId changes
  useEffect(() => {
    const fetchActiveLeadDetails = async () => {
      if (!activeChatId) {
        setActiveLeadDetails(null);
        return;
      }
      try {
        const res = await fetch(`/api/leads/${activeChatId}`);
        if (res.ok) {
          const data = await res.json();
          setActiveLeadDetails(data);
        }
      } catch (err) {
        console.error('Error fetching lead details:', err);
      }
    };

    fetchActiveLeadDetails();
    
    // Set up a polling interval for the active lead if admin is viewing, so real-time chats sync
    let interval;
    if (isAdminLoggedIn && activeChatId) {
      interval = setInterval(fetchActiveLeadDetails, 3000);
    }
    return () => clearInterval(interval);
  }, [activeChatId, isAdminLoggedIn]);

  // Admin Operations
  const loginAdmin = async (username, password) => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        setIsAdminLoggedIn(true);
        sessionStorage.setItem('qualiflow_admin_auth', 'true');
        return true;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  };

  const logoutAdmin = () => {
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem('qualiflow_admin_auth');
  };

  const getVisitorId = () => {
    let id = localStorage.getItem('qualiflow_visitor_id');
    if (!id) {
      id = 'vis-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('qualiflow_visitor_id', id);
    }
    return id;
  };

  // Lead Operations
  const createNewLeadChat = async () => {
    const visitorId = getVisitorId();
    try {
      const res = await fetch('/api/leads', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId })
      });
      if (res.ok) {
        const newLead = await res.json();
        setLeads(prev => [newLead, ...prev]);
        setActiveChatId(newLead.id);
        setActiveLeadDetails(newLead);
        return newLead.id;
      }
    } catch (err) {
      console.error('Error creating new lead:', err);
    }
    return null;
  };

  // Look up returning lead by name & phone (Pre-Chat Lead Form)
  const lookupLeadByPhone = async (name, phone, email) => {
    const visitorId = getVisitorId();
    try {
      const res = await fetch('/api/leads/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, visitorId })
      });
      if (res.ok) {
        const lead = await res.json();
        setCustomerChatId(lead.id);
        setCustomerLeadDetails(lead);
        
        // Update leads feed list if admin is viewing
        setLeads(prev => {
          const exists = prev.some(l => l.id === lead.id);
          if (exists) {
            return prev.map(l => l.id === lead.id ? { ...l, ...lead } : l);
          } else {
            return [lead, ...prev];
          }
        });
        return lead.id;
      }
    } catch (err) {
      console.error('Error during lead lookup:', err);
    }
    return null;
  };

  // Sends message to backend and returns bot reply
  const sendMessage = async (leadId, text) => {
    try {
      // Optimistically append user message to local active transcript for instant display
      if (activeLeadDetails && activeLeadDetails.id === leadId) {
        setActiveLeadDetails(prev => ({
          ...prev,
          transcript: [...prev.transcript, { sender: 'user', text }]
        }));
      }
      if (customerLeadDetails && customerLeadDetails.id === leadId) {
        setCustomerLeadDetails(prev => ({
          ...prev,
          transcript: [...prev.transcript, { sender: 'user', text }]
        }));
      }

      const res = await fetch(`/api/leads/${leadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (res.ok) {
        const updatedLead = await res.json();
        
        // Update local active lead details (which includes the new transcript and BANT metrics)
        if (activeChatId === leadId) {
          // Fetch full detailed logs to ensure exact transcript ordering
          const detailRes = await fetch(`/api/leads/${leadId}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setActiveLeadDetails(detailData);
          }
        }
        if (customerChatId === leadId) {
          const detailRes = await fetch(`/api/leads/${leadId}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setCustomerLeadDetails(detailData);
          }
        }
        
        // Update leads feed list
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updatedLead } : l));
        return updatedLead;
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
    return null;
  };

  // Update lead status (e.g., Qualified, Pending, Archived)
  const updateLeadStatus = async (leadId, status) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
        if (activeLeadDetails && activeLeadDetails.id === leadId) {
          setActiveLeadDetails(prev => ({ ...prev, status }));
        }
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Seed simulated data in Neon DB
  const addMockLeadsOnBackend = async (type) => {
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (res.ok) {
        fetchLeads();
      }
    } catch (err) {
      console.error('Error seeding leads:', err);
    }
  };

  // Wipe database tables
  const clearAllLeadsOnBackend = async () => {
    try {
      const res = await fetch('/api/admin/clear', { method: 'POST' });
      if (res.ok) {
        setLeads([]);
        setActiveChatId('');
        setActiveLeadDetails(null);
      }
    } catch (err) {
      console.error('Error clearing leads:', err);
    }
  };

  return (
    <LeadContext.Provider value={{
      leads,
      activeChatId,
      setActiveChatId,
      customerChatId,
      setCustomerChatId,
      customerLeadDetails,
      lookupLeadByPhone,
      threshold,
      setThreshold,
      isAdminLoggedIn,
      loginAdmin,
      logoutAdmin,
      createNewLeadChat,
      sendMessage,
      updateLeadStatus,
      addMockLeads: addMockLeadsOnBackend,
      clearAllLeads: clearAllLeadsOnBackend,
      activeLeadDetails,
      loadingLeads,
      fetchLeads
    }}>
      {children}
    </LeadContext.Provider>
  );
};

export const useLeads = () => useContext(LeadContext);
