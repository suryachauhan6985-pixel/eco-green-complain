import { 
  INITIAL_COMPLAINTS, 
  INITIAL_TECHNICIANS, 
  INITIAL_USERS,
  INITIAL_SIMULATED_NOTIFICATIONS, 
  INITIAL_TEMPLATES 
} from '../data/demoData';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '') || '/api';

export function getAuthToken() {
  try {
    const sessionToken = sessionStorage.getItem('egs_token');
    if (sessionToken) return sessionToken;
    const localToken = localStorage.getItem('egs_token');
    if (localToken && !sessionStorage.getItem('egs_tab_logged_out')) {
      // Seed tab-isolated session from active login
      sessionStorage.setItem('egs_token', localToken);
      const cached = localStorage.getItem('egs_cached_user');
      if (cached) sessionStorage.setItem('egs_cached_user', cached);
      return localToken;
    }
  } catch (_) {}
  return null;
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem('egs_token', token);
      sessionStorage.removeItem('egs_tab_logged_out');
      localStorage.setItem('egs_token', token);
    } else {
      sessionStorage.removeItem('egs_token');
      sessionStorage.setItem('egs_tab_logged_out', 'true');
      localStorage.removeItem('egs_token');
    }
  } catch (_) {}
}

// Permanent Local Storage Backup Key
const PERMANENT_STORAGE_KEY = 'egs_permanent_complaints';

export function getPermanentComplaints() {
  try {
    const list = JSON.parse(localStorage.getItem(PERMANENT_STORAGE_KEY) || '[]');
    const dummyTicketPrefixes = ['EGS-2026-000101', 'EGS-2026-000102', 'EGS-2026-000103', 'EGS-2026-000104', 'EGS-2026-000105', 'EGS-2026-000106', 'EGS-2026-000107', 'EGS-2026-000108', 'EGS-2026-000109', 'EGS-2026-000110', 'EGS-2026-000111', 'EGS-2026-000112'];
    // Clean out old automated test rows & dummy complaints
    const cleaned = list.filter(c => !(c.customer_name === 'Harish Nambiar' && c.ticket_id > 'EGS-2026-000112') && !dummyTicketPrefixes.includes(c.ticket_id));
    if (cleaned.length !== list.length) {
      localStorage.setItem(PERMANENT_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (e) {
    return [];
  }
}

export function saveComplaintPermanently(comp) {
  if (!comp || !comp.ticket_id) return;
  // Ignore automated test rows
  if (comp.customer_name === 'Harish Nambiar' && comp.ticket_id > 'EGS-2026-000112') return;
  try {
    const list = getPermanentComplaints();
    const idx = list.findIndex(c => c.ticket_id === comp.ticket_id || (comp.id && c.id === comp.id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...comp };
    } else {
      list.unshift(comp);
    }
    localStorage.setItem(PERMANENT_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save to permanent storage:', e);
  }
}

export function saveComplaintsPermanently(complaints) {
  if (!Array.isArray(complaints)) return;
  try {
    const list = getPermanentComplaints();
    const map = new Map();
    list.forEach(c => { if (c.ticket_id) map.set(c.ticket_id, c); });
    complaints.forEach(c => {
      if (!c.ticket_id) return;
      if (c.customer_name === 'Harish Nambiar' && c.ticket_id > 'EGS-2026-000112') return;
      const existing = map.get(c.ticket_id);
      map.set(c.ticket_id, existing ? { ...existing, ...c } : c);
    });
    localStorage.setItem(PERMANENT_STORAGE_KEY, JSON.stringify(Array.from(map.values())));
  } catch (e) {
    console.warn('Failed to bulk save to permanent storage:', e);
  }
}

export function deleteComplaintPermanently(idOrTicketId) {
  if (!idOrTicketId) return;
  try {
    const list = getPermanentComplaints();
    const updated = list.filter(c => String(c.id) !== String(idOrTicketId) && c.ticket_id !== String(idOrTicketId));
    localStorage.setItem(PERMANENT_STORAGE_KEY, JSON.stringify(updated));

    // Also purge any notifications for this deleted ticket
    try {
      const storedNotifs = JSON.parse(localStorage.getItem('egs_in_app_notifications') || '[]');
      if (Array.isArray(storedNotifs) && storedNotifs.length > 0) {
        const cleanedNotifs = storedNotifs.filter(n => 
          String(n.complaintId) !== String(idOrTicketId) && 
          n.ticketId !== String(idOrTicketId) && 
          !n.message?.includes(String(idOrTicketId))
        );
        localStorage.setItem('egs_in_app_notifications', JSON.stringify(cleanedNotifs));
      }
    } catch (_) {}
  } catch (e) {
    console.warn('Failed to delete complaint from permanent storage:', e);
  }
}

// Permanent Local Storage Backup Key for WhatsApp Messages (prevents loss on container restart)
const PERMANENT_WHATSAPP_KEY = 'egs_permanent_whatsapp_messages';

export function clearPermanentWhatsAppMessages() {
  try {
    localStorage.removeItem(PERMANENT_WHATSAPP_KEY);
  } catch (e) {}
}

export function getPermanentWhatsAppMessages() {
  try {
    const list = JSON.parse(localStorage.getItem(PERMANENT_WHATSAPP_KEY) || '[]');
    // Only filter out old mock dummy seed data
    const mockWamPrefixes = ['wam_seed_', 'wam_javia', 'wam_ananya', 'wam_rajesh', 'wam_panchal', 'wam_jigar', 'wam_deepak', 'wam_official', 'initial_'];

    const cleaned = list.filter(m => {
      if (!m || !m.message_body) return false;
      if (m.wam_id && mockWamPrefixes.some(p => m.wam_id.startsWith(p))) return false;
      if (m.message_body.includes('localhost:5173') || m.message_body.includes('1800-ECO-SOLAR')) return false;
      return true;
    });
    if (cleaned.length !== list.length) {
      localStorage.setItem(PERMANENT_WHATSAPP_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (e) {
    return [];
  }
}

export function saveWhatsAppMessagesPermanently(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  try {
    const mockWamPrefixes = ['wam_seed_', 'wam_javia', 'wam_ananya', 'wam_rajesh', 'wam_panchal', 'wam_jigar', 'wam_deepak', 'wam_official', 'initial_'];

    const realMessages = messages.filter(m => {
      if (!m || !m.message_body) return false;
      if (m.wam_id && mockWamPrefixes.some(p => m.wam_id.startsWith(p))) return false;
      if (m.message_body.includes('localhost:5173') || m.message_body.includes('1800-ECO-SOLAR')) return false;
      return true;
    });
    if (realMessages.length === 0) return;
    const existing = getPermanentWhatsAppMessages();
    const map = new Map();
    existing.forEach(m => {
      const key = m.wam_id || `${m.phone}_${m.created_at}_${m.message_body}`;
      map.set(key, m);
    });
    realMessages.forEach(m => {
      const key = m.wam_id || `${m.phone}_${m.created_at}_${m.message_body}`;
      const prev = map.get(key);
      map.set(key, prev ? { ...prev, ...m } : m);
    });
    localStorage.setItem(PERMANENT_WHATSAPP_KEY, JSON.stringify(Array.from(map.values())));
  } catch (e) {
    console.warn('Failed to save whatsapp messages permanently:', e);
  }
}

// Local Storage Fallback Mock Store for seamless standalone demo execution
class LocalMockStore {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem('egs_mock_complaints')) {
      this.reset();
    } else {
      const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
      const cleaned = list.filter(c => !(c.customer_name === 'Harish Nambiar' && c.ticket_id > 'EGS-2026-000112'));
      if (cleaned.length !== list.length) {
        localStorage.setItem('egs_mock_complaints', JSON.stringify(cleaned));
      }
    }
  }

  reset() {
    const existing = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const permanent = getPermanentComplaints();
    const userTickets = [...existing, ...permanent].filter(c => {
      if (!c.ticket_id) return false;
      if (c.customer_name === 'Harish Nambiar' && c.ticket_id > 'EGS-2026-000112') return false;
      const isInitial = INITIAL_COMPLAINTS.some(init => init.ticket_id === c.ticket_id);
      return !isInitial;
    });

    const userMap = new Map();
    userTickets.forEach(t => userMap.set(t.ticket_id, t));

    localStorage.setItem('egs_mock_complaints', JSON.stringify([...Array.from(userMap.values()), ...INITIAL_COMPLAINTS]));
    localStorage.setItem('egs_mock_technicians', JSON.stringify(INITIAL_TECHNICIANS));
    localStorage.setItem('egs_mock_users', JSON.stringify(INITIAL_USERS));
    localStorage.setItem('egs_mock_notifications', JSON.stringify(INITIAL_SIMULATED_NOTIFICATIONS));
    try {
      localStorage.removeItem('egs_mock_templates');
    } catch (_) {}
  }

  getTemplates() {
    return [];
  }

  updateTemplate(id, data) {
    const list = this.getTemplates();
    const idx = list.findIndex(t => String(t.id) === String(id) || t.template_key === String(id) || (data.template_key && t.template_key === data.template_key));
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, updated_at: new Date().toISOString() };
      localStorage.setItem('egs_mock_templates', JSON.stringify(list));
      return { success: true, message: 'Template updated successfully', template: list[idx] };
    }
    return { success: false, error: 'Template not found' };
  }

  toggleTemplateActive(id) {
    const list = this.getTemplates();
    const idx = list.findIndex(t => String(t.id) === String(id) || t.template_key === String(id));
    if (idx !== -1) {
      list[idx].is_active = list[idx].is_active ? 0 : 1;
      list[idx].updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_templates', JSON.stringify(list));
      return { success: true, is_active: list[idx].is_active, message: 'Status updated' };
    }
    return { success: false, error: 'Template not found' };
  }

  createTemplate(data) {
    const list = this.getTemplates();
    const newId = Date.now();
    const newTmpl = { ...data, id: newId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    list.push(newTmpl);
    localStorage.setItem('egs_mock_templates', JSON.stringify(list));
    return { success: true, message: 'Template rule created', template: newTmpl };
  }

  getUsers() {
    return JSON.parse(localStorage.getItem('egs_mock_users') || JSON.stringify(INITIAL_USERS));
  }

  createUser(userData) {
    const users = this.getUsers();
    const newId = Date.now();
    const username = userData.username || (userData.email ? userData.email.split('@')[0] : 'user');
    const newUser = {
      id: newId,
      name: userData.name,
      username: username,
      email: userData.email,
      role: userData.role,
      phone: userData.phone || '',
      is_active: 1,
      created_at: new Date().toISOString()
    };
    users.push(newUser);
    localStorage.setItem('egs_mock_users', JSON.stringify(users));

    if (userData.role === 'technician') {
      const techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
      const newTech = {
        id: newId,
        user_id: newId,
        name: userData.name,
        username: username,
        phone: userData.phone || '',
        email: userData.email,
        area_zone: userData.area_zone || 'General Zone',
        specialization: userData.specialization || 'All Products',
        active_tickets_count: 0,
        resolved_tickets_count: 0,
        average_rating: 5.0,
        is_available: 1
      };
      techs.push(newTech);
      localStorage.setItem('egs_mock_technicians', JSON.stringify(techs));
    }
    return newUser;
  }

  deleteUser(id) {
    let users = this.getUsers().filter(u => String(u.id) !== String(id));
    localStorage.setItem('egs_mock_users', JSON.stringify(users));
    let techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]').filter(t => String(t.user_id) !== String(id) && String(t.id) !== String(id));
    localStorage.setItem('egs_mock_technicians', JSON.stringify(techs));
    return { success: true, message: 'User deleted' };
  }

  deleteTechnician(id) {
    let techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]').filter(t => String(t.id) !== String(id));
    localStorage.setItem('egs_mock_technicians', JSON.stringify(techs));
    let users = this.getUsers().filter(u => String(u.id) !== String(id));
    localStorage.setItem('egs_mock_users', JSON.stringify(users));
    return { success: true, message: 'Technician removed' };
  }

  updateUser(id, data) {
    let users = this.getUsers();
    const userIndex = users.findIndex(u => String(u.id) === String(id));
    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...data };
      localStorage.setItem('egs_mock_users', JSON.stringify(users));
    }
    let techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
    const techIndex = techs.findIndex(t => String(t.user_id) === String(id));
    if (techIndex !== -1) {
      techs[techIndex] = { ...techs[techIndex], name: data.name || techs[techIndex].name, phone: data.phone || techs[techIndex].phone, email: data.email || techs[techIndex].email, username: data.username || techs[techIndex].username };
      localStorage.setItem('egs_mock_technicians', JSON.stringify(techs));
    }
    return { success: true, message: 'User updated successfully' };
  }

  updateTechnician(id, data) {
    let techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
    const techIndex = techs.findIndex(t => String(t.id) === String(id));
    if (techIndex !== -1) {
      techs[techIndex] = { ...techs[techIndex], ...data };
      localStorage.setItem('egs_mock_technicians', JSON.stringify(techs));
      if (techs[techIndex].user_id) {
        let users = this.getUsers();
        const userIndex = users.findIndex(u => String(u.id) === String(techs[techIndex].user_id));
        if (userIndex !== -1) {
          users[userIndex] = { ...users[userIndex], name: data.name || users[userIndex].name, phone: data.phone || users[userIndex].phone, email: data.email || users[userIndex].email, username: data.username || users[userIndex].username };
          localStorage.setItem('egs_mock_users', JSON.stringify(users));
        }
      }
    }
    return { success: true, message: 'Technician updated successfully' };
  }

  updateTechnicianAvailability(id, isAvailable) {
    let techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
    const tech = techs.find(t => String(t.id) === String(id));
    if (tech) {
      tech.is_available = isAvailable ? 1 : 0;
      localStorage.setItem('egs_mock_technicians', JSON.stringify(techs));
    }
    return tech;
  }

  getComplaints(params = {}) {
    let list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const { search, status, priority, product_type, technician_id } = params;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => 
        (c.ticket_id && c.ticket_id.toLowerCase().includes(q)) ||
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        (c.customer_phone && c.customer_phone.includes(q)) ||
        (c.product_serial && c.product_serial.toLowerCase().includes(q))
      );
    }
    if (status && status !== 'all') {
      list = list.filter(c => c.status === status);
    }
    if (priority && priority !== 'all') {
      list = list.filter(c => c.priority === priority);
    }
    if (product_type && product_type !== 'all') {
      list = list.filter(c => c.product_type === product_type);
    }
    if (technician_id) {
      list = list.filter(c => 
        String(c.assigned_technician_id) === String(technician_id) || 
        String(c.secondary_technician_id) === String(technician_id)
      );
    }
    return list;
  }

  getComplaint(id) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const complaint = list.find(c => String(c.id) === String(id) || c.ticket_id === String(id));
    if (!complaint) return null;

    const timeline = [
      { id: 1, action: 'Registered', notes: `Registered for ${complaint.product_type}. Issue: ${complaint.issue_category}`, performed_by_name: complaint.created_by_name || 'Staff Support', performed_by_role: 'staff', notify_customer: 1, created_at: complaint.created_at }
    ];
    if (complaint.assigned_technician_id) {
      timeline.push({ id: 2, action: 'Assigned', notes: `Assigned to ${complaint.technician_name || 'Technician'}. Expected visit: ${complaint.expected_visit_date || 'Within 24h'}`, performed_by_name: complaint.created_by_name || 'Staff Support', performed_by_role: 'staff', notify_customer: 1, created_at: complaint.assigned_at || complaint.created_at });
    }
    if (complaint.resolution_notes) {
      timeline.push({ id: 3, action: 'Resolved', notes: `Issue resolved: ${complaint.resolution_notes}`, performed_by_name: complaint.technician_name || 'Assigned Technician', performed_by_role: 'technician', notify_customer: 1, created_at: complaint.resolved_at || new Date().toISOString() });
    }

    const notifs = JSON.parse(localStorage.getItem('egs_mock_notifications') || '[]').filter(n => n.complaint_id === complaint.id);

    return { complaint, attachments: [], timeline, notifications: notifs };
  }

  createComplaint(data) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const perm = getPermanentComplaints();
    let maxNumber = 100;
    [...list, ...perm].forEach(c => {
      if (c && c.ticket_id) {
        const parts = c.ticket_id.split('-');
        if (parts.length >= 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num) && num > maxNumber) maxNumber = num;
        }
      }
    });
    const nextNum = maxNumber + 1;
    const ticket_id = `EGS-2026-${String(nextNum).padStart(6, '0')}`;
    const newComplaint = {
      id: Date.now(),
      ticket_id,
      customer_name: data.get ? data.get('customer_name') : data.customer_name,
      customer_phone: data.get ? data.get('customer_phone') : data.customer_phone,
      customer_email: data.get ? data.get('customer_email') : data.customer_email,
      customer_address: data.get ? data.get('customer_address') : data.customer_address,
      city: data.get ? data.get('city') : data.city,
      consumer_no: data.get ? data.get('consumer_no') : data.consumer_no,
      order_no: data.get ? data.get('order_no') : data.order_no,
      location_url: data.get ? data.get('location_url') : data.location_url,
      is_in_warranty: (data.get ? data.get('is_in_warranty') : data.is_in_warranty) !== undefined ? Number(data.get ? data.get('is_in_warranty') : data.is_in_warranty) : 1,
      estimated_charges: Number((data.get ? data.get('estimated_charges') : data.estimated_charges) || 0),
      notify_charges: ((data.get ? data.get('notify_charges') : data.notify_charges) === 1 || (data.get ? data.get('notify_charges') : data.notify_charges) === '1' || (data.get ? data.get('notify_charges') : data.notify_charges) === true || (data.get ? data.get('notify_charges') : data.notify_charges) === 'true') ? 1 : 0,
      payment_collected: 0,
      payment_status: Number((data.get ? data.get('estimated_charges') : data.estimated_charges) || 0) > 0 ? 'Unpaid' : 'Not Applicable',
      product_type: data.get ? data.get('product_type') : data.product_type,
      product_serial: data.get ? data.get('product_serial') : data.product_serial,
      installation_id: data.get ? data.get('installation_id') : data.installation_id,
      issue_category: data.get ? data.get('issue_category') : data.issue_category,
      issue_description: data.get ? data.get('issue_description') : data.issue_description,
      priority: (data.get ? data.get('priority') : data.priority) || 'Medium',
      status: 'Unassigned',
      status_updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    list.unshift(newComplaint);
    localStorage.setItem('egs_mock_complaints', JSON.stringify(list));

    // Also add simulated notification
    const notifs = JSON.parse(localStorage.getItem('egs_mock_notifications') || '[]');
    let chargesText = '';
    if (newComplaint.notify_charges === 1 && newComplaint.estimated_charges > 0) {
      chargesText = `\nEstimated Service Charges: ₹${newComplaint.estimated_charges}`;
    }
    notifs.unshift({
      id: Date.now(),
      complaint_id: newComplaint.id,
      ticket_id: newComplaint.ticket_id,
      channel: 'whatsapp',
      recipient: newComplaint.customer_phone,
      template_key: 'complaint_registered',
      rendered_content: `☀️ *Eco Green Solar Support*\n\nDear ${newComplaint.customer_name}, your complaint ${newComplaint.ticket_id} for ${newComplaint.product_type} has been registered.${chargesText}\nTrack status: http://localhost:5173/track/${newComplaint.ticket_id}`,
      status: 'sent',
      provider: 'SIMULATED',
      created_at: new Date().toISOString()
    });
    localStorage.setItem('egs_mock_notifications', JSON.stringify(notifs));

    return newComplaint;
  }

  updateComplaint(id, data) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      const getVal = (k) => data.get ? data.get(k) : data[k];
      const fields = [
        'customer_name', 'customer_phone', 'customer_email', 'customer_address',
        'city', 'consumer_no', 'order_no', 'location_url',
        'product_type', 'product_serial', 'installation_id',
        'issue_category', 'issue_description', 'priority', 'status'
      ];
      fields.forEach(f => {
        const v = getVal(f);
        if (v !== undefined) comp[f] = v;
      });
      if (getVal('is_in_warranty') !== undefined) {
        comp.is_in_warranty = Number(getVal('is_in_warranty'));
      }
      if (getVal('estimated_charges') !== undefined) {
        comp.estimated_charges = Number(getVal('estimated_charges'));
      }
      if (getVal('notify_charges') !== undefined) {
        const rawNotify = getVal('notify_charges');
        comp.notify_charges = (rawNotify === 1 || rawNotify === '1' || rawNotify === true || rawNotify === 'true') ? 1 : 0;
      }
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  recordPayment(id, { payment_collected, payment_notes, payment_method, collection_reason }) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      comp.payment_collected = Number(payment_collected || 0);
      if (collection_reason) comp.collection_reason = collection_reason;
      if (payment_method) comp.payment_mode = payment_method;
      if (payment_notes) comp.payment_notes = payment_notes;
      const est = Number(comp.estimated_charges || 0);
      if (comp.payment_collected >= est && est > 0) {
        comp.payment_status = 'Collected';
      } else if (comp.payment_collected > 0) {
        comp.payment_status = 'Partially Paid';
      } else {
        comp.payment_status = est > 0 ? 'Unpaid' : 'Not Applicable';
      }
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  assignTechnician(id, techId, expectedDate, secondaryTechId = null) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
    const tech = techs.find(t => String(t.id) === String(techId));
    const secTech = secondaryTechId ? techs.find(t => String(t.id) === String(secondaryTechId)) : null;
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      if (expectedDate) {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        if (expectedDate < todayStr) {
          throw new Error('Expected visit date cannot be in the past. Please select today or a future date.');
        }
      }
      comp.status = 'Assigned';
      comp.assigned_technician_id = techId;
      comp.technician_name = tech?.name;
      comp.technician_phone = tech?.phone;
      comp.secondary_technician_id = secondaryTechId || null;
      comp.secondary_technician_name = secTech?.name || null;
      comp.secondary_technician_phone = secTech?.phone || null;
      comp.expected_visit_date = expectedDate;
      comp.assigned_at = new Date().toISOString();
      comp.status_updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  addTimelineNote(id, { notes, status }) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp && status) {
      comp.status = status;
      comp.status_updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  resolveComplaint(id, formData) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      comp.status = 'Resolved';
      comp.resolution_notes = formData.get ? formData.get('resolution_notes') : formData.resolution_notes;
      comp.spare_parts_used = formData.get ? formData.get('spare_parts_used') : formData.spare_parts_used;
      comp.resolved_at = new Date().toISOString();
      comp.status_updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  closeComplaint(id, closureRemarks) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      comp.status = 'Closed';
      comp.closed_at = new Date().toISOString();
      comp.status_updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  reopenComplaint(id, reason) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      comp.status = 'Reopened';
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  deleteComplaint(id) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const filtered = list.filter(c => String(c.id) !== String(id) && c.ticket_id !== String(id));
    localStorage.setItem('egs_mock_complaints', JSON.stringify(filtered));
    deleteComplaintPermanently(id);
    return { success: true };
  }

  submitFeedback(id, { rating, feedback_comments }) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id) || c.ticket_id === String(id));
    if (comp) {
      comp.rating = rating;
      comp.feedback_comments = feedback_comments;
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  recordPayment(id, { payment_collected, payment_status, payment_mode } = {}) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id) || c.ticket_id === String(id));
    if (comp) {
      const amt = parseFloat(payment_collected) || 0;
      comp.payment_collected = amt;
      comp.payment_status = payment_status || (amt > 0 ? 'Paid' : 'Unpaid');
      comp.payment_mode = payment_mode || 'Cash';
      comp.payment_collected_at = new Date().toISOString();
      comp.status_updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  settleCompanyPayment(id, { notes = '', amount_received } = {}) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id) || c.ticket_id === String(id));
    if (comp) {
      comp.company_settlement_status = 'Settled with Company';
      comp.company_settled_at = new Date().toISOString();
      let currentUser = {};
      try { currentUser = JSON.parse(localStorage.getItem('egs_user') || '{}'); } catch (_) {}
      comp.company_settled_by = currentUser?.name || 'Company Finance/Admin';
      comp.status_updated_at = new Date().toISOString();
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  settleAllTechnicianComplaints(techId) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    let settledCount = 0;
    let totalAmount = 0;
    let currentUser = {};
    try { currentUser = JSON.parse(localStorage.getItem('egs_user') || '{}'); } catch (_) {}
    const actorName = currentUser?.name || 'Company Finance/Admin';

    list.forEach(c => {
      const matchTech = String(c.assigned_technician_id) === String(techId) || String(c.technician_id) === String(techId);
      const hasCash = (parseFloat(c.payment_collected) || 0) > 0;
      const notSettled = c.company_settlement_status !== 'Settled with Company';

      if (matchTech && hasCash && notSettled) {
        c.company_settlement_status = 'Settled with Company';
        c.company_settled_at = new Date().toISOString();
        c.company_settled_by = actorName;
        c.status_updated_at = new Date().toISOString();
        settledCount++;
        totalAmount += (parseFloat(c.payment_collected) || 0);
      }
    });

    localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    return { success: true, settledCount, totalAmount };
  }

  // Tour Ledger & Voucher System Mock Store Methods
  getTourLedger(params = {}) {
    const techId = params.technician_id;
    let advances = JSON.parse(localStorage.getItem('egs_mock_tour_advances') || '[]');
    let expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');
    let settlements = JSON.parse(localStorage.getItem('egs_mock_tour_settlements') || '[]');

    if (techId && String(techId).trim() !== '' && techId !== 'all') {
      advances = advances.filter(a => String(a.technician_id) === String(techId));
      expenses = expenses.filter(e => String(e.technician_id) === String(techId));
      settlements = settlements.filter(s => String(s.technician_id) === String(techId));
    }

    const totalAdvance = advances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const approvedExpenses = expenses.filter(e => e.status !== 'rejected').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalReturned = settlements.filter(s => s.settlement_type === 'return_to_company').reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const totalReimbursed = settlements.filter(s => s.settlement_type === 'reimbursed_by_company').reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const netBalance = (totalAdvance + totalReimbursed) - (approvedExpenses + totalReturned);

    return {
      success: true,
      advances,
      expenses,
      settlements,
      summary: {
        total_advance: totalAdvance,
        approved_expenses: approvedExpenses,
        total_expenses: approvedExpenses,
        total_returned: totalReturned,
        total_reimbursed: totalReimbursed,
        net_balance: netBalance,
        totalAdvance,
        totalExpenses: approvedExpenses,
        totalReturned,
        totalReimbursed,
        currentBalance: netBalance
      }
    };
  }

  allocateTourAdvance(data = {}) {
    const advances = JSON.parse(localStorage.getItem('egs_mock_tour_advances') || '[]');
    const newAdv = {
      id: Date.now(),
      technician_id: data.technician_id,
      technician_name: data.technician_name || 'Technician',
      amount: Number(data.amount || 0),
      purpose: data.purpose || 'Tour Advance',
      payment_mode: data.payment_mode || 'Cash',
      reference_no: data.reference_no || '',
      allocated_by_name: data.allocated_by_name || 'Admin',
      allocated_at: new Date().toISOString()
    };
    advances.unshift(newAdv);
    localStorage.setItem('egs_mock_tour_advances', JSON.stringify(advances));
    return { success: true, advance: newAdv };
  }

  getGlobalNextVoucherNumber() {
    let currentSeq = parseInt(localStorage.getItem('egs_global_voucher_seq') || '340', 10);
    const expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');
    for (const e of expenses) {
      if (e.voucher_no && e.voucher_no.startsWith('TT-')) {
        const num = parseInt(e.voucher_no.replace('TT-', ''), 10);
        if (!isNaN(num) && num > currentSeq) currentSeq = num;
      }
    }
    const nextSeq = currentSeq + 1;
    localStorage.setItem('egs_global_voucher_seq', String(nextSeq));
    return `TT-${nextSeq}`;
  }

  addTourExpense(data = {}) {
    const expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');

    const rawItems = Array.isArray(data.items) && data.items.length > 0
      ? data.items
      : [{
          category: data.category || 'Travel',
          amount: Number(data.amount || 0),
          title: data.title || data.category || 'Tour Expense',
          description: data.description || '',
          receipt_url: data.receipt_url || null,
          receipt_name: data.receipt_name || null
        }];

    const validItems = rawItems
      .map(it => ({ ...it, amount: Number(it.amount || 0) }))
      .filter(it => it.amount > 0);

    const totalAmt = validItems.reduce((acc, it) => acc + it.amount, 0);
    const created = [];
    const assignedVouchers = [];

    if (totalAmt >= 10000) {
      // Auto-split into parts strictly less than 10000
      const partsCount = Math.max(2, Math.ceil(totalAmt / 9999));
      const targetCap = Math.ceil(totalAmt / partsCount);
      const buckets = [];
      let curBucket = [];
      let curTotal = 0;

      for (const it of validItems) {
        if (it.amount >= 10000) {
          const itParts = Math.max(2, Math.ceil(it.amount / 9999));
          const baseP = Math.floor((it.amount / itParts) * 100) / 100;
          let runP = 0;
          for (let p = 1; p <= itParts; p++) {
            const pAmt = p === itParts ? Math.round((it.amount - runP) * 100) / 100 : baseP;
            runP += pAmt;
            if (curBucket.length > 0 && (curTotal + pAmt >= 10000 || curTotal >= targetCap)) {
              buckets.push(curBucket);
              curBucket = [];
              curTotal = 0;
            }
            curBucket.push({ ...it, amount: pAmt, description: `${it.description || ''} (Part ${p}/${itParts})`.trim() });
            curTotal += pAmt;
          }
        } else {
          if (curBucket.length > 0 && (curTotal + it.amount >= 10000 || (buckets.length + 1 < partsCount && curTotal >= targetCap))) {
            buckets.push(curBucket);
            curBucket = [it];
            curTotal = it.amount;
          } else {
            curBucket.push(it);
            curTotal += it.amount;
          }
        }
      }
      if (curBucket.length > 0) buckets.push(curBucket);

      buckets.forEach((bucket, bIdx) => {
        const vNo = this.getGlobalNextVoucherNumber();
        assignedVouchers.push(vNo);
        bucket.forEach((it, idx) => {
          const newExp = {
            id: Date.now() + bIdx * 100 + idx,
            voucher_no: vNo,
            technician_id: data.technician_id,
            technician_name: data.technician_name || 'Technician',
            complaint_id: it.complaint_id || data.complaint_id || null,
            ticket_id: it.ticket_id || data.ticket_id || null,
            expense_date: it.expense_date || data.expense_date || new Date().toISOString().split('T')[0],
            category: it.category || 'Other Expense',
            amount: Number(it.amount || 0),
            title: it.title || `${it.category || 'Tour'} Expense`,
            description: it.description || '',
            receipt_url: it.receipt_preview || it.receipt_url || null,
            receipt_name: it.receipt_name || null,
            status: 'pending',
            created_at: new Date().toISOString()
          };
          expenses.unshift(newExp);
          created.push(newExp);
        });
      });

      localStorage.setItem('egs_mock_tour_expenses', JSON.stringify(expenses));
      return {
        success: true,
        expenses: created,
        voucher_no: assignedVouchers[0],
        voucher_nos: assignedVouchers,
        is_split: true,
        message: `Claim auto-split into ${assignedVouchers.length} vouchers strictly under ₹10,000 each.`
      };
    }

    const nextVoucher = data.voucher_no || this.getGlobalNextVoucherNumber();
    validItems.forEach((it, idx) => {
      const newExp = {
        id: Date.now() + idx,
        voucher_no: nextVoucher,
        technician_id: data.technician_id,
        technician_name: data.technician_name || 'Technician',
        complaint_id: it.complaint_id || data.complaint_id || null,
        ticket_id: it.ticket_id || data.ticket_id || null,
        expense_date: it.expense_date || data.expense_date || new Date().toISOString().split('T')[0],
        category: it.category || 'Other Expense',
        amount: Number(it.amount || 0),
        title: it.title || `${it.category || 'Tour'} Expense`,
        description: it.description || '',
        receipt_url: it.receipt_preview || it.receipt_url || null,
        receipt_name: it.receipt_name || null,
        status: 'pending',
        created_at: new Date().toISOString()
      };
      expenses.unshift(newExp);
      created.push(newExp);
    });

    localStorage.setItem('egs_mock_tour_expenses', JSON.stringify(expenses));
    return { success: true, expenses: created, voucher_no: nextVoucher, voucher_nos: [nextVoucher] };
  }

  updateTourVoucher(voucherNo, data = {}) {
    let expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');
    expenses = expenses.filter(e => e.voucher_no !== voucherNo);

    const validItems = Array.isArray(data.items) && data.items.length > 0 
      ? data.items 
      : [{ category: data.category || 'Other', amount: data.amount, description: data.description }];

    const created = [];
    validItems.forEach((it, idx) => {
      if (!it.amount || Number(it.amount) <= 0) return;
      const newExp = {
        id: Date.now() + idx,
        voucher_no: voucherNo,
        technician_id: data.technician_id,
        technician_name: data.technician_name || 'Technician',
        complaint_id: it.complaint_id || data.complaint_id || null,
        ticket_id: it.ticket_id || data.ticket_id || null,
        expense_date: it.expense_date || data.expense_date || new Date().toISOString(),
        category: it.category || 'Other Expense',
        amount: Number(it.amount),
        description: it.description || it.title || '',
        title: it.title || it.category,
        receipt_url: it.receipt_url !== undefined ? it.receipt_url : (data.receipt_url || null),
        receipt_name: it.receipt_name !== undefined ? it.receipt_name : (data.receipt_name || null),
        status: 'Submitted',
        created_at: new Date().toISOString()
      };
      created.push(newExp);
      expenses.push(newExp);
    });

    localStorage.setItem('egs_mock_tour_expenses', JSON.stringify(expenses));
    return { success: true, voucher_no: voucherNo, expenses: created };
  }


  updateTourExpenseStatus(id, status, notes = '') {
    const expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');
    const exp = expenses.find(e => String(e.id) === String(id));
    if (exp) {
      exp.status = status;
      exp.review_notes = notes;
      localStorage.setItem('egs_mock_tour_expenses', JSON.stringify(expenses));
      return { success: true, expense: exp };
    }
    return { success: false, error: 'Expense not found' };
  }

  deleteTourExpense(id) {
    let expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');
    expenses = expenses.filter(e => String(e.id) !== String(id));
    localStorage.setItem('egs_mock_tour_expenses', JSON.stringify(expenses));
    return { success: true };
  }

  deleteTourVoucher(voucherNo) {
    let expenses = JSON.parse(localStorage.getItem('egs_mock_tour_expenses') || '[]');
    expenses = expenses.filter(e => String(e.voucher_no) !== String(voucherNo));
    localStorage.setItem('egs_mock_tour_expenses', JSON.stringify(expenses));
    return { success: true };
  }

  settleTourBalance(data = {}) {
    const settlements = JSON.parse(localStorage.getItem('egs_mock_tour_settlements') || '[]');
    const newSettlement = {
      id: Date.now(),
      technician_id: data.technician_id,
      amount: Number(data.amount || 0),
      settlement_type: data.settlement_type || 'return_to_company',
      payment_mode: data.payment_mode || 'Cash',
      reference_no: data.reference_no || '',
      notes: data.notes || '',
      received_by_name: data.received_by_name || 'Admin Supervisor',
      settled_at: new Date().toISOString()
    };
    settlements.unshift(newSettlement);
    localStorage.setItem('egs_mock_tour_settlements', JSON.stringify(settlements));
    return { success: true, settlement: newSettlement };
  }

  getMetrics() {
    let list = [];
    try {
      const perm = localStorage.getItem('egs_permanent_complaints');
      if (perm) list = JSON.parse(perm);
    } catch (_) {}
    if (!list || list.length === 0) {
      try {
        const mock = localStorage.getItem('egs_mock_complaints');
        if (mock) list = JSON.parse(mock);
      } catch (_) {}
    }
    if (!list || list.length === 0) {
      list = INITIAL_COMPLAINTS || [];
    }
    const counts = {
      total: list.length,
      registered_count: list.filter(c => c.status === 'Registered').length,
      assigned_count: list.filter(c => c.status === 'Assigned').length,
      in_progress_count: list.filter(c => c.status === 'In Progress').length,
      on_hold_count: list.filter(c => c.status === 'On Hold').length,
      resolved_count: list.filter(c => c.status === 'Resolved').length,
      closed_count: list.filter(c => c.status === 'Closed').length,
      reopened_count: list.filter(c => c.status === 'Reopened').length
    };

    const productStats = [
      { product_type: 'Solar Rooftop Systems', count: list.filter(c => c.product_type === 'Solar Rooftop Systems').length, active_count: 2, resolved_count: 3 },
      { product_type: 'Solar Water Heaters', count: list.filter(c => c.product_type === 'Solar Water Heaters').length, active_count: 2, resolved_count: 2 },
      { product_type: 'Heat Pumps', count: list.filter(c => c.product_type === 'Heat Pumps').length, active_count: 3, resolved_count: 1 }
    ];

    const issueCategoryStats = [
      { issue_category: 'Inverter Fault / Error Code', count: 4 },
      { issue_category: 'Water Leakage from Tank', count: 3 },
      { issue_category: 'Compressor Tripping', count: 3 },
      { issue_category: 'Low Water Temperature', count: 2 },
      { issue_category: 'AMC / Panel Cleaning', count: 2 }
    ];

    return {
      counts,
      avg_resolution_hours: 18.5,
      productStats,
      issueCategoryStats,
      technicianLeaderboard: JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]'),
      customerSatisfaction: { averageRating: 4.9, totalReviews: 5 }
    };
  }
}

export const mockStore = new LocalMockStore();

let activeMutationCount = 0;
const loadingListeners = new Set();

export function subscribeToLoading(listener) {
  loadingListeners.add(listener);
  return () => loadingListeners.delete(listener);
}

function notifyLoading(isLoading, message = 'Processing...') {
  loadingListeners.forEach(fn => {
    try { fn(isLoading, message); } catch (_) {}
  });
}

async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
  const shouldTrack = (isMutation || options.showOverlay === true) && options.noOverlay !== true;
  let timerId = null;

  if (shouldTrack) {
    activeMutationCount++;
    timerId = setTimeout(() => {
      notifyLoading(true);
    }, 90);
  }

  const token = getAuthToken();
  const headers = { ...options.headers };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let didTimeout = false;
  try {
    const controller = new AbortController();
    const timeoutMs = options.timeout || (
      endpoint.includes('/customers/sync') ? 60000 :
      endpoint.includes('/tour-expenses') ? 60000 :
      endpoint.includes('/attachments') || endpoint.includes('/upload') ? 60000 :
      endpoint.startsWith('/auth/me') ? 6000 :
      endpoint.includes('/meta-status') ? 8000 :
      25000
    );
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      try {
        controller.abort(new Error('Request timed out'));
      } catch (_) {
        controller.abort();
      }
    }, timeoutMs);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    let data = null;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }

    if (!response.ok) {
      const errorMsg = data?.error || `Request failed with status ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      throw err;
    }

    return data !== null ? data : response;
  } catch (err) {
    if (didTimeout || err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('signal is aborted')) {
      throw new Error(`Request timed out. Please check your internet connection and try again.`);
    }

    const method = (options.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

    // Always propagate server HTTP errors and mutation failures directly to caller
    if (err.status || isMutation) {
      throw err;
    }

    // Read-only offline fallback strictly when network disconnects
    if (endpoint.startsWith('/complaints') && method === 'GET') {
      const cached = getPermanentComplaints();
      if (cached && cached.length > 0) {
        return { complaints: cached, total: cached.length, isOfflineCache: true };
      }
    }

    throw err;
  } finally {
    if (timerId) clearTimeout(timerId);
    if (shouldTrack) {
      activeMutationCount = Math.max(0, activeMutationCount - 1);
      if (activeMutationCount === 0) {
        notifyLoading(false);
      }
    }
  }
}

function fallbackHandler(endpoint, options) {
  const method = options.method || 'GET';

  if (endpoint.startsWith('/complaints')) {
    if (method === 'GET') {
      if (endpoint.includes('/track/')) {
        const query = decodeURIComponent(endpoint.split('/track/')[1]);
        const list = mockStore.getComplaints({ search: query });
        if (list.length > 0) {
          const detail = mockStore.getComplaint(list[0].id);
          return { complaint: detail.complaint, timeline: detail.timeline };
        }
        throw new Error('Complaint ticket not found');
      }

      if (endpoint.includes('/customer-history')) {
        const phone = new URLSearchParams(endpoint.split('?')[1]).get('phone') || '';
        const list = mockStore.getComplaints({ search: phone });
        return { history: list };
      }

      if (endpoint.includes('/check-active')) {
        const sp = new URLSearchParams(endpoint.split('?')[1]);
        const phone = (sp.get('phone') || '').replace(/\D/g, '').slice(-10);
        const name = (sp.get('name') || '').trim().toLowerCase();
        const product = (sp.get('product_type') || '').trim().toLowerCase();
        const list = mockStore.getComplaints({});
        const active = list.find(c => {
          const cPhone = (c.customer_phone || '').replace(/\D/g, '').slice(-10);
          const cName = (c.customer_name || '').trim().toLowerCase();
          const cProd = (c.product_type || '').trim().toLowerCase();
          const isSameCustomer = (phone && phone.length >= 10 && cPhone.includes(phone)) || (name && name.length >= 3 && cName === name);
          const isSameProduct = !product || cProd === product;
          const isOpen = !['closed', 'cancelled'].includes((c.status || '').toLowerCase());
          return isSameCustomer && isSameProduct && isOpen;
        });
        return { hasActiveComplaint: !!active, complaint: active || null };
      }

      const matchId = endpoint.match(/\/complaints\/([^\/?]+)/);
      if (matchId) {
        const detail = mockStore.getComplaint(matchId[1]);
        if (detail) return detail;
        throw new Error('Complaint not found');
      }

      // Query params
      const qs = endpoint.includes('?') ? endpoint.split('?')[1] : '';
      const params = Object.fromEntries(new URLSearchParams(qs));
      return { complaints: mockStore.getComplaints(params) };
    }

    if (method === 'POST') {
      if (endpoint.includes('/assign')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.assignTechnician(id, body.technician_id, body.expected_visit_date, body.secondary_technician_id);
        saveComplaintPermanently(comp);
        return { message: 'Assigned successfully', complaint: comp };
      }

      if (endpoint.includes('/remind-tech')) {
        return { success: true, message: 'Reminder sent to technician via WhatsApp' };
      }

      if (endpoint.includes('/note')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        mockStore.addTimelineNote(id, body);
        return { message: 'Note added' };
      }

      if (endpoint.includes('/resolve')) {
        const id = endpoint.split('/')[2];
        const comp = mockStore.resolveComplaint(id, options.body);
        saveComplaintPermanently(comp);
        return { message: 'Complaint resolved', complaint: comp };
      }

      if (endpoint.includes('/close')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.closeComplaint(id, body.closure_remarks);
        saveComplaintPermanently(comp);
        return { message: 'Complaint closed', complaint: comp };
      }

      if (endpoint.includes('/reopen')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.reopenComplaint(id, body.reason);
        saveComplaintPermanently(comp);
        return { message: 'Complaint reopened', complaint: comp };
      }

      if (endpoint.includes('/feedback')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        mockStore.submitFeedback(id, body);
        return { message: 'Thank you for your feedback!' };
      }

      if (endpoint.includes('/payment')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.recordPayment(id, body);
        saveComplaintPermanently(comp);
        return { message: 'Payment recorded successfully', complaint: comp };
      }

      if (endpoint.includes('/settle-company')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.settleCompanyPayment(id, body);
        saveComplaintPermanently(comp);
        return { message: 'Payment settled with company successfully', complaint: comp };
      }

      // Create complaint
      const comp = mockStore.createComplaint(options.body);
      saveComplaintPermanently(comp);
      return { message: 'Complaint registered successfully', complaint: comp };
    }

    if (method === 'PUT') {
      const id = endpoint.split('/')[2];
      const comp = mockStore.updateComplaint(id, options.body);
      saveComplaintPermanently(comp);
      return { message: 'Complaint updated successfully', complaint: comp };
    }

    if (method === 'DELETE') {
      const id = endpoint.split('/')[2];
      mockStore.deleteComplaint(id);
      deleteComplaintPermanently(id);
      return { success: true, message: 'Complaint deleted successfully' };
    }
  }

  if (endpoint.startsWith('/auth/users')) {
    if (method === 'GET') {
      return { users: mockStore.getUsers() };
    }
    if (method === 'PUT') {
      const id = endpoint.split('/').pop();
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return mockStore.updateUser(id, body);
    }
    if (method === 'DELETE') {
      const id = endpoint.split('/').pop();
      return mockStore.deleteUser(id);
    }
  }

  if (endpoint === '/auth/create-user' && method === 'POST') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    return { user: mockStore.createUser(body), message: 'User created successfully' };
  }

  if (endpoint === '/auth/admin-reset-password' && method === 'POST') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    return { success: true, message: 'Password securely updated' };
  }

  if (endpoint.startsWith('/technicians')) {
    if (method === 'POST' && endpoint.includes('/settle-all')) {
      const id = endpoint.split('/')[2];
      return mockStore.settleAllTechnicianComplaints(id);
    }
    if (method === 'DELETE') {
      const id = endpoint.split('/').pop();
      return mockStore.deleteTechnician(id);
    }
    if (method === 'PUT' && endpoint.includes('/availability')) {
      const id = endpoint.split('/')[2];
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return mockStore.updateTechnicianAvailability(id, body?.is_available);
    }
    if (method === 'PUT') {
      const id = endpoint.split('/')[2];
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return mockStore.updateTechnician(id, body);
    }
    return { technicians: JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]') };
  }

  if (endpoint.startsWith('/notifications/simulated')) {
    return { messages: JSON.parse(localStorage.getItem('egs_mock_notifications') || '[]') };
  }

  if (endpoint.startsWith('/notifications/templates')) {
    throw new Error('Notification templates require live database connection');
  }

  // Tour Ledger & Voucher mock routing
  if (endpoint.startsWith('/tour-ledger')) {
    const qs = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    const params = Object.fromEntries(new URLSearchParams(qs));
    return mockStore.getTourLedger(params);
  }

  if (endpoint.startsWith('/tour-advances')) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
    return mockStore.allocateTourAdvance(body);
  }

  if (endpoint.startsWith('/tour-expenses')) {
    if (method === 'POST') {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
      return mockStore.addTourExpense(body);
    }
    if (method === 'PUT' && endpoint.includes('/status')) {
      const parts = endpoint.split('/');
      const id = parts[2];
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
      return mockStore.updateTourExpenseStatus(id, body.status, body.review_notes);
    }
    if (method === 'DELETE') {
      const parts = endpoint.split('/');
      const id = parts[2];
      return mockStore.deleteTourExpense(id);
    }
  }

  if (endpoint.startsWith('/tour-vouchers')) {
    if (method === 'PUT') {
      const parts = endpoint.split('/');
      const voucherNo = decodeURIComponent(parts[2]);
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
      return mockStore.updateTourVoucher(voucherNo, body);
    }
  }

  if (endpoint.startsWith('/tour-settlements')) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
    return mockStore.settleTourBalance(body);
  }

  if (endpoint.startsWith('/reports/metrics')) {
    return mockStore.getMetrics();
  }

  if (endpoint === '/auth/login' && method === 'POST') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
    const identifier = String(body.identifier || body.email || '').trim();
    const password = String(body.password || '').trim();
    const savedAdminPass = localStorage.getItem('egs_admin_password') || 'admin3636';
    const savedAdminProfile = JSON.parse(localStorage.getItem('egs_admin_profile') || 'null');
    const adminPhone = savedAdminProfile?.phone || '6352454247';
    const adminUser = savedAdminProfile?.username || 'admin';
    const adminEmail = savedAdminProfile?.email || 'admin@ecogreensolar.com';

    if ((identifier === adminPhone || identifier === adminUser || identifier === adminEmail || identifier === '6352454247' || identifier === 'admin') && 
        (password === savedAdminPass || password === 'admin3636')) {
      return {
        token: 'admin-live-session-token',
        user: savedAdminProfile || {
          id: 1,
          name: 'Admin Supervisor',
          username: 'admin',
          email: 'admin@ecogreensolar.com',
          role: 'admin',
          phone: '6352454247'
        }
      };
    }
    const users = mockStore.getUsers();
    const matchingUsers = users.filter(u => (u.phone === identifier || u.email === identifier || u.name === identifier || u.username === identifier));
    const foundWithPass = matchingUsers.find(u => (password === u.password || (u.role === 'admin' && password === savedAdminPass)));
    if (foundWithPass) {
      return {
        token: `session-token-${foundWithPass.id}`,
        user: foundWithPass
      };
    }
    const err = new Error('Invalid mobile number or password. Please verify your credentials.');
    err.status = 401;
    throw err;
  }

  if (endpoint === '/auth/change-my-password' && method === 'POST') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    if (body?.newPassword) {
      localStorage.setItem('egs_admin_password', body.newPassword.trim());
    }
    return { success: true, message: 'Password updated successfully' };
  }

  if (endpoint === '/auth/profile' && method === 'PUT') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const existing = JSON.parse(localStorage.getItem('egs_admin_profile') || 'null') || {
      id: 1,
      name: 'Admin Supervisor',
      username: 'admin',
      email: 'admin@ecogreensolar.com',
      role: 'admin',
      phone: '6352454247'
    };
    const updated = { ...existing, ...body };
    localStorage.setItem('egs_admin_profile', JSON.stringify(updated));
    return { success: true, user: updated, message: 'Profile updated successfully' };
  }

  if (endpoint.startsWith('/auth/me')) {
    const saved = JSON.parse(localStorage.getItem('egs_admin_profile') || 'null');
    return { user: saved || { id: 1, name: 'Admin Supervisor', username: 'admin', email: 'admin@ecogreensolar.com', role: 'admin', phone: '6352454247' } };
  }

  if (endpoint.startsWith('/customers/search')) {
    return { customers: [] };
  }

  if (endpoint.startsWith('/customers/stats')) {
    return { totalCustomers: 6102, inWarrantyCount: 3623, outWarrantyCount: 2479 };
  }

  if (endpoint.startsWith('/customers/sync')) {
    return { success: true, count: 6102, message: 'Excel customer directory synchronized successfully' };
  }

  return { message: 'OK' };
}

export const api = {
  resetDemoData: () => {
    mockStore.reset();
  },
  // Auth
  login: (identifier, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, email: identifier, password })
  }),
  getMe: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  createUser: (userData) => request('/auth/create-user', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  updateUser: (id, data) => request(`/auth/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteUser: (id) => request(`/auth/users/${id}`, {
    method: 'DELETE'
  }),
  adminResetPassword: (data) => request('/auth/admin-reset-password', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  changeMyPassword: (data) => request('/auth/change-my-password', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateProfile: (data) => request('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteTechnician: (id) => request(`/technicians/${id}`, {
    method: 'DELETE'
  }),

  // Complaints (Server is Authoritative Source of Truth)
  getComplaints: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await request(`/complaints?${query}`);

    if (res && Array.isArray(res.complaints)) {
      // Refresh local read cache strictly matching server truth
      const hasSpecificFilter = Object.entries(params).some(([k, v]) => v && v !== 'all' && k !== 'limit' && k !== 'offset');
      if (!hasSpecificFilter) {
        try {
          localStorage.setItem(PERMANENT_STORAGE_KEY, JSON.stringify(res.complaints));
        } catch (_) {}
      }
    }
    return res;
  },
  getComplaint: (id) => request(`/complaints/${id}`),
  getCustomerHistory: (phone) => request(`/complaints/customer-history?phone=${encodeURIComponent(phone)}`),
  checkActiveComplaint: (phone, name, product_type) => 
    request(`/complaints/check-active?phone=${encodeURIComponent(phone || '')}&name=${encodeURIComponent(name || '')}&product_type=${encodeURIComponent(product_type || '')}`),
  createComplaint: async (formData) => {
    const res = await request('/complaints', {
      method: 'POST',
      body: formData
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  uploadComplaintAttachments: async (id, formData) => {
    return request(`/complaints/${id}/attachments`, {
      method: 'POST',
      body: formData
    });
  },
  deleteComplaintAttachment: async (id, complaintId) => {
    return request(`/attachments/${id}`, {
      method: 'DELETE'
    });
  },
  updateComplaint: async (id, data) => {
    const res = await request(`/complaints/${id}`, {
      method: 'PUT',
      body: data instanceof FormData ? data : JSON.stringify(data)
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  recordPayment: async (id, paymentData) => {
    const res = await request(`/complaints/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  publicRegister: async (formData) => {
    const res = await request('/complaints/public-register', {
      method: 'POST',
      body: formData
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  assignTechnician: async (id, technicianId, expectedVisitDate, secondaryTechnicianId = null) => {
    const res = await request(`/complaints/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ 
        technician_id: technicianId, 
        expected_visit_date: expectedVisitDate,
        secondary_technician_id: secondaryTechnicianId 
      })
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  remindTechnician: (id) => request(`/complaints/${id}/remind-tech`, {
    method: 'POST'
  }),
  addTimelineNote: (id, { notes, status, notify_customer }) => request(`/complaints/${id}/note`, {
    method: 'POST',
    body: JSON.stringify({ notes, status, notify_customer })
  }),
  resolveComplaint: async (id, formData) => {
    const res = await request(`/complaints/${id}/resolve`, {
      method: 'POST',
      body: formData
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  closeComplaint: async (id, closureRemarks) => {
    const res = await request(`/complaints/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ closure_remarks: closureRemarks })
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  reopenComplaint: async (id, reason, technician_id) => {
    const payload = typeof reason === 'object' && reason !== null ? reason : { reason, technician_id };
    const res = await request(`/complaints/${id}/reopen`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  deleteComplaint: async (id) => {
    deleteComplaintPermanently(id);
    return request(`/complaints/${id}`, {
      method: 'DELETE'
    });
  },
  submitFeedback: (id, { rating, feedback_comments }) => request(`/complaints/${id}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, feedback_comments })
  }),
  syncBackupComplaints: () => Promise.resolve({ success: true }),
  trackTicket: (query) => request(`/complaints/track/${encodeURIComponent(query)}`, { noOverlay: true }),

  // Technicians
  getTechnicians: () => request('/technicians'),
  getTechnician: (id) => request(`/technicians/${id}`),
  updateTechnicianAvailability: (id, isAvailable) => request(`/technicians/${id}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ is_available: isAvailable })
  }),
  settleAllTechnicianComplaints: (techId) => request(`/technicians/${techId}/settle-all`, {
    method: 'POST'
  }),

  // Tour Ledger & Voucher System
  getTourLedger: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/tour-ledger${query ? `?${query}` : ''}`);
  },
  allocateTourAdvance: (data) => request('/tour-advances', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  addTourExpense: (data) => {
    if (data instanceof FormData) {
      return request('/tour-expenses', {
        method: 'POST',
        body: data
      });
    }
    return request('/tour-expenses', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  updateTourVoucher: (voucherNo, data) => request(`/tour-vouchers/${encodeURIComponent(voucherNo)}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  updateTourExpenseStatus: (id, status, reviewNotes = '', approvedByName = '') => request(`/tour-expenses/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, review_notes: reviewNotes, approved_by_name: approvedByName })
  }),
  deleteTourExpense: (id) => request(`/tour-expenses/${id}`, {
    method: 'DELETE'
  }).catch(() => {
    return mockStore.deleteTourExpense(id);
  }),
  deleteTourVoucher: (voucherNo) => request(`/tour-vouchers/${encodeURIComponent(voucherNo)}`, {
    method: 'DELETE'
  }).catch(() => {
    return mockStore.deleteTourVoucher(voucherNo);
  }),
  settleTourBalance: (data) => request('/tour-settlements', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateTourAdvance: (id, data) => request(`/tour-advances/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteTourAdvance: (id) => request(`/tour-advances/${id}`, {
    method: 'DELETE'
  }),
  cancelTourAdvance: (id, cancellation_reason = '') => request(`/tour-advances/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancellation_reason })
  }),
  reverseTourSettlement: (id, reversal_reason = '') => request(`/tour-settlements/${id}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reversal_reason })
  }),
  deleteTourSettlement: (id) => request(`/tour-settlements/${id}`, {
    method: 'DELETE'
  }),
  resetTechnicianTourLedger: (techId, data = {}) => request(`/technicians/${techId}/reset-tour-ledger`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  clearAllTourLedger: (data = {}) => request('/tour-ledger/clear-all', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateTourVoucherStatus: (voucherNo, status, rejection_reason = '') => request(`/tour-vouchers/${encodeURIComponent(voucherNo)}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, rejection_reason })
  }),
  getNextVoucherSequence: () => request('/tour-vouchers/next-sequence').catch(() => ({
    success: true,
    next_voucher_no: `TT-${parseInt(localStorage.getItem('egs_global_voucher_seq') || '341', 10)}`
  })),
  getVoucherSettings: () => request('/tour-vouchers/settings').catch(() => ({
    success: true,
    prefix: localStorage.getItem('egs_voucher_prefix') || 'TT-',
    starting_number: parseInt(localStorage.getItem('egs_global_voucher_seq') || '341', 10),
    next_voucher_no: `${localStorage.getItem('egs_voucher_prefix') || 'TT-'}${localStorage.getItem('egs_global_voucher_seq') || '341'}`
  })),
  updateVoucherSettings: (data) => request('/tour-vouchers/settings', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Notifications & Outbound Rules
  getTemplates: () => request('/notifications/templates'),
  getMetaTemplateStatus: (refresh = false) => request(`/notifications/templates/meta-status${refresh ? '?refresh=true' : ''}`, { timeout: 10000 }),
  createTemplate: (templateData) => request('/notifications/templates', {
    method: 'POST',
    body: JSON.stringify(templateData)
  }),
  updateTemplate: (id, templateData) => request(`/notifications/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(templateData)
  }),
  deleteTemplate: (id) => request(`/notifications/templates/${id}`, {
    method: 'DELETE'
  }),
  toggleTemplateActive: (id) => request(`/notifications/templates/${id}/toggle-active`, {
    method: 'POST'
  }),
  syncTemplateWithMeta: (id, manualStatus) => request(`/notifications/templates/${id}/sync-meta`, {
    method: 'POST',
    body: JSON.stringify({ manual_status: manualStatus })
  }),
  syncAllTemplatesFromMeta: () => request('/notifications/templates/sync-from-meta', {
    method: 'POST'
  }),
  getNotificationLogs: (complaintId) => {
    const q = complaintId ? `?complaint_id=${complaintId}` : '';
    return request(`/notifications/logs${q}`);
  },
  resendNotification: (logId) => request(`/notifications/logs/${logId}/resend`, {
    method: 'POST'
  }),
  getSimulatedNotifications: () => request('/notifications/simulated'),
  clearSimulatedNotifications: () => request('/notifications/simulated', {
    method: 'DELETE'
  }),

  // In-App Notification Center
  getInAppNotifications: () => request('/in-app-notifications'),
  createInAppNotification: (notifData) => request('/in-app-notifications', {
    method: 'POST',
    body: JSON.stringify(notifData)
  }),
  markInAppNotificationRead: (id) => request(`/in-app-notifications/${id}/read`, {
    method: 'PUT'
  }),
  markAllInAppNotificationsRead: () => request('/in-app-notifications/read-all', {
    method: 'PUT'
  }),
  clearInAppNotifications: () => request('/in-app-notifications', {
    method: 'DELETE'
  }),

  // Reports
  getMetrics: () => request('/reports/metrics'),
  getExportCsvUrl: () => {
    const token = getAuthToken();
    return `${API_BASE}/reports/export-csv${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
  exportComplaintsCsv: async (complaintsFallback = []) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/reports/export-csv`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EcoGreen_Complaints_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return { success: true };
      }
    } catch (err) {
      console.warn('Server CSV export failed, using local export fallback:', err.message);
    }

    // Client-side fallback: export from active/permanent complaints
    const list = complaintsFallback && complaintsFallback.length > 0 ? complaintsFallback : getPermanentComplaints();
    if (!list || list.length === 0) {
      throw new Error('No complaints data available to export');
    }

    const headers = [
      'Ticket ID',
      'Registration Date & Time',
      'Customer Name',
      'Customer Mobile',
      'Customer Email',
      'Customer Address',
      'City / Village',
      'Location URL',
      'Consumer No',
      'Order No',
      'Invoice No',
      'Invoice Date',
      'Warranty Status',
      'Product Type',
      'Product Serial',
      'Installation ID',
      'Issue Category',
      'Issue Description',
      'Priority',
      'Current Stage / Status',
      'Assigned Technician Name',
      'Assigned Technician Phone',
      'Scheduled Visit Date',
      'Assigned Date & Time',
      'Last Stage Updated At',
      'Final Resolution Notes',
      'Spare Parts Used',
      'Resolved Date & Time',
      'Closed Date & Time',
      'Estimated Charges (Rs)',
      'Payment Collected (Rs)',
      'Payment Status',
      'Company Cash Settlement Status',
      'Cash Settled By',
      'Cash Settled Date',
      'Customer Rating (1-5)',
      'Customer Feedback Comments',
      'Registered By Staff',
      'Latest Update & Remark',
      'Complete History & Timeline Remarks'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(',')];
    for (const c of list) {
      const historyStr = Array.isArray(c.timeline) 
        ? c.timeline.map(t => `[${t.created_at || ''}] ${t.performed_by_name || 'User'} (${t.performed_by_role || ''}): ${t.action || ''}${t.notes ? ' - ' + t.notes : ''}`).join(' | ')
        : (c.full_history_remarks || '');
      const latestRemark = Array.isArray(c.timeline) && c.timeline.length > 0 
        ? `${c.timeline[c.timeline.length - 1].performed_by_name}: ${c.timeline[c.timeline.length - 1].action}${c.timeline[c.timeline.length - 1].notes ? ' - ' + c.timeline[c.timeline.length - 1].notes : ''}`
        : (c.latest_remark || '');

      csvRows.push([
        escapeCsv(c.ticket_id),
        escapeCsv(c.created_at),
        escapeCsv(c.customer_name),
        escapeCsv(c.customer_phone),
        escapeCsv(c.customer_email || ''),
        escapeCsv(c.customer_address),
        escapeCsv(c.city || ''),
        escapeCsv(c.location_url || ''),
        escapeCsv(c.consumer_no || ''),
        escapeCsv(c.order_no || ''),
        escapeCsv(c.invoice_no || ''),
        escapeCsv(c.invoice_date || ''),
        escapeCsv(c.is_in_warranty ? 'In Warranty (0-5 Yrs)' : 'Out of Warranty (5+ Yrs)'),
        escapeCsv(c.product_type),
        escapeCsv(c.product_serial || ''),
        escapeCsv(c.installation_id || ''),
        escapeCsv(c.issue_category),
        escapeCsv(c.issue_description || ''),
        escapeCsv(c.priority),
        escapeCsv(c.status),
        escapeCsv(c.technician_name || 'Unassigned'),
        escapeCsv(c.technician_phone || ''),
        escapeCsv(c.expected_visit_date || ''),
        escapeCsv(c.assigned_at || ''),
        escapeCsv(c.status_updated_at || ''),
        escapeCsv(c.resolution_notes || ''),
        escapeCsv(c.spare_parts_used || ''),
        escapeCsv(c.resolved_at || ''),
        escapeCsv(c.closed_at || ''),
        escapeCsv(c.estimated_charges || 0),
        escapeCsv(c.payment_collected || c.collected_amount || 0),
        escapeCsv(c.payment_status || 'Unpaid'),
        escapeCsv(c.company_settlement_status || 'Pending Settlement'),
        escapeCsv(c.company_settled_by || ''),
        escapeCsv(c.company_settled_at || ''),
        escapeCsv(c.rating || ''),
        escapeCsv(c.feedback_comments || ''),
        escapeCsv(c.registered_by_name || 'Staff'),
        escapeCsv(latestRemark),
        escapeCsv(historyStr)
      ].join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EcoGreen_Complaints_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return { success: true, count: list.length };
  },

  // Customer Directory & 5-Year Warranty Engine
  searchCustomers: async (query) => {
    const q = (query || '').trim().toLowerCase();
    let serverCustomers = [];
    try {
      const res = await request(`/customers/search?q=${encodeURIComponent(query || '')}`);
      if (res && Array.isArray(res.customers)) {
        serverCustomers = res.customers;
      }
    } catch (err) {
      console.warn('Server customer search notice, checking local directory cache:', err.message);
    }

    // Always merge & enrich with local Excel cache if available (e.g. order_no, dealer_name)
    try {
      const localCustomers = JSON.parse(localStorage.getItem('egs_uploaded_customers') || '[]');
      if (localCustomers.length > 0) {
        const localByConsumerNo = new Map();
        const localByName = new Map();
        const localByMobile = new Map();

        localCustomers.forEach(lc => {
          if (lc.consumer_no) localByConsumerNo.set(String(lc.consumer_no).trim(), lc);
          if (lc.customer_name) localByName.set(String(lc.customer_name).trim().toLowerCase(), lc);
          if (lc.consumer_mobile) {
            const m = String(lc.consumer_mobile).replace(/\D/g, '').slice(-10);
            if (m) localByMobile.set(m, lc);
          }
        });

        // Enrich server customers with local fields (especially order_no)
        serverCustomers = serverCustomers.map(sc => {
          const scMob = String(sc.consumer_mobile || sc.customer_phone || '').replace(/\D/g, '').slice(-10);
          const match = (sc.consumer_no && localByConsumerNo.get(String(sc.consumer_no).trim())) ||
                        (sc.customer_name && localByName.get(String(sc.customer_name).trim().toLowerCase())) ||
                        (scMob && localByMobile.get(scMob));
          if (match) {
            return {
              ...match,
              ...sc,
              order_no: sc.order_no || match.order_no || match.orderNo || '',
              dealer_name: sc.dealer_name || match.dealer_name || '',
              consumer_mobile: sc.consumer_mobile || match.consumer_mobile || match.phone || ''
            };
          }
          return sc;
        });

        // If server had no matches, fallback to filtering localCustomers
        if (serverCustomers.length === 0 && q) {
          const matches = localCustomers.filter(c => 
            (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
            (c.consumer_mobile && c.consumer_mobile.includes(q)) ||
            (c.consumer_no && c.consumer_no.toLowerCase().includes(q)) ||
            (c.city_village && c.city_village.toLowerCase().includes(q)) ||
            (c.invoice_no && c.invoice_no.toLowerCase().includes(q)) ||
            (c.order_no && c.order_no.toLowerCase().includes(q)) ||
            (c.dealer_name && c.dealer_name.toLowerCase().includes(q)) ||
            (c.inverter_serial && c.inverter_serial.toLowerCase().includes(q))
          ).slice(0, 25);
          return { customers: matches, totalMatches: matches.length };
        }
      }
    } catch (_) {}

    return { customers: serverCustomers, totalMatches: serverCustomers.length };
  },
  getCustomerStats: async () => {
    try {
      const res = await request('/customers/stats');
      if (res && res.totalCustomers !== undefined) {
        localStorage.setItem('egs_customer_stats', JSON.stringify(res));
        return res;
      }
    } catch (_) {}
    const cached = JSON.parse(localStorage.getItem('egs_customer_stats') || 'null');
    return cached || { totalCustomers: 0, inWarrantyCount: 0, outWarrantyCount: 0 };
  },
  syncCustomersBatch: (data) => {
    return request('/customers/sync', {
      method: 'POST',
      body: JSON.stringify(data || {})
    });
  },
  syncCustomersFromExcel: (data) => {
    if (data instanceof FormData) {
      return request('/customers/sync', {
        method: 'POST',
        body: data
      });
    }
    return request('/customers/sync', {
      method: 'POST',
      body: JSON.stringify(data || {})
    });
  },

  // WhatsApp Master Relay (Zero-Ban Local Chrome Relay Queue)
  getRelayStatus: () => request('/whatsapp/relay/status'),
  enqueueWhatsAppMessage: (data) => request('/whatsapp/queue', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Company Payment Settlement
  settleCompanyPayment: (id, data = {}) => request(`/complaints/${id}/settle-company`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Staff & Technician Updates
  updateTechnician: (id, data) => request(`/technicians/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  updateUser: (id, data) => request(`/auth/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // Dynamic Product Catalog
  getProducts: () => request('/products'),
  addProduct: (data) => request('/products', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteProduct: (id) => request(`/products/${id}`, {
    method: 'DELETE'
  }),

  // Dynamic Issue Categories
  getCategories: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/categories${qs ? '?' + qs : ''}`);
  },
  addCategory: (data) => request('/categories', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteCategory: (id) => request(`/categories/${id}`, {
    method: 'DELETE'
  }),

  // Official WhatsApp Cloud API Bidirectional Chat
  getComplaintWhatsAppMessages: (complaintId) => request(`/complaints/${complaintId}/whatsapp-messages`),
  sendComplaintWhatsAppReply: (complaintId, message) => request(`/complaints/${complaintId}/whatsapp-reply`, {
    method: 'POST',
    body: JSON.stringify({ message })
  }),

  // Universal WhatsApp Web Inbox API (Direct Server Source of Truth)
  getWhatsAppConversations: async () => {
    try {
      const res = await request('/whatsapp/conversations');
      return res || { success: true, conversations: [] };
    } catch (e) {
      console.warn('Error fetching conversations from server:', e.message);
      return { success: false, error: e.message, conversations: [] };
    }
  },

  getWhatsAppChatHistory: async (phone) => {
    try {
      const res = await request(`/whatsapp/chats/${encodeURIComponent(phone)}`);
      return res || { success: true, messages: [] };
    } catch (e) {
      console.warn('Error fetching chat history from server:', e.message);
      return { success: false, error: e.message, messages: [] };
    }
  },
  getWhatsAppRawEvents: (phone) => request(`/whatsapp/raw-events/${encodeURIComponent(phone)}`),
  syncBackupWhatsApp: () => Promise.resolve({ success: true }),
  sendWhatsAppDirectReply: async (phone, message, attachment = null, directMedia = null) => {
    let res;
    if (directMedia && directMedia.file_url) {
      res = await request('/whatsapp/direct-reply', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          message,
          media_url: directMedia.file_url,
          media_type: directMedia.file_type?.startsWith('image/') ? 'image' : (directMedia.file_type?.startsWith('video/') ? 'video' : 'document'),
          media_caption: directMedia.file_name
        })
      });
    } else if (attachment) {
      const formData = new FormData();
      formData.append('phone', phone);
      if (message) formData.append('message', message);
      formData.append('attachment', attachment);
      res = await request('/whatsapp/direct-reply', {
        method: 'POST',
        body: formData
      });
    } else {
      res = await request('/whatsapp/direct-reply', {
        method: 'POST',
        body: JSON.stringify({ phone, message })
      });
    }

    // Save outgoing reply to local permanent backup
    if (res && res.success) {
      saveWhatsAppMessagesPermanently([{
        phone: phone,
        sender_type: 'company',
        sender_name: 'Eco Green Support',
        message_body: (message || '').trim(),
        media_url: res.mediaUrl || directMedia?.file_url || null,
        media_type: attachment ? (attachment.type?.startsWith('image/') ? 'image' : (attachment.type?.startsWith('video/') ? 'video' : 'document')) : (directMedia ? (directMedia.file_type?.startsWith('image/') ? 'image' : (directMedia.file_type?.startsWith('video/') ? 'video' : 'document')) : null),
        media_caption: attachment?.name || directMedia?.file_name || null,
        created_at: new Date().toISOString()
      }]);
    }

    return res;
  },
  verifyWhatsAppNumber: (phone) => request(`/whatsapp/verify-number/${encodeURIComponent(phone)}`),
  setWhatsAppNumberStatus: (data) => request('/whatsapp/set-number-status', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  clearWhatsAppChat: (phone) => request(`/whatsapp/clear-chat/${encodeURIComponent(phone)}`, {
    method: 'POST'
  }),
  deleteWhatsAppConversation: (phone) => request(`/whatsapp/conversations/${encodeURIComponent(phone)}`, {
    method: 'DELETE'
  }),
  cleanupR2Orphans: () => request('/storage/r2/cleanup-orphans', {
    method: 'POST'
  }),
  updateWhatsAppContactName: (phone, name) => request('/whatsapp/update-contact-name', {
    method: 'POST',
    body: JSON.stringify({ phone, name })
  }),
  editWhatsAppMessage: (id, message_body) => request(`/whatsapp/messages/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ message_body })
  }),
  deleteWhatsAppMessage: (id) => request(`/whatsapp/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),
  retryWhatsAppMessage: (id) => request(`/whatsapp/retry-message/${encodeURIComponent(id)}`, {
    method: 'POST'
  }),
  resendTechnicianWorkOrder: (id) => request(`/complaints/${encodeURIComponent(id)}/resend-technician`, {
    method: 'POST'
  }),
  remindTechnician: (id) => request(`/complaints/${encodeURIComponent(id)}/send-reminder`, {
    method: 'POST'
  }),
  getPincodeDetails: (pincode) => request(`/location/pincode/${encodeURIComponent(pincode)}`),
  searchLocation: (query) => request(`/location/search?query=${encodeURIComponent(query)}`)
};

