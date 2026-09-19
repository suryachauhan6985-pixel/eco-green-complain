const db = require('../config/database');
const { syncCustomersFromExcel } = require('../services/excelSyncService');

/**
 * Google-style dynamic search across customer name, mobile, city, dealer, consumer no, inverter serial
 */
function searchCustomers(req, res) {
  try {
    const rawQuery = (req.query.q || req.query.search || '').trim();
    if (!rawQuery || rawQuery.length < 2) {
      // If query is too short, return 10 sample customers
      const sample = db.prepare(`
        SELECT * FROM installed_customers 
        ORDER BY id DESC LIMIT 10
      `).all();
      return res.json({ customers: sample });
    }

    // Tokenize query words for multi-word Google-like fuzzy matching
    // e.g. "bhavsinh veraval" or "ketan 8460"
    const tokens = rawQuery.split(/\s+/).filter(Boolean);

    let whereClauses = [];
    let params = [];

    for (const token of tokens) {
      const wild = `%${token}%`;
      whereClauses.push(`(
        customer_name LIKE ? OR 
        consumer_mobile LIKE ? OR 
        consumer_no LIKE ? OR 
        city_village LIKE ? OR 
        dealer_name LIKE ? OR 
        inverter_serial LIKE ? OR 
        invoice_no LIKE ?
      )`);
      params.push(wild, wild, wild, wild, wild, wild, wild);
    }

    const whereSql = whereClauses.join(' AND ');

    // Prioritize exact matches and prefix matches
    const exactMobile = rawQuery.replace(/[^0-9]/g, '');
    const prefixName = `${rawQuery}%`;

    const querySql = `
      SELECT *,
        CASE 
          WHEN consumer_mobile = '${exactMobile}' THEN 1
          WHEN customer_name LIKE '${prefixName}' THEN 2
          ELSE 3
        END as match_priority
      FROM installed_customers
      WHERE ${whereSql}
      ORDER BY match_priority ASC, is_in_warranty DESC, customer_name ASC
      LIMIT 25
    `;

    const results = db.prepare(querySql).all(...params);

    // Compute live age and friendly warranty text
    const today = new Date();
    const enriched = results.map(c => {
      let ageText = '';
      if (c.invoice_date || c.installation_date) {
        const refDate = new Date(c.invoice_date || c.installation_date);
        const diffYears = ((today - refDate) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
        ageText = `${diffYears} years old`;
      }

      return {
        ...c,
        age_text: ageText,
        warranty_status: c.is_in_warranty ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY',
        warranty_label: c.is_in_warranty 
          ? `In Warranty (Valid till ${c.warranty_expiry_date || 'N/A'})` 
          : `Out of Warranty (Expired on ${c.warranty_expiry_date || 'N/A'}${ageText ? ` • ${ageText}` : ''})`
      };
    });

    res.json({
      query: rawQuery,
      totalMatches: enriched.length,
      customers: enriched
    });
  } catch (err) {
    console.error('Customer search error:', err);
    res.status(500).json({ error: 'Failed to search customers: ' + err.message });
  }
}

/**
 * Sync from network Excel file or uploaded Excel file
 */
async function syncFromExcel(req, res) {
  try {
    let result;
    const fs = require('fs');
    if (req.file) {
      const source = req.file.path || req.file.buffer;
      result = await syncCustomersFromExcel(source);
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
    } else {
      result = await syncCustomersFromExcel();
    }

    // Mirror synced customer directory to Turso Cloud in optimized batches
    const tursoSync = require('../services/tursoSyncService');
    if (tursoSync.isEnabled && tursoSync.client) {
      tursoSync.pushTableToCloud('installed_customers', db).catch(err => {
        console.warn('[TursoSync] Background customer sync notice:', err.message);
      });
    }

    res.json({
      message: 'Customer database synced successfully from Excel',
      ...result
    });
  } catch (err) {
    console.error('Customer sync error:', err);
    res.status(500).json({ error: 'Failed to sync from Excel: ' + err.message });
  }
}

/**
 * Get installed customer database statistics
 */
function getCustomerStats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM installed_customers').get().count;
    const inWarranty = db.prepare('SELECT COUNT(*) as count FROM installed_customers WHERE is_in_warranty = 1').get().count;
    const outWarranty = db.prepare('SELECT COUNT(*) as count FROM installed_customers WHERE is_in_warranty = 0').get().count;

    res.json({
      totalCustomers: total,
      inWarrantyCount: inWarranty,
      outWarrantyCount: outWarranty
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats: ' + err.message });
  }
}

module.exports = {
  searchCustomers,
  syncFromExcel,
  getCustomerStats
};
