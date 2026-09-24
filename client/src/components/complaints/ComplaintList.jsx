import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { 
  Search, Filter, Plus, Download, RefreshCw, Sun, Droplets, Wind, 
  User, Calendar, Clock, ChevronRight, AlertCircle, CheckCircle2, Wrench,
  MessageCircle, MapPin, LayoutList, LayoutGrid, ShieldCheck, ShieldAlert, IndianRupee,
  AlertTriangle, Gauge, Layers, Trash2
} from 'lucide-react';
import { TicketAgeBadge, getTicketAgeInfo, formatIndianDateTime, formatIndianDateOnly } from '../common/TicketAgeBadge';
import { ComplaintGridSkeleton, ComplaintTableSkeleton } from '../common/SkeletonLoader';

export const ComplaintList = ({ 
  onSelectComplaint, 
  onOpenNewComplaint, 
  onOpenWhatsAppChat,
  refreshKey, 
  initialFilters 
}) => {
  const { currentUser } = useAuth();
  const { confirm, alert, showToast } = useDialog();
  const [complaints, setComplaints] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('egs_permanent_complaints') || '[]');
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  });
  const [allComplaints, setAllComplaints] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('egs_permanent_complaints') || '[]');
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  });
  const [technicians, setTechnicians] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('egs_permanent_complaints') || '[]');
      return !cached || cached.length === 0;
    } catch {
      return true;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // View Mode: 'list' (default) or 'card' - persisted in localStorage
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('egs_complaints_view_mode') || 'list';
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('egs_complaints_view_mode', mode);
  };

  // Filters
  const [search, setSearch] = useState(initialFilters?.search || '');
  const [statusFilter, setStatusFilter] = useState(initialFilters?.status || 'all');
  const [productFilter, setProductFilter] = useState(initialFilters?.product_type || 'all');
  const [priorityFilter, setPriorityFilter] = useState(initialFilters?.priority || 'all');
  const [technicianFilter, setTechnicianFilter] = useState(initialFilters?.technician_id || '');

  useEffect(() => {
    if (initialFilters) {
      if (initialFilters.status !== undefined) setStatusFilter(initialFilters.status);
      if (initialFilters.product_type !== undefined) setProductFilter(initialFilters.product_type);
      if (initialFilters.priority !== undefined) setPriorityFilter(initialFilters.priority);
      if (initialFilters.search !== undefined) setSearch(initialFilters.search);
      if (initialFilters.technician_id !== undefined) setTechnicianFilter(initialFilters.technician_id);
    }
  }, [initialFilters]);

  const fetchComplaints = async (silent = false) => {
    try {
      if (!silent && allComplaints.length === 0) setLoading(true);
      const data = await api.getComplaints({});
      if (data && Array.isArray(data.complaints)) {
        setComplaints(data.complaints);
        setAllComplaints(data.complaints);
      }
    } catch (err) {
      if (!silent) console.error('Failed to load complaints:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchTechnicians = async () => {
    try {
      const data = await api.getTechnicians();
      setTechnicians(data.technicians || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const minRotatePromise = new Promise(resolve => setTimeout(resolve, 800));
    try {
      const [data] = await Promise.all([
        api.getComplaints({}),
        fetchTechnicians(),
        minRotatePromise
      ]);
      if (data && Array.isArray(data.complaints)) {
        setComplaints(data.complaints);
        setAllComplaints(data.complaints);
      }
      showToast('Complaints list updated', 'success');
    } catch (err) {
      console.error('Failed to refresh complaints:', err);
      showToast('Failed to refresh: ' + (err.message || 'Network error'), 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
    fetchTechnicians();

    // Resilient background heartbeat sync every 6 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchComplaints(true);
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [refreshKey]);

  const getAssignedTechName = (c) => {
    if (c?.technician_name) return c.technician_name;
    const id = c?.assigned_technician_id || c?.technician_id;
    if (!id) return null;
    const match = technicians.find(t => t.id === id || String(t.id) === String(id));
    return match?.name || null;
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchComplaints();
  };

  const handleQuickSettle = async (e, complaint) => {
    e.stopPropagation();
    if (!complaint.assigned_technician_id && !complaint.technician_id) {
      await alert({
        title: 'Technician Assignment Required',
        message: 'Cannot collect technician cash on an unassigned complaint. Please assign a technician to this ticket first.',
        type: 'warning'
      });
      return;
    }
    const techName = getAssignedTechName(complaint) || 'the assigned technician';
    const amount = complaint.payment_collected || 0;
    const ok = await confirm({
      title: 'Confirm Cash Deposit',
      message: `Confirm receipt of ₹${amount} cash collected by ${techName} into Eco Green Solar Company account for Ticket #${complaint.ticket_id}?`,
      type: 'payment',
      confirmText: `Receive ₹${amount}`,
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await api.settleCompanyPayment(complaint.id, {
        notes: `Quick cash settlement collected from ${techName} by ${currentUser?.name || 'Staff'}`
      });
      fetchComplaints();
      showToast(`₹${amount} received and settled with company!`, 'success');
    } catch (err) {
      showToast('Failed to settle payment: ' + err.message, 'error');
    }
  };

  const handleDeleteComplaint = async (e, complaint) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Complaint Ticket?',
      message: `Are you sure you want to permanently delete Ticket #${complaint.ticket_id} for "${complaint.customer_name}"? This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await api.deleteComplaint(complaint.id);
      showToast(`Ticket #${complaint.ticket_id} deleted successfully!`, 'success');
      fetchComplaints();
    } catch (err) {
      showToast('Failed to delete complaint: ' + err.message, 'error');
    }
  };

  const handleWhatsAppChatClick = (e, c) => {
    e.stopPropagation();
    const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return;

    // If logged in as technician, keep opening external WhatsApp app
    if (currentUser?.role === 'technician') {
      const displayStatus = getDisplayStatus(c.status);
      const waMessage = encodeURIComponent(
        `Namaste ${c.customer_name},\nRegarding your Eco Green Solar complaint (${c.ticket_id}) for ${c.product_type}.\nStatus: ${displayStatus}\nAssigned Technician: ${c.technician_name || 'Assigned shortly'}.\nEco Green Solar Helpdesk.`
      );
      window.open(`https://wa.me/${cleanPhone}?text=${waMessage}`, '_blank');
      return;
    }

    // If Admin or Staff, redirect inside CMS to the WhatsApp Hub for this customer!
    if (onOpenWhatsAppChat) {
      onOpenWhatsAppChat(cleanPhone, c.customer_name, c.ticket_id, c.id);
    } else {
      window.location.hash = `#whatsapp-inbox?phone=${cleanPhone}`;
    }
  };

  const getProductIcon = (type) => {
    if (type === 'Solar Rooftop Systems') return <Sun className="w-4 h-4 text-amber-500" />;
    if (type === 'Solar Water Heaters') return <Droplets className="w-4 h-4 text-blue-500" />;
    if (type === 'Heat Pumps') return <Wind className="w-4 h-4 text-teal-500" />;
    if (type === 'Pressure Pumps') return <Gauge className="w-4 h-4 text-indigo-500" />;
    return <Layers className="w-4 h-4 text-slate-500" />;
  };

  const statusPills = ['all', 'Unassigned', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Reopened'];

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Resolved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Closed':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'On Hold':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Assigned':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Reopened':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Registered':
      case 'Unassigned':
      default:
        return 'bg-amber-100 text-amber-900 border-amber-200';
    }
  };

  const getDisplayStatus = (status) => {
    if (!status || status === 'Registered') return 'Unassigned';
    return status;
  };

  const getStageBorderClass = (status) => {
    switch (status) {
      case 'Resolved': return 'border-l-emerald-500';
      case 'Closed': return 'border-l-slate-400';
      case 'In Progress': return 'border-l-indigo-600';
      case 'On Hold': return 'border-l-purple-500';
      case 'Assigned': return 'border-l-blue-500';
      case 'Reopened': return 'border-l-rose-500';
      case 'Registered':
      case 'Unassigned':
      default: return 'border-l-amber-500';
    }
  };

  const getStageBadgeConfig = (status) => {
    switch (status) {
      case 'Resolved':
        return { dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200/80', label: 'Resolved' };
      case 'Closed':
        return { dot: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Closed' };
      case 'In Progress':
        return { dot: 'bg-indigo-500', text: 'text-indigo-800', bg: 'bg-indigo-50', border: 'border-indigo-200/80', label: 'In Progress' };
      case 'On Hold':
        return { dot: 'bg-purple-500', text: 'text-purple-800', bg: 'bg-purple-50', border: 'border-purple-200/80', label: 'On Hold' };
      case 'Assigned':
        return { dot: 'bg-blue-500', text: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200/80', label: 'Assigned' };
      case 'Reopened':
        return { dot: 'bg-rose-500', text: 'text-rose-800', bg: 'bg-rose-50', border: 'border-rose-200/80', label: 'Reopened' };
      case 'Registered':
      case 'Unassigned':
      default:
        return { dot: 'bg-amber-500', text: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200/80', label: 'Unassigned' };
    }
  };

  const getDisplayPriority = (priority) => {
    if (priority === 'Urgent') return 'High';
    return priority || 'Medium';
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-xl lg:max-w-2xl">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Ticket ID, Customer, Phone, City, Consumer No..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-20 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); fetchComplaints(); }}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold"
            >
              Go
            </button>
          </form>

          {/* Action & View Mode Toggle Buttons */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle (List vs Card) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-emerald-800 shadow-2xs border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="List View (Default)"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('card')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'card'
                    ? 'bg-white text-emerald-800 shadow-2xs border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Card View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title={isRefreshing ? 'Refreshing list...' : 'Refresh list'}
              aria-label="Refresh complaints list"
              className={`p-2 rounded-xl border transition-all ${
                isRefreshing
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-300 cursor-not-allowed shadow-inner'
                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200 active:scale-95'
              }`}
            >
              <RefreshCw
                className={`w-4 h-4 transition-transform duration-700 ${
                  isRefreshing ? 'animate-spin text-emerald-600' : ''
                }`}
              />
            </button>

            {['admin', 'staff'].includes(currentUser?.role) && (
              <a
                href={api.getExportCsvUrl()}
                download
                className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Export CSV
              </a>
            )}

            <button
              onClick={onOpenNewComplaint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-700/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Ticket
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-semibold flex items-center gap-1 text-[11px]">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 text-xs"
          >
            <option value="all">All Products</option>
            <option value="Solar Rooftop Systems">Solar Rooftop Systems</option>
            <option value="Solar Water Heaters">Solar Water Heaters</option>
            <option value="Heat Pumps">Heat Pumps</option>
            <option value="Pressure Pumps">Pressure Pumps</option>
            <option value="Other">Other Products</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 text-xs"
          >
            <option value="all">All Priorities</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>

          {['admin', 'staff'].includes(currentUser?.role) && (
            <select
              value={technicianFilter}
              onChange={(e) => setTechnicianFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 text-xs"
            >
              <option value="">All Technicians</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.is_available ? '🟢' : '🔴'} {t.name} ({t.area_zone}) {t.is_available ? '' : '— Off-Duty'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status Pills Ribbon */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
          {statusPills.map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 min-h-[34px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center ${
                statusFilter === st
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {st === 'all' ? 'All Statuses' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Complaints Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {(() => {
          const listToFilter = allComplaints.length > 0 ? allComplaints : complaints;
          const q = (search || '').trim().toLowerCase();

          const displayedComplaints = listToFilter.filter(c => {
            // 1. Status Filter
            if (statusFilter !== 'all') {
              const isUnassigned = c.status === 'Unassigned' || c.status === 'Registered' || !c.assigned_technician_id;
              if (statusFilter.toLowerCase() === 'unassigned') {
                if (!isUnassigned) return false;
              } else if (c.status !== statusFilter) {
                return false;
              }
            }

            // 2. Product Filter
            if (productFilter !== 'all' && c.product_type !== productFilter) return false;

            // 3. Priority Filter
            if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;

            // 4. Technician Filter
            if (technicianFilter && String(c.assigned_technician_id) !== String(technicianFilter)) return false;

            // 5. Instant Real-Time Search Match (0ms filter)
            if (q) {
              const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
              const ticketId = (c.ticket_id || '').toLowerCase();
              const custName = (c.customer_name || '').toLowerCase();
              const city = (c.city || '').toLowerCase();
              const addr = (c.customer_address || '').toLowerCase();
              const consNo = (c.consumer_no || '').toLowerCase();
              const ordNo = (c.order_no || '').toLowerCase();
              const issueCat = (c.issue_category || '').toLowerCase();
              const issueDesc = (c.issue_description || '').toLowerCase();
              const techName = (c.technician_name || getAssignedTechName(c) || '').toLowerCase();

              const matches = ticketId.includes(q) ||
                              custName.includes(q) ||
                              cleanPhone.includes(q) ||
                              city.includes(q) ||
                              addr.includes(q) ||
                              consNo.includes(q) ||
                              ordNo.includes(q) ||
                              issueCat.includes(q) ||
                              issueDesc.includes(q) ||
                              techName.includes(q);
              if (!matches) return false;
            }

            return true;
          });

          if (loading && listToFilter.length === 0) {
            return viewMode === 'list' ? (
              <ComplaintTableSkeleton rows={8} />
            ) : (
              <ComplaintGridSkeleton count={8} />
            );
          }

          if (displayedComplaints.length === 0) {
            return (
              <div className="py-16 text-center text-slate-500">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <h4 className="text-sm font-bold text-slate-700">No complaints found</h4>
                <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search keywords</p>
              </div>
            );
          }

          return viewMode === 'list' ? (
            /* COMPACT LIST / TABLE VIEW — Expands across widescreen desktop */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Ticket & Product</th>
                    <th className="py-3 px-4">Customer & City</th>
                    <th className="py-3 px-4 hidden lg:table-cell">Issue Summary</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Days Open / Age</th>
                    <th className="py-3 px-4">Priority & Warranty</th>
                    <th className="py-3 px-4 hidden sm:table-cell">Assigned Tech</th>
                    <th className="py-3 px-4">Charges</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {displayedComplaints.map((c) => {
                    const displayStatus = getDisplayStatus(c.status);
                    const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
                    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                      `Namaste ${c.customer_name},\nRegarding your Eco Green Solar ticket (${c.ticket_id}).\nStatus: ${displayStatus}.\nEco Green Solar Support.`
                    )}`;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectComplaint(c.ticket_id || c.id)}
                      className="hover:bg-emerald-50/40 cursor-pointer transition-colors group"
                    >
                      {/* Ticket & Product */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
                            {getProductIcon(c.product_type)}
                          </div>
                          <div>
                            <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-emerald-700 block">
                              {c.ticket_id}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block max-w-[160px]">
                              {c.product_type}
                            </span>
                            {(c.consumer_no || c.order_no) && (
                              <span className="text-[9px] text-slate-400 font-mono block">
                                {c.consumer_no ? `Cons: ${c.consumer_no}` : ''} {c.order_no ? `• Ord: ${c.order_no}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Customer & Location */}
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-bold text-slate-900 block truncate max-w-[180px]">
                            {c.customer_name}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            📞 {c.customer_phone}
                          </span>
                          {(c.city || c.customer_address) && (
                            <span className="text-[10px] text-slate-400 truncate block max-w-[200px]">
                              📍 {c.city || c.customer_address}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Issue Summary (Visible on lg+ screens) */}
                      <td className="py-3 px-4 hidden lg:table-cell max-w-xs">
                        <div className="truncate">
                          <strong className="text-slate-800 font-semibold block truncate text-[11px]">
                            {c.issue_category}
                          </strong>
                          <span className="text-slate-500 text-[10px] truncate block">
                            {c.issue_description}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeStyle(displayStatus)}`}>
                          {displayStatus}
                        </span>
                      </td>

                      {/* Days Open / Age with Red Alert (>2 Days) */}
                      <td className="py-3 px-4">
                        <TicketAgeBadge complaint={c} />
                        <div className="text-[10px] text-slate-500 mt-1 font-medium whitespace-nowrap flex items-center gap-1" title="Registered Date & Time (IST)">
                          <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          <span>{formatIndianDateTime(c.created_at)}</span>
                        </div>
                      </td>

                      {/* Priority & Warranty */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {(() => {
                            const dispPriority = getDisplayPriority(c.priority);
                            return (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                dispPriority === 'High' ? 'bg-amber-100 text-amber-800' :
                                dispPriority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {dispPriority}
                              </span>
                            );
                          })()}
                          {c.is_in_warranty !== undefined && (
                            <span className={`block text-[10px] font-semibold ${
                              c.is_in_warranty ? 'text-emerald-700' : 'text-rose-600'
                            }`}>
                              {c.is_in_warranty ? '● In Warranty' : '● Out of Warranty'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Assigned Tech */}
                      <td className="py-3 px-4 hidden sm:table-cell">
                        {(() => {
                          const techName = getAssignedTechName(c);
                          return techName ? (
                            <div>
                              <div className="flex items-center gap-1.5 text-slate-900 font-semibold">
                                <Wrench className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate max-w-[140px]">
                                  {techName}
                                </span>
                              </div>
                              {c.expected_visit_date && (
                                <span className="text-[10px] text-emerald-700 block truncate pl-5 font-medium">
                                  📅 {formatIndianDateOnly(c.expected_visit_date)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <em className="text-[11px] font-medium">Unassigned</em>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Charges & Payment */}
                      <td className="py-3 px-4">
                        {c.estimated_charges > 0 || c.payment_collected > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 block">
                                ₹{c.payment_collected > 0 ? c.payment_collected : c.estimated_charges}
                              </span>
                              <span className={`text-[10px] font-semibold ${
                                c.payment_status === 'Collected' ? 'text-emerald-600' :
                                c.payment_status === 'Partially Paid' ? 'text-blue-600' :
                                'text-amber-600'
                              }`}>
                                {c.payment_status || 'Unpaid'}
                              </span>
                            </div>
                            {c.payment_collected > 0 && (
                              c.company_settlement_status === 'Settled with Company' ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  ✓ Co. Settled
                                </span>
                              ) : (c.assigned_technician_id || c.technician_id) ? (
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Cash is with technician">
                                    Tech Cash
                                  </span>
                                  {['admin', 'staff'].includes(currentUser?.role) && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleQuickSettle(e, c)}
                                      className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-bold shadow-2xs transition-all"
                                      title="Mark received from technician into company account"
                                    >
                                      Collect
                                    </button>
                                  )}
                                </div>
                              ) : null
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Free / In-Wty</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {cleanPhone && (
                            <button
                              type="button"
                              onClick={(e) => handleWhatsAppChatClick(e, c)}
                              title={currentUser?.role === 'technician' ? 'Open WhatsApp App' : 'Open in CMS WhatsApp Hub'}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}
                          {['admin', 'staff'].includes(currentUser?.role) && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteComplaint(e, c)}
                              title="Delete Complaint Permanently"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectComplaint(c.id)}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Open Details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* CARD GRID VIEW — Senior UI Redesign: Cohesive, Professional, Clean Visual Hierarchy */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 bg-slate-100/50">
            {displayedComplaints.map((c) => {
              const displayStatus = getDisplayStatus(c.status);
              const stageCfg = getStageBadgeConfig(displayStatus);
              const ageInfo = getTicketAgeInfo(c);
              const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectComplaint(c.ticket_id || c.id)}
                  className={`bg-white rounded-xl border border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group relative overflow-hidden border-l-[4px] ${getStageBorderClass(displayStatus)} p-4`}
                >
                  {/* Top: Ticket ID, Stage Badge, Priority */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                          {c.ticket_id}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium truncate hidden sm:inline">
                          • {c.product_type}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Unified Stage Badge with soft dot */}
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageCfg.bg} ${stageCfg.text} ${stageCfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stageCfg.dot}`} />
                          <span>{stageCfg.label}</span>
                        </span>

                        {/* Priority Indicator */}
                        {getDisplayPriority(c.priority) === 'High' && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 px-1.5 py-0.5 rounded">
                            High
                          </span>
                        )}
                        {c.priority === 'Urgent' && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/70 px-1.5 py-0.5 rounded">
                            Urgent
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time & Overdue SLA Bar */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {ageInfo.isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-1.5 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>Overdue ({ageInfo.days}d)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-500">
                            {ageInfo.text}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono" title="Registered Time (IST)">
                        {formatIndianDateTime(c.created_at)}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {c.customer_name}
                      </h4>
                      <span className="text-[11px] text-slate-500 font-mono shrink-0">
                        {c.customer_phone}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium truncate mt-0.5">
                      <span className="truncate">{c.city ? `${c.city} • ` : ''}{c.product_type}</span>
                      {c.estimated_charges > 0 && (
                        <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                          ₹{c.estimated_charges}
                        </span>
                      )}
                    </div>

                    {/* Issue Summary Box */}
                    <div 
                      className="text-xs text-slate-600 mt-2 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 min-h-[52px] flex flex-col justify-start"
                      title={`${c.issue_category}: ${c.issue_description}`}
                    >
                      <p className="line-clamp-2 leading-relaxed">
                        <strong className="text-slate-800 font-semibold">{c.issue_category}:</strong>{' '}
                        <span>{c.issue_description}</span>
                      </p>
                    </div>

                    {/* Technician & Visit Schedule Pill */}
                    {(() => {
                      const techName = getAssignedTechName(c);
                      return techName ? (
                        <div className="mt-2.5 p-2 bg-slate-50 border border-slate-200/80 rounded-lg flex items-center justify-between text-xs transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                              {techName.charAt(0)}
                            </div>
                            <div className="truncate">
                              <span className="font-semibold text-slate-800 text-xs block truncate">{techName}</span>
                              <span className="text-[10px] text-slate-500 block truncate">
                                {c.expected_visit_date ? `Visit: ${formatIndianDateOnly(c.expected_visit_date)}` : 'Visit scheduled'}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                            Assigned
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2.5 p-2 bg-amber-50/40 border border-amber-200/60 rounded-lg flex items-center justify-between text-xs group/alloc">
                          <div className="flex items-center gap-1.5 truncate text-amber-900">
                            <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="font-medium text-[11px] truncate">
                              Technician Not Assigned
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-amber-800 group-hover/alloc:text-amber-950 underline underline-offset-2 shrink-0">
                            Assign →
                          </span>
                        </div>
                      );
                    })()}

                    {/* Cash in Hand & Company Settlement in Card */}
                    {c.payment_collected > 0 && (
                      <div className="mt-2 flex items-center justify-between text-[11px] bg-slate-50/80 p-2 rounded-lg border border-slate-200/70">
                        <span className="text-slate-600 font-medium">
                          Collected: <strong className="text-emerald-700 font-bold">₹{c.payment_collected}</strong>
                        </span>
                        {c.company_settlement_status === 'Settled with Company' ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/70">
                            ✓ Co. Settled
                          </span>
                        ) : (c.assigned_technician_id || c.technician_id) ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/70">
                              Cash with Tech
                            </span>
                            {['admin', 'staff'].includes(currentUser?.role) && (
                              <button
                                type="button"
                                onClick={(e) => handleQuickSettle(e, c)}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-all shadow-xs"
                              >
                                Collect
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Footer Row */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs text-slate-500 mt-1">
                    <div className="flex items-center gap-1.5 truncate max-w-[55%] text-slate-500 text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {c.expected_visit_date ? `Visit: ${formatIndianDateOnly(c.expected_visit_date)}` : (c.technician_name ? 'Date Scheduled' : 'No Date Set')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* WhatsApp Button */}
                      {cleanPhone && (
                        <button
                          type="button"
                          onClick={(e) => handleWhatsAppChatClick(e, c)}
                          title={currentUser?.role === 'technician' ? 'Open WhatsApp App' : 'Open in CMS WhatsApp Hub'}
                          className="text-emerald-700 hover:text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/70 px-2 py-1 rounded-md transition-colors flex items-center gap-1 text-[11px] font-semibold"
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-600" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                      )}

                      {/* Delete Button (Admin & Staff only) */}
                      {['admin', 'staff'].includes(currentUser?.role) && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteComplaint(e, c)}
                          title="Delete Complaint Permanently"
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectComplaint(c.ticket_id || c.id)}
                        className="text-slate-300 hover:text-emerald-600 p-1 transition-colors"
                        title="Open Details"
                      >
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-all" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>
    </div>
  );
};
