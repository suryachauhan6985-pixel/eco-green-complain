/**
 * Technician Utilities
 * Provides standard count calculation and label formatting for technicians across the application.
 */

/**
 * Calculates total active/assigned jobs currently with a technician.
 * Excludes 'Resolved', 'Closed', 'Unassigned', and 'Registered'.
 * Includes 'Assigned', 'In Progress', 'On Hold', 'Reopened'.
 *
 * @param {Object} tech - Technician object from API
 * @param {Array} [complaintsList] - Optional active complaints list from state for live real-time accuracy
 * @returns {number}
 */
export function getTechnicianAssignedCount(tech, complaintsList = null) {
  if (!tech) return 0;

  // If live complaints list is provided, calculate dynamically in real-time
  if (Array.isArray(complaintsList) && complaintsList.length > 0) {
    const techId = String(tech.id);
    const liveCount = complaintsList.filter(c => {
      const matchAssigned = String(c.assigned_technician_id) === techId;
      const matchSecondary = String(c.secondary_technician_id) === techId;
      const isAssigned = matchAssigned || matchSecondary;
      const isActive =
        c.status &&
        !['Resolved', 'Closed', 'Unassigned', 'Registered'].includes(c.status);
      return isAssigned && isActive;
    }).length;
    return liveCount;
  }

  // Fallback to API-provided counts
  const raw =
    tech.active_tickets_count ??
    tech.active_jobs_count ??
    tech.pending_count ??
    null;

  if (raw !== null && raw !== undefined) {
    return parseInt(raw, 10) || 0;
  }

  // Fallback to local storage complaints if raw count is not on object
  try {
    const cached = JSON.parse(
      localStorage.getItem('egs_permanent_complaints') ||
      localStorage.getItem('egs_mock_complaints') ||
      '[]'
    );
    if (Array.isArray(cached) && cached.length > 0) {
      return getTechnicianAssignedCount(tech, cached);
    }
  } catch (_) {}

  return 0;
}

/**
 * Formats standard label for technician in select dropdowns.
 * Example:
 *   "🟢 Hardevsinh Vaghela (General Zone) — 2 Assigned"
 *   "🟢 Dhaval Makwana (General Zone) — 0 Assigned (Free)"
 *   "🔴 Test Tech (General Zone) — OFF-DUTY (0 Assigned)"
 *
 * @param {Object} tech
 * @param {Array} [complaintsList]
 * @returns {string}
 */
export function formatTechnicianOptionLabel(tech, complaintsList = null) {
  if (!tech) return '';

  const count = getTechnicianAssignedCount(tech, complaintsList);
  const zone = tech.area_zone ? ` (${tech.area_zone})` : '';
  const statusIcon = tech.is_available ? '🟢' : '🔴';
  const assignedLabel = count === 0 ? '0 Assigned (Free)' : `${count} Assigned`;

  if (!tech.is_available) {
    return `${statusIcon} ${tech.name}${zone} — OFF-DUTY (${assignedLabel})`;
  }

  return `${statusIcon} ${tech.name}${zone} — ${assignedLabel}`;
}
