const { SimplePassiveTreeProvider } = require('./apps/cli/dist/commands/p1-5a-test.js');

// This won't work because SimplePassiveTreeProvider is not exported
// Let me test directly

const fs = require('fs');

const treeVersion = '0_5';
const treeJsonPath = `D:/PathOfBuilding-PoE2-dev/PathOfBuilding-PoE2-dev/src/TreeData/${treeVersion}/tree.json`;

try {
  const treeData = JSON.parse(fs.readFileSync(treeJsonPath, 'utf-8'));
  const nodes = treeData.nodes || {};
  const linked = {};
  for (const [nodeIdStr, node] of Object.entries(nodes)) {
    const nodeId = parseInt(nodeIdStr, 10);
    const connections = node.connections || [];
    linked[nodeId] = connections.map((c) => c.id).filter((id) => typeof id === 'number');
  }
  
  const yewuhengNodes = [1841, 2021, 2582, 3251, 3431, 4157, 4378, 4552, 5227, 5305, 5335, 6330, 7163, 7338, 7576, 8810, 9405, 10131, 10364, 10472, 10944, 11472, 11495, 11604, 11825, 12253, 13799, 14226, 14262, 14446, 14539, 14658, 14725, 15207, 16150, 16705, 17088, 17215, 17602, 17668, 17955, 18818, 18897, 19355, 19370, 19880, 20437, 21537, 21746, 21984, 24287, 24647, 24786, 25971, 26034, 26598, 27422, 27705, 29306, 29517, 30657, 31433, 31765, 32545, 32683, 32701, 32763, 32951, 33366, 33866, 34015, 34081, 34168, 34233, 34324, 34543, 34702, 36479, 36576, 36778, 37604, 37974, 38463, 38728, 39280, 39495, 39552, 39567, 39595, 39986, 40270, 41017, 41580, 41873, 42379, 42658, 42750, 42794, 42805, 42857, 43082, 43691, 43877, 44669, 44683, 44776, 44974, 45100, 46386, 46882, 47976, 48116, 48773, 49220, 49461, 50635, 50755, 50912, 51522, 51546, 51707, 51741, 52295, 52501, 53149, 53185, 54984, 55193, 55995, 56045, 56349, 56493, 56838, 56928, 57821, 57933, 57970, 59538, 59720, 59798, 59799, 60034, 60700, 60735, 61196, 61403, 61834, 62230, 62350, 63566, 64650, 64990];
  
  const allocatedSet = new Set(yewuhengNodes);
  let count = 0;
  for (const nodeId of yewuhengNodes) {
    const linkedNodes = linked[nodeId] || [];
    for (const linkedId of linkedNodes) {
      if (!allocatedSet.has(linkedId)) {
        count++;
      }
    }
  }
  
  console.log('Unallocated linked count:', count);
  console.log('linked[1841]:', linked[1841]);
  console.log('linked[2021]:', linked[2021]);
} catch (e) {
  console.error('Error:', e);
}
