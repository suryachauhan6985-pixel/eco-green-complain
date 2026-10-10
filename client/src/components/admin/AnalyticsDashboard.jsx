import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { 
  BarChart3, CheckCircle2, Clock, Wrench, Download, Calendar, Filter, X, Tag, Layers, 
  TrendingUp, Users, AlertCircle, RefreshCw, Star, Sun, Droplets, Wind,
  Database, ShieldCheck, FileSpreadsheet, HardDrive, Sparkles, Upload
} from 'lucide-react';
import { AnalyticsDashboardSkeleton } from '../common/SkeletonLoader';
import { subscribeLiveSync } from '../../utils/liveSync';
import { formatIndianDateOnly, formatIndianDateTime, formatIndianTimeOnly, parseDateSafe } from '../common/TicketAgeBadge';


// Client-side metrics calculation from live complaints list & technicians
function computeMetricsFromComplaints(complaintsList = [], techsList = [], serverMetrics = null) {
  const total = complaintsList.length;
  const registeredCount = complaintsList.filter(c => ['Registered', 'Unassigned', 'New', 'Open'].includes(c.status)).length;
  const assignedCount = complaintsList.filter(c => c.status === 'Assigned').length;
  const inProgressCount = complaintsList.filter(c => c.status === 'In Progress').length;
  const onHoldCount = complaintsList.filter(c => c.status === 'On Hold').length;
  const resolvedCount = complaintsList.filter(c => c.status === 'Resolved').length;
  const closedCount = complaintsList.filter(c => c.status === 'Closed').length;
  const reopenedCount = complaintsList.filter(c => c.status === 'Reopened').length;
  const activeCount = Math.max(0, total - (resolvedCount + closedCount));

  // Product distribution WITH per-product issue categories
  const productMap = {};
  const standardProducts = ['Solar Rooftop Systems', 'Solar Water Heaters', 'Heat Pumps'];
  standardProducts.forEach(p => {
    productMap[p] = {
      product_type: p,
      count: 0,
      active_count: 0,
      resolved_count: 0,
      issueCategories: {}
    };
  });

  complaintsList.forEach(c => {
    const pType = c.product_type || 'Solar Rooftop Systems';
    if (!productMap[pType]) {
      productMap[pType] = {
        product_type: pType,
        count: 0,
        active_count: 0,
        resolved_count: 0,
        issueCategories: {}
      };
    }
    productMap[pType].count++;
    if (['Resolved', 'Closed'].includes(c.status)) {
      productMap[pType].resolved_count++;
    } else {
      productMap[pType].active_count++;
    }

    const cat = c.issue_category || 'General Service & Maintenance';
    productMap[pType].issueCategories[cat] = (productMap[pType].issueCategories[cat] || 0) + 1;
  });

  const productStats = Object.values(productMap)
    .map(prod => {
      const categories = Object.entries(prod.issueCategories)
        .map(([issue_category, count]) => ({
          issue_category,
          count,
          percent: prod.count > 0 ? Math.round((count / prod.count) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);

      return {
        ...prod,
        categories
      };
    })
    .sort((a, b) => b.count - a.count);

  // Overall Issue category distribution
  const issueMap = {};
  complaintsList.forEach(c => {
    const cat = c.issue_category || 'General Service & Maintenance';
    issueMap[cat] = (issueMap[cat] || 0) + 1;
  });
  const issueCategoryStats = Object.entries(issueMap)
    .map(([issue_category, count]) => ({ issue_category, count }))
    .sort((a, b) => b.count - a.count);

  // Priority distribution
  const priorityMap = {};
  complaintsList.forEach(c => {
    const pri = c.priority || 'Medium';
    priorityMap[pri] = (priorityMap[pri] || 0) + 1;
  });
  const priorityStats = Object.entries(priorityMap).map(([priority, count]) => ({ priority, count }));

  // Average Resolution Hours
  let totalHours = 0;
  let resolvedWithDates = 0;
  complaintsList.forEach(c => {
    if (c.resolved_at && c.created_at) {
      const hrs = (new Date(c.resolved_at) - new Date(c.created_at)) / (1000 * 60 * 60);
      if (hrs >= 0 && hrs < 2000) {
        totalHours += hrs;
        resolvedWithDates++;
      }
    }
  });
  const avgResolutionHours = resolvedWithDates > 0 ? Math.round((totalHours / resolvedWithDates) * 10) / 10 : (serverMetrics?.avg_resolution_hours || 0);

  // Customer satisfaction
  let ratingSum = 0;
  let ratingCount = 0;
  complaintsList.forEach(c => {
    const r = Number(c.rating);
    if (r > 0) {
      ratingSum += r;
      ratingCount++;
    }
  });
  const averageRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : (serverMetrics?.customerSatisfaction?.averageRating || 0);

  // Technician leaderboard
  const techMap = {};
  techsList.forEach(t => {
    techMap[t.id] = {
      id: t.id,
      name: t.name,
      area_zone: t.area_zone || 'Field Specialist',
      specialization: t.specialization || 'Solar Technical',
      total_assigned: 0,
      resolved_count: 0,
      pending_count: 0,
      ratings: [],
      resolution_hours: []
    };
  });

  complaintsList.forEach(c => {
    const tId = c.assigned_technician_id || c.technician_id;
    if (tId && techMap[tId]) {
      techMap[tId].total_assigned++;
      if (['Resolved', 'Closed'].includes(c.status)) {
        techMap[tId].resolved_count++;
      } else {
        techMap[tId].pending_count++;
      }
      if (c.rating && Number(c.rating) > 0) techMap[tId].ratings.push(Number(c.rating));
      if (c.resolved_at && c.created_at) {
        const h = (new Date(c.resolved_at) - new Date(c.created_at)) / (1000 * 60 * 60);
        if (h >= 0 && h < 2000) techMap[tId].resolution_hours.push(h);
      }
    }
  });

  const technicianLeaderboard = Object.values(techMap).map(t => {
    const avgR = t.ratings.length > 0 ? Math.round((t.ratings.reduce((a, b) => a + b, 0) / t.ratings.length) * 10) / 10 : 0;
    const avgH = t.resolution_hours.length > 0 ? Math.round((t.resolution_hours.reduce((a, b) => a + b, 0) / t.resolution_hours.length) * 10) / 10 : 0;
    return {
      id: t.id,
      name: t.name,
      area_zone: t.area_zone,
      specialization: t.specialization,
      total_assigned: t.total_assigned,
      resolved_count: t.resolved_count,
      pending_count: t.pending_count,
      avg_rating: avgR,
      avg_resolution_hours: avgH
    };
  }).sort((a, b) => b.resolved_count - a.resolved_count || b.total_assigned - a.total_assigned);

  return {
    counts: {
      total,
      registered_count: registeredCount,
      assigned_count: assignedCount,
      in_progress_count: inProgressCount,
      on_hold_count: onHoldCount,
      resolved_count: resolvedCount,
      closed_count: closedCount,
      reopened_count: reopenedCount,
      active_count: activeCount
    },
    avg_resolution_hours: avgResolutionHours,
    resolved_total: resolvedCount + closedCount,
    productStats,
    issueCategoryStats,
    priorityStats,
    technicianLeaderboard,
    customerSatisfaction: {
      averageRating,
      totalReviews: ratingCount || (serverMetrics?.customerSatisfaction?.totalReviews || 0)
    }
  };
}

export const AnalyticsDashboard = ({ onNavigateToComplaints }) => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerStats, setCustomerStats] = useState(null);
  const [allComplaints, setAllComplaints] = useState([]);
  const [allTechs, setAllTechs] = useState([]);
  const [filterPreset, setFilterPreset] = useState('all'); // 'all', 'today', 'yesterday', 'this_week', 'this_month', 'last_month', 'this_year', 'custom'
  const [filterMonth, setFilterMonth] = useState('all'); // 'all', '1'..'12'
  const [filterYear, setFilterYear] = useState('all'); // 'all', '2026', '2025'
  const [customStartDate, setCustomStartDate] = useState(''); // 'YYYY-MM-DD'
  const [customEndDate, setCustomEndDate] = useState(''); // 'YYYY-MM-DD'
  const [syncingExcel, setSyncingExcel] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const [isExcelDragging, setIsExcelDragging] = useState(false);

  const fetchCustomerStats = async () => {
    try {
      const stats = await api.getCustomerStats();
      setCustomerStats(stats);
    } catch (err) {
      console.warn('Failed to load customer stats:', err);
    }
  };

  const processExcelUpload = async (file) => {
    if (!file) return;

    try {
      setUploadingExcel(true);
      setSyncToast({
        type: 'info',
        message: 'Reading and validating Excel workbook...'
      });

      // Parse Excel file in browser memory via SheetJS
      const buffer = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      
      const sheetName = workbook.SheetNames.find(s => {
        const n = s.trim().toUpperCase();
        return n === 'ALL CUSTOMER' || n === 'ALL CUSTOMERS' || n === 'CUSTOMERS' || n === 'CUSTOMER' || n === 'SHEET1';
      }) || workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error('No valid sheet found in uploaded Excel workbook');
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows || rows.length === 0) {
        throw new Error('Uploaded Excel file appears to be empty');
      }

      // Robust helper to extract Excel cell values matching multiple possible column headers
      const getExcelVal = (row, aliases) => {
        if (!row || typeof row !== 'object') return '';
        const keys = Object.keys(row);
        for (const alias of aliases) {
          if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
            return row[alias];
          }
          const normAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
          const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normAlias);
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
            return row[foundKey];
          }
        }
        return '';
      };

      // Comprehensive date parser for Excel serial numbers, DD-MM-YYYY, DD/MM/YYYY, ISO, and 2-digit years
      const parseExcelDate = (val) => {
        if (!val) return null;
        if (val instanceof Date && !isNaN(val.getTime())) {
          return val;
        }

        // Excel serial date code
        if (typeof val === 'number' && !isNaN(val) && val > 1000) {
          try {
            if (XLSX.SSF && XLSX.SSF.parse_date_code) {
              const p = XLSX.SSF.parse_date_code(val);
              if (p && p.y && p.m && p.d) {
                const d = new Date(p.y, p.m - 1, p.d);
                if (!isNaN(d.getTime())) return d;
              }
            }
          } catch (_) {}
          const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
          if (!isNaN(jsDate.getTime())) return jsDate;
        }

        const rawStr = String(val).trim();
        if (!rawStr) return null;

        // String numeric serial like "44024"
        if (/^\d{5}$/.test(rawStr)) {
          const num = Number(rawStr);
          const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
          if (!isNaN(jsDate.getTime())) return jsDate;
        }

        // Clean string from trailing timestamps like " 00:00:00"
        const str = rawStr.split(' ')[0].split('T')[0].trim();

        // 4-digit Year: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
        const dmy4Match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
        if (dmy4Match) {
          const day = parseInt(dmy4Match[1], 10);
          const month = parseInt(dmy4Match[2], 10) - 1;
          const year = parseInt(dmy4Match[3], 10);
          const d = new Date(year, month, day);
          if (!isNaN(d.getTime())) return d;
        }

        // 2-digit Year: DD-MM-YY or DD/MM/YY or DD.MM.YY
        const dmy2Match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
        if (dmy2Match) {
          const day = parseInt(dmy2Match[1], 10);
          const month = parseInt(dmy2Match[2], 10) - 1;
          const rawY = parseInt(dmy2Match[3], 10);
          const year = rawY < 50 ? 2000 + rawY : 1900 + rawY;
          const d = new Date(year, month, day);
          if (!isNaN(d.getTime())) return d;
        }

        // 4-digit Year: YYYY-MM-DD or YYYY/MM/DD
        const ymd4Match = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (ymd4Match) {
          const year = parseInt(ymd4Match[1], 10);
          const month = parseInt(ymd4Match[2], 10) - 1;
          const day = parseInt(ymd4Match[3], 10);
          const d = new Date(year, month, day);
          if (!isNaN(d.getTime())) return d;
        }

        // Textual or standard ISO format (e.g. "15-Aug-2018", "2019-05-14T00:00:00.000Z")
        const parsed = new Date(rawStr);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }

        return null;
      };

      // Intelligent date value extractor that checks explicit aliases, then fuzzy keyword matching
      const getExcelDateVal = (row) => {
        const explicit = getExcelVal(row, [
          'Date of Installation of Solar Meter', 'Date of Installation', 'Installation Date', 'Install Date',
          'Date of Commissioning', 'Commissioning Date', 'DOC', 'DOI', 'Installation Dt',
          'Meter Installation Date', 'Meter Date', 'Date of Solar Meter Installation',
          'Date of Commissioning of Solar PV System', 'Commissioning Dt', 'Solar Meter Inst Date',
          'Connection Date', 'Work Completion Date', 'Invoice Date', 'InvoiceDate', 'Inv Date', 'Bill Date', 'Date'
        ]);
        if (explicit) return explicit;

        const keys = Object.keys(row);
        const dateKey = keys.find(k => {
          const lower = k.toLowerCase();
          return (lower.includes('date') || lower.includes('dt')) && 
                 (lower.includes('install') || lower.includes('commiss') || lower.includes('meter') || lower.includes('invoice') || lower.includes('doc') || lower.includes('doi'));
        });
        if (dateKey && row[dateKey]) return row[dateKey];

        const anyDateKey = keys.find(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('dt'));
        if (anyDateKey && row[anyDateKey]) return row[anyDateKey];

        return '';
      };

      const formatDate = (d) => {
        if (!d || isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      let inWarrantyCount = 0;
      let outWarrantyCount = 0;
      const today = new Date();
      const mappedCustomers = [];

      for (const r of rows) {
        const customerName = String(getExcelVal(r, [
          'Customer Name', 'CustomerName', 'Name of Customer', 'Consumer Name', 'Client Name', 'Name', 'Customer'
        ])).trim();
        if (!customerName) continue;

        const rawMeterDate = getExcelVal(r, [
          'Date of Installation of Solar Meter', 'Date of Installation', 'Installation Date', 'Install Date',
          'Date of Commissioning', 'Commissioning Date', 'DOC', 'DOI', 'Installation Dt',
          'Meter Installation Date', 'Meter Date', 'Date of Solar Meter Installation',
          'Date of Commissioning of Solar PV System', 'Commissioning Dt', 'Solar Meter Inst Date',
          'Connection Date', 'Work Completion Date'
        ]);
        const rawInvDate = getExcelVal(r, [
          'Invoice Date', 'InvoiceDate', 'Inv Date', 'Bill Date', 'Date'
        ]);

        const installD = parseExcelDate(rawMeterDate);
        const invD = parseExcelDate(rawInvDate);
        const refD = installD || invD;

        let isInWarranty = 0;
        let expiryDateStr = null;

        if (refD && !isNaN(refD.getTime())) {
          const expiryDate = new Date(refD);
          expiryDate.setFullYear(expiryDate.getFullYear() + 5);
          expiryDateStr = formatDate(expiryDate);

          // Precise 5-Year Warranty Rule: If today is within 5 years from installation, plant is IN WARRANTY
          isInWarranty = today <= expiryDate ? 1 : 0;
        } else {
          isInWarranty = 0;
        }

        if (isInWarranty) inWarrantyCount++;
        else outWarrantyCount++;

        const srVal = getExcelVal(r, ['Sr No.', 'Sr. No.', 'Sr No', 'Sr#', 'S.No', 'Serial No']);
        const srNo = (srVal !== '' && !isNaN(srVal)) ? parseInt(srVal, 10) : null;

        const pvVal = getExcelVal(r, ['PV Capacity', 'PV Capacity (kW)', 'Capacity', 'Capacity (kW)', 'Plant Capacity']);
        const pvCapacity = (pvVal !== '' && !isNaN(pvVal)) ? parseFloat(pvVal) : null;

        mappedCustomers.push({
          sr_no: srNo,
          order_no: String(getExcelVal(r, [
            'Order No', 'Order No.', 'Order Number', 'Order_No', 'order_no', 'Order', 'Order Id', 'Order ID',
            'SO No', 'SO Number', 'SO No.', 'SO#', 'Order#', 'Sales Order', 'Sales Order No', 'Sales Order Number',
            'Work Order', 'Work Order No', 'WO No', 'Application No', 'Application Number', 'App No', 'App No.',
            'Registration No', 'Reg No', 'Ref No', 'Reference No'
          ])).trim() || null,
          scheme: String(getExcelVal(r, ['Scheme', 'Project Scheme', 'Scheme Name', 'Govt Scheme'])).trim() || null,
          pv_capacity: pvCapacity,
          consumer_no: String(getExcelVal(r, ['Consumer No.', 'Consumer No', 'Consumer Number', 'CA No', 'Account No', 'K No'])).trim() || null,
          consumer_mobile: String(getExcelVal(r, ['Consumer Mobile', 'Mobile', 'Mobile No', 'Phone', 'Phone No', 'Contact', 'Contact No'])).trim() || null,
          customer_name: customerName,
          city_village: String(getExcelVal(r, ['City/Village', 'City', 'Village', 'Location', 'Town', 'District'])).trim() || null,
          installation_date: formatDate(installD) || formatDate(invD),
          dealer_name: String(getExcelVal(r, ['Dealer Name', 'Dealer', 'Agency', 'Vendor', 'Channel Partner'])).trim() || null,
          invoice_no: String(getExcelVal(r, ['Invoice No ', 'Invoice No.', 'Invoice No', 'Invoice Number', 'Bill No', 'Inv No'])).trim() || null,
          invoice_date: formatDate(invD) || formatDate(installD),
          panel_make: String(getExcelVal(r, ['Panel Make', 'Panel Manufacturer', 'Module Make', 'Panel Brand'])).trim() || null,
          inverter_make: String(getExcelVal(r, ['Inverter Make', 'Inverter Manufacturer', 'Inverter Brand'])).trim() || null,
          inverter_serial: String(getExcelVal(r, ['Inverter Sr. No.', 'Inverter Sr No', 'Inverter Serial', 'Inverter Serial No', 'Serial No'])).trim() || null,
          is_in_warranty: isInWarranty,
          warranty_expiry_date: expiryDateStr
        });
      }

      const totalCustomers = mappedCustomers.length;
      if (totalCustomers === 0) {
        throw new Error('No valid customer rows found in uploaded sheet');
      }

      // Stream customer records to database in optimized batches of 250 for zero drops and smooth progress
      const BATCH_SIZE = 250;
      const totalBatches = Math.ceil(mappedCustomers.length / BATCH_SIZE);
      let latestServerResult = null;

      for (let b = 0; b < totalBatches; b++) {
        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, mappedCustomers.length);
        const chunk = mappedCustomers.slice(start, end);
        const isFirstBatch = b === 0;
        const isLastBatch = b === totalBatches - 1;

        const progressPercent = Math.round((end / mappedCustomers.length) * 100);
        setSyncToast({
          type: 'info',
          message: `Saving to database: ${end.toLocaleString()} / ${mappedCustomers.length.toLocaleString()} records (${progressPercent}%)...`
        });

        const res = await api.syncCustomersBatch({
          isFirstBatch,
          isLastBatch,
          batchIndex: b,
          totalBatches,
          totalCustomers: mappedCustomers.length,
          inWarrantyCount,
          outWarrantyCount,
          customers: chunk
        });

        if (isLastBatch && res) {
          latestServerResult = res;
        }
      }

      // Fetch live verified count directly from database
      await fetchCustomerStats();

      // Save complete uploaded customer list into localStorage for instant offline typeahead autofill
      try {
        localStorage.setItem('egs_uploaded_customers', JSON.stringify(mappedCustomers.slice(0, 3000)));
      } catch (_) {}

      setSyncToast({
        type: 'success',
        message: `Successfully saved all ${totalCustomers.toLocaleString()} customer records permanently in database! In Warranty: ${inWarrantyCount.toLocaleString()} (0-5 Yrs), Out of Warranty: ${outWarrantyCount.toLocaleString()} (5+ Yrs)`
      });
      setTimeout(() => setSyncToast(null), 8000);
    } catch (err) {
      console.error('Excel upload processing error:', err);
      setSyncToast({
        type: 'error',
        message: 'Upload failed: ' + (err.message || 'Please check Excel file format')
      });
      setTimeout(() => setSyncToast(null), 6000);
    } finally {
      setUploadingExcel(false);
    }
  };

  const handleUploadExcelFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) await processExcelUpload(file);
    if (e.target) e.target.value = '';
  };

  const handleSyncExcel = async () => {
    try {
      setSyncingExcel(true);
      const res = await api.syncCustomersFromExcel();
      await fetchCustomerStats();
      const count = res.totalCustomers || res.count || customerStats?.totalCustomers || 0;
      setSyncToast({
        type: 'success',
        message: `Database synchronized with live server! (${count.toLocaleString()} records in database)`
      });
      setTimeout(() => setSyncToast(null), 5000);
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

  const fetchMetrics = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [metricData, complaintsRes, techsRes] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getComplaints().catch(() => null),
        api.getTechnicians().catch(() => null),
        fetchCustomerStats()
      ]);

      const complaintsList = Array.isArray(complaintsRes?.complaints) 
        ? complaintsRes.complaints 
        : (Array.isArray(complaintsRes) ? complaintsRes : []);
      const techsList = Array.isArray(techsRes?.technicians) 
        ? techsRes.technicians 
        : (Array.isArray(techsRes) ? techsRes : []);

      setAllComplaints(complaintsList);
      setAllTechs(techsList);

      let finalMetrics = metricData;
      // If server metrics is empty, 0 total, or missing breakdowns, compute from live complaints list
      if (!finalMetrics || !finalMetrics.counts || Number(finalMetrics.counts.total || 0) === 0 || !finalMetrics.productStats || finalMetrics.productStats.length === 0) {
        if (complaintsList.length > 0) {
          finalMetrics = computeMetricsFromComplaints(complaintsList, techsList, finalMetrics);
        }
      }

      if (finalMetrics) {
        const total = Number(finalMetrics.counts?.total || complaintsList.length || 0);
        const resolved = Number(finalMetrics.counts?.resolved_count || 0);
        const closed = Number(finalMetrics.counts?.closed_count || 0);
        const active = Math.max(0, total - (resolved + closed));
        if (!finalMetrics.counts) finalMetrics.counts = {};
        finalMetrics.counts.active_count = active;
        if (!finalMetrics.counts.total) finalMetrics.counts.total = total;
      }

      setMetrics(finalMetrics);
    } catch (err) {
      if (!silent) console.error('Failed to load metrics:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    // Real-Time Live Sync across tabs, windows, and roles without browser refresh
    const unsubscribe = subscribeLiveSync(['complaints', 'techs'], () => {
      fetchMetrics(true);
    });

    // Resilient background heartbeat sync every 8 seconds when visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchMetrics(true);
      }
    }, 8000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const availableYears = React.useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    allComplaints.forEach(c => {
      const d = parseDateSafe(c.created_at);
      if (d) years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allComplaints]);

  const isFilterActive = filterPreset !== 'all' || filterMonth !== 'all' || filterYear !== 'all' || !!customStartDate || !!customEndDate;

  const handleResetFilter = () => {
    setFilterPreset('all');
    setFilterMonth('all');
    setFilterYear('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const filteredComplaints = React.useMemo(() => {
    if (!isFilterActive) return allComplaints;

    const now = new Date();
    const getISTInfo = (dateInput) => {
      const d = parseDateSafe(dateInput);
      if (!d) return null;
      try {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).formatToParts(d);
        const day = Number(parts.find(p => p.type === 'day')?.value);
        const month = Number(parts.find(p => p.type === 'month')?.value);
        const year = Number(parts.find(p => p.type === 'year')?.value);
        const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { day, month, year, ymd };
      } catch (_) {
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { day, month, year, ymd };
      }
    };

    const currentIST = getISTInfo(now);
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayIST = getISTInfo(yesterdayDate);
    const weekAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoIST = getISTInfo(weekAgoDate);

    let lastMonthYear = currentIST.year;
    let lastMonthNum = currentIST.month - 1;
    if (lastMonthNum === 0) {
      lastMonthNum = 12;
      lastMonthYear -= 1;
    }

    return allComplaints.filter(c => {
      const cIST = getISTInfo(c.created_at);
      if (!cIST) return false;

      if (filterYear !== 'all' && cIST.year !== Number(filterYear)) {
        return false;
      }
      if (filterMonth !== 'all' && cIST.month !== Number(filterMonth)) {
        return false;
      }
      if (customStartDate && cIST.ymd < customStartDate) {
        return false;
      }
      if (customEndDate && cIST.ymd > customEndDate) {
        return false;
      }

      if (filterPreset === 'today') {
        return cIST.ymd === currentIST.ymd;
      }
      if (filterPreset === 'yesterday') {
        return cIST.ymd === yesterdayIST.ymd;
      }
      if (filterPreset === 'this_week') {
        return cIST.ymd >= weekAgoIST.ymd && cIST.ymd <= currentIST.ymd;
      }
      if (filterPreset === 'this_month') {
        return cIST.year === currentIST.year && cIST.month === currentIST.month;
      }
      if (filterPreset === 'last_month') {
        return cIST.year === lastMonthYear && cIST.month === lastMonthNum;
      }
      if (filterPreset === 'this_year') {
        return cIST.year === currentIST.year;
      }

      return true;
    });
  }, [allComplaints, isFilterActive, filterPreset, filterMonth, filterYear, customStartDate, customEndDate]);

  const activeMetrics = React.useMemo(() => {
    if (isFilterActive || (allComplaints.length > 0 && (!metrics?.productStats || metrics.productStats.length === 0))) {
      return computeMetricsFromComplaints(filteredComplaints, allTechs, metrics);
    }
    return metrics || computeMetricsFromComplaints(allComplaints, allTechs, null);
  }, [isFilterActive, filteredComplaints, allComplaints, allTechs, metrics]);

  const getProductIcon = (productType) => {
    const p = String(productType || '').toLowerCase();
    if (p.includes('rooftop') || p.includes('solar')) return <Sun className="w-5 h-5 text-amber-500" />;
    if (p.includes('water') || p.includes('heater')) return <Droplets className="w-5 h-5 text-cyan-500" />;
    if (p.includes('pump') || p.includes('heat')) return <Wind className="w-5 h-5 text-emerald-500" />;
    return <Layers className="w-5 h-5 text-slate-500" />;
  };

  const getFilterSummaryText = () => {
    if (!isFilterActive) return 'All Time Live Data';
    const parts = [];
    if (filterPreset === 'today') parts.push('Today');
    else if (filterPreset === 'yesterday') parts.push('Yesterday');
    else if (filterPreset === 'this_week') parts.push('This Week');
    else if (filterPreset === 'this_month') parts.push('This Month');
    else if (filterPreset === 'last_month') parts.push('Last Month');
    else if (filterPreset === 'this_year') parts.push('This Year');
    else if (filterPreset === 'custom') parts.push('Custom Dates');

    if (filterMonth !== 'all') {
      const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      parts.push(`Month: ${monthNames[Number(filterMonth)]}`);
    }
    if (filterYear !== 'all') {
      parts.push(`Year: ${filterYear}`);
    }
    if (customStartDate || customEndDate) {
      const fromFormatted = customStartDate ? formatIndianDateOnly(customStartDate) : 'Start';
      const toFormatted = customEndDate ? formatIndianDateOnly(customEndDate) : 'Now';
      parts.push(`${fromFormatted} to ${toFormatted}`);
    }
    return parts.join(' • ');
  };

  if (loading && !metrics) {
    return <AnalyticsDashboardSkeleton />;
  }

  const counts = activeMetrics?.counts || {};
  const totalCount = Number(counts.total || 0);
  const registeredCount = Number(counts.registered_count || 0);
  const assignedCount = Number(counts.assigned_count || 0);
  const inProgressCount = Number(counts.in_progress_count || 0);
  const resolvedCount = Number(counts.resolved_count || 0);
  const closedCount = Number(counts.closed_count || 0);
  const activeCount = counts.active_count !== undefined 
    ? Number(counts.active_count) 
    : Math.max(0, totalCount - (resolvedCount + closedCount));
  const avgResolutionHours = Number(activeMetrics?.avg_resolution_hours || 0);
  const resolvedTotal = Number(activeMetrics?.resolved_total || counts.resolved_count || 0);
  const csatRating = Number(activeMetrics?.customerSatisfaction?.averageRating || 0);
  const csatReviews = Number(activeMetrics?.customerSatisfaction?.totalReviews || 0);


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

          <button
            type="button"
            onClick={async () => {
              try {
                await api.exportComplaintsCsv();
                setSyncToast({
                  type: 'success',
                  message: 'Complaints CSV report downloaded successfully!'
                });
                setTimeout(() => setSyncToast(null), 4000);
              } catch (err) {
                setSyncToast({
                  type: 'error',
                  message: 'Failed to export CSV: ' + (err.message || 'Please try again')
                });
                setTimeout(() => setSyncToast(null), 5000);
              }
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Complaints CSV</span>
          </button>
        </div>
      </div>

      {/* Hero Section: Customer Directory & 5-Year Warranty Database */}
      <div 
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsExcelDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsExcelDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsExcelDragging(false);
          if (e.dataTransfer?.files?.[0]) {
            processExcelUpload(e.dataTransfer.files[0]);
          }
        }}
        className={`bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 border shadow-xl relative overflow-hidden transition-all duration-200 ${
          isExcelDragging ? 'border-emerald-400 ring-4 ring-emerald-500/50 scale-[1.005]' : 'border-emerald-900/50'
        }`}
      >
        {isExcelDragging && (
          <div className="absolute inset-0 bg-slate-950/90 z-50 flex flex-col items-center justify-center text-center p-6 space-y-3 pointer-events-none animate-in fade-in backdrop-blur-xs">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce border border-emerald-400">
              <Upload className="w-8 h-8" />
            </div>
            <p className="text-base font-bold text-white">Drop Excel file (.xlsx / .xls) to upload & sync</p>
            <p className="text-xs text-emerald-300">All customer records and warranty dates will be updated automatically</p>
          </div>
        )}
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
              <span>Central Customer Directory • Permanent Cloud Database Engine</span>
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
              {customerStats ? (customerStats.totalCustomers || 0).toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Saved permanently in cloud database
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
              <span>In Warranty (0-5 Years)</span>
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded">
                {customerStats && customerStats.totalCustomers > 0 ? Math.round(((customerStats.inWarrantyCount || 0) / customerStats.totalCustomers) * 100) : 0}%
              </span>
            </div>
            <div className="text-3xl font-black text-emerald-400">
              {customerStats ? (customerStats.inWarrantyCount || 0).toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Eligible for free service & repairs</div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
              <span>Out of Warranty (5+ Years)</span>
              <span className="text-[10px] font-bold bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded">
                {customerStats && customerStats.totalCustomers > 0 ? Math.round(((customerStats.outWarrantyCount || 0) / customerStats.totalCustomers) * 100) : 0}%
              </span>
            </div>
            <div className="text-3xl font-black text-rose-300">
              {customerStats ? (customerStats.outWarrantyCount || 0).toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Paid visit & component replacement rates</div>
          </div>
        </div>
      </div>

      {/* Date Range & Time Period Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <span>Time Period & Date Filter</span>
                {isFilterActive && (
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    Filtered ({filteredComplaints.length} tickets)
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500">
                Filter analytics by Month, Year, Custom Date Range (DD-MM-YYYY), or quick presets
              </p>
            </div>
          </div>

          {isFilterActive && (
            <button
              onClick={handleResetFilter}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-bold border border-slate-200 hover:border-rose-200 flex items-center gap-1.5 transition-all"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset to All Time</span>
            </button>
          )}
        </div>

        {/* Quick Presets Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_year', label: 'This Year' },
            { id: 'custom', label: 'Custom Range' }
          ].map((preset) => {
            const isActive = filterPreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setFilterPreset(preset.id);
                  if (preset.id !== 'custom') {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }
                  if (['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'this_year'].includes(preset.id)) {
                    setFilterMonth('all');
                    setFilterYear('all');
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  isActive 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Month, Year & Date Pickers Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Month Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Select Month
            </label>
            <select
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                setFilterPreset('all');
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              <option value="all">All Months</option>
              <option value="1">01 - January</option>
              <option value="2">02 - February</option>
              <option value="3">03 - March</option>
              <option value="4">04 - April</option>
              <option value="5">05 - May</option>
              <option value="6">06 - June</option>
              <option value="7">07 - July</option>
              <option value="8">08 - August</option>
              <option value="9">09 - September</option>
              <option value="10">10 - October</option>
              <option value="11">11 - November</option>
              <option value="12">12 - December</option>
            </select>
          </div>

          {/* Year Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Select Year
            </label>
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value);
                setFilterPreset('all');
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              <option value="all">All Years</option>
              {availableYears.map(yr => (
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
              <span>From Date</span>
              <span className="text-[10px] text-slate-400 font-normal">DD-MM-YYYY</span>
            </label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setFilterPreset('custom');
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
              <span>To Date</span>
              <span className="text-[10px] text-slate-400 font-normal">DD-MM-YYYY</span>
            </label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setFilterPreset('custom');
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {/* Filter Summary Status */}
        <div className="flex items-center justify-between text-xs pt-1 px-1 text-slate-500">
          <div className="flex items-center gap-1.5 font-medium">
            <Filter className="w-3.5 h-3.5 text-emerald-600" />
            <span>Active Range:</span>
            <strong className="text-slate-800">{getFilterSummaryText()}</strong>
          </div>
          <span className="font-semibold text-slate-700">
            {filteredComplaints.length} tickets matching period
          </span>
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

            {/* Product-Wise Linked Issue Categories */}
      <div className="space-y-6">
        {(() => {
          const activeProducts = (activeMetrics?.productStats || []).filter(p => Number(p.count) > 0);

          if (activeProducts.length === 0 || totalCount === 0) {
            return (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xs text-center text-slate-400 text-xs">
                No complaint tickets registered in this selected time period
              </div>
            );
          }

          return (
            <div className="space-y-6">
              {activeProducts.map((prod) => {
                const total = totalCount || 1;
                const pct = Math.round((Number(prod.count) / total) * 100);
                const categories = prod.categories || [];

                return (
                  <div key={prod.product_type} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    {/* Part 1 (Left 50%): Product Breakdown Card */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                              {getProductIcon(prod.product_type)}
                            </div>
                            <span>Product Breakdown</span>
                          </h3>
                          <span className="text-xs font-normal text-slate-500">Share of complaints</span>
                        </div>

                        <div 
                          onClick={() => onNavigateToComplaints && onNavigateToComplaints({ product_type: prod.product_type })}
                          className="space-y-2 text-xs p-3 rounded-xl bg-slate-50/60 hover:bg-emerald-50/70 cursor-pointer transition-all border border-slate-200/60 hover:border-emerald-300 group"
                          title={`Click to filter complaints by ${prod.product_type}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-800 group-hover:text-emerald-900">{prod.product_type}</span>
                            <span className="text-slate-500 group-hover:text-emerald-700 font-semibold">
                              <strong className="text-slate-900 group-hover:text-emerald-900 text-sm">{prod.count}</strong> complaints ({pct}%) →
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-[11px] text-slate-500 flex justify-between font-medium pt-1">
                            <span className="text-amber-700 font-semibold">{prod.active_count || 0} Active In-Pipeline</span>
                            <span className="text-emerald-700 font-semibold">{prod.resolved_count || 0} Resolved</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">
                          {categories.length} issue {categories.length === 1 ? 'type' : 'types'} identified
                        </span>
                        <button
                          onClick={() => onNavigateToComplaints && onNavigateToComplaints({ product_type: prod.product_type })}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 group transition-colors"
                        >
                          <span>View Tickets</span>
                          <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </button>
                      </div>
                    </div>

                    {/* Part 2 (Right 50%): Top Issue Categories for this Product */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <Tag className="w-4 h-4 text-amber-500" />
                            <span>Top Issue Categories</span>
                            <span className="text-[11px] font-normal text-slate-500">({prod.product_type})</span>
                          </h3>
                          <span className="text-xs font-normal text-slate-500">Frequency distribution</span>
                        </div>

                        {categories.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 text-xs">
                            No complaint issues reported for this product
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {categories.map((issue, idx) => {
                              const maxCount = Number(categories[0]?.count) || 1;
                              const catPct = Math.round((Number(issue.count) / maxCount) * 100);
                              const isTop = idx === 0;

                              return (
                                <div 
                                  key={issue.issue_category} 
                                  onClick={() => onNavigateToComplaints && onNavigateToComplaints({ 
                                    product_type: prod.product_type, 
                                    search: issue.issue_category 
                                  })}
                                  className="space-y-1 text-xs p-2.5 rounded-xl hover:bg-amber-50/70 cursor-pointer transition-all border border-slate-100 hover:border-amber-300 group"
                                  title={`Click to filter complaints matching "${issue.issue_category}"`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`w-4 h-4 rounded text-[10px] font-black flex items-center justify-center shrink-0 ${
                                        isTop ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                                      }`}>
                                        {idx + 1}
                                      </span>
                                      <span className="font-medium text-slate-700 group-hover:text-amber-950 truncate max-w-xs">
                                        {issue.issue_category}
                                      </span>
                                    </div>
                                    <span className="font-bold text-slate-900 group-hover:text-amber-800 shrink-0">
                                      {issue.count} →
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isTop ? 'bg-amber-500' : 'bg-emerald-600'
                                      }`}
                                      style={{ width: `${catPct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Technician Leaderboard Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Technician Performance & SLA Scoreboard</h3>
            <p className="text-xs text-slate-500">Workload, resolution speed, and average customer rating (Click row to view technician tickets)</p>
          </div>
          <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">
            {activeMetrics?.technicianLeaderboard?.length || 0} Active Specialists
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3">Service Area</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3 text-center">Assigned Jobs</th>
                <th className="px-4 py-3 text-center">Resolved</th>
                <th className="px-4 py-3 text-center">Avg Hours</th>
                <th className="px-4 py-3 text-right">Customer Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!activeMetrics?.technicianLeaderboard || activeMetrics.technicianLeaderboard.length === 0) ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-400">
                    No active technicians assigned yet
                  </td>
                </tr>
              ) : (
                activeMetrics.technicianLeaderboard.map((tech) => {
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
                        {tech.active_tickets_count || tech.active_jobs_count || tech.pending_count || 0}
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

