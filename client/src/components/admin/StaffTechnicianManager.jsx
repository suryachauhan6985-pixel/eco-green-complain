import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { 
  Users, Wrench, Plus, Trash2, CheckCircle2, XCircle, 
  Phone, Mail, MapPin, Award, Star, Shield, RefreshCw, X, Edit3, IndianRupee,
  Layers, Tag, Key, Lock, Eye, EyeOff, Copy, Check, Sparkles
} from 'lucide-react';
import { useDialog } from '../../context/DialogContext';
import { StaffTeamSkeleton } from '../common/SkeletonLoader';

export const StaffTechnicianManager = () => {
  const { confirm, alert, showToast: showGlobalToast } = useDialog();
  const [activeTab, setActiveTab] = useState('technicians'); // 'technicians' | 'staff' | 'catalog'
  const [technicians, setTechnicians] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  // Product & Category Management State
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedProductForCat, setSelectedProductForCat] = useState('Solar Rooftop Systems');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [addingProd, setAddingProd] = useState(false);

  // Edit Member Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    username: '',
    phone: '',
    email: '',
    role: 'staff'
  });

  // Dedicated Professional Password Reset Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetMember, setResetMember] = useState(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [resetLoading, setResetLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Add Form State
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'technician'
  });

  useEffect(() => {
    loadData();
    loadCatalog();
  }, []);

  const openEditModal = (member, isTech = false) => {
    setEditingMember({ ...member, isTech });
    const cleanEmail = member.email && member.email.endsWith('.internal') ? '' : (member.email || '');
    setEditFormData({
      name: member.name || '',
      username: member.username || (member.email ? member.email.split('@')[0] : ''),
      phone: member.phone || '',
      email: cleanEmail,
      role: member.role || 'staff'
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (member, role) => {
    openEditModal(member, role === 'technician');
  };

  const generateRandomPassword = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const prefixes = ['Eco', 'Solar', 'Green', 'Tech', 'Power', 'Sun'];
    const symbols = ['@', '#', '$', '!'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    setResetNewPassword(`${randomPrefix}${randomSymbol}${randomNum}`);
  };

  const handleOpenPasswordReset = (member, isTech = false) => {
    setResetMember({ ...member, isTech });
    generateRandomPassword();
    setShowPassword(true);
    setCopyFeedback(false);
    setIsResetModalOpen(true);
  };

  const handleCopyCredentials = () => {
    const username = resetMember?.username || (resetMember?.email ? resetMember.email.split('@')[0] : 'user');
    const roleName = resetMember?.isTech ? 'Field Technician' : (resetMember?.role === 'admin' ? 'Admin Supervisor' : 'Support Staff');
    const text = `🌿 *Eco Green Solar CMS Login Credentials*\n👤 *Member:* ${resetMember?.name}\n🏷️ *Role:* ${roleName}\n🔑 *User ID / Username:* ${username}\n🔒 *New Password:* ${resetNewPassword}\n🌐 *Login Portal:* https://complain.ecogreensolar.co.in/login\n\nPlease keep your credentials safe and do not share them.`;
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
    showGlobalToast('Login credentials copied to clipboard for sharing!', 'success');
  };

  const handleConfirmPasswordReset = async (e) => {
    e.preventDefault();
    if (!resetNewPassword || resetNewPassword.trim().length < 4) {
      showGlobalToast('Password must be at least 4 characters long', 'error');
      return;
    }
    try {
      setResetLoading(true);
      const payload = {
        newPassword: resetNewPassword.trim()
      };
      if (resetMember?.isTech) {
        payload.technicianId = resetMember.id;
        if (resetMember.user_id) payload.userId = resetMember.user_id;
      } else {
        payload.userId = resetMember.id;
      }
      const res = await api.adminResetPassword(payload);
      showToast(res?.message || `Password securely reset for ${resetMember.name}!`);
      setIsResetModalOpen(false);
      setResetMember(null);
      loadData();
    } catch (err) {
      showGlobalToast('Failed to reset password: ' + err.message, 'error');
    } finally {
      setResetLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editFormData.username?.trim()) {
      showGlobalToast('User ID / Username is required', 'error');
      return;
    }
    try {
      const payload = {
        name: editFormData.name,
        username: editFormData.username.trim().toLowerCase(),
        phone: editFormData.phone,
        email: editFormData.email?.trim() || undefined
      };

      if (editingMember?.isTech) {
        await api.updateTechnician(editingMember.id, payload);
        showToast(`Technician ${editFormData.name} updated successfully!`);
      } else {
        payload.role = editFormData.role;
        await api.updateUser(editingMember.id, payload);
        showToast(`Staff member ${editFormData.name} updated successfully!`);
      }
      setIsEditModalOpen(false);
      setEditingMember(null);
      loadData();
    } catch (err) {
      showGlobalToast('Failed to update member: ' + err.message, 'error');
    }
  };

  const loadCatalog = async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        api.getProducts().catch(() => ({ products: [] })),
        api.getCategories().catch(() => ({ categories: [] }))
      ]);
      const fetchedProducts = prodRes.products || [];
      setProducts(fetchedProducts);
      setCategories(catRes.categories || []);
      if (fetchedProducts.length > 0 && !selectedProductForCat) {
        setSelectedProductForCat(fetchedProducts[0].name);
      }
    } catch (e) {
      console.warn('Error loading catalog:', e);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setAddingCat(true);
      await api.addCategory({
        product_type: selectedProductForCat,
        category_name: newCatName.trim()
      });
      setNewCatName('');
      showToast(`Category "${newCatName.trim()}" added to ${selectedProductForCat}!`);
      await loadCatalog();
    } catch (err) {
      showGlobalToast('Failed to add category: ' + err.message, 'error');
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = async (id, name) => {
    const ok = await confirm({
      title: 'Delete Category',
      message: `Are you sure you want to delete issue category "${name}"? Existing complaints will retain their records.`,
      type: 'danger',
      confirmText: 'Delete Category'
    });
    if (!ok) return;

    try {
      await api.deleteCategory(id);
      showToast(`Category "${name}" removed`);
      await loadCatalog();
    } catch (err) {
      showGlobalToast('Failed to delete category: ' + err.message, 'error');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProdName.trim()) return;
    try {
      setAddingProd(true);
      await api.addProduct({
        name: newProdName.trim(),
        description: newProdDesc.trim() || undefined
      });
      setNewProdName('');
      setNewProdDesc('');
      showToast(`Product "${newProdName.trim()}" added to catalog!`);
      await loadCatalog();
    } catch (err) {
      showGlobalToast('Failed to add product: ' + err.message, 'error');
    } finally {
      setAddingProd(false);
    }
  };

  const handleDeleteProduct = async (id, name) => {
    const ok = await confirm({
      title: 'Delete Product',
      message: `Are you sure you want to delete product "${name}" from catalog?`,
      type: 'danger',
      confirmText: 'Delete Product'
    });
    if (!ok) return;

    try {
      await api.deleteProduct(id);
      showToast(`Product "${name}" deleted`);
      await loadCatalog();
    } catch (err) {
      showGlobalToast('Failed to delete product: ' + err.message, 'error');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [techRes, usersRes] = await Promise.all([
        api.getTechnicians().catch(e => { console.warn('Tech load error:', e); return []; }),
        api.getUsers().catch(e => { console.warn('Users load error:', e); return []; })
      ]);
      const techList = Array.isArray(techRes?.technicians) 
        ? techRes.technicians 
        : (Array.isArray(techRes) ? techRes : []);
      const userList = Array.isArray(usersRes?.users) 
        ? usersRes.users 
        : (Array.isArray(usersRes) ? usersRes : []);
      setTechnicians(techList);
      setUsers(userList);
    } catch (err) {
      console.error('Failed to load team data:', err);
      setTechnicians([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAvailability = async (tech) => {
    try {
      await api.updateTechnicianStatus(tech.id, !tech.is_available);
      showToast('Technician availability updated');
      loadData();
    } catch (err) {
      showGlobalToast('Failed to update availability: ' + err.message, 'error');
    }
  };

  const handleDeleteTechnician = async (id, name) => {
    const ok = await confirm({
      title: 'Remove Technician',
      message: `Are you sure you want to remove technician "${name}"?`,
      type: 'danger',
      confirmText: 'Remove Technician'
    });
    if (!ok) return;

    try {
      await api.deleteTechnician(id);
      showToast(`Technician ${name} removed`);
      loadData();
    } catch (err) {
      showGlobalToast('Failed to delete technician: ' + err.message, 'error');
    }
  };

  const handleDeleteUser = async (id, name) => {
    const ok = await confirm({
      title: 'Remove Staff Member',
      message: `Are you sure you want to remove staff member "${name}"?`,
      type: 'danger',
      confirmText: 'Remove Staff'
    });
    if (!ok) return;

    try {
      await api.deleteUser(id);
      showToast(`Staff member ${name} removed`);
      loadData();
    } catch (err) {
      showGlobalToast('Failed to delete user: ' + err.message, 'error');
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username?.trim()) {
      showGlobalToast('User ID / Username is required', 'error');
      return;
    }
    if (!formData.password?.trim()) {
      showGlobalToast('Login Password is required', 'error');
      return;
    }
    try {
      const safeUsername = formData.username.trim().toLowerCase();
      const safeEmail = formData.email?.trim() 
        ? formData.email.trim() 
        : `${safeUsername.replace(/[^a-z0-9._-]/g, '.')}@ecogreensolar.internal`;

      await api.createUser({
        ...formData,
        username: safeUsername,
        email: safeEmail
      });
      showToast(`New ${formData.role} created successfully!`);
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        role: 'technician'
      });
      loadData();
    } catch (err) {
      showGlobalToast('Failed to add member: ' + err.message, 'error');
    }
  };

  const showToast = (msg) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(''), 3500);
  };

  const adminUsers = Array.isArray(users) 
    ? users.filter(u => u && u.role === 'admin') 
    : [];

  const staffUsers = Array.isArray(users) 
    ? users.filter(u => u && u.role === 'staff') 
    : [];

  const editType = editingMember?.isTech ? 'technician' : (editingMember?.role === 'admin' ? 'admin' : 'staff');

  return (
    <div className="space-y-4">
      {/* Toast */}
      {actionSuccess && (
        <div className="bg-emerald-800 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            Team Management (Staff & Technicians)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create user accounts, assign zones, manage field technicians, and control access permissions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('technicians')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'technicians'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-emerald-600" />
              <span>Technicians ({(technicians || []).length})</span>
            </button>

            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Office Staff ({(staffUsers || []).length})</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-white text-purple-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-purple-600" />
              <span>Administrators ({(adminUsers || []).length})</span>
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span>Catalog & Categories ({(products || []).length})</span>
            </button>
          </div>

          {/* Add Button */}
          {activeTab !== 'catalog' && (
            <button
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  role: activeTab === 'admin' ? 'admin' : (activeTab === 'staff' ? 'staff' : 'technician')
                }));
                setIsAddModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <StaffTeamSkeleton count={6} />
      ) : activeTab === 'technicians' ? (
        (technicians || []).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-2xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-2xs">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">No Field Technicians Registered Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                Add technicians to assign solar rooftop inspections, service complaints, and manage on-duty field teams.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, role: 'technician' }));
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add First Technician</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(technicians || []).map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-3 relative ${
                t.is_available ? 'bg-white border-slate-200' : 'bg-slate-50/90 border-dashed border-slate-300'
              }`}
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-sm ${
                      t.is_available ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-200 border-slate-300 text-slate-500'
                    }`}>
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{t.name}</span>
                        {!t.is_available && (
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded font-semibold">
                            Unavailable
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] font-mono text-emerald-700 font-semibold">
                        ID: @{t.username || t.email?.split('@')[0]}
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    t.is_available 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${t.is_available ? 'bg-emerald-600 animate-pulse' : 'bg-rose-500'}`} />
                    {t.is_available ? 'Active / On Duty' : 'Off Duty (On Leave)'}
                  </span>
                </div>

                {/* Details */}
                <div className="mt-3 space-y-1.5 text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50/90 px-2 py-1 rounded-md border border-emerald-200/60">
                    <Key className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>User ID: <span className="font-bold text-slate-900">{t.username || t.email?.split('@')[0]}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{t.phone || 'No phone set'}</span>
                  </div>
                  {t.email && !t.email.endsWith('.internal') && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{t.email}</span>
                    </div>
                  )}
                </div>

                {/* Off-duty dispatch note */}
                {!t.is_available && (
                  <div className="mt-2 text-[10px] text-rose-700 bg-rose-50 border border-rose-100 px-2 py-1 rounded-md font-medium">
                    ⚠️ Marked Off-Duty — Complaints desk will see warning during ticket dispatch
                  </div>
                )}

                {/* Cash Reconciliation Box */}
                <div className="mt-2.5 p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Total Customer Cash Collected:</span>
                    <strong className="font-mono text-slate-900">₹{t.total_collected || 0}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-700">Deposited to Company:</span>
                    <strong className="font-mono text-emerald-700">₹{t.total_settled_with_company || 0}</strong>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-amber-200 text-[11px] font-bold">
                    <span className={t.cash_in_hand_due > 0 ? "text-amber-900 font-extrabold flex items-center gap-1" : "text-slate-600"}>
                      <IndianRupee className="w-3 h-3 text-amber-600" /> Cash in Hand (Due to Co.):
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                      t.cash_in_hand_due > 0 ? 'bg-amber-200 text-amber-950 font-black' : 'bg-slate-100 text-slate-600'
                    }`}>
                      ₹{t.cash_in_hand_due || 0}
                    </span>
                  </div>
                </div>

                {/* Performance Stats */}
                <div className="grid grid-cols-3 gap-2 text-center mt-2 py-1.5 bg-slate-50/50 rounded-lg">
                  <div>
                    <span className="block text-xs font-bold text-amber-600">{t.active_tickets_count ?? 0}</span>
                    <span className="text-[10px] text-slate-400">Active</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-emerald-600">{t.resolved_tickets_count ?? 0}</span>
                    <span className="text-[10px] text-slate-400">Resolved</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 flex items-center justify-center gap-0.5">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {t.average_rating || '5.0'}
                    </span>
                    <span className="text-[10px] text-slate-400">Rating</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs gap-2">
                <button
                  onClick={() => handleToggleAvailability(t.id, t.is_available)}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                    t.is_available
                      ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                      : 'border-emerald-500 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 shadow-2xs'
                  }`}
                >
                  {t.is_available ? 'Mark Off-Duty' : '🟢 Mark On-Duty (Active)'}
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenPasswordReset(t, true)}
                    className="text-amber-800 hover:text-amber-900 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1 text-[11px] font-bold"
                    title="Reset Login Password"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    <span>Reset Key</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(t, 'technician')}
                    className="text-slate-700 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 border border-slate-200 transition-colors flex items-center gap-1 text-[11px] font-semibold"
                    title="Edit Technician"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleDeleteTechnician(t.id, t.name)}
                    className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1 text-[11px]"
                    title="Remove Technician"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
        )
      ) : activeTab === 'staff' ? (
        /* Office Staff Tab */
        (staffUsers || []).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-2xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100 shadow-2xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">No Office Staff Members Registered</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                Create front desk and support staff accounts to manage complaints, handle customer queries, and assign jobs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, role: 'staff' }));
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Office Staff</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {staffUsers.map((u) => (
              <div
                key={u.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{u.name}</span>
                        </h4>
                        <p className="text-[11px] font-mono text-blue-700 font-semibold">
                          ID: @{u.username || u.email?.split('@')[0]}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                      Support Staff
                    </span>
                  </div>

                  {/* Details */}
                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-800 bg-blue-50/90 px-2 py-1 rounded-md border border-blue-200/60">
                      <Key className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>User ID: <span className="font-bold text-slate-900">{u.username || u.email?.split('@')[0]}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{u.phone || 'No phone set'}</span>
                    </div>
                    {u.email && !u.email.endsWith('.internal') && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end pt-2 border-t border-slate-100 text-xs gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenPasswordReset(u, false)}
                    className="text-amber-800 hover:text-amber-900 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                    title="Reset Login Password"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    <span>Reset Key</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(u, 'staff')}
                    className="text-slate-700 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 border border-slate-200 transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                    title="Edit Staff Member"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleDeleteUser(u.id, u.name)}
                    className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                    title="Remove Staff"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'admin' ? (
        /* Administrators Tab */
        (adminUsers || []).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-2xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-100 shadow-2xs">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">No Administrators Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                Administrator accounts manage system security, user permissions, and master settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, role: 'admin' }));
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Administrator</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {adminUsers.map((u) => (
              <div
                key={u.id}
                className="bg-white rounded-xl border border-purple-200 p-4 shadow-2xs flex flex-col justify-between gap-3 relative"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-300 flex items-center justify-center text-purple-800 font-bold text-sm">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{u.name}</span>
                          <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold uppercase border border-purple-200">
                            Admin Supervisor
                          </span>
                        </h4>
                        <p className="text-[11px] font-mono text-purple-700 font-semibold">
                          ID: @{u.username || u.email?.split('@')[0]}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-purple-600" />
                      <span>Full Access</span>
                    </span>
                  </div>

                  {/* Details */}
                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 bg-purple-50/40 p-2.5 rounded-lg border border-purple-100/60">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-900 bg-white px-2 py-1 rounded-md border border-purple-200/60">
                      <Key className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>User ID: <span className="font-bold text-slate-900">{u.username || u.email?.split('@')[0]}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{u.phone || 'No phone set'}</span>
                    </div>
                    {u.email && !u.email.endsWith('.internal') && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-purple-100 text-xs gap-1.5">
                  <span className="text-[10px] text-slate-400 font-medium italic">
                    Primary Administrator
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPasswordReset(u, false)}
                      className="text-amber-800 hover:text-amber-900 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                      title="Reset Login Password"
                    >
                      <Key className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reset Key</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(u, 'admin')}
                      className="text-slate-700 hover:text-purple-700 px-2.5 py-1.5 rounded-lg hover:bg-purple-50 border border-slate-200 transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                      title="Edit Admin Member"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Catalog & Issue Categories Management Tab */
        <div className="space-y-6">
          {/* Section 1: Product Catalog Management */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Solar Product Catalog ({(products || []).length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage standard and custom solar equipment serviced by Eco Green Solar.
                </p>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
              {(products || []).map((p) => (
                <div key={p.id || p.name} className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col justify-between gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{p.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.description || 'No description'}</p>
                    </div>
                    {p.is_default ? (
                      <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded shrink-0">System</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id, p.name)}
                        className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition-colors shrink-0 cursor-pointer"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add Product Form */}
            <form onSubmit={handleAddProduct} className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <input
                type="text"
                required
                placeholder="New Product Name (e.g. Solar Batteries)"
                value={newProdName}
                onChange={e => setNewProdName(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                placeholder="Short Description (Optional)"
                value={newProdDesc}
                onChange={e => setNewProdDesc(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={addingProd || !newProdName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addingProd ? 'Adding...' : 'Add Product'}</span>
              </button>
            </form>
          </div>

          {/* Section 2: Issue Categories Management */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  Dynamic Complaint Issue Categories
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure the dropdown choices shown during complaint registration for each product.
                </p>
              </div>

              {/* Product Selector Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Product:</span>
                <select
                  value={selectedProductForCat}
                  onChange={e => setSelectedProductForCat(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  {(products || []).map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List of categories for the selected product */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Active Categories for <strong className="text-slate-800">{selectedProductForCat}</strong> ({(categories || []).filter(c => c.product_type === selectedProductForCat).length})</span>
                <span>Actions</span>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 max-h-80 overflow-y-auto">
                {(categories || []).filter(c => c.product_type === selectedProductForCat).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No custom categories defined for this product. Default system list applies.
                  </div>
                ) : (
                  (categories || [])
                    .filter(c => c.product_type === selectedProductForCat)
                    .map((cat) => (
                      <div key={cat.id} className="p-3 flex items-center justify-between gap-2 hover:bg-white transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-slate-800 truncate">{cat.category_name}</span>
                          {cat.is_default ? (
                            <span className="text-[9px] font-semibold text-slate-500 bg-slate-200/70 px-1.5 py-0.2 rounded">Default</span>
                          ) : (
                            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">Custom</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id, cat.category_name)}
                          className="text-rose-500 hover:text-rose-700 p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Add Category Form */}
            <form onSubmit={handleAddCategory} className="pt-2 flex flex-col sm:flex-row items-center gap-2 text-xs">
              <input
                type="text"
                required
                placeholder={`Add new defect category for ${selectedProductForCat}...`}
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="flex-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={addingCat || !newCatName.trim()}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addingCat ? 'Adding...' : 'Add Category'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                Add New Member
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                >
                  <option value="technician">Field Technician (Mobile & On-Site Visits)</option>
                  <option value="staff">Support Staff / Front Desk (Tickets & Assign)</option>
                  <option value="admin">Administrator / Supervisor (Full System Control)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">User ID / Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ramesh, tech01"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="6352454247"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Login Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Enter login password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="Optional (leave blank if not using email)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                Edit {editType === 'technician' ? 'Technician' : 'Staff Member'}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-3 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">User ID / Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ramesh, tech01"
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="Optional (leave blank if not using email)"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
              </div>

              {editType !== 'technician' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Access Role</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  >
                    <option value="staff">Support Staff (Ticket Management)</option>
                    <option value="admin">Admin Supervisor (Full Access)</option>
                  </select>
                </div>
              )}

              {/* Account Security & Password Reset Panel */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900">Account Access & Security</h5>
                      <p className="text-[10px] text-slate-500">
                        Login User ID: <span className="font-mono font-bold text-slate-800">@{editFormData.username}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                    Encrypted
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Passwords are encrypted with bcrypt for high enterprise security. To change or reset credentials, use the dedicated professional reset tool.
                </p>
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      handleOpenPasswordReset(editingMember, editingMember?.isTech);
                    }}
                    className="w-full px-3 py-2 bg-white hover:bg-amber-50/70 border border-amber-300 text-amber-900 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-98"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    <span>Reset Account Password</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                >
                  Update Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= DEDICATED PROFESSIONAL PASSWORD RESET MODAL ================= */}
      {isResetModalOpen && resetMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                    <span>Reset Login Password</span>
                    <span className="text-[10px] bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-amber-400/30">
                      Security
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Eco Green Solar CMS Authentication Control
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetMember(null);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Account Summary Banner */}
            <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-sm flex items-center justify-center shrink-0">
                  {resetMember.name?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 truncate">
                    {resetMember.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    User ID: <span className="font-bold text-emerald-700">@{resetMember.username || resetMember.email?.split('@')[0]}</span>
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300 shrink-0">
                {resetMember.isTech ? 'Technician' : (resetMember.role || 'Staff')}
              </span>
            </div>

            {/* Form Body */}
            <form onSubmit={handleConfirmPasswordReset} className="p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>New Password *</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 hover:underline active:scale-95"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Auto-Generate Strong</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:bg-white rounded-xl py-2.5 pl-3 pr-10 text-xs font-mono font-semibold tracking-wider text-slate-900 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Must be at least 4 characters. Recommended format: Word + Symbol + Numbers (e.g. Eco@7829)
                </p>
              </div>

              {/* Quick Copy Credentials for WhatsApp */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between gap-2">
                <div className="text-[11px] text-emerald-950 min-w-0">
                  <span className="font-bold block">Share with Member</span>
                  <span className="text-[10px] text-emerald-700 block truncate">
                    Copy pre-formatted WhatsApp login credentials
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-2xs ${
                    copyFeedback 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {copyFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Info</span>
                    </>
                  )}
                </button>
              </div>

              {/* Security Audit Warning */}
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-start gap-2">
                <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-tight">
                  Updating will immediately overwrite the current password in the secure database. The previous password will stop working instantly.
                </span>
              </div>

              {/* Footer Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setResetMember(null);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {resetLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save New Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
