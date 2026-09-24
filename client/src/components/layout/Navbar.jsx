import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { 
  Sun, Shield, Users, Wrench, Search, Plus, 
  BarChart3, Settings, Bell, ChevronDown, Check, LogOut,
  Compass, RotateCcw, Sparkles, X, MessageCircle, QrCode, Key
} from 'lucide-react';
import { AccountSettingsModal } from '../admin/AccountSettingsModal';

export const Navbar = ({ 
  currentTab, 
  setCurrentTab, 
  onOpenNewComplaint, 
  onToggleNotificationDrawer,
  onOpenTour,
  onReloadDemoData
}) => {
  const { currentUser, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const [accountModalOpen, setAccountModalOpen] = React.useState(false);

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
              className="flex items-center gap-2.5 cursor-pointer group shrink-0"
            >
              <img 
                src="/company-logo.png" 
                alt="Eco Green Solar" 
                className="h-11 sm:h-12 w-auto object-contain shrink-0 group-hover:opacity-90 transition-opacity" 
              />
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide shrink-0 hidden sm:inline-block">
                CMS
              </span>
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

                  <button
                    onClick={() => setCurrentTab('whatsapp-inbox')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'whatsapp-inbox'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp Web</span>
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
                    onClick={() => setCurrentTab('whatsapp-inbox')}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      currentTab === 'whatsapp-inbox'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp Web</span>
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

            {/* Notification Drawer Trigger */}
            <button
              onClick={onToggleNotificationDrawer}
              title={`Notification Center (${unreadCount} unread)`}
              className="relative p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0"
              aria-label="Notification Center"
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

                return (
                  <>
                    {/* Desktop Role Button */}
                    <button
                      onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition-colors max-w-[210px]"
                      title="Active Account & Profile"
                    >
                      <RoleIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate">{currentRoleConfig.label}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                    </button>

                    {/* Mobile Avatar Role Pill (Guaranteed to fit 100% on any phone screen without cut-off) */}
                    <button
                      onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                      className="sm:hidden flex items-center gap-1 pl-1 pr-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full border border-slate-200 shadow-2xs active:scale-95 transition-all shrink-0"
                      title="Active Account & Profile"
                      aria-label="Active Account & Profile"
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
                            {currentRoleConfig.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100/80 space-y-1 text-[11px] text-slate-500">
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-400">User ID / Name:</span>
                          <span className="font-mono text-slate-700 font-bold">{currentUser?.username || currentUser?.email?.split('@')[0] || 'admin'}</span>
                        </div>
                        {currentUser?.phone && (
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-400">Contact:</span>
                            <span className="font-mono text-slate-700">+91 {currentUser.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        🔒 <strong>Secure Session:</strong> Direct role-switching is restricted. To switch accounts or portals, please log out and sign in with your assigned ID.
                      </p>
                    </div>

                    {/* Desktop Manage Credentials & Sign Out */}
                    <div className="px-3 pt-2 space-y-1.5">
                      <button
                        onClick={() => {
                          setRoleMenuOpen(false);
                          setAccountModalOpen(true);
                        }}
                        className="w-full text-center py-2 px-3 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Key className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Manage Admin Credentials</span>
                      </button>

                      <button
                        onClick={() => {
                          logout();
                          setRoleMenuOpen(false);
                        }}
                        className="w-full text-center py-2 px-3 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer active:scale-98"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log Out / Switch Account</span>
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
                    <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 w-full max-w-sm flex flex-col z-10 animate-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                            Eco Green Solar Portals
                          </p>
                          <p className="text-sm font-bold text-slate-900">
                            Active User Account
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

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 mb-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
                            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-slate-900 truncate">{currentUser?.name || 'User'}</h4>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {currentRoleConfig.label}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs border-t border-slate-200/60 pt-2.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500">User ID / Username:</span>
                            <span className="font-mono font-bold text-slate-800">{currentUser?.username || currentUser?.email?.split('@')[0] || 'admin'}</span>
                          </div>
                          {currentUser?.phone && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Mobile No:</span>
                              <span className="font-mono text-slate-800">+91 {currentUser.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            setRoleMenuOpen(false);
                            setAccountModalOpen(true);
                          }}
                          className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <Key className="w-4 h-4 text-emerald-600" />
                          <span>Manage Admin Credentials</span>
                        </button>

                        <button
                          onClick={() => {
                            logout();
                            setRoleMenuOpen(false);
                          }}
                          className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Log Out / Switch Account</span>
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

      {/* Admin Credentials & Profile Modal */}
      <AccountSettingsModal 
        isOpen={accountModalOpen} 
        onClose={() => setAccountModalOpen(false)} 
      />
    </header>
  );
};
