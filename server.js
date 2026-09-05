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
let currentState = null;   // null = nessun quiz attivo
let quizActive   = false;

// viewers[viewerId] = { name, score, lastSeen }
//   name  = nome scelto dal giocatore nel popup iniziale (null se non ancora inserito)
//   score = punteggio nel quiz in corso (null se non ha ancora risposto)
//   lastSeen = timestamp dell'ultimo ping o punteggio
let viewers = {};

// Distribuzione risposte della domanda in corso: answers[viewerId] = indice risposta (0-3)
let answers          = {};
let currentQuestionNum = 0;

const ONLINE_WINDOW_MS = 35000;   // considerato "collegato" se si e' fatto vivo negli ultimi 35s
const FORGET_AFTER_MS  = 900000;  // dimentico chi non si vede da 15 minuti
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

// ── GESTIONE GIOCATORI ────────────────────────────────────────────
function touchViewer(viewerId, name) {
  if (!viewers[viewerId]) viewers[viewerId] = { name: null, score: null, lastSeen: 0 };
  const v = viewers[viewerId];
  if (name && String(name).trim()) v.name = String(name).trim().slice(0, 20);
  v.lastSeen = Date.now();
  return v;
}

function forgetOldViewers() {
  const now = Date.now();
  for (const id of Object.keys(viewers)) {
    if (now - viewers[id].lastSeen > FORGET_AFTER_MS) delete viewers[id];
  }
}

function displayName(id, v) {
  return v.name ? v.name : 'Ospite-' + id.slice(-4);
}

function countOnline() {
  const now = Date.now();
  return Object.values(viewers).filter(v => now - v.lastSeen <= ONLINE_WINDOW_MS).length;
}

function getLeaderboard(limit) {
  return Object.entries(viewers)
    .filter(([, v]) => typeof v.score === 'number')
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit || 50)
    .map(([id, v]) => [displayName(id, v), v.score]);
}

function resetScores() {
  for (const id of Object.keys(viewers)) viewers[id].score = null;
}

function countAnswers() {
  const counts = [0, 0, 0, 0];
  for (const idx of Object.values(answers)) {
    if (idx >= 0 && idx <= 3) counts[idx]++;
  }
  return counts;
}
// ─────────────────────────────────────────────────────────────────

// ── PING: ogni pannello aperto si fa vivo ogni 10 secondi ─────────
app.post('/ping', (req, res) => {
  const { viewerId, name } = req.body || {};
  if (!viewerId) return res.status(400).json({ error: 'viewerId richiesto' });
  touchViewer(viewerId, name);
  forgetOldViewers();
  res.json({ ok: true, online: countOnline(), quizActive });
});

// ── SCORE: punteggio corrente di uno spettatore ───────────────────
app.post('/score', (req, res) => {
  const { viewerId, name, score } = req.body || {};
  if (!viewerId || typeof score !== 'number') {
    return res.status(400).json({ error: 'viewerId e score richiesti' });
  }
  const v = touchViewer(viewerId, name);
  v.score = score;
  res.json({ ok: true });
});

// ── ANSWER: quale risposta ha scelto il giocatore (per la distribuzione) ──
app.post('/answer', (req, res) => {
  const { viewerId, name, num, idx } = req.body || {};
  if (!viewerId || typeof idx !== 'number') {
    return res.status(400).json({ error: 'viewerId e idx richiesti' });
  }
  touchViewer(viewerId, name);
  // accetto solo risposte alla domanda che e' davvero in corso,
  // cosi' una risposta in ritardo non sporca la domanda successiva
  if (typeof num === 'number' && num !== currentQuestionNum) {
    return res.json({ ok: false, reason: 'domanda non piu\' attiva' });
  }
  if (answers[viewerId] === undefined) answers[viewerId] = idx; // vale solo la prima risposta
  res.json({ ok: true });
});

// ── STATS: usato dalla dashboard streamer ─────────────────────────
app.get('/stats', (req, res) => {
  forgetOldViewers();
  const leaderboard = getLeaderboard(50);
  const counts      = countAnswers();
  res.json({
    online:       countOnline(),      // pannelli aperti in questo momento
    playing:      leaderboard.length, // chi ha gia' un punteggio nel quiz in corso
    quizActive,
    leaderboard,
    answers:      counts,             // [A, B, C, D] risposte alla domanda in corso
    answered:     counts.reduce((a, b) => a + b, 0),
    questionNum:  currentQuestionNum,
    stateType:    currentState ? currentState.type : null
  });
});

app.post('/send', async (req, res) => {
  const { channelId, payload } = req.body;
  if (!channelId || !payload) {
    return res.status(400).json({ error: 'channelId e payload richiesti' });
  }

  // ── Gestione stato e classifica ─────────────────────────────────
  if (payload.type === 'NEW_QUESTION') {
    if (payload.num === 1) { resetScores(); quizActive = true; } // nuovo quiz
    answers            = {};              // nuova domanda, distribuzione da zero
    currentQuestionNum = payload.num || 0;
    currentState       = payload;
  } else if (payload.type === 'QUIZ_END') {
    payload.leaderboard = getLeaderboard(10); // classifica finale con i nomi veri
    quizActive   = false;
    currentState = payload;  // FIX: lo stato resta disponibile su /state,
                             // cosi' anche i client a polling ricevono la classifica
  } else if (payload.type === 'QUIZ_RESET') {
    resetScores();
    answers            = {};
    currentQuestionNum = 0;
    quizActive         = false;
    currentState       = null;
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

app.get('/state', (req, res) => {
  res.json({ state: currentState });
});

app.get('/', (req, res) => {
  res.send('SQUIRZ backend attivo! 🎮');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SQUIRZ backend in ascolto sulla porta ${PORT}`);
});
