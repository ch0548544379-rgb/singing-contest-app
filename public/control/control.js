const socket = io();
let lastState = null;
let selectedParticipantIds = new Set();
let lastRankPreview = null;
const ROUND_ORDINALS = ['', 'אחד', 'שתיים', 'שלישי', 'רביעי', 'חמישי'];

// ---- כתובות אינטגרציה לימות המשיח ----
document.getElementById('urlVote').textContent = location.origin + '/api/yemot/';
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'הועתק!';
      setTimeout(() => (btn.textContent = 'העתק'), 1200);
    });
  });
});

document.getElementById('soundStartBtn').addEventListener('click', () => {
  StageAudio.start();
});

// שומר את השרת "ער" (רלוונטי בעיקר לאירוח חינמי כמו Render שנרדם אחרי חוסר פעילות ממושך)
setInterval(() => { fetch('/').catch(() => {}); }, 10 * 60 * 1000);

const votePhoneInput = document.getElementById('votePhoneInput');
votePhoneInput.addEventListener('input', () => {
  socket.emit('config:setVotePhoneNumber', { number: votePhoneInput.value.trim() });
});

document.getElementById('resetRoundBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round) return;
  socket.emit('round:resetResults', { roundId: round.id });
});

document.getElementById('musicMuteBtn').addEventListener('click', () => {
  if (!lastState) return;
  socket.emit('display:setMusicMuted', { muted: !lastState.display.musicMuted });
});

function renderMusicMuteBtn(state) {
  const btn = document.getElementById('musicMuteBtn');
  const muted = !!(state.display && state.display.musicMuted);
  btn.textContent = muted ? '🔊 הפעל מוזיקת רקע במסך הקהל' : '🔇 השתק מוזיקת רקע במסך הקהל';
  btn.classList.toggle('primary', muted);
}

document.getElementById('resetBtn').addEventListener('click', () => {
  socket.emit('state:reset');
});

// ---- רשימת משתתפים ----
function renderRoster(state) {
  const grid = document.getElementById('rosterGrid');
  grid.innerHTML = '';
  state.roster.forEach((slot) => {
    const div = document.createElement('div');
    div.className = 'roster-slot';
    div.innerHTML = `<span class="slot-num">${slot.slot}</span><input value="${slot.name || ''}" placeholder="שם משתתף">`;
    const input = div.querySelector('input');
    input.addEventListener('change', () => {
      socket.emit('roster:set', { slot: slot.slot, name: input.value });
    });
    grid.appendChild(div);
  });
}

// ---- מבצע נוכחי ----
function renderPerformerButtons(state) {
  const wrap = document.getElementById('performerButtons');
  wrap.innerHTML = '';
  state.roster.filter((r) => r.id).forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'performer-pick' + (state.currentPerformerId === r.id ? ' active' : '');
    btn.textContent = r.name;
    btn.addEventListener('click', () => socket.emit('performer:set', { contestantId: r.id }));
    wrap.appendChild(btn);
  });
  const current = state.currentPerformerId && state.roster.find((r) => r.id === state.currentPerformerId);
  document.getElementById('currentPerformerLabel').textContent = current ? current.name : 'אין';
  renderJudgesBox(state);
}

// ---- תיבת הזנת ניקוד שופטים (בולטת, ליד "מי על הבמה עכשיו") ----
function renderJudgesBox(state) {
  const round = state.rounds.find((r) => r.id === state.currentRoundId);
  const input = document.getElementById('judgesScoreInput');
  const saveBtn = document.getElementById('saveJudgesScoreBtn');
  const hint = document.getElementById('judgesBoxHint');
  const ready = !!(round && state.currentPerformerId && round.participantIds.includes(state.currentPerformerId));
  input.disabled = !ready;
  saveBtn.disabled = !ready;
  if (!ready) {
    hint.textContent = !round
      ? 'כדי להזין ניקוד - קודם צריך ליצור סבב למטה (בקטע "ניהול סבב") ולבחור מבצע פעיל מתוך אותו סבב.'
      : 'המבצע הפעיל לא נמצא ברשימת המשתתפים של הסבב הנוכחי.';
  } else {
    hint.textContent = '';
    const existing = round.results[state.currentPerformerId] && round.results[state.currentPerformerId].judgesTotal;
    if (document.activeElement !== input) {
      input.value = existing != null ? existing : '';
    }
  }
}

document.getElementById('saveJudgesScoreBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round || !lastState.currentPerformerId) return;
  const val = document.getElementById('judgesScoreInput').value;
  if (val === '') return;
  socket.emit('round:setJudges', { roundId: round.id, contestantId: lastState.currentPerformerId, judgesTotal: val });
  fetch('/').catch(() => {}); // מוודא שהשרת ער לקראת ההצבעה הטלפונית שתיפתח בהמשך
  const note = document.getElementById('judgesSavedNote');
  note.textContent = '✓ נשמר';
  setTimeout(() => (note.textContent = ''), 2000);
});

// ---- יצירת סבב: בחירת משתתפים ----
function renderParticipantPicker(state) {
  const wrap = document.getElementById('participantPicker');
  wrap.innerHTML = '';
  state.roster.filter((r) => r.id).forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'participant-pick' + (selectedParticipantIds.has(r.id) ? ' selected' : '');
    btn.textContent = r.name;
    btn.addEventListener('click', () => {
      if (selectedParticipantIds.has(r.id)) selectedParticipantIds.delete(r.id);
      else selectedParticipantIds.add(r.id);
      renderParticipantPicker(state);
    });
    wrap.appendChild(btn);
  });
}

function recalcJudgesMax() {
  const count = Number(document.getElementById('judgesCount').value);
  const perMax = Number(document.getElementById('judgesPerMax').value);
  document.getElementById('judgesMax').value = count * perMax;
}
document.getElementById('judgesCount').addEventListener('change', recalcJudgesMax);
document.getElementById('judgesPerMax').addEventListener('change', recalcJudgesMax);

document.getElementById('createRoundBtn').addEventListener('click', () => {
  if (selectedParticipantIds.size < 2) {
    alert('יש לבחור לפחות שני משתתפים לסבב');
    return;
  }
  socket.emit('round:create', {
    name: document.getElementById('roundName').value || 'סבב',
    stageLevel: Number(document.getElementById('roundStage').value),
    participantIds: Array.from(selectedParticipantIds),
    judgesMax: Number(document.getElementById('judgesMax').value) || 30,
  });
  selectedParticipantIds.clear();
});

// ---- פאנל סבב פעיל ----
function computeCombined(round, cid) {
  const r = round.results[cid] || { judgesTotal: 0, audienceVotes: [] };
  const votes = r.audienceVotes || [];
  const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
  const norm = (avg / 10) * round.judgesMax;
  return { judgesTotal: r.judgesTotal || 0, avg, norm, combined: (r.judgesTotal || 0) + norm, count: votes.length };
}

function renderRoundPanel(state) {
  const round = state.rounds.find((r) => r.id === state.currentRoundId);
  const panel = document.getElementById('roundPanel');
  if (!round) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  document.getElementById('roundTitle').textContent = `${round.name} (שלב ${round.stageLevel}) ${round.closed ? '— נסגר' : ''}`;

  const tbody = document.getElementById('scoresBody');
  tbody.innerHTML = '';
  round.participantIds.forEach((cid) => {
    const c = state.roster.find((r) => r.id === cid);
    const calc = computeCombined(round, cid);
    const tr = document.createElement('tr');
    if (cid === state.currentPerformerId) tr.className = 'current-row';
    tr.innerHTML = `
      <td>${c ? c.name : ''}</td>
      <td><input type="number" min="0" max="${round.judgesMax}" value="${round.results[cid] ? (round.results[cid].judgesTotal ?? '') : ''}" data-cid="${cid}" class="judges-input"></td>
      <td>${calc.count}</td>
      <td>${calc.avg.toFixed(2)}</td>
      <td>${calc.norm.toFixed(1)}</td>
      <td><b>${calc.combined.toFixed(1)}</b></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.judges-input').forEach((input) => {
    input.addEventListener('change', () => {
      socket.emit('round:setJudges', { roundId: round.id, contestantId: input.dataset.cid, judgesTotal: input.value });
    });
  });

  document.getElementById('votingStatus').textContent = round.votingOpen ? 'הצבעה פתוחה' : 'סגור';
  document.getElementById('votingStatus').className = 'status' + (round.votingOpen ? ' open' : '');
  document.getElementById('voteOpenBtn').disabled = round.votingOpen || !state.currentPerformerId || round.closed;
  document.getElementById('voteCloseBtn').disabled = !round.votingOpen;

  renderManualVoteButtons(state, round);

  const isFinal = round.stageLevel >= 3;
  const ordinal = ROUND_ORDINALS[round.stageLevel] || round.stageLevel;
  document.getElementById('advanceRow').classList.toggle('hidden', isFinal);
  document.getElementById('advancedClose').classList.toggle('hidden', isFinal);

  const finishBtn = document.getElementById('finishRoundBtn');
  if (round.closed) {
    finishBtn.classList.add('hidden');
  } else {
    finishBtn.classList.remove('hidden');
    finishBtn.textContent = isFinal ? '🏁 סיים סבב ' + ordinal : '🏁 סיים סבב ' + ordinal + ' וגלה את העולים';
  }

  const nextBtn = document.getElementById('startNextRoundBtn');
  if (round.closed && round.advancers.length) {
    const nextStage = Math.min(3, round.stageLevel + 1);
    nextBtn.classList.remove('hidden');
    nextBtn.textContent = `➡ עבור לסבב ${ROUND_ORDINALS[nextStage] || nextStage} (${round.advancers.length} עולים כבר מוכנים)`;
  } else {
    nextBtn.classList.add('hidden');
  }
}

document.getElementById('finishRoundBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round) return;
  const isFinal = round.stageLevel >= 3;
  const n = isFinal ? 0 : Number(document.getElementById('advanceCount').value) || 0;
  socket.emit('round:closeAuto', { roundId: round.id, advanceCount: n });
});

// יוצר אוטומטית את הסבב הבא עם העולים מהסבב שנסגר - בלי לבחור שוב ידנית את אותם שמות.
document.getElementById('startNextRoundBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round || !round.closed || !round.advancers.length) return;
  const nextStage = Math.min(3, round.stageLevel + 1);
  socket.emit('round:create', {
    name: 'סבב ' + (ROUND_ORDINALS[nextStage] || nextStage),
    stageLevel: nextStage,
    participantIds: round.advancers,
    judgesMax: round.judgesMax,
  });
});

function renderManualVoteButtons(state, round) {
  const wrap = document.getElementById('manualVoteButtons');
  wrap.innerHTML = '';
  if (!state.currentPerformerId || !round.results[state.currentPerformerId]) return;
  const votes = round.results[state.currentPerformerId].audienceVotes || [];
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.title = 'הוסף הצבעה ידנית של ' + i + ' נקודות (למשל שיחת טלפון שנספרה בעל פה)';
    btn.disabled = !round.votingOpen;
    btn.addEventListener('click', () => {
      socket.emit('vote:manual', { roundId: round.id, contestantId: state.currentPerformerId, points: i });
    });
    wrap.appendChild(btn);
  }
  const tally = document.createElement('span');
  tally.className = 'vote-tally';
  tally.textContent = `סה"כ הצבעות: ${votes.length}`;
  wrap.appendChild(tally);
}

document.getElementById('voteOpenBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (round) socket.emit('vote:open', { roundId: round.id });
});
document.getElementById('voteCloseBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (round) socket.emit('vote:close', { roundId: round.id });
});

document.getElementById('computeRankBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round) return;
  socket.emit('round:scores', { roundId: round.id }, (scores) => {
    lastRankPreview = scores;
    const n = Number(document.getElementById('advanceCount').value) || 0;
    const preview = document.getElementById('rankPreview');
    preview.innerHTML = scores
      .map(
        (s, i) => `<div class="rank-row">
          <label><input type="checkbox" class="advance-check" data-cid="${s.contestant.id}" ${i < n ? 'checked' : ''}> #${i + 1} ${s.contestant.name}</label>
          <span>${s.score.combined.toFixed(1)}</span>
        </div>`
      )
      .join('');
  });
});

document.getElementById('closeRoundBtn').addEventListener('click', () => {
  const round = lastState.rounds.find((r) => r.id === lastState.currentRoundId);
  if (!round) return;
  const checks = document.querySelectorAll('.advance-check');
  if (!checks.length) {
    alert('קודם לחץ על "חשב דירוג" כדי לבחור מי עולה הלאה');
    return;
  }
  const advancerIds = Array.from(checks).filter((c) => c.checked).map((c) => c.dataset.cid);
  socket.emit('round:close', { roundId: round.id, advancerIds });
});

// ---- בחירת שיר ----
document.getElementById('startSongBtn').addEventListener('click', () => {
  const names = Array.from(document.querySelectorAll('.songNameInput'))
    .map((i) => i.value.trim())
    .filter(Boolean);
  if (names.length < 2) {
    alert('יש להזין לפחות שני שירים');
    return;
  }
  socket.emit('song:setup', { songNames: names });
});

// הספירה נעשית בהרמת ידיים מחוץ למערכת - לוחצים ישירות על השיר שניצח כדי לבחור אותו
function renderSongCounters(state) {
  const wrap = document.getElementById('songCounters');
  wrap.innerHTML = '';
  if (!state.songSelection) return;
  state.songSelection.songs.forEach((s) => {
    const btn = document.createElement('button');
    const isWinner = state.songSelection.winnerSongId === s.id;
    btn.className = 'song-pick' + (isWinner ? ' winner' : '');
    btn.textContent = s.name + (state.songSelection.revealed && isWinner ? ' 🏆' : '');
    btn.disabled = state.songSelection.revealed;
    btn.addEventListener('click', () => {
      socket.emit('song:select', { songId: s.id });
    });
    wrap.appendChild(btn);
  });
}

// ---- שליטה כללית ----
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => socket.emit('display:setMode', { mode: btn.dataset.mode }));
});

document.getElementById('stageSlider').addEventListener('input', (e) => {
  document.getElementById('stageValue').textContent = e.target.value;
  socket.emit('display:setStage', { level: Number(e.target.value) });
});

function renderWinnerSelect(state) {
  const sel = document.getElementById('winnerSelect');
  const current = sel.value;
  sel.innerHTML = state.roster.filter((r) => r.id).map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  if (current) sel.value = current;
}

document.getElementById('announceWinnerBtn').addEventListener('click', () => {
  const sel = document.getElementById('winnerSelect');
  if (!sel.value) return;
  socket.emit('winner:announce', { contestantId: sel.value });
});

// ---- render ראשי ----
let manualRoundCreateTouched = false;
document.getElementById('manualRoundCreate').addEventListener('toggle', (e) => { manualRoundCreateTouched = true; });
function render(state) {
  lastState = state;
  renderRoster(state);
  renderPerformerButtons(state);
  renderParticipantPicker(state);
  renderRoundPanel(state);
  // הסבב הראשון נוצר ידנית, אבל ברגע שיש סבב פעיל - מסתירים את הקטע הזה כדי לא לבלבל עם כפתור "עבור לסבב הבא"
  if (!manualRoundCreateTouched) {
    document.getElementById('manualRoundCreate').open = !state.currentRoundId;
  }
  renderSongCounters(state);
  renderWinnerSelect(state);
  document.getElementById('stageSlider').value = state.display.stageLevel;
  document.getElementById('stageValue').textContent = state.display.stageLevel;
  renderMusicMuteBtn(state);
  if (document.activeElement !== votePhoneInput) {
    votePhoneInput.value = state.votePhoneNumber || '';
  }
}

socket.on('state:full', render);
socket.on('vote:new', () => { if (lastState) renderRoundPanel(lastState); });
recalcJudgesMax();
