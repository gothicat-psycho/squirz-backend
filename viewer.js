const SCORE_TABLE=[{max:5,pts:1000},{max:10,pts:750},{max:15,pts:500},{max:20,pts:250}];
let myScore=0, answered=false, timerInt=null, currentT=20;
let selectedIdx=-1, selectedBtn=null, selectedCorretta=-1, selectedPts=0;
let currentQNum=0; // numero della domanda in corso, serve al backend per la distribuzione

const BACKEND_URL = 'https://squirz-backend-production.up.railway.app';
let viewerId = null;
let viewerName = null;
function getViewerId(){
  if(viewerId) return viewerId;
  if(typeof window.Twitch!=='undefined' && window.Twitch.ext && window.Twitch.ext.viewer && window.Twitch.ext.viewer.opaqueId){
    viewerId = window.Twitch.ext.viewer.opaqueId;   // dentro Twitch
    return viewerId;
  }
  // Fuori da Twitch (pagina web per YouTube): genero un codice casuale e lo
  // conservo sul dispositivo, cosi' chi ricarica la pagina non perde il punteggio.
  try{
    var salvato = window.localStorage.getItem('squirz_id');
    if(!salvato){
      salvato = 'web-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
      window.localStorage.setItem('squirz_id', salvato);
    }
    viewerId = salvato;
  }catch(e){
    viewerId = 'web-' + Math.random().toString(36).slice(2,10);
  }
  return viewerId;
}

// Se ho gia' giocato da questo dispositivo, riuso il nome scelto
try{
  var nomeSalvato = window.localStorage.getItem('squirz_nome');
  if(nomeSalvato) viewerName = nomeSalvato;
}catch(e){}
function submitScore(){
  fetch(BACKEND_URL + '/score', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ viewerId: getViewerId(), name: viewerName, score: myScore })
  }).catch(function(e){ console.warn('Errore invio punteggio:', e); });
}
// Battito: segnala al backend che questo pannello e' aperto, cosi' lo streamer
// vede quanti giocatori sono collegati anche prima della prima domanda.
let pingInt = null;
function sendPing(){
  fetch(BACKEND_URL + '/ping', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ viewerId: getViewerId(), name: viewerName })
  }).catch(function(){ /* silenzioso: non deve disturbare il gioco */ });
}
// Comunica allo streamer quale risposta e' stata scelta (barre di distribuzione)
function submitAnswer(idx){
  fetch(BACKEND_URL + '/answer', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ viewerId: getViewerId(), name: viewerName, num: currentQNum, idx: idx })
  }).catch(function(){ /* silenzioso */ });
}
function startHeartbeat(){
  if(pingInt) return;
  sendPing();
  pingInt = setInterval(sendPing, 10000);
}
let nickOverlay=null;      // overlay aperto in questo momento (o null)
let pendingAfterNick=null; // cosa fare appena il nome e' confermato
let nickCssDone=false;

function injectNickCss(){
  if(nickCssDone) return;
  nickCssDone=true;
  var st=document.createElement('style');
  st.textContent=
  '.nick-ov{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;flex-direction:column;'+
  'align-items:center;justify-content:center;gap:16px;z-index:1000;padding:20px;text-align:center;overflow-y:auto;}'+
  '.nick-title{color:#FFD700;font-size:30px;font-weight:700;line-height:1.1;letter-spacing:.5px;}'+
  '.nick-sub{color:#ffffff;font-size:17px;line-height:1.3;max-width:320px;}'+
  '.nick-input{font-size:23px;padding:14px 16px;border-radius:10px;border:2px solid #FFD700;'+
  'background:#111;color:#fff;width:88%;max-width:300px;text-align:center;font-family:inherit;}'+
  '.nick-joke{color:#ffffff;font-size:14px;line-height:1.35;max-width:320px;letter-spacing:.3px;opacity:.9;margin-top:4px;}'+
  '.nick-fake{font-size:17px;padding:13px 14px;border-radius:10px;border:2px dashed #4a4a80;'+
  'background:#0b0b16;color:#6a6a90;width:88%;max-width:300px;text-align:center;cursor:pointer;'+
  'user-select:none;-webkit-user-select:none;transition:all .25s;}'+
  '.nick-fake.gotcha{border-style:solid;border-color:#00e887;color:#00e887;background:#001a0e;cursor:default;}'+
  '.nick-ok{font-size:20px;font-weight:700;padding:13px 36px;border-radius:10px;border:none;'+
  'background:#FFD700;color:#000;cursor:pointer;font-family:inherit;letter-spacing:1px;}'+
  // pannello desktop: solo 250px di altezza, qui va tutto ridotto
  '@media (max-height:340px){'+
  '.nick-ov{gap:7px;padding:10px;}'+
  '.nick-title{font-size:19px;}.nick-sub{font-size:12px;}'+
  '.nick-input{font-size:16px;padding:7px 10px;}'+
  '.nick-joke{font-size:10px;margin-top:0;}'+
  '.nick-fake{font-size:12px;padding:7px 10px;}'+
  '.nick-ok{font-size:14px;padding:8px 24px;}}';
  document.head.appendChild(st);
}

function askNicknameIfNeeded(callback){
  if(viewerName){ if(callback) callback(); return; }
  if(nickOverlay){ pendingAfterNick = callback || pendingAfterNick; return; } // gia' aperto
  injectNickCss();

  var overlay=document.createElement('div');
  overlay.className='nick-ov';
  overlay.innerHTML=
    '<div class="nick-title">Come ti chiami?</div>'+
    '<div class="nick-sub">Non che ci interessi, però se lo scrivi comparirà nella classifica finale dello SQUIRZ!</div>'+
    '<input id="nick-input" class="nick-input" maxlength="20" placeholder="Il tuo nome" autocomplete="off">'+
    '<div class="nick-joke">Se hai piacere, puoi indicare, qui di seguito, le 16 cifre del tuo bancomat seguite dal tuo pin</div>'+
    '<div id="nick-fake" class="nick-fake">0000 0000 0000 0000</div>'+
    '<button id="nick-ok" class="nick-ok">OK</button>';
  document.body.appendChild(overlay);
  nickOverlay = overlay;
  pendingAfterNick = callback || null;

  // Il campo "bancomat" e' finto: non si puo' scrivere e non invia niente.
  var fake=overlay.querySelector('#nick-fake');
  fake.onclick=function(){
    fake.textContent='MA SEI PICIU? \uD83D\uDE42';
    fake.className='nick-fake gotcha';
    fake.onclick=null;
  };

  var input=overlay.querySelector('#nick-input');
  input.focus();
  function confirmName(){
    var v=(input.value||'').trim();
    viewerName = v.length ? v.slice(0,20) : ('Ospite'+Math.floor(Math.random()*900+100));
    try{ window.localStorage.setItem('squirz_nome', viewerName); }catch(e){}
    document.body.removeChild(overlay);
    nickOverlay = null;
    sendPing(); // comunica subito il nome scelto
    var cb = pendingAfterNick; pendingAfterNick = null;
    if(cb) cb(); // se nel frattempo e' arrivata una domanda, la mostro adesso
  }
  overlay.querySelector('#nick-ok').onclick=confirmName;
  input.addEventListener('keydown',function(e){ if(e.key==='Enter') confirmName(); });
}

const CC_DEFAULT=['GENIO ASSOLUTO! 🤯','LO SAPEVO CHE LO SAPEVI! 🙌','INARRESTABILE! 🚀','CHE CERVELLONE! 🧠','TROPPO FORTE! 🔥'];
const CS_DEFAULT=['CLAMOROSO ERRORE! 😂','NOOOOO! 😱','MA COME?! 🤦','URGE RIPASSARE! 📚','OGGI NON È LA TUA GIORNATA! 😔'];
const CT_DEFAULT=['OU...VEDI CHE TI DEVI SVEGLIARE...DIO FA! 😴'];
let CC=CC_DEFAULT.slice(), CS=CS_DEFAULT.slice(), CT=CT_DEFAULT.slice();
let shuffCC=[], shuffCS=[], shuffCT=[], idxCC=0, idxCS=0, idxCT=0;

function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function initCommenti(corretti, sbagliati){
  if(corretti&&corretti.length) CC=corretti.slice();
  if(sbagliati&&sbagliati.length) CS=sbagliati.slice();
  shuffCC=shuffle(CC); shuffCS=shuffle(CS); shuffCT=shuffle(CT); idxCC=0; idxCS=0; idxCT=0;
}
function nextCC(){ if(idxCC>=shuffCC.length){shuffCC=shuffle(CC);idxCC=0;} return shuffCC[idxCC++]; }
function nextCS(){ if(idxCS>=shuffCS.length){shuffCS=shuffle(CS);idxCS=0;} return shuffCS[idxCS++]; }
function nextCT(){ if(idxCT>=shuffCT.length){shuffCT=shuffle(CT);idxCT=0;} return shuffCT[idxCT++]; }

function getPts(e){ for(const r of SCORE_TABLE) if(e<=r.max) return r.pts; return 250; }

function renderQuestion(data){
  function proceed(){
    const {domanda, risposte, corretta, num, total, commentiCorretti, commentiSbagliati} = data;
    showScreen('quiz'); answered=false; selectedIdx=-1; selectedBtn=null; selectedCorretta=-1; selectedPts=0;
    // Inizializza i commenti solo alla prima domanda del quiz
    if(num===1) initCommenti(commentiCorretti, commentiSbagliati);
    currentQNum=num;
    document.getElementById('qnum').textContent=`DOMANDA ${num}/${total}`;
    document.getElementById('qtxt').textContent=domanda;
    document.getElementById('feedback').className='q-feedback';
    document.getElementById('feedback').textContent='';
    updateScore();
    const labels=['A','B','C','D'], dc=['dA','dB','dC','dD'];
    const grid=document.getElementById('agrid'); grid.innerHTML='';
    risposte.forEach((r,ri)=>{
      const b=document.createElement('button');
      b.className='ans-btn';
      b.innerHTML=`<div class="ans-dot ${dc[ri]}">${labels[ri]}</div><div class="ans-txt">${r}</div>`;
      b.onclick=()=>pick(ri,corretta,b);
      grid.appendChild(b);
    });
    startTimer(()=>{ reveal(corretta); });
  }
  // Se il nome non c'e' ancora (es. arrivato a quiz gia' iniziato) lo chiedo qui;
  // se c'e' gia', askNicknameIfNeeded esegue subito senza mostrare nulla.
  askNicknameIfNeeded(proceed);
}

function pick(idx, corretta, btn){
  if(answered || selectedIdx>=0) return;
  selectedIdx=idx; selectedBtn=btn; selectedCorretta=corretta;
  selectedPts=getPts(21-currentT); // salva i punti al momento del click
  submitAnswer(idx);                // lo streamer vede subito la distribuzione
  document.querySelectorAll('.ans-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
}

function reveal(corretta){
  answered=true; clearInterval(timerInt);
  const btns=document.querySelectorAll('.ans-btn');
  btns.forEach(b=>{ b.disabled=true; b.classList.remove('selected'); });
  if(selectedIdx>=0){
    const pts=selectedPts; // punti calcolati al momento del click
    if(selectedIdx===selectedCorretta){
      selectedBtn.classList.add('correct'); myScore+=pts;
      setFeedback('correct', nextCC()+` +${pts} PT`);
    } else {
      selectedBtn.classList.add('wrong');
      btns[corretta].classList.add('correct');
      myScore-=pts; setFeedback('wrong', nextCS()+` \u2212${pts} PT`);
    }
    btns.forEach((b,i)=>{ if(i!==selectedIdx && i!==corretta) b.classList.add('grey'); });
  } else {
    btns[corretta].classList.add('correct');
    btns.forEach((b,i)=>{ if(i!==corretta) b.classList.add('grey'); });
    setFeedback('wrong', nextCT());
  }
  updateScore();
  submitScore();
}

function getScoreComment(score){
  if(score===0) return 'ZERO SPACCATO! Ti vogliamo bene e ti manderemo una foto dei piedi';
  if(score>0){
    if(score<=1000) return 'BENE! Dai...meglio di molti altri!';
    if(score<=3000) return 'BRAVO! Potevi fare meglio però!';
    if(score<=5000) return 'DISTINTO! Con qualche sforzo in più saresti stato!';
    if(score<=9000) return 'OTTIMO! Non sappiamo come tu abbia fatto!';
    return 'TOP! Avrai sicuramente trassato!';
  } else {
    const abs=Math.abs(score);
    if(abs<=1000) return 'MALINO! Ma poteva andare peggio...';
    if(abs<=3000) return 'MALE! Ti è ancora andata di culo, va...';
    if(abs<=5000) return 'MOLTO MALE! Se continui di questo passo...';
    if(abs<=8000) return 'MALISSIMO! Oh, se non sai giocare lascia perdere...';
    return 'PESSIMO! Ora riceverai un addebito di 5000 Euro...';
  }
}

function myTag(){ return String(getViewerId()).slice(-8); }

// ── CLASSIFICA FINALE PAGINATA ────────────────────────────────────────
let lbRows=[], lbPage=0, lbMyPos=0, lbTotale=0, lbPageSize=10;
let lbCssDone=false;

function injectLbCss(){
  if(lbCssDone) return;
  lbCssDone=true;
  var st=document.createElement('style');
  st.textContent=
  '#result{overflow-y:auto;}'+
  '.res-mypos{font-size:15px;color:#FFD700;letter-spacing:.5px;text-align:center;margin:3px 0;}'+
  '.lb-pager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:6px;}'+
  '.lb-pager.hidden{display:none;}'+
  '.lbp-btn{font-family:inherit;font-size:18px;line-height:1;font-weight:700;'+
  'background:#1a1a30;color:#FFD700;border:1px solid #3a3a60;border-radius:8px;'+
  'padding:4px 14px;cursor:pointer;}'+
  '.lbp-btn:disabled{opacity:.3;cursor:default;}'+
  '.lbp-info{font-size:12px;color:#8080b0;letter-spacing:.5px;min-width:60px;text-align:center;}'+
  // pannello desktop (250px): compatto, e logo del risultato piu' piccolo
  '@media (max-height:340px){'+
  '#result{gap:1px;padding:6px 12px;}'+
  '.res-logo img{height:40px;}'+
  '.res-score{font-size:30px;}'+
  '.res-title{font-size:16px;letter-spacing:2px;}'+
  '.res-comment{margin:1px 0;}'+
  '.res-mypos{font-size:10px;margin:0;}'+
  '.lb-pager{gap:8px;margin-top:2px;}'+
  '.lbp-btn{font-size:13px;padding:1px 10px;}'+
  '.lbp-info{font-size:10px;min-width:44px;}}';
  document.head.appendChild(st);
}

// Crea, una sola volta, la riga "sei X su Y" e i pulsanti di pagina
function ensureLbExtras(){
  var lb=document.getElementById('res-lb');
  if(!lb) return;
  if(!document.getElementById('res-mypos')){
    var sum=document.createElement('div');
    sum.id='res-mypos'; sum.className='res-mypos';
    lb.parentNode.insertBefore(sum, lb);
  }
  if(!document.getElementById('res-pager')){
    var pg=document.createElement('div');
    pg.id='res-pager'; pg.className='lb-pager';
    pg.innerHTML='<button class="lbp-btn" id="lb-prev">\u2039</button>'+
                 '<span class="lbp-info" id="lb-info"></span>'+
                 '<button class="lbp-btn" id="lb-next">\u203a</button>';
    lb.parentNode.insertBefore(pg, lb.nextSibling);
    pg.querySelector('#lb-prev').onclick=function(){ if(lbPage>0){ lbPage--; renderLbPage(); } };
    pg.querySelector('#lb-next').onclick=function(){
      if(lbPage < Math.ceil(lbRows.length/lbPageSize)-1){ lbPage++; renderLbPage(); }
    };
  }
}

function renderLbPage(){
  var lb=document.getElementById('res-lb'); if(!lb) return;
  var posC=['g','s','b'];
  var tag=myTag();
  var totPag=Math.max(1, Math.ceil(lbRows.length/lbPageSize));
  if(lbPage>totPag-1) lbPage=totPag-1;
  var fetta=lbRows.slice(lbPage*lbPageSize, (lbPage+1)*lbPageSize);

  lb.innerHTML='';
  fetta.forEach(function(r){
    var row=document.createElement('div');
    row.className='res-row'+(r.tag===tag?' me':'');
    row.innerHTML='<span class="res-pos '+(posC[r.pos]||'')+'">'+(r.pos+1)+'</span>'+
                  '<span class="res-name">'+r.name+'</span>'+
                  '<span class="res-sc'+(r.score<0?' neg':'')+'">'+(r.score>=0?'+':'')+r.score+'</span>';
    lb.appendChild(row);
  });

  var pg=document.getElementById('res-pager');
  var info=document.getElementById('lb-info');
  if(pg){
    pg.className='lb-pager'+(totPag<=1?' hidden':'');
    if(info) info.textContent=(lbPage+1)+' / '+totPag;
    var prev=document.getElementById('lb-prev'), next=document.getElementById('lb-next');
    if(prev) prev.disabled=(lbPage===0);
    if(next) next.disabled=(lbPage>=totPag-1);
  }
}

function renderResult(data){
  var leaderboard=(data && data.leaderboard) || [];
  var allScores=(data && data.allScores) || null;
  var tag=myTag();
  var myName=viewerName || 'Tu';

  injectLbCss();

  // Ogni riga e' [nome, punteggio, tag]: mi riconosco dal tag, non dal nome,
  // perche' due giocatori possono chiamarsi allo stesso modo.
  lbRows=leaderboard.map(function(r,i){ return {name:r[0], score:r[1], tag:r[2], pos:i}; });
  var mine=null;
  for(var i=0;i<lbRows.length;i++){ if(lbRows[i].tag && lbRows[i].tag===tag){ mine=lbRows[i]; break; } }

  if(mine){
    lbMyPos=mine.pos;
  } else if(allScores && allScores.length){
    // oltre il 50esimo: calcolo la posizione vera contando chi ha fatto meglio
    lbMyPos=allScores.filter(function(sc){ return sc>myScore; }).length;
    lbRows.push({name:myName, score:myScore, tag:tag, pos:lbMyPos});
  } else {
    lbMyPos=lbRows.filter(function(r){ return r.score>myScore; }).length;
    lbRows.push({name:myName, score:myScore, tag:tag, pos:lbMyPos});
  }
  lbTotale=(data && data.totalPlayers) || lbRows.length;

  var titles=['CAMPIONE!','2\u00b0 POSTO!','3\u00b0 POSTO!','QUIZ FINITO!'];
  showScreen('result');
  document.getElementById('res-title').textContent=titles[Math.min(lbMyPos,3)];
  document.getElementById('res-score').textContent=(myScore>=0?'+':'')+myScore;
  document.getElementById('res-score').className='res-score'+(myScore<0?' neg':'');
  var comment=document.getElementById('res-comment');
  if(comment) comment.textContent=getScoreComment(myScore);

  ensureLbExtras();
  var sum=document.getElementById('res-mypos');
  if(sum) sum.textContent='SEI '+(lbMyPos+1)+'\u00b0 SU '+lbTotale;

  // Poche righe per pagina sul pannello desktop, che e' alto solo 250px
  lbPageSize = (window.innerHeight && window.innerHeight < 340) ? 5
             : (window.innerHeight && window.innerHeight < 560) ? 7 : 10;
  // Apro direttamente sulla pagina dove sto io
  lbPage = Math.floor(lbMyPos / lbPageSize);
  renderLbPage();

  var closeBtn=document.getElementById('res-close');
  if(closeBtn) closeBtn.onclick=function(){ showScreen('pausa'); };
}

function setFeedback(cls,msg){
  const fb=document.getElementById('feedback');
  fb.textContent=msg; fb.className='q-feedback '+cls;
  setTimeout(function(){ fb.scrollIntoView({behavior:'smooth', block:'center'}); }, 50);
}
function updateScore(){ const el=document.getElementById('score'); el.textContent=(myScore>=0?'+':'')+myScore+' PT'; el.className='q-score'+(myScore<0?' neg':''); }
function updatePts(e){ const pts=getPts(e||1); document.getElementById('pts').textContent='\u00b1'+pts+' PT'; document.getElementById('pts').className='q-pts active'; }

function startTimer(onEnd){
  clearInterval(timerInt); currentT=20;
  const tn=document.getElementById('tnum'), tf=document.getElementById('tfill');
  const tu=document.getElementById('tunit'); // parola "SECONDI" accanto al numero
  tn.textContent=20; tn.className='q-tnum';
  if(tu) tu.className='q-tnum-unit';
  tf.style.transition='none'; tf.style.width='100%'; tf.className='q-fill';
  updatePts(1);
  setTimeout(()=>{ tf.style.transition='width 20s linear'; tf.style.width='0%'; },30);
  timerInt=setInterval(()=>{
    currentT--; tn.textContent=currentT; updatePts(21-currentT);
    if(currentT<=5){
      tn.className='q-tnum urgent';
      if(tu) tu.className='q-tnum-unit urgent';
      tf.className='q-fill urgent';
    }
    if(currentT<=0){ clearInterval(timerInt); onEnd(); }
  },1000);
}

// Lo streamer ha annunciato lo SQUIRZ: mostro la schermata di attesa
// e chiedo il nome, cosi' i giocatori sono pronti prima della domanda 1.
function mostraAttesa(){
  showScreen('idle');
  askNicknameIfNeeded(null);
}

function showScreen(id){
  ['pausa','idle','quiz','result'].forEach(s=>{
    const el=document.getElementById(s);
    el.style.display=s===id?'flex':'none';
    if(s===id) el.style.flexDirection='column';
  });
}

function fetchCurrentState(){
  fetch(BACKEND_URL + '/state')
    .then(r=>r.json())
    .then(data=>{
      const d=data.state;
      if(!d||!d.type){ showScreen('pausa'); return; }
      console.log('Stato recuperato dal backend:', d.type);
      if(d.type==='NEW_QUESTION')  renderQuestion(d);
      if(d.type==='QUIZ_END')      renderResult(d);
      if(d.type==='QUIZ_WAITING')  mostraAttesa();
    })
    .catch(e=>console.warn('Impossibile recuperare stato:', e));
}

let tentativiTwitch = 0;
function initTwitch(){
  if(typeof window.Twitch==='undefined'||typeof window.Twitch.ext==='undefined'){
    // Fuori da Twitch (pagina web) dopo 10 secondi smetto di aspettare:
    // ci pensa il polling della pagina a ricevere gli aggiornamenti.
    if(++tentativiTwitch > 20){ console.log('Twitch non disponibile: modalita web.'); return; }
    setTimeout(initTwitch,500); return;
  }
  window.Twitch.ext.onAuthorized(function(auth){
    console.log('Twitch auth OK', auth);
    fetchCurrentState();
  });
  window.Twitch.ext.listen('broadcast',function(target,contentType,message){
    try{
      const d=JSON.parse(message);
      if(!d||!d.type) return;
      console.log('Messaggio ricevuto:', d.type);
      if(d.type==='NEW_QUESTION')  renderQuestion(d);
      if(d.type==='QUIZ_END')      renderResult(d);
      if(d.type==='QUIZ_WAITING')  mostraAttesa();
      if(d.type==='QUIZ_RESET'){   myScore=0; showScreen('pausa'); }
    }catch(e){
      console.error('Errore messaggio:', e);
    }
  });
}
initTwitch();

// All'apertura del pannello chiedo subito il nome, poi si resta sulla schermata
// di attesa. Il piccolo ritardo serve a dare tempo a Twitch di fornire l'ID
// spettatore, cosi' il giocatore non viene contato due volte.
setTimeout(function(){
  startHeartbeat();  // vale sia su Twitch sia nel test in locale
}, 1200);
// All'apertura si parte dalla schermata di pausa: il nome viene chiesto
// quando lo streamer lancia l'attesa, non a chi passa di li' per caso.
showScreen('pausa');
