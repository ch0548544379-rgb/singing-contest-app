const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: ' + label)), ms))]);
}
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
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

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

  await withTimeout(control.goto('http://localhost:3000/control/', { waitUntil: 'networkidle0' }), 15000, 'goto control');
  await withTimeout(display.goto('http://localhost:3000/display/', { waitUntil: 'networkidle0' }), 15000, 'goto display');
  await display.evaluate(() => document.getElementById('soundBtn').click());
  await new Promise((r) => setTimeout(r, 300));

  // 4 contestants, round 1
  await control.evaluate(() => {
    const inputs = document.querySelectorAll('#rosterGrid input');
    ['שלמה כהן', 'משה לוי', 'דוד ישראלי', 'יוסי מזרחי'].forEach((name, i) => {
      inputs[i].value = name; inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await new Promise((r) => setTimeout(r, 300));
  await setInput(control, '#roundName', 'שלב 1');
  await control.evaluate(() => document.querySelectorAll('#participantPicker button').forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true }))));
  await clickEl(control, '#createRoundBtn');
  await new Promise((r) => setTimeout(r, 300));

  // give each contestant a judges score + a manual vote so scores differ
  const scores = [24, 18, 27, 12];
  for (let i = 0; i < 4; i++) {
    await control.evaluate((idx) => document.querySelectorAll('#performerButtons button')[idx].dispatchEvent(new MouseEvent('click', { bubbles: true })), i);
    await new Promise((r) => setTimeout(r, 150));
    await setInput(control, '#judgesScoreInput', String(scores[i]));
    await clickEl(control, '#saveJudgesScoreBtn');
    await new Promise((r) => setTimeout(r, 150));
    await clickEl(control, '#voteOpenBtn');
    await new Promise((r) => setTimeout(r, 150));
    await control.evaluate((idx) => document.querySelectorAll('.manual-vote-buttons button')[idx % 10].dispatchEvent(new MouseEvent('click', { bubbles: true })), 5 + i);
    await new Promise((r) => setTimeout(r, 150));
    await clickEl(control, '#voteCloseBtn');
    await new Promise((r) => setTimeout(r, 150));
  }

  // compute rank, advance top 3, close round
  await clickEl(control, '#computeRankBtn');
  await new Promise((r) => setTimeout(r, 300));
  await setInput(control, '#advanceCount', '3');
  await clickEl(control, '#computeRankBtn'); // recompute with advanceCount=3 checked defaults
  await new Promise((r) => setTimeout(r, 300));
  await clickEl(control, '#closeRoundBtn');
  await new Promise((r) => setTimeout(r, 400));

  // check spotlight appears with first place immediately
  const spotlightStep1 = await display.evaluate(() => ({
    spotlightHidden: document.getElementById('resultsSpotlight').classList.contains('hidden'),
    listHidden: document.getElementById('resultsList').classList.contains('hidden'),
    rankText: document.getElementById('spotlightRank').textContent,
    nameText: document.getElementById('spotlightName').textContent,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('spotlight step 1 (right after close):', JSON.stringify(spotlightStep1));

  // check next-round button appeared on control panel
  const nextBtnState = await control.evaluate(() => ({
    hidden: document.getElementById('startNextRoundBtn').classList.contains('hidden'),
    text: document.getElementById('startNextRoundBtn').textContent,
  }));
  console.log('next round button:', JSON.stringify(nextBtnState));

  // wait for full spotlight sequence (3 advancers * ~2.5-3.4s each) to finish and settle into list
  await new Promise((r) => setTimeout(r, 13000));
  const spotlightDone = await display.evaluate(() => ({
    spotlightHidden: document.getElementById('resultsSpotlight').classList.contains('hidden'),
    listHidden: document.getElementById('resultsList').classList.contains('hidden'),
    rowCount: document.querySelectorAll('#resultsList .result-row').length,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('after full spotlight sequence:', JSON.stringify(spotlightDone));

  // test next-round quick-fill
  await clickEl(control, '#startNextRoundBtn');
  await new Promise((r) => setTimeout(r, 300));
  const prefill = await control.evaluate(() => ({
    roundName: document.getElementById('roundName').value,
    selectedCount: document.querySelectorAll('#participantPicker .participant-pick.selected').length,
  }));
  console.log('prefill after start-next-round click:', JSON.stringify(prefill));

  // === winner sequence test ===
  await control.evaluate(() => {
    const sel = document.getElementById('winnerSelect');
    if (sel.options.length) sel.selectedIndex = 0;
  });
  await control.evaluate(() => { window.confirm = () => true; });
  await clickEl(control, '#announceWinnerBtn');
  await new Promise((r) => setTimeout(r, 300));
  const winnerStep1 = await display.evaluate(() => ({
    screenVisible: !document.getElementById('screen-winner').classList.contains('hidden'),
    carpetStopped: document.getElementById('carpetTrack').classList.contains('stopped'),
    nameHidden: document.getElementById('winnerName').classList.contains('hidden'),
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('winner screen right after announce (carpet should be running, name hidden):', JSON.stringify(winnerStep1));

  await new Promise((r) => setTimeout(r, 2800));
  const winnerStep2 = await display.evaluate(() => ({
    carpetStopped: document.getElementById('carpetTrack').classList.contains('stopped'),
    nameHidden: document.getElementById('winnerName').classList.contains('hidden'),
    nameText: document.getElementById('winnerName').textContent,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('winner screen after carpet stops:', JSON.stringify(winnerStep2));

  console.log('ALL ERRORS:', JSON.stringify(errors));
  await browser.close();
  console.log('DONE');
}
run().catch((e) => { console.error('SCRIPT CRASHED:', e.message, e.stack); process.exit(1); });
