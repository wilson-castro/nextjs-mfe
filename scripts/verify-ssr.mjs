import http from 'node:http';

/**
 * Perform a raw HTTP GET request to verify SSR HTML payload.
 * @param {string} url
 * @returns {Promise<{ statusCode: number, body: string }>}
 */
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

async function verifySsr() {
  console.log('🔍 Checking SSR federated component rendering on Host (http://localhost:3000)...');
  
  try {
    const { statusCode, body } = await fetchHtml('http://localhost:3000');
    
    if (statusCode !== 200) {
      console.error(`❌ Host returned status code ${statusCode}`);
      process.exit(1);
    }

    const assertions = [
      { name: 'Host Title / Container', pattern: /Host Application/ },
      { name: 'Remote Federated Badge', pattern: /Federated Remote Component/ },
      { name: 'Remote Component Title', pattern: /Remote Component Loaded via SSR in Host/ },
      { name: 'Remote SSR Origin Text', pattern: /Remote Application \(Port 3001\)/ },
      { name: 'SSR Request ID Label', pattern: /SSR Request ID:/ },
    ];

    let allPassed = true;
    for (const { name, pattern } of assertions) {
      const passed = pattern.test(body);
      if (passed) {
        console.log(`  ✅ Asserted: ${name}`);
      } else {
        console.error(`  ❌ Failed: ${name} was not found in raw server-rendered HTML response!`);
        allPassed = false;
      }
    }

    if (!allPassed) {
      console.error('\n❌ Server-Side Rendering verification failed. HTML did not contain federated remote markup.');
      process.exit(1);
    }

    console.log('\n🎉 SUCCESS: Micro-Frontend SSR Federation is fully verified! The remote component was rendered on the server in the host response.');
  } catch (err) {
    console.error('❌ Error connecting to Host application:', err.message);
    process.exit(1);
  }
}

verifySsr();
