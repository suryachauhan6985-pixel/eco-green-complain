import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Sun, Shield, Users, Wrench, Search, Lock, Mail, 
  Eye, EyeOff, ArrowRight, CheckCircle2, Sparkles, AlertCircle 
} from 'lucide-react';

export const LoginPage = ({ onSwitchToCustomer }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@ecogreensolar.com');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRoleTab, setActiveRoleTab] = useState('admin'); // admin | staff | technician

  const DEMO_ACCOUNTS = [
    {
      role: 'admin',
      label: 'Admin',
      fullName: 'Admin Supervisor',
      email: 'admin@ecogreensolar.com',
      password: 'admin123',
      icon: Shield,
      desc: 'Master access, user management, and full analytics'
    },
    {
      role: 'staff',
      label: 'Support Staff',
      fullName: 'Pooja Sharma (Helpdesk)',
      email: 'staff@ecogreensolar.com',
      password: 'staff123',
      icon: Users,
      desc: 'Register complaints, assign technicians, follow-up'
    },
    {
      role: 'technician',
      label: 'Technician',
      fullName: 'Rohit Kumar (Field Tech)',
      email: 'rohit.tech@ecogreensolar.com',
      password: 'tech123',
      icon: Wrench,
      desc: 'Mobile field workspace, resolutions, spare parts'
    }
  ];

  const handleSelectDemoRole = (acc) => {
    setActiveRoleTab(acc.role);
    setEmail(acc.email);
    setPassword(acc.password);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/80 z-10">
        {/* Left Side: Brand Visual & Features */}
        <div className="lg:col-span-5 bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-900 p-6 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-950/40">
                <Sun className="w-7 h-7 text-amber-300 fill-amber-300" />
              </div>
              <div>
                <h1 className="font-black text-xl tracking-tight text-white leading-tight">
                  Eco Green <span className="text-emerald-400">Solar</span>
                </h1>
                <span className="text-[11px] font-mono text-emerald-300 uppercase tracking-wider">
                  Complaint Management
                </span>
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white leading-tight mb-2">
              Empowering Sustainable Energy & Customer Care
            </h2>
            <p className="text-xs text-emerald-100/90 leading-relaxed mb-6">
              Dedicated service and technical support portal committed to clean energy reliability, rapid response, and seamless on-site assistance.
            </p>

            {/* Core Values & Commitments */}
            <div className="space-y-3.5">
              <div className="flex items-start gap-2.5 text-xs text-emerald-50">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Dedicated Customer Support:</strong> Prompt assistance for residential and commercial solar installations.</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-emerald-50">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Certified Field Specialists:</strong> Trained technical experts ensuring optimal system performance and safety.</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-emerald-50">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Seamless Service Lifecycle:</strong> Transparent tracking from complaint registration to verified on-site resolution.</span>
              </div>
            </div>
          </div>

          {/* Footer note on left */}
          <div className="mt-8 pt-4 border-t border-emerald-700/50 text-[11px] text-emerald-200/80 flex items-center justify-between">
            <span>© 2026 Eco Green Solar</span>
            <span className="font-mono">v1.0.0</span>
          </div>
        </div>

        {/* Right Side: Sign In Form & Role Quick-Select */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  Staff & Technician Sign In
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a test account or enter your company credentials
                </p>
              </div>
            </div>

            {/* 1-Click Role Quick Buttons */}
            <div className="mb-5">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Quick Role Selection
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const Icon = acc.icon;
                  const isSelected = activeRoleTab === acc.role;
                  return (
                    <button
                      type="button"
                      key={acc.role}
                      onClick={() => handleSelectDemoRole(acc)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20 font-bold shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs">{acc.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Message if any */}
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@ecogreensolar.com"
                    className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Remember my session</span>
                </label>
                <span className="text-[11px] text-emerald-700 font-medium">
                  Protected with JWT
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Enter {DEMO_ACCOUNTS.find(a => a.role === activeRoleTab)?.fullName || 'Workspace'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Customer Self-Service Link (Zero Login Needed) */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="p-3 bg-slate-50 hover:bg-emerald-50/50 rounded-2xl border border-slate-200 transition-colors flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white rounded-xl text-emerald-700 border border-slate-200">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Are you a Customer?
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Track your complaint or raise service request without logging in.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onSwitchToCustomer}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all shrink-0 active:scale-95"
              >
                Public Portal →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
