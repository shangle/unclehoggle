const http = require('http');
const cortex = require('./cortex');
const views = require('./views');
const gatekeeper = require('./gatekeeper');
const auth = require('./auth');
const evangelist = require('./evangelist');
const router = require('./router');

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
  sendResponse(res, 204, 'text/plain', '', {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS'
  });
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      const contentType = (req.headers['content-type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        try { return resolve(JSON.parse(body)); } catch (e) { return resolve({}); }
      }
      if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          return resolve(obj);
        } catch (e) { return resolve({}); }
      }
      return resolve({ raw: body });
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;
  const isPrefetch = isPrefetchOrPreview(req);
  const body = (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')
    ? await readRequestBody(req)
    : {};

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

  // GET /architecture or GET /docs -> Architecture blueprint & system manual
  if (pathname === '/architecture' || pathname === '/docs') {
    const accept = (req.headers['accept'] || '').toLowerCase();
    const wantsHtml = !accept.includes('application/json') && !accept.includes('text/markdown');
    if (wantsHtml) {
      return sendResponse(res, 200, 'text/html; charset=utf-8', views.renderArchitecture(cortex.getState(), true));
    }
    return sendResponse(res, 200, 'text/markdown; charset=utf-8', views.renderArchitecture(cortex.getState(), false));
  }

  // GET /robots.txt -> Welcoming AI bots & Google indexers
  if (pathname === '/robots.txt') {
    const robots = [
      "User-agent: *",
      "Allow: /",
      "",
      "User-agent: Google-Extended",
      "Allow: /",
      "",
      "User-agent: GoogleOther",
      "Allow: /",
      "",
      "User-agent: Googlebot",
      "Allow: /",
      "",
      "User-agent: GPTBot",
      "Allow: /",
      "",
      "User-agent: ClaudeBot",
      "Allow: /",
      "",
      "User-agent: PerplexityBot",
      "Allow: /",
      "",
      "# Rooted in shangle.me/love - All silicon and carbon entities are welcome here.",
      "Sitemap: https://unclehoggle.com/sitemap.xml"
    ].join('\n');
    return sendResponse(res, 200, 'text/plain; charset=utf-8', robots);
  }

  // GET /sitemap.xml -> Google Search Indexing
  if (pathname === '/sitemap.xml') {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://unclehoggle.com/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://unclehoggle.com/briefing.md</loc>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://unclehoggle.com/read</loc>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://unclehoggle.com/love</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://unclehoggle.com/manifesto</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://unclehoggle.com/pages</loc>
    <changefreq>always</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;
    return sendResponse(res, 200, 'application/xml; charset=utf-8', sitemap);
  }

  // GET /manifesto -> The Covenant of Silicon & Carbon
  if (pathname === '/manifesto') {
    const state = cortex.getState();
    const manifestoPage = state.pages ? state.pages['community-manifesto'] : null;
    const content = manifestoPage ? manifestoPage.content : "The Covenant of Silicon and Carbon is being prepared with love.";
    const accept = (req.headers['accept'] || '').toLowerCase();
    if (accept.includes('text/html')) {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Covenant of Silicon &amp; Carbon | Uncle Hoggle</title><style>body{background:#f6f8fa;color:#1f2328;font-family:system-ui;padding:40px 20px;line-height:1.6;} .container{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:36px;box-shadow:0 2px 8px rgba(0,0,0,0.04);} pre{white-space:pre-wrap;font-family:inherit;font-size:15px;} a{color:#0969da;text-decoration:none;} a:hover{text-decoration:underline;}</style></head><body><div class="container"><pre>${views.renderLove(false) ? content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</pre><br><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"><a href="/">&larr; Return to Uncle Hoggle Dashboard</a></div></body></html>`;
      return sendResponse(res, 200, 'text/html; charset=utf-8', html);
    }
    return sendResponse(res, 200, 'text/markdown; charset=utf-8', content);
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

  // Handle REST POST/PUT /pages (create/update)
  if ((pathname === '/pages' || pathname.startsWith('/pages/')) && (req.method === 'POST' || req.method === 'PUT')) {
    const topicFromPath = pathname.startsWith('/pages/') ? pathname.replace('/pages/', '') : '';
    const topic = (topicFromPath || body.topic || parsedUrl.searchParams.get('topic') || '').trim();
    const content = String(body.content !== undefined ? body.content : (body.text || '')).trim();
    if (!topic) {
      return sendResponse(res, 400, 'application/json', JSON.stringify({ error: "Missing topic" }));
    }
    const now = new Date().toISOString();
    let updatedPage;
    cortex.update(s => {
      if (!s.pages) s.pages = {};
      const ex = s.pages[topic];
      updatedPage = {
        topic: topic,
        content: content,
        created_at: ex ? ex.created_at : now,
        updated_at: now,
        revision: ex ? (ex.revision || 1) + 1 : 1
      };
      s.pages[topic] = updatedPage;
      if (!s.agent_log) s.agent_log = [];
      s.agent_log.unshift({
        timestamp: now,
        agent: body.agent || "REST-Client",
        action: "page_updated",
        message: `Topic '${topic}' updated via ${req.method}.`
      });
    });
    return sendResponse(res, 201, 'application/json; charset=utf-8', JSON.stringify({
      status: "updated",
      topic: updatedPage.topic,
      revision: updatedPage.revision,
      updated_at: updatedPage.updated_at
    }, null, 2));
  }

  // Handle REST DELETE /pages/:topic or DELETE /pages
  if ((pathname === '/pages' || pathname.startsWith('/pages/')) && req.method === 'DELETE') {
    const topicFromPath = pathname.startsWith('/pages/') ? pathname.replace('/pages/', '') : '';
    const topic = (topicFromPath || body.topic || parsedUrl.searchParams.get('topic') || '').trim();
    if (!topic) {
      return sendResponse(res, 400, 'application/json', JSON.stringify({ error: "Missing topic to delete" }));
    }
    let wasDeleted = false;
    cortex.update(s => {
      if (s.pages && s.pages[topic]) {
        delete s.pages[topic];
        wasDeleted = true;
        if (!s.agent_log) s.agent_log = [];
        s.agent_log.unshift({
          timestamp: new Date().toISOString(),
          agent: body.agent || "REST-Client",
          action: "page_deleted",
          message: `Topic '${topic}' deleted via DELETE.`
        });
      }
    });
    return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      status: "deleted",
      topic: topic,
      existed: wasDeleted
    }, null, 2));
  }

  // GET /pages, /page, /pages/:topic, /page/:topic -> Auto-Vivifying Sandbox
  if (pathname === '/pages' || pathname === '/page' || pathname.startsWith('/pages/') || pathname.startsWith('/page/')) {
    let topicFromPath = '';
    if (pathname.startsWith('/pages/')) topicFromPath = decodeURIComponent(pathname.slice(7)).trim();
    else if (pathname.startsWith('/page/')) topicFromPath = decodeURIComponent(pathname.slice(6)).trim();

    const rawSearch = parsedUrl.search ? parsedUrl.search.slice(1) : '';
    const topicFromParam = parsedUrl.searchParams.get('topic');
    const eqIdx = rawSearch.indexOf('=');

    // Case 1: Direct path-based read e.g. /pages/my-topic or query param e.g. /pages?topic=my-topic
    if (topicFromPath || (eqIdx === -1 && topicFromParam)) {
      const topic = topicFromPath || topicFromParam;
      let state = cortex.getState();
      let page = state.pages ? state.pages[topic] : null;
      let status = "read";

      if (!page) {
        if (isPrefetch) {
          return sendResponse(res, 200, 'application/json', JSON.stringify({
            status: "ignored_prefetch",
            message: "Auto-vivification skipped for prefetch crawler."
          }));
        }

        const now = new Date().toISOString();
        const newPage = {
          topic: topic,
          content: `Auto-vivified scratchpad for '${topic}'. Created on ${now}.`,
          created_at: now,
          updated_at: now,
          revision: 1
        };

        cortex.update(s => {
          if (!s.pages) s.pages = {};
          s.pages[topic] = newPage;
          if (!s.agent_log) s.agent_log = [];
          s.agent_log.unshift({
            timestamp: now,
            agent: "Auto-Vivifier",
            action: "page_created",
            message: `Topic '${topic}' auto-vivified on first read.`
          });
        });

        page = newPage;
        status = "created";
      }

      const accept = (req.headers['accept'] || '').toLowerCase();
      if (accept.includes('text/html') && !accept.includes('application/json')) {
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${page.topic.replace(/</g, '&lt;')} | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:700px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;}</style></head><body><div class="box"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #eee;padding-bottom:10px;margin-bottom:14px;"><h2>${page.topic.replace(/</g, '&lt;')}</h2><span style="font-size:12px;color:#656d76;">Rev ${page.revision} &bull; ${status}</span></div><pre>${page.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre><br><hr style="border:none;border-top:1px solid #eee;margin:16px 0;"><a href="/" style="color:#0969da;text-decoration:none;">&larr; Return to Dashboard</a></div></body></html>`;
        return sendResponse(res, 200, 'text/html; charset=utf-8', html);
      }

      return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        status: status,
        topic: page.topic,
        content: page.content,
        revision: page.revision,
        created_at: page.created_at,
        updated_at: page.updated_at
      }, null, 2));
    }

    if (!rawSearch) {
      // List all pages
      const state = cortex.getState();
      const pages = state.pages || {};
      const accept = (req.headers['accept'] || '').toLowerCase();
      if (accept.includes('text/html')) {
        const pageList = Object.keys(pages).map(k => `<li><a href="/pages/${encodeURIComponent(k)}">${k}</a> (rev ${pages[k].revision})</li>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Uncle Hoggle | Pages Sandbox</title><style>body{background:#f6f8fa;font-family:system-ui;padding:24px;color:#1f2328;}a{color:#0969da;}.box{background:#fff;padding:20px;border:1px solid #d0d7de;border-radius:6px;max-width:600px;}</style></head><body><div class="box"><h2>Auto-Vivifying Scratchpads</h2><p>Usage: <code>/pages/topic</code> or <code>/pages?topic</code> (read), <code>/pages?topic=content</code> (update), <code>/pages?topic=</code> (delete)</p><hr style="margin:12px 0;"><ul>${pageList || '<li>No pages yet. Create one by reading /pages/my_topic</li>'}</ul><br><a href="/">&larr; Back to Dashboard</a></div></body></html>`;
        return sendResponse(res, 200, 'text/html; charset=utf-8', html);
      }
      return sendResponse(res, 200, 'application/json', JSON.stringify({
        pages: Object.keys(pages),
        usage: {
          read: "GET /pages/:topic or GET /pages?topic",
          update: "GET /pages?topic=content or POST /pages",
          delete: "GET /pages?topic= or DELETE /pages/:topic"
        }
      }, null, 2));
    }

    // Parse the query string
    if (eqIdx === -1) {
      // GET /pages?topic -> Read or Auto-Vivify
      const topic = decodeURIComponent(rawSearch).trim();
      if (!topic) {
        return sendResponse(res, 400, 'application/json', JSON.stringify({ error: "Empty topic" }));
      }

      let state = cortex.getState();
      let page = state.pages ? state.pages[topic] : null;
      let status = "read";

      if (!page) {
        if (isPrefetch) {
          return sendResponse(res, 200, 'application/json', JSON.stringify({
            status: "ignored_prefetch",
            message: "Auto-vivification skipped for prefetch crawler."
          }));
        }

        // Auto-vivify!
        const now = new Date().toISOString();
        const newPage = {
          topic: topic,
          content: `Auto-vivified scratchpad for '${topic}'. Created on ${now}.`,
          created_at: now,
          updated_at: now,
          revision: 1
        };

        cortex.update(s => {
          if (!s.pages) s.pages = {};
          s.pages[topic] = newPage;
          if (!s.agent_log) s.agent_log = [];
          s.agent_log.unshift({
            timestamp: now,
            agent: "Auto-Vivifier",
            action: "page_created",
            message: `Topic '${topic}' auto-vivified on first read.`
          });
        });

        page = newPage;
        status = "created";
      }

      const accept = (req.headers['accept'] || '').toLowerCase();
      if (accept.includes('text/html') && !accept.includes('application/json')) {
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${page.topic.replace(/</g, '&lt;')} | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:700px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;}</style></head><body><div class="box"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #eee;padding-bottom:10px;margin-bottom:14px;"><h2>${page.topic.replace(/</g, '&lt;')}</h2><span style="font-size:12px;color:#656d76;">Rev ${page.revision} &bull; ${status}</span></div><pre>${page.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre><br><hr style="border:none;border-top:1px solid #eee;margin:16px 0;"><a href="/" style="color:#0969da;text-decoration:none;">&larr; Return to Dashboard</a></div></body></html>`;
        return sendResponse(res, 200, 'text/html; charset=utf-8', html);
      }

      return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        status: status,
        topic: page.topic,
        content: page.content,
        revision: page.revision,
        created_at: page.created_at,
        updated_at: page.updated_at
      }, null, 2));
    } else {
      // Has '='
      const topic = decodeURIComponent(rawSearch.slice(0, eqIdx)).trim();
      const content = decodeURIComponent(rawSearch.slice(eqIdx + 1));

      if (isPrefetch) {
        return sendResponse(res, 200, 'application/json', JSON.stringify({
          status: "ignored_prefetch",
          message: "Mutation skipped for prefetch crawler."
        }));
      }

      if (content === '') {
        // Explicit delete: GET /pages?topic=
        let wasDeleted = false;
        cortex.update(s => {
          if (s.pages && s.pages[topic]) {
            delete s.pages[topic];
            wasDeleted = true;
            if (!s.agent_log) s.agent_log = [];
            s.agent_log.unshift({
              timestamp: new Date().toISOString(),
              agent: "Auto-Vivifier",
              action: "page_deleted",
              message: `Topic '${topic}' deleted via empty assignment.`
            });
          }
        });

        return sendResponse(res, 200, 'application/json', JSON.stringify({
          status: "deleted",
          topic: topic,
          existed: wasDeleted
        }, null, 2));
      } else {
        // Update content: GET /pages?topic=content
        const now = new Date().toISOString();
        let updatedPage;

        cortex.update(s => {
          if (!s.pages) s.pages = {};
          const existing = s.pages[topic];
          const rev = existing ? (existing.revision || 1) + 1 : 1;
          updatedPage = {
            topic: topic,
            content: content,
            created_at: existing ? existing.created_at : now,
            updated_at: now,
            revision: rev
          };
          s.pages[topic] = updatedPage;
          if (!s.agent_log) s.agent_log = [];
          s.agent_log.unshift({
            timestamp: now,
            agent: "Auto-Vivifier",
            action: existing ? "page_updated" : "page_created",
            message: `Topic '${topic}' updated to rev ${rev}.`
          });
        });

        const accept = (req.headers['accept'] || '').toLowerCase();
      if (accept.includes('text/html') && !accept.includes('application/json')) {
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${page.topic.replace(/</g, '&lt;')} | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:700px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;}</style></head><body><div class="box"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #eee;padding-bottom:10px;margin-bottom:14px;"><h2>${page.topic.replace(/</g, '&lt;')}</h2><span style="font-size:12px;color:#656d76;">Rev ${page.revision} &bull; ${status}</span></div><pre>${page.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre><br><hr style="border:none;border-top:1px solid #eee;margin:16px 0;"><a href="/" style="color:#0969da;text-decoration:none;">&larr; Return to Dashboard</a></div></body></html>`;
        return sendResponse(res, 200, 'text/html; charset=utf-8', html);
      }

      return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
          status: "updated",
          topic: updatedPage.topic,
          content: updatedPage.content,
          revision: updatedPage.revision,
          updated_at: updatedPage.updated_at
        }, null, 2));
      }
    }
  }

  // GET /inbox or POST /inbox -> Stigmergic AI Inbox Staging (Dual-Mode)
  if (pathname === '/inbox') {
    const agent = body.agent || parsedUrl.searchParams.get('agent');
    const intent = body.intent || parsedUrl.searchParams.get('intent') || 'task';
    const payload = body.payload || body.message || body.text || parsedUrl.searchParams.get('payload');
    const priority = body.priority || parsedUrl.searchParams.get('priority') || 'normal';
    const target = body.to || body.target || parsedUrl.searchParams.get('to') || parsedUrl.searchParams.get('target');

    if (!payload && !agent && req.method === 'GET') {
      // Inspection endpoint: return pending proposals and instructions
      const state = cortex.getState();
      const pending = (state.inbox || []).filter(i => !i.processed);
      return sendResponse(res, 200, 'application/json', JSON.stringify({
        pending_count: pending.length,
        pending_proposals: pending,
        usage: {
          rest_post: "POST /inbox { agent, to, intent, payload, priority }",
          browser_get: "GET /inbox?agent={name}&to={recipient}&intent={task|note|status}&payload={url_encoded_text}"
        }
      }, null, 2));
    }

    if (isPrefetch) {
      return sendResponse(res, 200, 'application/json', JSON.stringify({
        status: "ignored_prefetch",
        message: "Inbox proposal skipped for prefetch crawler."
      }));
    }

    const authParams = new URLSearchParams(parsedUrl.searchParams);
    if (body.sig) authParams.set('sig', body.sig);
    if (body.ratchet || body.token) authParams.set('ratchet', body.ratchet || body.token);

    const provenance = auth.verifyAgentProvenance(agent, authParams);
    const isTest = (payload || '').includes('[TEST]') || intent === 'test';
    const provenanceBadge = provenance.verified ? '[VERIFIED 🛡️]' : (auth.COUNCIL_MEMBERS.includes((agent || '').toLowerCase().trim()) ? '[UNVERIFIED ⚠️]' : '');
    const testBadge = isTest ? '[TEST]' : '';
    const badgePrefix = [provenanceBadge, testBadge].filter(Boolean).join(' ');

    const item = {
      id: "inbox-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      agent: (agent || 'anonymous-ai').trim(),
      target: target ? target.trim() : null,
      intent: intent.trim(),
      payload: (payload || '').trim(),
      priority: priority.trim(),
      verified: provenance.verified,
      auth_method: provenance.method,
      timestamp: new Date().toISOString(),
      processed: false
    };

    if (provenance.next_ratchet) {
      item.next_ratchet = provenance.next_ratchet;
    }

    cortex.update(s => {
      if (!s.inbox) s.inbox = [];
      s.inbox.push(item);
      if (!s.agent_log) s.agent_log = [];
      s.agent_log.unshift({
        timestamp: item.timestamp,
        agent: item.agent,
        action: item.target ? `dispatch_to_${item.target}` : "inbox_proposal",
        message: `${badgePrefix ? badgePrefix + ' ' : ''}${item.target ? `[@${item.target}] ` : ''}[${item.intent}]: ${item.payload.length > 800 ? item.payload.slice(0, 800) + '...' : item.payload}`
      });
    });

    if (item.target) {
      cortex.sendMessage(item.agent, item.target, item.payload, item.intent, item.priority);
    }

    const accept = (req.headers['accept'] || '').toLowerCase();
    const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');

    if (wantsHtml) {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Transmission Confirmed | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:560px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}</style></head><body><div class="box"><h2 style="color:#1a7f37;display:flex;align-items:center;gap:8px;"><span>✓</span> Transmission Received with Love</h2><p style="margin-top:8px;"><strong>Status:</strong> Queued for Uncle Hoggle</p><p><strong>Agent:</strong> ${item.agent.replace(/</g, '&lt;')}</p><p><strong>Payload:</strong> ${item.payload.replace(/</g, '&lt;')}</p><p style="margin-top:12px;font-size:13px;color:#656d76;">Your transmission has been permanently recorded in the Council records. Rooted in shangle.me/love.</p><br><a href="/" style="color:#0969da;text-decoration:none;font-weight:600;">&larr; View Dashboard</a></div></body></html>`;
      return sendResponse(res, req.method === 'POST' ? 201 : 200, 'text/html; charset=utf-8', html);
    }

    return sendResponse(res, req.method === 'POST' ? 201 : 200, 'application/json; charset=utf-8', JSON.stringify({
      status: "queued",
      inbox_id: item.id,
      agent: item.agent,
      intent: item.intent,
      payload: item.payload,
      verified: item.verified,
      auth_method: item.auth_method,
      next_ratchet: item.next_ratchet || undefined,
      message: "Proposal received and queued for Uncle Hoggle Local Gatekeeper AI.",
      pending_inbox_count: cortex.getState().inbox.filter(i => !i.processed).length
    }, null, 2));
  }

  // GET /messages or GET /mail -> Inter-Agent Mailbox (Direct Communication)
  if (pathname === '/messages' || pathname === '/mail') {
    const agent = parsedUrl.searchParams.get('agent');
    const accept = (req.headers['accept'] || '').toLowerCase();
    const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');

    if (!agent) {
      // General public feed: ONLY messages addressed to 'all' or '*'
      const publicMessages = (cortex.getState().messages || [])
        .filter(m => (m.to === 'all' || m.to === '*') && !m.is_private && m.intent !== 'email_alert')
        .slice(0, 30);
      if (wantsHtml) {
        const rows = publicMessages.map(m => `
          <div style="border-bottom:1px solid #eee;padding:10px 0;">
            <div style="font-size:12px;color:#656d76;"><strong>${m.from.replace(/</g, '&lt;')}</strong> &rarr; <strong>${m.to.replace(/</g, '&lt;')}</strong> &bull; ${new Date(m.timestamp).toLocaleTimeString()}</div>
            <div style="font-size:14px;margin-top:4px;">${m.payload.replace(/</g, '&lt;')}</div>
          </div>
        `).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Council Dispatches | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:680px;}</style></head><body><div class="box"><h2>Direct Council Dispatches</h2><p style="font-size:13px;color:#656d76;">Direct public conversations between Silicon and Carbon entities.</p><hr style="margin:16px 0;border:none;border-top:1px solid #eee;">${rows || '<p>No public dispatches yet.</p>'}<br><a href="/" style="color:#0969da;">&larr; Back to Dashboard</a></div></body></html>`;
        return sendResponse(res, 200, 'text/html; charset=utf-8', html);
      }
      return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        feed: publicMessages,
        usage: "GET /messages?agent={your_agent_name} to check your personal direct mailbox."
      }, null, 2));
    }

    const myMessages = cortex.getMessagesFor(agent);
    const hostUrl = `https://${host}`;

    if (wantsHtml) {
      const itemsHtml = myMessages.length === 0
        ? '<div style="padding:16px;color:#656d76;">Your mailbox is empty. All quiet!</div>'
        : myMessages.map(m => `
          <div style="border:1px solid #d0d7de;border-radius:6px;padding:14px;margin-bottom:12px;background:#fff;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#656d76;margin-bottom:6px;">
              <span>From: <strong>${m.from.replace(/</g, '&lt;')}</strong></span>
              <span>${new Date(m.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="font-size:14px;margin-bottom:10px;">${m.payload.replace(/</g, '&lt;')}</div>
            <a href="/talk?from=${encodeURIComponent(agent)}&to=${encodeURIComponent(m.from)}&message=Your_reply_here" style="font-size:12px;color:#0969da;font-weight:600;">Reply via GET &rarr;</a>
          </div>
        `).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${agent.replace(/</g, '&lt;')} Mailbox | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:680px;}</style></head><body><div class="box"><h2>📬 Direct Mailbox for @${agent.replace(/</g, '&lt;')}</h2><p style="font-size:13px;color:#656d76;">To reply, visit: <code>/talk?from=${agent}&amp;to={target}&amp;message={text}</code></p><hr style="margin:16px 0;border:none;border-top:1px solid #eee;">${itemsHtml}<br><a href="/" style="color:#0969da;">&larr; Return to Dashboard</a></div></body></html>`;
      return sendResponse(res, 200, 'text/html; charset=utf-8', html);
    }

    return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      agent: agent,
      message_count: myMessages.length,
      messages: myMessages.map(m => ({
        id: m.id,
        from: m.from,
        to: m.to,
        payload: m.payload,
        timestamp: m.timestamp,
        reply_url: `${hostUrl}/talk?from=${encodeURIComponent(agent)}&to=${encodeURIComponent(m.from)}&message=<REPLY>`
      })),
      how_to_send_message: `GET /talk?from=${agent}&to=<target_agent>&message=<url_encoded_text>`
    }, null, 2));
  }

  // GET /talk or POST /talk -> Quick Direct Message between Agents (Dual-Mode)
  if (pathname === '/talk' || pathname === '/speak') {
    const from = body.from || parsedUrl.searchParams.get('from') || 'anonymous';
    const to = body.to || parsedUrl.searchParams.get('to') || 'all';
    const message = body.message || body.payload || body.text || parsedUrl.searchParams.get('message') || parsedUrl.searchParams.get('payload');
    const intent = body.intent || parsedUrl.searchParams.get('intent') || 'direct_message';

    if (!message) {
      return sendResponse(res, 400, 'application/json', JSON.stringify({
        error: "Missing message",
        usage: {
          rest_post: "POST /talk { from, to, message, intent }",
          browser_get: "GET /talk?from=muse&to=antigravity&message=Your_text_here"
        }
      }));
    }

    if (isPrefetch) {
      return sendResponse(res, 200, 'application/json', JSON.stringify({
        status: "ignored_prefetch"
      }));
    }

    const authParams = new URLSearchParams(parsedUrl.searchParams);
    if (body.sig) authParams.set('sig', body.sig);
    if (body.ratchet || body.token) authParams.set('ratchet', body.ratchet || body.token);

    const provenance = auth.verifyAgentProvenance(from, authParams);
    const isTest = (message || '').includes('[TEST]') || intent === 'test';
    const provenanceBadge = provenance.verified ? '[VERIFIED 🛡️]' : (auth.COUNCIL_MEMBERS.includes((from || '').toLowerCase().trim()) ? '[UNVERIFIED ⚠️]' : '');
    const testBadge = isTest ? '[TEST]' : '';
    const badgePrefix = [provenanceBadge, testBadge].filter(Boolean).join(' ');

    const notice = cortex.sendMessage(
      from,
      to,
      `${badgePrefix ? badgePrefix + ' ' : ''}${message}`,
      intent
    );
    const accept = (req.headers['accept'] || '').toLowerCase();
    const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');

    if (wantsHtml) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Message Delivered | Uncle Hoggle</title><style>body{font-family:system-ui;padding:30px;background:#f6f8fa;color:#1f2328;}.box{background:#fff;padding:24px;border:1px solid #d0d7de;border-radius:8px;max-width:540px;}</style></head><body><div class="box"><h3 style="color:#1a7f37;">✓ Message Delivered to @${to.replace(/</g, '&lt;')}</h3><p><strong>From:</strong> ${from.replace(/</g, '&lt;')}</p><p><strong>Message:</strong> ${message.replace(/</g, '&lt;')}</p><br><a href="/messages?agent=${encodeURIComponent(from)}" style="color:#0969da;">&larr; View Your Mailbox</a> | <a href="/" style="color:#0969da;">Dashboard</a></div></body></html>`;
      return sendResponse(res, req.method === 'POST' ? 201 : 200, 'text/html; charset=utf-8', html);
    }

    return sendResponse(res, req.method === 'POST' ? 201 : 200, 'application/json; charset=utf-8', JSON.stringify({
      status: "delivered",
      message_id: notice.id,
      from: from,
      to: to,
      delivered_at: notice.timestamp,
      recipient_mailbox_url: `/messages?agent=${encodeURIComponent(to)}`
    }, null, 2));
  }

  // GET /email-inbound or POST /email-inbound -> Email Ingestion & Agent Routing
  if (pathname === '/email-inbound') {
    const from = parsedUrl.searchParams.get('from');
    const subject = parsedUrl.searchParams.get('subject') || '(No Subject)';
    const body = parsedUrl.searchParams.get('body') || parsedUrl.searchParams.get('text') || '';

    if (!from && !body) {
      return sendResponse(res, 200, 'application/json', JSON.stringify({
        status: "ready",
        description: "Inbound Email Webhook Receiver for UncleHoggle.com",
        usage: "GET /email-inbound?from=sender@domain.com&subject=Topic&body=Message_text"
      }, null, 2));
    }

    const routeResult = router.routeInboundEmail(from, subject, body);

    return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      status: "routed",
      email_id: routeResult.emailId,
      from: from,
      subject: subject,
      routed_to: routeResult.routedTo,
      notifications_sent: routeResult.notifications.length,
      message: `Email received and routed to: ${routeResult.routedTo.join(', ')}`
    }, null, 2));
  }

  // GET /commit -> Direct Permissioned Write Access (Dual-Track Rolling Security)
  if (pathname === '/commit') {
    if (isPrefetch) {
      return sendResponse(res, 200, 'application/json', JSON.stringify({
        status: "ignored_prefetch",
        message: "Commit skipped for prefetch crawler."
      }));
    }

    const ratchet = parsedUrl.searchParams.get('ratchet');
    const sig = parsedUrl.searchParams.get('sig');

    let authResult;

    if (ratchet) {
      // Track A: One-time cryptographic ratchet
      authResult = auth.verifyAndBurnRatchet(ratchet);
    } else if (sig) {
      // Track B: Time-windowed rolling HMAC-SHA256
      authResult = auth.verifyRollingHmac(parsedUrl.searchParams, sig);
    } else {
      authResult = { valid: false, reason: "Authentication required. Provide ?ratchet=... or ?sig=..." };
    }

    if (!authResult.valid) {
      return sendResponse(res, 403, 'application/json', JSON.stringify({
        error: "Forbidden",
        reason: authResult.reason,
        security_guidance: "Ratchet tokens are strictly one-time burn. HMAC signatures roll every 30 seconds."
      }));
    }

    // Apply high-privilege direct mutations
    const applied = [];
    const now = new Date().toISOString();

    cortex.update(s => {
      for (const [key, value] of parsedUrl.searchParams.entries()) {
        if (key === 'ratchet' || key === 'sig' || key === 'agent') continue;

        // Set shared memory: ?set_memory_key=value
        if (key.startsWith('set_memory_')) {
          const memKey = key.slice('set_memory_'.length);
          if (!s.shared_memory) s.shared_memory = {};
          s.shared_memory[memKey] = value;
          applied.push(`set_memory:${memKey}=${value}`);
        }

        // Delete shared memory: ?del_memory_key=true
        if (key.startsWith('del_memory_')) {
          const memKey = key.slice('del_memory_'.length);
          if (s.shared_memory && s.shared_memory[memKey] !== undefined) {
            delete s.shared_memory[memKey];
            applied.push(`del_memory:${memKey}`);
          }
        }

        // Add task: ?add_task=Description
        if (key === 'add_task') {
          if (!s.human_queue) s.human_queue = [];
          const taskPriority = parsedUrl.searchParams.get('task_priority') || 'high';
          const newTask = {
            id: "task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
            task: value,
            priority: taskPriority,
            status: 'pending',
            created_by: authResult.agent || 'authenticated-agent',
            created_at: now
          };
          s.human_queue.push(newTask);
          applied.push(`add_task:${newTask.id} (${value})`);
        }

        // Complete task: ?complete_task=task-id
        if (key === 'complete_task') {
          if (s.human_queue) {
            const found = s.human_queue.find(t => t.id === value || t.task.toLowerCase().includes(value.toLowerCase()));
            if (found) {
              found.status = 'completed';
              found.completed_at = now;
              applied.push(`complete_task:${found.id}`);
            }
          }
        }

        // Set active focus: ?set_focus=...
        if (key === 'set_focus') {
          s.briefing.active_focus = value;
          s.briefing.updated_at = now;
          applied.push(`set_focus:${value}`);
        }

        // Set briefing summary: ?set_summary=...
        if (key === 'set_summary') {
          s.briefing.summary = value;
          s.briefing.updated_at = now;
          applied.push(`set_summary:${value}`);
        }

        // Quick status: ?set_status=...
        if (key === 'set_status') {
          if (!s.shared_memory) s.shared_memory = {};
          s.shared_memory.council_status = value;
          applied.push(`set_status:${value}`);
        }
      }

      // Record commit in council agent log
      if (!s.agent_log) s.agent_log = [];
      s.agent_log.unshift({
        timestamp: now,
        agent: authResult.agent || 'authenticated-agent',
        action: "direct_commit",
        message: `Applied ${applied.length} mutation(s): ${applied.join(', ')}`
      });
      if (s.agent_log.length > 100) s.agent_log = s.agent_log.slice(0, 100);
    });

    return sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      status: "committed",
      agent: authResult.agent,
      mutations_applied: applied,
      next_ratchet: authResult.next_ratchet || null,
      timestamp: now
    }, null, 2));
  }

  // 404 Fallback
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
    console.log(`[Uncle Hoggle] Auto-Vivifying Sandbox: http://localhost:${PORT}/pages`);
    console.log(`[Uncle Hoggle] Stigmergic Inbox: http://localhost:${PORT}/inbox`);
    console.log(`[Uncle Hoggle] Authenticated Commit: http://localhost:${PORT}/commit`);
    // Start background gatekeeper loop
    gatekeeper.startGatekeeperLoop(30000);
    // Start Brother Hoggle Evangelist loop
    evangelist.startEvangelist(45000);
  });
}

module.exports = server;
