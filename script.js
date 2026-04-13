/* ═══════════════════════════════════════════════════════
   DESSERT RUN WITCH — script.js
   완성형 쿠키런 스타일 게임
═══════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════
// 1. DOM 참조
// ══════════════════════════════════════
const startScreen   = document.getElementById('startScreen');
const gameScreen    = document.getElementById('gameScreen');
const gameoverScreen= document.getElementById('gameoverScreen');
const startBtn      = document.getElementById('startBtn');
const retryBtn      = document.getElementById('retryBtn');
const homeBtn       = document.getElementById('homeBtn');

const bgCanvas      = document.getElementById('bgCanvas');
const fxCanvas      = document.getElementById('fxCanvas');
const playerCanvas  = document.getElementById('playerCanvas');
const chaserCanvas  = document.getElementById('chaserCanvas');
const bgCtx         = bgCanvas.getContext('2d');
const fxCtx         = fxCanvas.getContext('2d');
const pCtx          = playerCanvas.getContext('2d');
const cCtx          = chaserCanvas.getContext('2d');

const scoreEl       = document.getElementById('score');
const coinsEl       = document.getElementById('coins');
const bestEl        = document.getElementById('best');
const itemDisplayEl = document.getElementById('itemDisplay');
const objectsEl     = document.getElementById('objects');
const hitOverlay    = document.getElementById('hitOverlay');
const groundScroll  = document.getElementById('groundScroll');

const startBestEl   = document.getElementById('startBest');
const goScoreEl     = document.getElementById('goScore');
const goCoinsEl     = document.getElementById('goCoins');
const goBestEl      = document.getElementById('goBest');
const newRecordEl   = document.getElementById('newRecord');

// ══════════════════════════════════════
// 2. 게임 상태
// ══════════════════════════════════════
let W = window.innerWidth;
let H = window.innerHeight;

const LANE_COUNT   = 3;
const GROUND_H     = 80;
const PLAYER_W     = 64;
const PLAYER_H     = 80;
const CHASER_W     = 72;
const PLAYER_BOTTOM_BASE = GROUND_H;

let lane = 1;
let score = 0;
let sessionCoins = 0;
let totalCoins   = parseInt(localStorage.getItem('coins')) || 0;
let best         = parseInt(localStorage.getItem('best')) || 0;

let speed       = 5;
let maxSpeed    = 18;
let startTime   = 0;
let gameRunning = false;
let animFrame   = null;
let lastSpawn   = 0;
let spawnInterval = 900;

// 플레이어 물리
let playerBottom = PLAYER_BOTTOM_BASE;
let playerVelY   = 0;
let isGrounded   = true;
let isSliding    = false;
let slideTimer   = 0;
let jumpCount    = 0;
const MAX_JUMP   = 2;

// 추격자
let chaseLevel = 0;
let chaserX    = 0;
let chaserVisible = false;
let chaserPulse = 0;

// 아이템
const activeItems = {};

// 파티클
const particles = [];
const textPops  = [];

// 배경 오브젝트
const bgObjs = [];

// 게임 오브젝트
const objs = [];

// 애니메이션
let playerFrame  = 0;
let playerFrameTimer = 0;
let playerHit    = false;
let playerHitTimer = 0;
let chaserFrame  = 0;
let chaserFrameTimer = 0;

// ══════════════════════════════════════
// 3. 사운드 (Web Audio API)
// ══════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, vol = 0.3, fadeOut = true) {
  try {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e){}
}

function playChord(freqs, type, duration, vol = 0.2) {
  freqs.forEach(f => playTone(f, type, duration, vol / freqs.length));
}

const SFX = {
  jump() {
    playTone(320, 'sine', 0.12, 0.25);
    playTone(480, 'sine', 0.1, 0.15);
  },
  doubleJump() {
    playTone(480, 'sine', 0.08, 0.2);
    playTone(640, 'sine', 0.12, 0.15);
  },
  coin() {
    playTone(880, 'sine', 0.07, 0.2);
    setTimeout(() => playTone(1100, 'sine', 0.07, 0.2), 60);
  },
  hit() {
    playTone(150, 'sawtooth', 0.25, 0.4);
    playTone(100, 'square', 0.2, 0.3);
  },
  gameover() {
    [400, 350, 300, 220].forEach((f,i) =>
      setTimeout(() => playTone(f, 'sawtooth', 0.3, 0.35), i * 120)
    );
  },
  itemPickup() {
    playChord([523, 659, 784], 'sine', 0.4, 0.4);
  },
  slide() {
    playTone(200, 'sine', 0.15, 0.2);
    playTone(180, 'sine', 0.12, 0.15);
  },
  land() {
    playTone(160, 'sine', 0.08, 0.15);
  }
};

// ══════════════════════════════════════
// 4. 캔버스 크기 설정
// ══════════════════════════════════════
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  bgCanvas.width = fxCanvas.width = W;
  bgCanvas.height = fxCanvas.height = H;
  updatePlayerPos();
}
window.addEventListener('resize', resize);

// ══════════════════════════════════════
// 5. 레인 계산
// ══════════════════════════════════════
function laneX(l) {
  return (W / LANE_COUNT) * (l + 0.5);
}

// ══════════════════════════════════════
// 6. 플레이어 그리기 (Canvas Sprite)
// ══════════════════════════════════════
function drawPlayer() {
  const ctx = pCtx;
  const w = PLAYER_W, h = PLAYER_H;
  ctx.clearRect(0, 0, w, h);

  const hit = playerHit;
  const sliding = isSliding;

  // ── 그림자 ──
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(w/2, h - 4, 20, 6, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  if (sliding) {
    // 슬라이드 자세
    ctx.save();
    ctx.translate(w/2, h - 8);

    // 몸통 (납작)
    const bodyGrad = ctx.createLinearGradient(-22, -18, 22, 18);
    bodyGrad.addColorStop(0, hit ? '#ff5555' : '#ffcc99');
    bodyGrad.addColorStop(1, hit ? '#cc0000' : '#ff9966');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-22, -18, 44, 22, 8);
    ctx.fill();

    // 모자 (옆으로 기울어짐)
    ctx.fillStyle = hit ? '#cc0000' : '#9b30ff';
    ctx.save();
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.lineTo(-10, -38);
    ctx.lineTo(10, -38);
    ctx.lineTo(14, -18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(w/2, h - 4);

    // 다리 (달리는 애니메이션)
    const legOff = Math.sin(playerFrame * 0.8) * 8;
    ctx.fillStyle = '#ff6eb4';
    // 왼쪽 다리
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-12 + legOff, -14, 10, 14, 4);
    ctx.fill();
    ctx.restore();
    // 오른쪽 다리
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(2 - legOff, -14, 10, 14, 4);
    ctx.fill();
    ctx.restore();

    // 몸통
    const bodyGrad = ctx.createLinearGradient(-20, -52, 20, 0);
    bodyGrad.addColorStop(0, hit ? '#ff7777' : '#ffcc99');
    bodyGrad.addColorStop(1, hit ? '#dd2222' : '#ff9966');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-20, -54, 40, 42, 12);
    ctx.fill();

    // 쿠키 무늬 (점)
    ctx.fillStyle = hit ? 'rgba(255,100,100,0.5)' : 'rgba(180,90,30,0.4)';
    [[-8,-42],[6,-38],[-4,-28],[8,-28]].forEach(([dx,dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, 3.5, 0, Math.PI*2);
      ctx.fill();
    });

    // 팔 (흔들리는)
    const armOff = Math.sin(playerFrame * 0.8 + Math.PI) * 8;
    ctx.fillStyle = hit ? '#ff7777' : '#ffcc99';
    // 왼팔
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-30, -48 + armOff, 12, 22, 5);
    ctx.fill();
    ctx.restore();
    // 오른팔
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(18, -48 - armOff, 12, 22, 5);
    ctx.fill();
    ctx.restore();

    // 머리
    const headGrad = ctx.createRadialGradient(-4, -70, 2, 0, -66, 20);
    headGrad.addColorStop(0, hit ? '#ffaaaa' : '#ffddb3');
    headGrad.addColorStop(1, hit ? '#ff6666' : '#ffaa77');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, -66, 20, 0, Math.PI*2);
    ctx.fill();

    // 눈
    const blinkOpen = (Math.floor(playerFrame / 30) % 5 !== 0);
    ctx.fillStyle = '#1a0030';
    if (blinkOpen) {
      ctx.beginPath(); ctx.ellipse(-7, -68, 4, 5, -0.2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7, -68, 4, 5, 0.2, 0, Math.PI*2); ctx.fill();
      // 눈 하이라이트
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(-5, -70, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(9, -70, 1.5, 0, Math.PI*2); ctx.fill();
    } else {
      // 눈 깜빡임
      ctx.fillStyle = '#1a0030';
      ctx.beginPath(); ctx.roundRect(-11, -68, 8, 3, 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(3, -68, 8, 3, 2); ctx.fill();
    }

    // 볼터치
    ctx.fillStyle = 'rgba(255,100,100,0.35)';
    ctx.beginPath(); ctx.ellipse(-12, -62, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -62, 6, 4, 0, 0, Math.PI*2); ctx.fill();

    // 입
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -58, 7, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // 마녀 모자
    // 챙
    ctx.fillStyle = hit ? '#660099' : '#6a1fa0';
    ctx.beginPath();
    ctx.ellipse(0, -82, 24, 7, 0, 0, Math.PI*2);
    ctx.fill();
    // 모자 본체
    const hatGrad = ctx.createLinearGradient(-12, -82, 12, -120);
    hatGrad.addColorStop(0, hit ? '#7700bb' : '#9b30ff');
    hatGrad.addColorStop(1, hit ? '#440066' : '#5a0a9a');
    ctx.fillStyle = hatGrad;
    ctx.beginPath();
    ctx.moveTo(-12, -82);
    ctx.lineTo(-6, -120);
    ctx.lineTo(6, -120);
    ctx.lineTo(12, -82);
    ctx.closePath();
    ctx.fill();
    // 모자 별
    ctx.fillStyle = '#ffe04b';
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, -108);
    // 모자 리본
    ctx.fillStyle = '#ff6eb4';
    ctx.beginPath();
    ctx.roundRect(-12, -88, 24, 6, 2);
    ctx.fill();

    // 껌 버블 (활성화 시)
    if (activeItems.gum) {
      ctx.strokeStyle = 'rgba(255,110,180,0.7)';
      ctx.lineWidth = 3;
      const bR = 32 + Math.sin(playerFrame * 0.1) * 4;
      ctx.beginPath();
      ctx.arc(0, -50, bR, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,110,180,0.08)';
      ctx.fill();
    }
    // 방패 (활성화 시)
    if (activeItems.shield) {
      ctx.strokeStyle = 'rgba(68,255,136,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -50, 34 + Math.sin(playerFrame * 0.1) * 3, 0, Math.PI*2);
      ctx.stroke();
    }
    // 자석 (활성화 시)
    if (activeItems.magnet) {
      ctx.strokeStyle = 'rgba(0,229,255,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.arc(0, -50, 80, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════
// 7. 추격자 그리기
// ══════════════════════════════════════
function drawChaser() {
  const ctx = cCtx;
  const w = CHASER_W, h = CHASER_W;
  ctx.clearRect(0, 0, w, h);

  const pulse = Math.sin(chaserPulse) * 0.1 + 1;
  ctx.save();
  ctx.translate(w/2, h/2);
  ctx.scale(pulse, pulse);

  // 본체 (보라색 마녀 유령)
  const grad = ctx.createRadialGradient(-8, -8, 2, 0, 0, 28);
  grad.addColorStop(0, '#cc66ff');
  grad.addColorStop(0.5, '#8800cc');
  grad.addColorStop(1, '#330044');
  ctx.fillStyle = grad;

  // 몸통 방울 모양
  ctx.beginPath();
  ctx.arc(0, -4, 22, Math.PI, 0);
  ctx.lineTo(22, 20);
  ctx.quadraticCurveTo(14, 28, 7, 20);
  ctx.quadraticCurveTo(0, 28, -7, 20);
  ctx.quadraticCurveTo(-14, 28, -22, 20);
  ctx.lineTo(-22, -4);
  ctx.closePath();
  ctx.fill();

  // 안광
  ctx.fillStyle = '#ff0066';
  const eyeOff = Math.sin(chaserFrame * 0.15) * 2;
  ctx.beginPath(); ctx.ellipse(-8, -8 + eyeOff, 5, 6, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(8, -8 - eyeOff, 5, 6, 0.3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(-6, -10 + eyeOff, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -10 - eyeOff, 2, 0, Math.PI*2); ctx.fill();

  // 손
  const handY = Math.sin(chaserFrame * 0.2) * 5;
  ctx.fillStyle = '#9900cc';
  ctx.beginPath(); ctx.arc(-26, 4 + handY, 7, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(26, 4 - handY, 7, 0, Math.PI*2); ctx.fill();

  // 크랙 입
  ctx.strokeStyle = '#ff3388';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, 8);
  ctx.lineTo(-5, 12);
  ctx.lineTo(0, 8);
  ctx.lineTo(5, 12);
  ctx.lineTo(10, 8);
  ctx.stroke();

  // 글로우
  ctx.shadowColor = '#aa00ff';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = 'rgba(170,0,255,0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI*2);
  ctx.stroke();

  ctx.restore();
}

// ══════════════════════════════════════
// 8. 배경 그리기
// ══════════════════════════════════════
// 배경 레이어 초기화
function initBgObjs() {
  bgObjs.length = 0;
  // 구름/장식 오브젝트 초기 배치
  const decorTypes = ['☁️','🌙','⭐','✨','🌟','💫'];
  for (let i = 0; i < 8; i++) {
    bgObjs.push({
      x: Math.random() * W,
      y: Math.random() * (H * 0.6),
      emoji: decorTypes[Math.floor(Math.random() * decorTypes.length)],
      size: 16 + Math.random() * 20,
      speed: 0.3 + Math.random() * 0.5,
      alpha: 0.3 + Math.random() * 0.4
    });
  }
}

let bgScrollX = 0;
function drawBg() {
  bgScrollX += speed * 0.3;

  const ctx = bgCtx;
  ctx.clearRect(0, 0, W, H);

  // 하늘 그라디언트
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.85);
  sky.addColorStop(0, '#0a0020');
  sky.addColorStop(0.5, '#1a0040');
  sky.addColorStop(1, '#2d0060');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 별빛 배경 (반짝임)
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 137 + bgScrollX * 0.05) % W + W) % W;
    const sy = (i * 73) % (H * 0.7);
    const sr = 0.5 + Math.sin(Date.now() * 0.002 + i) * 0.3;
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.003 + i * 0.5) * 0.2;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 원거리 산/건물 실루엣
  ctx.fillStyle = 'rgba(30,0,60,0.8)';
  const bldX = bgScrollX * 0.12;
  const buildings = [
    { x: 0, w: 80, h: 120 },
    { x: 90, w: 50, h: 160 },
    { x: 150, w: 70, h: 100 },
    { x: 230, w: 40, h: 180 },
    { x: 280, w: 90, h: 140 },
    { x: 380, w: 60, h: 170 },
    { x: 450, w: 80, h: 110 },
    { x: 540, w: 50, h: 150 },
    { x: 600, w: 100, h: 130 },
    { x: 710, w: 60, h: 190 },
  ];
  buildings.forEach(b => {
    const bx = ((b.x - bldX % 800 + 800) % 800) - 100;
    ctx.fillRect(bx, H - GROUND_H - b.h, b.w, b.h);
    // 창문
    ctx.fillStyle = 'rgba(255,220,80,0.3)';
    for (let wy = H - GROUND_H - b.h + 10; wy < H - GROUND_H - 10; wy += 20) {
      for (let wx = bx + 5; wx < bx + b.w - 10; wx += 14) {
        if (Math.random() > 0.4) {
          ctx.fillRect(wx, wy, 6, 8);
        }
      }
    }
    ctx.fillStyle = 'rgba(30,0,60,0.8)';
  });

  // 중경 사탕 나무
  const treeX = bgScrollX * 0.4;
  const candyColors = ['#ff6eb4','#ff3388','#9b30ff','#00e5ff'];
  for (let t = 0; t < 10; t++) {
    const tx = ((t * 110 - treeX % 1100 + 1100) % 1100) - 60;
    const ty = H - GROUND_H;
    const tc = candyColors[t % candyColors.length];
    // 줄기
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(tx + 16, ty - 60, 8, 60);
    // 나뭇잎 (사탕 모양)
    const lGrad = ctx.createRadialGradient(tx+20, ty-80, 2, tx+20, ty-80, 28);
    lGrad.addColorStop(0, tc);
    lGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lGrad;
    ctx.beginPath();
    ctx.arc(tx+20, ty-80, 28, 0, Math.PI*2);
    ctx.fill();
  }

  // 배경 이모지 장식
  bgObjs.forEach(obj => {
    obj.x -= obj.speed;
    if (obj.x < -40) obj.x = W + 40;
    ctx.globalAlpha = obj.alpha;
    ctx.font = `${obj.size}px serif`;
    ctx.fillText(obj.emoji, obj.x, obj.y);
  });
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════
// 9. 파티클 시스템
// ══════════════════════════════════════
function spawnParticles(x, y, color, count = 8, type = 'circle') {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const vel   = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel - 2,
      r: 3 + Math.random() * 5,
      color,
      alpha: 1,
      life: 1,
      type
    });
  }
}

function spawnTextPop(x, y, text, color = '#ffe04b') {
  textPops.push({ x, y, text, color, alpha: 1, vy: -2.5 });
}

function updateParticles() {
  const ctx = fxCtx;
  ctx.clearRect(0, 0, W, H);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= 0.035;
    p.alpha = p.life;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    if (p.type === 'star') {
      ctx.font = `${p.r * 3}px serif`;
      ctx.fillText('★', p.x, p.y);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI*2);
      ctx.fill();
    }
  }

  for (let i = textPops.length - 1; i >= 0; i--) {
    const t = textPops[i];
    t.y += t.vy;
    t.alpha -= 0.03;
    if (t.alpha <= 0) { textPops.splice(i, 1); continue; }
    ctx.globalAlpha = t.alpha;
    ctx.fillStyle = t.color;
    ctx.font = "bold 18px 'Fredoka One', cursive";
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ══════════════════════════════════════
// 10. 플레이어 위치 업데이트
// ══════════════════════════════════════
function updatePlayerPos() {
  const lx = laneX(lane);
  playerCanvas.style.left = (lx - PLAYER_W / 2) + 'px';
  playerCanvas.style.bottom = playerBottom + 'px';
  chaserCanvas.style.left   = (lx - CHASER_W / 2) + 'px';
}

// ══════════════════════════════════════
// 11. 점프 & 슬라이드
// ══════════════════════════════════════
function jump() {
  if (jumpCount >= MAX_JUMP) return;
  jumpCount++;
  const jumpPower = activeItems.gum ? -18 : -13;
  playerVelY = jumpPower;
  isGrounded = false;
  isSliding = false;
  playerCanvas.classList.remove('slide-active');
  if (jumpCount === 1) SFX.jump();
  else SFX.doubleJump();
}

function startSlide() {
  if (!isGrounded) return;
  isSliding = true;
  slideTimer = 60;
  playerCanvas.classList.add('slide-active');
  SFX.slide();
}

// ══════════════════════════════════════
// 12. 아이템 시스템
// ══════════════════════════════════════
const ITEMS = {
  gum:    { label: '🫧 GUM',    color: '#ff6eb4', duration: 8000 },
  speed:  { label: '⚡ SPEED',  color: '#ffe04b', duration: 6000 },
  magnet: { label: '🧲 MAGNET', color: '#00e5ff', duration: 7000 },
  shield: { label: '🛡️ SHIELD', color: '#44ff88', duration: 10000 },
};

function activateItem(type) {
  if (activeItems[type]) {
    clearTimeout(activeItems[type].timer);
  }
  SFX.itemPickup();

  if (type === 'speed') speed = Math.min(speed * 1.6, maxSpeed * 1.2);

  activeItems[type] = {
    startTime: Date.now(),
    duration: ITEMS[type].duration,
    timer: setTimeout(() => deactivateItem(type), ITEMS[type].duration)
  };
  renderItemDisplay();
}

function deactivateItem(type) {
  if (type === 'speed') speed = Math.max(5, speed / 1.6);
  delete activeItems[type];
  renderItemDisplay();
}

function renderItemDisplay() {
  itemDisplayEl.innerHTML = '';
  Object.entries(activeItems).forEach(([type, data]) => {
    const info = ITEMS[type];
    const elapsed = Date.now() - data.startTime;
    const pct = Math.max(0, 1 - elapsed / data.duration);
    const div = document.createElement('div');
    div.className = 'item-badge';
    div.style.color = info.color;
    div.style.borderColor = info.color;
    div.innerHTML = `${info.label}`;
    // 타이머 바
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:0; left:0;
      height:3px; border-radius:0 0 20px 20px;
      background:${info.color};
      width:${pct*100}%;
      transition:width 0.2s linear;
    `;
    div.style.position = 'relative';
    div.appendChild(bar);
    itemDisplayEl.appendChild(div);
  });
}

// ══════════════════════════════════════
// 13. 오브젝트 스폰
// ══════════════════════════════════════
const OBSTACLE_TYPES = [
  { emoji: '🍬', label: '캔디팝' },
  { emoji: '🌶️', label: '고추' },
  { emoji: '🦷', label: '이빨' },
  { emoji: '💀', label: '해골' },
  { emoji: '🔥', label: '불꽃' },
];
const COIN_EMOJI  = '🪙';
const ITEM_DEFS = [
  { type: 'gum',    emoji: '🫧' },
  { type: 'speed',  emoji: '⚡' },
  { type: 'magnet', emoji: '🧲' },
  { type: 'shield', emoji: '🛡️' },
];

function spawnObj(category) {
  const l = Math.floor(Math.random() * LANE_COUNT);
  const x = laneX(l);

  const el = document.createElement('div');
  el.className = 'obj';

  let isPlatform = false;
  let objType = category;

  if (category === 'obstacle' && Math.random() < 0.15) {
    // 플랫폼
    isPlatform = true;
    el.classList.add('platform');
    el.textContent = '🍫';
    el.style.width = '90px';
    el.style.height = '22px';
    el.style.borderRadius = '8px';
    el.style.fontSize = '14px';
  } else if (category === 'coin') {
    el.classList.add('coin');
    // 자석 있으면 이웃 레인도 끌어당김
  } else if (category === 'item') {
    const def = ITEM_DEFS[Math.floor(Math.random() * ITEM_DEFS.length)];
    el.classList.add(`item-${def.type}`);
    el.textContent = def.emoji;
    el.dataset.itemType = def.type;
    el.style.fontSize = '20px';
  } else {
    // 장애물
    const obs = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    el.classList.add('obstacle');
    el.textContent = obs.emoji;
    el.style.fontSize = '22px';
  }

  el.style.left = x + 'px';
  el.style.top = '-60px';
  el.dataset.lane = l;
  el.dataset.category = isPlatform ? 'platform' : category;
  el.dataset.startY = -60;
  objectsEl.appendChild(el);

  objs.push({ el, lane: l, y: -60, category: isPlatform ? 'platform' : category, isPlatform });
}

// 패턴 스폰
function spawnPattern() {
  const roll = Math.random();
  if (roll < 0.05) {
    // 코인 라인
    const l = Math.floor(Math.random() * LANE_COUNT);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'obj coin';
        el.style.left = laneX(l) + 'px';
        el.style.top = '-60px';
        el.dataset.lane = l;
        el.dataset.category = 'coin';
        objectsEl.appendChild(el);
        objs.push({ el, lane: l, y: -60, category: 'coin' });
      }, i * 150);
    }
  } else if (roll < 0.45) {
    spawnObj('coin');
  } else if (roll < 0.78) {
    spawnObj('obstacle');
  } else if (roll < 0.93) {
    spawnObj('obstacle');
    if (Math.random() < 0.5) spawnObj('coin');
  } else {
    spawnObj('item');
  }
}

// ══════════════════════════════════════
// 14. 충돌 감지
// ══════════════════════════════════════
const PLAYER_HIT_W = 28;
const PLAYER_HIT_H_STAND = 60;
const PLAYER_HIT_H_SLIDE = 24;

function checkCollisions() {
  const playerCX = laneX(lane);
  const playerCY = H - playerBottom - (isSliding ? PLAYER_HIT_H_SLIDE/2 : PLAYER_HIT_H_STAND/2);
  const pHH = isSliding ? PLAYER_HIT_H_SLIDE/2 : PLAYER_HIT_H_STAND/2;

  // 자석 범위
  const magnetRange = activeItems.magnet ? 120 : 0;

  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    const elY = o.y;
    const objScreenY = elY + 30; // 오브젝트 중심Y (게임 좌표)
    const objScreenActualY = H - GROUND_H - (H - objScreenY); // 실제 화면Y

    // 오브젝트가 지면 근처인지
    const objBottom = H - elY - 44; // 대략적 오브젝트 bottom
    const objLaneX = laneX(o.lane);

    // 자석: 코인 끌어당김
    if (magnetRange > 0 && o.category === 'coin') {
      const dx = playerCX - objLaneX;
      const dy = (H - playerBottom - 40) - (elY + 22);
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < magnetRange) {
        o.lane = lane; // 레인 바꾸기
        o.el.style.left = (objLaneX + dx * 0.15) + 'px';
        o.y -= dy * 0.05;
      }
    }

    // 충돌 범위 체크
    const sameLane = o.lane === lane;
    const yOverlap = Math.abs(objBottom - playerBottom) < (pHH + 20);

    if (sameLane && yOverlap) {
      // 플랫폼
      if (o.category === 'platform') {
        if (playerBottom <= objBottom + 10 && playerVelY >= 0) {
          playerBottom = objBottom + 20;
          playerVelY = 0;
          isGrounded = true;
          jumpCount = 0;
          SFX.land();
        }
        continue;
      }
      // 코인
      if (o.category === 'coin') {
        sessionCoins++;
        totalCoins++;
        coinsEl.textContent = sessionCoins;
        localStorage.setItem('coins', totalCoins);
        spawnParticles(objLaneX, H - objBottom - 20, '#ffd700', 6, 'star');
        spawnTextPop(objLaneX, H - objBottom - 20, '+1🪙', '#ffe04b');
        SFX.coin();
        o.el.remove();
        objs.splice(i, 1);
        continue;
      }
      // 아이템
      if (o.category === 'item') {
        const type = o.el.dataset.itemType;
        activateItem(type);
        spawnParticles(objLaneX, H - objBottom - 20, ITEMS[type].color, 10);
        spawnTextPop(objLaneX, H - objBottom - 20, ITEMS[type].label, ITEMS[type].color);
        o.el.remove();
        objs.splice(i, 1);
        continue;
      }
      // 장애물
      if (o.category === 'obstacle') {
        if (activeItems.shield) {
          // 방패로 막음
          deactivateItem('shield');
          spawnParticles(objLaneX, H - objBottom - 20, '#44ff88', 12);
          spawnTextPop(objLaneX, H - objBottom - 20, '🛡️ BLOCKED!', '#44ff88');
          o.el.remove();
          objs.splice(i, 1);
          continue;
        }
        hitByObstacle(objLaneX, H - objBottom - 20);
        o.el.remove();
        objs.splice(i, 1);
        continue;
      }
    }
  }
}

// ══════════════════════════════════════
// 15. 충돌 처리
// ══════════════════════════════════════
function hitByObstacle(x, y) {
  if (playerHit) return;
  playerHit = true;
  playerHitTimer = 40;
  SFX.hit();

  hitOverlay.classList.add('flash');
  setTimeout(() => hitOverlay.classList.remove('flash'), 400);

  spawnParticles(x, y, '#ff3344', 14);
  spawnTextPop(x, y, '💥', '#ff3344');

  chaseLevel++;
  chaserPulse += 2;

  if (chaseLevel === 1) {
    chaserVisible = true;
    chaserCanvas.style.opacity = '1';
    spawnTextPop(W/2, H/2, '⚠️ 마녀 등장!', '#ff6eb4');
  } else {
    // 게임 오버
    setTimeout(() => endGame(), 300);
  }
}

// ══════════════════════════════════════
// 16. 오브젝트 업데이트
// ══════════════════════════════════════
function updateObjs() {
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    o.y += speed;
    o.el.style.top = o.y + 'px';

    if (o.y > H + 60) {
      o.el.remove();
      objs.splice(i, 1);
    }
  }
}

// ══════════════════════════════════════
// 17. 물리 업데이트
// ══════════════════════════════════════
const GRAVITY = 0.7;
function updatePhysics() {
  if (!isGrounded) {
    playerVelY += GRAVITY;
    playerBottom -= playerVelY;
    if (playerBottom <= PLAYER_BOTTOM_BASE) {
      playerBottom = PLAYER_BOTTOM_BASE;
      playerVelY = 0;
      isGrounded = true;
      jumpCount = 0;
      SFX.land();
    }
  }

  if (isSliding) {
    slideTimer--;
    if (slideTimer <= 0) {
      isSliding = false;
      playerCanvas.classList.remove('slide-active');
    }
  }

  if (playerHit) {
    playerHitTimer--;
    if (playerHitTimer <= 0) playerHit = false;
  }
}

// ══════════════════════════════════════
// 18. 애니메이션 프레임
// ══════════════════════════════════════
function animUpdate() {
  playerFrameTimer++;
  if (playerFrameTimer >= 4) {
    playerFrameTimer = 0;
    playerFrame++;
  }
  chaserFrameTimer++;
  if (chaserFrameTimer >= 3) {
    chaserFrameTimer = 0;
    chaserFrame++;
  }
  chaserPulse += 0.08;
}

// ══════════════════════════════════════
// 19. 메인 게임 루프
// ══════════════════════════════════════
let lastTime = 0;
function gameLoop(ts) {
  if (!gameRunning) return;
  const dt = ts - lastTime;
  lastTime = ts;

  // 배경
  drawBg();

  // 물리
  updatePhysics();
  updateObjs();
  checkCollisions();

  // 플레이어 위치
  updatePlayerPos();

  // 스프라이트 그리기
  animUpdate();
  drawPlayer();
  drawChaser();

  // 파티클
  updateParticles();

  // 아이템 타이머 바 갱신
  Object.entries(activeItems).forEach(([type, data]) => {
    const elapsed = Date.now() - data.startTime;
    const pct = Math.max(0, 1 - elapsed / data.duration);
    const bar = itemDisplayEl.querySelector(`.item-badge:nth-child(${Object.keys(activeItems).indexOf(type)+1}) div`);
    if (bar) bar.style.width = (pct*100) + '%';
  });

  // 스폰
  if (ts - lastSpawn > spawnInterval) {
    lastSpawn = ts;
    spawnPattern();
  }

  // 난이도 증가
  const elapsed = (Date.now() - startTime) / 1000;
  speed = Math.min(5 + (maxSpeed - 5) * (elapsed / 180), maxSpeed);
  spawnInterval = Math.max(400, 900 - elapsed * 0.8);

  // 점수
  score = Math.floor(elapsed * 5);
  scoreEl.textContent = score;

  animFrame = requestAnimationFrame(gameLoop);
}

// ══════════════════════════════════════
// 20. 게임 시작/종료
// ══════════════════════════════════════
function startGame() {
  ensureAudio();

  // 상태 초기화
  lane = 1;
  score = 0;
  sessionCoins = 0;
  speed = 5;
  playerBottom = PLAYER_BOTTOM_BASE;
  playerVelY = 0;
  isGrounded = true;
  isSliding = false;
  jumpCount = 0;
  chaseLevel = 0;
  chaserVisible = false;
  chaserPulse = 0;
  playerHit = false;
  playerFrame = 0;
  chaserFrame = 0;
  particles.length = 0;
  textPops.length = 0;
  objs.length = 0;
  objectsEl.innerHTML = '';
  itemDisplayEl.innerHTML = '';
  Object.keys(activeItems).forEach(k => {
    clearTimeout(activeItems[k].timer);
    delete activeItems[k];
  });

  // UI
  scoreEl.textContent = '0';
  coinsEl.textContent = '0';
  bestEl.textContent = best;
  chaserCanvas.style.opacity = '0';
  playerCanvas.classList.remove('slide-active');

  startTime = Date.now();
  gameRunning = true;

  // 화면 전환
  startScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');
  gameScreen.classList.add('active');

  resize();
  initBgObjs();
  updatePlayerPos();

  lastTime = performance.now();
  lastSpawn = lastTime;
  animFrame = requestAnimationFrame(gameLoop);
}

function endGame() {
  gameRunning = false;
  cancelAnimationFrame(animFrame);
  SFX.gameover();

  // 저장
  if (score > best) {
    best = score;
    localStorage.setItem('best', best);
    newRecordEl.classList.remove('hidden');
  } else {
    newRecordEl.classList.add('hidden');
  }

  // 게임오버 화면
  goScoreEl.textContent = score;
  goCoinsEl.textContent = sessionCoins;
  goBestEl.textContent = best;

  setTimeout(() => {
    gameScreen.classList.remove('active');
    gameoverScreen.classList.add('active');
  }, 600);
}

// ══════════════════════════════════════
// 21. 키보드 입력
// ══════════════════════════════════════
window.addEventListener('keydown', e => {
  if (!gameRunning) return;
  switch(e.key) {
    case 'ArrowLeft': case 'a':
      if (lane > 0) { lane--; updatePlayerPos(); } break;
    case 'ArrowRight': case 'd':
      if (lane < 2) { lane++; updatePlayerPos(); } break;
    case 'ArrowUp': case 'w': case ' ':
      e.preventDefault(); jump(); break;
    case 'ArrowDown': case 's':
      startSlide(); break;
  }
});

// ══════════════════════════════════════
// 22. 터치 입력 (모바일)
// ══════════════════════════════════════
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;

document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
}, { passive: true });

document.addEventListener('touchend', e => {
  if (!gameRunning) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dt = Date.now() - touchStartTime;

  const absDx = Math.abs(dx), absDy = Math.abs(dy);

  if (absDx < 10 && absDy < 10 && dt < 200) {
    // 탭 → 점프
    jump();
  } else if (absDx > absDy) {
    if (dx > 30 && lane < 2) { lane++; updatePlayerPos(); }
    else if (dx < -30 && lane > 0) { lane--; updatePlayerPos(); }
  } else {
    if (dy < -30) jump();
    else if (dy > 30) startSlide();
  }
}, { passive: true });

// ══════════════════════════════════════
// 23. 버튼 이벤트
// ══════════════════════════════════════
startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);
homeBtn.addEventListener('click', () => {
  gameoverScreen.classList.remove('active');
  startBestEl.textContent = best;
  startScreen.classList.add('active');
});

// ══════════════════════════════════════
// 24. 초기화
// ══════════════════════════════════════
startBestEl.textContent = best;
resize();
