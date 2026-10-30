/**
 * Technician Utilities
 * Provides standard count calculation and label formatting for technicians across the application.
 */

/**
 * Calculates detailed workload metrics for a technician:
 * - activeCount: tickets in 'Assigned', 'In Progress', 'Reopened' (active work currently ongoing)
 * - onHoldCount: tickets in 'On Hold' (waiting for parts, customer reschedule, etc.)
 * - totalOpenCount: activeCount + onHoldCount
 * - isFree: true if activeCount === 0 (technician has capacity to take active new field tasks)
 *
 * Excludes 'Resolved', 'Closed', 'Unassigned', 'Registered', and 'Draft'.
 *
 * @param {Object} tech - Technician object from API
 * @param {Array} [complaintsList] - Optional active complaints list from state for live real-time accuracy
 * @returns {{ activeCount: number, onHoldCount: number, totalOpenCount: number, isFree: boolean }}
 */
export function getTechnicianWorkload(tech, complaintsList = null) {
  if (!tech) return { activeCount: 0, onHoldCount: 0, totalOpenCount: 0, isFree: true };

  const techId = String(tech.id);

  // If live complaints list is provided, calculate dynamically in real-time
  if (Array.isArray(complaintsList) && complaintsList.length > 0) {
    let activeCount = 0;
    let onHoldCount = 0;

    complaintsList.forEach(c => {
      const matchAssigned = String(c.assigned_technician_id) === techId;
      const matchSecondary = String(c.secondary_technician_id) === techId;
      if (!matchAssigned && !matchSecondary) return;

      const st = (c.status || '').trim();
      // Resolved, Closed, Unassigned, Registered, and Draft are not active open tickets
      if (['Resolved', 'Closed', 'Unassigned', 'Registered', 'Draft'].includes(st)) return;

      if (st === 'On Hold') {
        onHoldCount++;
      } else if (['Assigned', 'In Progress', 'Reopened'].includes(st)) {
        activeCount++;
      } else {
        // Any other non-resolved status counts as active
        activeCount++;
      }
    });

    return {
      activeCount,
      onHoldCount,
      totalOpenCount: activeCount + onHoldCount,
      isFree: activeCount === 0
    };
  }

  // Fallback to API-provided counts on tech object
  const activeCount = parseInt(tech.active_jobs_count ?? tech.active_tickets_count ?? 0, 10) || 0;
  const onHoldCount = parseInt(tech.on_hold_count ?? 0, 10) || 0;
  const totalOpenCount = parseInt(tech.total_open_count ?? (activeCount + onHoldCount), 10) || (activeCount + onHoldCount);

  return {
    activeCount,
    onHoldCount,
    totalOpenCount,
    isFree: activeCount === 0
  };
}

/**
 * Calculates total assigned/active jobs currently with a technician.
 * Maintained for backward compatibility.
 *
 * @param {Object} tech
 * @param {Array} [complaintsList]
 * @returns {number}
 */
export function getTechnicianAssignedCount(tech, complaintsList = null) {
  const { activeCount } = getTechnicianWorkload(tech, complaintsList);
  return activeCount;
}

/**
 * Formats standard label for technician in select dropdowns.
 * Separates Active working jobs from On Hold jobs, giving dispatchers instant clarity on availability.
 *
 * Examples:
 *   "🟢 Milan Makwana (General Zone) — 0 Active (Free)"
 *   "🟢 Mishal Makwana (General Zone) — 1 Active"
 *   "🟢 Dhaval Makwana (General Zone) — 1 Active • 2 On Hold (3 Total)"
 *   "🟢 Hardevsinh Vaghela (General Zone) — 0 Active (Free) • 3 On Hold"
 *   "🔴 Test Tech (General Zone) — OFF-DUTY (0 Active)"
 *
 * @param {Object} tech
 * @param {Array} [complaintsList]
 * @returns {string}
 */
export function formatTechnicianOptionLabel(tech, complaintsList = null) {
  if (!tech) return '';

  const { activeCount, onHoldCount, totalOpenCount } = getTechnicianWorkload(tech, complaintsList);
  const zone = tech.area_zone ? ` (${tech.area_zone})` : '';

  let workloadText = '';
  if (activeCount === 0 && onHoldCount === 0) {
    workloadText = '0 Active (Free)';
  } else if (activeCount > 0 && onHoldCount === 0) {
    workloadText = `${activeCount} Active`;
  } else if (activeCount === 0 && onHoldCount > 0) {
    workloadText = `0 Active (Free) • ${onHoldCount} On Hold`;
  } else {
    workloadText = `${activeCount} Active • ${onHoldCount} On Hold`;
  }

  if (!tech.is_available) {
    return `${tech.name}${zone} — OFF-DUTY (${workloadText})`;
  }

  return `${tech.name}${zone} — ${workloadText}`;
}
