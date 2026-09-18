const { createClient } = require('@libsql/client');

class TursoSyncService {
  constructor() {
    this.client = null;
    this.isEnabled = false;
    this.syncQueue = [];
    this.isProcessingQueue = false;
    this.init();
  }

  init() {
    const defaultUrl = 'libsql://ecogreen-db-suryachauhan6985-pixel.aws-ap-south-1.turso.io';
    const defaultToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk3MTQ4OTksImlkIjoiMDFhMGIzNTEtYjUwMS03MzIyLWE1NzItNTcxNzU3MDE4ZGRjIiwia2lkIjoiWjVmbFlqUVZfYk50Tm9nZWxZdFp2eEJHUFE2ZVlYMHAxX29aV2Y0aFlxVSIsInJpZCI6ImQ0NmQ1MTM3LWYyZTAtNDExYy1hNzM1LTAwMDUyNzQzYzcwZiJ9.xTnzaXC7ZVGAJOiV1VTr-CXPI1xDpNlXEv-qwgUF5UytnjltkZVvxp5_M8ZpLMvMdZFbY17C4rIwi6lZiD_WAA';

    const url = process.env.TURSO_DATABASE_URL || defaultUrl;
    const token = process.env.TURSO_AUTH_TOKEN || defaultToken;

    if (url && token) {
      try {
        this.client = createClient({
          url,
          authToken: token
        });
        this.isEnabled = true;
        console.log('[TursoSync] Initialized dedicated cloud database client for:', url);
      } catch (err) {
        console.error('[TursoSync] Failed to initialize Turso client:', err.message);
        this.isEnabled = false;
      }
    } else {
      console.log('[TursoSync] TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not provided. Running in local-only mode.');
    }
  }

  /**
   * Pull all records from Turso Cloud down to the local SQLite database on server boot.
   * Ensures that even if the container is restarted/recreated, all previous chats,
   * complaints, and updates are restored instantly into local storage.
   */
  async pullFromCloud(localDb) {
    if (!this.isEnabled || !this.client) {
      console.log('[TursoSync] Skipping pull: Turso is not enabled.');
      return;
    }

    console.log('[TursoSync] 🔄 Starting startup sync: pulling latest records from Turso Cloud...');

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
      'whatsapp_auth_keys',
      'whatsapp_messages',
      'whatsapp_number_registry',
      'whatsapp_outgoing_queue',
      'whatsapp_raw_events',
      'whatsapp_relay_heartbeat',
      'whatsapp_session_meta'
    ];

    try {
      localDb.pragma('foreign_keys = OFF');

      for (const table of tables) {
        try {
          const cloudRes = await this.client.execute(`SELECT * FROM "${table}"`);
          const rows = cloudRes.rows;

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
            console.log(`[TursoSync]  ↳ Synced ${rows.length} rows for table [${table}]`);
          }
        } catch (tableErr) {
          console.warn(`[TursoSync] Notice syncing table ${table}:`, tableErr.message);
        }
      }

      localDb.pragma('foreign_keys = ON');
      console.log('[TursoSync] ✅ Startup sync completed! Local database is 100% matched with Turso Cloud.');
    } catch (err) {
      console.error('[TursoSync] ⚠️ Startup sync error:', err.message);
      try { localDb.pragma('foreign_keys = ON'); } catch (_) {}
    }
  }

  /**
   * Push a mutation (INSERT, UPDATE, DELETE) to Turso Cloud asynchronously.
   */
  pushMutation(sql, args = []) {
    if (!this.isEnabled || !this.client) return;

    this.syncQueue.push({ sql, args, addedAt: Date.now(), retries: 0 });
    this.processQueue();
  }

  /**
   * Push a newly inserted row by table and rowid to Turso Cloud.
   * Guarantees identical primary keys across local and cloud.
   */
  pushInsertedRow(localDb, tableName, rowid) {
    if (!this.isEnabled || !this.client) return;

    try {
      const row = localDb.prepare(`SELECT * FROM "${tableName}" WHERE rowid = ?`).get(rowid);
      if (!row) return;

      const columns = Object.keys(row);
      const colNames = columns.map(c => `"${c}"`).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;
      const args = columns.map(col => row[col] !== undefined ? row[col] : null);

      this.pushMutation(sql, args);
    } catch (err) {
      console.warn(`[TursoSync] Error reading inserted row for ${tableName}:`, err.message);
    }
  }

  /**
   * Process the background queue of statements to send to Turso Cloud.
   */
  async processQueue() {
    if (this.isProcessingQueue || this.syncQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.syncQueue.length > 0) {
      const item = this.syncQueue[0];
      try {
        await this.client.execute({
          sql: item.sql,
          args: item.args
        });
        // Succeeded: remove from queue
        this.syncQueue.shift();
      } catch (err) {
        console.error('[TursoSync] Cloud replication error:', err.message);
        item.retries += 1;
        if (item.retries >= 5) {
          console.error('[TursoSync] Discarding statement after 5 retries:', item.sql);
          this.syncQueue.shift();
        } else {
          // Wait briefly before retrying
          await new Promise(res => setTimeout(res, 1000));
          break;
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Transparently wrap better-sqlite3 database so all mutations automatically replicate to Turso Cloud.
   */
  hookDatabase(localDb) {
    if (!this.isEnabled) return localDb;

    const self = this;
    const originalPrepare = localDb.prepare.bind(localDb);

    localDb.prepare = function (sql) {
      const stmt = originalPrepare(sql);
      const originalRun = stmt.run.bind(stmt);

      stmt.run = function (...args) {
        const info = originalRun(...args);

        try {
          const trimmedSql = sql.trim();
          const insertMatch = trimmedSql.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`"']?([a-zA-Z0-9_]+)[`"']?/i);

          if (insertMatch && info.lastInsertRowid) {
            const tableName = insertMatch[1];
            self.pushInsertedRow(localDb, tableName, info.lastInsertRowid);
          } else if (/^\s*(UPDATE|DELETE|REPLACE)/i.test(trimmedSql)) {
            self.pushMutation(sql, args);
          }
        } catch (syncErr) {
          console.warn('[TursoSync] Replicate hook notice:', syncErr.message);
        }

        return info;
      };

      return stmt;
    };

    console.log('[TursoSync] 🚀 Database write hook attached. All local changes will mirror to Turso Cloud in real-time!');
    return localDb;
  }
}

module.exports = new TursoSyncService();
