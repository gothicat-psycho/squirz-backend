// ═══════════════════════════════════════════════════
//  SQUIRZ – Backend (Node.js)
//  Da caricare su Glitch.com
// ═══════════════════════════════════════════════════

const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// ── Configurazione ──────────────────────────────────
// Sostituisci questi valori con quelli del tuo Developer Portal
const EXTENSION_CLIENT_ID = 'w3tli745gm128l6p6300j0rwzv1bng';
const EXTENSION_SECRET    = 'ifza2kaslccij3ukalcas2fje60z92'; // in base64

// ── Genera JWT per autenticare le chiamate a Twitch ─
function makeJWT(channelId) {
  const secret = Buffer.from(EXTENSION_SECRET, 'base64');
  return jwt.sign(
    {
      exp:      Math.floor(Date.now() / 1000) + 30,
      user_id:  channelId,
      role:     'external',
      channel_id: channelId,
      pubsub_perms: { send: ['broadcast'] }
    },
    secret
  );
}

// ── Endpoint: lo streamer invia una domanda ─────────
// squirz-streamer.html chiama POST /send con la domanda
app.post('/send', async (req, res) => {
  const { channelId, payload } = req.body;

  if (!channelId || !payload) {
    return res.status(400).json({ error: 'channelId e payload richiesti' });
  }

  try {
    const token = makeJWT(channelId);

    await axios.post(
      `https://api.twitch.tv/helix/extensions/pubsub`,
      {
        target:     ['broadcast'],
        broadcaster_id: channelId,
        is_global_broadcast: false,
        message: JSON.stringify(payload)
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id':     EXTENSION_CLIENT_ID,
          'Content-Type':  'application/json'
        }
      }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Errore PubSub:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── Health check ────────────────────────────────────
app.get('/', (req, res) => {
  res.send('SQUIRZ backend attivo! 🎮');
});

// ── Avvia il server ─────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SQUIRZ backend in ascolto sulla porta ${PORT}`);
});
