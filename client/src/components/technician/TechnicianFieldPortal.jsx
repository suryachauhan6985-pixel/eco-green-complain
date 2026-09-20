import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  Wrench, Phone, MessageCircle, MapPin, CheckCircle, Clock, 
  Calendar, Upload, AlertTriangle, ArrowRight, RefreshCw, Star,
  Search, X, IndianRupee, ChevronDown, ChevronUp, CheckCheck,
  UserCheck, ShieldCheck, Layers, ExternalLink
} from 'lucide-react';
import { TicketAgeBadge, getTicketAgeInfo, formatIndianDateTime } from '../common/TicketAgeBadge';

export const TechnicianFieldPortal = ({ onSelectComplaint }) => {
  const { currentUser } = useAuth();
  const { showToast, confirm } = useDialog();
  const [complaints, setComplaints] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // active | resolved
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [techProfile, setTechProfile] = useState(null);

  // Cash Reconciliation UI States
  const [expandedTechId, setExpandedTechId] = useState(null);
  const [settlingAction, setSettlingAction] = useState(false);

  const fetchMyJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.getComplaints({});
      setComplaints(data.complaints || []);
    } catch (err) {
      if (!silent) console.error('Failed to load technician jobs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchTechniciansList = async () => {
    try {
      const data = await api.getTechnicians();
      const techs = data.technicians || [];
      setTechnicians(techs);

      const match = techs.find(t => 
        (currentUser?.technicianId && String(t.id) === String(currentUser.technicianId)) ||
        (currentUser?.id && t.user_id && String(t.user_id) === String(currentUser.id)) ||
        (currentUser?.email && t.email?.toLowerCase() === currentUser.email?.toLowerCase()) ||
        (currentUser?.name && t.name?.toLowerCase() === currentUser.name?.toLowerCase())
      ) || techs[0];
      setTechProfile(match);
    } catch (e) {
      console.error('Failed to load tech profile:', e);
    }
  };

  useEffect(() => {
    fetchMyJobs();
    fetchTechniciansList();

    // Real-time SSE listener
    let eventSource = null;
    try {
      if (typeof window !== 'undefined' && window.EventSource) {
        eventSource = new EventSource('/api/realtime/stream');
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'complaint_updated') {
              fetchMyJobs(true);
            }
          } catch (e) {}
        };
      }
    } catch (e) {}

    // Resilient background interval
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchMyJobs(true);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [currentUser]);

  const handleToggleDuty = async () => {
    if (!techProfile) return;
    try {
      const newStatus = !techProfile.is_available;
      await api.updateTechnicianAvailability(techProfile.id, newStatus);
      setTechProfile(prev => ({ ...prev, is_available: newStatus ? 1 : 0 }));
      showToast(newStatus ? 'Duty status set to: ON DUTY' : 'Duty status set to: OFF DUTY', 'info');
    } catch (err) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  // Collect All cash from a single technician
  const handleBatchSettle = async (tech, cashDue) => {
    const ok = await confirm({
      title: 'Collect Full Technician Balance',
      message: `Confirm collecting all ₹${cashDue} cash from technician "${tech.name}" and depositing into company accounts?`,
      type: 'payment',
      confirmText: `Collect ₹${cashDue}`,
      cancelText: 'Cancel'
    });

    if (!ok) return;

    try {
      setSettlingAction(true);
      const res = await api.settleAllTechnicianComplaints(tech.id);
      showToast(`Successfully collected ₹${res.totalAmount || cashDue} from ${tech.name} across ${res.settledCount || 0} tickets!`, 'success');
      await fetchMyJobs();
      await fetchTechniciansList();
    } catch (err) {
      showToast('Failed to settle technician balance: ' + err.message, 'error');
    } finally {
      setSettlingAction(false);
    }
  };

  // Collect cash for one specific complaint
  const handleSingleSettle = async (e, comp, tech) => {
    e.stopPropagation();
    const amount = comp.payment_collected || 0;
    const ok = await confirm({
      title: 'Collect Ticket Cash Deposit',
      message: `Confirm receiving ₹${amount} cash from technician "${tech?.name || 'Assigned Tech'}" for Ticket #${comp.ticket_id} into company account?`,
      type: 'payment',
      confirmText: `Receive ₹${amount}`,
      cancelText: 'Cancel'
    });

    if (!ok) return;

    try {
      setSettlingAction(true);
      await api.settleCompanyPayment(comp.id, {
        notes: `Settled by ${currentUser?.name || 'Admin'} from Field View`,
        amount_received: amount
      });
      showToast(`Received ₹${amount} for Ticket #${comp.ticket_id} into company account!`, 'success');
      await fetchMyJobs();
      await fetchTechniciansList();
    } catch (err) {
      showToast('Failed to record settlement: ' + err.message, 'error');
    } finally {
      setSettlingAction(false);
    }
  };

  // Compute Technician Cash Breakdown
  const techCashBreakdown = technicians.map(tech => {
    // Find all complaints assigned to this technician that collected payment
    const techJobs = complaints.filter(c => String(c.assigned_technician_id) === String(tech.id) || String(c.technician_id) === String(tech.id));
    const cashJobs = techJobs.filter(c => (parseFloat(c.payment_collected) || 0) > 0);
    const totalCollected = cashJobs.reduce((sum, c) => sum + (parseFloat(c.payment_collected) || 0), 0);
    const totalSettled = cashJobs
      .filter(c => c.company_settlement_status === 'Settled with Company')
      .reduce((sum, c) => sum + (parseFloat(c.payment_collected) || 0), 0);
    const cashInHandDue = Math.max(0, totalCollected - totalSettled);
    const pendingJobs = cashJobs.filter(c => c.company_settlement_status !== 'Settled with Company');

    return {
      ...tech,
      cashJobs,
      totalCollected,
      totalSettled,
      cashInHandDue,
      pendingJobs
    };
  });

  // Scoped Technician Profiles
  const myTechData = techCashBreakdown.find(t => 
    (currentUser?.technicianId && String(t.id) === String(currentUser.technicianId)) ||
    (techProfile && String(t.id) === String(techProfile.id)) ||
    (currentUser?.id && t.user_id && String(t.user_id) === String(currentUser.id)) ||
    (currentUser?.email && t.email?.toLowerCase() === currentUser.email?.toLowerCase()) ||
    (currentUser?.name && t.name?.toLowerCase() === currentUser.name?.toLowerCase())
  ) || techCashBreakdown[0];

  const visibleTechs = currentUser?.role === 'technician'
    ? (myTechData ? [myTechData] : [])
    : techCashBreakdown;

  // Grand totals across all technicians (for admin/staff)
  const overallCashCollected = techCashBreakdown.reduce((sum, t) => sum + t.totalCollected, 0);
  const overallCashSettled = techCashBreakdown.reduce((sum, t) => sum + t.totalSettled, 0);
  const overallCashDue = techCashBreakdown.reduce((sum, t) => sum + t.cashInHandDue, 0);

  // Scoped complaints: If logged in as technician, ONLY show jobs assigned to this technician!
  const scopedComplaints = currentUser?.role === 'technician' && myTechData
    ? complaints.filter(c => 
        String(c.assigned_technician_id) === String(myTechData.id) || 
        String(c.technician_id) === String(myTechData.id) ||
        (c.technician_name && c.technician_name.toLowerCase() === myTechData.name.toLowerCase())
      )
    : complaints;

  const activeComplaints = scopedComplaints.filter(c => ['Assigned', 'In Progress', 'On Hold', 'Reopened'].includes(c.status));
  const resolvedComplaints = scopedComplaints.filter(c => ['Resolved', 'Closed'].includes(c.status));

  const currentTabList = activeTab === 'active' ? activeComplaints : resolvedComplaints;

  const displayList = currentTabList.filter(job => {
    if (productFilter !== 'all' && job.product_type !== productFilter) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (job.ticket_id && job.ticket_id.toLowerCase().includes(q)) ||
      (job.customer_name && job.customer_name.toLowerCase().includes(q)) ||
      (job.customer_phone && job.customer_phone.includes(q)) ||
      (job.customer_address && job.customer_address.toLowerCase().includes(q)) ||
      (job.issue_category && job.issue_category.toLowerCase().includes(q)) ||
      (job.issue_description && job.issue_description.toLowerCase().includes(q)) ||
      (job.product_type && job.product_type.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full space-y-5">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-4 sm:p-6 rounded-2xl shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-xl">
              <Wrench className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <span className="text-[11px] uppercase font-mono tracking-wider text-emerald-200">
                {currentUser?.role === 'technician' ? 'Technician Field Workspace' : 'Field Operations & Cash Management'}
              </span>
              <h2 className="text-lg sm:text-xl font-black">
                {currentUser?.role === 'technician' ? (techProfile?.name || currentUser?.name) : (currentUser?.name || 'Admin Supervisor')}
              </h2>
              <p className="text-xs text-emerald-100">
                Service Zone: <strong>{techProfile?.area_zone || 'All Gujarat & Bengaluru Territories'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live Duty Toggle Button (for technicians) */}
            {techProfile && (
              <button
                onClick={handleToggleDuty}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 shadow-xs ${
                  techProfile.is_available
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border-emerald-400/40'
                    : 'bg-rose-500/30 hover:bg-rose-500/40 text-rose-100 border-rose-400/50'
                }`}
                title="Tap to toggle On-Duty / Off-Duty status"
              >
                <span className={`w-2 h-2 rounded-full ${techProfile.is_available ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                <span>{techProfile.is_available ? 'On Duty' : 'Off Duty'}</span>
              </button>
            )}

            <button
              onClick={() => { fetchMyJobs(); fetchTechniciansList(); }}
              title="Refresh jobs & settlement data"
              className="p-2 hover:bg-white/10 rounded-xl text-emerald-200 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading || settlingAction ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ================= TECHNICIAN CASH RECONCILIATION & SETTLEMENT SECTION ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-600" />
              <span>{currentUser?.role === 'technician' ? 'My Cash Collection & Company Settlement Register' : 'Technician Cash Collection & Company Settlement Register'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentUser?.role === 'technician' 
                ? 'Track cash you collected from customers, verify ticket dates & timestamps, and review settlement status.' 
                : 'Track cash collected from customers by each technician, inspect ticket breakdown, and settle balances.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-mono px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-semibold">
              {currentUser?.role === 'technician' ? (techProfile?.name || 'Technician Desk') : `${technicians.length} Registered Techs`}
            </span>
          </div>
        </div>

        {/* Overview Cards: Scoped to logged-in tech if technician, or company-wide if admin */}
        {currentUser?.role === 'technician' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">My Customer Cash Collected</span>
              <strong className="text-lg font-black text-slate-800 font-mono block mt-1">₹{myTechData?.totalCollected || 0}</strong>
              <span className="text-[10px] text-slate-400">Total collected across your assigned jobs</span>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Deposited / Settled with Company</span>
              <strong className="text-lg font-black text-emerald-700 font-mono block mt-1">₹{myTechData?.totalSettled || 0}</strong>
              <span className="text-[10px] text-emerald-600 font-medium">Safe & verified in company accounts</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              (myTechData?.cashInHandDue || 0) > 0 ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] uppercase font-bold block ${(myTechData?.cashInHandDue || 0) > 0 ? 'text-amber-900 font-black' : 'text-slate-500'}`}>
                  Cash in Hand (To Deposit)
                </span>
                {(myTechData?.cashInHandDue || 0) > 0 && (
                  <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                    Deposit Pending
                  </span>
                )}
              </div>
              <strong className={`text-lg font-black font-mono block mt-1 ${(myTechData?.cashInHandDue || 0) > 0 ? 'text-amber-950' : 'text-slate-700'}`}>
                ₹{myTechData?.cashInHandDue || 0}
              </strong>
              <span className="text-[10px] text-amber-800">
                {(myTechData?.cashInHandDue || 0) > 0 ? 'Please deposit this cash at the company office/account' : 'All collected cash has been deposited'}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Customer Cash Collected</span>
              <strong className="text-lg font-black text-slate-800 font-mono block mt-1">₹{overallCashCollected}</strong>
              <span className="text-[10px] text-slate-400">Across all field service jobs</span>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Deposited / Settled with Company</span>
              <strong className="text-lg font-black text-emerald-700 font-mono block mt-1">₹{overallCashSettled}</strong>
              <span className="text-[10px] text-emerald-600 font-medium">Safe in company bank/office accounts</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              overallCashDue > 0 ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] uppercase font-bold block ${overallCashDue > 0 ? 'text-amber-900 font-black' : 'text-slate-500'}`}>
                  Cash in Hand (Due from Techs)
                </span>
                {overallCashDue > 0 && (
                  <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                    Deposit Pending
                  </span>
                )}
              </div>
              <strong className={`text-lg font-black font-mono block mt-1 ${overallCashDue > 0 ? 'text-amber-950' : 'text-slate-700'}`}>
                ₹{overallCashDue}
              </strong>
              <span className="text-[10px] text-amber-800">
                {overallCashDue > 0 ? 'Cash currently with field technicians' : 'All collected cash has been deposited'}
              </span>
            </div>
          </div>
        )}

        {/* Cash Details & Applications Breakdown: ONLY show logged-in tech for technicians, or full list for admin/staff */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {currentUser?.role === 'technician' ? 'My Cash Collection Tickets & Timestamp History' : 'Technicians Cash Details & Applications Breakdown'}
          </h4>

          <div className="space-y-3">
            {visibleTechs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                No cash collection records found.
              </div>
            ) : (
              visibleTechs.map((tech) => {
                const isExpanded = currentUser?.role === 'technician' || expandedTechId === tech.id;
                const hasDue = tech.cashInHandDue > 0;

                return (
                  <div 
                    key={tech.id} 
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      hasDue ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Technician Summary Header Bar */}
                    <div className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          hasDue ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {tech.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-slate-900">{tech.name}</h4>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              tech.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {tech.is_available ? '🟢 On Duty' : '⚪ Off Duty'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-mono">
                            {tech.phone ? (tech.phone.startsWith('+') ? tech.phone : `+${tech.phone}`) : 'No phone set'} • Zone: <strong>{tech.area_zone}</strong>
                          </p>
                        </div>
                      </div>

                    {/* Cash Totals for this Technician */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 self-start md:self-auto text-xs">
                      <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-semibold">Collected</span>
                        <strong className="text-xs font-mono font-bold text-slate-800">₹{tech.totalCollected}</strong>
                      </div>

                      <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 block font-semibold">Deposited</span>
                        <strong className="text-xs font-mono font-bold text-emerald-800">₹{tech.totalSettled}</strong>
                      </div>

                      <div className={`px-3 py-1.5 rounded-xl border ${
                        hasDue ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-black' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        <span className="text-[10px] block uppercase font-bold">Due from Tech</span>
                        <strong className="text-xs font-mono font-black">₹{tech.cashInHandDue}</strong>
                      </div>

                      {/* Collect All Button */}
                      {hasDue && ['admin', 'staff'].includes(currentUser?.role) && (
                        <button
                          type="button"
                          onClick={() => handleBatchSettle(tech, tech.cashInHandDue)}
                          disabled={settlingAction}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          title="Settle and collect all pending cash for this technician"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Collect All (₹{tech.cashInHandDue})</span>
                        </button>
                      )}

                      {/* Expand / Collapse Application Details */}
                      <button
                        type="button"
                        onClick={() => setExpandedTechId(isExpanded ? null : tech.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>{tech.cashJobs.length} Tickets</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Tickets / Applications Breakdown */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Cash Collection by {tech.name} across Complaints / Applications:
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {tech.pendingJobs.length} ticket(s) pending deposit
                        </span>
                      </div>

                      {tech.cashJobs.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
                          No cash payments collected by this technician yet.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <thead>
                              <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                <th className="py-2.5 px-3">Ticket ID</th>
                                <th className="py-2.5 px-3">Customer & Location</th>
                                <th className="py-2.5 px-3">Product / Issue</th>
                                <th className="py-2.5 px-3">Amount Collected</th>
                                <th className="py-2.5 px-3">Status</th>
                                <th className="py-2.5 px-3 text-right">Settlement Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {tech.cashJobs.map((comp) => {
                                const isSettled = comp.company_settlement_status === 'Settled with Company';
                                return (
                                  <tr key={comp.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                      <button
                                        type="button"
                                        onClick={() => onSelectComplaint && onSelectComplaint(comp.ticket_id || comp.id)}
                                        className="text-emerald-700 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                                      >
                                        <span>{comp.ticket_id}</span>
                                        <ExternalLink className="w-3 h-3 text-slate-400" />
                                      </button>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <strong className="text-slate-800 block truncate max-w-[180px]">{comp.customer_name}</strong>
                                      <span className="text-[10px] text-slate-400 font-mono">+{comp.customer_phone} {comp.city ? '• ' + comp.city : ''}</span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="text-slate-700 block truncate max-w-[180px] font-medium">{comp.issue_category}</span>
                                      <span className="text-[10px] text-slate-400 block">{comp.product_type}</span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono">
                                      <strong className="text-slate-900 text-xs font-black">₹{comp.payment_collected || 0}</strong>
                                      <span className="text-[10px] text-slate-400 block">({comp.payment_status || 'Paid'})</span>
                                      {comp.payment_collected_at ? (
                                        <span className="text-[9px] text-slate-600 font-sans block mt-0.5" title="Payment Collection Date & Timestamp">
                                          📅 {new Date(comp.payment_collected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                                          ⏰ {new Date(comp.payment_collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 font-sans block mt-0.5">Date recorded</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {isSettled ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                                          <CheckCheck className="w-3 h-3 text-emerald-700" />
                                          <span>Deposited</span>
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 flex items-center gap-1 w-fit">
                                          <Clock className="w-3 h-3 text-amber-700" />
                                          <span>Pending Deposit</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      {isSettled ? (
                                        <span className="text-[11px] text-slate-400 font-mono">Verified in Account</span>
                                      ) : ['admin', 'staff'].includes(currentUser?.role) ? (
                                        <button
                                          type="button"
                                          onClick={(e) => handleSingleSettle(e, comp, tech)}
                                          disabled={settlingAction}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer"
                                          title="Mark this ticket cash as received from technician"
                                        >
                                          Collect ₹{comp.payment_collected}
                                        </button>
                                      ) : (
                                        <span className="text-[11px] text-amber-700 font-semibold">Deposit at counter</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
        </div>
      </div>

      {/* ================= FIELD TASKS & WORK SECTION ================= */}
      <div className="space-y-3">
        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2.5 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'active' ? 'bg-emerald-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Active Field Tasks ({activeComplaints.length})
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`py-2.5 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'resolved' ? 'bg-emerald-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Completed Work ({resolvedComplaints.length})
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search field tasks by Ticket, Customer, Address, Issue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700"
            >
              <option value="all">All Solar Products</option>
              <option value="Solar Rooftop Systems">Solar Rooftop Systems</option>
              <option value="Solar Water Heaters">Solar Water Heaters</option>
              <option value="Heat Pumps">Heat Pumps</option>
              <option value="Pressure Pumps">Pressure Pumps</option>
            </select>
          </div>
        </div>

        {/* Jobs Cards Feed — 2 Cards Horizontally Side-by-Side on PC */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loading ? (
            <div className="lg:col-span-2 py-16 text-center text-slate-400 text-xs">Loading technician jobs...</div>
          ) : displayList.length === 0 ? (
            <div className="lg:col-span-2 bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="font-bold text-sm text-slate-800">
                {activeTab === 'active' ? 'No pending service jobs!' : 'No completed jobs yet.'}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {searchTerm ? 'No tasks match your search filter.' : 'You are all caught up. Check back when support desk assigns a new complaint.'}
              </p>
            </div>
          ) : (
            displayList.map((job) => {
              const ageInfo = getTicketAgeInfo(job);
              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-2xl border shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between ${
                    ageInfo.isOverdue
                      ? 'border-rose-300 ring-1 ring-rose-200 border-l-4 border-l-rose-500'
                      : 'border-slate-200 hover:border-emerald-500'
                  }`}
                >
                  {/* Job Card Header */}
                  <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded truncate">
                        {job.ticket_id}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        job.status === 'In Progress' ? 'bg-blue-600 text-white' :
                        job.status === 'Resolved' ? 'bg-emerald-600 text-white' :
                        job.status === 'Closed' ? 'bg-slate-700 text-white' :
                        'bg-amber-500 text-slate-900'
                      }`}>
                        {job.status}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        👨‍🔧 {job.technician_name || myTechData?.name || currentUser?.name || 'Assigned to You'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        job.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                        job.priority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {job.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <TicketAgeBadge complaint={job} compact={true} />
                      <span className="text-[10px] font-medium text-slate-500 bg-white/90 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0" title="Registered Time (IST)">
                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                        <span>{formatIndianDateTime(job.created_at)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Job Details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                          {job.product_type}
                        </span>
                        {job.estimated_charges > 0 && (
                          <span className="text-[11px] font-bold text-slate-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Charge: ₹{job.estimated_charges} • <span className={job.payment_status === 'Collected' ? 'text-emerald-700' : 'text-amber-700'}>{job.payment_status || 'Unpaid'}</span>
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-slate-900">
                        {job.issue_category}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                        {job.issue_description}
                      </p>
                    </div>

                    {/* Customer Details & One-Tap Actions */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-slate-400 block text-[10px]">Customer:</span>
                          <strong className="text-slate-900 truncate block">{job.customer_name}</strong>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`tel:${job.customer_phone}`}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-xs"
                          >
                            <Phone className="w-3 h-3" /> Call
                          </a>
                          <a
                            href={`https://wa.me/${(job.customer_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              `☀️ *Eco Green Solar - Field Service Desk*\n\n` +
                              `Namaste *${job.customer_name}*,\n\n` +
                              `This is your assigned service technician regarding complaint ticket *#${job.ticket_id}* (${job.product_type || 'Solar System'}).\n\n` +
                              `I am on my way / preparing to visit your site for the inspection. Please confirm if the premises are accessible.\n\n` +
                              `📞 Helpdesk: +91 78784 44414\n` +
                              `- Eco Green Technical Services`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg font-bold text-[11px] flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3" /> WhatsApp
                          </a>
                        </div>
                      </div>

                      <div className="flex items-start gap-1 text-slate-600 pt-1 border-t border-slate-200/60">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="flex-1 text-[11px] line-clamp-1">{job.city ? `${job.city} • ` : ''}{job.customer_address}</span>
                        <a
                          href={job.location_url || `https://maps.google.com/?q=${encodeURIComponent(job.customer_address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-emerald-700 font-semibold hover:underline shrink-0"
                        >
                          {job.location_url ? '📍 Site Map' : 'Map'}
                        </a>
                      </div>
                    </div>

                    {/* If resolved: show notes */}
                    {job.resolution_notes && (
                      <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200 text-xs text-emerald-950">
                        <strong>Resolution Log:</strong> {job.resolution_notes}
                        {job.spare_parts_used && (
                          <div className="text-[11px] text-emerald-800 mt-0.5">
                            <strong>Parts:</strong> {job.spare_parts_used}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Open Full Action Drawer */}
                    <button
                      onClick={() => onSelectComplaint && onSelectComplaint(job.ticket_id || job.id)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <span>Update Notes, Collect Payment & Mark Resolved</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
