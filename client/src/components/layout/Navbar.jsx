import ReactDOM from 'react-dom';
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { 
  Sun, Shield, Users, Wrench, Search, Plus, 
  BarChart3, Settings, Bell, ChevronDown, ChevronRight, Check, LogOut,
  Compass, RotateCcw, Sparkles, X, MessageCircle, QrCode, Key,
  Menu, IndianRupee
} from 'lucide-react';
import { AccountSettingsModal } from '../admin/AccountSettingsModal';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';
import { useSlidingIndicator } from '../../hooks/useSlidingIndicator';
import { preloadComponent } from '../../utils/routePreload';

export const Navbar = ({ 
  currentTab, 
  setCurrentTab, 
  techSection = 'field_ops',
  onSelectTechSection,
  onOpenNewComplaint, 
  onOpenCustomerSearch,
  onToggleNotificationDrawer,
  onOpenTour,
  onReloadDemoData
}) => {
  const { currentUser, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [accountModalOpen, setAccountModalOpen] = React.useState(false);

  // --- HIERARCHICAL STAGE ESCAPE HANDLERS ---
  // Stage 1: Account Settings modal inside Navbar
  useEscapeHandler(() => {
    setAccountModalOpen(false);
    return true;
  }, accountModalOpen, { priority: ESCAPE_PRIORITY.INNER_MODAL });

  // Stage 2: Role switcher dropdown
  useEscapeHandler(() => {
    setRoleMenuOpen(false);
    return true;
  }, roleMenuOpen, { priority: ESCAPE_PRIORITY.INNER_MODAL });

  // Stage 3: Mobile drawer menu
  useEscapeHandler(() => {
    setMobileMenuOpen(false);
    return true;
  }, mobileMenuOpen, { priority: ESCAPE_PRIORITY.DRAWER });

  // Lock background scroll when mobile sidebar is open
  React.useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Mobile navigation key calculation (combines tab + sub-section)
  const currentMobileKey = React.useMemo(() => {
    if (currentTab === 'technician') {
      return techSection === 'collection' ? 'technician-collection' : 'technician-field_ops';
    }
    if (currentTab === 'templates') return 'settings';
    return currentTab;
  }, [currentTab, techSection]);

  const [mobileActiveKey, setMobileActiveKey] = React.useState(currentMobileKey);
  const [mobileIndicator, setMobileIndicator] = React.useState({ top: 0, height: 0, opacity: 0 });
  const mobileNavContainerRef = React.useRef(null);
  const mobileButtonRefs = React.useRef({});
  const navClickTimeoutRef = React.useRef(null);

  // Sync mobileActiveKey whenever currentMobileKey changes externally
  React.useEffect(() => {
    setMobileActiveKey(currentMobileKey);
  }, [currentMobileKey]);

  // Precision measurement of the active item's offsetTop and offsetHeight
  const updateMobileIndicator = React.useCallback((targetKey = null) => {
    const key = targetKey || mobileActiveKey;
    const btn = mobileButtonRefs.current[key];
    const container = mobileNavContainerRef.current;
    if (btn && container) {
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const top = (btnRect.top - containerRect.top) + container.scrollTop;
      const height = btnRect.height || btn.offsetHeight;

      if (height > 0) {
        setMobileIndicator({ top, height, opacity: 1 });
      }
    }
  }, [mobileActiveKey]);

  // Recalculate indicator position on drawer opening and window resize
  React.useEffect(() => {
    if (mobileMenuOpen) {
      setMobileActiveKey(currentMobileKey);
      const t1 = setTimeout(() => updateMobileIndicator(currentMobileKey), 30);
      const t2 = setTimeout(() => updateMobileIndicator(currentMobileKey), 150);
      const t3 = setTimeout(() => updateMobileIndicator(currentMobileKey), 320);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [mobileMenuOpen, currentMobileKey, updateMobileIndicator]);

  React.useEffect(() => {
    return () => {
      if (navClickTimeoutRef.current) clearTimeout(navClickTimeoutRef.current);
    };
  }, []);

  const handleNavClick = (tab, section = null) => {
    const targetKey = (tab === 'technician' && section === 'collection')
      ? 'technician-collection'
      : (tab === 'technician' ? 'technician-field_ops' : (tab === 'templates' ? 'settings' : tab));

    // 1. Immediately animate vertical sliding jelly capsule to the clicked tab
    setMobileActiveKey(targetKey);
    updateMobileIndicator(targetKey);

    // 2. Allow user to enjoy the smooth sliding jelly capsule animation before closing
    if (navClickTimeoutRef.current) clearTimeout(navClickTimeoutRef.current);
    navClickTimeoutRef.current = setTimeout(() => {
      if (section && onSelectTechSection) {
        onSelectTechSection(section);
      }
      setCurrentTab(tab);
      setTimeout(() => {
        setMobileMenuOpen(false);
      }, 70);
    }, 320);
  };

  const currentRoleName = 
    currentUser?.role === 'technician' ? 'Technician' :
    currentUser?.role === 'staff' ? 'Staff' :
    currentUser?.role === 'customer' ? 'Customer' : 'Admin';

  const dynamicRoleLabel = currentUser?.name 
    ? `${currentRoleName} (${currentUser.name})`
    : (
      currentUser?.role === 'technician' ? 'Field Technician' :
      currentUser?.role === 'staff' ? 'Support Staff' :
      currentUser?.role === 'customer' ? 'Customer Portal' : 'Admin Supervisor'
    );

  const roles = [
    { id: 'admin', label: currentUser?.role === 'admin' ? dynamicRoleLabel : 'Admin Supervisor', icon: Shield, desc: 'Full System Control & Reports' },
    { id: 'staff', label: currentUser?.role === 'staff' ? dynamicRoleLabel : 'Support Staff / Front Desk', icon: Users, desc: 'Ticket Registration & Assign' },
    { id: 'technician', label: currentUser?.role === 'technician' ? dynamicRoleLabel : 'Field Technician', icon: Wrench, desc: 'Mobile Field Service' },
    { id: 'customer', label: currentUser?.role === 'customer' ? dynamicRoleLabel : 'Customer (Public Portal)', icon: Search, desc: 'Track & Raise Complaints' }
  ];

  const currentRoleConfig = roles.find(r => r.id === currentUser?.role) || roles[0];

  const navTabs = React.useMemo(() => {
    const role = currentUser?.role;
    if (role === 'customer') {
      return [
        { id: 'customer', label: 'Track & Raise Complaints', icon: Search, badge: 'Public' }
      ];
    }
    if (role === 'technician') {
      return [
        { id: 'technician', label: 'My Field Workspace', icon: Wrench }
      ];
    }
    if (role === 'staff') {
      return [
        { id: 'complaints', label: 'Complaints Desk', icon: Users },
        { id: 'technician', label: 'Field Operations', icon: Wrench },
        { id: 'whatsapp-inbox', label: 'WhatsApp Web', icon: MessageCircle }
      ];
    }
    // Admin role
    return [
      { id: 'complaints', label: 'Complaints', icon: Users },
      { id: 'technician', label: 'Field View', icon: Wrench },
      { id: 'whatsapp-inbox', label: 'WhatsApp Web', icon: MessageCircle },
      { id: 'team', label: 'Staff & Techs', icon: Shield },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'settings', label: 'Settings', icon: Settings }
    ];
  }, [currentUser?.role]);

  const activeTabId = (currentTab === 'templates') ? 'settings' : currentTab;
  const {
    containerRef: navContainerRef,
    getButtonRef: getNavButtonRef,
    indicator: navIndicator,
    onTabClick: onNavTabClick
  } = useSlidingIndicator(activeTabId);

  return (
    <header 
      className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        backgroundColor: '#ffffff',
        isolation: 'isolate'
      }}
    >
      <div className="max-w-[1780px] w-full mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand & Logo + Mobile Hamburger Menu */}
          <div className="flex items-center gap-1.5 sm:gap-4 lg:gap-6 min-w-0">
            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1 rounded-xl text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all shrink-0 cursor-pointer focus:outline-hidden"
              aria-label="Open Navigation Menu"
              title="Open Navigation Menu"
            >
              <Menu className="w-6 h-6 text-slate-700" />
            </button>

            <div 
              onClick={() => {
                setCurrentTab('complaints');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 cursor-pointer group shrink-0"
            >
              <img 
                src="/company-logo.png" 
                alt="Eco Green Support" 
                className="h-10 sm:h-12 w-auto object-contain shrink-0 group-hover:opacity-90 transition-opacity" 
              />
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide shrink-0 hidden sm:inline-block">
                SUPPORT
              </span>
            </div>

            {/* Desktop Navigation Tabs - Apple Sliding Capsule Segmented Control */}
            <nav 
              ref={navContainerRef}
              className="relative hidden md:flex items-center p-1 rounded-xl bg-slate-100/90 border border-slate-200/80 shadow-2xs isolate ml-3 select-none"
            >
              {/* Apple Sliding Green Pill Highlight with Jelly Spring Physics */}
              <div
                className="absolute left-0 top-1 bottom-1 rounded-lg bg-emerald-600 shadow-sm pointer-events-none z-0"
                style={{
                  transform: `translate3d(${navIndicator.left}px, 0, 0)`,
                  width: `${navIndicator.width}px`,
                  opacity: navIndicator.opacity,
                  transition: 'transform 320ms cubic-bezier(0.34, 1.45, 0.64, 1), width 320ms cubic-bezier(0.34, 1.45, 0.64, 1), opacity 180ms ease',
                  willChange: 'transform, width'
                }}
              />

              {navTabs.map((tab) => {
                const isActive = activeTabId === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    ref={getNavButtonRef(tab.id)}
                    onClick={() => onNavTabClick(tab.id, () => setCurrentTab(tab.id))}
                    onMouseEnter={() => preloadComponent(tab.id)}
                    onTouchStart={() => preloadComponent(tab.id)}
                    className={`relative z-10 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer select-none transition-colors duration-200 ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{tab.label}</span>
                    {tab.badge && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full transition-colors duration-200 ${
                        isActive ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Action Controls - Guaranteed No Overflow */}
          <div className="shrink-0 flex items-center gap-1 sm:gap-2">
            {/* Direct Customer Directory & Plant Search Button (Admin & Staff) */}
            {['admin', 'staff'].includes(currentUser?.role) && onOpenCustomerSearch && (
              <button
                type="button"
                onClick={onOpenCustomerSearch}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 shrink-0 cursor-pointer"
                title="Search Customer Directory, Warranty & Technical Specifications"
              >
                <Search className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden md:inline">Search Customer</span>
                <span className="md:hidden">Search</span>
              </button>
            )}

            {/* Quick Register Complaint Button (For Admin & Staff - Desktop Only, mobile has it in bottom nav) */}
            {['admin', 'staff'].includes(currentUser?.role) && (
              <button
                onClick={onOpenNewComplaint}
                className="hidden sm:flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl shadow-2xs transition-all active:scale-95 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Ticket</span>
              </button>
            )}

            {/* Notification Drawer Trigger */}
            <button
              onClick={onToggleNotificationDrawer}
              title={`Notification Center (${unreadCount} unread)`}
              className="relative p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0"
              aria-label={unreadCount > 0 ? `Notification Center (${unreadCount > 9 ? '9+' : unreadCount})` : "Notification Center"}
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold min-w-4 h-4 sm:min-w-5 sm:h-5 px-1 rounded-full flex items-center justify-center border-2 border-white animate-bounce shadow-2xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Role Demo Switcher Dropdown */}
            <div className="relative shrink-0">
              {(() => {
                const RoleIcon = currentRoleConfig.icon || Shield;
                const shortRoleLabel = 
                  currentUser?.role === 'technician' ? 'Tech' :
                  currentUser?.role === 'customer' ? 'User' :
                  currentUser?.role === 'admin' ? 'Admin' : 'Staff';
                const displayName = currentUser?.name?.split(' ')[0] || shortRoleLabel;

                return (
                  <>
                    {/* Desktop Role Button */}
                    <button
                      onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition-colors max-w-[240px]"
                      title="Active Account & Profile"
                    >
                      <RoleIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate">{dynamicRoleLabel}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                    </button>

                    {/* Mobile Avatar Role Pill (Guaranteed to fit 100% on any phone screen without cut-off) */}
                    <button
                      onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                      className="sm:hidden flex items-center gap-1 pl-1 pr-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full border border-slate-200 shadow-2xs active:scale-95 transition-all shrink-0"
                      title="Active Account & Profile"
                      aria-label={`Active Account: ${displayName}`}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                        <RoleIcon className="w-3.5 h-3.5 text-amber-200" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 truncate max-w-[100px]">
                        {currentUser?.name?.split(' ')[0] || shortRoleLabel}
                      </span>
                      <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                    </button>
                  </>
                );
              })()}

              {roleMenuOpen && (
                <>
                  {/* Desktop Dropdown Backdrop */}
                  <div 
                    className="hidden sm:block fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs"
                    onClick={() => setRoleMenuOpen(false)} 
                  />

                  {/* Desktop Profile Dropdown */}
                  <div className="hidden sm:block absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                          {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">{currentUser?.name || 'Authorized User'}</p>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {dynamicRoleLabel}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100/80 space-y-1 text-[11px] text-slate-500">
                        {currentUser?.phone && (
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-400">Mobile Number:</span>
                            <span className="font-mono text-slate-700 font-bold">+91 {currentUser.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Desktop Sign Out */}
                    <div className="p-3 pt-2">
                      <button
                        onClick={() => {
                          logout();
                          setRoleMenuOpen(false);
                        }}
                        className="w-full text-center py-2.5 px-3 rounded-2xl text-xs font-black text-rose-700 bg-rose-500/10 hover:bg-rose-600 hover:text-white border border-rose-400/30 hover:border-rose-600 flex items-center justify-center gap-2 shadow-xs transition-all duration-200 cursor-pointer active:scale-98 backdrop-blur-md"
                        style={{
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 4px 14px -3px rgba(244, 63, 94, 0.15)'
                        }}
                      >
                        <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>

                  {/* Mobile Centered Profile & Logout Modal */}
                  <div className="sm:hidden fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Dark Backdrop */}
                    <div 
                      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
                      onClick={() => setRoleMenuOpen(false)} 
                    />

                    {/* Centered Modal Content */}
                    <div className="relative apple-glass-modal rounded-3xl shadow-2xl p-5 w-full max-w-sm flex flex-col z-10 animate-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100/60 mb-3 shrink-0">
                        <div>
                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                            Eco Green Support
                          </p>
                          <p className="text-sm font-black text-slate-900">
                            Active User Account
                          </p>
                        </div>
                        <button 
                          onClick={() => setRoleMenuOpen(false)}
                          className="p-2 rounded-xl bg-slate-100/80 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 bg-white/70 rounded-2xl border border-white/80 shadow-2xs backdrop-blur-md mb-3">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0 ring-2 ring-white">
                            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-black text-slate-900 truncate">{currentUser?.name || 'User'}</h4>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              {dynamicRoleLabel}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs border-t border-slate-200/60 pt-2.5">
                          {currentUser?.phone && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-semibold">Mobile Number:</span>
                              <span className="font-mono font-bold text-slate-900">+91 {currentUser.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={() => {
                            logout();
                            setRoleMenuOpen(false);
                          }}
                          className="w-full py-2.5 px-4 rounded-2xl text-xs font-black text-rose-700 bg-rose-500/10 hover:bg-rose-600 hover:text-white border border-rose-400/30 hover:border-rose-600 flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all cursor-pointer backdrop-blur-md"
                          style={{
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 4px 14px -3px rgba(244, 63, 94, 0.15)'
                          }}
                        >
                          <LogOut className="w-4 h-4 stroke-[2.5]" />
                          <span>Log Out</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Slide-out Navigation Drawer & Backdrop */}
      {typeof document !== 'undefined' && ReactDOM.createPortal(
        <>
          <div 
            className={`fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden ${
              mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

      <aside 
        className={`fixed top-0 bottom-0 left-0 z-50 w-[86vw] max-w-[335px] rounded-r-3xl flex flex-col md:hidden transform transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden will-change-transform border-r border-white/80 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.68)',
          backdropFilter: 'blur(20px) saturate(180%) brightness(1.02)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%) brightness(1.02)',
          boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.9), 20px 0 50px -10px rgba(15, 23, 42, 0.25)'
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation Menu"
      >
        {/* Drawer Header */}
        <div 
          className="p-4 border-b border-slate-200/50 flex items-center justify-between bg-white/40 shrink-0"
          style={{
            paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))'
          }}
        >
          <div className="flex items-center gap-2.5">
            <img 
              src="/company-logo.png" 
              alt="Eco Green Support" 
              className="h-9 w-auto object-contain" 
            />
            <span className="bg-emerald-100/90 text-emerald-950 border border-emerald-300 text-[10px] font-black px-1.5 py-0.5 rounded tracking-wider">
              SUPPORT
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white/60 active:scale-95 transition-all cursor-pointer"
            aria-label="Close Navigation Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action: Register Ticket & Search Customer */}
        {['admin', 'staff'].includes(currentUser?.role) && (
          <div className="p-3 pb-1 shrink-0 space-y-2">
            {onOpenCustomerSearch && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCustomerSearch();
                }}
                className="w-full flex items-center justify-center gap-2 bg-white/70 hover:bg-white text-slate-900 border border-white/90 text-xs font-black py-2.5 px-3 rounded-2xl shadow-xs transition-all cursor-pointer active:scale-98"
                style={{
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 2px 8px -2px rgba(15, 23, 42, 0.08)'
                }}
              >
                <Search className="w-4 h-4 text-emerald-700 stroke-[2.5]" />
                <span>Search Customer Directory</span>
              </button>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenNewComplaint();
              }}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-black py-2.5 px-3 rounded-2xl shadow-md shadow-emerald-700/25 transition-all cursor-pointer"
              style={{
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 4px 14px -2px rgba(5, 150, 105, 0.35)'
              }}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Register New Ticket</span>
            </button>
          </div>
        )}

        {currentUser?.role === 'customer' && (
          <div className="p-3 pb-1 shrink-0">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenNewComplaint();
              }}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-black py-2.5 px-3 rounded-2xl shadow-md shadow-emerald-700/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Raise New Complaint</span>
            </button>
          </div>
        )}

        {/* Drawer Scrollable Navigation Area with Apple Vertical Sliding Indicator */}
        <div 
          ref={mobileNavContainerRef}
          onScroll={() => updateMobileIndicator(mobileActiveKey)}
          className="relative flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4"
        >
          {/* Apple Vertical Sliding Jelly Capsule Indicator (Hardware-accelerated) */}
          <div
            className="absolute top-0 left-3 right-3 rounded-2xl pointer-events-none transition-all duration-320 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
            style={{
              transform: `translate3d(0, ${mobileIndicator.top}px, 0)`,
              height: `${mobileIndicator.height}px`,
              opacity: mobileIndicator.opacity,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.14) 100%)',
              border: '1.5px solid rgba(16, 185, 129, 0.55)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 6px 20px -3px rgba(16, 185, 129, 0.28)',
              willChange: 'transform, height'
            }}
          />

          {/* Main Navigation Group */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-3 mb-2">
              Main Navigation
            </p>
            <div className="space-y-1">
              {/* Complaints Desk */}
              {['admin', 'staff'].includes(currentUser?.role) && (
                <button
                  ref={el => { if (el) mobileButtonRefs.current['complaints'] = el; }}
                  onClick={() => handleNavClick('complaints')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Users className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'complaints' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'complaints' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>Complaints Desk</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'complaints' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>All service tickets & status</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'complaints' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              )}

              {/* Field Operations */}
              {['admin', 'staff', 'technician'].includes(currentUser?.role) && (
                <button
                  ref={el => { if (el) mobileButtonRefs.current['technician-field_ops'] = el; }}
                  onClick={() => handleNavClick('technician', 'field_ops')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Wrench className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'technician-field_ops' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'technician-field_ops' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>
                        {currentUser?.role === 'technician' ? 'My Field Tasks' : 'Field Operations'}
                      </p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'technician-field_ops' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>Technician jobs & dispatch</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'technician-field_ops' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              )}

              {/* Cash Collection */}
              {['admin', 'staff', 'technician'].includes(currentUser?.role) && (
                <button
                  ref={el => { if (el) mobileButtonRefs.current['technician-collection'] = el; }}
                  onClick={() => handleNavClick('technician', 'collection')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <IndianRupee className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'technician-collection' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'technician-collection' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>Cash Collection</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'technician-collection' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>Verify payments & receipts</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'technician-collection' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              )}

              {/* WhatsApp Web */}
              {['admin', 'staff'].includes(currentUser?.role) && (
                <button
                  ref={el => { if (el) mobileButtonRefs.current['whatsapp-inbox'] = el; }}
                  onClick={() => handleNavClick('whatsapp-inbox')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageCircle className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'whatsapp-inbox' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'whatsapp-inbox' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>WhatsApp Web</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'whatsapp-inbox' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>Live chat & automated alerts</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'whatsapp-inbox' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              )}

              {/* Customer Public View */}
              {currentUser?.role === 'customer' && (
                <button
                  ref={el => { if (el) mobileButtonRefs.current['customer'] = el; }}
                  onClick={() => handleNavClick('customer')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Search className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'customer' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'customer' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>Track & Raise Complaints</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'customer' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>Public self-service tracking</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'customer' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Admin Management & System Group */}
          {currentUser?.role === 'admin' && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-3 mb-2">
                Management & System
              </p>
              <div className="space-y-1">
                {/* Staff & Technicians */}
                <button
                  ref={el => { if (el) mobileButtonRefs.current['team'] = el; }}
                  onClick={() => handleNavClick('team')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Shield className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'team' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'team' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>Staff & Technicians</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'team' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>Manage accounts & assignments</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'team' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {/* Analytics */}
                <button
                  ref={el => { if (el) mobileButtonRefs.current['analytics'] = el; }}
                  onClick={() => handleNavClick('analytics')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'analytics' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'analytics' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>Analytics & Reports</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'analytics' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>KPIs, trends & sync customer data</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'analytics' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {/* Settings Hub */}
                <button
                  ref={el => { if (el) mobileButtonRefs.current['settings'] = el; }}
                  onClick={() => handleNavClick('settings')}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-transform duration-150 cursor-pointer active:scale-[0.99] hover:bg-white/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Settings className={`w-4 h-4 shrink-0 transition-colors ${mobileActiveKey === 'settings' ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-600'}`} />
                    <div className="text-left min-w-0">
                      <p className={`truncate ${mobileActiveKey === 'settings' ? 'text-emerald-950 font-black' : 'text-slate-900 font-bold'}`}>Settings</p>
                      <p className={`text-[11px] leading-tight truncate ${mobileActiveKey === 'settings' ? 'text-emerald-800 font-semibold' : 'text-slate-600 font-medium'}`}>Account, Templates, Items & Voucher</p>
                    </div>
                  </div>
                  {mobileActiveKey === 'settings' ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Quick Shortcuts & Utilities Group */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-3 mb-2">
              Utilities
            </p>
            <div className="space-y-1">
              {/* Notification Center */}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onToggleNotificationDrawer();
                }}
                className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs text-slate-800 hover:bg-white/50 active:bg-white/70 border border-transparent hover:border-white/60 font-semibold transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <Bell className="w-4 h-4 text-slate-600" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white" />
                    )}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-slate-900 font-bold truncate">Notification Center</p>
                    <p className="text-[11px] text-slate-600 font-medium leading-tight truncate">
                      {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'No unread notifications'}
                    </p>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Feature Tour (Admin only) */}
              {currentUser?.role === 'admin' && onOpenTour && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenTour();
                  }}
                  className="relative z-10 w-full flex items-center justify-between p-2.5 rounded-2xl text-xs bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-950 font-bold transition-all shadow-xs cursor-pointer active:scale-98"
                  style={{
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 2px 8px -2px rgba(217, 119, 6, 0.15)'
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Compass className="w-4 h-4 text-amber-700 stroke-[2.5] shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-amber-950 font-black truncate">Feature Tour Guide</p>
                      <p className="text-[11px] text-amber-900 font-semibold leading-tight truncate">Interactive step-by-step walkthrough</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer with User Profile & Liquid Glass Logout */}
        <div 
          className="p-3.5 border-t border-white/60 bg-white/40 shrink-0 space-y-3"
          style={{
            paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
            boxShadow: '0 -4px 16px -2px rgba(15, 23, 42, 0.05)'
          }}
        >
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/70 border border-white/90 shadow-2xs">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black text-xs shadow-xs ring-2 ring-white shrink-0">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-900 truncate leading-tight">
                {currentUser?.name || 'Authorized User'}
              </p>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100/90 text-emerald-950 border border-emerald-300">
                {dynamicRoleLabel}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setMobileMenuOpen(false);
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-xs font-black text-rose-700 bg-rose-500/12 hover:bg-rose-600 hover:text-white border border-rose-400/35 hover:border-rose-600 shadow-xs hover:shadow-md hover:shadow-rose-600/25 transition-all duration-200 active:scale-98 cursor-pointer"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 4px 14px -3px rgba(244, 63, 94, 0.15)'
            }}
          >
            <LogOut className="w-4 h-4 stroke-[2.5]" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>
      </>,
      document.getElementById("portal-root") || document.body
      )}

      {/* Admin Credentials & Profile Modal */}
      <AccountSettingsModal 
        isOpen={accountModalOpen} 
        onClose={() => setAccountModalOpen(false)} 
      />
    </header>
  );
};
