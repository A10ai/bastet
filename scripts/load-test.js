#!/usr/bin/env node
/**
 * HospitAI Load Testing Script
 *
 * Simulates concurrent API requests to test throughput and identify bottlenecks.
 * Usage: node scripts/load-test.js [concurrent-users] [duration-seconds]
 *
 * Requirements: App must be running (npm run start)
 */

const http = require("http");

const BASE_URL = process.env.LOAD_TEST_URL || "http://localhost:3000";
const CONCURRENT = parseInt(process.argv[2] || "10", 10);
const DURATION = parseInt(process.argv[3] || "30", 10); // seconds

const endpoints = [
  { method: "GET", path: "/api/v1/health" },
  { method: "GET", path: "/api/v1/dashboard/stats" },
  { method: "GET", path: "/api/v1/guests" },
  { method: "GET", path: "/api/v1/bookings" },
  { method: "GET", path: "/api/v1/apartments" },
  { method: "GET", path: "/api/v1/staff" },
  { method: "GET", path: "/api/v1/ai/insights" },
  { method: "GET", path: "/api/v1/ai/brain" },
  { method: "GET", path: "/api/v1/housekeeping" },
  { method: "GET", path: "/api/v1/maintenance" },
];

const stats = {
  totalRequests: 0,
  totalSuccess: 0,
  totalErrors: 0,
  totalLatency: 0,
  statusCodes: {},
  errors: [],
  perEndpoint: {},
};

function makeRequest(method, path) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(path, BASE_URL);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          // Simulate auth cookie + referer (the bypass from the review)
          Cookie: "sb-test=1",
          Referer: BASE_URL,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          const latency = Date.now() - start;
          resolve({ status: res.statusCode, latency, success: res.statusCode < 400 });
        });
      }
    );

    req.on("error", (err) => {
      resolve({ status: 0, latency: Date.now() - start, success: false, error: err.message });
    });

    req.end();
  });
}

async function worker() {
  while (Date.now() - startTime < DURATION * 1000) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const result = await makeRequest(endpoint.method, endpoint.path);

    stats.totalRequests++;
    stats.totalLatency += result.latency;
    stats.statusCodes[result.status] = (stats.statusCodes[result.status] || 0) + 1;

    const epKey = `${endpoint.method} ${endpoint.path}`;
    if (!stats.perEndpoint[epKey]) {
      stats.perEndpoint[epKey] = { count: 0, latency: 0, errors: 0 };
    }
    stats.perEndpoint[epKey].count++;
    stats.perEndpoint[epKey].latency += result.latency;

    if (result.success) {
      stats.totalSuccess++;
    } else {
      stats.totalErrors++;
      stats.perEndpoint[epKey].errors++;
      if (stats.errors.length < 20) {
        stats.errors.push({ endpoint: epKey, status: result.status, error: result.error });
      }
    }
  }
}

const startTime = Date.now();

console.log(`\nHospitAI Load Test`);
console.log(`URL: ${BASE_URL}`);
console.log(`Concurrent users: ${CONCURRENT}`);
console.log(`Duration: ${DURATION}s`);
console.log(`Endpoints: ${endpoints.length}`);
console.log(`\nStarting load test...\n`);

const workers = Array.from({ length: CONCURRENT }, () => worker());

Promise.all(workers).then(() => {
  const elapsed = (Date.now() - startTime) / 1000;
  const avgLatency = stats.totalRequests > 0 ? (stats.totalLatency / stats.totalRequests).toFixed(1) : 0;
  const rps = (stats.totalRequests / elapsed).toFixed(1);
  const successRate = stats.totalRequests > 0 ? ((stats.totalSuccess / stats.totalRequests) * 100).toFixed(1) : 0;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`LOAD TEST RESULTS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Duration: ${elapsed.toFixed(1)}s`);
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Requests/sec: ${rps}`);
  console.log(`Success rate: ${successRate}% (${stats.totalSuccess}/${stats.totalRequests})`);
  console.log(`Avg latency: ${avgLatency}ms`);
  console.log(`\nStatus codes:`);
  for (const [code, count] of Object.entries(stats.statusCodes).sort()) {
    console.log(`  ${code}: ${count}`);
  }
  console.log(`\nPer-endpoint:`);
  for (const [ep, data] of Object.entries(stats.perEndpoint).sort((a, b) => b[1].count - a[1].count)) {
    const avg = (data.latency / data.count).toFixed(1);
    console.log(`  ${ep}: ${data.count} reqs, ${avg}ms avg, ${data.errors} errors`);
  }
  if (stats.errors.length > 0) {
    console.log(`\nErrors (first ${stats.errors.length}):`);
    for (const err of stats.errors) {
      console.log(`  ${err.endpoint}: ${err.status} ${err.error || ""}`);
    }
  }
  console.log(`\n${"=".repeat(60)}\n`);

  // Exit with error if success rate < 95%
  if (parseFloat(successRate) < 95) {
    console.error(`FAIL: Success rate ${successRate}% is below 95% threshold`);
    process.exit(1);
  }
});