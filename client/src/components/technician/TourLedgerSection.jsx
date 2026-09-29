import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  IndianRupee, Plus, FileText, Download, Printer, Copy, Check, 
  Trash2, Eye, Upload, Filter, Calendar, CheckCircle2, Clock, 
  AlertCircle, ChevronRight, X, ArrowUpRight, ArrowDownLeft, ShieldCheck,
  Building, User, Tag, Sparkles, Image as ImageIcon, ExternalLink, Loader2
} from 'lucide-react';
import { formatIndianDateOnly } from '../common/TicketAgeBadge';

const EXPENSE_CATEGORIES = [
  'Bus / Train Fare',
  'Auto / Taxi / Cab',
  'Petrol / Diesel (Fuel)',
  'Food & Meals',
  'Spare Parts & Consumables',
  'Hotel / Night Stay',
  'Toll & Parking',
  'Customer Site Material',
  'Miscellaneous'
];

export const TourLedgerSection = ({ scopedTechProfile, allTechnicians = [], complaints = [] }) => {
  const { currentUser } = useAuth();
  const { showToast, confirm } = useDialog();

  const isAdminOrStaff = ['admin', 'staff'].includes(currentUser?.role);

  // Selected technician filter: default to scoped tech if technician, or first tech if admin
  const [selectedTechId, setSelectedTechId] = useState(() => {
    if (!isAdminOrStaff && scopedTechProfile?.id) return String(scopedTechProfile.id);
    return allTechnicians.length > 0 ? String(allTechnicians[0].id) : '';
  });

  useEffect(() => {
    if (!isAdminOrStaff && scopedTechProfile?.id) {
      setSelectedTechId(String(scopedTechProfile.id));
    } else if (!selectedTechId && allTechnicians.length > 0) {
      setSelectedTechId(String(allTechnicians[0].id));
    }
  }, [scopedTechProfile, allTechnicians, isAdminOrStaff]);

  const [ledgerData, setLedgerData] = useState({
    advances: [],
    expenses: [],
    settlements: [],
    summary: {
      total_advance: 0,
      approved_expenses: 0,
      total_returned: 0,
      total_reimbursed: 0,
      net_balance: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('expenses'); // 'expenses' | 'advances' | 'settlements'

  // Modals state
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    amount: '',
    purpose: 'Tour Advance for Field Tasks',
    payment_mode: 'Cash',
    reference_no: ''
  });
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: 'Bus / Train Fare',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    ticket_id: '',
    description: '',
    receipt_file: null,
    receipt_preview: null
  });
  const [submittingExpense, setSubmittingExpense] = useState(false);

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({
    amount: '',
    settlement_type: 'return_to_company',
    payment_mode: 'Cash',
    reference_no: '',
    notes: 'Tour remaining cash deposited back to company'
  });
  const [submittingSettle, setSubmittingSettle] = useState(false);

  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [receiptLightbox, setReceiptLightbox] = useState(null);
  const [copiedWord, setCopiedWord] = useState(false);

  // Active technician details
  const currentTech = useMemo(() => {
    return allTechnicians.find(t => String(t.id) === String(selectedTechId)) || scopedTechProfile || {
      id: selectedTechId,
      name: 'Technician',
      phone: '',
      area_zone: 'General Zone'
    };
  }, [allTechnicians, selectedTechId, scopedTechProfile]);

  const fetchLedger = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = selectedTechId ? { technician_id: selectedTechId } : {};
      const res = await api.getTourLedger(params);
      if (res && res.summary) {
        setLedgerData(res);
      }
    } catch (err) {
      if (!silent) console.error('Failed to load tour ledger:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedTechId]);

  // Handle Allocate Tour Advance
  const handleAllocateAdvance = async (e) => {
    e.preventDefault();
    if (!selectedTechId) return showToast('Please select a technician first', 'error');
    const amt = parseFloat(advanceForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid advance amount', 'error');

    try {
      setSubmittingAdvance(true);
      await api.allocateTourAdvance({
        technician_id: selectedTechId,
        technician_name: currentTech.name,
        amount: amt,
        purpose: advanceForm.purpose,
        payment_mode: advanceForm.payment_mode,
        reference_no: advanceForm.reference_no,
        allocated_by_name: currentUser?.name || 'Admin Supervisor'
      });
      showToast(`₹${amt} tour advance allocated to ${currentTech.name}!`, 'success');
      setIsAdvanceModalOpen(false);
      setAdvanceForm({
        amount: '',
        purpose: 'Tour Advance for Field Tasks',
        payment_mode: 'Cash',
        reference_no: ''
      });
      await fetchLedger(true);
    } catch (err) {
      showToast('Failed to allocate advance: ' + err.message, 'error');
    } finally {
      setSubmittingAdvance(false);
    }
  };

  // Handle Add Tour Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!selectedTechId) return showToast('Please select a technician first', 'error');
    const amt = parseFloat(expenseForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid expense amount', 'error');

    try {
      setSubmittingExpense(true);

      let receiptUrl = expenseForm.receipt_preview || null;
      let receiptName = expenseForm.receipt_file?.name || null;

      // Find linked complaint if selected
      let compId = null;
      if (expenseForm.ticket_id) {
        const found = complaints.find(c => c.ticket_id === expenseForm.ticket_id || String(c.id) === String(expenseForm.ticket_id));
        if (found) compId = found.id;
      }

      await api.addTourExpense({
        technician_id: selectedTechId,
        technician_name: currentTech.name,
        complaint_id: compId,
        ticket_id: expenseForm.ticket_id || null,
        expense_date: expenseForm.expense_date,
        category: expenseForm.category,
        amount: amt,
        title: expenseForm.title || `${expenseForm.category} Expense`,
        description: expenseForm.description,
        receipt_url: receiptUrl,
        receipt_name: receiptName
      });

      showToast(`Expense of ₹${amt} logged under voucher successfully!`, 'success');
      setIsExpenseModalOpen(false);
      setExpenseForm({
        title: '',
        category: 'Bus / Train Fare',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        ticket_id: '',
        description: '',
        receipt_file: null,
        receipt_preview: null
      });
      await fetchLedger(true);
    } catch (err) {
      showToast('Failed to log expense: ' + err.message, 'error');
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Handle Settle / Return Balance
  const handleSettleBalance = async (e) => {
    e.preventDefault();
    if (!selectedTechId) return showToast('Please select a technician first', 'error');
    const amt = parseFloat(settleForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid settlement amount', 'error');

    try {
      setSubmittingSettle(true);
      await api.settleTourBalance({
        technician_id: selectedTechId,
        amount: amt,
        settlement_type: settleForm.settlement_type,
        payment_mode: settleForm.payment_mode,
        reference_no: settleForm.reference_no,
        notes: settleForm.notes,
        received_by_name: currentUser?.name || 'Admin Supervisor'
      });

      showToast(`₹${amt} cash return/settlement recorded successfully!`, 'success');
      setIsSettleModalOpen(false);
      setSettleForm({
        amount: '',
        settlement_type: 'return_to_company',
        payment_mode: 'Cash',
        reference_no: '',
        notes: 'Tour remaining cash deposited back to company'
      });
      await fetchLedger(true);
    } catch (err) {
      showToast('Failed to record settlement: ' + err.message, 'error');
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Toggle Expense Status (Approved / Pending / Rejected)
  const handleUpdateStatus = async (expId, newStatus) => {
    try {
      await api.updateTourExpenseStatus(expId, newStatus);
      showToast(`Expense marked as ${newStatus}`, 'info');
      await fetchLedger(true);
    } catch (err) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (exp) => {
    const ok = await confirm({
      title: 'Delete Tour Expense?',
      message: `Are you sure you want to delete voucher ${exp.voucher_no || ''} (₹${exp.amount})?`,
      type: 'danger',
      confirmText: 'Delete Expense',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await api.deleteTourExpense(exp.id);
      showToast('Expense voucher removed', 'success');
      await fetchLedger(true);
    } catch (err) {
      showToast('Failed to delete expense: ' + err.message, 'error');
    }
  };

  // Receipt File Chooser
  const handleReceiptChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      return showToast('Receipt file size exceeds 15MB limit', 'error');
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setExpenseForm(prev => ({
        ...prev,
        receipt_file: file,
        receipt_preview: event.target.result
      }));
    };
    reader.readAsDataURL(file);
  };

  // Format currency
  const formatCur = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

  // Export to Microsoft Word (.doc)
  const handleExportWord = () => {
    const techName = currentTech.name || 'Technician';
    const tourAdvances = ledgerData.advances || [];
    const tourExpenses = ledgerData.expenses || [];
    const summary = ledgerData.summary || {};

    const rowsHtml = tourExpenses.map((exp, idx) => `
      <tr>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${exp.expense_date ? formatIndianDateOnly(exp.expense_date) : '-'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold;">${exp.voucher_no || '-'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${exp.category || 'General'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${exp.ticket_id || '-'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${exp.title || ''}${exp.description ? ' - ' + exp.description : ''}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${exp.receipt_url ? 'Yes (Bill Attached)' : 'Self-Voucher'}</td>
        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">₹${Number(exp.amount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const wordContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Eco Green Solar - Tour Expense Voucher</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1e293b; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #047857; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 16pt; font-weight: bold; color: #065f46; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 11pt; color: #475569; margin-top: 4px; }
          .info-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
          .info-table td { padding: 5px 8px; font-size: 10.5pt; }
          .summary-box { background: #f0fdf4; border: 1px solid #86efac; padding: 12px; margin-bottom: 20px; }
          .table-main { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .table-main th { background: #065f46; color: white; padding: 8px 10px; border: 1px solid #065f46; font-size: 10pt; text-align: left; }
          .table-main td { font-size: 9.5pt; }
          .signatures { margin-top: 50px; width: 100%; }
          .sign-col { width: 33%; text-align: center; font-size: 10pt; padding-top: 40px; border-top: 1px solid #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">ECO GREEN SOLAR SOLUTIONS</h1>
          <p class="subtitle">FIELD TECHNICIAN TOUR EXPENSE VOUCHER & LEDGER STATEMENT</p>
        </div>

        <table class="info-table">
          <tr>
            <td><strong>Technician Name:</strong> ${techName}</td>
            <td><strong>Mobile Number:</strong> ${currentTech.phone || 'N/A'}</td>
          </tr>
          <tr>
            <td><strong>Service Zone:</strong> ${currentTech.area_zone || 'General Zone'}</td>
            <td><strong>Statement Date:</strong> ${formatIndianDateOnly(new Date().toISOString())}</td>
          </tr>
        </table>

        <div class="summary-box">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="font-size: 11pt;"><strong>1. Total Tour Advance Received:</strong></td>
              <td style="font-size: 11pt; text-align: right; font-weight: bold; color: #0f172a;">₹${Number(summary.total_advance || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-size: 11pt;"><strong>2. Total Tour Expenses Incurred:</strong></td>
              <td style="font-size: 11pt; text-align: right; font-weight: bold; color: #b91c1c;">₹${Number(summary.approved_expenses || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-size: 11pt;"><strong>3. Surplus Cash Balance Deposited to Company:</strong></td>
              <td style="font-size: 11pt; text-align: right; font-weight: bold; color: #047857;">₹${Number(summary.total_returned || 0).toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px solid #86efac;">
              <td style="font-size: 12pt; padding-top: 8px;"><strong>4. Net Closing Balance:</strong></td>
              <td style="font-size: 12pt; text-align: right; font-weight: bold; padding-top: 8px; color: ${summary.net_balance >= 0 ? '#047857' : '#b91c1c'};">
                ₹${Number(summary.net_balance || 0).toFixed(2)} ${summary.net_balance >= 0 ? '(Safe / In Hand)' : '(Company Reimbursement Due)'}
              </td>
            </tr>
          </table>
        </div>

        <h3 style="color: #065f46; margin-bottom: 6px;">ITEMIZED EXPENSES & BILL VOUCHERS</h3>
        <table class="table-main">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 12%;">Date</th>
              <th style="width: 14%;">Voucher #</th>
              <th style="width: 15%;">Category</th>
              <th style="width: 12%;">Ticket ID</th>
              <th style="width: 24%;">Particulars / Description</th>
              <th style="width: 8%; text-align: center;">Bill</th>
              <th style="width: 10%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 15px;">No expenses recorded yet.</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #f8fafc; font-weight: bold;">
              <td colspan="7" style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Total Tour Claim:</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; color: #065f46;">₹${Number(summary.approved_expenses || 0).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <table style="width: 100%; margin-top: 60px;">
          <tr>
            <td class="sign-col">
              <strong>${techName}</strong><br>
              Field Specialist / Claimant Signature
            </td>
            <td style="width: 5%;"></td>
            <td class="sign-col">
              <strong>Accounts Verification</strong><br>
              Cash & Receipts Checked
            </td>
            <td style="width: 5%;"></td>
            <td class="sign-col">
              <strong>Director / Supervisor</strong><br>
              Authorized Signatory
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordContent], {
      type: 'application/msword;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tour_Expense_Voucher_${techName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Word document downloaded successfully! Opening in Microsoft Word will show complete formatted voucher.', 'success');
  };

  // Copy HTML Table for Word / Excel
  const handleCopyTable = () => {
    const tableEl = document.getElementById('tour-voucher-print-area');
    if (!tableEl) return;
    try {
      const range = document.createRange();
      range.selectNode(tableEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      window.getSelection().removeAllRanges();
      setCopiedWord(true);
      showToast('Voucher table copied! You can now paste directly into Microsoft Word or Excel.', 'success');
      setTimeout(() => setCopiedWord(false), 2500);
    } catch (err) {
      showToast('Could not copy table automatically: ' + err.message, 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const summary = ledgerData.summary || {};
  const advances = ledgerData.advances || [];
  const expenses = ledgerData.expenses || [];
  const settlements = ledgerData.settlements || [];

  return (
    <div className="space-y-4">
      {/* Top Header & Technician Switcher Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Tour Expense Ledger & Voucher System</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Live Accounting
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Allocate tour travel advances, attach expense bills & receipts, and settle surplus cash deposits.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Technician selector for Admin/Staff */}
            {isAdminOrStaff ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Specialist:</span>
                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {allTechnicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.area_zone || 'Field'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-700" />
                <span>Specialist: {currentTech.name}</span>
              </div>
            )}

            {/* Print & Word Export Button */}
            <button
              type="button"
              onClick={() => setIsVoucherModalOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Export Voucher (.doc)</span>
            </button>
          </div>
        </div>

        {/* 4 Financial Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-gradient-to-br from-blue-50/80 to-blue-100/50 p-3.5 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-blue-800">Total Tour Advance</span>
              <span className="p-1 bg-blue-200/60 rounded-md text-blue-800">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </span>
            </div>
            <strong className="text-xl font-black text-blue-950 font-mono block mt-1">
              {formatCur(summary.total_advance)}
            </strong>
            <span className="text-[10px] text-blue-700">Company allocated cash for tour</span>
          </div>

          <div className="bg-gradient-to-br from-rose-50/80 to-rose-100/50 p-3.5 rounded-xl border border-rose-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-rose-800">Expenses Incurred</span>
              <span className="p-1 bg-rose-200/60 rounded-md text-rose-800">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </div>
            <strong className="text-xl font-black text-rose-950 font-mono block mt-1">
              {formatCur(summary.approved_expenses)}
            </strong>
            <span className="text-[10px] text-rose-700">{expenses.length} Voucher item(s) logged</span>
          </div>

          <div className="bg-gradient-to-br from-emerald-50/80 to-emerald-100/50 p-3.5 rounded-xl border border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-emerald-800">Deposited to Company</span>
              <span className="p-1 bg-emerald-200/60 rounded-md text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </div>
            <strong className="text-xl font-black text-emerald-950 font-mono block mt-1">
              {formatCur(summary.total_returned)}
            </strong>
            <span className="text-[10px] text-emerald-700">Unused balance returned back</span>
          </div>

          <div className={`p-3.5 rounded-xl border ${
            (summary.net_balance || 0) > 0 
              ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-200' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-bold block ${
                (summary.net_balance || 0) > 0 ? 'text-amber-900 font-black' : 'text-slate-600'
              }`}>
                Remaining Balance In Hand
              </span>
              {(summary.net_balance || 0) > 0 && (
                <span className="text-[9px] bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded-full">
                  To Return
                </span>
              )}
            </div>
            <strong className={`text-xl font-black font-mono block mt-1 ${
              (summary.net_balance || 0) > 0 ? 'text-amber-950' : 'text-slate-800'
            }`}>
              {formatCur(summary.net_balance)}
            </strong>
            <span className="text-[10px] text-slate-500">
              {(summary.net_balance || 0) > 0 
                ? 'Advance balance remaining with technician' 
                : (summary.net_balance < 0 ? 'Reimbursement due to technician' : 'Ledger fully squared & settled')}
            </span>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-3 border-t border-slate-100">
          {isAdminOrStaff && (
            <button
              type="button"
              onClick={() => setIsAdvanceModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Allocate Tour Advance</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Tour Expense / Voucher</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSettleForm(prev => ({ ...prev, amount: Math.max(0, summary.net_balance || 0) }));
              setIsSettleModalOpen(true);
            }}
            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <IndianRupee className="w-3.5 h-3.5 text-amber-700" />
            <span>Deposit / Return Balance to Company</span>
          </button>
        </div>
      </div>

      {/* Main Ledger Sub-Tabs & Tables */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('expenses')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'expenses'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Expense Vouchers & Bills ({expenses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('advances')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'advances'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Tour Advances History ({advances.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('settlements')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'settlements'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Deposits & Settlements ({settlements.length})</span>
          </button>
        </div>

        {/* ================= 1. EXPENSES TAB ================= */}
        {subTab === 'expenses' && (
          <div className="p-4 sm:p-5">
            {expenses.length === 0 ? (
              <div className="text-center py-12 px-4">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-700">No Tour Expenses Logged Yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Log travel, fuel, food, auto, or spare part expenses along with photos of receipts to claim against the tour advance.
                </p>
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Tour Expense Voucher</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Voucher #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Ticket / Particulars</th>
                      <th className="py-2.5 px-3">Receipt / Bill</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                          {exp.voucher_no || 'VCH-NEW'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {exp.expense_date ? formatIndianDateOnly(exp.expense_date) : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-xs">
                          {exp.ticket_id && (
                            <span className="font-mono text-[10px] font-bold text-blue-700 block">
                              Ticket: {exp.ticket_id}
                            </span>
                          )}
                          <strong className="text-slate-800 font-semibold block truncate" title={exp.title}>
                            {exp.title}
                          </strong>
                          {exp.description && (
                            <span className="text-[11px] text-slate-500 block truncate" title={exp.description}>
                              {exp.description}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {exp.receipt_url ? (
                            <button
                              type="button"
                              onClick={() => setReceiptLightbox({ url: exp.receipt_url, name: exp.receipt_name || exp.title })}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-200 transition-colors cursor-pointer"
                            >
                              <ImageIcon className="w-3 h-3 text-emerald-600" />
                              <span>View Bill</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Self-Voucher</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 text-sm">
                          {formatCur(exp.amount)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            exp.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            exp.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            'bg-amber-100 text-amber-900 border border-amber-200'
                          }`}>
                            {exp.status || 'Pending'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isAdminOrStaff && exp.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(exp.id, 'approved')}
                                className="p-1 hover:bg-emerald-100 text-emerald-700 rounded transition-colors"
                                title="Approve Voucher"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp)}
                              className="p-1 hover:bg-rose-100 text-rose-600 rounded transition-colors"
                              title="Delete Voucher"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= 2. ADVANCES TAB ================= */}
        {subTab === 'advances' && (
          <div className="p-4 sm:p-5">
            {advances.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400">
                <ArrowDownLeft className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">No tour advances have been recorded yet for this specialist.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Purpose</th>
                      <th className="py-2.5 px-3">Payment Mode</th>
                      <th className="py-2.5 px-3">Ref No</th>
                      <th className="py-2.5 px-3">Allocated By</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-700">
                          {adv.allocated_at ? formatIndianDateOnly(adv.allocated_at) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium">
                          {adv.purpose || 'Tour Advance'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                            {adv.payment_mode || 'Cash'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {adv.reference_no || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {adv.allocated_by_name || 'Admin'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900 text-sm">
                          {formatCur(adv.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= 3. SETTLEMENTS TAB ================= */}
        {subTab === 'settlements' && (
          <div className="p-4 sm:p-5">
            {settlements.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">No balance returns or reimbursements recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3">Notes</th>
                      <th className="py-2.5 px-3">Received By</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlements.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-700">
                          {st.settled_at ? formatIndianDateOnly(st.settled_at) : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            st.settlement_type === 'return_to_company'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {st.settlement_type === 'return_to_company' ? 'Surplus Returned to Company' : 'Reimbursed to Tech'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-600">
                          {st.payment_mode || 'Cash'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                          {st.notes || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {st.received_by_name || 'Admin'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 text-sm">
                          {formatCur(st.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= MODAL: ALLOCATE ADVANCE ================= */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                <span>Allocate Tour Advance Cash</span>
              </h4>
              <button 
                type="button" 
                onClick={() => setIsAdvanceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAllocateAdvance} className="space-y-3 text-xs">
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                <span className="block text-[11px] font-semibold text-blue-700">Specialist:</span>
                <strong className="text-sm font-bold text-blue-950">{currentTech.name}</strong>
                <span className="text-[11px] text-blue-600 block mt-0.5">{currentTech.area_zone || 'Field Zone'}</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Advance Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 5000"
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full text-base font-bold font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={advanceForm.payment_mode}
                    onChange={(e) => setAdvanceForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="Cash">Cash in Hand</option>
                    <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="UPI / GPay">UPI / GPay</option>
                    <option value="Company Card">Company Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Ref / Voucher No
                  </label>
                  <input
                    type="text"
                    placeholder="Optional ref"
                    value={advanceForm.reference_no}
                    onChange={(e) => setAdvanceForm(prev => ({ ...prev, reference_no: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Tour Purpose / Destination
                </label>
                <input
                  type="text"
                  placeholder="e.g. Saurashtra Tour - 5 Complaints"
                  value={advanceForm.purpose}
                  onChange={(e) => setAdvanceForm(prev => ({ ...prev, purpose: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdvance}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {submittingAdvance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingAdvance ? 'Saving...' : 'Confirm Advance'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD EXPENSE VOUCHER ================= */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Add Tour Expense / Voucher Claim</span>
              </h4>
              <button 
                type="button" 
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Expense Category *
                  </label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Amount Spent (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="e.g. 350"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full text-base font-bold font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, expense_date: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Linked Complaint Ticket (Optional)
                  </label>
                  <select
                    value={expenseForm.ticket_id}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, ticket_id: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- General / Non-ticket Tour Travel --</option>
                    {complaints.slice(0, 30).map(c => (
                      <option key={c.id} value={c.ticket_id}>
                        {c.ticket_id} — {c.customer_name} ({c.city || 'Site'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Title / Brief Particulars *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bus fare from Rajkot to Gondal, or Petrol for site visit"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Detailed Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional details: vehicle number, ticket number, food bill particulars, etc."
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Receipt / Bill Photo Upload */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Attach Receipt / Bill Photo (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-300 font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Bill / Photo</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleReceiptChange}
                      className="hidden"
                    />
                  </label>
                  {expenseForm.receipt_file && (
                    <span className="text-[11px] text-emerald-700 font-semibold truncate max-w-[200px]">
                      ✓ {expenseForm.receipt_file.name}
                    </span>
                  )}
                </div>

                {expenseForm.receipt_preview && (
                  <div className="mt-2 relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200">
                    <img 
                      src={expenseForm.receipt_preview} 
                      alt="Receipt Preview" 
                      className="w-full h-full object-cover" 
                    />
                    <button
                      type="button"
                      onClick={() => setExpenseForm(prev => ({ ...prev, receipt_file: null, receipt_preview: null }))}
                      className="absolute top-1 right-1 p-0.5 bg-rose-600 text-white rounded-full text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExpense}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {submittingExpense && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingExpense ? 'Saving...' : 'Save Expense Voucher'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DEPOSIT / RETURN BALANCE TO COMPANY ================= */}
      {isSettleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-600" />
                <span>Return Surplus Advance to Company</span>
              </h4>
              <button 
                type="button" 
                onClick={() => setIsSettleModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSettleBalance} className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-1">
                <div className="flex justify-between">
                  <span>Current Tour Remaining Balance:</span>
                  <strong className="font-mono font-bold text-emerald-950">{formatCur(summary.net_balance)}</strong>
                </div>
                <p className="text-[10px] text-emerald-700">
                  Technician returning unused cash after tour completion back to the company accounts.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Deposit / Return Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={settleForm.amount}
                  onChange={(e) => setSettleForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full text-base font-bold font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={settleForm.payment_mode}
                  onChange={(e) => setSettleForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option value="Cash">Cash in Hand to Office</option>
                  <option value="Bank Transfer">Bank Transfer / Direct Deposit</option>
                  <option value="UPI">UPI to Company Account</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Remarks / Deposit Notes
                </label>
                <input
                  type="text"
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSettle}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {submittingSettle && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingSettle ? 'Saving...' : 'Confirm Cash Return'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: PRINT & WORD EXPORT VOUCHER ================= */}
      {isVoucherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Actions Bar */}
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Official Tour Expense Voucher Statement</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  title="Download .doc Word file format"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Word (.doc)</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTable}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy table to paste in Word or Excel"
                >
                  {copiedWord ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWord ? 'Copied!' : 'Copy Table'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsVoucherModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Voucher Paper */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-100">
              <div 
                id="tour-voucher-print-area" 
                className="bg-white max-w-3xl mx-auto p-8 sm:p-10 rounded-xl shadow-md border border-slate-200 text-slate-800"
              >
                {/* Letterhead Header */}
                <div className="text-center pb-4 border-b-2 border-emerald-700 mb-6">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-xl font-black text-emerald-800 tracking-wider">ECO GREEN SOLAR SOLUTIONS</span>
                  </div>
                  <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-widest">
                    FIELD TECHNICIAN TOUR EXPENSE VOUCHER & LEDGER STATEMENT
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Solar Rooftop Systems • Solar Water Heaters • Heat Pumps
                  </p>
                </div>

                {/* Technician & Statement Info Table */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-6 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Technician:</span>
                    <strong className="text-slate-900 font-bold">{currentTech.name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Mobile:</span>
                    <strong className="text-slate-900 font-mono font-bold">{currentTech.phone || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Service Zone:</span>
                    <strong className="text-slate-900">{currentTech.area_zone || 'General Zone'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Date of Issue:</span>
                    <strong className="text-slate-900 font-mono">{formatIndianDateOnly(new Date().toISOString())}</strong>
                  </div>
                </div>

                {/* Summary Box */}
                <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-xl mb-6 text-xs space-y-2">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">1. Total Tour Advance Cash Received:</span>
                    <strong className="text-sm font-mono font-black text-slate-900">{formatCur(summary.total_advance)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">2. Total Tour Expenses Claimed (As per below):</span>
                    <strong className="text-sm font-mono font-black text-rose-700">{formatCur(summary.approved_expenses)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">3. Surplus Cash Returned / Deposited to Company:</span>
                    <strong className="text-sm font-mono font-black text-emerald-800">{formatCur(summary.total_returned)}</strong>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-emerald-200 text-slate-900">
                    <span className="font-black text-sm">4. Net Tour Closing Balance:</span>
                    <strong className={`text-base font-mono font-black ${summary.net_balance >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                      {formatCur(summary.net_balance)} {summary.net_balance >= 0 ? '(In Hand / Safe)' : '(Company Reimbursement Due)'}
                    </strong>
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="mb-8">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Itemized Tour Expense Particulars</span>
                  </h4>

                  <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                    <thead>
                      <tr className="bg-emerald-800 text-white font-bold text-[10px] uppercase">
                        <th className="p-2 border border-emerald-800 text-center w-8">#</th>
                        <th className="p-2 border border-emerald-800">Date</th>
                        <th className="p-2 border border-emerald-800">Voucher #</th>
                        <th className="p-2 border border-emerald-800">Category</th>
                        <th className="p-2 border border-emerald-800">Particulars & Description</th>
                        <th className="p-2 border border-emerald-800 text-center">Bill</th>
                        <th className="p-2 border border-emerald-800 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {expenses.map((exp, idx) => (
                        <tr key={exp.id} className="text-slate-800">
                          <td className="p-2 border border-slate-300 text-center font-semibold text-slate-500">{idx + 1}</td>
                          <td className="p-2 border border-slate-300 whitespace-nowrap">{exp.expense_date ? formatIndianDateOnly(exp.expense_date) : '-'}</td>
                          <td className="p-2 border border-slate-300 font-mono font-bold text-emerald-800">{exp.voucher_no || '-'}</td>
                          <td className="p-2 border border-slate-300 font-semibold">{exp.category}</td>
                          <td className="p-2 border border-slate-300">
                            {exp.ticket_id && <span className="text-[10px] text-blue-700 font-mono font-bold block">[{exp.ticket_id}]</span>}
                            <span>{exp.title}</span>
                            {exp.description && <span className="text-slate-500 text-[10px] block">{exp.description}</span>}
                          </td>
                          <td className="p-2 border border-slate-300 text-center">
                            {exp.receipt_url ? '✓ Attached' : 'Self'}
                          </td>
                          <td className="p-2 border border-slate-300 text-right font-mono font-bold">
                            {formatCur(exp.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                        <td colSpan={6} className="p-2 border border-slate-300 text-right">Total Tour Claim:</td>
                        <td className="p-2 border border-slate-300 text-right font-mono text-emerald-800 text-sm">
                          {formatCur(summary.approved_expenses)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-6 pt-10 text-center text-xs text-slate-700">
                  <div className="border-t border-slate-400 pt-2">
                    <strong className="block text-slate-900 font-bold">{currentTech.name}</strong>
                    <span className="text-[10px] text-slate-500">Technician Signature</span>
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    <strong className="block text-slate-900 font-bold">Accounts Officer</strong>
                    <span className="text-[10px] text-slate-500">Verified & Reconciled</span>
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    <strong className="block text-slate-900 font-bold">Director / Operations</strong>
                    <span className="text-[10px] text-slate-500">Authorized Approval</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= LIGHTBOX PREVIEW ================= */}
      {receiptLightbox && (
        <div 
          onClick={() => setReceiptLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm cursor-zoom-out"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl p-4 flex flex-col"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">{receiptLightbox.name}</span>
              <button
                type="button"
                onClick={() => setReceiptLightbox(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center">
              <img 
                src={receiptLightbox.url} 
                alt={receiptLightbox.name}
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
