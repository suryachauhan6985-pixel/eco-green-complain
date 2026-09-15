import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useDialog } from '../../context/DialogContext';
import { 
  MessageSquare, CheckCircle2, AlertCircle, RefreshCw, Smartphone, 
  Send, LogOut, ShieldCheck, Zap, X, Info
} from 'lucide-react';

export const WhatsAppGatewayModal = ({ isOpen, onClose, onStatusChange }) => {
  const { confirm, showToast } = useDialog();
  const [gatewayStatus, setGatewayStatus] = useState({
    status: 'connecting',
    isConnected: false,
    connectedPhone: null,
    hasQr: false,
    qrCodeDataUrl: null
  });
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('☀️ *Eco Green Solar CMS*: Test alert sent directly from backend WhatsApp Gateway!');
  const [testSending, setTestSending] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchStatus = async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setGatewayStatus(data);
      if (onStatusChange) onStatusChange(data);
    } catch (err) {
      console.warn('Failed to fetch WhatsApp gateway status:', err.message);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchStatus();

    // Poll every 3 seconds while modal is open
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Unlink WhatsApp Account?',
      message: 'Are you sure you want to disconnect this WhatsApp session? You will need to scan the QR code again with your phone.',
      type: 'danger',
      confirmText: 'Unlink Session'
    });
    if (!ok) return;

    try {
      setLoading(true);
      await api.logoutWhatsApp();
      await fetchStatus();
      showToast('WhatsApp session unlinked successfully', 'info');
    } catch (err) {
      showToast('Failed to disconnect: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      showToast('Please enter a 10-digit mobile number', 'warning');
      return;
    }

    try {
      setTestSending(true);
      setErrorMessage('');
      setTestSuccess(false);
      await api.sendDirectWhatsApp(testPhone, testMessage);
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to send test message');
    } finally {
      setTestSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center shadow-xs">
              <MessageSquare className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight">WhatsApp Gateway Manager</h3>
              <p className="text-xs text-emerald-200">Office Virtual WhatsApp Session (Zero window redirects)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          
          {/* Status 1: Connected */}
          {gatewayStatus.isConnected ? (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="font-bold text-emerald-900 text-sm">WhatsApp Gateway Active & Connected</h4>
                  </div>
                  <p className="text-xs text-emerald-700 mt-1 font-medium">
                    Office Number: <strong className="text-emerald-950 font-bold">+{gatewayStatus.connectedPhone || '91 7878444414'}</strong>
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">
                    All customer & technician alerts are now dispatched directly in the background with zero popups or window redirects!
                  </p>
                </div>
              </div>

              {/* Live Test Message Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Send Quick Test WhatsApp</h5>
                </div>

                <form onSubmit={handleSendTest} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Recipient Mobile Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210 or 6354687931"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Message Preview</label>
                    <textarea
                      rows={2}
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  {errorMessage && (
                    <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-xl flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </p>
                  )}

                  {testSuccess && (
                    <p className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 p-2 rounded-xl flex items-center gap-1.5 animate-in fade-in duration-150">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Message successfully delivered to {testPhone} in the background!</span>
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={testSending || !testPhone}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {testSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{testSending ? 'Delivering...' : 'Send Test WhatsApp Message'}</span>
                  </button>
                </form>
              </div>

              {/* Unlink / Logout Button */}
              <div className="pt-2 flex justify-between items-center border-t border-slate-100">
                <span className="text-[11px] text-slate-500">Need to switch mobile number?</span>
                <button
                  onClick={handleLogout}
                  disabled={loading}
                  className="px-3.5 py-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold border border-rose-200 transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Unlink Device</span>
                </button>
              </div>
            </div>
          ) : (
            /* Status 2: QR Code Scan Required */
            <div className="space-y-5 text-center">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  Scan QR Code to Link Official WhatsApp (+91 7878444414)
                </span>
                <h4 className="text-base font-black text-slate-900">Link Office WhatsApp to CMS</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
                  Scan this QR code once with WhatsApp on your office phone. The session will be saved in the backend.
                </p>
              </div>

              {/* QR Code Container */}
              <div className="flex justify-center my-2">
                <div className="p-4 bg-white border-2 border-emerald-500/40 rounded-3xl shadow-xl inline-block relative">
                  {gatewayStatus.qrCodeDataUrl ? (
                    <img 
                      src={gatewayStatus.qrCodeDataUrl} 
                      alt="WhatsApp Web QR Code" 
                      className="w-64 h-64 mx-auto rounded-xl"
                    />
                  ) : (
                    <div className="w-64 h-64 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl">
                      <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                      <span className="text-xs font-bold text-slate-600">Generating live QR code...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scan Steps Instructions */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2">
                <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>How to scan from phone:</span>
                </h5>
                <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside font-medium">
                  <li>Open <strong>WhatsApp</strong> on your mobile (<strong>+91 7878444414</strong>)</li>
                  <li>Tap <strong>Settings</strong> (or 3 dots on Android) ➔ <strong>Linked Devices</strong></li>
                  <li>Tap <strong>"Link a Device"</strong> and point your camera at the QR code above</li>
                </ol>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>End-to-End Encrypted • Credentials stored securely on backend</span>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Info className="w-4 h-4" />
            <span>Shared across all computers in your office</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Close Window
          </button>
        </div>

      </div>
    </div>
  );
};
