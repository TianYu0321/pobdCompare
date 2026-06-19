const fs = require('fs');
const zlib = require('zlib');

const code = fs.readFileSync('D:/pobdCompare/tests/fixtures/builds/gothmommyaltgirl.pobcode', 'utf-8').trim();

// PoB2 解码逻辑: 替换 - 为 +，_ 为 /，然后 base64 解码，然后 zlib inflate
const fixed = code.replace(/-/g, '+').replace(/_/g, '/');

let decoded;
try {
  decoded = Buffer.from(fixed, 'base64');
  console.log('Base64 decoded:', decoded.length, 'bytes');
  console.log('First 50 bytes:', decoded.slice(0, 50));
  console.log('Last 50 bytes:', decoded.slice(-50));
} catch (e) {
  console.log('Base64 decode failed:', e.message);
  process.exit(1);
}

// 尝试 zlib inflate
let inflated;
try {
  inflated = zlib.inflateSync(decoded);
  console.log('\nZlib inflate:', inflated.length, 'bytes');
  console.log('First 200 chars:', inflated.toString('utf-8', 0, 200));
} catch (e) {
  console.log('Zlib inflate failed:', e.message);
  
  // 尝试 raw deflate (no zlib header)
  try {
    inflated = zlib.inflateRawSync(decoded);
    console.log('\nRaw deflate inflate:', inflated.length, 'bytes');
    console.log('First 200 chars:', inflated.toString('utf-8', 0, 200));
  } catch (e2) {
    console.log('Raw deflate also failed:', e2.message);
  }
}
