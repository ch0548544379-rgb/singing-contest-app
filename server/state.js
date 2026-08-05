// מנוע המצב המרכזי של התחרות - כל הלוגיקה העסקית במקום אחד

const ROSTER_SIZE = 9;

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

function createInitialState() {
  return {
    roster: Array.from({ length: ROSTER_SIZE }, (_, i) => ({
      slot: i + 1,
      id: null,
      name: '',
    })),
    currentPerformerId: null,
    currentRoundId: null,
    rounds: [],
    songSelection: null, // { id, songs:[{id,name,count}], active, revealed, winnerSongId }
    finalWinnerId: null,
    votePhoneNumber: '',
    display: { mode: 'idle', stageLevel: 1, musicMuted: false }, // idle | performer | voting | results | songSelect | winner
  };
}

let state = createInitialState();

function getState() {
  return state;
}

function resetState() {
  state = createInitialState();
  return state;
}

function getRoundById(roundId) {
  return state.rounds.find((r) => r.id === roundId);
}

function getContestant(contestantId) {
  return state.roster.find((r) => r.id === contestantId);
}

// ---- ניהול רשימת משתתפים (9 שלוחות) ----
function setRosterSlot(slot, name) {
  const entry = state.roster.find((r) => r.slot === slot);
  if (!entry) return state;
  const trimmed = (name || '').trim();
  if (!trimmed) {
    entry.name = '';
    entry.id = null;
  } else {
    entry.name = trimmed;
    if (!entry.id) entry.id = makeId('c');
  }
  return state;
}

function setCurrentPerformer(contestantId) {
  state.currentPerformerId = contestantId || null;
  state.display.mode = contestantId ? 'performer' : 'idle';
  return state;
}

// ---- ניהול סבבים ----
function createRound(name, stageLevel, participantIds, judgesMax) {
  const round = {
    id: makeId('r'),
    name,
    stageLevel: stageLevel || 1,
    participantIds: participantIds.slice(),
    judgesMax: judgesMax || 30,
    results: {}, // contestantId -> {judgesTotal, audienceVotes:[], }
    votingOpen: false,
    closed: false,
    advancers: [],
  };
  participantIds.forEach((cid) => {
    round.results[cid] = { judgesTotal: null, audienceVotes: [] };
  });
  state.rounds.push(round);
  state.currentRoundId = round.id;
  state.display.stageLevel = round.stageLevel;
  return round;
}

function setJudgesScore(roundId, contestantId, judgesTotal) {
  const round = getRoundById(roundId);
  if (!round) return state;
  if (!round.results[contestantId]) round.results[contestantId] = { judgesTotal: null, audienceVotes: [] };
  round.results[contestantId].judgesTotal = Number(judgesTotal);
  return state;
}

function openVoting(roundId) {
  const round = getRoundById(roundId);
  if (!round) return state;
  round.votingOpen = true;
  state.display.mode = 'voting';
  return state;
}

function closeVoting(roundId) {
  const round = getRoundById(roundId);
  if (!round) return state;
  round.votingOpen = false;
  return state;
}

// הצבעה בודדת - גם מלחיצה ידנית וגם מה-Webhook של ימות המשיח קוראות לפונקציה הזו
function castVote(roundId, contestantId, points) {
  const round = getRoundById(roundId);
  if (!round || !round.votingOpen) return null;
  const p = Math.max(1, Math.min(10, Number(points)));
  if (!round.results[contestantId]) round.results[contestantId] = { judgesTotal: null, audienceVotes: [] };
  round.results[contestantId].audienceVotes.push(p);
  return computeContestantScore(round, contestantId);
}

// נירמול: הקהל כולו שקול לשופטים (50/50), בלי קשר לכמות המצביעים
function computeContestantScore(round, contestantId) {
  const r = round.results[contestantId];
  if (!r) return null;
  const votes = r.audienceVotes;
  const audienceAverage = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
  const audienceNormalized = (audienceAverage / 10) * round.judgesMax;
  const judgesTotal = r.judgesTotal || 0;
  const combined = judgesTotal + audienceNormalized;
  return {
    contestantId,
    judgesTotal,
    audienceAverage: Math.round(audienceAverage * 100) / 100,
    audienceVotesCount: votes.length,
    audienceNormalized: Math.round(audienceNormalized * 100) / 100,
    combined: Math.round(combined * 100) / 100,
  };
}

function getRoundScores(roundId) {
  const round = getRoundById(roundId);
  if (!round) return [];
  return round.participantIds
    .map((cid) => ({ contestant: getContestant(cid), score: computeContestantScore(round, cid) }))
    .sort((a, b) => b.score.combined - a.score.combined);
}

function closeRound(roundId, advancerIds) {
  const round = getRoundById(roundId);
  if (!round) return state;
  round.votingOpen = false;
  round.closed = true;
  round.advancers = advancerIds || [];
  state.display.mode = 'results';
  return state;
}

// ---- בחירת שיר (הצבעה ידנית בהרמת ידיים) ----
function setupSongSelection(songNames) {
  state.songSelection = {
    id: makeId('s'),
    songs: songNames.map((n) => ({ id: makeId('song'), name: n, count: 0 })),
    active: true,
    revealed: false,
    winnerSongId: null,
  };
  state.display.mode = 'songSelect';
  return state;
}

function setSongCount(songId, count) {
  if (!state.songSelection) return state;
  const song = state.songSelection.songs.find((s) => s.id === songId);
  if (song) song.count = Math.max(0, Number(count));
  return state;
}

function revealSongWinner() {
  if (!state.songSelection) return state;
  const winner = state.songSelection.songs.slice().sort((a, b) => b.count - a.count)[0];
  state.songSelection.revealed = true;
  state.songSelection.winnerSongId = winner ? winner.id : null;
  return state;
}

function setDisplayMode(mode) {
  state.display.mode = mode;
  return state;
}

function setStageLevel(level) {
  state.display.stageLevel = Math.max(1, Math.min(3, Number(level) || 1));
  return state;
}

function setMusicMuted(muted) {
  state.display.musicMuted = !!muted;
  return state;
}

function setVotePhoneNumber(number) {
  state.votePhoneNumber = (number || '').toString();
  return state;
}

// מאפס את תוצאות הסבב (ניקוד שופטים + הצבעות קהל) בלי ליצור סבב חדש -
// לשימוש כשהיתה תקלה וצריך שהמשתתפים ישירו את הסבב מחדש.
function resetRoundResults(roundId) {
  const round = getRoundById(roundId);
  if (!round) return state;
  round.participantIds.forEach((cid) => {
    round.results[cid] = { judgesTotal: null, audienceVotes: [] };
  });
  round.votingOpen = false;
  round.closed = false;
  round.advancers = [];
  state.currentPerformerId = null;
  state.display.mode = 'idle';
  return state;
}

function setFinalWinner(contestantId) {
  state.finalWinnerId = contestantId || null;
  return state;
}

module.exports = {
  setStageLevel,
  setMusicMuted,
  setVotePhoneNumber,
  resetRoundResults,
  setFinalWinner,
  ROSTER_SIZE,
  getState,
  resetState,
  setRosterSlot,
  setCurrentPerformer,
  createRound,
  setJudgesScore,
  openVoting,
  closeVoting,
  castVote,
  getRoundScores,
  computeContestantScore,
  closeRound,
  setupSongSelection,
  setSongCount,
  revealSongWinner,
  setDisplayMode,
  getContestant,
  getRoundById,
};
