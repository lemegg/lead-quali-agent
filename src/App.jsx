import React, { useState, useEffect } from 'react';
import { LeadProvider, useLeads } from './context/LeadContext';
import ChatInterface from './components/ChatInterface';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import AdminLogin from './components/AdminLogin';
import { MessageSquare, LayoutDashboard, Settings as SettingsIcon, ShieldCheck, Lock, ExternalLink } from 'lucide-react';

const AppContent = () => {
  const { isAdminLoggedIn } = useLeads();
  const [activeTab, setActiveTab] = useState('dashboard'); // Default tab for logged-in admin: dashboard, chat, settings
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Simple client-side router
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for history popstate events (e.g., back/forward buttons)
    window.addEventListener('popstate', handleLocationChange);
    
    // Also periodically inspect path in case of client-side navigation pushing
    const interval = setInterval(() => {
      if (window.location.pathname !== currentPath) {
        setCurrentPath(window.location.pathname);
      }
    }, 200);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(interval);
    };
  }, [currentPath]);

  // Determine routing
  // Admins type /admin in URL
  const isAdminRoute = currentPath === '/admin' || window.location.hash === '#/admin';

  // CUSTOMER FLOW: Leads routed to any other page (e.g., /)
  if (!isAdminRoute) {
    return <ChatInterface mode="customer" />;
  }

  // ADMIN FLOW: /admin
  // If admin is NOT logged in, show the secure login card (full page lock)
  if (!isAdminLoggedIn) {
    return <AdminLogin />;
  }

  // If admin IS logged in, show the full dashboard layout with sidebar
  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">Q</div>
          <span className="logo-text">QualiFlow</span>
        </div>

        <nav className="nav-links">
          <button 
            className={`nav-button ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} />
            Sales Dashboard
            <ShieldCheck size={14} color="var(--color-success)" style={{ marginLeft: 'auto' }} />
          </button>

          <button 
            className={`nav-button ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={18} />
            Test Simulator
          </button>
          
          <button 
            className={`nav-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={18} />
            System Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          {/* Quick link to preview the customer-facing site */}
          <a 
            href="/" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              color: 'var(--color-primary)', 
              fontSize: '0.8rem', 
              textDecoration: 'none',
              marginBottom: '1.25rem',
              fontWeight: '600'
            }}
          >
            <ExternalLink size={12} />
            Preview Customer Chat
          </a>

          <div className="user-profile">
            <div className="user-avatar">AD</div>
            <div className="user-info">
              <span className="user-name">Admin Rep</span>
              <span className="user-role">Sales Manager</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Panel Viewport */}
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'chat' && <ChatInterface mode="admin" />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
};

const App = () => {
  return (
    <LeadProvider>
      <AppContent />
    </LeadProvider>
  );
};

export default App;
