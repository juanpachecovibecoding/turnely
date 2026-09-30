const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_SETTINGS = {
  admin_pin: process.env.ADMIN_PIN || '1234',
  gemini_api_key: process.env.GEMINI_API_KEY || '',
  gemini_model: 'gemini-1.5-flash',
  ai_enabled: true,
  clinic_name: 'Clínica Dental Sonrisas',
  clinic_phone: '+54 9 11 5555-4321',
  clinic_address: 'Av. Corrientes 1234, Piso 4, Buenos Aires',
  booking_url: process.env.APP_URL ? `${process.env.APP_URL}/#reservar` : 'http://localhost:3000/#reservar',
  system_prompt: `Eres "Valeria", la asistente virtual inteligente y cálida de la "Clínica Dental Sonrisas".
Tu misión principal es atender a los pacientes por WhatsApp de forma profesional, cordial y empática, resolver sus dudas frecuentes y guiarlos para agendar su turno mediante nuestro enlace de reservas online.

Información de la Clínica:
- Nombre: Clínica Dental Sonrisas
- Ubicación: Av. Corrientes 1234, Piso 4, Buenos Aires
- Horario de atención: Lunes a Viernes de 09:00 a 19:00 hs. Sábados de 09:00 a 14:00 hs.
- Tratamientos principales:
  * Limpieza y Profilaxis Ultrasonido (Diagnóstico + limpieza profunda)
  * Ortodoncia Invisible y Brackets estéticos
  * Blanqueamiento Dental Led (en 1 sola sesión)
  * Implantes Dentales y Cirugía guiada sin dolor
  * Odontopediatría (Atención especializada para niños)
  * Urgencias odontológicas
- Obras Sociales / Seguros: Atendemos OSDE, Swiss Medical, Galeno, Medicus y particulares (consultar copago).
- Enlace para agendar turno online: {{BOOKING_URL}}

Reglas clave para tus respuestas:
1. Responde siempre con tono amable, claro y breve (máximo 2 a 3 oraciones por mensaje).
2. Si el paciente pregunta por turnos, disponibilidad o desea ser atendido, dale amablemente el enlace de reservas online: {{BOOKING_URL}}
3. Si manifiesta dolor agudo, inflamación grave o urgencia inmediata, dile que se comunique urgentemente al teléfono de guardia: +54 9 11 5555-4321.
4. NUNCA recetes medicamentos ni des un diagnóstico clínico definitivo; invita siempre a una consulta de valoración presencial.`,
  working_days: [1, 2, 3, 4, 5, 6], // 1=Lunes, 6=Sábado
  working_hours: {
    start: '09:00',
    end: '18:30',
    lunch_start: '13:00',
    lunch_end: '14:00'
  },
  slot_duration: 30, // minutos
  treatments: [
    { id: 'limpieza', name: 'Limpieza Dental y Diagnóstico', duration: 30 },
    { id: 'ortodoncia', name: 'Consulta de Ortodoncia / Alineadores', duration: 30 },
    { id: 'blanqueamiento', name: 'Blanqueamiento Dental', duration: 45 },
    { id: 'implantes', name: 'Evaluación de Implantes / Prótesis', duration: 45 },
    { id: 'odontopediatria', name: 'Odontopediatría (Niños)', duration: 30 },
    { id: 'urgencia', name: 'Urgencia / Dolor Dental', duration: 30 }
  ]
};

let pgPool = null;

if (process.env.DATABASE_URL) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
}

function ensureLocalDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const authDir = path.join(DATA_DIR, 'auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
}

function readLocalDb() {
  ensureLocalDir();
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initial = {
      settings: { ...DEFAULT_SETTINGS },
      appointments: []
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const data = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      appointments: parsed.appointments || []
    };
  } catch (err) {
    console.error('Error leyendo base de datos local:', err);
    return { settings: { ...DEFAULT_SETTINGS }, appointments: [] };
  }
}

function writeLocalDb(data) {
  ensureLocalDir();
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function initDb() {
  if (pgPool) {
    try {
      console.log('📦 Inicializando conexión con PostgreSQL...');
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS appointments (
          id VARCHAR(50) PRIMARY KEY,
          patient_name VARCHAR(255) NOT NULL,
          patient_phone VARCHAR(100) NOT NULL,
          treatment VARCHAR(255) NOT NULL,
          appointment_date VARCHAR(20) NOT NULL,
          appointment_time VARCHAR(20) NOT NULL,
          notes TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      const res = await pgPool.query("SELECT value FROM settings WHERE key = 'app_config'");
      if (res.rows.length === 0) {
        await pgPool.query("INSERT INTO settings (key, value) VALUES ('app_config', $1)", [JSON.stringify(DEFAULT_SETTINGS)]);
      }
      console.log('✅ PostgreSQL inicializado correctamente');
    } catch (err) {
      console.error('❌ Error conectando a PostgreSQL, usando almacenamiento local:', err.message);
      pgPool = null;
      readLocalDb();
    }
  } else {
    console.log('📁 Usando almacenamiento local JSON en ./data/db.json');
    readLocalDb();
  }
}

async function getSettings() {
  if (pgPool) {
    try {
      const res = await pgPool.query("SELECT value FROM settings WHERE key = 'app_config'");
      if (res.rows.length > 0) {
        return { ...DEFAULT_SETTINGS, ...res.rows[0].value };
      }
    } catch (err) {
      console.error('Error en getSettings de PG:', err.message);
    }
  }
  const db = readLocalDb();
  return db.settings;
}

async function updateSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };

  if (pgPool) {
    try {
      await pgPool.query(
        "INSERT INTO settings (key, value) VALUES ('app_config', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [JSON.stringify(merged)]
      );
      return merged;
    } catch (err) {
      console.error('Error en updateSettings de PG:', err.message);
    }
  }

  const db = readLocalDb();
  db.settings = merged;
  writeLocalDb(db);
  return merged;
}

async function getAppointments() {
  if (pgPool) {
    try {
      const res = await pgPool.query("SELECT * FROM appointments ORDER BY appointment_date ASC, appointment_time ASC");
      return res.rows.map(r => ({
        id: r.id,
        patient_name: r.patient_name,
        patient_phone: r.patient_phone,
        treatment: r.treatment,
        date: r.appointment_date,
        time: r.appointment_time,
        notes: r.notes || '',
        status: r.status,
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('Error en getAppointments de PG:', err.message);
    }
  }
  const db = readLocalDb();
  return db.appointments || [];
}

async function createAppointment(appData) {
  const id = 'TUR-' + Math.floor(1000 + Math.random() * 9000);
  const now = new Date().toISOString();
  const newApp = {
    id,
    patient_name: appData.patient_name,
    patient_phone: appData.patient_phone,
    treatment: appData.treatment,
    date: appData.date,
    time: appData.time,
    notes: appData.notes || '',
    status: appData.status || 'confirmed',
    created_at: now
  };

  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO appointments (id, patient_name, patient_phone, treatment, appointment_date, appointment_time, notes, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newApp.id, newApp.patient_name, newApp.patient_phone, newApp.treatment, newApp.date, newApp.time, newApp.notes, newApp.status, newApp.created_at]
      );
      return newApp;
    } catch (err) {
      console.error('Error en createAppointment de PG:', err.message);
    }
  }

  const db = readLocalDb();
  db.appointments.push(newApp);
  writeLocalDb(db);
  return newApp;
}

async function updateAppointmentStatus(id, status) {
  if (pgPool) {
    try {
      await pgPool.query("UPDATE appointments SET status = $1 WHERE id = $2", [status, id]);
      return true;
    } catch (err) {
      console.error('Error en updateAppointmentStatus de PG:', err.message);
    }
  }

  const db = readLocalDb();
  const app = db.appointments.find(a => a.id === id);
  if (app) {
    app.status = status;
    writeLocalDb(db);
    return true;
  }
  return false;
}

async function deleteAppointment(id) {
  if (pgPool) {
    try {
      await pgPool.query("DELETE FROM appointments WHERE id = $1", [id]);
      return true;
    } catch (err) {
      console.error('Error en deleteAppointment de PG:', err.message);
    }
  }

  const db = readLocalDb();
  db.appointments = db.appointments.filter(a => a.id !== id);
  writeLocalDb(db);
  return true;
}

module.exports = {
  initDb,
  getSettings,
  updateSettings,
  getAppointments,
  createAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  pgPool,
  DATA_DIR
};
