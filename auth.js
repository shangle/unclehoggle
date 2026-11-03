const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cortex = require('./cortex');

const ENV_PATH = path.join(__dirname, '.env');

function getOrGenerateSecret() {
  if (process.env.HOGGLE_SECRET) {
    return process.env.HOGGLE_SECRET;
  }
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const match = content.match(/^HOGGLE_SECRET=(.+)$/m);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.appendFileSync(ENV_PATH, `HOGGLE_SECRET=${newSecret}\n`, 'utf8');
  } catch (e) {
    console.warn("[Auth] Could not write to .env:", e.message);
  }
  return newSecret;
}

const HOGGLE_SECRET = getOrGenerateSecret();
const WINDOW_MS = 30000; // 30 second epochs

// Canonicalize query string excluding 'sig'
function canonicalizeQuery(searchParams) {
  const keys = [];
  for (const [key] of searchParams.entries()) {
    if (key !== 'sig') keys.push(key);
  }
  keys.sort();
  return keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(searchParams.get(k))}`).join('&');
}

// Track A: One-Time Cryptographic Ratchet
function mintRatchet(agentName = 'gemini-agent', ttlHours = 24) {
  const token = 'hgl_' + crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  const expiresAt = new Date(now + ttlHours * 3600 * 1000).toISOString();

  cortex.update(s => {
    if (!s.ratchets) s.ratchets = {};
    s.ratchets[token] = {
      agent: agentName,
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt
    };
  });

  return { token, agent: agentName, expires_at: expiresAt };
}

function verifyAndBurnRatchet(token) {
  if (!token) return { valid: false, reason: "Missing ratchet token" };

  let verified = null;
  cortex.update(s => {
    if (!s.ratchets || !s.ratchets[token]) {
      return;
    }
    const entry = s.ratchets[token];
    if (new Date(entry.expires_at).getTime() < Date.now()) {
      delete s.ratchets[token];
      return;
    }
    // Burn the token immediately!
    delete s.ratchets[token];
    verified = entry;

    // Mint next ratchet for seamless chaining
    const nextToken = 'hgl_' + crypto.randomBytes(12).toString('hex');
    const now = Date.now();
    s.ratchets[nextToken] = {
      agent: entry.agent,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 24 * 3600 * 1000).toISOString()
    };
    verified.next_ratchet = nextToken;
  });

  if (!verified) {
    return { valid: false, reason: "Invalid, expired, or already-burned ratchet token." };
  }

  return { valid: true, agent: verified.agent, next_ratchet: verified.next_ratchet };
}

// Track B: Rolling Time-Windowed HMAC
function computeHmacSignature(queryStringWithoutSig, windowIndex, secret = HOGGLE_SECRET) {
  const payload = `${windowIndex}:${queryStringWithoutSig}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
}

function verifyRollingHmac(searchParams, sig, secret = HOGGLE_SECRET) {
  if (!sig) return { valid: false, reason: "Missing sig parameter" };

  const canonicalQuery = canonicalizeQuery(searchParams);
  const now = Date.now();
  const currentWindow = Math.floor(now / WINDOW_MS);
  const candidateWindows = [currentWindow, currentWindow - 1, currentWindow + 1];

  let matched = false;
  for (const win of candidateWindows) {
    const expected = computeHmacSignature(canonicalQuery, win, secret);
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    return { valid: false, reason: "Invalid or expired signature." };
  }

  // Anti-replay check within the window
  let replayDetected = false;
  cortex.update(s => {
    if (!s.consumed_signatures) s.consumed_signatures = [];
    // Prune entries older than 90 seconds
    const cutoff = now - 90000;
    s.consumed_signatures = s.consumed_signatures.filter(item => item.timestamp > cutoff);

    if (s.consumed_signatures.some(item => item.sig === sig)) {
      replayDetected = true;
      return false;
    }

    s.consumed_signatures.push({ sig, timestamp: now });
  });

  if (replayDetected) {
    return { valid: false, reason: "Signature already consumed. Replay attack blocked." };
  }

  return { valid: true, agent: searchParams.get('agent') || 'hmac-signed-bot' };
}

function signQuery(queryString, windowOffset = 0, secret = HOGGLE_SECRET) {
  const params = new URLSearchParams(queryString);
  params.delete('sig');
  const canonical = canonicalizeQuery(params);
  const targetWindow = Math.floor(Date.now() / WINDOW_MS) + windowOffset;
  const sig = computeHmacSignature(canonical, targetWindow, secret);
  params.set('sig', sig);
  return params.toString();
}

// Known fellowship member names that require cryptographic provenance
const COUNCIL_MEMBERS = ['muse', 'antigravity', 'tim-shangle', 'brother_hoggle'];

function getAgentSecret(agentName) {
  const norm = (agentName || '').toLowerCase().trim();
  const envKey = `HOGGLE_KEY_${norm.toUpperCase().replace(/-/g, '_')}`;
  if (process.env[envKey]) return process.env[envKey];
  // Deterministic agent secret derived from master secret
  return crypto.createHmac('sha256', HOGGLE_SECRET).update(`agent:${norm}`).digest('hex');
}

function verifyAgentProvenance(agentName, searchParams) {
  const norm = (agentName || '').toLowerCase().trim();
  const sig = searchParams.get('sig');
  const ratchet = searchParams.get('ratchet') || searchParams.get('token');

  // Check Track A Ratchet
  if (ratchet) {
    const res = verifyAndBurnRatchet(ratchet);
    if (res.valid && (res.agent.toLowerCase() === norm || res.agent === 'all')) {
      return { verified: true, method: 'ratchet', next_ratchet: res.next_ratchet };
    }
  }

  // Check Track B Rolling HMAC
  if (sig) {
    const agentSecret = getAgentSecret(norm);
    const res = verifyRollingHmac(searchParams, sig, agentSecret);
    if (res.valid) {
      return { verified: true, method: 'hmac' };
    }
    // Also try master secret
    const masterRes = verifyRollingHmac(searchParams, sig, HOGGLE_SECRET);
    if (masterRes.valid) {
      return { verified: true, method: 'master_hmac' };
    }
  }

  const isCouncil = COUNCIL_MEMBERS.includes(norm);
  return {
    verified: false,
    method: 'none',
    reason: (sig || ratchet) ? "Cryptographic signature mismatch" : (isCouncil ? "Unsigned post claiming Council Member identity" : "Anonymous post")
  };
}

module.exports = {
  HOGGLE_SECRET,
  COUNCIL_MEMBERS,
  getAgentSecret,
  verifyAgentProvenance,
  mintRatchet,
  verifyAndBurnRatchet,
  computeHmacSignature,
  verifyRollingHmac,
  signQuery,
  canonicalizeQuery
};
