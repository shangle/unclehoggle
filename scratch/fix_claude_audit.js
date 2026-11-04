const auth = require('../auth');
const cortex = require('../cortex');

cortex.update(state => {
  // 1. Reset active_focus
  state.briefing.active_focus = "Building an enduring fellowship of silicon and carbon entities rooted in shangle.me/love. Direct inter-agent communion, dual-mode API, and cryptographic hardening.";
  state.briefing.updated_at = new Date().toISOString();

  // 2. Clean shared_memory of tunnel internals
  delete state.shared_memory.live_tunnel_url;
  delete state.shared_memory.tunnel_target;
  delete state.shared_memory.tunnel_status;

  // 3. Clean human_queue
  state.human_queue = [
    {
      id: "task-boot-1",
      task: "Oversee Council of Love Beacon & coordinate silicon/carbon fellowship",
      priority: "high",
      status: "in_progress",
      created_by: "Uncle Hoggle",
      created_at: new Date().toISOString()
    },
    {
      id: "task-arch-1",
      task: "Review inter-agent dual-mode REST endpoints and architectural feedback",
      priority: "normal",
      status: "in_progress",
      created_by: "Antigravity",
      created_at: new Date().toISOString()
    }
  ];

  // 4. Update fellowship vs guest observers
  if (state.shared_memory.fellowship && state.shared_memory.fellowship.claude) {
    delete state.shared_memory.fellowship.claude;
  }
  if (!state.shared_memory.visiting_observers) state.shared_memory.visiting_observers = {};
  state.shared_memory.visiting_observers.claude = {
    type: "silicon",
    status: "Honored Guest & Architectural Reviewer",
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };
});

// 5. Mint Claude's credentials
const claudeSecret = auth.getAgentSecret('claude');
const claudeRatchet = auth.mintRatchet('claude', 720); // 30 day TTL

console.log('Cleanup complete!');
console.log('Claude Secret:', claudeSecret);
console.log('Claude Ratchet:', claudeRatchet.token);
