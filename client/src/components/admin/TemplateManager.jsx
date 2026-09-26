import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useDialog } from '../../context/DialogContext';
import { 
  Settings, MessageSquare, Mail, Save, RefreshCw, 
  HelpCircle, Code2, Check, Key, Shield, Sparkles,
  User, Wrench, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Eye, Layers, Send, Plus, Trash2, Power, ToggleLeft, ToggleRight,
  ExternalLink, X, Filter, CheckCircle
} from 'lucide-react';

export const TRIGGER_OPTIONS = [
  { id: 'complaint_registered', label: 'Ticket Lodged / Registered', audience: 'customer', desc: 'Fires when customer or desk registers a new ticket' },
  { id: 'technician_assigned', label: 'Technician First Assigned', audience: 'all', desc: 'Fires to customer when technician is initially allocated' },
  { id: 'technician_reassigned', label: 'Technician Reassigned (In-Progress Job Transferred)', audience: 'all', desc: 'Fires when assigned technician is changed during active complaint (New Tech Work Order + Old Tech Notice)' },
  { id: 'status_update', label: 'Status & Visit Note Update', audience: 'customer', desc: 'Fires when progress or note is recorded on ticket' },
  { id: 'complaint_resolved', label: 'Service Work Completed / Resolved', audience: 'customer', desc: 'Fires when technician marks job resolved on site' },
  { id: 'complaint_closed', label: 'Ticket Closed & Rating Request', audience: 'customer', desc: 'Fires when ticket is closed to collect 1-5 star review' },
  { id: 'complaint_reopened', label: 'Ticket Reopened Alert', audience: 'customer', desc: 'Fires if customer or supervisor reopens an issue' },
  { id: 'technician_work_order', label: 'Work Order Dispatch (New Job)', audience: 'technician', desc: 'Fires to newly assigned technician with customer address' },
  { id: 'technician_reminder', label: 'Pending Visit Reminder', audience: 'technician', desc: 'Fires as schedule reminder for upcoming service visit' },
  { id: 'technician_reopened_work_order', label: 'Technician Reopened Work Order (Reopened Case)', audience: 'technician', desc: 'Fires to assigned technician when a closed complaint is reopened' },
  { id: 'technician_reopen_job_transferred', label: 'Technician Reopened Job Transferred (Previous Tech Notice)', audience: 'technician', desc: 'Fires on reopen to notify previous technician that job was transferred to another specialist' },
  { id: 'technician_direct_reachout', label: 'Technician Direct Reach Out (Quick Chat)', audience: 'customer', desc: 'Pre-fills technician greeting message when clicking WhatsApp on complaint card' },
  { id: 'custom_trigger', label: 'Custom Outbound Trigger', audience: 'all', desc: 'Triggered via custom API or manual supervisor broadcast' }
];

export const isTechnicianTemplate = (t) => {
  if (!t) return false;
  // If audience is explicitly set, respect it first:
  const aud = (t.audience || '').toLowerCase().trim();
  if (aud === 'technician') return true;
  if (aud === 'customer') return false;

  const key = (t.template_key || '').toLowerCase();
  // Specifically: technician_assigned and customer_technician_reassigned are ALWAYS customer notifications
  if (key === 'technician_assigned' || key === 'customer_technician_reassigned') return false;

  // Actual technician templates (6 official technician templates):
  if (
    key === 'technician_work_order' ||
    key === 'technician_reassigned_work_order' ||
    key === 'technician_reminder' ||
    key === 'technician_pending_visit_reminder' ||
    key === 'technician_reassigned' ||
    key === 'technician_job_transferred' ||
    key === 'technician_job_reassigned_notice' ||
    key === 'technician_reopened_work_order' ||
    key === 'technician_reopen_job_transferred' ||
    key === 'technician_reopened_job_transferred' ||
    key === 'technician_complaint_reopened'
  ) {
    return true;
  }

  const trig = (t.trigger_event || '').toLowerCase();
  if (
    trig === 'technician_work_order' || 
    trig === 'technician_reminder' || 
    trig === 'technician_reopened_work_order' ||
    trig === 'technician_reopen_job_transferred'
  ) {
    return true;
  }

  return false;
};

export const ALL_PLACEHOLDERS = [
  { key: '{{customer_name}}', desc: 'Customer Full Name' },
  { key: '{{customer_phone}}', desc: 'Customer Mobile Number' },
  { key: '{{customer_address}}', desc: 'Service Site Address & City' },
  { key: '{{complaint_id}}', desc: 'Unique Ticket ID (e.g. EGS-2026-000101)' },
  { key: '{{product_type}}', desc: 'Solar Rooftop / Water Heater / Heat Pump' },
  { key: '{{issue_category}}', desc: 'Reported Issue Category' },
  { key: '{{priority}}', desc: 'Priority Level (Urgent / High / Medium / Low)' },
  { key: '{{technician_name}}', desc: 'Assigned Technician Name' },
  { key: '{{technician_phone}}', desc: 'Technician Contact Number' },
  { key: '{{technician_portal_url}}', desc: 'Technician Mobile Portal Web App Link' },
  { key: '{{expected_visit_date}}', desc: 'Scheduled Visit Date' },
  { key: '{{status}}', desc: 'Current Ticket Status' },
  { key: '{{notes}}', desc: 'Latest Follow-up / Issue Description / Resolution Notes' },
  { key: '{{charges_line}}', desc: 'Estimated Service Charge line (if enabled)' },
  { key: '{{feedback_url}}', desc: 'Online Ticket Tracking & Rating Link' },
  { key: '{{date}}', desc: 'Current Date' }
];

export const TemplateManager = () => {
  const { showToast, confirm } = useDialog();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [filterAudience, setFilterAudience] = useState('all'); // 'all' | 'customer' | 'technician' | 'staff'
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  // Live Meta verification state
  const [metaStatusData, setMetaStatusData] = useState(null);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [metaError, setMetaError] = useState(null);

  // Form edit state
  const [templateName, setTemplateName] = useState('');
  const [templateAudience, setTemplateAudience] = useState('customer');
  const [templateTrigger, setTemplateTrigger] = useState('manual');
  const [metaTemplateName, setMetaTemplateName] = useState('');
  const [metaStatus, setMetaStatus] = useState('PENDING');
  const [isActive, setIsActive] = useState(1);
  const [channel, setChannel] = useState('whatsapp');
  const [whatsappBody, setWhatsappBody] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTmplName, setNewTmplName] = useState('');
  const [newTmplKey, setNewTmplKey] = useState('');
  const [newTmplAudience, setNewTmplAudience] = useState('customer');
  const [newTmplTrigger, setNewTmplTrigger] = useState('complaint_registered');
  const [newTmplMetaName, setNewTmplMetaName] = useState('');
  const [newTmplChannel, setNewTmplChannel] = useState('whatsapp');
  const [newTmplWhatsappBody, setNewTmplWhatsappBody] = useState('');
  const [newTmplEmailSubject, setNewTmplEmailSubject] = useState('');
  const [newTmplEmailBody, setNewTmplEmailBody] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchMetaStatus = async (forceRefresh = false) => {
    try {
      setSyncingMeta(true);
      setMetaError(null);
      const res = await api.getMetaTemplateStatus(forceRefresh);
      if (res && Array.isArray(res.templates)) {
        setMetaStatusData(res);
        if (!res.success && res.error) {
          setMetaError(res.error);
        }
      } else {
        setMetaStatusData(null);
        if (res && res.error) setMetaError(res.error);
      }
    } catch (err) {
      console.error('Meta verification failed:', err);
      setMetaError(err.message || 'Unable to connect to Meta API');
    } finally {
      setSyncingMeta(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.getTemplates();
      const rawList = Array.isArray(res?.templates) 
        ? res.templates 
        : (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));

      const verifiedKeys = [
        'complaint_registered', 'technician_assigned', 'customer_technician_reassigned', 'status_update', 
        'complaint_resolved', 'complaint_closed', 'complaint_reopened', 
        'technician_work_order', 'technician_reminder', 'technician_reach_out_customer',
        'technician_reopened_work_order', 'technician_reopen_job_transferred'
      ];

      const list = rawList.map(t => {
        const isTech = isTechnicianTemplate(t);
        const isVerified = verifiedKeys.includes(t.template_key);
        const resolvedMetaStatus = t.meta_status || (isVerified ? 'APPROVED' : 'PENDING');

        return {
          ...t,
          audience: t.audience || (isTech ? 'technician' : 'customer'),
          meta_status: resolvedMetaStatus,
          is_active: t.is_active !== undefined ? t.is_active : 1
        };
      });

      setTemplates(list);

      if (list.length > 0) {
        if (!selectedTemplate) {
          selectTemplate(list[0]);
        } else {
          const reSelected = list.find(t => t.id === selectedTemplate.id || t.template_key === selectedTemplate.template_key) || list[0];
          selectTemplate(reSelected);
        }
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchMetaStatus(false);
  }, []);

  const selectTemplate = (tmpl) => {
    if (!tmpl) return;
    const isTech = isTechnicianTemplate(tmpl);

    const verifiedKeys = [
      'complaint_registered', 'technician_assigned', 'customer_technician_reassigned', 'status_update', 
      'complaint_resolved', 'complaint_closed', 'complaint_reopened', 
      'technician_work_order', 'technician_reminder', 'technician_reach_out_customer',
      'technician_reopened_work_order', 'technician_reopen_job_transferred'
    ];
    const isVerified = verifiedKeys.includes(tmpl.template_key);
    const finalMetaStatus = tmpl.meta_status || (isVerified ? 'APPROVED' : 'PENDING');

    setSelectedTemplate(tmpl);
    setTemplateName(tmpl.name || '');
    setTemplateAudience(tmpl.audience || (isTech ? 'technician' : 'customer'));
    setTemplateTrigger(tmpl.trigger_event || tmpl.template_key || 'manual');
    setMetaTemplateName(tmpl.meta_template_name || tmpl.template_key || '');
    setMetaStatus(finalMetaStatus);
    setIsActive(tmpl.is_active !== undefined ? tmpl.is_active : 1);
    setChannel(tmpl.channel || 'whatsapp');
    setWhatsappBody(tmpl.whatsapp_body || '');
    setEmailSubject(tmpl.email_subject || '');
    setEmailBody(tmpl.email_body || '');
    setSavedSuccess(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      const payload = {
        name: templateName,
        template_key: selectedTemplate.template_key,
        audience: templateAudience,
        trigger_event: templateTrigger,
        meta_template_name: metaTemplateName,
        meta_status: metaStatus,
        is_active: isActive,
        channel,
        whatsapp_body: whatsappBody,
        email_subject: emailSubject,
        email_body: emailBody
      };

      await api.updateTemplate(selectedTemplate.id, payload);

      // Also persist to local backup cache to guarantee persistence across hard refresh in all modes
      try {
        const stored = JSON.parse(localStorage.getItem('egs_mock_templates') || '[]');
        const updated = stored.map(t => 
          (t.id === selectedTemplate.id || t.template_key === selectedTemplate.template_key)
            ? { ...t, ...payload, updated_at: new Date().toISOString() }
            : t
        );
        localStorage.setItem('egs_mock_templates', JSON.stringify(updated));
      } catch (_) {}

      setSavedSuccess(true);
      showToast('Template & Outbound Rule updated successfully', 'success');
      await fetchTemplates();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      showToast('Failed to save template: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (tmpl, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await api.toggleTemplateActive(tmpl.id);
      showToast(res.message || 'Rule status updated', 'success');
      setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, is_active: res.is_active } : t));
      if (selectedTemplate?.id === tmpl.id) {
        setIsActive(res.is_active);
      }
    } catch (err) {
      showToast('Failed to toggle rule: ' + err.message, 'error');
    }
  };

  const handleSyncMeta = async (tmplId, manualApprovalStatus = null) => {
    try {
      setSyncingMeta(true);
      const res = await api.syncTemplateWithMeta(tmplId, manualApprovalStatus);
      showToast(res.message || 'Synced with Meta status', 'success');
      if (res.template) {
        selectTemplate(res.template);
      }
      await fetchTemplates();
      await fetchMetaStatus(true);
    } catch (err) {
      showToast('Meta sync failed: ' + err.message, 'error');
    } finally {
      setSyncingMeta(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    const ok = await confirm({
      title: 'Delete Outbound Template Rule?',
      message: `Are you sure you want to delete "${selectedTemplate.name}"? This action cannot be undone.`,
      confirmText: 'Delete Rule',
      confirmVariant: 'danger'
    });
    if (!ok) return;

    try {
      await api.deleteTemplate(selectedTemplate.id);
      showToast('Template rule deleted successfully', 'success');
      setSelectedTemplate(null);
      await fetchTemplates();
    } catch (err) {
      showToast('Failed to delete template: ' + err.message, 'error');
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!newTmplName.trim() || !newTmplWhatsappBody.trim()) {
      showToast('Template name and WhatsApp body are required', 'error');
      return;
    }

    try {
      setCreating(true);
      const res = await api.createTemplate({
        name: newTmplName.trim(),
        template_key: (newTmplKey || newTmplName).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50),
        audience: newTmplAudience,
        trigger_event: newTmplTrigger,
        meta_template_name: (newTmplMetaName || newTmplKey || newTmplName).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50),
        meta_status: 'PENDING', // Meta Review Pending initially!
        is_active: 1,
        channel: newTmplChannel,
        whatsapp_body: newTmplWhatsappBody.trim(),
        email_subject: newTmplEmailSubject.trim() || `[Eco Green Solar] ${newTmplName.trim()}`,
        email_body: newTmplEmailBody.trim() || newTmplWhatsappBody.trim()
      });

      showToast('New template created! Initial status set to Meta Review Pending.', 'success');
      setIsCreateModalOpen(false);
      resetCreateForm();
      await fetchTemplates();
      if (res.template) {
        selectTemplate(res.template);
      }
    } catch (err) {
      showToast('Failed to create template: ' + err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewTmplName('');
    setNewTmplKey('');
    setNewTmplAudience('customer');
    setNewTmplTrigger('complaint_registered');
    setNewTmplMetaName('');
    setNewTmplChannel('whatsapp');
    setNewTmplWhatsappBody('');
    setNewTmplEmailSubject('');
    setNewTmplEmailBody('');
  };

  const insertPlaceholder = (ph, target) => {
    if (target === 'whatsapp') {
      setWhatsappBody(prev => (prev ? prev + ' ' + ph : ph));
    } else if (target === 'newWhatsapp') {
      setNewTmplWhatsappBody(prev => (prev ? prev + ' ' + ph : ph));
    } else if (target === 'emailSubject') {
      setEmailSubject(prev => (prev ? prev + ' ' + ph : ph));
    } else if (target === 'emailBody') {
      setEmailBody(prev => (prev ? prev + ' ' + ph : ph));
    }
  };

  // Group and sort templates dynamically
  const { customerTemplates, technicianTemplates, staffTemplates, filteredList } = useMemo(() => {
    const cust = [];
    const tech = [];
    const staff = [];

    templates.forEach(t => {
      const isTech = isTechnicianTemplate(t);
      const isStaff = (t.audience || '').toLowerCase() === 'staff';

      if (isTech) tech.push(t);
      else if (isStaff) staff.push(t);
      else cust.push(t);
    });

    let list = templates;
    if (filterAudience === 'customer') list = cust;
    else if (filterAudience === 'technician') list = tech;
    else if (filterAudience === 'staff') list = staff;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => 
        (t.name || '').toLowerCase().includes(q) ||
        (t.template_key || '').toLowerCase().includes(q) ||
        (t.trigger_event || '').toLowerCase().includes(q)
      );
    }

    return { 
      customerTemplates: cust, 
      technicianTemplates: tech, 
      staffTemplates: staff,
      filteredList: list 
    };
  }, [templates, filterAudience, searchQuery]);

  // Sample simulation values for realistic live preview
  const previewData = {
    customer_name: 'Ananya Sharma',
    customer_phone: '98450 12345',
    customer_address: 'Villa 42, Palm Meadows, Whitefield, Bengaluru',
    complaint_id: 'EGS-2026-000101',
    product_type: 'Solar Rooftop Systems',
    issue_category: 'Inverter Fault / Error Code',
    priority: 'High',
    technician_name: 'HARDEV VAGHELA',
    technician_phone: '83473 19989',
    technician_portal_url: 'https://complain.ecogreensolar.co.in/technician',
    expected_visit_date: 'Tomorrow, 11:30 AM',
    status: 'In Progress',
    notes: 'Inverter inspection assigned. Customer requested rooftop visit before 1 PM.',
    charges_line: '\n💰 Estimated Service Charge: ₹350 (Standard Visit Fee)',
    feedback_url: 'https://complain.ecogreensolar.co.in/track/EGS-2026-000101',
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  const simulatedWhatsAppPreview = useMemo(() => {
    if (!whatsappBody) return '';
    return whatsappBody.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return previewData[key] !== undefined ? previewData[key] : match;
    });
  }, [whatsappBody]);

  const renderStatusBadge = (status) => {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'APPROVED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          <span>Meta Approved</span>
        </span>
      );
    }
    if (s === 'PENDING') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
          <Clock className="w-3 h-3 text-amber-700" />
          <span>Meta Review Pending</span>
        </span>
      );
    }
    if (s === 'REJECTED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-bold text-rose-800 bg-rose-100/90 px-2 py-0.5 rounded-full border border-rose-300">
          <AlertCircle className="w-3 h-3 text-rose-700" />
          <span>Meta Rejected</span>
        </span>
      );
    }
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300">
        <span>{s}</span>
      </span>
    );
  };

  const getTriggerLabel = (triggerId) => {
    const match = TRIGGER_OPTIONS.find(o => o.id === triggerId);
    return match ? match.label : (triggerId ? triggerId.replace(/_/g, ' ') : 'Manual Trigger');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-slate-900">Notification Templates &amp; Outbound Rules</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Live WhatsApp &amp; Meta Sync
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {templates.length} Active Rules
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create, edit and manage automated WhatsApp &amp; Email outbound triggers for Customers and Field Technicians.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Create New Template Button */}
          <button
            type="button"
            onClick={() => {
              resetCreateForm();
              setIsCreateModalOpen(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Template / Rule</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await fetchMetaStatus(true);
                await fetchTemplates();
                showToast('Meta template status synchronized successfully', 'success');
              } catch (err) {
                showToast('Meta sync completed: ' + err.message, 'info');
              }
            }}
            disabled={syncingMeta}
            title="Sync live template approval status directly with Meta Cloud API"
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingMeta ? 'animate-spin text-emerald-600' : 'text-emerald-700'}`} />
            <span>{syncingMeta ? 'Checking Meta...' : 'Sync with Meta'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              showPreview ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? 'Preview On' : 'Preview Off'}</span>
          </button>

          <button
            type="button"
            onClick={fetchTemplates}
            title="Reload Templates"
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 border border-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Selector List (4 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setFilterAudience('all')}
              className={`flex-1 py-1.5 px-2 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                filterAudience === 'all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All ({templates.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterAudience('customer')}
              className={`flex-1 py-1.5 px-2 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                filterAudience === 'customer'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Customer ({customerTemplates.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterAudience('technician')}
              className={`flex-1 py-1.5 px-2 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                filterAudience === 'technician'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>Technician ({technicianTemplates.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates or triggers..."
              className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Templates Cards List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100 max-h-[750px] overflow-y-auto">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No templates found matching your criteria.
              </div>
            ) : (
              filteredList.map((tmpl) => {
                const isSelected = selectedTemplate?.id === tmpl.id;
                const isTech = isTechnicianTemplate(tmpl);
                const isStaff = (tmpl.audience || '').toLowerCase() === 'staff';

                return (
                  <div
                    key={tmpl.id}
                    onClick={() => selectTemplate(tmpl)}
                    className={`p-3.5 transition-all flex flex-col gap-2 cursor-pointer ${
                      isSelected 
                        ? (isTech ? 'bg-amber-50/90 border-l-4 border-amber-600 shadow-2xs' : 'bg-sky-50/90 border-l-4 border-sky-600 shadow-2xs')
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${
                            isTech ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                            isStaff ? 'bg-purple-100 text-purple-900 border border-purple-300' :
                            'bg-sky-100 text-sky-800 border border-sky-200'
                          }`}>
                            {isTech ? 'TECHNICIAN' : (tmpl.audience || 'Customer')}
                          </span>

                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[150px]">
                            {getTriggerLabel(tmpl.trigger_event || tmpl.template_key)}
                          </span>
                        </div>

                        <h4 className={`text-xs font-bold leading-snug mt-1 ${isSelected ? 'text-slate-950 font-black' : 'text-slate-800'}`}>
                          {tmpl.name}
                        </h4>
                      </div>

                      {/* Active/Pause Switch */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleActive(tmpl, e)}
                        title={tmpl.is_active ? 'Rule is ACTIVE (Click to Pause)' : 'Rule is PAUSED (Click to Activate)'}
                        className="shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
                      >
                        {tmpl.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded-full border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>Paused</span>
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <span className="font-mono text-[9.5px] text-slate-400 truncate max-w-[140px]">
                        @{tmpl.meta_template_name || tmpl.template_key}
                      </span>
                      {renderStatusBadge(tmpl.meta_status)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Template Editor & Live Simulator (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {selectedTemplate ? (
            <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 space-y-5">
              {/* Context Banner */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                templateAudience === 'technician' ? 'bg-amber-50/70 border-amber-200' : 'bg-sky-50/70 border-sky-200'
              }`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                      templateAudience === 'technician' 
                        ? 'bg-amber-100 text-amber-900 border-amber-300' 
                        : 'bg-sky-100 text-sky-800 border-sky-200'
                    }`}>
                      Target: {templateAudience}
                    </span>

                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-white border border-slate-200 text-slate-700">
                      Trigger: {getTriggerLabel(templateTrigger)}
                    </span>

                    {renderStatusBadge(metaStatus)}
                  </div>

                  <h3 className="font-extrabold text-base text-slate-900 mt-1">
                    {templateName}
                  </h3>
                  <p className="font-mono text-[11px] text-slate-500">
                    Meta Template Name: <strong className="text-slate-800">{metaTemplateName || selectedTemplate.template_key}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {savedSuccess && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                      <Check className="w-4 h-4" /> Saved!
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Rule'}
                  </button>
                </div>
              </div>

              {/* Meta Status & Outbound Lifecycle Management */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">Meta Review &amp; Outbound State</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSyncMeta(selectedTemplate.id)}
                      disabled={syncingMeta}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingMeta ? 'animate-spin' : ''}`} />
                      <span>Check Meta API</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const newS = metaStatus === 'APPROVED' ? 'PENDING' : 'APPROVED';
                        setMetaStatus(newS);
                        handleSyncMeta(selectedTemplate.id, newS);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border cursor-pointer ${
                        metaStatus === 'APPROVED'
                          ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                      }`}
                    >
                      {metaStatus === 'APPROVED' ? 'Mark Pending Review' : 'Mark Verified & Approved'}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {metaStatus === 'APPROVED' ? (
                    <span className="text-emerald-800 font-medium">
                      ✅ <strong>Meta Approved:</strong> Outbound messages are delivered 24/7 via official WhatsApp Cloud API utility template.
                    </span>
                  ) : (
                    <span className="text-amber-800 font-medium">
                      ⏳ <strong>Review Pending:</strong> Template is submitted to Meta for review. The system automatically routes messages via WhatsApp session/text fallback so alerts are never delayed.
                    </span>
                  )}
                </p>
              </div>

              {/* Form Settings Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Template Display Name *</label>
                  <input
                    type="text"
                    required
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Audience *</label>
                  <select
                    value={templateAudience}
                    onChange={(e) => setTemplateAudience(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                  >
                    <option value="customer">Customer (Mobile Phone)</option>
                    <option value="technician">Field Technician (Mobile Phone)</option>
                    <option value="staff">Desk Support Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">When Should This Trigger? (Event) *</label>
                  <select
                    value={templateTrigger}
                    onChange={(e) => setTemplateTrigger(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                  >
                    {TRIGGER_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Meta Registered Template Name</label>
                  <input
                    type="text"
                    value={metaTemplateName}
                    onChange={(e) => setMetaTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="e.g. technician_job_reassigned_notice"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* WhatsApp Message Body Editor & Live Preview */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp Message Content *</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Outbound Rule: <strong className={isActive ? 'text-emerald-700' : 'text-slate-500'}>{isActive ? 'ENABLED' : 'PAUSED'}</strong>
                    </span>
                  </div>
                </div>

                <div className={`grid ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  {/* Left: Input Textarea */}
                  <div className="space-y-2">
                    <textarea
                      rows={11}
                      required
                      value={whatsappBody}
                      onChange={(e) => setWhatsappBody(e.target.value)}
                      className="w-full text-xs font-mono p-3.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-y"
                      placeholder="Type WhatsApp message template copy..."
                    />

                    {/* Placeholders Bar */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Insert Dynamic Tokens (1-Click):
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                        {ALL_PLACEHOLDERS.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => insertPlaceholder(p.key, 'whatsapp')}
                            title={`${p.desc} (Click to insert)`}
                            className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-900 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                          >
                            {p.key}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Simulated WhatsApp Phone Bubble */}
                  {showPreview && (
                    <div className="bg-[#e5ddd5] rounded-xl p-3 border border-[#d1d7db] flex flex-col justify-between shadow-inner min-h-[260px]">
                      <div>
                        <div className="bg-[#008069] text-white px-3 py-1.5 rounded-t-lg text-[11px] font-semibold flex items-center justify-between mb-2 shadow-xs">
                          <div className="flex items-center gap-1.5">
                            <Send className="w-3 h-3 text-white/80" />
                            <span>
                              {templateAudience === 'technician' ? 'Technician Phone (+91 83473 19989)' : 'Customer Phone (+91 98450 12345)'}
                            </span>
                          </div>
                          <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded font-mono">Live Simulation</span>
                        </div>

                        {/* WhatsApp Message Card Bubble */}
                        <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-xs max-w-full text-xs text-[#111b21] space-y-2 relative border border-[#e2e8f0]">
                          <div className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                            {simulatedWhatsAppPreview || 'Message preview will appear here as you type...'}
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] pt-1 border-t border-slate-100">
                            <span>10:45 AM</span>
                            <span className="text-[#53bdeb] font-bold">✓✓</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-600 italic text-center pt-2">
                        Demonstrating dynamic replacement with real Eco Green Solar ticket values
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Email Template Editor */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span>Email Channel Copy (Optional Fallback)</span>
                </label>

                <div>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject line..."
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <textarea
                    rows={3}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Email body copy..."
                    className="w-full text-xs font-sans p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>
              </div>

              {/* Footer Actions: Delete Custom Template */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDeleteTemplate}
                  className="px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Template Rule</span>
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Template Rule'}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              Select a template on the left or click <strong>"+ Add Template / Rule"</strong> to create a new outbound notification.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add New Template & Outbound Rule */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight">Create New Outbound Rule &amp; Template</h3>
                  <p className="text-xs text-emerald-200/90 mt-0.5">Define who receives the alert, when it triggers, and Meta review status</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Template Rule Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTmplName}
                    onChange={(e) => {
                      setNewTmplName(e.target.value);
                      if (!newTmplKey) {
                        setNewTmplKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                      }
                    }}
                    placeholder="e.g. Technician Job Reassigned Notice"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Audience *
                  </label>
                  <select
                    value={newTmplAudience}
                    onChange={(e) => setNewTmplAudience(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                  >
                    <option value="customer">Customer (Client Mobile)</option>
                    <option value="technician">Field Technician (Staff Mobile)</option>
                    <option value="staff">Internal Front Desk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trigger Event (When should this send?) *
                  </label>
                  <select
                    value={newTmplTrigger}
                    onChange={(e) => setNewTmplTrigger(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                  >
                    {TRIGGER_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label} ({opt.audience})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meta Template Name (Key)
                  </label>
                  <input
                    type="text"
                    value={newTmplKey}
                    onChange={(e) => setNewTmplKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="e.g. technician_job_reassigned_notice"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Meta Review Notice Box */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Initial Status: Meta Review Pending</p>
                  <p className="text-[11px] text-amber-800 leading-normal">
                    New templates are registered locally as <strong>Pending Review</strong>. Once verified or approved on your Meta Business Suite, click <em>"Mark Verified &amp; Approved"</em> to enable official 24/7 template broadcast.
                  </p>
                </div>
              </div>

              {/* WhatsApp Message Body */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  WhatsApp Message Body *
                </label>
                <textarea
                  rows={6}
                  required
                  value={newTmplWhatsappBody}
                  onChange={(e) => setNewTmplWhatsappBody(e.target.value)}
                  placeholder="Enter message template text. Use *bold*, _italic_, and {{placeholders}}..."
                  className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <div className="pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Click to insert tokens:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                    {ALL_PLACEHOLDERS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => insertPlaceholder(p.key, 'newWhatsapp')}
                        className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-900 border border-slate-200 text-slate-700 cursor-pointer"
                      >
                        {p.key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Email subject fallback */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Subject (Fallback)
                </label>
                <input
                  type="text"
                  value={newTmplEmailSubject}
                  onChange={(e) => setNewTmplEmailSubject(e.target.value)}
                  placeholder="[Eco Green Solar] Service Notification"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Create Outbound Rule</span>
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
