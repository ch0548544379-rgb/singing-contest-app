const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: ' + label)), ms)),
  ]);
}

function clickEl(page, selector) {
  return page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
    protocolTimeout: 30000,
  });

  const control = await browser.newPage();
  const display = await browser.newPage();
  const errors = [];
  control.on('pageerror', (e) => errors.push('CONTROL PAGEERROR: ' + e.message));
  display.on('pageerror', (e) => errors.push('DISPLAY PAGEERROR: ' + e.message));
  control.on('console', (m) => { if (m.type() === 'error') errors.push('CONTROL CONSOLE: ' + m.text()); });
  display.on('console', (m) => { if (m.type() === 'error') errors.push('DISPLAY CONSOLE: ' + m.text()); });

  await withTimeout(control.goto('http://localhost:3000/control/', { waitUntil: 'networkidle0' }), 15000, 'goto control');
  await withTimeout(display.goto('http://localhost:3000/display/', { waitUntil: 'networkidle0' }), 15000, 'goto display');
  await new Promise((r) => setTimeout(r, 500));

  // reset state to start clean
  await display.evaluate(() => { document.getElementById('soundBtn').click(); });
  await new Promise((r) => setTimeout(r, 200));

  // check no vertical overflow on idle screen
  const idleOverflow = await display.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 2);
  console.log('idle screen has scroll overflow:', idleOverflow);

  // fill 3 roster slots
  await control.evaluate(() => {
    const inputs = document.querySelectorAll('#rosterGrid input');
    inputs[0].value = 'שלמה כהן'; inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    inputs[1].value = 'משה לוי'; inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    inputs[2].value = 'דוד ישראלי'; inputs[2].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 400));

  await control.evaluate(() => {
    document.querySelectorAll('#participantPicker button').forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  });
  await clickEl(control, '#createRoundBtn');
  await new Promise((r) => setTimeout(r, 400));

  await control.evaluate(() => document.querySelectorAll('#performerButtons button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 300));

  // === test 1: judges sting effect fires on save ===
  await setInput(control, '#judgesScoreInput', '24');
  await clickEl(control, '#saveJudgesScoreBtn');
  await new Promise((r) => setTimeout(r, 300));
  const stingFlashOn = await display.evaluate(() => document.getElementById('stingFlash').className);
  console.log('sting flash class after judges save:', stingFlashOn);

  // === test 2: vote open sting + voting screen shows points gauge, no scroll ===
  await clickEl(control, '#voteOpenBtn');
  await new Promise((r) => setTimeout(r, 300));
  const votingScreenState = await display.evaluate(() => {
    const overflow = document.documentElement.scrollHeight > document.documentElement.clientHeight + 2;
    return {
      screenVisible: !document.getElementById('screen-voting').classList.contains('hidden'),
      gaugeFillWidth: document.getElementById('pointsGaugeFill').style.width,
      audiencePoints: document.getElementById('audiencePoints').textContent,
      audiencePointsMax: document.getElementById('audiencePointsMax').textContent,
      overflow,
    };
  });
  console.log('voting screen state:', JSON.stringify(votingScreenState));

  // cast several manual votes, check gauge updates live
  for (const pts of [8, 9, 10, 7]) {
    await control.evaluate((p) => {
      const buttons = document.querySelectorAll('.manual-vote-buttons button');
      buttons[p - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, pts);
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 300));
  const gaugeAfterVotes = await display.evaluate(() => ({
    gaugeFillWidth: document.getElementById('pointsGaugeFill').style.width,
    audiencePoints: document.getElementById('audiencePoints').textContent,
    overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
  }));
  console.log('gauge after 4 manual votes (avg should be 8.5/10 -> ~25.5/30):', JSON.stringify(gaugeAfterVotes));

  await clickEl(control, '#voteCloseBtn');
  await new Promise((r) => setTimeout(r, 200));

  // === test 3: mute toggle ===
  await clickEl(control, '#musicMuteBtn');
  await new Promise((r) => setTimeout(r, 300));
  const muteBtnLabel = await control.$eval('#musicMuteBtn', (el) => el.textContent);
  console.log('mute button label after toggle:', muteBtnLabel);

  await clickEl(control, '#musicMuteBtn');
  await new Promise((r) => setTimeout(r, 200));

  // === test 4: results reveal animation with 20+ variation system ===
  await clickEl(control, '#computeRankBtn');
  await new Promise((r) => setTimeout(r, 300));
  await clickEl(control, '#closeRoundBtn');
  await new Promise((r) => setTimeout(r, 300));

  const resultsInitial = await display.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#resultsList .result-row'));
    return {
      count: rows.length,
      revealedImmediately: rows.filter((r) => r.classList.contains('reveal-in')).length,
      firstRowClasses: rows[0] ? rows[0].className : 'NONE',
      overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
    };
  });
  console.log('results screen right after close (should stagger, not all revealed):', JSON.stringify(resultsInitial));

  // wait for all staggered reveals to finish (3 rows * 450ms delay + ~1.7s count duration)
  await new Promise((r) => setTimeout(r, 3500));
  const resultsFinal = await display.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#resultsList .result-row'));
    return {
      revealedCount: rows.filter((r) => r.classList.contains('reveal-in')).length,
      scores: rows.map((r) => r.querySelector('.result-score').textContent),
      variationClasses: rows.map((r) => [...r.classList].filter((c) => c.startsWith('reveal-dir') || c.startsWith('reveal-accent'))),
      overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
    };
  });
  console.log('results screen after all reveals settle:', JSON.stringify(resultsFinal));

  console.log('ALL ERRORS:', JSON.stringify(errors));
  await browser.close();
  console.log('DONE');
}

run().catch((e) => { console.error('SCRIPT CRASHED:', e.message, e.stack); process.exit(1); });
