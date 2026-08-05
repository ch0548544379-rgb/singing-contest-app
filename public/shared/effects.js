// אפקטים ויזואליים: תווי נגינה עפים + דמויות שרים במיקרופון (סילואט, ללא תמונות חיצוניות)
(function () {
  const NOTE_CHARS = ['♪', '♫', '♬', '♩'];
  let burstFn = null;
  let confettiFn = null;

  function initNotes(canvasId, getIntensity) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const CONFETTI_COLORS = ['#f2c14e', '#ff3d6e', '#7d5cff', '#ffffff', '#6be36b', '#4ec9f2'];

    function spawn(count, opts) {
      opts = opts || {};
      for (let i = 0; i < count; i++) {
        if (opts.confetti) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.9);
          const speed = 6 + Math.random() * 10;
          particles.push({
            type: 'confetti',
            x: opts.x != null ? opts.x + (Math.random() - 0.5) * 200 : Math.random() * w,
            y: opts.y != null ? opts.y : h * 0.7,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            w: 6 + Math.random() * 8,
            h: 10 + Math.random() * 10,
            hue: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.25,
            alpha: 0.85 + Math.random() * 0.15,
          });
        } else {
          particles.push({
            type: 'note',
            x: opts.x != null ? opts.x + (Math.random() - 0.5) * 120 : Math.random() * w,
            y: opts.y != null ? opts.y : h + 40,
            size: (opts.big ? 34 : 20) + Math.random() * 32,
            speed: (opts.big ? 3.2 : 2) + Math.random() * 3.4,
            drift: (Math.random() - 0.5) * (opts.big ? 4.5 : 2.6),
            char: NOTE_CHARS[Math.floor(Math.random() * NOTE_CHARS.length)],
            hue: ['#f2c14e', '#7d5cff', '#ff3d6e'][Math.floor(Math.random() * 3)],
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.08,
            alpha: 0.3 + Math.random() * 0.5,
          });
        }
      }
    }

    function tick() {
      const intensity = getIntensity ? getIntensity() : 1;
      ctx.clearRect(0, 0, w, h);
      if (Math.random() < 0.24 * intensity) spawn(1 + Math.floor(intensity * 1.8));
      particles.forEach((p) => {
        ctx.save();
        if (p.type === 'confetti') {
          p.vy += 0.28; // כבידה
          p.vx *= 0.995;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.rotSpeed;
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.hue;
          ctx.shadowColor = p.hue;
          ctx.shadowBlur = 6;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          p.y -= p.speed * intensity;
          p.x += p.drift;
          p.rot += p.rotSpeed;
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.font = `${p.size}px Arial`;
          ctx.fillStyle = p.hue;
          ctx.shadowColor = p.hue;
          ctx.shadowBlur = 16;
          ctx.fillText(p.char, 0, 0);
        }
        ctx.restore();
      });
      particles = particles.filter((p) => p.y < h + 60 && p.y > -60 && p.x > -60 && p.x < w + 60);
      requestAnimationFrame(tick);
    }
    tick();

    // פרץ תווים - קורא לזה בכל הצבעה חדשה כדי שהמסך "יתמלא" מיד כשמתחילים להתקשר
    burstFn = (x, y, count) => spawn(count || 14, { x: x != null ? x : w / 2, y: y != null ? y : h * 0.6, big: true });
    confettiFn = (x, y, count) => spawn(count || 120, { x: x != null ? x : w / 2, y: y != null ? y : h * 0.55, confetti: true });
  }

  function burst(x, y, count) {
    if (burstFn) burstFn(x, y, count);
  }

  function confetti(x, y, count) {
    if (confettiFn) confettiFn(x, y, count);
  }

  // דמות סילואט של שר חסידי במיקרופון (כובע, זקן, מעיל) - SVG מצויר, ללא תמונות
  function singerSVG(flip) {
    return `
    <svg viewBox="0 0 140 220" width="140" height="220" style="transform:scaleX(${flip ? -1 : 1})">
      <g fill="#0a0a12" stroke="#f2c14e" stroke-width="1.5" opacity="0.9">
        <ellipse cx="70" cy="46" rx="30" ry="10"/>
        <path d="M45 46 Q45 10 70 10 Q95 10 95 46 Z"/>
        <circle cx="70" cy="70" r="24"/>
        <path d="M52 82 Q70 100 88 82 L88 95 Q70 108 52 95 Z"/>
        <path d="M35 220 L45 120 Q70 100 95 120 L105 220 Z"/>
        <rect x="63" y="60" width="6" height="30" rx="3" fill="#f2c14e" stroke="none" class="mic"/>
        <circle cx="66" cy="58" r="7" fill="#f2c14e" stroke="none"/>
      </g>
    </svg>`;
  }

  function initSilhouettes(containerId, count) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const n = count || 2;
    let html = '';
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 'left' : 'right';
      const pos = 4 + i * 18;
      html += `<div class="singer-silhouette ${side}" style="--pos:${pos}%; animation-delay:${i * 0.6}s">${singerSVG(i % 2 === 1)}</div>`;
    }
    el.innerHTML = html;
    const style = document.createElement('style');
    style.textContent = `
      .singer-silhouette { position:absolute; bottom:-10px; opacity:0.5; animation: singerBob 2.4s ease-in-out infinite; filter: drop-shadow(0 0 10px rgba(242,193,78,0.35)); }
      .singer-silhouette.left { left: var(--pos); }
      .singer-silhouette.right { right: var(--pos); }
      @keyframes singerBob { 0%,100% { transform: translateY(0) scale(1);} 50% { transform: translateY(-8px) scale(1.03);} }
    `;
    document.head.appendChild(style);
  }

  window.StageEffects = { initNotes, initSilhouettes, burst, confetti };
})();
