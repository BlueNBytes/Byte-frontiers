// =====================================================
// BYTE FRONTIERS — Account & Game Server
// =====================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "accounts.json");
const JSONHOST_ENDPOINT = "https://jsonhost.com/json/a711797219a48f4f07ab7bdcb13e0fc4";

// ---- In-Memory DB Cache ----
let database = { accounts: [] };

// ---- Password Hashing (PBKDF2) ----
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return hash === originalHash;
}

function generateToken() {
  return "tok_" + crypto.randomBytes(18).toString("hex");
}

// ---- Load & Save Database ----
async function initDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      database = JSON.parse(raw);
      console.log(`[DB] Loaded ${database.accounts ? database.accounts.length : 0} accounts from ${DB_FILE}`);
      return;
    } catch (err) {
      console.warn("[DB] Error reading local accounts.json, will attempt remote fetch:", err.message);
    }
  }

  // Fetch initial seed from jsonhost endpoint
  console.log(`[DB] Fetching initial seed data from ${JSONHOST_ENDPOINT}...`);
  try {
    const res = await fetch(JSONHOST_ENDPOINT);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.accounts)) {
        database = data;
        saveDatabase();
        console.log(`[DB] Successfully seeded ${database.accounts.length} accounts from jsonhost!`);
        return;
      }
    }
  } catch (err) {
    console.warn("[DB] Could not reach jsonhost:", err.message);
  }

  // Do not seed placeholder sample credentials: they contain example hashes and
  // would create accounts nobody can actually log into.
  database = { accounts: [] };
  saveDatabase();
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), "utf-8");
  } catch (err) {
    console.error("[DB] Failed to save accounts.json:", err.message);
  }
}

// ---- Auth Helpers ----
function findAccountByToken(token) {
  if (!token) return null;
  return database.accounts.find(
    (a) => a.auth && a.auth.sessionToken === token
  );
}

function findAccountByUsername(username) {
  if (!username) return null;
  return database.accounts.find(
    (a) => a.username.toLowerCase() === username.toLowerCase()
  );
}

// Helper to sanitize account info returned to client (never return password hash)
function sanitizeAccount(account) {
  if (!account) return null;
  const clone = JSON.parse(JSON.stringify(account));
  if (clone.auth && clone.auth.passwordHash) {
    delete clone.auth.passwordHash;
  }
  return clone;
}

// ---- Request Body Parser ----
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy(); // 1MB limit
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(payload);
}

// ---- MIME Types for Static Files ----
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
};

// ---- HTTP Server ----
const server = http.createServer(async (req, res) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // ==========================================
  // API ROUTES
  // ==========================================

  // --- POST /api/register ---
  if (pathname === "/api/register" && req.method === "POST") {
    try {
      const { username, password, email } = await parseJsonBody(req);
      if (!username || !password) {
        return sendJson(res, 400, { error: "Username and password are required" });
      }
      if (username.length < 3 || username.length > 20) {
        return sendJson(res, 400, { error: "Username must be 3-20 characters long" });
      }
      if (password.length < 4) {
        return sendJson(res, 400, { error: "Password must be at least 4 characters long" });
      }

      if (findAccountByUsername(username)) {
        return sendJson(res, 409, { error: "Username is already taken" });
      }

      const token = generateToken();
      const newAccount = {
        accountId: "acc_bf_" + crypto.randomBytes(4).toString("hex"),
        username: username.trim(),
        email: email || `${username.trim().toLowerCase()}@bytefrontiers.local`,
        auth: {
          passwordHash: hashPassword(password),
          sessionToken: token,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        },
        activeElectromon: {
          monId: 1,
          species: "glitchit",
          nickname: username,
          form: 1,
          costume: "glitchit",
          stats: {
            attack: 20,
            defence: 20,
            hp: 100,
            maxHp: 100,
            hunger: 5,
            maxHunger: 6,
          },
          evolution: {
            canEvolve: true,
            hasEvolved: false,
            evolvedFormName: "Gloopus",
          },
          saveCode: "b31",
        },
        partyStorage: [],
        battleRecord: {
          totalBattles: 0,
          pve: { wins: 0, losses: 0 },
          pvp: { wins: 0, losses: 0, rating: 1000 },
          winRate: 0,
        },
        inventory: {
          money: 50,
          food: { meat: 5 },
          items: [],
        },
        settings: {
          sfxVolume: 0.8,
          soundEnabled: true,
          autoSave: true,
        },
      };

      database.accounts.push(newAccount);
      saveDatabase();

      return sendJson(res, 201, {
        success: true,
        message: "Account created successfully",
        token,
        account: sanitizeAccount(newAccount),
      });
    } catch (err) {
      return sendJson(res, 400, { error: "Invalid request payload" });
    }
  }

  // --- POST /api/login ---
  if (pathname === "/api/login" && req.method === "POST") {
    try {
      const { username, password } = await parseJsonBody(req);
      if (!username || !password) {
        return sendJson(res, 400, { error: "Username and password are required" });
      }

      const account = findAccountByUsername(username);
      if (!account || !account.auth) {
        return sendJson(res, 401, { error: "Invalid username or password" });
      }

      const isValid = verifyPassword(password, account.auth.passwordHash);
      if (!isValid) {
        return sendJson(res, 401, { error: "Invalid username or password" });
      }

      const token = generateToken();
      account.auth.sessionToken = token;
      account.auth.lastLogin = new Date().toISOString();
      saveDatabase();

      return sendJson(res, 200, {
        success: true,
        message: "Login successful",
        token,
        account: sanitizeAccount(account),
      });
    } catch (err) {
      return sendJson(res, 400, { error: "Invalid request payload" });
    }
  }

  // --- GET /api/me ---
  if (pathname === "/api/me" && req.method === "GET") {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || url.searchParams.get("token");
    const account = findAccountByToken(token);

    if (!account) {
      return sendJson(res, 401, { error: "Unauthorized or invalid session token" });
    }

    return sendJson(res, 200, {
      success: true,
      account: sanitizeAccount(account),
    });
  }

  // --- POST /api/save ---
  if (pathname === "/api/save" && req.method === "POST") {
    try {
      const authHeader = req.headers.authorization || "";
      const { token: bodyToken, gameState } = await parseJsonBody(req);
      const token = authHeader.replace(/^Bearer\s+/i, "") || bodyToken;
      const account = findAccountByToken(token);

      if (!account) {
        return sendJson(res, 401, { error: "Unauthorized or session expired" });
      }

      if (!gameState) {
        return sendJson(res, 400, { error: "No gameState provided" });
      }

      // Store the complete allow-listed game snapshot so progress can be restored
      // across browsers/devices after signing into the same account.
      const allowedKeys = [
        "currentelectromon", "currentElectroform", "attack", "defence", "hp",
        "hunger", "winRate", "money", "ownedItems", "bonus", "spattack", "speed",
        "costume", "saveCode", "hasStarted"
      ];
      const snapshot = {};
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(gameState, key)) snapshot[key] = gameState[key];
      }
      if (Array.isArray(snapshot.ownedItems)) snapshot.ownedItems = snapshot.ownedItems.filter(x => typeof x === "string").slice(0, 500);
      if (snapshot.bonus && typeof snapshot.bonus === "object") {
        snapshot.bonus = Object.fromEntries(["attack","defence","spattack","speed"].map(k => [k, Number(snapshot.bonus[k]) || 0]));
      }
      account.gameState = { ...(account.gameState || {}), ...snapshot };

      const monId = Number(snapshot.currentelectromon);
      if (Number.isInteger(monId) && monId >= 1 && monId <= 10) account.activeElectromon.monId = monId;
      if (Number.isInteger(Number(snapshot.currentElectroform)) && Number(snapshot.currentElectroform) >= 1) account.activeElectromon.form = Number(snapshot.currentElectroform);
      if (typeof snapshot.costume === "string") account.activeElectromon.costume = snapshot.costume;
      account.activeElectromon.stats = {
        ...(account.activeElectromon.stats || {}),
        attack: Number(snapshot.attack ?? account.activeElectromon.stats?.attack ?? 20),
        defence: Number(snapshot.defence ?? account.activeElectromon.stats?.defence ?? 20),
        hp: Number(snapshot.hp ?? account.activeElectromon.stats?.hp ?? 100),
        maxHp: Number(account.activeElectromon.stats?.maxHp ?? 100),
        hunger: Number(snapshot.hunger ?? account.activeElectromon.stats?.hunger ?? 5),
        maxHunger: 6
      };
      if (typeof snapshot.saveCode === "string") account.activeElectromon.saveCode = snapshot.saveCode;
      if (snapshot.winRate !== undefined) account.battleRecord.winRate = Number(snapshot.winRate) || 0;
      if (!account.inventory) account.inventory = { money: 0, items: [] };
      if (snapshot.money !== undefined) account.inventory.money = Number(snapshot.money) || 0;
      if (Array.isArray(snapshot.ownedItems)) account.inventory.items = snapshot.ownedItems;
      account.auth.lastSaved = new Date().toISOString();
      saveDatabase();

      return sendJson(res, 200, {
        success: true,
        message: "Game state saved successfully",
        account: sanitizeAccount(account),
      });
    } catch (err) {
      return sendJson(res, 400, { error: "Failed to save game state: " + err.message });
    }
  }

  // --- GET /api/load ---
  if (pathname === "/api/load" && req.method === "GET") {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || url.searchParams.get("token");
    const account = findAccountByToken(token);

    if (!account) {
      return sendJson(res, 401, { error: "Unauthorized or invalid session token" });
    }

    return sendJson(res, 200, {
      success: true,
      account: sanitizeAccount(account),
    });
  }

  // --- POST /api/sync-endpoint ---
  if (pathname === "/api/sync-endpoint" && req.method === "POST") {
    try {
      const resRemote = await fetch(JSONHOST_ENDPOINT);
      if (resRemote.ok) {
        const data = await resRemote.json();
        if (data && Array.isArray(data.accounts)) {
          // Merge remote accounts
          data.accounts.forEach((remoteAcc) => {
            const idx = database.accounts.findIndex(
              (a) => a.username.toLowerCase() === remoteAcc.username.toLowerCase()
            );
            if (idx === -1) {
              database.accounts.push(remoteAcc);
            }
          });
          saveDatabase();
          return sendJson(res, 200, {
            success: true,
            totalAccounts: database.accounts.length,
            message: "Synchronized with jsonhost endpoint successfully",
          });
        }
      }
      return sendJson(res, 502, { error: "Failed to fetch valid data from jsonhost" });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // ==========================================
  // STATIC FILE SERVER
  // ==========================================
  let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ---- Initialize & Start ----
initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`=====================================================`);
    console.log(` BYTE FRONTIERS SERVER RUNNING AT:`);
    console.log(` http://localhost:${PORT}`);
    console.log(` Connected endpoint: ${JSONHOST_ENDPOINT}`);
    console.log(`=====================================================`);
  });
});
