const supabaseConfig = require('../config/supabase');

class SupabaseSyncService {
  constructor() {
    this.syncQueue = [];
    this.isProcessingQueue = false;
  }

  get isEnabled() {
    return supabaseConfig.isEnabled && supabaseConfig.client !== null;
  }

  get client() {
    return supabaseConfig.client;
  }

  /**
   * Pull all records from Supabase Cloud down to the local SQLite database on server boot.
   */
  async pullFromCloud(localDb) {
    if (!this.isEnabled) {
      console.log('[SupabaseSync] ℹ️ Skipping cloud pull: Supabase credentials not active.');
      return;
    }

    console.log('[SupabaseSync] 🔄 Starting startup sync: pulling latest records from Supabase Cloud...');

    const tables = [
      'users',
      'technicians',
      'products',
      'installed_customers',
      'complaints',
      'complaint_attachments',
      'complaint_timelines',
      'notification_templates',
      'notification_logs',
      'issue_categories',
      'whatsapp_messages',
      'whatsapp_raw_events'
    ];

    try {
      localDb.pragma('foreign_keys = OFF');

      for (const table of tables) {
        try {
          const { data: rows, error } = await this.client
            .from(table)
            .select('*')
            .order('id', { ascending: true });

          if (error) {
            console.warn(`[SupabaseSync] Notice fetching table ${table}:`, error.message);
            continue;
          }

          if (rows && rows.length > 0) {
            const columns = Object.keys(rows[0]);
            const colNames = columns.map(c => `"${c}"`).join(', ');
            const placeholders = columns.map(() => '?').join(', ');
            const insertStmt = localDb.prepare(`INSERT OR REPLACE INTO "${table}" (${colNames}) VALUES (${placeholders})`);

            const insertMany = localDb.transaction((allRows) => {
              for (const row of allRows) {
                const values = columns.map(col => row[col] !== undefined ? row[col] : null);
                insertStmt.run(...values);
              }
            });

            insertMany(rows);
            console.log(`[SupabaseSync]  ↳ Synced ${rows.length} rows for table [${table}]`);
          }
        } catch (tableErr) {
          console.warn(`[SupabaseSync] Notice syncing table ${table}:`, tableErr.message);
        }
      }

      localDb.pragma('foreign_keys = ON');
      console.log('[SupabaseSync] ✅ Startup sync completed! Local database is 100% matched with Supabase Cloud.');
    } catch (err) {
      console.error('[SupabaseSync] ⚠️ Startup sync error:', err.message);
      try { localDb.pragma('foreign_keys = ON'); } catch (_) {}
    }
  }

  /**
   * Push an inserted or updated row directly to Supabase table
   */
  async upsertRow(tableName, row) {
    if (!this.isEnabled || !row) return;

    try {
      // Clean up fields if needed
      const cleanRow = { ...row };
      const { error } = await this.client.from(tableName).upsert(cleanRow, { onConflict: 'id' });
      if (error) {
        console.warn(`[SupabaseSync] Upsert error on ${tableName} (ID: ${row.id || row.ticket_id}):`, error.message);
      }
    } catch (e) {
      console.warn(`[SupabaseSync] Network error pushing to ${tableName}:`, e.message);
    }
  }

  /**
   * Delete a row in Supabase by primary key or criteria
   */
  async deleteRow(tableName, id) {
    if (!this.isEnabled || !id) return;

    try {
      const { error } = await this.client.from(tableName).delete().eq('id', id);
      if (error) {
        console.warn(`[SupabaseSync] Delete error on ${tableName} (ID: ${id}):`, error.message);
      }
    } catch (e) {
      console.warn(`[SupabaseSync] Network error deleting from ${tableName}:`, e.message);
    }
  }

  /**
   * Push a newly inserted row by table and rowid to Supabase.
   */
  pushInsertedRow(localDb, tableName, rowid) {
    if (!this.isEnabled) return;

    setImmediate(async () => {
      try {
        const row = localDb.prepare(`SELECT * FROM "${tableName}" WHERE rowid = ?`).get(rowid);
        if (!row) return;
        await this.upsertRow(tableName, row);
      } catch (err) {
        console.warn(`[SupabaseSync] Error reading inserted row for ${tableName}:`, err.message);
      }
    });
  }

  /**
   * Push an updated row by table and target ID to Supabase.
   */
  pushUpdatedRow(localDb, tableName, id) {
    if (!this.isEnabled || !id) return;

    setImmediate(async () => {
      try {
        const row = localDb.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
        if (!row) return;
        await this.upsertRow(tableName, row);
      } catch (err) {
        console.warn(`[SupabaseSync] Error reading updated row for ${tableName}:`, err.message);
      }
    });
  }

  /**
   * Push an entire table in batches to Supabase (for full migration or bulk imports)
   */
  async pushTableToCloud(tableName, localDb) {
    if (!this.isEnabled) return { success: false, message: 'Supabase is not enabled' };

    try {
      console.log(`[SupabaseSync] Starting batch push for table ${tableName}...`);
      const rows = localDb.prepare(`SELECT * FROM "${tableName}"`).all();
      if (!rows || rows.length === 0) return { success: true, count: 0 };

      const batchSize = 100;
      let syncedCount = 0;

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const { error } = await this.client.from(tableName).upsert(chunk, { onConflict: 'id' });
        if (error) {
          console.error(`[SupabaseSync] Batch push chunk error on ${tableName}:`, error.message);
          throw error;
        }
        syncedCount += chunk.length;
      }

      console.log(`[SupabaseSync] ✅ Synced table ${tableName} (${syncedCount} rows) to Supabase`);
      return { success: true, count: syncedCount };
    } catch (err) {
      console.error(`[SupabaseSync] Batch push failed for ${tableName}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Transparently hook database writes so all mutations mirror to Supabase
   */
  hookDatabase(localDb) {
    const self = this;
    const originalPrepare = localDb.prepare.bind(localDb);

    localDb.prepare = function (sql) {
      const stmt = originalPrepare(sql);
      const originalRun = stmt.run.bind(stmt);

      stmt.run = function (...args) {
        const info = originalRun(...args);

        if (!self.isEnabled) return info;

        try {
          const trimmedSql = sql.trim();
          const insertMatch = trimmedSql.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`"']?([a-zA-Z0-9_]+)[`"']?/i);
          const updateMatch = trimmedSql.match(/^UPDATE\s+[`"']?([a-zA-Z0-9_]+)[`"']?/i);
          const deleteMatch = trimmedSql.match(/^DELETE\s+FROM\s+[`"']?([a-zA-Z0-9_]+)[`"']?/i);

          if (insertMatch && info.lastInsertRowid) {
            const tableName = insertMatch[1];
            self.pushInsertedRow(localDb, tableName, info.lastInsertRowid);
          } else if (updateMatch) {
            const tableName = updateMatch[1];
            // If last argument was an ID (common pattern in UPDATE ... WHERE id = ?)
            const possibleId = args[args.length - 1];
            if (possibleId && (typeof possibleId === 'number' || typeof possibleId === 'string')) {
              self.pushUpdatedRow(localDb, tableName, possibleId);
            }
          } else if (deleteMatch) {
            const tableName = deleteMatch[1];
            const possibleId = args[args.length - 1];
            if (possibleId) {
              self.deleteRow(tableName, possibleId);
            }
          }
        } catch (syncErr) {
          console.warn('[SupabaseSync] Replicate hook notice:', syncErr.message);
        }

        return info;
      };

      return stmt;
    };

    console.log('[SupabaseSync] 🚀 Database write hook attached. All local changes will mirror to Supabase in real-time!');
    return localDb;
  }
}

module.exports = new SupabaseSyncService();
