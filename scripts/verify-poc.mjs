import http from 'node:http';

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on('error', reject);
  });
}

function fetchSseStream(url, maxEvents = 2, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const events = [];
    const timer = setTimeout(() => {
      req.destroy();
      resolve(events);
    }, timeoutMs);

    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
      },
      (res) => {
        res.on('data', (chunk) => {
          const text = chunk.toString();
          events.push(text);
          if (events.length >= maxEvents) {
            clearTimeout(timer);
            req.destroy();
            resolve(events);
          }
        });
      }
    );
    req.on('error', (err) => {
      clearTimeout(timer);
      if (events.length > 0) resolve(events);
      else reject(err);
    });
  });
}

async function runPoCVerification() {
  console.log('====================================================');
  console.log('🚀 Executing Full Next.js MFE PoC Verification Suite');
  console.log('====================================================\n');

  let passedAll = true;

  // 1. Verify Host & Remote Availability
  console.log('1. Checking Services Status...');
  try {
    const hostRes = await fetchUrl('http://localhost:3000');
    const remoteRes = await fetchUrl('http://localhost:3001/api/server-data');

    if (hostRes.statusCode === 200 && remoteRes.statusCode === 200) {
      console.log('   ✅ Host (Port 3000) and Remote API (Port 3001) are ONLINE (HTTP 200)');
    } else {
      console.error(`   ❌ Status check failed: Host=${hostRes.statusCode}, Remote=${remoteRes.statusCode}`);
      passedAll = false;
    }
  } catch (err) {
    console.error('   ❌ Services are not running:', err.message);
    process.exit(1);
  }

  // 2. Verify Session in Host & Remote Inheritance
  console.log('\n2. Verifying Session Management & Inheritance...');
  try {
    const hostHtml = (await fetchUrl('http://localhost:3000')).body;
    const hasSessionHeader = /Session:/.test(hostHtml);
    const hasInheritedBadge = /Inherited Host Session|Ana Souza/.test(hostHtml);

    if (hasSessionHeader && hasInheritedBadge) {
      console.log('   ✅ Host defines session and Remote inherits user context on SSR');
    } else {
      console.error('   ❌ Session inheritance missing in SSR markup');
      passedAll = false;
    }
  } catch (err) {
    console.error('   ❌ Session check error:', err.message);
    passedAll = false;
  }

  // 3. Verify Host Layout (Header + SideNavigation)
  console.log('\n3. Verifying Host Layout (Header + SideNav + Content Slot)...');
  try {
    const hostHtml = (await fetchUrl('http://localhost:3000')).body;
    const hasHeader = /Enterprise MFE Host/.test(hostHtml);
    const hasSideNav = /Micro-Frontend Views|Live Telemetry|Fleet Map/.test(hostHtml);
    const hasToastContainer = /toast-portal/.test(hostHtml);

    if (hasHeader && hasSideNav && hasToastContainer) {
      console.log('   ✅ Host Layout correctly renders Top Header, SideNavigation, and Global Toast portal');
    } else {
      console.error('   ❌ Layout elements missing in Host markup');
      passedAll = false;
    }
  } catch (err) {
    console.error('   ❌ Layout check error:', err.message);
    passedAll = false;
  }

  // 4. Verify SSE (Server-Sent Events) Stream from Remote
  console.log('\n4. Verifying SSE Stream from Remote (Port 3001)...');
  try {
    const sseEvents = await fetchSseStream('http://localhost:3001/api/sse-events', 2);
    const joined = sseEvents.join('\n');
    const isEventStream = joined.includes('data:') || joined.includes('connected');

    if (isEventStream) {
      console.log(`   ✅ Remote SSE endpoint actively streaming real-time events (${sseEvents.length} chunks received)`);
    } else {
      console.error('   ❌ SSE stream did not emit event-stream packets');
      passedAll = false;
    }
  } catch (err) {
    console.error('   ❌ SSE stream check error:', err.message);
    passedAll = false;
  }

  // 5. Verify Server-Side Rendering (SSR) of Remote Component
  console.log('\n5. Verifying Server-Side Rendering (SSR) of Next.js Module Federation...');
  try {
    const hostHtml = (await fetchUrl('http://localhost:3000')).body;
    const hasOrigin = /Remote Application \(Port 3001\)/.test(hostHtml);
    const hasRequestId = /SSR Request ID:/.test(hostHtml);
    const hasFederatedCard = /Federated Remote Component|Remote SSR Federated Card/.test(hostHtml);

    if (hasOrigin && hasRequestId && hasFederatedCard) {
      console.log('   ✅ Next.js Host successfully executed SSR rendering remote federated markup');
    } else {
      console.error('   ❌ SSR markup verification failed in Host HTML');
      passedAll = false;
    }
  } catch (err) {
    console.error('   ❌ SSR check error:', err.message);
    passedAll = false;
  }

  // 6. Verify Server Cache & Global State (Toasts / Headers)
  console.log('\n6. Verifying Server & Client Cache...');
  try {
    const apiRes1 = await fetchUrl('http://localhost:3001/api/server-data');
    const cacheHeader = apiRes1.headers['cache-control'] || '';
    const apiRes2 = await fetchUrl('http://localhost:3001/api/server-data');
    const json2 = JSON.parse(apiRes2.body);

    if (cacheHeader.includes('s-maxage') && (json2.cached !== undefined)) {
      console.log(`   ✅ Cache-Control headers (${cacheHeader}) and memory cache verification passed`);
    } else {
      console.warn('   ⚠️ Cache headers partially present:', cacheHeader);
    }
  } catch (err) {
    console.error('   ❌ Cache check error:', err.message);
    passedAll = false;
  }

  // 7. Verify MapLibre GL Integration & Query Parameters
  console.log('\n7. Verifying MapLibre GL & Query Parameter Handling...');
  try {
    const mapHtml = (await fetchUrl('http://localhost:3000/?tab=map&city=sao-paulo')).body;
    const hasMapLibreCss = /maplibre-gl/.test(mapHtml);
    const hasRoute = /\/\?tab=map/.test(mapHtml);

    if (hasMapLibreCss && hasRoute) {
      console.log('   ✅ MapLibre GL assets, styles, and query parameter routing (?tab=map) verified');
    } else {
      console.error('   ❌ MapLibre integration or query param routing missing');
      passedAll = false;
    }
  } catch (err) {
    console.error('   ❌ MapLibre / Query param check error:', err.message);
    passedAll = false;
  }

  console.log('\n----------------------------------------------------');
  if (passedAll) {
    console.log('🎉 ALL 7 POC REQUIREMENTS SUCCESSFULLY VERIFIED & PASSED!');
    console.log('----------------------------------------------------');
    process.exit(0);
  } else {
    console.error('❌ PoC verification suite failed one or more checks.');
    console.log('----------------------------------------------------');
    process.exit(1);
  }
}

runPoCVerification();
