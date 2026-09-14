import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { NotificationDrawer } from './components/layout/NotificationDrawer';
import { ComplaintList } from './components/complaints/ComplaintList';
import { NewComplaintModal } from './components/complaints/NewComplaintModal';
import { ComplaintDetailDrawer } from './components/complaints/ComplaintDetailDrawer';
import { CustomerHistoryModal } from './components/complaints/CustomerHistoryModal';
import { TechnicianFieldPortal } from './components/technician/TechnicianFieldPortal';
import { CustomerPublicPortal } from './components/customer/CustomerPublicPortal';
import { AnalyticsDashboard } from './components/admin/AnalyticsDashboard';
import { TemplateManager } from './components/admin/TemplateManager';
import { StaffTechnicianManager } from './components/admin/StaffTechnicianManager';
import { OnboardingTour } from './components/common/OnboardingTour';
import { LoginPage } from './components/auth/LoginPage';
import { api } from './api/client';
import { 
  Sparkles, Compass, RotateCcw, CheckCircle2, 
  Users, Wrench, Shield, BarChart3, Search, Plus 
} from 'lucide-react';

function getTrackingInfoFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/^\/track(?:\/([^\/?#]+))?/i);
  if (match) {
    return {
      isTracking: true,
      ticketId: match[1] ? decodeURIComponent(match[1]) : ''
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const trackParam = searchParams.get('track');
  if (trackParam) {
    return {
      isTracking: true,
      ticketId: trackParam
    };
  }

  const hash = window.location.hash;
  const hashMatch = hash.match(/^#\/?track(?:\/([^\/?#]+))?/i);
  if (hashMatch) {
    return {
      isTracking: true,
      ticketId: hashMatch[1] ? decodeURIComponent(hashMatch[1]) : ''
    };
  }

  return { isTracking: false, ticketId: '' };
}

function AppContent() {
  const { currentUser, loading, switchRole } = useAuth();
  const [trackingInfo, setTrackingInfo] = useState(() => getTrackingInfoFromUrl());

  const [currentTab, setCurrentTab] = useState(() => {
    if (currentUser?.role === 'technician') return 'technician';
    if (currentUser?.role === 'customer') return 'customer';
    return 'complaints';
  });

  // Listen to browser forward/back buttons for URL tracking
  useEffect(() => {
    const handleLocationChange = () => {
      setTrackingInfo(getTrackingInfoFromUrl());
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Modals & Drawers state (MUST be declared before early returns per React Rules of Hooks)
  const [isNewComplaintOpen, setIsNewComplaintOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [selectedComplaintId, setSelectedComplaintId] = useState(null);
  const [historyPhone, setHistoryPhone] = useState(null);

  // Onboarding Tour state
  const [isTourOpen, setIsTourOpen] = useState(() => {
    return !localStorage.getItem('egs_cms_tour_completed');
  });

  // Refresh trigger counter for child components when demo data is reloaded
  const [refreshKey, setRefreshKey] = useState(0);
  const [resetSuccessToast, setResetSuccessToast] = useState(false);

  // Standalone tracking portal route: accessed via /track/:ticketId (Zero staff chrome)
  if (trackingInfo.isTracking) {
    return (
      <CustomerPublicPortal
        initialTicketId={trackingInfo.ticketId}
        isStandalone={true}
        onExitStandalone={() => {
          window.history.pushState(null, '', '/');
          setTrackingInfo({ isTracking: false, ticketId: '' });
        }}
        onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
      />
    );
  }

  // Keep tab aligned when role changes
  useEffect(() => {
    if (currentUser?.role === 'technician') {
      setCurrentTab('technician');
    } else if (currentUser?.role === 'customer') {
      setCurrentTab('customer');
    } else if (currentUser?.role === 'staff' && ['analytics', 'templates', 'team'].includes(currentTab)) {
      setCurrentTab('complaints');
    }
  }, [currentUser?.role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-bold text-emerald-400">Loading Eco Green Solar Workspace...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onSwitchToCustomer={() => switchRole('customer')} />;
  }

  const handleReloadDemoData = async () => {
    if (!window.confirm('Are you sure you want to refresh sample demo complaints? All your newly created complaints will remain safe.')) {
      return;
    }
    try {
      api.resetDemoData();
      try {
        await fetch('/api/demo/reset', { method: 'POST' });
      } catch (e) {
        // Backend offline, local mock already reset
      }
      setRefreshKey(k => k + 1);
      setResetSuccessToast(true);
      setTimeout(() => setResetSuccessToast(false), 3500);
    } catch (err) {
      alert('Failed to reset demo data: ' + err.message);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 font-sans">
      {/* Top Main Navigation (Sticky Header) */}
      <div className="shrink-0 z-30">
        <Navbar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
          onToggleNotificationDrawer={() => setIsNotificationDrawerOpen(!isNotificationDrawerOpen)}
          onOpenTour={() => setIsTourOpen(true)}
          onReloadDemoData={handleReloadDemoData}
        />
      </div>

      {/* Demo Mode & Quick Tour Banner (Shrink-0) */}
      <div className="shrink-0 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white px-4 py-2 text-xs shadow-xs z-20">
        <div className="max-w-[1780px] w-full mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
            </span>
            <span className="font-semibold text-emerald-100">
              ✨ Interactive System:
            </span>
            <span className="text-slate-200 hidden md:inline">
              12+ Preloaded Complaints (Rooftop Solar, Water Heaters & Heat Pumps) with live WhatsApp & Email simulation.
            </span>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setIsTourOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 shadow-xs transition-colors"
            >
              <Compass className="w-3 h-3" />
              <span>Step-by-Step Tour</span>
            </button>

            <button
              onClick={handleReloadDemoData}
              className="bg-white/10 hover:bg-white/20 text-emerald-100 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reload 12+ Dummy Tickets</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {resetSuccessToast && (
        <div className="fixed bottom-14 right-6 z-50 bg-emerald-800 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>Demo Data successfully reset with 12+ realistic complaints!</span>
        </div>
      )}

      {/* Main Page Content — Spreads horizontally on wide screens, responsive on mobile */}
      <main className="flex-1 overflow-y-auto min-h-0 max-w-[1780px] w-full mx-auto p-3 sm:p-5 lg:p-6">
        {currentTab === 'complaints' && (
          <ComplaintList
            key={`comp-${refreshKey}`}
            refreshKey={refreshKey}
            onSelectComplaint={(id) => setSelectedComplaintId(id)}
            onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
          />
        )}

        {currentTab === 'technician' && (
          <TechnicianFieldPortal
            key={`tech-${refreshKey}`}
            onSelectComplaint={(id) => setSelectedComplaintId(id)}
          />
        )}

        {currentTab === 'team' && (
          <StaffTechnicianManager
            key={`team-${refreshKey}`}
          />
        )}

        {currentTab === 'analytics' && (
          <AnalyticsDashboard key={`ana-${refreshKey}`} />
        )}

        {currentTab === 'templates' && (
          <TemplateManager key={`tmpl-${refreshKey}`} />
        )}

        {currentTab === 'customer' && (
          <CustomerPublicPortal
            key={`cust-${refreshKey}`}
            onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (App-like navigation on Android / iOS) */}
      <nav className="md:hidden shrink-0 bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around z-30 shadow-lg">
        {/* Complaints Desk */}
        {['admin', 'staff'].includes(currentUser?.role) && (
          <button
            onClick={() => setCurrentTab('complaints')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
              currentTab === 'complaints' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'
            }`}
          >
            <Users className="w-4 h-4 mb-0.5" />
            <span>Complaints</span>
          </button>
        )}

        {/* Field Ops / Technician */}
        {['admin', 'staff', 'technician'].includes(currentUser?.role) && (
          <button
            onClick={() => setCurrentTab('technician')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
              currentTab === 'technician' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'
            }`}
          >
            <Wrench className="w-4 h-4 mb-0.5" />
            <span>Field Ops</span>
          </button>
        )}

        {/* Staff/Techs (Admin only) */}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => setCurrentTab('team')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
              currentTab === 'team' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'
            }`}
          >
            <Shield className="w-4 h-4 mb-0.5" />
            <span>Team</span>
          </button>
        )}

        {/* Analytics (Admin only) */}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => setCurrentTab('analytics')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
              currentTab === 'analytics' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'
            }`}
          >
            <BarChart3 className="w-4 h-4 mb-0.5" />
            <span>Analytics</span>
          </button>
        )}

        {/* Customer Public View */}
        {currentUser?.role === 'customer' && (
          <button
            onClick={() => setCurrentTab('customer')}
            className="flex flex-col items-center py-1 px-3 rounded-xl text-[10px] font-bold text-emerald-700 bg-emerald-50"
          >
            <Search className="w-4 h-4 mb-0.5" />
            <span>Track & Help</span>
          </button>
        )}

        {/* Quick New Ticket (Staff & Admin) */}
        {['admin', 'staff'].includes(currentUser?.role) && (
          <button
            onClick={() => setIsNewComplaintOpen(true)}
            className="flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold text-emerald-700 hover:text-emerald-800"
          >
            <Plus className="w-4 h-4 mb-0.5 text-emerald-600" />
            <span>+ Ticket</span>
          </button>
        )}
      </nav>

      {/* Sticky Single-Page Footer — Pinned at bottom on desktop */}
      <footer className="hidden sm:block shrink-0 bg-white border-t border-slate-200 py-2.5 px-4 text-center text-xs text-slate-500 font-medium z-10 shadow-xs">
        <p>© 2026 Eco Green Solar — Complaint Management System (CMS). Solar Rooftop Systems • Solar Water Heaters • Heat Pumps</p>
      </footer>

      {/* Global Modals & Slide-over Panels */}
      <NewComplaintModal
        isOpen={isNewComplaintOpen}
        onClose={() => setIsNewComplaintOpen(false)}
        onComplaintCreated={(newTicket) => {
          // Refresh complaints list without popping drawer underneath success modal
          setRefreshKey(k => k + 1);
        }}
        onViewComplaint={(ticketId) => {
          setSelectedComplaintId(ticketId);
        }}
      />

      <ComplaintDetailDrawer
        complaintId={selectedComplaintId}
        isOpen={Boolean(selectedComplaintId)}
        onClose={() => setSelectedComplaintId(null)}
        onComplaintUpdated={() => setRefreshKey(k => k + 1)}
        onViewCustomerHistory={(phone) => setHistoryPhone(phone)}
      />

      <CustomerHistoryModal
        phone={historyPhone}
        isOpen={Boolean(historyPhone)}
        onClose={() => setHistoryPhone(null)}
        onSelectTicket={(ticketId) => setSelectedComplaintId(ticketId)}
      />

      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
      />

      {/* Interactive Feature Walkthrough Tour */}
      <OnboardingTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onSwitchTab={(targetTab) => setCurrentTab(targetTab)}
      />
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('UI Crash caught by ErrorBoundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="bg-slate-800 p-8 rounded-3xl border border-rose-500/30 max-w-md shadow-2xl space-y-4">
            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
              ⚠️
            </div>
            <h2 className="text-lg font-black text-white">Application Error</h2>
            <p className="text-xs text-slate-400 font-mono bg-slate-900/60 p-3 rounded-xl break-all">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition-colors"
            >
              Clear Storage & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
