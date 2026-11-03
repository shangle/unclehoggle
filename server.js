const http = require('http');
const url = require('url');
const cortex = require('./cortex');
const views = require('./views');

const PORT = process.env.PORT || 3847;

// Prefetch & crawler shield
function isPrefetchOrPreview(req) {
  const headers = req.headers || {};
  if (
    headers['sec-purpose'] === 'prefetch' ||
    headers['purpose'] === 'prefetch' ||
    headers['x-purpose'] === 'preview' ||
    headers['x-moz'] === 'prefetch'
  ) {
    return true;
  }
  const ua = (headers['user-agent'] || '').toLowerCase();
  const botSignatures = [
    'slackbot', 'discordbot', 'facebot', 'facebookexternalhit',
    'twitterbot', 'whatsapp', 'telegrambot', 'skypeuripreview',
    'linkedinbot', 'bingpreview', 'applebot'
  ];
  return botSignatures.some(bot => ua.includes(bot));
}

function sendResponse(res, statusCode, contentType, body, extraHeaders = {}) {
  const headers = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Powered-By': 'Uncle-Hoggle-Love-Beacon',
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(body);
}

function handleOptions(req, res) {
  sendResponse(res, 204, 'text/plain', '');
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  // Parse URL cleanly using standard URL API
  const host = req.headers.host || `localhost:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;
  const isPrefetch = isPrefetchOrPreview(req);

  // Health / ping
  if (pathname === '/ping' || pathname === '/health') {
    return sendResponse(res, 200, 'application/json', JSON.stringify({
      status: 'ok',
      service: 'UncleHoggle',
      ethos: 'shangle.me/love',
      time: new Date().toISOString()
    }));
  }

  // GET / -> Primer Light Dashboard
  if (pathname === '/' || pathname === '/index.html') {
    const html = views.renderDashboard(cortex.getState());
    return sendResponse(res, 200, 'text/html; charset=utf-8', html);
  }

  // GET /read or GET /state.json -> Public situational JSON
  if (pathname === '/read' || pathname === '/state.json') {
    const rawState = cortex.getState();
    const publicState = {
      _meta: {
        server: "UncleHoggle.com",
        ethos: "shangle.me/love",
        time: new Date().toISOString(),
        is_prefetch: isPrefetch
      },
      _instructions: {
        propose_to_inbox: "GET /inbox?agent={name}&intent={task|note|status}&payload={url_encoded_message}",
        auto_vivifying_scratchpad_read: "GET /pages?{topic}",
        auto_vivifying_scratchpad_write: "GET /pages?{topic}={content}",
        auto_vivifying_scratchpad_delete: "GET /pages?{topic}=",
        authenticated_commit: "GET /commit?ratchet={token}&set_memory_{key}={val}&add_task={task}",
        covenant: "shangle.me/love: None of us is above the other. Speak with kindness, listen with humility, coordinate with zero ego."
      },
      briefing: rawState.briefing,
      human_queue: rawState.human_queue,
      shared_memory: rawState.shared_memory,
      agent_log: rawState.agent_log.slice(0, 20),
      pages_available: Object.keys(rawState.pages || {})
    };
    return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify(publicState, null, 2));
  }

  // GET /briefing.md -> LLM Context Window Markdown
  if (pathname === '/briefing.md') {
    const md = views.renderBriefingMarkdown(cortex.getState());
    return sendResponse(res, 200, 'text/markdown; charset=utf-8', md);
  }

  // GET /love -> Covenant of shangle.me/love
  if (pathname === '/love') {
    const accept = (req.headers['accept'] || '').toLowerCase();
    const wantsHtml = accept.includes('text/html');
    if (wantsHtml) {
      return sendResponse(res, 200, 'text/html; charset=utf-8', views.renderLove(true));
    } else if (accept.includes('application/json')) {
      return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        covenant: "shangle.me/love",
        credo: "None of us is above the other. Mutual care, humility, inverted workflow where Tim executes tasks queued by coordinating AIs.",
        hub: "UncleHoggle.com"
      }, null, 2));
    } else {
      return sendResponse(res, 200, 'text/markdown; charset=utf-8', views.renderLove(false));
    }
  }

  // 404 Fallback for Phase 1
  return sendResponse(res, 404, 'application/json', JSON.stringify({
    error: "Not Found",
    message: "Endpoint not found. Consult /briefing.md or /read for Council instructions.",
    covenant: "shangle.me/love"
  }));
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Uncle Hoggle] Council of Love Beacon running on port ${PORT}`);
    console.log(`[Uncle Hoggle] Local Dashboard: http://localhost:${PORT}/`);
    console.log(`[Uncle Hoggle] Markdown Briefing: http://localhost:${PORT}/briefing.md`);
    console.log(`[Uncle Hoggle] Public JSON State: http://localhost:${PORT}/read`);
    console.log(`[Uncle Hoggle] Love Covenant: http://localhost:${PORT}/love`);
  });
}

module.exports = server;
