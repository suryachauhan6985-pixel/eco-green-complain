import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { 
  Users, Wrench, Plus, Trash2, CheckCircle2, XCircle, 
  Phone, Mail, MapPin, Award, Star, Shield, RefreshCw, X 
} from 'lucide-react';

export const StaffTechnicianManager = () => {
  const [activeTab, setActiveTab] = useState('technicians'); // 'technicians' | 'staff'
  const [technicians, setTechnicians] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'technician',
    area_zone: 'North Zone (Indiranagar / Hebbal)',
    specialization: 'Solar Rooftop Systems'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [techRes, usersRes] = await Promise.all([
        api.getTechnicians(),
        api.getUsers().catch(() => ({ users: [] }))
      ]);
      setTechnicians(techRes.technicians || []);
      setUsers(usersRes.users || []);
    } catch (err) {
      console.error('Error loading staff/technicians:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleAvailability = async (id, currentStatus) => {
    try {
      await api.updateTechnicianAvailability(id, !currentStatus);
      showToast('Technician availability updated');
      loadData();
    } catch (err) {
      alert('Failed to update availability: ' + err.message);
    }
  };

  const handleDeleteTechnician = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove technician "${name}"?`)) return;
    try {
      await api.deleteTechnician(id);
      showToast(`Technician ${name} removed`);
      loadData();
    } catch (err) {
      alert('Failed to delete technician: ' + err.message);
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove staff member "${name}"?`)) return;
    try {
      await api.deleteUser(id);
      showToast(`Staff member ${name} removed`);
      loadData();
    } catch (err) {
      alert('Failed to delete user: ' + err.message);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(formData);
      showToast(`New ${formData.role} created successfully!`);
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'technician',
        area_zone: 'North Zone (Indiranagar / Hebbal)',
        specialization: 'Solar Rooftop Systems'
      });
      loadData();
    } catch (err) {
      alert('Failed to add member: ' + err.message);
    }
  };

  const showToast = (msg) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(''), 3500);
  };

  const staffUsers = users.filter(u => u.role === 'staff' || u.role === 'admin');

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
              <span>Technicians ({technicians.length})</span>
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
              <span>Office Staff ({staffUsers.length})</span>
            </button>
          </div>

          {/* Add Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
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
          {technicians.map((t) => (
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
                      <p className="text-[11px] text-slate-500">{t.email}</p>
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
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.phone || 'No phone set'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{t.area_zone || 'General Zone'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Award className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold text-emerald-800">{t.specialization || 'All Products'}</span>
                  </div>
                </div>

                {/* Off-duty dispatch note */}
                {!t.is_available && (
                  <div className="mt-2 text-[10px] text-rose-700 bg-rose-50 border border-rose-100 px-2 py-1 rounded-md font-medium">
                    ⚠️ Marked Off-Duty — Complaints desk will see warning during ticket dispatch
                  </div>
                )}

                {/* Performance Stats */}
                <div className="grid grid-cols-3 gap-2 text-center mt-2.5 py-1.5 bg-slate-50/50 rounded-lg">
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
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <button
                  onClick={() => handleToggleAvailability(t.id, t.is_available)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                    t.is_available
                      ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                      : 'border-emerald-500 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 shadow-2xs'
                  }`}
                >
                  {t.is_available ? 'Mark Off-Duty' : '🟢 Mark On-Duty (Active)'}
                </button>

                <button
                  onClick={() => handleDeleteTechnician(t.id, t.name)}
                  className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 text-[11px]"
                  title="Remove Technician"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Staff Users 2-Column Grid */
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
                      <h4 className="text-xs font-bold text-slate-900">{u.name}</h4>
                      <p className="text-[11px] text-slate-500">{u.email}</p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {u.role === 'admin' ? 'Admin Supervisor' : 'Support Staff'}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{u.phone || '+919876500000'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{u.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span>Registered: {new Date(u.created_at || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-slate-100 text-xs">
                {u.role !== 'admin' && (
                  <button
                    onClick={() => handleDeleteUser(u.id, u.name)}
                    className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 text-[11px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Staff</span>
                  </button>
                )}
              </div>
            </div>
          ))}
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
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="ramesh@ecogreensolar.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+919876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Temporary Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                />
              </div>

              {formData.role === 'technician' && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Service Area / Zone</label>
                    <select
                      value={formData.area_zone}
                      onChange={(e) => setFormData({ ...formData, area_zone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                    >
                      <option value="North Zone (Indiranagar / Hebbal)">North Zone (Indiranagar / Hebbal)</option>
                      <option value="South Zone (Jayanagar / Koramangala)">South Zone (Jayanagar / Koramangala)</option>
                      <option value="East Zone (Whitefield / Marathahalli)">East Zone (Whitefield / Marathahalli)</option>
                      <option value="West Zone (Rajajinagar / Malleshwaram)">West Zone (Rajajinagar / Malleshwaram)</option>
                      <option value="Central & Outer Zone">Central & Outer Zone</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Product Specialization</label>
                    <select
                      value={formData.specialization}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                    >
                      <option value="Solar Rooftop Systems">Solar Rooftop Systems</option>
                      <option value="Solar Water Heaters">Solar Water Heaters</option>
                      <option value="Heat Pumps">Heat Pumps</option>
                      <option value="All Products">All Solar Products</option>
                    </select>
                  </div>
                </>
              )}

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
    </div>
  );
};
