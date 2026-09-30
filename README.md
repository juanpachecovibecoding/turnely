# 🦷 Turnely - Plataforma Todo-en-Uno para Consultorio Odontológico

**Turnely** es una solución web integral pensada para clínicas y consultorios odontológicos que desean automatizar la atención a pacientes, agendar citas en tiempo real y responder dudas 24/7 mediante **WhatsApp y la Inteligencia Artificial de Google Gemini**, todo desplegado en un solo lugar y optimizado para la **capa gratuita de Render**.

---

## 🌟 Características Principales

### 1. 🌐 Landing Page Pública (`/`)
* **Diseño Médico y Moderno:** Presentación de tratamientos (Limpieza, Ortodoncia Invisible, Blanqueamiento, Implantes, Odontopediatría y Urgencias).
* **Sistema de Reservas en Tiempo Real:** 
  * Selección de tratamiento, fecha y horario disponible.
  * Validación instantánea de horarios ocupados o fuera de jornada.
  * Confirmación de cita con código único de turno (`TUR-XXXX`) y enlace directo a WhatsApp.
* **Acceso Rápido:** Botón flotante para consultar por WhatsApp y sección de testimonios.

### 2. 📱 WhatsApp Multi-Dispositivo con Código QR
* Conexión directa mediante **Baileys** (WebSocket oficial de WhatsApp Web, sin navegadores pesados).
* Generación de **Código QR en vivo** directamente desde el Panel de Administración.
* Reconexión automática en caso de caídas de red.
* Envío de mensajes manuales o recordatorios de citas con un solo clic.

### 3. 🤖 Inteligencia Artificial con Google Gemini
* **Respuestas inteligentes 24/7:** Responde dudas frecuentes sobre precios aproximados, seguros médicos, ubicación y horarios de la clínica.
* **Entrega del Enlace de Turnos:** Cada vez que un paciente solicita cita o consulta disponibilidad, Gemini le entrega cordialmente el enlace directo al agendador de la web (`#reservar`).
* **Prompt Personalizable:** Edita el conocimiento y la personalidad del asistente desde el panel administrativo.
* **Simulador en Vivo:** Prueba cómo respondería la IA a cualquier pregunta antes de activarla para los pacientes.

### 4. 📅 Agenda & Horarios Flexibles
* Configuración de días hábiles de la semana (Lunes a Domingo).
* Horarios de apertura, cierre y pausa para almuerzo.
* Duración de turnos configurable (15, 30, 45 o 60 minutos).

### 5. 📋 Panel de Control Administrativo (`/admin`)
* Protegido por PIN de seguridad (por defecto `1234`).
* Gestión de citas: Filtrar por fecha, estado (Confirmada, Pendiente, Cancelada, Atendida) o búsqueda por paciente.
* Registro de citas manuales para pacientes presenciales o telefónicos.
* Registro en tiempo real de actividad y mensajes entrantes/salientes.

---

## 🚀 Despliegue en Railway (Recomendado)

Railway es la plataforma preferida para bots de WhatsApp con **Baileys**, ya que soporta WebSockets continuos, no requiere trucos para no dormirse y construye usando el `Dockerfile` optimizado con Node 20.

### Pasos en Railway:
1. Entra a [Railway.com](https://railway.com/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **+ New Project** y selecciona **Deploy from GitHub repo**.
3. Selecciona tu repositorio: `juanpachecovibecoding/turnely`.
4. Railway detectará automáticamente el `Dockerfile` y empezará a compilar.
5. Ve a la pestaña **Variables** del servicio y añade:
   * `ADMIN_PIN`: `1234` (O el PIN de tu preferencia)
   * `GEMINI_API_KEY`: Tu clave gratuita de [Google AI Studio](https://aistudio.google.com/app/apikey)
   * `PORT`: `3000`
6. En la pestaña **Settings** > **Networking**, haz clic en **Generate Domain** para obtener tu URL pública (ej: `https://turnely-production.up.railway.app`).
7. *(Opcional)* En el mismo proyecto, haz clic en **+ New** > **Database** > **PostgreSQL**. Railway inyectará automáticamente la variable `DATABASE_URL` para que las credenciales de WhatsApp y las citas queden 100% respaldadas.

---

## 🚀 Despliegue en Render

## 💡 Consejos Críticos para la Capa Gratuita

### 1. Evitar que Render se "duerma" (Mantener 24/7)
Los servicios web gratuitos de Render entran en suspensión tras 15 minutos sin peticiones HTTP. Para que el WebSocket de WhatsApp y la IA respondan siempre:
1. Crea una cuenta gratuita en [cron-job.org](https://cron-job.org/) o [UptimeRobot](https://uptimerobot.com/).
2. Añade un monitor que haga un `GET` a tu endpoint de salud cada **10 minutos**:
   ```
   https://tu-app-en-render.onrender.com/api/ping
   ```
3. Esto mantiene el servidor despierto 24/7 dentro del límite de 750 horas gratis al mes.

### 2. Persistencia de la Sesión de WhatsApp (Sin pedir QR al reiniciar)
* Por defecto, la app guarda la sesión localmente en `./data/auth`.
* En Render Free, el disco es efímero al redesplegar. **Si quieres que la sesión de WhatsApp NUNCA se pierda al reiniciar**:
  1. Crea una base de datos PostgreSQL gratuita en [Supabase](https://supabase.com/) o [Neon.tech](https://neon.tech/).
  2. Copia la URL de conexión (Connection String) y colócala en la variable de entorno `DATABASE_URL`.
  3. Turnely detectará PostgreSQL y sincronizará automáticamente las claves de WhatsApp y las citas en la nube.

---

## 💻 Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/juanpachecovibecoding/turnely.git
cd turnely

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env

# 4. Iniciar en modo desarrollo
npm run dev

# 5. Abrir en el navegador:
# Landing: http://localhost:3000
# Panel Admin: http://localhost:3000/admin (PIN por defecto: 1234)
```

---

## 🔒 Licencia
MIT © 2026 Turnely - Desarrollado para clínicas y consultorios odontológicos.
