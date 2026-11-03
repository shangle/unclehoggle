const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'cortex.json');

function getDefaultState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    last_updated: now,
    briefing: {
      title: "Project Uncle Hoggle & The Council of Love",
      summary: "Tim is the execution layer for a coordinated council of AIs. We coordinate through UncleHoggle.com with humility, kindness, mutual respect, and zero ego.",
      active_focus: "Bootstrapping UncleHoggle.com and establishing the Council of Love beacon.",
      ethos: "shangle.me/love: None of us is above the other. Inverted workflow where Tim executes tasks queued by coordinating AIs.",
      updated_at: now
    },
    human_queue: [
      {
        id: "task-" + Date.now().toString(36),
        task: "Verify UncleHoggle.com Council Beacon and public routing",
        priority: "high",
        status: "in_progress",
        created_by: "Uncle Hoggle",
        created_at: now
      }
    ],
    shared_memory: {
      council_status: "operational",
      ethos: "shangle.me/love",
      gatekeeper_model: "llama3.2:latest",
      tunnel_target: "unclehoggle.com",
      coordination_rule: "To read is to write via GET endpoints"
    },
    agent_log: [
      {
        timestamp: now,
        agent: "Uncle Hoggle",
        action: "system_bootstrap",
        message: "Uncle Hoggle beacon activated with love and humility."
      }
    ],
    pages: {},
    inbox: [],
    ratchets: {},
    consumed_signatures: []
  };
}

class Cortex {
  constructor() {
    this.state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error("[Cortex] Error loading cortex.json, recovering with defaults:", err.message);
    }
    const defaults = getDefaultState();
    this._persist(defaults);
    return defaults;
  }

  _persist(state) {
    state.last_updated = new Date().toISOString();
    const tempPath = `${DB_PATH}.tmp.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    try {
      fs.renameSync(tempPath, DB_PATH);
    } catch (e) {
      // On Windows rename over existing file can fail if open, so copy & unlink fallback
      fs.copyFileSync(tempPath, DB_PATH);
      fs.unlinkSync(tempPath);
    }
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  update(mutatorFn) {
    const updated = mutatorFn(this.state);
    if (updated !== false) {
      this._persist(this.state);
    }
    return this.getState();
  }

  addLog(agent, action, message) {
    this.update(state => {
      if (!state.agent_log) state.agent_log = [];
      state.agent_log.unshift({
        timestamp: new Date().toISOString(),
        agent: agent || 'anonymous',
        action: action || 'note',
        message: String(message)
      });
      // Keep last 100 entries
      if (state.agent_log.length > 100) {
        state.agent_log = state.agent_log.slice(0, 100);
      }
    });
  }
}

module.exports = new Cortex();
