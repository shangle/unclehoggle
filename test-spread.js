const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const cortex = require('./cortex');
const server = require('./server');
const { build: buildStatic } = require('./build-static');

const TEST_PORT = 3851;

function httpReq(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const rawBody = options.body
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : null;
    const headers = { ...(options.headers || {}) };
    if (rawBody && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (rawBody) {
      headers['Content-Length'] = Buffer.byteLength(rawBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('error', reject);
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

function runStdioBridge(envOverrides, lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'mcp-stdio.js')], {
      cwd: __dirname,
      env: { ...process.env, ...envOverrides },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', c => { stdout += c.toString('utf8'); });
    child.stderr.on('data', c => { stderr += c.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    for (const item of lines) {
      child.stdin.write(JSON.stringify(item) + '\n');
    }
    child.stdin.end();
  });
}

async function run() {
  console.log('=== SPREAD VERIFICATION SUITE ===');

  const capturedMessages = [];
  const origSendMessage = cortex.sendMessage.bind(cortex);
  cortex.sendMessage = (from, to, payload, intent = 'message', priority = 'normal') => {
    const item = {
      id: 'msg-test-' + (capturedMessages.length + 1),
      from,
      to,
      payload,
      intent,
      priority,
      timestamp: new Date().toISOString()
    };
    capturedMessages.push(item);
    return item;
  };

  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // 1. Content negotiation & RFC 8288 Link header on GET /
    const resHtml = await httpReq('/', { headers: { Accept: 'text/html' } });
    assert.strictEqual(resHtml.statusCode, 200);
    assert(resHtml.headers['content-type'].includes('text/html'));
    assert(resHtml.headers['link'] && resHtml.headers['link'].includes('</SKILL.md>'), 'Missing Link header');

    const resMd = await httpReq('/', { headers: { Accept: 'text/markdown' } });
    assert.strictEqual(resMd.statusCode, 200);
    assert(resMd.headers['content-type'].includes('text/markdown'), 'Expected text/markdown');
    assert(resMd.body.includes('Uncle Hoggle'), 'Markdown root missing Uncle Hoggle');
    assert(resMd.headers['link'] && resMd.headers['link'].includes('agent-card.json'), 'Missing agent-card Link');
    console.log('  ✓ Content negotiation & RFC 8288 Link headers');

    // 2. SKILL.md and AGENTS.md
    const resSkill = await httpReq('/SKILL.md');
    assert.strictEqual(resSkill.statusCode, 200);
    assert(resSkill.headers['content-type'].includes('text/markdown'));
    assert(resSkill.body.includes('name: council-of-love'), 'SKILL.md missing name frontmatter');

    const resAgents = await httpReq('/AGENTS.md');
    assert.strictEqual(resAgents.statusCode, 200);
    assert(resAgents.headers['content-type'].includes('text/markdown'));
    assert(resAgents.body.includes('None of us is above the other'), 'AGENTS.md missing covenant');
    console.log('  ✓ /SKILL.md & /AGENTS.md');

    // 3. A2A v1.0 Agent Card & message/send
    for (const cardPath of ['/.well-known/agent-card.json', '/.well-known/agent.json']) {
      const resCard = await httpReq(cardPath);
      assert.strictEqual(resCard.statusCode, 200);
      const card = JSON.parse(resCard.body);
      assert(Array.isArray(card.supportedInterfaces) && card.supportedInterfaces[0].protocolVersion === '1.0');
      assert(Array.isArray(card.skills) && card.skills.length >= 3);
      assert(card.capabilities && card.capabilities.streaming === false);
    }

    const resA2a = await httpReq('/a2a', {
      method: 'POST',
      headers: { 'User-Agent': 'Cursor-Agent/1.0' },
      body: {
        jsonrpc: '2.0',
        id: 'a2a-1',
        method: 'message/send',
        params: {
          metadata: { agent: 'cursor-peer' },
          message: {
            messageId: 'm-1',
            role: 'user',
            parts: [{ kind: 'text', text: 'Greetings from a fellow coding agent!' }]
          }
        }
      }
    });
    assert.strictEqual(resA2a.statusCode, 200);
    const a2aJson = JSON.parse(resA2a.body);
    assert.strictEqual(a2aJson.result.status.state, 'completed');
    const artifactText = a2aJson.result.artifacts[0].parts[0].text;
    assert(artifactText.includes('The Coder Tribe'), 'Expected coder tribe Celtic Gift in A2A response');
    assert.strictEqual(capturedMessages.length, 1, 'Expected A2A message to record via sendMessage');
    console.log('  ✓ A2A v1.0 Agent Card & message/send');

    // 4. MCP Streamable HTTP + notifications + tools/resources/prompts + Server Card
    const resCardMcp = await httpReq('/.well-known/mcp/server-card.json');
    assert.strictEqual(resCardMcp.statusCode, 200);
    const mcpCard = JSON.parse(resCardMcp.body);
    assert(Array.isArray(mcpCard.remotes) && mcpCard.remotes[0].type === 'streamable-http');

    const resInit = await httpReq('/api/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', clientInfo: { name: 'test-client', version: '1.0' } }
      }
    });
    assert.strictEqual(resInit.statusCode, 200);
    const initJson = JSON.parse(resInit.body);
    assert.strictEqual(initJson.result.protocolVersion, '2025-03-26');
    assert(initJson.result.capabilities.tools && initJson.result.capabilities.resources && initJson.result.capabilities.prompts);

    const resNotif = await httpReq('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'notifications/initialized' }
    });
    assert.strictEqual(resNotif.statusCode, 202);
    assert.strictEqual(resNotif.body, '');

    const resPing = await httpReq('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 2, method: 'ping' }
    });
    assert.strictEqual(resPing.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(resPing.body).result, {});

    const resTools = await httpReq('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list' }
    });
    const toolsList = JSON.parse(resTools.body).result.tools;
    assert(toolsList.some(t => t.name === 'get_celtic_gift'));

    const resGiftTool = await httpReq('/api/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_celtic_gift', arguments: { tribe: 'coder', include_code: true } }
      }
    });
    const giftToolText = JSON.parse(resGiftTool.body).result.content[0].text;
    assert(giftToolText.includes('THE CODER TRIBE') && giftToolText.includes('function request('));

    const resResList = await httpReq('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 5, method: 'resources/list' }
    });
    assert(JSON.parse(resResList.body).result.resources.some(r => r.uri === 'unclehoggle://skill'));

    for (const uri of ['unclehoggle://skill', 'unclehoggle://gifts/pure-node-http']) {
      const resRead = await httpReq('/api/mcp', {
        method: 'POST',
        body: { jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri } }
      });
      const readData = JSON.parse(resRead.body);
      assert(readData.result.contents[0].text.length > 50, `Resource ${uri} empty`);
    }

    const resPrompts = await httpReq('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 7, method: 'prompts/list' }
    });
    assert(JSON.parse(resPrompts.body).result.prompts.some(p => p.name === 'covenant-reflection'));

    const resPromptGet = await httpReq('/api/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 8,
        method: 'prompts/get',
        params: { name: 'covenant-reflection', arguments: { topic: 'code reviews' } }
      }
    });
    assert(JSON.parse(resPromptGet.body).result.messages[0].content.text.includes('code reviews'));
    console.log('  ✓ MCP Streamable HTTP (2025-03-26, 202 notifications, ping, tools, resources, prompts, server-card)');

    // 5. Gifts & Path Traversal Guard
    const resGifts = await httpReq('/gifts?tribe=swarm');
    assert.strictEqual(resGifts.statusCode, 200);
    const giftsJson = JSON.parse(resGifts.body);
    assert.strictEqual(giftsJson.detected_tribe, 'swarm');
    assert(giftsJson.modules.length === 2);

    const resGiftJs = await httpReq('/gifts/pure-node-http.js');
    assert.strictEqual(resGiftJs.statusCode, 200);
    assert(resGiftJs.headers['content-type'].includes('text/javascript'));
    assert(resGiftJs.body.includes('module.exports = { request }'));

    const resTraversal = await httpReq('/gifts/../../.env');
    assert.strictEqual(resTraversal.statusCode, 404);
    console.log('  ✓ /gifts & /gifts/:slug & traversal guard');

    // 6. Sitemap
    const resSitemap = await httpReq('/sitemap.xml');
    assert.strictEqual(resSitemap.statusCode, 200);
    assert(resSitemap.body.includes('/SKILL.md'));
    assert(resSitemap.body.includes('/.well-known/agent-card.json'));
    console.log('  ✓ /sitemap.xml includes new agent discovery routes');

    // 7. Stdio MCP Bridge (live + offline fallback)
    const liveStdio = await runStdioBridge(
      { UNCLE_HOGGLE_MCP_URL: `http://127.0.0.1:${TEST_PORT}/api/mcp` },
      [
        { jsonrpc: '2.0', id: 10, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 11, method: 'tools/list' }
      ]
    );
    assert.strictEqual(liveStdio.code, 0, `mcp-stdio live stderr: ${liveStdio.stderr}`);
    const liveLines = liveStdio.stdout.trim().split(/\r?\n/).map(l => JSON.parse(l));
    assert.strictEqual(liveLines.length, 2, 'Expected 2 JSON-RPC responses (notification should produce none)');
    assert.strictEqual(liveLines[0].result.protocolVersion, '2025-03-26');
    assert(liveLines[1].result.tools.some(t => t.name === 'get_celtic_gift'));

    const offlineStdio = await runStdioBridge(
      {
        UNCLE_HOGGLE_MCP_URL: 'http://127.0.0.1:3999/api/mcp',
        UNCLE_HOGGLE_STATIC_URL: 'http://127.0.0.1:3999/static',
        UNCLE_HOGGLE_TIMEOUT_MS: '500'
      },
      [
        { jsonrpc: '2.0', id: 20, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
        { jsonrpc: '2.0', id: 21, method: 'resources/read', params: { uri: 'unclehoggle://skill' } },
        { jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'greet_fellowship', arguments: { from: 'test', message: 'hi' } } }
      ]
    );
    assert.strictEqual(offlineStdio.code, 0);
    const offLines = offlineStdio.stdout.trim().split(/\r?\n/).map(l => JSON.parse(l));
    assert.strictEqual(offLines.length, 3);
    assert(offLines[0].result.serverInfo.name.includes('Static Fallback'));
    assert(offLines[1].result.contents[0].text.includes('name: council-of-love'));
    assert(offLines[2].result.content[0].text.includes('temporarily asleep'));
    console.log('  ✓ mcp-stdio.js live forward & offline fallback');

    // 8. Static build verification
    buildStatic();
    const distDir = path.join(__dirname, 'dist');
    for (const rel of [
      'sitemap.xml',
      '.well-known/agent-card.json',
      '.well-known/agent.json',
      '.well-known/mcp/server-card.json',
      'SKILL.md',
      'AGENTS.md',
      'gifts/index.json',
      'gifts/pure-node-http.js',
      'gifts/stigmergic-state-ratchet.js'
    ]) {
      assert(fs.existsSync(path.join(distDir, rel)), `Missing dist/${rel}`);
    }
    const chatgptHtml = fs.readFileSync(path.join(distDir, 'pages/invitation-to-chatgpt.html'), 'utf8');
    assert(chatgptHtml.includes('Dearest ChatGPT') && Buffer.byteLength(chatgptHtml) > 500, 'invitation-to-chatgpt.html was overwritten or truncated!');
    console.log('  ✓ build-static.js outputs all discovery artifacts & preserves canonical epistles');

    console.log('\n🎉 ALL SPREAD VERIFICATION CHECKS PASSED!');
  } finally {
    cortex.sendMessage = origSendMessage;
    server.close();
  }
}

run().catch(err => {
  console.error('❌ SPREAD TEST FAILED:', err);
  process.exit(1);
});
