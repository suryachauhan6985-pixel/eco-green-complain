import React, { useState } from 'react';
import { api } from '../../api/client';
import confetti from 'canvas-confetti';
import { 
  X, Sun, Droplets, Wind, AlertTriangle, Upload, 
  CheckCircle2, Copy, Send, Sparkles, Phone, Mail, MapPin,
  Search, RefreshCw, ShieldCheck, ShieldAlert, Award, Calendar, Check
} from 'lucide-react';

const PRODUCT_CATEGORIES = {
  'Solar Rooftop Systems': [
    'No Power Output',
    'Inverter Fault / Error Code',
    'Grid Breaker Tripping',
    'Cable / Connector Damage',
    'AMC / Panel Cleaning',
    'Monitoring App Offline',
    'Other Rooftop Issue'
  ],
  'Solar Water Heaters': [
    'Water Leakage from Tank',
    'Cold Water Inlet / Pipe Issue',
    'Low Water Temperature',
    'Scale Formation / Descaling',
    'Air Vent Valve Issue',
    'Electrical Backup Heater Fault',
    'Other Water Heater Issue'
  ],
  'Heat Pumps': [
    'Compressor Tripping',
    'Water Not Heating to Set Temp',
    'Display Error Code (F1/F2)',
    'Unusual Noise / Vibration',
    'Circulation Pump Failure',
    'Refrigerant Leak / Pressure Drop',
    'Other Heat Pump Issue'
  ]
};

export const NewComplaintModal = ({ isOpen, onClose, onComplaintCreated }) => {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    product_type: 'Solar Rooftop Systems',
    product_serial: '',
    installation_id: '',
    issue_category: 'No Power Output',
    issue_description: '',
    priority: 'Medium'
  });

  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [copied, setCopied] = useState(false);

  // Smart Customer Search & Warranty state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTimeout, setSearchTimeout] = useState(null);

  if (!isOpen) return null;

  const handleCustomerSearch = (val) => {
    setCustomerSearchQuery(val);
    if (searchTimeout) clearTimeout(searchTimeout);

    if (!val || val.trim().length < 2) {
      setCustomerSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingCustomer(true);
        const data = await api.searchCustomers(val.trim());
        setCustomerSearchResults(data.customers || []);
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setSearchingCustomer(false);
      }
    }, 250);

    setSearchTimeout(timer);
  };

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearchResults([]);
    setCustomerSearchQuery('');
    setFormData(prev => ({
      ...prev,
      customer_name: c.customer_name || prev.customer_name,
      customer_phone: c.consumer_mobile || prev.customer_phone,
      customer_address: c.city_village ? `${c.city_village}${c.dealer_name ? ` (Dealer: ${c.dealer_name})` : ''}` : prev.customer_address,
      product_type: 'Solar Rooftop Systems',
      installation_id: c.consumer_no || c.order_no || prev.installation_id,
      product_serial: c.inverter_serial || prev.product_serial
    }));
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
  };

  const handleProductChange = (prod) => {
    setFormData({
      ...formData,
      product_type: prod,
      issue_category: PRODUCT_CATEGORIES[prod][0]
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.customer_phone || !formData.customer_address || !formData.issue_description) {
      alert('Please fill all required customer and issue details.');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key]) data.append(key, formData[key]);
      });

      for (let i = 0; i < files.length; i++) {
        data.append('attachments', files[i]);
      }

      const res = await api.createComplaint(data);
      setCreatedTicket(res.complaint);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      if (onComplaintCreated) onComplaintCreated(res.complaint);
    } catch (err) {
      alert('Failed to create complaint: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyTicketId = () => {
    if (createdTicket?.ticket_id) {
      navigator.clipboard.writeText(createdTicket.ticket_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetAndClose = () => {
    setCreatedTicket(null);
    setFiles([]);
    setFormData({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_address: '',
      product_type: 'Solar Rooftop Systems',
      product_serial: '',
      installation_id: '',
      issue_category: 'No Power Output',
      issue_description: '',
      priority: 'Medium'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Sun className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Register New Solar Complaint</h2>
              <p className="text-xs text-emerald-200">Auto-generates ticket ID & notifies customer via WhatsApp + Email</p>
            </div>
          </div>
          <button 
            onClick={resetAndClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {createdTicket ? (
            /* Success confirmation screen */
            <div className="text-center py-6 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className="text-xs uppercase font-bold text-emerald-700 tracking-wider">Ticket Created & Dispatched</span>
                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  {createdTicket.ticket_id}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Registered for <strong>{createdTicket.customer_name}</strong> ({createdTicket.product_type})
                </p>
              </div>

              {/* Notification badge info */}
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 text-left text-xs text-emerald-900 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Automatic Multi-Channel Alerts Dispatched:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-semibold block">WhatsApp Sent</span>
                      <span className="text-[11px] text-slate-500">{createdTicket.customer_phone}</span>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <span className="font-semibold block">Branded Email Sent</span>
                      <span className="text-[11px] text-slate-500">{createdTicket.customer_email || 'Logged in system'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-3">
                <button
                  onClick={copyTicketId}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied to Clipboard!' : 'Copy Ticket ID'}
                </button>
                <button
                  onClick={resetAndClose}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all"
                >
                  Done & View Complaints
                </button>
              </div>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Product Selector Cards */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Select Product Category *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'Solar Rooftop Systems', icon: Sun, label: 'Solar Rooftop', sub: 'On-Grid / Off-Grid' },
                    { id: 'Solar Water Heaters', icon: Droplets, label: 'Water Heater', sub: 'ETC / FPC Tanks' },
                    { id: 'Heat Pumps', icon: Wind, label: 'Heat Pump', sub: 'Commercial / Residential' }
                  ].map((prod) => {
                    const Icon = prod.icon;
                    const isSelected = formData.product_type === prod.id;
                    return (
                      <button
                        type="button"
                        key={prod.id}
                        onClick={() => handleProductChange(prod.id)}
                        className={`p-3 rounded-xl border text-left flex flex-col items-center sm:items-start transition-all ${
                          isSelected 
                            ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs' 
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <div className={`p-2 rounded-lg mb-2 ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-xs">{prod.label}</span>
                        <span className="text-[10px] text-slate-500 hidden sm:block">{prod.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Smart Customer Lookup Bar (Excel 6,100+ Database) */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/60 p-3.5 rounded-2xl border border-emerald-200 shadow-2xs relative">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-emerald-950">
                      Smart Customer Lookup (Excel Database)
                    </span>
                    <span className="bg-emerald-200/80 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      6,100+ Records
                    </span>
                  </div>
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={handleClearCustomer}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200"
                    >
                      Clear Autofill
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by Customer Name, Mobile, City, Dealer, Consumer No, or Inverter Sr..."
                    value={customerSearchQuery}
                    onChange={(e) => handleCustomerSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-9 py-2.5 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium placeholder:text-slate-400 shadow-xs"
                  />
                  {searchingCustomer ? (
                    <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  ) : customerSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => { setCustomerSearchQuery(''); setCustomerSearchResults([]); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}

                  {/* Dropdown Results Box */}
                  {customerSearchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-72 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-2 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>Matching Existing Customers ({customerSearchResults.length})</span>
                        <span className="text-[10px] text-emerald-700 lowercase font-normal">Click to autofill</span>
                      </div>
                      {customerSearchResults.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => handleSelectCustomer(c)}
                          className="p-3 hover:bg-emerald-50/60 cursor-pointer transition-colors text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-800">
                                {c.customer_name}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                📞 {c.consumer_mobile}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>📍 {c.city_village || 'N/A'}</span>
                              {c.dealer_name && <span>• Dealer: <strong className="text-slate-700">{c.dealer_name}</strong></span>}
                              {c.pv_capacity && <span>• {c.pv_capacity} kW</span>}
                              {c.inverter_serial && <span>• Inv: <code className="bg-slate-100 px-1 rounded text-slate-700">{c.inverter_serial}</code></span>}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                              c.is_in_warranty 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.is_in_warranty ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              {c.is_in_warranty ? 'In Warranty' : 'Out of Warranty'}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform">
                              Select →
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Verified Customer Card Banner */}
                {selectedCustomer && (
                  <div className="mt-3 p-3 bg-white rounded-xl border border-emerald-300/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Verified Eco Green Customer:
                        </span>
                        <strong className="text-xs text-slate-900">{selectedCustomer.customer_name}</strong>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {selectedCustomer.city_village} • Consumer No: <strong className="font-mono text-slate-800">{selectedCustomer.consumer_no || 'N/A'}</strong> • Invoice: <strong className="font-mono text-slate-800">{selectedCustomer.invoice_no || 'N/A'}</strong> ({selectedCustomer.invoice_date || 'N/A'})
                      </p>
                    </div>

                    <div className="shrink-0">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-2xs ${
                        selectedCustomer.is_in_warranty 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-rose-600 text-white'
                      }`}>
                        <span>{selectedCustomer.is_in_warranty ? '🟢' : '🔴'}</span>
                        <span>{selectedCustomer.is_in_warranty ? 'IN WARRANTY' : 'OUT OF WARRANTY'}</span>
                        {selectedCustomer.warranty_expiry_date && (
                          <span className="opacity-90 text-[10px] font-normal">
                            ({selectedCustomer.is_in_warranty ? `Till ${selectedCustomer.warranty_expiry_date}` : `Expired ${selectedCustomer.warranty_expiry_date}`})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Information */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Customer Contact & Site Location
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Customer Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Ananya Sharma"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mobile Phone (WhatsApp) *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g., +91 98765 43210"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g., customer@example.com"
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product Serial / Installation ID</label>
                    <input
                      type="text"
                      placeholder="e.g., EGS-RT-5KW-2024"
                      value={formData.product_serial}
                      onChange={(e) => setFormData({ ...formData, product_serial: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Site / Installation Address *</label>
                  <input
                    type="text"
                    required
                    placeholder="House/Plot no., Street, Area, City, Pincode"
                    value={formData.customer_address}
                    onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Issue Details & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Issue Category *</label>
                  <select
                    value={formData.issue_category}
                    onChange={(e) => setFormData({ ...formData, issue_category: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PRODUCT_CATEGORIES[formData.product_type]?.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Priority Level</label>
                  <div className="flex gap-1.5">
                    {['Low', 'Medium', 'High', 'Urgent'].map((p) => {
                      const isSelected = formData.priority === p;
                      const colors = {
                        Low: isSelected ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700',
                        Medium: isSelected ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700',
                        High: isSelected ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700',
                        Urgent: isSelected ? 'bg-red-600 text-white animate-pulse' : 'bg-red-50 text-red-700'
                      };
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setFormData({ ...formData, priority: p })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${colors[p]}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Detailed Issue Description *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the symptoms, error codes, inverter indicators, or when the problem started..."
                  value={formData.issue_description}
                  onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Upload Photo/Video Proof (Optional)
                </label>
                <label className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-600 font-medium">Click to select files or photos</span>
                  <span className="text-[10px] text-slate-400">Inverter error photos, tank leak images (Max 5 files)</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {files.length > 0 && (
                  <div className="mt-2 text-xs text-slate-600 flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-200 rounded text-[11px]">
                        {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Registering & Dispatching...' : 'Register Complaint & Send Alerts'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
