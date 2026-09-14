import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { 
  X, User, Phone, Mail, MapPin, Calendar, Clock, Wrench, 
  Send, CheckCircle, AlertCircle, RefreshCw, Paperclip, MessageSquare, 
  History, RotateCcw, Check, Star, ShieldCheck, Tag, ChevronRight 
} from 'lucide-react';

const STATUS_ORDER = ['Registered', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

export const ComplaintDetailDrawer = ({ 
  complaintId, 
  isOpen, 
  onClose, 
  onComplaintUpdated,
  onViewCustomerHistory 
}) => {
  const { currentUser } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview | timeline | notifications

  // Actions state
  const [selectedTechId, setSelectedTechId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState('');
  const [notifyCustomerToggle, setNotifyCustomerToggle] = useState(true);
  const [submittingNote, setSubmittingNote] = useState(false);

  const [resolutionNotes, setResolutionNotes] = useState('');
  const [spareParts, setSpareParts] = useState('');
  const [resolutionPhoto, setResolutionPhoto] = useState(null);
  const [resolving, setResolving] = useState(false);

  const [closureRemarks, setClosureRemarks] = useState('');
  const [closing, setClosing] = useState(false);

  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const fetchTicketDetails = async () => {
    if (!complaintId) return;
    try {
      setLoading(true);
      const data = await api.getComplaint(complaintId);
      setTicket(data.complaint);
      setAttachments(data.attachments || []);
      setTimeline(data.timeline || []);
      setNotifications(data.notifications || []);
      if (data.complaint.assigned_technician_id) {
        setSelectedTechId(String(data.complaint.assigned_technician_id));
      }
      if (data.complaint.expected_visit_date) {
        setExpectedDate(data.complaint.expected_visit_date);
      }
      setFollowUpStatus(data.complaint.status);
    } catch (err) {
      console.error('Failed to load complaint details:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTechs = async () => {
    try {
      const data = await api.getTechnicians();
      setTechnicians(data.technicians || []);
    } catch (e) {
      console.error('Failed to load technicians:', e);
    }
  };

  useEffect(() => {
    if (isOpen && complaintId) {
      fetchTicketDetails();
      fetchTechs();
    }
  }, [isOpen, complaintId]);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedTechId) return alert('Select a technician to assign');
    try {
      setAssigning(true);
      await api.assignTechnician(ticket.id, selectedTechId, expectedDate);
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      alert('Failed to assign technician: ' + err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!followUpNote.trim()) return;
    try {
      setSubmittingNote(true);
      await api.addTimelineNote(ticket.id, {
        notes: followUpNote,
        status: followUpStatus !== ticket.status ? followUpStatus : undefined,
        notify_customer: notifyCustomerToggle
      });
      setFollowUpNote('');
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      alert('Failed to add note: ' + err.message);
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) return alert('Please enter resolution notes');
    try {
      setResolving(true);
      const data = new FormData();
      data.append('resolution_notes', resolutionNotes);
      if (spareParts) data.append('spare_parts_used', spareParts);
      if (resolutionPhoto) data.append('closing_photo', resolutionPhoto);

      await api.resolveComplaint(ticket.id, data);
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      alert('Failed to resolve complaint: ' + err.message);
    } finally {
      setResolving(false);
    }
  };

  const handleCloseTicket = async () => {
    try {
      setClosing(true);
      await api.closeComplaint(ticket.id, closureRemarks);
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      alert('Failed to close ticket: ' + err.message);
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    try {
      setReopening(true);
      await api.reopenComplaint(ticket.id, reopenReason);
      setReopenReason('');
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      alert('Failed to reopen ticket: ' + err.message);
    } finally {
      setReopening(false);
    }
  };

  const handleResendNotif = async (logId) => {
    try {
      await api.resendNotification(logId);
      await fetchTicketDetails();
      alert('Notification resent successfully!');
    } catch (err) {
      alert('Failed to resend: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto max-w-full flex w-full sm:w-auto">
        <div className="w-full sm:w-screen sm:max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="px-3.5 sm:px-6 py-3 sm:py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 gap-2 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded">
                  {ticket?.ticket_id || 'Loading...'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase ${
                  ticket?.status === 'Resolved' ? 'bg-emerald-600 text-white' :
                  ticket?.status === 'Closed' ? 'bg-slate-700 text-slate-200' :
                  ticket?.status === 'In Progress' ? 'bg-blue-600 text-white' :
                  ticket?.status === 'Assigned' ? 'bg-amber-600 text-white' :
                  ticket?.status === 'Reopened' ? 'bg-rose-600 text-white' :
                  'bg-yellow-500 text-slate-950'
                }`}>
                  {ticket?.status}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  ticket?.priority === 'Urgent' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                  ticket?.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                  'bg-slate-800 text-slate-300'
                }`}>
                  {ticket?.priority} Priority
                </span>
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                {ticket?.product_type} — {ticket?.issue_category}
              </h3>
            </div>

            {/* High-visibility Close Button on both Mobile & PC */}
            <button 
              onClick={onClose}
              className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 active:bg-rose-600 border border-slate-700 rounded-xl text-slate-200 hover:text-white flex items-center gap-1.5 transition-all shadow-md shrink-0"
              title="Close Ticket Window"
            >
              <X className="w-5 h-5 text-rose-400 stroke-[2.5]" />
              <span className="text-xs font-bold text-white pr-0.5">Close</span>
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="px-3.5 sm:px-6 bg-slate-100 border-b border-slate-200 flex items-center justify-between overflow-x-auto shrink-0">
            <div className="flex gap-2 sm:gap-4 text-xs font-semibold whitespace-nowrap">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Ticket Overview & Actions
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'timeline'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Audit Timeline ({timeline.length})
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'notifications'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Dispatched Alerts ({notifications.length})
              </button>
            </div>

            <button
              onClick={fetchTicketDetails}
              title="Refresh details"
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading && !ticket ? (
              <div className="py-20 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                Loading ticket details...
              </div>
            ) : ticket && (
              <>
                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Customer Info Card */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-700" />
                          Customer Details
                        </h4>
                        <button
                          onClick={() => onViewCustomerHistory(ticket.customer_phone)}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-0.5"
                        >
                          View Past History ({ticket.customer_phone})
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Name:</span>
                          <strong className="text-slate-900">{ticket.customer_name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Phone (WhatsApp):</span>
                          <a href={`tel:${ticket.customer_phone}`} className="font-mono text-emerald-700 font-semibold hover:underline">
                            {ticket.customer_phone}
                          </a>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Email:</span>
                          <span className="text-slate-800">{ticket.customer_email || 'Not provided'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Installation ID / Serial:</span>
                          <span className="font-mono text-slate-800">{ticket.product_serial || ticket.installation_id || 'N/A'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[11px]">Address:</span>
                          <span className="text-slate-800">{ticket.customer_address}</span>
                        </div>
                      </div>
                    </div>

                    {/* Issue Description */}
                    <div className="bg-white rounded-xl p-4 border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                        Issue Description & Diagnostics
                      </h4>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {ticket.issue_description}
                      </p>

                      {attachments.length > 0 && (
                        <div className="mt-3">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-1.5 flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> Attached Proof Files ({attachments.length}):
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {attachments.map((att) => (
                              <a
                                key={att.id}
                                href={att.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] text-slate-700 font-medium flex items-center gap-1"
                              >
                                {att.file_name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Rating & Feedback Banner if available */}
                    {ticket.rating && (
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-amber-950">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex text-amber-500">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${star <= ticket.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-bold">{ticket.rating} out of 5 Stars</span>
                        </div>
                        {ticket.feedback_comments && (
                          <p className="text-xs italic text-slate-700 mt-1">
                            "{ticket.feedback_comments}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* ASSIGNMENT SECTION */}
                    {['admin', 'staff'].includes(currentUser?.role) && (
                      <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-emerald-700" />
                          Technician Assignment
                        </h4>

                        <form onSubmit={handleAssign} className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select Technician *</label>
                              <select
                                value={selectedTechId}
                                onChange={(e) => setSelectedTechId(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                              >
                                <option value="">-- Choose Field Specialist --</option>
                                {technicians.map((t) => (
                                  <option 
                                    key={t.id} 
                                    value={t.id}
                                    className={!t.is_available ? 'text-slate-400 bg-slate-100' : 'text-slate-900'}
                                  >
                                    {t.is_available ? '🟢' : '🔴'} {t.name} ({t.area_zone}) — {t.is_available ? `${t.active_tickets_count || 0} Active` : 'OFF-DUTY (On Leave)'}
                                  </option>
                                ))}
                              </select>

                              {/* Warning Banner if selected technician is Off-Duty */}
                              {(() => {
                                const pickedTech = technicians.find(t => String(t.id) === String(selectedTechId));
                                if (pickedTech && !pickedTech.is_available) {
                                  return (
                                    <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 animate-in fade-in duration-150 shadow-2xs">
                                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-bold text-amber-800">⚠️ Technician is Currently Off-Duty</p>
                                        <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                                          <strong>{pickedTech.name}</strong> is marked Off-Duty (on leave or unavailable). Assigning this ticket may lead to SLA breach or delayed customer inspection.
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Expected Visit Date</label>
                              <input
                                type="date"
                                value={expectedDate}
                                onChange={(e) => setExpectedDate(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <p className="text-[11px] text-slate-500">
                              Auto-notifies technician & customer with expected visit time.
                            </p>
                            <button
                              type="submit"
                              disabled={assigning || !selectedTechId}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              {assigning ? 'Assigning...' : 'Assign & Send Alerts'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* FOLLOW-UP NOTE / VISIT LOG SECTION */}
                    <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-700" />
                        Log Site Visit / Follow-up Note
                      </h4>

                      <form onSubmit={handleAddNote} className="space-y-3">
                        <textarea
                          rows={2}
                          required
                          placeholder="e.g., Reached site, inspected DC array. Awaiting replacement surge protector..."
                          value={followUpNote}
                          onChange={(e) => setFollowUpNote(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">Update Status:</span>
                            <select
                              value={followUpStatus}
                              onChange={(e) => setFollowUpStatus(e.target.value)}
                              className="text-xs px-2 py-1 bg-white border border-slate-300 rounded font-medium"
                            >
                              {STATUS_ORDER.concat(['On Hold']).map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={notifyCustomerToggle}
                              onChange={(e) => setNotifyCustomerToggle(e.target.checked)}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-[11px] font-semibold text-slate-700">
                              Notify Customer (WhatsApp + Email)
                            </span>
                          </label>

                          <button
                            type="submit"
                            disabled={submittingNote || !followUpNote.trim()}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            Add Note
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* RESOLUTION SECTION (Technician / Staff) */}
                    {ticket.status !== 'Closed' && (
                      <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200 space-y-3">
                        <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-700" />
                          Mark as Resolved (Technician Resolution)
                        </h4>

                        <form onSubmit={handleResolve} className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Resolution Summary & Action Taken *
                            </label>
                            <textarea
                              rows={2}
                              required
                              placeholder="e.g., Replaced MC4 connector and DC breaker. Tested inverter power generation at 4.5 kW."
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Spare Parts Used (Optional)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g., 2x MC4 Connectors, 1x 32A MCB"
                                value={spareParts}
                                onChange={(e) => setSpareParts(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Closing Proof Photo (Optional)
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setResolutionPhoto(e.target.files?.[0] || null)}
                                className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 text-slate-600"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={resolving || !resolutionNotes.trim()}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-md shadow-emerald-700/20 transition-all disabled:opacity-50"
                          >
                            {resolving ? 'Submitting Resolution...' : 'Mark Complaint as Resolved'}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* CLOSURE REVIEW SECTION (Admin / Staff) */}
                    {['admin', 'staff'].includes(currentUser?.role) && ticket.status === 'Resolved' && (
                      <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-200 space-y-3">
                        <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-700" />
                          Final Verification & Ticket Closure
                        </h4>
                        <p className="text-xs text-blue-800">
                          Closing this ticket will send a confirmation notification to the customer along with a 1-5 star service rating link.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Optional closure review remarks..."
                            value={closureRemarks}
                            onChange={(e) => setClosureRemarks(e.target.value)}
                            className="flex-1 text-xs px-3 py-2 bg-white border border-blue-300 rounded-lg"
                          />
                          <button
                            onClick={handleCloseTicket}
                            disabled={closing}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {closing ? 'Closing...' : 'Close Ticket & Request Feedback'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* REOPEN SECTION (If Closed or Resolved) */}
                    {['Closed', 'Resolved'].includes(ticket.status) && (
                      <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-200 space-y-2">
                        <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-rose-700" />
                          Reopen Complaint Flow
                        </h4>
                        <p className="text-xs text-rose-800">
                          If customer reports recurrence of the issue, reactivate this ticket preserving all previous history.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Reason for reopening..."
                            value={reopenReason}
                            onChange={(e) => setReopenReason(e.target.value)}
                            className="flex-1 text-xs px-3 py-2 bg-white border border-rose-300 rounded-lg"
                          />
                          <button
                            onClick={handleReopen}
                            disabled={reopening}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {reopening ? 'Reopening...' : 'Reopen Ticket'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. TIMELINE TAB */}
                {activeTab === 'timeline' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Complete Audit Trail & Visit History
                    </h4>

                    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {timeline.map((item, idx) => (
                        <div key={item.id || idx} className="relative">
                          <div className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                            item.action === 'Registered' ? 'bg-amber-500' :
                            item.action === 'Assigned' ? 'bg-blue-500' :
                            item.action === 'Resolved' ? 'bg-emerald-500' :
                            item.action === 'Closed' ? 'bg-slate-700' :
                            item.action === 'Reopened' ? 'bg-rose-500' :
                            'bg-emerald-400'
                          }`} />

                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-slate-900">{item.action}</span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(item.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-700 leading-relaxed">{item.notes}</p>
                            <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
                              <span>By: <strong>{item.performed_by_name}</strong> ({item.performed_by_role})</span>
                              {item.notify_customer === 1 && (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Customer Alerted
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. NOTIFICATIONS TAB */}
                {activeTab === 'notifications' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Dispatched WhatsApp & Email Audit Logs
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Total {notifications.length} alerts logged
                      </span>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">No alerts logged for this ticket yet.</p>
                    ) : (
                      notifications.map((notif) => (
                        <div key={notif.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                notif.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {notif.channel}
                              </span>
                              <span className="font-mono text-slate-700 text-[11px]">{notif.recipient}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">
                                {new Date(notif.created_at).toLocaleTimeString()}
                              </span>
                              <button
                                onClick={() => handleResendNotif(notif.id)}
                                title="Resend this notification"
                                className="px-2 py-0.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded text-[11px] flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resend
                              </button>
                            </div>
                          </div>

                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-sans text-slate-800 whitespace-pre-wrap">
                            {notif.rendered_content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mobile Bottom Quick Close Bar */}
          <div className="p-3 bg-white border-t border-slate-200 sm:hidden shrink-0 flex items-center justify-between gap-2 shadow-lg">
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-900 active:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <X className="w-4 h-4 text-rose-400" />
              <span>Close Ticket Window</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
