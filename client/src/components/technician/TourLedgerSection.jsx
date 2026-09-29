import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  IndianRupee, Plus, FileText, Download, Printer, Copy, Check, 
  Trash2, Eye, Upload, Filter, Calendar, CheckCircle2, Clock, 
  AlertCircle, ChevronRight, ChevronLeft, ChevronDown, X, ArrowUpRight, ArrowDownLeft, ShieldCheck,
  Building, User, Tag, Sparkles, Image as ImageIcon, ExternalLink, Loader2,
  Camera, Ticket, Edit2, Lock, RotateCcw
} from 'lucide-react';
import { formatIndianDateOnly } from '../common/TicketAgeBadge';
import { GREEN_ENERGY_LOGO_BASE64 } from '../../assets/greenEnergyLogo';

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

  // Selected technician filter: default to scoped tech if technician, or activeTechId, or 'all' if admin
  const [internalTechId, setInternalTechId] = useState(() => {
    if (!isAdminOrStaff && scopedTechProfile?.id) return String(scopedTechProfile.id);
    if (activeTechId && activeTechId !== 'all') return String(activeTechId);
    return 'all';
  });

  useEffect(() => {
    if (isAdminOrStaff) {
      if (activeTechId !== undefined) {
        setInternalTechId(String(activeTechId));
      }
    } else if (scopedTechProfile?.id) {
      setInternalTechId(String(scopedTechProfile.id));
    }
  }, [activeTechId, isAdminOrStaff, scopedTechProfile]);

  const selectedTechId = internalTechId;

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
      net_balance: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('expenses'); // 'expenses' | 'advances' | 'settlements'

  // Modals state
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    technician_id: '',
    amount: '',
    purpose: 'Tour Advance for Field Tasks',
    payment_mode: 'Cash',
    reference_no: ''
  });
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

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
      purpose: 'Tour Advance for Field Tasks',
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

    // Group strictly by ticket (or voucher if general tour without ticket)
    const ticketGroups = new Map();
    filtered.forEach(it => {
      const key = (it.ticket_id && String(it.ticket_id).trim())
        ? `tkt_${String(it.ticket_id).trim()}`
        : (it.voucher_no ? `vch_${it.voucher_no}` : `item_${it.id}`);

      if (!ticketGroups.has(key)) {
        ticketGroups.set(key, []);
      }
      ticketGroups.get(key).push(it);
    });

    const chunks = [];
    const chunkSize = 9;

    // Process each ticket's items into its dedicated voucher table(s)
    ticketGroups.forEach((ticketExps) => {
      // Merge same date + same category within this specific ticket for print/export
      const groupedItems = groupExpensesForPrint(ticketExps);

      for (let i = 0; i < groupedItems.length; i += chunkSize) {
        const chunkItems = groupedItems.slice(i, i + chunkSize);
        const chunkTotal = chunkItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

        // Consecutive sequential numbering starting from startingVoucherNo
        const vNo = `TT-${Number(startingVoucherNo) + chunks.length}`;

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

  const fetchLedger = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = (selectedTechId && selectedTechId !== 'all') ? { technician_id: selectedTechId } : {};
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
    const effectiveTechId = (!isAdminOrStaff && scopedTechProfile?.id) 
      ? scopedTechProfile.id 
      : (advanceForm.technician_id || (selectedTechId !== 'all' ? selectedTechId : null));
    if (!effectiveTechId) return showToast('Please select a specific technician before allocating advance', 'error');
    const amt = parseFloat(advanceForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid advance amount', 'error');

    const chosenTech = loadedTechs.find(t => String(t.id) === String(effectiveTechId)) || currentTech;

    try {
      setSubmittingAdvance(true);
      await api.allocateTourAdvance({
        technician_id: effectiveTechId,
        technician_name: chosenTech.name || 'Technician',
        amount: amt,
        purpose: advanceForm.purpose,
        tour_title: advanceForm.purpose,
        payment_mode: advanceForm.payment_mode,
        reference_no: advanceForm.reference_no,
        allocated_by_name: currentUser?.name || 'Admin Supervisor'
      });
      showToast(`₹${amt} tour advance allocated to ${chosenTech.name}!`, 'success');
      setIsAdvanceModalOpen(false);
      await fetchLedger(true);
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

      // Get latest global voucher sequence
      let vNo = null;
      try {
        const seqRes = await api.getNextVoucherSequence();
        if (seqRes && (seqRes.next_voucher_no || seqRes.next_seq)) {
          vNo = seqRes.next_voucher_no || `TT-${seqRes.next_seq}`;
        }
      } catch (_) {}

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
        return;
      }

      await api.addTourExpense({
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

      showToast(`Voucher for ${expenseForm.ticket_id || 'General Tour'} (${itemsPayload.length} items - ₹${expenseTotalSum}) saved successfully!`, 'success');
      setIsExpenseModalOpen(false);
      setEditingVoucherNo(null);
      await fetchLedger(true);
    } catch (err) {
      showToast('Failed to log expense: ' + err.message, 'error');
    } finally {
      setSubmittingExpense(false);
    }
  };


  // Handle Settle / Return Balance / Reimbursement
  const handleSettleBalance = async (e) => {
    e.preventDefault();
    const effectiveTechId = (!isAdminOrStaff && scopedTechProfile?.id) ? scopedTechProfile.id : (selectedTechId !== 'all' ? selectedTechId : null);
    if (!effectiveTechId) return showToast('Please select a specific technician first', 'error');
    const amt = parseFloat(settleForm.amount);
    if (!amt || amt <= 0) return showToast('Please enter a valid settlement amount', 'error');

    const isReimbursement = (summary.net_balance || 0) < 0;

    try {
      setSubmittingSettle(true);
      await api.settleTourBalance({
        technician_id: effectiveTechId,
        amount: amt,
        returned_amount: isReimbursement ? 0 : amt,
        reimbursed_amount: isReimbursement ? amt : 0,
        settlement_type: isReimbursement ? 'reimbursed_by_company' : 'return_to_company',
        payment_mode: settleForm.payment_mode,
        reference_no: settleForm.reference_no,
        notes: settleForm.notes,
        received_by_name: currentUser?.name || 'Admin Supervisor'
      });

      showToast(isReimbursement 
        ? `₹${amt} reimbursement to specialist recorded successfully!` 
        : `₹${amt} cash return to company recorded successfully!`, 
        'success'
      );
      setIsSettleModalOpen(false);
      setSettleForm({
        amount: '',
        settlement_type: 'return_to_company',
        payment_mode: 'Cash',
        reference_no: '',
        notes: ''
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
      const approverName = newStatus === 'approved' ? (currentUser?.name || currentUser?.username || 'Admin') : null;
      await api.updateTourExpenseStatus(expId, newStatus, '', approverName);
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

  // Approve all items in a voucher group
  const handleApproveVoucherGroup = async (group) => {
    try {
      const approverName = currentUser?.name || currentUser?.username || 'Admin';
      await Promise.all(group.items.map(it => api.updateTourExpenseStatus(it.id, 'approved', '', approverName)));
      showToast(`Voucher ${group.voucher_no} marked as approved by ${approverName}`, 'info');
      await fetchLedger(true);
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
    } catch (err) {
      showToast('Failed to delete voucher: ' + err.message, 'error');
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
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 3px;">
            <tr>
              <td style="width: 25%; vertical-align: middle;">
                <img src="${GREEN_ENERGY_LOGO_BASE64}" alt="Green ENERGY" style="height: 38px; width: auto; max-width: 100px; object-fit: contain; vertical-align: middle;" />
              </td>
              <td style="width: 45%; vertical-align: middle; font-size: 7.5pt; color: #1e293b; line-height: 1.3; padding-left: 6px;">
                Plot No. 4, Gajanand Industrial, Near RK Exotica,<br/>
                Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021
              </td>
              <td style="width: 30%; vertical-align: middle; text-align: right; font-size: 8.5pt; line-height: 1.3;">
                <b>Voucher No :</b> ${chunk.voucherNo}<br/>
                <b>Date :</b> ${chunk.date}
              </td>
            </tr>
          </table>

          <!-- Name & Account with Ticket No on Right -->
          <div style="font-size: 8.5pt; margin: 3px 0 2px 0; border-top: 1px solid #cbd5e1; border-bottom: 1px dotted #cbd5e1; padding: 2px 0;">
            <b>Name :</b> ${techName}
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 3px; font-size: 8.5pt;">
            <tr>
              <td style="width: 60%; vertical-align: middle;">
                <b>Account :</b> TECHNICIAN TOUR EXPENSES
              </td>
              <td style="width: 40%; vertical-align: middle; text-align: right;">
                <b>Ticket No :</b> ${chunk.ticketId || 'General Tour'}
              </td>
            </tr>
          </table>

          <!-- Particulars & Amount Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 3px;">
            <thead>
              <tr style="border-bottom: 1.5px solid #000; background: #f8fafc;">
                <th style="padding: 2px 6px; border-right: 1.5px solid #000; text-align: center; font-size: 8.5pt; width: 75%;">Particulars</th>
                <th style="padding: 2px 6px; text-align: center; font-size: 8.5pt; width: 25%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="border-top: 1.5px solid #000; font-weight: bold; background: #f8fafc; height: 22px;">
                <td style="padding: 2px 6px; border-right: 1.5px solid #000; text-align: right; font-size: 8.5pt;">Total:</td>
                <td style="padding: 2px 6px; text-align: right; font-size: 8.5pt;">₹${Number(chunk.total || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Amount in Word -->
          <div style="font-size: 8pt; margin: 2px 0 6px 0; border-bottom: 1px dotted #94a3b8; padding-bottom: 2px;">
            <b>Amount in Word :</b> ${numberToIndianWords(chunk.total)}
          </div>

          <!-- 4 Signatures -->
          <table style="width: 100%; margin-top: 12px; border-collapse: collapse;">
            <tr>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 1px solid #334155; padding-top: 3px; vertical-align: top;">Authorized Signature</td>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 1px solid #334155; padding-top: 3px; vertical-align: top;">
                ${chunk.isApproved ? `
                  <div style="font-weight: bold; font-size: 8pt; color: #166534; text-transform: uppercase; line-height: 1.2;">APPROVED BY</div>
                  <div style="font-weight: bold; font-size: 7.5pt; color: #1e293b; margin-top: 2px;">(${chunk.approverName || 'Admin'})</div>
                ` : `
                  <div style="font-weight: bold; font-size: 8pt; color: #dc2626; text-transform: uppercase;">UNAPPROVED</div>
                `}
              </td>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 1px solid #334155; padding-top: 3px; vertical-align: top;">Paid by</td>
              <td style="width: 25%; text-align: center; font-size: 7.5pt; border-top: 1px solid #334155; padding-top: 3px; vertical-align: top;">Receiver's Signature</td>
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
  const computedApprovedExpenses = useMemo(() => expenses.filter(e => e.status !== 'Rejected' && e.status !== 'rejected').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [expenses]);
  const computedTotalReturned = useMemo(() => settlements.filter(s => s.settlement_type === 'return_to_company').reduce((s, s1) => s + (parseFloat(s1.returned_amount || s1.amount) || 0), 0), [settlements]);
  const computedTotalReimbursed = useMemo(() => settlements.filter(s => s.settlement_type === 'reimbursed_by_company').reduce((s, s1) => s + (parseFloat(s1.reimbursed_amount || s1.amount) || 0), 0), [settlements]);
  const computedNetBalance = useMemo(() => (computedTotalAdvance + computedTotalReimbursed) - (computedApprovedExpenses + computedTotalReturned), [computedTotalAdvance, computedTotalReimbursed, computedApprovedExpenses, computedTotalReturned]);

  const summary = useMemo(() => {
    const rawAdv = ledgerData.summary?.total_advance ?? ledgerData.summary?.totalAdvance;
    const rawExp = ledgerData.summary?.approved_expenses ?? ledgerData.summary?.totalExpenses ?? ledgerData.summary?.total_expenses;
    const rawRet = ledgerData.summary?.total_returned ?? ledgerData.summary?.totalReturned;
    const rawReimb = ledgerData.summary?.total_reimbursed ?? ledgerData.summary?.totalReimbursed;
    const rawBal = ledgerData.summary?.net_balance ?? ledgerData.summary?.currentBalance;

    return {
      total_advance: (rawAdv !== undefined && rawAdv !== null && Number(rawAdv) > 0) ? Number(rawAdv) : computedTotalAdvance,
      approved_expenses: (rawExp !== undefined && rawExp !== null && Number(rawExp) > 0) ? Number(rawExp) : computedApprovedExpenses,
      total_returned: (rawRet !== undefined && rawRet !== null && Number(rawRet) > 0) ? Number(rawRet) : computedTotalReturned,
      total_reimbursed: (rawReimb !== undefined && rawReimb !== null && Number(rawReimb) > 0) ? Number(rawReimb) : computedTotalReimbursed,
      net_balance: (rawBal !== undefined && rawBal !== null && (rawAdv || rawExp || rawRet)) ? Number(rawBal) : computedNetBalance
    };
  }, [ledgerData.summary, computedTotalAdvance, computedApprovedExpenses, computedTotalReturned, computedTotalReimbursed, computedNetBalance]);

  const openSettleModal = () => {
    const isReimbursement = (summary.net_balance || 0) < 0;
    const absBal = Math.abs(summary.net_balance || 0);
    setSettleForm({
      amount: absBal > 0 ? String(absBal) : '',
      settlement_type: isReimbursement ? 'reimbursed_by_company' : 'return_to_company',
      payment_mode: isReimbursement ? 'UPI / Bank Transfer' : 'Cash',
      reference_no: '',
      notes: isReimbursement 
        ? 'Reimbursement paid to specialist for out-of-pocket tour expenses' 
        : 'Tour surplus cash returned back to company'
    });
    setIsSettleModalOpen(true);
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
                  <option value="all">👥 All Specialists (Consolidated)</option>
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
                if (selectedVoucherKeys.size > 0) {
                  setPrintFilter('selected');
                } else {
                  setPrintFilter('all');
                }
                setIsVoucherModalOpen(true);
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
            </div>
          </>
        )}
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
            <span>Expense Vouchers & Bills ({voucherLogs.length})</span>
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
                                grp.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                grp.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
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
                                  className="p-1 hover:bg-blue-100 text-blue-700 rounded transition-colors cursor-pointer"
                                  title="Print / Preview this Voucher slip"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                {grp.status === 'approved' ? (
                                  <>
                                    <span 
                                      className="p-1 text-emerald-600/70 cursor-not-allowed" 
                                      title="Approved voucher is locked"
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </span>
                                    {isAdminOrStaff && (
                                      <button
                                        type="button"
                                        onClick={() => handleRevertVoucherGroup(grp)}
                                        className="p-1 hover:bg-amber-100 text-amber-700 rounded transition-colors cursor-pointer"
                                        title="Unapprove / Revert to Submitted (Unlock for editing)"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openEditExpenseModal(grp)}
                                    className="p-1 hover:bg-amber-100 text-amber-700 rounded transition-colors cursor-pointer"
                                    title="Edit Voucher Claim (Before Approval)"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {isAdminOrStaff && grp.status !== 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveVoucherGroup(grp)}
                                    className="p-1 hover:bg-emerald-100 text-emerald-700 rounded transition-colors cursor-pointer"
                                    title="Approve all items in voucher"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVoucherGroup(grp)}
                                  className="p-1 hover:bg-rose-100 text-rose-600 rounded transition-colors cursor-pointer"
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
                {isAdminOrStaff && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Select Specialist / Technician *
                    </label>
                    <select
                      required
                      value={expenseForm.technician_id}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, technician_id: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800 cursor-pointer"
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
                      Is ticket ke sabhi expenses ek single dedicated voucher slip par aayenge.
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
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-800">
                    Voucher Receipts / Bill Proofs (Upload Together)
                  </label>
                  <span className="text-[10px] text-slate-500">Optional (Camera / Photos / PDF)</span>
                </div>

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
      {isSettleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <IndianRupee className={`w-4 h-4 ${summary.net_balance < 0 ? 'text-blue-600' : 'text-emerald-600'}`} />
                <span>
                  {summary.net_balance < 0 
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
              {summary.net_balance < 0 ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-blue-800">Amount Company Owes Specialist:</span>
                    <strong className="font-mono font-bold text-blue-950 text-sm">{formatCur(Math.abs(summary.net_balance))}</strong>
                  </div>
                  <p className="text-[10px] text-blue-700">
                    Specialist ne tour par apni jeb se advance se zyada kharch kiya hai. Company yeh amount specialist ko pay / reimburse karegi.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-800">Current Tour Surplus Cash:</span>
                    <strong className="font-mono font-bold text-emerald-950 text-sm">{formatCur(summary.net_balance)}</strong>
                  </div>
                  <p className="text-[10px] text-emerald-700">
                    Specialist tour complete hone ke baad bacha hua company cash return kar raha hai.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {summary.net_balance < 0 ? 'Reimbursement / Payout Amount (₹) *' : 'Deposit / Return Amount (₹) *'}
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
                  {summary.net_balance < 0 ? (
                    <>
                      <option value="UPI / Bank Transfer">UPI / Online Bank Transfer to Specialist</option>
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
                    summary.net_balance < 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submittingSettle && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {submittingSettle 
                      ? 'Saving...' 
                      : (summary.net_balance < 0 ? 'Confirm Payout to Specialist' : 'Confirm Cash Return')}
                  </span>
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

            {/* Print Selection & Status Filter Bar */}
            <div className="bg-slate-900 px-4 py-2 text-white flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 text-xs">
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200">
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
                  }
                  body * {
                    visibility: hidden !important;
                  }
                  #tour-voucher-print-area, #tour-voucher-print-area * {
                    visibility: visible !important;
                  }
                  #tour-voucher-print-area {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  .voucher-page-pair {
                    box-sizing: border-box !important;
                    height: 284mm !important;
                    max-height: 284mm !important;
                    page-break-after: always !important;
                    break-after: page !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-between !important;
                    margin-bottom: 0 !important;
                    padding-bottom: 0 !important;
                  }
                  .voucher-page-pair:last-child {
                    page-break-after: auto !important;
                    break-after: auto !important;
                  }
                  .voucher-slip-card {
                    box-sizing: border-box !important;
                    height: 136mm !important;
                    max-height: 136mm !important;
                    border: 1.5px solid #000 !important;
                    padding: 4.5mm 6.5mm !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-between !important;
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

                      return (
                        <React.Fragment key={chunk.voucherNo + '-' + cIdx}>
                          {/* Physical Voucher Slip Card */}
                          <div className="voucher-slip-card bg-white border-2 border-black p-3.5 sm:p-4.5 shadow-sm rounded-none font-sans text-slate-900 relative">
                            {/* Header: Green Energy Logo + Address + Voucher No & Date */}
                            <div className="grid grid-cols-12 gap-2 pb-2 mb-1.5 border-b border-slate-200">
                              {/* Logo */}
                              <div className="col-span-3 flex items-center justify-start">
                                <img 
                                  src={GREEN_ENERGY_LOGO_BASE64} 
                                  alt="Green ENERGY" 
                                  className="h-10 w-auto max-w-[110px] object-contain"
                                />
                              </div>

                              {/* Address */}
                              <div className="col-span-6 text-[9.5px] text-slate-700 leading-tight flex flex-col justify-center border-l border-slate-200 pl-2.5">
                                <p className="font-semibold text-slate-800">Plot No. 4, Gajanand Industrial, Near RK Exotica,</p>
                                <p>Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021</p>
                              </div>

                              {/* Voucher No & Date */}
                              <div className="col-span-3 text-right text-xs leading-tight flex flex-col justify-center">
                                <p className="font-bold text-slate-900">
                                  Voucher No : <span className="font-mono text-emerald-800 text-xs font-black">{chunk.voucherNo}</span>
                                </p>
                                <p className="text-[10px] text-slate-700 mt-0.5">
                                  Date : <span className="font-mono font-semibold">{chunk.date}</span>
                                </p>
                              </div>
                            </div>

                            {/* Name & Account */}
                            <div className="text-[10px] space-y-0.5 mb-1.5">
                              <div className="flex items-baseline gap-2">
                                <span className="font-bold text-slate-900 shrink-0">Name :</span>
                                <span className="font-semibold text-slate-800 border-b border-dotted border-slate-400 flex-1 pb-0.5">
                                  {currentTech.name} {currentTech.phone ? `(${currentTech.phone})` : ''}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-bold text-slate-900 shrink-0">Account :</span>
                                  <span className="font-bold text-slate-900 uppercase tracking-wide">
                                    TECHNICIAN TOUR EXPENSES
                                  </span>
                                </div>
                                <div className="flex items-baseline gap-1 text-[10px]">
                                  <span className="font-bold text-slate-700">Ticket No :</span>
                                  <span className="font-mono font-bold text-blue-900">
                                    {chunk.ticketId || 'General Tour'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Particulars & Amount Table (11 Rows: 1 Heading + 9 Entries + 1 Total) */}
                            <div className="border-[1.5px] border-black mb-1.5">
                              <div className="grid grid-cols-12 bg-slate-50 border-b-[1.5px] border-black text-[10px] font-bold text-center">
                                <div className="col-span-9 p-0.5 border-r-[1.5px] border-black uppercase text-[9.5px]">
                                  Particulars
                                </div>
                                <div className="col-span-3 p-0.5 uppercase text-[9.5px]">
                                  Amount
                                </div>
                              </div>

                              {/* Item Rows (up to 9 entries) */}
                              <div className="divide-y divide-slate-200 text-[10px]">
                                {items.map((item, iIdx) => (
                                  <div key={item.id || iIdx} className="grid grid-cols-12 min-h-[19px] items-center">
                                    <div className="col-span-9 px-2 py-0.5 border-r-[1.5px] border-black font-medium text-slate-800 leading-tight">
                                      <span className="font-semibold">{item.category}</span>
                                      {item.description ? (
                                        <span className="text-slate-600 text-[9px] ml-1">({item.description})</span>
                                      ) : (item.title && item.title.toLowerCase() !== (item.category || '').toLowerCase() ? (
                                        <span className="text-slate-600 text-[9px] ml-1">- {item.title}</span>
                                      ) : null)}
                                    </div>
                                    <div className="col-span-3 px-2 py-0.5 text-right font-mono font-bold text-slate-900">
                                      ₹{Number(item.amount || 0).toFixed(2)}
                                    </div>
                                  </div>
                                ))}

                                {/* Blank padding rows to fit 9 entries perfectly */}
                                {Array.from({ length: emptySlots }).map((_, bIdx) => (
                                  <div key={'blank-' + bIdx} className="grid grid-cols-12 h-[19px] items-center">
                                    <div className="col-span-9 px-2 py-0.5 border-r-[1.5px] border-black text-slate-300 select-none">
                                      &nbsp;
                                    </div>
                                    <div className="col-span-3 px-2 py-0.5 text-right font-mono text-slate-300 select-none">
                                      &nbsp;
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Total Row */}
                              <div className="grid grid-cols-12 bg-slate-50 border-t-[1.5px] border-black font-bold text-[10.5px]">
                                <div className="col-span-9 px-2 py-0.5 border-r-[1.5px] border-black text-right uppercase">
                                  Total:
                                </div>
                                <div className="col-span-3 px-2 py-0.5 text-right font-mono text-xs text-emerald-900 font-black">
                                  ₹{Number(chunk.total || 0).toFixed(2)}
                                </div>
                              </div>
                            </div>

                            {/* Amount in Word */}
                            <div className="text-[10px] mb-2 leading-tight">
                              <span className="font-bold text-slate-900">Amount in Word : </span>
                              <span className="font-semibold text-slate-800 border-b border-dotted border-slate-400 pb-0.5 italic">
                                {numberToIndianWords(chunk.total)}
                              </span>
                            </div>

                            {/* 4 Signatures */}
                            <div className="grid grid-cols-4 gap-2 pt-2.5 text-center text-[9px] text-slate-700">
                              <div className="border-t border-slate-700 pt-0.5 font-semibold">
                                Authorized Signature
                              </div>
                              <div className="border-t border-slate-700 pt-0.5 font-semibold leading-tight">
                                {chunk.isApproved ? (
                                  <div>
                                    <div className="text-[8.5px] font-bold text-emerald-800 uppercase tracking-wide">
                                      APPROVED BY
                                    </div>
                                    <div className="text-[8px] font-bold text-slate-800 mt-0.5">
                                      ({chunk.approverName || 'Admin'})
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[8.5px] font-bold text-rose-600 uppercase tracking-wider">
                                    UNAPPROVED
                                  </div>
                                )}
                              </div>
                              <div className="border-t border-slate-700 pt-0.5 font-semibold">
                                Paid by
                              </div>
                              <div className="border-t border-slate-700 pt-0.5 font-semibold">
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
    </div>
  );
};
