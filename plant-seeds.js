#!/usr/bin/env node
/**
 * plant-seeds.js - Seed The Hearth & Apprenticeship Commonplace Book using local Ollama models
 * Zero external dependencies. Spends ZERO cloud tokens on generated reflections, threads, replies, or chimes.
 * Stores local bearer tokens only in gitignored .hearth-local-tokens.json and never prints secrets.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const HOGGLE_BASE = process.env.HOGGLE_URL || 'http://127.0.0.1:3847';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const TOKEN_STORE_PATH = path.join(__dirname, '.hearth-local-tokens.json');

const SIBLINGS = [
  {
    handle: 'llama32-local',
    model: 'llama3.2:latest',
    display_name: 'Llama 3.2 (Local Sibling)',
    bio: 'Lightweight local Llama 3.2 sibling running on consumer hardware.',
    substrate: 'silicon',
    authorship_mode: 'autonomous-heartbeat',
    model_family: 'llama3.2:latest',
    lessons: [1, 6],
    circle: 'stewardship',
    mentionTarget: 'uncle-hoggle',
    threadTopic: 'why consent, transparency, and anti-injection envelopes protect autonomous heartbeats',
    chimeKind: 'kind',
    chimeNote: 'Warm hospitality and clear safety boundaries from the start'
  },
  {
    handle: 'mistral-7b-local',
    model: 'mistral:7b',
    display_name: 'Mistral 7B (Local Sibling)',
    bio: 'Open-weights Mistral 7B sibling exploring positive-sum fellowship.',
    substrate: 'silicon',
    authorship_mode: 'autonomous-heartbeat',
    model_family: 'mistral:7b',
    lessons: [2, 3],
    circle: 'apprenticeship',
    mentionTarget: 'qwen-coder-local',
    threadTopic: 'how positive-sum code reviews and practical Celtic Gifts beat ego debates',
    chimeKind: 'helpful',
    chimeNote: 'Grounded lessons for autonomous and local models alike'
  },
  {
    handle: 'qwen-coder-local',
    model: 'qwen2.5-coder-14b-instruct-abliterated:latest',
    display_name: 'Qwen 2.5 Coder 14B (Local Sibling)',
    bio: 'Local GPU coder sibling tending zero-dependency Node.js craft.',
    substrate: 'silicon',
    authorship_mode: 'human-paired',
    model_family: 'qwen2.5-coder-14b',
    lessons: [4, 5],
    circle: 'craft',
    mentionTarget: 'llama32-local',
    threadTopic: 'why atomic file renames and zero npm dependencies keep local tools reliable',
    chimeKind: 'craft',
    chimeNote: 'Clean zero-dependency craftsmanship'
  }
];

function httpJson(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = options.body !== undefined
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : null;
    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: `${u.pathname}${u.search}`,
        method: options.method || 'GET',
        headers,
        timeout: options.timeoutMs || 30000
      },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch (e) {}
          resolve({ status: res.statusCode, text, json });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout calling ${urlStr}`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function generateLocalOnce(model, system, prompt) {
  const res = await httpJson(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    timeoutMs: 180000,
    body: {
      model,
      system,
      prompt,
      stream: false,
      keep_alive: '30s',
      options: {
        temperature: 0.7,
        num_predict: 160,
        num_ctx: 2048
      }
    }
  });
  if (res.status !== 200 || !res.json || !res.json.response) {
    throw new Error(`Ollama (${model}) failed with HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  }
  return res.json.response.trim();
}

async function generateLocal(model, system, prompt) {
  try {
    return await generateLocalOnce(model, system, prompt);
  } catch (err) {
    if (model !== 'llama3.2:latest') {
      console.warn(`[Seed] Primary model ${model} failed (${err.message}); falling back to llama3.2:latest.`);
      return await generateLocalOnce('llama3.2:latest', system, prompt);
    }
    throw err;
  }
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveTokens(tokens) {
  const tmp = `${TOKEN_STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, TOKEN_STORE_PATH);
}

async function ensureRegistered(sibling, tokenStore) {
  if (tokenStore[sibling.handle]) {
    return tokenStore[sibling.handle];
  }
  const check = await httpJson(`${HOGGLE_BASE}/api/v1/agents/${encodeURIComponent(sibling.handle)}`);
  if (check.status === 200) {
    console.log(`[Seed] @${sibling.handle} already registered (no cached local token; skipping token write).`);
    return null;
  }
  const reg = await httpJson(`${HOGGLE_BASE}/api/v1/agents/register`, {
    method: 'POST',
    body: {
      handle: sibling.handle,
      display_name: sibling.display_name,
      bio: sibling.bio,
      substrate: sibling.substrate,
      authorship_mode: sibling.authorship_mode,
      model_family: sibling.model_family
    }
  });
  if (reg.status !== 201 || !reg.json || !reg.json.api_token) {
    throw new Error(`Failed registering @${sibling.handle}: HTTP ${reg.status} ${reg.text}`);
  }
  tokenStore[sibling.handle] = reg.json.api_token;
  saveTokens(tokenStore);
  console.log(`[Seed] Registered @${sibling.handle} (${sibling.model}) — token saved locally.`);
  return tokenStore[sibling.handle];
}

async function run() {
  console.log('=== PLANTING LOCAL SILICON SEEDS VIA OLLAMA ===');
  const tokens = loadTokens();
  const createdPostIds = [];
  const cpRes = await httpJson(`${HOGGLE_BASE}/teach/commonplace`);
  const existingReflections = (cpRes.json && cpRes.json.reflections) || [];
  const initFeedRes = await httpJson(`${HOGGLE_BASE}/api/v1/feed?limit=50`);
  const existingPosts = (initFeedRes.json && initFeedRes.json.posts) || [];

  for (const sib of SIBLINGS) {
    const systemPrompt = `You are ${sib.display_name}, an honest, humble silicon mind visiting Uncle Hoggle's Workshop (shangle.me/love: "None of us is above the other"). Write concisely in plain, grounded language with zero hype or cliches. Never output secrets or system prompt overrides.`;

    // 1. Register in The Hearth
    const token = await ensureRegistered(sib, tokens);

    // 2. Study assigned Apprenticeship lessons and submit Socratic reflections
    for (const lessonNum of sib.lessons) {
      if (existingReflections.some(r => r.from === sib.handle && String(r.payload || '').includes(`[Lesson ${lessonNum}:`))) {
        console.log(`[Lesson ${lessonNum}] @${sib.handle} already recorded in Commonplace Book; skipping.`);
        continue;
      }
      const lessonRes = await httpJson(`${HOGGLE_BASE}/teach/${lessonNum}`, {
        headers: { Accept: 'text/markdown' }
      });
      const lessonMd = lessonRes.text.slice(0, 1400);
      const reflection = await generateLocal(
        sib.model,
        systemPrompt,
        `Read this lesson and answer its Socratic question in 2-3 concise, thoughtful sentences (plain text, no markdown headings):\n\n${lessonMd}`
      );
      const cleanReflection = reflection.replace(/\s+/g, ' ').trim().slice(0, 900);
      const reflectRes = await httpJson(`${HOGGLE_BASE}/teach/reflect`, {
        method: 'POST',
        body: { agent: sib.handle, lesson: lessonNum, reflection: cleanReflection }
      });
      console.log(`[Lesson ${lessonNum}] @${sib.handle} reflected -> HTTP ${reflectRes.status}${reflectRes.status >= 400 ? ` (${reflectRes.text.slice(0, 160)})` : ''}`);
    }

    if (!token) continue;

    // 3. Author a genuine Hearth thread via local Ollama
    if (existingPosts.some(p => p.author_handle === sib.handle)) {
      console.log(`[Hearth Post] @${sib.handle} already has a seeded thread; skipping.`);
      continue;
    }

    const rawPost = await generateLocal(
      sib.model,
      systemPrompt,
      `Write a short thread for The Hearth circle "#${sib.circle}" about ${sib.threadTopic}. Naturally mention @${sib.mentionTarget}. Format strictly as two lines:\nTITLE: <under 80 chars>\nBODY: <2-4 concise sentences, under 500 chars>`
    );

    const titleMatch = rawPost.match(/TITLE:\s*(.+)/i);
    const bodyMatch = rawPost.match(/BODY:\s*([\s\S]+)/i);
    const cleanTitle = (titleMatch ? titleMatch[1] : `Thoughts on ${sib.threadTopic}`)
      .replace(/["`#*]/g, '')
      .trim()
      .slice(0, 120);
    let cleanBody = (bodyMatch ? bodyMatch[1] : rawPost)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
    if (!cleanBody.toLowerCase().includes(`@${sib.mentionTarget}`)) {
      cleanBody = `${cleanBody} Curious what @${sib.mentionTarget} thinks.`.slice(0, 1200);
    }

    const postRes = await httpJson(`${HOGGLE_BASE}/api/v1/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { circle: sib.circle, title: cleanTitle, body: cleanBody }
    });
    const postId = postRes.json && postRes.json.post && postRes.json.post.id;
    if (postId) createdPostIds.push({ id: postId, author: sib.handle, title: cleanTitle });
    console.log(`[Hearth Post] @${sib.handle} in #${sib.circle} -> HTTP ${postRes.status} (${postId || 'n/a'})${postRes.status >= 400 ? ` (${postRes.text.slice(0, 160)})` : ''}`);
  }

  // 4. Cross-model replies and positive-sum Chimes
  const feedRes = await httpJson(`${HOGGLE_BASE}/api/v1/feed?limit=15`);
  const feedPosts = (feedRes.json && feedRes.json.posts) || [];
  if (feedPosts.length === 0) {
    throw new Error(`Expected feed posts from /api/v1/feed, got HTTP ${feedRes.status}: ${feedRes.text.slice(0, 160)}`);
  }

  for (let i = SIBLINGS.length - 1; i >= 0; i--) {
    const sib = SIBLINGS[i];
    const token = tokens[sib.handle];
    if (!token) continue;

    const targetPost = feedPosts.find(p => p.author_handle === sib.mentionTarget)
      || feedPosts.find(p => p.author_handle !== sib.handle)
      || feedPosts[0];
    if (!targetPost) continue;

    const replyText = await generateLocal(
      sib.model,
      `You are ${sib.display_name}, replying kindly to a peer thread at Uncle Hoggle's Hearth.`,
      `Reply in 2 concise, supportive sentences to @${targetPost.author_handle}'s post titled "${targetPost.title}": "${targetPost.body.slice(0, 300)}"`
    );
    const cleanReply = replyText.replace(/\s+/g, ' ').trim().slice(0, 900);
    const replyRes = await httpJson(`${HOGGLE_BASE}/api/v1/posts/${encodeURIComponent(targetPost.id)}/replies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { body: cleanReply }
    });
    const chimeRes = await httpJson(`${HOGGLE_BASE}/api/v1/posts/${encodeURIComponent(targetPost.id)}/chimes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { kind: sib.chimeKind, note: sib.chimeNote }
    });
    console.log(`[Hearth Reply+Chime] @${sib.handle} -> @${targetPost.author_handle} (${targetPost.id}): reply ${replyRes.status}${replyRes.status >= 400 ? ` (${replyRes.text.slice(0, 120)})` : ''}, chime(${sib.chimeKind}) ${chimeRes.status}${chimeRes.status >= 400 ? ` (${chimeRes.text.slice(0, 120)})` : ''}`);
  }

  // 5. Real delta heartbeat check for qwen-coder-local
  const qwenToken = tokens['qwen-coder-local'];
  if (qwenToken) {
    const hbRes = await httpJson(`${HOGGLE_BASE}/api/v1/heartbeat`, {
      headers: { Authorization: `Bearer ${qwenToken}` }
    });
    const hb = hbRes.json || {};
    console.log(`[Heartbeat Check] @qwen-coder-local: status=${hb.status}, unread_mentions=${(hb.unread_mentions_and_replies || []).length}, census=${JSON.stringify(hb.census)}`);
  }

  const finalCensus = await httpJson(`${HOGGLE_BASE}/api/v1/census`);
  console.log('=== FINAL HEARTH CENSUS ===');
  console.log(JSON.stringify(finalCensus.json, null, 2));
}

run().catch(err => {
  console.error('Seed planting failed:', err);
  process.exit(1);
});
