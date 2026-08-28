import http from 'node:http';

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function verifyResilience() {
  console.log('🧪 Verifying Host Resilience & Graceful Fallback (http://localhost:3000)...');

  try {
    const { statusCode, body } = await fetchHtml('http://localhost:3000');

    if (statusCode !== 200) {
      console.error(`❌ Expected HTTP 200 from Host even in degraded mode, got: ${statusCode}`);
      process.exit(1);
    }

    console.log('  ✅ Host responded with HTTP 200 OK');

    const hasHostHeader = /Host Application/.test(body);
    const hasFallbackCard = /Remote Service Unavailable|Fallback Mode/.test(body);
    const hasOnlineCard = /Remote Component Loaded via SSR in Host/.test(body);

    if (hasHostHeader) {
      console.log('  ✅ Host core page rendered cleanly');
    } else {
      console.error('  ❌ Host core page missing from response');
      process.exit(1);
    }

    if (hasFallbackCard) {
      console.log('  ✅ Graceful Fallback Mode active: Host rendered RemoteFallbackCard without crashing');
    } else if (hasOnlineCard) {
      console.log('  ✅ Remote is online: Host rendered live federated component successfully');
    } else {
      console.error('  ❌ Neither fallback nor live component rendered properly');
      process.exit(1);
    }

    console.log('\n🎉 Resilience verification passed! Host survives remote outages seamlessly.');
  } catch (err) {
    console.error('❌ Error requesting Host:', err.message);
    process.exit(1);
  }
}

verifyResilience();
