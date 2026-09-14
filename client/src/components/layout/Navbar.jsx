import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Sun, Shield, Users, Wrench, Search, Plus, 
  BarChart3, Settings, Bell, ChevronDown, Check, LogOut,
  Compass, RotateCcw, Sparkles, X, MessageCircle, QrCode 
} from 'lucide-react';

export const Navbar = ({ 
  currentTab, 
  setCurrentTab, 
  onOpenNewComplaint, 
  onToggleNotificationDrawer,
  onOpenTour,
  onReloadDemoData,
  onOpenWhatsAppGateway,
  whatsAppStatus
}) => {
  const { currentUser, switchRole, logout, unreadSimulatedCount } = useAuth();
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);

  const roles = [
    { id: 'admin', label: 'Admin Supervisor', icon: Shield, desc: 'Full System Control & Reports' },
    { id: 'staff', label: 'Support Staff / Front Desk', icon: Users, desc: 'Ticket Registration & Assign' },
    { id: 'technician', label: 'Technician (Rohit Kumar)', icon: Wrench, desc: 'Mobile Field Service' },
    { id: 'customer', label: 'Customer (Public Portal)', icon: Search, desc: 'Track & Raise Complaints' }
  ];

  const currentRoleConfig = roles.find(r => r.id === currentUser?.role) || roles[0];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-[1780px] w-full mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand & Logo */}
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 min-w-0">
            <div 
              onClick={() => setCurrentTab('complaints')}
              className="flex items-center gap-2 cursor-pointer group shrink-0"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-700/20 group-hover:scale-105 transition-transform shrink-0">
                <Sun className="w-4 h-4 sm:w-6 sm:h-6 text-amber-300 fill-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-extrabold text-sm sm:text-lg tracking-tight text-slate-900 whitespace-nowrap">
                    Eco Green <span className="text-emerald-600">Solar</span>
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1 py-0.2 rounded tracking-wide shrink-0">
                    CMS
                  </span>
                </div>
                <p className="hidden sm:block text-[11px] text-slate-500 font-medium -mt-0.5">
                  Complaint Management & Field Service
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs - Dynamically Filtered by Active Role */}
            <nav className="hidden md:flex items-center space-x-1 pl-3 border-l border-slate-200">
              {/* Customer View */}
              {currentUser?.role === 'customer' && (
                <button
                  onClick={() => setCurrentTab('customer')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-emerald-50 text-emerald-800 shadow-2xs"
                >
                  <Search className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Track & Raise Complaints</span>
                  <span className="bg-emerald-200/70 text-emerald-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">Public</span>
                </button>
              )}

              {/* Technician View */}
              {currentUser?.role === 'technician' && (
                <button
                  onClick={() => setCurrentTab('technician')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-emerald-50 text-emerald-800 shadow-2xs"
                >
                  <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                  <span>My Field Workspace</span>
                </button>
              )}

              {/* Staff View */}
              {currentUser?.role === 'staff' && (
                <>
                  <button
                    onClick={() => setCurrentTab('complaints')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'complaints'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Complaints Desk</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('technician')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'technician'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Field Operations</span>
                  </button>
                </>
              )}

              {/* Admin View */}
              {currentUser?.role === 'admin' && (
                <>
                  <button
                    onClick={() => setCurrentTab('complaints')}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'complaints'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Complaints</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('technician')}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'technician'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Field View</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('team')}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'team'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Staff & Techs</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('analytics')}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'analytics'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Analytics</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('templates')}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'templates'
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Templates</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* Right Action Controls - Guaranteed No Overflow */}
          <div className="shrink-0 flex items-center gap-1 sm:gap-2">
            {/* Feature Tour Guide Button (Desktop only in navbar, mobile has it in quick action banner below) */}
            <button
              onClick={onOpenTour}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 shrink-0"
              title="Interactive Step-by-Step Feature Guide"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Tour</span>
            </button>

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

            {/* WhatsApp Gateway Status & QR Trigger (For Admin & Staff) */}
            {['admin', 'staff'].includes(currentUser?.role) && (
              <button
                onClick={onOpenWhatsAppGateway}
                title={whatsAppStatus?.isConnected ? `WhatsApp Gateway Connected: ${whatsAppStatus.connectedPhone || '+91 7878444414'}` : 'WhatsApp Gateway: Click to Scan QR Code'}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                  whatsAppStatus?.isConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-2xs'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 animate-pulse'
                }`}
              >
                <MessageCircle className={`w-3.5 h-3.5 ${whatsAppStatus?.isConnected ? 'text-emerald-600 fill-emerald-100' : 'text-amber-600'}`} />
                <span className="hidden lg:inline">
                  {whatsAppStatus?.isConnected ? 'WA Connected' : 'Link WhatsApp'}
                </span>
                <span className={`w-2 h-2 rounded-full ${
                  whatsAppStatus?.isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
              </button>
            )}

            {/* Notification Drawer Trigger */}
            <button
              onClick={onToggleNotificationDrawer}
              title="Live WhatsApp & Email Alerts"
              className="relative p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadSimulatedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                  {unreadSimulatedCount}
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

                return (
                  <>
                    {/* Desktop Role Button */}
                    <button
                      onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition-colors max-w-[210px]"
                      title="Click to Switch Portal / Role"
                    >
                      <RoleIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate">{currentRoleConfig.label}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                    </button>

                    {/* Mobile Avatar Role Pill (Guaranteed to fit 100% on any phone screen without cut-off) */}
                    <button
                      onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                      className="sm:hidden flex items-center gap-1 pl-1 pr-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full border border-slate-200 shadow-2xs active:scale-95 transition-all shrink-0"
                      title="Switch User Role"
                      aria-label="Switch User Role"
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                        <RoleIcon className="w-3.5 h-3.5 text-amber-200" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700">
                        {shortRoleLabel}
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

                  {/* Desktop Dropdown */}
                  <div className="hidden sm:block absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Switch Active Role / Portal
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Logged in: <strong className="text-slate-900">{currentUser?.name}</strong>
                      </p>
                    </div>

                    {roles.map((r) => {
                      const Icon = r.icon;
                      const isSelected = currentUser?.role === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            switchRole(r.id);
                            setRoleMenuOpen(false);
                            if (r.id === 'technician') setCurrentTab('technician');
                            if (r.id === 'customer') setCurrentTab('customer');
                            if (r.id === 'admin') setCurrentTab('complaints');
                            if (r.id === 'staff') setCurrentTab('complaints');
                          }}
                          className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                            isSelected ? 'bg-emerald-50/80 text-emerald-900 font-semibold' : 'text-slate-700'
                          }`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold flex items-center justify-between">
                              <span>{r.label}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1">{r.desc}</p>
                          </div>
                        </button>
                      );
                    })}

                    {/* Desktop Sign Out Button */}
                    <div className="px-2 pt-1.5 mt-1 border-t border-slate-100">
                      <button
                        onClick={() => {
                          logout();
                          setRoleMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-500" />
                        <span>Sign Out to Login Screen</span>
                      </button>
                    </div>
                  </div>

                  {/* Mobile Centered Role Switcher Modal (Guaranteed No Cut-off & Perfectly Centered) */}
                  <div className="sm:hidden fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Dark Backdrop */}
                    <div 
                      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
                      onClick={() => setRoleMenuOpen(false)} 
                    />

                    {/* Centered Modal Content */}
                    <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 w-full max-w-sm max-h-[85vh] flex flex-col z-10 animate-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                            Eco Green Solar Portals
                          </p>
                          <p className="text-sm font-bold text-slate-900">
                            Switch Active User Role
                          </p>
                        </div>
                        <button 
                          onClick={() => setRoleMenuOpen(false)}
                          className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 overflow-y-auto pr-0.5">
                        {roles.map((r) => {
                          const Icon = r.icon;
                          const isSelected = currentUser?.role === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => {
                                switchRole(r.id);
                                setRoleMenuOpen(false);
                                if (r.id === 'technician') setCurrentTab('technician');
                                if (r.id === 'customer') setCurrentTab('customer');
                                if (r.id === 'admin') setCurrentTab('complaints');
                                if (r.id === 'staff') setCurrentTab('complaints');
                              }}
                              className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all ${
                                isSelected 
                                  ? 'bg-emerald-50 text-emerald-950 font-bold border-2 border-emerald-500 shadow-xs' 
                                  : 'bg-slate-50/90 text-slate-700 hover:bg-slate-100 border border-slate-200/70'
                              }`}
                            >
                              <div className={`p-2.5 rounded-xl shrink-0 ${isSelected ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200'}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold flex items-center justify-between">
                                  <span className={isSelected ? 'text-emerald-950' : 'text-slate-800'}>{r.label}</span>
                                  {isSelected && <Check className="w-4 h-4 text-emerald-600 font-bold shrink-0" />}
                                </div>
                                <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5">{r.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
                        <button
                          onClick={() => {
                            logout();
                            setRoleMenuOpen(false);
                          }}
                          className="font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 py-1"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                        <span className="text-slate-500">{currentUser?.name}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
