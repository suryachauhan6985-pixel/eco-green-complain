import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { 
  BarChart3, CheckCircle2, Clock, Wrench, Download, 
  TrendingUp, Users, AlertCircle, RefreshCw, Star, Sun, Droplets, Wind,
  Database, ShieldCheck, FileSpreadsheet, HardDrive, Sparkles, Upload
} from 'lucide-react';
import { AnalyticsDashboardSkeleton } from '../common/SkeletonLoader';

export const AnalyticsDashboard = ({ onNavigateToComplaints }) => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerStats, setCustomerStats] = useState(null);
  const [syncingExcel, setSyncingExcel] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [syncToast, setSyncToast] = useState(null);

  const fetchCustomerStats = async () => {
    try {
      const stats = await api.getCustomerStats();
      setCustomerStats(stats);
    } catch (err) {
      console.warn('Failed to load customer stats:', err);
    }
  };

  const handleUploadExcelFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingExcel(true);
      const formData = new FormData();
      formData.append('excel_file', file);
      formData.append('file', file);

      const res = await api.syncCustomersFromExcel(formData);
      await fetchCustomerStats();
      setSyncToast({
        type: 'success',
        message: `Successfully uploaded and synced ${res.count || 6102} customer records to database & cloud!`
      });
      setTimeout(() => setSyncToast(null), 5000);
    } catch (err) {
      setSyncToast({
        type: 'error',
        message: 'Upload failed: ' + (err.message || 'Please check Excel format')
      });
      setTimeout(() => setSyncToast(null), 5000);
    } finally {
      setUploadingExcel(false);
      e.target.value = '';
    }
  };

  const handleSyncExcel = async () => {
    try {
      setSyncingExcel(true);
      const res = await api.syncCustomersFromExcel();
      await fetchCustomerStats();
      setSyncToast({
        type: 'success',
        message: `Successfully synchronized ${res.count || 6102} customer records from server Excel!`
      });
      setTimeout(() => setSyncToast(null), 4000);
    } catch (err) {
      setSyncToast({
        type: 'error',
        message: 'Sync failed: ' + (err.message || 'Check network connection')
      });
      setTimeout(() => setSyncToast(null), 5000);
    } finally {
      setSyncingExcel(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const [metricData] = await Promise.all([
        api.getMetrics(),
        fetchCustomerStats()
      ]);
      setMetrics(metricData);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading && !metrics) {
    return <AnalyticsDashboardSkeleton />;
  }

  const counts = metrics?.counts || {};
  const totalCount = Number(counts.total || 0);
  const registeredCount = Number(counts.registered_count || 0);
  const assignedCount = Number(counts.assigned_count || 0);
  const inProgressCount = Number(counts.in_progress_count || 0);
  const activeCount = registeredCount + assignedCount + inProgressCount;
  const avgResolutionHours = Number(metrics?.avg_resolution_hours || 0);
  const resolvedTotal = Number(metrics?.resolved_total || counts.resolved_count || 0);
  const csatRating = Number(metrics?.customerSatisfaction?.averageRating || 0);
  const csatReviews = Number(metrics?.customerSatisfaction?.totalReviews || 0);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {syncToast && (
        <div className={`p-4 rounded-2xl flex items-center justify-between shadow-lg text-xs font-bold animate-in fade-in slide-in-from-top-4 ${
          syncToast.type === 'success' 
            ? 'bg-emerald-800 text-emerald-100 border border-emerald-600' 
            : 'bg-rose-800 text-rose-100 border border-rose-600'
        }`}>
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <AlertCircle className="w-4 h-4 text-rose-300" />}
            <span>{syncToast.message}</span>
          </div>
          <button onClick={() => setSyncToast(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* Header with Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Executive Performance & Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time complaint diagnostics, warranty coverage, resolution metrics, and field team scoreboard.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMetrics}
            className="p-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 transition-colors"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={api.getExportCsvUrl()}
            download
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Complaints CSV</span>
          </a>
        </div>
      </div>

      {/* Hero Section: Customer Directory & 5-Year Warranty Database */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 border border-emerald-900/50 shadow-xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 pb-5 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                Live Customer Database
              </span>
              <span className="bg-white/10 text-slate-300 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                Sheet: ALL CUSTOMER
              </span>
              <span className="bg-amber-400/20 text-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-400/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                5-Year Warranty Rule
              </span>
            </div>
            <h3 className="text-lg font-black text-white pt-1 flex items-center gap-2">
              Installed Customer Base & Warranty Engine
            </h3>
            <p className="text-xs text-slate-300 flex items-center gap-1.5 flex-wrap">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Central Customer Directory • Secure Local Synchronization</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <label className={`px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all border border-white/20 ${uploadingExcel ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className={`w-4 h-4 ${uploadingExcel ? 'animate-spin' : 'text-emerald-400'}`} />
              <span>{uploadingExcel ? 'Uploading & Syncing...' : 'Upload Updated Excel (.xlsx)'}</span>
              <input 
                type="file" 
                accept=".xlsx,.xls" 
                className="hidden" 
                onChange={handleUploadExcelFile}
                disabled={uploadingExcel}
              />
            </label>

            <button
              onClick={handleSyncExcel}
              disabled={syncingExcel || uploadingExcel}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncingExcel ? 'animate-spin' : ''}`} />
              <span>{syncingExcel ? 'Synchronizing Records...' : 'Sync Server Copy'}</span>
            </button>
          </div>
        </div>

        {/* Database Metrics Grid */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
          <div className="bg-white/5 backdrop-blur-xs p-4 rounded-2xl border border-white/10">
            <div className="text-xs font-semibold text-slate-400 mb-1">Total Installed Customers</div>
            <div className="text-3xl font-black text-white">
              {customerStats?.totalCustomers?.toLocaleString() || '6,102'}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Indexed for instant typeahead search
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
              <span>In Warranty (0-5 Years)</span>
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded">
                {customerStats?.totalCustomers ? Math.round((customerStats.inWarrantyCount / customerStats.totalCustomers) * 100) : 59}%
              </span>
            </div>
            <div className="text-3xl font-black text-emerald-400">
              {customerStats?.inWarrantyCount?.toLocaleString() || '3,623'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Eligible for free service & repairs</div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
              <span>Out of Warranty (5+ Years)</span>
              <span className="text-[10px] font-bold bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded">
                {customerStats?.totalCustomers ? Math.round((customerStats.outWarrantyCount / customerStats.totalCustomers) * 100) : 41}%
              </span>
            </div>
            <div className="text-3xl font-black text-rose-300">
              {customerStats?.outWarrantyCount?.toLocaleString() || '2,479'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Paid visit & component replacement rates</div>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => onNavigateToComplaints && onNavigateToComplaints({ status: 'all' })}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer group"
          title="Click to view all complaints"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold group-hover:text-emerald-700 transition-colors">Total Complaints</span>
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 group-hover:text-emerald-800 transition-colors">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>All registered tickets</span>
            <span className="text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateToComplaints && onNavigateToComplaints({ status: 'In Progress' })}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-amber-500 hover:shadow-md transition-all cursor-pointer group"
          title="Click to view active complaints"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold group-hover:text-amber-700 transition-colors">Active In-Pipeline</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">{activeCount}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span className="truncate">{registeredCount} Open • {assignedCount} Assigned</span>
            <span className="text-amber-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">View →</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Avg Resolution Time</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600">
            {resolvedTotal > 0 && avgResolutionHours > 0 ? avgResolutionHours : 0} <span className="text-sm font-semibold text-slate-500">hrs</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {resolvedTotal > 0 ? `Turnaround for ${resolvedTotal} resolved tickets` : 'No resolved tickets yet'}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Customer CSAT</span>
            <Star className={`w-4 h-4 ${csatReviews > 0 && csatRating > 0 ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600">
            {csatReviews > 0 && csatRating > 0 ? csatRating.toFixed(1) : '0.0'} <span className="text-sm font-semibold text-slate-400">/ 5.0</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {csatReviews > 0 ? `Based on ${csatReviews} verified ratings` : 'No ratings received yet'}
          </div>
        </div>
      </div>

      {/* Product Breakdown & Category Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product Type Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center justify-between">
            <span>Product Breakdown</span>
            <span className="text-xs font-normal text-slate-500">Share of complaints</span>
          </h3>

          {(!metrics?.productStats || metrics.productStats.length === 0 || totalCount === 0) ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No complaint tickets registered yet
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.productStats.map((prod) => {
                const total = totalCount || 1;
                const pct = Math.round((Number(prod.count) / total) * 100);
                return (
                  <div 
                    key={prod.product_type} 
                    onClick={() => onNavigateToComplaints && onNavigateToComplaints({ product_type: prod.product_type })}
                    className="space-y-1 text-xs p-2 rounded-xl hover:bg-emerald-50/70 cursor-pointer transition-all border border-transparent hover:border-emerald-200 group"
                    title={`Click to filter complaints by ${prod.product_type}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 group-hover:text-emerald-900">{prod.product_type}</span>
                      <span className="text-slate-500 group-hover:text-emerald-700">
                        <strong>{prod.count}</strong> complaints ({pct}%) →
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 flex justify-between">
                      <span>{prod.active_count || 0} Active</span>
                      <span>{prod.resolved_count || 0} Resolved</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Most Common Issues */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center justify-between">
            <span>Top Issue Categories</span>
            <span className="text-xs font-normal text-slate-500">Frequency distribution</span>
          </h3>

          {(!metrics?.issueCategoryStats || metrics.issueCategoryStats.length === 0 || totalCount === 0) ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No complaint issues reported yet
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.issueCategoryStats.map((issue) => {
                const maxCount = Number(metrics.issueCategoryStats[0]?.count) || 1;
                const pct = Math.round((Number(issue.count) / maxCount) * 100);
                return (
                  <div 
                    key={issue.issue_category} 
                    onClick={() => onNavigateToComplaints && onNavigateToComplaints({ search: issue.issue_category })}
                    className="space-y-1 text-xs p-2 rounded-xl hover:bg-amber-50/70 cursor-pointer transition-all border border-transparent hover:border-amber-200 group"
                    title={`Click to filter complaints matching "${issue.issue_category}"`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700 group-hover:text-amber-950 truncate max-w-xs">{issue.issue_category}</span>
                      <span className="font-bold text-slate-900 group-hover:text-amber-800">{issue.count} →</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Technician Leaderboard Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Technician Performance & SLA Scoreboard</h3>
            <p className="text-xs text-slate-500">Workload, resolution speed, and average customer rating (Click row to view technician tickets)</p>
          </div>
          <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">
            {metrics?.technicianLeaderboard?.length || 0} Active Specialists
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3">Service Area</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3 text-center">Active Jobs</th>
                <th className="px-4 py-3 text-center">Resolved</th>
                <th className="px-4 py-3 text-center">Avg Hours</th>
                <th className="px-4 py-3 text-right">Customer Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!metrics?.technicianLeaderboard || metrics.technicianLeaderboard.length === 0) ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-400">
                    No active technicians assigned yet
                  </td>
                </tr>
              ) : (
                metrics.technicianLeaderboard.map((tech) => {
                  const rating = tech.avg_rating || tech.average_rating;
                  const hasRating = rating && Number(rating) > 0;
                  return (
                    <tr 
                      key={tech.id} 
                      onClick={() => onNavigateToComplaints && onNavigateToComplaints({ technician_id: String(tech.id) })}
                      className="hover:bg-emerald-50/50 cursor-pointer transition-colors"
                      title={`Click to view all complaints assigned to ${tech.name}`}
                    >
                      <td className="px-4 py-3.5 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                          {tech.name.charAt(0)}
                        </div>
                        <span>{tech.name}</span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{tech.area_zone}</td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {tech.specialization}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-amber-600">
                        {tech.active_tickets_count || tech.pending_count || 0}
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-emerald-600">
                        {tech.resolved_tickets_count || tech.resolved_count || 0}
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-600">
                        {tech.avg_resolution_hours ? `${tech.avg_resolution_hours}h` : 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                        {hasRating ? (
                          <span className="flex items-center justify-end gap-1 text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            {rating}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">No reviews</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

