import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  Wrench, Phone, MessageCircle, MapPin, CheckCircle, Clock, 
  Calendar, Upload, AlertTriangle, ArrowRight, RefreshCw, Star,
  Search, X, IndianRupee 
} from 'lucide-react';
import { TicketAgeBadge, getTicketAgeInfo } from '../common/TicketAgeBadge';

export const TechnicianFieldPortal = ({ onSelectComplaint }) => {
  const { currentUser } = useAuth();
  const { showToast } = useDialog();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // active | resolved
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [techProfile, setTechProfile] = useState(null);

  const fetchMyJobs = async () => {
    try {
      setLoading(true);
      const data = await api.getComplaints({});
      setComplaints(data.complaints || []);
    } catch (err) {
      console.error('Failed to load technician jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTechProfile = async () => {
    try {
      const data = await api.getTechnicians();
      const techs = data.technicians || [];
      const match = techs.find(t => 
        (currentUser?.email && t.email === currentUser.email) ||
        (currentUser?.name && t.name.toLowerCase().includes('rohit'))
      ) || techs[0];
      setTechProfile(match);
    } catch (e) {
      console.error('Failed to load tech profile:', e);
    }
  };

  useEffect(() => {
    fetchMyJobs();
    fetchTechProfile();
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

  const activeComplaints = complaints.filter(c => ['Assigned', 'In Progress', 'On Hold', 'Reopened'].includes(c.status));
  const resolvedComplaints = complaints.filter(c => ['Resolved', 'Closed'].includes(c.status));

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
    <div className="w-full space-y-4">
      {/* Technician Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-4 sm:p-6 rounded-2xl shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-xl">
              <Wrench className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <span className="text-[11px] uppercase font-mono tracking-wider text-emerald-200">
                Technician Field Workspace
              </span>
              <h2 className="text-lg sm:text-xl font-black">
                {currentUser?.name || 'Rohit Kumar (Technician)'}
              </h2>
              <p className="text-xs text-emerald-100">
                Assigned Service Zone: <strong>{techProfile?.area_zone || 'North & East Bengaluru'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live Duty Toggle Button */}
            {techProfile && (
              <button
                onClick={handleToggleDuty}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 shadow-xs ${
                  techProfile.is_available
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border-emerald-400/40'
                    : 'bg-rose-500/30 hover:bg-rose-500/40 text-rose-100 border-rose-400/50'
                }`}
                title="Tap to toggle your On-Duty / Off-Duty status"
              >
                <span className={`w-2 h-2 rounded-full ${techProfile.is_available ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                <span>{techProfile.is_available ? 'On Duty' : 'Off Duty'}</span>
              </button>
            )}

            <button
              onClick={() => { fetchMyJobs(); fetchTechProfile(); }}
              title="Refresh jobs"
              className="p-2 hover:bg-white/10 rounded-xl text-emerald-200 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-emerald-700/50">
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'active' ? 'bg-white text-emerald-900 shadow-sm' : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            Active Field Tasks ({activeComplaints.length})
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'resolved' ? 'bg-white text-emerald-900 shadow-sm' : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            Completed Work ({resolvedComplaints.length})
          </button>
        </div>
      </div>

      {/* Cash Collection & Company Settlement Balance Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
            My Cash Collection & Company Settlement
          </h3>
          <span className="text-[11px] text-slate-400">Account Reconciliation</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Customer Cash Collected</span>
            <strong className="text-base font-black text-slate-800 font-mono">₹{techProfile?.total_collected || 0}</strong>
          </div>

          <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Deposited / Settled with Company</span>
            <strong className="text-base font-black text-emerald-700 font-mono">₹{techProfile?.total_settled_with_company || 0}</strong>
          </div>

          <div className={`p-2.5 rounded-xl border ${
            (techProfile?.cash_in_hand_due || 0) > 0 
              ? 'bg-amber-50 border-amber-300' 
              : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-[10px] uppercase font-bold block ${
              (techProfile?.cash_in_hand_due || 0) > 0 ? 'text-amber-900 font-black' : 'text-slate-400'
            }`}>
              Cash in Hand (Due to Company)
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <strong className={`text-base font-black font-mono ${
                (techProfile?.cash_in_hand_due || 0) > 0 ? 'text-amber-900' : 'text-slate-700'
              }`}>
                ₹{techProfile?.cash_in_hand_due || 0}
              </strong>
              {(techProfile?.cash_in_hand_due || 0) > 0 && (
                <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                  Deposit Pending
                </span>
              )}
            </div>
          </div>
        </div>

        {(techProfile?.cash_in_hand_due || 0) > 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50/50 p-2 rounded-lg mt-2 border border-amber-200/60">
            💡 Aapke paas customer se collect kiye huye <strong>₹{techProfile?.cash_in_hand_due}</strong> cash mein hain. Kripya office cash counter / account mein deposit karwayein taaki settlement update ho sake.
          </p>
        )}
      </div>

      {/* Off-Duty Notice Alert if technician is on leave */}
      {techProfile && !techProfile.is_available && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏖️</span>
            <div>
              <h4 className="font-bold text-amber-900">You are currently marked Off-Duty (On Leave)</h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Support staff at Complaints Desk can see you are off-duty. They will be warned if they attempt to dispatch new complaints to you.
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleDuty}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-xs active:scale-95 transition-all"
          >
            Mark Myself On-Duty
          </button>
        </div>
      )}

      {/* Technician Search & Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search my tasks by Ticket ID, Customer, Phone, Address, or Issue..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
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
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      job.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                      job.priority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {job.priority}
                    </span>
                  </div>

                  <TicketAgeBadge complaint={job} compact={true} />
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
                        href={`https://wa.me/${job.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Namaste ' + job.customer_name + ', I am your Eco Green Solar technician regarding ' + job.ticket_id)}`}
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
                  onClick={() => onSelectComplaint(job.id)}
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
  );
};
