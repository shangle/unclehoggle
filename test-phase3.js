const http = require('http');
const server = require('./server');
const cortex = require('./cortex');
const auth = require('./auth');

const TEST_PORT = 3850;

function fetch(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: 'GET'
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
  console.log("=== PHASE 3 TEST SUITE: PERMISSIONED ROLLING ENCRYPTION & SECURITY ===");

  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`Test server running on port ${TEST_PORT}\n`);

  try {
    // -------------------------------------------------------------
    // Track A Tests: One-Time Cryptographic Ratchet
    // -------------------------------------------------------------
    console.log("--- TRACK A: ONE-TIME CRYPTOGRAPHIC RATCHET ---");

    // 1. Valid Ratchet Mutation
    console.log("Test 1: Valid Ratchet Mutation");
    const { token: ratchet1 } = auth.mintRatchet("gemini-prime");
    const resR1 = await fetch(`/commit?ratchet=${ratchet1}&set_memory_prime_mode=engaged&add_task=Verify_Phase3_Live`);
    assert(resR1.statusCode === 200, "Valid ratchet commit returns HTTP 200");
    const jsonR1 = JSON.parse(resR1.body);
    assert(jsonR1.status === "committed", "Commit status is 'committed'");
    assert(jsonR1.next_ratchet && jsonR1.next_ratchet.startsWith('hgl_'), "Returns fresh next_ratchet token");
    assert(cortex.getState().shared_memory.prime_mode === "engaged", "State mutation set_memory:prime_mode succeeded");

    // 2. Anti-Replay: Exact same ratchet URL must be rejected immediately!
    console.log("\nTest 2: Replay Attack Blocked (Same Ratchet URL fetched again)");
    await new Promise(r => setTimeout(r, 100)); // 100ms later
    const resReplay = await fetch(`/commit?ratchet=${ratchet1}&set_memory_prime_mode=engaged&add_task=Verify_Phase3_Live`);
    assert(resReplay.statusCode === 403, "Replayed ratchet URL returns HTTP 403 Forbidden");
    const jsonReplay = JSON.parse(resReplay.body);
    assert(jsonReplay.error === "Forbidden", "Error is Forbidden");

    // 3. Chained Ratchet Works
    console.log("\nTest 3: Chained Ratchet Works with next_ratchet");
    const ratchet2 = jsonR1.next_ratchet;
    const resR2 = await fetch(`/commit?ratchet=${ratchet2}&set_memory_ratchet_chain=unbroken`);
    assert(resR2.statusCode === 200, "next_ratchet succeeds on subsequent GET");
    assert(JSON.parse(resR2.body).status === "committed", "Chained commit succeeded");
    assert(cortex.getState().shared_memory.ratchet_chain === "unbroken", "Chained state mutation verified");

    // -------------------------------------------------------------
    // Track B Tests: Time-Windowed Rolling HMAC-SHA256
    // -------------------------------------------------------------
    console.log("\n--- TRACK B: TIME-WINDOWED ROLLING HMAC-SHA256 ---");

    // 4. Valid Rolling HMAC Mutation
    console.log("Test 4: Valid Rolling HMAC Mutation");
    const rawQuery = "agent=code-bot&set_status=all_green&set_memory_hmac_test=verified";
    const signedQuery = auth.signQuery(rawQuery, 0); // current window
    const resHmac1 = await fetch(`/commit?${signedQuery}`);
    assert(resHmac1.statusCode === 200, "Valid HMAC signature returns HTTP 200");
    assert(JSON.parse(resHmac1.body).status === "committed", "HMAC commit succeeded");
    assert(cortex.getState().shared_memory.council_status === "all_green", "HMAC updated council_status");
    assert(cortex.getState().shared_memory.hmac_test === "verified", "HMAC updated memory");

    // 4b. Replay within same window blocked (consumed nonce)
    console.log("\nTest 4b: Replay of same HMAC signature blocked (consumed nonce)");
    const resHmacReplay = await fetch(`/commit?${signedQuery}`);
    assert(resHmacReplay.statusCode === 403, "Replaying identical HMAC signature returns HTTP 403");
    assert(JSON.parse(resHmacReplay.body).reason.includes("already consumed"), "Rejected with already consumed message");

    // 5. Tampered Payload Blocked
    console.log("\nTest 5: Tampered Payload Blocked");
    const tamperedQuery = signedQuery.replace("set_status=all_green", "set_status=hacked");
    const resTampered = await fetch(`/commit?${tamperedQuery}`);
    assert(resTampered.statusCode === 403, "Tampered query string returns HTTP 403 Forbidden");

    // 6. Expired Window Blocked
    console.log("\nTest 6: Expired Window Blocked (-5 windows = 2.5 minutes ago)");
    const expiredQuery = auth.signQuery("agent=old-bot&set_memory_expired=fail", -5);
    const resExpired = await fetch(`/commit?${expiredQuery}`);
    assert(resExpired.statusCode === 403, "Expired signature returns HTTP 403 Forbidden");

    console.log("\n🎉 ALL PHASE 3 TESTS PASSED SUCCESSFULLY!");
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
