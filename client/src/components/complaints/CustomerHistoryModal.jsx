import { formatIndianDateTime } from '../common/TicketAgeBadge';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { X, History, ChevronRight } from 'lucide-react';
import { ESCAPE_PRIORITY } from '../../utils/escapeManager';
import { ModalWrapper } from '../common/ModalWrapper';

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

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      priority={ESCAPE_PRIORITY.DRAWER}
      ariaLabel="Customer Complaint History"
    >
      <div 
        className="apple-glass-modal rounded-3xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal-jelly-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 apple-glass-header text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">Customer Complaint History</h3>
              <p className="text-xs text-slate-400">Phone: {phone}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto divide-y divide-slate-100 flex-1">
          {loading ? (
            <div className="text-center py-8 text-sm text-slate-500">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">No past complaints found for this customer.</div>
          ) : (
            history.map((c) => (
              <div 
                key={c.id} 
                className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between hover:bg-slate-50 p-2 rounded-xl transition-colors cursor-pointer"
                onClick={() => {
                  onSelectTicket(c.id);
                  onClose();
                }}
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
                      {formatIndianDateTime(c.created_at)}
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
    </ModalWrapper>
  );
};
