import React, { useState } from 'react';
import { api } from '../../api/client';
import { 
  Search, Sun, Droplets, Wind, CheckCircle2, Clock, 
  Wrench, Phone, Star, RotateCcw, AlertTriangle, Send 
} from 'lucide-react';

const STEPS = [
  { key: 'Registered', label: 'Registered' },
  { key: 'Assigned', label: 'Technician Assigned' },
  { key: 'In Progress', label: 'In Progress / Visit' },
  { key: 'Resolved', label: 'Resolved' },
  { key: 'Closed', label: 'Closed' }
];

export const CustomerPublicPortal = ({ onOpenNewComplaint }) => {
  const [ticketQuery, setTicketQuery] = useState('');
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Feedback state
  const [starRating, setStarRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Reopen state
  const [showReopenInput, setShowReopenInput] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!ticketQuery.trim()) return;

    try {
      setLoading(true);
      setSearched(true);
      const data = await api.trackTicket(ticketQuery.trim());
      setTrackingData(data);
      if (data.complaint.rating) {
        setStarRating(data.complaint.rating);
        setFeedbackText(data.complaint.feedback_comments || '');
        setFeedbackSubmitted(true);
      } else {
        setFeedbackSubmitted(false);
      }
    } catch (err) {
      setTrackingData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!trackingData?.complaint) return;
    try {
      await api.submitFeedback(trackingData.complaint.id, {
        rating: starRating,
        feedback_comments: feedbackText
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      alert('Failed to submit feedback: ' + err.message);
    }
  };

  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!trackingData?.complaint) return;
    try {
      setReopening(true);
      await api.reopenComplaint(trackingData.complaint.id, reopenReason);
      setShowReopenInput(false);
      await handleSearch();
      alert('Ticket reopened. A service supervisor will contact you.');
    } catch (err) {
      alert('Failed to reopen ticket: ' + err.message);
    } finally {
      setReopening(false);
    }
  };

  const getStepIndex = (status) => {
    if (status === 'Closed') return 4;
    if (status === 'Resolved') return 3;
    if (status === 'In Progress' || status === 'On Hold') return 2;
    if (status === 'Assigned') return 1;
    return 0;
  };

  const currentStepIndex = trackingData ? getStepIndex(trackingData.complaint.status) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Customer Header Banner */}
      <div className="text-center py-6 px-4 bg-gradient-to-b from-emerald-800 to-teal-900 text-white rounded-3xl shadow-lg">
        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Sun className="w-7 h-7 text-amber-300" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black">Customer Service & Ticket Tracker</h2>
        <p className="text-xs sm:text-sm text-emerald-100 max-w-md mx-auto mt-1">
          Track your solar repair request, view assigned technician contact, or raise a new service complaint.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mt-6 max-w-md mx-auto relative flex items-center">
          <input
            type="text"
            required
            placeholder="Enter Ticket ID (e.g. EGS-2026-000101) or Phone..."
            value={ticketQuery}
            onChange={(e) => setTicketQuery(e.target.value)}
            className="w-full text-xs sm:text-sm pl-4 pr-24 py-3 rounded-2xl bg-white text-slate-900 shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-400 font-medium placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            {loading ? 'Searching...' : 'Track'}
          </button>
        </form>

        {/* Demo Ticket ID chips */}
        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-emerald-200">
          <span>Try sample:</span>
          <button 
            type="button" 
            onClick={() => { setTicketQuery('EGS-2026-000101'); }} 
            className="underline hover:text-white font-mono"
          >
            EGS-2026-000101
          </button>
          <span>•</span>
          <button 
            type="button" 
            onClick={() => { setTicketQuery('EGS-2026-000105'); }} 
            className="underline hover:text-white font-mono"
          >
            EGS-2026-000105
          </button>
        </div>
      </div>

      {/* Tracking Result View */}
      {trackingData?.complaint ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in">
          {/* Header info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[11px] uppercase font-bold text-slate-400">Service Ticket</span>
              <h3 className="text-xl font-black text-slate-900">{trackingData.complaint.ticket_id}</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {trackingData.complaint.product_type} — <strong>{trackingData.complaint.issue_category}</strong>
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                trackingData.complaint.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                trackingData.complaint.status === 'Closed' ? 'bg-slate-200 text-slate-800' :
                trackingData.complaint.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                trackingData.complaint.status === 'Assigned' ? 'bg-amber-100 text-amber-800' :
                trackingData.complaint.status === 'Reopened' ? 'bg-rose-100 text-rose-800' :
                'bg-yellow-100 text-yellow-900'
              }`}>
                {trackingData.complaint.status}
              </span>
              <span className="text-[11px] text-slate-400 block mt-1">
                Registered: {new Date(trackingData.complaint.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="py-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Live Service Progress</h4>
            <div className="relative">
              <div className="absolute top-4 left-4 right-4 h-1 bg-slate-200 -z-0">
                <div 
                  className="h-full bg-emerald-600 transition-all duration-500" 
                  style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-5 relative z-10 text-center">
                {STEPS.map((s, idx) => {
                  const isDone = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <div key={s.key} className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                        isCurrent ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 scale-110' :
                        isDone ? 'bg-emerald-600 text-white' :
                        'bg-white border-2 border-slate-300 text-slate-400'
                      }`}>
                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </div>
                      <span className={`text-[10px] mt-2 font-medium leading-tight hidden sm:block ${
                        isCurrent ? 'text-emerald-900 font-bold' : isDone ? 'text-slate-700' : 'text-slate-400'
                      }`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Assigned Technician Contact Card */}
          {trackingData.complaint.technician_name ? (
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white text-emerald-700 rounded-xl shadow-2xs">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800">Assigned Technician</span>
                  <h4 className="font-bold text-sm text-slate-900">{trackingData.complaint.technician_name}</h4>
                  <p className="text-[11px] text-slate-600">
                    Expected Visit: <strong>{trackingData.complaint.expected_visit_date || 'Within 24-48 Hours'}</strong>
                  </p>
                </div>
              </div>

              {trackingData.complaint.technician_phone && (
                <a
                  href={`tel:${trackingData.complaint.technician_phone}`}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Call
                </a>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>A certified technician will be assigned to your ticket shortly. You will receive an SMS/WhatsApp update.</span>
            </div>
          )}

          {/* Feedback Section (When Resolved or Closed) */}
          {['Resolved', 'Closed'].includes(trackingData.complaint.status) && (
            <div className="bg-amber-50/70 rounded-2xl p-5 border border-amber-200 space-y-3">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                Rate Your Service Experience
              </h4>

              {feedbackSubmitted ? (
                <div className="bg-white p-3 rounded-xl border border-amber-200 text-center text-xs text-emerald-800 font-bold">
                  🎉 Thank you! Your {starRating}-Star rating and review have been received.
                </div>
              ) : (
                <form onSubmit={handleFeedbackSubmit} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Your Rating:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setStarRating(star)}
                          className="p-1 hover:scale-110 transition-transform"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= starRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Share feedback on technician punctuality, work quality, or overall service..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="w-full text-xs p-3 bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />

                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Submit 5-Star Feedback
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Reopen Action Button if Closed or Resolved */}
          {['Resolved', 'Closed'].includes(trackingData.complaint.status) && (
            <div className="pt-2 border-t border-slate-100">
              {!showReopenInput ? (
                <button
                  onClick={() => setShowReopenInput(true)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Is the issue recurring? Click here to Reopen this Ticket
                </button>
              ) : (
                <form onSubmit={handleReopenSubmit} className="bg-rose-50 p-4 rounded-2xl border border-rose-200 space-y-2 text-xs">
                  <span className="font-bold text-rose-900 block">Explain why ticket should be reopened:</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Inverter tripped again this afternoon..."
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    className="w-full p-2 bg-white border border-rose-300 rounded-lg text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={reopening}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
                    >
                      {reopening ? 'Reopening...' : 'Confirm Reopen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReopenInput(false)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      ) : searched && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h4 className="font-bold text-slate-800">No complaint found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            We couldn't find a record matching "{ticketQuery}". Please verify your ticket ID or register a new service request below.
          </p>
          <button
            onClick={onOpenNewComplaint}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all"
          >
            Raise a New Complaint
          </button>
        </div>
      )}
    </div>
  );
};
