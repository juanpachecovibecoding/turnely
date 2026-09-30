const { GoogleGenAI } = require('@google/genai');
const db = require('../db');

let cachedClient = null;
let lastApiKey = null;

function getClient(apiKey) {
  if (!apiKey) return null;
  if (cachedClient && lastApiKey === apiKey) {
    return cachedClient;
  }
  cachedClient = new GoogleGenAI({ apiKey });
  lastApiKey = apiKey;
  return cachedClient;
}

async function generateReply(userMessage, senderPhone = '') {
  const settings = await db.getSettings();

  if (!settings.ai_enabled) {
    console.log('🤖 Asistente IA desactivado en configuración.');
    return null;
  }

  const apiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('⚠️ No se ha configurado la API Key de Gemini.');
    return null;
  }

  const ai = getClient(apiKey);
  const modelName = settings.gemini_model || 'gemini-1.5-flash';

  const bookingUrl = settings.booking_url || 'https://tu-sitio.com/#reservar';
  const systemInstruction = (settings.system_prompt || '')
    .replace(/\{\{BOOKING_URL\}\}/g, bookingUrl);

  try {
    const prompt = `${systemInstruction}

---
Mensaje entrante del paciente en WhatsApp:
"${userMessage}"

Tu respuesta cálida, profesional y concisa (recuerda incluir el enlace ${bookingUrl} si solicitan turno o consulta):`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt
    });

    const replyText = response.text ? response.text.trim() : null;
    return replyText;
  } catch (error) {
    console.error('❌ Error generando respuesta con Gemini:', error.message);
    return null;
  }
}

async function testPrompt(customApiKey, customModel, customPrompt, testMessage) {
  const apiKey = customApiKey || (await db.getSettings()).gemini_api_key || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('API Key no configurada.');
  }

  const ai = getClient(apiKey);
  const modelName = customModel || 'gemini-1.5-flash';
  const settings = await db.getSettings();
  const bookingUrl = settings.booking_url || 'https://tu-sitio.com/#reservar';

  const systemInstruction = (customPrompt || settings.system_prompt || '')
    .replace(/\{\{BOOKING_URL\}\}/g, bookingUrl);

  const prompt = `${systemInstruction}

---
Prueba de mensaje de paciente:
"${testMessage || 'Hola, quiero saber qué días atienden y cómo sacar un turno'}"

Respuesta simulada:`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt
  });

  return response.text ? response.text.trim() : 'Sin respuesta generada.';
}

module.exports = {
  generateReply,
  testPrompt
};
