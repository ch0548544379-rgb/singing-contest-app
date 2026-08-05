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
    StageAudio.stopMusicTrack(2200); // דעיכה איטית ורכה - לא נחתך בבת אחת כשעוברים למתמודד/שלב הבא
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

// שטיח אדום בפרספקטיבה (גליל שנפתח לכיוון האופק) + עמודי זהב עם חבל בוהק משני הצדדים - סצנת SVG אחת שרצה בעצמה
function carpetSceneSVG() {
  return `
  <svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMax meet" width="100%" height="100%">
    <defs>
      <linearGradient id="carpetGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4a0000"/>
        <stop offset="30%" stop-color="#a8001a"/>
        <stop offset="55%" stop-color="#e2143a"/>
        <stop offset="80%" stop-color="#96001a"/>
        <stop offset="100%" stop-color="#63000f"/>
      </linearGradient>
      <linearGradient id="carpetSheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="postGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff8e0"/>
        <stop offset="30%" stop-color="#f2c14e"/>
        <stop offset="60%" stop-color="#c8951f"/>
        <stop offset="100%" stop-color="#6b4a0c"/>
      </linearGradient>
      <linearGradient id="ropeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff5577"/>
        <stop offset="45%" stop-color="#b3001f"/>
        <stop offset="100%" stop-color="#6e0012"/>
      </linearGradient>
      <linearGradient id="rollCyl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff8e0"/>
        <stop offset="50%" stop-color="#8a6212"/>
        <stop offset="100%" stop-color="#fff8e0"/>
      </linearGradient>
      <filter id="goldGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <polygon fill="url(#carpetGrad)">
      <animate attributeName="points" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1"
        values="470,0 530,0 530,0 470,0; 470,0 530,0 1000,420 0,420"/>
    </polygon>
    <polygon fill="url(#carpetSheen)">
      <animate attributeName="points" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1"
        values="494,0 506,0 506,0 494,0; 494,0 506,0 620,420 380,420"/>
    </polygon>
    <path fill="none" stroke="#3a0008" stroke-width="2" opacity="0">
      <animate attributeName="opacity" begin="0.6s" dur="0.6s" fill="freeze" values="0;0.5"/>
      <animate attributeName="d" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1"
        values="M500,0 L500,0 M500,0 L500,0; M500,0 L120,420 M500,0 L880,420"/>
    </path>

    <rect x="482" y="0" width="36" height="26" rx="13" fill="url(#rollCyl)" stroke="#5a3d08" stroke-width="1.5" filter="url(#goldGlow)">
      <animate attributeName="y" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1" values="0;392"/>
      <animate attributeName="x" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1" values="482;0"/>
      <animate attributeName="width" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 0.9 0.35 1" values="36;1000"/>
    </rect>

    <!-- עמודים לאורך כל השטיח: רחוק, אמצע, קרוב - עם חבל מחבר בין כל שני עמודים סמוכים -->
    ${(() => {
      const posts = [
        { x: 295, y: 134, scale: 0.75 },
        { x: 705, y: 134, scale: 0.75 },
        { x: 144, y: 260, scale: 1 },
        { x: 856, y: 260, scale: 1 },
        { x: 6, y: 370, scale: 1.35 },
        { x: 994, y: 370, scale: 1.35 },
      ];
      const beginByY = { 134: '0.9s', 260: '2.2s', 370: '4.0s' };
      const postSVG = posts.map((p) => {
        const b = beginByY[p.y];
        const s = p.scale;
        return `<g transform="translate(${p.x},${p.y}) scale(${s})" opacity="0" filter="url(#goldGlow)">
          <animate attributeName="opacity" begin="${b}" dur="0.3s" fill="freeze" values="0;1"/>
          <ellipse cx="0" cy="34" rx="14" ry="5" fill="#000" opacity="0.35"/>
          <rect x="-6" y="-16" width="12" height="50" rx="5" fill="url(#postGold)" stroke="#4a3208" stroke-width="1.2"/>
          <circle cx="0" cy="-24" r="13" fill="url(#postGold)" stroke="#4a3208" stroke-width="1.6"/>
          <circle cx="-4" cy="-28" r="3.5" fill="#fff8e0" opacity="0.85"/>
        </g>`;
      }).join('');
      const ropeSeg = (p1, p2, begin, dur) => {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 + 45;
        const d = `M${p1.x},${p1.y - 8} Q${mx},${my} ${p2.x},${p2.y - 8}`;
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.35;
        return `
        <path d="${d}" fill="none" stroke="url(#ropeGrad)" stroke-width="13" stroke-linecap="round" opacity="0" stroke-dasharray="${len}" stroke-dashoffset="${len}" filter="url(#goldGlow)">
          <animate attributeName="opacity" begin="${begin}s" dur="0.24s" fill="freeze" values="0;1"/>
          <animate attributeName="stroke-dashoffset" begin="${begin}s" dur="${dur}s" fill="freeze" values="${len};0"/>
        </path>
        <path d="${d}" fill="none" stroke="#ffb3c2" stroke-width="3.5" stroke-linecap="round" opacity="0" stroke-dasharray="${len}" stroke-dashoffset="${len}">
          <animate attributeName="opacity" begin="${begin}s" dur="0.24s" fill="freeze" values="0;0.7"/>
          <animate attributeName="stroke-dashoffset" begin="${begin}s" dur="${dur}s" fill="freeze" values="${len};0"/>
        </path>`;
      };
      const ropes = ropeSeg(posts[0], posts[2], 0.9, 1.3) + ropeSeg(posts[1], posts[3], 0.9, 1.3)
        + ropeSeg(posts[2], posts[4], 2.2, 1.8) + ropeSeg(posts[3], posts[5], 2.2, 1.8);
      return ropes + postSVG;
    })()}
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
    StageEffects.confetti(null, null, 160);
    setTimeout(() => StageEffects.confetti(null, null, 100), 1800);
    setTimeout(() => StageEffects.confetti(null, null, 100), 3600);
  }, 6000);
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
