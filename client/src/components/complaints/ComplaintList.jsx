import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { 
  Search, Filter, Plus, Download, RefreshCw, Sun, Droplets, Wind, 
  User, Calendar, Clock, ChevronRight, AlertCircle, CheckCircle2, Wrench,
  MessageCircle, MapPin, LayoutList, LayoutGrid, ShieldCheck, ShieldAlert, IndianRupee,
  AlertTriangle
} from 'lucide-react';
import { TicketAgeBadge, getTicketAgeInfo } from '../common/TicketAgeBadge';

export const ComplaintList = ({ onSelectComplaint, onOpenNewComplaint }) => {
  const { currentUser } = useAuth();
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState('');

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
  }, [statusFilter, productFilter, priorityFilter, technicianFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchComplaints();
  };

  const getProductIcon = (type) => {
    if (type === 'Solar Rooftop Systems') return <Sun className="w-4 h-4 text-amber-500" />;
    if (type === 'Solar Water Heaters') return <Droplets className="w-4 h-4 text-blue-500" />;
    return <Wind className="w-4 h-4 text-teal-500" />;
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
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            Loading complaints...
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <h4 className="text-sm font-bold text-slate-700">No complaints found</h4>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search keywords</p>
          </div>
        ) : viewMode === 'list' ? (
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
                {complaints.map((c) => {
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
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                            c.priority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {c.priority}
                          </span>
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
                        {c.estimated_charges > 0 ? (
                          <div>
                            <span className="font-bold text-slate-900 block">
                              ₹{c.estimated_charges}
                            </span>
                            <span className={`text-[10px] font-bold ${
                              c.payment_status === 'Collected' ? 'text-emerald-600' :
                              c.payment_status === 'Partially Paid' ? 'text-blue-600' :
                              'text-amber-600'
                            }`}>
                              {c.payment_status || 'Unpaid'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Free / In-Wty</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {cleanPhone && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Chat on WhatsApp"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                          <button
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
            {complaints.map((c) => {
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
                  className={`bg-white rounded-xl border p-3.5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 group relative overflow-hidden ${
                    ageInfo.isOverdue 
                      ? 'border-rose-300 ring-1 ring-rose-200 border-l-4 border-l-rose-500' 
                      : 'border-slate-200/90 hover:border-emerald-500'
                  }`}
                >
                  {/* Product color accent bar on top */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
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
                          c.priority === 'High' ? 'bg-amber-100 text-amber-700' :
                          c.priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {c.priority}
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

                    {/* Issue Summary Box */}
                    <div className="text-xs text-slate-600 line-clamp-2 mt-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <strong className="text-slate-800">{c.issue_category}:</strong> {c.issue_description}
                    </div>
                  </div>

                  {/* Footer Row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1 truncate max-w-[60%]">
                      <Wrench className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate font-semibold text-slate-700">
                        {c.technician_name || <em className="text-amber-600 font-normal">Unassigned</em>}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Free WhatsApp Link Button */}
                      {cleanPhone && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Free WhatsApp Chat with Customer"
                          className="text-emerald-600 hover:text-emerald-700 p-1 rounded-md hover:bg-emerald-50 transition-colors flex items-center gap-1 text-[11px] font-medium"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      )}

                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
