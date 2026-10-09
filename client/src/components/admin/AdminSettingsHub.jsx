import React, { useState, useEffect } from 'react';
import { 
  Settings, User, Shield, MessageSquare, Layers, FileText, 
  Check, Save, RefreshCw, Key, Phone, Mail, Sparkles, Copy, 
  Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Package, 
  HelpCircle, Tag, Plus, Trash2, ExternalLink, Printer, Compass,
  Users, Wrench, Search, Edit3, X, UserPlus, IndianRupee,
  Bell, Smartphone
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { useNotifications } from '../../context/NotificationContext';
import { getUrlParam, updateUrlParams } from '../../utils/urlSync';
import { TemplateManager } from './TemplateManager';
import { useEscapeHandler, ESCAPE_PRIORITY } from '../../utils/escapeManager';

// Default Tour Expense Categories
const DEFAULT_EXPENSE_CATEGORIES = [
  'Bus / Train Fare',
  'Auto / Taxi / Cab',
  'Petrol / Diesel (Fuel)',
  'Food & Meals',
  'Spare Parts & Consumables',
  'Hotel / Night Stay',
  'Toll & Parking',
  'Customer Site Material',
  'Miscellaneous'
];

// Product Types & Equipment
const PRODUCT_EQUIPMENT_TYPES = [
  {
    id: 'rooftop',
    name: 'Solar Rooftop Systems',
    tag: 'Primary Solar',
    desc: 'On-grid & off-grid rooftop solar power plants with inverters and panels',
    faultsCount: 9
  },
  {
    id: 'water_heater',
    name: 'Solar Water Heaters',
    tag: 'Thermal Solar',
    desc: 'Domestic and commercial solar water heating collector tanks and tubes',
    faultsCount: 6
  },
  {
    id: 'heat_pump',
    name: 'Heat Pumps',
    tag: 'HVAC Energy',
    desc: 'High-efficiency heat pump water heating and thermodynamic systems',
    faultsCount: 5
  },
  {
    id: 'pressure_pump',
    name: 'Pressure Pumps',
    tag: 'Booster Hydraulics',
    desc: 'Water pressure boosting systems, flow controllers, and booster motors',
    faultsCount: 6
  },
  {
    id: 'survey',
    name: 'SITE SURVEY',
    tag: 'Engineering Assessment',
    desc: 'Pre-installation structural, shadow, and electrical feasibility surveys',
    faultsCount: 6
  }
];

// Issue Diagnostic Categories by Product
const ISSUE_DIAGNOSTICS_DATA = {
  'Solar Rooftop Systems': [
    'Inverter Error / Red Light',
    'Low / Zero Power Generation',
    'Panel Physical Damage / Crack',
    'Wiring / Earthing / MC4 Spark',
    'Structure Loose / Corrosion',
    'RMS / Monitoring Dongle Offline',
    'Grid Voltage Surge / Tripping',
    'Periodic Preventive Maintenance',
    'Other Inverter or Plant Issue'
  ],
  'Solar Water Heaters': [
    'Water Not Getting Heated',
    'Tank / Pipe Water Leakage',
    'Glass Tube Broken / Damaged',
    'Air Vent Overflow / Burst',
    'Backup Electric Heater Failure',
    'Other Solar Water Heater Issue'
  ],
  'Heat Pumps': [
    'Heat Pump Not Starting',
    'Water Heating Very Slow',
    'Refrigerant / Gas Leakage Warning',
    'Fan Motor Abnormal Noise / Vibration',
    'Digital Controller / Sensor Error'
  ],
  'Pressure Pumps': [
    'Pump Not Starting / Tripping',
    'Low Water Pressure Discharge',
    'Pump Running Continuously',
    'Water Leakage from Body/Joints',
    'Pressure Controller / Switch Fault',
    'Motor Overheating / Burning Smell'
  ],
  'SITE SURVEY': [
    'Site Feasibility & Shadow Analysis',
    'Rooftop Structural Assessment',
    'Electrical Load & Metering Survey',
    'Solar Water Heater Location Assessment',
    'Heat Pump Feasibility Survey',
    'General Site Survey & Measurements'
  ]
};

export const AdminSettingsHub = ({ initialTab = 'account' }) => {
  const { currentUser, setCurrentUser } = useAuth();
  const { showToast, confirm } = useDialog();
  const { testBackgroundPush } = useNotifications();

  const [activeTab, setActiveTab] = useState(() => {
    const urlTab = getUrlParam('tab');
    if (['account', 'templates', 'items_category', 'voucher'].includes(urlTab)) {
      return urlTab;
    }
    return initialTab || 'account';
  });

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    updateUrlParams({ tab: tabId });
  };

  // Stage: If on a settings subtab (templates, voucher, items_category, etc.), step back to default 'account'
  useEscapeHandler(() => {
    handleTabChange('account');
    return true;
  }, Boolean(activeTab !== 'account'), { priority: ESCAPE_PRIORITY.SUBVIEW });

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePop = () => {
      const urlTab = getUrlParam('tab');
      if (['account', 'templates', 'items_category', 'voucher'].includes(urlTab)) {
        setActiveTab(urlTab);
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // ==========================================
  // TAB 1: Account Settings State
  // ==========================================
  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '');
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || '');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [copiedCreds, setCopiedCreds] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || '');
      setProfilePhone(currentUser.phone || '');
      setProfileEmail(currentUser.email || '');
    }
  }, [currentUser]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      return showToast('Full Name is required', 'error');
    }
    const cleanPhone = profilePhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return showToast('Mobile Phone must be exactly 10 digits', 'error');
    }

    try {
      setProfileLoading(true);
      const res = await api.updateProfile({
        name: profileName.trim(),
        username: cleanPhone,
        phone: cleanPhone,
        email: profileEmail.trim() || undefined
      });

      const updatedUser = {
        ...currentUser,
        ...(res?.user || {}),
        name: profileName.trim(),
        username: cleanPhone,
        phone: cleanPhone,
        email: profileEmail.trim()
      };

      setCurrentUser(updatedUser);
      localStorage.setItem('egs_cached_user', JSON.stringify(updatedUser));
      if (updatedUser?.role === 'admin') {
        localStorage.setItem('egs_admin_profile', JSON.stringify(updatedUser));
      }
      showToast('Admin Profile updated successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleGeneratePassword = () => {
    const prefixes = ['EcoGreen', 'SolarTech', 'CleanEnergy', 'SolarPro'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const gen = `${prefix}@${num}`;
    setNewPassword(gen);
    setConfirmPassword(gen);
    setShowNew(true);
    showToast('Secure password generated! Click Update Password to apply.', 'info');
  };

  const handleCopyCredentials = () => {
    const idToCopy = profilePhone || 'admin';
    const passToCopy = newPassword || '••••••••';
    const text = `🌿 *Eco Green Solar CMS Admin Credentials*\n👤 *Name:* ${profileName}\n📱 *Mobile Number / Login:* ${idToCopy}\n🔒 *Password:* ${passToCopy}\n🌐 *Portal:* https://complain.ecogreensolar.co.in/login`;
    navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
    showToast('Admin credentials copied to clipboard!', 'success');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      return showToast('New password must be at least 4 characters long', 'error');
    }
    if (newPassword !== confirmPassword) {
      return showToast('New password and confirmation password do not match', 'error');
    }

    try {
      setPasswordLoading(true);
      await api.changeMyPassword({
        currentPassword: currentPassword.trim() || undefined,
        newPassword: newPassword.trim()
      });

      if (currentUser?.role === 'admin') {
        localStorage.setItem('egs_admin_password', newPassword.trim());
      }
      showToast('Password changed successfully! Remember to use your new password on next login.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast(err.message || 'Failed to change password. Please check your current password.', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  // ==========================================
  // Multi-Account Switcher & Management State (Admin, Staff, Technicians)
  // ==========================================
  const [accountRole, setAccountRole] = useState('admin'); // 'admin' | 'staff' | 'technician'
  const [staffList, setStaffList] = useState([]);
  const [techList, setTechList] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');

  // Selected accounts for management
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);

  // Forms
  const [staffEditForm, setStaffEditForm] = useState({ name: '', phone: '', email: '' });
  const [techEditForm, setTechEditForm] = useState({ name: '', phone: '', email: '', daily_voucher_rate: 400, specialization: '' });
  const [memberNewPassword, setMemberNewPassword] = useState('');
  const [showMemberPassword, setShowMemberPassword] = useState(true);
  const [memberPasswordLoading, setMemberPasswordLoading] = useState(false);
  const [memberSavingLoading, setMemberSavingLoading] = useState(false);

  // Add Account Modal State
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountRole, setAddAccountRole] = useState('staff');
  const [addAccountForm, setAddAccountForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    daily_voucher_rate: 400,
    specialization: ''
  });
  const [addAccountLoading, setAddAccountLoading] = useState(false);

  const loadAccounts = async () => {
    try {
      setAccountsLoading(true);
      const [usersRes, techRes] = await Promise.all([
        api.getUsers().catch(() => ({ users: [] })),
        api.getTechnicians().catch(() => ({ technicians: [] }))
      ]);
      const allUsers = Array.isArray(usersRes?.users) ? usersRes.users : (Array.isArray(usersRes) ? usersRes : []);
      const staff = allUsers.filter(u => u && u.role === 'staff');
      const techs = Array.isArray(techRes?.technicians) ? techRes.technicians : (Array.isArray(techRes) ? techRes : []);
      setStaffList(staff);
      setTechList(techs);

      // Keep selected staff synced
      setSelectedStaff(prev => {
        if (!prev) return staff[0] || null;
        return staff.find(s => String(s.id) === String(prev.id)) || staff[0] || null;
      });

      // Keep selected tech synced
      setSelectedTech(prev => {
        if (!prev) return techs[0] || null;
        return techs.find(t => String(t.id) === String(prev.id)) || techs[0] || null;
      });
    } catch (err) {
      console.error('Failed to load accounts in settings:', err);
    } finally {
      setAccountsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'account') {
      loadAccounts();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedStaff) {
      setStaffEditForm({
        name: selectedStaff.name || '',
        phone: selectedStaff.phone || '',
        email: (selectedStaff.email && selectedStaff.email.endsWith('.internal')) ? '' : (selectedStaff.email || '')
      });
      setMemberNewPassword('');
    }
  }, [selectedStaff]);

  useEffect(() => {
    if (selectedTech) {
      setTechEditForm({
        name: selectedTech.name || '',
        phone: selectedTech.phone || '',
        email: (selectedTech.email && selectedTech.email.endsWith('.internal')) ? '' : (selectedTech.email || ''),
        daily_voucher_rate: selectedTech.daily_voucher_rate || 400,
        specialization: selectedTech.specialization || ''
      });
      setMemberNewPassword('');
    }
  }, [selectedTech]);

  const generateMemberPassword = () => {
    const prefixes = ['EcoStaff', 'SolarTech', 'CleanEnergy', 'TeamSolar'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const pass = `${prefix}@${num}`;
    setMemberNewPassword(pass);
    setShowMemberPassword(true);
    showToast('Secure password generated! Click Reset Password to apply.', 'info');
  };

  const generateAddAccountPassword = () => {
    const prefixes = ['EcoStaff', 'SolarTech', 'CleanEnergy', 'TeamSolar'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const pass = `${prefix}@${num}`;
    setAddAccountForm(f => ({ ...f, password: pass }));
  };

  const handleSaveStaffProfile = async (e) => {
    e.preventDefault();
    if (!selectedStaff) return;
    if (!staffEditForm.name.trim()) return showToast('Full Name is required', 'error');
    const cleanPhone = (staffEditForm.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) return showToast('Mobile number must be exactly 10 digits', 'error');

    try {
      setMemberSavingLoading(true);
      await api.updateUser(selectedStaff.id, {
        name: staffEditForm.name.trim(),
        phone: cleanPhone,
        email: staffEditForm.email.trim() || undefined,
        role: 'staff'
      });
      showToast(`Staff member "${staffEditForm.name.trim()}" updated successfully!`, 'success');
      loadAccounts();
    } catch (err) {
      showToast(err.message || 'Failed to update staff member', 'error');
    } finally {
      setMemberSavingLoading(false);
    }
  };

  const handleResetStaffPassword = async (e) => {
    e.preventDefault();
    if (!selectedStaff) return;
    if (!memberNewPassword || memberNewPassword.trim().length < 4) {
      return showToast('Password must be at least 4 characters long', 'error');
    }

    try {
      setMemberPasswordLoading(true);
      await api.adminResetPassword({
        userId: selectedStaff.id,
        newPassword: memberNewPassword.trim()
      });
      showToast(`Password securely reset for "${selectedStaff.name}"!`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setMemberPasswordLoading(false);
    }
  };

  const handleDeleteStaff = async (staffMember) => {
    const ok = await confirm({
      title: 'Remove Staff Member',
      message: `Are you sure you want to remove staff account "${staffMember.name}" (${staffMember.phone})?`,
      type: 'danger',
      confirmText: 'Remove Staff Account'
    });
    if (!ok) return;

    try {
      await api.deleteUser(staffMember.id);
      showToast(`Staff account "${staffMember.name}" removed successfully`, 'success');
      if (selectedStaff && String(selectedStaff.id) === String(staffMember.id)) {
        setSelectedStaff(null);
      }
      loadAccounts();
    } catch (err) {
      showToast(err.message || 'Failed to delete staff account', 'error');
    }
  };

  const handleCopyStaffCredentials = (staffMember) => {
    const phone = staffMember.phone || 'N/A';
    const pass = memberNewPassword || '••••••••';
    const text = `🌿 *Eco Green Support Staff Credentials*\n👤 *Name:* ${staffMember.name}\n📱 *Mobile Number / Login:* ${phone}\n🔒 *Password:* ${pass}\n🌐 *Portal:* https://complain.ecogreensolar.co.in/login`;
    navigator.clipboard.writeText(text);
    showToast(`Credentials for ${staffMember.name} copied to clipboard!`, 'success');
  };

  const handleSaveTechProfile = async (e) => {
    e.preventDefault();
    if (!selectedTech) return;
    if (!techEditForm.name.trim()) return showToast('Full Name is required', 'error');
    const cleanPhone = (techEditForm.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) return showToast('Mobile number must be exactly 10 digits', 'error');

    try {
      setMemberSavingLoading(true);
      await api.updateTechnician(selectedTech.id, {
        name: techEditForm.name.trim(),
        phone: cleanPhone,
        email: techEditForm.email.trim() || undefined,
        daily_voucher_rate: Number(techEditForm.daily_voucher_rate) || 400,
        specialization: techEditForm.specialization.trim() || undefined
      });
      showToast(`Technician "${techEditForm.name.trim()}" updated successfully!`, 'success');
      loadAccounts();
    } catch (err) {
      showToast(err.message || 'Failed to update technician', 'error');
    } finally {
      setMemberSavingLoading(false);
    }
  };

  const handleResetTechPassword = async (e) => {
    e.preventDefault();
    if (!selectedTech) return;
    if (!memberNewPassword || memberNewPassword.trim().length < 4) {
      return showToast('Password must be at least 4 characters long', 'error');
    }

    try {
      setMemberPasswordLoading(true);
      await api.adminResetPassword({
        technicianId: selectedTech.id,
        userId: selectedTech.user_id,
        newPassword: memberNewPassword.trim()
      });
      showToast(`Password securely reset for "${selectedTech.name}"!`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to reset technician password', 'error');
    } finally {
      setMemberPasswordLoading(false);
    }
  };

  const handleDeleteTechnicianAccount = async (techMember) => {
    const ok = await confirm({
      title: 'Remove Field Technician',
      message: `Are you sure you want to remove technician account "${techMember.name}" (${techMember.phone})?`,
      type: 'danger',
      confirmText: 'Remove Technician'
    });
    if (!ok) return;

    try {
      await api.deleteTechnician(techMember.id);
      showToast(`Technician "${techMember.name}" removed successfully`, 'success');
      if (selectedTech && String(selectedTech.id) === String(techMember.id)) {
        setSelectedTech(null);
      }
      loadAccounts();
    } catch (err) {
      showToast(err.message || 'Failed to delete technician', 'error');
    }
  };

  const handleCopyTechCredentials = (techMember) => {
    const phone = techMember.phone || 'N/A';
    const pass = memberNewPassword || '••••••••';
    const text = `🌿 *Eco Green Field Technician Credentials*\n👤 *Technician:* ${techMember.name}\n📱 *Mobile Number / Login:* ${phone}\n🔒 *Password:* ${pass}\n🌐 *Portal:* https://complain.ecogreensolar.co.in/login`;
    navigator.clipboard.writeText(text);
    showToast(`Credentials for ${techMember.name} copied to clipboard!`, 'success');
  };

  const handleOpenAddAccount = (role) => {
    setAddAccountRole(role);
    setAddAccountForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      daily_voucher_rate: 400,
      specialization: ''
    });
    const prefixes = ['EcoStaff', 'SolarTech', 'CleanEnergy'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    setAddAccountForm(f => ({ ...f, password: `${prefix}@${num}` }));
    setIsAddAccountModalOpen(true);
  };

  const handleCreateAccountSubmit = async (e) => {
    e.preventDefault();
    const cleanPhone = (addAccountForm.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return showToast('Mobile number must be exactly 10 digits', 'error');
    }
    if (!addAccountForm.name.trim()) {
      return showToast('Full Name is required', 'error');
    }
    if (!addAccountForm.password?.trim()) {
      return showToast('Login Password is required', 'error');
    }

    try {
      setAddAccountLoading(true);
      const safeEmail = addAccountForm.email?.trim() 
        ? addAccountForm.email.trim() 
        : `${cleanPhone}_${addAccountRole}@ecogreensolar.internal`;

      await api.createUser({
        name: addAccountForm.name.trim(),
        phone: cleanPhone,
        username: cleanPhone,
        email: safeEmail,
        password: addAccountForm.password.trim(),
        role: addAccountRole,
        daily_voucher_rate: Number(addAccountForm.daily_voucher_rate) || 400,
        specialization: addAccountForm.specialization?.trim() || undefined
      });

      showToast(`New ${addAccountRole === 'staff' ? 'Staff Member' : 'Technician'} created successfully!`, 'success');
      setIsAddAccountModalOpen(false);
      loadAccounts();
    } catch (err) {
      showToast(err.message || 'Failed to create account', 'error');
    } finally {
      setAddAccountLoading(false);
    }
  };

  // Filtered lists
  const filteredStaffList = staffList.filter(s => {
    if (!accountSearchQuery.trim()) return true;
    const q = accountSearchQuery.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) || (s.phone || '').includes(q) || (s.email || '').toLowerCase().includes(q);
  });

  const filteredTechList = techList.filter(t => {
    if (!accountSearchQuery.trim()) return true;
    const q = accountSearchQuery.toLowerCase();
    return (t.name || '').toLowerCase().includes(q) || (t.phone || '').includes(q) || (t.email || '').toLowerCase().includes(q);
  });

  // ==========================================
  // TAB 3: Items & Category State
  // ==========================================
  const [expenseCategories, setExpenseCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('egs_custom_expense_categories');
      return saved ? JSON.parse(saved) : DEFAULT_EXPENSE_CATEGORIES;
    } catch (_) {
      return DEFAULT_EXPENSE_CATEGORIES;
    }
  });
  const [newCatInput, setNewCatInput] = useState('');
  const [selectedProductView, setSelectedProductView] = useState('Solar Rooftop Systems');
  const [editingExpenseIndex, setEditingExpenseIndex] = useState(null);
  const [editingExpenseValue, setEditingExpenseValue] = useState('');

  const [diagnosticsMap, setDiagnosticsMap] = useState(() => {
    try {
      const saved = localStorage.getItem('egs_custom_diagnostics_data');
      return saved ? JSON.parse(saved) : ISSUE_DIAGNOSTICS_DATA;
    } catch (_) {
      return ISSUE_DIAGNOSTICS_DATA;
    }
  });
  const [newDiagnosticInput, setNewDiagnosticInput] = useState('');
  const [editingDiagIndex, setEditingDiagIndex] = useState(null);
  const [editingDiagValue, setEditingDiagValue] = useState('');

  const handleSaveEditExpense = (idx) => {
    const clean = editingExpenseValue.trim();
    if (!clean) return;
    const updated = [...expenseCategories];
    updated[idx] = clean;
    setExpenseCategories(updated);
    localStorage.setItem('egs_custom_expense_categories', JSON.stringify(updated));
    setEditingExpenseIndex(null);
    showToast(`Expense category updated to "${clean}"`, 'success');
  };

  const handleAddDiagnostic = (e) => {
    e.preventDefault();
    const clean = newDiagnosticInput.trim();
    if (!clean) return;
    const currentList = diagnosticsMap[selectedProductView] || [];
    if (currentList.some(d => d.toLowerCase() === clean.toLowerCase())) {
      return showToast('Diagnostic fault category already exists', 'warning');
    }
    const updatedList = [...currentList, clean];
    const updatedMap = { ...diagnosticsMap, [selectedProductView]: updatedList };
    setDiagnosticsMap(updatedMap);
    localStorage.setItem('egs_custom_diagnostics_data', JSON.stringify(updatedMap));
    setNewDiagnosticInput('');
    showToast(`Added fault "${clean}" for ${selectedProductView}`, 'success');
  };

  const handleSaveEditDiagnostic = (idx) => {
    const clean = editingDiagValue.trim();
    if (!clean) return;
    const currentList = diagnosticsMap[selectedProductView] || [];
    const updatedList = [...currentList];
    updatedList[idx] = clean;
    const updatedMap = { ...diagnosticsMap, [selectedProductView]: updatedList };
    setDiagnosticsMap(updatedMap);
    localStorage.setItem('egs_custom_diagnostics_data', JSON.stringify(updatedMap));
    setEditingDiagIndex(null);
    showToast(`Diagnostic fault updated to "${clean}"`, 'success');
  };

  const handleDeleteDiagnostic = async (faultToRemove) => {
    const ok = await confirm({
      title: 'Remove Diagnostic Category?',
      message: `Are you sure you want to remove "${faultToRemove}" from ${selectedProductView}?`,
      type: 'warning',
      confirmText: 'Remove'
    });
    if (!ok) return;
    const currentList = diagnosticsMap[selectedProductView] || [];
    const updatedList = currentList.filter(f => f !== faultToRemove);
    const updatedMap = { ...diagnosticsMap, [selectedProductView]: updatedList };
    setDiagnosticsMap(updatedMap);
    localStorage.setItem('egs_custom_diagnostics_data', JSON.stringify(updatedMap));
    showToast(`Diagnostic fault "${faultToRemove}" removed`, 'info');
  };

  const handleAddExpenseCategory = (e) => {
    e.preventDefault();
    const clean = newCatInput.trim();
    if (!clean) return;
    if (expenseCategories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      return showToast('Category already exists', 'warning');
    }
    const updated = [...expenseCategories, clean];
    setExpenseCategories(updated);
    localStorage.setItem('egs_custom_expense_categories', JSON.stringify(updated));
    setNewCatInput('');
    showToast(`Expense category "${clean}" added successfully!`, 'success');
  };

  const handleRemoveExpenseCategory = async (catToRemove) => {
    const ok = await confirm({
      title: 'Remove Category?',
      message: `Are you sure you want to remove "${catToRemove}" from expense categories?`,
      type: 'warning',
      confirmText: 'Remove'
    });
    if (!ok) return;
    const updated = expenseCategories.filter(c => c !== catToRemove);
    setExpenseCategories(updated);
    localStorage.setItem('egs_custom_expense_categories', JSON.stringify(updated));
    showToast(`Category "${catToRemove}" removed`, 'info');
  };

  // ==========================================
  // TAB 4: Voucher Settings State
  // ==========================================
  const [voucherSettings, setVoucherSettings] = useState({
    prefix: 'TT-',
    starting_number: 1001,
    next_voucher_no: 'TT-1001'
  });
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [savingVoucher, setSavingVoucher] = useState(false);

  const fetchVoucherSettings = async () => {
    try {
      setVoucherLoading(true);
      const res = await api.getVoucherSettings();
      if (res && res.success) {
        setVoucherSettings({
          prefix: res.prefix || 'TT-',
          starting_number: res.starting_number || 1001,
          next_voucher_no: res.next_voucher_no || `${res.prefix || 'TT-'}${res.starting_number || 1001}`
        });
      }
    } catch (err) {
      console.error('Failed to load voucher settings:', err);
    } finally {
      setVoucherLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'voucher') {
      fetchVoucherSettings();
    }
  }, [activeTab]);

  const handleSaveVoucherSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSavingVoucher(true);
      const pfx = (voucherSettings.prefix || 'TT-').trim().toUpperCase();
      const num = parseInt(voucherSettings.starting_number, 10) || 1;

      const res = await api.updateVoucherSettings({
        prefix: pfx,
        starting_number: num
      });

      if (res && res.success) {
        showToast('Voucher prefix and sequence configuration saved successfully!', 'success');
        setVoucherSettings({
          prefix: res.prefix || pfx,
          starting_number: res.starting_number || num,
          next_voucher_no: res.next_voucher_no || `${pfx}${num}`
        });
        localStorage.setItem('egs_voucher_settings_updated', String(Date.now()));
        window.dispatchEvent(new CustomEvent('voucher-settings-updated', { detail: { prefix: pfx, starting_number: num } }));
      } else {
        showToast(res?.error || 'Failed to save voucher settings', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error updating voucher settings', 'error');
    } finally {
      setSavingVoucher(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <Settings className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              System Administration
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Settings & System Preferences
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl font-medium">
            Configure Account Credentials, WhatsApp Notification Templates, Equipment & Diagnostic Categories, and Physical Tour Voucher Series.
          </p>
        </div>

        {/* Quick System Badge */}
        <div className="shrink-0 flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 text-xs">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <p className="font-bold text-slate-800">Eco Green Cloud System</p>
            <p className="text-[11px] text-slate-500 font-mono">complain.ecogreensolar.co.in</p>
          </div>
        </div>
      </div>

      {/* Main Settings Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300/80 scrollbar-none">
        <button
          onClick={() => handleTabChange('account')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'account'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Account Settings</span>
        </button>

        <button
          onClick={() => handleTabChange('templates')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'templates'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Template Settings</span>
        </button>

        <button
          onClick={() => handleTabChange('items_category')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'items_category'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Items & Category</span>
        </button>

        <button
          onClick={() => handleTabChange('voucher')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'voucher'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Voucher Settings</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: ACCOUNT SETTINGS */}
      {/* ========================================================================= */}
      {activeTab === 'account' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Account Role Category Switcher & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto">
              <button
                type="button"
                onClick={() => setAccountRole('admin')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  accountRole === 'admin'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Administrator Account</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountRole('staff')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  accountRole === 'staff'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Staff Accounts ({staffList.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountRole('technician')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  accountRole === 'technician'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Technician Accounts ({techList.length})</span>
              </button>
            </div>

            {accountRole !== 'admin' && (
              <button
                type="button"
                onClick={() => handleOpenAddAccount(accountRole)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New {accountRole === 'staff' ? 'Staff Member' : 'Technician'}</span>
              </button>
            )}
          </div>

          {/* VIEW A: ADMINISTRATOR ACCOUNT */}
          {accountRole === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          {/* Left Column: Organization Details & System Info */}
          <div className="lg:col-span-5 space-y-6">
            {/* Organization Profile Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black text-xl shadow-xs">
                  EG
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Eco Green Solar CMS</h3>
                  <p className="text-xs text-slate-500 font-medium">Head Office & Enterprise Setup</p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-400 mb-1">Company Registered Address</p>
                  <p className="font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                    Plot No. 4, Gajanand Industrial, Near RK Exotica,<br />
                    Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021, Gujarat
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold mb-0.5">Support Phone</p>
                    <p className="font-bold text-slate-800">+91 83066 83067</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold mb-0.5">Official Email</p>
                    <p className="font-bold text-slate-800 truncate">info@ecogreensolar.co.in</p>
                  </div>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl text-emerald-900 text-xs">
                  <p className="font-bold flex items-center gap-1.5 mb-1">
                    <Shield className="w-4 h-4 text-emerald-700" />
                    Security & Data Governance
                  </p>
                  <p className="leading-snug text-emerald-800/90 text-[11px]">
                    Role-based access control (Admin, Staff, Technician, Public Customer). Data retention rule: media auto-purged 30 days post ticket closure while preserving core audit registers.
                  </p>
                </div>

                {/* OS Web Push Notification System Card */}
                <div className="bg-gradient-to-br from-slate-900 to-emerald-950 border border-emerald-500/20 p-4 rounded-2xl text-white text-xs shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold flex items-center gap-1.5 text-emerald-400">
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      OS Background Push Engine
                    </p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      VAPID Active
                    </span>
                  </div>
                  <p className="leading-snug text-slate-300 text-[11px]">
                    Receives system notifications on Android, iOS (Home Screen PWA), Windows, and Mac lock screens even when the app is completely closed.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        showToast('Test push dispatched! Lock your screen or switch apps now to verify in 3s.', 'info');
                        if (typeof testBackgroundPush === 'function') {
                          await testBackgroundPush(3);
                        }
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Test Background Push (3s Delay)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Share Credentials Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-md">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Quick Share Credentials
                </span>
                <button
                  onClick={handleCopyCredentials}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedCreds ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCreds ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Click copy to format active login credentials and portal links for instant WhatsApp or SMS dispatch to supervisors.
              </p>
              <div className="font-mono text-xs bg-slate-950/60 p-3 rounded-xl border border-white/10 space-y-1 text-slate-300">
                <p><span className="text-slate-400">Username:</span> {profilePhone || 'admin'}</p>
                <p><span className="text-slate-400">Role:</span> {currentUser?.role?.toUpperCase() || 'ADMIN'}</p>
                <p><span className="text-slate-400">Portal:</span> https://complain.ecogreensolar.co.in/login</p>
              </div>
            </div>
          </div>

          {/* Right Column: Profile Form & Password Change */}
          <div className="lg:col-span-7 space-y-6">
            {/* Edit Admin Profile Form */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-5">
                <User className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Administrator Profile Details</h3>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    placeholder="e.g. Sumit Chauhan"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Mobile Number (Login ID) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">+91</span>
                      <input
                        type="tel"
                        maxLength="10"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value.replace(/\D/g, ''))}
                        required
                        className="w-full pl-11 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        placeholder="10 digit mobile"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="admin@ecogreensolar.co.in"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {profileLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Save Profile Details</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password Form */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">Change Account Password</h3>
                </div>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Password</span>
                </button>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Current Password (Leave blank if not set)
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="Current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      New Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        placeholder="At least 4 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Confirm New Password <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="Re-enter new password"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    <span>Update Account Password</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

          {/* ------------------------------------------------------------- */}
          {/* VIEW B: STAFF ACCOUNTS (FRONT DESK & SUPPORT OPERATORS)       */}
          {/* ------------------------------------------------------------- */}
          {accountRole === 'staff' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Left Column: Staff Directory List */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <span>Support Staff Members</span>
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {filteredStaffList.length} Active
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={accountSearchQuery}
                      onChange={(e) => setAccountSearchQuery(e.target.value)}
                      placeholder="Search staff by name or phone..."
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Staff List */}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {accountsLoading ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading staff accounts...</div>
                    ) : filteredStaffList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        {accountSearchQuery ? 'No matching staff members found.' : 'No staff accounts configured yet.'}
                      </div>
                    ) : (
                      filteredStaffList.map((staff) => {
                        const isSelected = selectedStaff && String(selectedStaff.id) === String(staff.id);
                        return (
                          <div
                            key={staff.id}
                            onClick={() => setSelectedStaff(staff)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-emerald-50/80 border-emerald-500 shadow-xs'
                                : 'bg-slate-50/60 hover:bg-slate-100/80 border-slate-200/80'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {staff.name?.charAt(0)?.toUpperCase() || 'S'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{staff.name}</p>
                                <p className="text-[11px] font-mono text-slate-500 truncate">+91 {staff.phone}</p>
                              </div>
                            </div>

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                              Staff
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Selected Staff Details & Password Reset */}
              <div className="lg:col-span-7 space-y-6">
                {selectedStaff ? (
                  <>
                    {/* Staff Profile Details Card */}
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                        <div className="flex items-center gap-2">
                          <User className="w-5 h-5 text-emerald-600" />
                          <div>
                            <h3 className="text-base font-bold text-slate-900">Staff Profile Details</h3>
                            <p className="text-xs text-slate-500">Editing credentials for {selectedStaff.name}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                          Active Account
                        </span>
                      </div>

                      <form onSubmit={handleSaveStaffProfile} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Full Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={staffEditForm.name}
                            onChange={(e) => setStaffEditForm(f => ({ ...f, name: e.target.value }))}
                            required
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            placeholder="e.g. Rahul Sharma"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Mobile Number (Login ID) <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">+91</span>
                              <input
                                type="tel"
                                maxLength="10"
                                value={staffEditForm.phone}
                                onChange={(e) => setStaffEditForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                                required
                                className="w-full pl-11 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                placeholder="10 digit mobile"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Email Address (Optional)
                            </label>
                            <input
                              type="email"
                              value={staffEditForm.email}
                              onChange={(e) => setStaffEditForm(f => ({ ...f, email: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              placeholder="staff@ecogreensolar.co.in"
                            />
                          </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={memberSavingLoading}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                          >
                            {memberSavingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>Save Staff Profile</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Reset Staff Password Card */}
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                        <div className="flex items-center gap-2">
                          <Key className="w-5 h-5 text-emerald-600" />
                          <div>
                            <h3 className="text-base font-bold text-slate-900">Reset Staff Password</h3>
                            <p className="text-xs text-slate-500">Set a new login password for {selectedStaff.name}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={generateMemberPassword}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Generate Password</span>
                        </button>
                      </div>

                      <form onSubmit={handleResetStaffPassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            New Password <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showMemberPassword ? 'text' : 'password'}
                              value={memberNewPassword}
                              onChange={(e) => setMemberNewPassword(e.target.value)}
                              required
                              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              placeholder="Enter or generate new password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowMemberPassword(!showMemberPassword)}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                            >
                              {showMemberPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            onClick={() => handleCopyStaffCredentials(selectedStaff)}
                            className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Credentials</span>
                          </button>

                          <button
                            type="submit"
                            disabled={memberPasswordLoading}
                            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                          >
                            {memberPasswordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            <span>Reset Staff Password</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Quick Share Credentials Card */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" /> Dispatch Login Credentials
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyStaffCredentials(selectedStaff)}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy WhatsApp Text</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-1 text-slate-300">
                        <p><span className="text-slate-400">Name:</span> {selectedStaff.name}</p>
                        <p><span className="text-slate-400">Username / Phone:</span> {selectedStaff.phone}</p>
                        <p><span className="text-slate-400">Role:</span> Support Staff</p>
                        <p><span className="text-slate-400">Portal:</span> https://complain.ecogreensolar.co.in/login</p>
                      </div>
                    </div>

                    {/* Danger Zone: Delete Staff */}
                    <div className="bg-rose-50/60 rounded-3xl p-5 border border-rose-200 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-rose-900">Remove Staff Account</h4>
                        <p className="text-[11px] text-rose-700/80">Revokes portal access immediately for this staff member.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStaff(selectedStaff)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Staff</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-slate-700">No Staff Member Selected</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Select a staff member from the left directory to view profile details, reset password, or copy login credentials.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* VIEW C: FIELD TECHNICIAN ACCOUNTS                             */}
          {/* ------------------------------------------------------------- */}
          {accountRole === 'technician' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
              {/* Left Column: Technician Directory List */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-emerald-600" />
                      <span>Field Service Technicians</span>
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {filteredTechList.length} Registered
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={accountSearchQuery}
                      onChange={(e) => setAccountSearchQuery(e.target.value)}
                      placeholder="Search technician name or phone..."
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Technician List */}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {accountsLoading ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading technician accounts...</div>
                    ) : filteredTechList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        {accountSearchQuery ? 'No matching technicians found.' : 'No technician accounts configured yet.'}
                      </div>
                    ) : (
                      filteredTechList.map((tech) => {
                        const isSelected = selectedTech && String(selectedTech.id) === String(tech.id);
                        return (
                          <div
                            key={tech.id}
                            onClick={() => setSelectedTech(tech)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-emerald-50/80 border-emerald-500 shadow-xs'
                                : 'bg-slate-50/60 hover:bg-slate-100/80 border-slate-200/80'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {tech.name?.charAt(0)?.toUpperCase() || 'T'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{tech.name}</p>
                                <p className="text-[11px] font-mono text-slate-500 truncate">+91 {tech.phone}</p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 block">
                                ₹{tech.daily_voucher_rate || 400}/day
                              </span>
                              <span className={`text-[10px] font-semibold mt-0.5 block ${
                                tech.is_available !== false ? 'text-emerald-600' : 'text-slate-400'
                              }`}>
                                {tech.is_available !== false ? 'Available' : 'Busy'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Selected Technician Details & Password Reset */}
              <div className="lg:col-span-7 space-y-6">
                {selectedTech ? (
                  <>
                    {/* Technician Profile Details Card */}
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-5 h-5 text-emerald-600" />
                          <div>
                            <h3 className="text-base font-bold text-slate-900">Technician Profile &amp; Rates</h3>
                            <p className="text-xs text-slate-500">Managing parameters for {selectedTech.name}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                          Field Technician
                        </span>
                      </div>

                      <form onSubmit={handleSaveTechProfile} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Full Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={techEditForm.name}
                            onChange={(e) => setTechEditForm(f => ({ ...f, name: e.target.value }))}
                            required
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            placeholder="e.g. Ramesh Patel"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Mobile Number (Login ID) <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">+91</span>
                              <input
                                type="tel"
                                maxLength="10"
                                value={techEditForm.phone}
                                onChange={(e) => setTechEditForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                                required
                                className="w-full pl-11 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                placeholder="10 digit mobile"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Email Address (Optional)
                            </label>
                            <input
                              type="email"
                              value={techEditForm.email}
                              onChange={(e) => setTechEditForm(f => ({ ...f, email: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              placeholder="tech@ecogreensolar.co.in"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Daily Tour Voucher Rate (₹)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="50"
                                value={techEditForm.daily_voucher_rate}
                                onChange={(e) => setTechEditForm(f => ({ ...f, daily_voucher_rate: e.target.value }))}
                                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                placeholder="400"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Specialization / Service Area
                            </label>
                            <input
                              type="text"
                              value={techEditForm.specialization}
                              onChange={(e) => setTechEditForm(f => ({ ...f, specialization: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              placeholder="e.g. Inverter Specialist, Rajkot"
                            />
                          </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={memberSavingLoading}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                          >
                            {memberSavingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>Save Technician Details</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Reset Technician Password Card */}
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                        <div className="flex items-center gap-2">
                          <Key className="w-5 h-5 text-emerald-600" />
                          <div>
                            <h3 className="text-base font-bold text-slate-900">Reset Technician Password</h3>
                            <p className="text-xs text-slate-500">Set a new mobile portal password for {selectedTech.name}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={generateMemberPassword}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Generate Password</span>
                        </button>
                      </div>

                      <form onSubmit={handleResetTechPassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            New Password <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showMemberPassword ? 'text' : 'password'}
                              value={memberNewPassword}
                              onChange={(e) => setMemberNewPassword(e.target.value)}
                              required
                              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              placeholder="Enter or generate new password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowMemberPassword(!showMemberPassword)}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                            >
                              {showMemberPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            onClick={() => handleCopyTechCredentials(selectedTech)}
                            className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Credentials</span>
                          </button>

                          <button
                            type="submit"
                            disabled={memberPasswordLoading}
                            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                          >
                            {memberPasswordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            <span>Reset Technician Password</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Quick Share Credentials Card */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" /> Dispatch Login Credentials
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyTechCredentials(selectedTech)}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy WhatsApp Text</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-1 text-slate-300">
                        <p><span className="text-slate-400">Technician:</span> {selectedTech.name}</p>
                        <p><span className="text-slate-400">Mobile / Login ID:</span> {selectedTech.phone}</p>
                        <p><span className="text-slate-400">Daily Voucher Rate:</span> ₹{selectedTech.daily_voucher_rate || 400}/day</p>
                        <p><span className="text-slate-400">Mobile Portal:</span> https://complain.ecogreensolar.co.in/login</p>
                      </div>
                    </div>

                    {/* Danger Zone: Delete Technician */}
                    <div className="bg-rose-50/60 rounded-3xl p-5 border border-rose-200 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-rose-900">Remove Technician Account</h4>
                        <p className="text-[11px] text-rose-700/80">Revokes mobile technician field app access immediately.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteTechnicianAccount(selectedTech)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Technician</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
                    <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-slate-700">No Technician Selected</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Select a field technician from the left directory to view profile details, update voucher rates, or reset login passwords.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Account Modal */}
          {isAddAccountModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                      {addAccountRole === 'staff' ? <Users className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Create New {addAccountRole === 'staff' ? 'Staff Member' : 'Technician'}
                      </h3>
                      <p className="text-xs text-slate-500">Configure login credentials and permissions</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddAccountModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={addAccountForm.name}
                      onChange={(e) => setAddAccountForm(f => ({ ...f, name: e.target.value }))}
                      required
                      placeholder="e.g. Ramesh Patel"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">+91</span>
                        <input
                          type="tel"
                          maxLength="10"
                          value={addAccountForm.phone}
                          onChange={(e) => setAddAccountForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                          required
                          placeholder="10 digits"
                          className="w-full pl-10 pr-2 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Account Role
                      </label>
                      <select
                        value={addAccountRole}
                        onChange={(e) => setAddAccountRole(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="staff">Support Staff</option>
                        <option value="technician">Field Technician</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={addAccountForm.email}
                      onChange={(e) => setAddAccountForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@ecogreensolar.co.in"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {addAccountRole === 'technician' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Daily Voucher Rate (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={addAccountForm.daily_voucher_rate}
                          onChange={(e) => setAddAccountForm(f => ({ ...f, daily_voucher_rate: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Specialization
                        </label>
                        <input
                          type="text"
                          value={addAccountForm.specialization}
                          onChange={(e) => setAddAccountForm(f => ({ ...f, specialization: e.target.value }))}
                          placeholder="e.g. Rooftop Inverters"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Initial Login Password <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={generateAddAccountPassword}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                      >
                        Regenerate
                      </button>
                    </div>
                    <input
                      type="text"
                      value={addAccountForm.password}
                      onChange={(e) => setAddAccountForm(f => ({ ...f, password: e.target.value }))}
                      required
                      placeholder="Initial password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsAddAccountModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addAccountLoading}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    >
                      {addAccountLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Create Account</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: TEMPLATE SETTINGS */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div className="animate-in fade-in duration-200">
          <TemplateManager />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: ITEMS & CATEGORY */}
      {/* ========================================================================= */}
      {activeTab === 'items_category' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Section 1: Tour Expense Categories */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-600" />
                  <span>Tour & Field Expense Particular Categories</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  These categories appear in technician tour expense logging and print on physical voucher slips.
                </p>
              </div>

              {/* Add Custom Expense Category Form */}
              <form onSubmit={handleAddExpenseCategory} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  placeholder="New category name..."
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {expenseCategories.map((cat, idx) => {
                return (
                  <div 
                    key={idx + '_' + cat}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 hover:border-emerald-300 transition-colors"
                  >
                    {editingExpenseIndex === idx ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={editingExpenseValue}
                          onChange={(e) => setEditingExpenseValue(e.target.value)}
                          className="flex-1 bg-white border border-emerald-500 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditExpense(idx)}
                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingExpenseIndex(null)}
                          className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate">{cat}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExpenseIndex(idx);
                              setEditingExpenseValue(cat);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Edit category"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveExpenseCategory(cat)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Product & Equipment Categories */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
            <div className="pb-4 border-b border-slate-100 mb-5">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <span>Service Product & Equipment Categories</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Standard equipment lines serviced by Eco Green Solar engineering & technician teams.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PRODUCT_EQUIPMENT_TYPES.map((prod) => (
                <div 
                  key={prod.id}
                  onClick={() => setSelectedProductView(prod.name)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer text-left ${
                    selectedProductView === prod.name
                      ? 'bg-emerald-50/50 border-emerald-500 shadow-xs ring-1 ring-emerald-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {prod.tag}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {prod.faultsCount} Diagnostics
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{prod.name}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{prod.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Diagnostic Fault Categories for Selected Product */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
            <div className="pb-4 border-b border-slate-100 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span>Diagnostic Fault Categories — {selectedProductView}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Standard issue diagnostics selectable during ticket registration and field reporting.
                </p>
              </div>

              {/* Add Custom Diagnostic Fault Form */}
              <form onSubmit={handleAddDiagnostic} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newDiagnosticInput}
                  onChange={(e) => setNewDiagnosticInput(e.target.value)}
                  placeholder={`New diagnostic for ${selectedProductView}...`}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(diagnosticsMap[selectedProductView] || []).map((fault, fIdx) => (
                <div 
                  key={fIdx + '_' + fault}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 flex items-center justify-between gap-2 hover:border-emerald-300 transition-colors"
                >
                  {editingDiagIndex === fIdx ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        value={editingDiagValue}
                        onChange={(e) => setEditingDiagValue(e.target.value)}
                        className="flex-1 bg-white border border-emerald-500 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditDiagnostic(fIdx)}
                        className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                        title="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDiagIndex(null)}
                        className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {fIdx + 1}
                        </span>
                        <span className="leading-snug truncate">{fault}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDiagIndex(fIdx);
                            setEditingDiagValue(fault);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="Edit diagnostic"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiagnostic(fault)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete diagnostic"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: VOUCHER SETTINGS */}
      {/* ========================================================================= */}
      {activeTab === 'voucher' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Configuration Form */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-5">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Voucher Sequence & Series</h3>
                    <p className="text-xs text-slate-500">Configure starting number and series for tour vouchers</p>
                  </div>
                </div>

                <form onSubmit={handleSaveVoucherSettings} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Voucher Prefix Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={voucherSettings.prefix}
                      onChange={(e) => setVoucherSettings({ ...voucherSettings, prefix: e.target.value.toUpperCase() })}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="e.g. TT-"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Default: TT- (Technician Tour Voucher)</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Starting Sequence Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={voucherSettings.starting_number}
                      onChange={(e) => setVoucherSettings({ ...voucherSettings, starting_number: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="e.g. 1001 or 341"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      New vouchers generated by the system will begin allocating from this number.
                    </p>
                  </div>

                  {/* Next Voucher Preview Card */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Next Allotted Voucher No. Preview
                    </p>
                    <p className="text-2xl font-black font-mono text-emerald-800">
                      {(voucherSettings.prefix || 'TT-') + (voucherSettings.starting_number || 1001)}
                    </p>
                  </div>

                  {/* Formatting Rules Info */}
                  <div className="space-y-2 text-xs text-slate-600 bg-emerald-50/60 border border-emerald-200 p-4 rounded-2xl">
                    <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      Standard Physical Voucher Book Layout
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-900/90">
                      <li><b>City Printing:</b> Ticket city is automatically fetched and printed alongside Account and Ticket No.</li>
                      <li><b>Team Technicians:</b> Dual technician names (Primary + Secondary partner) display on the Name line.</li>
                      <li><b>2 Vouchers per Page:</b> Layout pairs 2 vouchers on single A4 sheet for physical binding.</li>
                    </ul>
                  </div>

                  <button
                    type="submit"
                    disabled={savingVoucher}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {savingVoucher ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Save Voucher Settings</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Physical Voucher Slip Preview */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">Physical Voucher Book Layout Preview</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                    A4 Half-Slip Mock
                  </span>
                </div>

                {/* Simulated Physical Voucher Card */}
                <div className="bg-white border-2 border-black p-4 font-sans text-slate-900 shadow-sm">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 pb-2 mb-2 border-b border-slate-200">
                    <div className="col-span-3 flex items-center justify-start">
                      <span className="font-black text-xl tracking-tight text-emerald-700">Green</span>
                      <span className="font-light text-xs text-slate-500 uppercase tracking-widest ml-1">ENERGY</span>
                    </div>
                    <div className="col-span-6 text-[9px] text-slate-800 leading-snug border-l-[1.5px] border-slate-300 pl-3">
                      <p className="font-semibold text-slate-900">Plot No. 4, Gajanand Industrial, Near RK Exotica,</p>
                      <p>Raven Survey No. 183, Vill. - Chhapra, Lodhika-360021</p>
                    </div>
                    <div className="col-span-3 text-right text-xs leading-snug">
                      <p className="font-bold text-slate-900">
                        Voucher No : <span className="font-mono text-teal-700 font-black">{(voucherSettings.prefix || 'TT-') + (voucherSettings.starting_number || 1001)}</span>
                      </p>
                      <p className="text-[10px] text-slate-800 mt-0.5 font-medium">
                        Date : <span className="font-mono font-bold text-slate-900">04 Oct 2026</span>
                      </p>
                    </div>
                  </div>

                  {/* Name with Team Support */}
                  <div className="text-[10px] mb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-900 shrink-0">Name :</span>
                      <span className="font-bold text-slate-900">
                        TEST - TECH (8306683067), HARDEV VAGHELA (9876543210)
                      </span>
                    </div>

                    <div className="border-b border-dashed border-slate-400 my-1.5" />

                    {/* Account, Ticket No, and City */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-900 shrink-0">Account :</span>
                        <span className="font-bold text-slate-900 uppercase tracking-wide">
                          TECHNICIAN TOUR EXPENSES
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 text-[10px]">
                        <span className="font-bold text-slate-900">Ticket No :</span>
                        <span className="font-mono font-bold text-blue-900">EGS-2026-000101</span>
                      </div>
                      <div className="flex items-baseline gap-1 text-[10px]">
                        <span className="font-bold text-slate-900">City :</span>
                        <span className="font-mono font-bold text-teal-800 uppercase">BHAYAVADAR</span>
                      </div>
                    </div>
                  </div>

                  {/* Particulars & Amount Table */}
                  <div className="border-[1.5px] border-black mb-2 text-[10px]">
                    <div className="grid grid-cols-12 bg-slate-50 border-b-[1.5px] border-black font-bold text-center">
                      <div className="col-span-9 p-1 border-r-[1.5px] border-black uppercase text-[9.5px]">Particulars</div>
                      <div className="col-span-3 p-1 uppercase text-[9.5px]">Amount</div>
                    </div>
                    <div className="divide-y divide-slate-200">
                      <div className="grid grid-cols-12 min-h-[19px] items-center">
                        <div className="col-span-9 px-2 py-0.5 border-r-[1.5px] border-black text-slate-800">
                          Customer Site Material (Customer Site Material Expense)
                        </div>
                        <div className="col-span-3 px-2 py-0.5 text-right font-bold text-slate-900 font-mono">
                          ₹1000.00
                        </div>
                      </div>
                      <div className="grid grid-cols-12 min-h-[19px] items-center">
                        <div className="col-span-9 px-2 py-0.5 border-r-[1.5px] border-black text-slate-800">
                          Toll & Parking (Toll & Parking Expense)
                        </div>
                        <div className="col-span-3 px-2 py-0.5 text-right font-bold text-slate-900 font-mono">
                          ₹560.00
                        </div>
                      </div>
                      <div className="grid grid-cols-12 min-h-[19px] items-center">
                        <div className="col-span-9 px-2 py-0.5 border-r-[1.5px] border-black text-slate-800">
                          Bus / Train Fare (Bus / Train Fare Expense)
                        </div>
                        <div className="col-span-3 px-2 py-0.5 text-right font-bold text-slate-900 font-mono">
                          ₹500.00
                        </div>
                      </div>
                    </div>
                    {/* Total Row */}
                    <div className="grid grid-cols-12 bg-slate-50 border-t-[1.5px] border-black font-bold items-center py-1">
                      <div className="col-span-9 px-2 text-right border-r-[1.5px] border-black uppercase text-[9.5px]">
                        TOTAL:
                      </div>
                      <div className="col-span-3 px-2 text-right text-emerald-800 font-mono font-black text-xs">
                        ₹2060.00
                      </div>
                    </div>
                  </div>

                  {/* Amount in Word */}
                  <div className="text-[10px] mb-3">
                    <span className="font-bold text-slate-900">Amount in Word : </span>
                    <span className="font-serif italic font-bold border-b border-dashed border-slate-500 pb-0.5">
                      Two Thousand Sixty Rupees Only
                    </span>
                  </div>

                  {/* Signatures */}
                  <div className="pt-2">
                    <div className="text-center mb-4">
                      <span className="text-[9.5px] font-bold text-emerald-800 uppercase block">APPROVED BY</span>
                      <span className="text-[9.5px] font-bold text-slate-900">(SUMIT CHAUHAN)</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-[9px] text-slate-700 border-t border-slate-400 pt-1 font-semibold">
                      <div>Authorized Signature</div>
                      <div>Checked by</div>
                      <div>Paid by</div>
                      <div>Receiver's Signature</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
