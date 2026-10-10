import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  Wrench, Phone, MessageCircle, MapPin, CheckCircle, Clock, 
  Calendar, Upload, AlertTriangle, ArrowRight, RefreshCw, Star,
  Search, X, IndianRupee, ChevronDown, ChevronUp, CheckCheck,
  UserCheck, ShieldCheck, Layers, ExternalLink, RotateCcw,
  LayoutGrid, List, Navigation, FileText, Users, Download
} from 'lucide-react';
import { TicketAgeBadge, getTicketAgeInfo, formatIndianDateOnly, formatIndianTimeOnly, formatIndianDateTime } from '../common/TicketAgeBadge';
import { buildTechnicianCustomerWhatsApp } from '../../utils/templateUtils';
import { TourLedgerSection } from './TourLedgerSection';
import { subscribeLiveSync, broadcastTechniciansUpdate } from '../../utils/liveSync';
import { getUrlParam, updateUrlParams } from '../../utils/urlSync';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

const checkHasLocation = (job) => {
  if (!job) return false;
  const invalid = ['n/a', 'na', '-', 'none', 'null', 'undefined', ''];
  const hasUrl = Boolean(job.location_url && job.location_url.trim() && !invalid.includes(job.location_url.trim().toLowerCase()));
  const hasAddr = Boolean(job.customer_address && job.customer_address.trim() && !invalid.includes(job.customer_address.trim().toLowerCase()));
  const hasCity = Boolean(job.city && job.city.trim() && !invalid.includes(job.city.trim().toLowerCase()));
  return hasUrl || hasAddr || hasCity;
};

export const TechnicianFieldPortal = ({ onSelectComplaint, activeSection = 'field_ops', onSectionChange }) => {
  const { currentUser } = useAuth();
  const { showToast, confirm } = useDialog();
  const [complaints, setComplaints] = useState([]);
  const [technicians, setTechnicians] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('egs_cached_technicians') || '[]');
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch (_) {}
    return [];
  });
  const [loading, setLoading] = useState(true);

  const getInitialSection = () => {
    const s = (getUrlParam('section') || activeSection || 'field_ops').toLowerCase();
    if (['collection', 'field_ops', 'tour_ledger'].includes(s)) return s;
    if (['ledger', 'statement', 'expenses', 'advances', 'settlements', 'vouchers', 'voucher'].includes(s)) return 'tour_ledger';
    return 'field_ops';
  };

  const getInitialJobStatus = () => {
    const st = getUrlParam('status');
    if (!st) return 'Assigned';
    const valid = ['Assigned', 'In Progress', 'On Hold', 'Reopened', 'Completed', 'all', 'Overdue'];
    const found = valid.find(v => v.toLowerCase() === st.toLowerCase());
    return found || 'Assigned';
  };

  const getInitialTechId = () => {
    const urlId = getUrlParam('tech_id');
    if (urlId && urlId !== 'all') return urlId;
    try {
      const cached = JSON.parse(localStorage.getItem('egs_cached_technicians') || '[]');
      if (Array.isArray(cached) && cached.length > 0) return String(cached[0].id);
    } catch (_) {}
    return '';
  };

  const [section, setSection] = useState(() => getInitialSection());
  const [jobStatusFilter, setJobStatusFilter] = useState(() => getInitialJobStatus());
  const [productFilter, setProductFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [collectionSearchTerm, setCollectionSearchTerm] = useState('');
  const [products, setProducts] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('egs_cached_products') || '[]');
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch (_) {}
    return [
      { id: '1', name: 'Solar Rooftop Systems' },
      { id: '2', name: 'Solar Water Heaters' },
      { id: '3', name: 'Heat Pumps' },
      { id: '4', name: 'Pressure Pumps' },
      { id: '6', name: 'SITE SURVEY' }
    ];
  });
  const [techProfile, setTechProfile] = useState(null);
  const [selectedAdminTechId, setSelectedAdminTechId] = useState(() => getInitialTechId());

  // Mobile & Desktop view mode: default 'card'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('egs_tech_view_mode') || 'card';
    } catch {
      return 'card';
    }
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('egs_tech_view_mode', mode);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeSection && activeSection !== section) {
      setSection(activeSection);
    }
  }, [activeSection]);

  const handleSectionSwitch = (newSec) => {
    setSection(newSec);
    if (onSectionChange) onSectionChange(newSec);
    updateUrlParams({ section: newSec === 'field_ops' ? null : newSec });
  };

  const handleJobStatusFilterChange = (st) => {
    setJobStatusFilter(st);
    updateUrlParams({ status: st === 'Assigned' ? null : st });
  };

  // --- HIERARCHICAL STAGE ESCAPE HANDLERS FOR TECHNICIAN ---
  // Stage 1: Clear search queries
  useEscapeHandler(() => {
    if (searchTerm) { setSearchTerm(''); return true; }
    if (collectionSearchTerm) { setCollectionSearchTerm(''); return true; }
    return false;
  }, Boolean(searchTerm || collectionSearchTerm), { priority: ESCAPE_PRIORITY.SUBVIEW });

  // Stage 2: Step back from sub-section (ledger, inventory, etc.) to 'field_ops'
  useEscapeHandler(() => {
    if (searchTerm || collectionSearchTerm) return false;
    handleSectionSwitch('field_ops');
    return true;
  }, Boolean(section !== 'field_ops'), { priority: ESCAPE_PRIORITY.SUBVIEW });

  const handleAdminTechSelect = (id) => {
    if (!id) return;
    setSelectedAdminTechId(id);
    updateUrlParams({ tech_id: id });
  };

  useEffect(() => {
    const handlePop = () => {
      const s = getInitialSection();
      setSection(s);
      const st = getInitialJobStatus();
      setJobStatusFilter(st);
      const tid = getUrlParam('tech_id');
      setSelectedAdminTechId(tid || getInitialTechId());
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const getStageBorderClass = (status, isOverdue) => {
    if (isOverdue) return '!border-t-rose-500 sm:!border-t-transparent sm:!border-l-rose-500';
    switch (status) {
      case 'Resolved': return '!border-t-emerald-600 sm:!border-t-transparent sm:!border-l-emerald-600';
      case 'Closed': return '!border-t-slate-500 sm:!border-t-transparent sm:!border-l-slate-500';
      case 'In Progress': return '!border-t-blue-600 sm:!border-t-transparent sm:!border-l-blue-600';
      case 'On Hold': return '!border-t-purple-500 sm:!border-t-transparent sm:!border-l-purple-500';
      case 'Assigned': return '!border-t-blue-500 sm:!border-t-transparent sm:!border-l-blue-500';
      case 'Reopened': return '!border-t-rose-500 sm:!border-t-transparent sm:!border-l-rose-500';
      default: return '!border-t-amber-500 sm:!border-t-transparent sm:!border-l-amber-500';
    }
  };

  // Cash Reconciliation UI States
  const [expandedTechId, setExpandedTechId] = useState(null);
  const [settlingAction, setSettlingAction] = useState(false);

  const fetchMyJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.getComplaints({});
      setComplaints(data.complaints || []);
    } catch (err) {
      if (!silent) console.error('Failed to load technician jobs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchTechniciansList = async () => {
    try {
      const data = await api.getTechnicians();
      const techs = data.technicians || [];
      setTechnicians(techs);
      try {
        localStorage.setItem('egs_cached_technicians', JSON.stringify(techs));
      } catch (_) {}
      if (techs.length > 0) {
        setSelectedAdminTechId(prev => {
          if (prev && prev !== 'all' && techs.some(t => String(t.id) === String(prev))) {
            return String(prev);
          }
          return String(techs[0].id);
        });
      }
      const userPhoneClean = (currentUser?.phone || '').replace(/[^0-9]/g, '').slice(-10);
      const match = techs.find(t => {
        const tPhoneClean = (t.phone || '').replace(/[^0-9]/g, '').slice(-10);
        return (
          (currentUser?.technician_id && String(t.id) === String(currentUser.technician_id)) ||
          (currentUser?.technicianId && String(t.id) === String(currentUser.technicianId)) ||
          (currentUser?.id && t.user_id && String(t.user_id) === String(currentUser.id)) ||
          (userPhoneClean && tPhoneClean && userPhoneClean === tPhoneClean) ||
          (currentUser?.email && t.email?.toLowerCase() === currentUser.email?.toLowerCase()) ||
          (currentUser?.name && t.name?.toLowerCase() === currentUser.name?.toLowerCase())
        );
      }) || (currentUser?.role === 'technician' ? {
        id: currentUser?.technician_id || currentUser?.id,
        name: currentUser?.name || 'Technician',
        phone: currentUser?.phone || '',
        is_available: 1
      } : techs[0]);
      setTechProfile(match);
    } catch (e) {
      console.error('Failed to load tech profile:', e);
    }
  };

  const fetchProductsList = async () => {
    try {
      const res = await api.getProducts();
      if (res && Array.isArray(res.products) && res.products.length > 0) {
        setProducts(res.products);
        try {
          localStorage.setItem('egs_cached_products', JSON.stringify(res.products));
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Failed to load products in tech portal:', e);
    }
  };

  useEffect(() => {
    fetchMyJobs();
    fetchTechniciansList();
    fetchProductsList();

    // Resilient background interval (polls every 5s when tab is active)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchMyJobs(true);
        fetchProductsList();
      }
    }, 5000);

    const handleSync = () => {
      fetchMyJobs(true);
      fetchTechniciansList();
      fetchProductsList();
    };

    // Real-Time Live Sync across tabs, windows, and roles without browser refresh
    const unsubscribe = subscribeLiveSync(['complaints', 'ledger', 'techs', 'catalog'], handleSync);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [currentUser]);

  const handleToggleDuty = async () => {
    if (!techProfile) return;
    try {
      const newStatus = !techProfile.is_available;
      await api.updateTechnicianAvailability(techProfile.id, newStatus);
      setTechProfile(prev => ({ ...prev, is_available: newStatus ? 1 : 0 }));
      broadcastTechniciansUpdate({ techId: techProfile.id, is_available: newStatus ? 1 : 0 });
      showToast(newStatus ? 'Duty status set to: ON DUTY' : 'Duty status set to: OFF DUTY', 'info');
    } catch (err) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  // Collect All cash from a single technician
  const handleBatchSettle = async (tech, cashDue) => {
    const ok = await confirm({
      title: 'Collect Full Technician Balance',
      message: `Confirm collecting all ₹${cashDue} cash from technician "${tech.name}" and depositing into company accounts?`,
      type: 'payment',
      confirmText: `Collect ₹${cashDue}`,
      cancelText: 'Cancel'
    });

    if (!ok) return;

    try {
      setSettlingAction(true);
      const res = await api.settleAllTechnicianComplaints(tech.id);
      showToast(`Successfully collected ₹${res.totalAmount || cashDue} from ${tech.name} across ${res.settledCount || 0} tickets!`, 'success');
      await fetchMyJobs();
      await fetchTechniciansList();
    } catch (err) {
      showToast('Failed to settle technician balance: ' + err.message, 'error');
    } finally {
      setSettlingAction(false);
    }
  };

  // Collect cash for one specific complaint
  const handleSingleSettle = async (e, comp, tech) => {
    e.stopPropagation();
    const amount = comp.payment_collected || 0;
    const ok = await confirm({
      title: 'Collect Ticket Cash Deposit',
      message: `Confirm receiving ₹${amount} cash from technician "${tech?.name || 'Assigned Tech'}" for Ticket #${comp.ticket_id} into company account?`,
      type: 'payment',
      confirmText: `Receive ₹${amount}`,
      cancelText: 'Cancel'
    });

    if (!ok) return;

    try {
      setSettlingAction(true);
      await api.settleCompanyPayment(comp.id, {
        notes: `Settled by ${currentUser?.name || 'Admin'} from Field View`,
        amount_received: amount
      });
      showToast(`Received ₹${amount} for Ticket #${comp.ticket_id} into company account!`, 'success');
      await fetchMyJobs();
      await fetchTechniciansList();
    } catch (err) {
      showToast('Failed to record settlement: ' + err.message, 'error');
    } finally {
      setSettlingAction(false);
    }
  };

  // Compute Technician Cash Breakdown
  const techCashBreakdown = technicians.map(tech => {
    // Only primary technician is responsible for on-site cash collection & register accounting
    const techJobs = complaints.filter(c => 
      String(c.assigned_technician_id) === String(tech.id) || 
      String(c.technician_id) === String(tech.id) ||
      (c.technician_name && tech.name && c.technician_name.trim().toLowerCase() === tech.name.trim().toLowerCase())
    );
    const cashJobs = techJobs.filter(c => (parseFloat(c.payment_collected) || 0) > 0);
    const computedTotal = cashJobs.reduce((sum, c) => sum + (parseFloat(c.payment_collected) || 0), 0);
    const computedSettled = cashJobs
      .filter(c => c.company_settlement_status === 'Settled with Company')
      .reduce((sum, c) => sum + (parseFloat(c.payment_collected) || 0), 0);
    const computedDue = Math.max(0, computedTotal - computedSettled);
    const pendingJobs = cashJobs.filter(c => c.company_settlement_status !== 'Settled with Company');

    // Prefer live backend aggregated cash values if present, else fallback to loaded complaints
    const totalCollected = (tech.total_collected !== undefined && tech.total_collected !== null)
      ? parseFloat(tech.total_collected)
      : computedTotal;
    const totalSettled = (tech.total_settled_with_company !== undefined && tech.total_settled_with_company !== null)
      ? parseFloat(tech.total_settled_with_company)
      : computedSettled;
    const cashInHandDue = (tech.cash_in_hand_due !== undefined && tech.cash_in_hand_due !== null)
      ? parseFloat(tech.cash_in_hand_due)
      : computedDue;

    return {
      ...tech,
      cashJobs,
      totalCollected,
      totalSettled,
      cashInHandDue,
      pendingJobs
    };
  });

  // Scoped Technician Profiles
  const userPhoneClean = (currentUser?.phone || '').replace(/[^0-9]/g, '').slice(-10);
  const myTechData = techCashBreakdown.find(t => {
    const tPhoneClean = (t.phone || '').replace(/[^0-9]/g, '').slice(-10);
    return (
      (currentUser?.technician_id && String(t.id) === String(currentUser.technician_id)) ||
      (currentUser?.technicianId && String(t.id) === String(currentUser.technicianId)) ||
      (techProfile && String(t.id) === String(techProfile.id)) ||
      (currentUser?.id && t.user_id && String(t.user_id) === String(currentUser.id)) ||
      (userPhoneClean && tPhoneClean && userPhoneClean === tPhoneClean) ||
      (currentUser?.email && t.email?.toLowerCase() === currentUser.email?.toLowerCase()) ||
      (currentUser?.name && t.name?.toLowerCase() === currentUser.name?.toLowerCase())
    );
  }) || (currentUser?.role === 'technician' ? {
    id: currentUser?.technician_id || currentUser?.id,
    name: currentUser?.name || 'Technician',
    phone: currentUser?.phone || '',
    cashJobs: [],
    totalCollected: 0,
    totalSettled: 0,
    cashInHandDue: 0,
    pendingJobs: []
  } : techCashBreakdown[0]);

  const visibleTechs = useMemo(() => {
    if (currentUser?.role === 'technician') {
      return myTechData ? [myTechData] : [];
    }
    const targetId = (selectedAdminTechId && selectedAdminTechId !== 'all') 
      ? selectedAdminTechId 
      : (technicians[0]?.id ? String(technicians[0].id) : null);
    if (targetId) {
      const match = techCashBreakdown.filter(t => String(t.id) === String(targetId));
      if (match.length > 0) return match;
    }
    return techCashBreakdown.length > 0 ? [techCashBreakdown[0]] : [];
  }, [currentUser?.role, myTechData, selectedAdminTechId, techCashBreakdown, technicians]);

  // Grand totals across all technicians (for admin/staff)
  const overallCashCollected = techCashBreakdown.reduce((sum, t) => sum + t.totalCollected, 0);
  const overallCashSettled = techCashBreakdown.reduce((sum, t) => sum + t.totalSettled, 0);
  const overallCashDue = techCashBreakdown.reduce((sum, t) => sum + t.cashInHandDue, 0);

  // Scoped complaints: strictly scoped to the active selected technician
  const scopedComplaints = useMemo(() => {
    if (currentUser?.role === 'technician' && myTechData) {
      return complaints.filter(c => 
        String(c.assigned_technician_id) === String(myTechData.id) || 
        String(c.technician_id) === String(myTechData.id) ||
        String(c.secondary_technician_id) === String(myTechData.id) ||
        String(c.resolved_by_technician_id) === String(myTechData.id) ||
        (c.technician_name && myTechData.name && c.technician_name.trim().toLowerCase() === myTechData.name.trim().toLowerCase()) ||
        (c.secondary_technician_name && myTechData.name && c.secondary_technician_name.trim().toLowerCase() === myTechData.name.trim().toLowerCase())
      );
    }
    const targetTechId = (selectedAdminTechId && selectedAdminTechId !== 'all') 
      ? selectedAdminTechId 
      : (technicians[0]?.id ? String(technicians[0].id) : null);
    if (targetTechId) {
      const selectedTechObj = technicians.find(t => String(t.id) === String(targetTechId));
      const sName = selectedTechObj?.name?.trim().toLowerCase();
      return complaints.filter(c => 
        String(c.assigned_technician_id) === String(targetTechId) || 
        String(c.technician_id) === String(targetTechId) ||
        String(c.secondary_technician_id) === String(targetTechId) ||
        String(c.resolved_by_technician_id) === String(targetTechId) ||
        (sName && c.technician_name && c.technician_name.trim().toLowerCase() === sName) ||
        (sName && c.secondary_technician_name && c.secondary_technician_name.trim().toLowerCase() === sName)
      );
    }
    return complaints;
  }, [currentUser?.role, myTechData, selectedAdminTechId, technicians, complaints]);

  const counts = {
    all: scopedComplaints.length,
    assigned: scopedComplaints.filter(c => c.status === 'Assigned').length,
    in_progress: scopedComplaints.filter(c => c.status === 'In Progress').length,
    on_hold: scopedComplaints.filter(c => c.status === 'On Hold').length,
    reopened: scopedComplaints.filter(c => c.status === 'Reopened').length,
    completed: scopedComplaints.filter(c => ['Resolved', 'Closed'].includes(c.status)).length
  };

  const currentTabList = scopedComplaints.filter(job => {
    if (jobStatusFilter === 'all') return true;
    if (jobStatusFilter === 'Completed') return ['Resolved', 'Closed'].includes(job.status);
    return job.status === jobStatusFilter;
  });

  const displayList = currentTabList.filter(job => {
    if (productFilter !== 'all' && job.product_type !== productFilter) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (job.ticket_id && job.ticket_id.toLowerCase().includes(q)) ||
      (job.customer_name && job.customer_name.toLowerCase().includes(q)) ||
      (job.customer_phone && job.customer_phone.includes(q)) ||
      (job.customer_address && job.customer_address.toLowerCase().includes(q)) ||
      (job.issue_category && job.issue_category.toLowerCase().includes(q)) ||
      (job.issue_description && job.issue_description.toLowerCase().includes(q)) ||
      (job.product_type && job.product_type.toLowerCase().includes(q))
    );
  });

  // Export Statement for Field Tasks (CSV)
  const handleExportFieldTasksStatement = () => {
    const listToExport = displayList.length > 0 ? displayList : scopedComplaints;
    if (!listToExport || listToExport.length === 0) {
      showToast('No field tasks available to export', 'warning');
      return;
    }
    const headers = [
      'Ticket ID', 'Registration Date', 'Customer Name', 'Customer Mobile',
      'Address', 'City / Village', 'Location URL', 'Product Type', 'Issue Category',
      'Issue Description', 'Priority', 'Stage / Status', 'Assigned Specialist',
      'Scheduled Visit Date', 'Cash Collected (Rs)', 'Payment Status',
      'Company Settlement Status', 'Resolution Notes', 'Spare Parts Used'
    ];
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };
    const rows = [headers.join(',')];
    for (const c of listToExport) {
      rows.push([
        escapeCsv(c.ticket_id),
        escapeCsv(c.created_at),
        escapeCsv(c.customer_name),
        escapeCsv(c.customer_phone),
        escapeCsv(c.customer_address),
        escapeCsv(c.city || ''),
        escapeCsv(c.location_url || ''),
        escapeCsv(c.product_type),
        escapeCsv(c.issue_category),
        escapeCsv(c.issue_description || ''),
        escapeCsv(c.priority),
        escapeCsv(c.status),
        escapeCsv(c.technician_name || techProfile?.name || 'Unassigned'),
        escapeCsv(c.expected_visit_date || ''),
        escapeCsv(c.payment_collected || 0),
        escapeCsv(c.payment_status || 'Unpaid'),
        escapeCsv(c.company_settlement_status || 'Pending'),
        escapeCsv(c.resolution_notes || ''),
        escapeCsv(c.spare_parts_used || '')
      ].join(','));
    }
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EcoGreen_Field_Tasks_Statement_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast(`Field tasks statement exported successfully (${listToExport.length} tickets)`, 'success');
  };

  // Helper to format date & time in Indian Standard Time (IST) for CSV & UI
  const formatISTDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const datePart = formatIndianDateOnly(d);
      const timePart = formatIndianTimeOnly(d);
      return `${datePart}, ${timePart}`;
    } catch (_) {
      return String(dateStr);
    }
  };

  // Export Statement for Cash Collection Register (CSV)
  const handleExportCollectionStatement = () => {
    let cashList = [];
    if (currentUser?.role === 'technician') {
      cashList = (myTechData?.cashJobs || []).map(j => ({
        ...j,
        techName: techProfile?.name || 'Me'
      }));
    } else {
      visibleTechs.forEach(t => {
        if (t.cashJobs && t.cashJobs.length > 0) {
          cashList.push(...t.cashJobs.map(j => ({ ...j, techName: t.name })));
        }
      });
    }

    // Filter by search term if user is searching
    if (collectionSearchTerm.trim()) {
      const q = collectionSearchTerm.trim().toLowerCase();
      cashList = cashList.filter(c => {
        const ticketId = String(c.ticket_id || '').toLowerCase();
        const custName = String(c.customer_name || '').toLowerCase();
        const custPhone = String(c.customer_phone || '').toLowerCase();
        const fault = String(c.issue_category || '').toLowerCase();
        const prod = String(c.product_type || '').toLowerCase();
        const amt = String(c.payment_collected || '').toLowerCase();
        const settledBy = String(c.company_settled_by || '').toLowerCase();
        const status = String(c.company_settlement_status || '').toLowerCase();
        const city = String(c.city || '').toLowerCase();
        const address = String(c.customer_address || '').toLowerCase();
        return ticketId.includes(q) || custName.includes(q) || custPhone.includes(q) ||
               fault.includes(q) || prod.includes(q) || amt.includes(q) ||
               settledBy.includes(q) || status.includes(q) || city.includes(q) || address.includes(q);
      });
    }

    if (cashList.length === 0) {
      showToast('No matching cash collection records available to export', 'warning');
      return;
    }

    const headers = [
      'Ticket ID',
      'Customer Name',
      'Customer Mobile',
      'Address & Location',
      'Technician Specialist',
      'Product Type',
      'Fault / Issue Category',
      'Amount Collected (Rs)',
      'Payment Status',
      'Customer Payment Date & Time (IST)',
      'Payment Mode',
      'Payment Notes / Reason',
      'Company Settlement Status',
      'Company Received By',
      'Company Settled Date & Time (IST)',
      'Ticket Registered Date & Time (IST)'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [headers.join(',')];
    for (const c of cashList) {
      const isSettled = c.company_settlement_status === 'Settled with Company';
      rows.push([
        escapeCsv(c.ticket_id),
        escapeCsv(c.customer_name),
        escapeCsv(c.customer_phone ? (String(c.customer_phone).startsWith('+') ? c.customer_phone : `+${c.customer_phone}`) : ''),
        escapeCsv([c.customer_address, c.city].filter(Boolean).join(' • ')),
        escapeCsv(c.techName || c.technician_name || ''),
        escapeCsv(c.product_type || ''),
        escapeCsv(c.issue_category || ''),
        escapeCsv(c.payment_collected ? Number(c.payment_collected).toFixed(2) : '0.00'),
        escapeCsv(c.payment_status || 'Paid'),
        escapeCsv(formatISTDateTime(c.payment_collected_at)),
        escapeCsv(c.payment_mode || 'Cash'),
        escapeCsv(c.collection_reason || c.payment_notes || ''),
        escapeCsv(isSettled ? 'Settled with Company' : 'Pending Deposit'),
        escapeCsv(c.company_settled_by || (isSettled ? 'Company Finance' : 'Pending')),
        escapeCsv(isSettled ? formatISTDateTime(c.company_settled_at) : 'Pending Deposit'),
        escapeCsv(formatISTDateTime(c.created_at))
      ].join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EcoGreen_Cash_Collection_Statement_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast(`Collection register statement exported successfully (${cashList.length} records)`, 'success');
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-3.5 sm:p-6 rounded-2xl shadow-md w-full max-w-full min-w-0">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="p-2.5 sm:p-3 bg-white/10 rounded-xl shrink-0">
              <Wrench className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-[11px] uppercase font-mono tracking-wider text-emerald-200 block truncate">
                {currentUser?.role === 'technician' ? 'Technician Field Workspace' : 'Field Operations & Cash Management'}
              </span>
              <h2 className="text-base sm:text-xl font-black truncate">
                {currentUser?.role === 'technician' ? (techProfile?.name || currentUser?.name) : (currentUser?.name || 'Admin Supervisor')}
              </h2>
              <p className="text-[11px] sm:text-xs text-emerald-100 truncate">
                Service Zone: <strong>{techProfile?.area_zone || 'All Gujarat & Bengaluru Territories'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {/* Live Duty Toggle Button (for technicians) */}
            {techProfile && (
              <button
                onClick={handleToggleDuty}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 shadow-xs ${
                  techProfile.is_available
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border-emerald-400/40'
                    : 'bg-rose-500/30 hover:bg-rose-500/40 text-rose-100 border-rose-400/50'
                }`}
                title="Tap to toggle On-Duty / Off-Duty status"
              >
                <span className={`w-2 h-2 rounded-full ${techProfile.is_available ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                <span>{techProfile.is_available ? 'On Duty' : 'Off Duty'}</span>
              </button>
            )}

            <button
              onClick={() => { fetchMyJobs(); fetchTechniciansList(); }}
              title="Refresh jobs & settlement data"
              className="p-2 hover:bg-white/10 rounded-xl text-emerald-200 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading || settlingAction ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Technician / Specialist Filter Bar for Admin / Staff (ECO-19) */}
      {currentUser?.role !== 'technician' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 w-full max-w-full min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
              <Users className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800">Technician Specialist Filter:</span>
                {selectedAdminTechId && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Active Specialist
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Filter Field Tasks, Collection Register, and Tour Ledgers for a specific technician
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedAdminTechId || (technicians[0]?.id ? String(technicians[0].id) : '')}
              onChange={(e) => {
                const val = e.target.value;
                handleAdminTechSelect(val);
                setExpandedTechId(val);
              }}
              className="w-full sm:w-auto text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
            >
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  👤 {t.name} ({t.area_zone || t.phone || 'Field'})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Section View Switcher: Field Tasks vs Cash Collection */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto scrollbar-none w-full max-w-full">
        <button
          type="button"
          onClick={() => handleSectionSwitch('field_ops')}
          className={`shrink-0 sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            section === 'field_ops'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Wrench className="w-4 h-4 shrink-0" />
          <span>Field Tasks ({scopedComplaints.length})</span>
        </button>
        <button
          type="button"
          onClick={() => handleSectionSwitch('collection')}
          className={`shrink-0 sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            section === 'collection'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <IndianRupee className="w-4 h-4 shrink-0" />
          <span>Collection Register</span>
          {(myTechData?.cashInHandDue || 0) > 0 && (
            <span className="bg-amber-400 text-amber-950 text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1">
              ₹{myTechData.cashInHandDue}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleSectionSwitch('tour_ledger')}
          className={`shrink-0 sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            section === 'tour_ledger'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>Tour Ledger & Vouchers</span>
        </button>
      </div>

      {/* ================= TECHNICIAN CASH RECONCILIATION & SETTLEMENT SECTION ================= */}
      {section === 'collection' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-600" />
              <span>{currentUser?.role === 'technician' ? 'My Cash Collection & Company Settlement Register' : 'Technician Cash Collection & Company Settlement Register'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentUser?.role === 'technician' 
                ? 'Track cash you collected from customers, verify ticket dates & timestamps, and review settlement status.' 
                : 'Track cash collected from customers by each technician, inspect ticket breakdown, and settle balances.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {currentUser?.role !== 'technician' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Tech Filter:</span>
                <select
                  value={selectedAdminTechId || (technicians[0]?.id ? String(technicians[0].id) : '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleAdminTechSelect(val);
                    setExpandedTechId(val);
                  }}
                  className="text-xs px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                >
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      👤 {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={handleExportCollectionStatement}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="Export Cash Collection Statement (CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Statement</span>
            </button>
            <span className="text-[11px] font-mono px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-semibold">
              {visibleTechs[0]?.name || 'Technician Desk'}
            </span>
          </div>
        </div>

        {/* Overview Cards: Scoped to logged-in tech if technician, or company-wide if admin */}
        {currentUser?.role === 'technician' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">My Customer Cash Collected</span>
              <strong className="text-lg font-black text-slate-800 font-mono block mt-1">₹{myTechData?.totalCollected || 0}</strong>
              <span className="text-[10px] text-slate-400">Total collected across your assigned jobs</span>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Deposited / Settled with Company</span>
              <strong className="text-lg font-black text-emerald-700 font-mono block mt-1">₹{myTechData?.totalSettled || 0}</strong>
              <span className="text-[10px] text-emerald-600 font-medium">Safe & verified in company accounts</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              (myTechData?.cashInHandDue || 0) > 0 ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] uppercase font-bold block ${(myTechData?.cashInHandDue || 0) > 0 ? 'text-amber-900 font-black' : 'text-slate-500'}`}>
                  Cash in Hand (To Deposit)
                </span>
                {(myTechData?.cashInHandDue || 0) > 0 && (
                  <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                    Deposit Pending
                  </span>
                )}
              </div>
              <strong className={`text-lg font-black font-mono block mt-1 ${(myTechData?.cashInHandDue || 0) > 0 ? 'text-amber-950' : 'text-slate-700'}`}>
                ₹{myTechData?.cashInHandDue || 0}
              </strong>
              <span className="text-[10px] text-amber-800">
                {(myTechData?.cashInHandDue || 0) > 0 ? 'Please deposit this cash at the company office/account' : 'All collected cash has been deposited'}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Technician Cash Collected
              </span>
              <strong className="text-lg font-black text-slate-800 font-mono block mt-1">
                ₹{visibleTechs[0]?.totalCollected || 0}
              </strong>
              <span className="text-[10px] text-slate-400">
                For {visibleTechs[0]?.name || 'Selected Specialist'}
              </span>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Deposited / Settled with Company</span>
              <strong className="text-lg font-black text-emerald-700 font-mono block mt-1">
                ₹{visibleTechs[0]?.totalSettled || 0}
              </strong>
              <span className="text-[10px] text-emerald-600 font-medium">Safe in company bank/office accounts</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              (visibleTechs[0]?.cashInHandDue || 0) > 0 ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] uppercase font-bold block ${(visibleTechs[0]?.cashInHandDue || 0) > 0 ? 'text-amber-900 font-black' : 'text-slate-500'}`}>
                  Cash in Hand (Due from Tech)
                </span>
                {(visibleTechs[0]?.cashInHandDue || 0) > 0 && (
                  <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                    Deposit Pending
                  </span>
                )}
              </div>
              <strong className={`text-lg font-black font-mono block mt-1 ${(visibleTechs[0]?.cashInHandDue || 0) > 0 ? 'text-amber-950' : 'text-slate-700'}`}>
                ₹{visibleTechs[0]?.cashInHandDue || 0}
              </strong>
              <span className="text-[10px] text-amber-800">
                {(visibleTechs[0]?.cashInHandDue || 0) > 0 ? 'Cash currently with field technician' : 'All collected cash has been deposited'}
              </span>
            </div>
          </div>
        )}

        {/* Cash Details & Applications Breakdown: ONLY show logged-in tech for technicians, or full list for admin/staff */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {currentUser?.role === 'technician' ? 'My Cash Collection Tickets & Timestamp History' : 'Technicians Cash Details & Applications Breakdown'}
            </h4>
          </div>

          {/* Search Bar for Cash Collection Register */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={collectionSearchTerm}
                onChange={(e) => setCollectionSearchTerm(e.target.value)}
                placeholder="Search collection by ticket ID, customer name, mobile, fault/issue, product, or amount..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-800 placeholder-slate-400 transition-all font-medium"
              />
              {collectionSearchTerm && (
                <button
                  type="button"
                  onClick={() => setCollectionSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  title="Clear Search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {collectionSearchTerm && (
              <span className="text-[11px] text-emerald-800 font-semibold px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-xl shrink-0 flex items-center gap-1.5">
                <span>Filtering: <strong>"{collectionSearchTerm}"</strong></span>
                <button 
                  type="button" 
                  onClick={() => setCollectionSearchTerm('')}
                  className="text-emerald-700 hover:text-rose-600 font-bold ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <div className="space-y-3">
            {visibleTechs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                No cash collection records found.
              </div>
            ) : (
              visibleTechs.map((tech) => {
                const filteredCashJobs = tech.cashJobs.filter(comp => {
                  if (!collectionSearchTerm.trim()) return true;
                  const q = collectionSearchTerm.trim().toLowerCase();
                  const ticketId = String(comp.ticket_id || '').toLowerCase();
                  const custName = String(comp.customer_name || '').toLowerCase();
                  const custPhone = String(comp.customer_phone || '').toLowerCase();
                  const fault = String(comp.issue_category || '').toLowerCase();
                  const prod = String(comp.product_type || '').toLowerCase();
                  const amt = String(comp.payment_collected || '').toLowerCase();
                  const settledBy = String(comp.company_settled_by || '').toLowerCase();
                  const status = String(comp.company_settlement_status || '').toLowerCase();
                  const city = String(comp.city || '').toLowerCase();
                  const address = String(comp.customer_address || '').toLowerCase();
                  return ticketId.includes(q) || custName.includes(q) || custPhone.includes(q) ||
                         fault.includes(q) || prod.includes(q) || amt.includes(q) ||
                         settledBy.includes(q) || status.includes(q) || city.includes(q) || address.includes(q);
                });

                // Skip tech card if search term is active and there are no matches for this tech
                if (collectionSearchTerm.trim() && filteredCashJobs.length === 0) {
                  return null;
                }

                const isExpanded = currentUser?.role === 'technician' || 
                                   expandedTechId === tech.id || 
                                   String(selectedAdminTechId) === String(tech.id) || 
                                   (Boolean(collectionSearchTerm.trim()) && filteredCashJobs.length > 0);
                const hasDue = tech.cashInHandDue > 0;

                return (
                  <div 
                    key={tech.id} 
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      hasDue ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Technician Summary Header Bar */}
                    <div className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          hasDue ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {tech.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-slate-900">{tech.name}</h4>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              tech.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {tech.is_available ? '🟢 On Duty' : '⚪ Off Duty'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-mono">
                            {tech.phone ? (tech.phone.startsWith('+') ? tech.phone : `+${tech.phone}`) : 'No phone set'} • Zone: <strong>{tech.area_zone}</strong>
                          </p>
                        </div>
                      </div>

                    {/* Cash Totals for this Technician */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 self-start md:self-auto text-xs">
                      <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-semibold">Collected</span>
                        <strong className="text-xs font-mono font-bold text-slate-800">₹{tech.totalCollected}</strong>
                      </div>

                      <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 block font-semibold">Deposited</span>
                        <strong className="text-xs font-mono font-bold text-emerald-800">₹{tech.totalSettled}</strong>
                      </div>

                      <div className={`px-3 py-1.5 rounded-xl border ${
                        hasDue ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-black' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        <span className="text-[10px] block uppercase font-bold">Due from Tech</span>
                        <strong className="text-xs font-mono font-black">₹{tech.cashInHandDue}</strong>
                      </div>

                      {/* Collect All Button */}
                      {hasDue && ['admin', 'staff'].includes(currentUser?.role) && (
                        <button
                          type="button"
                          onClick={() => handleBatchSettle(tech, tech.cashInHandDue)}
                          disabled={settlingAction}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          title="Settle and collect all pending cash for this technician"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Collect All (₹{tech.cashInHandDue})</span>
                        </button>
                      )}

                      {/* Expand / Collapse Application Details */}
                      <button
                        type="button"
                        onClick={() => setExpandedTechId(isExpanded ? null : tech.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>{filteredCashJobs.length} Tickets</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Tickets / Applications Breakdown */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Cash Collection by {tech.name} across Complaints / Applications:
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {tech.pendingJobs.length} ticket(s) pending deposit
                        </span>
                      </div>

                      {filteredCashJobs.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
                          {collectionSearchTerm ? 'No cash records match your search query.' : 'No cash payments collected by this technician yet.'}
                        </div>
                      ) : (
                        <div className="w-full max-w-full min-w-0 overflow-x-auto">
                          <table className="w-full min-w-[650px] text-left text-xs bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <thead>
                              <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                <th className="py-2.5 px-3">Ticket ID</th>
                                <th className="py-2.5 px-3">Customer & Location</th>
                                <th className="py-2.5 px-3">Product / Issue</th>
                                <th className="py-2.5 px-3">Amount Collected</th>
                                <th className="py-2.5 px-3">Company Settlement</th>
                                <th className="py-2.5 px-3 text-right">Settlement Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {filteredCashJobs.map((comp) => {
                                const isSettled = comp.company_settlement_status === 'Settled with Company';
                                return (
                                  <tr key={comp.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                      <button
                                        type="button"
                                        onClick={() => onSelectComplaint && onSelectComplaint(comp.ticket_id || comp.id)}
                                        className="text-emerald-700 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                                      >
                                        <span>{comp.ticket_id}</span>
                                        <ExternalLink className="w-3 h-3 text-slate-400" />
                                      </button>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <strong className="text-slate-800 block truncate max-w-[180px]">{comp.customer_name}</strong>
                                      <span className="text-[10px] text-slate-400 font-mono">+{comp.customer_phone} {comp.city ? '• ' + comp.city : ''}</span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="text-slate-700 block truncate max-w-[180px] font-medium">{comp.issue_category}</span>
                                      <span className="text-[10px] text-slate-400 block">{comp.product_type}</span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono">
                                      <strong className="text-slate-900 text-xs font-black">₹{comp.payment_collected || 0}</strong>
                                      <span className="text-[10px] text-slate-400 block">({comp.payment_status || 'Paid'})</span>
                                      {comp.collection_reason && (
                                        <span className="text-[10px] text-amber-900 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-sans font-semibold block mt-0.5 truncate max-w-[160px]" title={comp.collection_reason}>
                                          📋 {comp.collection_reason}
                                        </span>
                                      )}
                                      {comp.payment_collected_at ? (
                                        <span className="text-[9px] text-slate-600 font-sans block mt-0.5" title="Customer Payment Collection Date & Timestamp">
                                          📅 {formatIndianDateOnly(comp.payment_collected_at)}{' '}
                                          ⏰ {formatIndianTimeOnly(comp.payment_collected_at)}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 font-sans block mt-0.5">Date recorded</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {isSettled ? (
                                        <div className="space-y-1">
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                                            <CheckCheck className="w-3 h-3 text-emerald-700" />
                                            <span>Deposited</span>
                                          </span>
                                          {comp.company_settled_by && (
                                            <div className="text-[10px] text-slate-700 flex items-center gap-1" title={`Received in company by ${comp.company_settled_by}`}>
                                              <span className="text-slate-400">Received by:</span>
                                              <strong className="text-slate-900 font-bold">{comp.company_settled_by}</strong>
                                            </div>
                                          )}
                                          {comp.company_settled_at && (
                                            <div className="text-[9px] text-slate-500 font-mono">
                                              📅 {formatIndianDateOnly(comp.company_settled_at)}{' '}
                                              ⏰ {formatIndianTimeOnly(comp.company_settled_at)}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 flex items-center gap-1 w-fit">
                                          <Clock className="w-3 h-3 text-amber-700" />
                                          <span>Pending Deposit</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      {isSettled ? (
                                        <div className="text-right">
                                          <span className="text-[11px] font-bold text-emerald-700 font-mono inline-flex items-center gap-1">
                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                            Verified in Account
                                          </span>
                                          {comp.company_settled_by && (
                                            <span className="text-[10px] text-slate-400 block font-sans">
                                              Handed over to {comp.company_settled_by}
                                            </span>
                                          )}
                                        </div>
                                      ) : ['admin', 'staff'].includes(currentUser?.role) ? (
                                        <button
                                          type="button"
                                          onClick={(e) => handleSingleSettle(e, comp, tech)}
                                          disabled={settlingAction}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer"
                                          title="Mark this ticket cash as received from technician"
                                        >
                                          Collect ₹{comp.payment_collected}
                                        </button>
                                      ) : (
                                        <span className="text-[11px] text-amber-700 font-semibold">Deposit at counter</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
        </div>
      </div>
      )}

      {/* ================= TOUR ADVANCE & EXPENSE VOUCHER LEDGER SECTION ================= */}
      {section === 'tour_ledger' && (
        <TourLedgerSection 
          scopedTechProfile={myTechData || techProfile} 
          allTechnicians={technicians} 
          complaints={complaints}
          activeTechId={selectedAdminTechId}
          onTechChange={(id) => handleAdminTechSelect(id)}
        />
      )}

      {/* ================= FIELD TASKS & WORK SECTION ================= */}
      {section === 'field_ops' && (
      <div className="space-y-3">
        {/* Status Filter Tabs (Same as Staff Complaints Desk) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
          <button
            type="button"
            onClick={() => handleJobStatusFilterChange('Assigned')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              jobStatusFilter === 'Assigned'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>Assigned</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              jobStatusFilter === 'Assigned' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {counts.assigned}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleJobStatusFilterChange('In Progress')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              jobStatusFilter === 'In Progress'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>In Progress</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              jobStatusFilter === 'In Progress' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {counts.in_progress}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleJobStatusFilterChange('On Hold')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              jobStatusFilter === 'On Hold'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>On Hold</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              jobStatusFilter === 'On Hold' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {counts.on_hold}
            </span>
          </button>

          {counts.reopened > 0 && (
            <button
              type="button"
              onClick={() => handleJobStatusFilterChange('Reopened')}
              className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                jobStatusFilter === 'Reopened'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <span>Reopened</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                jobStatusFilter === 'Reopened' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
              }`}>
                {counts.reopened}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleJobStatusFilterChange('Completed')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              jobStatusFilter === 'Completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>Completed</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              jobStatusFilter === 'Completed' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {counts.completed}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleJobStatusFilterChange('all')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              jobStatusFilter === 'all'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>All Tasks</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              jobStatusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {counts.all}
            </span>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search field tasks by Ticket, Customer, Address, Issue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 flex-1 sm:flex-initial min-w-0 max-w-[135px] sm:max-w-xs truncate"
              title="Filter tasks by Product"
            >
              <option value="all">All Products</option>
              {products.map((prod) => (
                <option key={prod.id || prod.name} value={prod.name}>
                  {prod.name}
                </option>
              ))}
            </select>

            {/* Mobile & PC View Mode Toggle: Cards (Default) vs Compact List */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleExportFieldTasksStatement}
                className="p-2 sm:px-3 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
                title="Export Field Tasks Statement (CSV)"
                aria-label="Export Field Tasks Statement (CSV)"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export Statement</span>
              </button>

              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => handleViewModeChange('card')}
                  className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    viewMode === 'card'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Card View (Default)"
                  aria-label="Card View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('list')}
                  className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Compact List View"
                  aria-label="Compact List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">List</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Jobs Feed — Compact List or 2-Card Grid */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">Loading technician jobs...</div>
        ) : displayList.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h4 className="font-bold text-sm text-slate-800">
              {jobStatusFilter === 'all' ? 'No service jobs found!' : `No ${jobStatusFilter} tasks at this moment.`}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {searchTerm ? 'No tasks match your search filter.' : 'You are all caught up. Check back when support desk assigns a new complaint.'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          /* High-Density Compact List View for Mobile & PC */
          <div className="space-y-2.5">
            {displayList.map((job) => {
              const ageInfo = getTicketAgeInfo(job);
              return (
                <div
                  key={job.id}
                  onClick={() => onSelectComplaint && onSelectComplaint(job.ticket_id || job.id)}
                  className={`bg-white rounded-2xl border p-3.5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 !border-t-4 sm:!border-t-0 sm:!border-l-4 ${getStageBorderClass(job.status, ageInfo.isOverdue)} ${
                    ageInfo.isOverdue
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : 'border-slate-200 hover:border-emerald-500'
                  }`}
                >
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                        {job.ticket_id}
                      </span>
                      {String(job.product_type || '').toUpperCase().includes('SURVEY') && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                          Survey
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        job.status === 'In Progress' ? 'bg-blue-600 text-white' :
                        job.status === 'Resolved' ? 'bg-emerald-600 text-white' :
                        job.status === 'Closed' ? 'bg-slate-700 text-white' :
                        'bg-amber-500 text-slate-900'
                      }`}>
                        {job.status}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        job.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                        job.priority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {job.priority}
                      </span>
                      <TicketAgeBadge complaint={job} compact={true} />
                      {job.secondary_technician_name && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-300">
                          <Users className="w-2.5 h-2.5" /> Team: {job.technician_name} + {job.secondary_technician_name}
                        </span>
                      )}
                      {job.payment_collected > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
                          <IndianRupee className="w-2.5 h-2.5" /> ₹{job.payment_collected}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2 flex-wrap pt-0.5">
                      <h4 className="text-slate-900 font-bold text-xs sm:text-sm">
                        {job.customer_name}
                      </h4>
                      {job.customer_phone && (
                        <span className="text-[11px] text-slate-500 font-mono">
                          +91 {String(job.customer_phone).slice(-10)}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded uppercase">
                        {job.product_type}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1 leading-normal">
                      <strong className="text-slate-800 font-semibold">{job.issue_category}: </strong>
                      {job.issue_description}
                    </p>

                    {checkHasLocation(job) && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{job.city ? `${job.city} • ` : ''}{job.customer_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Quick Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`tel:${job.customer_phone}`}
                      className="p-2 sm:px-3 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-2xs active:scale-95 transition-transform"
                      title="Call Customer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Call</span>
                    </a>
                    <a
                      href={buildTechnicianCustomerWhatsApp(job, currentUser?.name || techProfile?.name).sendUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        const fresh = buildTechnicianCustomerWhatsApp(job, currentUser?.name || techProfile?.name);
                        if (fresh?.sendUrl) e.currentTarget.href = fresh.sendUrl;
                      }}
                      className="p-2 sm:px-3 sm:py-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 transition-transform"
                      title="WhatsApp Customer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">WhatsApp</span>
                    </a>
                    {checkHasLocation(job) && (
                      <a
                        href={job.location_url || `https://maps.google.com/?q=${encodeURIComponent([job.customer_address, job.city].filter(Boolean).join(', '))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 sm:px-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center shadow-2xs border border-slate-200 active:scale-95"
                        title="Open in Google Maps"
                      >
                        <Navigation className="w-3.5 h-3.5 text-emerald-700 fill-emerald-600/30" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectComplaint && onSelectComplaint(job.ticket_id || job.id)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <span>Update</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Cards Feed — 2 Cards Horizontally Side-by-Side on PC */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {displayList.map((job) => {
              const ageInfo = getTicketAgeInfo(job);
              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-2xl border shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between !border-t-4 sm:!border-t-0 sm:!border-l-4 ${getStageBorderClass(job.status, ageInfo.isOverdue)} ${
                    ageInfo.isOverdue
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : 'border-slate-200 hover:border-emerald-500'
                  }`}
                >
                  {/* Job Card Header */}
                  <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded truncate">
                        {job.ticket_id}
                      </span>
                      {String(job.product_type || '').toUpperCase().includes('SURVEY') && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                          Survey
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        job.status === 'In Progress' ? 'bg-blue-600 text-white' :
                        job.status === 'Resolved' ? 'bg-emerald-600 text-white' :
                        job.status === 'Closed' ? 'bg-slate-700 text-white' :
                        'bg-amber-500 text-slate-900'
                      }`}>
                        {job.status}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        👨‍🔧 {job.technician_name || myTechData?.name || currentUser?.name || 'Assigned to You'}
                      </span>
                      {job.secondary_technician_name && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1">
                          <Users className="w-3 h-3" /> Co-Tech: {job.secondary_technician_name}
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        job.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                        job.priority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {job.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <TicketAgeBadge complaint={job} compact={true} />
                      <span className="text-[10px] font-medium text-slate-500 bg-white/90 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0" title="Registered Time (IST)">
                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                        <span>{formatIndianDateTime(job.created_at)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Job Details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                          {job.product_type}
                        </span>
                        {job.payment_collected > 0 ? (
                          <span className="text-[11px] font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Collected: ₹{job.payment_collected} {job.collection_reason ? `(${job.collection_reason})` : ''}
                          </span>
                        ) : job.estimated_charges > 0 ? (
                          <span className="text-[11px] font-bold text-slate-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Charge: ₹{job.estimated_charges} • <span className={job.payment_status === 'Collected' ? 'text-emerald-700' : 'text-amber-700'}>{job.payment_status || 'Unpaid'}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Unallocated (On-Site Collection Enabled)
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-slate-900">
                        {job.issue_category}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                        {job.issue_description}
                      </p>
                    </div>

                    {/* Customer Details & One-Tap Actions */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                      {/* Customer Info Header Row - Unclipped Full Width */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-bold text-xs border border-emerald-200">
                            {job.customer_name ? job.customer_name.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-bold">Customer</span>
                            <h5 className="text-slate-900 font-bold text-xs sm:text-sm break-words leading-snug">
                              {job.customer_name}
                            </h5>
                          </div>
                        </div>

                        {/* Payment Status Pill */}
                        {job.payment_collected > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300 shrink-0">
                            <IndianRupee className="w-2.5 h-2.5" /> Paid: ₹{job.payment_collected}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shrink-0">
                            +91 {job.customer_phone ? String(job.customer_phone).slice(-10) : ''}
                          </span>
                        )}
                      </div>

                      {/* Quick Action Buttons Row - 3 Balanced Columns */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-200/60">
                        <a
                          href={`tel:${job.customer_phone}`}
                          className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-transform"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                        <a
                          href={buildTechnicianCustomerWhatsApp(job, currentUser?.name || techProfile?.name).sendUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            const fresh = buildTechnicianCustomerWhatsApp(job, currentUser?.name || techProfile?.name);
                            if (fresh?.sendUrl) e.currentTarget.href = fresh.sendUrl;
                          }}
                          className="py-1.5 px-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectComplaint && onSelectComplaint(job.ticket_id || job.id);
                          }}
                          className={`py-1.5 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer active:scale-95 ${
                            job.payment_collected > 0
                              ? 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                              : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                          }`}
                          title={job.payment_collected > 0 ? `Collected: ₹${job.payment_collected}` : 'Collect On-Site Payment'}
                        >
                          <IndianRupee className="w-3 h-3 text-amber-700" />
                          <span className="truncate">{job.payment_collected > 0 ? 'Edit Pay' : 'Collect'}</span>
                        </button>
                      </div>

                      {/* Address & Google Maps Location Pin Icon Button - Only if location exists */}
                      {checkHasLocation(job) && (
                        <div className="flex items-center justify-between gap-2 text-slate-600 pt-1.5 border-t border-slate-200/60">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="text-[11px] text-slate-700 leading-snug line-clamp-2">
                              {job.city ? <strong className="text-slate-900 font-semibold">{job.city} • </strong> : null}
                              {job.customer_address}
                            </span>
                          </div>
                          <a
                            href={job.location_url || `https://maps.google.com/?q=${encodeURIComponent([job.customer_address, job.city].filter(Boolean).join(', '))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg shrink-0 flex items-center justify-center transition-colors shadow-2xs border border-emerald-200 active:scale-95"
                            title="Open Google Maps Location"
                          >
                            <Navigation className="w-3.5 h-3.5 text-emerald-700 fill-emerald-600/30" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* If resolved: show notes */}
                    {job.resolution_notes && (
                      <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200 text-xs text-emerald-950">
                        <strong>Resolution Log:</strong> {job.resolution_notes}
                        {job.spare_parts_used && (
                          <div className="text-[11px] text-emerald-800 mt-0.5">
                            <strong>Parts:</strong> {job.spare_parts_used}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reopened Alert with Previous Notes */}
                    {job.status === 'Reopened' && (
                      <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-300 text-xs text-amber-950 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                          <span>Reopened Ticket (Previous Visit History Available)</span>
                        </div>
                        {job.previous_technician_name && (
                          <p className="text-[11px] text-amber-800 font-medium">
                            <strong>Previous Specialist:</strong> {job.previous_technician_name}
                          </p>
                        )}
                        {job.resolution_notes && (
                          <p className="text-[11px] text-amber-900 line-clamp-2">
                            <strong>Previous Resolution:</strong> {job.resolution_notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Open Full Action Drawer */}
                    <button
                      onClick={() => onSelectComplaint && onSelectComplaint(job.ticket_id || job.id)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <span>{['Resolved', 'Closed'].includes(job.status) ? 'View Ticket & Resolution Details' : 'Update Notes, Collect Payment & Mark Resolved'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
};
