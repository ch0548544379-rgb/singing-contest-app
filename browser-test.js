const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: ' + label)), ms)),
  ]);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 30000,
  });

  const control = await browser.newPage();
  const display = await browser.newPage();
  const errors = [];
  control.on('pageerror', (e) => errors.push('CONTROL PAGEERROR: ' + e.message));
  display.on('pageerror', (e) => errors.push('DISPLAY PAGEERROR: ' + e.message));

  await withTimeout(control.goto('http://localhost:3000/control/', { waitUntil: 'networkidle0' }), 15000, 'goto control');
  await withTimeout(display.goto('http://localhost:3000/display/', { waitUntil: 'networkidle0' }), 15000, 'goto display');
  await new Promise((r) => setTimeout(r, 800));

  function setInput(page, selector, value) {
    return page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
  }
  function clickEl(page, selector) {
    return page.evaluate((sel) => {
      document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, selector);
  }

  // fill 2 roster slots
  await control.evaluate(() => {
    const inputs = document.querySelectorAll('#rosterGrid input');
    inputs[0].value = 'שלמה כהן'; inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    inputs[1].value = 'משה לוי'; inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));

  // select both as round participants (click participant-pick buttons)
  const partCount = await control.$$eval('#participantPicker button', (els) => els.length);
  console.log('participant picker buttons:', partCount);
  await control.evaluate(() => {
    document.querySelectorAll('#participantPicker button').forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  });
  await new Promise((r) => setTimeout(r, 300));

  await clickEl(control, '#createRoundBtn');
  await new Promise((r) => setTimeout(r, 500));

  const roundTitle = await control.$eval('#roundTitle', (el) => el.textContent).catch(() => 'MISSING');
  console.log('round title after create:', roundTitle);

  // select performer 1
  await control.evaluate(() => document.querySelectorAll('#performerButtons button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 500));

  // check judgesBox is now enabled
  const judgesState = await control.evaluate(() => ({
    disabled: document.getElementById('judgesScoreInput').disabled,
    hint: document.getElementById('judgesBoxHint').textContent,
  }));
  console.log('judgesBox state after selecting performer:', JSON.stringify(judgesState));

  // enter judges score via the new prominent box
  await setInput(control, '#judgesScoreInput', '24');
  await clickEl(control, '#saveJudgesScoreBtn');
  await new Promise((r) => setTimeout(r, 500));

  const savedNote = await control.$eval('#judgesSavedNote', (el) => el.textContent);
  console.log('saved note:', savedNote);

  // check display shows judges score live on performer screen
  const displayJudges = await display.evaluate(() => ({
    hidden: document.getElementById('judgesLivePerformer').classList.contains('hidden'),
    text: document.getElementById('judgesLivePerformer').querySelector('span').textContent,
  }));
  console.log('display judgesLivePerformer:', JSON.stringify(displayJudges));

  // open voting and cast a manual vote, check burst effect doesn't crash + histogram updates
  await clickEl(control, '#voteOpenBtn');
  await new Promise((r) => setTimeout(r, 400));
  await control.evaluate(() => document.querySelectorAll('.manual-vote-buttons button')[7].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 600));

  const displayVoteState = await display.evaluate(() => ({
    voteCount: document.getElementById('voteCount').textContent,
    voteAvg: document.getElementById('voteAvg').textContent,
    judgesLiveVoting: document.getElementById('judgesLiveVoting').querySelector('span').textContent,
  }));
  console.log('display after manual vote (8 points):', JSON.stringify(displayVoteState));

  console.log('ERRORS:', errors);
  await browser.close();
  console.log('DONE');
}

run().catch((e) => { console.error('SCRIPT CRASHED:', e.message); process.exit(1); });
