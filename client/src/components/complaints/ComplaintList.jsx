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
import { TicketAgeBadge, getTicketAgeInfo } from '../common/TicketAgeBadge';

export const ComplaintList = ({ 
  onSelectComplaint, 
  onOpenNewComplaint, 
  onOpenWhatsAppChat,
  refreshKey, 
  initialFilters 
}) => {
  const { currentUser } = useAuth();
  const { confirm, alert, showToast } = useDialog();
  const [complaints, setComplaints] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (productFilter !== 'all') params.product_type = productFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (technicianFilter) params.technician_id = technicianFilter;

      const data = await api.getComplaints(params);
      setComplaints(data.complaints || []);
    } catch (err) {
      console.error('Failed to load complaints:', err);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    fetchComplaints();
    fetchTechnicians();
  }, [statusFilter, productFilter, priorityFilter, technicianFilter, refreshKey]);

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
    const techName = complaint.technician_name || 'the assigned technician';
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
              onClick={fetchComplaints}
              title="Refresh list"
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 border border-slate-200"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
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
          const displayedComplaints = complaints.filter(c => {
            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
            if (productFilter !== 'all' && c.product_type !== productFilter) return false;
            if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
            if (technicianFilter && String(c.assigned_technician_id) !== String(technicianFilter)) return false;
            return true;
          });

          if (loading) {
            return (
              <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                Loading complaints...
              </div>
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
                      onClick={() => onSelectComplaint(c.id)}
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
                        <div className="flex items-center gap-1 text-slate-700">
                          <Wrench className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[140px] font-medium">
                            {c.technician_name || <em className="text-amber-600 font-normal">Unassigned</em>}
                          </span>
                        </div>
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
                          <button
                            type="button"
                            onClick={(e) => handleDeleteComplaint(e, c)}
                            title="Delete Complaint Permanently"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
          /* CARD GRID VIEW — Responsive: 1 col mobile, 2 cols tablet, 3-4 cols on wide screens */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 bg-slate-100/60">
            {displayedComplaints.map((c) => {
              const displayStatus = getDisplayStatus(c.status);
              const ageInfo = getTicketAgeInfo(c);
              const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
              const waMessage = encodeURIComponent(
                `Namaste ${c.customer_name},\nRegarding your Eco Green Solar complaint (${c.ticket_id}) for ${c.product_type}.\nStatus: ${displayStatus}\nAssigned Technician: ${c.technician_name || 'Assigned shortly'}.\nEco Green Solar Helpdesk.`
              );
              const waUrl = `https://wa.me/${cleanPhone}?text=${waMessage}`;

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectComplaint(c.id)}
                  className={`bg-white rounded-2xl border p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 group relative overflow-hidden ${
                    ageInfo.isOverdue 
                      ? 'border-rose-300 hover:border-rose-400 ring-1 ring-rose-200/70' 
                      : 'border-slate-200 hover:border-emerald-500'
                  }`}
                >
                  {/* Product color accent bar on top (Consistent on all cards) */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    c.product_type === 'Solar Rooftop Systems' ? 'bg-amber-400' :
                    c.product_type === 'Solar Water Heaters' ? 'bg-blue-400' : 'bg-teal-500'
                  }`} />

                  {/* Top: Ticket ID, Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="p-1 rounded-md bg-slate-50 border border-slate-200 shrink-0">
                          {getProductIcon(c.product_type)}
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-emerald-700 truncate">
                          {c.ticket_id}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeStyle(displayStatus)}`}>
                          {displayStatus}
                        </span>

                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          getDisplayPriority(c.priority) === 'High' ? 'bg-amber-100 text-amber-700' :
                          getDisplayPriority(c.priority) === 'Medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {getDisplayPriority(c.priority)}
                        </span>
                      </div>
                    </div>

                    {/* Prominent Age & SLA Alert Bar */}
                    <div className="mb-2">
                      <TicketAgeBadge complaint={c} compact={true} />
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

                    <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-800/80 font-medium truncate mt-0.5">
                      <span className="truncate">{c.product_type} {c.city ? `• ${c.city}` : ''}</span>
                      {c.estimated_charges > 0 && (
                        <span className="text-[10px] font-bold text-slate-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                          ₹{c.estimated_charges}
                        </span>
                      )}
                    </div>

                    {/* Issue Summary Box - Full visibility with balanced uniform min-height */}
                    <div 
                      className="text-xs text-slate-600 mt-1.5 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 min-h-[64px] flex flex-col justify-start"
                      title={`${c.issue_category}: ${c.issue_description}`}
                    >
                      <p className="line-clamp-3 leading-relaxed">
                        <strong className="text-slate-800 font-semibold">{c.issue_category}:</strong>{' '}
                        <span>{c.issue_description}</span>
                      </p>
                    </div>

                    {/* Cash in Hand & Company Settlement in Card */}
                    {c.payment_collected > 0 && (
                      <div className="mt-2 flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                        <span className="text-slate-600 font-medium">
                          Collected: <strong className="text-emerald-700">₹{c.payment_collected}</strong>
                        </span>
                        {c.company_settlement_status === 'Settled with Company' ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                            ✓ Co. Settled
                          </span>
                        ) : (c.assigned_technician_id || c.technician_id) ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200">
                              Cash with Tech
                            </span>
                            {['admin', 'staff'].includes(currentUser?.role) && (
                              <button
                                type="button"
                                onClick={(e) => handleQuickSettle(e, c)}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold transition-all shadow-xs"
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
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1 truncate max-w-[60%]">
                      <Wrench className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate font-semibold text-slate-700">
                        {c.technician_name || <em className="text-amber-600 font-normal">Unassigned</em>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* WhatsApp Button */}
                      {cleanPhone && (
                        <button
                          type="button"
                          onClick={(e) => handleWhatsAppChatClick(e, c)}
                          title={currentUser?.role === 'technician' ? 'Open WhatsApp App' : 'Open in CMS WhatsApp Hub'}
                          className="text-emerald-600 hover:text-emerald-700 p-1 rounded-md hover:bg-emerald-50 transition-colors flex items-center gap-1 text-[11px] font-medium"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteComplaint(e, c)}
                        title="Delete Complaint Permanently"
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectComplaint(c.id)}
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
