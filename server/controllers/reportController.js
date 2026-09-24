const db = require('../config/database');

function getDashboardMetrics(req, res) {
  try {
    // Total counts by status
    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Registered' THEN 1 ELSE 0 END) as registered_count,
        SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assigned_count,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN status = 'On Hold' THEN 1 ELSE 0 END) as on_hold_count,
        SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN status = 'Reopened' THEN 1 ELSE 0 END) as reopened_count
      FROM complaints
    `).get();

    // Average Resolution Time (in hours) for resolved/closed complaints
    // Using sqlite julianday
    const avgRes = db.prepare(`
      SELECT 
        ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24), 1) as avg_resolution_hours,
        COUNT(resolved_at) as resolved_total
      FROM complaints 
      WHERE resolved_at IS NOT NULL
    `).get();

    // Product-wise distribution
    const productStats = db.prepare(`
      SELECT 
        product_type,
        COUNT(*) as count,
        SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN status IN ('Registered', 'Assigned', 'In Progress') THEN 1 ELSE 0 END) as active_count
      FROM complaints
      GROUP BY product_type
      ORDER BY count DESC
    `).all();

    // Issue category distribution
    const issueCategoryStats = db.prepare(`
      SELECT 
        issue_category,
        COUNT(*) as count
      FROM complaints
      GROUP BY issue_category
      ORDER BY count DESC
      LIMIT 6
    `).all();

    // Priority distribution
    const priorityStats = db.prepare(`
      SELECT 
        priority,
        COUNT(*) as count
      FROM complaints
      GROUP BY priority
    `).all();

    // Technician performance leaderboard
    const technicianLeaderboard = db.prepare(`
      SELECT 
        t.id,
        t.name,
        t.area_zone,
        t.specialization,
        COUNT(c.id) as total_assigned,
        SUM(CASE WHEN c.status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN c.status IN ('Assigned', 'In Progress', 'On Hold') THEN 1 ELSE 0 END) as pending_count,
        ROUND(AVG((julianday(c.resolved_at) - julianday(c.created_at)) * 24), 1) as avg_resolution_hours,
        ROUND(AVG(c.rating), 1) as avg_rating
      FROM technicians t
      LEFT JOIN complaints c ON t.id = c.assigned_technician_id
      GROUP BY t.id
      ORDER BY resolved_count DESC, avg_rating DESC
    `).all();

    // Customer satisfaction average rating
    const ratingMetrics = db.prepare(`
      SELECT 
        ROUND(AVG(rating), 1) as average_rating,
        COUNT(rating) as total_ratings_received
      FROM complaints
      WHERE rating IS NOT NULL
    `).get();

    res.json({
      counts,
      avg_resolution_hours: avgRes.avg_resolution_hours || 0,
      resolved_total: avgRes.resolved_total || 0,
      productStats,
      issueCategoryStats,
      priorityStats,
      technicianLeaderboard,
      customerSatisfaction: {
        averageRating: ratingMetrics.average_rating || 0,
        totalReviews: ratingMetrics.total_ratings_received || 0
      }
    });
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ error: 'Failed to calculate analytics metrics' });
  }
}

function exportComplaintsCsv(req, res) {
  try {
    const complaints = db.prepare(`
      SELECT 
        c.ticket_id,
        c.customer_name,
        c.customer_phone,
        c.customer_email,
        c.customer_address,
        c.product_type,
        c.product_serial,
        c.installation_id,
        c.issue_category,
        c.priority,
        c.status,
        t.name as technician_name,
        c.expected_visit_date,
        c.resolution_notes,
        c.spare_parts_used,
        c.rating,
        c.feedback_comments,
        c.created_at,
        c.assigned_at,
        c.resolved_at,
        c.closed_at
      FROM complaints c
      LEFT JOIN technicians t ON c.assigned_technician_id = t.id
      ORDER BY c.created_at DESC
    `).all();

    // Generate CSV string
    const headers = [
      'Ticket ID', 'Customer Name', 'Phone', 'Email', 'Address',
      'Product Type', 'Serial Number', 'Installation ID', 'Issue Category', 'Priority',
      'Status', 'Assigned Technician', 'Expected Visit Date', 'Resolution Notes',
      'Spare Parts Used', 'Rating (1-5)', 'Feedback Comments', 'Created At', 'Assigned At', 'Resolved At', 'Closed At'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(',')];
    for (const c of complaints) {
      csvRows.push([
        escapeCsv(c.ticket_id),
        escapeCsv(c.customer_name),
        escapeCsv(c.customer_phone),
        escapeCsv(c.customer_email),
        escapeCsv(c.customer_address),
        escapeCsv(c.product_type),
        escapeCsv(c.product_serial),
        escapeCsv(c.installation_id),
        escapeCsv(c.issue_category),
        escapeCsv(c.priority),
        escapeCsv(c.status),
        escapeCsv(c.technician_name),
        escapeCsv(c.expected_visit_date),
        escapeCsv(c.resolution_notes),
        escapeCsv(c.spare_parts_used),
        escapeCsv(c.rating),
        escapeCsv(c.feedback_comments),
        escapeCsv(c.created_at),
        escapeCsv(c.assigned_at),
        escapeCsv(c.resolved_at),
        escapeCsv(c.closed_at)
      ].join(','));
    }

    const csvData = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="EcoGreen_Complaints_Report_${Date.now()}.csv"`);
    res.status(200).send(csvData);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export CSV report' });
  }
}

module.exports = { getDashboardMetrics, exportComplaintsCsv };
