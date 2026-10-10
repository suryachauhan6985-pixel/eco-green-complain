import { formatIndianDateOnly, formatIndianDateTime } from '../common/TicketAgeBadge';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/client';
import { useDialog } from '../../context/DialogContext';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { uploadFileToSupabase } from '../../utils/storageUpload';
import { broadcastComplaintsUpdate } from '../../utils/liveSync';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';
import { VideoRecorderModal } from '../common/VideoRecorderModal';
import { 
  X, Sun, Droplets, Wind, AlertTriangle, AlertCircle, Upload, 
  CheckCircle2, Copy, Send, Sparkles, Phone, Mail, MapPin,
  Search, RefreshCw, ShieldCheck, ShieldAlert, Award, Calendar, Check,
  Link, IndianRupee, Trash2, FileText, MessageCircle, ExternalLink, Eye,
  Gauge, Layers, ArrowLeft, Plus, Hash, Building2, Map, Video, Camera, Info,
  ClipboardCheck, Zap, RotateCw, RotateCcw
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
  ],
  'Pressure Pumps': [
    'Pump Not Starting / No Power',
    'Low Pressure / Uneven Flow',
    'Continuous Running / Won\'t Turn Off',
    'Water Leakage from Body/Joints',
    'Pressure Controller / Switch Fault',
    'Motor Overheating / Burning Smell',
    'Other Pressure Pump Issue'
  ],
  'SITE SURVEY': [
    'Site Feasibility & Shadow Analysis',
    'Rooftop Structural Assessment',
    'Electrical Load & Metering Survey',
    'Solar Water Heater Location Assessment',
    'Heat Pump Feasibility Survey',
    'General Site Survey & Measurements'
  ],
  'Site Survey': [
    'Site Feasibility & Shadow Analysis',
    'Rooftop Structural Assessment',
    'Electrical Load & Metering Survey',
    'Solar Water Heater Location Assessment',
    'Heat Pump Feasibility Survey',
    'General Site Survey & Measurements'
  ],
  'Other': [
    'Equipment Not Turning On',
    'Performance Degradation',
    'Physical / Mechanical Damage',
    'Electrical / Wiring Short Circuit',
    'Periodic Maintenance / Inspection',
    'Other Issue'
  ]
};

const getProductComponentIcon = (type) => {
  const norm = String(type || '').toUpperCase();
  if (norm.includes('SURVEY')) return ClipboardCheck;
  if (type === 'Solar Rooftop Systems') return Sun;
  if (type === 'Solar Water Heaters') return Droplets;
  if (type === 'Heat Pumps') return Wind;
  if (type === 'Pressure Pumps') return Gauge;
  return Layers;
};

export const NewComplaintModal = ({ 
  isOpen, 
  onClose, 
  onComplaintCreated, 
  onComplaintUpdated,
  onViewComplaint, 
  initialData = null,
  mode = 'create'
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useDialog();
  const { addNotification } = useNotifications();
  const [directSending, setDirectSending] = useState(false);
  const [directSent, setDirectSent] = useState(false);
  const [directSendError, setDirectSendError] = useState(null);

  const isEditMode = mode === 'edit' || Boolean(initialData?.id && (initialData?.ticket_id || initialData?.created_at));

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    city: '',
    pincode: '',
    district: '',
    state: '',
    post_office: '',
    consumer_no: '',
    order_no: '',
    dealer_name: '',
    invoice_no: '',
    invoice_date: '',
    location_url: '',
    is_in_warranty: 1,
    estimated_charges: '',
    notify_charges: true,
    product_type: 'Solar Rooftop Systems',
    product_serial: '',
    installation_id: '',
    issue_category: 'No Power Output',
    issue_description: '',
    priority: 'Medium',
    pv_capacity: '',
    panel_make: '',
    inverter_make: '',
    scheme: ''
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isVideoRecorderOpen, setIsVideoRecorderOpen] = useState(false);
  const [previewVideoMeta, setPreviewVideoMeta] = useState({ isLandscape: false, rotation: 0 });
  const [uploadProgress, setUploadProgress] = useState({
    isUploading: false,
    progress: 0,
    currentFile: '',
    currentIndex: 0,
    totalFiles: 0
  });

  const initializedModalTicketId = useRef(null);

  // Populate from initialData (supports Edit Mode, Lead Conversion, and Customer Directory Search)
  useEffect(() => {
    if (initialData && isOpen) {
      const currentTicketKey = initialData.id || initialData.ticket_id || (initialData.customerData ? `cust_${initialData.customerData.id || initialData.customerData.consumer_no || initialData.customerData.consumer_mobile || Date.now()}` : (initialData.customer_name ? `lead_${initialData.customer_name}_${initialData.customer_phone}` : 'new_modal'));
      // Only initialize once per open modal session for this ticket so background polling never overwrites user edits!
      if (initializedModalTicketId.current === currentTicketKey) {
        return;
      }
      initializedModalTicketId.current = currentTicketKey;

      if (isEditMode) {
        const rawCharges = Number(initialData.estimated_charges);
        let editPincode = (initialData.pincode || '').trim();
        let editDistrict = (initialData.district || '').trim();
        let editState = (initialData.state || '').trim();
        let editCity = (initialData.city || '').trim();
        let editPostOffice = (initialData.post_office || '').trim();

        // Fallback extraction from customer_address for legacy tickets where location wasn't in separate columns
        if (!editPincode && initialData.customer_address) {
          const pinMatch = initialData.customer_address.match(/\b\d{6}\b/);
          if (pinMatch) editPincode = pinMatch[0];
        }
        if (!editState && initialData.customer_address) {
          const stateMatch = initialData.customer_address.match(/(Gujarat|Rajasthan|Maharashtra|Madhya Pradesh|Uttar Pradesh|Delhi|Haryana|Punjab)/i);
          if (stateMatch) editState = stateMatch[0];
        }

        setFormData({
          customer_name: initialData.customer_name || '',
          customer_phone: initialData.customer_phone || '',
          customer_email: initialData.customer_email || '',
          customer_address: initialData.customer_address || '',
          city: editCity,
          pincode: editPincode,
          district: editDistrict,
          state: editState,
          post_office: editPostOffice,
          consumer_no: initialData.consumer_no || '',
          order_no: initialData.order_no || '',
          dealer_name: initialData.dealer_name || '',
          invoice_no: initialData.invoice_no || '',
          invoice_date: initialData.invoice_date || '',
          location_url: initialData.location_url || '',
          is_in_warranty: initialData.is_in_warranty !== undefined ? initialData.is_in_warranty : 1,
          estimated_charges: (rawCharges > 0 && !isNaN(rawCharges)) ? String(rawCharges) : '',
          notify_charges: initialData.notify_charges !== undefined
            ? (rawCharges > 0 ? Boolean(initialData.notify_charges === 1 || initialData.notify_charges === '1' || initialData.notify_charges === true) : true)
            : true,
          product_type: initialData.product_type || 'Solar Rooftop Systems',
          product_serial: initialData.product_serial || '',
          installation_id: initialData.installation_id || '',
          issue_category: initialData.issue_category || 'No Power Output',
          issue_description: initialData.issue_description || initialData.description || '',
          priority: initialData.priority || 'Medium',
          status: initialData.status || 'Unassigned',
          pv_capacity: initialData.pv_capacity ? String(initialData.pv_capacity) : '',
          panel_make: initialData.panel_make || '',
          inverter_make: initialData.inverter_make || '',
          scheme: initialData.scheme || ''
        });
        if (editPincode) {
          setPincodeStatus('valid');
        }
        setStep('form');
      } else if (initialData.fromCustomerDirectory || initialData.startOnProductStep || initialData.customerData) {
        // Customer directory pre-fill flow: load customer and start on Product Selection Window
        const c = initialData.customerData || initialData;
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

        let computedWarranty = c.is_in_warranty !== undefined && c.is_in_warranty !== null ? Number(c.is_in_warranty) : 1;
        let isDateMissing = false;
        if (cleanDate) {
          const [year, month, day] = cleanDate.split('-').map(Number);
          const installDate = new Date(year, month - 1, day);
          const expiryDate = new Date(installDate);
          expiryDate.setFullYear(expiryDate.getFullYear() + 5);
          computedWarranty = new Date() <= expiryDate ? 1 : 0;
        } else {
          isDateMissing = true;
        }

        const rawMobile = (c.consumer_mobile || c.customer_phone || c.phone || '').toString().trim();
        const digitsOnly = rawMobile.replace(/\D/g, '');
        const cleanMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : rawMobile;
        const cleanOrderNo = (c.order_no || c.orderNo || c['Order No'] || '').toString().trim();
        const cleanDealerName = (c.dealer_name || c.dealerName || '').toString().trim();

        setSelectedCustomer({
          ...c,
          invoice_date: cleanDate || c.invoice_date,
          is_in_warranty: computedWarranty,
          isDateMissing
        });

        setFormData(prev => ({
          ...prev,
          customer_name: c.customer_name || prev.customer_name,
          customer_phone: cleanMobile || prev.customer_phone,
          customer_email: c.customer_email || prev.customer_email,
          customer_address: c.site_address || c.customer_address || c.address || c.city_village || prev.customer_address,
          city: c.city_village || c.city || prev.city,
          pincode: c.pincode || prev.pincode || '',
          district: c.district || prev.district || '',
          state: c.state || prev.state || '',
          post_office: c.post_office || prev.post_office || '',
          consumer_no: c.consumer_no || prev.consumer_no || '',
          order_no: cleanOrderNo || prev.order_no || '',
          dealer_name: cleanDealerName || prev.dealer_name || '',
          invoice_no: c.invoice_no || prev.invoice_no || '',
          invoice_date: cleanDate || prev.invoice_date || '',
          is_in_warranty: computedWarranty,
          product_type: prev.product_type || 'Solar Rooftop Systems',
          installation_id: c.consumer_no || c.order_no || prev.installation_id || '',
          product_serial: c.inverter_serial || c.product_serial || prev.product_serial || '',
          pv_capacity: c.pv_capacity ? String(c.pv_capacity) : (prev.pv_capacity || ''),
          panel_make: c.panel_make || prev.panel_make || '',
          inverter_make: c.inverter_make || prev.inverter_make || '',
          scheme: c.scheme || prev.scheme || '',
          issue_description: initialData.issue_description || prev.issue_description || ''
        }));

        if (c.pincode) {
          setPincodeStatus('valid');
        }

        // Specifically start on product selection window
        setStep('product');
      } else {
        setFormData(prev => ({
          ...prev,
          customer_name: initialData.customer_name || prev.customer_name,
          customer_phone: initialData.customer_phone || prev.customer_phone,
          issue_description: initialData.issue_description || prev.issue_description
        }));
        setStep('form');
      }
    } else if (!isOpen) {
      initializedModalTicketId.current = null;
    }
  }, [initialData, isOpen, isEditMode]);

  const [fileList, setFileList] = useState([]); // [{ file, preview, id }]
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [createdWhatsApp, setCreatedWhatsApp] = useState(null);
  const [waData, setWaData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedWaMsg, setCopiedWaMsg] = useState(false);

  const isSurveyProduct = useMemo(() => {
    const p = String(formData.product_type || '').toUpperCase();
    const c = String(formData.issue_category || '').toUpperCase();
    return p.includes('SURVEY') || c.includes('SURVEY');
  }, [formData.product_type, formData.issue_category]);

  // Dynamic template rendering for WhatsApp message
  useEffect(() => {
    if (createdTicket) {
      buildComplaintRegisteredWhatsApp(createdTicket)
        .then((data) => setWaData(data))
        .catch((err) => console.error('Error generating WhatsApp text:', err));
    } else {
      setWaData(null);
    }
  }, [createdTicket]);

  // 2-Step Registration Wizard state
  const [step, setStep] = useState('product'); // 'product' | 'form'
  const [productsList, setProductsList] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [categoriesList, setCategoriesList] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  const [phoneVerification, setPhoneVerification] = useState(null);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [activeComplaintWarning, setActiveComplaintWarning] = useState(null);
  const [checkingActiveComplaint, setCheckingActiveComplaint] = useState(false);

  // Real-time genuine 10-digit Indian mobile number validation
  useEffect(() => {
    const raw = (formData.customer_phone || '').replace(/\D/g, '');
    if (!raw) {
      setPhoneVerification(null);
      setVerifyingPhone(false);
      return;
    }

    const last10 = raw.length >= 10 ? raw.slice(-10) : raw;

    if (last10.length === 10) {
      if (/^[6-9]\d{9}$/.test(last10)) {
        setPhoneVerification({ valid: true, message: 'Valid 10-digit Indian mobile number.' });
      } else {
        setPhoneVerification({ valid: false, message: 'Indian mobile numbers must start with 6, 7, 8, or 9.' });
      }
    } else if (raw.length > 0 && raw.length < 10) {
      if (!/^[6-9]/.test(last10)) {
        setPhoneVerification({ valid: false, message: 'Indian mobile numbers must start with 6, 7, 8, or 9.' });
      } else {
        setPhoneVerification(null);
      }
    } else {
      setPhoneVerification({ valid: false, message: 'Please enter a genuine 10-digit Indian mobile number.' });
    }
    setVerifyingPhone(false);
  }, [formData.customer_phone]);

  // Phone verification status only (does NOT auto-override user inputs without user action)

  // Real-time active complaint duplicate detection
  useEffect(() => {
    const rawPhone = (formData.customer_phone || '').replace(/\D/g, '');
    const rawName = (formData.customer_name || '').trim();

    if (rawPhone.length < 10 && rawName.length < 3) {
      setActiveComplaintWarning(null);
      setCheckingActiveComplaint(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingActiveComplaint(true);
      try {
        const res = await api.checkActiveComplaint(formData.customer_phone, formData.customer_name, formData.product_type);
        if (res && res.hasActiveComplaint && res.complaint) {
          if (isEditMode && (String(res.complaint.id) === String(initialData?.id) || res.complaint.ticket_id === initialData?.ticket_id)) {
            setActiveComplaintWarning(null);
          } else {
            setActiveComplaintWarning(res.complaint);
          }
        } else {
          setActiveComplaintWarning(null);
        }
      } catch (e) {
        setActiveComplaintWarning(null);
      } finally {
        setCheckingActiveComplaint(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [formData.customer_phone, formData.customer_name, formData.product_type]);

  // Location & Postal Pincode state
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeStatus, setPincodeStatus] = useState(null); // null | 'valid' | 'invalid'
  const [pincodeMessage, setPincodeMessage] = useState('');
  const [pincodePostOffices, setPincodePostOffices] = useState([]);
  const [pincodeVerifiedData, setPincodeVerifiedData] = useState(null);

  const [citySuggestions, setCitySuggestions] = useState([]);
  const [recommendedPincodes, setRecommendedPincodes] = useState([]);
  const [searchingCity, setSearchingCity] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  // Pincode Verification Function
  const verifyPincode = async (code) => {
    const clean = (code || '').replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setPincodeStatus(null);
      setPincodeMessage('');
      setPincodePostOffices([]);
      setPincodeVerifiedData(null);
      return;
    }

    try {
      setPincodeLoading(true);
      setPincodeMessage('');
      const res = await api.getPincodeDetails(clean);
      if (res && res.success) {
        setPincodeStatus('valid');
        setPincodeVerifiedData(res);
        setPincodePostOffices(res.villages || res.postOffices || []);

        const fallbackCity = res.city || (res.postOffices && res.postOffices[0]?.name) || (res.villages && res.villages[0]) || '';
        setFormData(prev => ({
          ...prev,
          pincode: clean,
          district: res.district || prev.district,
          state: res.state || prev.state,
          city: prev.city || fallbackCity
        }));
      } else {
        setPincodeStatus('invalid');
        setPincodeMessage(res?.message || 'Invalid Pincode. Please enter a valid 6-digit pincode.');
        setPincodePostOffices([]);
        setPincodeVerifiedData(null);
      }
    } catch (err) {
      setPincodeStatus('invalid');
      setPincodeMessage('Invalid Pincode. Please enter a valid 6-digit pincode.');
      setPincodePostOffices([]);
      setPincodeVerifiedData(null);
    } finally {
      setPincodeLoading(false);
    }
  };

  // Debounced 6-digit Pincode Auto-verification
  useEffect(() => {
    const clean = (formData.pincode || '').replace(/\D/g, '').trim();
    if (clean.length === 6) {
      const timer = setTimeout(() => {
        verifyPincode(clean);
      }, 300);
      return () => clearTimeout(timer);
    } else if (clean.length > 0 && clean.length < 6 && pincodeStatus === 'valid') {
      setPincodeStatus(null);
      setPincodeVerifiedData(null);
    }
  }, [formData.pincode]);

  // Debounced City/District Search for Autosuggesting Pincodes (Bidirectional)
  useEffect(() => {
    const val = (formData.city || '').trim();

    if (!val || val.length < 3) {
      setCitySuggestions([]);
      setRecommendedPincodes([]);
      setSearchingCity(false);
      setShowCitySuggestions(false);
      return;
    }

    // If pincode is already filled (6 digits), do not search or show recommended pincodes
    if (formData.pincode && formData.pincode.trim().length === 6) {
      setCitySuggestions([]);
      setRecommendedPincodes([]);
      setShowCitySuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingCity(true);
        const res = await api.searchLocation(val);
        if (res && res.success && res.results && res.results.length > 0) {
          setCitySuggestions(res.results);
          if (res.recommendedPincodes && res.recommendedPincodes.length > 0) {
            setRecommendedPincodes(res.recommendedPincodes);
          } else {
            const pMap = new Map();
            for (const r of res.results) {
              if (!r.pincode) continue;
              const placeName = r.city || r.village || r.name;
              if (!placeName) continue;
              if (!pMap.has(r.pincode)) {
                pMap.set(r.pincode, {
                  pincode: r.pincode,
                  district: r.district,
                  state: r.state,
                  villages: [placeName]
                });
              } else {
                const item = pMap.get(r.pincode);
                if (item.villages && !item.villages.includes(placeName)) {
                  item.villages.push(placeName);
                }
              }
            }
            setRecommendedPincodes(Array.from(pMap.values()));
          }
        } else {
          setCitySuggestions([]);
          setRecommendedPincodes([]);
        }
      } catch (e) {
        setCitySuggestions([]);
        setRecommendedPincodes([]);
      } finally {
        setSearchingCity(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [formData.city, formData.pincode]);

  const handleSelectCitySuggestion = (suggestion) => {
    const selectedCity = suggestion.city || suggestion.village || suggestion.name || suggestion.district || '';
    setFormData(prev => ({
      ...prev,
      city: selectedCity,
      district: suggestion.district || prev.district,
      pincode: suggestion.pincode || prev.pincode,
      state: suggestion.state || prev.state
    }));
    setPincodeStatus('valid');
    setPincodeVerifiedData(suggestion);
    setPincodeMessage('');
    setShowCitySuggestions(false);
    setCitySuggestions([]);
    setRecommendedPincodes([]);
  };

  const handleSelectRecommendedPincode = (item) => {
    setFormData(prev => ({
      ...prev,
      pincode: item.pincode,
      district: item.district || prev.district,
      state: item.state || prev.state
    }));
    setPincodeStatus('valid');
    setPincodeMessage('');
    setPincodeVerifiedData({
      pincode: item.pincode,
      district: item.district,
      state: item.state,
      villages: item.postOffices || []
    });
    setPincodePostOffices(item.postOffices || []);
    // Immediate disappearance of recommendation list
    setRecommendedPincodes([]);
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };

  const handleSelectCityName = (name) => {
    setFormData(prev => ({
      ...prev,
      city: name
    }));
    // Immediate disappearance of recommendation list
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };


  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadCategories();
      if (!createdTicket) {
        if (isEditMode) {
          setStep('form');
        } else {
          setStep('product');
        }
      }
    }
  }, [isOpen, isEditMode]);

  const loadCategories = async () => {
    try {
      const res = await api.getCategories();
      if (res && res.categories && res.categories.length > 0) {
        setCategoriesList(res.categories);
      }
    } catch (e) {
      console.warn('Failed to load dynamic categories:', e);
    }
  };

  const getProductCategories = (prodName) => {
    const dynamic = categoriesList
      .filter(c => c.product_type === prodName)
      .map(c => c.category_name);
    if (dynamic.length > 0) return dynamic;
    return PRODUCT_CATEGORIES[prodName] || [
      'Equipment Not Starting / Tripping',
      'Physical / Mechanical Damage',
      'Electrical / Power Issue',
      'Performance Degradation',
      'Other Fault'
    ];
  };

  const loadProducts = async () => {
    try {
      setLoadingProducts(true);
      const res = await api.getProducts();
      if (res.products && res.products.length > 0) {
        setProductsList(res.products);
      } else {
        setProductsList([
          { id: 1, name: 'Solar Rooftop Systems', description: 'On-Grid & Off-Grid Solar Plants' },
          { id: 2, name: 'Solar Water Heaters', description: 'Domestic & Commercial ETC / FPC Water Heaters' },
          { id: 3, name: 'Heat Pumps', description: 'Commercial & Residential High-Efficiency Heat Pumps' },
          { id: 4, name: 'Pressure Pumps', description: 'Booster & Hydro-Pneumatic Pressure Pumps' },
          { id: 5, name: 'SITE SURVEY', description: 'Rooftop Feasibility, Shadow Analysis & Measurement' },
          { id: 6, name: 'Other', description: 'Other Solar & Renewable Energy Equipment' }
        ]);
      }
    } catch (e) {
      setProductsList([
        { id: 1, name: 'Solar Rooftop Systems', description: 'On-Grid & Off-Grid Solar Plants' },
        { id: 2, name: 'Solar Water Heaters', description: 'Domestic & Commercial ETC / FPC Water Heaters' },
        { id: 3, name: 'Heat Pumps', description: 'Commercial & Residential High-Efficiency Heat Pumps' },
        { id: 4, name: 'Pressure Pumps', description: 'Booster & Hydro-Pneumatic Pressure Pumps' },
        { id: 5, name: 'SITE SURVEY', description: 'Rooftop Feasibility, Shadow Analysis & Measurement' },
        { id: 6, name: 'Other', description: 'Other Solar & Renewable Energy Equipment' }
      ]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleSelectProduct = (prodName) => {
    const availableCategories = getProductCategories(prodName);
    setFormData(prev => ({
      ...prev,
      product_type: prodName,
      issue_category: availableCategories[0] || 'Other Issue'
    }));
    setStep('form');
  };

  // Smart Customer Search & Warranty state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTimeout, setSearchTimeout] = useState(null);

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
    // Extract and format clean YYYY-MM-DD date for <input type="date">
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

    // Dynamic 5-Year Warranty verification: plants installed > 5 years ago are Out of Warranty
    let computedWarranty = c.is_in_warranty !== undefined && c.is_in_warranty !== null ? Number(c.is_in_warranty) : 1;
    let isDateMissing = false;
    if (cleanDate) {
      const [year, month, day] = cleanDate.split('-').map(Number);
      const installDate = new Date(year, month - 1, day);
      const expiryDate = new Date(installDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + 5);
      computedWarranty = new Date() <= expiryDate ? 1 : 0;
    } else {
      isDateMissing = true;
    }

    setSelectedCustomer({
      ...c,
      invoice_date: cleanDate || c.invoice_date,
      is_in_warranty: computedWarranty,
      isDateMissing
    });
    setCustomerSearchResults([]);
    setCustomerSearchQuery('');
    setShowCitySuggestions(false);
    setCitySuggestions([]);
    const rawMobile = (c.consumer_mobile || c.customer_phone || c.phone || '').toString().trim();
    const digitsOnly = rawMobile.replace(/\D/g, '');
    const cleanMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : rawMobile;
    const cleanOrderNo = (c.order_no || c.orderNo || c['Order No'] || '').toString().trim();
    const cleanDealerName = (c.dealer_name || c.dealerName || '').toString().trim();

    setFormData(prev => ({
      ...prev,
      customer_name: c.customer_name || prev.customer_name,
      customer_phone: cleanMobile || prev.customer_phone,
      customer_address: c.site_address || c.customer_address || c.address || c.city_village || prev.customer_address,
      city: c.city_village || c.city || prev.city,
      consumer_no: c.consumer_no || prev.consumer_no,
      order_no: cleanOrderNo || prev.order_no || '',
      dealer_name: cleanDealerName || prev.dealer_name || '',
      invoice_no: c.invoice_no || prev.invoice_no || '',
      invoice_date: cleanDate || prev.invoice_date || '',
      is_in_warranty: computedWarranty,
      product_type: prev.product_type || 'Solar Rooftop Systems',
      installation_id: c.consumer_no || c.order_no || prev.installation_id,
      product_serial: c.inverter_serial || c.product_serial || prev.product_serial,
      pv_capacity: c.pv_capacity ? String(c.pv_capacity) : (prev.pv_capacity || ''),
      panel_make: c.panel_make || prev.panel_make || '',
      inverter_make: c.inverter_make || prev.inverter_make || '',
      scheme: c.scheme || prev.scheme || ''
    }));
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setFormData(prev => ({
      ...prev,
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_address: '',
      city: '',
      pincode: '',
      district: '',
      state: '',
      post_office: '',
      consumer_no: '',
      order_no: '',
      dealer_name: '',
      invoice_no: '',
      invoice_date: '',
      location_url: '',
      installation_id: '',
      product_serial: '',
      pv_capacity: '',
      panel_make: '',
      inverter_make: '',
      scheme: '',
      is_in_warranty: 1
    }));
    setPincodeStatus(null);
    setPincodeMessage('');
    setPincodePostOffices([]);
    setPincodeVerifiedData(null);
    setRecommendedPincodes([]);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    setPhoneVerification(null);
    setActiveComplaintWarning(null);
  };

  const handleProductChange = (prod) => {
    setFormData({
      ...formData,
      product_type: prod,
      issue_category: (PRODUCT_CATEGORIES[prod] && PRODUCT_CATEGORIES[prod][0]) || 'General Service Required'
    });
  };

  const compressImageFile = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        return resolve(file);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 1400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressed);
            },
            'image/jpeg',
            0.82
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (selected) => {
    if (!selected || selected.length === 0) return;
    const oversized = selected.filter(f => f.size > 50 * 1024 * 1024);
    if (oversized.length > 0) {
      showToast(`File "${oversized[0].name}" exceeds 50MB limit (${(oversized[0].size / (1024 * 1024)).toFixed(1)} MB). Upload limit is 50MB.`, 'error');
    }
    const validFiles = selected.filter(f => f.size <= 50 * 1024 * 1024);
    if (validFiles.length === 0) return;

    const newItems = await Promise.all(
      validFiles.map(async (file) => {
        const isImg = file.type.startsWith('image/');
        const isVid = file.type.startsWith('video/');
        const optimized = isImg ? await compressImageFile(file) : file;
        return {
          id: Math.random().toString(36).substring(2, 9),
          file: optimized,
          name: optimized.name,
          size: optimized.size > 1024 * 1024
            ? (optimized.size / (1024 * 1024)).toFixed(1) + ' MB'
            : (optimized.size / 1024).toFixed(1) + ' KB',
          isImage: isImg,
          isVideo: isVid,
          preview: (isImg || isVid) ? URL.createObjectURL(optimized) : null
        };
      })
    );
    setFileList(prev => [...prev, ...newItems].slice(0, 5));
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (id) => {
    setFileList(prev => {
      const item = prev.find(f => f.id === id);
      if (item && item.preview) {
        URL.revokeObjectURL(item.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.customer_phone || !formData.customer_address || !formData.issue_description) {
      showToast('Please fill all required customer and issue details.', 'warning');
      return;
    }

    if (activeComplaintWarning) {
      showToast(`Cannot register: Active complaint #${activeComplaintWarning.ticket_id} is already open for "${activeComplaintWarning.product_type || formData.product_type}" (${activeComplaintWarning.status}). Please resolve/close it first.`, 'error');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        if (key === 'notify_charges') {
          data.append('notify_charges', formData.notify_charges ? '1' : '0');
        } else if (key === 'is_in_warranty') {
          data.append('is_in_warranty', (formData.is_in_warranty === 1 || formData.is_in_warranty === '1' || formData.is_in_warranty === true) ? '1' : '0');
        } else if (key === 'estimated_charges') {
          data.append('estimated_charges', (formData.estimated_charges !== undefined && formData.estimated_charges !== null && formData.estimated_charges !== '') ? String(formData.estimated_charges) : '0');
        } else if (formData[key] !== undefined && formData[key] !== null && formData[key] !== '') {
          data.append(key, formData[key]);
        }
      });

      // Direct Cloud Storage Upload (bypasses Vercel 4.5MB limit, supports up to 50MB files!)
      if (fileList.length > 0) {
        setUploadProgress({
          isUploading: true,
          progress: 5,
          currentFile: fileList[0].name,
          currentIndex: 1,
          totalFiles: fileList.length
        });
        const uploadedAttachments = [];
        for (let idx = 0; idx < fileList.length; idx++) {
          const item = fileList[idx];
          const pct = Math.round(((idx + 0.3) / fileList.length) * 100);
          setUploadProgress({
            isUploading: true,
            progress: pct,
            currentFile: item.name,
            currentIndex: idx + 1,
            totalFiles: fileList.length
          });
          try {
            const uploaded = await uploadFileToSupabase(item.file);
            if (uploaded) uploadedAttachments.push({ ...uploaded, attachment_type: 'registration' });
          } catch (storageErr) {
            console.warn('Direct storage upload error, fallback to multipart:', storageErr.message);
            if (item.file.size <= 4 * 1024 * 1024) {
              data.append('attachments', item.file);
            }
          }
          const finishedPct = Math.round(((idx + 1) / fileList.length) * 100);
          setUploadProgress({
            isUploading: true,
            progress: finishedPct,
            currentFile: item.name,
            currentIndex: idx + 1,
            totalFiles: fileList.length
          });
        }
        if (uploadedAttachments.length > 0) {
          data.append('attachment_urls', JSON.stringify(uploadedAttachments));
        }
        data.append('attachment_type', 'registration');
      }

      if (isEditMode) {
        const updateId = initialData.id || initialData.ticket_id;
        const res = await api.updateComplaint(updateId, data);
        const updatedTicket = res.complaint || res.ticket || res;
        broadcastComplaintsUpdate({ ticketId: initialData.ticket_id, action: 'edited' });
        if (onComplaintUpdated) {
          onComplaintUpdated(updatedTicket);
        }
        showToast(
          res?.whatsapp_notified 
            ? 'Ticket updated & customer notified via WhatsApp! 📲' 
            : 'Complaint ticket updated successfully!', 
          'success'
        );
        resetAndClose();
        return;
      }

      const res = await api.createComplaint(data);
      setCreatedTicket(res.complaint);
      setCreatedWhatsApp(res.whatsapp || null);

      // Trigger In-App Notification (Restricted to Admin Only as per ECO-5)
      if (res && res.complaint) {
        addNotification({
          type: 'new_ticket',
          ticketId: res.complaint.ticket_id || res.complaint.id,
          complaintId: res.complaint.id,
          title: `New Ticket Registered: ${res.complaint.ticket_id}`,
          message: `Customer ${res.complaint.customer_name} raised a ticket for ${res.complaint.product_type} (${res.complaint.issue_category}).`,
          customerName: res.complaint.customer_name,
          targetRole: 'admin',
          performedByName: currentUser?.name || 'Front Desk Staff',
          performedByRole: currentUser?.role || 'staff',
          performedByUserId: currentUser?.id,
          performedByUsername: currentUser?.username
        });
      }

      broadcastComplaintsUpdate({ ticketId: res.complaint?.ticket_id, action: 'created' });
      if (onComplaintCreated) onComplaintCreated(res.complaint);
    } catch (err) {
      showToast('Failed to create complaint: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
      setUploadProgress({ isUploading: false, progress: 0, currentFile: '', currentIndex: 0, totalFiles: 0 });
    }
  };

  const copyTicketId = () => {
    if (createdTicket?.ticket_id) {
      navigator.clipboard.writeText(createdTicket.ticket_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDirectSendWhatsApp = async (phone, message) => {
    try {
      setDirectSending(true);
      setDirectSendError(null);
      const res = await api.sendDirectWhatsApp(phone, message);
      if (res.success) {
        setDirectSent(true);
      } else {
        setDirectSendError(res.error || 'Failed to deliver message via WhatsApp gateway');
      }
    } catch (err) {
      setDirectSendError(err.message || 'Failed to send WhatsApp message');
    } finally {
      setDirectSending(false);
    }
  };

  const resetAndClose = () => {
    setStep(isEditMode ? 'form' : 'product');
    setCreatedTicket(null);
    setCreatedWhatsApp(null);
    setPreviewItem(null);
    setDirectSending(false);
    setDirectSent(false);
    setDirectSendError(null);
    fileList.forEach(item => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
    setFileList([]);
    setSelectedCustomer(null);
    setPhoneVerification(null);
    setVerifyingPhone(false);
    setFormData({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_address: '',
      city: '',
      pincode: '',
      district: '',
      state: '',
      post_office: '',
      consumer_no: '',
      order_no: '',
      dealer_name: '',
      invoice_no: '',
      invoice_date: '',
      location_url: '',
      is_in_warranty: 1,
      estimated_charges: '',
      notify_charges: true,
      product_type: 'Solar Rooftop Systems',
      product_serial: '',
      installation_id: '',
      issue_category: 'No Power Output',
      issue_description: '',
      priority: 'Medium'
    });
    setPincodeStatus(null);
    setPincodeMessage('');
    setPincodePostOffices([]);
    setPincodeVerifiedData(null);
    setActiveComplaintWarning(null);
    onClose();
  };

  // --- HIERARCHICAL STAGE ESCAPE HANDLERS ---
  // Stage 1: Preview file/media inside New Complaint Modal (Inner Modal Stage)
  useEscapeHandler(() => {
    setPreviewItem(null);
    return true;
  }, Boolean(isOpen && previewItem), { priority: ESCAPE_PRIORITY.INNER_MODAL });

  // Stage 2: Active duplicate complaint warning (Inner Modal Stage)
  useEscapeHandler(() => {
    setActiveComplaintWarning(null);
    return true;
  }, Boolean(isOpen && !previewItem && activeComplaintWarning), { priority: ESCAPE_PRIORITY.INNER_MODAL });

  // Stage 3: Step backward from 'form' to 'product' in registration wizard, then close modal
  useEscapeHandler(() => {
    if (previewItem || activeComplaintWarning) return false;
    if (step === 'form' && !isEditMode) {
      setStep('product');
      return true;
    }
    // If on product step or in edit mode, close the modal
    resetAndClose();
    return true;
  }, Boolean(isOpen), { priority: ESCAPE_PRIORITY.DRAWER });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      style={{
        paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
        paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))'
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step === 'form' && !createdTicket && !isEditMode ? (
              <button
                type="button"
                onClick={() => setStep('product')}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-emerald-100 hover:text-white transition-colors cursor-pointer"
                title="Back to Product Selection"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="p-2 bg-white/10 rounded-xl">
                <Sun className="w-5 h-5 text-amber-300" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                {isEditMode ? (
                  <>
                    <span>{isSurveyProduct ? 'Edit Site Survey Ticket' : 'Edit Complaint Ticket'}</span>
                    {initialData?.ticket_id && (
                      <span className="text-xs bg-amber-400/20 text-amber-300 border border-amber-300/30 px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide">
                        #{initialData.ticket_id}
                      </span>
                    )}
                  </>
                ) : createdTicket ? (
                  isSurveyProduct ? 'Site Survey Scheduled Successfully' : 'Complaint Registered Successfully' 
                ) : step === 'product' ? (
                  'Step 1: Select Product Category' 
                ) : (
                  isSurveyProduct ? 'Step 2: Site Survey Booking Form' : `Step 2: ${formData.product_type} Complaint Form`
                )}
              </h2>
              <p className="text-xs text-emerald-200">
                {isEditMode
                  ? (isSurveyProduct ? 'Update customer details, site location, survey scope, or estimated visit fee' : 'Update customer details, warranty status, defect category, or service charges')
                  : createdTicket 
                    ? (isSurveyProduct ? 'Survey ticket registered & automated notifications dispatched' : 'Ticket registered & automated notifications ready') 
                    : step === 'product'
                      ? 'Choose product or survey category to start registration'
                      : (isSurveyProduct ? 'Fill customer & site location details to schedule site survey' : 'Fill customer & defect details to register ticket')}
              </p>
            </div>
          </div>
          <button 
            onClick={resetAndClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {createdTicket ? (
            /* Clean, Professional Success Confirmation Screen (No Birthday Confetti) */
            <div className="py-4 space-y-5 max-w-xl mx-auto">
              {/* Header Icon & Title */}
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-emerald-200">
                  <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-3 py-0.5 rounded-full uppercase tracking-wider">
                    {isSurveyProduct ? 'Site Survey Scheduled Successfully' : 'Complaint Registered Successfully'}
                  </span>
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1.5 tracking-tight">
                    {createdTicket.ticket_id}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Registered on {formatIndianDateOnly(new Date())} • Status: <strong className="text-amber-700">Unassigned</strong>
                  </p>
                </div>
              </div>

              {/* Ticket Summary Box */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-700 shadow-2xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Customer Name</span>
                    <strong className="text-slate-900 text-sm block truncate">{createdTicket.customer_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Mobile Number</span>
                    <span className="font-mono font-bold text-emerald-700 text-sm block">📞 {createdTicket.customer_phone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Product & Issue</span>
                    <span className="text-slate-800 font-semibold block">{createdTicket.product_type} — {createdTicket.issue_category}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Warranty Status</span>
                    <span className={`font-bold inline-block mt-0.5 ${createdTicket.is_in_warranty ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {createdTicket.is_in_warranty ? '🟢 In Warranty (Free Service)' : '🔴 Out of Warranty'}
                    </span>
                  </div>
                  {createdTicket.city && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">City / Village</span>
                      <span className="text-slate-800 font-medium block">📍 {createdTicket.city}</span>
                    </div>
                  )}
                  {createdTicket.estimated_charges > 0 && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Service Fee</span>
                      <strong className="text-slate-900 font-mono text-sm block">₹{createdTicket.estimated_charges}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Background Automated WhatsApp Dispatch Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <span>Customer WhatsApp Alert Dispatched</span>
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ⚡ Meta Cloud API
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Automated confirmation and live tracking link sent to <strong>{createdTicket.customer_phone}</strong> in the background.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={copyTicketId}
                  className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Ticket ID Copied!' : 'Copy Ticket ID'}</span>
                </button>

                {onViewComplaint && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = createdTicket.id;
                      resetAndClose();
                      onViewComplaint(id);
                    }}
                    className="px-3.5 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Open Ticket Details</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetAndClose}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : step === 'product' ? (
            /* STEP 1: PRODUCT SELECTION WINDOW */
            <div className="space-y-6 py-3">
              <div className="text-center max-w-md mx-auto space-y-1">
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  Step 1 of 2: Select Product
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-2">
                  Which product requires service?
                </h3>
                <p className="text-xs text-slate-500">
                  Select a product category below to open the complaint registration form.
                </p>
              </div>

              {selectedCustomer && (
                <div className="max-w-md mx-auto p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between gap-3 text-left shadow-2xs animate-in fade-in">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                        Prefilled Customer Record
                      </span>
                      <strong className="text-xs text-slate-900 truncate block">
                        {selectedCustomer.customer_name} • {selectedCustomer.consumer_mobile || selectedCustomer.customer_phone || selectedCustomer.phone}
                      </strong>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-200/80 text-emerald-950 font-bold px-2.5 py-1 rounded-full shrink-0">
                    Details Ready
                  </span>
                </div>
              )}

              {loadingProducts ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  Loading product catalog...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                  {productsList.map((prod) => {
                    const Icon = getProductComponentIcon(prod.name);
                    return (
                      <button
                        type="button"
                        key={prod.name}
                        onClick={() => handleSelectProduct(prod.name)}
                        className="group p-4 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 text-left transition-all shadow-2xs hover:shadow-md flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <Icon className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-bold text-slate-300 group-hover:text-emerald-600 transition-colors flex items-center gap-1">
                            Select →
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-950">
                            {prod.name}
                          </h4>
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                            {prod.description || 'Breakdown repairs, service & maintenance'}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                </div>
              )}
            </div>
          ) : (
            /* STEP 2: REGISTRATION FORM WINDOW */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Selected Product Banner with "Change Product" button */}
              <div className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0">
                    {React.createElement(getProductComponentIcon(formData.product_type), { className: 'w-5 h-5' })}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                      Selected Product Category (Step 2 of 2)
                    </span>
                    <strong className="text-sm font-bold text-slate-900 truncate block">
                      {formData.product_type}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('product')}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100/80 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change Product
                </button>
              </div>

              {/* Active Complaint Duplicate Warning Banner */}
              {activeComplaintWarning && (
                <div className="bg-rose-50 border-2 border-rose-400 rounded-2xl p-4 flex items-start gap-3 shadow-md animate-in fade-in slide-in-from-top-2">
                  <div className="p-2 bg-rose-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <h4 className="font-extrabold text-sm text-rose-900 flex items-center gap-1.5">
                        <span>Active Complaint Open for {activeComplaintWarning.product_type || formData.product_type}:</span>
                        <span className="font-mono bg-rose-200/80 text-rose-950 px-2 py-0.5 rounded-lg text-xs">
                          #{activeComplaintWarning.ticket_id}
                        </span>
                      </h4>
                      <span className="px-2.5 py-0.5 bg-amber-500 text-white text-[10px] font-black uppercase rounded-full shadow-2xs tracking-wider">
                        {activeComplaintWarning.status}
                      </span>
                    </div>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      Customer <strong>{activeComplaintWarning.customer_name}</strong> ({activeComplaintWarning.customer_phone}) already has an active service ticket in progress for <strong>{activeComplaintWarning.product_type || formData.product_type}</strong>.
                    </p>
                    <div className="mt-2 p-2 bg-white/80 rounded-xl border border-rose-200 text-[11px] text-rose-900 font-semibold flex items-center justify-between flex-wrap gap-2">
                      <span>⚠️ Duplicate tickets cannot be registered for the same product until Ticket #{activeComplaintWarning.ticket_id} is marked <strong>Closed</strong>.</span>
                      <span className="text-slate-500 font-normal">Created: {formatIndianDateTime(activeComplaintWarning.created_at)}</span>
                    </div>
                  </div>
                </div>
              )}

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
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-800">
                                {c.customer_name}
                              </span>
                              {(c.consumer_mobile || c.customer_phone || c.phone) && (
                                <span className="text-[11px] text-emerald-800 font-mono font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  📞 {c.consumer_mobile || c.customer_phone || c.phone}
                                </span>
                              )}
                              {c.order_no && (
                                <span className="text-[10px] text-indigo-800 font-mono font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                  Order #{c.order_no}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                              <span>📍 {c.city_village || c.city || 'N/A'}</span>
                              {c.dealer_name && (
                                <span className="bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-200">
                                  Dealer: <strong className="font-bold text-amber-950">{c.dealer_name}</strong>
                                </span>
                              )}
                              {c.consumer_no && (
                                <span className="text-[10px] text-slate-600 font-mono">
                                  Cons: {c.consumer_no}
                                </span>
                              )}
                              {c.pv_capacity && (
                                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  ⚡ {c.pv_capacity} kW
                                </span>
                              )}
                              {c.panel_make && (
                                <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                                  🔲 {c.panel_make}
                                </span>
                              )}
                              {c.inverter_make && (
                                <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                                  🔌 {c.inverter_make}
                                </span>
                              )}
                              {c.inverter_serial && <span>• Inv: <code className="bg-slate-100 px-1 rounded text-slate-700">{c.inverter_serial}</code></span>}
                              {c.scheme && (
                                <span className="text-[10px] text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                                  📋 {c.scheme}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {(!c.invoice_date && !c.installation_date) ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300">
                                <span>⚠️</span>
                                Date N/A
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                                c.is_in_warranty 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                  : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.is_in_warranty ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {c.is_in_warranty ? 'In Warranty' : 'Out of Warranty'}
                              </span>
                            )}
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
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Verified Eco Green Customer:
                        </span>
                        <strong className="text-xs text-slate-900">{selectedCustomer.customer_name}</strong>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {selectedCustomer.city_village} • Consumer No: <strong className="font-mono text-slate-800">{selectedCustomer.consumer_no || 'N/A'}</strong> • Invoice: <strong className="font-mono text-slate-800">{selectedCustomer.invoice_no || 'N/A'}</strong> ({selectedCustomer.invoice_date ? formatIndianDateOnly(selectedCustomer.invoice_date) : 'Date N/A'})
                      </p>
                      {(selectedCustomer.pv_capacity || selectedCustomer.panel_make || selectedCustomer.inverter_make || selectedCustomer.scheme || selectedCustomer.dealer_name) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {selectedCustomer.pv_capacity && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              ⚡ {selectedCustomer.pv_capacity} kW Plant
                            </span>
                          )}
                          {selectedCustomer.panel_make && (
                            <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              🔲 Panels: {selectedCustomer.panel_make}
                            </span>
                          )}
                          {selectedCustomer.inverter_make && (
                            <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              🔌 Inverter: {selectedCustomer.inverter_make}
                            </span>
                          )}
                          {selectedCustomer.scheme && (
                            <span className="text-[10px] text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                              📋 Scheme: {selectedCustomer.scheme}
                            </span>
                          )}
                          {selectedCustomer.dealer_name && (
                            <span className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                              🏢 Dealer: {selectedCustomer.dealer_name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex flex-col sm:items-end gap-1">
                      {(!selectedCustomer.invoice_date && !selectedCustomer.installation_date) ? (
                        <div className="flex flex-col sm:items-end gap-1">
                          <span className="px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-2xs bg-amber-500 text-white">
                            <AlertTriangle className="w-3.5 h-3.5 text-white" />
                            <span>Date / Invoice Not Available</span>
                          </span>
                          <span className="text-[10px] text-amber-900 font-semibold bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                            ⚠️ Please select In/Out of Warranty manually below
                          </span>
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Information */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  Customer Contact & Site Location
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600">Customer Full Name *</label>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g., MAYA BAVA VAGHELA"
                      value={formData.customer_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600">Mobile Phone *</label>
                    </div>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        placeholder="10-digit mobile (e.g. 9876543210)"
                        value={formData.customer_phone}
                        onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                        className={`w-full text-xs px-3 py-2 bg-white border rounded-lg focus:outline-none focus:ring-2 font-mono ${
                          phoneVerification
                            ? phoneVerification.valid
                              ? 'border-emerald-500 focus:ring-emerald-500 pr-8'
                              : 'border-rose-400 focus:ring-rose-400 pr-8'
                            : 'border-slate-300 focus:ring-emerald-500'
                        }`}
                      />
                      {phoneVerification && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                          {phoneVerification.valid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-500" />
                          )}
                        </div>
                      )}
                    </div>

                    {phoneVerification && !phoneVerification.valid && (
                      <div className="mt-1.5 animate-in fade-in duration-150">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{phoneVerification.message || 'Please enter a genuine 10-digit Indian mobile number.'}</span>
                        </div>
                      </div>
                    )}
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-emerald-600" />
                        Postal Pincode <span className="text-[10px] text-slate-400 font-normal">(Optional - 6 digits)</span>
                      </label>
                      {formData.pincode && formData.pincode.length === 6 && !pincodeLoading && pincodeStatus === 'valid' && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 282001, 302001, 380001"
                        value={formData.pincode || ''}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setFormData(prev => ({ ...prev, pincode: clean }));
                          if (clean.length < 6) {
                            setPincodeStatus(null);
                            setPincodeMessage('');
                            setPincodePostOffices([]);
                            setPincodeVerifiedData(null);
                          }
                        }}
                        className={`w-full text-xs px-3 py-2 bg-white border rounded-lg focus:outline-none focus:ring-2 font-mono tracking-wider ${
                          pincodeLoading
                            ? 'border-slate-300 focus:ring-emerald-500 pr-8'
                            : pincodeStatus === 'valid'
                            ? 'border-emerald-500 focus:ring-emerald-500 pr-8 bg-emerald-50/20'
                            : pincodeStatus === 'invalid'
                            ? 'border-rose-400 focus:ring-rose-400 pr-8 bg-rose-50/20'
                            : 'border-slate-300 focus:ring-emerald-500'
                        }`}
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {pincodeLoading ? (
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                        ) : pincodeStatus === 'valid' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : pincodeStatus === 'invalid' ? (
                          <AlertCircle className="w-4 h-4 text-rose-500" />
                        ) : null}
                      </div>
                    </div>
                    {pincodeStatus === 'invalid' && (
                      <p className="mt-1 text-[10px] text-rose-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {pincodeMessage || 'Invalid Pincode. Please enter a valid 6-digit pincode.'}
                      </p>
                    )}

                    {/* Recommended PIN Codes for Entered City (ONLY when City is filled AND Pincode is blank) */}
                    {!formData.pincode && Boolean(formData.city && formData.city.trim()) && recommendedPincodes.length > 0 && (
                      <div className="mt-2 p-2.5 bg-emerald-50/80 border border-emerald-200/90 rounded-xl animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10.5px] font-bold text-emerald-950 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Recommended PIN Codes for <strong className="text-emerald-800 font-semibold">{formData.city}</strong>:</span>
                          </span>
                          <span className="text-[9.5px] text-emerald-700 font-medium">
                            Select to autofill
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {recommendedPincodes.map((item) => {
                            const locality = item.villages?.[0] || item.postOffices?.[0] || item.city || item.district || '';
                            return (
                              <button
                                key={item.pincode}
                                type="button"
                                onClick={() => handleSelectRecommendedPincode(item)}
                                className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs bg-white text-slate-800 border border-emerald-300 hover:border-emerald-500 hover:bg-emerald-100/70"
                                title={`${item.villages?.join(', ') || item.postOffices?.join(', ') || item.district} (${item.state})`}
                              >
                                <span>📌 {item.pincode}</span>
                                {locality && (
                                  <span className="text-[9px] font-sans font-normal truncate max-w-[100px] text-slate-500">
                                    ({locality})
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* City / Village, District & State Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Field 1: City / Village */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-emerald-600" />
                        City / Village
                      </label>
                      {searchingCity && (
                        <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g., Mainpuri, Ankolwadi, Kalavad, Rajkot..."
                      value={formData.city || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => ({ ...prev, city: val }));
                        if (!val) {
                          setShowCitySuggestions(false);
                          setCitySuggestions([]);
                        } else {
                          setShowCitySuggestions(true);
                        }
                      }}
                      onFocus={() => {
                        if (citySuggestions.length > 0) {
                          setShowCitySuggestions(true);
                        }
                      }}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />

                    {/* Autosuggest Dropdown for City/Village Search */}
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                        <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                          <span>Matching Cities & Villages ({citySuggestions.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowCitySuggestions(false)}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {citySuggestions.map((item, idx) => (
                          <div
                            key={`${item.pincode}_${item.city || item.village || item.name || idx}_${idx}`}
                            onClick={() => handleSelectCitySuggestion(item)}
                            className="p-2.5 hover:bg-emerald-50/70 cursor-pointer transition-colors text-left flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                <span>📍 {item.city || item.village || item.name}</span>
                                <span className="text-[11px] font-normal text-slate-500">({item.district})</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {item.state}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] rounded border border-emerald-200">
                                {item.pincode}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recommended Villages & Localities when PIN code is Entered AND City is Blank */}
                    {!formData.city && formData.pincode && formData.pincode.length === 6 && pincodePostOffices.length > 0 && (
                      <div className="mt-2 p-2 bg-emerald-50/80 border border-emerald-200/90 rounded-xl animate-in fade-in duration-150">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-emerald-950 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Villages & Localities under PIN <strong className="text-emerald-800 font-mono">{formData.pincode}</strong>:</span>
                          </span>
                          <span className="text-[9.5px] text-emerald-700 font-medium">
                            Click to set City/Village
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 max-h-32 overflow-y-auto pr-1">
                          {pincodePostOffices.map((loc) => {
                            const name = typeof loc === 'string' ? loc : (loc.name || loc.city || loc.village || '');
                            if (!name) return null;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => handleSelectCityName(name)}
                                className="text-[9.5px] px-2 py-1 rounded-md border border-emerald-300 bg-white text-slate-800 hover:bg-emerald-100 hover:border-emerald-500 transition-all cursor-pointer font-medium shadow-2xs flex items-center gap-1"
                              >
                                <span>📍</span>
                                <span>{name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Field 2: District */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-600" />
                        District
                      </label>
                      {formData.district && pincodeStatus === 'valid' && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> Auto-filled
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g., Rajkot, Surat, Ahmedabad..."
                      value={formData.district || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, district: e.target.value }))}
                      className={`w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                        pincodeStatus === 'valid' && formData.district
                          ? 'bg-slate-50 text-slate-800 border-slate-300 font-medium'
                          : 'bg-white border-slate-300 focus:ring-emerald-500'
                      }`}
                    />
                  </div>

                  {/* Field 3: State */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                        <Map className="w-3 h-3 text-emerald-600" />
                        State
                      </label>
                      {formData.state && pincodeStatus === 'valid' && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> Auto-filled
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g., Gujarat, Rajasthan, UP"
                      value={formData.state || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      className={`w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                        pincodeStatus === 'valid' && formData.state
                          ? 'bg-slate-50 text-slate-800 border-slate-300 font-medium'
                          : 'bg-white border-slate-300 focus:ring-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-slate-600">Site / Installation Address *</label>
                    {(formData.pincode || formData.city) && (
                      <button
                        type="button"
                        onClick={() => {
                          const parts = [
                            formData.customer_address ? formData.customer_address.trim() : '',
                            formData.post_office,
                            formData.city || formData.district,
                            formData.state ? `${formData.state}${formData.pincode ? ` - ${formData.pincode}` : ''}` : formData.pincode
                          ].filter(Boolean);
                          const combined = parts
                            .filter((item, index, self) => self.indexOf(item) === index)
                            .join(', ');
                          setFormData(prev => ({
                            ...prev,
                            customer_address: combined
                          }));
                        }}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>+ Append Verified Location to Address</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="House/Plot no., Street, Area, City, Pincode"
                    value={formData.customer_address}
                    onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Link className="w-3 h-3 text-blue-600" />
                    Customer Location Map URL (Google Maps Link)
                  </label>
                  <input
                    type="url"
                    placeholder="e.g., https://maps.app.goo.gl/... or https://goo.gl/maps/..."
                    value={formData.location_url}
                    onChange={(e) => setFormData({ ...formData, location_url: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* System & Warranty Details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  System Identification & Warranty Status
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Consumer No. (Optional)</label>
                    <input
                      type="text"
                      placeholder="Electricity board consumer no."
                      value={formData.consumer_no}
                      onChange={(e) => setFormData({ ...formData, consumer_no: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Order No. (from Excel, Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., SO-2023-XXXX"
                      value={formData.order_no}
                      onChange={(e) => setFormData({ ...formData, order_no: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Dealer Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Solar Dealer Agency"
                      value={formData.dealer_name || ''}
                      onChange={(e) => setFormData({ ...formData, dealer_name: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice No. (from Excel / Billing, Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., U-85 or INV-2023-XXXX"
                      value={formData.invoice_no || ''}
                      onChange={(e) => setFormData({ ...formData, invoice_no: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice Date (from Excel / Billing, Optional)</label>
                    <input
                      type="date"
                      value={formData.invoice_date || ''}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        let autoWarranty = formData.is_in_warranty;
                        if (newDate && /^\d{4}-\d{2}-\d{2}/.test(newDate)) {
                          const [year, month, day] = newDate.split('-').map(Number);
                          const installDate = new Date(year, month - 1, day);
                          const expiryDate = new Date(installDate);
                          expiryDate.setFullYear(expiryDate.getFullYear() + 5);
                          autoWarranty = new Date() <= expiryDate ? 1 : 0;
                        }
                        setFormData(prev => ({
                          ...prev,
                          invoice_date: newDate,
                          is_in_warranty: autoWarranty
                        }));
                        if (selectedCustomer) {
                          setSelectedCustomer(prev => prev ? ({ ...prev, invoice_date: newDate, is_in_warranty: autoWarranty }) : null);
                        }
                      }}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Inverter Serial / Product Serial</label>
                    <input
                      type="text"
                      placeholder="e.g., EGS-RT-5KW-2024"
                      value={formData.product_serial}
                      onChange={(e) => setFormData({ ...formData, product_serial: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  {/* Manual Warranty Override Toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Warranty Status *
                        </label>
                        {(!formData.invoice_date || !formData.invoice_no) && (
                          <div className="relative group inline-flex items-center">
                            <button
                              type="button"
                              className="text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 p-0.5 rounded-full transition-colors focus:outline-none"
                              aria-label="Warranty Information"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-64 p-2 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl z-50 pointer-events-none leading-snug border border-slate-700">
                              <p className="font-bold text-amber-300 mb-0.5">⚠️ Date / Invoice Not Available</p>
                              <p>Invoice Date or Number is not available in system records. Please verify customer documents and manually select In Warranty or Out of Warranty.</p>
                            </div>
                          </div>
                        )}
                      </div>
                      {formData.is_in_warranty === 1 ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                          🟢 In Warranty
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-md">
                          🔴 Out of Warranty
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, is_in_warranty: 1 })}
                        className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                          formData.is_in_warranty === 1
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-400/40'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        In Warranty
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, is_in_warranty: 0 })}
                        className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                          formData.is_in_warranty === 0
                            ? 'bg-rose-600 text-white border-rose-700 shadow-xs ring-2 ring-rose-400/40'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Out of Warranty
                      </button>
                    </div>
                  </div>
                </div>

                {/* Solar Plant & Technical Equipment Specifications */}
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                      Solar Plant & Equipment Specifications (Autofilled / Optional)
                    </span>
                    <span className="text-[10px] text-slate-600 font-medium">Non-mandatory</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        System Size / Plant (kW)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 3 kW, 5 kW"
                        value={formData.pv_capacity || ''}
                        onChange={(e) => setFormData({ ...formData, pv_capacity: e.target.value })}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-blue-500" />
                        Solar Panels / Make
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Tier 1 PV Modules, Adani 540W"
                        value={formData.panel_make || ''}
                        onChange={(e) => setFormData({ ...formData, panel_make: e.target.value })}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-purple-500" />
                        Inverter Make / Brand
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Standard Inverter, Growatt, Solis"
                        value={formData.inverter_make || ''}
                        onChange={(e) => setFormData({ ...formData, inverter_make: e.target.value })}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-teal-500" />
                        Scheme / Model
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Solar Subsidy, Surya Ghar"
                        value={formData.scheme || ''}
                        onChange={(e) => setFormData({ ...formData, scheme: e.target.value })}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Charges & Quotation */}
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-amber-700" />
                    Service Charges & Customer Notification
                  </h4>
                  {Number(formData.estimated_charges) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          estimated_charges: '',
                          notify_charges: true
                        }));
                      }}
                      className="text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-100/80 hover:bg-rose-100 border border-rose-300 px-2.5 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <span>✕</span> Remove Charges (Set to ₹0)
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Estimated Service Charges (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        placeholder="0 (Free for In-Warranty)"
                        value={formData.estimated_charges}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            estimated_charges: val,
                            notify_charges: Number(val) > 0 ? true : prev.notify_charges
                          }));
                        }}
                        className="w-full text-xs pl-7 pr-3 py-2 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="pt-2 sm:pt-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.notify_charges}
                        onChange={(e) => setFormData({ ...formData, notify_charges: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-semibold text-slate-800">
                        Include charges in customer notification message
                      </span>
                    </label>
                    <p className="text-[10px] text-slate-500 ml-6 mt-0.5">
                      Customer will see estimated charges in their WhatsApp & Email confirmation
                    </p>
                  </div>
                </div>
              </div>

              {/* Issue Details & Priority (Low, Medium, High) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {isSurveyProduct ? 'Survey Category / Feasibility Scope *' : 'Issue Category *'}
                  </label>
                  <select
                    value={formData.issue_category}
                    onChange={(e) => setFormData({ ...formData, issue_category: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {getProductCategories(formData.product_type).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Priority Level</label>
                  <div className="flex gap-2">
                    {['Low', 'Medium', 'High'].map((p) => {
                      const isSelected = formData.priority === p;
                      const colors = {
                        Low: isSelected ? 'bg-slate-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                        Medium: isSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                        High: isSelected ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      };
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setFormData({ ...formData, priority: p })}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${colors[p]}`}
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
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isSurveyProduct ? 'Site Survey Requirements & Rooftop Feasibility Scope *' : 'Detailed Issue Description *'}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    isSurveyProduct 
                      ? 'Describe site survey requirements, roof type (RCC slab, tin shed, slope), shadow/obstruction concerns, proposed capacity (kW), or customer site notes...' 
                      : 'Describe the symptoms, error codes, inverter indicators, or when the problem started...'
                  }
                  value={formData.issue_description}
                  onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Attachments with Drag & Drop, Live Preview & Remove */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isSurveyProduct ? 'Upload Site Photos / Rooftop Videos (Optional, Max 5)' : 'Upload Photo/Video Proof (Optional, Max 5)'}
                </label>
                <div 
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-3 transition-all duration-200 ${
                    isDragging 
                      ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400/50 scale-[1.01]' 
                      : 'border-slate-200/90 bg-slate-50/50 hover:border-emerald-300'
                  }`}
                >
                  {isDragging ? (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-1.5 pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-emerald-800">Drop files here to upload</p>
                      <p className="text-[10px] text-emerald-600">Supports images, videos, and PDF documents (Max 50MB)</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-emerald-50/40 transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-xs text-slate-700 font-semibold">Browse Gallery / Files</span>
                        <span className="text-[10px] text-slate-400">Drag & drop or click (Max 5)</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                      <label className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors">
                        <Camera className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="text-xs text-emerald-800 font-bold">Take Live Photo</span>
                        <span className="text-[10px] text-emerald-600/80">Direct camera photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsVideoRecorderOpen(true)}
                        className="border-2 border-dashed border-teal-300 hover:border-teal-500 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-teal-50/40 hover:bg-teal-50/70 transition-colors"
                        title="Record live video with camera (50 MB limit, auto-compressed 720p HD)"
                      >
                        <Video className="w-5 h-5 text-teal-600 mb-1" />
                        <span className="text-xs text-teal-800 font-bold">Record Live Video</span>
                        <span className="text-[10px] text-teal-600/80">Auto-compressed • Max 50 MB</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Upload Progress Animation */}
                {uploadProgress.isUploading && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-900 flex items-center gap-1.5 truncate">
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin shrink-0" />
                        <span>Uploading attachment {uploadProgress.currentIndex} of {uploadProgress.totalFiles}: <strong className="font-mono">{uploadProgress.currentFile}</strong></span>
                      </span>
                      <span className="font-bold text-emerald-700 font-mono ml-2 shrink-0">{uploadProgress.progress}%</span>
                    </div>
                    <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${uploadProgress.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Live Preview List */}
                {fileList.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {fileList.map((item) => (
                      <div key={item.id} className="relative group bg-white border border-slate-200 rounded-xl p-2 shadow-2xs flex items-center gap-2 overflow-hidden">
                        {item.isImage && item.preview ? (
                          <img 
                            src={item.preview} 
                            alt={item.name} 
                            onClick={() => setPreviewItem(item)}
                            className="w-12 h-12 object-cover rounded-lg shrink-0 border border-slate-100 cursor-pointer hover:opacity-85 transition-opacity" 
                            title="Click to zoom preview"
                          />
                        ) : item.isVideo ? (
                          <div 
                            onClick={() => setPreviewItem(item)}
                            className="w-12 h-12 bg-amber-500/10 text-amber-600 border border-amber-200 rounded-lg shrink-0 flex flex-col items-center justify-center cursor-pointer hover:bg-amber-500/20 transition-colors"
                            title="Click to play video"
                          >
                            <Video className="w-5 h-5 text-amber-600" />
                            <span className="text-[8px] font-bold uppercase mt-0.5">Video</span>
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-slate-100 rounded-lg shrink-0 flex items-center justify-center text-slate-500">
                            <FileText className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-800 truncate" title={item.name}>
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-400">{item.size}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.preview && (
                            <button
                              type="button"
                              onClick={() => setPreviewItem(item)}
                              className="p-1 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 transition-colors shrink-0 cursor-pointer"
                              title="View full preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(item.id)}
                            className="p-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors shrink-0 cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!activeComplaintWarning}
                  className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all ${
                    activeComplaintWarning
                      ? 'bg-rose-100 text-rose-700 border border-rose-300 cursor-not-allowed opacity-90'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-700/20 disabled:opacity-50 cursor-pointer'
                  }`}
                  title={activeComplaintWarning ? `Cannot proceed: Ticket #${activeComplaintWarning.ticket_id} for "${activeComplaintWarning.product_type || formData.product_type}" is still open (${activeComplaintWarning.status})` : ''}
                >
                  {submitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : isEditMode ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {submitting
                    ? (uploadProgress.isUploading ? `Uploading Media (${uploadProgress.progress}%)...` : (isEditMode ? 'Saving Changes...' : (isSurveyProduct ? 'Scheduling Survey...' : 'Registering & Dispatching...')))
                    : activeComplaintWarning
                    ? `Cannot Proceed: Open Ticket for ${activeComplaintWarning.product_type || formData.product_type}`
                    : (isEditMode ? (isSurveyProduct ? 'Save & Update Survey Ticket' : 'Save & Update Ticket') : (isSurveyProduct ? 'Schedule Site Survey & Dispatch' : 'Register Complaint & Send Alerts'))}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Attachment Preview Modal / Lightbox */}
      {previewItem && (
        <div 
          className="fixed inset-0 z-70 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" 
          onClick={() => {
            setPreviewItem(null);
            setPreviewVideoMeta({ isLandscape: false, rotation: 0 });
          }}
        >
          <div 
            className={`relative w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-3 border border-slate-200 animate-in fade-in zoom-in-95 transition-all ${
              previewItem?.isVideo
                ? (previewVideoMeta.isLandscape ? 'max-w-4xl' : 'max-w-md')
                : 'max-w-2xl'
            }`} 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">{previewItem.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">({previewItem.size})</span>
                {previewItem.isVideo && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold shrink-0">
                    {previewVideoMeta.isLandscape ? 'Landscape' : 'Portrait'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {previewItem.isVideo && (
                  <button
                    type="button"
                    onClick={() => setPreviewVideoMeta(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }))}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Rotate video (0°, 90°, 180°, 270°)"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Rotate{previewVideoMeta.rotation ? ` ${previewVideoMeta.rotation}°` : ''}</span>
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => {
                    setPreviewItem(null);
                    setPreviewVideoMeta({ isLandscape: false, rotation: 0 });
                  }} 
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[70vh] overflow-auto bg-slate-50/50 rounded-xl mt-2">
              {previewItem.isVideo && previewItem.preview ? (
                <video
                  src={previewItem.preview}
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={(e) => {
                    const w = e.target.videoWidth || 0;
                    const h = e.target.videoHeight || 0;
                    if (w && h) {
                      setPreviewVideoMeta(prev => ({ ...prev, isLandscape: w > h }));
                    }
                  }}
                  style={{
                    transform: previewVideoMeta.rotation ? `rotate(${previewVideoMeta.rotation}deg)` : undefined,
                    transition: 'transform 0.25s ease'
                  }}
                  className={`rounded-lg shadow-xs bg-black object-contain ${
                    previewVideoMeta.isLandscape
                      ? 'w-full aspect-video max-h-[65vh]'
                      : 'max-w-full max-h-[65vh] aspect-[9/16]'
                  }`}
                />
              ) : previewItem.isImage && previewItem.preview ? (
                <img 
                  src={previewItem.preview} 
                  alt={previewItem.name} 
                  className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-xs" 
                />
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  Preview not available for this file type ({previewItem.name})
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Live In-App Compressed Video Recorder Modal (50 MB Limit Guard) */}
      <VideoRecorderModal
        isOpen={isVideoRecorderOpen}
        onClose={() => setIsVideoRecorderOpen(false)}
        onRecordingComplete={(file) => {
          processFiles([file]);
          setIsVideoRecorderOpen(false);
        }}
        title="Record Initial Complaint Video"
        subtitle="50 MB limit active • 720p HD auto-compressed recording"
      />
    </div>
  );
};
