const db = require('../db');

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const m = (totalMinutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

async function getAvailableSlots(dateString) {
  const settings = await db.getSettings();
  const appointments = await db.getAppointments();

  // Parse target date
  const [year, month, day] = dateString.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const dayOfWeek = targetDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  // Check if clinic operates on this day
  const workingDays = settings.working_days || [1, 2, 3, 4, 5, 6];
  if (!workingDays.includes(dayOfWeek)) {
    return {
      available: false,
      reason: 'El consultorio se encuentra cerrado los días seleccionados.',
      slots: []
    };
  }

  // Check if date is in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (targetDate < today) {
    return {
      available: false,
      reason: 'No es posible agendar en fechas pasadas.',
      slots: []
    };
  }

  const { start, end, lunch_start, lunch_end } = settings.working_hours || {
    start: '09:00',
    end: '18:30',
    lunch_start: '13:00',
    lunch_end: '14:00'
  };

  const slotDuration = settings.slot_duration || 30;
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const lunchStartMin = lunch_start ? timeToMinutes(lunch_start) : -1;
  const lunchEndMin = lunch_end ? timeToMinutes(lunch_end) : -1;

  // Active appointments for this date
  const bookedTimes = appointments
    .filter(a => a.date === dateString && a.status !== 'cancelled')
    .map(a => a.time);

  const now = new Date();
  const isToday = targetDate.toDateString() === now.toDateString();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let m = startMin; m + slotDuration <= endMin; m += slotDuration) {
    // Skip lunch break
    if (lunchStartMin !== -1 && lunchEndMin !== -1) {
      if (m >= lunchStartMin && m < lunchEndMin) {
        continue;
      }
    }

    const timeStr = minutesToTime(m);
    const isBooked = bookedTimes.includes(timeStr);
    const isPastTime = isToday && m <= currentMinutes + 15; // At least 15 min buffer

    slots.push({
      time: timeStr,
      available: !isBooked && !isPastTime,
      reason: isBooked ? 'Ocupado' : isPastTime ? 'Horario pasado' : 'Disponible'
    });
  }

  return {
    available: true,
    date: dateString,
    slots
  };
}

async function bookAppointment(data) {
  const { patient_name, patient_phone, treatment, date, time, notes } = data;

  if (!patient_name || !patient_phone || !date || !time) {
    throw new Error('Faltan campos obligatorios para la reserva.');
  }

  // Verify slot availability
  const availability = await getAvailableSlots(date);
  const slot = availability.slots.find(s => s.time === time);

  if (!slot || !slot.available) {
    throw new Error('El horario seleccionado ya no se encuentra disponible. Por favor, selecciona otro.');
  }

  const appointment = await db.createAppointment({
    patient_name,
    patient_phone,
    treatment: treatment || 'Consulta General',
    date,
    time,
    notes,
    status: 'confirmed'
  });

  return appointment;
}

module.exports = {
  getAvailableSlots,
  bookAppointment
};
