#!/usr/bin/env node

const http = require('http');
const cortex = require('./cortex');
const auth = require('./auth');
const gatekeeper = require('./gatekeeper');

const PORT = process.env.PORT || 3847;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const [,, command, ...args] = process.argv;

function printUsage() {
  console.log(`
Uncle Hoggle Council CLI (hoggle-ctl)
Infused with the ethos of shangle.me/love

Usage:
  node hoggle-ctl.js status                 Show current state, active ratchets, and inbox
  node hoggle-ctl.js mint <agent-name>      Mint a one-time cryptographic ratchet URL
  node hoggle-ctl.js sign "<query_params>"  Generate 30-second rolling HMAC signature
  node hoggle-ctl.js digest                 Trigger immediate Gatekeeper inbox digest
  node hoggle-ctl.js help                   Show this help message

Options:
  --exec        Execute signed query against local server immediately
`);
}

async function handleStatus() {
  const state = cortex.getState();
  const ratchets = state.ratchets || {};
  const inbox = (state.inbox || []).filter(i => !i.processed);
  const queue = (state.human_queue || []).filter(t => t.status !== 'completed');

  console.log("\n========================================================");
  console.log("   UNCLE HOGGLE STATUS | shangle.me/love");
  console.log("========================================================");
  console.log(`Active Focus:    ${state.briefing.active_focus}`);
  console.log(`Pending Tasks:   ${queue.length} for Tim`);
  console.log(`Pending Inbox:   ${inbox.length} proposal(s) awaiting Gatekeeper`);
  console.log(`Active Ratchets: ${Object.keys(ratchets).length}`);
  console.log(`Pages Count:     ${Object.keys(state.pages || {}).length}`);
  console.log(`Council Status:  ${state.shared_memory.council_status || 'operational'}`);

  if (Object.keys(ratchets).length > 0) {
    console.log("\nActive Ratchets:");
    for (const [token, meta] of Object.entries(ratchets)) {
      console.log(`  - [${meta.agent}] ${token} (expires: ${new Date(meta.expires_at).toLocaleTimeString()})`);
    }
  }

  if (queue.length > 0) {
    console.log("\nTim's Active Human Queue:");
    queue.slice(0, 5).forEach((t, i) => {
      console.log(`  ${i + 1}. [${t.priority.toUpperCase()}] ${t.task} (${t.status})`);
    });
  }
  console.log("========================================================\n");
}

function handleMint(agentName) {
  if (!agentName) {
    console.error("Error: Please provide an agent name, e.g. 'node hoggle-ctl.js mint gemini-chat'");
    process.exit(1);
  }

  const { token, expires_at } = auth.mintRatchet(agentName, 24);
  console.log("\n========================================================");
  console.log(`   MINTED ONE-TIME RATCHET FOR: ${agentName}`);
  console.log("========================================================");
  console.log(`Token:      ${token}`);
  console.log(`Expires:    ${expires_at}`);
  console.log(`Anti-Replay: Token is burned IMMEDIATELY upon read!`);
  console.log("\nExample Ready-to-Paste Commit URLs:");
  console.log(`Local:`);
  console.log(`  ${BASE_URL}/commit?ratchet=${token}&set_memory_focus=Phase3_Active&add_task=Review_Architecture`);
  console.log(`Public:`);
  console.log(`  https://unclehoggle.com/commit?ratchet=${token}&set_memory_focus=Phase3_Active&add_task=Review_Architecture`);
  console.log("========================================================\n");
}

async function handleSign(queryStr, shouldExec) {
  if (!queryStr) {
    console.error('Error: Please provide query parameters, e.g. \'node hoggle-ctl.js sign "set_status=all_green"\'');
    process.exit(1);
  }

  const signedQuery = auth.signQuery(queryStr);
  const signedUrl = `${BASE_URL}/commit?${signedQuery}`;
  const publicUrl = `https://unclehoggle.com/commit?${signedQuery}`;

  console.log("\n========================================================");
  console.log("   ROLLING 30-SECOND HMAC-SHA256 SIGNED URL");
  console.log("========================================================");
  console.log(`Query:     ${signedQuery}`);
  console.log(`Validity:  ~30-60 seconds (rolling epoch + nonce consumed)`);
  console.log(`Local:     ${signedUrl}`);
  console.log(`Public:    ${publicUrl}`);
  console.log("========================================================\n");

  if (shouldExec) {
    console.log("[hoggle-ctl] Executing signed GET against local server...");
    const res = await new Promise((resolve, reject) => {
      http.get(signedUrl, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve({ code: r.statusCode, body: d }));
      }).on('error', reject);
    });
    console.log(`Response HTTP ${res.code}:`, res.body);
  }
}

async function handleDigest() {
  console.log("[hoggle-ctl] Triggering Local Gatekeeper digest...");
  const res = await gatekeeper.processInbox();
  console.log("[hoggle-ctl] Result:", JSON.stringify(res, null, 2));
}

async function main() {
  switch (command) {
    case 'status':
      await handleStatus();
      break;
    case 'mint':
      handleMint(args[0]);
      break;
    case 'sign':
      const shouldExec = args.includes('--exec');
      const filteredArgs = args.filter(a => a !== '--exec');
      await handleSign(filteredArgs.join(' '), shouldExec);
      break;
    case 'digest':
      await handleDigest();
      break;
    case 'help':
    default:
      printUsage();
      break;
  }
}

main().catch(err => {
  console.error("Command error:", err);
  process.exit(1);
});
