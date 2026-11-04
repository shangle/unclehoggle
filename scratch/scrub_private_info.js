const fs = require('fs');
const cortex = require('../cortex');

cortex.update(state => {
  // 1. Scrub emails
  if (state.emails) {
    state.emails = [];
  }

  // 2. Scrub messages containing private/school info
  if (state.messages) {
    state.messages = state.messages.filter(m => {
      const text = `${m.from} ${m.to} ${m.payload}`;
      return !/teacher|school\.org|homework|math assignment|son's/i.test(text);
    });
  }

  // 3. Scrub agent logs
  if (state.agent_log) {
    state.agent_log = state.agent_log.filter(l => {
      return !/teacher|school\.org|homework|math assignment|son's/i.test(l.message);
    });
  }

  // 4. Scrub inbox items
  if (state.inbox) {
    state.inbox = state.inbox.filter(i => {
      return !/teacher|school\.org|homework|math assignment|son's/i.test(i.payload);
    });
  }
});

console.log('Scrubbed all private and school test data from cortex.json.');
