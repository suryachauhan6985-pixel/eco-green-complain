import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useDialog } from '../../context/DialogContext';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { buildComplaintRegisteredWhatsApp } from '../../utils/templateUtils';
import { uploadFileToSupabase } from '../../utils/storageUpload';
import { 
  X, Sun, Droplets, Wind, AlertTriangle, AlertCircle, Upload, 
  CheckCircle2, Copy, Send, Sparkles, Phone, Mail, MapPin,
  Search, RefreshCw, ShieldCheck, ShieldAlert, Award, Calendar, Check,
  Link, IndianRupee, Trash2, FileText, MessageCircle, ExternalLink, Eye,
  Gauge, Layers, ArrowLeft, Plus, Hash, Building2, Map, Video, Camera
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
  if (type === 'Solar Rooftop Systems') return Sun;
  if (type === 'Solar Water Heaters') return Droplets;
  if (type === 'Heat Pumps') return Wind;
  if (type === 'Pressure Pumps') return Gauge;
  return Layers;
};

export const NewComplaintModal = ({ isOpen, onClose, onComplaintCreated, onViewComplaint, initialData = null }) => {
  const { currentUser } = useAuth();
  const { showToast } = useDialog();
  const { addNotification } = useNotifications();
  const [directSending, setDirectSending] = useState(false);
  const [directSent, setDirectSent] = useState(false);
  const [directSendError, setDirectSendError] = useState(null);

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
    invoice_no: '',
    invoice_date: '',
    location_url: '',
    is_in_warranty: 1,
    estimated_charges: '',
    notify_charges: false,
    product_type: 'Solar Rooftop Systems',
    product_serial: '',
    installation_id: '',
    issue_category: 'No Power Output',
    issue_description: '',
    priority: 'Medium'
  });

  // Populate from initialData (e.g. from WhatsApp conversion)
  useEffect(() => {
    if (initialData && isOpen) {
      setFormData(prev => ({
        ...prev,
        customer_name: initialData.customer_name || prev.customer_name,
        customer_phone: initialData.customer_phone || prev.customer_phone,
        issue_description: initialData.issue_description || prev.issue_description
      }));
      setStep('form');
    }
  }, [initialData, isOpen]);

  const [fileList, setFileList] = useState([]); // [{ file, preview, id }]
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [createdWhatsApp, setCreatedWhatsApp] = useState(null);
  const [waData, setWaData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedWaMsg, setCopiedWaMsg] = useState(false);

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

  // Debounced real-time WhatsApp phone verification
  useEffect(() => {
    const raw = (formData.customer_phone || '').replace(/\D/g, '');
    if (!raw || raw.length < 5) {
      setPhoneVerification(null);
      setVerifyingPhone(false);
      return;
    }

    const timer = setTimeout(async () => {
      setVerifyingPhone(true);
      try {
        const res = await api.verifyWhatsAppNumber(formData.customer_phone);
        setPhoneVerification(res);
      } catch (e) {
        setPhoneVerification(null);
      } finally {
        setVerifyingPhone(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formData.customer_phone]);

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
        const res = await api.checkActiveComplaint(formData.customer_phone, formData.customer_name);
        if (res && res.hasActiveComplaint && res.complaint) {
          setActiveComplaintWarning(res.complaint);
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
  }, [formData.customer_phone, formData.customer_name]);

  // Location & Postal Pincode state
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeStatus, setPincodeStatus] = useState(null); // null | 'valid' | 'invalid'
  const [pincodeMessage, setPincodeMessage] = useState('');
  const [pincodePostOffices, setPincodePostOffices] = useState([]);
  const [pincodeVerifiedData, setPincodeVerifiedData] = useState(null);

  const [citySuggestions, setCitySuggestions] = useState([]);
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

        setFormData(prev => ({
          ...prev,
          pincode: clean,
          district: res.district || prev.district,
          city: (prev.city && prev.city !== prev.district) ? prev.city : (res.cityOrVillage || res.district || prev.city),
          state: res.state || prev.state
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

  // Debounced City/District Search for Autosuggesting Pincodes
  useEffect(() => {
    const val = (formData.city || '').trim();
    if (pincodeStatus === 'valid' && (val === pincodeVerifiedData?.district || val === pincodeVerifiedData?.postOffice)) {
      return;
    }

    if (!val || val.length < 3) {
      setCitySuggestions([]);
      setSearchingCity(false);
      setShowCitySuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingCity(true);
        const res = await api.searchLocation(val);
        if (res && res.success && res.results && res.results.length > 0) {
          setCitySuggestions(res.results);
          setShowCitySuggestions(true);
        } else {
          setCitySuggestions([]);
          setShowCitySuggestions(false);
        }
      } catch (e) {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
      } finally {
        setSearchingCity(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [formData.city]);

  const handleSelectCitySuggestion = (suggestion) => {
    setFormData(prev => ({
      ...prev,
      city: suggestion.postOffice || suggestion.district,
      district: suggestion.district,
      pincode: suggestion.pincode,
      state: suggestion.state
    }));
    setPincodeStatus('valid');
    setPincodeVerifiedData(suggestion);
    setPincodeMessage('');
    setShowCitySuggestions(false);
  };


  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadCategories();
      if (!createdTicket) {
        setStep('product');
      }
    }
  }, [isOpen]);

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
          { id: 5, name: 'Other', description: 'Other Solar & Renewable Energy Equipment' }
        ]);
      }
    } catch (e) {
      setProductsList([
        { id: 1, name: 'Solar Rooftop Systems', description: 'On-Grid & Off-Grid Solar Plants' },
        { id: 2, name: 'Solar Water Heaters', description: 'Domestic & Commercial ETC / FPC Water Heaters' },
        { id: 3, name: 'Heat Pumps', description: 'Commercial & Residential High-Efficiency Heat Pumps' },
        { id: 4, name: 'Pressure Pumps', description: 'Booster & Hydro-Pneumatic Pressure Pumps' },
        { id: 5, name: 'Other', description: 'Other Solar & Renewable Energy Equipment' }
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
      city: c.city_village || prev.city,
      consumer_no: c.consumer_no || prev.consumer_no,
      order_no: c.order_no || prev.order_no,
      invoice_no: c.invoice_no || prev.invoice_no || '',
      invoice_date: c.invoice_date || prev.invoice_date || '',
      is_in_warranty: c.is_in_warranty !== undefined ? c.is_in_warranty : 1,
      product_type: prev.product_type || 'Solar Rooftop Systems',
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

  const handleFileChange = async (e) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
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
      showToast(`Cannot register: Active complaint #${activeComplaintWarning.ticket_id} is already open (${activeComplaintWarning.status}). Please resolve/close it first.`, 'error');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key] !== undefined && formData[key] !== null && formData[key] !== '') {
          data.append(key, formData[key]);
        }
      });

      // Direct Cloud Storage Upload (bypasses Vercel 4.5MB limit, supports up to 50MB files!)
      if (fileList.length > 0) {
        const uploadedAttachments = [];
        for (const item of fileList) {
          try {
            const uploaded = await uploadFileToSupabase(item.file);
            if (uploaded) uploadedAttachments.push(uploaded);
          } catch (storageErr) {
            console.warn('Direct storage upload error, fallback to multipart:', storageErr.message);
            if (item.file.size <= 4 * 1024 * 1024) {
              data.append('attachments', item.file);
            }
          }
        }
        if (uploadedAttachments.length > 0) {
          data.append('attachment_urls', JSON.stringify(uploadedAttachments));
        }
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

      if (onComplaintCreated) onComplaintCreated(res.complaint);
    } catch (err) {
      showToast('Failed to create complaint: ' + err.message, 'error');
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
    setStep('product');
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
      consumer_no: '',
      order_no: '',
      invoice_no: '',
      invoice_date: '',
      location_url: '',
      is_in_warranty: 1,
      estimated_charges: '',
      notify_charges: false,
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step === 'form' && !createdTicket ? (
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
              <h2 className="text-lg font-bold">
                {createdTicket 
                  ? 'Complaint Registered Successfully' 
                  : step === 'product' 
                    ? 'Step 1: Select Product Category' 
                    : `Step 2: ${formData.product_type} Complaint Form`}
              </h2>
              <p className="text-xs text-emerald-200">
                {createdTicket 
                  ? 'Ticket registered & automated notifications ready' 
                  : step === 'product'
                    ? 'Choose product to start complaint registration'
                    : 'Fill customer & defect details to register ticket'}
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
                    Complaint Registered Successfully
                  </span>
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1.5 tracking-tight">
                    {createdTicket.ticket_id}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Registered on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • Status: <strong className="text-amber-700">Unassigned</strong>
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
                        <span>Active Complaint Already Open:</span>
                        <span className="font-mono bg-rose-200/80 text-rose-950 px-2 py-0.5 rounded-lg text-xs">
                          #{activeComplaintWarning.ticket_id}
                        </span>
                      </h4>
                      <span className="px-2.5 py-0.5 bg-amber-500 text-white text-[10px] font-black uppercase rounded-full shadow-2xs tracking-wider">
                        {activeComplaintWarning.status}
                      </span>
                    </div>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      Customer <strong>{activeComplaintWarning.customer_name}</strong> ({activeComplaintWarning.customer_phone}) already has an active service ticket in progress.
                    </p>
                    <div className="mt-2 p-2 bg-white/80 rounded-xl border border-rose-200 text-[11px] text-rose-900 font-semibold flex items-center justify-between flex-wrap gap-2">
                      <span>⚠️ Duplicate tickets cannot be registered for this customer until Ticket #{activeComplaintWarning.ticket_id} is marked <strong>Closed</strong>.</span>
                      <span className="text-slate-500 font-normal">Created: {new Date(activeComplaintWarning.created_at).toLocaleDateString()}</span>
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
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
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

                    {/* Simple Customer Match & Auto-fill */}
                    {phoneVerification && (
                      <div className="mt-1.5 animate-in fade-in duration-150">
                        {phoneVerification.valid ? (
                          phoneVerification.isExistingCustomer && (
                            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg shadow-2xs">
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Registered Customer: <strong className="text-emerald-950">{phoneVerification.customerName}</strong> ({phoneVerification.city || 'Gujarat'})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({
                                    ...prev,
                                    customer_name: phoneVerification.customerName || prev.customer_name,
                                    city: phoneVerification.city || prev.city,
                                    consumer_no: phoneVerification.consumerNo || prev.consumer_no,
                                    order_no: phoneVerification.orderNo || prev.order_no,
                                    invoice_no: phoneVerification.invoiceNo || prev.invoice_no,
                                    invoice_date: phoneVerification.invoiceDate || prev.invoice_date,
                                    product_serial: phoneVerification.inverterSerial || prev.product_serial,
                                    is_in_warranty: phoneVerification.isInWarranty !== null ? (phoneVerification.isInWarranty ? 1 : 0) : prev.is_in_warranty
                                  }));
                                }}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-0.5 rounded shadow-2xs transition-all cursor-pointer ml-auto"
                              >
                                Auto-fill Details
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>{phoneVerification.message || 'Please enter a genuine 10-digit Indian mobile number.'}</span>
                          </div>
                        )}
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
                      placeholder="e.g., Metoda, Chhapra, Khirsara..."
                      value={formData.city || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      onFocus={() => { if (citySuggestions.length > 0) setShowCitySuggestions(true); }}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />

                    {/* Autosuggest Dropdown for City/Village Search */}
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                        <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                          <span>Matching Locations ({citySuggestions.length})</span>
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
                            key={`${item.pincode}_${item.postOffice}_${idx}`}
                            onClick={() => handleSelectCitySuggestion(item)}
                            className="p-2.5 hover:bg-emerald-50/70 cursor-pointer transition-colors text-left flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                <span>📍 {item.postOffice}</span>
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

                    {/* Quick Village/Locality Selection Chips under PIN */}
                    {pincodeVerifiedData?.villages && pincodeVerifiedData.villages.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 animate-in fade-in">
                        <span className="text-[9.5px] text-slate-500 font-semibold block w-full">Villages under {formData.pincode}:</span>
                        {pincodeVerifiedData.villages.slice(0, 6).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, city: v }))}
                            className={`text-[9.5px] px-1.5 py-0.5 rounded-md border transition-all cursor-pointer ${
                              formData.city === v
                                ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
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
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Warranty Status (Manual Selection / Override)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, is_in_warranty: 1 })}
                        className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                          formData.is_in_warranty === 1
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
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
                            ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Out of Warranty
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Charges & Quotation */}
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/80 space-y-3">
                <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-700" />
                  Service Charges & Customer Notification
                </h4>

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
                        onChange={(e) => setFormData({ ...formData, estimated_charges: e.target.value })}
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
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Issue Category *</label>
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

              {/* Attachments with Live Preview & Remove */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Upload Photo/Video Proof (Optional, Max 5)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-colors">
                    <Upload className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-xs text-slate-700 font-semibold">Browse Files / Gallery</span>
                    <span className="text-[10px] text-slate-400">Photos, videos, PDFs (Max 5)</span>
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
                    <span className="text-[10px] text-emerald-600/80">Direct camera capture</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

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
                  title={activeComplaintWarning ? `Cannot register: Ticket #${activeComplaintWarning.ticket_id} is still open (${activeComplaintWarning.status})` : ''}
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting
                    ? 'Registering & Dispatching...'
                    : activeComplaintWarning
                    ? `Cannot Register: Ticket #${activeComplaintWarning.ticket_id} Still Open`
                    : 'Register Complaint & Send Alerts'}
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
          onClick={() => setPreviewItem(null)}
        >
          <div 
            className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-3 border border-slate-200 animate-in fade-in zoom-in-95" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">{previewItem.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">({previewItem.size})</span>
              </div>
              <button 
                type="button"
                onClick={() => setPreviewItem(null)} 
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[70vh] overflow-auto bg-slate-50/50 rounded-xl mt-2">
              {previewItem.isVideo && previewItem.preview ? (
                <video
                  src={previewItem.preview}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[65vh] rounded-lg shadow-xs"
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
    </div>
  );
};
