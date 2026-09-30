let currentPin = sessionStorage.getItem('turnely_admin_pin') || '';
let socket = null;
let allAppointments = [];

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initTabs();
  initSocket();
  initEventListeners();
});

// Toast notification helper
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  toastText.textContent = message;
  toast.className = `fixed bottom-6 right-6 z-50 ${isError ? 'bg-red-500' : 'bg-emerald-500'} text-slate-950 px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs flex items-center gap-2 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto`;
  setTimeout(() => {
    toast.className = `fixed bottom-6 right-6 z-50 ${isError ? 'bg-red-500' : 'bg-emerald-500'} text-slate-950 px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs flex items-center gap-2 transform translate-y-20 opacity-0 transition-all duration-300 pointer-events-none`;
  }, 3500);
}

// Fetch with Admin PIN header
async function apiFetch(url, options = {}) {
  options.headers = {
    ...options.headers,
    'x-admin-pin': currentPin,
    'Content-Type': 'application/json'
  };
  const res = await fetch(url, options);
  if (res.status === 401) {
    sessionStorage.removeItem('turnely_admin_pin');
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('admin-app').classList.add('hidden');
    throw new Error('PIN incorrecto o sesión expirada.');
  }
  return res;
}

// 1. AUTHENTICATION
function initAuth() {
  const authModal = document.getElementById('auth-modal');
  const adminApp = document.getElementById('admin-app');
  const pinForm = document.getElementById('pin-form');
  const pinInput = document.getElementById('input-pin');
  const pinError = document.getElementById('pin-error');
  const btnLogoutPin = document.getElementById('btn-logout-pin');

  if (currentPin) {
    // Validate stored PIN
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: currentPin })
    }).then(res => {
      if (res.ok) {
        authModal.classList.add('hidden');
        adminApp.classList.remove('hidden');
        loadAllData();
      } else {
        sessionStorage.removeItem('turnely_admin_pin');
        currentPin = '';
        authModal.classList.remove('hidden');
      }
    }).catch(() => {
      authModal.classList.remove('hidden');
    });
  } else {
    authModal.classList.remove('hidden');
  }

  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pinError.classList.add('hidden');
    const pin = pinInput.value.trim();

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      if (!res.ok) {
        pinError.classList.remove('hidden');
        return;
      }

      currentPin = pin;
      sessionStorage.setItem('turnely_admin_pin', pin);
      authModal.classList.add('hidden');
      adminApp.classList.remove('hidden');
      loadAllData();
      showToast('Sesión iniciada con éxito');
    } catch (err) {
      pinError.classList.remove('hidden');
    }
  });

  btnLogoutPin.addEventListener('click', () => {
    sessionStorage.removeItem('turnely_admin_pin');
    window.location.reload();
  });
}

// 2. TABS NAVIGATION
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.target;
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.add('hidden'));

      tab.classList.add('active');
      document.getElementById(targetId)?.classList.remove('hidden');
      lucide.createIcons();
    });
  });
}

// 3. SOCKET.IO REALTIME
function initSocket() {
  socket = io();

  socket.on('whatsapp:status', (data) => {
    updateWhatsAppUI(data);
  });

  socket.on('whatsapp:qr', (data) => {
    updateWhatsAppQR(data);
  });

  socket.on('whatsapp:log', (log) => {
    appendLog(log);
  });

  socket.on('appointment:new', (app) => {
    showToast(`🔔 ¡Nuevo turno agendado! ${app.patient_name} (${app.time} hs)`);
    loadAppointments();
  });
}

// 4. WHATSAPP UI UPDATES
function updateWhatsAppUI(data) {
  const state = data.state || 'DISCONNECTED';
  const qrBox = document.getElementById('wa-qr-box');
  const connectedBox = document.getElementById('wa-connected-box');
  const disconnectedBox = document.getElementById('wa-disconnected-box');
  const loadingBox = document.getElementById('wa-loading-box');

  const headerBadge = document.getElementById('header-wa-badge');
  const headerDot = document.getElementById('header-wa-dot');
  const headerText = document.getElementById('header-wa-text');

  qrBox.classList.add('hidden');
  connectedBox.classList.add('hidden');
  disconnectedBox.classList.add('hidden');
  loadingBox.classList.add('hidden');

  if (state === 'CONNECTED') {
    connectedBox.classList.remove('hidden');
    document.getElementById('wa-user-phone').textContent = data.user?.phone ? `+${data.user.phone}` : 'Número activo';
    headerDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    headerText.textContent = data.user?.phone ? `+${data.user.phone}` : 'WhatsApp Conectado';
    headerBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300';
  } else if (state === 'SCAN_QR') {
    qrBox.classList.remove('hidden');
    if (data.qrDataUrl) {
      document.getElementById('wa-qr-img').src = data.qrDataUrl;
    }
    headerDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
    headerText.textContent = 'Escanear Código QR';
    headerBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-950/60 border border-amber-500/40 text-amber-300';
  } else if (state === 'CONNECTING') {
    loadingBox.classList.remove('hidden');
    headerDot.className = 'w-2 h-2 rounded-full bg-sky-400 animate-pulse';
    headerText.textContent = 'Conectando WhatsApp...';
    headerBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300';
  } else {
    disconnectedBox.classList.remove('hidden');
    headerDot.className = 'w-2 h-2 rounded-full bg-red-400';
    headerText.textContent = 'WhatsApp Desconectado';
    headerBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-950/60 border border-red-500/30 text-red-300';
  }

  if (data.logs && Array.isArray(data.logs)) {
    const logsContainer = document.getElementById('wa-logs-container');
    logsContainer.innerHTML = '';
    data.logs.slice().reverse().forEach(appendLog);
  }

  lucide.createIcons();
}

function updateWhatsAppQR(data) {
  const qrBox = document.getElementById('wa-qr-box');
  const connectedBox = document.getElementById('wa-connected-box');
  const disconnectedBox = document.getElementById('wa-disconnected-box');
  const loadingBox = document.getElementById('wa-loading-box');

  qrBox.classList.remove('hidden');
  connectedBox.classList.add('hidden');
  disconnectedBox.classList.add('hidden');
  loadingBox.classList.add('hidden');

  document.getElementById('wa-qr-img').src = data.qrDataUrl;
  document.getElementById('header-wa-dot').className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
  document.getElementById('header-wa-text').textContent = 'Escanear Código QR';
  lucide.createIcons();
}

function appendLog(log) {
  const container = document.getElementById('wa-logs-container');
  const line = document.createElement('div');
  
  let color = 'text-slate-400';
  if (log.type === 'success') color = 'text-emerald-400';
  if (log.type === 'warn') color = 'text-amber-400';
  if (log.type === 'error') color = 'text-red-400';
  if (log.type === 'chat_in') color = 'text-sky-300';
  if (log.type === 'chat_out') color = 'text-dental-300 font-bold';

  line.className = color;
  line.textContent = `[${log.timestamp || new Date().toLocaleTimeString()}] ${log.text}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

// 5. LOAD ALL DATA
async function loadAllData() {
  loadSettings();
  loadAppointments();
}

// Load settings from API
async function loadSettings() {
  try {
    const res = await apiFetch('/api/admin/settings');
    const s = await res.json();

    // AI Tab
    document.getElementById('gemini-key').value = s.gemini_api_key || '';
    document.getElementById('gemini-model').value = s.gemini_model || 'gemini-1.5-flash';
    document.getElementById('gemini-prompt').value = s.system_prompt || '';
    document.getElementById('ai-toggle-active').checked = s.ai_enabled !== false;

    // Schedule Tab
    const days = s.working_days || [1, 2, 3, 4, 5, 6];
    document.querySelectorAll('.day-check').forEach(cb => {
      cb.checked = days.includes(Number(cb.value));
    });
    if (s.working_hours) {
      document.getElementById('sched-start').value = s.working_hours.start || '09:00';
      document.getElementById('sched-end').value = s.working_hours.end || '18:30';
      document.getElementById('sched-lunch-start').value = s.working_hours.lunch_start || '13:00';
      document.getElementById('sched-lunch-end').value = s.working_hours.lunch_end || '14:00';
    }
    document.getElementById('sched-slot-duration').value = s.slot_duration || 30;

    // General Settings Tab
    document.getElementById('set-clinic-name').value = s.clinic_name || '';
    document.getElementById('set-clinic-phone').value = s.clinic_phone || '';
    document.getElementById('set-clinic-address').value = s.clinic_address || '';
    document.getElementById('set-booking-url').value = s.booking_url || '';
    document.getElementById('set-admin-pin').value = s.admin_pin || '1234';

  } catch (err) {
    console.error('Error cargando ajustes:', err);
  }
}

// Load appointments
async function loadAppointments() {
  try {
    const res = await apiFetch('/api/admin/appointments');
    allAppointments = await res.json();
    renderAppointments(allAppointments);
    updateMetrics(allAppointments);
  } catch (err) {
    console.error('Error cargando turnos:', err);
  }
}

function updateMetrics(apps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = apps.filter(a => a.date === todayStr && a.status !== 'cancelled').length;
  const upcomingCount = apps.filter(a => a.date >= todayStr && a.status !== 'cancelled').length;
  const confirmedCount = apps.filter(a => a.status === 'confirmed').length;

  document.getElementById('stat-today').textContent = todayCount;
  document.getElementById('stat-upcoming').textContent = upcomingCount;
  document.getElementById('stat-confirmed').textContent = confirmedCount;
  document.getElementById('stat-total').textContent = apps.length;
}

function renderAppointments(apps) {
  const tbody = document.getElementById('appointments-tbody');
  const search = document.getElementById('search-app').value.toLowerCase().trim();
  const filter = document.getElementById('filter-status').value;

  const filtered = apps.filter(a => {
    const matchesSearch = !search || 
      a.patient_name.toLowerCase().includes(search) || 
      a.patient_phone.includes(search) || 
      a.id.toLowerCase().includes(search);
    const matchesFilter = filter === 'all' || a.status === filter;
    return matchesSearch && matchesFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-500">No se encontraron turnos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">Confirmado</span>';
    if (a.status === 'pending') statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-500/30">Pendiente</span>';
    if (a.status === 'cancelled') statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/30">Cancelado</span>';
    if (a.status === 'attended') statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950 text-sky-400 border border-sky-500/30">Atendido</span>';

    const cleanPhone = a.patient_phone.replace(/[^0-9]/g, '');
    const waText = encodeURIComponent(`Hola ${a.patient_name}, te escribimos de la Clínica Dental para recordarte tu turno del día ${a.date} a las ${a.time} hs.`);

    return `
      <tr class="hover:bg-slate-900/40 transition">
        <td class="py-3 px-4 font-mono font-bold text-slate-400">${a.id}</td>
        <td class="py-3 px-4 font-semibold text-white">${a.patient_name}</td>
        <td class="py-3 px-4 text-slate-300">
          <a href="https://wa.me/${cleanPhone}" target="_blank" class="hover:text-emerald-400 flex items-center gap-1">
            ${a.patient_phone}
          </a>
        </td>
        <td class="py-3 px-4 text-slate-400">${a.treatment}</td>
        <td class="py-3 px-4 text-white font-medium">${a.date} <span class="text-dental-400">${a.time} hs</span></td>
        <td class="py-3 px-4">${statusBadge}</td>
        <td class="py-3 px-4 text-right space-x-1">
          <a href="https://wa.me/${cleanPhone}?text=${waText}" target="_blank" class="p-1.5 inline-block text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition" title="Enviar recordatorio por WhatsApp">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </a>
          ${a.status !== 'confirmed' ? `
            <button onclick="changeAppStatus('${a.id}', 'confirmed')" class="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition" title="Confirmar">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          ` : ''}
          ${a.status !== 'cancelled' ? `
            <button onclick="changeAppStatus('${a.id}', 'cancelled')" class="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition" title="Cancelar">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </button>
          ` : ''}
          <button onclick="deleteApp('${a.id}')" class="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Eliminar">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

// Global actions for table
window.changeAppStatus = async (id, status) => {
  try {
    await apiFetch(`/api/admin/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    showToast(`Turno ${id} actualizado a ${status}`);
    loadAppointments();
  } catch (err) {
    showToast(err.message, true);
  }
};

window.deleteApp = async (id) => {
  if (!confirm(`¿Deseas eliminar el turno ${id}?`)) return;
  try {
    await apiFetch(`/api/admin/appointments/${id}`, { method: 'DELETE' });
    showToast(`Turno ${id} eliminado`);
    loadAppointments();
  } catch (err) {
    showToast(err.message, true);
  }
};

// 6. EVENT LISTENERS
function initEventListeners() {
  // WhatsApp: Start QR
  document.getElementById('btn-start-wa').addEventListener('click', async () => {
    try {
      showToast('Generando código QR...');
      await apiFetch('/api/admin/whatsapp/start', { method: 'POST' });
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // WhatsApp: Logout
  document.getElementById('btn-logout-wa').addEventListener('click', async () => {
    if (!confirm('¿Seguro que deseas desvincular WhatsApp? Tendrás que escanear el QR nuevamente.')) return;
    try {
      await apiFetch('/api/admin/whatsapp/logout', { method: 'POST' });
      showToast('Sesión de WhatsApp cerrada');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // WhatsApp: Send Manual Message
  document.getElementById('btn-send-manual').addEventListener('click', async () => {
    const phone = document.getElementById('manual-phone').value.trim();
    const message = document.getElementById('manual-text').value.trim();
    const feedback = document.getElementById('manual-msg-feedback');

    if (!phone || !message) {
      feedback.textContent = 'Ingresa el teléfono y mensaje';
      feedback.className = 'text-xs text-amber-400 block';
      return;
    }

    try {
      await apiFetch('/api/admin/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ phone, message })
      });
      feedback.textContent = '✅ Mensaje enviado con éxito';
      feedback.className = 'text-xs text-emerald-400 block';
      document.getElementById('manual-text').value = '';
      setTimeout(() => feedback.className = 'hidden', 3000);
    } catch (err) {
      feedback.textContent = `❌ ${err.message}`;
      feedback.className = 'text-xs text-red-400 block';
    }
  });

  // WhatsApp: Clear Logs
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('wa-logs-container').innerHTML = '';
  });

  // AI: Toggle Password Visibility
  document.getElementById('btn-toggle-key').addEventListener('click', () => {
    const input = document.getElementById('gemini-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // AI: Reset default prompt
  document.getElementById('btn-reset-prompt').addEventListener('click', () => {
    document.getElementById('gemini-prompt').value = `Eres "Valeria", la asistente virtual inteligente y cálida de la "Clínica Dental Sonrisas".
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
4. NUNCA recetes medicamentos ni des un diagnóstico clínico definitivo; invita siempre a una consulta de valoración presencial.`;
    showToast('Plantilla cargada. Guarda para aplicar.');
  });

  // AI: Save AI Settings
  document.getElementById('btn-save-ai').addEventListener('click', async () => {
    try {
      const gemini_api_key = document.getElementById('gemini-key').value.trim();
      const gemini_model = document.getElementById('gemini-model').value;
      const system_prompt = document.getElementById('gemini-prompt').value.trim();
      const ai_enabled = document.getElementById('ai-toggle-active').checked;

      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          gemini_api_key,
          gemini_model,
          system_prompt,
          ai_enabled
        })
      });
      showToast('Ajustes de IA guardados');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // AI: Run Simulator
  document.getElementById('btn-run-sim').addEventListener('click', async () => {
    const message = document.getElementById('sim-input').value.trim();
    const apiKey = document.getElementById('gemini-key').value.trim();
    const model = document.getElementById('gemini-model').value;
    const prompt = document.getElementById('gemini-prompt').value.trim();
    const card = document.getElementById('sim-response-card');
    const textEl = document.getElementById('sim-response-text');

    if (!message) {
      showToast('Escribe una pregunta para simular', true);
      return;
    }

    card.classList.remove('hidden');
    textEl.textContent = 'Generando respuesta con Gemini...';

    try {
      const res = await apiFetch('/api/admin/ai/test', {
        method: 'POST',
        body: JSON.stringify({ apiKey, model, prompt, message })
      });
      const data = await res.json();
      textEl.textContent = data.response;
    } catch (err) {
      textEl.textContent = `❌ Error: ${err.message}`;
    }
  });

  // Schedule: Save Schedule Settings
  document.getElementById('btn-save-schedule').addEventListener('click', async () => {
    const working_days = [];
    document.querySelectorAll('.day-check:checked').forEach(cb => {
      working_days.push(Number(cb.value));
    });

    const working_hours = {
      start: document.getElementById('sched-start').value,
      end: document.getElementById('sched-end').value,
      lunch_start: document.getElementById('sched-lunch-start').value,
      lunch_end: document.getElementById('sched-lunch-end').value
    };

    const slot_duration = Number(document.getElementById('sched-slot-duration').value);

    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          working_days,
          working_hours,
          slot_duration
        })
      });
      showToast('Horarios y disponibilidad guardados');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // General Settings: Save
  document.getElementById('btn-save-general').addEventListener('click', async () => {
    const clinic_name = document.getElementById('set-clinic-name').value.trim();
    const clinic_phone = document.getElementById('set-clinic-phone').value.trim();
    const clinic_address = document.getElementById('set-clinic-address').value.trim();
    const booking_url = document.getElementById('set-booking-url').value.trim();
    const admin_pin = document.getElementById('set-admin-pin').value.trim();

    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          clinic_name,
          clinic_phone,
          clinic_address,
          booking_url,
          admin_pin
        })
      });
      if (admin_pin && admin_pin !== currentPin) {
        currentPin = admin_pin;
        sessionStorage.setItem('turnely_admin_pin', admin_pin);
      }
      showToast('Ajustes generales guardados');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Appointments: Filters
  document.getElementById('search-app').addEventListener('input', () => renderAppointments(allAppointments));
  document.getElementById('filter-status').addEventListener('change', () => renderAppointments(allAppointments));
  document.getElementById('btn-refresh-apps').addEventListener('click', loadAppointments);

  // Appointments: Manual Modal
  const modalManual = document.getElementById('modal-manual-app');
  document.getElementById('btn-modal-manual-app').addEventListener('click', () => {
    modalManual.classList.remove('hidden');
    document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('manual-time').value = '10:00';
  });

  document.getElementById('btn-close-manual-modal').addEventListener('click', () => {
    modalManual.classList.add('hidden');
  });

  document.getElementById('form-manual-app').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patient_name = document.getElementById('manual-name').value.trim();
    const patient_phone = document.getElementById('manual-phone-input').value.trim();
    const treatment = document.getElementById('manual-treatment').value.trim();
    const date = document.getElementById('manual-date').value;
    const time = document.getElementById('manual-time').value;
    const notes = document.getElementById('manual-notes').value.trim();

    try {
      await apiFetch('/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient_name,
          patient_phone,
          treatment,
          date,
          time,
          notes,
          status: 'confirmed'
        })
      });
      modalManual.classList.add('hidden');
      document.getElementById('form-manual-app').reset();
      showToast('Cita creada con éxito');
      loadAppointments();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
