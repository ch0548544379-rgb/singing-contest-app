const { YemotRouter } = require('yemot-router2');
const S = require('./state');

// מונע הצבעה כפולה: אותו מספר טלפון לא נספר פעמיים לאותו זמר באותו סבב,
// אבל כן יכול להצביע שוב כשעולה זמר/סבב אחר (המפתח כולל roundId+contestantId)
const votedPhones = new Set();

function createYemotRouter(io, broadcastState) {
  const router = YemotRouter({ printLog: true });

  router.get('/', async (call) => {
    const state = S.getState();
    const round = state.currentRoundId ? S.getRoundById(state.currentRoundId) : null;
    const contestant = state.currentPerformerId ? S.getContestant(state.currentPerformerId) : null;

    if (!contestant || !round || !round.votingOpen) {
      return call.id_list_message([
        { type: 'text', data: 'מצטערים, אין כרגע הצבעה פעילה, נסו שוב מאוחר יותר', removeInvalidChars: true },
      ]);
    }

    const voteKey = `${round.id}:${contestant.id}:${call.phone}`;
    if (votedPhones.has(voteKey)) {
      return call.id_list_message([
        { type: 'text', data: `תודה, כבר הצבעתם עבור ${contestant.name}`, removeInvalidChars: true },
      ]);
    }

    const digits = await call.read(
      [{ type: 'text', data: `אנא הקישו ציון בין 1 עד 10 עבור ${contestant.name}`, removeInvalidChars: true }],
      'tap',
      { max_digits: 2, min_digits: 1, sec_wait: 7 }
    );

    const points = parseInt(digits, 10);
    if (!Number.isInteger(points) || points < 1 || points > 10) {
      return call.id_list_message([{ type: 'text', data: 'הציון שהוקש אינו תקין, נסו שוב', removeInvalidChars: true }]);
    }

    const result = S.castVote(round.id, contestant.id, points);
    if (!result) {
      return call.id_list_message([{ type: 'text', data: 'מצטערים, ההצבעה נסגרה', removeInvalidChars: true }]);
    }
    votedPhones.add(voteKey);
    io.emit('vote:new', { contestantId: contestant.id, result });
    broadcastState();

    return call.id_list_message([{ type: 'text', data: 'תודה על ההצבעה', removeInvalidChars: true }]);
  });

  return router;
}

module.exports = createYemotRouter;
