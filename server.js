const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');
 
const app = express();
app.use(express.json());
app.use(cors());
 
const EXTENSION_CLIENT_ID = 'w3tli745gm128l6p6300j0rwzv1bng';
const EXTENSION_SECRET    = 'KEQe4P8sBK/UTJwwpCowfImr6YQeQ9gYT2Jel277S';
 
function makeJWT(channelId) {
  // Il secret delle estensioni Twitch è in base64 - va decodificato
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
  try {
    const token = makeJWT(channelId);
    console.log('Invio PubSub per canale:', channelId);
    console.log('Token generato (primi 50 chars):', token.substring(0, 50));
 
    const response = await axios.post(
      'https://api.twitch.tv/helix/extensions/pubsub',
      {
        target:             ['broadcast'],
        broadcaster_id:     channelId,
        is_global_broadcast: false,
        message:            JSON.stringify(payload)
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
 
app.get('/', (req, res) => {
  res.send('SQUIRZ backend attivo! 🎮');
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SQUIRZ backend in ascolto sulla porta ${PORT}`);
});
 
