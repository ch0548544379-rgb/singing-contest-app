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

function animateCountUp(el, from, to, duration, onDone) {
  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (from + (to - from) * eased).toFixed(1);
    if (t < 1) requestAnimationFrame(step);
    else { el.textContent = to.toFixed(1); if (onDone) onDone(); }
  }
  requestAnimationFrame(step);
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

function render(state) {
  lastState = state;
  const stage = state.display.stageLevel || 1;
  document.getElementById('stageBg').className = 'stage-bg stage-' + stage;
  votingIntensity = state.display.mode === 'voting' ? 1.6 + stage * 0.5 : 0.6 + stage * 0.25;
  StageAudio.setMuted(!!state.display.musicMuted);
  StageAudio.setStage(stage);
  StageAudio.setVoting(state.display.mode === 'voting');

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
    renderHistogram(round, state.currentPerformerId);

    const r = round.results[state.currentPerformerId] || { audienceVotes: [] };
    const votes = r.audienceVotes || [];
    const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
    const norm = (avg / 10) * round.judgesMax;
    const pct = round.judgesMax ? Math.max(0, Math.min(1, norm / round.judgesMax)) : 0;
    document.getElementById('pointsGaugeFill').style.width = (pct * 100).toFixed(1) + '%';
    document.getElementById('audiencePoints').textContent = norm.toFixed(1);
    document.getElementById('audiencePointsMax').textContent = round.judgesMax;
    StageAudio.setVoteHeat(pct);
  }

  if (state.display.mode === 'results' && round) {
    renderResultsReveal(state, round);
  }

  if (state.display.mode === 'songSelect' && state.songSelection) {
    const ss = state.songSelection;
    document.getElementById('songList').innerHTML = ss.songs
      .map(
        (s) => `<div class="panel song-card ${ss.revealed && s.id === ss.winnerSongId ? 'winner' : ''}">
          <div>${s.name}</div>
          <div class="count">${s.count}</div>
        </div>`
      )
      .join('');
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

// רשימת התוצאות המלאה (כל המשתתפים) - מוצגת בלי אנימציה אחרי סיום הספוטלייט
function renderFullResultsList(rows, round) {
  const list = document.getElementById('resultsList');
  list.innerHTML = rows
    .map(
      (row, i) => `<div class="panel result-row reveal-in ${round.advancers.includes(row.c && row.c.id) ? 'advancer' : ''}">
        <span class="result-rank">#${i + 1}</span>
        <span class="result-name">${row.c ? row.c.name : ''}</span>
        <span class="result-score">${row.combined.toFixed(1)}</span>
      </div>`
    )
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

// רצף הכרזת הזוכה: השטיח האדום רץ, נעצר, והשם נוחת עליו בזהב
function playWinnerSequence(name) {
  const track = document.getElementById('carpetTrack');
  const nameEl = document.getElementById('winnerName');
  track.classList.remove('stopped');
  nameEl.classList.add('hidden');
  nameEl.classList.remove('landing');
  nameEl.textContent = name;
  setTimeout(() => {
    track.classList.add('stopped');
    nameEl.classList.remove('hidden');
    void nameEl.offsetWidth;
    nameEl.classList.add('landing');
    StageEffects.burst(null, null, 30);
  }, 2400);
}

socket.on('state:full', render);
socket.on('vote:new', () => {
  if (lastState) render(lastState);
  StageEffects.burst(null, null, 20);
});
socket.on('effect:winnerStinger', () => {
  if (StageAudio.isStarted()) {
    StageAudio.winnerStinger();
    StageAudio.applause();
  }
});
socket.on('effect:judgesSting', () => {
  if (StageAudio.isStarted()) StageAudio.judgesSting();
  flashSting();
});
socket.on('effect:voteOpenSting', () => {
  if (StageAudio.isStarted()) StageAudio.voteOpenSting();
  flashSting();
});
