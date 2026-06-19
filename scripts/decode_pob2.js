const zlib = require('zlib');
const fs = require('fs');

const code = fs.readFileSync('D:/pobdCompare/tests/fixtures/builds/gothmommyaltgirl.pobcode', 'utf-8').trim();
const fixed = code.replace(/-/g, '+').replace(/_/g, '/');
const decoded = Buffer.from(fixed, 'base64');

console.log('Decoded bytes:', decoded.length);
console.log('Header bytes:', decoded.slice(0, 4).toString('hex'));

// Try different decompression strategies
const strategies = [
  { name: 'inflate', fn: zlib.inflateSync },
  { name: 'inflateRaw', fn: zlib.inflateRawSync },
  { name: 'unzip', fn: zlib.unzipSync },
];

for (const strategy of strategies) {
  try {
    const result = strategy.fn(decoded);
    console.log(`\n${strategy.name} SUCCESS: ${result.length} bytes`);
    console.log('First 200 chars:', result.toString('utf-8', 0, 200));
    break;
  } catch (e) {
    console.log(`${strategy.name} failed: ${e.message}`);
  }
}

// Try with windowBits options
for (let bits = 8; bits <= 15; bits++) {
  try {
    const result = zlib.inflateSync(decoded, { windowBits: bits });
    console.log(`\nwindowBits=${bits} SUCCESS: ${result.length} bytes`);
    console.log('First 200 chars:', result.toString('utf-8', 0, 200));
    break;
  } catch (e) {
    console.log(`windowBits=${bits} failed: ${e.message}`);
  }
}

// Try with negative windowBits (raw deflate)
for (let bits = -8; bits >= -15; bits--) {
  try {
    const result = zlib.inflateSync(decoded, { windowBits: bits });
    console.log(`\nwindowBits=${bits} SUCCESS: ${result.length} bytes`);
    console.log('First 200 chars:', result.toString('utf-8', 0, 200));
    break;
  } catch (e) {
    console.log(`windowBits=${bits} failed: ${e.message}`);
  }
}
