import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { 
  Search, X, User, Phone, MapPin, Building2, Hash, Calendar, 
  ShieldCheck, ShieldAlert, Sun, Wrench, Plus, RefreshCw, 
  FileText, CheckCircle2, ExternalLink, MessageCircle, Copy, 
  Check, Zap, AlertCircle, ArrowRight, ChevronRight, Layers
} from 'lucide-react';

export const CustomerSearchModal = ({ 
  isOpen, 
  onClose, 
  onRegisterComplaint,
  onSelectTicket 
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedInfo, setCopiedInfo] = useState(false);
  const [warrantyFilter, setWarrantyFilter] = useState('all'); // 'all' | 'in_warranty' | 'out_warranty'
  const searchTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
      loadInitialSampleCustomers();
    } else {
      setQuery('');
      setResults([]);
      setSelectedCustomer(null);
      setCustomerHistory([]);
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load sample/recent records on initial open so it's not empty
  const loadInitialSampleCustomers = async () => {
    try {
      setLoading(true);
      const data = await api.searchCustomers('');
      const list = data?.customers || [];
      setResults(list);
      if (list.length > 0) {
        handleSelectCustomer(list[0]);
      }
    } catch (err) {
      console.warn('Initial customer load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  const handleSearchChange = (val) => {
    setQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await api.searchCustomers(val.trim());
        const list = data?.customers || [];
        setResults(list);
        if (list.length > 0) {
          // If previous selection isn't in results, select first match
          const stillExists = list.find(c => c.id === selectedCustomer?.id);
          if (!stillExists) {
            handleSelectCustomer(list[0]);
          }
        } else {
          setSelectedCustomer(null);
        }
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setLoading(false);
      }
    }, 220);
  };

  // Select customer & fetch complaint history
  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    const rawMobile = customer.consumer_mobile || customer.customer_phone || customer.phone || '';
    const cleanPhone = String(rawMobile).replace(/\D/g, '').slice(-10);

    if (cleanPhone) {
      fetchCustomerHistory(cleanPhone);
    } else {
      setCustomerHistory([]);
    }
  };

  const fetchCustomerHistory = async (phone) => {
    try {
      setLoadingHistory(true);
      const res = await api.getCustomerHistory(phone);
      setCustomerHistory(res?.history || []);
    } catch (err) {
      console.warn('Failed to fetch customer history:', err);
      setCustomerHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Copy customer details to clipboard
  const handleCopyDetails = (customer) => {
    if (!customer) return;
    const cleanPhone = (customer.consumer_mobile || customer.customer_phone || '').replace(/\D/g, '').slice(-10);
    const text = [
      `Customer: ${customer.customer_name || 'N/A'}`,
      `Mobile: ${cleanPhone || 'N/A'}`,
      `City: ${customer.city_village || customer.city || 'N/A'}`,
      `Address: ${customer.site_address || customer.customer_address || customer.city_village || 'N/A'}`,
      customer.consumer_no ? `Consumer No: ${customer.consumer_no}` : null,
      customer.order_no ? `Order No: ${customer.order_no}` : null,
      customer.dealer_name ? `Dealer: ${customer.dealer_name}` : null,
      customer.inverter_serial ? `Inverter Sr: ${customer.inverter_serial}` : null,
      customer.pv_capacity ? `PV Capacity: ${customer.pv_capacity} kW` : null
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopiedInfo(true);
    setTimeout(() => setCopiedInfo(false), 2000);
  };

  // Calculate 5-year warranty
  const computeWarrantyInfo = (c) => {
    if (!c) return { isInWarranty: false, isDateMissing: true, label: 'Warranty N/A' };
    const rawDate = c.invoice_date || c.installation_date || '';
    let cleanDate = '';
    if (rawDate) {
      if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        cleanDate = rawDate.substring(0, 10);
      } else {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          cleanDate = `${y}-${m}-${day}`;
        }
      }
    }

    if (!cleanDate) {
      const isW = c.is_in_warranty !== undefined && c.is_in_warranty !== null ? Number(c.is_in_warranty) : 1;
      return {
        isInWarranty: isW === 1,
        isDateMissing: true,
        label: isW === 1 ? 'In Warranty (Record Specified)' : 'Out of Warranty',
        cleanDate: null,
        expiryDate: c.warranty_expiry_date || null
      };
    }

    const [year, month, day] = cleanDate.split('-').map(Number);
    const installDate = new Date(year, month - 1, day);
    const expiryDate = new Date(installDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 5);

    const isInWarranty = new Date() <= expiryDate;
    return {
      isInWarranty,
      isDateMissing: false,
      label: isInWarranty ? 'In Warranty (5-Year Active)' : 'Out of Warranty (5-Year Elapsed)',
      cleanDate,
      expiryDate: expiryDate.toISOString().substring(0, 10)
    };
  };

  // Filtered results by warranty filter
  const filteredResults = results.filter(c => {
    if (warrantyFilter === 'all') return true;
    const w = computeWarrantyInfo(c);
    if (warrantyFilter === 'in_warranty') return w.isInWarranty;
    if (warrantyFilter === 'out_warranty') return !w.isInWarranty;
    return true;
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      style={{
        paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
        paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-xs">
              <Search className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm sm:text-base tracking-tight truncate">
                  Customer Directory & Solar Plant Lookup
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  6,100+ Installed Records
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Search verified customers, view equipment specifications, and initiate tickets with prefilled data
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer shrink-0"
            title="Close Search Window (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input & Quick Controls */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by Customer Name, Mobile (10-digits), Consumer No, Order No, City, Dealer, or Inverter Sr..."
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full text-xs sm:text-sm pl-11 pr-20 py-3 bg-white border-2 border-emerald-400/80 focus:border-emerald-600 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 font-medium text-slate-900 placeholder:text-slate-400 shadow-xs transition-all"
            />
            {loading ? (
              <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin absolute right-4 top-1/2 -translate-y-1/2" />
            ) : query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  loadInitialSampleCustomers();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                title="Clear Search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Quick Filters & Stats Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                Filter:
              </span>
              <button
                type="button"
                onClick={() => setWarrantyFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  warrantyFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                }`}
              >
                All Records ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setWarrantyFilter('in_warranty')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  warrantyFilter === 'in_warranty'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                }`}
              >
                In Warranty
              </button>
              <button
                type="button"
                onClick={() => setWarrantyFilter('out_warranty')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  warrantyFilter === 'out_warranty'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
                }`}
              >
                Out of Warranty
              </button>
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              {query ? (
                <span>Found <strong>{filteredResults.length}</strong> matching customers</span>
              ) : (
                <span>Displaying latest database records</span>
              )}
            </div>
          </div>
        </div>

        {/* Master-Detail Split Content Area */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left Column: Results List */}
          <div className="lg:col-span-5 overflow-y-auto max-h-[38vh] lg:max-h-none p-3 space-y-2 bg-slate-50/50">
            {loading && results.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
                <span>Searching customer database...</span>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="py-12 text-center p-6 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">No matching customer records</h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Try searching by consumer number, 10-digit mobile number, or order number without special characters.
                </p>
              </div>
            ) : (
              filteredResults.map((c) => {
                const isSelected = selectedCustomer?.id === c.id;
                const warranty = computeWarrantyInfo(c);
                const mobile = c.consumer_mobile || c.customer_phone || c.phone;
                return (
                  <div
                    key={c.id || `${c.consumer_no}_${c.customer_name}`}
                    onClick={() => handleSelectCustomer(c)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                      isSelected 
                        ? 'bg-emerald-50/90 border-emerald-500 shadow-xs ring-2 ring-emerald-500/20' 
                        : 'bg-white hover:bg-slate-50/90 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                            {c.customer_name}
                          </h4>
                          {c.order_no && (
                            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                              #{c.order_no}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                          {mobile && (
                            <span className="font-mono text-emerald-800 font-semibold flex items-center gap-1">
                              📞 {mobile}
                            </span>
                          )}
                          {(c.city_village || c.city) && (
                            <span className="text-slate-600 flex items-center gap-0.5">
                              📍 {c.city_village || c.city}
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 truncate">
                          {c.consumer_no && <span>Cons: <strong className="text-slate-600 font-mono">{c.consumer_no}</strong></span>}
                          {c.dealer_name && <span>• Dealer: {c.dealer_name}</span>}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          warranty.isInWarranty
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                          {warranty.isInWarranty ? 'In Warranty' : 'Out of Warranty'}
                        </span>
                        <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-emerald-600 translate-x-0.5' : 'text-slate-300'}`} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Full Customer Profile, Plant Details & Ticket Initiation */}
          <div className="lg:col-span-7 overflow-y-auto p-4 sm:p-5 flex flex-col justify-between space-y-5 bg-white">
            {selectedCustomer ? (
              <div className="space-y-5 flex-1">
                {/* Customer Identity Banner */}
                {(() => {
                  const warranty = computeWarrantyInfo(selectedCustomer);
                  const cleanPhone = (selectedCustomer.consumer_mobile || selectedCustomer.customer_phone || '').replace(/\D/g, '').slice(-10);

                  return (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-slate-50 to-white border border-emerald-200/90 shadow-2xs space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base sm:text-lg font-black text-slate-900">
                              {selectedCustomer.customer_name}
                            </h2>
                            <span className="p-1 rounded-full bg-emerald-100 text-emerald-700" title="Verified Customer">
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Installed Customer Profile & Technical Record
                          </p>
                        </div>

                        {/* Warranty Status Pill */}
                        <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 ${
                          warranty.isInWarranty
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}>
                          {warranty.isInWarranty ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <div className="text-left">
                            <span className="text-[10px] font-black uppercase tracking-wider block leading-none">
                              {warranty.isInWarranty ? 'In Warranty' : 'Out of Warranty'}
                            </span>
                            {warranty.cleanDate && (
                              <span className="text-[9px] text-slate-600 block mt-0.5 font-medium">
                                Installed: {warranty.cleanDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Contact Quick Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 text-xs">
                        {cleanPhone && (
                          <>
                            <a
                              href={`tel:${cleanPhone}`}
                              className="px-3 py-1.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-emerald-800 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-all"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>{cleanPhone}</span>
                            </a>

                            <a
                              href={`https://wa.me/91${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-all"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyDetails(selectedCustomer)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-semibold flex items-center gap-1.5 transition-colors ml-auto cursor-pointer"
                        >
                          {copiedInfo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                          <span>{copiedInfo ? 'Details Copied!' : 'Copy Info'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* 2-Column Technical & Installation Specifications */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Card 1: Utility & Electricity Board Details */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Electricity & Order Record
                    </h5>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Consumer No</span>
                        <strong className="text-slate-900 font-mono">
                          {selectedCustomer.consumer_no || 'N/A'}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Order No</span>
                        <strong className="text-slate-900 font-mono">
                          {selectedCustomer.order_no || 'N/A'}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Authorized Dealer</span>
                        <strong className="text-slate-900 truncate max-w-[150px]">
                          {selectedCustomer.dealer_name || 'Direct / Eco Green'}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-500">Scheme / Model</span>
                        <strong className="text-slate-900">
                          {selectedCustomer.scheme || 'Solar Subsidy'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Plant & Technical Equipment */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-emerald-600" />
                      Solar Plant & Equipment
                    </h5>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">PV Plant Capacity</span>
                        <strong className="text-slate-900 font-mono">
                          {selectedCustomer.pv_capacity ? `${selectedCustomer.pv_capacity} kW` : 'N/A'}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Inverter Serial</span>
                        <strong className="text-slate-900 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                          {selectedCustomer.inverter_serial || 'N/A'}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Inverter Make</span>
                        <strong className="text-slate-900">
                          {selectedCustomer.inverter_make || 'Standard Inverter'}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-500">Solar Panels</span>
                        <strong className="text-slate-900">
                          {selectedCustomer.panel_make || 'Tier 1 PV Modules'}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: Site Address & Location */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                  <h5 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                    Installation Site Address
                  </h5>
                  <p className="text-slate-700 font-medium">
                    {selectedCustomer.site_address || selectedCustomer.customer_address || selectedCustomer.city_village || 'Address record not stored'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                    <span>City/Village: <strong className="text-slate-800">{selectedCustomer.city_village || selectedCustomer.city || 'N/A'}</strong></span>
                    {selectedCustomer.pincode && <span>Pincode: <strong className="text-slate-800 font-mono">{selectedCustomer.pincode}</strong></span>}
                    {selectedCustomer.district && <span>District: <strong className="text-slate-800">{selectedCustomer.district}</strong></span>}
                    {selectedCustomer.state && <span>State: <strong className="text-slate-800">{selectedCustomer.state}</strong></span>}
                  </div>
                </div>

                {/* Complaint History Section for this customer */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>Past Service Tickets for this Customer ({customerHistory.length})</span>
                    </h5>
                  </div>

                  {loadingHistory ? (
                    <div className="py-4 text-center text-xs text-slate-400">Loading complaint history...</div>
                  ) : customerHistory.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-500 text-center">
                      No previous complaint tickets recorded for this customer phone.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {customerHistory.map(ticket => (
                        <div
                          key={ticket.id}
                          onClick={() => {
                            if (onSelectTicket) {
                              onSelectTicket(ticket.id);
                              onClose();
                            }
                          }}
                          className="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/40 text-xs flex items-center justify-between gap-2 cursor-pointer transition-all group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 group-hover:text-emerald-800">
                                {ticket.ticket_id}
                              </span>
                              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                                ticket.status === 'Resolved' || ticket.status === 'Closed' 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {ticket.status}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(ticket.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {ticket.product_type} — {ticket.issue_category}
                            </p>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform">
                            View →
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 space-y-2 my-auto">
                <User className="w-10 h-10 mx-auto text-slate-300" />
                <h4 className="text-sm font-bold text-slate-600">No customer selected</h4>
                <p className="text-xs text-slate-400">Select any customer from the list on the left to inspect complete plant records.</p>
              </div>
            )}

            {/* Bottom Floating Action Bar: Direct Ticket Registration */}
            {selectedCustomer && (
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white shrink-0">
                <div className="text-xs text-slate-500 text-center sm:text-left">
                  Need to raise a complaint for <strong className="text-slate-900">{selectedCustomer.customer_name}</strong>?
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (onRegisterComplaint) {
                      onRegisterComplaint(selectedCustomer);
                    }
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-98 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  title="Opens product selection window with this customer pre-filled"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Register Ticket for this Customer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
