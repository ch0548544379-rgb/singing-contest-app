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

  await withTimeout(control.goto('http://localhost:3000/control/', { waitUntil: 'domcontentloaded' }), 15000, 'goto control');
  await withTimeout(display.goto('http://localhost:3000/display/', { waitUntil: 'domcontentloaded' }), 15000, 'goto display');
  await display.evaluate(() => document.getElementById('soundBtn').click());
  await new Promise((r) => setTimeout(r, 300));

  // set the vote phone number
  await setInput(control, '#votePhoneInput', '0737110105');
  await new Promise((r) => setTimeout(r, 300));

  // 2 contestants, round set to stage 3 (final) to test hiding
  await control.evaluate(() => {
    const inputs = document.querySelectorAll('#rosterGrid input');
    ['שלמה כהן', 'משה לוי'].forEach((name, i) => {
      inputs[i].value = name; inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await new Promise((r) => setTimeout(r, 300));
  await control.evaluate(() => { document.getElementById('roundStage').value = '3'; });
  await control.evaluate(() => document.querySelectorAll('#participantPicker button').forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true }))));
  await clickEl(control, '#createRoundBtn');
  await new Promise((r) => setTimeout(r, 300));

  await control.evaluate(() => document.querySelectorAll('#performerButtons button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 200));
  await setInput(control, '#judgesScoreInput', '25');
  await clickEl(control, '#saveJudgesScoreBtn');
  await new Promise((r) => setTimeout(r, 200));
  await clickEl(control, '#voteOpenBtn');
  await new Promise((r) => setTimeout(r, 300));

  const finalStageVotingState = await display.evaluate(() => ({
    histogramHidden: document.getElementById('histogram').classList.contains('hidden'),
    statsHidden: document.getElementById('voteStatsBox').classList.contains('hidden'),
    gaugeHidden: document.getElementById('pointsGaugeWrap').classList.contains('hidden'),
    phoneVisible: !document.getElementById('votePhoneDisplay').classList.contains('hidden'),
    phoneText: document.getElementById('votePhoneDisplay').textContent,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('stage-3 voting screen (results should be hidden, phone visible):', JSON.stringify(finalStageVotingState));

  // cast a vote anyway, confirm it doesn't crash even though hidden
  await control.evaluate(() => document.querySelectorAll('.manual-vote-buttons button')[7].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 300));
  const stillHidden = await display.evaluate(() => document.getElementById('histogram').classList.contains('hidden'));
  console.log('still hidden after a vote comes in:', stillHidden);

  await clickEl(control, '#voteCloseBtn');
  await new Promise((r) => setTimeout(r, 200));

  // === test reset-round button ===
  const beforeReset = await control.evaluate(() => document.getElementById('scoresBody').innerText);
  await control.evaluate(() => { window.confirm = () => true; });
  await clickEl(control, '#resetRoundBtn');
  await new Promise((r) => setTimeout(r, 300));
  await new Promise((r) => setTimeout(r, 500));
  const afterReset = await control.evaluate((state) => ({
    roundPanelVisible: !document.getElementById('roundPanel').classList.contains('hidden'),
    currentPerformerLabel: JSON.stringify(document.getElementById('currentPerformerLabel').textContent),
    scoresBody: document.getElementById('scoresBody').innerText,
  }));
  console.log('before reset scores:', beforeReset.replace(/\n/g, ' | '));
  console.log('after reset-round click:', JSON.stringify(afterReset));

  // participants should still be in the round after reset (not deleted)
  const participantsStillThere = await control.evaluate(() => document.querySelectorAll('#scoresBody tr').length);
  console.log('participant rows still in round after reset:', participantsStillThere);

  console.log('ALL ERRORS:', JSON.stringify(errors));
  await browser.close();
  console.log('DONE');
}
run().catch((e) => { console.error('SCRIPT CRASHED:', e.message, e.stack); process.exit(1); });
