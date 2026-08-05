const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const S = require('./state');
const createYemotRouter = require('./yemot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/display', express.static(path.join(__dirname, '..', 'public', 'display')));
app.use('/control', express.static(path.join(__dirname, '..', 'public', 'control')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));

app.get('/', (req, res) => res.redirect('/control/'));

function broadcastState() {
  io.emit('state:full', S.getState());
}

// ===== ימות המשיח - שלוחת API אחת שמנהלת שיחה מלאה (הקראת שם + קליטת דירוג 1-10) =====
app.use('/api/yemot', createYemotRouter(io, broadcastState));

io.on('connection', (socket) => {
  socket.emit('state:full', S.getState());

  socket.on('roster:set', ({ slot, name }) => {
    S.setRosterSlot(slot, name);
    broadcastState();
  });

  socket.on('performer:set', ({ contestantId }) => {
    S.setCurrentPerformer(contestantId);
    broadcastState();
  });

  socket.on('round:create', ({ name, stageLevel, participantIds, judgesMax }) => {
    S.createRound(name, stageLevel, participantIds, judgesMax);
    broadcastState();
  });

  socket.on('round:setJudges', ({ roundId, contestantId, judgesTotal }) => {
    S.setJudgesScore(roundId, contestantId, judgesTotal);
    broadcastState();
    io.emit('effect:judgesSting', { contestantId });
  });

  socket.on('vote:open', ({ roundId }) => {
    S.openVoting(roundId);
    broadcastState();
    io.emit('effect:voteOpenSting', { contestantId: S.getState().currentPerformerId });
  });

  socket.on('vote:close', ({ roundId }) => {
    S.closeVoting(roundId);
    broadcastState();
  });

  // הצבעה ידנית (כפתור 1-10 בפאנל הניהול) - אותה פונקציה בדיוק כמו הוובהוק
  socket.on('vote:manual', ({ roundId, contestantId, points }) => {
    const result = S.castVote(roundId, contestantId, points);
    if (result) {
      io.emit('vote:new', { contestantId, result });
      broadcastState();
    }
  });

  socket.on('round:close', ({ roundId, advancerIds }) => {
    S.closeRound(roundId, advancerIds);
    broadcastState();
  });

  socket.on('song:setup', ({ songNames }) => {
    S.setupSongSelection(songNames);
    broadcastState();
  });

  socket.on('song:setCount', ({ songId, count }) => {
    S.setSongCount(songId, count);
    broadcastState();
  });

  socket.on('song:reveal', () => {
    S.revealSongWinner();
    broadcastState();
  });

  socket.on('display:setMode', ({ mode }) => {
    S.setDisplayMode(mode);
    broadcastState();
  });

  socket.on('display:setStage', ({ level }) => {
    S.setStageLevel(level);
    broadcastState();
  });

  socket.on('display:setMusicMuted', ({ muted }) => {
    S.setMusicMuted(muted);
    broadcastState();
  });

  // הכרזת הזוכה הסופי - שומר בסטייט + מפעיל אפקט/סאונד חד-פעמי בכל המסכים
  socket.on('winner:announce', ({ contestantId }) => {
    S.setFinalWinner(contestantId);
    S.setDisplayMode('winner');
    broadcastState();
    io.emit('effect:winnerStinger');
  });

  socket.on('round:scores', ({ roundId }, cb) => {
    cb(S.getRoundScores(roundId));
  });

  socket.on('state:reset', () => {
    S.resetState();
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`מסך קהל:  http://localhost:${PORT}/display/`);
  console.log(`פאנל ניהול: http://localhost:${PORT}/control/`);
});
