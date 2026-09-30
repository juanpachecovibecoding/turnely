const fs = require('fs');
const path = require('path');
const db = require('../db');

const AUTH_DIR = path.join(db.DATA_DIR, 'auth');

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

async function restoreAuthFromDb() {
  if (!db.pgPool) return;
  ensureAuthDir();

  try {
    const res = await db.pgPool.query('SELECT key, value FROM whatsapp_auth_keys');
    if (res.rows.length > 0) {
      console.log(`🔄 Restaurando ${res.rows.length} llaves de sesión de WhatsApp desde PostgreSQL...`);
      for (const row of res.rows) {
        const filePath = path.join(AUTH_DIR, row.key);
        fs.writeFileSync(filePath, row.value, 'utf-8');
      }
      console.log('✅ Sesión de WhatsApp restaurada con éxito desde la base de datos.');
    }
  } catch (err) {
    console.error('Error restaurando sesión de WhatsApp desde DB:', err.message);
  }
}

async function syncAuthFileToDb(fileName) {
  if (!db.pgPool) return;
  try {
    const filePath = path.join(AUTH_DIR, fileName);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      await db.pgPool.query(
        'INSERT INTO whatsapp_auth_keys (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [fileName, content]
      );
    }
  } catch (err) {
    console.error(`Error sincronizando ${fileName} con PostgreSQL:`, err.message);
  }
}

async function clearAuthDb() {
  if (db.pgPool) {
    try {
      await db.pgPool.query('DELETE FROM whatsapp_auth_keys');
    } catch (err) {
      console.error('Error limpiando whatsapp_auth_keys en DB:', err.message);
    }
  }
  ensureAuthDir();
  try {
    const files = fs.readdirSync(AUTH_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(AUTH_DIR, f));
    }
  } catch (err) {
    console.error('Error limpiando carpeta de auth local:', err.message);
  }
}

module.exports = {
  AUTH_DIR,
  ensureAuthDir,
  restoreAuthFromDb,
  syncAuthFileToDb,
  clearAuthDb
};
