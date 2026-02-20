// ═══════════════════════════════════════════════════════
//  game.js — Arabic Game Show — Full Engine
// ═══════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────
let players = [];
let targetScore = 10;
let roundNum = 0;
let gameTypeQueue = [];
let currentType = '';
let currentAnswer = '';   // correct answer string
let currentItem = null; // full data object
let answerRevealed = false;

// Buzzer
let buzzerOpen = false;
let buzzedIdx = -1;
let answerTimer = null;
let answerSec = 5;

// Drawing
let drawingPhase = false;
let drawingWord = '';
let drawingData = [];    // saved dataURLs per player
let drawingVotes = [];    // vote count per player
let currentDrawer = 0;
let currentVoter = 0;
let drawingTimer = null;
let drawingSec = 30;
let isDrawing = false;
let lastX = 0, lastY = 0;
let currentColor = '#1a1a1a';
let currentBrush = 6;
let eraserOn = false;
let drawCanvas, drawCtx;

// Used-up tracking
let usedReversed = [], usedFlags = [], usedTrivia = [], usedDrawing = [];

const GAME_TYPES = ['reversed', 'flag', 'trivia', 'drawing'];
const TYPE_NAMES = { reversed: '🔤 الكلمات المعكوسة', flag: '🚩 خمّن العلم', trivia: '🧠 سؤال وجواب', drawing: '🎨 تحدي الرسم' };

// ── DOM HELPERS ────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id) && $(id).classList.remove('hidden');
const hide = id => $(id) && $(id).classList.add('hidden');
const showScreen = id => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
};

// ── INIT ──────────────────────────────────────────────
function initLobby() {
    const icons = ['🦁', '🐯', '🦊', '🐺', '🐻', '🦋', '🦅', '🐬'];
    $('players-grid').innerHTML = icons.map((ic, i) => `
    <div class="player-input-wrap">
      <label>${ic} اللاعب ${i + 1}</label>
      <input class="player-input" id="p${i}" type="text"
        placeholder="اسم اللاعب ${i + 1}" maxlength="14"/>
    </div>`).join('');
}

function castVote(btn) {
    document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    targetScore = +btn.dataset.score;
    $('vote-info').innerHTML = `📊 الهدف الحالي: <strong>${targetScore}</strong> نقاط`;
}

// ── START ──────────────────────────────────────────────
function startGame() {
    players = [];
    for (let i = 0; i < 8; i++) {
        const nm = $(`p${i}`).value.trim();
        if (nm) players.push({ name: nm, score: 0 }); // only add players who entered a name
    }
    if (players.length === 0) { alert('يجب إدخال اسم لاعب واحد على الأقل!'); return; }
    usedReversed = []; usedFlags = []; usedTrivia = []; usedDrawing = []; gameTypeQueue = [];
    roundNum = 0;
    $('target-disp').textContent = targetScore;
    showScreen('screen-game');
    buildScoreboard();
    initCanvasIfNeeded();
    startCountdown(() => nextRound());
}

// ── CANVAS INIT ────────────────────────────────────────
function initCanvasIfNeeded() {
    if (drawCtx) return;
    drawCanvas = $('draw-canvas');
    drawCtx = drawCanvas.getContext('2d');
    clearCanvas();
    ['mousedown', 'touchstart'].forEach(ev => drawCanvas.addEventListener(ev, onDrawStart, { passive: false }));
    ['mousemove', 'touchmove'].forEach(ev => drawCanvas.addEventListener(ev, onDrawMove, { passive: false }));
    ['mouseup', 'mouseleave', 'touchend'].forEach(ev => drawCanvas.addEventListener(ev, onDrawEnd));
    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentColor = btn.dataset.color;
            eraserOn = false;
            $('eraser-btn').classList.remove('active-tool');
        });
    });
}

// ── SCOREBOARD ─────────────────────────────────────────
function buildScoreboard() {
    const maxS = Math.max(...players.map(p => p.score));
    $('scoreboard').innerHTML = players.map((p, i) => `
    <div class="score-card${p.score === maxS && p.score > 0 ? ' leading' : ''}" id="sc-${i}">
      <div class="score-name">${p.name}</div>
      <div class="score-pts${p.score < 0 ? ' neg' : ''}">${p.score}</div>
    </div>`).join('');
}

// ── ROUND ──────────────────────────────────────────────
function nextRound() {
    roundNum++;
    answerRevealed = false;
    buzzedIdx = -1;
    buzzerOpen = false;
    stopAnswerTimer();

    if (!gameTypeQueue.length) gameTypeQueue = shuffleArr([...GAME_TYPES]);
    currentType = gameTypeQueue.shift();

    $('round-pill').textContent = `الجولة ${toAra(roundNum)}`;
    $('type-pill').textContent = TYPE_NAMES[currentType];

    // Hide all panels & reveals
    ['panel-reversed', 'panel-flag', 'panel-trivia', 'panel-drawing', 'panel-voting'].forEach(id => {
        $(id).classList.add('hidden');
        $(id).querySelectorAll('.reveal-box').forEach(r => r.classList.add('hidden'));
    });
    hide('answer-section');
    hide('buzzers-section');
    hide('btn-next');
    show('btn-reveal');

    loadQuestion();
    setHost(pick(HOST_INTRO).replace('{type}', TYPE_NAMES[currentType]));
}

// ── LOAD QUESTION ──────────────────────────────────────
function loadQuestion() {
    if (currentType === 'reversed') {
        currentItem = pickUnused(REVERSED_WORDS, usedReversed);
        currentAnswer = currentItem.answer;
        show('panel-reversed');
        hide('btn-repeat');
        animateReversed(currentItem.reversed);
        showBuzzers();
    }
    else if (currentType === 'flag') {
        currentItem = pickUnused(FLAGS, usedFlags);
        currentAnswer = currentItem.name;
        $('flag-img').src = `https://flagcdn.com/w320/${currentItem.code}.png`;
        $('flag-img').alt = '؟';
        show('panel-flag');
        showBuzzers();
        // Override host with context-specific instruction
        setHost('🚩 ما هذا العلم؟ اضغط بازرك ثم اكتب اسم الدولة بالعربي أو الإنجليزي!');
    }
    else if (currentType === 'trivia') {
        currentItem = pickUnused(TRIVIA, usedTrivia);
        currentAnswer = currentItem.a;
        $('trivia-q').textContent = currentItem.q;
        show('panel-trivia');
        showBuzzers();
    }
    else if (currentType === 'drawing') {
        startDrawingChallenge();
    }
}

// ══════════════════════════════════════════════════════
//  REVERSED WORDS
// ══════════════════════════════════════════════════════
let revAnimTimeout = null;

function animateReversed(word) {
    const container = $('rev-letters');
    container.innerHTML = '';
    const letters = [...word]; // split correctly for Arabic characters
    letters.forEach(() => {
        const span = document.createElement('span');
        span.className = 'rev-letter';
        span.textContent = '';
        container.appendChild(span);
    });

    let i = 0;
    function showNext() {
        if (i < letters.length) {
            container.children[i].textContent = letters[i];
            container.children[i].classList.add('show');
            i++;
            revAnimTimeout = setTimeout(showNext, 230);
        } else {
            // Animation done — show repeat button
            show('btn-repeat');
        }
    }
    showNext();
}

function replayAnimation() {
    if (!currentItem) return;
    hide('btn-repeat');
    animateReversed(currentItem.reversed);
}

// ══════════════════════════════════════════════════════
//  BUZZERS
// ══════════════════════════════════════════════════════
function showBuzzers() {
    const grid = $('buzzers-grid');
    grid.innerHTML = '';
    players.forEach((p, i) => {
        const btn = document.createElement('button');
        btn.className = 'buzzer-btn';
        btn.id = `buzz-${i}`;
        btn.innerHTML = `<div class="buzzer-circle">🔔</div><span class="buzzer-name">${p.name}</span>`;
        btn.onclick = () => onBuzzer(i);
        grid.appendChild(btn);
    });
    show('buzzers-section');
}

function onBuzzer(idx) {
    if (buzzerOpen || answerRevealed) return;
    buzzerOpen = true;
    buzzedIdx = idx;

    // Mark buzzer
    document.querySelectorAll('.buzzer-btn').forEach((b, i) => {
        b.disabled = true;
        if (i === idx) b.querySelector('.buzzer-circle').classList.add('buzzed-ring');
    });

    // Set game-specific placeholder
    const placeholders = {
        reversed: 'اكتب الكلمة الصحيحة...',
        flag: 'اكتب اسم الدولة عربي أو إنجليزي...',
        trivia: 'اكتب الإجابة هنا...',
        drawing: 'اكتب اسم الرسمة...',
    };
    $('answer-input').placeholder = placeholders[currentType] || 'اكتب الإجابة...';
    $('answer-input').value = '';
    $('answer-input').removeAttribute('disabled');

    // Set answering player label
    $('answering-player').textContent = `🔔 ${players[idx].name} — لديك 5 ثواني!`;
    show('answer-section');

    // Scroll to the answer input so it's visible
    setTimeout(() => {
        $('answer-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('answer-input').focus();
    }, 80);

    startAnswerTimer();
    setHost(`🔔 ${players[idx].name} اضغط البازر وأجب على السؤال!`);
}

// ── ANSWER TIMER ───────────────────────────────────────
function startAnswerTimer() {
    answerSec = 5;
    updateAnswerTimerUI(5);
    const circ = 2 * Math.PI * 44;
    $('answer-ring-circle').style.strokeDasharray = circ;
    $('answer-ring-circle').style.strokeDashoffset = 0;

    answerTimer = setInterval(() => {
        answerSec--;
        updateAnswerTimerUI(answerSec);
        const frac = answerSec / 5;
        $('answer-ring-circle').style.strokeDashoffset = circ * (1 - frac);
        if (answerSec <= 2) $('answer-ring-circle').classList.add('danger');
        if (answerSec <= 0) {
            stopAnswerTimer();
            timeoutAnswer();
        }
    }, 1000);
}

function updateAnswerTimerUI(sec) {
    $('answer-timer-num').textContent = sec;
}

function stopAnswerTimer() {
    clearInterval(answerTimer);
    answerTimer = null;
    if ($('answer-ring-circle')) $('answer-ring-circle').classList.remove('danger');
}

function timeoutAnswer() {
    // Time ran out
    $('answer-input').disabled = true;
    players[buzzedIdx].score -= 1;
    buildScoreboard();
    showAIResult(false, 'انتهى الوقت! ❌');
    setHost(pick(HOST_TIMEOUT).replace('{player}', players[buzzedIdx].name));
    if (checkWin()) return;
    reopenBuzzers();
}

// ── SUBMIT ANSWER ──────────────────────────────────────
function submitAnswer() {
    stopAnswerTimer();
    const raw = $('answer-input').value.trim();
    $('answer-input').disabled = true;

    // Check correctness
    const correct = checkAnswer(raw, currentItem);
    if (correct) {
        players[buzzedIdx].score += 1;
        buildScoreboard();
        showAIResult(true, '✅ إجابة صحيحة!');
        setHost(pick(HOST_CORRECT).replace('{player}', players[buzzedIdx].name));
        if (checkWin()) return;
        // Auto reveal after correct
        setTimeout(() => {
            hideAIResult();
            revealAnswer();
        }, 1800);
    } else {
        players[buzzedIdx].score -= 1;
        buildScoreboard();
        showAIResult(false, '❌ إجابة خاطئة!');
        setHost(pick(HOST_WRONG).replace('{player}', players[buzzedIdx].name));
        if (checkWin()) return;
        setTimeout(() => {
            hideAIResult();
            reopenBuzzers();
        }, 1600);
    }
}

function reopenBuzzers() {
    const lastBuzzed = buzzedIdx;
    buzzerOpen = false;
    buzzedIdx = -1;
    hide('answer-section');
    document.querySelectorAll('.buzzer-btn').forEach((b, i) => {
        b.disabled = false;
        b.querySelector('.buzzer-circle').classList.remove('buzzed-ring');
        // Disable the player who was wrong — only they can't re-buzz
        if (i === lastBuzzed) b.disabled = true;
    });
}

// ── ARABIC ANSWER CHECKING ─────────────────────────────
function normalizeAr(s) {
    if (!s) return '';
    return s
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F\u0670]/g, '') // tashkeel
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function checkAnswer(input, item) {
    if (!input) return false;
    const ni = normalizeAr(input);
    const nc = normalizeAr(currentAnswer);
    if (ni === nc) return true;
    if (nc.includes(ni) || ni.includes(nc)) return true;
    // Check alt answers
    const alts = item.alt || item.alternatives || [];
    for (const alt of alts) {
        const na = normalizeAr(alt);
        if (ni === na || na.includes(ni) || ni.includes(na)) return true;
    }
    // Levenshtein for longer words
    if (nc.length > 3 && levenshtein(ni, nc) <= Math.max(1, Math.floor(nc.length * 0.25))) return true;
    return false;
}

function levenshtein(a, b) {
    const m = [...Array(b.length + 1)].map((_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const val = a[i - 1] === b[j - 1] ? m[j - 1] : 1 + Math.min(prev, m[j], m[j - 1]);
            m[j - 1] = prev; prev = val;
        }
        m[b.length] = prev;
    }
    return m[b.length];
}

// ── AI RESULT OVERLAY ──────────────────────────────────
function showAIResult(correct, msg) {
    $('ai-result-icon').textContent = correct ? '✅' : '❌';
    $('ai-result-text').textContent = msg;
    $('ai-result-box').style.color = correct ? '#22c55e' : '#ef4444';
    show('ai-result-overlay');
}
function hideAIResult() { hide('ai-result-overlay'); }

// ── REVEAL ANSWER (called by 👁 button in HTML) ────────
function revealAnswer() {
    if (currentType === 'drawing') return; // drawing has its own flow
    answerRevealed = true;
    stopAnswerTimer();
    hide('answer-section');
    hide('buzzers-section');
    document.querySelectorAll('.buzzer-btn').forEach(b => {
        b.disabled = true;
        b.querySelector('.buzzer-circle')?.classList.remove('buzzed-ring');
    });
    setHost(pick(HOST_REVEAL));

    if (currentType === 'reversed') { $('rev-answer').textContent = currentAnswer; show('rev-reveal'); }
    if (currentType === 'flag') { $('flag-answer').textContent = currentAnswer; show('flag-reveal'); }
    if (currentType === 'trivia') { $('trivia-answer').textContent = currentAnswer; show('trivia-reveal'); }

    show('btn-next');
    hide('btn-reveal');
    $('controls-bar').style.display = '';
}

// ══════════════════════════════════════════════════════
//  DRAWING CHALLENGE
// ══════════════════════════════════════════════════════
function startDrawingChallenge() {
    const item = pickUnused(DRAWING, usedDrawing);
    drawingWord = item;
    currentAnswer = drawingWord;
    drawingData = Array(players.length).fill(null);
    drawingVotes = Array(players.length).fill(0);
    currentDrawer = 0;
    hide('buzzers-section');
    hide('btn-reveal');
    hide('btn-next');
    // If solo player, auto-award after drawing (no point to vote)
    if (players.length === 1) {
        setHost(`🎨 ارسم: "${drawingWord}" في 30 ثانية!`);
    }
    showDrawerTurn(currentDrawer);
}

function showDrawerTurn(idx) {
    show('panel-drawing');
    $('drawer-name').textContent = players[idx].name;
    $('draw-word-label').textContent = drawingWord;
    clearCanvas();
    startDrawingTimer();
}

function startDrawingTimer() {
    drawingSec = 30;
    updateDrawTimerUI(30);
    const circ = 2 * Math.PI * 34;
    $('draw-ring-circle').style.strokeDasharray = circ;
    $('draw-ring-circle').style.strokeDashoffset = 0;
    drawingTimer = setInterval(() => {
        drawingSec--;
        updateDrawTimerUI(drawingSec);
        const frac = drawingSec / 30;
        $('draw-ring-circle').style.strokeDashoffset = circ * (1 - frac);
        if (drawingSec <= 8) $('draw-ring-circle').classList.add('danger');
        if (drawingSec <= 0) { clearInterval(drawingTimer); submitDrawing(); }
    }, 1000);
}

function updateDrawTimerUI(sec) { $('draw-timer-num').textContent = sec; }

function submitDrawing() {
    clearInterval(drawingTimer);
    $('draw-ring-circle').classList.remove('danger');
    drawingData[currentDrawer] = drawCanvas.toDataURL('image/png');
    currentDrawer++;
    if (currentDrawer < players.length) {
        setHost(`👏 رسم ${players[currentDrawer - 1].name}! الآن دور ${players[currentDrawer].name}`);
        setTimeout(() => showDrawerTurn(currentDrawer), 800);
    } else if (players.length === 1) {
        // Solo mode — no voting, just give a point and move on
        players[0].score += 1;
        buildScoreboard();
        setHost('🎨 أحسنت! +1 نقطة على الرسمة الحلوة 😄');
        hide('panel-drawing');
        if (checkWin()) return;
        show('btn-next');
        hide('btn-reveal');
    } else {
        // All drawn — go to voting
        setHost('🗳️ الكل رسم! حان وقت التصويت لأفضل رسمة!');
        setTimeout(() => startVotingPhase(), 600);
    }
}

// ── VOTING ─────────────────────────────────────────────
function startVotingPhase() {
    hide('panel-drawing');
    currentVoter = 0;
    buildVotingGallery();
    show('panel-voting');
    hide('btn-reveal');
    hide('btn-next');
    nextVoter();
}

function buildVotingGallery() {
    const gallery = $('drawings-gallery');
    gallery.innerHTML = '';
    players.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'drawing-card';
        card.id = `dcard-${i}`;
        card.innerHTML = `
      <img class="drawing-canvas-thumb" src="${drawingData[i] || ''}" alt="رسمة"/>
      <div class="drawing-card-footer">
        <div class="drawing-artist hidden" id="dartist-${i}">🎨 ${p.name}</div>
        <div class="drawing-votes" id="dvotes-${i}">0 صوت</div>
        <button class="btn-vote" id="dvote-btn-${i}" onclick="castvoteForDrawing(${i})">صوّت</button>
      </div>`;
        gallery.appendChild(card);
    });
}

function nextVoter() {
    if (currentVoter >= players.length) { endVoting(); return; }
    $('voter-name').textContent = players[currentVoter].name;
    $('vote-progress').textContent = `التصويت ${currentVoter + 1} من ${players.length}`;
    // Re-enable all buttons, disable own card
    players.forEach((_, i) => {
        const btn = $(`dvote-btn-${i}`);
        if (!btn) return;
        btn.disabled = (i === currentVoter);
        btn.textContent = 'صوّت';
        btn.classList.remove('voted');
    });
    setHost(`${players[currentVoter].name} — اختر أفضل رسمة! (لا تختر رسمتك 😄)`);
}

function castvoteForDrawing(targetIdx) {
    if (targetIdx === currentVoter) return; // can't vote self
    drawingVotes[targetIdx]++;
    $(`dvotes-${targetIdx}`).textContent = `${drawingVotes[targetIdx]} صوت`;
    const btn = $(`dvote-btn-${targetIdx}`);
    btn.classList.add('voted');
    btn.textContent = '✅';
    // Disable all vote buttons
    players.forEach((_, i) => { const b = $(`dvote-btn-${i}`); if (b) b.disabled = true; });
    currentVoter++;
    setTimeout(nextVoter, 700);
}

function endVoting() {
    // Reveal all artist names now that voting is done
    players.forEach((_, i) => show(`dartist-${i}`));

    // Find winner(s)
    const maxVotes = Math.max(...drawingVotes);
    const winners = drawingVotes.map((v, i) => ({ v, i })).filter(x => x.v === maxVotes);
    if (maxVotes === 0) {
        setHost('🤝 لا أحد صوّت — تعادل! لا نقاط لهذه الجولة.');
    } else {
        winners.forEach(w => { players[w.i].score += 1; });
        const wNames = winners.map(w => players[w.i].name).join(' و ');
        setHost(`🎨 الفائز في الرسم: ${wNames}! +1 نقطة! 🏆`);
    }
    buildScoreboard();
    if (checkWin()) return;
    hide('btn-reveal');
    show('btn-next');
    $('vote-progress').textContent = '🏁 انتهى التصويت! شوفوا مين رسم إيه!';
}

// ══════════════════════════════════════════════════════
//  CANVAS DRAWING
// ══════════════════════════════════════════════════════
function getPos(e) {
    const r = drawCanvas.getBoundingClientRect();
    const sx = drawCanvas.width / r.width, sy = drawCanvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
}
function onDrawStart(e) {
    e.preventDefault();
    isDrawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    drawCtx.beginPath();
    drawCtx.arc(p.x, p.y, (eraserOn ? currentBrush * 2 : currentBrush) / 2, 0, Math.PI * 2);
    drawCtx.fillStyle = eraserOn ? '#ffffff' : currentColor;
    drawCtx.fill();
}
function onDrawMove(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const p = getPos(e);
    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
    drawCtx.lineTo(p.x, p.y);
    drawCtx.strokeStyle = eraserOn ? '#ffffff' : currentColor;
    drawCtx.lineWidth = eraserOn ? currentBrush * 2 : currentBrush;
    drawCtx.lineCap = drawCtx.lineJoin = 'round';
    drawCtx.stroke();
    lastX = p.x; lastY = p.y;
}
function onDrawEnd() { isDrawing = false; }

function clearCanvas() {
    if (!drawCtx) return;
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
}
function setBrushSize(sz) {
    currentBrush = sz;
    document.querySelectorAll('.size-btn').forEach(b => { b.classList.toggle('active', +b.dataset.size === sz); });
}
function toggleEraser() {
    eraserOn = !eraserOn;
    $('eraser-btn').classList.toggle('active-tool', eraserOn);
}

// ══════════════════════════════════════════════════════
//  WIN CHECK
// ══════════════════════════════════════════════════════
function checkWin() {
    const winner = players.find(p => p.score >= targetScore);
    if (!winner) return false;
    setTimeout(() => showWinner(winner), 700);
    return true;
}

function showWinner(w) {
    $('win-name').textContent = w.name;
    $('win-score').textContent = `${w.score} نقطة`;
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const medals = ['🥇', '🥈', '🥉'];
    $('win-leaderboard').innerHTML = sorted.map((p, i) => `
    <div class="lb-row">
      <span><span class="lb-rank">${medals[i] || i + 1 + '.'}</span>${p.name}</span>
      <span class="lb-pts ${p.score < 0 ? 'neg' : 'pos'}">${p.score} نقطة</span>
    </div>`).join('');
    showScreen('screen-winner');
    launchConfetti();
}

function restartGame() { showScreen('screen-lobby'); $('confetti-wrap').innerHTML = ''; }

// ══════════════════════════════════════════════════════
//  COUNTDOWN + SCOREBOARD + HOST + UTILS
// ══════════════════════════════════════════════════════
function startCountdown(cb) {
    const overlay = $('countdown-overlay'), num = $('countdown-num');
    overlay.classList.remove('hidden');
    let c = 3; num.textContent = c;
    const iv = setInterval(() => {
        c--;
        if (c <= 0) { clearInterval(iv); overlay.classList.add('hidden'); cb(); }
        else { num.textContent = c; num.style.animation = 'none'; void num.offsetHeight; num.style.animation = 'count-pop .9s ease'; }
    }, 900);
}

function setHost(txt) {
    const el = $('host-bubble');
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = txt; el.style.opacity = '1'; }, 160);
}

function showPointPopup(txt, pos) {
    const el = $('point-popup');
    el.textContent = txt; el.style.color = pos ? '#22c55e' : '#ef4444';
    el.classList.remove('show'); void el.offsetHeight; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 900);
}

function launchConfetti() {
    const wrap = $('confetti-wrap'); wrap.innerHTML = '';
    const colors = ['#f5c518', '#7c3aed', '#ef4444', '#22c55e', '#3b82f6', '#f97316'];
    for (let i = 0; i < 90; i++) {
        const el = document.createElement('div'); el.className = 'confetti-piece';
        el.style.cssText = `left:${Math.random() * 100}vw;background:${colors[~~(Math.random() * colors.length)]};animation-duration:${2 + Math.random() * 3}s;animation-delay:${Math.random() * 1.5}s;transform:rotate(${Math.random() * 360}deg);width:${8 + Math.random() * 8}px;height:${10 + Math.random() * 10}px`;
        wrap.appendChild(el);
    }
}

// Utilities
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = ~~(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(arr) { return arr[~~(Math.random() * arr.length)]; }
function toAra(n) { return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }
function pickUnused(arr, used) {
    const avail = arr.map((_, i) => i).filter(i => !used.includes(i));
    if (!avail.length) { used.length = 0; return pickUnused(arr, used); }
    const i = avail[~~(Math.random() * avail.length)];
    used.push(i);
    return arr[i];
}

// ── BOOT ───────────────────────────────────────────────
initLobby();
