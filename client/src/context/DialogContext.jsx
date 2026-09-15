import React, { createContext, useContext, useState, useCallback } from 'react';
import { 
  AlertTriangle, AlertCircle, CheckCircle, Info, 
  IndianRupee, X, Trash2, ShieldCheck 
} from 'lucide-react';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Trigger custom confirmation modal (Returns Promise<boolean>)
  const confirm = useCallback(({ 
    title = 'Please Confirm', 
    message = 'Are you sure you want to proceed?', 
    type = 'warning', // 'warning' | 'danger' | 'payment' | 'info' | 'success'
    confirmText = 'Confirm',
    cancelText = 'Cancel'
  }) => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        isConfirm: true,
        title,
        message,
        type,
        confirmText,
        cancelText,
        resolve
      });
    });
  }, []);

  // Trigger custom alert modal (Returns Promise<void>)
  const alert = useCallback(({ 
    title = 'Notice', 
    message = '', 
    type = 'info', 
    confirmText = 'Got It' 
  }) => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        isConfirm: false,
        title,
        message,
        type,
        confirmText,
        cancelText: null,
        resolve
      });
    });
  }, []);

  // Toast notification
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const handleCloseDialog = (confirmed) => {
    if (dialog && dialog.resolve) {
      dialog.resolve(confirmed);
    }
    setDialog(null);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <DialogContext.Provider value={{ confirm, alert, showToast }}>
      {children}

      {/* CUSTOM IN-APP DIALOG MODAL */}
      {dialog && dialog.isOpen && (
        <div 
          className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => handleCloseDialog(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with appropriate icon & color */}
            <div className={`px-5 py-4 flex items-center justify-between border-b ${
              dialog.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-950' :
              dialog.type === 'payment' ? 'bg-gradient-to-r from-emerald-800 to-teal-800 text-white' :
              dialog.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-950' :
              dialog.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-950' :
              'bg-slate-900 text-white'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl shrink-0 ${
                  dialog.type === 'danger' ? 'bg-rose-500/10 text-rose-600' :
                  dialog.type === 'payment' ? 'bg-white/10 text-amber-300' :
                  dialog.type === 'warning' ? 'bg-amber-500/10 text-amber-600' :
                  dialog.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' :
                  'bg-white/10 text-emerald-400'
                }`}>
                  {dialog.type === 'danger' && <Trash2 className="w-5 h-5" />}
                  {dialog.type === 'payment' && <IndianRupee className="w-5 h-5" />}
                  {dialog.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                  {dialog.type === 'success' && <CheckCircle className="w-5 h-5" />}
                  {!['danger', 'payment', 'warning', 'success'].includes(dialog.type) && <Info className="w-5 h-5" />}
                </div>
                <h3 className="font-bold text-sm tracking-tight">{dialog.title}</h3>
              </div>
              <button 
                onClick={() => handleCloseDialog(false)}
                className={`p-1 rounded-lg transition-colors ${
                  dialog.type === 'payment' || dialog.type === 'info' 
                    ? 'text-slate-300 hover:text-white hover:bg-white/10' 
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
              {dialog.message}
            </div>

            {/* Footer Buttons */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              {dialog.isConfirm && (
                <button
                  type="button"
                  onClick={() => handleCloseDialog(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  {dialog.cancelText || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleCloseDialog(true)}
                autoFocus
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md ${
                  dialog.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' :
                  dialog.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20' :
                  'bg-emerald-700 hover:bg-emerald-800 shadow-emerald-700/20'
                }`}
              >
                {dialog.confirmText || (dialog.isConfirm ? 'Confirm' : 'Got It')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOASTS CONTAINER */}
      <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-2xl shadow-xl flex items-start gap-2.5 text-xs font-medium border animate-in slide-in-from-bottom-3 duration-200 ${
              t.type === 'error' ? 'bg-rose-900 text-white border-rose-700' :
              t.type === 'info' ? 'bg-slate-900 text-white border-slate-700' :
              'bg-emerald-900 text-white border-emerald-700'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-300" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-300" />
              )}
            </div>
            <div className="flex-1 leading-snug">{t.message}</div>
            <button 
              onClick={() => removeToast(t.id)}
              className="text-white/60 hover:text-white p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
}
