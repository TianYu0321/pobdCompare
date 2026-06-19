const { BuildXmlAdapter } = require('./packages/adapters/dist/build-xml/build-xml-adapter.js');

async function test() {
  const adapter = new BuildXmlAdapter();
  const result = await adapter.readBuildFile('tests/fixtures/builds/tie5.build');
  console.log('buildXml:', result.buildXml.substring(0, 100));
  console.log('source:', result.source);
}

test().catch(console.error);
