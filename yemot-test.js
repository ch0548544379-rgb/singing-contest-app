const { io } = require('socket.io-client');

const BASE = 'http://localhost:3000/api/yemot/';
let failures = 0;
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); failures++; } else console.log('OK: ' + msg); }

async function run() {
  const ctrl = io('http://localhost:3000', { transports: ['websocket'] });
  await new Promise((resolve) => ctrl.once('state:full', resolve));

  ctrl.emit('state:reset');
  await new Promise((resolve) => ctrl.once('state:full', resolve));

  ctrl.emit('roster:set', { slot: 1, name: 'שלמה כהן' });
  let st = await new Promise((resolve) => ctrl.once('state:full', resolve));
  ctrl.emit('roster:set', { slot: 2, name: 'משה לוי' });
  st = await new Promise((resolve) => ctrl.once('state:full', resolve));
  const ids = st.roster.filter((r) => r.id).map((r) => r.id);

  ctrl.emit('round:create', { name: 'שלב 1', stageLevel: 1, participantIds: ids, judgesMax: 20 });
  st = await new Promise((resolve) => ctrl.once('state:full', resolve));
  const roundId = st.currentRoundId;

  ctrl.emit('performer:set', { contestantId: ids[0] });
  st = await new Promise((resolve) => ctrl.once('state:full', resolve));

  // voting not open yet -> yemot call should get "no active voting" message
  const callId1 = 'call-1';
  let res = await fetch(`${BASE}?ApiPhone=0501234567&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId1}`);
  let text = await res.text();
  console.log('call before voting open ->', text);
  assert(text.includes('אין כרגע הצבעה פעילה'), 'rejects vote when voting not open');

  ctrl.emit('vote:open', { roundId });
  st = await new Promise((resolve) => ctrl.once('state:full', resolve));

  // first request: should prompt for rating (a 'read=' directive)
  res = await fetch(`${BASE}?ApiPhone=0501234567&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId1}`);
  text = await res.text();
  console.log('first call (should be read= prompt) ->', text);
  assert(text.startsWith('read='), 'first request returns a read= prompt directive');
  assert(text.includes(encodeURIComponent('שלמה כהן')) || text.includes('שלמה כהן') || /%D7%A9%D7%9C%D7%9E%D7%94/.test(text), 'prompt mentions the active performer name');

  // second request (same ApiCallId): simulate the caller having pressed "8"
  const votePromise = new Promise((resolve) => ctrl.once('vote:new', resolve));
  res = await fetch(`${BASE}?ApiPhone=0501234567&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId1}&val_1=8`);
  text = await res.text();
  console.log('second call with val_1=8 ->', text);
  assert(text.includes('תודה'), 'thank-you message returned after valid vote');
  const voteEvt = await votePromise;
  assert(voteEvt.result.combined >= 0, 'vote:new broadcast fired with a score result');

  st = await new Promise((resolve) => { ctrl.emit('round:scores', { roundId }, resolve); });
  const s0 = st.find((s) => s.contestant.id === ids[0]);
  assert(s0.score.audienceVotesCount === 1, 'exactly one audience vote recorded for performer 1, got ' + s0.score.audienceVotesCount);

  // same phone calling again for the SAME performer -> should be blocked as duplicate
  const callId2 = 'call-2';
  res = await fetch(`${BASE}?ApiPhone=0501234567&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId2}`);
  text = await res.text();
  console.log('duplicate call from same phone ->', text);
  assert(text.includes('כבר הצבעתם'), 'duplicate vote from same phone for same performer is blocked');

  st = await new Promise((resolve) => { ctrl.emit('round:scores', { roundId }, resolve); });
  const s0b = st.find((s) => s.contestant.id === ids[0]);
  assert(s0b.score.audienceVotesCount === 1, 'still exactly one vote after duplicate attempt, got ' + s0b.score.audienceVotesCount);

  // switch performer -> same phone number should be able to vote again for the NEW performer
  ctrl.emit('performer:set', { contestantId: ids[1] });
  await new Promise((resolve) => ctrl.once('state:full', resolve));

  const callId3 = 'call-3';
  res = await fetch(`${BASE}?ApiPhone=0501234567&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId3}`);
  text = await res.text();
  assert(text.startsWith('read='), 'new performer -> same phone gets prompted again (not blocked)');
  console.log('prompt for performer 2 ->', text);

  const votePromise2 = new Promise((resolve) => ctrl.once('vote:new', resolve));
  res = await fetch(`${BASE}?ApiPhone=0501234567&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId3}&val_1=5`);
  text = await res.text();
  await votePromise2;
  assert(text.includes('תודה'), 'vote for second performer accepted');

  // invalid digit (e.g. 15 which is out of range) should be rejected
  const callId4 = 'call-4';
  res = await fetch(`${BASE}?ApiPhone=0509999999&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId4}`);
  await res.text();
  res = await fetch(`${BASE}?ApiPhone=0509999999&ApiDID=0731234567&ApiExtension=1&ApiCallId=${callId4}&val_1=15`);
  text = await res.text();
  console.log('invalid digit 15 ->', text);
  assert(text.includes('אינו תקין'), 'invalid rating (15) rejected with error message');

  console.log('\n=== SUMMARY: ' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURES') + ' ===');
  ctrl.close();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error('TEST CRASHED:', e); process.exit(1); });
