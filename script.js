const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const uiLayer = document.getElementById('ui-layer');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const instructionOverlay = document.getElementById('instruction-overlay');
const countdownScreen = document.getElementById('countdown-screen');
const countdownText = document.getElementById('countdown-text');
const messageOverlay = document.getElementById('message-overlay');
const floatingMsg = document.getElementById('floating-msg');

const scoreEl = document.getElementById('score');
const distanceEl = document.getElementById('distance');
const highScoreEl = document.getElementById('high-score');
const livesEl = document.getElementById('lives');

const endDistEl = document.getElementById('end-dist');
const endScoreEl = document.getElementById('end-score');

// Difficulty Settings Map
const difficulties = {
    easy: { id: 'easy', theme: '#0ff', sTheme: 'rgba(0, 255, 255, 0.4)', baseSpeed: 3.5, startLives: 3, gapMin: 400, gapMax: 600, obsW: 60, obsHScale: 0.4, moveChance: 0, fakeChance: 0, unlockReq: 0 },
    medium: { id: 'medium', theme: '#f0f', sTheme: 'rgba(255, 0, 255, 0.4)', baseSpeed: 5.0, startLives: 2, gapMin: 300, gapMax: 450, obsW: 50, obsHScale: 0.5, moveChance: 0.3, fakeChance: 0, unlockReq: 30 },
    hard: { id: 'hard', theme: '#f00', sTheme: 'rgba(255, 0, 0, 0.4)', baseSpeed: 7.0, startLives: 1, gapMin: 200, gapMax: 350, obsW: 40, obsHScale: 0.6, moveChance: 0.6, fakeChance: 0, unlockReq: 45 },
    veryhard: { id: 'veryhard', theme: '#ff3333', sTheme: 'rgba(255, 50, 50, 0.5)', baseSpeed: 9.0, startLives: 0, gapMin: 150, gapMax: 250, obsW: 30, obsHScale: 0.7, moveChance: 0.8, fakeChance: 0.2, unlockReq: 60 }
};

// State Variables
let gameState = 'START'; 
let currentDiff = difficulties.easy;
let aiMode = false;
let lastTime = 0;
let gameTime = 0;
let score = 0;
let distance = 0;
let lives = 3;
let worldX = 0;
let worldSpeed = 3.5;
let animationId;
let invincibleTimer = 0;
let shakeTimer = 0;
let nextSpawnDistance = 0;

let stats = {
    easy: { bestScore: 0, bestTime: 0 },
    medium: { bestScore: 0, bestTime: 0 },
    hard: { bestScore: 0, bestTime: 0 },
    veryhard: { bestScore: 0, bestTime: 0 }
};

let obstacles = [];
let stars = [];

// Input
const keys = {};
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (gameState === 'PLAYING' && !aiMode) toggleGravity();
    }
    keys[e.code] = true;
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

// Player
const player = {
    x: 100, y: 300, w: 24, h: 24,
    vy: 0, baseGravity: 1.2, jumpBoost: 8,
    gravityDir: 1, speed: 4, color: '#0ff'
};

// --- Storage & Progression ---
function loadProgress() {
    const saved = localStorage.getItem('gravityEscapeStats');
    if (saved) stats = JSON.parse(saved);
}

function saveProgress() {
    localStorage.setItem('gravityEscapeStats', JSON.stringify(stats));
}

function updateMenuUI() {
    loadProgress();
    
    document.getElementById('hs-easy').innerText = stats.easy.bestScore;
    document.getElementById('hs-medium').innerText = stats.medium.bestScore;
    document.getElementById('hs-hard').innerText = stats.hard.bestScore;
    document.getElementById('hs-veryhard').innerText = stats.veryhard.bestScore;

    const cards = [
        { id: 'medium', req: difficulties.medium.unlockReq, prev: stats.easy.bestTime },
        { id: 'hard', req: difficulties.hard.unlockReq, prev: stats.medium.bestTime },
        { id: 'veryhard', req: difficulties.veryhard.unlockReq, prev: stats.hard.bestTime }
    ];

    cards.forEach(c => {
        const cardEl = document.getElementById(`card-${c.id}`);
        const btn = cardEl.querySelector('.btn-diff');
        const hsDisplay = cardEl.querySelector('.hs-display');
        
        if (c.prev >= c.req) {
            // Unlocked
            cardEl.classList.remove('locked');
            btn.classList.remove('disabled');
            btn.innerText = 'PLAY';
            hsDisplay.classList.remove('hidden');
        } else {
            cardEl.classList.add('locked');
            btn.classList.add('disabled');
            btn.innerText = `🔒 NEED ${c.req}s`;
            hsDisplay.classList.add('hidden');
        }
    });
}

// Show Floating Message
function showMessage(text, color) {
    floatingMsg.innerText = text;
    floatingMsg.style.color = color;
    floatingMsg.style.textShadow = `0 0 20px ${color}`;
    
    messageOverlay.classList.remove('hidden');
    // Force DOM reflow to restart animation
    void messageOverlay.offsetWidth; 
    
    setTimeout(() => {
        messageOverlay.classList.add('hidden');
    }, 2500);
}

// --- Menu Hooks ---
document.querySelectorAll('.btn-diff').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (btn.classList.contains('disabled')) return;
        const diffKey = e.target.getAttribute('data-diff');
        currentDiff = difficulties[diffKey];
        startCountdown(false);
    });
});
document.getElementById('btn-ai').addEventListener('click', () => {
    currentDiff = difficulties.hard; // Demo on hard
    startCountdown(true);
});
document.getElementById('btn-restart').addEventListener('click', () => startCountdown(aiMode));
document.getElementById('btn-menu').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    updateMenuUI();
});

function applyTheme() {
    document.documentElement.style.setProperty('--theme-color', currentDiff.theme);
    document.documentElement.style.setProperty('--theme-shadow', currentDiff.sTheme);
    player.color = currentDiff.theme;
    
    if(currentDiff.id === 'veryhard') document.getElementById('game-container').classList.add('pulsing-bg');
    else document.getElementById('game-container').classList.remove('pulsing-bg');
}

function startCountdown(mode) {
    aiMode = mode;
    gameState = 'COUNTDOWN';
    applyTheme();
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    instructionOverlay.classList.remove('hidden');
    
    worldX = 0;
    distance = 0;
    score = 0;
    gameTime = 0;
    lives = currentDiff.startLives;
    worldSpeed = currentDiff.baseSpeed;
    player.y = canvas.height / 2;
    player.vy = 0;
    player.gravityDir = 1;
    invincibleTimer = 0;
    shakeTimer = 0;
    
    obstacles = [];
    stars = [];
    nextSpawnDistance = 600; // First obstacle spawns slightly ahead
    
    highScoreEl.innerText = stats[currentDiff.id].bestScore;
    updateHUD();
    
    countdownScreen.classList.remove('hidden');
    let count = 3;
    countdownText.innerText = count;
    
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownText.innerText = count;
        } else {
            clearInterval(interval);
            countdownScreen.classList.add('hidden');
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameState = 'PLAYING';
    instructionOverlay.classList.add('hidden');
    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
}

// --- Procedural Generation ---
function spawnObstacle() {
    // Dynamic difficulty scaling
    const speedMultiplier = 1 + (score / 100); 
    const currentW = Math.max(15, currentDiff.obsW - Math.floor(score / 10) * 2);
    
    const isMoving = Math.random() < currentDiff.moveChance;
    const isFake = Math.random() < currentDiff.fakeChance;
    
    const h = Math.random() * (canvas.height * currentDiff.obsHScale) + 50;
    const yPos = Math.random() > 0.5 ? 0 : canvas.height - h;
    
    let obs = {
        x: nextSpawnDistance,
        y: yPos,
        w: currentW,
        h: h,
        moving: isMoving,
        moveDir: Math.random() > 0.5 ? 1 : -1,
        moveSpeed: isMoving ? (Math.random() * 2 + 1) : 0,
        fake: isFake,
        revealed: !isFake
    };
    
    obstacles.push(obs);
    
    // Spawn chance for star
    if (Math.random() > 0.6) {
        stars.push({
            x: nextSpawnDistance + currentDiff.gapMin / 2,
            y: canvas.height/2 + (Math.random()-0.5)*150,
            r: 15,
            collected: false
        });
    }

    // Schedule next
    const gap = currentDiff.gapMin + Math.random() * (currentDiff.gapMax - currentDiff.gapMin);
    nextSpawnDistance += gap;
}

function toggleGravity() {
    player.gravityDir *= -1;
    player.vy = player.gravityDir * player.jumpBoost; 
}

function updateHUD() {
    scoreEl.innerText = score;
    distanceEl.innerText = Math.floor(distance);
    livesEl.innerText = lives;
}

function gameOver() {
    gameState = 'GAMEOVER';
    document.getElementById('end-dist').innerText = Math.floor(distance);
    document.getElementById('end-score').innerText = score;
    
    let highScored = false;
    let unlocked = false;

    // Check unlocks
    if (gameTime > stats[currentDiff.id].bestTime) stats[currentDiff.id].bestTime = gameTime;
    if (score > stats[currentDiff.id].bestScore) {
        stats[currentDiff.id].bestScore = score;
        highScored = true;
    }

    // Test specific unlocks
    if (currentDiff.id === 'easy' && stats.easy.bestTime >= difficulties.medium.unlockReq && stats.easy.bestTime - gameTime <= 0) unlocked = 'MEDIUM';
    if (currentDiff.id === 'medium' && stats.medium.bestTime >= difficulties.hard.unlockReq && stats.medium.bestTime - gameTime <= 0) unlocked = 'HARD';
    if (currentDiff.id === 'hard' && stats.hard.bestTime >= difficulties.veryhard.unlockReq && stats.hard.bestTime - gameTime <= 0) unlocked = 'VERY HARD';

    saveProgress();
    
    if (highScored && !aiMode) showMessage("NEW HIGH SCORE!", "#ffeb3b");
    else if (unlocked && !aiMode) showMessage(`${unlocked} UNLOCKED!`, "#0f0");

    gameOverScreen.classList.remove('hidden');
}

// AI Controller
let lastAIFlipTime = 0;
function processAI() {
    if (!aiMode) return;
    const now = performance.now();
    if (now - lastAIFlipTime < 250) return;

    const lookAheadStartX = distance + player.x + player.w;
    const lookAheadEndX = lookAheadStartX + 600;

    let dangerInPath = false;
    for (const obs of obstacles) {
        if (obs.x > lookAheadStartX && obs.x < lookAheadEndX) {
            // Predict if moving
            let predictedY = obs.y;
            if (obs.moving) {
                // simple extrapolation not necessary, AI reacts fast 
            }
            if (player.gravityDir === 1 && (obs.y + obs.h >= canvas.height - 200)) { dangerInPath = true; break; }
            else if (player.gravityDir === -1 && obs.y <= 200) { dangerInPath = true; break; }
        }
    }

    if (dangerInPath) {
        toggleGravity();
        lastAIFlipTime = now;
    }
}

function update(dt) {
    if (gameState !== 'PLAYING') return;
    const dtSeconds = dt / 1000;

    // Progression scaling
    const speedInc = Math.floor(score / 10) * 0.2;
    worldSpeed = currentDiff.baseSpeed + speedInc;

    worldX += worldSpeed;
    distance = worldX / 10;
    gameTime += dtSeconds;
    
    if (invincibleTimer > 0) invincibleTimer -= dtSeconds;
    if (shakeTimer > 0) shakeTimer -= dtSeconds;

    // Generate terrain
    if (distance * 10 + 1500 > nextSpawnDistance) {
        spawnObstacle();
    }

    processAI();

    // Physics
    player.vy += player.baseGravity * player.gravityDir;
    if (player.vy > 18) player.vy = 18;
    if (player.vy < -18) player.vy = -18;
    player.y += player.vy;

    if (player.y + player.h > canvas.height) { player.y = canvas.height - player.h; player.vy = 0; }
    if (player.y < 0) { player.y = 0; player.vy = 0; }

    const hitMargin = 3;
    const playerBox = { x: player.x + hitMargin, y: player.y + hitMargin, w: player.w - hitMargin*2, h: player.h - hitMargin*2 };
    
    // Near miss larger box
    const nearMissBox = { x: player.x - 15, y: player.y - 15, w: player.w + 30, h: player.h + 30 };
    let nearMissOcurred = false;

    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        
        // Render X
        const oX = obs.x - worldX;
        
        // Garbage collect
        if (oX + obs.w < -100) {
            obstacles.splice(i, 1);
            continue;
        }

        // Fake gap reveal
        if (obs.fake && !obs.revealed && oX - player.x < 300) {
            obs.revealed = true;
        }

        // Move obstacle if dynamic
        if (obs.moving) {
            obs.y += obs.moveSpeed * obs.moveDir;
            if (obs.y < 0) { obs.y = 0; obs.moveDir = 1; }
            if (obs.y + obs.h > canvas.height) { obs.y = canvas.height - obs.h; obs.moveDir = -1; }
        }

        const obsBox = { x: oX, y: obs.y, w: obs.w, h: obs.h };
        
        // Collision
        if (obs.revealed && checkAABB(playerBox, obsBox) && invincibleTimer <= 0) {
            lives--;
            updateHUD();
            shakeTimer = 0.5; // Heavy shake
            if (lives < 0) gameOver();
            else invincibleTimer = 2.0;
        } 
        else if (obs.revealed && checkAABB(nearMissBox, obsBox) && invincibleTimer <= 0) {
            nearMissOcurred = true;
        }
    }

    if (nearMissOcurred && shakeTimer <= 0) {
        shakeTimer = 0.1; // Mini shake
        score++; // Bonus for near miss
    }

    for (let i = stars.length - 1; i >= 0; i--) {
        let star = stars[i];
        if (star.collected) continue;
        
        const sX = star.x - worldX;
        if (sX + star.r < -50) {
            stars.splice(i, 1); continue;
        }
        
        const dx = Math.abs(sX - (player.x + player.w / 2));
        const dy = Math.abs(star.y - (player.y + player.h / 2));

        if (dx < (player.w / 2 + star.r) && dy < (player.h / 2 + star.r)) {
            star.collected = true;
            score += 10;
        }
    }

    // Periodic score for surviving
    if (Math.floor(distance) % 100 === 0 && distance > 0) score += 1;
    
    if (score > stats[currentDiff.id].bestScore && !aiMode) highScoreEl.innerText = score;
    updateHUD();
}

function checkAABB(r1, r2) {
    return (r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    
    // Camera Shake
    if (shakeTimer > 0) {
        const magnitude = shakeTimer > 0.3 ? 15 : 5; // Heavy hit vs near miss
        const sx = (Math.random() - 0.5) * magnitude;
        const sy = (Math.random() - 0.5) * magnitude;
        ctx.translate(sx, sy);
    }

    // Grid
    ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const bgScroll = -(worldX * 0.3) % 40; 
    for (let i = -40; i < canvas.width + 40; i += 40) {
        ctx.moveTo(i + bgScroll, 0); ctx.lineTo(i + bgScroll, canvas.height);
    }
    for (let i = 0; i < canvas.height; i += 40) {
        ctx.moveTo(0, i); ctx.lineTo(canvas.width, i);
    }
    ctx.stroke();

    // Player
    const isBlinking = invincibleTimer > 0 && Math.floor(invincibleTimer * 10) % 2 === 0;
    if (!isBlinking) {
        ctx.fillStyle = player.color;
        ctx.shadowColor = player.color;
        ctx.shadowBlur = 20; 
        
        ctx.save();
        ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
        ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);

        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        if (player.gravityDir === 1) { ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, 10); } 
        else { ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, -10); }
        ctx.fill();
        ctx.restore();
    }

    // Obstacles
    ctx.fillStyle = currentDiff.theme;
    ctx.shadowColor = currentDiff.theme;
    
    for (const obs of obstacles) {
        const renderX = obs.x - worldX;
        if (renderX + obs.w > 0 && renderX < canvas.width) {
            if (obs.fake && !obs.revealed) {
                // Invisible "fake safe gap" trick
                continue;
            }
            
            // Revealed fake blocks flash briefly to startle
            if (obs.fake && obs.revealed && obs.x - worldX > player.x + 100) {
                ctx.shadowBlur = 40;
                ctx.fillStyle = '#fff';
            } else {
                ctx.shadowBlur = 15;
                ctx.fillStyle = currentDiff.theme;
            }

            ctx.fillRect(renderX, obs.y, obs.w, obs.h);
        }
    }

    // Stars
    ctx.fillStyle = '#ff0';
    ctx.shadowColor = '#ff0';
    ctx.shadowBlur = 15;
    for (const star of stars) {
        if (star.collected) continue;
        const renderX = star.x - worldX;
        if (renderX + star.r > 0 && renderX - star.r < canvas.width) {
            ctx.beginPath(); ctx.arc(renderX, star.y, star.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.arc(renderX, star.y, star.r / 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff0'; ctx.shadowBlur = 15;
        }
    }

    ctx.restore(); // remove shake transform
}

function gameLoop(now) {
    if (!lastTime) lastTime = now;
    const dt = now - lastTime;
    lastTime = now;

    if (dt < 100) update(dt);
    draw();

    if (gameState === 'PLAYING' || gameState === 'COUNTDOWN') {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// Initial Setup
updateMenuUI();
