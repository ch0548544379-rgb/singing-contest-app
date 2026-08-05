const socket = io();

const screens = {
  idle: document.getElementById('screen-idle'),
  performer: document.getElementById('screen-performer'),
  voting: document.getElementById('screen-voting'),
  results: document.getElementById('screen-results'),
  songSelect: document.getElementById('screen-song'),
  winner: document.getElementById('screen-winner'),
};

let lastState = null;
let votingIntensity = 1;
let lastAnimatedResultsRoundId = null;
let lastAnimatedWinnerId = null;

// ===== מערכת וריאציות לחשיפת דירוג דרמטית (60+ שילובים כדי שלא ייראה זהה לכל זמר) =====
const REVEAL_DIRECTIONS = ['up', 'down', 'left', 'right', 'spiral'];
const REVEAL_STYLES = ['slot', 'cascade', 'glitch'];
const REVEAL_ACCENTS = ['gold', 'accent', 'accent2', 'mix'];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickVariation(seed) {
  const h = hashStr(seed);
  return {
    dir: REVEAL_DIRECTIONS[h % REVEAL_DIRECTIONS.length],
    style: REVEAL_STYLES[Math.floor(h / 7) % REVEAL_STYLES.length],
    accent: REVEAL_ACCENTS[Math.floor(h / 53) % REVEAL_ACCENTS.length],
    duration: 1000 + (h % 700),
  };
}

function animateCountUp(el, from, to, duration, onDone, decimals) {
  const d = decimals == null ? 1 : decimals;
  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (from + (to - from) * eased).toFixed(d);
    if (t < 1) requestAnimationFrame(step);
    else { el.textContent = to.toFixed(d); if (onDone) onDone(); }
  }
  requestAnimationFrame(step);
}

// אנימציית "מספרים עפים" לניקוד השופטים - מופעלת ברגע שהניקוד נשמר (effect:judgesSting)
function animateJudgesScore(contestantId) {
  if (!lastState) return;
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round) return;
  const r = round.results[contestantId];
  if (!r || r.judgesTotal == null) return;
  const elId = lastState.display.mode === 'voting' ? 'judgesLiveVoting' : 'judgesLivePerformer';
  const wrap = document.getElementById(elId);
  const span = wrap.querySelector('span');
  const v = pickVariation(round.id + ':' + contestantId + ':judges');
  span.className = `digit-${v.style}`;
  wrap.classList.remove('hidden');
  void wrap.offsetWidth;
  span.classList.add('counting');
  animateCountUp(span, 0, r.judgesTotal, v.duration, () => {
    span.classList.remove('counting');
    StageEffects.burst(null, null, 10);
  }, 0);
}

function flashSting() {
  const el = document.getElementById('stingFlash');
  el.classList.remove('on');
  void el.offsetWidth; // restart animation
  el.classList.add('on');
}

StageEffects.initNotes('notes-canvas', () => votingIntensity);
StageEffects.initSilhouettes('silhouette-layer', 3);

document.getElementById('soundBtn').addEventListener('click', () => {
  StageAudio.start();
  document.getElementById('soundGate').classList.add('hidden');
});

function showScreen(mode) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', key !== mode);
  });
}

function findContestant(state, id) {
  return state.roster.find((r) => r.id === id);
}

function renderHistogram(round, contestantId) {
  const el = document.getElementById('histogram');
  const votes = (round.results[contestantId] && round.results[contestantId].audienceVotes) || [];
  const counts = Array.from({ length: 10 }, (_, i) => votes.filter((v) => v === i + 1).length);
  const max = Math.max(1, ...counts);
  el.innerHTML = counts
    .map(
      (c, i) => `<div class="vote-bar-wrap">
        <div class="vote-bar" style="height:${(c / max) * 100}%"></div>
        <div class="vote-bar-label">${i + 1}</div>
      </div>`
    )
    .join('');
  const avg = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length) : 0;
  document.getElementById('voteCount').textContent = votes.length;
  document.getElementById('voteAvg').textContent = avg.toFixed(1);
}

// מוזיקה אמיתית (קובץ) רק ברגעים ספציפיים - שקט מוחלט על הבמה ובזמן ניקוד שופטים, בכוונה.
let currentMusicScenario = null;
function setMusicScenario(scenario) {
  if (scenario === currentMusicScenario) return;
  currentMusicScenario = scenario;
  if (scenario === 'voting') {
    StageAudio.playMusicTrack('/music/tension.mp3', { loop: true, volume: 0.7, fadeMs: 1500 });
  } else {
    StageAudio.stopMusicTrack(900);
  }
}

function render(state) {
  lastState = state;
  const stage = state.display.stageLevel || 1;
  document.getElementById('stageBg').className = 'stage-bg stage-' + stage;
  votingIntensity = state.display.mode === 'voting' ? 2.6 + stage * 0.8 : 1.3 + stage * 0.45;
  StageAudio.setMuted(!!state.display.musicMuted);
  StageAudio.setStage(stage);
  StageAudio.setVoting(state.display.mode === 'voting');
  setMusicScenario(state.display.mode === 'voting' ? 'voting' : null);

  showScreen(state.display.mode);

  const round = state.rounds.find((r) => r.id === state.currentRoundId);

  function renderJudgesLive(elId, round, contestantId) {
    const el = document.getElementById(elId);
    const r = round && round.results[contestantId];
    if (r && r.judgesTotal != null) {
      el.classList.remove('hidden');
      el.querySelector('span').textContent = r.judgesTotal;
    } else {
      el.classList.add('hidden');
    }
  }

  if (state.display.mode === 'performer') {
    const c = findContestant(state, state.currentPerformerId);
    document.getElementById('performerName').textContent = c ? c.name : '-';
    document.getElementById('stageBadge').textContent = 'שלב ' + stage;
    renderJudgesLive('judgesLivePerformer', round, state.currentPerformerId);
  }

  if (state.display.mode === 'voting' && round) {
    const c = findContestant(state, state.currentPerformerId);
    document.getElementById('votingName').textContent = c ? c.name : '-';
    document.getElementById('stageBadgeV').textContent = 'שלב ' + stage;
    renderJudgesLive('judgesLiveVoting', round, state.currentPerformerId);

    // בסבב הגמר (שלב 3) לא מציגים לקהל את תוצאות ההצבעה בזמן אמת, כדי לשמור על אלמנט ההפתעה -
    // המוזיקה עדיין מתגברת לפי הניקוד בפועל, רק לא מוצגים המספרים.
    const isFinalStage = round.stageLevel === 3;
    document.getElementById('histogram').classList.toggle('hidden', isFinalStage);
    document.getElementById('voteStatsBox').classList.toggle('hidden', isFinalStage);
    document.getElementById('pointsGaugeWrap').classList.toggle('hidden', isFinalStage);
    if (!isFinalStage) renderHistogram(round, state.currentPerformerId);

    const r = round.results[state.currentPerformerId] || { audienceVotes: [] };
    const votes = r.audienceVotes || [];
    const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
    const norm = (avg / 10) * round.judgesMax;
    const pct = round.judgesMax ? Math.max(0, Math.min(1, norm / round.judgesMax)) : 0;
    document.getElementById('pointsGaugeFill').style.width = (pct * 100).toFixed(1) + '%';
    document.getElementById('audiencePoints').textContent = norm.toFixed(1);
    document.getElementById('audiencePointsMax').textContent = round.judgesMax;
    document.getElementById('totalScoreValue').textContent = ((r.judgesTotal || 0) + norm).toFixed(1);
    StageAudio.setVoteHeat(pct);

    const phoneEl = document.getElementById('votePhoneDisplay');
    if (state.votePhoneNumber) {
      phoneEl.textContent = '📞 ' + state.votePhoneNumber;
      phoneEl.classList.remove('hidden');
    } else {
      phoneEl.classList.add('hidden');
    }
  }

  if (state.display.mode === 'results' && round) {
    renderResultsReveal(state, round);
  }

  if (state.display.mode === 'songSelect' && state.songSelection) {
    const ss = state.songSelection;
    const listEl = document.getElementById('songList');
    if (ss.revealed) {
      const winner = ss.songs.find((s) => s.id === ss.winnerSongId);
      listEl.innerHTML = `<div class="panel song-card song-card-solo">${winner ? winner.name : ''}</div>`;
    } else {
      listEl.innerHTML = ss.songs.map((s) => `<div class="panel song-card">${s.name}</div>`).join('');
    }
  }

  if (state.display.mode === 'winner') {
    if (state.finalWinnerId !== lastAnimatedWinnerId) {
      lastAnimatedWinnerId = state.finalWinnerId;
      const c = findContestant(state, state.finalWinnerId);
      playWinnerSequence(c ? c.name : '-');
    }
  }
}

const ORDINALS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני', 'תשיעי'];

function computeRoundRows(state, round) {
  return round.participantIds
    .map((cid) => {
      const c = findContestant(state, cid);
      const r = round.results[cid] || {};
      const votes = r.audienceVotes || [];
      const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
      const norm = (avg / 10) * round.judgesMax;
      const combined = (r.judgesTotal || 0) + norm;
      return { c, combined };
    })
    .sort((a, b) => b.combined - a.combined);
}

// אחרי הספוטלייט - מציגים רק את שמות העולים הלאה, בלי מספרי דירוג ובלי שאר המשתתפים
function renderFullResultsList(rows, round) {
  const list = document.getElementById('resultsList');
  const advancerRows = rows.filter((row) => row.c && round.advancers.includes(row.c.id));
  list.innerHTML = advancerRows
    .map((row) => `<div class="panel result-row reveal-in advancer"><span class="result-name">${row.c.name}</span></div>`)
    .join('');
}

// חשיפה דרמטית: קודם כרטיס ספוטלייט בודד לכל אחד מהעולים הלאה (מקום ראשון, שני, שלישי...)
// בזה אחר זה, ורק בסוף מוצגת הרשימה המלאה עם כל המשתתפים.
function renderResultsReveal(state, round) {
  if (lastAnimatedResultsRoundId === round.id) return;
  lastAnimatedResultsRoundId = round.id;

  const allRows = computeRoundRows(state, round);
  const advancerRows = allRows
    .filter((r) => r.c && round.advancers.includes(r.c.id))
    .sort((a, b) => b.combined - a.combined);

  const spotlight = document.getElementById('resultsSpotlight');
  const list = document.getElementById('resultsList');
  const title = document.getElementById('resultsTitle');
  list.classList.add('hidden');
  title.classList.add('hidden');
  list.innerHTML = '';

  function finish() {
    spotlight.classList.add('hidden');
    title.classList.remove('hidden');
    list.classList.remove('hidden');
    renderFullResultsList(allRows, round);
  }

  if (!advancerRows.length) { finish(); return; }

  spotlight.classList.remove('hidden');

  function showStep(i) {
    if (i >= advancerRows.length) { finish(); return; }
    const row = advancerRows[i];
    const seed = round.id + ':' + row.c.id;
    const v = pickVariation(seed);
    spotlight.className = `results-spotlight reveal-dir-${v.dir} reveal-accent-${v.accent}`;
    document.getElementById('spotlightRank').textContent = 'מקום ' + (ORDINALS_HE[i] || (i + 1));
    document.getElementById('spotlightName').textContent = row.c.name;
    const scoreEl = document.getElementById('spotlightScore');
    scoreEl.className = `spotlight-score digit-${v.style}`;
    scoreEl.textContent = '0.0';
    void spotlight.offsetWidth;
    spotlight.classList.add('reveal-in');
    scoreEl.classList.add('counting');
    animateCountUp(scoreEl, 0, row.combined, v.duration, () => {
      scoreEl.classList.remove('counting');
      StageEffects.burst(null, null, 14);
    });
    setTimeout(() => {
      spotlight.classList.remove('reveal-in');
      setTimeout(() => showStep(i + 1), 400);
    }, v.duration + 1500);
  }
  showStep(0);
}

// שטיח אדום בפרספקטיבה (גליל שנפתח לכיוון האופק) + עמודי זהב עם חבל אדום משני הצדדים - סצנת SVG אחת שרצה בעצמה
function carpetSceneSVG() {
  return `
  <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMax meet" width="100%" height="100%">
    <defs>
      <linearGradient id="carpetGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7a0000"/>
        <stop offset="45%" stop-color="#c3001f"/>
        <stop offset="100%" stop-color="#8a0000"/>
      </linearGradient>
      <linearGradient id="postGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff2c9"/>
        <stop offset="45%" stop-color="#d9ac3f"/>
        <stop offset="100%" stop-color="#8a5f10"/>
      </linearGradient>
    </defs>

    <polygon fill="url(#carpetGrad)" opacity="0.97">
      <animate attributeName="points" dur="10s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1"
        values="460,0 540,0 540,0 460,0; 460,0 540,0 1000,400 0,400"/>
    </polygon>
    <rect x="480" y="0" width="40" height="9" rx="4.5" fill="url(#postGold)">
      <animate attributeName="y" dur="10s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1" values="0;391"/>
      <animate attributeName="x" dur="10s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1" values="480;0"/>
      <animate attributeName="width" dur="10s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1" values="40;1000"/>
    </rect>

    <path d="M269,132 Q144,290 19,332" fill="none" stroke="#8a0010" stroke-width="6" stroke-linecap="round" opacity="0" stroke-dasharray="340" stroke-dashoffset="340">
      <animate attributeName="opacity" begin="2.6s" dur="0.4s" fill="freeze" values="0;1"/>
      <animate attributeName="stroke-dashoffset" begin="2.6s" dur="4.6s" fill="freeze" values="340;0"/>
    </path>
    <path d="M731,132 Q856,290 981,332" fill="none" stroke="#8a0010" stroke-width="6" stroke-linecap="round" opacity="0" stroke-dasharray="340" stroke-dashoffset="340">
      <animate attributeName="opacity" begin="2.6s" dur="0.4s" fill="freeze" values="0;1"/>
      <animate attributeName="stroke-dashoffset" begin="2.6s" dur="4.6s" fill="freeze" values="340;0"/>
    </path>

    <g id="postFarL" transform="translate(269,140)" opacity="0">
      <animate attributeName="opacity" begin="2.3s" dur="0.5s" fill="freeze" values="0;1"/>
      <ellipse cx="0" cy="30" rx="11" ry="4" fill="#000" opacity="0.3"/>
      <rect x="-4" y="-14" width="8" height="44" rx="3" fill="url(#postGold)"/>
      <circle cx="0" cy="-20" r="9" fill="url(#postGold)" stroke="#5a3d08" stroke-width="1.2"/>
    </g>
    <g id="postFarR" transform="translate(731,140)" opacity="0">
      <animate attributeName="opacity" begin="2.3s" dur="0.5s" fill="freeze" values="0;1"/>
      <ellipse cx="0" cy="30" rx="11" ry="4" fill="#000" opacity="0.3"/>
      <rect x="-4" y="-14" width="8" height="44" rx="3" fill="url(#postGold)"/>
      <circle cx="0" cy="-20" r="9" fill="url(#postGold)" stroke="#5a3d08" stroke-width="1.2"/>
    </g>
    <g id="postNearL" transform="translate(19,340)" opacity="0">
      <animate attributeName="opacity" begin="6.8s" dur="0.5s" fill="freeze" values="0;1"/>
      <ellipse cx="0" cy="46" rx="17" ry="6" fill="#000" opacity="0.3"/>
      <rect x="-6" y="-22" width="12" height="68" rx="4" fill="url(#postGold)"/>
      <circle cx="0" cy="-31" r="14" fill="url(#postGold)" stroke="#5a3d08" stroke-width="1.5"/>
    </g>
    <g id="postNearR" transform="translate(981,340)" opacity="0">
      <animate attributeName="opacity" begin="6.8s" dur="0.5s" fill="freeze" values="0;1"/>
      <ellipse cx="0" cy="46" rx="17" ry="6" fill="#000" opacity="0.3"/>
      <rect x="-6" y="-22" width="12" height="68" rx="4" fill="url(#postGold)"/>
      <circle cx="0" cy="-31" r="14" fill="url(#postGold)" stroke="#5a3d08" stroke-width="1.5"/>
    </g>
  </svg>`;
}

// רצף הכרזת הזוכה: השטיח האדום נפרש בפרספקטיבה לכיוון האופק עם עמודי חבל, נעצר, והשם נוחת עליו בזהב
function playWinnerSequence(name) {
  const wrap = document.getElementById('carpetPerspective');
  const nameEl = document.getElementById('winnerName');
  wrap.innerHTML = carpetSceneSVG(); // markup חדש בכל קריאה = אנימציות ה-SVG מתחילות מאפס
  nameEl.classList.add('hidden');
  nameEl.classList.remove('landing');
  nameEl.textContent = name;
  setTimeout(() => {
    nameEl.classList.remove('hidden');
    void nameEl.offsetWidth;
    nameEl.classList.add('landing');
    StageEffects.burst(null, null, 30);
  }, 10000);
}

socket.on('state:full', render);
socket.on('vote:new', () => {
  if (lastState) render(lastState);
  StageEffects.burst(null, null, 20);
});
socket.on('effect:winnerStinger', () => {
  currentMusicScenario = 'winner';
  if (StageAudio.isStarted()) {
    StageAudio.playMusicTrack('/music/the-harder-they-fall.mp3', { loop: false, volume: 0.85, fadeMs: 200 });
    StageAudio.applause();
  }
});
socket.on('effect:judgesSting', ({ contestantId }) => {
  if (StageAudio.isStarted()) StageAudio.judgesSting();
  flashSting();
  animateJudgesScore(contestantId);
});
socket.on('effect:voteOpenSting', () => {
  if (StageAudio.isStarted()) StageAudio.voteOpenSting();
  flashSting();
});
socket.on('effect:roundClosed', () => {
  currentMusicScenario = 'roundClosed';
  if (StageAudio.isStarted()) {
    StageAudio.playMusicTrack('/music/action.mp3', { loop: false, volume: 0.85, fadeMs: 250 });
  }
});
