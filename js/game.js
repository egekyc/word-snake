(() => {
  'use strict';


  const COLS = 22;
  const ROWS = 16;
  const CELL = 18;                 
  const START_LENGTH = 3;
  const DECOY_COUNT = 4;           
  const SPEEDS = { slow: 165, normal: 125, fast: 90 }; 
  const SPEEDUP_PER_WORD = 3;
  const MIN_STEP = 60;
  const POINTS_PER_LETTER = 10;
  const PERFECT_BONUS_PER_LETTER = 5;
  const STORAGE_KEY = 'word-snake';

  const DECOY_POOL = 'EEEETTTAAAOOOIIINNNSSSHHRRDDLLUUCCMMWFGYPBVKJXQZ';

  const COLOR = {
    outline: '#0f1020',
    boardA: '#1a1c2c',
    boardB: '#1e2134',
    body: ['#38b764', '#2fa35a'],
    bodyLight: '#a7f070',
    bodyDark: '#257179',
    head: '#a7f070',
    headLight: '#e8ffcc',
    headDark: '#38b764',
    dead: '#566c86',
    deadLight: '#94b0c2',
    deadDark: '#333c57',
    tile: '#ffcd75',
    tileLight: '#fff1cf',
    tileDark: '#ef7d57',
    tileInk: '#1a1c2c',
    good: '#a7f070',
    bad: '#ff5d6c',
    gold: '#ffcd75',
    white: '#f4f4f4',
  };

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_DIRS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = (() => {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { /* storage blocked */ }
    return {
      get: (key, fallback) => (key in data ? data[key] : fallback),
      set: (key, value) => {
        data[key] = value;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
      },
    };
  })();

  const sfx = (() => {
    let ac = null;
    let muted = store.get('muted', false);

    const SOUNDS = {
      start: [[392, 0, 0.07], [523, 0.07, 0.1]],
      letter: [[660, 0, 0.07, { to: 990 }]],
      bad: [[220, 0, 0.18, { type: 'sawtooth', to: 110 }]],
      win: [[523, 0, 0.09], [659, 0.08, 0.09], [784, 0.16, 0.09], [1047, 0.24, 0.22]],
      wrong: [[392, 0, 0.12], [311, 0.11, 0.12], [233, 0.22, 0.24]],
      skip: [[330, 0, 0.12, { to: 220 }]],
      over: [[392, 0, 0.15], [330, 0.15, 0.15], [262, 0.3, 0.15], [196, 0.45, 0.45, { type: 'triangle' }]],
    };

    function unlock() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ac = new AC();
      }
      if (ac && ac.state === 'suspended') ac.resume();
    }

    function tone(freq, start, dur, { type = 'square', vol = 0.05, to = null } = {}) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }

    return {
      unlock,
      play(name) {
        if (muted) return;
        unlock();
        if (!ac) return;
        const t = ac.currentTime + 0.01;
        for (const [freq, at, dur, opts] of SOUNDS[name]) tone(freq, t + at, dur, opts);
      },
      get muted() { return muted; },
      toggle() {
        muted = !muted;
        store.set('muted', muted);
        if (!muted) unlock();
        return muted;
      },
    };
  })();

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  ctx.imageSmoothingEnabled = false;

  const ui = {
    score: $('score'),
    length: $('length'),
    words: $('words'),
    best: $('best'),
    category: $('category'),
    reward: $('reward'),
    question: $('question'),
    slots: $('slots'),
    message: $('message'),
    overlay: $('overlay'),
    panels: { title: $('titlePanel'), ask: $('askPanel'), pause: $('pausePanel'), over: $('overPanel') },
    askCategory: $('askCategory'),
    askQuestion: $('askQuestion'),
    askInfo: $('askInfo'),
    overReason: $('overReason'),
    overScore: $('overScore'),
    overWords: $('overWords'),
    overBest: $('overBest'),
    pauseBtn: $('pauseBtn'),
    skipBtn: $('skipBtn'),
    soundBtn: $('soundBtn'),
    speedBtns: [...document.querySelectorAll('[data-speed]')],
  };

  const BANK = QUESTIONS
    .map((item) => ({ ...item, a: item.a.toUpperCase() }))
    .filter((item) => /^[A-Z]{2,9}$/.test(item.a));
  let deck = [];

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function drawQuestion() {
    if (!deck.length) {
      deck = shuffle(BANK.slice());
      // Don't repeat the last question right after a reshuffle.
      if (quiz && deck.length > 1 && deck[deck.length - 1] === quiz) {
        [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      }
    }
    return deck.pop();
  }

  let state = 'title';             // title | ask | playing | paused | over
  let speed = store.get('speed', 'normal');
  if (!SPEEDS[speed]) speed = 'normal';
  let best = store.get('best', 0);

  let snake = [];
  let dir = DIRS.right;
  let dirQueue = [];
  let growth = 0;                  
  let tiles = [];                 
  let quiz = null;
  let filled = [];                 
  let cleanRound = true;           
  let score = 0;
  let words = 0;
  let stepMs = SPEEDS[speed];
  let acc = 0;
  let lastTime = performance.now();
  let freezeUntil = 0;             
  let afterFreeze = null;
  let overReady = false;
  let messageTimer = 0;

  // Effects
  let particles = [];
  let floaters = [];
  let shakeUntil = 0;
  let flash = null;

  const rand = (n) => Math.floor(Math.random() * n);
  const boxes = () => snake.length + growth;

  function freeCells(keepAwayFromHead) {
    const blocked = new Set();
    for (const s of snake) blocked.add(s.y * COLS + s.x);
    for (const t of tiles) blocked.add(t.y * COLS + t.x);
    const head = snake[0];
    const cells = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (blocked.has(y * COLS + x)) continue;
        if (keepAwayFromHead && head && Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue;
        cells.push({ x, y });
      }
    }
    return cells;
  }

  function spawnTile(ch, real) {
    let cells = freeCells(true);
    if (!cells.length) cells = freeCells(false);
    if (!cells.length) return false;
    const cell = cells[rand(cells.length)];
    tiles.push({ x: cell.x, y: cell.y, ch, real, born: performance.now() });
    return true;
  }

  function pickDecoy() {
    const taken = new Set([...quiz.a, ...tiles.filter((t) => !t.real).map((t) => t.ch)]);
    let pool = [...DECOY_POOL].filter((ch) => !taken.has(ch));
    if (!pool.length) pool = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((ch) => !quiz.a.includes(ch));
    return pool[rand(pool.length)];
  }

  function spawnAnswerLetters() {
    for (const ch of quiz.a) {
      if (!spawnTile(ch, true)) {
        gameOver('The board is full. You win!');
        return false;
      }
    }
    return true;
  }

  function newQuestion() {
    quiz = drawQuestion();
    filled = [];
    cleanRound = true;
    tiles = [];
    if (!spawnAnswerLetters()) return;
    for (let i = 0; i < DECOY_COUNT; i++) spawnTile(pickDecoy(), false);
    renderQuiz();
    askQuestion();
  }

  function askQuestion() {
    state = 'ask';
    dirQueue = [];
    ui.askCategory.textContent = quiz.c;
    ui.askQuestion.textContent = quiz.q;
    ui.askInfo.textContent = `${quiz.a.length} LETTERS · REWARD +${quiz.a.length}`;
    say('');
    showPanel('ask');
  }

  function go() {
    if (state !== 'ask') return;
    state = 'playing';
    acc = 0;
    showPanel(null);
    say('Spell the answer!');
  }

  function handleDir(name) {
    if (state === 'playing') {
      queueDir(DIRS[name]);
    } else if (state === 'ask') {
      queueDir(DIRS[name]);
      go();
    }
  }

  function freeze(ms, then) {
    freezeUntil = performance.now() + ms;
    afterFreeze = then;
  }

  function startGame() {
    sfx.unlock();
    const midY = Math.floor(ROWS / 2);
    snake = [];
    for (let i = 0; i < START_LENGTH; i++) snake.push({ x: 5 - i, y: midY });
    dir = DIRS.right;
    dirQueue = [];
    growth = 0;
    score = 0;
    words = 0;
    stepMs = SPEEDS[speed];
    acc = 0;
    freezeUntil = 0;
    afterFreeze = null;
    particles = [];
    floaters = [];
    flash = null;
    overReady = false;
    quiz = null;
    deck = [];
    ui.pauseBtn.textContent = 'PAUSE';
    updateHud();
    sfx.play('start');
    newQuestion();
  }

  function gameOver(reason) {
    state = 'over';
    overReady = false;
    sfx.play('over');
    hit();
    const newBest = score > best;
    if (newBest) {
      best = score;
      store.set('best', best);
    }
    updateHud();
    ui.overReason.textContent = reason;
    ui.overScore.textContent = score;
    ui.overWords.textContent = words;
    ui.overBest.textContent = newBest && score > 0 ? 'NEW BEST SCORE!' : `BEST ${best}`;
    ui.overBest.classList.toggle('good', newBest && score > 0);
    setTimeout(() => {
      if (state !== 'over') return;
      showPanel('over');
      overReady = true;
    }, 700);
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      showPanel('pause');
    } else if (state === 'paused') {
      state = 'playing';
      showPanel(null);
      acc = 0;
    }
    ui.pauseBtn.textContent = state === 'paused' ? 'RESUME' : 'PAUSE';
  }

  function skipQuestion() {
    if (state !== 'playing' || freezeUntil) return;
    sfx.play('skip');
    cleanRound = false;
    say(`SKIPPED! It was ${quiz.a}`, 'bad');
    filled = [...quiz.a];
    renderSlots('reveal');
    tiles = [];
    const head = snake[0];
    if (!loseBox(head.x, head.y)) return;
    freeze(1400, newQuestion);
  }


  function loseBox(gx, gy) {
    if (growth > 0) {
      growth--;
    } else {
      const tail = snake.pop();
      if (tail) burst(tail.x * CELL + CELL / 2, tail.y * CELL + CELL / 2, COLOR.body[0], 14);
    }
    floatText('-1', gx, gy, COLOR.bad);
    hit();
    updateHud();
    if (snake.length === 0) {
      gameOver('You ran out of boxes!');
      return false;
    }
    return true;
  }


  function queueDir(next) {
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if (next === last) return;
    if (next.x === -last.x && next.y === -last.y) return; 
    if (dirQueue.length < 3) dirQueue.push(next);
  }

  function step() {
    if (dirQueue.length) dir = dirQueue.shift();
    const head = snake[0];
    // Going off one edge brings the snake back on the opposite side.
    const nx = (head.x + dir.x + COLS) % COLS;
    const ny = (head.y + dir.y + ROWS) % ROWS;

    const body = growth > 0 ? snake : snake.slice(0, -1);
    if (body.some((s) => s.x === nx && s.y === ny)) {
      gameOver('You bit yourself!');
      return;
    }

    snake.unshift({ x: nx, y: ny });
    if (growth > 0) growth--;
    else snake.pop();

    const i = tiles.findIndex((t) => t.x === nx && t.y === ny);
    if (i >= 0) eat(tiles.splice(i, 1)[0]);
  }

  function eat(tile) {
    const cx = tile.x * CELL + CELL / 2;
    const cy = tile.y * CELL + CELL / 2;

    if (!tile.real) {
      cleanRound = false;
      sfx.play('bad');
      burst(cx, cy, COLOR.bad, 12);
      say(`${tile.ch} is not in the answer! -1 box`, 'bad');
      if (!loseBox(tile.x, tile.y)) return;
      spawnTile(pickDecoy(), false);
      return;
    }

    filled.push(tile.ch);
    sfx.play('letter');
    burst(cx, cy, COLOR.gold, 8);
    renderSlots();
    if (filled.length === quiz.a.length) checkAnswer(tile);
  }

  function checkAnswer(lastTile) {
    const guess = filled.join('');
    const head = snake[0];

    if (guess === quiz.a) {
      const reward = quiz.a.length;
      const bonus = cleanRound ? reward * PERFECT_BONUS_PER_LETTER : 0;
      growth += reward;
      score += reward * POINTS_PER_LETTER + bonus;
      words++;
      stepMs = Math.max(MIN_STEP, stepMs - SPEEDUP_PER_WORD);
      sfx.play('win');
      burst(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, COLOR.good, 26);
      floatText(`+${reward}`, head.x, head.y, COLOR.good);
      flash = { color: COLOR.good, start: performance.now(), dur: 350 };
      say(cleanRound ? `PERFECT! +${reward} boxes +${bonus} bonus` : `CORRECT! +${reward} boxes`, 'good');
      renderSlots('win');
      tiles = [];
      updateHud();
      freeze(1000, newQuestion);
      return;
    }

    cleanRound = false;
    sfx.play('wrong');
    say(`${guess} is wrong! -1 box`, 'bad');
    renderSlots('lose');
    if (!loseBox(lastTile.x, lastTile.y)) return;
    freeze(800, () => {
      filled = [];
      renderSlots();
      spawnAnswerLetters();
    });
  }

  function burst(x, y, color, count) {
    if (reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.75) * 160,
        age: 0,
        life: 0.45 + Math.random() * 0.35,
        size: Math.random() < 0.5 ? 2 : 3,
        color,
      });
    }
  }

  function floatText(text, gx, gy, color) {
    floaters.push({ text, x: gx * CELL + CELL / 2, y: gy * CELL, color, age: 0, life: 1 });
  }

  function hit() {
    if (!reducedMotion) shakeUntil = performance.now() + 220;
    flash = { color: COLOR.bad, start: performance.now(), dur: 300 };
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.age += dt;
      p.vy += 320 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter((p) => p.age < p.life);
    for (const f of floaters) f.age += dt;
    floaters = floaters.filter((f) => f.age < f.life);
  }

  const boardImage = (() => {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const g = off.getContext('2d');
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        g.fillStyle = (x + y) % 2 ? COLOR.boardB : COLOR.boardA;
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    return off;
  })();

  function drawBlock(px, py, size, fill, light, dark, bevel) {
    ctx.fillStyle = COLOR.outline;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = fill;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = light;
    ctx.fillRect(px + 1, py + 1, size - 2, bevel);
    ctx.fillRect(px + 1, py + 1, bevel, size - 2);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 1, py + size - 1 - bevel, size - 2, bevel);
    ctx.fillRect(px + size - 1 - bevel, py + 1, bevel, size - 2);
  }

  function drawTiles(now) {
    for (const t of tiles) {
      const bob = Math.sin(now / 260 + t.x * 3 + t.y) > 0.35 ? -1 : 0;
      const px = t.x * CELL;
      const py = t.y * CELL + bob;
      const fresh = now - t.born < 140;
      drawBlock(px, py, CELL,
        fresh ? COLOR.white : COLOR.tile,
        fresh ? COLOR.white : COLOR.tileLight,
        fresh ? COLOR.white : COLOR.tileDark, 1);
      PixelFont.draw(ctx, t.ch, px + 4, py + 2, 2, COLOR.tileInk);
    }
  }

  function drawSnake() {
    const dead = state === 'over';
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const px = s.x * CELL + 1;
      const py = s.y * CELL + 1;
      if (i === 0) {
        drawBlock(px, py, CELL - 2,
          dead ? COLOR.deadLight : COLOR.head,
          dead ? COLOR.white : COLOR.headLight,
          dead ? COLOR.dead : COLOR.headDark, 2);
      } else {
        drawBlock(px, py, CELL - 2,
          dead ? COLOR.dead : COLOR.body[i % 2],
          dead ? COLOR.deadLight : COLOR.bodyLight,
          dead ? COLOR.deadDark : COLOR.bodyDark, 2);
      }
    }
    const head = snake[0];
    if (!head) return;

    const cx = head.x * CELL + CELL / 2;
    const cy = head.y * CELL + CELL / 2;
    const side = { x: -dir.y, y: dir.x };
    for (const sign of [-1, 1]) {
      const ex = cx + dir.x * 3 + side.x * 4 * sign - 2;
      const ey = cy + dir.y * 3 + side.y * 4 * sign - 2;
      ctx.fillStyle = COLOR.white;
      ctx.fillRect(ex, ey, 4, 4);
      ctx.fillStyle = COLOR.outline;
      if (dead) {
        ctx.fillRect(ex, ey, 1, 1); ctx.fillRect(ex + 3, ey, 1, 1);
        ctx.fillRect(ex + 1, ey + 1, 2, 2);
        ctx.fillRect(ex, ey + 3, 1, 1); ctx.fillRect(ex + 3, ey + 3, 1, 1);
      } else {
        ctx.fillRect(ex + 1 + dir.x, ey + 1 + dir.y, 2, 2);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    for (const f of floaters) {
      const t = f.age / f.life;
      const w = PixelFont.width(f.text, 2);
      const x = Math.min(canvas.width - w - 2, Math.max(2, Math.round(f.x - w / 2)));
      const y = Math.max(2, Math.round(f.y - 8 - t * 22));
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) {
        PixelFont.draw(ctx, f.text, x + ox, y + oy, 2, COLOR.outline);
      }
      PixelFont.draw(ctx, f.text, x, y, 2, f.color);
    }
    ctx.globalAlpha = 1;
  }

  function render(now) {
    ctx.fillStyle = COLOR.outline;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (now < shakeUntil) ctx.translate(rand(5) - 2, rand(5) - 2);
    ctx.drawImage(boardImage, 0, 0);
    drawTiles(now);
    drawSnake();
    drawParticles();
    drawFloaters();
    ctx.restore();

    if (flash) {
      const t = (now - flash.start) / flash.dur;
      if (t >= 1) {
        flash = null;
      } else {
        ctx.globalAlpha = 0.28 * (1 - t);
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
    }
  }

  function showPanel(name) {
    ui.overlay.hidden = !name;
    for (const [key, panel] of Object.entries(ui.panels)) panel.hidden = key !== name;
  }

  function updateHud() {
    ui.score.textContent = score;
    ui.length.textContent = boxes();
    ui.words.textContent = words;
    ui.best.textContent = best;
  }

  function renderQuiz() {
    ui.category.textContent = quiz.c;
    ui.question.textContent = quiz.q;
    ui.reward.textContent = `REWARD +${quiz.a.length}`;
    ui.reward.hidden = false;
    renderSlots();
  }

  function renderSlots(mode) {
    const slots = [...quiz.a].map((_, i) => {
      const slot = document.createElement('span');
      slot.className = 'slot';
      if (filled[i]) slot.classList.add('filled');
      if (mode) slot.classList.add(mode);
      slot.style.setProperty('--i', i);
      slot.textContent = filled[i] || '';
      return slot;
    });
    ui.slots.replaceChildren(...slots);
    ui.slots.setAttribute('aria-label', `${quiz.a.length} letters. Collected: ${filled.join('') || 'none'}`);
  }

  function say(text, kind = '') {
    ui.message.textContent = text;
    ui.message.className = `message ${kind}`;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      if (state === 'playing') {
        ui.message.textContent = '';
        ui.message.className = 'message';
      }
    }, 2600);
  }

  function setSpeed(value) {
    speed = value;
    store.set('speed', speed);
    for (const btn of ui.speedBtns) btn.setAttribute('aria-pressed', String(btn.dataset.speed === speed));
  }

  function updateSoundButton() {
    ui.soundBtn.textContent = sfx.muted ? 'SOUND OFF' : 'SOUND ON';
    ui.soundBtn.setAttribute('aria-pressed', String(!sfx.muted));
  }

  const introText = ui.question.textContent;

  function showIntro() {
    ui.category.textContent = 'READY';
    ui.question.textContent = introText;
    ui.reward.hidden = true;
    ui.slots.replaceChildren();
    ui.message.textContent = '';
  }

  function setupTitleBoard() {
    const midY = Math.floor(ROWS / 2);
    snake = [];
    for (let i = 0; i < 5; i++) snake.push({ x: 8 - i, y: midY + 3 });
    dir = DIRS.right;
    tiles = [...'WORD'].map((ch, i) => ({ x: 11 + i * 2, y: midY + 3, ch, real: true, born: 0 }));
  }

  document.addEventListener('keydown', (e) => {
    const dirName = KEY_DIRS[e.code];
    if (dirName) {
      e.preventDefault();
      if (!e.repeat || state === 'playing') handleDir(dirName);
      return;
    }
    if (e.repeat) return;
    const onButton = e.target instanceof Element && e.target.closest('button');
    const canStart = state === 'title' || (state === 'over' && overReady);

    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        if (onButton) return;
        if (canStart) { e.preventDefault(); startGame(); } else if (state === 'ask') go();
        else if (state === 'paused') togglePause();
        break;
      case 'Space':
        if (onButton) return;
        e.preventDefault();
        if (state === 'ask') go();
        else if (state === 'playing' || state === 'paused') togglePause();
        else if (canStart) startGame();
        break;
      case 'KeyP':
      case 'Escape':
        if (state === 'playing' || state === 'paused') togglePause();
        break;
      case 'KeyN':
        skipQuestion();
        break;
      case 'KeyM':
        sfx.toggle();
        updateSoundButton();
        break;
    }
  });

  $('goBtn').addEventListener('click', (e) => { e.currentTarget.blur(); go(); });

  for (const btn of ui.speedBtns) btn.addEventListener('click', () => setSpeed(btn.dataset.speed));

  $('startBtn').addEventListener('click', (e) => { e.currentTarget.blur(); startGame(); });
  $('againBtn').addEventListener('click', (e) => { e.currentTarget.blur(); startGame(); });
  $('resumeBtn').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  $('menuBtn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    state = 'title';
    freezeUntil = 0;
    afterFreeze = null;
    ui.pauseBtn.textContent = 'PAUSE';
    setupTitleBoard();
    showIntro();
    showPanel('title');
  });
  ui.pauseBtn.addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  ui.skipBtn.addEventListener('click', (e) => { e.currentTarget.blur(); skipQuestion(); });
  ui.soundBtn.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.toggle();
    updateSoundButton();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
  });

  function frame(now) {
    const dt = Math.min(250, now - lastTime);
    lastTime = now;

    if (state === 'playing') {
      if (freezeUntil) {
        if (now >= freezeUntil) {
          freezeUntil = 0;
          acc = 0;
          const then = afterFreeze;
          afterFreeze = null;
          if (then) then();
        }
      } else {
        acc += dt;
        while (acc >= stepMs && state === 'playing' && !freezeUntil) {
          acc -= stepMs;
          step();
        }
      }
    }

    updateEffects(dt / 1000);
    render(now);
    requestAnimationFrame(frame);
  }

  setSpeed(speed);
  updateSoundButton();
  setupTitleBoard();
  updateHud();
  ui.length.textContent = START_LENGTH;
  showPanel('title');
  requestAnimationFrame(frame);
})();
