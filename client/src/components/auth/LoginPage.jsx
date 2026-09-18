import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Sun, Shield, Users, Wrench, Search, Lock, User, 
  Eye, EyeOff, ArrowRight, CheckCircle2, Sparkles, AlertCircle, Phone 
} from 'lucide-react';

const SLIDES = [
  {
    id: 0,
    tabName: 'Solar Care',
    badge: 'Solar Care Excellence',
    title: 'Empowering Sustainable Energy & Customer Care',
    desc: 'Dedicated service intelligence portal committed to clean energy reliability, rapid response, and seamless on-site solar assistance across Gujarat.',
    highlights: [
      { label: 'Prompt Customer Assistance', detail: 'Rapid response for residential and commercial rooftop solar installations.' },
      { label: 'WhatsApp Live Integration', detail: 'Official Cloud API messaging for automated status updates & direct replies.' },
      { label: 'Verified On-Site Resolution', detail: 'End-to-end transparent tracking from ticket creation to final sign-off.' }
    ]
  },
  {
    id: 1,
    tabName: 'Field Tech',
    badge: 'Technician Mobility',
    title: 'Empowering Gujarat Field Technicians',
    desc: 'Smart mobile-optimized tooling enabling on-ground engineers to locate consumer sites, verify inverter faults, and record spare parts.',
    highlights: [
      { label: 'GPS Location Routing', detail: 'Direct one-tap navigation to consumer site locations with contact access.' },
      { label: 'Spare Parts & Inventory Ledger', detail: 'Track in-warranty vs billable parts with instant settlement logging.' },
      { label: 'Digital Resolution Proof', detail: 'Mandatory photo capture and customer feedback rating on job completion.' }
    ]
  },
  {
    id: 2,
    tabName: 'Operations',
    badge: 'Automated Operations',
    title: 'Intelligent Service Governance & SLA',
    desc: 'Real-time oversight for managers and helpdesk staff to monitor resolution velocity, technician allocations, and customer satisfaction.',
    highlights: [
      { label: 'Dynamic Ticket Dispatch', detail: 'Intelligent routing based on region, issue category, and technician load.' },
      { label: 'Real-Time WhatsApp Hub', detail: 'Direct staff two-way chat synchronized with Meta Cloud API.' },
      { label: 'Supervisor Audit Controls', detail: 'Secure role-based access, settlement approvals, and history export.' }
    ]
  }
];

export const LoginPage = ({ onSwitchToCustomer }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [savedProfile, setSavedProfile] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill saved credentials ONLY if this specific device was previously logged in
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ecogreen_device_auth_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.identifier && parsed?.password) {
          setIdentifier(parsed.identifier);
          setPassword(parsed.password);
          setSavedProfile({
            name: parsed.name || parsed.identifier,
            role: parsed.role || 'staff',
            identifier: parsed.identifier
          });
        }
      }
    } catch (e) {
      console.error('Failed to load saved device credentials:', e);
      localStorage.removeItem('ecogreen_device_auth_v1');
    }
  }, []);

  const handleClearSaved = () => {
    localStorage.removeItem('ecogreen_device_auth_v1');
    setIdentifier('');
    setPassword('');
    setSavedProfile(null);
    setError('');
  };

  const [activeSlide, setActiveSlide] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    const slideTimer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
      setProgress(0);
    }, 5000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(slideTimer);
    };
  }, [activeSlide]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loggedInUser = await login(identifier.trim(), password);
      
      // Save credentials exclusively to this local device if Remember Me is active
      if (rememberMe) {
        localStorage.setItem('ecogreen_device_auth_v1', JSON.stringify({
          identifier: identifier.trim(),
          password,
          role: loggedInUser?.role || 'staff',
          name: loggedInUser?.name || identifier.trim()
        }));
      } else {
        localStorage.removeItem('ecogreen_device_auth_v1');
      }
    } catch (err) {
      setError(err.message || 'Invalid User ID or password. Please verify and try again.');
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
        {/* Left Side: Brand Visual & Interactive Carousel */}
        <div className="lg:col-span-5 bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-900 p-6 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Subtle moving ambient glows */}
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-emerald-500/20 rounded-full blur-2xl animate-pulse pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-teal-400/20 rounded-full blur-2xl animate-pulse pointer-events-none" />

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              {/* Perfectly Centered & Enlarged Transparent Logo */}
              <div className="mb-6 flex justify-center items-center py-2">
                <img 
                  src="/company-logo-white.png" 
                  alt="Eco Green Solar" 
                  className="h-14 sm:h-16 w-auto object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)] hover:scale-105 transition-transform" 
                />
              </div>

              {/* Interactive Carousel Slide Selector Chips */}
              <div className="flex items-center gap-1.5 p-1 bg-white/10 backdrop-blur-md rounded-2xl mb-4 border border-white/10">
                {SLIDES.map((slide, idx) => {
                  const isActive = activeSlide === idx;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => {
                        setActiveSlide(idx);
                        setProgress(0);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer relative overflow-hidden text-center ${
                        isActive 
                          ? 'bg-emerald-500 text-white shadow-xs' 
                          : 'text-emerald-200/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span>{slide.tabName}</span>
                      {isActive && (
                        <div 
                          className="absolute bottom-0 left-0 h-0.5 bg-amber-300 transition-all duration-100" 
                          style={{ width: `${progress}%` }} 
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Animated Slide Content */}
              <div className="transition-all duration-500 min-h-[290px] flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-semibold text-emerald-300 mb-2.5 backdrop-blur-xs">
                    <Sparkles className="w-3 h-3 text-emerald-300 animate-spin" style={{ animationDuration: '8s' }} />
                    <span>{SLIDES[activeSlide].badge}</span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight mb-2 transition-all duration-300">
                    {SLIDES[activeSlide].title}
                  </h2>
                  <p className="text-xs text-emerald-100/90 leading-relaxed mb-4">
                    {SLIDES[activeSlide].desc}
                  </p>

                  {/* Animated Highlights */}
                  <div className="space-y-2.5">
                    {SLIDES[activeSlide].highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-emerald-50/95 animate-in fade-in slide-in-from-left-2 duration-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span><strong>{h.label}:</strong> {h.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer note on left */}
            <div className="mt-6 pt-3 border-t border-emerald-700/50 text-[11px] text-emerald-200/80 flex items-center justify-between">
              <span>© 2026 Eco Green Solar</span>
              <span className="font-mono text-[10px] bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-600/40 text-emerald-300">CMS Enterprise</span>
            </div>
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
                  Sign in with your Eco Green credentials
                </p>
              </div>
            </div>

            {/* Device-Specific Profile Status or Guidance */}
            {savedProfile ? (
              <div className="mb-5 p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    {savedProfile.role === 'technician' ? <Wrench className="w-4 h-4" /> : savedProfile.role === 'admin' ? <Shield className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">{savedProfile.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 shrink-0">
                        {savedProfile.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">Saved on this device for one-tap sign in</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearSaved}
                  className="text-xs font-semibold text-emerald-800 hover:text-rose-600 hover:underline shrink-0 cursor-pointer"
                >
                  Use another account
                </button>
              </div>
            ) : (
              <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3 text-slate-600">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs">
                  <Lock className="w-4 h-4" />
                </div>
                <p className="text-xs leading-relaxed">
                  Enter the <strong>User ID</strong> and <strong>Password</strong> provided by your administrator.
                </p>
              </div>
            )}

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
                  User ID / Username / Mobile
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your User ID or phone"
                    autoComplete="username"
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
                    autoComplete="current-password"
                    className="w-full text-xs pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                  />
                  <span className="font-medium">Save login on this device</span>
                </label>
                {savedProfile && (
                  <button
                    type="button"
                    onClick={handleClearSaved}
                    className="text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
                  >
                    Clear saved
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Customer Self-Service Link (Zero Login Needed) */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="p-3.5 bg-slate-50 hover:bg-emerald-50/50 rounded-2xl border border-slate-200 transition-colors flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="p-2.5 bg-white rounded-xl text-emerald-700 border border-slate-200 shrink-0 shadow-2xs">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Are you an Eco Green Customer?
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Track your complaint or raise a service ticket without logging in.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onSwitchToCustomer}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all shrink-0 active:scale-95 cursor-pointer text-center"
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
