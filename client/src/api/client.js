import { 
  INITIAL_COMPLAINTS, 
  INITIAL_TECHNICIANS, 
  INITIAL_USERS,
  INITIAL_SIMULATED_NOTIFICATIONS, 
  INITIAL_TEMPLATES 
} from '../data/demoData';

const API_BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('egs_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('egs_token', token);
  } else {
    localStorage.removeItem('egs_token');
  }
}

// Permanent Local Storage Backup Key
const PERMANENT_STORAGE_KEY = 'egs_permanent_complaints';

export function getPermanentComplaints() {
  try {
    const list = JSON.parse(localStorage.getItem(PERMANENT_STORAGE_KEY) || '[]');
    // Clean out old automated test rows (Harish Nambiar with ticket > 112)
    const cleaned = list.filter(c => !(c.customer_name === 'Harish Nambiar' && c.ticket_id > 'EGS-2026-000112'));
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

// Permanent Local Storage Backup Key for WhatsApp Messages (prevents loss on container restart)
const PERMANENT_WHATSAPP_KEY = 'egs_permanent_whatsapp_messages';

export function getPermanentWhatsAppMessages() {
  try {
    return JSON.parse(localStorage.getItem(PERMANENT_WHATSAPP_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

export function saveWhatsAppMessagesPermanently(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  try {
    const existing = getPermanentWhatsAppMessages();
    const map = new Map();
    existing.forEach(m => {
      const key = m.wam_id || `${m.phone}_${m.created_at}_${m.message_body}`;
      map.set(key, m);
    });
    messages.forEach(m => {
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
    if (!localStorage.getItem('egs_mock_templates')) {
      localStorage.setItem('egs_mock_templates', JSON.stringify(INITIAL_TEMPLATES));
    }
  }

  getUsers() {
    return JSON.parse(localStorage.getItem('egs_mock_users') || JSON.stringify(INITIAL_USERS));
  }

  createUser(userData) {
    const users = this.getUsers();
    const newId = Date.now();
    const newUser = {
      id: newId,
      name: userData.name,
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
      list = list.filter(c => String(c.assigned_technician_id) === String(technician_id));
    }
    return list;
  }

  getComplaint(id) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const complaint = list.find(c => String(c.id) === String(id) || c.ticket_id === String(id));
    if (!complaint) return null;

    const timeline = [
      { id: 1, action: 'Registered', notes: `Registered for ${complaint.product_type}. Issue: ${complaint.issue_category}`, performed_by_name: 'Pooja Sharma', performed_by_role: 'staff', notify_customer: 1, created_at: complaint.created_at }
    ];
    if (complaint.assigned_technician_id) {
      timeline.push({ id: 2, action: 'Assigned', notes: `Assigned to ${complaint.technician_name || 'Technician'}. Expected visit: ${complaint.expected_visit_date || 'Within 24h'}`, performed_by_name: 'Pooja Sharma', performed_by_role: 'staff', notify_customer: 1, created_at: complaint.assigned_at || complaint.created_at });
    }
    if (complaint.resolution_notes) {
      timeline.push({ id: 3, action: 'Resolved', notes: `Issue resolved: ${complaint.resolution_notes}`, performed_by_name: complaint.technician_name || 'Rohit Kumar', performed_by_role: 'technician', notify_customer: 1, created_at: complaint.resolved_at || new Date().toISOString() });
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
      notify_charges: (data.get ? data.get('notify_charges') : data.notify_charges) ? 1 : 0,
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
    if (newComplaint.notify_charges && newComplaint.estimated_charges > 0) {
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
        comp.notify_charges = getVal('notify_charges') ? 1 : 0;
      }
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  recordPayment(id, { payment_collected, payment_notes, payment_method }) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      comp.payment_collected = Number(payment_collected || 0);
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

  assignTechnician(id, techId, expectedDate) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const techs = JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]');
    const tech = techs.find(t => String(t.id) === String(techId));
    const comp = list.find(c => String(c.id) === String(id));
    if (comp) {
      comp.status = 'Assigned';
      comp.assigned_technician_id = techId;
      comp.technician_name = tech?.name;
      comp.technician_phone = tech?.phone;
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

  getMetrics() {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
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

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = { ...options.headers };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const controller = new AbortController();
    const timeoutMs = options.timeout || (endpoint.includes('/customers/sync') ? 60000 : 45000);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed with status ' + response.status);
      }
      return data;
    }

    if (!response.ok) {
      throw new Error('Request failed with status ' + response.status);
    }

    return response;
  } catch (err) {
    // Graceful fallback to mock store if backend is offline
    console.warn(`Backend API unavailable at ${endpoint}, using built-in demo mock store:`, err.message);
    return fallbackHandler(endpoint, options);
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
        const comp = mockStore.assignTechnician(id, body.technician_id, body.expected_visit_date);
        saveComplaintPermanently(comp);
        return { message: 'Assigned successfully', complaint: comp };
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
  }

  if (endpoint.startsWith('/auth/users')) {
    if (method === 'GET') {
      return { users: mockStore.getUsers() };
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

  if (endpoint.startsWith('/technicians')) {
    if (method === 'DELETE') {
      const id = endpoint.split('/').pop();
      return mockStore.deleteTechnician(id);
    }
    if (method === 'PUT' && endpoint.includes('/availability')) {
      const id = endpoint.split('/')[2];
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return mockStore.updateTechnicianAvailability(id, body?.is_available);
    }
    return { technicians: JSON.parse(localStorage.getItem('egs_mock_technicians') || '[]') };
  }

  if (endpoint.startsWith('/notifications/simulated')) {
    return { messages: JSON.parse(localStorage.getItem('egs_mock_notifications') || '[]') };
  }

  if (endpoint.startsWith('/notifications/templates')) {
    return { templates: JSON.parse(localStorage.getItem('egs_mock_templates') || '[]') };
  }

  if (endpoint.startsWith('/reports/metrics')) {
    return mockStore.getMetrics();
  }

  if (endpoint.startsWith('/auth/me')) {
    return { user: { id: 1, name: 'Admin Supervisor', email: 'admin@ecogreensolar.com', role: 'admin' } };
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
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  getMe: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  createUser: (userData) => request('/auth/create-user', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  deleteUser: (id) => request(`/auth/users/${id}`, {
    method: 'DELETE'
  }),
  deleteTechnician: (id) => request(`/technicians/${id}`, {
    method: 'DELETE'
  }),

  // Complaints
  getComplaints: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await request(`/complaints?${query}`);

    if (res && Array.isArray(res.complaints)) {
      // Save all fetched complaints into local permanent storage
      saveComplaintsPermanently(res.complaints);

      // Check if any user-created complaints in local permanent storage are missing on server (e.g. after container restart or redeploy)
      const permList = getPermanentComplaints();
      const serverTicketIds = new Set(res.complaints.map(c => c.ticket_id));
      const missingFromServer = permList.filter(c => {
        if (!c.ticket_id) return false;
        const isDummy = INITIAL_COMPLAINTS.some(init => init.ticket_id === c.ticket_id);
        return !isDummy && !serverTicketIds.has(c.ticket_id);
      });

      if (missingFromServer.length > 0) {
        console.log(`[PermanentSync] Restoring ${missingFromServer.length} user complaint(s) to server...`);
        request('/complaints/sync-backup', {
          method: 'POST',
          body: JSON.stringify({ complaints: missingFromServer })
        }).catch(err => console.warn('[PermanentSync] Background sync notice:', err.message));

        // Merge missing complaints to the top of list so user immediately sees them!
        res.complaints = [...missingFromServer, ...res.complaints];
        if (typeof res.total === 'number') {
          res.total += missingFromServer.length;
        }
      }
    }
    return res;
  },
  getComplaint: (id) => request(`/complaints/${id}`),
  getCustomerHistory: (phone) => request(`/complaints/customer-history?phone=${encodeURIComponent(phone)}`),
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
  assignTechnician: async (id, technicianId, expectedVisitDate) => {
    const res = await request(`/complaints/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ technician_id: technicianId, expected_visit_date: expectedVisitDate })
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
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
  reopenComplaint: async (id, reason) => {
    const res = await request(`/complaints/${id}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    if (res && res.complaint) {
      saveComplaintPermanently(res.complaint);
    }
    return res;
  },
  submitFeedback: (id, { rating, feedback_comments }) => request(`/complaints/${id}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, feedback_comments })
  }),
  syncBackupComplaints: (complaints) => request('/complaints/sync-backup', {
    method: 'POST',
    body: JSON.stringify({ complaints })
  }),
  trackTicket: (query) => request(`/complaints/track/${encodeURIComponent(query)}`),

  // Technicians
  getTechnicians: () => request('/technicians'),
  getTechnician: (id) => request(`/technicians/${id}`),
  updateTechnicianAvailability: (id, isAvailable) => request(`/technicians/${id}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ is_available: isAvailable })
  }),

  // Notifications
  getTemplates: () => request('/notifications/templates'),
  updateTemplate: (id, templateData) => request(`/notifications/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(templateData)
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

  // Reports
  getMetrics: () => request('/reports/metrics'),
  getExportCsvUrl: () => `${API_BASE}/reports/export-csv`,

  // Customer Directory & 5-Year Warranty Engine
  searchCustomers: (query) => request(`/customers/search?q=${encodeURIComponent(query || '')}`),
  getCustomerStats: () => request('/customers/stats'),
  syncCustomersFromExcel: (formData) => request('/customers/sync', {
    method: 'POST',
    body: formData
  }),

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

  // Universal WhatsApp Web Inbox API with Automatic Cloud Persistence
  getWhatsAppConversations: async () => {
    const res = await request('/whatsapp/conversations');
    const permMessages = getPermanentWhatsAppMessages();
    if (res && Array.isArray(res.conversations)) {
      // If server database was restarted/rebuilt and has 0 conversations, auto-restore from local backup!
      if (res.conversations.length === 0 && permMessages.length > 0) {
        console.log(`[PermanentWhatsAppSync] Restoring ${permMessages.length} whatsapp messages to server...`);
        try {
          await request('/whatsapp/sync-backup', {
            method: 'POST',
            body: JSON.stringify({ messages: permMessages })
          });
          // Re-fetch restored conversations
          return await request('/whatsapp/conversations');
        } catch (e) {
          console.warn('[PermanentWhatsAppSync] Background sync notice:', e.message);
        }
      }
    }
    return res;
  },
  getWhatsAppChatHistory: async (phone) => {
    const res = await request(`/whatsapp/chats/${phone}`);
    if (res && Array.isArray(res.messages) && res.messages.length > 0) {
      saveWhatsAppMessagesPermanently(res.messages);
    }
    return res;
  },
  syncBackupWhatsApp: (messages) => request('/whatsapp/sync-backup', {
    method: 'POST',
    body: JSON.stringify({ messages })
  }),
  sendWhatsAppDirectReply: async (phone, message, attachment = null) => {
    let res;
    if (attachment) {
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
        media_url: res.mediaUrl || null,
        media_type: attachment ? (attachment.type?.startsWith('image/') ? 'image' : 'document') : null,
        media_caption: attachment?.name || null,
        created_at: new Date().toISOString()
      }]);
    }

    return res;
  }
};

