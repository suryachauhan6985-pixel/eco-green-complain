import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { 
  Users, Wrench, Plus, Trash2, CheckCircle2, XCircle, 
  Phone, Mail, MapPin, Award, Star, Shield, RefreshCw, X, Edit3, IndianRupee,
  Layers, Tag, Key
} from 'lucide-react';
import { useDialog } from '../../context/DialogContext';

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
    role: 'staff',
    password: ''
  });

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
      role: member.role || 'staff',
      password: ''
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (member, role) => {
    openEditModal(member, role === 'technician');
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
      if (editFormData.password && editFormData.password.trim()) {
        payload.password = editFormData.password.trim();
      }

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
      await api.createUser({
        ...formData,
        username: formData.username.trim().toLowerCase(),
        email: formData.email?.trim() || undefined
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

  const staffUsers = Array.isArray(users) 
    ? users.filter(u => u && (u.role === 'staff' || u.role === 'admin')) 
    : [];

  const editType = editingMember?.isTech ? 'technician' : 'staff';

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

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold">
            <button
              onClick={() => setActiveTab('technicians')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'staff'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Office Staff ({(staffUsers || []).length})</span>
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
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
              onClick={() => setIsAddModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
          Loading team members...
        </div>
      ) : activeTab === 'technicians' ? (
        /* Technicians 2-Column Grid */
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
      ) : activeTab === 'staff' ? (
        /* Staff Users 2-Column Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {(staffUsers || []).map((u) => (
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
                        {u.role === 'admin' && (
                          <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-bold uppercase">
                            Admin
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] font-mono text-blue-700 font-semibold">
                        ID: @{u.username || u.email?.split('@')[0]}
                      </p>
                    </div>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                    {u.role}
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
                  onClick={() => handleOpenEdit(u, 'staff')}
                  className="text-slate-700 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 border border-slate-200 transition-colors flex items-center gap-1 text-[11px] font-semibold"
                  title="Edit Staff Member"
                >
                  <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Edit</span>
                </button>

                {u.role !== 'admin' && (
                  <button
                    onClick={() => handleDeleteUser(u.id, u.name)}
                    className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1 text-[11px]"
                    title="Remove Staff"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
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
                Add New Staff or Technician
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Login Password <span className="text-slate-400 font-normal">(leave blank to keep existing)</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter new password to change (optional)"
                  value={editFormData.password}
                  onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
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
    </div>
  );
};
