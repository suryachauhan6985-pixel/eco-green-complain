import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useDialog } from '../../context/DialogContext';
import { 
  Settings, MessageSquare, Mail, Save, RefreshCw, 
  HelpCircle, Code2, Check, Key, Shield, Sparkles,
  User, Wrench, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Eye, Layers, Send
} from 'lucide-react';

// Comprehensive metadata for each notification trigger across lifecycle stages
const TEMPLATE_METADATA = {
  // ================= CUSTOMER LIFECYCLE STAGES =================
  complaint_registered: {
    audience: 'customer',
    order: 1,
    stageBadge: 'Stage 1: Registration',
    stageHindi: 'चरण 1: शिकायत दर्ज',
    targetName: 'Customer',
    recipientLabel: 'Sent to Customer (+91 Mobile)',
    recipientBadgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Triggered when a new complaint ticket is lodged in the system',
    triggerHindi: 'नया टिकट रजिस्टर होते ही ग्राहक के WhatsApp व Email पर तत्काल रसीद जाती है।',
    metaTemplateName: 'complaint_registered',
    metaLanguage: 'en_US',
    recommendedPlaceholders: [
      '{{customer_name}}', '{{complaint_id}}', '{{product_type}}', 
      '{{issue_category}}', '{{date}}', '{{charges_line}}', '{{feedback_url}}'
    ]
  },
  technician_assigned: {
    audience: 'customer',
    order: 2,
    stageBadge: 'Stage 2: Technician Assigned',
    stageHindi: 'चरण 2: तकनीशियन आवंटन',
    targetName: 'Customer',
    recipientLabel: 'Sent to Customer (+91 Mobile)',
    recipientBadgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Triggered when staff allocates a technician to the customer ticket',
    triggerHindi: 'स्टाफ द्वारा टेक्नीशियन असाइन करते ही ग्राहक को टेक्नीशियन नाम व विजिट समय मिलता है।',
    metaTemplateName: 'technician_assigned',
    metaLanguage: 'en_US',
    recommendedPlaceholders: [
      '{{customer_name}}', '{{complaint_id}}', '{{technician_name}}', 
      '{{expected_visit_date}}', '{{feedback_url}}'
    ]
  },
  status_update: {
    audience: 'customer',
    order: 3,
    stageBadge: 'Stage 3: Progress & Follow-up',
    stageHindi: 'चरण 3: प्रगति एवं नोट्स',
    targetName: 'Customer',
    recipientLabel: 'Sent to Customer (+91 Mobile)',
    recipientBadgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Triggered when staff or technician logs a visit note or progress update',
    triggerHindi: 'साइट विजिट, पार्ट्स रिक्वायरमेंट या जांच के दौरान नोट्स अपडेट होने पर ग्राहक को सूचना।',
    metaTemplateName: 'status__followup_note_update',
    metaLanguage: 'en',
    recommendedPlaceholders: [
      '{{customer_name}}', '{{complaint_id}}', '{{product_type}}', 
      '{{status}}', '{{notes}}', '{{feedback_url}}'
    ]
  },
  complaint_resolved: {
    audience: 'customer',
    order: 4,
    stageBadge: 'Stage 4: Service Resolved',
    stageHindi: 'चरण 4: कार्य पूर्ण (Resolved)',
    targetName: 'Customer',
    recipientLabel: 'Sent to Customer (+91 Mobile)',
    recipientBadgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Triggered when technician marks the service work as completed on site',
    triggerHindi: 'तकनीशियन द्वारा कार्य पूरा मार्क करने पर ग्राहक को कार्य पूर्णता की सूचना।',
    metaTemplateName: 'complaint_resolved',
    metaLanguage: 'en_US',
    recommendedPlaceholders: [
      '{{customer_name}}', '{{complaint_id}}', '{{technician_name}}', 
      '{{notes}}', '{{feedback_url}}'
    ]
  },
  complaint_closed: {
    audience: 'customer',
    order: 5,
    stageBadge: 'Stage 5: Closure & Rating',
    stageHindi: 'चरण 5: टिकट क्लोज व रेटिंग अनुरोध',
    targetName: 'Customer',
    recipientLabel: 'Sent to Customer (+91 Mobile)',
    recipientBadgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Triggered when desk marks ticket officially closed & invites 1-5 star review',
    triggerHindi: 'अंतिम सत्यापन के बाद टिकट क्लोज होते ही ग्राहक से 1-5 स्टार रेटिंग फीडबैक मांगा जाता है।',
    metaTemplateName: 'complaint_closed__feedback_request',
    metaLanguage: 'en',
    recommendedPlaceholders: [
      '{{customer_name}}', '{{complaint_id}}', '{{feedback_url}}'
    ]
  },
  complaint_reopened: {
    audience: 'customer',
    order: 6,
    stageBadge: 'Stage 6: Reopen Alert',
    stageHindi: 'चरण 6: दोबारा जांच अनुरोध',
    targetName: 'Customer',
    recipientLabel: 'Sent to Customer (+91 Mobile)',
    recipientBadgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Triggered if customer reports recurring issue and ticket is reopened',
    triggerHindi: 'यदि सौर उपकरण में समस्या पुनः उत्पन्न होती है तो री-ओपनिंग अलर्ट जाता है।',
    metaTemplateName: 'complaint_reopened_notification',
    metaLanguage: 'en',
    recommendedPlaceholders: [
      '{{customer_name}}', '{{complaint_id}}', '{{feedback_url}}'
    ]
  },

  // ================= TECHNICIAN LIFECYCLE STAGES =================
  technician_work_order: {
    audience: 'technician',
    order: 1,
    stageBadge: 'Stage 1: Work Order Dispatch',
    stageHindi: 'चरण 1: कार्य आदेश (वर्क ऑर्डर)',
    targetName: 'Field Technician',
    recipientLabel: 'Sent to Assigned Field Technician (+91)',
    recipientBadgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    triggerTitle: 'Triggered when staff assigns ticket — dispatches full customer address & issue',
    triggerHindi: 'तकनीशियन को ग्राहक का नाम, मोबाइल नंबर, पूरा पता, समस्या व समय का जॉब ऑर्डर जाता है।',
    metaTemplateName: 'technician_work_order',
    metaLanguage: 'en_US',
    recommendedPlaceholders: [
      '{{technician_name}}', '{{complaint_id}}', '{{customer_name}}', 
      '{{customer_phone}}', '{{customer_address}}', '{{product_type}}', 
      '{{issue_category}}', '{{notes}}', '{{priority}}', '{{expected_visit_date}}'
    ]
  },
  technician_reminder: {
    audience: 'technician',
    order: 2,
    stageBadge: 'Stage 2: Pending Visit Reminder',
    stageHindi: 'चरण 2: विजिट रिमाइंडर',
    targetName: 'Field Technician',
    recipientLabel: 'Sent to Assigned Field Technician (+91)',
    recipientBadgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    triggerTitle: 'Triggered as scheduled reminder before the technician visit date',
    triggerHindi: 'विजिट से पहले तकनीशियन को ग्राहक से समन्वय करने हेतु स्वचालित रिमाइंडर।',
    metaTemplateName: 'technician_pending_visit_reminder',
    metaLanguage: 'en',
    recommendedPlaceholders: [
      '{{technician_name}}', '{{complaint_id}}', '{{customer_name}}', 
      '{{customer_phone}}', '{{customer_address}}', '{{expected_visit_date}}'
    ]
  },
  technician_reassigned: {
    audience: 'technician',
    order: 3,
    stageBadge: 'Stage 3: Reassignment Notice',
    stageHindi: 'चरण 3: कार्य पुन: आवंटन',
    targetName: 'Field Technician',
    recipientLabel: 'Sent to Assigned Field Technician (+91)',
    recipientBadgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    triggerTitle: 'Triggered if a ticket is transferred to another technician or cancelled',
    triggerHindi: 'यदि टिकट किसी अन्य तकनीशियन को सौंपा जाता है तो पुराने तकनीशियन को सूचना मिलती है।',
    metaTemplateName: 'technician_job_reassigned_notice',
    metaLanguage: 'en',
    recommendedPlaceholders: [
      '{{technician_name}}', '{{complaint_id}}', '{{customer_name}}', '{{notes}}'
    ]
  }
};

const ALL_PLACEHOLDERS = [
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
  const { showToast } = useDialog();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [filterAudience, setFilterAudience] = useState('all'); // 'all' | 'customer' | 'technician'
  const [showPreview, setShowPreview] = useState(true);

  // Live Meta verification state
  const [metaStatusData, setMetaStatusData] = useState(null);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [metaError, setMetaError] = useState(null);

  // Form state
  const [whatsappBody, setWhatsappBody] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

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
        setMetaError('Unable to connect to Meta API');
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
      const list = Array.isArray(res?.templates) 
        ? res.templates 
        : (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
      setTemplates(list);

      if (list.length > 0) {
        if (!selectedTemplate) {
          selectTemplate(list[0]);
        } else {
          const reSelected = list.find(t => t.id === selectedTemplate.id) || list[0];
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

  const getLiveMetaInfo = (key) => {
    if (!metaStatusData?.templates) return null;
    return metaStatusData.templates.find(mt => mt.template_key === key) || null;
  };

  const renderMetaBadge = (key, isDetail = false) => {
    if (syncingMeta && !metaStatusData) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded animate-pulse">
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-slate-400" /> Checking Meta...
        </span>
      );
    }

    const live = getLiveMetaInfo(key);
    const status = live?.meta_status;

    if (!live || metaError || status === 'UNABLE_TO_VERIFY') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title={metaError || 'Unable to reach Meta Graph API'}>
          <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
          <span>Unable to verify</span>
          {isDetail && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fetchMetaStatus(true); }}
              className="ml-1 underline text-[9px] font-bold text-amber-900 hover:text-amber-950 cursor-pointer"
            >
              Retry
            </button>
          )}
        </span>
      );
    }

    if (status === 'APPROVED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
          <span>Meta Approved</span>
          {isDetail && live.meta_category && (
            <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 rounded font-mono">({live.meta_category})</span>
          )}
        </span>
      );
    }

    if (status === 'PENDING' || status === 'SUBMITTED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300">
          <Clock className="w-2.5 h-2.5 text-amber-600" /> Meta Review Pending
        </span>
      );
    }

    if (status === 'REJECTED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
          <AlertCircle className="w-2.5 h-2.5 text-rose-600" /> Meta Rejected
        </span>
      );
    }

    if (status === 'PAUSED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
          <Clock className="w-2.5 h-2.5 text-amber-700" /> Meta Paused
        </span>
      );
    }

    if (status === 'DISABLED') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">
          <AlertCircle className="w-2.5 h-2.5 text-slate-500" /> Meta Disabled
        </span>
      );
    }

    return (
      <span className="shrink-0 text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
        {status || 'Unknown'}
      </span>
    );
  };

  const selectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    setWhatsappBody(tmpl?.whatsapp_body || '');
    setEmailSubject(tmpl?.email_subject || '');
    setEmailBody(tmpl?.email_body || '');
    setSavedSuccess(false);
  };

  // Helper to determine audience accurately
  const isTechKey = (key) => {
    return ['technician_work_order', 'technician_reminder', 'technician_reassigned'].includes(key);
  };

  // Group and sort templates
  const { customerTemplates, technicianTemplates } = useMemo(() => {
    const cust = [];
    const tech = [];

    templates.forEach(tmpl => {
      const meta = TEMPLATE_METADATA[tmpl.template_key];
      const isTech = meta ? meta.audience === 'technician' : isTechKey(tmpl.template_key);
      if (isTech) {
        tech.push({ ...tmpl, meta: meta || { order: 99, stageBadge: 'Technician Notice' } });
      } else {
        cust.push({ ...tmpl, meta: meta || { order: 99, stageBadge: 'Customer Notice' } });
      }
    });

    cust.sort((a, b) => (a.meta.order || 99) - (b.meta.order || 99));
    tech.sort((a, b) => (a.meta.order || 99) - (b.meta.order || 99));

    return { customerTemplates: cust, technicianTemplates: tech };
  }, [templates]);

  const activeMetadata = selectedTemplate ? (TEMPLATE_METADATA[selectedTemplate.template_key] || {
    audience: isTechKey(selectedTemplate.template_key) ? 'technician' : 'customer',
    stageBadge: 'Custom Trigger',
    stageHindi: 'कस्टम ट्रिगर',
    recipientLabel: isTechKey(selectedTemplate.template_key) ? 'Sent to Field Technician' : 'Sent to Customer',
    recipientBadgeColor: isTechKey(selectedTemplate.template_key) ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-sky-100 text-sky-800 border-sky-200',
    triggerTitle: 'Custom automated trigger',
    triggerHindi: 'सिस्टम द्वारा स्वचालित रूप से प्रेषित',
    metaStatus: 'SESSION_MSG',
    recommendedPlaceholders: ['{{customer_name}}', '{{complaint_id}}', '{{feedback_url}}']
  }) : null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      await api.updateTemplate(selectedTemplate.id, {
        whatsapp_body: whatsappBody,
        email_subject: emailSubject,
        email_body: emailBody
      });
      setSavedSuccess(true);
      showToast('Template updated & synced with notification engine', 'success');
      await fetchTemplates();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      showToast('Failed to save template: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const insertPlaceholder = (ph, target) => {
    if (target === 'whatsapp') {
      setWhatsappBody(prev => (prev ? prev + ' ' + ph : ph));
    } else if (target === 'emailSubject') {
      setEmailSubject(prev => (prev ? prev + ' ' + ph : ph));
    } else if (target === 'emailBody') {
      setEmailBody(prev => (prev ? prev + ' ' + ph : ph));
    }
  };

  // Sample simulation values for live preview
  const previewData = {
    customer_name: 'Ananya Sharma',
    customer_phone: '98450 12345',
    customer_address: 'Villa 42, Palm Meadows, Whitefield, Bengaluru',
    complaint_id: 'EGS-2026-000101',
    product_type: 'Solar Rooftop Systems',
    issue_category: 'Inverter Fault / Error Code',
    priority: 'High',
    technician_name: 'Rohit Kumar',
    technician_phone: '83066 83067',
    technician_portal_url: 'https://eco-green-complain.vprotech.online/#/technician',
    expected_visit_date: 'Tomorrow, 11:30 AM',
    status: 'In Progress',
    notes: 'Technician assigned. Inspection scheduled with rooftop safety gear.',
    charges_line: '\n💰 Estimated Service Charge: ₹350 (Standard Visit Fee)',
    feedback_url: 'https://eco-green-complain.vprotech.online/track/EGS-2026-000101',
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  const simulatedWhatsAppPreview = useMemo(() => {
    if (!whatsappBody) return '';
    return whatsappBody.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return previewData[key] !== undefined ? previewData[key] : match;
    });
  }, [whatsappBody]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-slate-900">Notification &amp; Channel Templates</h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              WhatsApp &amp; Email Sync
            </span>
            {metaStatusData?.summary && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${
                metaStatusData.summary.rejected > 0 
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : metaStatusData.summary.unverified > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{metaStatusData.summary.approved}/{metaStatusData.summary.total} Meta Verified</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer aur Technician ke lifecycle triggers. Template approval status Meta Graph API v21.0 se live verify hota hai.
            {metaStatusData?.synced_at && (
              <span className="ml-1 text-slate-400 font-mono text-[10.5px]">
                • Synced: {new Date(metaStatusData.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({metaStatusData.source === 'meta_live' ? 'Live Meta' : 'Cached'})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fetchMetaStatus(true)}
            disabled={syncingMeta}
            title="Sync live template approval status directly with Meta Cloud API"
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingMeta ? 'animate-spin text-emerald-600' : 'text-emerald-700'}`} />
            <span>{syncingMeta ? 'Verifying with Meta...' : 'Sync with Meta'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              showPreview ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? 'Live Preview Active' : 'Show Preview'}</span>
          </button>

          <button
            type="button"
            onClick={fetchTemplates}
            title="Refresh Templates"
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 border border-slate-200 self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Selector List (5 Cols on large screen) */}
        <div className="lg:col-span-4 space-y-3">
          {/* Filter Tabs: All, Customers, Technicians */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setFilterAudience('all')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                filterAudience === 'all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
                {templates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterAudience('customer')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                filterAudience === 'customer'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Customer</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterAudience === 'customer' ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {customerTemplates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterAudience('technician')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                filterAudience === 'technician'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Technician</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterAudience === 'technician' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {technicianTemplates.length}
              </span>
            </button>
          </div>

          {/* Templates Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* SECTION 1: CUSTOMER STAGES */}
            {(filterAudience === 'all' || filterAudience === 'customer') && (
              <div>
                <div className="bg-sky-50/80 px-3.5 py-2 border-b border-sky-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sky-900 font-bold text-xs uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-sky-600" />
                    <span>Customer Notifications ({customerTemplates.length} Stages)</span>
                  </div>
                  <span className="text-[10px] font-medium text-sky-700">
                    ग्राहक को संदेश
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {customerTemplates.map((tmpl) => {
                    const isSelected = selectedTemplate?.id === tmpl.id;
                    const meta = tmpl.meta;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => selectTemplate(tmpl)}
                        className={`w-full text-left p-3.5 transition-all flex flex-col gap-1.5 cursor-pointer ${
                          isSelected ? 'bg-sky-50/90 border-l-4 border-sky-600 shadow-2xs' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold leading-snug ${isSelected ? 'text-sky-950' : 'text-slate-800'}`}>
                            {tmpl.name}
                          </span>
                          <span className="shrink-0 px-2 py-0.5 text-[9.5px] font-bold rounded-md bg-sky-100 text-sky-800 border border-sky-200">
                            {meta?.stageBadge || 'Customer'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-slate-400 truncate">
                            {tmpl.template_key}
                          </span>
                          {renderMetaBadge(tmpl.template_key)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 2: TECHNICIAN STAGES */}
            {(filterAudience === 'all' || filterAudience === 'technician') && (
              <div className={filterAudience === 'all' ? 'border-t-2 border-slate-200' : ''}>
                <div className="bg-amber-50/80 px-3.5 py-2 border-b border-amber-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs uppercase tracking-wider">
                    <Wrench className="w-3.5 h-3.5 text-amber-600" />
                    <span>Technician Notifications ({technicianTemplates.length} Stages)</span>
                  </div>
                  <span className="text-[10px] font-medium text-amber-800">
                    तकनीशियन को संदेश
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {technicianTemplates.map((tmpl) => {
                    const isSelected = selectedTemplate?.id === tmpl.id;
                    const meta = tmpl.meta;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => selectTemplate(tmpl)}
                        className={`w-full text-left p-3.5 transition-all flex flex-col gap-1.5 cursor-pointer ${
                          isSelected ? 'bg-amber-50/90 border-l-4 border-amber-600 shadow-2xs' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold leading-snug ${isSelected ? 'text-amber-950' : 'text-slate-800'}`}>
                            {tmpl.name}
                          </span>
                          <span className="shrink-0 px-2 py-0.5 text-[9.5px] font-bold rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                            {meta?.stageBadge || 'Technician'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-slate-400 truncate">
                            {tmpl.template_key}
                          </span>
                          {renderMetaBadge(tmpl.template_key)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Placeholders Reference Card */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <Code2 className="w-4 h-4 text-emerald-600" />
                Available Dynamic Placeholders
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">1-click insert</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Click any token below to append it to the WhatsApp Message body:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1 max-h-56 overflow-y-auto pr-1">
              {ALL_PLACEHOLDERS.map((p) => {
                const isRecommended = activeMetadata?.recommendedPlaceholders?.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => insertPlaceholder(p.key, 'whatsapp')}
                    title={`${p.desc} (Click to insert)`}
                    className={`font-mono text-[10px] px-2 py-1 rounded transition-colors cursor-pointer border ${
                      isRecommended
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold hover:bg-emerald-100'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p.key}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Template Editor & Live Preview (8 Cols on large screen) */}
        <div className="lg:col-span-8 space-y-5">
          {selectedTemplate ? (
            <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
              {/* Context Banner */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                activeMetadata?.audience === 'technician'
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-sky-50/70 border-sky-200'
              }`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                      activeMetadata?.recipientBadgeColor || 'bg-slate-100 text-slate-800'
                    }`}>
                      {activeMetadata?.recipientLabel || 'Recipient'}
                    </span>

                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-white border border-slate-200 text-slate-700">
                      {activeMetadata?.stageBadge}
                    </span>

                    {renderMetaBadge(selectedTemplate.template_key, true)}

                    {getLiveMetaInfo(selectedTemplate.template_key)?.meta_id && (
                      <span className="font-mono text-[9.5px] px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                        Meta ID: {getLiveMetaInfo(selectedTemplate.template_key).meta_id}
                      </span>
                    )}

                    {getLiveMetaInfo(selectedTemplate.template_key)?.meta_language && (
                      <span className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                        Lang: {getLiveMetaInfo(selectedTemplate.template_key).meta_language}
                      </span>
                    )}
                  </div>

                  <h3 className="font-extrabold text-base text-slate-900 mt-1">
                    {selectedTemplate.name}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {activeMetadata?.triggerTitle} • <span className="text-slate-500 italic">{activeMetadata?.triggerHindi}</span>
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
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>

              {/* WhatsApp Message Body Editor & Live Preview (Side by Side or Stacked) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp Message Content</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Trigger Key: <code className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{selectedTemplate.template_key}</code>
                  </span>
                </div>

                <div className={`grid ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  {/* Left: Input Textarea */}
                  <div className="space-y-2">
                    <div className="relative">
                      <textarea
                        rows={11}
                        required
                        value={whatsappBody}
                        onChange={(e) => setWhatsappBody(e.target.value)}
                        className="w-full text-xs font-mono p-3.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-y"
                        placeholder="Type WhatsApp message template copy..."
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      💡 Tip: Use <code className="bg-slate-100 text-slate-700 px-1 py-0.2 rounded">*bold*</code>, <code className="bg-slate-100 text-slate-700 px-1 py-0.2 rounded">_italics_</code>, and placeholders like <code className="bg-slate-100 text-slate-700 px-1 py-0.2 rounded">&#123;&#123;customer_name&#125;&#125;</code>.
                    </p>
                  </div>

                  {/* Right: Simulated WhatsApp Phone Bubble */}
                  {showPreview && (
                    <div className="bg-[#e5ddd5] rounded-xl p-3.5 border border-[#d1d7db] flex flex-col justify-between shadow-inner min-h-[220px]">
                      <div>
                        <div className="bg-[#008069] text-white px-3 py-1.5 rounded-t-lg text-[11px] font-semibold flex items-center justify-between mb-2 shadow-xs">
                          <div className="flex items-center gap-1.5">
                            <Send className="w-3 h-3 text-white/80" />
                            <span>WhatsApp Simulated Message Bubble</span>
                          </div>
                          <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded">Preview</span>
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
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span>Email Channel Template (Subject & HTML Body)</span>
                </label>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email Subject Line</label>
                  <input
                    type="text"
                    required
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email Body Copy</label>
                  <textarea
                    rows={4}
                    required
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full text-xs font-sans p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Emails are automatically delivered inside the Eco Green Solar branded responsive HTML template with logo and tracking buttons.
                  </p>
                </div>
              </div>
            </form>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              Select a template on the left to edit its content.
            </div>
          )}
        </div>
      </div>

      {/* Cloud Integration Provider Documentation Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Meta WhatsApp Cloud API Lifecycle Architecture</h3>
            <p className="text-xs text-slate-400">
              Customer templates aur Technician templates alag-alag categories me Meta WABA (Account ID: 1015283491554000) ke sath integrated hain.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2">
            <strong className="text-emerald-300 block font-mono">1. Customer Lifecycle (6 Stages)</strong>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Customer ke registration (<code className="text-emerald-400">complaint_registered</code>), assignment (<code className="text-emerald-400">technician_assigned</code>), aur resolution (<code className="text-emerald-400">complaint_resolved</code>) Meta Cloud API ke approved UTILITY templates ke zariye deliver hote hain (24/7 delivery guaranteed).
            </p>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2">
            <strong className="text-amber-300 block font-mono">2. Technician Dispatch (3 Stages)</strong>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Technician work orders (<code className="text-amber-400">technician_work_order</code>) me customer ka address, mobile number aur defect summary direct technician ke WhatsApp par deliver hoti hai.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
