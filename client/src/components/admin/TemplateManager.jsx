import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useDialog } from '../../context/DialogContext';
import { 
  Settings, MessageSquare, Mail, Save, RefreshCw, 
  HelpCircle, Code2, Check, Key, Shield, Sparkles 
} from 'lucide-react';

const PLACEHOLDERS = [
  { key: '{{customer_name}}', desc: 'Customer Full Name' },
  { key: '{{customer_phone}}', desc: 'Customer Contact Phone Number' },
  { key: '{{customer_address}}', desc: 'Service Site Address & City' },
  { key: '{{complaint_id}}', desc: 'Unique Ticket ID (e.g. EGS-2026-000101)' },
  { key: '{{product_type}}', desc: 'Solar Rooftop / Water Heater / Heat Pump' },
  { key: '{{issue_category}}', desc: 'Category of issue reported' },
  { key: '{{priority}}', desc: 'Ticket Priority (High / Medium / Low / Urgent)' },
  { key: '{{technician_name}}', desc: 'Assigned Technician Name' },
  { key: '{{technician_phone}}', desc: 'Technician Contact Number' },
  { key: '{{technician_portal_url}}', desc: 'Technician Portal Web App Link' },
  { key: '{{expected_visit_date}}', desc: 'Scheduled Visit Date' },
  { key: '{{status}}', desc: 'Current Ticket Status' },
  { key: '{{notes}}', desc: 'Latest Follow-up / Issue Description / Resolution Notes' },
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

  // Form state
  const [whatsappBody, setWhatsappBody] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.getTemplates();
      const list = Array.isArray(res?.templates) 
        ? res.templates 
        : (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
      setTemplates(list);
      if (list.length > 0 && !selectedTemplate) {
        setSelectedTemplate(list[0]);
        setWhatsappBody(list[0].whatsapp_body || '');
        setEmailSubject(list[0].email_subject || '');
        setEmailBody(list[0].email_body || '');
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
  }, []);

  const selectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    setWhatsappBody(tmpl.whatsapp_body || '');
    setEmailSubject(tmpl.email_subject || '');
    setEmailBody(tmpl.email_body || '');
    setSavedSuccess(false);
  };

  const filteredTemplates = templates.filter(t => {
    const isTech = t.template_key.startsWith('technician_');
    if (filterAudience === 'customer') return !isTech;
    if (filterAudience === 'technician') return isTech;
    return true;
  });

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
      showToast('Notification template updated successfully', 'success');
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
      setWhatsappBody(prev => prev + ' ' + ph);
    } else if (target === 'emailSubject') {
      setEmailSubject(prev => prev + ' ' + ph);
    } else if (target === 'emailBody') {
      setEmailBody(prev => prev + ' ' + ph);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Notification Content & Channel Templates</h2>
          <p className="text-xs text-slate-500">Configure automated message copy and placeholders for WhatsApp and Email</p>
        </div>

        <button
          onClick={fetchTemplates}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 border border-slate-200 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Template Selector List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Notification Triggers
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {filteredTemplates.length} templates
            </span>
          </div>

          {/* Filter Tabs: All, Customers, Technicians */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setFilterAudience('all')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center ${
                filterAudience === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({templates.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterAudience('customer')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center ${
                filterAudience === 'customer'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customers ({templates.filter(t => !t.template_key.startsWith('technician_')).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterAudience('technician')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center ${
                filterAudience === 'technician'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Technicians ({templates.filter(t => t.template_key.startsWith('technician_')).length})
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
            {filteredTemplates.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No templates match this filter
              </div>
            ) : (
              filteredTemplates.map((tmpl) => {
                const isSelected = selectedTemplate?.id === tmpl.id;
                const isTech = tmpl.template_key.startsWith('technician_');
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => selectTemplate(tmpl)}
                    className={`w-full text-left p-3.5 transition-all flex flex-col gap-1 ${
                      isSelected ? 'bg-emerald-50/80 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold leading-snug ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>
                        {tmpl.name}
                      </span>
                      {isTech ? (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                          Technician
                        </span>
                      ) : (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-sky-100 text-sky-800 border border-sky-200">
                          Customer
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      key: {tmpl.template_key}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Placeholders Reference Card */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2.5 text-xs">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Code2 className="w-4 h-4 text-emerald-600" />
              Dynamic Placeholders
            </h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Click any token below to append it to your active template:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => insertPlaceholder(p.key, 'whatsapp')}
                  title={p.desc}
                  className="font-mono text-[10px] bg-white hover:bg-emerald-100 hover:text-emerald-900 border border-slate-200 px-2 py-1 rounded text-slate-700 transition-colors"
                >
                  {p.key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Template Editor */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{selectedTemplate.name}</h3>
                    {selectedTemplate.template_key.startsWith('technician_') ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Technician Work Order
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                        Customer Alert
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">Trigger: {selectedTemplate.template_key}</span>
                </div>

                <div className="flex items-center gap-2">
                  {savedSuccess && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <Check className="w-4 h-4" /> Saved!
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>

              {/* WhatsApp Template Editor */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  WhatsApp Message Body
                </label>
                <textarea
                  rows={6}
                  required
                  value={whatsappBody}
                  onChange={(e) => setWhatsappBody(e.target.value)}
                  className="w-full text-xs font-sans p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                />
                <p className="text-[11px] text-slate-400">
                  Formatting tip: Use *bold* for emphasis. Placeholders like &#123;&#123;customer_name&#125;&#125; are dynamically replaced upon dispatch.
                </p>
              </div>

              {/* Email Template Editor */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Email Template
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
                    rows={5}
                    required
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full text-xs font-sans p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Emails are automatically wrapped inside the responsive Eco Green Solar branded HTML email shell with company logo and ticket details table.
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
            <h3 className="font-bold text-sm text-white">Live Cloud API Integration Instructions</h3>
            <p className="text-xs text-slate-400">
              When ready to send live messages to actual WhatsApp numbers and real inboxes, update <code className="text-emerald-300 bg-slate-800 px-1.5 py-0.5 rounded">server/.env</code>:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2">
            <strong className="text-emerald-300 block font-mono">1. Meta WhatsApp Cloud API / Twilio</strong>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Set <code className="text-emerald-400">WHATSAPP_PROVIDER=META_CLOUD_API</code> with your Meta App Phone Number ID & Access Token, or <code className="text-emerald-400">WHATSAPP_PROVIDER=TWILIO</code> with Twilio Account SID & Token.
            </p>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2">
            <strong className="text-blue-300 block font-mono">2. Nodemailer SMTP / SendGrid</strong>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Set <code className="text-blue-400">EMAIL_PROVIDER=SMTP</code> with your SMTP Host (e.g. Gmail App Password, AWS SES, or SendGrid credentials).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
