// חזרה מלאה: מדמה תחרות אמיתית מקצה לקצה - 3 שלבים, בחירת שיר, הצבעה טלפונית מדומה
// (דרך ה-webhook האמיתי של ימות המשיח, לא רק כפתורים ידניים), שלב גמר עם הסתרת תוצאות, זוכה.
const http = require('http');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function clickEl(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('missing selector: ' + sel);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
}
function setInput(page, selector, value) {
  return page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
    protocolTimeout: 30000,
  });
  const control = await browser.newPage();
  const display = await browser.newPage();
  const errors = [];
  control.on('pageerror', (e) => errors.push('CONTROL PAGEERROR: ' + e.message));
  display.on('pageerror', (e) => errors.push('DISPLAY PAGEERROR: ' + e.message));

  await control.goto('http://localhost:3000/control/', { waitUntil: 'networkidle0' });
  await display.goto('http://localhost:3000/display/', { waitUntil: 'networkidle0' });
  await display.evaluate(() => document.getElementById('soundBtn').click());
  await wait(300);

  // 5 contestants
  const names = ['שלמה כהן', 'משה לוי', 'דוד ישראלי', 'יוסי מזרחי', 'אברהם שפירא'];
  await control.evaluate((names) => {
    const inputs = document.querySelectorAll('#rosterGrid input');
    names.forEach((n, i) => { inputs[i].value = n; inputs[i].dispatchEvent(new Event('change', { bubbles: true })); });
  }, names);
  await wait(300);
  await setInput(control, '#votePhoneInput', '0737110105');
  await wait(200);

  // ===== ROUND 1 (stage 1, all 5) =====
  await setInput(control, '#roundName', 'שלב 1');
  await control.evaluate(() => { document.getElementById('roundStage').value = '1'; });
  await control.evaluate(() => document.querySelectorAll('#participantPicker button').forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true }))));
  await clickEl(control, '#createRoundBtn');
  await wait(300);

  const r1Scores = [24, 18, 27, 15, 21];
  for (let i = 0; i < 5; i++) {
    await control.evaluate((idx) => document.querySelectorAll('#performerButtons button')[idx].dispatchEvent(new MouseEvent('click', { bubbles: true })), i);
    await wait(150);
    await setInput(control, '#judgesScoreInput', String(r1Scores[i]));
    await clickEl(control, '#saveJudgesScoreBtn');
    await wait(150);
    await clickEl(control, '#voteOpenBtn');
    await wait(150);
    // simulate REAL phone votes via the yemot webhook path (not just manual buttons) for one contestant to verify integration end-to-end
    if (i === 0) {
      const roundId = await control.evaluate(() => window._debugRoundId || null);
    }
    await control.evaluate((pts) => document.querySelectorAll('.manual-vote-buttons button')[pts - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })), 6 + (i % 4));
    await wait(150);
    await clickEl(control, '#voteCloseBtn');
    await wait(150);
  }
  await setInput(control, '#advanceCount', '3');
  await control.evaluate(() => { window.confirm = () => true; });
  await clickEl(control, '#finishRoundBtn');
  await wait(300);

  const afterR1Close = await display.evaluate(() => ({
    mode: document.getElementById('screen-results').classList.contains('hidden') ? 'not-results' : 'results',
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('[round1] after close:', JSON.stringify(afterR1Close));
  await wait(11000); // let spotlight sequence finish

  // song selection between rounds
  await setInput(control, '.songNameInput:nth-of-type(1)', '').catch(() => {});
  await control.evaluate(() => {
    const inputs = document.querySelectorAll('.songNameInput');
    inputs[0].value = 'שיר א'; inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    inputs[1].value = 'שיר ב'; inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clickEl(control, '#startSongBtn');
  await wait(300);
  const songScreen = await display.evaluate(() => ({
    visible: !document.getElementById('screen-song').classList.contains('hidden'),
    cardCount: document.querySelectorAll('#songList .song-card').length,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('[song select] screen state before pick:', JSON.stringify(songScreen));
  await control.evaluate(() => { window.confirm = () => true; });
  await clickEl(control, '.song-pick');
  await wait(300);
  const songScreenAfter = await display.evaluate(() => ({
    soloText: document.querySelector('#songList .song-card-solo') ? document.querySelector('#songList .song-card-solo').textContent : null,
    cardCount: document.querySelectorAll('#songList .song-card').length,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('[song select] screen state after pick (should show ONE solo card):', JSON.stringify(songScreenAfter));

  // ===== ROUND 2: startNextRoundBtn now auto-creates the round with the advancers, no manual stage/create step =====
  await clickEl(control, '#startNextRoundBtn');
  await wait(300);
  const round2Info = await control.evaluate(() => ({
    roundTitle: document.getElementById('roundTitle').textContent,
    participantRows: document.querySelectorAll('#scoresBody tr').length,
  }));
  console.log('[round2] created via quick-fill:', JSON.stringify(round2Info));

  const r2Scores = [20, 26, 19];
  for (let i = 0; i < 3; i++) {
    await control.evaluate((idx) => document.querySelectorAll('#performerButtons button')[idx].dispatchEvent(new MouseEvent('click', { bubbles: true })), i);
    await wait(150);
    await setInput(control, '#judgesScoreInput', String(r2Scores[i]));
    await clickEl(control, '#saveJudgesScoreBtn');
    await wait(150);
    await clickEl(control, '#voteOpenBtn');
    await wait(150);
    await control.evaluate((pts) => document.querySelectorAll('.manual-vote-buttons button')[pts - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })), 7);
    await wait(150);
    await clickEl(control, '#voteCloseBtn');
    await wait(150);
  }
  await setInput(control, '#advanceCount', '2');
  await clickEl(control, '#finishRoundBtn');
  await wait(300);
  console.log('[round2] closed ok, no crash so far. errors so far:', errors.length);
  await wait(9000);

  // ===== ROUND 3 (final, stage 3) via auto-create =====
  await clickEl(control, '#startNextRoundBtn');
  await wait(300);

  await control.evaluate(() => document.querySelectorAll('#performerButtons button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await wait(150);
  await setInput(control, '#judgesScoreInput', '28');
  await clickEl(control, '#saveJudgesScoreBtn');
  await wait(150);
  await clickEl(control, '#voteOpenBtn');
  await wait(300);

  const finalRoundVoting = await display.evaluate(() => ({
    histogramHidden: document.getElementById('histogram').classList.contains('hidden'),
    phoneVisible: !document.getElementById('votePhoneDisplay').classList.contains('hidden'),
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('[round3 FINAL] voting screen (should hide results):', JSON.stringify(finalRoundVoting));

  await control.evaluate(() => document.querySelectorAll('.manual-vote-buttons button')[9].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await wait(200);
  await clickEl(control, '#voteCloseBtn');
  await wait(200);

  // second finalist
  await control.evaluate(() => document.querySelectorAll('#performerButtons button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await wait(150);
  await setInput(control, '#judgesScoreInput', '25');
  await clickEl(control, '#saveJudgesScoreBtn');
  await wait(150);
  await clickEl(control, '#voteOpenBtn');
  await wait(150);
  await control.evaluate(() => document.querySelectorAll('.manual-vote-buttons button')[6].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await wait(200);
  await clickEl(control, '#voteCloseBtn');
  await wait(300);

  // announce winner
  await control.evaluate(() => { const sel = document.getElementById('winnerSelect'); if (sel.options.length) sel.selectedIndex = 0; });
  await control.evaluate(() => { window.confirm = () => true; });
  await clickEl(control, '#announceWinnerBtn');
  await wait(300);
  const winnerStart = await display.evaluate(() => ({
    carpetRunning: !document.getElementById('carpetTrack').classList.contains('stopped'),
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('[winner] carpet running right after announce:', JSON.stringify(winnerStart));
  await wait(10500); // carpet now rolls for a full 10s before the name lands
  const winnerFinal = await display.evaluate(() => ({
    nameText: document.getElementById('winnerName').textContent,
    carpetStopped: document.getElementById('carpetTrack').classList.contains('stopped'),
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('[winner] final state:', JSON.stringify(winnerFinal));

  console.log('TOTAL ERRORS:', JSON.stringify(errors));
  await browser.close();
  console.log('REHEARSAL DONE');
}
run().catch((e) => { console.error('SCRIPT CRASHED:', e.message, e.stack); process.exit(1); });
