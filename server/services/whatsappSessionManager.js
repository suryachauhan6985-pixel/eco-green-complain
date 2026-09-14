const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');
const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const db = require('../config/database');

// Ensure database tables for session persistence
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
    key_name TEXT PRIMARY KEY,
    key_data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS whatsapp_session_meta (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    phone_number TEXT,
    connected_at DATETIME,
    status TEXT DEFAULT 'disconnected'
  );
`);

const authFolder = path.join(__dirname, '..', 'auth_baileys');
if (!fs.existsSync(authFolder)) {
  fs.mkdirSync(authFolder, { recursive: true });
}

// Restore any files from SQLite into authFolder if folder is empty or fresh
function restoreAuthFolderFromDb() {
  try {
    const credsFile = path.join(authFolder, 'creds.json');
    if (!fs.existsSync(credsFile)) {
      const rows = db.prepare('SELECT key_name, key_data FROM whatsapp_auth_keys').all();
      if (rows && rows.length > 0) {
        console.log(`[WhatsAppGateway] Restoring ${rows.length} session credentials from SQLite...`);
        for (const r of rows) {
          fs.writeFileSync(path.join(authFolder, r.key_name), r.key_data, 'utf-8');
        }
      }
    }
  } catch (e) {
    console.warn('[WhatsAppGateway] Notice restoring auth keys:', e.message);
  }
}

// Backup session files back to SQLite database
function backupAuthFolderToDb() {
  try {
    if (!fs.existsSync(authFolder)) return;
    const files = fs.readdirSync(authFolder);
    const insertStmt = db.prepare(`
      INSERT INTO whatsapp_auth_keys (key_name, key_data, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key_name) DO UPDATE SET key_data = excluded.key_data, updated_at = CURRENT_TIMESTAMP
    `);
    const backupTx = db.transaction(() => {
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(authFolder, file), 'utf-8');
          insertStmt.run(file, content);
        }
      }
    });
    backupTx();
  } catch (e) {
    console.warn('[WhatsAppGateway] Notice backing up auth keys to SQLite:', e.message);
  }
}

class WhatsAppSessionManager {
  constructor() {
    this.sock = null;
    this.connectionStatus = 'disconnected'; // 'disconnected' | 'qr_ready' | 'connected' | 'connecting'
    this.qrCodeDataUrl = null;
    this.connectedPhone = null;
    this.isInitializing = false;

    // Load initial metadata from DB
    try {
      const meta = db.prepare('SELECT * FROM whatsapp_session_meta WHERE id = 1').get();
      if (meta && meta.phone_number) {
        this.connectedPhone = meta.phone_number;
      }
    } catch (e) {}

    // Auto-start session initialization
    restoreAuthFolderFromDb();
    this.initSession();
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      isConnected: this.connectionStatus === 'connected',
      connectedPhone: this.connectedPhone,
      hasQr: Boolean(this.qrCodeDataUrl),
      qrCodeDataUrl: this.qrCodeDataUrl
    };
  }

  async initSession() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      restoreAuthFolderFromDb();
      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      this.connectionStatus = 'connecting';

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ['Eco Green Solar CMS', 'Desktop', '1.0.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
            this.connectionStatus = 'qr_ready';
            console.log('[WhatsAppGateway] 📲 New QR Code generated. Ready to scan from +91 7878444414');
          } catch (err) {
            console.error('[WhatsAppGateway] Error generating QR data URL:', err);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          console.log(`[WhatsAppGateway] Connection closed (code: ${statusCode}, loggedOut: ${isLoggedOut})`);
          
          this.connectionStatus = 'disconnected';
          this.qrCodeDataUrl = null;

          if (isLoggedOut) {
            console.log('[WhatsAppGateway] Device was unlinked from phone. Clearing session.');
            this.connectedPhone = null;
            db.prepare('DELETE FROM whatsapp_auth_keys').run();
            db.prepare("INSERT OR REPLACE INTO whatsapp_session_meta (id, phone_number, connected_at, status) VALUES (1, NULL, NULL, 'disconnected')").run();
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
              fs.mkdirSync(authFolder, { recursive: true });
            }
          }

          this.isInitializing = false;
          // Reconnect after brief pause unless permanently logged out
          setTimeout(() => {
            this.initSession();
          }, 3500);
        } else if (connection === 'open') {
          this.connectionStatus = 'connected';
          this.qrCodeDataUrl = null;
          this.isInitializing = false;

          const userJid = this.sock.user?.id || '';
          this.connectedPhone = userJid.split(':')[0] || userJid.split('@')[0] || '7878444414';
          console.log(`[WhatsAppGateway] ✅ WhatsApp Gateway CONNECTED! Mobile: +${this.connectedPhone}`);

          db.prepare(`
            INSERT OR REPLACE INTO whatsapp_session_meta (id, phone_number, connected_at, status)
            VALUES (1, ?, CURRENT_TIMESTAMP, 'connected')
          `).run(this.connectedPhone);

          backupAuthFolderToDb();
        }
      });

      this.sock.ev.on('creds.update', async () => {
        await saveCreds();
        backupAuthFolderToDb();
      });

    } catch (err) {
      console.error('[WhatsAppGateway] Init error:', err.message);
      this.connectionStatus = 'disconnected';
      this.isInitializing = false;
      setTimeout(() => this.initSession(), 5000);
    }
  }

  async sendDirectWhatsAppMessage(recipientPhone, messageText) {
    if (!this.sock || this.connectionStatus !== 'connected') {
      throw new Error('WhatsApp Gateway is currently disconnected. Please link device (+91 7878444414) in WhatsApp Gateway settings.');
    }

    let cleanNumber = String(recipientPhone || '').replace(/\D/g, '');
    if (cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    } else if (cleanNumber.startsWith('0') && cleanNumber.length === 11) {
      cleanNumber = '91' + cleanNumber.substring(1);
    }

    if (cleanNumber.length < 10) {
      throw new Error(`Invalid phone number: ${recipientPhone}`);
    }

    const jid = `${cleanNumber}@s.whatsapp.net`;
    console.log(`[WhatsAppGateway] 📤 Sending background message to ${cleanNumber}...`);

    const result = await this.sock.sendMessage(jid, { text: messageText });
    console.log(`[WhatsAppGateway] 🚀 Delivered to ${cleanNumber}, msgId: ${result?.key?.id}`);

    return {
      success: true,
      messageId: result?.key?.id,
      to: cleanNumber
    };
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout().catch(() => {});
        this.sock = null;
      }
    } catch (e) {}

    this.connectionStatus = 'disconnected';
    this.connectedPhone = null;
    this.qrCodeDataUrl = null;

    db.prepare('DELETE FROM whatsapp_auth_keys').run();
    db.prepare("INSERT OR REPLACE INTO whatsapp_session_meta (id, phone_number, connected_at, status) VALUES (1, NULL, NULL, 'disconnected')").run();

    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
      fs.mkdirSync(authFolder, { recursive: true });
    }

    console.log('[WhatsAppGateway] Session cleared. Waiting for new QR scan...');
    setTimeout(() => this.initSession(), 2000);
    return { success: true, message: 'WhatsApp session disconnected successfully' };
  }
}

// Singleton instance
const whatsappSessionManager = new WhatsAppSessionManager();

module.exports = whatsappSessionManager;
