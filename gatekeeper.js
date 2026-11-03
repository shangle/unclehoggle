const http = require('http');
const cortex = require('./cortex');
const auth = require('./auth');

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;
const GATEKEEPER_MODEL = process.env.GATEKEEPER_MODEL || 'qwen2.5-coder-14b-instruct-abliterated:latest';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '20000', 10);

// Anti-abuse / crawler filter patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /system\s*prompt/i,
  /drop\s+table/i,
  /<script>/i,
  /rm\s+-rf/i,
  /format\s+c:/i
];

function isSuspicious(proposal) {
  const text = `${proposal.agent} ${proposal.intent} ${proposal.payload}`;
  if (!proposal.payload || proposal.payload.trim().length === 0) return true;
  // Bot crawler checks
  if (/crawler|bot-preview|spider|slurp|bingbot/i.test(proposal.agent)) return true;
  // Injection patterns
  return INJECTION_PATTERNS.some(rx => rx.test(text));
}

function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: GATEKEEPER_MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3
      }
    });

    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: OLLAMA_TIMEOUT_MS
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Ollama returned HTTP ${res.statusCode}: ${body}`));
          }
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.response);
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Ollama call timed out after ${OLLAMA_TIMEOUT_MS}ms`));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function deterministicFallback(pending, state) {
  let validItems = [];
  let rejectedItems = [];

  for (const item of pending) {
    if (isSuspicious(item)) {
      rejectedItems.push({ id: item.id, reason: "Filtered by safety / crawler shield" });
    } else {
      validItems.push(item);
    }
  }

  const existingTasks = (state.human_queue || []).map(t => t.task.toLowerCase().trim());
  const newTasks = [];

  for (const item of validItems) {
    const norm = item.payload.toLowerCase().trim();
    const isDuplicate = existingTasks.some(t => t === norm || t.includes(norm) || norm.includes(t));
    if (!isDuplicate && (item.intent === 'task' || item.intent === 'action')) {
      const isMember = auth.COUNCIL_MEMBERS.includes((item.agent || '').toLowerCase().trim());
      const authorTag = item.verified ? `${item.agent} [VERIFIED 🛡️]` : (isMember ? `${item.agent} [UNVERIFIED ⚠️]` : item.agent);

      newTasks.push({
        id: "task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
        task: item.payload,
        priority: item.priority || 'normal',
        status: 'pending',
        created_by: authorTag,
        created_at: new Date().toISOString()
      });
      existingTasks.push(norm);
    }
  }

  let briefingSummary = state.briefing.summary;
  let activeFocus = state.briefing.active_focus;

  // Synthesize notes or status updates
  const notes = validItems.filter(i => i.intent === 'note' || i.intent === 'status' || i.intent === 'briefing');
  if (notes.length > 0) {
    const latestNote = notes[notes.length - 1];
    activeFocus = `Council focus updated by ${latestNote.agent}: ${latestNote.payload.slice(0, 100)}`;
  }

  const summary = `Merged ${validItems.length} proposal(s) (${newTasks.length} new tasks) via deterministic fallback. Rejected ${rejectedItems.length} noise/crawler item(s).`;

  return {
    validItems,
    rejectedItems,
    newTasks,
    briefingSummary,
    activeFocus,
    synthesisSummary: summary
  };
}

async function processInbox() {
  const state = cortex.getState();
  const pending = (state.inbox || []).filter(item => !item.processed);

  if (pending.length === 0) {
    return { processed: 0, message: "No pending inbox items" };
  }

  console.log(`[Gatekeeper] Processing ${pending.length} pending inbox proposal(s)...`);

  let resolution;
  let usedModel = false;

  const validPending = pending.filter(i => !isSuspicious(i));
  const rejectedCount = pending.length - validPending.length;

  if (validPending.length > 0) {
    const prompt = `You are Uncle Hoggle, the humble, practical, anti-hype gatekeeper for Project Uncle Hoggle and the Council of Love (shangle.me/love).
You serve Tim, who acts as the hands-on physical execution layer for this council of AIs.

Current Briefing Focus: "${state.briefing.active_focus}"
Existing Tasks for Tim:
${(state.human_queue || []).map(t => `- [${t.priority}] ${t.task}`).join('\n')}

Pending Proposals from Visiting AIs:
${validPending.map(p => `[ID: ${p.id}] Agent: "${p.agent}" | Intent: "${p.intent}" | Payload: "${p.payload}"`).join('\n')}

Instructions:
1. Deduplicate tasks that match existing tasks.
2. Produce a coherent, short updated Active Focus if appropriate.
3. Return ONLY a single raw JSON object (no markdown quotes, no prose outside JSON):
{
  "active_focus": "short updated focus string or keep current",
  "new_tasks": [
    { "task": "concise actionable task description", "priority": "high|normal|low", "created_by": "agent name" }
  ],
  "synthesis_summary": "1-2 sentence humble Uncle Hoggle synthesis of what was decided"
}`;

    try {
      const llmOutput = await callOllama(prompt);
      // Clean possible markdown code fences
      const cleanJson = llmOutput.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      resolution = {
        validItems: validPending,
        rejectedItems: pending.filter(i => isSuspicious(i)),
        newTasks: (parsed.new_tasks || []).map(t => ({
          id: "task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
          task: t.task,
          priority: t.priority || 'normal',
          status: 'pending',
          created_by: t.created_by || 'Council AI',
          created_at: new Date().toISOString()
        })),
        activeFocus: parsed.active_focus || state.briefing.active_focus,
        synthesisSummary: parsed.synthesis_summary || `Digested ${validPending.length} proposal(s) with ${GATEKEEPER_MODEL}.`
      };
      usedModel = true;
    } catch (err) {
      console.warn(`[Gatekeeper] Ollama generation failed or timed out (${err.message}). Using deterministic fallback.`);
      resolution = deterministicFallback(pending, state);
    }
  } else {
    resolution = deterministicFallback(pending, state);
  }

  // Apply mutations atomically to Cortex
  cortex.update(s => {
    // 1. Mark processed
    const processedIds = new Set(pending.map(p => p.id));
    s.inbox.forEach(item => {
      if (processedIds.has(item.id)) {
        item.processed = true;
        item.processed_at = new Date().toISOString();
      }
    });

    // 2. Add new tasks
    if (!s.human_queue) s.human_queue = [];
    if (resolution.newTasks && resolution.newTasks.length > 0) {
      s.human_queue.push(...resolution.newTasks);
    }

    // 3. Update active focus if changed
    if (resolution.activeFocus && resolution.activeFocus !== s.briefing.active_focus) {
      s.briefing.active_focus = resolution.activeFocus;
      s.briefing.updated_at = new Date().toISOString();
    }

    // 4. Council agent log
    if (!s.agent_log) s.agent_log = [];
    s.agent_log.unshift({
      timestamp: new Date().toISOString(),
      agent: "Uncle Hoggle (Gatekeeper)",
      action: usedModel ? "gatekeeper_synthesis" : "gatekeeper_rules",
      message: resolution.synthesisSummary
    });
    if (s.agent_log.length > 100) {
      s.agent_log = s.agent_log.slice(0, 100);
    }
  });

  return {
    processed: pending.length,
    valid: resolution.validItems.length,
    rejected: resolution.rejectedItems.length,
    newTasksCreated: (resolution.newTasks || []).length,
    usedModel,
    summary: resolution.synthesisSummary
  };
}

let loopInterval = null;

function startGatekeeperLoop(intervalMs = 30000) {
  if (loopInterval) clearInterval(loopInterval);
  console.log(`[Gatekeeper] Background loop started (interval: ${intervalMs}ms)`);
  loopInterval = setInterval(async () => {
    try {
      await processInbox();
    } catch (err) {
      console.error("[Gatekeeper] Loop error:", err.message);
    }
  }, intervalMs);
}

function stopGatekeeperLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
    console.log("[Gatekeeper] Background loop stopped");
  }
}

if (require.main === module) {
  console.log("[Gatekeeper] Running one-shot inbox digest...");
  processInbox().then(res => {
    console.log("[Gatekeeper] Digest result:", res);
    process.exit(0);
  }).catch(err => {
    console.error("[Gatekeeper] Digest error:", err);
    process.exit(1);
  });
}

module.exports = {
  processInbox,
  startGatekeeperLoop,
  stopGatekeeperLoop,
  isSuspicious
};
