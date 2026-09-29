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

export function numberToIndianWords(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'Zero Rupees Only';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
  }

  function convertThreeDigits(n) {
    let str = '';
    if (Math.floor(n / 100) > 0) {
      str += a[Math.floor(n / 100)] + ' Hundred ';
    }
    const rem = n % 100;
    if (rem > 0) {
      str += (str ? 'and ' : '') + convertTwoDigits(rem);
    }
    return str.trim();
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;

  let result = '';
  if (crore > 0) result += convertThreeDigits(crore) + ' Crore ';
  if (lakh > 0) result += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand > 0) result += convertTwoDigits(thousand) + ' Thousand ';
  if (hundred > 0) result += convertThreeDigits(hundred) + ' ';

  return (result.trim() + ' Rupees Only').replace(/\s+/g, ' ');
}

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
  const [startingVoucherNo, setStartingVoucherNo] = useState(341);

  // Sync latest global voucher sequence when modal opens
  useEffect(() => {
    if (isVoucherModalOpen) {
      api.getNextVoucherSequence().then(res => {
        if (res && res.next_seq) {
          setStartingVoucherNo(res.next_seq);
        }
      }).catch(err => console.error(err));
    }
  }, [isVoucherModalOpen]);

  // Divide expenses into 6-item vouchers matching the physical printed voucher slip
  const voucherChunks = useMemo(() => {
    const exps = ledgerData.expenses || [];
    if (exps.length === 0) {
      return [{
        voucherNo: `TT-${startingVoucherNo}`,
        date: formatIndianDateOnly(new Date().toISOString()),
        items: [],
        total: 0
      }];
    }

    const chunks = [];
    const chunkSize = 6;
    for (let i = 0; i < exps.length; i += chunkSize) {
      const chunkItems = exps.slice(i, i + chunkSize);
      const chunkTotal = chunkItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
      const assignedNo = chunkItems.find(it => it.voucher_no)?.voucher_no;
      const vNo = assignedNo || `TT-${startingVoucherNo + chunks.length}`;
      const latestDate = chunkItems[0]?.expense_date 
        ? formatIndianDateOnly(chunkItems[0].expense_date)
        : formatIndianDateOnly(new Date().toISOString());

      chunks.push({
        voucherNo: vNo,
        date: latestDate,
        items: chunkItems,
        total: chunkTotal
      });
    }
    return chunks;
  }, [ledgerData.expenses, startingVoucherNo]);

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

  // Export to Microsoft Word (.doc) - Matching physical Voucher Book (2 vouchers per A4 page)
  const handleExportWord = () => {
    const techName = currentTech.name || 'Technician';

    let vouchersHtml = '';
    voucherChunks.forEach((chunk, cIdx) => {
      // Build 6 rows
      let rowsHtml = '';
      const items = chunk.items || [];
      for (let r = 0; r < 6; r++) {
        const item = items[r];
        if (item) {
          const detail = item.ticket_id 
            ? `[${item.ticket_id}] ${item.category} - ${item.title}${item.description ? ' (' + item.description + ')' : ''}` 
            : `${item.category} - ${item.title}${item.description ? ' (' + item.description + ')' : ''}`;
          rowsHtml += `
            <tr style="height: 28px;">
              <td style="padding: 4px 8px; border-right: 1.5px solid #000; font-size: 9.5pt; vertical-align: middle;">${detail}</td>
              <td style="padding: 4px 8px; text-align: right; font-size: 9.5pt; vertical-align: middle; font-weight: bold;">₹${Number(item.amount || 0).toFixed(2)}</td>
            </tr>
          `;
        } else {
          rowsHtml += `
            <tr style="height: 28px;">
              <td style="padding: 4px 8px; border-right: 1.5px solid #000; font-size: 9.5pt;">&nbsp;</td>
              <td style="padding: 4px 8px; text-align: right; font-size: 9.5pt;">&nbsp;</td>
            </tr>
          `;
        }
      }

      vouchersHtml += `
        <div style="border: 2px solid #000; padding: 14px 18px; margin-bottom: 20px; box-sizing: border-box; background: #fff; page-break-inside: avoid;">
          <!-- Header: Green Energy Logo + Address + Voucher No & Date -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
            <tr>
              <td style="width: 25%; vertical-align: middle;">
                <div style="color: #15803d; font-family: 'Georgia', serif; font-size: 26pt; font-weight: bold; line-height: 0.9;">Green</div>
                <div style="color: #166534; font-family: 'Arial Black', sans-serif; font-size: 8.5pt; letter-spacing: 2px; font-weight: 900; margin-top: -2px;">ENERGY</div>
              </td>
              <td style="width: 45%; vertical-align: middle; font-size: 8.5pt; color: #1e293b; line-height: 1.35; padding-left: 8px;">
                Plot No. 4, Gajanand Industrial, Near RK Exotica,<br/>
                Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021
              </td>
              <td style="width: 30%; vertical-align: middle; text-align: right; font-size: 9.5pt; line-height: 1.4;">
                <b>Voucher No :</b> ${chunk.voucherNo}<br/>
                <b>Date :</b> ${chunk.date}
              </td>
            </tr>
          </table>

          <!-- Name & Account -->
          <div style="font-size: 9.5pt; margin: 4px 0 2px 0; border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px;">
            <b>Name :</b> ${techName}
          </div>
          <div style="font-size: 9.5pt; margin-bottom: 6px;">
            <b>Account :</b> TECHNICIAN TOUR EXPENSES
          </div>

          <!-- Particulars & Amount Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 6px;">
            <thead>
              <tr style="border-bottom: 1.5px solid #000; background: #f8fafc;">
                <th style="padding: 4px 8px; border-right: 1.5px solid #000; text-align: center; font-size: 9.5pt; width: 75%;">Particulars</th>
                <th style="padding: 4px 8px; text-align: center; font-size: 9.5pt; width: 25%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="border-top: 1.5px solid #000; font-weight: bold; background: #f8fafc;">
                <td style="padding: 4px 8px; border-right: 1.5px solid #000; text-align: right; font-size: 9.5pt;">Total:</td>
                <td style="padding: 4px 8px; text-align: right; font-size: 9.5pt;">₹${Number(chunk.total || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Amount in Word -->
          <div style="font-size: 9pt; margin: 4px 0 16px 0; border-bottom: 1px dotted #94a3b8; padding-bottom: 3px;">
            <b>Amount in Word :</b> ${numberToIndianWords(chunk.total)}
          </div>

          <!-- 4 Signatures -->
          <table style="width: 100%; margin-top: 26px; border-collapse: collapse;">
            <tr>
              <td style="width: 25%; text-align: center; font-size: 8.5pt; border-top: 1px solid #334155; padding-top: 4px;">Authorized Signature</td>
              <td style="width: 25%; text-align: center; font-size: 8.5pt; border-top: 1px solid #334155; padding-top: 4px;">Checked by</td>
              <td style="width: 25%; text-align: center; font-size: 8.5pt; border-top: 1px solid #334155; padding-top: 4px;">Paid by</td>
              <td style="width: 25%; text-align: center; font-size: 8.5pt; border-top: 1px solid #334155; padding-top: 4px;">Receiver's Signature</td>
            </tr>
          </table>
        </div>
      `;

      // Page break after every 2 vouchers (2 per page)
      if ((cIdx + 1) % 2 === 0 && (cIdx + 1) < voucherChunks.length) {
        vouchersHtml += `<div style="page-break-after: always; height: 1px;"></div>`;
      }
    });

    const wordContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Voucher Book - PRINT - 26-27</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 10pt; color: #1e293b; margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        ${vouchersHtml}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordContent], {
      type: 'application/msword;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Voucher_Book_${techName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Word Voucher Book downloaded! 2 vouchers per page format matching physical voucher book.', 'success');
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
            <div className="p-3 sm:p-4 bg-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Voucher Book Print (2 Vouchers per A4 Page)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Global Sequence Number Controller */}
                <div className="flex items-center gap-1.5 bg-slate-700/80 px-2.5 py-1 rounded-lg text-xs" title="Adjust the starting global voucher sequence number">
                  <span className="text-slate-300 font-bold">Voucher No: TT-</span>
                  <input
                    type="number"
                    min="1"
                    value={startingVoucherNo}
                    onChange={(e) => setStartingVoucherNo(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-600 rounded text-emerald-400 font-mono font-bold text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

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
                  <span>Print Book</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsVoucherModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors ml-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Voucher Paper */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200">
              <style>{`
                @media print {
                  body * { visibility: hidden !important; }
                  #tour-voucher-print-area, #tour-voucher-print-area * { visibility: visible !important; }
                  #tour-voucher-print-area { position: absolute; left: 0; top: 0; width: 100% !important; margin: 0 !important; padding: 0 !important; }
                  .voucher-page-break { page-break-after: always !important; break-after: page !important; }
                }
              `}</style>
              <div 
                id="tour-voucher-print-area" 
                className="max-w-3xl mx-auto space-y-6 text-slate-900"
              >
                {voucherChunks.map((chunk, cIdx) => {
                  const items = chunk.items || [];
                  const emptySlots = Math.max(0, 6 - items.length);

                  return (
                    <React.Fragment key={chunk.voucherNo + '-' + cIdx}>
                      {/* Physical Voucher Slip Card */}
                      <div className="bg-white border-2 border-black p-5 sm:p-6 shadow-sm rounded-none font-sans text-slate-900 relative">
                        {/* Header: Green Energy Logo + Address + Voucher No & Date */}
                        <div className="grid grid-cols-12 gap-2 pb-3 mb-2">
                          {/* Logo */}
                          <div className="col-span-3 flex flex-col justify-center">
                            <span className="text-3xl font-black text-emerald-700 tracking-tight leading-none" style={{ fontFamily: 'Georgia, serif' }}>
                              Green
                            </span>
                            <span className="text-[10px] font-black text-emerald-800 tracking-[0.2em] uppercase mt-0.5" style={{ fontFamily: 'Arial Black, sans-serif' }}>
                              ENERGY
                            </span>
                          </div>

                          {/* Address */}
                          <div className="col-span-6 text-[10px] text-slate-700 leading-snug flex flex-col justify-center border-l border-slate-200 pl-3">
                            <p className="font-semibold text-slate-800">Plot No. 4, Gajanand Industrial, Near RK Exotica,</p>
                            <p>Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021</p>
                          </div>

                          {/* Voucher No & Date */}
                          <div className="col-span-3 text-right text-xs leading-normal flex flex-col justify-center">
                            <p className="font-bold text-slate-900">
                              Voucher No : <span className="font-mono text-emerald-800 text-sm font-black">{chunk.voucherNo}</span>
                            </p>
                            <p className="text-[11px] text-slate-700 mt-0.5">
                              Date : <span className="font-mono font-semibold">{chunk.date}</span>
                            </p>
                          </div>
                        </div>

                        {/* Name & Account */}
                        <div className="text-xs space-y-1 mb-3 pt-1 border-t border-slate-300">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-slate-900 shrink-0">Name :</span>
                            <span className="font-semibold text-slate-800 border-b border-dotted border-slate-400 flex-1 pb-0.5">
                              {currentTech.name} {currentTech.phone ? `(${currentTech.phone})` : ''}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-slate-900 shrink-0">Account :</span>
                            <span className="font-bold text-slate-900 uppercase tracking-wide">
                              TECHNICIAN TOUR EXPENSES
                            </span>
                          </div>
                        </div>

                        {/* Particulars & Amount Table (6 Rows) */}
                        <div className="border-[1.5px] border-black mb-3">
                          <div className="grid grid-cols-12 bg-slate-50 border-b-[1.5px] border-black text-xs font-bold text-center">
                            <div className="col-span-9 p-1.5 border-r-[1.5px] border-black uppercase text-[11px]">
                              Particulars
                            </div>
                            <div className="col-span-3 p-1.5 uppercase text-[11px]">
                              Amount
                            </div>
                          </div>

                          {/* Item Rows */}
                          <div className="divide-y divide-slate-300 text-xs">
                            {items.map((item, iIdx) => (
                              <div key={item.id || iIdx} className="grid grid-cols-12 min-h-[30px] items-center">
                                <div className="col-span-9 px-3 py-1.5 border-r-[1.5px] border-black font-medium text-slate-800">
                                  {item.ticket_id && (
                                    <span className="font-mono font-bold text-blue-800 mr-1.5">[{item.ticket_id}]</span>
                                  )}
                                  <span className="font-semibold">{item.category}</span>
                                  {item.title && <span className="text-slate-600 ml-1">- {item.title}</span>}
                                  {item.description && <span className="text-slate-500 text-[10px] ml-1">({item.description})</span>}
                                </div>
                                <div className="col-span-3 px-3 py-1.5 text-right font-mono font-bold text-slate-900">
                                  ₹{Number(item.amount || 0).toFixed(2)}
                                </div>
                              </div>
                            ))}

                            {/* Blank padding rows to fit 6 logs perfectly */}
                            {Array.from({ length: emptySlots }).map((_, bIdx) => (
                              <div key={'blank-' + bIdx} className="grid grid-cols-12 min-h-[30px] items-center">
                                <div className="col-span-9 px-3 py-1.5 border-r-[1.5px] border-black text-slate-300 select-none">
                                  &nbsp;
                                </div>
                                <div className="col-span-3 px-3 py-1.5 text-right font-mono text-slate-300 select-none">
                                  &nbsp;
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Total Row */}
                          <div className="grid grid-cols-12 bg-slate-50 border-t-[1.5px] border-black font-bold text-xs">
                            <div className="col-span-9 px-3 py-1.5 border-r-[1.5px] border-black text-right uppercase">
                              Total:
                            </div>
                            <div className="col-span-3 px-3 py-1.5 text-right font-mono text-sm text-emerald-900 font-black">
                              ₹{Number(chunk.total || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Amount in Word */}
                        <div className="text-xs mb-6">
                          <span className="font-bold text-slate-900">Amount in Word : </span>
                          <span className="font-semibold text-slate-800 border-b border-dotted border-slate-400 pb-0.5 italic">
                            {numberToIndianWords(chunk.total)}
                          </span>
                        </div>

                        {/* 4 Signatures */}
                        <div className="grid grid-cols-4 gap-2 pt-6 text-center text-[10px] text-slate-700">
                          <div className="border-t border-slate-700 pt-1 font-semibold">
                            Authorized Signature
                          </div>
                          <div className="border-t border-slate-700 pt-1 font-semibold">
                            Checked by
                          </div>
                          <div className="border-t border-slate-700 pt-1 font-semibold">
                            Paid by
                          </div>
                          <div className="border-t border-slate-700 pt-1 font-semibold">
                            Receiver's Signature
                          </div>
                        </div>
                      </div>

                      {/* Cut line between 2 vouchers on the same page */}
                      {(cIdx + 1) % 2 !== 0 && (cIdx + 1) < voucherChunks.length && (
                        <div className="flex items-center justify-center gap-2 py-2 text-slate-400 print:py-3">
                          <span className="text-xs">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>
                        </div>
                      )}

                      {/* Page Break after every 2 vouchers for printing */}
                      {(cIdx + 1) % 2 === 0 && (cIdx + 1) < voucherChunks.length && (
                        <div className="voucher-page-break my-4 border-b-2 border-dashed border-slate-400 print:hidden text-center text-[11px] text-slate-500 py-1 font-bold">
                          --- Next A4 Sheet (2 Vouchers per Page) ---
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
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
