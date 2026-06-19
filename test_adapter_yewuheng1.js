const { BuildXmlAdapter } = require('./packages/adapters/dist/build-xml/build-xml-adapter.js');

async function test() {
  const adapter = new BuildXmlAdapter();
  const result = await adapter.parseBuildXml(require('fs').readFileSync('tests/fixtures/builds/yewuheng1.build', 'utf-8'));
  console.log('treeVersion:', result.treeVersion);
  console.log('passiveNodes count:', result.passiveNodes ? result.passiveNodes.length : 0);
}

test().catch(console.error);
