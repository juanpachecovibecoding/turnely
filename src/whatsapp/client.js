const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const authSync = require('./auth-sync');
const gemini = require('../ai/gemini');

let sock = null;
let ioInstance = null;
let connectionState = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'SCAN_QR' | 'CONNECTED'
let currentQR = null;
let currentQRDataUrl = null;
let connectedUser = null;
const activityLogs = [];
const messageCooldowns = new Map();

function addLog(type, text) {
  const logItem = {
    id: Date.now() + Math.random(),
    type, // 'info' | 'success' | 'warn' | 'error' | 'chat_in' | 'chat_out'
    text,
    timestamp: new Date().toLocaleTimeString()
  };
  activityLogs.unshift(logItem);
  if (activityLogs.length > 50) activityLogs.pop();

  if (ioInstance) {
    ioInstance.emit('whatsapp:log', logItem);
  }
}

function setSocketIO(io) {
  ioInstance = io;
}

function getStatus() {
  return {
    state: connectionState,
    qr: currentQR,
    qrDataUrl: currentQRDataUrl,
    user: connectedUser,
    logs: activityLogs
  };
}

async function startWhatsApp() {
  if (connectionState === 'CONNECTING' || connectionState === 'CONNECTED') {
    return;
  }

  connectionState = 'CONNECTING';
  if (ioInstance) {
    ioInstance.emit('whatsapp:status', { state: connectionState });
  }
  addLog('info', 'Iniciando conexión con WhatsApp Multi-Dispositivo...');

  // Restore auth from DB if PostgreSQL is used
  await authSync.restoreAuthFromDb();

  const { state, saveCreds } = await useMultiFileAuthState(authSync.AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  addLog('info', `Usando versión de WhatsApp v${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Turnely Odontología', 'Chrome', '1.0.0'],
    syncFullHistory: false
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    // Sync creds.json to DB
    await authSync.syncAuthFileToDb('creds.json');
    // Also sync any other modified json files
    try {
      const files = fs.readdirSync(authSync.AUTH_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await authSync.syncAuthFileToDb(file);
        }
      }
    } catch (e) {
      // silent
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      try {
        currentQRDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
        connectionState = 'SCAN_QR';
        addLog('warn', 'Nuevo código QR generado. Escanea desde WhatsApp > Dispositivos vinculados.');
        if (ioInstance) {
          ioInstance.emit('whatsapp:qr', {
            state: connectionState,
            qr: currentQR,
            qrDataUrl: currentQRDataUrl
          });
        }
      } catch (err) {
        console.error('Error generando DataURL del QR:', err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      const reason = lastDisconnect?.error?.message || 'Desconocido';

      currentQR = null;
      currentQRDataUrl = null;
      connectedUser = null;

      if (shouldReconnect) {
        connectionState = 'CONNECTING';
        addLog('warn', `Conexión cerrada temporalmente (${reason}). Reconectando en 5 segundos...`);
        if (ioInstance) {
          ioInstance.emit('whatsapp:status', { state: connectionState, reason });
        }
        setTimeout(startWhatsApp, 5000);
      } else {
        connectionState = 'DISCONNECTED';
        addLog('error', 'Sesión cerrada o desvinculada desde el teléfono. Limpiando credenciales...');
        await authSync.clearAuthDb();
        if (ioInstance) {
          ioInstance.emit('whatsapp:status', { state: connectionState, reason: 'LOGGED_OUT' });
        }
      }
    } else if (connection === 'open') {
      connectionState = 'CONNECTED';
      currentQR = null;
      currentQRDataUrl = null;
      const userJid = sock.user?.id || '';
      const cleanPhone = userJid.split(':')[0] || userJid.split('@')[0];
      connectedUser = {
        id: userJid,
        phone: cleanPhone,
        name: sock.user?.name || 'Consultorio'
      };
      addLog('success', `WhatsApp conectado exitosamente como +${cleanPhone}`);
      if (ioInstance) {
        ioInstance.emit('whatsapp:status', {
          state: connectionState,
          user: connectedUser
        });
      }
    }
  });

  // Listen to incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;
      // Ignore broadcast status and group messages
      if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
        continue;
      }

      // Extract message text
      const messageText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!messageText.trim()) continue;

      const senderPhone = remoteJid.split('@')[0];
      addLog('chat_in', `[+${senderPhone}]: "${messageText}"`);

      // Prevent spam / double reply loop (cooldown of 4 seconds per sender)
      const lastReply = messageCooldowns.get(remoteJid) || 0;
      if (Date.now() - lastReply < 4000) {
        console.log(`⏱️ Enfriamiento activo para ${remoteJid}, ignorando mensaje duplicado.`);
        continue;
      }
      messageCooldowns.set(remoteJid, Date.now());

      // Show typing indicator
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
      } catch (e) {}

      // Call Gemini AI
      try {
        const reply = await gemini.generateReply(messageText, senderPhone);

        if (reply) {
          await sock.sendMessage(remoteJid, { text: reply });
          addLog('chat_out', `[IA -> +${senderPhone}]: "${reply}"`);
        }
      } catch (err) {
        addLog('error', `Error al responder a +${senderPhone}: ${err.message}`);
      } finally {
        try {
          await sock.sendPresenceUpdate('paused', remoteJid);
        } catch (e) {}
      }
    }
  });
}

async function logoutWhatsApp() {
  addLog('warn', 'Desconectando sesión de WhatsApp...');
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (e) {
    console.error('Error al hacer logout en sock:', e.message);
  }
  sock = null;
  connectionState = 'DISCONNECTED';
  currentQR = null;
  currentQRDataUrl = null;
  connectedUser = null;
  await authSync.clearAuthDb();
  if (ioInstance) {
    ioInstance.emit('whatsapp:status', { state: connectionState, user: null });
  }
  addLog('info', 'Sesión desvinculada por completo.');
}

async function sendManualMessage(phoneNumber, messageText) {
  if (connectionState !== 'CONNECTED' || !sock) {
    throw new Error('WhatsApp no se encuentra conectado actualmente.');
  }

  // Sanitize phone number
  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  const jid = `${cleanNumber}@s.whatsapp.net`;

  await sock.sendMessage(jid, { text: messageText });
  addLog('chat_out', `[Manual -> +${cleanNumber}]: "${messageText}"`);
  return true;
}

module.exports = {
  setSocketIO,
  startWhatsApp,
  getStatus,
  logoutWhatsApp,
  sendManualMessage
};
