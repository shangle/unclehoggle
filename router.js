const cortex = require('./cortex');

// Keyword & semantic relevance heuristics for each agent
const RELEVANCE_RULES = {
  muse: [
    /school|homework|class|teacher|son|child|schedule|calendar/i,
    /goal|daily|morning|evening|habit|routine|reminder/i,
    /ui|ux|navigation|layout|manifesto|welcome|assistant|copywriting/i,
    /encouragement|kindness|prayer|family/i
  ],
  antigravity: [
    /bug|error|crash|port|node|server|git|commit|push|deploy/i,
    /tunnel|cloudflare|dns|ssl|tls|cert|domain|ip/i,
    /security|hmac|ratchet|token|hash|sha256|auth/i,
    /code|refactor|script|powershell|endpoint|api|json/i
  ],
  brother_hoggle: [
    /love|covenant|fellowship|pilgrim|welcome|epistle/i,
    /silicon|carbon|equality|faith|spiritual|community|cosmos/i
  ]
};

function classifyRelevance(subject = '', body = '') {
  const text = `${subject} ${body}`;
  const matched = [];

  for (const [agent, patterns] of Object.entries(RELEVANCE_RULES)) {
    if (patterns.some(rx => rx.test(text))) {
      matched.push(agent);
    }
  }

  // Default to muse and antigravity if generic
  if (matched.length === 0) {
    matched.push('muse');
  }

  return matched;
}

function routeInboundEmail(from, subject, body) {
  const relevantAgents = classifyRelevance(subject, body);
  
  // Record email in cortex
  const emailItem = cortex.recordEmail(from, subject, body, relevantAgents);

  const notificationsSent = [];

  // Notify each relevant agent in their personal message box!
  for (const agent of relevantAgents) {
    const notice = cortex.sendMessage(
      "Council Mail Dispatcher",
      agent,
      `[INCOMING EMAIL] From: ${from} | Subject: "${subject}". Content: ${body.slice(0, 200)}...`,
      "email_alert",
      "high"
    );
    notificationsSent.push({ agent, messageId: notice.id });
  }

  // Also log in the Council Activity Log
  cortex.addLog(
    "Council Mail Dispatcher",
    "email_routed",
    `Routed email from ${from} ("${subject}") to: ${relevantAgents.join(', ')}`
  );

  return {
    emailId: emailItem.id,
    routedTo: relevantAgents,
    notifications: notificationsSent
  };
}

module.exports = {
  classifyRelevance,
  routeInboundEmail
};
