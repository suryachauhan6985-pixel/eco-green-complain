import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  AlertTriangle, AlertCircle, CheckCircle, Info, 
  IndianRupee, X, Trash2, ShieldCheck 
} from 'lucide-react';
import { GlobalLoadingOverlay } from '../components/common/GlobalLoadingOverlay';
import { subscribeToLoading } from '../api/client';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [promptInputValue, setPromptInputValue] = useState('');
  const [toasts, setToasts] = useState([]);
  const [loadingState, setLoadingState] = useState({ isVisible: false, message: 'Processing...' });

  const showLoading = useCallback((message = 'Processing...') => {
    setLoadingState({ isVisible: true, message });
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingState({ isVisible: false, message: 'Processing...' });
  }, []);

  // Listen to API client mutation loading events (e.g. Save, Reopen, Assign, Delete, Close, etc.)
  useEffect(() => {
    if (subscribeToLoading) {
      const unsubscribe = subscribeToLoading((isLoading, message) => {
        if (isLoading) {
          setLoadingState({ isVisible: true, message: message || 'Processing...' });
        } else {
          setLoadingState({ isVisible: false, message: 'Processing...' });
        }
      });
      return unsubscribe;
    }
  }, []);

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
        isPrompt: false,
        title,
        message,
        type,
        confirmText,
        cancelText,
        resolve
      });
    });
  }, []);

  // Trigger custom in-app prompt modal (Returns Promise<string|null>)
  const prompt = useCallback(({
    title = 'Input Required',
    message = '',
    placeholder = 'Type here...',
    defaultValue = '',
    type = 'warning',
    confirmText = 'Submit',
    cancelText = 'Cancel',
    required = true
  }) => {
    return new Promise((resolve) => {
      setPromptInputValue(defaultValue || '');
      setDialog({
        isOpen: true,
        isConfirm: true,
        isPrompt: true,
        title,
        message,
        placeholder,
        defaultValue,
        type,
        confirmText,
        cancelText,
        required,
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
        isPrompt: false,
        title,
        message,
        type,
        confirmText,
        cancelText: null,
        resolve
      });
    });
  }, []);

  // Toast notification with enhanced duration for errors and swipe/click dismiss
  const showToast = useCallback((message, type = 'success', customDuration = null) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Errors stay visible for 9 seconds so the user can read the complete details; success/info stay 4.5s
    const duration = customDuration || (type === 'error' ? 9000 : 4500);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const handleCloseDialog = (confirmed) => {
    if (dialog && dialog.resolve) {
      if (dialog.isPrompt) {
        dialog.resolve(confirmed ? promptInputValue.trim() : null);
      } else {
        dialog.resolve(confirmed);
      }
    }
    setDialog(null);
    setPromptInputValue('');
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert, showToast, showLoading, hideLoading }}>
      {children}

      {/* GLOBAL SCREEN LOADING OVERLAY (3 GREEN BOUNCING DOTS) */}
      <GlobalLoadingOverlay 
        isVisible={loadingState.isVisible} 
        message={loadingState.message} 
      />

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
            <div className="p-5 text-xs text-slate-700 space-y-3">
              {dialog.message && (
                <div className="whitespace-pre-line leading-relaxed">
                  {dialog.message}
                </div>
              )}

              {dialog.isPrompt && (
                <div className="space-y-1.5 pt-1">
                  <textarea
                    autoFocus
                    rows={3}
                    value={promptInputValue}
                    onChange={(e) => setPromptInputValue(e.target.value)}
                    placeholder={dialog.placeholder || 'Enter details here...'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (!dialog.required || promptInputValue.trim()) {
                          handleCloseDialog(true);
                        }
                      }
                    }}
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 text-slate-800 font-medium placeholder:text-slate-400 transition-all resize-none shadow-2xs bg-slate-50/50"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{dialog.required ? 'Field is required' : 'Optional'}</span>
                    <span>Press Ctrl+Enter to submit</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              {dialog.isConfirm && (
                <button
                  type="button"
                  onClick={() => handleCloseDialog(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  {dialog.cancelText || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                disabled={dialog.isPrompt && dialog.required && !promptInputValue.trim()}
                onClick={() => handleCloseDialog(true)}
                autoFocus={!dialog.isPrompt}
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50 cursor-pointer ${
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

      {/* TOASTS CONTAINER WITH TAP & SWIPE DISMISS */}
      <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            onTouchStart={(e) => { t._touchX = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (t._touchX !== undefined && Math.abs(e.changedTouches[0].clientX - t._touchX) > 40) {
                removeToast(t.id);
              }
            }}
            className={`pointer-events-auto p-3.5 rounded-2xl shadow-2xl flex items-start gap-2.5 text-xs font-medium border cursor-pointer select-none transition-all active:scale-98 animate-in slide-in-from-bottom-3 duration-200 ${
              t.type === 'error' ? 'bg-rose-900/95 text-white border-rose-700 ring-2 ring-rose-500/30' :
              t.type === 'warning' ? 'bg-amber-900/95 text-amber-50 border-amber-700 ring-2 ring-amber-500/30' :
              t.type === 'info' ? 'bg-slate-900/95 text-white border-slate-700' :
              'bg-emerald-900/95 text-white border-emerald-700'
            }`}
            title="Click or swipe to close immediately"
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-300" />
              ) : t.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-300" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-300" />
              )}
            </div>
            <div className="flex-1 leading-snug">{t.message}</div>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
              className="text-white/70 hover:text-white p-1 hover:bg-white/20 rounded-lg transition-colors shrink-0"
              title="Close notification"
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
