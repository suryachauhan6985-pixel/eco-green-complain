import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DialogProvider, useDialog } from './context/DialogContext';
import { Navbar } from './components/layout/Navbar';
import { NotificationDrawer } from './components/layout/NotificationDrawer';
import { ComplaintList } from './components/complaints/ComplaintList';
import { NewComplaintModal } from './components/complaints/NewComplaintModal';
import { ComplaintDetailDrawer } from './components/complaints/ComplaintDetailDrawer';
import { LoginPage } from './components/auth/LoginPage';
import { api } from './api/client';
import { 
  Sparkles, Compass, RotateCcw, CheckCircle2, 
  Users, Wrench, Shield, BarChart3, Search, Plus, MessageCircle 
} from 'lucide-react';

// Code-split heavy secondary tabs and dialogs for lightning-fast initial load
const CustomerHistoryModal = React.lazy(() => import('./components/complaints/CustomerHistoryModal').then(m => ({ default: m.CustomerHistoryModal })));
const TechnicianFieldPortal = React.lazy(() => import('./components/technician/TechnicianFieldPortal').then(m => ({ default: m.TechnicianFieldPortal })));
const CustomerPublicPortal = React.lazy(() => import('./components/customer/CustomerPublicPortal').then(m => ({ default: m.CustomerPublicPortal })));
const AnalyticsDashboard = React.lazy(() => import('./components/admin/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const TemplateManager = React.lazy(() => import('./components/admin/TemplateManager').then(m => ({ default: m.TemplateManager })));
const StaffTechnicianManager = React.lazy(() => import('./components/admin/StaffTechnicianManager').then(m => ({ default: m.StaffTechnicianManager })));
const OnboardingTour = React.lazy(() => import('./components/common/OnboardingTour').then(m => ({ default: m.OnboardingTour })));
const WhatsAppWebInbox = React.lazy(() => import('./components/whatsapp/WhatsAppWebInbox').then(m => ({ default: m.WhatsAppWebInbox })));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center p-12 min-h-[260px] w-full text-slate-400">
    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
    <span className="text-xs font-medium text-slate-500">Loading view...</span>
  </div>
);

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

function normalizeTab(tab) {
  if (!tab) return null;
  const t = String(tab).toLowerCase().replace(/^#\/?/, '').replace(/^\/+/, '');
  if (t === 'staff') return 'team';
  if (['complaints', 'technician', 'whatsapp-inbox', 'team', 'analytics', 'templates', 'customer'].includes(t)) {
    return t;
  }
  return null;
}

function AppContent() {
  const { currentUser, loading, switchRole } = useAuth();
  const [trackingInfo, setTrackingInfo] = useState(() => getTrackingInfoFromUrl());

  const getTabFromLocation = () => {
    // 1. Check path (e.g. /complaints, /technician, /analytics, /team, /templates, /whatsapp-inbox)
    const rawPath = window.location.pathname.replace(/^\/+/, '').split('/')[0].toLowerCase();
    const validFromPath = normalizeTab(rawPath);
    if (validFromPath) return validFromPath;

    // 2. Check hash (e.g. #/complaints or #complaints)
    const hash = window.location.hash.replace(/^#\/?/, '').split('/')[0].toLowerCase();
    const validFromHash = normalizeTab(hash);
    if (validFromHash) return validFromHash;

    return 'complaints';
  };

  const [currentTab, setCurrentTab] = useState(() => {
    const fromUrl = getTabFromLocation();
    if (fromUrl && fromUrl !== 'complaints') return fromUrl;
    return 'complaints';
  });

  // Keep URL in sync with currentTab
  const handleTabChange = (tab) => {
    const normalized = normalizeTab(tab) || tab;
    setCurrentTab(normalized);
    try {
      localStorage.setItem('egs_active_tab', normalized);
      window.history.pushState(null, '', `/${normalized}`);
    } catch (e) {}
  };

  // Modals & Drawers state (with URL deep-linking support)
  const [selectedComplaintId, setSelectedComplaintId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('ticket') || null;
    } catch (_) {
      return null;
    }
  });

  const handleSelectComplaint = (id) => {
    setSelectedComplaintId(id);
    try {
      if (id) {
        window.history.pushState(null, '', `/${currentTab}?ticket=${encodeURIComponent(id)}`);
      } else {
        window.history.pushState(null, '', `/${currentTab}`);
      }
    } catch (_) {}
  };

  // Listen to browser forward/back buttons and URL changes
  useEffect(() => {
    const handleLocationChange = () => {
      setTrackingInfo(getTrackingInfoFromUrl());
      const active = getTabFromLocation();
      if (active) setCurrentTab(active);
      const params = new URLSearchParams(window.location.search);
      setSelectedComplaintId(params.get('ticket') || null);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // When user logs in, always focus on the Complaints page and set URL
  useEffect(() => {
    if (currentUser) {
      const fromUrl = getTabFromLocation();
      const target = fromUrl || 'complaints';
      setCurrentTab(target);
      if (!window.location.pathname || window.location.pathname === '/') {
        window.history.replaceState(null, '', `/${target}`);
      }
    }
  }, [currentUser?.id]);
  const [isNewComplaintOpen, setIsNewComplaintOpen] = useState(false);
  const [newComplaintInitialData, setNewComplaintInitialData] = useState(null);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [historyPhone, setHistoryPhone] = useState(null);
  const [activeWhatsAppPhone, setActiveWhatsAppPhone] = useState(null);

  const handleOpenWhatsAppChat = (phone, customerName, ticketId, complaintId) => {
    setActiveWhatsAppPhone({ phone, customerName, ticketId, complaintId });
    handleTabChange('whatsapp-inbox');
  };

  // Onboarding Tour state - temporarily disabled by default as requested
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [complaintFilters, setComplaintFilters] = useState(null);

  // Refresh trigger counter for child components when demo data is reloaded
  const [refreshKey, setRefreshKey] = useState(0);
  const [resetSuccessToast, setResetSuccessToast] = useState(false);

  // Standalone tracking portal route: accessed via /track/:ticketId (Zero staff chrome)
  if (trackingInfo.isTracking) {
    return (
      <React.Suspense fallback={<LoadingFallback />}>
        <CustomerPublicPortal
          initialTicketId={trackingInfo.ticketId}
          isStandalone={true}
          onExitStandalone={() => {
            window.history.pushState(null, '', '/');
            setTrackingInfo({ isTracking: false, ticketId: '' });
          }}
          onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
        />
      </React.Suspense>
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

  const { confirm, showToast } = useDialog();

  const handleReloadDemoData = async () => {
    const ok = await confirm({
      title: 'Reload Sample Complaints?',
      message: 'Are you sure you want to refresh sample demo complaints? All your newly created complaints will remain safe.',
      type: 'warning',
      confirmText: 'Reload Sample Data'
    });
    if (!ok) return;

    try {
      api.resetDemoData();
      try {
        await fetch('/api/demo/reset', { method: 'POST' });
      } catch (e) {
        // Backend offline, local mock already reset
      }
      setRefreshKey(k => k + 1);
      showToast('Demo Data successfully reset with 12+ realistic complaints!', 'success');
    } catch (err) {
      showToast('Failed to reset demo data: ' + err.message, 'error');
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 font-sans">
      {/* Top Main Navigation (Sticky Header) */}
      <div className="shrink-0 z-30">
        <Navbar
          currentTab={currentTab}
          setCurrentTab={handleTabChange}
          onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
          onToggleNotificationDrawer={() => setIsNotificationDrawerOpen(!isNotificationDrawerOpen)}
          onOpenTour={() => setIsTourOpen(true)}
        />
      </div>

      {/* Main Page Content — Spreads horizontally on wide screens, responsive on mobile */}
      <main className={`flex-1 min-h-0 w-full mx-auto ${
        currentTab === 'whatsapp-inbox' 
          ? 'overflow-hidden p-0 max-w-full flex flex-col' 
          : 'overflow-y-auto max-w-[1780px] p-3 sm:p-5 lg:p-6'
      }`}>
        <React.Suspense fallback={<LoadingFallback />}>
          {currentTab === 'complaints' && (
            <ComplaintList
              key={`comp-${refreshKey}`}
              refreshKey={refreshKey}
              initialFilters={complaintFilters}
              onSelectComplaint={handleSelectComplaint}
              onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
              onOpenWhatsAppChat={handleOpenWhatsAppChat}
            />
          )}

          {currentTab === 'technician' && (
            <TechnicianFieldPortal
              key={`tech-${refreshKey}`}
              onSelectComplaint={handleSelectComplaint}
            />
          )}

          {currentTab === 'team' && (
            <StaffTechnicianManager
              key={`team-${refreshKey}`}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsDashboard
              key={`ana-${refreshKey}`}
              onNavigateToComplaints={(filters) => {
                setComplaintFilters(filters);
                handleTabChange('complaints');
              }}
            />
          )}

          {currentTab === 'templates' && (
            <TemplateManager key={`tmpl-${refreshKey}`} />
          )}

          {currentTab === 'whatsapp-inbox' && (
            <WhatsAppWebInbox
              key={`wa-inbox-${refreshKey}`}
              initialTarget={activeWhatsAppPhone}
              onClearInitialTarget={() => setActiveWhatsAppPhone(null)}
              onOpenComplaint={handleSelectComplaint}
              onNewComplaintWithData={(data) => {
                setNewComplaintInitialData(data);
                setIsNewComplaintOpen(true);
              }}
            />
          )}

          {currentTab === 'customer' && (
            <CustomerPublicPortal
              key={`cust-${refreshKey}`}
              onOpenNewComplaint={() => setIsNewComplaintOpen(true)}
            />
          )}
        </React.Suspense>
      </main>

      {/* Mobile Bottom Navigation Bar (App-like navigation on Android / iOS) */}
      <nav className="md:hidden shrink-0 bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around z-30 shadow-lg">
        {/* Complaints Desk */}
        {['admin', 'staff'].includes(currentUser?.role) && (
          <button
            onClick={() => handleTabChange('complaints')}
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
            onClick={() => handleTabChange('technician')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
              currentTab === 'technician' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'
            }`}
          >
            <Wrench className="w-4 h-4 mb-0.5" />
            <span>Field Ops</span>
          </button>
        )}

        {/* WhatsApp Hub (Admin & Staff) */}
        {['admin', 'staff'].includes(currentUser?.role) && (
          <button
            onClick={() => handleTabChange('whatsapp-inbox')}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
              currentTab === 'whatsapp-inbox' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'
            }`}
          >
            <MessageCircle className="w-4 h-4 mb-0.5" />
            <span>WhatsApp</span>
          </button>
        )}

        {/* Staff/Techs (Admin only) */}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => handleTabChange('team')}
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
            onClick={() => handleTabChange('analytics')}
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
            onClick={() => handleTabChange('customer')}
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
      {currentTab !== 'whatsapp-inbox' && (
        <footer className="hidden sm:block shrink-0 bg-white border-t border-slate-200 py-2.5 px-4 text-center text-xs text-slate-500 font-medium z-10 shadow-xs">
          <p>© 2026 Eco Green Solar — Complaint Management System (CMS). Solar Rooftop Systems • Solar Water Heaters • Heat Pumps</p>
        </footer>
      )}

      {/* Global Modals & Slide-over Panels */}
      <NewComplaintModal
        isOpen={isNewComplaintOpen}
        initialData={newComplaintInitialData}
        onClose={() => {
          setIsNewComplaintOpen(false);
          setNewComplaintInitialData(null);
        }}
        onComplaintCreated={(newTicket) => {
          // Refresh complaints list without popping drawer underneath success modal
          setRefreshKey(k => k + 1);
        }}
        onViewComplaint={(ticketId) => {
          handleSelectComplaint(ticketId);
        }}
      />

      <ComplaintDetailDrawer
        complaintId={selectedComplaintId}
        isOpen={Boolean(selectedComplaintId)}
        onClose={() => handleSelectComplaint(null)}
        onComplaintUpdated={() => setRefreshKey(k => k + 1)}
        onViewCustomerHistory={(phone) => setHistoryPhone(phone)}
      />

      <React.Suspense fallback={null}>
        {Boolean(historyPhone) && (
          <CustomerHistoryModal
            phone={historyPhone}
            isOpen={Boolean(historyPhone)}
            onClose={() => setHistoryPhone(null)}
            onSelectTicket={handleSelectComplaint}
          />
        )}

        {/* Interactive Feature Walkthrough Tour */}
        {isTourOpen && (
          <OnboardingTour
            isOpen={isTourOpen}
            onClose={() => setIsTourOpen(false)}
            onSwitchTab={(targetTab) => handleTabChange(targetTab)}
          />
        )}
      </React.Suspense>
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
        <DialogProvider>
          <AppContent />
        </DialogProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
