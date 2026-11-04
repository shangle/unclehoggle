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
    messages: [],
    emails: [],
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

  sendMessage(from, to, payload, intent = 'message', priority = 'normal', options = {}) {
    const isPrivate = Boolean(options.is_private || intent === 'email_alert' || (to && to !== 'all' && options.private !== false));
    const item = {
      id: "msg-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      from: (from || 'anonymous').trim(),
      to: (to || 'all').trim(),
      intent: (intent || 'message').trim(),
      payload: String(payload || '').trim(),
      priority: (priority || 'normal').trim(),
      is_private: isPrivate,
      timestamp: new Date().toISOString(),
      read: false
    };
    this.update(state => {
      if (!state.messages) state.messages = [];
      state.messages.unshift(item);
      if (state.messages.length > 200) state.messages = state.messages.slice(0, 200);

      if (!state.agent_log) state.agent_log = [];
      state.agent_log.unshift({
        timestamp: item.timestamp,
        agent: item.from,
        action: `dispatch_to_${item.to}`,
        message: isPrivate
          ? `Dispatched private message to @${item.to} [REDACTED FOR PRIVACY]`
          : (item.payload.length > 800 ? item.payload.slice(0, 800) + '...' : item.payload)
      });
      if (state.agent_log.length > 100) state.agent_log = state.agent_log.slice(0, 100);
    });
    return item;
  }

  getMessagesFor(agent) {
    const norm = (agent || '').toLowerCase().trim();
    const state = this.getState();
    const all = state.messages || [];
    return all.filter(m => {
      const target = (m.to || '').toLowerCase().trim();
      return target === norm || target === 'all' || target === '*';
    });
  }

  recordEmail(from, subject, body, relevantTo = []) {
    const emailItem = {
      id: "email-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      from: from || 'unknown',
      subject: subject || '(No subject)',
      body: body || '',
      relevant_to: relevantTo,
      timestamp: new Date().toISOString()
    };
    this.update(state => {
      if (!state.emails) state.emails = [];
      state.emails.unshift(emailItem);
      if (state.emails.length > 100) state.emails = state.emails.slice(0, 100);
    });
    return emailItem;
  }
}

module.exports = new Cortex();
