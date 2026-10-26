// =====================================================
// BYTE FRONTIERS — Electromon
// =====================================================

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// ---- Asset loader ----
const imageCache = {};
function loadImg(src) {
  if (imageCache[src]) return Promise.resolve(imageCache[src]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache[src] = img; resolve(img); };
    img.onerror = () => { console.warn("Failed to load:", src); resolve(null); };
    img.src = src;
  });
}

const audioCache = {};
function loadSound(src) {
  if (audioCache[src]) return Promise.resolve(audioCache[src]);
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.addEventListener("canplaythrough", () => { audioCache[src] = audio; resolve(audio); }, { once: true });
    audio.addEventListener("error", () => { console.warn("Failed to load sound:", src); resolve(null); });
  });
}

function playSound(src) {
  const a = audioCache[src];
  if (a) {
    const clone = a.cloneNode();
    clone.play().catch(() => { });
    return clone;
  }
  return null;
}

function playSoundUntilDone(src) {
  return new Promise((resolve) => {
    const a = audioCache[src];
    if (!a) { resolve(); return; }
    const clone = a.cloneNode();
    clone.addEventListener("ended", resolve, { once: true });
    clone.play().catch(() => resolve());
  });
}

// ---- Wait utility ----
function wait(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// ---- Random integer [min, max] ----
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---- Game state ----
const state = {
  // Global vars
  currentelectromon: 0,
  defence: 0,
  currentElectroform: 0,
  winLoose: 1,
  attack: 0,
  time: 0,
  hunger: 5,
  eAtack: 0,
  eDefence: 0,
  hp: 0,
  wandering: 1,
  winRate: 0,
  money: 0,
  ownedItems: [],   // ids of purchased store items
  trainingLevel: 0,
  trainingWins: 0,
  spattack: 0,
  speed: 0,
  // Permanent stat boosts from store items (re-applied when stats are reset by evolving/loading)
  bonus: { attack: 0, defence: 0, spattack: 0, speed: 0 },

  // Game phase: hatching | overworld | menu | battle | pvp | gameover
  phase: "hatching",
  hatchAnimDone: false,
  electromonVisible: false,
  enemyVisible: false,
  battleButtonVisible: false,

  // Electromon position & costume
  electromon: { x: 0, y: 0, costume: "", direction: 0, size: 1 },
  // Enemy position & costume
  enemy: { x: 175, y: 85, costume: "", direction: 0, size: 0.45 },

  // Egg
  egg: { x: 4, y: -47 + 180, direction: 0, costume: 0, visible: true, brightness: 0 },

  // Speech
  speechText: "",
  speechTimeout: null,

  // Background
  backdrop: "fight scene",

  // Animations
  animating: false,
};



// ---- Browser account save (no server or Node.js required) ----
const AUTH_TOKEN_KEY = "bf_auth_token";
let cloudSaveTimer = null;
let cloudSaveBusy = false;
function authToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
async function apiRequest(path, options = {}) {
  const account = window.BFAccounts?.getCurrent();
  if (!authToken() || !account) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    location.href = "Signin.html";
    throw new Error("Please sign in again.");
  }
  if (path === "/api/me") return { success: true, account };
  if (path === "/api/save") {
    const body = JSON.parse(options.body || "{}");
    window.BFAccounts.saveGame(body.gameState);
    return { success: true };
  }
  throw new Error("Unknown account action.");
}
function makeGameSnapshot() {
  return {
    hasStarted: state.currentelectromon >= 1,
    currentelectromon: state.currentelectromon,
    currentElectroform: state.currentElectroform,
    attack: state.attack, defence: state.defence, hp: state.hp,
    hunger: state.hunger, winRate: state.winRate, money: state.money,
    ownedItems: [...state.ownedItems], trainingLevel: state.trainingLevel || 0, trainingWins: state.trainingWins || 0, bonus: { ...state.bonus },
    spattack: state.spattack, speed: state.speed,
    costume: state.electromon.costume || ELECTROMON_BY_INDEX[state.currentelectromon] || "glitchit",
    saveCode: (state.currentElectroform === 2 ? SAVE_CODES_FORM2 : SAVE_CODES_FORM1)[state.currentelectromon] || ""
  };
}
async function saveCloudGame(quiet = true) {
  if (!authToken() || cloudSaveBusy || state.currentelectromon < 1) return;
  cloudSaveBusy = true;
  try {
    await apiRequest("/api/save", { method: "POST", body: JSON.stringify({ gameState: makeGameSnapshot() }) });
    if (!quiet) await say("Game saved to this browser!", 2);
  } catch (error) {
    console.warn("[Account] Save failed:", error.message);
    if (!quiet) await say("Could not save progress in this browser.", 3);
  } finally { cloudSaveBusy = false; }
}
function restoreCloudGame(account) {
  const saved = account?.gameState;
  if (!saved?.hasStarted || !(Number(saved.currentelectromon) >= 1)) return false;
  const mon = Number(saved.currentelectromon);
  const form = Number(saved.currentElectroform) || 1;
  state.currentelectromon = mon;
  state.currentElectroform = form;
  state.electromon.costume = saved.costume || ELECTROMON_BY_INDEX[mon] || "glitchit";
  state.electromon.x = 0; state.electromon.y = 0;
  state.electromon.size = 0.5; state.electromon.direction = 90;
  state.electromonVisible = true;
  state.attack = Number(saved.attack) || 0;
  state.defence = Number(saved.defence) || 0;
  state.hp = Number(saved.hp ?? 100);
  state.hunger = Number(saved.hunger ?? 5);
  state.winRate = Number(saved.winRate) || 0;
  state.money = Number(saved.money ?? account.inventory?.money ?? 50);
  state.ownedItems = Array.isArray(saved.ownedItems) ? saved.ownedItems : [];
  state.trainingLevel = Number(saved.trainingLevel) || 0;
  state.trainingWins = Number(saved.trainingWins) || 0;
  state.bonus = { attack: 0, defence: 0, spattack: 0, speed: 0, ...(saved.bonus || {}) };
  state.spattack = Number(saved.spattack) || 0;
  state.speed = Number(saved.speed) || 0;
  enterOverworld();
  updateHUD();
  startHungerSystem();
  startWandering();
  if (form === 1) startEvolutionTimer();
  return true;
}
window.addEventListener("beforeunload", () => {
  if (authToken() && state.currentelectromon >= 1) {
    try { window.BFAccounts.saveGame(makeGameSnapshot()); } catch (_) { }
  }
});

// ---- Costume / sprite image paths ----
const BACKDROPS = {
  "backdrop1": "./assets/backgrounds/menu-grid.svg",
  "backdrop2": "./assets/backgrounds/intro-screen.png",
  "fight scene": "./assets/backgrounds/fight-scene.png",
};

const ELECTROMON_COSTUMES = {
  "glitchit": "./assets/characters/glitchit.png",
  "scratch-catito": "./assets/characters/scratch-catito.png",
  "green guy": "./assets/characters/green guy.png",
  "blobito": "./assets/characters/blobito.png",
  "bibito": "./assets/characters/bibito.png",
  "an angel octopus": "./assets/characters/an angel octopus.png",
  "alee": "./assets/characters/alee.png",
  "glitchitit": "./assets/characters/glitchitit.png",
  "peak (1)": "./assets/characters/peak (1).svg",
  "blobeatomon": "./assets/characters/blobeatomon.png",
};

// Index to name mapping (1-indexed)
const ELECTROMON_BY_INDEX = {
  1: "glitchit",
  2: "scratch-catito",
  3: "green guy",
  4: "blobito",
  5: "bibito",
  6: "an angel octopus",
  7: "alee",
  8: "glitchitit",
  9: "peak (1)",
  10: "blobeatomon",
};

const ENEMY_COSTUMES = ELECTROMON_COSTUMES;

const EGG_COSTUMES = [
  "./assets/egg/egg1.svg",
  "./assets/egg/egg2.svg",
  "./assets/egg/egg3.svg",
];

const HUNGER_COSTUMES = [
  "./assets/hunger/hunger1.svg",
  "./assets/hunger/hunger2.svg",
  "./assets/hunger/hunger3.png",
  "./assets/hunger/hunger4.png",
  "./assets/hunger/hunger5.png",
  "./assets/hunger/hunger6.png",
];

const FIGHT_RESULT_COSTUMES = {
  "won": "./assets/results/win.svg",
  "lost": "./assets/results/lose.svg",
};

const SOUND_FILES = [
  "./assets/sounds/pop.wav",
  "./assets/sounds/egg-crack.wav",
  "./assets/sounds/eat.wav",
  "./assets/sounds/meow.wav",
  "./assets/sounds/tada.wav",
  "./assets/sounds/beep.wav",
  "./assets/sounds/gameover.wav",
];

const BUTTON_IMAGES = {
  "menu": "./assets/ui/menu.svg",
  "fight": "./assets/ui/stats.svg",
  "battle_start": "./assets/ui/battle.svg",
  "save": "./assets/ui/save.svg",
  "load": "./assets/ui/load.svg",
  "pvp_bg": "./assets/backgrounds/pvp-arena.png",
  "pvp_enter": "./assets/ui/pvp.svg",
  "back": "./assets/ui/back.png",
  "feed": "./assets/ui/feed.svg",
  "gameover": "./assets/ui/gameover.png",
};

// ---- Preload all assets ----
async function preloadAssets() {
  const allImages = [
    ...Object.values(BACKDROPS),
    ...Object.values(ELECTROMON_COSTUMES),
    ...EGG_COSTUMES,
    ...HUNGER_COSTUMES,
    ...Object.values(FIGHT_RESULT_COSTUMES),
    ...Object.values(BUTTON_IMAGES),
  ];
  await Promise.all([
    ...allImages.map(loadImg),
    ...SOUND_FILES.map(loadSound),
  ]);
}

// ---- Speech bubble ----
const speechEl = document.getElementById("speech-bubble");
function say(text, seconds) {
  if (state.speechTimeout) clearTimeout(state.speechTimeout);
  speechEl.textContent = text;
  speechEl.style.display = "block";
  if (seconds > 0) {
    return new Promise((resolve) => {
      state.speechTimeout = setTimeout(() => {
        speechEl.style.display = "none";
        state.speechText = "";
        resolve();
      }, seconds * 1000);
    });
  }
}

function hideSpeech() {
  speechEl.style.display = "none";
  if (state.speechTimeout) clearTimeout(state.speechTimeout);
}

// ---- Prompt (askAndWait) ----
function askAndWait(question) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("prompt-overlay");
    const input = document.getElementById("prompt-input");
    const submit = document.getElementById("prompt-submit");
    const text = document.getElementById("prompt-text");
    text.textContent = question;
    input.value = "";
    overlay.classList.add("active");
    input.focus();

    function done() {
      overlay.classList.remove("active");
      submit.removeEventListener("click", done);
      input.removeEventListener("keydown", keyHandler);
      resolve(input.value);
    }
    function keyHandler(e) { if (e.key === "Enter") done(); }
    submit.addEventListener("click", done);
    input.addEventListener("keydown", keyHandler);
  });
}

// ---- Result overlay ----
const resultEl = document.getElementById("result-overlay");
function showResult(text, color, seconds) {
  resultEl.textContent = text;
  resultEl.style.color = color;
  resultEl.style.background = "rgba(0,0,0,0.7)";
  resultEl.style.border = `2px solid ${color}`;
  resultEl.style.display = "block";
  return wait(seconds).then(() => { resultEl.style.display = "none"; });
}

// ---- HUD ----
const hudEl = document.getElementById("hud");
const hungerBarContainer = document.getElementById("hunger-bar-container");
const hungerBar = document.getElementById("hunger-bar");
const hungerLabel = document.getElementById("hunger-label");

function updateHUD() {
  document.getElementById("hud-atk").textContent = state.attack;
  document.getElementById("hud-def").textContent = state.defence;
  document.getElementById("hud-form").textContent = state.currentElectroform;
  document.getElementById("hud-wins").textContent = state.winRate;
  document.getElementById("hud-money").textContent = state.money;

  // Hunger bar
  const maxHunger = 5;
  const pct = Math.max(0, Math.min(1, state.hunger / maxHunger)) * 100;
  hungerBar.style.width = pct + "%";
}

// The HUD is redrawn every frame, so this just keeps the old call sites working.
function updateMoneyDisplay() {
  updateHUD();
}

// ---- Scratch-to-canvas coordinate helpers ----
function scratchToCanvas(sx, sy) {
  return { x: 240 + sx, y: 180 - sy };
}

// ---- Draw a sprite image centered at scratch coords ----
function drawSprite(imgSrc, sx, sy, scale = 1, directionDeg = 90) {
  const img = imageCache[imgSrc];
  if (!img) return;
  const { x, y } = scratchToCanvas(sx, sy);
  ctx.save();
  ctx.translate(x, y);
  const angle = (directionDeg - 90) * Math.PI / 180;
  if (angle !== 0) ctx.rotate(angle);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---- Smooth glide animation ----
function glide(entity, seconds, targetSX, targetSY) {
  return new Promise((resolve) => {
    const startX = entity.x;
    const startY = entity.y;
    const startTime = performance.now();
    const duration = seconds * 1000;

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      entity.x = startX + (targetSX - startX) * t;
      entity.y = startY + (targetSY - startY) * t;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// ---- Save code mapping ----
const SAVE_CODES_FORM1 = {
  1: "b31", 2: "m67", 3: "366", 4: "a252", 5: "b678", 6: "n11", 7: "b54",
};
const SAVE_CODES_FORM2 = {
  1: "b32", 2: "m68", 3: "367", 4: "a251", 5: "b679", 6: "n12", 7: "b55",
};

// ---- Core game rendering ----
function render() {
  ctx.clearRect(0, 0, 480, 360);

  // Draw backdrop
  const bd = imageCache[BACKDROPS[state.backdrop]];
  if (bd) ctx.drawImage(bd, 0, 0, 480, 360);

  // Draw hunger indicator (top-left)
  if (state.phase === "overworld" || state.phase === "battle") {
    const hungerIdx = getHungerCostumeIndex();
    const hImg = imageCache[HUNGER_COSTUMES[hungerIdx]];
    if (hImg) {
      const hScale = 0.14;
      const hw = hImg.naturalWidth * hScale;
      const hh = hImg.naturalHeight * hScale;
      ctx.drawImage(hImg, 8, 34, hw, hh);
    }
  }

  // Draw electromon
  if (state.electromonVisible && state.electromon.costume) {
    const src = ELECTROMON_COSTUMES[state.electromon.costume];
    if (src) {
      drawSprite(src, state.electromon.x, state.electromon.y, state.electromon.size, state.electromon.direction || 90);
    }
  }

  // Draw enemy
  if (state.enemyVisible && state.enemy.costume) {
    const src = ENEMY_COSTUMES[state.enemy.costume];
    if (src) {
      drawSprite(src, state.enemy.x, state.enemy.y, state.enemy.size, state.enemy.direction || 90);
    }
  }

  // Draw egg (hatching phase)
  if (state.phase === "hatching" && state.egg.visible) {
    const eggSrc = EGG_COSTUMES[state.egg.costume];
    if (eggSrc) {
      ctx.save();
      if (state.egg.brightness > 0) {
        ctx.globalAlpha = Math.max(0, 1 - state.egg.brightness / 100);
      }
      const eggImg = imageCache[eggSrc];
      if (eggImg) {
        const { x, y } = scratchToCanvas(state.egg.x - 240, state.egg.y - 180);
        const rot = state.egg.direction * Math.PI / 180;
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.drawImage(eggImg, -eggImg.naturalWidth / 2, -eggImg.naturalHeight / 2);
        ctx.restore();
      } else {
        ctx.restore();
      }
    }
  }

  // Draw game over sprite
  if (state.phase === "gameover") {
    const goImg = imageCache[BUTTON_IMAGES["gameover"]];
    if (goImg) {
      const scale = 5;
      const w = goImg.naturalWidth * scale;
      const h = goImg.naturalHeight * scale;
      ctx.drawImage(goImg, 240 - w / 2, 180 - h / 2, w, h);
    }
  }

  updateHUD();
  requestAnimationFrame(render);
}

function getHungerCostumeIndex() {
  if (state.hunger >= 5) return 0;
  if (state.hunger === 4) return 1;
  if (state.hunger === 3) return 2;
  if (state.hunger === 2) return 3;
  if (state.hunger === 1) return 4;
  return 5;
}

// ---- Button references ----
const btnMenu = document.getElementById("btn-menu");
const btnBattle = document.getElementById("btn-battle");
const btnFeed = document.getElementById("btn-feed");
const menuPanel = document.getElementById("menu-panel");

// ---- Egg hatching sequence ----
async function hatchSequence() {
  state.phase = "hatching";
  state.egg.visible = true;
  state.egg.costume = 0;
  state.egg.x = 244;
  state.egg.y = 133;
  state.egg.direction = 0;

  // Wobble animation
  for (let i = 0; i < 3; i++) {
    state.egg.direction = 15;
    await wait(0.5);
    state.egg.direction = -15;
    await wait(0.5);
  }
  state.egg.direction = 15;
  await wait(0.5);
  state.egg.direction = 0;

  // Cracking
  state.egg.costume = 1;
  playSound("./assets/sounds/egg-crack.wav");
  await wait(0.5);
  state.egg.costume = 2;
  playSound("./assets/sounds/egg-crack.wav");
  await wait(1);

  // Fade out
  for (let i = 0; i < 10; i++) {
    state.egg.brightness += 10;
    await wait(0.03);
  }
  state.egg.visible = false;

  await hatchElectromon();
}

// ---- Hatch electromon ----
async function hatchElectromon() {
  state.currentelectromon = randomInt(1, 5);
  const costumeName = ELECTROMON_BY_INDEX[state.currentelectromon];
  state.electromon.costume = costumeName;
  state.electromon.x = 0;
  state.electromon.y = 0;
  state.electromon.size = 0.5;
  state.electromon.direction = 90;
  state.electromonVisible = true;
  playSound("./assets/sounds/tada.wav");

  setElectromonStats(state.currentelectromon, 1);
  state.currentElectroform = 1;

  const names = { 1: "Glitchit", 2: "Scratch-Cat", 3: "Green Guy", 4: "Blobitomon", 5: "Bibitomon" };
  await say(`You hatched ${names[state.currentelectromon] || "???"}!`, 2);

  enterOverworld();
  startEvolutionTimer();
  startHungerSystem();
  startWandering();
}

// Base [attack, defence] per form -> electromon. Store bonuses are added on top.
const BASE_STATS = {
  1: { 1: [20, 20], 2: [15, 20], 3: [10, 30], 4: [25, 25], 5: [30, 15] },
  2: { 1: [25, 55], 3: [20, 60], 4: [35, 35] },
};

function setElectromonStats(mon, form) {
  const base = BASE_STATS[form] && BASE_STATS[form][mon];
  if (!base) return;
  state.attack = base[0] + state.bonus.attack;
  state.defence = base[1] + state.bonus.defence;
}

// ---- Overworld ----
function enterOverworld() {
  state.phase = "overworld";
  state.backdrop = "fight scene";
  hudEl.style.display = "flex";
  hungerBarContainer.style.display = "block";
  hungerLabel.style.display = "block";
  btnBattle.style.display = "block";
  btnFeed.style.display = "block";
  btnMenu.style.display = "block";
}

// ---- Wandering ----
let wanderInterval = null;
function startWandering() {
  if (wanderInterval) clearInterval(wanderInterval);
  doWander();
}

async function doWander() {
  while (state.phase === "overworld" || state.phase === "battle") {
    if (state.wandering === 1 && state.electromonVisible && state.phase === "overworld") {
      const tx = randomInt(-200, 200);
      const ty = randomInt(-120, 120);
      await glide(state.electromon, 2, tx, ty);
      await wait(1);
    } else {
      await wait(0.5);
    }
  }
}

// ---- Evolution timer ----
async function startEvolutionTimer() {
  const evolvable = [1, 3, 4];
  if (!evolvable.includes(state.currentelectromon)) return;

  const delays = { 1: 60, 3: 60, 4: 120 };
  const delay = delays[state.currentelectromon];
  await wait(delay);

  if (state.currentElectroform >= 2) return;
  state.currentElectroform = 2;
  playSound("./assets/sounds/tada.wav");

  if (state.currentelectromon === 1) {
    state.electromon.costume = "glitchitit";
    setElectromonStats(1, 2);
    await say("Your Glitchit evolved into Gloopus!", 3);
  } else if (state.currentelectromon === 3) {
    state.electromon.costume = "alee";
    setElectromonStats(3, 2);
    await say("Your Green Guy evolved into Alee!", 3);
  } else if (state.currentelectromon === 4) {
    state.electromon.costume = "blobeatomon";
    setElectromonStats(4, 2);
    await say("Your Blobitomon evolved into Blobeatomon!", 3);
  }
}

// ---- Hunger system ----
let hungerTimerId = null;
function startHungerSystem() {
  state.time = 0;
  hungerTimerId = setInterval(() => {
    if (state.phase === "gameover") { clearInterval(hungerTimerId); return; }
    state.time++;
    const drops = [20, 41, 60, 80, 100, 120, 140, 160];
    if (drops.includes(state.time)) {
      state.hunger--;
    }
    if (state.time >= 161) state.time = 1;

    if (state.hunger <= -1) {
      gameOver();
    }
  }, 1000);
}

function gameOver() {
  state.phase = "gameover";
  state.electromonVisible = false;
  state.enemyVisible = false;
  state.backdrop = "fight scene";
  btnBattle.style.display = "none";
  btnFeed.style.display = "none";
  hungerBarContainer.style.display = "none";
  hungerLabel.style.display = "none";
  hudEl.style.display = "none";
  playSound("./assets/sounds/gameover.wav");
  say("Your electromon ran out of hunger...", 5);
}

// ---- Feed button ----
btnFeed.addEventListener("click", () => {
  if (state.phase !== "overworld") return;
  state.hunger++;
  if (state.hunger > 6) state.hunger = 6;
  playSound("./assets/sounds/eat.wav");
  say("NOM NOM NOM!", 1.5);
});

// ---- Menu ----
btnMenu.addEventListener("click", () => {
  if (state.phase === "hatching" || state.phase === "gameover") return;
  if (menuPanel.classList.contains("active")) {
    closeMenu();
  } else {
    openMenu();
  }
});

function openMenu() {
  menuPanel.classList.add("active");
  state.backdrop = "backdrop1";
  btnBattle.style.display = "none";
  btnFeed.style.display = "none";
}

function closeMenu() {
  menuPanel.classList.remove("active");
  state.backdrop = "fight scene";
  if (state.phase === "overworld") {
    btnBattle.style.display = "block";
    btnFeed.style.display = "block";
  }
}

document.getElementById("menu-close").addEventListener("click", closeMenu);

// ---- Store ----
// store.html runs in an iframe overlay and talks to the game via postMessage.
// The game owns money / inventory / stats; the shop only requests purchases.
const storeOverlay = document.getElementById("store-overlay");
const storeFrame = document.getElementById("store-frame");

function openStore() {
  closeMenu();
  storeFrame.src = "store.html"; // reload each time so it always starts fresh
  storeOverlay.classList.add("active");
}

function closeStore() {
  storeOverlay.classList.remove("active");
  storeFrame.src = "about:blank";
}

function ownedCounts() {
  const counts = {};
  for (const id of state.ownedItems) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

function sendStoreState(extra) {
  if (!storeFrame.contentWindow) return;
  storeFrame.contentWindow.postMessage(
    { type: "store-state", money: state.money, owned: ownedCounts(), ...extra }, "*");
}

function applyItem(item) {
  for (const stat of ["attack", "defence", "spattack", "speed"]) {
    if (item[stat]) {
      state[stat] += item[stat];
      state.bonus[stat] += item[stat];
    }
  }
  if (item.healAmount) state.hp += item.healAmount;
}

function buyItem(id) {
  const item = STORE_ITEMS.find(i => i.id === id);
  if (!item) return;
  if (state.money < item.price) {
    playSound("./assets/sounds/beep.wav");
    sendStoreState({ ok: false, message: "Not enough money!" });
    return;
  }
  state.money -= item.price;
  state.ownedItems.push(item.id);
  saveCloudGame(true);
  playSound("./assets/sounds/pop.wav");
  sendStoreState({ ok: true, message: `Bought ${item.name}!` });
}

window.addEventListener("message", (e) => {
  if (e.source !== storeFrame.contentWindow) return;
  const msg = e.data || {};
  if (msg.type === "store-ready") sendStoreState();
  else if (msg.type === "store-buy") buyItem(msg.id);
  else if (msg.type === "store-close") closeStore();
});

document.getElementById("menu-store").addEventListener("click", openStore);

// ---- Inventory ----
const inventoryOverlay = document.getElementById("inventory-overlay");
const inventoryItemsEl = document.getElementById("inventory-items");
const inventorySummaryEl = document.getElementById("inventory-summary");
const inventoryMessageEl = document.getElementById("inventory-message");

function openInventory() {
  closeMenu();
  renderInventory();
  inventoryOverlay.classList.add("active");
  inventoryOverlay.setAttribute("aria-hidden", "false");
}
function closeInventory() {
  inventoryOverlay.classList.remove("active");
  inventoryOverlay.setAttribute("aria-hidden", "true");
}
function renderInventory() {
  const counts = ownedCounts();
  inventorySummaryEl.textContent = `ITEMS: ${state.ownedItems.length}  |  CREDITS: ${state.money}  |  HP: ${state.hp}`;
  const available = STORE_ITEMS.filter(item => (counts[item.id] || 0) > 0);
  if (!available.length) {
    inventoryItemsEl.innerHTML = '<p class="inventory-empty">Your inventory is empty. Visit the Store to buy items.</p>';
    return;
  }
  inventoryItemsEl.innerHTML = available.map(item => {
    const effects = [];
    if (item.healAmount) effects.push(`Restore ${item.healAmount} HP`);
    if (item.attack) effects.push(`+${item.attack} ATK`);
    if (item.defence) effects.push(`+${item.defence} DEF`);
    if (item.spattack) effects.push(`+${item.spattack} SP. ATK`);
    if (item.speed) effects.push(`+${item.speed} SPD`);
    return `<article class="inventory-card" style="--item-color:${item.color}">
      <div class="inventory-item-icon"><img src="./assets/ui/${item.healAmount ? 'feed' : 'stats'}.svg" alt=""></div>
      <div class="inventory-item-copy"><h3>${item.name}</h3><p>${effects.join(' · ')}</p><small>Quantity: ${counts[item.id]}</small></div>
      <button class="inventory-use" data-use-item="${item.id}"><img src="./assets/ui/ok.svg" alt=""> USE</button>
    </article>`;
  }).join("");
}
function useInventoryItem(id) {
  const index = state.ownedItems.indexOf(id);
  const item = STORE_ITEMS.find(entry => entry.id === id);
  if (index < 0 || !item) return;
  if (item.healAmount && state.hp >= 100) {
    inventoryMessageEl.textContent = "HP is already full. Save the potion for later.";
    return;
  }
  state.ownedItems.splice(index, 1);
  applyItem(item);
  if (item.healAmount) state.hp = Math.min(100, state.hp);
  updateHUD();
  saveCloudGame(true);
  inventoryMessageEl.textContent = `${item.name} used successfully!`;
  renderInventory();
}
document.getElementById("menu-inventory").addEventListener("click", openInventory);
document.getElementById("inventory-close").addEventListener("click", closeInventory);
document.getElementById("inventory-back").addEventListener("click", () => { closeInventory(); openMenu(); });
inventoryItemsEl.addEventListener("click", event => {
  const button = event.target.closest("[data-use-item]");
  if (button) useInventoryItem(button.dataset.useItem);
});

// ---- Save code ----
document.getElementById("menu-save").addEventListener("click", async () => {
  const mon = state.currentelectromon;
  const form = state.currentElectroform;
  let code = "???";
  if (form === 1 && SAVE_CODES_FORM1[mon]) code = SAVE_CODES_FORM1[mon];
  if (form === 2 && SAVE_CODES_FORM2[mon]) code = SAVE_CODES_FORM2[mon];
  closeMenu();
  await saveCloudGame(true);
  await say(`Your save code is: ${code}\\nProgress synced to your account.`, 5);
});

// ---- Load save ----
document.getElementById("menu-load").addEventListener("click", async () => {
  closeMenu();
  const answer = await askAndWait("Enter save code:");
  const loadMap = {
    "g125": { mon: 1, form: 1, costume: "glitchit" },
    "m67": { mon: 2, form: 1, costume: "scratch-catito" },
    "366": { mon: 3, form: 1, costume: "green guy" },
    "a52": { mon: 4, form: 1, costume: "blobito" },
    "b678": { mon: 5, form: 1, costume: "bibito" },
    "n11": { mon: 6, form: 1, costume: "an angel octopus" },
    "a251": { mon: 4, form: 2, costume: "blobeatomon" },
  };
  const entry = loadMap[answer];
  if (entry) {
    state.currentelectromon = entry.mon;
    state.currentElectroform = entry.form;
    state.electromon.costume = entry.costume;
    setElectromonStats(entry.mon, entry.form);
    state.electromonVisible = true;
    if (state.phase !== "overworld") enterOverworld();
    await say(`Loaded ${entry.costume}!`, 2);
    if (entry.form === 1) startEvolutionTimer();
  } else {
    await say("Invalid code!", 2);
  }
});

// ---- Training integrated into the main game ----
const trainingOverlay = document.getElementById("training-overlay");
const trainingResult = document.getElementById("training-result");
const trainingLog = document.getElementById("training-log");
let trainingEnemy = { name: "Training Bot", hp: 80, atk: 5 };

function refreshTrainingStats() {
  document.getElementById("training-atk").textContent = state.attack;
  document.getElementById("training-def").textContent = state.defence;
  document.getElementById("training-hp").textContent = state.hp;
}
function openTraining() {
  closeMenu();
  trainingOverlay.classList.add("active");
  trainingOverlay.setAttribute("aria-hidden", "false");
  trainingResult.textContent = "Choose a training protocol to begin.";
  refreshTrainingStats();
}
function closeTraining() {
  trainingOverlay.classList.remove("active");
  trainingOverlay.setAttribute("aria-hidden", "true");
}
document.getElementById("menu-training").addEventListener("click", openTraining);
document.getElementById("training-close").addEventListener("click", closeTraining);
document.getElementById("training-back").addEventListener("click", () => {
  closeTraining();
  openMenu();
});
document.querySelectorAll("[data-training]").forEach(button => {
  button.addEventListener("click", async () => {
    if (state.currentelectromon < 1) {
      trainingResult.textContent = "Hatch an Electromon first to train it.";
      return;
    }
    const playerChoice = button.dataset.training;
    const choices = ["antivirus", "data", "virus"];
    const computerChoice = choices[Math.floor(Math.random() * choices.length)];
    const wins = (playerChoice === "antivirus" && computerChoice === "virus") ||
      (playerChoice === "data" && computerChoice === "antivirus") ||
      (playerChoice === "virus" && computerChoice === "data");
    const ties = playerChoice === computerChoice;
    if (wins) {
      state.attack += 2;
      state.defence += 1;
      state.trainingWins = (state.trainingWins || 0) + 1;
      state.trainingLevel = Math.floor(state.trainingWins / 3);
      trainingResult.textContent = `Training success! ${playerChoice.toUpperCase()} beats ${computerChoice.toUpperCase()}: +2 ATK, +1 DEF.`;
    } else if (ties) {
      trainingResult.textContent = `Draw! Both selected ${playerChoice.toUpperCase()}. No stats changed.`;
    } else {
      state.defence = Math.max(0, state.defence - 1);
      trainingResult.textContent = `Training failed: ${computerChoice.toUpperCase()} countered ${playerChoice.toUpperCase()}. -1 DEF.`;
    }
    refreshTrainingStats();
    updateHUD();
    await saveCloudGame(true);
  });
});
document.getElementById("training-fight").addEventListener("click", async () => {
  if (state.currentelectromon < 1) {
    trainingResult.textContent = "Hatch an Electromon first to train it.";
    return;
  }
  let damage = Math.max(1, state.attack + randomInt(0, 5) - Math.floor(trainingEnemy.atk / 3));
  trainingEnemy.hp -= damage;
  let line = `You dealt ${damage} damage to ${trainingEnemy.name}. `;
  if (trainingEnemy.hp <= 0) {
    trainingEnemy = { name: ["Glitch", "Scavenger Bug", "Firewall Guard"][randomInt(0, 2)], hp: randomInt(50, 90), atk: randomInt(5, 10) };
    state.attack += 2;
    state.trainingWins = (state.trainingWins || 0) + 1;
    state.trainingLevel = Math.floor(state.trainingWins / 3);
    line += `Bot defeated! +2 ATK. New opponent: ${trainingEnemy.name} (${trainingEnemy.hp} HP).`;
  } else {
    const incoming = Math.max(1, trainingEnemy.atk + randomInt(0, 5) - state.defence);
    state.hp = Math.max(0, state.hp - incoming);
    line += `${trainingEnemy.name} hit you for ${incoming}.`;
    if (state.hp <= 0) {
      state.hp = 100;
      line += " Your Electromon recovered to 100 HP.";
    }
  }
  trainingLog.textContent = line;
  trainingResult.textContent = `Training Bot: ${trainingEnemy.hp} HP remaining.`;
  refreshTrainingStats();
  updateHUD();
  await saveCloudGame(true);
});

// ---- Stats ----
document.getElementById("menu-stats").addEventListener("click", async () => {
  closeMenu();
  const names = ELECTROMON_BY_INDEX;
  const mon = names[state.currentelectromon] || "None";
  await say(
    `Mon: ${mon} | ATK: ${state.attack} | DEF: ${state.defence} | Form: ${state.currentElectroform} | Wins: ${state.winRate} | Money: ${state.money}`,
    5
  );
});

// ---- PVP ----
document.getElementById("menu-pvp").addEventListener("click", async () => {
  closeMenu();
  const answer = await askAndWait("What's your opponent's save code?");
  const pvpMap = {
    "g125": { atk: 20, def: 10, costume: "glitchit" },
    "m67": { atk: 30, def: 25, costume: "scratch-catito" },
    "366": { atk: 53, def: 20, costume: "green guy" },
    "a52": { atk: 5, def: 3, costume: "blobito" },
    "b678": { atk: 20, def: 10, costume: "bibito" },
    "n11": { atk: 6, def: 7, costume: "an angel octopus" },
  };
  const entry = pvpMap[answer];
  if (entry) {
    state.eAtack = entry.atk;
    state.eDefence = entry.def;
    state.enemy.costume = entry.costume;
    state.enemyVisible = true;
    state.enemy.x = 152;
    state.enemy.y = 42;
    state.enemy.size = 0.45;

    state.electromon.x = -126;
    state.electromon.y = -113;
    state.wandering = 0;

    await say("PVP Battle!", 2);
    determineWinLose();
    await runBattleAnimation();
  } else {
    await say("Invalid code!", 2);
  }
});

// ---- Random battle ----
btnBattle.addEventListener("click", async () => {
  if (state.phase !== "overworld" || state.animating) return;
  state.animating = true;
  state.wandering = 0;
  btnBattle.style.display = "none";
  btnFeed.style.display = "none";
  state.phase = "battle";

  const enemies = [
    { costume: "an angel octopus", atk: 26, def: 31 },
    { costume: "bibito", atk: 10, def: 5 },
    { costume: "blobito", atk: 25, def: 25 },
    { costume: "glitchitit", atk: 1, def: 1 },
    { costume: "green guy", atk: 20, def: 15 },
    { costume: "scratch-catito", atk: 10, def: 20 },
    { costume: "alee", atk: 26, def: 31 },
    { costume: "alee", atk: 26, def: 31 },
    { costume: "bibito", atk: 10, def: 5 },
  ];
  const chosen = enemies[randomInt(0, enemies.length - 1)];

  state.eAtack = chosen.atk;
  state.eDefence = chosen.def;
  state.enemy.costume = chosen.costume;
  state.enemy.x = 175;
  state.enemy.y = 85;
  state.enemy.size = 0.45;
  state.enemy.direction = 90;
  state.enemyVisible = true;

  await wait(1);
  determineWinLose();
  await runBattleAnimation();
  state.hunger--;
  state.animating = false;
});

function determineWinLose() {
  if (state.attack > state.eDefence) {
    const r = randomInt(1, 3);
    state.winLoose = (r <= 2) ? 1 : -1;
  } else if (state.eAtack > state.defence) {
    const r = randomInt(1, 3);
    state.winLoose = (r <= 2) ? -1 : 1;
  } else {
    state.winLoose = (randomInt(1, 2) === 1) ? 1 : -1;
  }
}

async function runBattleAnimation() {
  if (state.winLoose === 1) {
    state.electromon.x = -157;
    state.electromon.y = -103;

    for (let i = 0; i < 4; i++) {
      await glide(state.electromon, 1, 163, 67);
      await glide(state.electromon, 1, -157, -103);
      if (i < 3) await wait(1);
      await say(`${names[enemy.currentelectromon] || "???"}!`, "did ${damage}");
    }

    await say(`${names[state.currentelectromon] || "???"}!`, "did ${damage}");
    state.money += 50;
    updateMoneyDisplay();

    for (let i = 0; i < 3; i++) {
      await glide(state.electromon, 0.5, -162, -40);
      await glide(state.electromon, 0.5, -157, -103);
    }

    state.attack++;
    state.winRate++;

    for (let i = 0; i < 3; i++) {
      await glide(state.enemy, 0.5, 176, 104);
      await glide(state.enemy, 0.5, 175, 85);
    }
    state.enemyVisible = false;

  } else {
    state.electromon.x = -157;
    state.electromon.y = -103;
    state.enemy.x = 175;
    state.enemy.y = 85;

    await wait(1);

    for (let i = 0; i < 2; i++) {
      await glide(state.electromon, 1, 163, 67);
      await glide(state.electromon, 1, -157, -103);
      await wait(1);
    }

    for (let i = 0; i < 4; i++) {
      await glide(state.enemy, 1, -141, -92);
      await glide(state.enemy, 1, 175, 85);
      if (i < 3) await wait(1);
    }

    await showResult("YOU LOSE! money - 25", "#e74c3c", 2);
    state.money -= 25;
    updateMoneyDisplay();

    state.electromon.direction = (state.electromon.direction || 90) - 90;
    await wait(2);
    state.electromonVisible = false;
    state.electromon.direction = 90;
    state.enemyVisible = false;
    await wait(1);
    state.electromonVisible = true;
    state.winRate--;
  }

  state.wandering = 1;
  state.phase = "overworld";
  state.enemyVisible = false;
  btnBattle.style.display = "block";
  btnFeed.style.display = "block";
  startWandering();
}

// ---- Start game ----
async function startGame() {
  ctx.fillStyle = "#0a0a1a";
  ctx.fillRect(0, 0, 480, 360);
  ctx.fillStyle = "#6c5ce7";
  ctx.font = "14px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillText("LOADING...", 240, 180);

  if (!authToken()) {
    location.href = "Signin.html";
    return;
  }
  await preloadAssets();

  let accountData = null;
  try {
    const me = await apiRequest("/api/me");
    accountData = me.account;
  } catch (error) {
    console.warn("[Account] Could not load account:", error.message);
    return;
  }

  state.phase = "hatching";
  state.backdrop = "fight scene";
  state.currentelectromon = 0;
  state.attack = 0;
  state.defence = 0;
  state.currentElectroform = 0;
  state.eAtack = 0;
  state.eDefence = 0;
  state.winRate = 0;
  state.hunger = 5;
  state.time = 0;
  state.electromonVisible = false;
  state.enemyVisible = false;
  btnBattle.style.display = "none";
  btnFeed.style.display = "none";
  hudEl.style.display = "none";
  hungerBarContainer.style.display = "none";
  hungerLabel.style.display = "none";

  requestAnimationFrame(render);

  // Restore the signed-in player's cloud save instead of hatching a new monster.
  if (!restoreCloudGame(accountData)) {
    await wait(1);
    await hatchSequence();
    await saveCloudGame(true);
  }
  if (cloudSaveTimer) clearInterval(cloudSaveTimer);
  cloudSaveTimer = setInterval(() => saveCloudGame(true), 15000);
}

startGame();
