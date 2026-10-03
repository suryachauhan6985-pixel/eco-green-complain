import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  IndianRupee, Plus, FileText, Download, Printer, Copy, Check, 
  Trash2, Eye, Upload, Filter, Calendar, CheckCircle2, Clock, 
  AlertCircle, ChevronRight, ChevronLeft, ChevronDown, X, ArrowUpRight, ArrowDownLeft, ShieldCheck,
  Building, User, Tag, Sparkles, Image as ImageIcon, ExternalLink, Loader2,
  Camera, Ticket, Edit2, Lock, RotateCcw, XCircle
} from 'lucide-react';
import { formatIndianDateOnly, formatIndianDateTime } from '../common/TicketAgeBadge';
import { GREEN_ENERGY_LOGO_BASE64 } from '../../assets/greenEnergyLogo';
import { subscribeLiveSync, broadcastLedgerUpdate as emitLedgerUpdate } from '../../utils/liveSync';
import { getUrlParam, updateUrlParams } from '../../utils/urlSync';

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

export const TourLedgerSection = ({ 
  scopedTechProfile, 
  allTechnicians = [], 
  complaints = [],
  activeTechId,
  onTechChange 
}) => {
  const { currentUser } = useAuth();
  const user = currentUser;
  const { showToast, confirm } = useDialog();

  const isAdminOrStaff = ['admin', 'staff'].includes(currentUser?.role);

  // Technicians list with self-healing fallback fetch
  const [loadedTechs, setLoadedTechs] = useState(allTechnicians || []);
  useEffect(() => {
    if (allTechnicians && allTechnicians.length > 0) {
      setLoadedTechs(allTechnicians);
    } else {
      api.getTechnicians().then(res => {
        if (res && res.technicians) setLoadedTechs(res.technicians);
      }).catch(err => console.error('Failed to load technicians:', err));
    }
  }, [allTechnicians]);

  // Complaints / Tickets list with fallback fetch
  const [loadedComplaints, setLoadedComplaints] = useState(complaints || []);
  useEffect(() => {
    if (complaints && complaints.length > 0) {
      setLoadedComplaints(complaints);
    } else {
      api.getComplaints().then(res => {
        if (res && res.complaints) setLoadedComplaints(res.complaints);
      }).catch(err => console.error('Failed to load complaints for voucher:', err));
    }
  }, [complaints]);

  // Selected technician filter: default to scoped tech if technician, or activeTechId, or first loaded tech
  const [internalTechId, setInternalTechId] = useState(() => {
    if (!isAdminOrStaff && scopedTechProfile?.id) return String(scopedTechProfile.id);
    if (activeTechId && activeTechId !== 'all') return String(activeTechId);
    if (allTechnicians && allTechnicians.length > 0) return String(allTechnicians[0].id);
    return '';
  });

  useEffect(() => {
    if (isAdminOrStaff) {
      if (activeTechId && activeTechId !== 'all') {
        setInternalTechId(String(activeTechId));
      } else if (loadedTechs.length > 0 && (!internalTechId || internalTechId === 'all')) {
        const firstId = String(loadedTechs[0].id);
        setInternalTechId(firstId);
        if (onTechChange) onTechChange(firstId);
      }
    } else if (scopedTechProfile?.id) {
      setInternalTechId(String(scopedTechProfile.id));
    }
  }, [activeTechId, isAdminOrStaff, scopedTechProfile, loadedTechs]);

  const selectedTechId = internalTechId || (loadedTechs[0]?.id ? String(loadedTechs[0].id) : '');

  const handleTechChange = (newId) => {
    setInternalTechId(newId);
    if (onTechChange) onTechChange(newId);
  };

  const [ledgerData, setLedgerData] = useState({
    advances: [],
    expenses: [],
    settlements: [],
    summary: {
      total_advance: 0,
      approved_expenses: 0,
      total_returned: 0,
      total_reimbursed: 0,
      net_balance: 0,
      net_recoverable: 0,
      net_payable: 0,
      status_label: 'Settled'
    },
    statement: null,
    complaint_settlements: [],
    technicians_summary: [],
    company_kpis: null,
    reconciliation: null
  });
  const [loading, setLoading] = useState(true);

  const getInitialSubTab = () => {
    const raw = (getUrlParam('subtab') || getUrlParam('tab') || '').toLowerCase();
    if (['advances', 'expenses', 'settlements', 'statement', 'complaints', 'admin_summary'].includes(raw)) {
      return raw;
    }
    const sec = (getUrlParam('section') || '').toLowerCase();
    if (sec === 'statement') return 'statement';
    if (sec === 'expenses' || sec === 'vouchers' || sec === 'voucher') return 'expenses';
    if (sec === 'advances') return 'advances';
    if (sec === 'settlements') return 'settlements';
    return 'advances';
  };

  const [subTab, setSubTab] = useState(() => getInitialSubTab());

  const handleSubTabSwitch = (newSubTab) => {
    setSubTab(newSubTab);
    updateUrlParams({ subtab: newSubTab === 'advances' ? null : newSubTab });
  };

  // Statement generation & filters
  const [statementPreset, setStatementPreset] = useState(() => getUrlParam('preset') || 'current_fy');
  const [statementFromDate, setStatementFromDate] = useState(() => {
    const pFrom = getUrlParam('from_date');
    if (pFrom) return pFrom;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 3 ? `${year}-04-01` : `${year - 1}-04-01`;
  });
  const [statementToDate, setStatementToDate] = useState(() => {
    const pTo = getUrlParam('to_date');
    if (pTo) return pTo;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 3 ? `${year + 1}-03-31` : `${year}-03-31`;
  });
  const [statementTicketId, setStatementTicketId] = useState('all');
  const [statementTxType, setStatementTxType] = useState('all');
  const [isPrintStatementOpen, setIsPrintStatementOpen] = useState(() => {
    return getUrlParam('print_statement') === '1' || getUrlParam('modal') === 'statement';
  });

  const openPrintStatementModal = () => {
    setIsPrintStatementOpen(true);
    updateUrlParams({ print_statement: '1' });
  };

  const closePrintStatementModal = () => {
    setIsPrintStatementOpen(false);
    updateUrlParams({ print_statement: null });
  };

  const [advanceAdjustBalance, setAdvanceAdjustBalance] = useState(false);

  const handleApplyStatementPreset = (presetKey) => {
    setStatementPreset(presetKey);
    updateUrlParams({ preset: presetKey === 'current_fy' ? null : presetKey });
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (presetKey === 'current_month') {
      const start = new Date(year, month, 1).toISOString().split('T')[0];
      const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
      setStatementFromDate(start);
      setStatementToDate(end);
    } else if (presetKey === 'previous_month') {
      const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      setStatementFromDate(start);
      setStatementToDate(end);
    } else if (presetKey === 'current_fy') {
      const start = month >= 3 ? `${year}-04-01` : `${year - 1}-04-01`;
      const end = month >= 3 ? `${year + 1}-03-31` : `${year}-03-31`;
      setStatementFromDate(start);
      setStatementToDate(end);
    } else if (presetKey === 'previous_fy') {
      const start = month >= 3 ? `${year - 1}-04-01` : `${year - 2}-04-01`;
      const end = month >= 3 ? `${year}-03-31` : `${year - 1}-03-31`;
      setStatementFromDate(start);
      setStatementToDate(end);
    } else if (presetKey === 'all_time') {
      setStatementFromDate('');
      setStatementToDate('');
    }
  };

  // Modals state
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    technician_id: '',
    amount: '',
    purpose: '',
    payment_mode: 'Cash',
    reference_no: ''
  });
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  // Edit Tour Advance Modal State
  const [isEditAdvanceModalOpen, setIsEditAdvanceModalOpen] = useState(false);
  const [editAdvanceForm, setEditAdvanceForm] = useState({
    id: '',
    technician_id: '',
    amount: '',
    purpose: '',
    payment_mode: 'Cash',
    reference_no: '',
    allocated_at: ''
  });
  const [submittingEditAdvance, setSubmittingEditAdvance] = useState(false);

  // Dedicated in-app modal state for Cancellation / Reversal / Rejection (replacing native browser window prompt)
  const [cancelModalState, setCancelModalState] = useState({
    isOpen: false,
    type: null, // 'advance' | 'settlement' | 'voucher'
    item: null,
    title: '',
    subtitle: '',
    amount: 0,
    referenceNo: '',
    technicianName: '',
    purpose: '',
    dateFormatted: '',
    warningText: '',
    confirmText: '',
    presetReasons: [],
    reason: '',
    submitting: false
  });

  const handleOpenEditAdvance = (adv) => {
    setEditAdvanceForm({
      id: adv.id,
      technician_id: adv.technician_id ? String(adv.technician_id) : '',
      amount: adv.amount || '',
      purpose: adv.purpose || adv.tour_title || adv.notes || '',
      payment_mode: adv.payment_mode || 'Cash',
      reference_no: adv.reference_no || '',
      allocated_at: adv.allocated_at ? adv.allocated_at.slice(0, 16) : ''
    });
    setIsEditAdvanceModalOpen(true);
  };

  const handleSaveEditAdvance = async (e) => {
    e.preventDefault();
    if (!editAdvanceForm.amount || parseFloat(editAdvanceForm.amount) <= 0) {
      return showToast('Please enter a valid advance amount', 'error');
    }
    try {
      setSubmittingEditAdvance(true);
      await api.updateTourAdvance(editAdvanceForm.id, {
        amount: parseFloat(editAdvanceForm.amount),
        purpose: editAdvanceForm.purpose,
        payment_mode: editAdvanceForm.payment_mode,
        reference_no: editAdvanceForm.reference_no,
        allocated_at: editAdvanceForm.allocated_at ? new Date(editAdvanceForm.allocated_at).toISOString() : null,
        technician_id: editAdvanceForm.technician_id
      });
      showToast('Tour advance updated successfully!', 'success');
      setIsEditAdvanceModalOpen(false);
      await fetchLedger(true);
      try {
        window.dispatchEvent(new CustomEvent('tour-ledger-updated', { detail: { timestamp: Date.now() } }));
        localStorage.setItem('egs_live_ledger_sync', String(Date.now()));
      } catch (_) {}
    } catch (err) {
      showToast('Failed to update advance: ' + err.message, 'error');
    } finally {
      setSubmittingEditAdvance(false);
    }
  };

  const handleDeleteAdvance = async (adv) => {
    const ok = await confirm({
      title: 'Delete Tour Advance',
      message: `Are you sure you want to permanently delete Advance ${adv.reference_no || ''} (₹${adv.amount}) for ${adv.technician_name || 'specialist'}? This cannot be undone.`,
      confirmText: 'Delete Advance',
      confirmVariant: 'danger'
    });
    if (!ok) return;
    try {
      await api.deleteTourAdvance(adv.id);
      showToast(`Advance ${adv.reference_no || ''} deleted successfully`, 'success');
      await fetchLedger(true);
      try {
        window.dispatchEvent(new CustomEvent('tour-ledger-updated', { detail: { timestamp: Date.now() } }));
        localStorage.setItem('egs_live_ledger_sync', String(Date.now()));
      } catch (_) {}
    } catch (err) {
      showToast('Failed to delete advance: ' + err.message, 'error');
    }
  };

  // Multi-item row state for Add Tour Expense / Voucher Claim modal (Single Voucher per Ticket/Tour)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingVoucherNo, setEditingVoucherNo] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    technician_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    ticket_id: '',
    receipt_files: [],
    receipt_previews: [],
    items: [
      {
        id: 'item-1',
        category: 'Bus / Train Fare',
        title: '',
        amount: ''
      }
    ]
  });
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Open modals with preselected technician without altering the outer tracking filter
  const openAdvanceModal = () => {
    const initialTechId = (selectedTechId && selectedTechId !== 'all') 
      ? String(selectedTechId) 
      : (loadedTechs[0]?.id ? String(loadedTechs[0].id) : (scopedTechProfile?.id ? String(scopedTechProfile.id) : ''));
    setAdvanceForm({
      technician_id: initialTechId,
      amount: '',
      purpose: '',
      payment_mode: 'Cash',
      reference_no: ''
    });
    setIsAdvanceModalOpen(true);
  };

  const openExpenseModal = () => {
    setEditingVoucherNo(null);
    const initialTechId = (!isAdminOrStaff && scopedTechProfile?.id)
      ? String(scopedTechProfile.id)
      : ((selectedTechId && selectedTechId !== 'all') ? String(selectedTechId) : (loadedTechs[0]?.id ? String(loadedTechs[0].id) : ''));
    setExpenseForm({
      technician_id: initialTechId,
      expense_date: new Date().toISOString().split('T')[0],
      ticket_id: '',
      receipt_files: [],
      receipt_previews: [],
      items: [
        {
          id: 'item-1',
          category: 'Bus / Train Fare',
          title: '',
          amount: ''
        }
      ]
    });
    setIsExpenseModalOpen(true);
  };

  const openEditExpenseModal = (grp) => {
    // Parse receipt previews if available
    let receiptPreviews = [];
    if (grp.receipt_url) {
      try {
        if (typeof grp.receipt_url === 'string' && grp.receipt_url.startsWith('[')) {
          const parsed = JSON.parse(grp.receipt_url);
          receiptPreviews = parsed.map((url, idx) => ({
            name: `Receipt #${idx + 1}`,
            url
          }));
        } else {
          receiptPreviews = [{
            name: grp.receipt_name || 'Receipt #1',
            url: grp.receipt_url
          }];
        }
      } catch (_) {
        receiptPreviews = [{
          name: grp.receipt_name || 'Receipt #1',
          url: grp.receipt_url
        }];
      }
    }

    const items = (grp.items && grp.items.length > 0)
      ? grp.items.map((it, idx) => ({
          id: it.id || `item-edit-${idx}-${Date.now()}`,
          category: it.category || 'Food & Meals',
          title: it.description || it.title || '',
          amount: it.amount || ''
        }))
      : [
          {
            id: 'item-1',
            category: grp.category || 'Food & Meals',
            title: grp.description || grp.title || '',
            amount: grp.totalAmount || ''
          }
        ];

    setEditingVoucherNo(grp.voucher_no);
    setExpenseForm({
      technician_id: grp.technician_id ? String(grp.technician_id) : (selectedTechId !== 'all' ? String(selectedTechId) : ''),
      expense_date: grp.expense_date ? String(grp.expense_date).split('T')[0] : new Date().toISOString().split('T')[0],
      ticket_id: grp.ticket_id || '',
      receipt_files: [],
      receipt_previews: receiptPreviews,
      items
    });
    setIsExpenseModalOpen(true);
  };

  const handleAddItemRow = () => {
    setExpenseForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          category: 'Food & Meals',
          title: '',
          amount: ''
        }
      ]
    }));
  };

  const handleRemoveItemRow = (itemId) => {
    setExpenseForm(prev => {
      if (prev.items.length <= 1) return prev;
      return {
        ...prev,
        items: prev.items.filter(it => it.id !== itemId)
      };
    });
  };

  const handleUpdateItemRow = (itemId, field, value) => {
    setExpenseForm(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === itemId ? { ...it, [field]: value } : it)
    }));
  };

  // Client-side image compression to prevent mobile upload timeouts and Vercel payload limits
  const compressImageFile = (file) => {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        return resolve(file);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 1200; // 1200px max dimension provides crisp bill details while reducing size to ~80-120KB
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressed);
            },
            'image/jpeg',
            0.75
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  const [compressingReceipts, setCompressingReceipts] = useState(false);
  const [isReceiptDragging, setIsReceiptDragging] = useState(false);

  const handleAddReceiptFiles = async (files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    try {
      setCompressingReceipts(true);
      const newFiles = [];
      const newPreviews = [];

      for (const file of fileList) {
        if (file.size > 25 * 1024 * 1024) {
          showToast(`File ${file.name} exceeds 25MB limit`, 'error');
          continue;
        }

        // Compress image before generating base64 data URL
        const processedFile = await compressImageFile(file);

        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(processedFile);
        });

        if (dataUrl) {
          newFiles.push(processedFile);
          newPreviews.push({
            name: processedFile.name,
            url: dataUrl
          });
        }
      }

      setExpenseForm(prev => ({
        ...prev,
        receipt_files: [...(prev.receipt_files || []), ...newFiles],
        receipt_previews: [
          ...(prev.receipt_previews || []),
          ...newPreviews
        ]
      }));
    } catch (err) {
      console.error('Failed to process receipt files:', err);
      showToast('Error processing photos. Please try again.', 'error');
    } finally {
      setCompressingReceipts(false);
    }
  };

  const handleRemoveReceiptFile = (index) => {
    setExpenseForm(prev => ({
      ...prev,
      receipt_files: (prev.receipt_files || []).filter((_, i) => i !== index),
      receipt_previews: (prev.receipt_previews || []).filter((_, i) => i !== index)
    }));
  };

  const expenseTotalSum = useMemo(() => {
    return (expenseForm.items || []).reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
  }, [expenseForm.items]);

  const [showAllDisbursements, setShowAllDisbursements] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({
    technician_id: '',
    amount: '',
    settlement_type: 'return_to_company',
    payment_mode: 'Cash',
    reference_no: '',
    notes: 'Tour remaining cash deposited back to company'
  });
  const [submittingSettle, setSubmittingSettle] = useState(false);

  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(() => {
    return getUrlParam('voucher_modal') === '1' || getUrlParam('modal') === 'voucher';
  });

  const openVoucherModal = (filter = null) => {
    if (filter) setPrintFilter(filter);
    setIsVoucherModalOpen(true);
    updateUrlParams({ voucher_modal: '1' });
  };

  const closeVoucherModal = () => {
    setIsVoucherModalOpen(false);
    updateUrlParams({ voucher_modal: null });
  };

  useEffect(() => {
    const handlePop = () => {
      const st = getInitialSubTab();
      setSubTab(st);
      setIsVoucherModalOpen(getUrlParam('voucher_modal') === '1' || getUrlParam('modal') === 'voucher');
      setIsPrintStatementOpen(getUrlParam('print_statement') === '1' || getUrlParam('modal') === 'statement');
      const pr = getUrlParam('preset');
      setStatementPreset(pr || 'current_fy');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const [receiptLightbox, setReceiptLightbox] = useState(null);
  const [copiedWord, setCopiedWord] = useState(false);
  const [startingVoucherNo, setStartingVoucherNo] = useState(341);
  const [selectedVoucherKeys, setSelectedVoucherKeys] = useState(new Set());
  const [printFilter, setPrintFilter] = useState('all'); // 'all' | 'selected' | 'pending' | 'approved'

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

  // Helper to group expenses for print/export:
  // Same expense_date + same category + same ticket_id merge into 1 line item.
  // If ticket_id is different (or one has ticket and one doesn't), they remain separate logs.
  // Software dashboard table keeps all raw logs individual and unmerged.
  const groupExpensesForPrint = (items) => {
    const groups = new Map();
    items.forEach(it => {
      const dateKey = it.expense_date ? String(it.expense_date).split('T')[0] : '';
      const catKey = (it.category || 'Other').trim().toLowerCase();
      const ticketKey = (it.ticket_id || '').trim();
      const groupKey = `${dateKey}__${catKey}__${ticketKey}`;

      const rawNote = (it.description || '').trim();
      const rawTitle = (it.title || '').trim();
      const notesToAdd = [];
      if (rawTitle && rawTitle.toLowerCase() !== catKey && !rawTitle.toLowerCase().includes('expense')) {
        notesToAdd.push(rawTitle);
      }
      if (rawNote && !notesToAdd.includes(rawNote)) {
        notesToAdd.push(rawNote);
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          ...it,
          amount: Number(it.amount || 0),
          mergedNotes: notesToAdd,
          count: 1
        });
      } else {
        const existing = groups.get(groupKey);
        existing.amount += Number(it.amount || 0);
        existing.count += 1;
        notesToAdd.forEach(n => {
          if (!existing.mergedNotes.includes(n)) {
            existing.mergedNotes.push(n);
          }
        });
      }
    });

    return Array.from(groups.values()).map(g => ({
      ...g,
      description: g.mergedNotes.join(', '),
      title: (g.title && g.title.toLowerCase() !== (g.category || '').toLowerCase()) ? g.title : ''
    }));
  };

  // Divide expenses into 9-entry vouchers matching the physical printed voucher slip (11 rows total: 1 header + 9 entries + 1 total)
  // Each ticket has its dedicated voucher table (no mixing of tickets in the same voucher)
  const voucherChunks = useMemo(() => {
    const rawExps = ledgerData.expenses || [];
    if (rawExps.length === 0) {
      return [{
        voucherNo: `TT-${startingVoucherNo}`,
        ticketId: null,
        date: formatIndianDateOnly(new Date().toISOString()),
        items: [],
        total: 0
      }];
    }

    // Sort chronologically/by sequence
    const sorted = [...rawExps].sort((a, b) => {
      const vA = parseInt(String(a.voucher_no || '').replace(/\D/g, '')) || 0;
      const vB = parseInt(String(b.voucher_no || '').replace(/\D/g, '')) || 0;
      if (vA !== vB) return vA - vB;
      return new Date(a.expense_date || 0) - new Date(b.expense_date || 0);
    });

    // Filter by print options: All / Selected / Pending / Approved
    let filtered = sorted;
    if (printFilter === 'selected' && selectedVoucherKeys.size > 0) {
      filtered = sorted.filter(it => {
        const vKey = it.voucher_no ? `vch_${it.voucher_no}` : (it.ticket_id ? `tkt_${it.ticket_id}_${it.expense_date}` : `item_${it.id}`);
        return selectedVoucherKeys.has(vKey);
      });
    } else if (printFilter === 'pending') {
      filtered = sorted.filter(it => (it.status || '').toLowerCase() !== 'approved');
    } else if (printFilter === 'approved') {
      filtered = sorted.filter(it => (it.status || '').toLowerCase() === 'approved');
    }

    if (filtered.length === 0) {
      return [{
        voucherNo: `TT-${startingVoucherNo}`,
        ticketId: null,
        date: formatIndianDateOnly(new Date().toISOString()),
        items: [],
        total: 0
      }];
    }

    // Group strictly by distinct allotted voucher! Every voucher_no is an independent legal slip
    const voucherGroups = new Map();
    filtered.forEach(it => {
      const vNoKey = it.voucher_no 
        ? `vch_${String(it.voucher_no).trim()}` 
        : (it.ticket_id ? `tkt_${String(it.ticket_id).trim()}_${it.expense_date}` : `item_${it.id}`);

      if (!voucherGroups.has(vNoKey)) {
        voucherGroups.set(vNoKey, []);
      }
      voucherGroups.get(vNoKey).push(it);
    });

    const chunks = [];
    const chunkSize = 9;

    // Process each voucher's items into its dedicated voucher table(s)
    voucherGroups.forEach((vchExps) => {
      // Merge same date + same category within this specific voucher for print/export
      const groupedItems = groupExpensesForPrint(vchExps);

      for (let i = 0; i < groupedItems.length; i += chunkSize) {
        const chunkItems = groupedItems.slice(i, i + chunkSize);
        const chunkTotal = chunkItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

        // System allocated voucher number directly from the voucher
        const rawVch = vchExps[0]?.voucher_no || '';
        let vNo = rawVch;
        if (!vNo) {
          vNo = `TT-${chunks.length + 1}`;
        } else {
          // Normalize formatting cleanly to TT-XXX
          const digits = vNo.replace(/\D/g, '');
          if (digits) {
            vNo = `TT-${digits}`;
          }
        }

        const latestDate = chunkItems[0]?.expense_date 
          ? formatIndianDateOnly(chunkItems[0].expense_date)
          : formatIndianDateOnly(new Date().toISOString());

        const isApproved = chunkItems.every(it => {
          const st = (it.status || '').toLowerCase();
          return st === 'approved' || st === 'verified';
        });
        const approverName = chunkItems.find(it => it.approved_by_name)?.approved_by_name || (isApproved ? (currentUser?.name || 'Admin') : null);

        chunks.push({
          voucherNo: vNo,
          ticketId: chunkItems[0]?.ticket_id || null,
          date: latestDate,
          items: chunkItems,
          total: chunkTotal,
          isApproved,
          approverName
        });
      }
    });

    return chunks;
  }, [ledgerData.expenses, startingVoucherNo, printFilter, selectedVoucherKeys, currentUser]);

  // Pair vouchers 2 per page for flawless A4 print layout
  const voucherPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < voucherChunks.length; i += 2) {
      pages.push(voucherChunks.slice(i, i + 2));
    }
    return pages;
  }, [voucherChunks]);

  // Active technician details
  const currentTech = useMemo(() => {
    if (selectedTechId && selectedTechId !== 'all') {
      return loadedTechs.find(t => String(t.id) === String(selectedTechId)) || scopedTechProfile || {
        id: selectedTechId,
        name: 'Technician',
        phone: '',
        area_zone: 'General Zone'
      };
    }
    return {
      id: 'all',
      name: 'All Specialists (Consolidated)',
      phone: '',
      area_zone: 'Company Wide'
    };
  }, [loadedTechs, selectedTechId, scopedTechProfile]);

  const broadcastLedgerUpdate = () => {
    try {
      emitLedgerUpdate({ selectedTechId });
      window.dispatchEvent(new CustomEvent('tour-ledger-updated', { detail: { timestamp: Date.now() } }));
      localStorage.setItem('egs_live_ledger_sync', String(Date.now()));
    } catch (_) {}
  };

  const fetchLedger = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = {};
      if (selectedTechId && selectedTechId !== 'all') params.technician_id = selectedTechId;
      if (statementFromDate) params.from_date = statementFromDate;
      if (statementToDate) params.to_date = statementToDate;
      if (statementTicketId && statementTicketId !== 'all') params.ticket_id = statementTicketId;
      if (statementTxType && statementTxType !== 'all') params.tx_type = statementTxType;

      const res = await api.getTourLedger(params);
      if (res && (res.summary || res.statement)) {
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

    // Live sync polling: auto-refresh silently every 5s when document is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchLedger(true);
      }
    }, 5000);

    const handleSync = () => {
      fetchLedger(true);
    };

    const unsubscribe = subscribeLiveSync(['ledger', 'techs'], handleSync);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [selectedTechId, statementFromDate, statementToDate, statementTicketId, statementTxType]);

  // Handle Allocate Tour Advance
  const handleAllocateAdvance = async (e) => {
    e.preventDefault();
    const effectiveTechId = (!isAdminOrStaff && scopedTechProfile?.id) 
      ? scopedTechProfile.id 
      : (advanceForm.technician_id || (selectedTechId !== 'all' ? selectedTechId : null));
    if (!effectiveTechId) return showToast('Please select a specific technician before allocating advance', 'error');
    const amt = parseFloat(advanceForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid advance amount', 'error');

    const chosenTech = loadedTechs.find(t => String(t.id) === String(effectiveTechId)) || currentTech;

    // Check if adjusting recoverable balance
    let finalAmount = amt;
    let finalPurpose = advanceForm.purpose || 'Tour Advance';
    if (advanceAdjustBalance && existingRecoverable > 0) {
      finalAmount = Math.max(0, amt - existingRecoverable);
      finalPurpose = `${finalPurpose} [Adjusted ₹${existingRecoverable} from existing recoverable balance]`;
    }

    try {
      setSubmittingAdvance(true);
      await api.allocateTourAdvance({
        technician_id: effectiveTechId,
        technician_name: chosenTech.name || 'Technician',
        amount: finalAmount,
        purpose: finalPurpose,
        tour_title: finalPurpose,
        payment_mode: advanceForm.payment_mode,
        reference_no: advanceForm.reference_no,
        allocated_by_name: currentUser?.name || 'Admin Supervisor'
      });
      showToast(`₹${finalAmount} tour advance allocated to ${chosenTech.name}!`, 'success');
      setIsAdvanceModalOpen(false);
      setAdvanceAdjustBalance(false);
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to allocate advance: ' + err.message, 'error');
    } finally {
      setSubmittingAdvance(false);
    }
  };

  // Handle Add Tour Expense with Multi-item Rows (Single Voucher per Ticket/Tour)
  const handleAddExpense = async (e) => {
    e.preventDefault();
    const effectiveTechId = (!isAdminOrStaff && scopedTechProfile?.id) 
      ? scopedTechProfile.id 
      : (expenseForm.technician_id || (selectedTechId !== 'all' ? selectedTechId : null));
    if (!effectiveTechId) return showToast('Please select a specific technician before submitting voucher claim', 'error');

    const chosenTech = loadedTechs.find(t => String(t.id) === String(effectiveTechId)) || currentTech;

    const validItems = expenseForm.items.filter(it => (parseFloat(it.amount) || 0) > 0);
    if (validItems.length === 0) {
      return showToast('Please enter at least one valid expense amount', 'error');
    }

    try {
      setSubmittingExpense(true);

      // Check if this ticket already has an unapproved voucher for this technician
      let vNo = null;
      if (expenseForm.ticket_id) {
        const normTkt = String(expenseForm.ticket_id).trim().toLowerCase();
        const unapprovedVch = (ledgerData.expenses || []).find(e => 
          String(e.technician_id) === String(effectiveTechId) &&
          String(e.ticket_id || '').trim().toLowerCase() === normTkt &&
          (e.status || '').toLowerCase() !== 'approved' &&
          (e.status || '').toLowerCase() !== 'verified' &&
          e.voucher_no
        );
        if (unapprovedVch) {
          vNo = unapprovedVch.voucher_no;
        }
      }

      // Find complaint_id if ticket_id is selected
      let compId = null;
      if (expenseForm.ticket_id) {
        const found = (loadedComplaints || complaints).find(c => c.ticket_id === expenseForm.ticket_id || String(c.id) === String(expenseForm.ticket_id));
        if (found) compId = found.id;
      }

      // Shared receipts
      const previews = expenseForm.receipt_previews || [];
      const sharedReceiptUrl = previews.length > 1
        ? JSON.stringify(previews.map(r => r.url))
        : (previews[0]?.url || null);
      const sharedReceiptName = previews.map(r => r.name).join(', ') || null;

      const itemsPayload = validItems.map(it => {
        return {
          category: it.category || 'Other Expense',
          amount: parseFloat(it.amount),
          title: it.title || `${it.category || 'Tour'} Expense`,
          description: it.title || '',
          ticket_id: expenseForm.ticket_id || null,
          complaint_id: compId,
          expense_date: expenseForm.expense_date,
          receipt_url: sharedReceiptUrl,
          receipt_name: sharedReceiptName
        };
      });

      // If updating an existing unapproved voucher claim:
      if (editingVoucherNo) {
        await api.updateTourVoucher(editingVoucherNo, {
          technician_id: effectiveTechId,
          technician_name: chosenTech.name || 'Technician',
          expense_date: expenseForm.expense_date,
          ticket_id: expenseForm.ticket_id || null,
          complaint_id: compId,
          receipt_url: sharedReceiptUrl,
          receipt_name: sharedReceiptName,
          items: itemsPayload
        });

        showToast(`Voucher ${editingVoucherNo} updated successfully!`, 'success');
        setIsExpenseModalOpen(false);
        setEditingVoucherNo(null);
        await fetchLedger(true);
        broadcastLedgerUpdate();
        return;
      }

      const saveRes = await api.addTourExpense({
        technician_id: effectiveTechId,
        technician_name: chosenTech.name || 'Technician',
        voucher_no: vNo,
        expense_date: expenseForm.expense_date,
        ticket_id: expenseForm.ticket_id || null,
        complaint_id: compId,
        receipt_url: sharedReceiptUrl,
        receipt_name: sharedReceiptName,
        items: itemsPayload,
        // Fallback fields for legacy/single endpoints
        category: itemsPayload[0].category,
        amount: itemsPayload[0].amount,
        title: itemsPayload[0].title,
        description: itemsPayload[0].description
      });

      const assignedVch = saveRes?.voucher_no || vNo || 'allotted voucher';
      showToast(`Voucher ${assignedVch} for ${expenseForm.ticket_id || 'General Tour'} (${itemsPayload.length} items - ₹${expenseTotalSum}) saved successfully!`, 'success');
      setIsExpenseModalOpen(false);
      setEditingVoucherNo(null);
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to log expense: ' + err.message, 'error');
    } finally {
      setSubmittingExpense(false);
    }
  };


  // Handle Settle / Return Balance / Reimbursement
  const handleSettleBalance = async (e) => {
    e.preventDefault();
    const effectiveTechId = settleForm.technician_id 
      || (!isAdminOrStaff && scopedTechProfile?.id ? scopedTechProfile.id : (selectedTechId !== 'all' ? selectedTechId : null));
    if (!effectiveTechId) return showToast('Please select a specific technician first', 'error');
    const amt = parseFloat(settleForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid settlement amount', 'error');

    const chosenTech = loadedTechs.find(t => String(t.id) === String(effectiveTechId)) || currentTech;
    const techSummary = (ledgerData.technicians_summary || []).find(t => String(t.technician_id) === String(effectiveTechId));
    const effectiveNetBal = techSummary ? Number(techSummary.net_balance || 0) : Number(summary.net_balance || 0);
    const isReimbursement = effectiveNetBal < 0;

    try {
      setSubmittingSettle(true);
      await api.settleTourBalance({
        technician_id: effectiveTechId,
        technician_name: chosenTech?.name || 'Technician',
        amount: amt,
        returned_amount: isReimbursement ? 0 : amt,
        reimbursed_amount: isReimbursement ? amt : 0,
        settlement_type: isReimbursement ? 'reimbursed_by_company' : 'return_to_company',
        payment_mode: settleForm.payment_mode,
        reference_no: settleForm.reference_no,
        notes: settleForm.notes || (isReimbursement ? 'Reimbursement paid to specialist for out-of-pocket tour expenses' : 'Tour surplus cash returned to company'),
        received_by_name: currentUser?.name || 'Admin Supervisor'
      });

      showToast(isReimbursement 
        ? `₹${amt} reimbursement to ${chosenTech?.name || 'specialist'} recorded successfully!` 
        : `₹${amt} cash return from ${chosenTech?.name || 'specialist'} recorded successfully!`, 
        'success'
      );
      setIsSettleModalOpen(false);
      setSettleForm({
        technician_id: '',
        amount: '',
        settlement_type: 'return_to_company',
        payment_mode: 'Cash',
        reference_no: '',
        notes: ''
      });
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to record settlement: ' + err.message, 'error');
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Toggle Expense Status (Approved / Pending / Rejected)
  const handleUpdateStatus = async (expId, newStatus) => {
    try {
      const approverName = newStatus === 'approved' ? (currentUser?.name || currentUser?.username || 'Admin') : null;
      await api.updateTourExpenseStatus(expId, newStatus, '', approverName);
      showToast(`Expense marked as ${newStatus}`, 'info');
      await fetchLedger(true);
      broadcastLedgerUpdate();
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
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to delete expense: ' + err.message, 'error');
    }
  };

  // Approve all items in a voucher group
  const handleApproveVoucherGroup = async (group) => {
    try {
      const approverName = currentUser?.name || currentUser?.username || 'Admin';
      await Promise.all(group.items.map(it => api.updateTourExpenseStatus(it.id, 'approved', '', approverName)));
      showToast(`Voucher ${group.voucher_no} marked as approved by ${approverName}`, 'info');
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  // Revert / Unapprove all items in a voucher group to 'submitted' (unlock for editing)
  const handleRevertVoucherGroup = async (group) => {
    try {
      await Promise.all(group.items.map(it => api.updateTourExpenseStatus(it.id, 'submitted', '', null)));
      showToast(`Voucher ${group.voucher_no} reverted to Submitted (Unlocked for editing)`, 'info');
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to revert voucher: ' + err.message, 'error');
    }
  };

  // Delete all items in a voucher group
  const handleDeleteVoucherGroup = async (group) => {
    const itemCount = group.items.length;
    const ok = await confirm({
      title: 'Delete Tour Expense Voucher?',
      message: `Are you sure you want to delete Voucher ${group.voucher_no} (${itemCount} item${itemCount > 1 ? 's' : ''} - ₹${group.totalAmount.toLocaleString('en-IN')})?`,
      type: 'danger',
      confirmText: 'Delete Voucher',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await Promise.all(group.items.map(it => api.deleteTourExpense(it.id)));
      showToast(`Voucher ${group.voucher_no} deleted successfully`, 'success');
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Failed to delete voucher: ' + err.message, 'error');
    }
  };

  // Open custom in-app rejection modal for Voucher Group
  const handleRejectVoucherGroup = (group) => {
    setCancelModalState({
      isOpen: true,
      type: 'voucher',
      item: group,
      title: 'Reject Tour Expense Voucher',
      subtitle: `Voucher: ${group.voucher_no || 'VOUCHER'} • ${group.items?.length || 1} line item(s)`,
      amount: group.totalAmount || 0,
      referenceNo: group.voucher_no || 'VOUCHER',
      technicianName: group.technician_name || currentTech?.name || 'Specialist',
      purpose: group.items?.[0]?.description || group.items?.[0]?.category || 'Expense claim',
      dateFormatted: group.expense_date ? formatIndianDateOnly(group.expense_date) : 'Today',
      warningText: 'Rejecting this voucher will decline the claim and require the specialist to re-submit corrected expense receipts. The claimed amount will not be deducted from advances.',
      confirmText: 'Confirm & Reject Voucher',
      presetReasons: [
        'Receipt / Bill Unclear or Missing',
        'Non-Policy / Excessive Amount',
        'Duplicate Expense Claim',
        'Not Authorized for this Tour',
        'GST Invoice Required'
      ],
      reason: '',
      submitting: false
    });
  };

  // Open custom in-app cancellation modal for Advance (NO native Chrome prompt)
  const handleCancelAdvance = (adv) => {
    setCancelModalState({
      isOpen: true,
      type: 'advance',
      item: adv,
      title: 'Cancel Tour Advance',
      subtitle: `Disbursement: ${adv.reference_no || 'ADV'} • Allocated Cash`,
      amount: adv.amount || 0,
      referenceNo: adv.reference_no || 'ADV',
      technicianName: adv.technician_name || currentTech?.name || 'Specialist',
      purpose: adv.purpose || adv.tour_title || adv.notes || 'Tour Advance',
      dateFormatted: adv.allocated_at ? formatIndianDateTime(adv.allocated_at) : 'Today',
      warningText: "Cancelling this advance will reverse the allocated cash from the specialist's running tour balance. This record will be permanently archived with an audit trail.",
      confirmText: 'Confirm & Cancel Advance',
      presetReasons: [
        'Tour Cancelled by Office',
        'Wrong Amount Allocated',
        'Duplicate Advance Entry',
        'Allocated by Mistake',
        'Specialist Not Travelling',
        'Customer Rescheduled Visit'
      ],
      reason: '',
      submitting: false
    });
  };

  // Open custom in-app reversal modal for Settlement
  const handleReverseSettlement = (st) => {
    const isReturn = st.settlement_type === 'return_to_company' || st.settlement_type === 'return';
    setCancelModalState({
      isOpen: true,
      type: 'settlement',
      item: st,
      title: 'Reverse Settlement Transaction',
      subtitle: `Transaction: ${st.reference_no || 'SETTLEMENT'} • ${isReturn ? 'Cash Return' : 'Reimbursement'}`,
      amount: st.amount || 0,
      referenceNo: st.reference_no || 'SETTLEMENT',
      technicianName: st.technician_name || currentTech?.name || 'Specialist',
      purpose: isReturn ? 'Unused Cash Deposited back to Company' : 'Reimbursement Paid to Specialist',
      dateFormatted: st.created_at ? formatIndianDateTime(st.created_at) : 'Today',
      warningText: "Reversing this transaction will restore the specialist's tour ledger balance to the pre-settlement position with an audit trail.",
      confirmText: 'Confirm & Reverse Transaction',
      presetReasons: [
        'Entered Wrong Return Amount',
        'Duplicate Settlement Entry',
        'Incorrect Payment Mode',
        'Payment Not Received in Bank',
        'Entered Under Wrong Specialist'
      ],
      reason: '',
      submitting: false
    });
  };

  // Submit Handler for custom in-app cancellation modal
  const handleConfirmCancelModal = async (e) => {
    if (e) e.preventDefault();
    const trimmedReason = (cancelModalState.reason || '').trim();
    if (!trimmedReason) {
      return showToast('Please enter a cancellation reason for the audit trail', 'error');
    }

    try {
      setCancelModalState(prev => ({ ...prev, submitting: true }));
      const { type, item } = cancelModalState;

      if (type === 'advance') {
        await api.cancelTourAdvance(item.id, { reason: trimmedReason });
        showToast(`Advance ${item.reference_no || ''} cancelled successfully`, 'info');
      } else if (type === 'settlement') {
        await api.reverseTourSettlement(item.id, { reason: trimmedReason });
        showToast(`Transaction ${item.reference_no || ''} reversed successfully`, 'info');
      } else if (type === 'voucher') {
        const approverName = currentUser?.name || currentUser?.username || 'Admin';
        await api.updateTourVoucherStatus(item.voucher_no, {
          status: 'rejected',
          approved_by_name: approverName,
          rejection_reason: trimmedReason
        });
        showToast(`Voucher ${item.voucher_no} rejected`, 'info');
      }

      setCancelModalState(prev => ({ ...prev, isOpen: false, submitting: false }));
      await fetchLedger(true);
      broadcastLedgerUpdate();
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error');
      setCancelModalState(prev => ({ ...prev, submitting: false }));
    }
  };

  // Export Statement to CSV / Excel
  const handleExportStatementCSV = () => {
    const st = ledgerData.statement;
    if (!st || !st.transactions) return showToast('No statement data to export', 'error');

    const isTech = user?.role === 'technician' || st.perspective === 'technician';
    const titleRows = [
      [`"ECO GREEN SOLAR - ${st.perspective_title || (isTech ? 'MY ACCOUNT STATEMENT' : 'TECHNICIAN ACCOUNT STATEMENT')}"`],
      [`"Specialist: ${currentTech.name} | Phone: ${currentTech.phone || 'N/A'} | Zone: ${currentTech.area_zone || 'General Zone'}"`],
      [`"Statement Period: ${statementFromDate ? formatIndianDateOnly(statementFromDate) : 'Beginning'} to ${statementToDate ? formatIndianDateOnly(statementToDate) : 'Today'}"`],
      []
    ];

    const debitCol = st.columns?.debit_header || (isTech ? 'Debit (Expense / Return)' : 'Debit (Advance Given)');
    const creditCol = st.columns?.credit_header || (isTech ? 'Credit (Advance Received)' : 'Credit (Expense / Return)');

    const headers = ['Date', 'Time', 'Reference No', 'Complaint / Ticket', 'Transaction Type', 'Description', `"${debitCol}"`, `"${creditCol}"`, 'Running Balance', 'Account Position'];
    const rows = st.transactions.map(tx => [
      tx.date ? formatIndianDateOnly(tx.date) : '',
      tx.time_formatted || '',
      tx.reference_no || '',
      tx.ticket_id || '-',
      tx.type_label || tx.particulars || tx.tx_type || '',
      `"${(tx.particulars || tx.description || '').replace(/"/g, '""')}"`,
      tx.debit > 0 ? tx.debit.toFixed(2) : '0.00',
      tx.credit > 0 ? tx.credit.toFixed(2) : '0.00',
      tx.running_balance.toFixed(2),
      `"${tx.balance_label || ''}"`
    ]);

    const summaryRows = [
      [],
      ['FINANCIAL SUMMARY'],
      ['Opening Balance', '', '', '', '', '', '', (st.opening_balance || 0).toFixed(2), `"${st.opening_balance_formatted || ''}"`],
      [isTech ? 'Total Advances Received (Credit)' : 'Total Advances Given (Debit)', '', '', '', '', '', '', (st.total_advances || 0).toFixed(2), ''],
      [isTech ? 'Total Approved Expenses (Debit)' : 'Total Approved Expenses (Credit)', '', '', '', '', '', '', (st.total_approved_expenses || 0).toFixed(2), ''],
      [isTech ? 'Total Returned to Company (Debit)' : 'Total Returned by Technician (Credit)', '', '', '', '', '', '', (st.total_returns || 0).toFixed(2), ''],
      [isTech ? 'Total Reimbursements Received (Credit)' : 'Total Reimbursements Paid (Debit)', '', '', '', '', '', '', (st.total_reimbursements || 0).toFixed(2), ''],
      ['Closing Balance', '', '', '', '', '', '', (st.closing_balance || 0).toFixed(2), `"${st.closing_balance_formatted || ''}"`],
      ['Final Status', '', '', '', '', '', '', `"${st.status_label || st.position_label || ''}"`, '']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\ufeff' + 
      [...titleRows.map(r => r.join(',')), headers.join(','), ...rows.map(r => r.join(',')), ...summaryRows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const techName = (currentTech.name || 'Technician').replace(/\s+/g, '_');
    link.setAttribute('download', `Statement_${isTech ? 'MyAccount' : 'Technician'}_${techName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Account statement exported to CSV / Excel!', 'success');
  };

  // Export Consolidated All Technicians Report to CSV / Excel
  const handleExportConsolidatedCSV = () => {
    const list = ledgerData.technicians_summary || [];
    if (list.length === 0) return showToast('No technician summary data available', 'error');

    const headers = ['Technician Name', 'Phone', 'Zone', 'Total Advances', 'Approved Expenses', 'Total Returned', 'Reimbursements Paid', 'Recoverable from Tech', 'Payable to Tech', 'Net Status'];
    const rows = list.map(t => [
      `"${t.name || ''}"`,
      t.phone || '',
      `"${t.area_zone || ''}"`,
      Number(t.total_advance || 0).toFixed(2),
      Number(t.approved_expenses || 0).toFixed(2),
      Number(t.total_returned || 0).toFixed(2),
      Number(t.total_reimbursed || 0).toFixed(2),
      Number(t.recoverable_from_tech || 0).toFixed(2),
      Number(t.payable_to_tech || 0).toFixed(2),
      `"${t.status_label || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\ufeff' + 
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Technician_Accounts_Consolidated_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Consolidated technician report exported to CSV / Excel!', 'success');
  };
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
      // Build 9 rows (total 11 rows: 1 header + 9 entries + 1 total)
      let rowsHtml = '';
      const items = chunk.items || [];
      for (let r = 0; r < 9; r++) {
        const item = items[r];
        if (item) {
          const descStr = item.description ? ` (${item.description})` : '';
          const titleStr = (item.title && item.title.toLowerCase() !== (item.category || '').toLowerCase()) ? ` - ${item.title}` : '';
          const detail = `${item.category}${titleStr}${descStr}`;
          rowsHtml += `
            <tr style="height: 22px;">
              <td style="padding: 2px 6px; border-right: 1.5px solid #000; font-size: 8.5pt; vertical-align: middle;">${detail}</td>
              <td style="padding: 2px 6px; text-align: right; font-size: 8.5pt; vertical-align: middle; font-weight: bold;">₹${Number(item.amount || 0).toFixed(2)}</td>
            </tr>
          `;
        } else {
          rowsHtml += `
            <tr style="height: 22px;">
              <td style="padding: 2px 6px; border-right: 1.5px solid #000; font-size: 8.5pt;">&nbsp;</td>
              <td style="padding: 2px 6px; text-align: right; font-size: 8.5pt;">&nbsp;</td>
            </tr>
          `;
        }
      }

      vouchersHtml += `
        <div style="border: 1.5px solid #000; padding: 8px 12px; margin-bottom: 12px; box-sizing: border-box; background: #fff; page-break-inside: avoid; height: 134mm; max-height: 135mm;">
          <!-- Header: Green Energy Logo + Address + Voucher No & Date -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #cbd5e1;">
            <tr>
              <td style="width: 28%; vertical-align: middle;">
                <img src="${GREEN_ENERGY_LOGO_BASE64}" alt="Green ENERGY" style="height: 48px; width: auto; max-width: 150px; object-fit: contain; vertical-align: middle;" />
              </td>
              <td style="width: 44%; vertical-align: middle; font-size: 8pt; color: #1e293b; line-height: 1.3; border-left: 1.5px solid #cbd5e1; padding-left: 8px;">
                <b>Plot No. 4, Gajanand Industrial, Near RK Exotica,</b><br/>
                Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021
              </td>
              <td style="width: 28%; vertical-align: middle; text-align: right; font-size: 8.5pt; line-height: 1.3;">
                <b>Voucher No :</b> <span style="color: #0f766e; font-weight: bold;">${chunk.voucherNo}</span><br/>
                <b>Date :</b> ${chunk.date}
              </td>
            </tr>
          </table>

          <!-- Name & Account with Ticket No on Right -->
          <div style="font-size: 8.5pt; margin: 4px 0 2px 0;">
            <b>Name :</b> ${techName}
          </div>
          <div style="border-bottom: 1px dashed #94a3b8; margin: 4px 0 6px 0;"></div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8.5pt;">
            <tr>
              <td style="width: 60%; vertical-align: middle;">
                <b>Account :</b> TECHNICIAN TOUR EXPENSES
              </td>
              <td style="width: 40%; vertical-align: middle; text-align: right;">
                <b>Ticket No :</b> <span style="color: #1e3a8a; font-weight: bold;">${chunk.ticketId || 'General Tour'}</span>
              </td>
            </tr>
          </table>

          <!-- Particulars & Amount Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 6px;">
            <thead>
              <tr style="border-bottom: 1.5px solid #000; background: #f8fafc;">
                <th style="padding: 3px 8px; border-right: 1.5px solid #000; text-align: center; font-size: 8.5pt; width: 75%; text-transform: uppercase;">Particulars</th>
                <th style="padding: 3px 8px; text-align: center; font-size: 8.5pt; width: 25%; text-transform: uppercase;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="border-top: 1.5px solid #000; font-weight: bold; background: #f8fafc; height: 24px;">
                <td style="padding: 3px 8px; border-right: 1.5px solid #000; text-align: right; font-size: 8.5pt; text-transform: uppercase;">Total:</td>
                <td style="padding: 3px 8px; text-align: right; font-size: 9pt; color: #0f766e; font-weight: bold;">₹${Number(chunk.total || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Amount in Word -->
          <div style="font-size: 8.5pt; margin: 4px 0 8px 0;">
            <b>Amount in Word :</b> <span style="font-weight: bold; font-style: italic; border-bottom: 1.5px dashed #64748b; padding-bottom: 1px;">${numberToIndianWords(chunk.total)}</span>
          </div>

          <!-- 4 Signatures -->
          <table style="width: 100%; margin-top: 18px; border-collapse: separate; border-spacing: 12px 0;">
            <tr>
              <td style="width: 25%; height: 26px; vertical-align: bottom; text-align: center; padding-bottom: 3px;"></td>
              <td style="width: 25%; height: 26px; vertical-align: bottom; text-align: center; padding-bottom: 3px;">
                ${chunk.isApproved ? `
                  <div style="font-weight: bold; font-size: 7.5pt; color: #0f766e; text-transform: uppercase; line-height: 1.1;">APPROVED BY</div>
                  <div style="font-weight: bold; font-size: 7pt; color: #1e293b; line-height: 1.1; margin-top: 1px;">(${chunk.approverName || 'Admin Supervisor'})</div>
                ` : `
                  <div style="font-weight: bold; font-size: 8pt; color: #dc2626; text-transform: uppercase; line-height: 1.1; letter-spacing: 0.5px;">UNAPPROVED</div>
                `}
              </td>
              <td style="width: 25%; height: 26px; vertical-align: bottom; text-align: center; padding-bottom: 3px;"></td>
              <td style="width: 25%; height: 26px; vertical-align: bottom; text-align: center; padding-bottom: 3px;"></td>
            </tr>
            <tr>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 2px solid #0f172a; padding-top: 3px; vertical-align: top; font-weight: 600; color: #1e293b;">Authorized Signature</td>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 2px solid #0f172a; padding-top: 3px; vertical-align: top; font-weight: 600; color: #1e293b;">Checked by</td>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 2px solid #0f172a; padding-top: 3px; vertical-align: top; font-weight: 600; color: #1e293b;">Paid by</td>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 2px solid #0f172a; padding-top: 3px; vertical-align: top; font-weight: 600; color: #1e293b;">Receiver's Signature</td>
            </tr>
          </table>
        </div>
      `;

      // Page break after every 2 vouchers (2 per page)
      if ((cIdx + 1) % 2 === 0 && (cIdx + 1) < voucherChunks.length) {
        vouchersHtml += `<div style="page-break-after: always; height: 1px; mso-special-character: line-break;"></div>`;
      }
    });

    const wordContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Voucher Book - PRINT - 26-27</title>
        <style>
          @page { size: A4 portrait; margin: 8mm 10mm; }
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 9pt; color: #1e293b; margin: 0; padding: 0; }
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

  const advances = ledgerData.advances || [];
  const expenses = ledgerData.expenses || [];
  const settlements = ledgerData.settlements || [];

  // Group individual expense items into 1 row per voucher with accordion expand/collapse
  const [expandedVouchers, setExpandedVouchers] = useState(new Set());

  const toggleVoucherExpanded = (vKey) => {
    setExpandedVouchers(prev => {
      const next = new Set(prev);
      if (next.has(vKey)) next.delete(vKey);
      else next.add(vKey);
      return next;
    });
  };

  const voucherLogs = useMemo(() => {
    const map = new Map();

    expenses.forEach(exp => {
      const vKey = exp.voucher_no 
        ? `vch_${exp.voucher_no}` 
        : (exp.ticket_id ? `tkt_${exp.ticket_id}_${exp.expense_date}` : `item_${exp.id}`);

      if (!map.has(vKey)) {
        map.set(vKey, {
          key: vKey,
          voucher_no: exp.voucher_no || 'VCH-NEW',
          ticket_id: exp.ticket_id || null,
          expense_date: exp.expense_date,
          status: exp.status || 'Submitted',
          receipt_url: exp.receipt_url,
          receipt_name: exp.receipt_name,
          items: [],
          totalAmount: 0
        });
      }

      const grp = map.get(vKey);
      grp.items.push(exp);
      grp.totalAmount += (parseFloat(exp.amount) || 0);

      if (!grp.receipt_url && exp.receipt_url) {
        grp.receipt_url = exp.receipt_url;
        grp.receipt_name = exp.receipt_name;
      }
      if (!grp.approved_by_name && exp.approved_by_name) {
        grp.approved_by_name = exp.approved_by_name;
      }
      if (exp.status === 'Submitted' || exp.status === 'Pending') {
        grp.status = exp.status;
      }
    });

    return Array.from(map.values());
  }, [expenses]);

  const computedTotalAdvance = useMemo(() => advances.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0), [advances]);
  // Strictly count only vouchers approved by admin/staff (not submitted or pending)
  const computedApprovedExpenses = useMemo(() => expenses.filter(e => (e.status || '').toLowerCase() === 'approved').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [expenses]);
  const computedTotalReturned = useMemo(() => settlements.filter(s => s.settlement_type === 'return_to_company').reduce((s, s1) => s + (parseFloat(s1.returned_amount || s1.amount) || 0), 0), [settlements]);
  const computedTotalReimbursed = useMemo(() => settlements.filter(s => s.settlement_type === 'reimbursed_by_company').reduce((s, s1) => s + (parseFloat(s1.reimbursed_amount || s1.amount) || 0), 0), [settlements]);
  const computedNetBalance = useMemo(() => (computedTotalAdvance + computedTotalReimbursed) - (computedApprovedExpenses + computedTotalReturned), [computedTotalAdvance, computedTotalReimbursed, computedApprovedExpenses, computedTotalReturned]);

  const summary = useMemo(() => {
    const rawAdv = ledgerData.summary?.total_advance ?? ledgerData.summary?.totalAdvance;
    const rawExp = ledgerData.summary?.approved_expenses;
    const rawRet = ledgerData.summary?.total_returned ?? ledgerData.summary?.totalReturned;
    const rawReimb = ledgerData.summary?.total_reimbursed ?? ledgerData.summary?.totalReimbursed;
    const rawBal = ledgerData.summary?.net_balance ?? ledgerData.summary?.currentBalance;

    return {
      total_advance: (rawAdv !== undefined && rawAdv !== null && Number(rawAdv) > 0) ? Number(rawAdv) : computedTotalAdvance,
      approved_expenses: (rawExp !== undefined && rawExp !== null && Number(rawExp) >= 0) ? Number(rawExp) : computedApprovedExpenses,
      total_returned: (rawRet !== undefined && rawRet !== null && Number(rawRet) > 0) ? Number(rawRet) : computedTotalReturned,
      total_reimbursed: (rawReimb !== undefined && rawReimb !== null && Number(rawReimb) > 0) ? Number(rawReimb) : computedTotalReimbursed,
      net_balance: (rawBal !== undefined && rawBal !== null && (rawAdv || rawExp || rawRet)) ? Number(rawBal) : computedNetBalance
    };
  }, [ledgerData.summary, computedTotalAdvance, computedApprovedExpenses, computedTotalReturned, computedTotalReimbursed, computedNetBalance]);

  const selectedTechSummary = useMemo(() => {
    const techId = advanceForm.technician_id || (selectedTechId !== 'all' ? selectedTechId : null);
    if (!techId) return null;
    return (ledgerData.technicians_summary || []).find(t => String(t.technician_id) === String(techId));
  }, [advanceForm.technician_id, selectedTechId, ledgerData.technicians_summary]);

  const existingRecoverable = useMemo(() => {
    if (selectedTechSummary) return Number(selectedTechSummary.recoverable_from_tech || 0);
    if (selectedTechId !== 'all' && (summary.net_balance || 0) > 0) return Number(summary.net_balance);
    return 0;
  }, [selectedTechSummary, selectedTechId, summary.net_balance]);

  const advancesSummaryInfo = useMemo(() => {
    const advAmt = advances.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
    const reimList = settlements.filter(s => parseFloat(s.reimbursed_amount || 0) > 0 && (s.status || '').toLowerCase() !== 'cancelled');
    const reimAmt = reimList.reduce((sum, s) => sum + parseFloat(s.reimbursed_amount || 0), 0);
    return {
      advAmt,
      reimAmt,
      reimCount: reimList.length,
      totalCashDisbursed: advAmt + reimAmt
    };
  }, [advances, settlements]);

  const displayedDisbursements = useMemo(() => {
    const advList = advances.map(a => ({
      ...a,
      is_reimbursement: false,
      disbursement_type: 'Tour Advance'
    }));

    if (!showAllDisbursements) return advList;

    const reimList = settlements
      .filter(s => parseFloat(s.reimbursed_amount || 0) > 0 && (s.status || '').toLowerCase() !== 'cancelled')
      .map(s => ({
        id: `reim_${s.id}`,
        allocated_at: s.settled_at || s.created_at,
        technician_name: s.technician_name || currentTech.name,
        technician_phone: s.technician_phone || currentTech.phone,
        purpose: s.notes || 'Out-of-Pocket Expense Reimbursement Paid to Specialist',
        payment_mode: s.payment_mode || 'Cash',
        reference_no: s.reference_no || `REIM-${s.id}`,
        allocated_by: s.settled_by || 'Admin',
        amount: s.reimbursed_amount,
        status: s.status || 'Settled',
        is_reimbursement: true,
        disbursement_type: 'Reimbursement Payout'
      }));

    return [...advList, ...reimList].sort((a, b) => new Date(b.allocated_at || 0) - new Date(a.allocated_at || 0));
  }, [advances, settlements, showAllDisbursements, currentTech]);

  const openSettleModal = (targetTechId = null) => {
    let effectiveTechId = targetTechId;
    if (!effectiveTechId && selectedTechId !== 'all') {
      effectiveTechId = selectedTechId;
    }
    // If on consolidated view and no tech passed, find the first tech with an active balance (e.g. Hardev Vaghela)
    if (!effectiveTechId && isAdminOrStaff) {
      const pendingTech = (ledgerData.technicians_summary || []).find(t => (t.payable_amount || t.payable_to_tech) > 0 || (t.recoverable_amount || t.recoverable_from_tech) > 0);
      if (pendingTech) {
        effectiveTechId = String(pendingTech.technician_id);
      } else if (loadedTechs.length > 0) {
        effectiveTechId = String(loadedTechs[0].id);
      }
    }
    if (!effectiveTechId && scopedTechProfile?.id) {
      effectiveTechId = scopedTechProfile.id;
    }

    const techSummary = (ledgerData.technicians_summary || []).find(t => String(t.technician_id) === String(effectiveTechId));
    const bal = techSummary ? Number(techSummary.net_balance ?? 0) : Number(summary.net_balance ?? 0);
    const isReimbursement = bal < 0;
    const absBal = Math.abs(bal);

    setSettleForm({
      technician_id: effectiveTechId ? String(effectiveTechId) : '',
      amount: absBal > 0 ? String(absBal) : '',
      settlement_type: isReimbursement ? 'reimbursed_by_company' : 'return_to_company',
      payment_mode: isReimbursement ? 'UPI / Bank Transfer' : 'Cash',
      reference_no: '',
      notes: isReimbursement 
        ? 'Reimbursement payout for out-of-pocket tour expenses' 
        : 'Tour surplus cash returned to company'
    });
    setIsSettleModalOpen(true);
  };

  const handleSettleTechChange = (techId) => {
    const techSummary = (ledgerData.technicians_summary || []).find(t => String(t.technician_id) === String(techId));
    const bal = techSummary ? Number(techSummary.net_balance ?? 0) : 0;
    const isReimbursement = bal < 0;
    const absBal = Math.abs(bal);

    setSettleForm(prev => ({
      ...prev,
      technician_id: techId,
      amount: absBal > 0 ? String(absBal) : '',
      settlement_type: isReimbursement ? 'reimbursed_by_company' : 'return_to_company',
      payment_mode: isReimbursement ? 'UPI / Bank Transfer' : 'Cash',
      notes: isReimbursement 
        ? 'Reimbursement payout for out-of-pocket tour expenses' 
        : 'Tour surplus cash returned to company'
    }));
  };

  const toggleSelectVoucher = (key) => {
    setSelectedVoucherKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllVouchers = () => {
    if (selectedVoucherKeys.size === voucherLogs.length) {
      setSelectedVoucherKeys(new Set());
    } else {
      setSelectedVoucherKeys(new Set(voucherLogs.map(v => v.key)));
    }
  };

  const handlePrintSingleVoucher = (grp) => {
    setSelectedVoucherKeys(new Set([grp.key]));
    setPrintFilter('selected');
    setIsVoucherModalOpen(true);
  };

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
                  onChange={(e) => handleTechChange(e.target.value)}
                  className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  {loadedTechs.map((t) => (
                    <option key={t.id} value={t.id}>
                      👤 {t.name} ({t.area_zone || 'Field'})
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
              onClick={() => {
                openVoucherModal(selectedVoucherKeys.size > 0 ? 'selected' : 'all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                selectedVoucherKeys.size > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {selectedVoucherKeys.size > 0 
                  ? `Print Selected (${selectedVoucherKeys.size})` 
                  : 'Print / Export Voucher (.doc)'}
              </span>
            </button>
          </div>
        </div>

        {/* Loading State with Bouncing Dots or 4 Financial Stat Cards */}
        {loading ? (
          <div className="py-8 px-4 text-center mt-3 bg-slate-50/60 rounded-xl border border-slate-100">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-700 animate-bounce"></div>
            </div>
            <p className="text-xs font-bold text-slate-700">Loading Tour Ledger & Vouchers...</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Fetching advances, expense claims, bills and live balances</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 max-w-4xl mx-auto">
              {[1, 2, 3, 4].map(idx => (
                <div key={idx} className="h-20 bg-slate-100/80 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
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
                  : (summary.net_balance < 0 ? 'bg-blue-50/90 border-blue-300 ring-1 ring-blue-200' : 'bg-slate-50 border-slate-200')
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase font-bold block ${
                    (summary.net_balance || 0) > 0 
                      ? 'text-amber-900 font-black' 
                      : (summary.net_balance < 0 ? 'text-blue-900 font-black' : 'text-slate-600')
                  }`}>
                    {(summary.net_balance || 0) < 0 ? 'Reimbursement Due' : 'Remaining Balance In Hand'}
                  </span>
                  {(summary.net_balance || 0) > 0 ? (
                    <span className="text-[9px] bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded-full">
                      To Return
                    </span>
                  ) : ((summary.net_balance || 0) < 0 ? (
                    <span className="text-[9px] bg-blue-200 text-blue-950 font-bold px-1.5 py-0.5 rounded-full">
                      Company Pays
                    </span>
                  ) : null)}
                </div>
                <strong className={`text-xl font-black font-mono block mt-1 ${
                  (summary.net_balance || 0) > 0 
                    ? 'text-amber-950' 
                    : ((summary.net_balance || 0) < 0 ? 'text-blue-950' : 'text-slate-800')
                }`}>
                  {formatCur(Math.abs(summary.net_balance || 0))}
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
                  onClick={openAdvanceModal}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Allocate Tour Advance</span>
                </button>
              )}

              <button
                type="button"
                onClick={openExpenseModal}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tour Expense / Voucher</span>
              </button>

              {isAdminOrStaff && (
                <button
                  type="button"
                  onClick={openSettleModal}
                  className={`px-3.5 py-2 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                    summary.net_balance < 0
                      ? 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-300'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>
                    {summary.net_balance < 0
                      ? `Reimburse Specialist (${formatCur(Math.abs(summary.net_balance))})`
                      : (summary.net_balance > 0 
                          ? `Deposit / Return Balance (${formatCur(summary.net_balance)})`
                          : 'Deposit / Return Balance to Company')}
                  </span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Main Ledger Sub-Tabs & Tables */}
      <div className="bg-white rounded-2xl border-2 border-slate-300/80 shadow-xs overflow-hidden">
        {/* Sub-tab Navigation: Distinct Separated Card Buttons with Borders and Badges */}
        <div className="p-3 sm:p-3.5 bg-slate-200/80 border-b border-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Tour Advances */}
            <button
              type="button"
              onClick={() => handleSubTabSwitch('advances')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer border ${
                subTab === 'advances'
                  ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/25'
                  : 'bg-white text-slate-700 hover:text-emerald-800 hover:bg-emerald-50/70 border-slate-300 hover:border-emerald-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <ArrowDownLeft className={`w-4 h-4 shrink-0 ${subTab === 'advances' ? 'text-emerald-200' : 'text-slate-600'}`} />
                <span className="truncate">Tour Advances</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                subTab === 'advances' ? 'bg-emerald-950/70 text-white border border-emerald-700/50' : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {advances.length}
              </span>
            </button>

            {/* 2. Expense Vouchers */}
            <button
              type="button"
              onClick={() => handleSubTabSwitch('expenses')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer border ${
                subTab === 'expenses'
                  ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/25'
                  : 'bg-white text-slate-700 hover:text-emerald-800 hover:bg-emerald-50/70 border-slate-300 hover:border-emerald-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Tag className={`w-4 h-4 shrink-0 ${subTab === 'expenses' ? 'text-emerald-200' : 'text-slate-600'}`} />
                <span className="truncate">Expense Vouchers</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                subTab === 'expenses' ? 'bg-emerald-950/70 text-white border border-emerald-700/50' : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {voucherLogs.length}
              </span>
            </button>

            {/* 3. Account Statement & Ledger */}
            <button
              type="button"
              onClick={() => handleSubTabSwitch('statement')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer border ${
                subTab === 'statement'
                  ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/25'
                  : 'bg-white text-slate-700 hover:text-emerald-800 hover:bg-emerald-50/70 border-slate-300 hover:border-emerald-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileText className={`w-4 h-4 shrink-0 ${subTab === 'statement' ? 'text-emerald-200' : 'text-slate-600'}`} />
                <span className="truncate">Account Ledger</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                subTab === 'statement' ? 'bg-emerald-950/70 text-white border border-emerald-700/50' : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                Statement
              </span>
            </button>
          </div>
        </div>

        {/* ================= 1. EXPENSES TAB ================= */}
        {subTab === 'expenses' && (
          <div className="p-4 sm:p-5">
            {voucherLogs.length === 0 ? (
              <div className="text-center py-12 px-4">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-700">No Tour Expenses Logged Yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Log travel, fuel, food, auto, or spare part expenses along with photos of receipts to claim against the tour advance.
                </p>
                <button
                  type="button"
                  onClick={openExpenseModal}
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
                      <th className="py-2.5 px-3 w-8 text-center" title="Select All for Print">
                        <input
                          type="checkbox"
                          checked={voucherLogs.length > 0 && selectedVoucherKeys.size === voucherLogs.length}
                          onChange={toggleSelectAllVouchers}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-3">Voucher #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Ticket / Purpose</th>
                      <th className="py-2.5 px-3">Categories</th>
                      <th className="py-2.5 px-3">Receipt / Bill</th>
                      <th className="py-2.5 px-3 text-right">Total Amount</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {voucherLogs.map((grp) => {
                      const isExpanded = expandedVouchers.has(grp.key);
                      const uniqueCats = Array.from(new Set(grp.items.map(it => it.category).filter(Boolean)));
                      let receiptUrls = [];
                      if (grp.receipt_url) {
                        try {
                          if (typeof grp.receipt_url === 'string' && grp.receipt_url.startsWith('[')) {
                            receiptUrls = JSON.parse(grp.receipt_url);
                          } else {
                            receiptUrls = [grp.receipt_url];
                          }
                        } catch (_) {
                          receiptUrls = [grp.receipt_url];
                        }
                      }

                      return (
                        <React.Fragment key={grp.key}>
                          <tr
                            onClick={() => toggleVoucherExpanded(grp.key)}
                            className={`cursor-pointer transition-colors ${
                              isExpanded ? 'bg-emerald-50/50 hover:bg-emerald-50/80 font-medium' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedVoucherKeys.has(grp.key)}
                                onChange={() => toggleSelectVoucher(grp.key)}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                title="Select this voucher for printing/export"
                              />
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  className="p-1 rounded-md hover:bg-slate-200/70 text-slate-500 transition-colors cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleVoucherExpanded(grp.key);
                                  }}
                                  title={isExpanded ? 'Collapse items' : 'Expand items'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-emerald-700" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                  )}
                                </button>
                                <div>
                                  <span className="font-mono font-black text-emerald-800 text-xs">
                                    {grp.voucher_no}
                                  </span>
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    {grp.items.length} {grp.items.length === 1 ? 'item' : 'items'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-xs">
                              {grp.expense_date ? formatIndianDateOnly(grp.expense_date) : '-'}
                            </td>

                            <td className="py-2.5 px-3 max-w-xs">
                              {grp.ticket_id ? (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                                  <Ticket className="w-3 h-3 text-blue-600" />
                                  {grp.ticket_id}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">General Tour</span>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {uniqueCats.slice(0, 2).map((cat, idx) => (
                                  <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 truncate">
                                    {cat}
                                  </span>
                                ))}
                                {uniqueCats.length > 2 && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 text-slate-600">
                                    +{uniqueCats.length - 2} more
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                              {receiptUrls.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setReceiptLightbox({
                                    urls: receiptUrls,
                                    url: receiptUrls[0],
                                    index: 0,
                                    name: grp.receipt_name || `${grp.voucher_no} Bill Proofs`
                                  })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-200 transition-colors cursor-pointer shadow-2xs"
                                >
                                  <ImageIcon className="w-3 h-3 text-emerald-600" />
                                  <span>View Bill{receiptUrls.length > 1 ? ` (${receiptUrls.length})` : ''}</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Self-Voucher</span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 text-sm">
                              {formatCur(grp.totalAmount)}
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                (grp.status || '').toLowerCase() === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                (grp.status || '').toLowerCase() === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}>
                                {grp.status || 'Submitted'}
                              </span>
                            </td>

                            <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {/* Quick Print Single Voucher */}
                                <button
                                  type="button"
                                  onClick={() => handlePrintSingleVoucher(grp)}
                                  className="p-1.5 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors cursor-pointer"
                                  title="Print / Preview this Voucher slip"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                {(grp.status || '').toLowerCase() === 'approved' ? (
                                  <>
                                    <span 
                                      className="p-1.5 text-emerald-600/70 cursor-not-allowed" 
                                      title="Approved voucher is locked"
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </span>
                                    {isAdminOrStaff && (
                                      <button
                                        type="button"
                                        onClick={() => handleRevertVoucherGroup(grp)}
                                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                                        title="Revert / Unapprove Voucher (Unlock for editing)"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEditExpenseModal(grp)}
                                      className="p-1.5 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer"
                                      title="Edit Voucher Claim (Before Approval)"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    {isAdminOrStaff && (
                                      <button
                                        type="button"
                                        onClick={() => handleApproveVoucherGroup(grp)}
                                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                                        title="Approve all items in voucher"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteVoucherGroup(grp)}
                                  className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Voucher"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Item Breakdown Sub-Row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <td colSpan={9} className="p-3 pl-8 sm:pl-10">
                                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-700">
                                      Itemized Entries for Voucher {grp.voucher_no} ({grp.items.length} items)
                                    </span>
                                    <span className="text-[11px] font-mono font-bold text-emerald-700">
                                      Total: {formatCur(grp.totalAmount)}
                                    </span>
                                  </div>
                                  <div className="divide-y divide-slate-100 text-xs">
                                    {grp.items.map((item, itIdx) => (
                                      <div key={item.id || itIdx} className="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-slate-50/50">
                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                          <span className="w-5 text-[10px] font-bold text-slate-400 font-mono">
                                            #{itIdx + 1}
                                          </span>
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                            {item.category}
                                          </span>
                                          <span className="text-slate-800 text-xs font-medium truncate" title={item.description || item.title}>
                                            {item.description || item.title || 'Tour expense'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="font-mono font-bold text-slate-900 text-xs">
                                            {formatCur(item.amount)}
                                          </span>
                                          {isAdminOrStaff && item.status === 'approved' && (
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateStatus(item.id, 'submitted')}
                                              className="p-1 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded transition-colors cursor-pointer"
                                              title="Unapprove this line item"
                                            >
                                              <RotateCcw className="w-3 h-3" />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteExpense(item)}
                                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                            title="Delete this line item"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= 2. ADVANCES TAB ================= */}
        {subTab === 'advances' && (
          <div className="p-4 sm:p-5">
            {/* Disbursements Overview Card if Reimbursements Exist */}
            {advancesSummaryInfo.reimCount > 0 && (
              <div className="mb-3.5 p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <div className="flex items-start sm:items-center gap-2">
                  <span className="text-base shrink-0">ℹ️</span>
                  <div>
                    <span className="font-bold text-blue-950 block">
                      Total Cash Given to Specialist: {formatCur(advancesSummaryInfo.totalCashDisbursed)}
                    </span>
                    <span className="text-[11px] text-blue-800">
                      Advances Allocated: <strong className="text-blue-950 font-mono">{formatCur(advancesSummaryInfo.advAmt)}</strong> ({advances.length} record) + Out-of-Pocket Reimbursements: <strong className="text-blue-950 font-mono">{formatCur(advancesSummaryInfo.reimAmt)}</strong> ({advancesSummaryInfo.reimCount} record in Deposits & Reimbursements)
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 font-bold text-blue-900 cursor-pointer self-start sm:self-auto bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs text-[11px]">
                  <input
                    type="checkbox"
                    checked={showAllDisbursements}
                    onChange={(e) => setShowAllDisbursements(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Show All Cash Disbursed ({advances.length + advancesSummaryInfo.reimCount})</span>
                </label>
              </div>
            )}

            {displayedDisbursements.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400">
                <ArrowDownLeft className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">No tour advances have been recorded yet for this specialist.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Specialist (Recipient)</th>
                      <th className="py-2.5 px-3">Disbursement Type</th>
                      <th className="py-2.5 px-3">Purpose / Remarks</th>
                      <th className="py-2.5 px-3">Payment Mode</th>
                      <th className="py-2.5 px-3">Ref No</th>
                      <th className="py-2.5 px-3">Allocated By</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-center">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedDisbursements.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          {adv.allocated_at ? formatIndianDateTime(adv.allocated_at) : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-800 block">
                            {adv.technician_name || 'Assigned Specialist'}
                          </span>
                          {adv.technician_phone && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {adv.technician_phone}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            adv.is_reimbursement ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {adv.disbursement_type || 'Tour Advance'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium max-w-xs truncate" title={adv.purpose || adv.tour_title || adv.notes}>
                          {adv.purpose || adv.tour_title || adv.notes || 'Tour Advance'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                            {adv.payment_mode || 'Cash'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {adv.reference_no || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">
                          {adv.allocated_by || adv.allocated_by_name || 'Admin'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900 text-sm whitespace-nowrap">
                          {formatCur(adv.amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {adv.is_reimbursement ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                              Disbursed
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {adv.status === 'Cancelled' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500 font-bold border border-slate-200 mr-1" title={adv.cancellation_reason || 'Cancelled'}>
                                  Cancelled
                                </span>
                              )}
                              {isAdminOrStaff && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditAdvance(adv)}
                                    className="p-1.5 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer"
                                    title="Edit Tour Advance details (Amount, Purpose, Date, etc.)"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  {adv.status !== 'Cancelled' && (
                                    <button
                                      type="button"
                                      onClick={() => handleCancelAdvance(adv)}
                                      className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                                      title="Cancel advance with audit trail reason"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAdvance(adv)}
                                    className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                    title="Delete Tour Advance completely"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}



        {/* ================= 4. STATEMENT & LEDGER TAB ================= */}
        {subTab === 'statement' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Filter Bar & Controls */}
            <div className="bg-slate-50/80 p-3 sm:p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Period Presets:</span>
                  </span>
                  {[
                    { key: 'current_month', label: 'Current Month' },
                    { key: 'previous_month', label: 'Previous Month' },
                    { key: 'current_fy', label: 'Current Financial Year' },
                    { key: 'previous_fy', label: 'Previous Financial Year' },
                    { key: 'all_time', label: 'All Transactions' }
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleApplyStatementPreset(p.key)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        statementPreset === p.key
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openPrintStatementModal}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Statement (A4)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportStatementCSV}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel / CSV</span>
                  </button>
                </div>
              </div>

              {/* Date Pickers & Complaint Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/70">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">From Date</label>
                  <input
                    type="date"
                    value={statementFromDate}
                    onChange={(e) => {
                      setStatementPreset('custom');
                      setStatementFromDate(e.target.value);
                    }}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">To Date</label>
                  <input
                    type="date"
                    value={statementToDate}
                    onChange={(e) => {
                      setStatementPreset('custom');
                      setStatementToDate(e.target.value);
                    }}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Complaint / Ticket</label>
                  <select
                    value={statementTicketId}
                    onChange={(e) => setStatementTicketId(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Complaints & Tours</option>
                    {(loadedComplaints || complaints).map(c => (
                      <option key={c.id} value={c.ticket_id}>
                        {c.ticket_id} — {c.customer_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Transaction Type</label>
                  <select
                    value={statementTxType}
                    onChange={(e) => setStatementTxType(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Transaction Types</option>
                    <option value="advance">Tour Advance Issued</option>
                    <option value="expense">Approved Expense Claim</option>
                    <option value="return">Cash Surplus Returned</option>
                    <option value="reimbursement">Reimbursement Paid</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Statement Header Card */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">ECO GREEN SOLAR</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs text-slate-300">Official Accounts Ledger</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                    TECHNICIAN ACCOUNT STATEMENT
                  </h3>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Statement Period</span>
                  <span className="text-xs font-bold font-mono text-emerald-300">
                    {statementFromDate ? formatIndianDateOnly(statementFromDate) : 'Beginning'} to {statementToDate ? formatIndianDateOnly(statementToDate) : 'Today'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Specialist:</span>{' '}
                  <strong className="text-white font-bold">{currentTech.name}</strong>{' '}
                  {currentTech.phone && <span className="font-mono text-slate-300">({currentTech.phone})</span>}
                  <span className="ml-2 text-[11px] text-emerald-400 font-medium">[{currentTech.area_zone || 'General Zone'}]</span>
                </div>
                <div>
                  <span className="text-slate-400">Account:</span>{' '}
                  <strong className="text-white font-bold">TECHNICIAN TOUR EXPENSES</strong>
                </div>
              </div>
            </div>

            {/* Account Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Opening Balance</span>
                <strong className="text-base font-black font-mono text-slate-800 block mt-0.5">
                  {formatCur(ledgerData.statement?.opening_balance || 0)}
                </strong>
                <span className="text-[9px] text-slate-400">Prior to {statementFromDate ? formatIndianDateOnly(statementFromDate) : 'period'}</span>
              </div>

              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                <span className="text-[10px] uppercase font-bold text-blue-800 block">Total Advances (Debit)</span>
                <strong className="text-base font-black font-mono text-blue-950 block mt-0.5">
                  {formatCur(ledgerData.statement?.total_advances || 0)}
                </strong>
                <span className="text-[9px] text-blue-700">Given to specialist</span>
              </div>

              <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200">
                <span className="text-[10px] uppercase font-bold text-rose-800 block">Approved Expenses</span>
                <strong className="text-base font-black font-mono text-rose-950 block mt-0.5">
                  {formatCur(ledgerData.statement?.total_approved_expenses || 0)}
                </strong>
                <span className="text-[9px] text-rose-700">Credit against advance</span>
              </div>

              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Surplus Returned</span>
                <strong className="text-base font-black font-mono text-emerald-950 block mt-0.5">
                  {formatCur(ledgerData.statement?.total_returns || 0)}
                </strong>
                <span className="text-[9px] text-emerald-700">Deposited to company</span>
              </div>

              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200">
                <span className="text-[10px] uppercase font-bold text-indigo-800 block">Reimbursements Paid</span>
                <strong className="text-base font-black font-mono text-indigo-950 block mt-0.5">
                  {formatCur(ledgerData.statement?.total_reimbursements || 0)}
                </strong>
                <span className="text-[9px] text-indigo-700">Paid to specialist</span>
              </div>

              <div className={`p-3 rounded-xl border ${
                (ledgerData.statement?.closing_balance || 0) > 0
                  ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200'
                  : (ledgerData.statement?.closing_balance < 0 ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' : 'bg-emerald-50 border-emerald-200')
              }`}>
                <span className={`text-[10px] uppercase font-bold block ${
                  (ledgerData.statement?.closing_balance || 0) > 0
                    ? 'text-amber-900'
                    : (ledgerData.statement?.closing_balance < 0 ? 'text-blue-900' : 'text-emerald-900')
                }`}>
                  Closing Balance
                </span>
                <strong className={`text-base font-black font-mono block mt-0.5 ${
                  (ledgerData.statement?.closing_balance || 0) > 0
                    ? 'text-amber-950'
                    : (ledgerData.statement?.closing_balance < 0 ? 'text-blue-950' : 'text-emerald-950')
                }`}>
                  {formatCur(Math.abs(ledgerData.statement?.closing_balance || 0))}
                </strong>
                <span className="text-[9px] font-bold block">
                  {ledgerData.statement?.status_label || 'Settled'}
                </span>
              </div>
            </div>

            {/* Prominent Directional Position Banner */}
            <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              (ledgerData.statement?.closing_balance || 0) > 0
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : (ledgerData.statement?.closing_balance < 0 ? 'bg-blue-50 border-blue-300 text-blue-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950')
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">
                  {(ledgerData.statement?.closing_balance || 0) > 0 ? '⚠️' : ((ledgerData.statement?.closing_balance || 0) < 0 ? 'ℹ️' : '✅')}
                </span>
                <div>
                  <span className="text-xs font-bold block">FINAL ACCOUNT STATUS:</span>
                  <strong className="text-sm font-black tracking-wide">
                    {ledgerData.statement?.position_label || 'SETTLED – ₹0 OUTSTANDING'}
                  </strong>
                </div>
              </div>
              <div className="text-xs font-mono font-bold">
                Net Position: {formatCur(Math.abs(ledgerData.statement?.closing_balance || 0))}
              </div>
            </div>

            {/* Detailed Chronological Ledger Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Detailed Transaction Ledger ({(ledgerData.statement?.transactions || []).length} Records)
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Running balance updates chronologically
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Complaint / Tour</th>
                      <th className="py-2.5 px-3">Transaction</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">
                        {ledgerData.statement?.columns?.debit_header || (user?.role === 'technician' ? 'Debit (Expense / Return)' : 'Debit (Advance Given)')}
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        {ledgerData.statement?.columns?.credit_header || (user?.role === 'technician' ? 'Credit (Advance Received)' : 'Credit (Expense / Return)')}
                      </th>
                      <th className="py-2.5 px-3 text-right font-black">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Opening Balance Row */}
                    <tr className="bg-slate-50/80 font-bold text-slate-700">
                      <td className="py-2.5 px-3 font-mono text-[11px]">{statementFromDate ? formatIndianDateOnly(statementFromDate) : 'Beginning'}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">OPENING</td>
                      <td className="py-2.5 px-3 text-slate-400">-</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-800 font-bold">
                          Opening Balance
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 italic">Balance brought forward from prior period</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCur(ledgerData.statement?.opening_balance || 0)}
                      </td>
                    </tr>

                    {(ledgerData.statement?.transactions || []).length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-400">
                          No transactions found within this statement period.
                        </td>
                      </tr>
                    ) : (
                      (ledgerData.statement?.transactions || []).map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-800">
                              {tx.date ? formatIndianDateOnly(tx.date) : '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 font-bold">
                            {tx.reference_no}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-semibold">
                            {tx.ticket_id ? (
                              <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                {tx.ticket_id}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">General Tour</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.tx_type === 'advance' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                              tx.tx_type === 'expense' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              tx.tx_type === 'return' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              tx.tx_type === 'reimbursement' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                              'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {tx.type_label || tx.transaction_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900 whitespace-nowrap">
                            {tx.debit > 0 ? formatCur(tx.debit) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900 whitespace-nowrap">
                            {tx.credit > 0 ? formatCur(tx.credit) : '—'}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-black text-sm whitespace-nowrap ${
                            tx.balance_direction === 'Dr' ? (user?.role === 'technician' ? 'text-blue-900' : 'text-amber-900') :
                            tx.balance_direction === 'Cr' ? (user?.role === 'technician' ? 'text-amber-900' : 'text-blue-900') :
                            'text-slate-700'
                          }`}>
                            {formatCur(Math.abs(tx.running_balance))}
                            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              tx.balance_direction === 'Dr' ? (user?.role === 'technician' ? 'bg-blue-100 text-blue-900 border border-blue-300' : 'bg-amber-100 text-amber-900 border border-amber-300') :
                              tx.balance_direction === 'Cr' ? (user?.role === 'technician' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-300') :
                              'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}>
                              {tx.balance_direction === 'Dr'
                                ? (user?.role === 'technician' ? 'Dr (Receivable)' : 'Dr (Recoverable)')
                                : (tx.balance_direction === 'Cr'
                                    ? (user?.role === 'technician' ? 'Cr (To Return)' : 'Cr (Payable)')
                                    : 'Settled')}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Statement Closing Result Card (Summary, Not a Transaction) */}
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
              (ledgerData.statement?.closing_balance || 0) !== 0
                ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                : 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                  (ledgerData.statement?.closing_balance || 0) !== 0
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-emerald-200 text-emerald-900'
                }`}>
                  {(ledgerData.statement?.closing_balance || 0) !== 0 ? '₹' : '✓'}
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 block">
                    Statement Closing Balance
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <strong className="text-xl font-black font-mono">
                      {ledgerData.statement?.closing_balance_formatted || formatCur(Math.abs(ledgerData.statement?.closing_balance || 0))}
                    </strong>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white/80 border border-slate-300">
                      {ledgerData.statement?.status_label || ledgerData.statement?.position_label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Account Status</span>
                <span className="text-xs font-bold text-slate-800">
                  {ledgerData.statement?.closing_balance === 0 ? 'Account Fully Settled' : (user?.role === 'technician' ? 'Outstanding Settlement Due' : 'Balance Pending Settlement')}
                </span>
              </div>
            </div>

            {/* Reconciliation Audit Formula Footer */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Accounting Integrity Check:</strong> Opening Balance ({formatCur(ledgerData.statement?.opening_balance || 0)}) + Advances ({formatCur(ledgerData.statement?.total_advances || 0)}) - Expenses ({formatCur(ledgerData.statement?.total_approved_expenses || 0)}) - Returns ({formatCur(ledgerData.statement?.total_returns || 0)}) + Reimbursements ({formatCur(ledgerData.statement?.total_reimbursements || 0)}) = Closing Balance ({formatCur(ledgerData.statement?.closing_balance || 0)})
                </span>
              </div>
              <span className="px-2 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-[10px] whitespace-nowrap self-start sm:self-auto">
                ✓ Reconciled & Audited
              </span>
            </div>
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
              {isAdminOrStaff ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Select Specialist / Technician to Allocate Advance *
                  </label>
                  <select
                    required
                    value={advanceForm.technician_id}
                    onChange={(e) => setAdvanceForm(prev => ({ ...prev, technician_id: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-blue-50/70 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-950 cursor-pointer"
                  >
                    <option value="">-- Choose Specialist --</option>
                    {loadedTechs.map(t => (
                      <option key={t.id} value={t.id}>
                        👤 {t.name} ({t.area_zone || 'Field Specialist'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                  <span className="block text-[11px] font-semibold text-blue-700">Specialist:</span>
                  <strong className="text-sm font-bold text-blue-950">{currentTech.name}</strong>
                  <span className="text-[11px] text-blue-600 block mt-0.5">{currentTech.area_zone || 'Field Zone'}</span>
                </div>
              )}

              {existingRecoverable > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-amber-900 font-bold text-xs">
                    <span>Existing Recoverable Balance:</span>
                    <span className="font-mono text-sm">{formatCur(existingRecoverable)}</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    This specialist currently holds an unreturned surplus of {formatCur(existingRecoverable)} from previous tours.
                  </p>
                  {advanceForm.amount && parseFloat(advanceForm.amount) > 0 && (
                    <div className="pt-1 border-t border-amber-200/60 flex items-center justify-between text-xs font-bold text-amber-950">
                      <span>Recommended Net Advance to Issue:</span>
                      <span className="font-mono text-emerald-800 text-sm">
                        {formatCur(Math.max(0, parseFloat(advanceForm.amount) - existingRecoverable))}
                      </span>
                    </div>
                  )}
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advanceAdjustBalance}
                      onChange={(e) => setAdvanceAdjustBalance(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-700 font-semibold">
                      Deduct {formatCur(existingRecoverable)} previous balance from this advance (Record transparent adjustment)
                    </span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {advanceAdjustBalance && existingRecoverable > 0 ? 'Gross Requirement (₹) *' : 'Advance Amount (₹) *'}
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
                {advanceAdjustBalance && existingRecoverable > 0 && advanceForm.amount && (
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                    Net cash to be handed over: {formatCur(Math.max(0, parseFloat(advanceForm.amount) - existingRecoverable))}
                  </p>
                )}
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

      {/* ================= MODAL: EDIT TOUR ADVANCE ================= */}
      {isEditAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Edit Tour Travel Advance</h4>
                  <p className="text-[11px] text-slate-500">Update amount, payment method, or purpose</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditAdvanceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAdvance} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Assigned Specialist / Technician
                </label>
                <select
                  value={editAdvanceForm.technician_id}
                  onChange={(e) => setEditAdvanceForm(prev => ({ ...prev, technician_id: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                >
                  {(loadedTechs || []).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.area_zone || 'Field Zone'})
                    </option>
                  ))}
                </select>
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
                  value={editAdvanceForm.amount}
                  onChange={(e) => setEditAdvanceForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full text-base font-bold font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={editAdvanceForm.payment_mode}
                    onChange={(e) => setEditAdvanceForm(prev => ({ ...prev, payment_mode: e.target.value }))}
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
                    value={editAdvanceForm.reference_no}
                    onChange={(e) => setEditAdvanceForm(prev => ({ ...prev, reference_no: e.target.value }))}
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
                  value={editAdvanceForm.purpose}
                  onChange={(e) => setEditAdvanceForm(prev => ({ ...prev, purpose: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Additional Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional notes or approvals"
                  value={editAdvanceForm.notes}
                  onChange={(e) => setEditAdvanceForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditAdvanceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditAdvance}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {submittingEditAdvance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingEditAdvance ? 'Updating...' : 'Update Advance'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD EXPENSE VOUCHER (MULTI-ITEM BATCH CLAIM) ================= */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  <span>{editingVoucherNo ? `Edit Tour Voucher (${editingVoucherNo})` : 'Add Tour Expense / Voucher Claim'}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                    editingVoucherNo 
                      ? 'bg-amber-50 text-amber-800 border-amber-300' 
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    {editingVoucherNo ? 'Editing Claim' : 'Batch Claim'}
                  </span>
                </h4>
                {editingVoucherNo ? (
                  <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                    Modifying unapproved claim — Voucher number <strong className="font-mono">{editingVoucherNo}</strong> will remain unchanged.
                  </p>
                ) : isAdminOrStaff ? (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Batch voucher claim for field operations
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Claiming for specialist: <strong className="text-slate-800">{currentTech.name}</strong>
                  </p>
                )}
              </div>
              <button 
                type="button" 
                onClick={() => { setIsExpenseModalOpen(false); setEditingVoucherNo(null); }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
              {isAdminOrStaff && (
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                  <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                    Select Specialist / Technician for Voucher Claim *
                  </label>
                  <select
                    required
                    value={expenseForm.technician_id}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, technician_id: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="">-- Choose Specialist --</option>
                    {loadedTechs.map(t => (
                      <option key={t.id} value={t.id}>
                        👤 {t.name} ({t.area_zone || 'Field Specialist'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Top Configuration: Ticket + Date (+ Specialist if Admin) */}
              <div className="bg-slate-50 p-3 sm:p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 1. Ticket Selector (Top Priority - Dedicated Voucher per Ticket) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-blue-600" />
                      <span>Voucher Ticket / Tour (Optional)</span>
                    </label>
                    <select
                      value={expenseForm.ticket_id}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, ticket_id: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800 cursor-pointer"
                    >
                      <option value="">-- General / Non-ticket Tour Travel --</option>
                      {(loadedComplaints || complaints).map(c => (
                        <option key={c.id} value={c.ticket_id}>
                          {c.ticket_id} — {c.customer_name} ({c.city || 'Site'})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      All expenses logged against this ticket will be consolidated onto a single dedicated voucher slip.
                    </p>
                  </div>

                  {/* 2. Voucher Expense Date */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-600" />
                      <span>Voucher Expense Date *</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseForm.expense_date}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, expense_date: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Clean Table-style Expense Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Expense Line Items ({expenseForm.items.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Line Item</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  {/* Table Header */}
                  <div className="hidden sm:grid sm:grid-cols-12 bg-slate-100/90 px-3 py-2 text-[11px] font-bold text-slate-700 border-b border-slate-200">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-4">Category *</div>
                    <div className="col-span-4">Particulars / Details</div>
                    <div className="col-span-2 text-right">Amount (₹) *</div>
                    <div className="col-span-1 text-center">Action</div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-slate-100">
                    {expenseForm.items.map((item, idx) => (
                      <div key={item.id} className="p-3 sm:px-3 sm:py-2.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 space-y-2 sm:space-y-0">
                        <div className="col-span-1 flex items-center justify-between sm:justify-center">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          {/* Mobile delete button */}
                          {expenseForm.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(item.id)}
                              className="sm:hidden p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </button>
                          )}
                        </div>

                        <div className="col-span-4">
                          <label className="sm:hidden block text-[10px] font-bold text-slate-600 mb-0.5">Category *</label>
                          <select
                            value={item.category}
                            onChange={(e) => handleUpdateItemRow(item.id, 'category', e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-800"
                          >
                            {EXPENSE_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-4">
                          <label className="sm:hidden block text-[10px] font-bold text-slate-600 mb-0.5">Particulars / Details</label>
                          <input
                            type="text"
                            placeholder="e.g. Lunch with team, Cab to site"
                            value={item.title}
                            onChange={(e) => handleUpdateItemRow(item.id, 'title', e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="sm:hidden block text-[10px] font-bold text-slate-600 mb-0.5">Amount (₹) *</label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="any"
                            placeholder="0.00"
                            value={item.amount}
                            onChange={(e) => handleUpdateItemRow(item.id, 'amount', e.target.value)}
                            className="w-full text-xs font-bold font-mono px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-right sm:text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="col-span-1 hidden sm:flex sm:justify-center">
                          {expenseForm.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove row"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">-</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add another row button */}
                  <div className="p-2 bg-slate-50/50 border-t border-slate-100 text-center">
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="py-1.5 px-4 text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Another Expense Category</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Combined Voucher Bills / Proofs Upload */}
              <div 
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsReceiptDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsReceiptDragging(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsReceiptDragging(false);
                  if (e.dataTransfer?.files?.length > 0) {
                    handleAddReceiptFiles(e.dataTransfer.files);
                  }
                }}
                className={`p-3.5 rounded-2xl border-2 transition-all space-y-2 ${
                  isReceiptDragging
                    ? 'border-dashed border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-400/50 scale-[1.01]'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-800">
                    Voucher Receipts / Bill Proofs (Upload Together)
                  </label>
                  <span className="text-[10px] text-slate-500">Optional (Camera / Photos / PDF / Drag & Drop)</span>
                </div>

                {isReceiptDragging ? (
                  <div className="py-3 flex flex-col items-center justify-center text-center space-y-1 pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
                      <Upload className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-emerald-800">Drop voucher receipts here</p>
                    <p className="text-[10px] text-emerald-600">Supports bills, receipt photos & PDF files</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Direct Camera Capture */}
                      <label className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-300 font-bold flex items-center gap-1.5 cursor-pointer text-xs transition-colors shadow-2xs">
                        <Camera className="w-4 h-4 text-emerald-600" />
                        <span>Take Photo (Camera)</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            handleAddReceiptFiles(e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      {/* Choose multiple from Gallery / Files */}
                      <label className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-300 font-bold flex items-center gap-1.5 cursor-pointer text-xs transition-colors shadow-2xs">
                        <Upload className="w-4 h-4 text-slate-500" />
                        <span>Upload from Gallery / Files</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            handleAddReceiptFiles(e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      {compressingReceipts ? (
                        <span className="text-xs text-amber-600 font-bold flex items-center gap-1.5 animate-pulse">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Optimizing photos...
                        </span>
                      ) : (expenseForm.receipt_previews || []).length > 0 ? (
                        <span className="text-xs text-emerald-700 font-bold">
                          ✓ {expenseForm.receipt_previews.length} bill(s) attached
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">Or drag & drop receipts / invoices anywhere inside this box</p>
                  </div>
                )}

                {/* Attached Photos Preview Grid */}
                {(expenseForm.receipt_previews || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {expenseForm.receipt_previews.map((rec, rIdx) => (
                      <div key={rIdx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 shadow-xs group">
                        <img 
                          src={rec.url} 
                          alt={rec.name || 'Receipt'} 
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setReceiptLightbox({
                            urls: (expenseForm.receipt_previews || []).map(r => r.url),
                            url: rec.url,
                            index: rIdx,
                            name: rec.name || `Bill #${rIdx + 1}`
                          })}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveReceiptFile(rIdx)}
                          className="absolute top-1 right-1 p-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-xs shadow-xs cursor-pointer"
                          title="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total Calculation & Submit Footer */}
              <div className="bg-slate-900 text-white p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-semibold">Total Voucher Claim Amount:</span>
                  <strong className="text-base font-black font-mono text-emerald-400">
                    ₹{expenseTotalSum.toLocaleString('en-IN')}
                  </strong>
                </div>
                {expenseTotalSum > 0 && (
                  <p className="text-[10px] text-slate-400 italic">
                    {numberToIndianWords(expenseTotalSum)}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsExpenseModalOpen(false); setEditingVoucherNo(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExpense || compressingReceipts || expenseTotalSum <= 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {(submittingExpense || compressingReceipts) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {compressingReceipts ? 'Processing Photos...' : submittingExpense ? 'Saving...' : editingVoucherNo ? `Update Voucher (${editingVoucherNo})` : `Save Voucher Claim (${expenseForm.items.length} items - ₹${expenseTotalSum})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DEPOSIT / RETURN BALANCE TO COMPANY ================= */}
      {isSettleModalOpen && (() => {
        const currentTargetTech = loadedTechs.find(t => String(t.id) === String(settleForm.technician_id)) 
          || (selectedTechId !== 'all' ? loadedTechs.find(t => String(t.id) === String(selectedTechId)) : null)
          || currentTech;
        const targetSummary = (ledgerData.technicians_summary || []).find(t => String(t.technician_id) === String(settleForm.technician_id || currentTargetTech?.id));
        const targetNetBal = targetSummary ? Number(targetSummary.net_balance ?? 0) : Number(summary.net_balance ?? 0);
        const isTargetReimb = targetNetBal < 0;
        const targetDue = Math.abs(targetNetBal);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <IndianRupee className={`w-4 h-4 ${isTargetReimb ? 'text-blue-600' : 'text-emerald-600'}`} />
                  <span>
                    {isTargetReimb 
                      ? 'Reimburse Specialist (Company Payout)' 
                      : 'Return Surplus Advance to Company'}
                  </span>
                </h4>
                <button 
                  type="button" 
                  onClick={() => setIsSettleModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSettleBalance} className="space-y-3 text-xs">
                {/* Specialist Selection / Display */}
                {isAdminOrStaff ? (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Select Specialist / Technician *
                    </label>
                    <select
                      required
                      value={settleForm.technician_id}
                      onChange={(e) => handleSettleTechChange(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-blue-50/70 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-950 cursor-pointer"
                    >
                      <option value="">-- Choose Specialist to Settle --</option>
                      {loadedTechs.map(t => {
                        const tSummary = (ledgerData.technicians_summary || []).find(s => String(s.technician_id) === String(t.id));
                        const bal = tSummary ? Number(tSummary.net_balance ?? 0) : 0;
                        let badge = 'Settled (₹0)';
                        if (bal < 0) badge = `₹${Math.abs(bal).toLocaleString('en-IN')} Reimbursement Due`;
                        else if (bal > 0) badge = `₹${bal.toLocaleString('en-IN')} Returnable`;
                        return (
                          <option key={t.id} value={t.id}>
                            👤 {t.name} ({t.area_zone || 'Field'}) — [{badge}]
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                    <span className="block text-[11px] font-semibold text-blue-700">Specialist:</span>
                    <strong className="text-sm font-bold text-blue-950">{currentTech.name}</strong>
                    <span className="text-[11px] text-blue-600 block mt-0.5">{currentTech.area_zone || 'Field Zone'}</span>
                  </div>
                )}

                {/* Outstanding Balance Explanation Banner in Enterprise English */}
                {isTargetReimb ? (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-blue-800">Amount Company Owes Specialist:</span>
                      <strong className="font-mono font-bold text-blue-950 text-sm">{formatCur(targetDue)}</strong>
                    </div>
                    <p className="text-[10px] text-blue-700">
                      The specialist incurred approved tour expenses exceeding the advance. The company is issuing this reimbursement payout to settle the specialist's account balance.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-emerald-800">Current Tour Surplus Cash:</span>
                      <strong className="font-mono font-bold text-emerald-950 text-sm">{formatCur(targetDue)}</strong>
                    </div>
                    <p className="text-[10px] text-emerald-700">
                      The specialist is returning unused tour advance cash back to the company after completing field tasks.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isTargetReimb ? 'Reimbursement / Payout Amount (₹) *' : 'Deposit / Return Amount (₹) *'}
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
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold cursor-pointer"
                  >
                    {isTargetReimb ? (
                      <>
                        <option value="UPI / Online Bank Transfer to Specialist">UPI / Online Bank Transfer to Specialist</option>
                        <option value="Cash">Cash Handover from Accounts</option>
                        <option value="Company Cheque">Company Cheque</option>
                      </>
                    ) : (
                      <>
                        <option value="Cash">Cash in Hand to Office</option>
                        <option value="Bank Transfer">Bank Transfer / Direct Deposit</option>
                        <option value="UPI">UPI to Company Account</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Ref / Transaction ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR / Receipt / Cash Voucher No."
                    value={settleForm.reference_no}
                    onChange={(e) => setSettleForm(prev => ({ ...prev, reference_no: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Remarks / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tour surplus cash returned / reimbursement note"
                    value={settleForm.notes}
                    onChange={(e) => setSettleForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSettleModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingSettle}
                    className={`px-4 py-2 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${
                      isTargetReimb ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {submittingSettle && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {submittingSettle 
                        ? 'Saving...' 
                        : (isTargetReimb ? 'Confirm Payout to Specialist' : 'Confirm Cash Return')}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL: PRINT & WORD EXPORT VOUCHER ================= */}
      {isVoucherModalOpen && typeof document !== 'undefined' ? createPortal(
        <div id="tour-voucher-modal-portal" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="voucher-modal-card bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Actions Bar */}
            <div className="print:hidden no-print p-3 sm:p-4 bg-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Voucher Book Print (2 Vouchers per A4 Page)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={closeVoucherModal}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors ml-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Selection & Status Filter Bar */}
            <div className="print:hidden no-print bg-slate-900 px-4 py-2 text-white flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mr-1">Print Filter:</span>
                <button
                  type="button"
                  onClick={() => setPrintFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    printFilter === 'all' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  All Vouchers ({voucherLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPrintFilter('selected')}
                  disabled={selectedVoucherKeys.size === 0}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    printFilter === 'selected' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  Selected Vouchers ({selectedVoucherKeys.size})
                </button>
                <button
                  type="button"
                  onClick={() => setPrintFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    printFilter === 'pending' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  Unapproved Only ({voucherLogs.filter(v => (v.status || '').toLowerCase() !== 'approved').length})
                </button>
                <button
                  type="button"
                  onClick={() => setPrintFilter('approved')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    printFilter === 'approved' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  Approved Only ({voucherLogs.filter(v => (v.status || '').toLowerCase() === 'approved').length})
                </button>
              </div>

              <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                Rendering {voucherChunks.length} Voucher Slip{voucherChunks.length !== 1 ? 's' : ''} ({voucherPages.length} A4 Page{voucherPages.length !== 1 ? 's' : ''})
              </div>
            </div>

            {/* Printable Voucher Paper */}
            <div className="voucher-paper-container flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200">
              <style>{`
                @media print {
                  @page {
                    size: A4 portrait;
                    margin: 6mm 8mm;
                  }
                  html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #fff !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    overflow: visible !important;
                    height: auto !important;
                    width: 100% !important;
                  }
                  /* Completely hide main application tree to eliminate preceding blank pages */
                  body > *:not(#tour-voucher-modal-portal) {
                    display: none !important;
                  }
                  #tour-voucher-modal-portal {
                    position: static !important;
                    display: block !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    height: auto !important;
                    background: #fff !important;
                    box-shadow: none !important;
                  }
                  #tour-voucher-modal-portal .voucher-modal-card {
                    position: static !important;
                    display: block !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    max-height: none !important;
                    height: auto !important;
                    overflow: visible !important;
                    background: #fff !important;
                    box-shadow: none !important;
                    border: none !important;
                  }
                  #tour-voucher-modal-portal .voucher-modal-card > :not(.voucher-paper-container) {
                    display: none !important;
                  }
                  .print\\:hidden, [class*="print:hidden"], .no-print {
                    display: none !important;
                  }
                  .voucher-paper-container {
                    position: static !important;
                    display: block !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #fff !important;
                    overflow: visible !important;
                  }
                  #tour-voucher-print-area {
                    position: static !important;
                    display: block !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  #tour-voucher-print-area > * {
                    margin-top: 0 !important;
                    margin-bottom: 0 !important;
                  }
                  .voucher-page-pair {
                    box-sizing: border-box !important;
                    width: 100% !important;
                    height: 282mm !important;
                    max-height: 282mm !important;
                    page-break-after: always !important;
                    break-after: page !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-between !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  .voucher-page-pair:last-child {
                    page-break-after: auto !important;
                    break-after: auto !important;
                  }
                  .voucher-slip-card {
                    box-sizing: border-box !important;
                    width: 100% !important;
                    height: 136mm !important;
                    max-height: 136mm !important;
                    border: 1.5px solid #000 !important;
                    padding: 3.5mm 5.5mm !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-between !important;
                    background: #fff !important;
                  }
                  .voucher-cut-line {
                    height: 6mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    overflow: hidden !important;
                  }
                }
              `}</style>
              <div 
                id="tour-voucher-print-area" 
                className="max-w-3xl mx-auto space-y-6 text-slate-900"
              >
                {voucherPages.map((pageChunks, pIdx) => (
                  <div key={'page-pair-' + pIdx} className="voucher-page-pair">
                    {pageChunks.map((chunk, cIdx) => {
                      const items = chunk.items || [];
                      const emptySlots = Math.max(0, 9 - items.length);
                      const displayTechName = selectedTechId === 'all' 
                        ? 'All Specialists (Consolidated)' 
                        : (currentTech.name + (currentTech.phone ? ` (${currentTech.phone})` : ''));

                      return (
                        <React.Fragment key={chunk.voucherNo + '-' + cIdx}>
                          {/* Physical Voucher Slip Card */}
                          <div className="voucher-slip-card bg-white border-2 border-black p-3.5 sm:p-4.5 shadow-sm rounded-none font-sans text-slate-900 relative">
                            {/* Header: Green Energy Logo + Address + Voucher No & Date */}
                            <div className="grid grid-cols-12 gap-2 pb-2 mb-2 border-b border-slate-200">
                              {/* Logo */}
                              <div className="col-span-3 flex items-center justify-start py-0.5">
                                <img 
                                  src={GREEN_ENERGY_LOGO_BASE64} 
                                  alt="Green ENERGY" 
                                  className="h-12 sm:h-14 w-auto max-w-[150px] object-contain"
                                />
                              </div>

                              {/* Address */}
                              <div className="col-span-6 text-[9.5px] text-slate-800 leading-snug flex flex-col justify-center border-l-[1.5px] border-slate-300 pl-3">
                                <p className="font-semibold text-slate-900">Plot No. 4, Gajanand Industrial, Near RK Exotica,</p>
                                <p>Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021</p>
                              </div>

                              {/* Voucher No & Date */}
                              <div className="col-span-3 text-right text-xs leading-snug flex flex-col justify-center">
                                <p className="font-bold text-slate-900">
                                  Voucher No : <span className="font-mono text-teal-700 text-xs font-black">{chunk.voucherNo}</span>
                                </p>
                                <p className="text-[10px] text-slate-800 mt-0.5 font-medium">
                                  Date : <span className="font-mono font-bold text-slate-900">{chunk.date}</span>
                                </p>
                              </div>
                            </div>

                            {/* Name & Account */}
                            <div className="text-[10px] mb-2 font-sans">
                              <div className="flex items-baseline gap-2">
                                <span className="font-bold text-slate-900 shrink-0">Name :</span>
                                <span className="font-bold text-slate-900">
                                  {displayTechName}
                                </span>
                              </div>
                              {/* Full width dashed line between Name and Account */}
                              <div className="border-b border-dashed border-slate-400 my-1.5" />
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-bold text-slate-900 shrink-0">Account :</span>
                                  <span className="font-bold text-slate-900 uppercase tracking-wide">
                                    TECHNICIAN TOUR EXPENSES
                                  </span>
                                </div>
                                <div className="flex items-baseline gap-1 text-[10px]">
                                  <span className="font-bold text-slate-900">Ticket No :</span>
                                  <span className="font-mono font-bold text-blue-900">
                                    {chunk.ticketId || 'General Tour'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Particulars & Amount Table (11 Rows: 1 Heading + 9 Entries + 1 Total) */}
                            <div className="border-[1.5px] border-black mb-2">
                              <div className="grid grid-cols-12 bg-slate-50 border-b-[1.5px] border-black text-[10px] font-bold text-center">
                                <div className="col-span-9 p-0.5 border-r-[1.5px] border-black uppercase text-[9.5px] tracking-wider">
                                  Particulars
                                </div>
                                <div className="col-span-3 p-0.5 uppercase text-[9.5px] tracking-wider">
                                  Amount
                                </div>
                              </div>

                              {/* Item Rows (up to 9 entries) */}
                              <div className="divide-y divide-slate-200 text-[10px]">
                                {items.map((item, iIdx) => (
                                  <div key={item.id || iIdx} className="grid grid-cols-12 min-h-[19px] items-center">
                                    <div className="col-span-9 px-2.5 py-0.5 border-r-[1.5px] border-black font-medium text-slate-800 leading-tight">
                                      <span className="font-semibold">{item.category}</span>
                                      {item.description ? (
                                        <span className="text-slate-600 text-[9px] ml-1">({item.description})</span>
                                      ) : (item.title && item.title.toLowerCase() !== (item.category || '').toLowerCase() ? (
                                        <span className="text-slate-600 text-[9px] ml-1">- {item.title}</span>
                                      ) : null)}
                                    </div>
                                    <div className="col-span-3 px-2.5 py-0.5 text-right font-mono font-bold text-slate-900">
                                      ₹{Number(item.amount || 0).toFixed(2)}
                                    </div>
                                  </div>
                                ))}

                                {/* Blank padding rows to fit 9 entries perfectly */}
                                {Array.from({ length: emptySlots }).map((_, bIdx) => (
                                  <div key={'blank-' + bIdx} className="grid grid-cols-12 h-[19px] items-center">
                                    <div className="col-span-9 px-2.5 py-0.5 border-r-[1.5px] border-black text-slate-300 select-none">
                                      &nbsp;
                                    </div>
                                    <div className="col-span-3 px-2.5 py-0.5 text-right font-mono text-slate-300 select-none">
                                      &nbsp;
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Total Row */}
                              <div className="grid grid-cols-12 bg-slate-50 border-t-[1.5px] border-black font-bold text-[10.5px]">
                                <div className="col-span-9 px-2.5 py-0.5 border-r-[1.5px] border-black text-right uppercase tracking-wider">
                                  Total:
                                </div>
                                <div className="col-span-3 px-2.5 py-0.5 text-right font-mono text-xs text-teal-900 font-black">
                                  ₹{Number(chunk.total || 0).toFixed(2)}
                                </div>
                              </div>
                            </div>

                            {/* Amount in Word */}
                            <div className="text-[10px] mb-2 leading-tight">
                              <span className="font-bold text-slate-900">Amount in Word : </span>
                              <span className="font-bold text-slate-900 italic border-b-2 border-dashed border-slate-400 pb-0.5">
                                {numberToIndianWords(chunk.total)}
                              </span>
                            </div>

                            {/* 4 Signatures */}
                            <div className="grid grid-cols-4 gap-3 sm:gap-4 pt-4 sm:pt-6 text-center text-[9px]">
                              {/* Row above line (Signature / Stamp / Status) */}
                              <div className="h-7 flex items-end justify-center pb-1"></div>
                              <div className="h-7 flex flex-col items-center justify-end pb-1 leading-tight">
                                {chunk.isApproved ? (
                                  <>
                                    <div className="text-[8.5px] font-black text-teal-800 uppercase tracking-wide">
                                      APPROVED BY
                                    </div>
                                    <div className="text-[8px] font-bold text-slate-900 leading-tight">
                                      ({chunk.approverName || 'Admin Supervisor'})
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-[9px] font-bold text-red-600 uppercase tracking-wider">
                                    UNAPPROVED
                                  </div>
                                )}
                              </div>
                              <div className="h-7 flex items-end justify-center pb-1"></div>
                              <div className="h-7 flex items-end justify-center pb-1"></div>

                              {/* Row of lines + signature labels */}
                              <div className="border-t-2 border-slate-900 pt-1 font-semibold text-slate-800">
                                Authorized Signature
                              </div>
                              <div className="border-t-2 border-slate-900 pt-1 font-semibold text-slate-800">
                                Checked by
                              </div>
                              <div className="border-t-2 border-slate-900 pt-1 font-semibold text-slate-800">
                                Paid by
                              </div>
                              <div className="border-t-2 border-slate-900 pt-1 font-semibold text-slate-800">
                                Receiver's Signature
                              </div>
                            </div>
                          </div>

                          {/* Cut line between 2 vouchers on the same page */}
                          {cIdx === 0 && pageChunks.length > 1 && (
                            <div className="voucher-cut-line flex items-center justify-center gap-2 py-1 text-slate-400 select-none">
                              <span className="text-[10px] tracking-widest">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Separation divider between sheets on screen */}
                    {pIdx < voucherPages.length - 1 && (
                      <div className="print:hidden text-center my-4 py-1 border-b-2 border-dashed border-slate-400 text-xs font-bold text-slate-500">
                        --- Sheet {pIdx + 1} End (Next A4 Page) ---
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {/* ================= MODAL: PRINTABLE ACCOUNT STATEMENT (A4) ================= */}
      {isPrintStatementOpen && typeof document !== 'undefined' ? createPortal(
        <div id="tour-statement-modal-portal" className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs print:p-0 print:bg-white print:static">
          <div className="statement-modal-card bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto shadow-2xl p-4 sm:p-6 print:p-0 print:shadow-none print:max-w-none print:max-h-none print:w-full">
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm;
                }
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #fff !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  overflow: visible !important;
                  height: auto !important;
                  width: 100% !important;
                }
                body > *:not(#tour-statement-modal-portal) {
                  display: none !important;
                }
                #tour-statement-modal-portal {
                  position: static !important;
                  display: block !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  background: #fff !important;
                  box-shadow: none !important;
                }
                #tour-statement-modal-portal .statement-modal-card {
                  position: static !important;
                  display: block !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  max-height: none !important;
                  height: auto !important;
                  overflow: visible !important;
                  background: #fff !important;
                  box-shadow: none !important;
                  border: none !important;
                }
                .print\\:hidden, [class*="print:hidden"] {
                  display: none !important;
                }
              }
            `}</style>
            {/* Top Modal Controls (Hidden in Print) */}
            <div className="print:hidden flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-slate-900 text-sm">Print Account Statement (A4 Layout)</h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Now</span>
                </button>
                <button
                  type="button"
                  onClick={closePrintStatementModal}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Printable Statement Sheet */}
            <div className="p-4 sm:p-6 border border-slate-300 rounded-xl print:border-none print:p-0 space-y-4 text-slate-900 font-sans">
              {/* Header: Logo + Address */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
                <div className="flex items-center gap-3">
                  <img 
                    src={GREEN_ENERGY_LOGO_BASE64} 
                    alt="Eco Green Solar" 
                    className="h-12 w-auto object-contain"
                  />
                  <div>
                    <h2 className="text-base font-black tracking-tight text-slate-900 uppercase">ECO GREEN SOLAR</h2>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Plot No. 4, Gajanand Industrial, Near RK Exotica, Lodhika-360021<br/>
                      Support Desk & Field Operations • info@ecogreensolar.co.in
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="text-xs font-black tracking-wider uppercase bg-slate-900 text-white px-2.5 py-1 rounded inline-block">
                    {ledgerData.statement?.perspective_title || (user?.role === 'technician' ? 'MY ACCOUNT STATEMENT' : 'TECHNICIAN ACCOUNT STATEMENT')}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    Date: {formatIndianDateOnly(new Date().toISOString())}
                  </p>
                </div>
              </div>

              {/* Specialist Meta Block */}
              <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Specialist Details</span>
                  <strong className="text-sm font-bold text-slate-900 block">{currentTech.name}</strong>
                  <span className="text-[11px] text-slate-600 font-mono">Phone: {currentTech.phone || 'N/A'}</span>
                  <span className="text-[11px] text-slate-600 block">Zone: {currentTech.area_zone || 'General Field Zone'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Statement Period</span>
                  <strong className="text-xs font-mono font-bold text-slate-900 block">
                    {statementFromDate ? formatIndianDateOnly(statementFromDate) : 'Beginning'} to {statementToDate ? formatIndianDateOnly(statementToDate) : 'Current Date'}
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Account: {user?.role === 'technician' ? 'My Tour Advances & Expenses' : 'Technician Tour Advance & Expense'}
                  </span>
                </div>
              </div>

              {/* Financial Summary Table */}
              <table className="w-full text-xs border border-slate-300 border-collapse mb-2">
                <thead>
                  <tr className="bg-slate-100 font-bold border-b border-slate-300 text-[10px] uppercase text-slate-700">
                    <th className="p-2 text-left border-r border-slate-300">Opening Balance</th>
                    <th className="p-2 text-right border-r border-slate-300">
                      {user?.role === 'technician' ? 'Advances Received (Credit)' : 'Total Advances (Debit)'}
                    </th>
                    <th className="p-2 text-right border-r border-slate-300">
                      {user?.role === 'technician' ? 'Approved Expenses (Debit)' : 'Approved Expenses (Credit)'}
                    </th>
                    <th className="p-2 text-right border-r border-slate-300">
                      {user?.role === 'technician' ? 'Returned to Co. (Debit)' : 'Returned (Credit)'}
                    </th>
                    <th className="p-2 text-right border-r border-slate-300">
                      {user?.role === 'technician' ? 'Reimbursements (Credit)' : 'Reimbursements (Debit)'}
                    </th>
                    <th className="p-2 text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-mono text-xs font-bold">
                    <td className="p-2 border-r border-slate-300">
                      {ledgerData.statement?.opening_balance_formatted || formatCur(ledgerData.statement?.opening_balance || 0)}
                    </td>
                    <td className="p-2 text-right border-r border-slate-300 text-blue-900">{formatCur(ledgerData.statement?.total_advances || 0)}</td>
                    <td className="p-2 text-right border-r border-slate-300 text-rose-900">{formatCur(ledgerData.statement?.total_approved_expenses || 0)}</td>
                    <td className="p-2 text-right border-r border-slate-300 text-emerald-800">{formatCur(ledgerData.statement?.total_returns || 0)}</td>
                    <td className="p-2 text-right border-r border-slate-300 text-indigo-900">{formatCur(ledgerData.statement?.total_reimbursements || 0)}</td>
                    <td className="p-2 text-right font-black text-sm">
                      {ledgerData.statement?.closing_balance_formatted || formatCur(Math.abs(ledgerData.statement?.closing_balance || 0))}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Prominent Position Box */}
              <div className="p-2.5 rounded-lg border-2 border-slate-800 bg-slate-50 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">FINAL ACCOUNT SETTLEMENT POSITION</span>
                <strong className="text-sm font-black tracking-wide text-slate-950 uppercase">
                  {ledgerData.statement?.status_label || ledgerData.statement?.position_label || 'SETTLED – ₹0 OUTSTANDING'}
                </strong>
              </div>

              {/* Detailed Transactions Table */}
              <table className="w-full text-[11px] border border-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-100 font-bold border-b border-slate-300 text-[10px] uppercase text-slate-700">
                    <th className="p-1.5 text-left border-r border-slate-300">Date</th>
                    <th className="p-1.5 text-left border-r border-slate-300">Reference</th>
                    <th className="p-1.5 text-left border-r border-slate-300">Ticket / Tour</th>
                    <th className="p-1.5 text-left border-r border-slate-300">Type</th>
                    <th className="p-1.5 text-left border-r border-slate-300">Particulars / Details</th>
                    <th className="p-1.5 text-right border-r border-slate-300">
                      {ledgerData.statement?.columns?.debit_header || (user?.role === 'technician' ? 'Debit (Expense/Return)' : 'Debit (Advance Given)')}
                    </th>
                    <th className="p-1.5 text-right border-r border-slate-300">
                      {ledgerData.statement?.columns?.credit_header || (user?.role === 'technician' ? 'Credit (Advance Recv)' : 'Credit (Expense/Return)')}
                    </th>
                    <th className="p-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-slate-50/50 italic text-slate-600">
                    <td className="p-1.5 border-r border-slate-300 font-mono">{statementFromDate ? formatIndianDateOnly(statementFromDate) : '-'}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono">B/F</td>
                    <td className="p-1.5 border-r border-slate-300">-</td>
                    <td className="p-1.5 border-r border-slate-300">Opening Balance</td>
                    <td className="p-1.5 border-r border-slate-300">Balance brought forward from prior period</td>
                    <td className="p-1.5 text-right border-r border-slate-300 font-mono">-</td>
                    <td className="p-1.5 text-right border-r border-slate-300 font-mono">-</td>
                    <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                      {ledgerData.statement?.opening_balance_formatted || formatCur(ledgerData.statement?.opening_balance || 0)}
                    </td>
                  </tr>

                  {(ledgerData.statement?.transactions || []).map((tx, idx) => (
                    <tr key={idx} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-300 font-mono whitespace-nowrap">
                        <div>{tx.date ? formatIndianDateOnly(tx.date) : '-'}</div>
                      </td>
                      <td className="p-1.5 border-r border-slate-300 font-mono font-bold">{tx.reference_no}</td>
                      <td className="p-1.5 border-r border-slate-300 font-mono">{tx.ticket_id || 'General'}</td>
                      <td className="p-1.5 border-r border-slate-300 font-semibold">{tx.type_label || tx.particulars || tx.transaction_type}</td>
                      <td className="p-1.5 border-r border-slate-300 max-w-[200px] truncate">{tx.particulars || tx.description}</td>
                      <td className="p-1.5 text-right border-r border-slate-300 font-mono font-bold text-blue-900">{tx.debit > 0 ? formatCur(tx.debit) : '—'}</td>
                      <td className="p-1.5 text-right border-r border-slate-300 font-mono font-bold text-emerald-900">{tx.credit > 0 ? formatCur(tx.credit) : '—'}</td>
                      <td className="p-1.5 text-right font-mono font-black whitespace-nowrap">
                        {formatCur(Math.abs(tx.running_balance))}
                        <span className="text-[9px] font-normal text-slate-600 ml-1">
                          {tx.balance_direction === 'Dr'
                            ? (user?.role === 'technician' ? 'Dr (Receivable)' : 'Dr (Recoverable)')
                            : (tx.balance_direction === 'Cr'
                                ? (user?.role === 'technician' ? 'Cr (To Return)' : 'Cr (Payable)')
                                : 'Settled')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 4 Official Office Signatures */}
              <div className="grid grid-cols-4 gap-4 pt-10 text-center text-[10px] font-bold text-slate-700">
                <div className="border-t border-slate-800 pt-1">Prepared By (Accounts)</div>
                <div className="border-t border-slate-800 pt-1">Checked & Verified By</div>
                <div className="border-t border-slate-800 pt-1">Approved By (Supervisor)</div>
                <div className="border-t border-slate-800 pt-1">Specialist / Receiver's Signature</div>
              </div>

              <div className="text-[9px] text-slate-400 text-center pt-2">
                Generated from Eco Green Solar CMS • Document is system audited and strictly reconciled with ledger books.
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {/* ================= LIGHTBOX PREVIEW ================= */}
      {receiptLightbox && (
        <div 
          onClick={() => setReceiptLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm cursor-zoom-out"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl p-4 flex flex-col"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">{receiptLightbox.name}</span>
                {receiptLightbox.urls?.length > 1 && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                    Bill {(receiptLightbox.index || 0) + 1} of {receiptLightbox.urls.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReceiptLightbox(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center relative min-h-[300px] bg-slate-50 rounded-xl">
              {receiptLightbox.urls?.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentIdx = receiptLightbox.index || 0;
                      const newIdx = (currentIdx - 1 + receiptLightbox.urls.length) % receiptLightbox.urls.length;
                      setReceiptLightbox(prev => ({
                        ...prev,
                        index: newIdx,
                        url: prev.urls[newIdx]
                      }));
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white text-slate-800 rounded-full shadow-lg border border-slate-200 z-10 cursor-pointer"
                    title="Previous Bill"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentIdx = receiptLightbox.index || 0;
                      const newIdx = (currentIdx + 1) % receiptLightbox.urls.length;
                      setReceiptLightbox(prev => ({
                        ...prev,
                        index: newIdx,
                        url: prev.urls[newIdx]
                      }));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white text-slate-800 rounded-full shadow-lg border border-slate-200 z-10 cursor-pointer"
                    title="Next Bill"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <img 
                src={receiptLightbox.url} 
                alt={receiptLightbox.name}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
            {receiptLightbox.urls?.length > 1 && (
              <div className="flex items-center gap-2 pt-3 overflow-x-auto">
                {receiptLightbox.urls.map((u, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReceiptLightbox(prev => ({ ...prev, index: idx, url: u }))}
                    className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all cursor-pointer ${
                      (receiptLightbox.index || 0) === idx ? 'border-emerald-600 ring-2 ring-emerald-200' : 'border-slate-200 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= IN-APP AUDIT CANCELLATION & REVERSAL MODAL (NO NATIVE CHROME PROMPT) ================= */}
      {cancelModalState.isOpen && (
        <div 
          className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !cancelModalState.submitting && setCancelModalState(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-rose-900 to-slate-900 text-white flex items-center justify-between border-b border-rose-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/10 text-rose-300 border border-white/10 shrink-0">
                  <XCircle className="w-5 h-5 text-rose-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white tracking-tight">{cancelModalState.title}</h3>
                  <p className="text-[11px] text-rose-200/80 font-mono mt-0.5">{cancelModalState.subtitle}</p>
                </div>
              </div>
              <button 
                type="button"
                disabled={cancelModalState.submitting}
                onClick={() => setCancelModalState(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-lg text-rose-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmCancelModal} className="p-5 space-y-4">
              {/* Transaction Detail Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Transaction Details
                  </span>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[10px] font-bold border border-rose-200 font-mono">
                    Ref: {cancelModalState.referenceNo}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Amount</span>
                    <span className="text-base font-black text-slate-900 font-mono flex items-center">
                      <IndianRupee className="w-4 h-4 text-slate-600 inline" />
                      {Number(cancelModalState.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Specialist</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {cancelModalState.technicianName}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60 text-[11px]">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Date & Time</span>
                    <span className="text-slate-700 font-medium">{cancelModalState.dateFormatted}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Purpose / Notes</span>
                    <span className="text-slate-700 font-medium truncate block" title={cancelModalState.purpose}>
                      {cancelModalState.purpose}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning Notice */}
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  {cancelModalState.warningText}
                </p>
              </div>

              {/* Reason Input with Quick Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <span>Reason for Cancellation</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400">Audit trail logged</span>
                </div>

                {/* Quick Presets Chips */}
                {cancelModalState.presetReasons?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500">Quick suggestions:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {cancelModalState.presetReasons.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCancelModalState(prev => ({ ...prev, reason: preset }))}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            cancelModalState.reason === preset
                              ? 'bg-rose-100 text-rose-900 border-rose-300 ring-1 ring-rose-400 shadow-2xs font-bold'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  rows={3}
                  required
                  autoFocus
                  value={cancelModalState.reason}
                  onChange={(e) => setCancelModalState(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Enter detailed reason for cancelling this entry (e.g. Tour cancelled due to emergency, wrong cash disbursement, duplicate record)..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500 text-slate-800 font-medium placeholder:text-slate-400 transition-all resize-none shadow-2xs"
                />
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={cancelModalState.submitting}
                  onClick={() => setCancelModalState(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Dismiss / Keep Active
                </button>
                <button
                  type="submit"
                  disabled={cancelModalState.submitting || !cancelModalState.reason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {cancelModalState.submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{cancelModalState.confirmText || 'Confirm Cancellation'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
