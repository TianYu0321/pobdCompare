const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'D:/pobdCompare/tests/fixtures/builds';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.build'));

// 读取所有 build
const builds = files.map(f => {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
  return {
    file: f,
    name: data.name,
    passives: new Set(data.passives.map(p => p.id)),
    passivesRaw: data.passives,
    skills: data.skills,
  };
});

console.log('=== Build Diff Report ===');
console.log(`Comparing ${builds.length} builds`);

// 两两对比
for (let i = 0; i < builds.length; i++) {
  for (let j = i + 1; j < builds.length; j++) {
    const a = builds[i];
    const b = builds[j];
    
    const aOnly = [...a.passives].filter(p => !b.passives.has(p));
    const bOnly = [...b.passives].filter(p => !a.passives.has(p));
    const common = [...a.passives].filter(p => b.passives.has(p));
    
    console.log(`\n--- ${a.name} vs ${b.name} ---`);
    console.log(`  Common: ${common.length}`);
    console.log(`  Only in ${a.name}: ${aOnly.length}`);
    if (aOnly.length > 0) console.log(`    ${aOnly.slice(0, 10).join(', ')}${aOnly.length > 10 ? '...' : ''}`);
    console.log(`  Only in ${b.name}: ${bOnly.length}`);
    if (bOnly.length > 0) console.log(`    ${bOnly.slice(0, 10).join(', ')}${bOnly.length > 10 ? '...' : ''}`);
  }
}

// 统计每个 passive 的出现频率
const passiveCount = new Map();
for (const b of builds) {
  for (const p of b.passives) {
    passiveCount.set(p, (passiveCount.get(p) || 0) + 1);
  }
}

const commonToAll = [...passiveCount.entries()].filter(([, count]) => count === builds.length).map(([p]) => p);
const variable = [...passiveCount.entries()].filter(([, count]) => count < builds.length).sort((a, b) => a[1] - b[1]);

console.log(`\n=== Core Passives (present in all ${builds.length} builds) ===`);
console.log(`  Count: ${commonToAll.length}`);
console.log(`  ${commonToAll.slice(0, 15).join(', ')}${commonToAll.length > 15 ? '...' : ''}`);

console.log(`\n=== Variable Passives (not in all builds) ===`);
console.log(`  Count: ${variable.length}`);
for (const [p, count] of variable.slice(0, 20)) {
  console.log(`  ${p}: ${count}/${builds.length}`);
}
