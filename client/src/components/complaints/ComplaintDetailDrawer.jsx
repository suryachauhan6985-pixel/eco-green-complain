import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { buildTechnicianAssignedWhatsApp, buildTechnicianWorkOrderWhatsApp } from '../../utils/templateUtils';
import { 
  X, User, Phone, Mail, MapPin, Calendar, Clock, Wrench, 
  Send, CheckCircle, AlertCircle, RefreshCw, Paperclip, MessageSquare, 
  History, RotateCcw, Check, Star, ShieldCheck, Tag, ChevronRight,
  Edit3, ExternalLink, IndianRupee, CreditCard, AlertTriangle, ShieldAlert,
  MessageCircle, Copy, Eye, FileText, UserCheck, Trash2, Plus, Loader2
} from 'lucide-react';
import { TicketAgeBadge } from '../common/TicketAgeBadge';
import { useDialog } from '../../context/DialogContext';

const STATUS_ORDER = ['Unassigned', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];

export const ComplaintDetailDrawer = ({ 
  complaintId, 
  isOpen, 
  onClose, 
  onComplaintUpdated,
  onViewCustomerHistory 
}) => {
  const { currentUser } = useAuth();
  const { confirm, alert, showToast } = useDialog();
  const [ticket, setTicket] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview | timeline | notifications

  // Actions state
  const [selectedTechId, setSelectedTechId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignSuccessModal, setAssignSuccessModal] = useState(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [resendingWorkOrder, setResendingWorkOrder] = useState(false);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [copiedCustWa, setCopiedCustWa] = useState(false);
  const [copiedTechWa, setCopiedTechWa] = useState(false);
  const [directSendingCust, setDirectSendingCust] = useState(false);
  const [directSentCust, setDirectSentCust] = useState(false);
  const [directSendingTech, setDirectSendingTech] = useState(false);
  const [directSentTech, setDirectSentTech] = useState(false);
  const [directSendingBoth, setDirectSendingBoth] = useState(false);
  const [directSentBoth, setDirectSentBoth] = useState(false);
  const [settlingCompany, setSettlingCompany] = useState(false);

  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState('');
  const [notifyCustomerToggle, setNotifyCustomerToggle] = useState(true);
  const [submittingNote, setSubmittingNote] = useState(false);

  const [resolutionNotes, setResolutionNotes] = useState('');
  const [spareParts, setSpareParts] = useState('');
  const [resolutionPhoto, setResolutionPhoto] = useState(null);
  const [resolving, setResolving] = useState(false);

  const [closureRemarks, setClosureRemarks] = useState('');
  const [closing, setClosing] = useState(false);

  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Edit Complaint Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Payment Recording State
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState({
    payment_collected: '',
    payment_method: 'Cash',
    payment_notes: ''
  });
  const [showUnderpaidWarning, setShowUnderpaidWarning] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [previewDocModal, setPreviewDocModal] = useState(null);
  const [uploadingAtt, setUploadingAtt] = useState(false);

  const handleUploadMoreAttachments = async (e) => {
    if (!e.target.files || e.target.files.length === 0 || !ticket) return;
    try {
      setUploadingAtt(true);
      const files = Array.from(e.target.files);
      const fd = new FormData();
      files.forEach(f => fd.append('attachments', f));
      const res = await api.uploadComplaintAttachments(ticket.id, fd);
      if (res && res.attachments) {
        setAttachments(prev => [...res.attachments, ...prev]);
        showToast(`${files.length} document/photo(s) attached successfully!`, 'success');
        if (onComplaintUpdated) onComplaintUpdated();
      }
    } catch (err) {
      showToast('Failed to upload attachment: ' + err.message, 'error');
    } finally {
      setUploadingAtt(false);
      e.target.value = '';
    }
  };

  // WhatsApp Live Chat State
  const [waChatMessages, setWaChatMessages] = useState([]);
  const [waReplyText, setWaReplyText] = useState('');
  const [sendingWaReply, setSendingWaReply] = useState(false);

  const fetchWhatsAppChat = async () => {
    if (!complaintId) return;
    try {
      if (api.getComplaintWhatsAppMessages) {
        const waData = await api.getComplaintWhatsAppMessages(complaintId);
        setWaChatMessages(waData.messages || []);
      }
    } catch (e) {
      console.warn('Failed to load WhatsApp messages:', e);
    }
  };

  const fetchTicketDetails = async () => {
    if (!complaintId) return;
    try {
      setLoading(true);
      const data = await api.getComplaint(complaintId);
      if (data && data.complaint) {
        setTicket(data.complaint);
        setAttachments(data.attachments || []);
        setTimeline(data.timeline || []);
        setNotifications(data.notifications || []);
        if (data.complaint.assigned_technician_id) {
          setSelectedTechId(String(data.complaint.assigned_technician_id));
        }
        if (data.complaint.expected_visit_date) {
          setExpectedDate(data.complaint.expected_visit_date);
        }
        setFollowUpStatus(data.complaint.status);
      }
    } catch (err) {
      console.error('Failed to load complaint details:', err);
    } finally {
      setLoading(false);
    }
    // Fetch WhatsApp chat asynchronously without blocking ticket display
    fetchWhatsAppChat();
  };

  const fetchTechs = async () => {
    try {
      const data = await api.getTechnicians();
      setTechnicians(data.technicians || []);
    } catch (e) {
      console.error('Failed to load technicians:', e);
    }
  };

  useEffect(() => {
    if (isOpen && complaintId) {
      setTicket(null); // Immediately reset ticket to trigger clean skeleton loader
      fetchTicketDetails();
      fetchTechs();
      const interval = setInterval(fetchWhatsAppChat, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, complaintId]);

  const handleSendWhatsAppReply = async (e) => {
    e.preventDefault();
    if (!waReplyText.trim()) return;
    try {
      setSendingWaReply(true);
      await api.sendComplaintWhatsAppReply(ticket.id, waReplyText.trim());
      setWaReplyText('');
      showToast('WhatsApp reply sent to customer!', 'success');
      await fetchWhatsAppChat();
      await fetchTicketDetails();
    } catch (err) {
      showToast('Failed to send WhatsApp message: ' + err.message, 'error');
    } finally {
      setSendingWaReply(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedTechId) return showToast('Please select a technician to assign', 'error');
    try {
      setAssigning(true);
      await api.assignTechnician(ticket.id, selectedTechId, expectedDate);
      setIsReassignOpen(false);
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();

      // Find assigned technician details
      const assignedTech = technicians.find(t => String(t.id) === String(selectedTechId));

      // Build dynamic WhatsApp links using latest backend template
      const customerWa = await buildTechnicianAssignedWhatsApp(ticket, assignedTech, expectedDate);
      const techWa = buildTechnicianWorkOrderWhatsApp(ticket, assignedTech, expectedDate);

      setDirectSentCust(false);
      setDirectSentTech(false);
      setDirectSentBoth(false);
      setAssignSuccessModal({
        ticket,
        tech: assignedTech,
        expectedDate,
        customerWa,
        techWa
      });
      showToast(`Technician ${assignedTech?.name || ''} assigned successfully!`, 'success');
    } catch (err) {
      showToast('Failed to assign technician: ' + err.message, 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleSendReminder = async () => {
    if (!ticket?.id) return;
    try {
      setSendingReminder(true);
      await api.remindTechnician(ticket.id);
      showToast(`Reminder WhatsApp sent to ${ticket.technician_name || 'technician'}!`, 'success');
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      showToast('Failed to send reminder: ' + err.message, 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleResendTechWorkOrder = async () => {
    if (!ticket?.id) return;
    try {
      setResendingWorkOrder(true);
      const res = await api.resendTechnicianWorkOrder(ticket.id);
      showToast(res.message || `Work order sent to ${ticket.technician_name || 'technician'} via WhatsApp!`, 'success');
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
    } catch (err) {
      showToast('Failed to resend work order: ' + err.message, 'error');
    } finally {
      setResendingWorkOrder(false);
    }
  };

  const handleDirectSendCustomer = async () => {
    if (!assignSuccessModal?.ticket?.customer_phone || !assignSuccessModal?.customerWa?.rawText) return;
    try {
      setDirectSendingCust(true);
      await api.sendDirectWhatsApp(assignSuccessModal.ticket.customer_phone, assignSuccessModal.customerWa.rawText);
      setDirectSentCust(true);
      showToast('Message sent to customer via WhatsApp!', 'success');
    } catch (e) {
      showToast('Failed to send to customer via WhatsApp: ' + e.message, 'error');
    } finally {
      setDirectSendingCust(false);
    }
  };

  const handleDirectSendTech = async () => {
    if (!assignSuccessModal?.tech?.phone || !assignSuccessModal?.techWa?.rawText) return;
    try {
      setDirectSendingTech(true);
      await api.sendDirectWhatsApp(assignSuccessModal.tech.phone, assignSuccessModal.techWa.rawText);
      setDirectSentTech(true);
      showToast('Work order sent to technician via WhatsApp!', 'success');
    } catch (e) {
      showToast('Failed to send to technician via WhatsApp: ' + e.message, 'error');
    } finally {
      setDirectSendingTech(false);
    }
  };

  const handleDirectSendBoth = async () => {
    try {
      setDirectSendingBoth(true);
      if (assignSuccessModal?.ticket?.customer_phone && assignSuccessModal?.customerWa?.rawText) {
        await api.sendDirectWhatsApp(assignSuccessModal.ticket.customer_phone, assignSuccessModal.customerWa.rawText);
        setDirectSentCust(true);
      }
      if (assignSuccessModal?.tech?.phone && assignSuccessModal?.techWa?.rawText) {
        await api.sendDirectWhatsApp(assignSuccessModal.tech.phone, assignSuccessModal.techWa.rawText);
        setDirectSentTech(true);
      }
      setDirectSentBoth(true);
      showToast('WhatsApp alerts sent to both Customer and Technician!', 'success');
    } catch (e) {
      showToast('Failed to send messages via WhatsApp: ' + e.message, 'error');
    } finally {
      setDirectSendingBoth(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!followUpNote.trim()) return;
    try {
      setSubmittingNote(true);
      await api.addTimelineNote(ticket.id, {
        notes: followUpNote,
        status: followUpStatus !== ticket.status ? followUpStatus : undefined,
        notify_customer: notifyCustomerToggle
      });
      setFollowUpNote('');
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
      showToast('Follow-up note added to ticket history', 'success');
    } catch (err) {
      showToast('Failed to add note: ' + err.message, 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) return showToast('Please enter resolution notes', 'error');
    try {
      setResolving(true);
      const data = new FormData();
      data.append('resolution_notes', resolutionNotes);
      if (spareParts) data.append('spare_parts_used', spareParts);
      if (resolutionPhoto) data.append('closing_photo', resolutionPhoto);

      await api.resolveComplaint(ticket.id, data);
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
      showToast('Complaint resolved successfully!', 'success');
    } catch (err) {
      showToast('Failed to resolve complaint: ' + err.message, 'error');
    } finally {
      setResolving(false);
    }
  };

  const handleCloseTicket = async () => {
    try {
      setClosing(true);
      await api.closeComplaint(ticket.id, closureRemarks);
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
      showToast('Ticket closed successfully!', 'success');
    } catch (err) {
      showToast('Failed to close ticket: ' + err.message, 'error');
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    try {
      setReopening(true);
      await api.reopenComplaint(ticket.id, reopenReason);
      setReopenReason('');
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
      showToast('Complaint ticket reopened successfully', 'info');
    } catch (err) {
      showToast('Failed to reopen ticket: ' + err.message, 'error');
    } finally {
      setReopening(false);
    }
  };

  const openEditModal = () => {
    if (!ticket) return;
    setEditFormData({
      customer_name: ticket.customer_name || '',
      customer_phone: ticket.customer_phone || '',
      customer_email: ticket.customer_email || '',
      customer_address: ticket.customer_address || '',
      city: ticket.city || '',
      consumer_no: ticket.consumer_no || '',
      order_no: ticket.order_no || '',
      invoice_no: ticket.invoice_no || '',
      invoice_date: ticket.invoice_date || '',
      location_url: ticket.location_url || '',
      is_in_warranty: ticket.is_in_warranty !== undefined ? ticket.is_in_warranty : 1,
      estimated_charges: ticket.estimated_charges !== undefined ? ticket.estimated_charges : 0,
      notify_charges: ticket.notify_charges === 1,
      product_type: ticket.product_type || 'Solar Rooftop Systems',
      product_serial: ticket.product_serial || '',
      installation_id: ticket.installation_id || '',
      issue_category: ticket.issue_category || '',
      issue_description: ticket.issue_description || '',
      priority: ticket.priority || 'Medium',
      status: ticket.status === 'Registered' ? 'Unassigned' : (ticket.status || 'Unassigned')
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      setSavingEdit(true);
      await api.updateComplaint(ticket.id, editFormData);
      await fetchTicketDetails();
      setIsEditing(false);
      if (onComplaintUpdated) onComplaintUpdated();
      showToast('Complaint details updated successfully!', 'success');
    } catch (err) {
      showToast('Failed to update complaint: ' + err.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const scrollToTechnicianAssignment = () => {
    setActiveTab('overview');
    setTimeout(() => {
      const el = document.getElementById('technician-assignment-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50/50');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-50/50');
        }, 2500);
        const selectEl = el.querySelector('select');
        if (selectEl) {
          selectEl.focus();
        }
      }
    }, 100);
  };

  const openPaymentModal = () => {
    if (!ticket.assigned_technician_id) {
      scrollToTechnicianAssignment();
      return;
    }
    setPaymentData({
      payment_collected: ticket.payment_collected > 0 ? String(ticket.payment_collected) : (ticket.estimated_charges > 0 ? String(ticket.estimated_charges) : ''),
      payment_method: 'Cash',
      payment_notes: ''
    });
    setShowUnderpaidWarning(false);
    setIsRecordingPayment(true);
  };

  const handleRecordPaymentSubmit = async (forceSubmit = false) => {
    if (!ticket.assigned_technician_id) {
      setIsRecordingPayment(false);
      scrollToTechnicianAssignment();
      return;
    }

    const entered = Number(paymentData.payment_collected || 0);
    const expected = Number(ticket.estimated_charges || 0);

    if (!forceSubmit && expected > 0 && entered < expected) {
      setShowUnderpaidWarning(true);
      return;
    }

    try {
      setSavingPayment(true);
      await api.recordPayment(ticket.id, paymentData);
      await fetchTicketDetails();
      setIsRecordingPayment(false);
      setShowUnderpaidWarning(false);
      if (onComplaintUpdated) onComplaintUpdated();
      showToast('Payment collected recorded successfully!', 'success');
    } catch (err) {
      showToast('Failed to record payment: ' + err.message, 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSettleWithCompany = async () => {
    if (!ticket) return;
    if (!ticket.assigned_technician_id) {
      await alert({
        title: 'Technician Assignment Required',
        message: 'Cannot settle technician cash on an unassigned complaint. Please assign a technician first.',
        type: 'warning'
      });
      return;
    }
    const techName = ticket.assigned_tech_name || ticket.technician_name || 'the technician';
    const ok = await confirm({
      title: 'Confirm Company Cash Deposit',
      message: `Confirm cash receipt of ₹${ticket.payment_collected} collected by ${techName} into Eco Green Solar Company account?`,
      type: 'payment',
      confirmText: `Receive ₹${ticket.payment_collected}`,
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      setSettlingCompany(true);
      await api.settleCompanyPayment(ticket.id, {
        notes: `Cash received from technician ${techName} by ${currentUser?.name || 'Staff'}`
      });
      await fetchTicketDetails();
      if (onComplaintUpdated) onComplaintUpdated();
      showToast(`₹${ticket.payment_collected} marked as received & settled with company!`, 'success');
    } catch (err) {
      showToast('Failed to settle payment with company: ' + err.message, 'error');
    } finally {
      setSettlingCompany(false);
    }
  };

  const handleDeleteComplaint = async () => {
    if (!ticket) return;
    const ok = await confirm({
      title: 'Delete Complaint Ticket?',
      message: `Are you sure you want to permanently delete Ticket #${ticket.ticket_id} for "${ticket.customer_name}"? All timeline events, attachments, and alerts will be deleted permanently. This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await api.deleteComplaint(ticket.id);
      showToast(`Ticket #${ticket.ticket_id} deleted successfully!`, 'success');
      if (onComplaintUpdated) onComplaintUpdated();
      onClose();
    } catch (err) {
      showToast('Failed to delete complaint: ' + err.message, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto max-w-full flex w-full sm:w-auto">
        <div className="w-full sm:w-screen sm:max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="px-3.5 sm:px-6 py-3 sm:py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 gap-2 shrink-0">
            <div className="min-w-0 flex-1">
              {!ticket ? (
                <div className="flex items-center gap-2 py-0.5">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-400 bg-emerald-950/90 px-3 py-1.5 rounded-lg border border-emerald-800/80 shadow-xs">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    <span>Loading Ticket Details...</span>
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:inline font-medium animate-pulse">Syncing live data...</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded">
                      {ticket.ticket_id}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase ${
                      ticket.status === 'Resolved' ? 'bg-emerald-600 text-white' :
                      ticket.status === 'Closed' ? 'bg-slate-700 text-slate-200' :
                      ticket.status === 'In Progress' ? 'bg-blue-600 text-white' :
                      ticket.status === 'On Hold' ? 'bg-purple-600 text-white' :
                      ticket.status === 'Assigned' ? 'bg-indigo-600 text-white' :
                      ticket.status === 'Reopened' ? 'bg-rose-600 text-white' :
                      'bg-amber-500 text-slate-950'
                    }`}>
                      {ticket.status === 'Registered' ? 'Unassigned' : ticket.status}
                    </span>
                    <TicketAgeBadge complaint={ticket} />
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      ticket.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                      ticket.priority === 'Medium' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {ticket.priority} Priority
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                    {ticket.product_type} — {ticket.issue_category}
                  </h3>
                </>
              )}
            </div>

            {/* Action & Close Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {['admin', 'staff'].includes(currentUser?.role) && ticket && (
                <>
                  <button
                    onClick={openEditModal}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                    title="Edit all complaint details"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit Details</span>
                  </button>
                  <button
                    onClick={handleDeleteComplaint}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                    title="Delete Complaint Permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </>
              )}

              <button 
                onClick={onClose}
                className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 active:bg-rose-600 border border-slate-700 rounded-xl text-slate-200 hover:text-white flex items-center gap-1.5 transition-all shadow-md shrink-0"
                title="Close Ticket Window"
              >
                <X className="w-5 h-5 text-rose-400 stroke-[2.5]" />
                <span className="text-xs font-bold text-white pr-0.5">Close</span>
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="px-3.5 sm:px-6 bg-slate-100 border-b border-slate-200 flex items-center justify-between overflow-x-auto shrink-0">
            <div className="flex gap-2 sm:gap-4 text-xs font-semibold whitespace-nowrap">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Ticket Overview & Actions
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'timeline'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Audit Timeline ({timeline.length})
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'notifications'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Dispatched Alerts ({notifications.length})
              </button>
              <button
                onClick={() => setActiveTab('whatsapp')}
                className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'whatsapp'
                    ? 'border-emerald-600 text-emerald-800 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>WhatsApp Live Chat</span>
                {waChatMessages.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                    {waChatMessages.length}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={fetchTicketDetails}
              title="Refresh details"
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {loading && !ticket ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Modern Pulse Status Bar */}
                <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">
                        Fetching live ticket details...
                      </span>
                      <span className="text-[10px] text-emerald-700 block font-medium">
                        Loading customer contacts, service location, and field work order
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold text-emerald-800 bg-white border border-emerald-200 shadow-2xs">
                    Syncing...
                  </span>
                </div>

                {/* Skeleton Card 1: Customer Details */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-4 bg-slate-300/80 rounded w-36"></div>
                    <div className="h-4 bg-slate-200 rounded w-20"></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="h-10 bg-slate-200/70 rounded-xl"></div>
                    <div className="h-10 bg-slate-200/70 rounded-xl"></div>
                  </div>
                  <div className="h-14 bg-slate-200/70 rounded-xl"></div>
                </div>

                {/* Skeleton Card 2: Product & Issue */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3 animate-pulse">
                  <div className="h-4 bg-slate-300/80 rounded w-44"></div>
                  <div className="h-16 bg-slate-200/70 rounded-xl"></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-9 bg-slate-200/70 rounded-xl"></div>
                    <div className="h-9 bg-slate-200/70 rounded-xl"></div>
                  </div>
                </div>

                {/* Skeleton Card 3: Action & Field Notes */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3 animate-pulse">
                  <div className="h-4 bg-slate-300/80 rounded w-32"></div>
                  <div className="h-20 bg-slate-200/70 rounded-xl"></div>
                  <div className="h-10 bg-emerald-100/70 rounded-xl"></div>
                </div>
              </div>
            ) : ticket ? (
              <>
                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Customer Info Card */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-700" />
                          Customer Details
                        </h4>
                        <button
                          onClick={() => onViewCustomerHistory(ticket.customer_phone)}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-0.5"
                        >
                          View Past History ({ticket.customer_phone})
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Name:</span>
                          <strong className="text-slate-900">{ticket.customer_name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Phone (WhatsApp):</span>
                          <a href={`tel:${ticket.customer_phone}`} className="font-mono text-emerald-700 font-semibold hover:underline">
                            {ticket.customer_phone}
                          </a>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Email:</span>
                          <span className="text-slate-800">{ticket.customer_email || 'Not provided'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">City / Village:</span>
                          <span className="text-slate-800 font-medium">{ticket.city || 'Not specified'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[11px]">Installation Address:</span>
                          <span className="text-slate-800">{ticket.customer_address}</span>
                        </div>

                        {/* Customer Location URL Map Button */}
                        {ticket.location_url && (
                          <div className="sm:col-span-2 pt-1">
                            <a
                              href={ticket.location_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors shadow-2xs"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-600" />
                              Open Customer Site Location on Google Maps
                              <ExternalLink className="w-3 h-3 text-blue-500" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* System & Warranty Status Card */}
                    <div className="bg-white rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-emerald-700" />
                          System & Warranty Information
                        </h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border ${
                          ticket.is_in_warranty 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          {ticket.is_in_warranty ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> : <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />}
                          {ticket.is_in_warranty ? 'IN WARRANTY' : 'OUT OF WARRANTY'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs text-slate-700">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Invoice No:</span>
                          <span className="font-mono font-semibold text-slate-800">{ticket.invoice_no || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Invoice Date:</span>
                          <span className="font-mono font-semibold text-slate-800">{ticket.invoice_date || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Consumer No:</span>
                          <span className="font-mono font-semibold text-slate-800">{ticket.consumer_no || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Order No:</span>
                          <span className="font-mono font-semibold text-slate-800">{ticket.order_no || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Product Serial:</span>
                          <span className="font-mono text-slate-800">{ticket.product_serial || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Installation ID:</span>
                          <span className="font-mono text-slate-800">{ticket.installation_id || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Estimated Charges & Payment Collection Card */}
                    <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                          <IndianRupee className="w-3.5 h-3.5 text-amber-700" />
                          Service Charges & Payment Collection
                        </h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          ticket.payment_status === 'Collected' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          ticket.payment_status === 'Partially Paid' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          'bg-amber-100 text-amber-900 border-amber-200'
                        }`}>
                          {ticket.payment_status || 'Unpaid'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-800 my-2">
                        <div className="bg-white p-2.5 rounded-lg border border-amber-100">
                          <span className="text-[11px] text-slate-500 block">Quoted Service Charge:</span>
                          <strong className="text-base font-black text-slate-900">₹{ticket.estimated_charges || 0}</strong>
                          {ticket.notify_charges === 1 && (
                            <span className="text-[10px] text-emerald-700 block font-semibold">✓ Customer Notified</span>
                          )}
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-amber-100">
                          <span className="text-[11px] text-slate-500 block">Payment Collected:</span>
                          <strong className="text-base font-black text-emerald-700">₹{ticket.payment_collected || 0}</strong>
                          <span className="text-[10px] text-slate-500 block">Status: {ticket.payment_status || 'Unpaid'}</span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-amber-100 flex flex-col justify-center">
                          {(ticket.assigned_technician_id || ticket.technician_name || currentUser?.role === 'technician') ? (
                            <button
                              type="button"
                              onClick={openPaymentModal}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Record Payment Collected
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={scrollToTechnicianAssignment}
                              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                              title="Assign a technician to enable payment collection"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Assign Tech to Collect
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Prominent warning if no technician is assigned (only shown to admin/staff) */}
                      {!(ticket.assigned_technician_id || ticket.technician_name) && currentUser?.role !== 'technician' && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1 flex-1">
                            <strong className="block font-bold text-amber-950">Technician Assignment Required</strong>
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                              A technician must be assigned to this ticket before service charges can be collected or recorded.
                            </p>
                            <button
                              type="button"
                              onClick={scrollToTechnicianAssignment}
                              className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 underline transition-colors cursor-pointer"
                            >
                              <span>Assign Technician Now</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Company Settlement Status Banner */}
                      {Number(ticket.payment_collected || 0) > 0 && (
                        <div className={`mt-3 p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
                          ticket.company_settlement_status === 'Settled with Company'
                            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                            : 'bg-amber-50/90 border-amber-200 text-amber-950'
                        }`}>
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="font-bold flex items-center gap-1.5">
                              {ticket.company_settlement_status === 'Settled with Company' ? (
                                <span className="text-emerald-800 font-extrabold flex items-center gap-1">
                                  ✓ Received into Company Account (Settled)
                                </span>
                              ) : (
                                <span className="text-amber-800 font-extrabold flex items-center gap-1">
                                  ⚠️ Cash in Hand with Technician (Pending Company Deposit)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                              {ticket.company_settlement_status === 'Settled with Company' ? (
                                <>Amount ₹<strong>{ticket.payment_collected}</strong> {ticket.payment_collected_at ? `(collected on ${new Date(ticket.payment_collected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date(ticket.payment_collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})` : ''} received by <strong>{ticket.company_settled_by || 'Admin'}</strong> on {ticket.company_settled_at ? new Date(ticket.company_settled_at).toLocaleString('en-IN') : 'N/A'}.</>
                              ) : (
                                <>₹<strong>{ticket.payment_collected}</strong> was collected {ticket.payment_collected_at ? `on ${new Date(ticket.payment_collected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date(ticket.payment_collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''} by <strong>{ticket.assigned_tech_name || ticket.technician_name || 'the technician'}</strong> and is currently in technician's possession.</>
                              )}
                            </p>
                          </div>

                          {ticket.company_settlement_status !== 'Settled with Company' && ['admin', 'staff'].includes(currentUser?.role) && (
                            <button
                              type="button"
                              disabled={settlingCompany || !ticket.assigned_technician_id}
                              onClick={handleSettleWithCompany}
                              title={!ticket.assigned_technician_id ? 'Assign technician first before collecting' : 'Receive cash from technician into company account'}
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 shadow-sm transition-all flex items-center gap-1.5 ${
                                !ticket.assigned_technician_id
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              <IndianRupee className="w-3.5 h-3.5" />
                              {settlingCompany ? 'Settling...' : 'Collect from Tech'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Issue Description */}
                    <div className="bg-white rounded-xl p-4 border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                        Issue Description & Diagnostics
                      </h4>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {ticket.issue_description}
                      </p>

                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5 text-emerald-600" /> Attached Proof Documents / Photos ({attachments.length}):
                          </span>
                          <label className="cursor-pointer px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors">
                            {uploadingAtt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            <span>{uploadingAtt ? 'Uploading...' : 'Add Photo / Doc'}</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*,application/pdf"
                              className="hidden"
                              disabled={uploadingAtt}
                              onChange={handleUploadMoreAttachments}
                            />
                          </label>
                        </div>
                        {attachments.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {attachments.map((att) => {
                              const fileUrl = att.file_data || att.file_url || `/api/attachments/${att.id}`;
                              const isImg = att.file_type?.startsWith('image/') || 
                                            (fileUrl && fileUrl.startsWith('data:image/')) || 
                                            (fileUrl && fileUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) || 
                                            (att.file_name?.match(/\.(jpeg|jpg|gif|png|webp)$/i));
                              return (
                                <div
                                  key={att.id}
                                  className="group bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-xl p-2 transition-all flex items-center gap-2 relative overflow-hidden"
                                >
                                  {isImg ? (
                                    <div className="relative w-12 h-12 shrink-0">
                                      <img
                                        src={fileUrl}
                                        alt={att.file_name}
                                        onClick={() => setPreviewDocModal({ url: fileUrl, name: att.file_name, isImage: true })}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          if (e.currentTarget.nextElementSibling) {
                                            e.currentTarget.nextElementSibling.style.display = 'flex';
                                          }
                                        }}
                                        className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-85 transition-opacity"
                                        title="Click to view full photo"
                                      />
                                      <div className="hidden w-12 h-12 bg-slate-100 rounded-lg items-center justify-center text-slate-500 border border-slate-200">
                                        <FileText className="w-5 h-5 text-emerald-600" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-12 h-12 bg-slate-200/70 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                                      <Paperclip className="w-5 h-5" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-bold text-slate-800 truncate" title={att.file_name}>
                                      {att.file_name}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => isImg ? setPreviewDocModal({ url: fileUrl, name: att.file_name, isImage: true }) : window.open(fileUrl, '_blank')}
                                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 cursor-pointer bg-emerald-100/70 px-1.5 py-0.5 rounded"
                                      >
                                        <Eye className="w-3 h-3" /> Preview
                                      </button>
                                      <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={att.file_name}
                                        className="text-[10px] text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                                        title="Open or download file"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No proof photos or documents attached yet.</p>
                        )}
                      </div>
                    </div>

                    {/* Rating & Feedback Banner if available */}
                    {ticket.rating && (
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-amber-950">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex text-amber-500">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${star <= ticket.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-bold">{ticket.rating} out of 5 Stars</span>
                        </div>
                        {ticket.feedback_comments && (
                          <p className="text-xs italic text-slate-700 mt-1">
                            "{ticket.feedback_comments}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* ASSIGNMENT SECTION */}
                    {(ticket.assigned_technician_id || ticket.technician_name || ['admin', 'staff'].includes(currentUser?.role) || currentUser?.role === 'technician') && (
                      <div 
                        id="technician-assignment-section" 
                        className="bg-white rounded-xl p-4 border border-slate-200 space-y-3 scroll-mt-6 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-emerald-700" />
                            Technician Allocation & Field Dispatch
                          </h4>
                          {(ticket.assigned_technician_id || ticket.technician_name) && ['admin', 'staff'].includes(currentUser?.role) && (
                            <button
                              type="button"
                              onClick={() => setIsReassignOpen(!isReassignOpen)}
                              className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{isReassignOpen ? 'Cancel Reassign' : 'Reassign Specialist'}</span>
                            </button>
                          )}
                        </div>

                        {/* Active Assigned Specialist Card */}
                        {(ticket.assigned_technician_id || ticket.technician_name || currentUser?.role === 'technician') ? (
                          <div className="bg-gradient-to-br from-emerald-50/80 to-slate-50 rounded-xl p-4 border border-emerald-200 space-y-3 shadow-2xs">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                                  👨‍🔧
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-bold text-slate-900 text-sm">
                                      {ticket.technician_name || (currentUser?.role === 'technician' ? currentUser.name : 'Field Technician')}
                                      {currentUser?.role === 'technician' ? ' (You)' : ''}
                                    </h5>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      {currentUser?.role === 'technician' ? '✓ Assigned to You' : '✓ Currently Assigned'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                                    {ticket.technician_zone || (technicians.find(t => String(t.id) === String(ticket.assigned_technician_id))?.area_zone) || 'Field Service Zone'}
                                    {ticket.technician_specialization ? ` • ${ticket.technician_specialization}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-start">
                                {currentUser?.role === 'technician' ? (
                                  /* Technician Quick Actions to Customer */
                                  <div className="flex items-center gap-1.5">
                                    <a
                                      href={`tel:${ticket.customer_phone}`}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                                      title="Call Customer"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                      <span>Call Customer</span>
                                    </a>
                                    <a
                                      href={`https://wa.me/${(ticket.customer_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Namaste ${ticket.customer_name}, I am your Eco Green Solar service technician for ticket ${ticket.ticket_id}.`)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                                      title="WhatsApp Customer"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      <span>WhatsApp</span>
                                    </a>
                                  </div>
                                ) : (
                                  /* Staff/Admin Actions to Technician */
                                  <>
                                    {(() => {
                                      const tPhone = ticket.technician_phone || (technicians.find(t => String(t.id) === String(ticket.assigned_technician_id))?.phone);
                                      const raw = (tPhone || '').replace(/[^0-9]/g, '');
                                      if (!raw) return null;
                                      const cleanTPhone = raw.startsWith('91') ? raw : `91${raw}`;
                                      const workOrderText = 
                                        `⚡ *ECO GREEN SOLAR - SERVICE WORK ORDER* ⚡\n\n` +
                                        `👨‍🔧 *Technician:* ${ticket.technician_name || 'Assigned Technician'}\n` +
                                        `🎫 *Ticket ID:* ${ticket.ticket_id}\n` +
                                        `🚨 *Priority:* ${ticket.priority || 'Normal'}\n` +
                                        `📅 *Scheduled Visit:* ${ticket.expected_visit_date || 'Immediate / Today'}\n\n` +
                                        `👤 *CUSTOMER DETAILS*\n` +
                                        `• Name: ${ticket.customer_name}\n` +
                                        `• Mobile: ${ticket.customer_phone}\n` +
                                        `• Address: ${ticket.customer_address || 'Not Provided'}\n\n` +
                                        `☀️ *SYSTEM & ISSUE DETAILS*\n` +
                                        `• System: ${ticket.product_type || 'Solar System'}\n` +
                                        `• Issue: ${ticket.issue_category || 'Service Request'}\n` +
                                        `• Problem: ${ticket.description || 'On-site inspection & service'}\n\n` +
                                        `👉 *Open Ticket in App:* ${window.location.origin}/?ticket=${ticket.ticket_id}\n\n` +
                                        `- Central Dispatch Desk (Eco Green Solar)`;

                                      return (
                                        <a
                                          href={`https://wa.me/${cleanTPhone}?text=${encodeURIComponent(workOrderText)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="px-2.5 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                                          title="Send complete work order directly to technician via WhatsApp Web / App"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5" />
                                          <span>WhatsApp Work Order</span>
                                        </a>
                                      );
                                    })()}

                                    {/* Resend via WhatsApp Cloud API Button */}
                                    <button
                                      type="button"
                                      onClick={handleResendTechWorkOrder}
                                      disabled={resendingWorkOrder}
                                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-300 flex items-center gap-1 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                                      title="Resend official WhatsApp Template work order to technician without notifying customer"
                                    >
                                      <Send className={`w-3.5 h-3.5 text-emerald-700 ${resendingWorkOrder ? 'animate-spin' : ''}`} />
                                      <span>{resendingWorkOrder ? 'Sending...' : 'Resend API'}</span>
                                    </button>

                                    {/* Send Visit Reminder Button */}
                                    <button
                                      type="button"
                                      onClick={handleSendReminder}
                                      disabled={sendingReminder}
                                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold border border-slate-300 flex items-center gap-1 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                                      title="Send instant WhatsApp visit reminder to technician"
                                    >
                                      <Clock className={`w-3.5 h-3.5 text-amber-600 ${sendingReminder ? 'animate-spin' : ''}`} />
                                      <span>{sendingReminder ? 'Sending...' : 'Send Reminder'}</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Schedule & Phone Bar */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-100 text-xs">
                              <div className="flex items-center gap-2 text-slate-700">
                                <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>
                                  Scheduled Visit: <strong className="text-slate-900 font-bold">{ticket.expected_visit_date || 'Within 24-48 Hours'}</strong>
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-700">
                                <Phone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>
                                  Tech Mobile: <strong className="text-slate-900 font-mono font-bold">{ticket.technician_phone || (technicians.find(t => String(t.id) === String(ticket.assigned_technician_id))?.phone) || 'Contact on file'}</strong>
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="font-bold">No Technician Assigned Yet</span>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded">
                              Action Required
                            </span>
                          </div>
                        )}

                        {/* Reassignment or Initial Assignment Form (Only for Admin & Staff) */}
                        {['admin', 'staff'].includes(currentUser?.role) && (!(ticket.assigned_technician_id || ticket.technician_name) || isReassignOpen) && (
                          <form onSubmit={handleAssign} className="space-y-3 pt-2 border-t border-slate-100">
                            {isReassignOpen && (
                              <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                ℹ️ Reassigning will notify the new technician with work order details and alert the previous technician that this ticket was transferred.
                              </p>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  {ticket.assigned_technician_id ? 'Select New Specialist *' : 'Select Technician *'}
                                </label>
                                <select
                                  value={selectedTechId}
                                  onChange={(e) => setSelectedTechId(e.target.value)}
                                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                >
                                  <option value="">-- Choose Field Specialist --</option>
                                  {technicians.map((t) => (
                                    <option 
                                      key={t.id} 
                                      value={t.id}
                                      className={!t.is_available ? 'text-slate-400 bg-slate-100' : 'text-slate-900'}
                                    >
                                      {t.is_available ? '🟢' : '🔴'} {t.name} ({t.area_zone}) — {t.is_available ? `${t.active_tickets_count || 0} Active` : 'OFF-DUTY (On Leave)'}
                                    </option>
                                  ))}
                                </select>

                                {/* Warning Banner if selected technician is Off-Duty */}
                                {(() => {
                                  const pickedTech = technicians.find(t => String(t.id) === String(selectedTechId));
                                  if (pickedTech && !pickedTech.is_available) {
                                    return (
                                      <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 animate-in fade-in duration-150 shadow-2xs">
                                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                          <p className="font-bold text-amber-800">⚠️ Technician is Currently Off-Duty</p>
                                          <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                                            <strong>{pickedTech.name}</strong> is marked Off-Duty (on leave or unavailable). Assigning this ticket may lead to SLA breach or delayed customer inspection.
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Expected Visit Date</label>
                                <input
                                  type="date"
                                  value={expectedDate}
                                  onChange={(e) => setExpectedDate(e.target.value)}
                                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <p className="text-[11px] text-slate-500">
                                Auto-notifies technician & customer with expected visit time.
                              </p>
                              <div className="flex items-center gap-2">
                                {isReassignOpen && (
                                  <button
                                    type="button"
                                    onClick={() => setIsReassignOpen(false)}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                )}
                                <button
                                  type="submit"
                                  disabled={assigning || !selectedTechId}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <Wrench className="w-3.5 h-3.5" />
                                  {assigning ? 'Assigning...' : (ticket.assigned_technician_id ? 'Update & Reassign Specialist' : 'Assign & Send Alerts')}
                                </button>
                              </div>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {/* FOLLOW-UP NOTE / VISIT LOG SECTION */}
                    <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-700" />
                        Log Site Visit / Follow-up Note
                      </h4>

                      <form onSubmit={handleAddNote} className="space-y-3">
                        <textarea
                          rows={2}
                          required
                          placeholder="e.g., Reached site, inspected DC array. Awaiting replacement surge protector..."
                          value={followUpNote}
                          onChange={(e) => setFollowUpNote(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">Update Status:</span>
                            <select
                              value={followUpStatus}
                              onChange={(e) => setFollowUpStatus(e.target.value)}
                              className="text-xs px-2 py-1 bg-white border border-slate-300 rounded font-medium"
                            >
                              {(currentUser?.role === 'technician'
                                ? ['In Progress', 'On Hold']
                                : STATUS_ORDER
                              ).map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={notifyCustomerToggle}
                              onChange={(e) => setNotifyCustomerToggle(e.target.checked)}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-[11px] font-semibold text-slate-700">
                              Notify Customer (WhatsApp + Email)
                            </span>
                          </label>

                          <button
                            type="submit"
                            disabled={submittingNote || !followUpNote.trim()}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            Add Note
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* RESOLUTION SECTION (Technician / Staff) */}
                    {ticket.status !== 'Closed' && (
                      <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200 space-y-3">
                        <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-700" />
                          Mark as Resolved (Technician Resolution)
                        </h4>

                        <form onSubmit={handleResolve} className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Resolution Summary & Action Taken *
                            </label>
                            <textarea
                              rows={2}
                              required
                              placeholder="e.g., Replaced MC4 connector and DC breaker. Tested inverter power generation at 4.5 kW."
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Spare Parts Used (Optional)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g., 2x MC4 Connectors, 1x 32A MCB"
                                value={spareParts}
                                onChange={(e) => setSpareParts(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Closing Proof Photo (Optional)
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setResolutionPhoto(e.target.files?.[0] || null)}
                                className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 text-slate-600"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={resolving || !resolutionNotes.trim()}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-md shadow-emerald-700/20 transition-all disabled:opacity-50"
                          >
                            {resolving ? 'Submitting Resolution...' : 'Mark Complaint as Resolved'}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* CLOSURE REVIEW SECTION (Admin / Staff) */}
                    {['admin', 'staff'].includes(currentUser?.role) && ticket.status === 'Resolved' && (
                      <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-200 space-y-3">
                        <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-700" />
                          Final Verification & Ticket Closure
                        </h4>
                        <p className="text-xs text-blue-800">
                          Closing this ticket will send a confirmation notification to the customer along with a 1-5 star service rating link.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Optional closure review remarks..."
                            value={closureRemarks}
                            onChange={(e) => setClosureRemarks(e.target.value)}
                            className="flex-1 text-xs px-3 py-2 bg-white border border-blue-300 rounded-lg"
                          />
                          <button
                            onClick={handleCloseTicket}
                            disabled={closing}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {closing ? 'Closing...' : 'Close Ticket & Request Feedback'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* REOPEN SECTION (If Closed or Resolved) */}
                    {['Closed', 'Resolved'].includes(ticket.status) && (
                      <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-200 space-y-2">
                        <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-rose-700" />
                          Reopen Complaint Flow
                        </h4>
                        <p className="text-xs text-rose-800">
                          If customer reports recurrence of the issue, reactivate this ticket preserving all previous history.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Reason for reopening..."
                            value={reopenReason}
                            onChange={(e) => setReopenReason(e.target.value)}
                            className="flex-1 text-xs px-3 py-2 bg-white border border-rose-300 rounded-lg"
                          />
                          <button
                            onClick={handleReopen}
                            disabled={reopening}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {reopening ? 'Reopening...' : 'Reopen Ticket'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. TIMELINE TAB */}
                {activeTab === 'timeline' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Complete Audit Trail & Visit History
                    </h4>

                    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {timeline.map((item, idx) => (
                        <div key={item.id || idx} className="relative">
                          <div className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                            item.action === 'Registered' ? 'bg-amber-500' :
                            item.action === 'Assigned' ? 'bg-blue-500' :
                            item.action === 'Resolved' ? 'bg-emerald-500' :
                            item.action === 'Closed' ? 'bg-slate-700' :
                            item.action === 'Reopened' ? 'bg-rose-500' :
                            'bg-emerald-400'
                          }`} />

                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-slate-900">{item.action}</span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(item.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-700 leading-relaxed">{item.notes}</p>
                            <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
                              <span>By: <strong>{item.performed_by_name}</strong> ({item.performed_by_role})</span>
                              {item.notify_customer === 1 && (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Customer Alerted
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. NOTIFICATIONS TAB */}
                {activeTab === 'notifications' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Dispatched WhatsApp & Email Audit Logs
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Total {notifications.length} alerts logged
                      </span>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">No alerts logged for this ticket yet.</p>
                    ) : (
                      notifications.map((notif) => (
                        <div key={notif.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                notif.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {notif.channel}
                              </span>
                              <span className="font-mono text-slate-700 text-[11px]">{notif.recipient}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">
                                {new Date(notif.created_at).toLocaleTimeString()}
                              </span>
                              <button
                                onClick={() => handleResendNotif(notif.id)}
                                title="Resend this notification"
                                className="px-2 py-0.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded text-[11px] flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resend
                              </button>
                            </div>
                          </div>

                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-sans text-slate-800 whitespace-pre-wrap">
                            {notif.rendered_content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 4. WHATSAPP LIVE CHAT TAB */}
                {activeTab === 'whatsapp' && (
                  <div className="flex flex-col h-[520px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                    {/* Chat Header */}
                    <div className="bg-emerald-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white text-xs border border-white/20">
                          <MessageCircle className="w-4 h-4 text-emerald-300" />
                        </div>
                        <div>
                          <span className="font-bold text-xs block leading-tight">{ticket.customer_name}</span>
                          <span className="text-[10px] text-emerald-200 font-mono flex items-center gap-1">
                            <span>📞 {ticket.customer_phone}</span>
                            <span>•</span>
                            <span className="inline-flex items-center text-emerald-300 font-sans font-medium">● Meta Cloud API</span>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={fetchWhatsAppChat}
                        title="Refresh WhatsApp conversation"
                        className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-200 hover:text-white transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Chat Message Stream */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]">
                      {waChatMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 shadow-2xs">
                            <MessageCircle className="w-6 h-6" />
                          </div>
                          <p className="font-bold text-slate-800 text-xs mb-1">No Chat History Yet</p>
                          <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                            When customer <strong>{ticket.customer_name}</strong> replies to WhatsApp alerts with text, photos, or documents, they will automatically appear here in real-time.
                          </p>
                        </div>
                      ) : (
                        waChatMessages.map((msg, idx) => {
                          const isCustomer = msg.sender_type === 'customer';
                          return (
                            <div
                              key={msg.id || idx}
                              className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                            >
                              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3 shadow-xs text-xs space-y-1.5 ${
                                isCustomer
                                  ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-2xs'
                                  : 'bg-emerald-700 text-white rounded-tr-2xs'
                              }`}>
                                <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 border-b border-black/5 pb-1">
                                  <span className="font-bold">{isCustomer ? msg.sender_name || 'Customer' : 'Eco Green Support'}</span>
                                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>

                                {/* Text Body */}
                                {msg.message_body && (
                                  <p className="whitespace-pre-wrap leading-relaxed select-text font-sans">
                                    {msg.message_body}
                                  </p>
                                )}

                                {/* Media Attachment Preview */}
                                {msg.media_url && (
                                  <div className="pt-1">
                                    {msg.media_type === 'image' || (msg.media_url && msg.media_url.match(/\.(jpeg|jpg|png|webp)($|\?)/i)) ? (
                                      <div className="rounded-xl overflow-hidden border border-slate-300/40 bg-slate-900/5">
                                        <img
                                          src={msg.media_url}
                                          alt="Customer WhatsApp Attachment"
                                          onClick={() => setPreviewDocModal({ url: msg.media_url, name: 'WhatsApp_Photo.jpg', isImage: true })}
                                          className="max-h-48 w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        />
                                        {msg.media_caption && (
                                          <p className="p-1.5 text-[11px] font-medium bg-black/20 text-white">{msg.media_caption}</p>
                                        )}
                                      </div>
                                    ) : (
                                      <a
                                        href={msg.media_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`flex items-center gap-2 p-2 rounded-xl text-[11px] font-bold border transition-colors ${
                                          isCustomer
                                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                            : 'bg-emerald-800/80 hover:bg-emerald-800 border-emerald-600 text-white'
                                        }`}
                                      >
                                        <FileText className="w-4 h-4 shrink-0" />
                                        <span className="truncate flex-1">{msg.media_caption || 'Attached Document (PDF)'}</span>
                                        <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-75" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Staff Reply Bar */}
                    {['admin', 'staff'].includes(currentUser?.role) && (
                      <form onSubmit={handleSendWhatsAppReply} className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={waReplyText}
                          onChange={(e) => setWaReplyText(e.target.value)}
                          placeholder={`Reply to ${ticket.customer_name} via official WhatsApp...`}
                          className="flex-1 text-xs px-3.5 py-2.5 bg-slate-100 hover:bg-slate-50 focus:bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                          disabled={sendingWaReply}
                        />
                        <button
                          type="submit"
                          disabled={sendingWaReply || !waReplyText.trim()}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{sendingWaReply ? 'Sending...' : 'Send'}</span>
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 text-center space-y-4 animate-in fade-in">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200 shadow-2xs">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-sm">Could Not Load Complaint</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Ticket details could not be retrieved from the server. Please verify your connection or try again.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchTicketDetails}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Loading</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Bottom Quick Close Bar */}
          <div className="p-3 bg-white border-t border-slate-200 sm:hidden shrink-0 flex items-center justify-between gap-2 shadow-lg">
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-900 active:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <X className="w-4 h-4 text-rose-400" />
              <span>Close Ticket Window</span>
            </button>
          </div>
        </div>
      </div>
      {/* EDIT COMPLAINT MODAL */}
      {isEditing && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Edit Ticket Details ({ticket.ticket_id})</h3>
              </div>
              <button 
                onClick={() => setIsEditing(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Customer Contact */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Customer Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.customer_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone Number *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.customer_phone || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, customer_phone: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={editFormData.customer_email || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, customer_email: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">City / Village</label>
                    <input
                      type="text"
                      value={editFormData.city || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Installation Address</label>
                  <input
                    type="text"
                    value={editFormData.customer_address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, customer_address: e.target.value })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-blue-600" />
                    Customer Location Map URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://maps.google.com/..."
                    value={editFormData.location_url || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, location_url: e.target.value })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* System & Warranty */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">System & Warranty Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Consumer No.</label>
                    <input
                      type="text"
                      value={editFormData.consumer_no || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, consumer_no: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Order No. (Excel)</label>
                    <input
                      type="text"
                      value={editFormData.order_no || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, order_no: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice No. (Billing / Excel)</label>
                    <input
                      type="text"
                      value={editFormData.invoice_no || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, invoice_no: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice Date</label>
                    <input
                      type="date"
                      value={editFormData.invoice_date || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, invoice_date: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product Serial / Inverter Sr</label>
                    <input
                      type="text"
                      value={editFormData.product_serial || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, product_serial: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Warranty Status</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditFormData({ ...editFormData, is_in_warranty: 1 })}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border ${
                          editFormData.is_in_warranty === 1
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        In Warranty
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditFormData({ ...editFormData, is_in_warranty: 0 })}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border ${
                          editFormData.is_in_warranty === 0
                            ? 'bg-rose-600 text-white border-rose-700'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        Out of Warranty
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Charges & Priority */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Charges & Priority</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Estimated Charges (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={editFormData.estimated_charges || 0}
                      onChange={(e) => setEditFormData({ ...editFormData, estimated_charges: Number(e.target.value) })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Priority Level</label>
                    <select
                      value={editFormData.priority || 'Medium'}
                      onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Detailed Issue Description</label>
                  <textarea
                    rows={2}
                    value={editFormData.issue_description || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, issue_description: e.target.value })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {savingEdit ? 'Saving Changes...' : 'Save All Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {isRecordingPayment && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-sm">Record Payment Collected</h3>
              </div>
              <button 
                onClick={() => { setIsRecordingPayment(false); setShowUnderpaidWarning(false); }}
                className="p-1 text-emerald-200 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {!ticket.assigned_technician_id && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2 font-bold animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Technician Assignment Required: Please assign a field specialist to this complaint before recording payment.</span>
                </div>
              )}

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block">Quoted Service Charge</span>
                  <strong className="text-base font-black text-slate-900">₹{ticket.estimated_charges || 0}</strong>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Current Status</span>
                  <span className="font-bold text-amber-700">{ticket.payment_status || 'Unpaid'}</span>
                </div>
              </div>

              {/* Warning box if entered amount is less than estimated */}
              {showUnderpaidWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Warning: Partial Payment Amount
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    The entered amount of <strong>₹{paymentData.payment_collected || 0}</strong> is lower than the quoted service charge of <strong>₹{ticket.estimated_charges || 0}</strong>.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowUnderpaidWarning(false)}
                      className="px-2.5 py-1 bg-white border border-amber-300 rounded text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Change Amount
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecordPaymentSubmit(true)}
                      disabled={savingPayment || !ticket.assigned_technician_id}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold disabled:opacity-50"
                    >
                      {savingPayment ? 'Saving...' : 'Confirm & Save Partial'}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Amount Collected (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    placeholder="Enter amount collected from customer"
                    value={paymentData.payment_collected}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_collected: e.target.value })}
                    className="w-full text-xs pl-7 pr-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentData.payment_method}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value="Cash">Cash to Technician</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Notes / Reference No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., UTR / UPI transaction ID, Receipt #104"
                  value={paymentData.payment_notes}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_notes: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              {!showUnderpaidWarning && (
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRecordingPayment(false)}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRecordPaymentSubmit(false)}
                    disabled={savingPayment || !paymentData.payment_collected || !ticket.assigned_technician_id}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingPayment ? 'Saving...' : 'Record Payment'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1-Click WhatsApp Dispatch Modal for Technician Assignment */}
      {assignSuccessModal && (
        <div className="fixed inset-0 z-70 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Technician Assigned Successfully!</h3>
                  <p className="text-[11px] text-emerald-200">Send instant 1-click WhatsApp alerts to customer & technician</p>
                </div>
              </div>
              <button
                onClick={() => setAssignSuccessModal(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-200 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Summary Pill */}
              <div className="bg-emerald-50/80 rounded-xl p-3 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">Ticket & Assigned Specialist</span>
                  <span className="font-bold text-slate-900 font-mono text-xs">{ticket.ticket_id}</span>
                  <span className="text-slate-600 text-[11px] ml-1.5">→ 👨‍🔧 <strong>{assignSuccessModal.tech?.name}</strong></span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Scheduled Visit</span>
                  <span className="font-bold text-emerald-800 text-xs">
                    {assignSuccessModal.expectedDate ? new Date(assignSuccessModal.expectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Within 24-48 Hours'}
                  </span>
                </div>
              </div>

              {/* Background Relay Dispatch Notice Banner */}
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 flex items-start gap-2.5">
                <div className="p-1 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="text-xs text-emerald-950">
                  <strong className="block font-bold">⚡ Dispatched via Official WhatsApp Cloud API (+91 78784 44414)</strong>
                  <span className="text-[11px] text-emerald-800">
                    Customer aur Technician ke alerts direct official WhatsApp Meta Cloud API (+91 78784 44414) se deliver kiye gaye hain!
                  </span>
                </div>
              </div>

              {/* SECTION 1: Customer WhatsApp Notification */}
              <div className="bg-white rounded-xl p-4 border border-emerald-300 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-xs">1. Customer Visit Confirmation</h4>
                      <p className="text-[10px] text-slate-500">Customer: <strong>{ticket.customer_name}</strong> (📞 {ticket.customer_phone})</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Dispatched (Meta API)
                  </span>
                </div>

                {/* Message Preview */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 whitespace-pre-line max-h-28 overflow-y-auto leading-relaxed shadow-inner">
                  {assignSuccessModal.customerWa.rawText}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(assignSuccessModal.customerWa.rawText);
                      setCopiedCustWa(true);
                      setTimeout(() => setCopiedCustWa(false), 2000);
                    }}
                    className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1 text-xs transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedCustWa ? 'Copied!' : 'Copy Text'}</span>
                  </button>

                  <a
                    href={assignSuccessModal.customerWa.sendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-slate-400 hover:text-emerald-700 flex items-center gap-1 underline transition-colors"
                  >
                    <span>Open WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* SECTION 2: Technician WhatsApp Work Order */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">2. Technician Field Work Order</h4>
                      <p className="text-[10px] text-slate-500">Technician: <strong>{assignSuccessModal.tech?.name}</strong> (📞 {assignSuccessModal.tech?.phone || 'N/A'})</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span> Dispatched (Meta API)
                  </span>
                </div>

                {/* Work Order Preview */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 whitespace-pre-line max-h-24 overflow-y-auto leading-relaxed shadow-inner">
                  {assignSuccessModal.techWa.rawText}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(assignSuccessModal.techWa.rawText);
                      setCopiedTechWa(true);
                      setTimeout(() => setCopiedTechWa(false), 2000);
                    }}
                    className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold flex items-center gap-1 text-xs transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedTechWa ? 'Copied!' : 'Copy Text'}</span>
                  </button>

                  <a
                    href={assignSuccessModal.techWa.sendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-slate-400 hover:text-teal-700 flex items-center gap-1 underline transition-colors"
                  >
                    <span>Open WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setAssignSuccessModal(null)}
                className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                ✓ Done & Return to Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / High-Res Document & Photo Preview Modal */}
      {previewDocModal && (
        <div 
          className="fixed inset-0 z-80 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150" 
          onClick={() => setPreviewDocModal(null)}
        >
          <div 
            className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-3 border border-slate-200 animate-in zoom-in-95 duration-150" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">{previewDocModal.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDocModal.url}
                  target="_blank"
                  rel="noreferrer"
                  download={previewDocModal.name}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Full Tab / Download
                </a>
                <button 
                  type="button"
                  onClick={() => setPreviewDocModal(null)} 
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[75vh] overflow-auto bg-slate-50/70 rounded-xl mt-2">
              {previewDocModal.isImage ? (
                <div className="relative flex flex-col items-center justify-center w-full">
                  <img 
                    src={previewDocModal.url} 
                    alt={previewDocModal.name} 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fb = document.getElementById('preview-doc-fallback-view');
                      if (fb) fb.style.display = 'flex';
                    }}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm" 
                  />
                  <div id="preview-doc-fallback-view" className="hidden flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-slate-200 my-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 mx-auto mb-3">
                      <FileText className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">{previewDocModal.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Uploaded document proof</p>
                    <a
                      href={previewDocModal.url}
                      target="_blank"
                      rel="noreferrer"
                      download={previewDocModal.name}
                      className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open / Download File
                    </a>
                  </div>
                </div>
              ) : (
                <iframe src={previewDocModal.url} className="w-full h-[65vh] rounded-lg" title={previewDocModal.name} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
