document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('booking-date');
  const slotsContainer = document.getElementById('slots-container');
  const selectedTimeInput = document.getElementById('selected-time');
  const bookingForm = document.getElementById('booking-form');
  const bookingSuccess = document.getElementById('booking-success');
  const bookingMsg = document.getElementById('booking-msg');
  const btnNewBooking = document.getElementById('btn-new-booking');

  // Format today as YYYY-MM-DD
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const minDate = `${yyyy}-${mm}-${dd}`;
  dateInput.min = minDate;
  dateInput.value = minDate;

  // Load clinic public info
  fetch('/api/public/clinic')
    .then(res => res.json())
    .then(clinic => {
      if (clinic.clinic_phone) {
        const cleanPhone = clinic.clinic_phone.replace(/[^0-9]/g, '');
        const waUrl = `https://wa.me/${cleanPhone}?text=Hola,%20quisiera%20consultar%20por%20un%20turno`;
        const heroWa = document.getElementById('btn-hero-whatsapp');
        const floatWa = document.getElementById('btn-floating-whatsapp');
        if (heroWa) heroWa.href = waUrl;
        if (floatWa) floatWa.href = waUrl;
      }
    })
    .catch(() => {});

  // Load slots for initial date
  loadSlots(dateInput.value);

  dateInput.addEventListener('change', () => {
    selectedTimeInput.value = '';
    loadSlots(dateInput.value);
  });

  async function loadSlots(dateStr) {
    if (!dateStr) return;
    slotsContainer.innerHTML = `
      <div class="flex items-center gap-2 text-dental-400 py-3 text-xs">
        <svg class="animate-spin h-4 w-4 text-dental-400" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Consultando horarios disponibles...</span>
      </div>
    `;

    try {
      const res = await fetch(`/api/public/availability?date=${dateStr}`);
      const data = await res.json();

      if (!data.available) {
        slotsContainer.innerHTML = `<span class="text-xs text-amber-400 font-medium py-2">${data.reason || 'Sin disponibilidad'}</span>`;
        return;
      }

      if (!data.slots || data.slots.length === 0) {
        slotsContainer.innerHTML = `<span class="text-xs text-slate-400 py-2">No hay horarios configurados para este día.</span>`;
        return;
      }

      const availableCount = data.slots.filter(s => s.available).length;
      if (availableCount === 0) {
        slotsContainer.innerHTML = `<span class="text-xs text-red-400 font-medium py-2">Todos los turnos de este día están ocupados o pasaron.</span>`;
        return;
      }

      // Render slots
      slotsContainer.innerHTML = `
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 w-full max-h-48 overflow-y-auto p-1">
          ${data.slots.map(s => `
            <button type="button" 
              data-time="${s.time}" 
              ${!s.available ? 'disabled' : ''} 
              class="slot-btn py-2 px-1 text-xs rounded-lg font-semibold border transition text-center ${
                s.available 
                  ? 'bg-slate-800 border-slate-700 text-white hover:border-dental-500 hover:bg-dental-950/40 cursor-pointer' 
                  : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
              }">
              ${s.time}
            </button>
          `).join('')}
        </div>
      `;

      // Attach click events
      slotsContainer.querySelectorAll('.slot-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          slotsContainer.querySelectorAll('.slot-btn').forEach(b => {
            b.classList.remove('bg-dental-500', 'text-slate-950', 'border-dental-400', 'ring-2', 'ring-dental-400');
            if (!b.disabled) b.classList.add('bg-slate-800', 'text-white', 'border-slate-700');
          });
          btn.classList.remove('bg-slate-800', 'text-white', 'border-slate-700');
          btn.classList.add('bg-dental-500', 'text-slate-950', 'border-dental-400', 'ring-2', 'ring-dental-400');
          selectedTimeInput.value = btn.dataset.time;
        });
      });

    } catch (err) {
      slotsContainer.innerHTML = `<span class="text-xs text-red-400">Error al cargar disponibilidad. Intenta nuevamente.</span>`;
    }
  }

  // Handle submit booking
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    bookingMsg.classList.add('hidden');

    const treatment = document.querySelector('input[name="treatment"]:checked')?.value || 'Consulta General';
    const date = dateInput.value;
    const time = selectedTimeInput.value;
    const patient_name = document.getElementById('patient-name').value.trim();
    const patient_phone = document.getElementById('patient-phone').value.trim();
    const notes = document.getElementById('patient-notes').value.trim();

    if (!time) {
      bookingMsg.textContent = '⚠️ Por favor, selecciona un horario de la lista.';
      bookingMsg.className = 'mt-3 text-center text-sm font-semibold text-amber-400 block';
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-booking');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `
      <svg class="animate-spin h-5 w-5 text-slate-950" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>Procesando reserva...</span>
    `;

    try {
      const res = await fetch('/api/public/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name,
          patient_phone,
          treatment,
          date,
          time,
          notes
        })
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Error al agendar el turno');
      }

      // Show success card
      document.getElementById('res-code').textContent = result.appointment.id;
      document.getElementById('res-name').textContent = result.appointment.patient_name;
      document.getElementById('res-datetime').textContent = `${result.appointment.date} a las ${result.appointment.time} hs`;
      document.getElementById('res-treatment').textContent = result.appointment.treatment;

      const waMsg = encodeURIComponent(`Hola! Acabo de agendar el turno ${result.appointment.id} para ${result.appointment.patient_name} el día ${result.appointment.date} a las ${result.appointment.time} hs.`);
      document.getElementById('btn-success-whatsapp').href = `https://wa.me/${patient_phone.replace(/[^0-9]/g, '')}?text=${waMsg}`;

      bookingForm.classList.add('hidden');
      bookingSuccess.classList.remove('hidden');
      bookingSuccess.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      bookingMsg.textContent = `❌ ${err.message}`;
      bookingMsg.className = 'mt-3 text-center text-sm font-semibold text-red-400 block';
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Confirmar Mi Turno Online
      `;
    }
  });

  // Reset booking form
  btnNewBooking?.addEventListener('click', () => {
    bookingSuccess.classList.add('hidden');
    bookingForm.classList.remove('hidden');
    selectedTimeInput.value = '';
    loadSlots(dateInput.value);
  });
});
