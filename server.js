require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./src/db');
const apiRoutes = require('./src/routes/api');
const whatsappClient = require('./src/whatsapp/client');
const authSync = require('./src/whatsapp/auth-sync');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pass io instance to app
app.set('io', io);
whatsappClient.setSocketIO(io);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Admin routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// API Routes
app.use('/api', apiRoutes);

// Fallback to landing page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado a Socket.IO: ${socket.id}`);
  // Send current status immediately upon connection
  socket.emit('whatsapp:status', whatsappClient.getStatus());

  socket.on('disconnect', () => {
    // console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Auto-start WhatsApp if previous session credentials exist
async function autoStartWhatsAppIfSessionExists() {
  await authSync.restoreAuthFromDb();
  const credsFile = path.join(authSync.AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsFile)) {
    console.log('📱 Credenciales previas de WhatsApp encontradas. Reconectando automáticamente...');
    try {
      await whatsappClient.startWhatsApp();
    } catch (err) {
      console.error('Error al auto-iniciar WhatsApp:', err.message);
    }
  } else {
    console.log('ℹ️ No hay sesión activa de WhatsApp. Escanea el código QR desde el panel de administración.');
  }
}

// Start server
async function startServer() {
  try {
    await db.initDb();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`=========================================`);
      console.log(`🦷 Turnely - Consultorio Odontológico`);
      console.log(`🌐 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`⚙️  Panel Admin: http://localhost:${PORT}/admin`);
      console.log(`=========================================`);
      autoStartWhatsAppIfSessionExists();
    });
  } catch (err) {
    console.error('Error iniciando el servidor:', err);
    process.exit(1);
  }
}

startServer();
