const { Pob2WorkerPool } = require('./packages/pob2-worker/dist/worker-pool.js');
const fs = require('fs');

const pool = new Pob2WorkerPool({
  pythonPath: 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  driverPath: 'D:/pobdCompare/packages/pob2-worker/python/driver.py',
  pobRoot: 'D:\\PathOfBuilding-PoE2-dev\\PathOfBuilding-PoE2-dev',
  maxWorkers: 1,
  requestTimeoutMs: 60000
});

const buildJson = fs.readFileSync('tests/fixtures/builds/tie5.build', 'utf-8');

pool.submit({
  buildXml: buildJson,
  skillNumber: 1,
  weaponSet: 1,
  config: {}
}).then(response => {
  console.log('success:', response.success);
  console.log('passiveNodes:', response.passiveNodes);
  console.log('passiveNodes type:', typeof response.passiveNodes, Array.isArray(response.passiveNodes));
  pool.shutdown();
}).catch(err => {
  console.error('Error:', err);
  pool.shutdown();
});
