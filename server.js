const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');
 
const app = express();
app.use(express.json());
app.use(cors());
 
const EXTENSION_CLIENT_ID = 'w3tli745gm128l6p6300j0rwzv1bng';
const EXTENSION_SECRET    = 'knklbaiGeqnatMasmV/UtMGHdkLJWQBCruImzAuOuic=';
 
// ── STATO IN MEMORIA ──────────────────────────────────────────────
let currentState = null; // null = nessun quiz attivo
// ─────────────────────────────────────────────────────────────────
 
function makeJWT(channelId) {
  const secret = Buffer.from(EXTENSION_SECRET, 'base64');
  const payload = {
    exp:          Math.floor(Date.now() / 1000) + 60,
    user_id:      channelId,
    role:         'external',
    channel_id:   channelId,
    pubsub_perms: { send: ['broadcast'] }
  };
  return jwt.sign(payload, secret);
}
 
app.post('/send', async (req, res) => {
  const { channelId, payload } = req.body;
  if (!channelId || !payload) {
    return res.status(400).json({ error: 'channelId e payload richiesti' });
  }
 
  // ── Salva lo stato corrente ───────────────────────────────────
  if (payload.type === 'NEW_QUESTION') {
    currentState = payload; // salva la domanda attiva
  } else if (payload.type === 'QUIZ_END' || payload.type === 'QUIZ_RESET') {
    currentState = null;    // quiz terminato, reset stato
  }
  // ─────────────────────────────────────────────────────────────
 
  try {
    const token = makeJWT(channelId);
    console.log('Invio PubSub per canale:', channelId, '| tipo:', payload.type);
 
    const response = await axios.post(
      'https://api.twitch.tv/helix/extensions/pubsub',
      {
        target:              ['broadcast'],
        broadcaster_id:      channelId,
        is_global_broadcast: false,
        message:             JSON.stringify(payload)
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id':     EXTENSION_CLIENT_ID,
          'Content-Type':  'application/json'
        }
      }
    );
    console.log('PubSub OK:', response.status);
    res.json({ ok: true });
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('Errore PubSub:', JSON.stringify(errData));
    res.status(500).json({ error: errData });
  }
});
 
// ── NUOVO ENDPOINT: stato corrente del quiz ───────────────────────
app.get('/state', (req, res) => {
  res.json({ state: currentState });
});
// ─────────────────────────────────────────────────────────────────
 
app.get('/', (req, res) => {
  res.send('SQUIRZ backend attivo! 🎮');
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SQUIRZ backend in ascolto sulla porta ${PORT}`);
});
 
