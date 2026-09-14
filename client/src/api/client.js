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

// Local Storage Fallback Mock Store for seamless standalone demo execution
class LocalMockStore {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem('egs_mock_complaints')) {
      this.reset();
    }
  }

  reset() {
    localStorage.setItem('egs_mock_complaints', JSON.stringify(INITIAL_COMPLAINTS));
    localStorage.setItem('egs_mock_technicians', JSON.stringify(INITIAL_TECHNICIANS));
    localStorage.setItem('egs_mock_users', JSON.stringify(INITIAL_USERS));
    localStorage.setItem('egs_mock_notifications', JSON.stringify(INITIAL_SIMULATED_NOTIFICATIONS));
    localStorage.setItem('egs_mock_templates', JSON.stringify(INITIAL_TEMPLATES));
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
    const nextNum = 100 + list.length + 1;
    const ticket_id = `EGS-2026-000${nextNum}`;
    const newComplaint = {
      id: Date.now(),
      ticket_id,
      customer_name: data.get ? data.get('customer_name') : data.customer_name,
      customer_phone: data.get ? data.get('customer_phone') : data.customer_phone,
      customer_email: data.get ? data.get('customer_email') : data.customer_email,
      customer_address: data.get ? data.get('customer_address') : data.customer_address,
      product_type: data.get ? data.get('product_type') : data.product_type,
      product_serial: data.get ? data.get('product_serial') : data.product_serial,
      installation_id: data.get ? data.get('installation_id') : data.installation_id,
      issue_category: data.get ? data.get('issue_category') : data.issue_category,
      issue_description: data.get ? data.get('issue_description') : data.issue_description,
      priority: (data.get ? data.get('priority') : data.priority) || 'Medium',
      status: 'Registered',
      created_at: new Date().toISOString()
    };
    list.unshift(newComplaint);
    localStorage.setItem('egs_mock_complaints', JSON.stringify(list));

    // Also add simulated notification
    const notifs = JSON.parse(localStorage.getItem('egs_mock_notifications') || '[]');
    notifs.unshift({
      id: Date.now(),
      complaint_id: newComplaint.id,
      ticket_id: newComplaint.ticket_id,
      channel: 'whatsapp',
      recipient: newComplaint.customer_phone,
      template_key: 'complaint_registered',
      rendered_content: `☀️ *Eco Green Solar Support*\n\nDear ${newComplaint.customer_name}, your complaint ${newComplaint.ticket_id} for ${newComplaint.product_type} has been registered.\n\nExpected Response: Within 24-48 Hours.\nTrack status: http://localhost:5173/track/${newComplaint.ticket_id}`,
      status: 'sent',
      provider: 'SIMULATED',
      created_at: new Date().toISOString()
    });
    localStorage.setItem('egs_mock_notifications', JSON.stringify(notifs));

    return newComplaint;
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
      localStorage.setItem('egs_mock_complaints', JSON.stringify(list));
    }
    return comp;
  }

  addTimelineNote(id, { notes, status }) {
    const list = JSON.parse(localStorage.getItem('egs_mock_complaints') || '[]');
    const comp = list.find(c => String(c.id) === String(id));
    if (comp && status) {
      comp.status = status;
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
    const timeoutMs = options.timeout || (endpoint.includes('/customers/sync') ? 60000 : 8000);
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
        return { message: 'Complaint resolved', complaint: comp };
      }

      if (endpoint.includes('/close')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.closeComplaint(id, body.closure_remarks);
        return { message: 'Complaint closed', complaint: comp };
      }

      if (endpoint.includes('/reopen')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        const comp = mockStore.reopenComplaint(id, body.reason);
        return { message: 'Complaint reopened', complaint: comp };
      }

      if (endpoint.includes('/feedback')) {
        const id = endpoint.split('/')[2];
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        mockStore.submitFeedback(id, body);
        return { message: 'Thank you for your feedback!' };
      }

      // Create complaint
      const comp = mockStore.createComplaint(options.body);
      return { message: 'Complaint registered successfully', complaint: comp };
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
  getComplaints: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/complaints?${query}`);
  },
  getComplaint: (id) => request(`/complaints/${id}`),
  getCustomerHistory: (phone) => request(`/complaints/customer-history?phone=${encodeURIComponent(phone)}`),
  createComplaint: (formData) => request('/complaints', {
    method: 'POST',
    body: formData
  }),
  publicRegister: (formData) => request('/complaints/public-register', {
    method: 'POST',
    body: formData
  }),
  assignTechnician: (id, technicianId, expectedVisitDate) => request(`/complaints/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ technician_id: technicianId, expected_visit_date: expectedVisitDate })
  }),
  addTimelineNote: (id, { notes, status, notify_customer }) => request(`/complaints/${id}/note`, {
    method: 'POST',
    body: JSON.stringify({ notes, status, notify_customer })
  }),
  resolveComplaint: (id, formData) => request(`/complaints/${id}/resolve`, {
    method: 'POST',
    body: formData
  }),
  closeComplaint: (id, closureRemarks) => request(`/complaints/${id}/close`, {
    method: 'POST',
    body: JSON.stringify({ closure_remarks: closureRemarks })
  }),
  reopenComplaint: (id, reason) => request(`/complaints/${id}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  }),
  submitFeedback: (id, { rating, feedback_comments }) => request(`/complaints/${id}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, feedback_comments })
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
  })
};
