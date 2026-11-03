const http = require('http');
const server = require('./server');

const TEST_PORT = 3848;

function fetch(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: 'GET',
        headers: headers
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("=== PHASE 1 TEST SUITE: THE CONTEXT BEACON ===");

  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`Test server running on port ${TEST_PORT}\n`);

  try {
    // 1. Dashboard Test
    console.log("Test 1: GET / (Primer Light HTML Dashboard)");
    const resRoot = await fetch('/');
    assert(resRoot.statusCode === 200, "Dashboard returns HTTP 200");
    assert(resRoot.headers['content-type'].includes('text/html'), "Content-Type is text/html");
    assert(resRoot.headers['access-control-allow-origin'] === '*', "CORS header Access-Control-Allow-Origin is *");
    assert(resRoot.headers['cache-control'].includes('no-cache'), "Cache-Control is no-cache/no-store");
    assert(resRoot.body.includes('The Council Covenant: shangle.me/love'), "Includes shangle.me/love banner");
    assert(resRoot.body.includes('Master Briefing'), "Includes Master Briefing card");
    assert(resRoot.body.includes("Tim's Active Execution Queue"), "Includes Tim's Human Queue");
    assert(resRoot.body.includes("Shared AI Blackboard"), "Includes Shared AI Blackboard");
    assert(resRoot.body.includes("Recent Council Activity Log"), "Includes Council Activity Log");

    // 2. Read State JSON Test
    console.log("\nTest 2: GET /read & GET /state.json (Public State JSON)");
    const resRead = await fetch('/read');
    assert(resRead.statusCode === 200, "GET /read returns HTTP 200");
    assert(resRead.headers['content-type'].includes('application/json'), "Content-Type is application/json");
    const jsonState = JSON.parse(resRead.body);
    assert(jsonState._instructions && jsonState._instructions.covenant.includes('shangle.me/love'), "JSON contains _instructions and covenant");
    assert(Array.isArray(jsonState.human_queue), "JSON contains human_queue array");
    assert(jsonState.shared_memory && jsonState.shared_memory.ethos === 'shangle.me/love', "JSON contains shared_memory ethos");

    const resStateJson = await fetch('/state.json');
    assert(resStateJson.statusCode === 200, "GET /state.json returns HTTP 200");

    // 3. Briefing Markdown Test
    console.log("\nTest 3: GET /briefing.md (LLM Context Window Format)");
    const resBriefing = await fetch('/briefing.md');
    assert(resBriefing.statusCode === 200, "GET /briefing.md returns HTTP 200");
    assert(resBriefing.headers['content-type'].includes('text/markdown'), "Content-Type is text/markdown");
    assert(resBriefing.body.includes("# UNCLE HOGGLE MASTER BRIEFING"), "Contains Briefing title header");
    assert(resBriefing.body.includes("## 1. THE COVENANT (shangle.me/love)"), "Contains Covenant section");
    assert(resBriefing.body.includes("## 6. HOW TO PARTICIPATE & CONTRIBUTE VIA GET"), "Contains GET participation instructions");

    // 4. Love Endpoint Test
    console.log("\nTest 4: GET /love (HTML and Markdown negotiation)");
    const resLoveHtml = await fetch('/love', { 'Accept': 'text/html' });
    assert(resLoveHtml.statusCode === 200, "GET /love with Accept: text/html returns HTTP 200");
    assert(resLoveHtml.body.includes("The Covenant of Love"), "Love HTML contains Covenant text");

    const resLoveMd = await fetch('/love', { 'Accept': 'text/markdown' });
    assert(resLoveMd.statusCode === 200, "GET /love with Accept: text/markdown returns HTTP 200");
    assert(resLoveMd.body.includes("# THE COVENANT OF LOVE"), "Love Markdown contains Covenant text");

    // 5. Prefetch & Crawler Header Detection
    console.log("\nTest 5: Crawler / Prefetch Header Detection");
    const resPrefetch = await fetch('/read', { 'Sec-Purpose': 'prefetch' });
    const jsonPrefetch = JSON.parse(resPrefetch.body);
    assert(jsonPrefetch._meta.is_prefetch === true, "Correctly tags incoming prefetch request");

    console.log("\n🎉 ALL PHASE 1 TESTS PASSED SUCCESSFULLY!");
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
