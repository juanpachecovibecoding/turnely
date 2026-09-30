const express = require('express');
const router = express.Router();
const db = require('../db');
const bookingService = require('../services/booking');
const whatsappClient = require('../whatsapp/client');
const gemini = require('../ai/gemini');

// Middleware to verify Admin PIN
async function requireAdminAuth(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin || req.body?.pin;
  const settings = await db.getSettings();
  const validPin = settings.admin_pin || process.env.ADMIN_PIN || '1234';

  if (!pin || pin.toString() !== validPin.toString()) {
    return res.status(401).json({ error: 'PIN de administrador no válido o no proporcionado.' });
  }
  next();
}

// ==========================================
// 1. PUBLIC ENDPOINTS (Landing Page)
// ==========================================

// Ping / Health check (for Cron-job / UptimeRobot)
router.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'Turnely Dental'
  });
});

// Clinic public info
router.get('/public/clinic', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({
      clinic_name: settings.clinic_name,
      clinic_phone: settings.clinic_phone,
      clinic_address: settings.clinic_address,
      treatments: settings.treatments,
      working_days: settings.working_days,
      working_hours: settings.working_hours,
      slot_duration: settings.slot_duration
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check availability for a date
router.get('/public/availability', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Parámetro date (YYYY-MM-DD) es requerido.' });
    }
    const availability = await bookingService.getAvailableSlots(date);
    res.json(availability);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create appointment from landing page
router.post('/public/appointments', async (req, res) => {
  try {
    const appointment = await bookingService.bookAppointment(req.body);

    // Notify connected admin via Socket.IO if available
    if (req.app.get('io')) {
      req.app.get('io').emit('appointment:new', appointment);
    }

    // Optionally send WhatsApp confirmation message if connected
    const settings = await db.getSettings();
    if (whatsappClient.getStatus().state === 'CONNECTED') {
      try {
        const text = `🦷 *¡Hola ${appointment.patient_name}!* Tu turno en *${settings.clinic_name}* ha sido confirmado con éxito.\n\n📅 *Fecha:* ${appointment.date}\n⏰ *Hora:* ${appointment.time} hs\n🩺 *Tratamiento:* ${appointment.treatment}\n📍 *Lugar:* ${settings.clinic_address}\n\nCódigo de reserva: *${appointment.id}*. ¡Te esperamos!`;
        whatsappClient.sendManualMessage(appointment.patient_phone, text).catch(() => {});
      } catch (e) {
        // silent
      }
    }

    res.status(201).json({
      success: true,
      message: 'Turno agendado con éxito.',
      appointment
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 2. ADMIN ENDPOINTS
// ==========================================

// Verify Admin PIN
router.post('/admin/login', async (req, res) => {
  const { pin } = req.body;
  const settings = await db.getSettings();
  const validPin = settings.admin_pin || process.env.ADMIN_PIN || '1234';

  if (pin && pin.toString() === validPin.toString()) {
    return res.json({ success: true, message: 'Autenticación exitosa.' });
  }
  return res.status(401).json({ error: 'PIN incorrecto.' });
});

// Get settings
router.get('/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings
router.put('/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    const updated = await db.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get appointments
router.get('/admin/appointments', requireAdminAuth, async (req, res) => {
  try {
    const appointments = await db.getAppointments();
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create manual appointment (Admin)
router.post('/admin/appointments', requireAdminAuth, async (req, res) => {
  try {
    const appointment = await db.createAppointment(req.body);
    if (req.app.get('io')) {
      req.app.get('io').emit('appointment:new', appointment);
    }
    res.status(201).json(appointment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update appointment status
router.put('/admin/appointments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.updateAppointmentStatus(req.params.id, status);
    res.json({ success: true, id: req.params.id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete appointment
router.delete('/admin/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.deleteAppointment(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp: Get status
router.get('/admin/whatsapp/status', requireAdminAuth, (req, res) => {
  res.json(whatsappClient.getStatus());
});

// WhatsApp: Start / Generate QR
router.post('/admin/whatsapp/start', requireAdminAuth, async (req, res) => {
  try {
    await whatsappClient.startWhatsApp();
    res.json({ success: true, message: 'Iniciando conexión WhatsApp...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp: Logout / Unlink
router.post('/admin/whatsapp/logout', requireAdminAuth, async (req, res) => {
  try {
    await whatsappClient.logoutWhatsApp();
    res.json({ success: true, message: 'Sesión desvinculada exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp: Send manual message or reminder
router.post('/admin/whatsapp/send', requireAdminAuth, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Teléfono y mensaje requeridos.' });
    }
    await whatsappClient.sendManualMessage(phone, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI: Test prompt simulator
router.post('/admin/ai/test', requireAdminAuth, async (req, res) => {
  try {
    const { apiKey, model, prompt, message } = req.body;
    const response = await gemini.testPrompt(apiKey, model, prompt, message);
    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
