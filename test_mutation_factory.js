const { BaselineManager } = require('./packages/core/dist/baseline/baseline-manager.js');
const { MutationFactory } = require('./packages/core/dist/mutation/mutation-applier.js');
const { Pob2WorkerPool } = require('./packages/pob2-worker/dist/worker-pool.js');
const { BuildXmlAdapter } = require('./packages/adapters/dist/build-xml/build-xml-adapter.js');
const fs = require('fs');

const pool = new Pob2WorkerPool({
  pythonPath: 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  driverPath: 'D:/pobdCompare/packages/pob2-worker/python/driver.py',
  pobRoot: 'D:\\PathOfBuilding-PoE2-dev\\PathOfBuilding-PoE2-dev',
  maxWorkers: 1,
  requestTimeoutMs: 60000
});

class Pob2PoolBaselineAdapter {
  constructor(pool) { this.pool = pool; }
  async computeBaseline(buildXml, options) {
    const response = await this.pool.submit({
      buildXml,
      skillNumber: options.skillNumber,
      weaponSet: options.weaponSet,
      config: options.config,
    });
    return {
      calcsOutput: response.calcsOutput ?? {},
      mainOutput: undefined,
      rawBreakdown: response.breakdown ?? {},
      skillDpsList: response.skillDpsList ?? [],
      skillGroups: [],
      items: response.itemSlots ?? [],
      passiveNodes: Array.isArray(response.passiveNodes) ? response.passiveNodes : [],
      ascendNodes: [],
      jewels: [],
    };
  }
}

class SimplePassiveTreeProvider {
  constructor(treeVersion) {
    this.linked = {};
    this.treeVersion = treeVersion || '0_1';
    const treeJsonPath = `D:/PathOfBuilding-PoE2-dev/PathOfBuilding-PoE2-dev/src/TreeData/${this.treeVersion}/tree.json`;
    try {
      const treeData = JSON.parse(fs.readFileSync(treeJsonPath, 'utf-8'));
      const nodes = treeData.nodes || {};
      const validNodeIds = new Set(Object.keys(nodes).map((id) => parseInt(id, 10)));
      for (const [nodeIdStr, node] of Object.entries(nodes)) {
        const nodeId = parseInt(nodeIdStr, 10);
        const connections = node.connections || [];
        this.linked[nodeId] = connections
          .map((c) => c.id)
          .filter((id) => typeof id === 'number' && validNodeIds.has(id));
      }
    } catch (e) {
      console.warn('Failed to load tree.json:', e.message);
    }
  }

  async getTree(baseline) {
    return baseline.passiveNodes.map((id) => ({
      id,
      linked: this.linked[id] || [],
      isAscendancyStart: false,
      isMultipleChoice: false,
    }));
  }
}

async function test() {
  const adapter = new BuildXmlAdapter();
  const buildXml = fs.readFileSync('tests/fixtures/builds/yewuheng1.build', 'utf-8');
  const parsed = await adapter.parseBuildXml(buildXml);
  console.log('parsed treeVersion:', parsed.treeVersion);
  console.log('parsed passiveNodes:', parsed.passiveNodes ? parsed.passiveNodes.length : 0);

  const baselineClient = new Pob2PoolBaselineAdapter(pool);
  const baselineManager = new BaselineManager(baselineClient, { enableFileCache: false });
  
  const baseline = await baselineManager.createBaseline(buildXml, {
    source: 'build_file',
    skillNumber: 1,
    weaponSet: 1,
    pob2Version: '0.1.0',
    pob2DataVersion: '0.1.0',
    gameVersion: '0.1.0',
    mainSkillSelection: {
      selectedSkillNumber: 1,
      selectionMode: 'auto_single',
      selectedSkillName: 'Main Skill',
      candidates: [],
      warnings: [],
    },
    normalizerVersion: '0.1.0',
  });
  
  console.log('baseline passiveNodes count:', baseline.passiveNodes.length);
  console.log('baseline passiveNodes first 10:', baseline.passiveNodes.slice(0, 10));

  const treeProvider = new SimplePassiveTreeProvider(parsed.treeVersion);
  const mutationFactory = new MutationFactory(treeProvider);
  
  const addMuts = await mutationFactory.generatePassiveAddCandidates(baseline);
  const removeMuts = await mutationFactory.generatePassiveRemoveCandidates(baseline);
  
  console.log('addMuts:', addMuts.length);
  console.log('removeMuts:', removeMuts.length);
  
  pool.shutdown();
}

test().catch(err => {
  console.error(err);
  pool.shutdown();
});
