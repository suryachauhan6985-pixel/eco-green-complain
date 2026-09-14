import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { 
  Search, Filter, Plus, Download, RefreshCw, Sun, Droplets, Wind, 
  User, Calendar, Clock, ChevronRight, AlertCircle, CheckCircle2, Wrench,
  MessageCircle, MapPin
} from 'lucide-react';

export const ComplaintList = ({ onSelectComplaint, onOpenNewComplaint }) => {
  const { currentUser } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const statusPills = ['all', 'Registered', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened'];

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Ticket ID (e.g. EGS-2026-000101), Phone, or Name..."
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

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
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
            <option value="Urgent">Urgent Priority</option>
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

      {/* Complaints Table / List */}
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-3.5 bg-slate-100/60">
            {complaints.map((c) => {
              const cleanPhone = (c.customer_phone || '').replace(/[^0-9]/g, '');
              const waMessage = encodeURIComponent(
                `Namaste ${c.customer_name},\nRegarding your Eco Green Solar complaint (${c.ticket_id}) for ${c.product_type}.\nStatus: ${c.status}\nAssigned Technician: ${c.technician_name || 'Assigned shortly'}.\nEco Green Solar Helpdesk.`
              );
              const waUrl = `https://wa.me/${cleanPhone}?text=${waMessage}`;

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectComplaint(c.id)}
                  className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs hover:shadow-md hover:border-emerald-500 transition-all cursor-pointer flex flex-col justify-between gap-3 group relative overflow-hidden"
                >
                  {/* Product color accent bar on top */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    c.product_type === 'Solar Rooftop Systems' ? 'bg-amber-400' :
                    c.product_type === 'Solar Water Heaters' ? 'bg-blue-400' : 'bg-teal-500'
                  }`} />

                  {/* Top: Ticket ID, Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
                          {getProductIcon(c.product_type)}
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-emerald-700 truncate">
                          {c.ticket_id}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          c.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                          c.status === 'Closed' ? 'bg-slate-200 text-slate-800' :
                          c.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                          c.status === 'Assigned' ? 'bg-amber-100 text-amber-800' :
                          c.status === 'Reopened' ? 'bg-rose-100 text-rose-800' :
                          'bg-yellow-100 text-yellow-900'
                        }`}>
                          {c.status}
                        </span>

                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          c.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                          c.priority === 'High' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {c.priority}
                        </span>
                      </div>
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

                    <p className="text-[11px] text-emerald-800/80 font-medium truncate mt-0.5">
                      {c.product_type} {c.product_serial ? `• SN: ${c.product_serial}` : ''}
                    </p>

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

                      <span className="text-[11px] text-slate-400">
                        {new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
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
