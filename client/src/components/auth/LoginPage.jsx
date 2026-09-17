import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Sun, Shield, Users, Wrench, Search, Lock, Mail, 
  Eye, EyeOff, ArrowRight, CheckCircle2, Sparkles, AlertCircle 
} from 'lucide-react';

const SLIDES = [
  {
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

  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

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
          {/* Subtle moving ambient glows */}
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-emerald-500/20 rounded-full blur-2xl animate-pulse pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-teal-400/20 rounded-full blur-2xl animate-pulse pointer-events-none" />

          <div className="relative z-10">
            {/* Official Transparent Company Logo (no white background box) */}
            <div className="mb-6 flex items-center">
              <img 
                src="/company-logo-white.png" 
                alt="Eco Green Solar" 
                className="h-11 sm:h-12 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" 
              />
            </div>

            {/* Dynamic Animated Slide Content */}
            <div className="transition-all duration-500 min-h-[310px] flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-semibold text-emerald-300 mb-3 backdrop-blur-xs">
                  <Sparkles className="w-3 h-3 text-emerald-300 animate-spin" style={{ animationDuration: '8s' }} />
                  <span>{SLIDES[activeSlide].badge}</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight mb-2 transition-all duration-300">
                  {SLIDES[activeSlide].title}
                </h2>
                <p className="text-xs text-emerald-100/90 leading-relaxed mb-5">
                  {SLIDES[activeSlide].desc}
                </p>

                {/* Animated Highlights */}
                <div className="space-y-3">
                  {SLIDES[activeSlide].highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-emerald-50/95 animate-in fade-in slide-in-from-left-2 duration-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>{h.label}:</strong> {h.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Carousel Navigation Dots */}
            <div className="flex items-center gap-2 mt-6">
              {SLIDES.map((_, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setActiveSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    activeSlide === idx 
                      ? 'w-6 bg-emerald-400 shadow-sm shadow-emerald-400/50' 
                      : 'w-1.5 bg-white/30 hover:bg-white/60'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Footer note on left */}
          <div className="mt-6 pt-4 border-t border-emerald-700/50 text-[11px] text-emerald-200/80 flex items-center justify-between relative z-10">
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
