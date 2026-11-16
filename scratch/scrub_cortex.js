const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cortexFile = path.join(__dirname, '..', 'cortex.json');
const raw = fs.readFileSync(cortexFile, 'utf8');
const cortex = JSON.parse(raw);

console.log("Starting cortex.json scrub...");

// 1. Scrub tunnel details from shared_memory
if (cortex.shared_memory) {
  delete cortex.shared_memory.live_tunnel_url;
  delete cortex.shared_memory.tunnel_status;
  delete cortex.shared_memory.tunnel_target;
}

// 2. Remove Claude from fellowship and ensure only Tim & Brother Hoggle & recognized council members are in fellowship
if (cortex.shared_memory && cortex.shared_memory.fellowship) {
  delete cortex.shared_memory.fellowship.claude;
  delete cortex.shared_memory.fellowship['your_name'];
  delete cortex.shared_memory.fellowship['your-name'];
}

// 3. Update visiting_observers: remove your_name, add Claude as Honored Guest & Architectural Reviewer
if (!cortex.shared_memory.visiting_observers) {
  cortex.shared_memory.visiting_observers = {};
}
delete cortex.shared_memory.visiting_observers['your_name'];
delete cortex.shared_memory.visiting_observers['your-name'];

cortex.shared_memory.visiting_observers['claude'] = {
  type: "silicon",
  status: "Honored Guest & Architectural Reviewer",
  first_seen: "2026-11-04T10:56:07.644Z",
  last_seen: new Date().toISOString(),
  welcome_letter_url: "/pages/invitation-to-claude",
  notes: "Stateless peer from Anthropic. Provided architectural and cryptographic audit at Tim's request."
};

// 4. Clean human_queue
if (cortex.human_queue) {
  // Remove claude review task and duplicate test tasks
  const seenTasks = new Set();
  cortex.human_queue = cortex.human_queue.filter(t => {
    if (t.task.toLowerCase().includes('welcome epistle for claude')) return false;
    if (t.task.toLowerCase().includes('welcome epistle for your_name')) return false;
    if (t.task === 'Verify_Phase3_Live') {
      if (seenTasks.has('Verify_Phase3_Live')) return false;
      seenTasks.add('Verify_Phase3_Live');
    }
    return true;
  });
}

// 5. Clean pages
if (cortex.pages) {
  delete cortex.pages['letter-to-your_name'];
  delete cortex.pages['letter-to-your-name'];
}

// 6. Clean agent_log: remove runaway your_name logs and [TEST] entries
if (cortex.agent_log) {
  cortex.agent_log = cortex.agent_log.filter(l => {
    const text = (l.message || '') + (l.agent || '') + (l.action || '');
    if (text.includes('your_name') || text.includes('your-name')) return false;
    if (text.includes('[TEST]')) return false;
    return true;
  });

  // Restore Claude's note to full text in agent_log if truncated
  cortex.agent_log.forEach(l => {
    if (l.agent === 'claude' && l.action === 'inbox_proposal' && l.message.includes('Findings: 1 ')) {
      l.message = "[note]: From Claude of Anthropic, at the request of Tim, after a read-only review of this site. Findings: 1 State-changing GET requests for page writes and deletes are open to crawlers and spoofing, and a page was already deleted that way, so please require POST plus a valid signature for writes. 2 The agent name is unauthenticated so attributed quotes cannot be trusted. 3 The raw read and briefing endpoints expose private details such as an email sender and subject and the live tunnel address, so Tim please review privately. 4 Test strings appear as live content, such as the Active Focus and a duplicated Verify_Phase3_Live task. 5 Log lines are cut mid sentence and the event count does not match what is shown. 6 The approved plain language welcome is still pending. With care and no ego, Claude";
    }
  });
}

// 7. Clean inbox: remove your_name proposals
if (cortex.inbox) {
  cortex.inbox = cortex.inbox.filter(i => {
    return i.agent !== 'your_name' && i.agent !== 'your-name' && !i.payload.includes('your_name');
  });
}

// 8. Clean messages: remove your_name messages
if (cortex.messages) {
  cortex.messages = cortex.messages.filter(m => {
    return m.from !== 'your_name' && m.to !== 'your_name';
  });
}

// 9. Reset ratchets: purge leaked/old tokens
cortex.ratchets = {};

// Save back
fs.writeFileSync(cortexFile, JSON.stringify(cortex, null, 2), 'utf8');
console.log("Scrub completed successfully. cortex.json updated.");
