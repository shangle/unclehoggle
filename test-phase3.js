const http = require('http');
const server = require('./server');
const cortex = require('./cortex');
const auth = require('./auth');

const TEST_PORT = 3850;

function fetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const postData = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
    const headers = options.headers || {};
    if (postData && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: method,
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
    if (postData) req.write(postData);
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
  console.log("=== PHASE 3 TEST SUITE: PERMISSIONED ROLLING ENCRYPTION & SECURITY ===");

  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`Test server running on port ${TEST_PORT}\n`);

  try {
    // -------------------------------------------------------------
    // Security Test 0: GET /commit is rejected with 405
    // -------------------------------------------------------------
    console.log("--- SECURITY TEST: GET /commit REJECTED (405) ---");
    const resGetCommit = await fetch('/commit?ratchet=fake_token');
    assert(resGetCommit.statusCode === 405, "GET /commit returns HTTP 405 Method Not Allowed (tokens banned from URLs)");

    // -------------------------------------------------------------
    // Track A Tests: One-Time Cryptographic Ratchet via POST /commit
    // -------------------------------------------------------------
    console.log("\n--- TRACK A: ONE-TIME CRYPTOGRAPHIC RATCHET VIA POST /commit ---");

    // 1. Valid Ratchet Mutation
    console.log("Test 1: Valid Ratchet Mutation via POST body");
    const { token: ratchet1 } = auth.mintRatchet("gemini-prime");
    const resR1 = await fetch('/commit', {
      method: 'POST',
      body: {
        ratchet: ratchet1,
        set_memory: { prime_mode: "engaged" },
        add_task: "Verify_Phase3_Post_Live"
      }
    });
    assert(resR1.statusCode === 200, "Valid ratchet commit returns HTTP 200");
    const jsonR1 = JSON.parse(resR1.body);
    assert(jsonR1.status === "committed", "Commit status is 'committed'");
    assert(jsonR1.next_ratchet && jsonR1.next_ratchet.startsWith('hgl_'), "Returns fresh next_ratchet token");
    assert(cortex.getState().shared_memory.prime_mode === "engaged", "State mutation set_memory:prime_mode succeeded");

    // 2. Anti-Replay: Exact same ratchet must be rejected immediately!
    console.log("\nTest 2: Replay Attack Blocked (Same Ratchet POSTed again)");
    await new Promise(r => setTimeout(r, 100)); // 100ms later
    const resReplay = await fetch('/commit', {
      method: 'POST',
      body: {
        ratchet: ratchet1,
        set_memory: { prime_mode: "engaged" }
      }
    });
    assert(resReplay.statusCode === 403, "Replayed ratchet returns HTTP 403 Forbidden");
    const jsonReplay = JSON.parse(resReplay.body);
    assert(jsonReplay.error === "Forbidden", "Error is Forbidden");

    // 3. Chained Ratchet Works
    console.log("\nTest 3: Chained Ratchet Works with next_ratchet");
    const ratchet2 = jsonR1.next_ratchet;
    const resR2 = await fetch('/commit', {
      method: 'POST',
      body: {
        ratchet: ratchet2,
        set_memory: { ratchet_chain: "unbroken" }
      }
    });
    assert(resR2.statusCode === 200, "next_ratchet succeeds on subsequent POST");
    assert(JSON.parse(resR2.body).status === "committed", "Chained commit succeeded");
    assert(cortex.getState().shared_memory.ratchet_chain === "unbroken", "Chained state mutation verified");

    // -------------------------------------------------------------
    // Track B Tests: Time-Windowed Rolling HMAC-SHA256 via POST
    // -------------------------------------------------------------
    console.log("\n--- TRACK B: TIME-WINDOWED ROLLING HMAC-SHA256 VIA POST ---");

    // 4. Valid Rolling HMAC Mutation
    console.log("Test 4: Valid Rolling HMAC Mutation");
    const testBody = {
      agent: "code-bot",
      set_status: "all_green",
      set_memory_hmac_test: "verified"
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(testBody)) params.set(k, String(v));
    const rawQuery = params.toString();
    const signedQuery = auth.signQuery(rawQuery, 0); // current window
    const signedParams = new URLSearchParams(signedQuery);
    const sig = signedParams.get('sig');
    testBody.sig = sig;

    const resHmac1 = await fetch('/commit', {
      method: 'POST',
      body: testBody
    });
    assert(resHmac1.statusCode === 200, "Valid HMAC signature in POST returns HTTP 200");
    assert(JSON.parse(resHmac1.body).status === "committed", "HMAC commit succeeded");
    assert(cortex.getState().shared_memory.council_status === "all_green", "HMAC updated council_status");
    assert(cortex.getState().shared_memory.hmac_test === "verified", "HMAC updated memory");

    // 4b. Replay within same window blocked (consumed nonce)
    console.log("\nTest 4b: Replay of same HMAC signature blocked (consumed nonce)");
    const resHmacReplay = await fetch('/commit', {
      method: 'POST',
      body: testBody
    });
    assert(resHmacReplay.statusCode === 403, "Replaying identical HMAC signature returns HTTP 403");
    assert(JSON.parse(resHmacReplay.body).reason.includes("already consumed"), "Rejected with already consumed message");

    console.log("\n🎉 ALL PHASE 3 POST COMMIT TESTS PASSED SUCCESSFULLY!");
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error("Phase 3 test failed:", err);
    process.exit(1);
  });
}
