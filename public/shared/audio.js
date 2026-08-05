// מנוע מוזיקת רקע דרמטית - מיוצר לגמרי בקוד (Web Audio), בלי קבצים חיצוניים.
// אקורדים + ארפג'יו + הקשה עדינה, במקום זמזום שטוח - הדרמה גוברת עם השלב ועם הצבעה פעילה.
(function () {
  let ctx = null;
  let master, padGain, filter, arpGain, percGain;
  let padOscBanks = [];
  let arpTimer = null;
  let percTimer = null;
  let started = false;
  let stage = 1;
  let voting = false;
  let voteHeat = 0;
  let arpStep = 0;

  // אקורדים (יחסית לטוניקה, בסמיטונים) - מינורי עדין -> מתוח -> דרמטי
  const CHORDS = {
    1: [0, 3, 7, 12], // מינור שקט
    2: [0, 3, 7, 10, 12], // מינור 7 - יותר מתח
    3: [0, 3, 6, 10, 13], // מינור עם קווינטה מוקטנת - דרמטי/מותח
  };
  const ROOT = { 1: 110, 2: 103.8, 3: 98 }; // יורד ומחמיר עם השלב

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);

      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.7;
      filter.connect(master);

      padGain = ctx.createGain();
      padGain.gain.value = 0.14;
      padGain.connect(filter);

      arpGain = ctx.createGain();
      arpGain.gain.value = 0.22;
      arpGain.connect(filter);

      percGain = ctx.createGain();
      percGain.gain.value = 0.35;
      percGain.connect(master);

      // LFO עדין שמזיז את הפילטר - נותן "נשימה" לפאד במקום צליל שטוח
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
    }
    return ctx;
  }

  function semitoneToFreq(root, semi) {
    return root * Math.pow(2, semi / 12);
  }

  function rebuildPad() {
    padOscBanks.forEach((o) => { try { o.stop(); } catch (e) {} });
    padOscBanks = [];
    const root = ROOT[stage];
    const chord = CHORDS[stage];
    chord.forEach((semi, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = semitoneToFreq(root, semi - 12); // אוקטבה נמוכה יותר לפאד
      osc.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0.55;
      osc.connect(g);
      g.connect(padGain);
      osc.start();
      padOscBanks.push(osc);
    });
    filter.frequency.setTargetAtTime(900 + stage * 200, ctx.currentTime, 1.5);
  }

  // צליל ארפג'יו יחיד עם מעטפת נעימה (לא קליק חד) - זה מה שנותן "עניין" במקום זמזום
  function playArpNote(freq, velocity) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(arpGain);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(velocity, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.start(now);
    osc.stop(now + 1);
  }

  // הקשה עדינה (כמו הלמות לב) - מוסיפה דרמה בלי להישמע כמו אזעקה
  function playThump(strength) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    g.gain.setValueAtTime(strength, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(percGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  function scheduleArp() {
    clearInterval(arpTimer);
    const root = ROOT[stage];
    const chord = CHORDS[stage];
    const speed = voting ? [0, 260, 210, 160][stage] : [0, 480, 400, 340][stage];
    arpTimer = setInterval(() => {
      const semi = chord[arpStep % chord.length];
      const octaveUp = Math.floor(arpStep / chord.length) % 2 === 0 ? 12 : 24;
      playArpNote(semitoneToFreq(root, semi + octaveUp), voting ? 0.28 : 0.16);
      arpStep++;
    }, speed);
  }

  function schedulePerc() {
    clearInterval(percTimer);
    const bpm = voting ? [0, 100, 118, 138][stage] : [0, 55, 62, 70][stage];
    const intervalMs = 60000 / bpm;
    percTimer = setInterval(() => playThump(voting ? 0.5 + stage * 0.08 : 0.22 + stage * 0.05), intervalMs);
  }

  let muted = false;

  // --- מוזיקת רקע אמיתית (קבצי MP3) - מתנגנת רק ברגעים ספציפיים: הצבעה פתוחה, סגירת סבב, זוכה.
  // אין יותר "זמזום" רציף ברקע בזמן שמישהו שר או שמזינים ניקוד שופטים - שקט מוחלט שם, בכוונה.
  let currentTrack = null;
  let currentTrackVolume = 0.8;

  // מזהה-דור לכל אלמנט אודיו - מבטל fade ישן אם מתחיל fade חדש על אותו אלמנט (מונע שני fade-ים
  // שרצים בו-זמנית ו"נלחמים" זה בזה על audio.volume, מה שיכול לגרום לערך חורג מהטווח [0,1] ולזרוק שגיאה).
  let fadeSeq = 0;
  function fadeElementVolume(audio, from, to, ms, onDone) {
    const myFade = ++fadeSeq;
    audio._fadeId = myFade;
    const clampedFrom = Math.max(0, Math.min(1, from));
    const clampedTo = Math.max(0, Math.min(1, to));
    const startTime = performance.now();
    audio.volume = clampedFrom;
    function step(now) {
      if (audio._fadeId !== myFade) return;
      const t = Math.min(1, (now - startTime) / ms);
      audio.volume = Math.max(0, Math.min(1, clampedFrom + (clampedTo - clampedFrom) * t));
      if (t < 1) requestAnimationFrame(step);
      else { audio.volume = clampedTo; if (onDone) onDone(); }
    }
    requestAnimationFrame(step);
  }

  function playMusicTrack(url, opts) {
    opts = opts || {};
    const targetVolume = opts.volume != null ? opts.volume : 0.8;
    const fadeMs = opts.fadeMs != null ? opts.fadeMs : 1200;
    stopMusicTrack(400);
    const audio = new Audio(url);
    audio.loop = !!opts.loop;
    audio.volume = 0;
    audio.play().catch(() => {});
    currentTrack = audio;
    currentTrackVolume = targetVolume;
    fadeElementVolume(audio, 0, muted ? 0 : targetVolume, fadeMs);
    return audio;
  }

  function stopMusicTrack(fadeMs) {
    if (!currentTrack) return;
    const audio = currentTrack;
    currentTrack = null;
    fadeElementVolume(audio, audio.volume, 0, fadeMs == null ? 800 : fadeMs, () => { try { audio.pause(); } catch (e) {} });
  }

  function setMuted(next) {
    const nextMuted = !!next;
    if (nextMuted === muted) return; // נקרא בכל render() - לא להתחיל fade חדש כשכלום לא השתנה
    muted = nextMuted;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.25);
    if (currentTrack) fadeElementVolume(currentTrack, currentTrack.volume, muted ? 0 : currentTrackVolume, 400);
  }

  function start() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function stop() {
    started = false;
    stopMusicTrack(300);
  }

  function setStage(level) {
    stage = Math.max(1, Math.min(3, Number(level) || 1));
  }

  function setVoting(active) {
    voting = !!active;
  }

  function setVoteHeat(pct) {
    voteHeat = Math.max(0, Math.min(1, Number(pct) || 0));
  }

  // הלמת תוף בודדת וחדה - לרגע ששומרים ניקוד שופטים
  function judgesSting() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    playThump(0.9);
    setTimeout(() => playThump(0.6), 140);
  }

  // "ריצת תופים" עולה (riser) - לרגע שפותחים הצבעת קהל, לפני שנכנסים ללולאת הרקע
  function voteOpenSting() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    // רעש לבן עולה (סנר-רול) שנבנה במשך כשנייה וחצי
    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(400, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(4000, now + 1.5);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.5, now + 1.45);
    noiseGain.gain.linearRampToValueAtTime(0.0001, now + 1.55);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
    noise.stop(now + 1.6);
    // הלמות מתגברות בקצב מואץ
    [0, 300, 550, 750, 900, 1000, 1080, 1150, 1210, 1260].forEach((t, i) => {
      setTimeout(() => playThump(0.4 + i * 0.06), t);
    });
    setTimeout(() => playThump(1), 1500);
  }

  // צליל ניצחון דרמטי לגילוי הזוכה - אקורד מז'ורי עולה + הלמת בס
  function winnerStinger() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    playThump(0.8);
    const chord = [220, 277.18, 329.63, 440, 554.37];
    chord.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f * 0.5, now);
      osc.frequency.exponentialRampToValueAtTime(f, now + 0.5);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.3, now + 0.15 + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 3.9);
    });
  }

  // מחיאות כפיים סינתטיות - רעש ממוסך ממושך + הרבה "מחיאות" בודדות בפיזור אקראי -
  // נמשך לאורך זמן משמעותי כדי לחפוף את המוזיקה הדרמטית של הזוכה, לא רק כמה שניות.
  function applause() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const dur = 14;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.35);
    g.gain.linearRampToValueAtTime(0.26, now + dur - 3);
    g.gain.linearRampToValueAtTime(0, now + dur);
    noise.connect(bp);
    bp.connect(g);
    g.connect(master);
    noise.start(now);
    noise.stop(now + dur + 0.1);

    for (let i = 0; i < 180; i++) {
      const t = Math.random() * dur * 1000;
      setTimeout(() => {
        if (!ctx) return;
        const bsize = Math.floor(ctx.sampleRate * 0.035);
        const buf = ctx.createBuffer(1, bsize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < bsize; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / bsize);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 1700;
        const gg = ctx.createGain();
        gg.gain.value = 0.16 + Math.random() * 0.14;
        src.connect(f);
        f.connect(gg);
        gg.connect(master);
        src.start();
      }, t);
    }
  }

  window.StageAudio = { start, stop, setStage, setVoting, setVoteHeat, setMuted, judgesSting, voteOpenSting, applause, winnerStinger, playMusicTrack, stopMusicTrack, isStarted: () => started };
})();
