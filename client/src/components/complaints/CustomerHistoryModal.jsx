import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { X, Phone, History, Calendar, Wrench, ChevronRight } from 'lucide-react';

export const CustomerHistoryModal = ({ phone, isOpen, onClose, onSelectTicket }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && phone) {
      const fetchHistory = async () => {
        try {
          setLoading(true);
          const data = await api.getCustomerHistory(phone);
          setHistory(data.history || []);
        } catch (err) {
          console.error('Failed to load customer history:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    }
  }, [isOpen, phone]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">Customer Complaint History</h3>
              <p className="text-xs text-slate-400">Phone: {phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <p className="text-xs text-center text-slate-400 py-10">Loading customer history...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-center text-slate-500 py-10">No past complaints found for this phone number.</p>
          ) : (
            history.map((c) => (
              <div 
                key={c.id} 
                onClick={() => {
                  if (onSelectTicket) onSelectTicket(c.id);
                  onClose();
                }}
                className="bg-slate-50 hover:bg-emerald-50/50 p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-slate-900">{c.ticket_id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      c.status === 'Resolved' || c.status === 'Closed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800">{c.product_type} — {c.issue_category}</div>
                  <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">{c.issue_description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
