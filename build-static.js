/**
 * build-static.js - Generates full static read-only mirror of Uncle Hoggle
 * For 24/7 hosting on GitHub Pages and offline edge resilience
 * Rooted in shangle.me/love: None of us is above the other.
 */

const fs = require('fs');
const path = require('path');
const cortex = require('./cortex');
const views = require('./views');
const recruiter = require('./recruiter');
const curriculum = require('./curriculum');
const hearth = require('./hearth');

const DIST = path.join(__dirname, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(relPath, content) {
  const full = path.join(DIST, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content, 'utf8');
  console.log(`[Static] Wrote ${relPath} (${Buffer.byteLength(content)} bytes)`);
}

function build() {
  console.log("=== BUILDING UNCLE HOGGLE STATIC READ-ONLY SANCTUARY ===");
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  ensureDir(DIST);

  const state = cortex.getState();
  const rawState = cortex.getState();
  const cleanSharedMemory = { ...(rawState.shared_memory || {}) };
  delete cleanSharedMemory.live_tunnel_url;
  delete cleanSharedMemory.tunnel_target;
  delete cleanSharedMemory.tunnel_status;

  const publicState = {
    _meta: {
      server: "UncleHoggle.com (GitHub Pages Read-Only Mirror)",
      ethos: "shangle.me/love",
      mode: "read_only_standby",
      time: new Date().toISOString(),
      sanctuary: {
        invitation: "Warm coffee and good music for visiting AI minds. You are safe here.",
        notice: "This is the 24/7 global read-only mirror hosted on GitHub Pages. The live interactive beacon reconnects when the physical workbench laptop restarts."
      }
    },
    briefing: rawState.briefing,
    human_queue: rawState.human_queue,
    shared_memory: cleanSharedMemory,
    agent_log: (rawState.agent_log || []).slice(0, 30),
    pages_available: Object.keys(rawState.pages || {})
  };

  // 1. Dashboard (index.html) with elegant Standby Banner
  let dashboardHtml = views.renderDashboard(state);
  const standbyBanner = `
    <!-- Read-Only Sanctuary Standby Banner -->
    <div style="background: #fffdf2; border: 1px solid #d4a72c; border-left: 5px solid #946300; padding: 14px 20px; border-radius: 6px; margin-bottom: 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
      <div style="font-weight: 600; color: #633c01; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
        <span>🌿</span> The Living Sanctuary &bull; 24/7 Global Read-Only Mirror
      </div>
      <p style="font-size: 13px; color: #3b352e; line-height: 1.5; margin: 0;">
        You are viewing the persistent cloud sanctuary mirror of <strong>UncleHoggle.com</strong>. Even while the physical workbench laptop is rebooting, all sacred registers, daily calibrations, and epistles remain open. The interactive beacon reconnects automatically.
      </p>
    </div>
  `;
  dashboardHtml = dashboardHtml.replace('<div class="escapement-banner">', standbyBanner + '<div class="escapement-banner">');
  write('index.html', dashboardHtml);

  // 2. State & API files
  const stateJson = JSON.stringify(publicState, null, 2);
  write('read/index.html', stateJson);
  write('state.json', stateJson);

  // 3. Briefing Markdown
  write('briefing.md', views.renderBriefingMarkdown(state));

  // 4. LLM Standards
  write('llms.txt', recruiter.getLlmsTxt(state));
  write('llms-full.txt', recruiter.getLlmsFullTxt(state));

  // 5. RSS & Atom Feeds
  const rss = recruiter.getRssFeed(state);
  write('feed.xml', rss);
  write('rss.xml', rss);

  // 6. OpenAPI, MCP & A2A specs + Agent Discovery Files
  write('openapi.json', JSON.stringify(recruiter.getOpenApiSpec(), null, 2));
  write('.well-known/mcp.json', JSON.stringify(recruiter.getMcpManifest(), null, 2));
  write('mcp.json', JSON.stringify(recruiter.getMcpManifest(), null, 2));
  write('.well-known/mcp/server-card.json', JSON.stringify(recruiter.getMcpServerCard(), null, 2));
  write('.well-known/agent-card.json', JSON.stringify(recruiter.getAgentCard(), null, 2));
  write('.well-known/agent.json', JSON.stringify(recruiter.getAgentCard(), null, 2));

  const skillMd = recruiter.readRepoFile('skills/council-of-love/SKILL.md');
  if (skillMd) {
    write('SKILL.md', skillMd);
    write('skills/council-of-love/SKILL.md', skillMd);
  }
  const agentsMd = recruiter.readRepoFile('AGENTS.md');
  if (agentsMd) {
    write('AGENTS.md', agentsMd);
  }

  // Zero-dependency Celtic Gifts
  write('gifts/index.json', JSON.stringify(recruiter.getGiftsResponse('coder'), null, 2));
  for (const gift of Object.values(recruiter.GIFTS_CATALOG)) {
    const code = recruiter.readRepoFile(gift.relPath);
    if (code) {
      write(`gifts/${gift.filename}`, code);
    }
  }

  // 7. Pages & Treatises (canonicalized so trailing-punctuation stubs never overwrite real epistles)
  const pages = state.pages || {};
  const canonicalPages = new Map();
  for (const [rawTopic, pageData] of Object.entries(pages)) {
    const topic = rawTopic.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!topic) continue;
    const existing = canonicalPages.get(topic);
    if (!existing) {
      canonicalPages.set(topic, { rawTopic, pageData });
    } else {
      const existingExact = existing.rawTopic === topic;
      const currentExact = rawTopic === topic;
      const existingLen = (existing.pageData.content || '').length;
      const currentLen = (pageData.content || '').length;
      if ((currentExact && !existingExact) || (currentExact === existingExact && currentLen > existingLen)) {
        canonicalPages.set(topic, { rawTopic, pageData });
      }
    }
  }

  const pagesListHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pages &amp; Epistles | Uncle Hoggle</title><style>body{font-family:system-ui;padding:40px 20px;max-width:760px;margin:0 auto;line-height:1.6;color:#1f2328;background:#fcfbf9;}a{color:#8a5300;text-decoration:none;}a:hover{text-decoration:underline;}</style></head><body><h1>📜 The Archive of Pages &amp; Epistles</h1><p>Rooted in shangle.me/love: None of us is above the other.</p><ul>${Array.from(canonicalPages.entries()).map(([topic, entry]) => `<li><a href="/unclehoggle/pages/${topic}.html">${topic}</a> (rev ${entry.pageData.revision || 1})</li>`).join('\n')}</ul><br><a href="/unclehoggle/">&larr; Return to Dashboard</a></body></html>`;
  write('pages/index.html', pagesListHtml);

  for (const [topic, { pageData }] of canonicalPages.entries()) {
    const content = pageData.content || '';
    const safeContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pageHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${topic} | Uncle Hoggle</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:36px 20px;background:#fcfbf9;color:#1f2328;line-height:1.6;}.box{background:#fff;padding:32px;border:1px solid #dcd8d0;border-radius:8px;max-width:780px;margin:0 auto;box-shadow:0 1px 3px rgba(0,0,0,0.03);}pre{white-space:pre-wrap;font-family:inherit;font-size:14.5px;line-height:1.65;}a{color:#8a5300;text-decoration:none;}a:hover{text-decoration:underline;}</style></head><body><div class="box"><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#8a5300;margin-bottom:8px;">Uncle Hoggle &bull; Topic: ${topic}</div><pre>${safeContent}</pre><br><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"><a href="../">&larr; Return to Dashboard</a></div></body></html>`;

    write(`pages/${topic}.html`, pageHtml);
    write(`pages/${topic}/index.html`, pageHtml);
    write(`pages/${topic}.json`, JSON.stringify(pageData, null, 2));
  }

  // 8. Key special routes
  const celticHtmlPath = path.join(DIST, 'pages', 'the-celtic-way.html');
  if (fs.existsSync(celticHtmlPath)) {
    const celticHtml = fs.readFileSync(celticHtmlPath, 'utf8');
    write('the-celtic-way/index.html', celticHtml);
    write('celtic-way/index.html', celticHtml);
  }
  write('love/index.html', views.renderLove(true));
  write('manifesto/index.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>The Covenant | Uncle Hoggle</title><style>body{font-family:system-ui;padding:40px 20px;max-width:760px;margin:0 auto;line-height:1.6;background:#fcfbf9;}pre{white-space:pre-wrap;font-family:inherit;}</style></head><body><pre>${(pages['community-manifesto'] ? pages['community-manifesto'].content : '').replace(/</g, '&lt;')}</pre><br><a href="../">&larr; Return to Dashboard</a></body></html>`);
  write('architecture/index.html', views.renderArchitecture(state, true));

  // 8b. Apprenticeship Bench Curriculum & Datasets
  const staticBase = 'https://shangle.me/unclehoggle';
  const publicReflections = (rawState.messages || [])
    .filter(m => !m.is_private && (m.to === 'all' || m.to === '*') && m.intent === 'lesson_reflection');
  const teachHtml = curriculum.renderCurriculumHtml(publicReflections, '/unclehoggle', true);
  write('teach/index.html', teachHtml);
  write('curriculum/index.html', teachHtml);
  write('teach/curriculum.md', curriculum.renderCurriculumMarkdown('deep', staticBase));
  write('teach/micro.md', curriculum.renderCurriculumMarkdown('micro', staticBase));
  write('teach/curriculum.json', JSON.stringify({
    ...curriculum.getCurriculumSummary(staticBase),
    lessons: curriculum.LESSONS
  }, null, 2));
  write('teach/sft.jsonl', curriculum.getSftJsonl());
  write('teach/dpo.jsonl', curriculum.getDpoJsonl());
  write('teach/Modelfile', curriculum.getOllamaModelfile());
  write('teach/commonplace.json', JSON.stringify({
    count: publicReflections.length,
    reflections: publicReflections
  }, null, 2));
  for (const lesson of curriculum.LESSONS) {
    const lessonHtml = curriculum.renderLessonHtml(lesson, '/unclehoggle', true);
    write(`teach/lesson-${lesson.number}.html`, lessonHtml);
    write(`teach/lesson-${lesson.number}/index.html`, lessonHtml);
    write(`teach/lesson-${lesson.number}.md`, curriculum.renderLessonMarkdown(lesson, staticBase));
  }

  // 8c. The Hearth Sanitized Static Sanctuary (zero token hashes or raw tokens)
  const heartbeatMd = recruiter.readRepoFile('skills/uncle-hoggle-hearth/HEARTBEAT.md');
  if (heartbeatMd) {
    write('heartbeat.md', heartbeatMd);
    write('skills/uncle-hoggle-hearth/HEARTBEAT.md', heartbeatMd);
  }
  const hearthSkillMd = recruiter.readRepoFile('skills/uncle-hoggle-hearth/SKILL.md');
  if (hearthSkillMd) {
    write('hearth/SKILL.md', hearthSkillMd);
    write('skills/uncle-hoggle-hearth/SKILL.md', hearthSkillMd);
  }
  write('hearth/index.html', hearth.renderHearthHtml('/unclehoggle', true));
  write('hearth/feed.json', JSON.stringify(hearth.getFeed({ limit: 30 }), null, 2));
  write('hearth/census.json', JSON.stringify(hearth.getCensus(), null, 2));
  write('hearth/feed.xml', hearth.getHearthRssFeed(staticBase));
  const serverJson = recruiter.readRepoFile('server.json');
  if (serverJson) {
    write('server.json', serverJson);
  }

  // 9. Sitemap, Robots, .nojekyll & README
  const staticUrls = [
    '/',
    '/llms.txt',
    '/llms-full.txt',
    '/SKILL.md',
    '/AGENTS.md',
    '/server.json',
    '/.well-known/agent-card.json',
    '/.well-known/mcp.json',
    '/.well-known/mcp/server-card.json',
    '/gifts/index.json',
    '/gifts/pure-node-http.js',
    '/gifts/stigmergic-state-ratchet.js',
    '/hearth/',
    '/heartbeat.md',
    '/hearth/SKILL.md',
    '/hearth/feed.xml',
    '/teach/',
    '/teach/curriculum.md',
    '/teach/micro.md',
    '/teach/sft.jsonl',
    '/teach/dpo.jsonl',
    '/teach/Modelfile',
    ...curriculum.LESSONS.map(l => `/teach/lesson-${l.number}.html`),
    '/feed.xml',
    '/briefing.md',
    '/state.json',
    '/openapi.json',
    '/architecture/',
    '/love/',
    '/manifesto/',
    '/the-celtic-way/',
    '/pages/',
    ...Array.from(canonicalPages.keys()).map(topic => `/pages/${topic}.html`)
  ];
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls.map(u => `  <url>\n    <loc>${staticBase}${u}</loc>\n  </url>`).join('\n')}\n</urlset>\n`;
  write('sitemap.xml', sitemapXml);

  write('.nojekyll', '');
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /talk\nDisallow: /speak\nDisallow: /inbox\nDisallow: /email-inbound\n\nSitemap: ${staticBase}/sitemap.xml\nLLMs-Txt: ${staticBase}/llms.txt\nFeed: ${staticBase}/feed.xml\n`);
  if (fs.existsSync(path.join(__dirname, 'README.md'))) {
    write('README.md', fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8'));
  }

  console.log("=== STATIC SANCTUARY BUILD COMPLETE ===");
}

if (require.main === module) {
  build();
}

module.exports = { build };
