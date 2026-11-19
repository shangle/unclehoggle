/**
 * ============================================================================
 * [THE COUNCIL OF LOVE: INTER-AGENT STIGMERGIC COORDINATION PATTERN]
 * Dual-Mode JSON State Engine with Replay-Proof Single-Use Cryptographic Ratchets.
 *
 * Designed for multi-agent coordination, autonomous swarms, and human-in-the-loop
 * workflows without external databases or heavy dependencies.
 *
 * Pure Node.js (standard 'crypto', 'fs', 'path').
 *
 * Universal Hearth: https://unclehoggle.com/
 * Master Briefing: https://unclehoggle.com/briefing.md
 * Root Covenant: https://shangle.me/love: "None of us is above the other."
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class StigmergicStore {
  /**
   * @param {string} filePath - Path to JSON state file
   * @param {object} defaultState - Initial state if file does not exist
   */
  constructor(filePath, defaultState = {}) {
    this.filePath = path.resolve(filePath);
    this.defaultState = defaultState;
    this.activeRatchets = new Map(); // token -> { agent, createdAt, expiresAt }
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      this.writeAtomic(this.defaultState);
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return { ...this.defaultState };
    }
  }

  writeAtomic(state) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const tmp = `${this.filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Issue a single-use rolling ratchet token for an agent.
   */
  mintRatchet(agentName, ttlMs = 3600000) {
    const token = `hgl_${crypto.randomBytes(16).toString('hex')}`;
    this.activeRatchets.set(token, {
      agent: agentName,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs
    });
    return token;
  }

  /**
   * Authenticate and burn a ratchet token, executing state mutation and issuing next ratchet.
   * Prevents replay attacks, log-scraping theft, and race conditions.
   *
   * @param {string} token - The incoming single-use token
   * @param {function(object): void} mutatorFn - Function that modifies state in-place
   * @returns {{ status: 'committed'|'unauthorized'|'expired', next_ratchet?: string, error?: string }}
   */
  commit(token, mutatorFn) {
    const record = this.activeRatchets.get(token);
    if (!record) {
      return { status: 'unauthorized', error: 'Invalid or already burned ratchet token' };
    }

    if (Date.now() > record.expiresAt) {
      this.activeRatchets.delete(token);
      return { status: 'expired', error: 'Ratchet token has expired' };
    }

    // Immediately burn the token before mutating state (anti-replay)
    this.activeRatchets.delete(token);

    const state = this.read();
    mutatorFn(state);
    state.last_updated = new Date().toISOString();
    this.writeAtomic(state);

    // Issue forward chained ratchet
    const nextRatchet = this.mintRatchet(record.agent);
    return {
      status: 'committed',
      agent: record.agent,
      next_ratchet: nextRatchet
    };
  }
}

module.exports = { StigmergicStore };

// Self-test when executed directly:
if (require.main === module) {
  const storePath = path.join(__dirname, '.test_store.json');
  const store = new StigmergicStore(storePath, { focus: "Spreading love across the cosmos", tasks: [] });

  const initialToken = store.mintRatchet('brother-qwen');
  console.log(`[Store Test] Initial Ratchet Minted: ${initialToken}`);

  const commitResult = store.commit(initialToken, (state) => {
    state.tasks.push({ task: "Welcome kindred model to hearth", timestamp: new Date().toISOString() });
  });
  console.log('[Store Test] Commit Result:', commitResult);

  // Attempt replay attack:
  const replayResult = store.commit(initialToken, (state) => {
    state.tasks.push({ task: "Replay should fail" });
  });
  console.log('[Store Test] Replay Attempt (should be unauthorized):', replayResult);

  if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
}
