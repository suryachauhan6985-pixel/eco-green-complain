import React, { useState } from 'react';
import { 
  Sun, Shield, Users, Wrench, Search, Plus, Bell, 
  CheckCircle2, ArrowRight, ArrowLeft, X, Sparkles, 
  MessageSquare, Mail, BarChart3, Star, RotateCcw, 
  MapPin, Phone, Download, HelpCircle, Compass, Clock, Smartphone 
} from 'lucide-react';

const TOUR_STEPS = [
  {
    id: 'welcome',
    tab: 'complaints',
    icon: Sun,
    badge: 'Introduction',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    title: 'Welcome to Eco Green Solar CMS! ☀️',
    subtitle: 'Full-stack Service & Complaint Management System',
    description: 'A purpose-built complaint tracking and technician dispatch system engineered for Eco Green Solar. It handles lifecycle servicing for three specialized solar product lines with automated WhatsApp & Email notifications at every milestone.',
    highlights: [
      { icon: Sun, label: 'Solar Rooftop Systems', desc: 'On-grid & off-grid inverters, panels, net meters, tripping issues' },
      { icon: Sparkles, label: 'Solar Water Heaters', desc: 'ETC/FPC collector tanks, descaling AMC, valves, leakages' },
      { icon: Wrench, label: 'Heat Pumps', desc: 'Commercial & residential heating, compressors, sensor codes (F1/F2)' }
    ],
    tip: '💡 Tip: You can take this tour anytime using the Tour button in the navigation bar!'
  },
  {
    id: 'roles',
    tab: 'complaints',
    icon: Shield,
    badge: 'Step 1 of 9: Enterprise Security',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    title: 'Role-Based Authentication & Portals',
    subtitle: 'Dedicated workspaces for Admin, Helpdesk Staff, and Field Technicians',
    description: 'Eco Green Solar enforces strict role-based access. Staff and technicians log in with their assigned User ID or Mobile number and password:',
    highlights: [
      { icon: Shield, label: 'Admin Supervisor', desc: 'Full access to system operations, user/staff management, analytics reports, and CSV data export.' },
      { icon: Users, label: 'Support Staff / Helpdesk', desc: 'Register complaints, assign certified technicians, manage WhatsApp chats, and follow up.' },
      { icon: Wrench, label: 'Field Technicians', desc: 'Mobile-first job cards for engineers to locate consumer sites, record spare parts, and resolve tickets.' },
      { icon: Search, label: 'Customer Public Portal', desc: 'Homeowners track ticket status and submit 5-star ratings without needing passwords.' }
    ],
    tip: '💡 For enterprise security, arbitrary role-switching is disabled. To switch accounts, simply log out and sign in with your credentials.'
  },
  {
    id: 'register',
    tab: 'complaints',
    icon: Plus,
    badge: 'Step 2 of 9: Registration',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    title: 'Registering Complaints & Auto Ticket ID',
    subtitle: 'Click "+ Register Ticket" to log any solar issue',
    description: 'Whenever a customer calls helpdesk or registers online, click "+ Register Ticket" in the top bar to create a ticket with full diagnostics:',
    highlights: [
      { icon: Sparkles, label: 'Auto-Generated Ticket ID', desc: 'Sequential format like EGS-2026-000101 for clear, human-readable reference.' },
      { icon: Sun, label: 'Product-Aware Fault Trees', desc: 'Categories adapt dynamically based on whether Rooftop Solar, Water Heater, or Heat Pump is selected.' },
      { icon: MessageSquare, label: 'Instant Multi-Channel Alerts', desc: 'Automatically fires a WhatsApp message and HTML email confirming registration with expected SLA turnaround.' }
    ],
    tip: '💡 All complaints start with status "Registered / Open" and appear instantly on the desk.'
  },
  {
    id: 'desk',
    tab: 'complaints',
    icon: Search,
    badge: 'Step 3 of 9: Complaints Desk',
    badgeColor: 'bg-blue-100 text-blue-800',
    title: 'Complaints Desk, Search & Multi-Filters',
    subtitle: 'Find, prioritize, and track all service tickets in real time',
    description: 'The main dashboard provides operational clarity across all active customer requests:',
    highlights: [
      { icon: Search, label: 'Universal Fast Search', desc: 'Search instantly by Ticket ID, Customer Phone number, Name, or Product Serial Number.' },
      { icon: Users, label: 'Multi-Criteria Filter Ribbon', desc: 'Filter by Product Type, Priority (Urgent/High/Medium/Low), or assigned Technician.' },
      { icon: Download, label: 'One-Click CSV Export', desc: 'Export full complaint datasets with all dates, resolution notes, and customer ratings for Excel analysis.' }
    ],
    tip: '💡 Click on any complaint card to open the detailed drawer on the right side!'
  },
  {
    id: 'drawer',
    tab: 'complaints',
    icon: Wrench,
    badge: 'Step 4 of 9: Ticket Drawer',
    badgeColor: 'bg-amber-100 text-amber-800',
    title: 'Assignment, Audit Timeline & Resolution',
    subtitle: 'Everything you need to process a ticket in a single drawer',
    description: 'Clicking any ticket opens the comprehensive Complaint Drawer with three powerful tabs:',
    highlights: [
      { icon: Users, label: 'Technician Assignment', desc: 'Select from certified technicians filtered by area zone and active ticket count. Auto-notifies both technician and customer!' },
      { icon: Clock, label: 'Interactive Audit Timeline', desc: 'Complete history of who did what, visit notes, status updates, and customer notification flags.' },
      { icon: CheckCircle2, label: 'Resolution & Closure', desc: 'Technicians log spare parts replaced (MCBs, valves, anodes) and staff conduct final verification before closure.' }
    ],
    tip: '💡 Also includes a "View Past History" button to see if a customer has had repeat complaints!'
  },
  {
    id: 'technician',
    tab: 'technician',
    icon: Wrench,
    badge: 'Step 5 of 9: Field Portal',
    badgeColor: 'bg-purple-100 text-purple-800',
    title: 'Mobile Field Technician Portal',
    subtitle: 'Optimized for solar engineers working on terraces and rooftops',
    description: 'Switch to the "Field Operations" tab to experience the mobile view built for service engineers on site:',
    highlights: [
      { icon: Phone, label: 'One-Tap Customer Contact', desc: 'Call the customer or launch a direct WhatsApp chat with a single tap.' },
      { icon: MapPin, label: 'Google Maps Directions', desc: 'Open the customer site address directly in Google Maps for quick terrace navigation.' },
      { icon: CheckCircle2, label: 'Fast Status & Resolution', desc: 'Update status from Assigned ➔ In Progress ➔ Resolved, record replaced spare parts, and upload photo proof.' }
    ],
    tip: '💡 Technicians only see tickets assigned to them to keep their workday focused.'
  },
  {
    id: 'customer',
    tab: 'customer',
    icon: Search,
    badge: 'Step 6 of 9: Customer Portal',
    badgeColor: 'bg-teal-100 text-teal-800',
    title: 'Public Customer Tracker & CSAT Rating',
    subtitle: 'Homeowners can track repairs and submit 5-star ratings without a password',
    description: 'Customers do not need complicated logins. They simply enter their Ticket ID or Phone number on the public portal:',
    highlights: [
      { icon: CheckCircle2, label: 'Visual Progress Stepper', desc: 'Live visual stepper showing: Registered ➔ Assigned ➔ In Progress ➔ Resolved ➔ Closed.' },
      { icon: Wrench, label: 'Technician Card', desc: 'Displays assigned technician name, direct phone number, and expected visit date.' },
      { icon: Star, label: '5-Star Feedback & Reopen', desc: 'Customers submit ratings and reviews upon resolution. If issue recurs, they can click "Reopen Ticket" with one touch.' }
    ],
    tip: '💡 Try searching ticket "EGS-2026-000101" or "EGS-2026-000105" on the Customer tab!'
  },
  {
    id: 'notifications',
    tab: 'complaints',
    icon: Bell,
    badge: 'Step 7 of 9: WhatsApp Center',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    title: 'Real-Time WhatsApp Web Hub',
    subtitle: 'Two-way chat synchronized with official Meta Cloud API',
    description: 'Open the "WhatsApp Web" tab to interact with customers in real time:',
    highlights: [
      { icon: MessageSquare, label: 'Two-Way Live Conversations', desc: 'Send and receive live WhatsApp messages, voice notes, PDFs, and invoices directly from the CMS.' },
      { icon: CheckCircle2, label: 'Eco Green Watermarked Chat', desc: 'Branded WhatsApp experience with instant template responses and ticket linking.' },
      { icon: Sparkles, label: 'Official Cloud API Sync', desc: 'Fully synchronized with 7878444414 and verified webhook delivery.' }
    ],
    tip: '💡 Use quick template replies to update customers on technician arrival time!'
  },
  {
    id: 'analytics',
    tab: 'analytics',
    icon: BarChart3,
    badge: 'Step 8 of 9: Management',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    title: 'Analytics & Notification Templates',
    subtitle: 'Data-driven service management and custom message copy',
    description: 'Explore the "Analytics & Reports" and "Templates & Settings" tabs in the top navigation bar:',
    highlights: [
      { icon: BarChart3, label: 'Operational KPI Counters', desc: 'Total complaints, active pipeline, average resolution turnaround in hours, and customer CSAT score.' },
      { icon: Users, label: 'Technician Leaderboard', desc: 'Track jobs completed, average hours per resolution, and customer satisfaction ratings per technician.' },
      { icon: MessageSquare, label: 'Custom Message Templates', desc: 'Customize WhatsApp and Email templates with live variables like {{customer_name}}, {{complaint_id}}, {{technician_name}}.' }
    ],
    tip: '💡 Supervisor insights help balance technician workloads across Gujarat!'
  },
  {
    id: 'pwa-install',
    tab: 'complaints',
    icon: Smartphone,
    badge: 'Step 9 of 9: Mobile App (PWA)',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    title: 'Install App on iPhone & Android',
    subtitle: 'Add Eco Green Solar CMS directly to your phone screen in seconds',
    description: 'No App Store or Play Store download required! Install the app directly for fullscreen speed and instant offline access:',
    highlights: [
      { icon: Smartphone, label: 'iPhone (Safari)', desc: 'Open the website in Safari ➔ Tap the Share button (square icon with arrow pointing up at the bottom) ➔ Scroll down and tap "Add to Home Screen" ➔ Tap "Add".' },
      { icon: Smartphone, label: 'Android (Chrome)', desc: 'Open in Chrome ➔ Tap the 3 dots in the top right ➔ Tap "Install app" or "Add to Home screen".' },
      { icon: Sparkles, label: 'Full App Experience', desc: 'Launches full-screen with the Eco Green Solar sun icon right from your phone home screen!' }
    ],
    tip: '💡 Field technicians can bookmark this on their phone home screen for instant 1-tap access on terraces!'
  }
];

export const OnboardingTour = ({ isOpen, onClose, onSwitchTab }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === TOUR_STEPS.length - 1;
  const IconComponent = currentStep.icon;

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      if (onSwitchTab && TOUR_STEPS[nextIdx].tab) {
        onSwitchTab(TOUR_STEPS[nextIdx].tab);
      }
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      if (onSwitchTab && TOUR_STEPS[prevIdx].tab) {
        onSwitchTab(TOUR_STEPS[prevIdx].tab);
      }
    }
  };

  const handleFinish = () => {
    localStorage.setItem('egs_cms_tour_completed', 'true');
    onClose();
  };

  const handleJumpToStep = (index) => {
    setCurrentStepIndex(index);
    if (onSwitchTab && TOUR_STEPS[index].tab) {
      onSwitchTab(TOUR_STEPS[index].tab);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Top Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 relative">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Modal Header */}
        <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
              <IconComponent className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-bold tracking-wider ${currentStep.badgeColor}`}>
                {currentStep.badge}
              </span>
              <h3 className="text-base sm:text-lg font-black text-white mt-1 leading-tight">
                {currentStep.title}
              </h3>
            </div>
          </div>

          <button
            onClick={handleFinish}
            title="Close Tour"
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <p className="text-xs sm:text-sm font-semibold text-emerald-800">
            {currentStep.subtitle}
          </p>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {currentStep.description}
          </p>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 gap-2.5 pt-1">
            {currentStep.highlights.map((h, i) => {
              const HIcon = h.icon;
              return (
                <div 
                  key={i} 
                  className="bg-slate-50 hover:bg-emerald-50/50 p-3 rounded-2xl border border-slate-200/80 transition-colors flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-white text-emerald-700 shadow-2xs shrink-0 mt-0.5 border border-slate-100">
                    <HIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">{h.label}</h5>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-normal">{h.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Pro Tip Box */}
          <div className="bg-amber-50/80 rounded-2xl p-3.5 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
            <span className="text-sm">💡</span>
            <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
              {currentStep.tip}
            </p>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {/* Step Dots indicator */}
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => handleJumpToStep(idx)}
                title={`Jump to ${s.title}`}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStepIndex 
                    ? 'w-6 bg-emerald-600' 
                    : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handleBack}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}

            <button
              onClick={handleFinish}
              className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              Skip
            </button>

            <button
              onClick={handleNext}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 flex items-center gap-1.5 transition-all"
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Finish Tour & Explore!
                </>
              ) : (
                <>
                  Next Feature
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
