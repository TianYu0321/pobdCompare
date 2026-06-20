import { describe, expect, it } from 'vitest';
import {
  buildCandidatePools,
  type TreeNodeRecord,
  type PassiveCandidatePools,
} from './candidate-builder';

function node(
  id: number,
  name: string,
  connections: number[],
  overrides?: Partial<TreeNodeRecord>,
): TreeNodeRecord {
  return {
    id,
    name,
    connections,
    type: overrides?.type,
    isKeystone: overrides?.isKeystone ?? false,
    isMastery: overrides?.isMastery ?? false,
    isAscendancyStart: overrides?.isAscendancyStart ?? false,
    isMultipleChoice: overrides?.isMultipleChoice ?? false,
    isJewelSocket: overrides?.isJewelSocket ?? false,
    isNotable: overrides?.isNotable ?? false,
    classStartIndex: overrides?.classStartIndex,
    ascendancyName: overrides?.ascendancyName,
  };
}

describe('buildCandidatePools', () => {
  // Allocated nodes: 10, 11, 12
  // Unallocated adjacency: 20 (connected to 10), 21 (connected to 12)
  // 30 is distance-2 (connected to 20), 31 is distance-3 (20 -> 30 -> 31)
  const baseNodes: TreeNodeRecord[] = [
    node(10, '起步节点', [], { type: 'ClassStart' }),
    node(11, '已分配小点', [20]),
    node(12, '已分配大点', [21]),
    node(13, '另一个已分配', [22]),
    node(20, '相邻节点', [10, 11, 30]),
    node(21, '另一相邻', [12]),
    node(22, '相邻3', [13, 32]),
    node(30, '距离2节点', [20, 31]),
    node(31, '距离3节点', [30]),
    node(32, '距离2-另一个', [22, 33]),
    node(33, '距离3-另一个', [32]),
  ];

  it('returns empty pools for empty allocated list', () => {
    const pools = buildCandidatePools([], baseNodes);
    expect(pools.next).toEqual([]);
    expect(pools.path).toEqual([]);
    expect(pools.remove).toEqual([]);
  });

  it('returns empty pools for no allocated nodes', () => {
    const pools = buildCandidatePools([], baseNodes);
    expect(pools.next).toHaveLength(0);
    expect(pools.path).toHaveLength(0);
    expect(pools.remove).toHaveLength(0);
  });

  it('produces next candidates for direct adjacency', () => {
    const pools = buildCandidatePools([11, 12], baseNodes);
    expect(pools.next.map((c) => c.id).sort()).toEqual([20, 21]);
  });

  it('excludes ascendancy starts from next candidates', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '升华起点', [11, 21], { isAscendancyStart: true }),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.next.map((c) => c.id)).not.toContain(20);
  });

  it('excludes protected nodes from next candidates', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '可加', [11]),
      node(21, '无效', [11], { isAscendancyStart: true }),
      node(22, 'class start', [11], { classStartIndex: 0 }),
    ];
    const pools = buildCandidatePools([11], nodes);
    const nextIds = pools.next.map((c) => c.id);
    expect(nextIds).toContain(20);
    expect(nextIds).not.toContain(21);
    expect(nextIds).not.toContain(22);
  });

  it('produces path candidates at distance >= 2', () => {
    const pools = buildCandidatePools([11], baseNodes);
    const pathIds = pools.path.map((c) => c.id);
    expect(pathIds).toContain(30);
    expect(pathIds).toContain(31);
  });

  it('excludes next candidates from path candidates', () => {
    const pools = buildCandidatePools([11, 12], baseNodes);
    const pathIds = pools.path.map((c) => c.id);
    expect(pathIds).not.toContain(20);
    expect(pathIds).not.toContain(21);
  });

  it('excludes ascendancy starts from path candidates', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '中间', [11, 30]),
      node(30, '目标', [20], { isAscendancyStart: true }),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.path.map((c) => c.id)).not.toContain(30);
  });

  it('excludes class start nodes from path candidates', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '中间', [11, 30]),
      node(30, '目标', [20], { classStartIndex: 0 }),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.path.map((c) => c.id)).not.toContain(30);
  });

  it('excludes multiple-choice from path candidates', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '中间', [11, 30]),
      node(30, 'notable', [20], { isMultipleChoice: true }),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.path.map((c) => c.id)).not.toContain(30);
  });

  it('excludes jewel sockets from path candidates', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '中间', [11, 30]),
      node(30, 'jewel', [20], { isJewelSocket: true }),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.path.map((c) => c.id)).not.toContain(30);
  });

  it('deduplicates path candidates reachable from multiple allocated nodes', () => {
    const nodes = [
      node(11, '已分配A', [20]),
      node(12, '已分配B', [21]),
      node(20, '中间', [11, 30]),
      node(21, '中间', [12, 30]),
      node(30, '共同目标', [20, 21]),
    ];
    const pools = buildCandidatePools([11, 12], nodes);
    expect(pools.path.filter((c) => c.id === 30)).toHaveLength(1);
  });

  it('path candidates prefer notable/keystone targets, then shorter distance, then id', () => {
    const nodes = [
      node(11, '已分配', [20, 22]),
      node(20, '中间', [11, 30]),
      node(22, '另一个中间', [11, 31, 32]),
      node(30, '普通距离2', [20]),
      node(31, '较小id普通', [22]),
      node(32, 'notable目标', [22], { isNotable: true }),
    ];
    const pools = buildCandidatePools([11], nodes);
    // notable first, then by distance, then by id
    const sorted = pools.path;
    const notableFirst = sorted[0];
    expect(notableFirst.id).toBe(32);
  });

  it('recognizes the real TreeData isKeystone flag when prioritizing path targets', () => {
    const nodes = [
      node(11, '已分配', [20, 21]),
      node(20, '普通中间点', [11, 30]),
      node(21, '基石中间点', [11, 31]),
      node(30, '普通目标', [20]),
      node(31, '基石目标', [21], { isKeystone: true }),
    ];

    const pools = buildCandidatePools([11], nodes);

    expect(pools.path[0]?.id).toBe(31);
  });

  it('does not expose or traverse through ascendancy-only nodes', () => {
    const nodes = [
      node(11, '已分配', [20, 21]),
      node(20, '普通相邻', [11, 30]),
      node(21, '升华相邻', [11, 31], { ascendancyName: 'Chronomancer' }),
      node(30, '普通目标', [20]),
      node(31, '升华后方目标', [21]),
    ];

    const pools = buildCandidatePools([11], nodes);

    expect(pools.next.map((candidate) => candidate.id)).not.toContain(21);
    expect(pools.path.map((candidate) => candidate.id)).not.toContain(31);
  });

  it('sorts next candidates deterministically by node id', () => {
    const nodes = [
      node(11, '已分配', [30, 20, 25]),
      node(20, '二十', [11]),
      node(25, '二十五', [11]),
      node(30, '三十', [11]),
    ];

    const pools = buildCandidatePools([11], nodes);

    expect(pools.next.map((candidate) => candidate.id)).toEqual([20, 25, 30]);
  });

  it('caps BFS depth at 4', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, 'd1', [11, 30]),
      node(30, 'd2', [20, 40]),
      node(40, 'd3', [30, 50]),
      node(50, 'd4', [40, 60]),
      node(60, 'd5 (should be excluded)', [50]),
    ];
    const pools = buildCandidatePools([11], nodes);
    const pathIds = pools.path.map((c) => c.id);
    expect(pathIds).toContain(30); // d2
    expect(pathIds).toContain(40); // d3
    expect(pathIds).toContain(50); // d4
    expect(pathIds).not.toContain(60); // d5
  });

  it('remove candidates: allocated removable nodes excluding protected types', () => {
    const nodes = [
      node(10, '类起始', [], { type: 'ClassStart' }),
      node(11, '升华起始', [], { type: 'AscendClassStart' }),
      node(12, '基石', [], { type: 'Keystone' }),
      node(13, '专精', [], { isMastery: true }),
      node(14, '多选', [], { isMultipleChoice: true }),
      node(15, '小点可删', []),
      node(16, '另一个可删', []),
    ];
    const pools = buildCandidatePools(
      [10, 11, 12, 13, 14, 15, 16],
      nodes,
    );
    const removeIds = pools.remove.map((c) => c.id);
    expect(removeIds).toContain(15);
    expect(removeIds).toContain(16);
    expect(removeIds).not.toContain(10);
    expect(removeIds).not.toContain(11);
    expect(removeIds).not.toContain(12);
    expect(removeIds).not.toContain(13);
    expect(removeIds).not.toContain(14);
  });

  it('remove candidates exclude classStartIndex nodes', () => {
    const nodes = [
      node(10, '起步', [], { classStartIndex: 0 }),
      node(11, '普通', []),
    ];
    const pools = buildCandidatePools([10, 11], nodes);
    expect(pools.remove.map((c) => c.id)).toEqual([11]);
  });

  it('protects allocated keystones represented by the real TreeData isKeystone flag', () => {
    const nodes = [
      node(10, '基石', [], { isKeystone: true }),
      node(11, '普通', []),
    ];

    const pools = buildCandidatePools([10, 11], nodes);

    expect(pools.remove.map((candidate) => candidate.id)).toEqual([11]);
  });

  it('remove candidates sort deterministically: leaf-like first, then id', () => {
    const nodes = [
      node(10, 'root-ish', [20, 30]),
      node(20, 'leaf-a', [10]),
      node(30, 'leaf-b', [10, 40]),
      node(40, 'deep', [30]),
    ];
    const pools = buildCandidatePools([10, 20, 30, 40], nodes);
    const sorted = pools.remove;
    // leaf nodes (connection count 1) should come before nodes with more connections
    const leafIdx = sorted.findIndex((c) => c.id === 20);
    const rootIdx = sorted.findIndex((c) => c.id === 10);
    expect(leafIdx).toBeLessThan(rootIdx);
  });

  it('attaches node names to candidates', () => {
    const pools = buildCandidatePools([11], baseNodes);
    const next20 = pools.next.find((c) => c.id === 20);
    expect(next20?.name).toBe('相邻节点');
  });

  it('handles graph with no reachable path beyond direct adjacency', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '相邻', [11]),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.next).toHaveLength(1);
    expect(pools.path).toHaveLength(0);
  });

  it('large BFS does not hang with circular reference', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '中间', [11, 30]),
      node(30, '循环', [20, 40]),
      node(40, '返回', [30, 20]),
    ];
    const pools = buildCandidatePools([11], nodes);
    expect(pools.path.length).toBeGreaterThanOrEqual(1);
  });

  it('excludes allocated nodes from both next and path', () => {
    const nodes = [
      node(11, '已分配', [20]),
      node(20, '相邻且已分配', [11]),
    ];
    const pools = buildCandidatePools([11, 20], nodes);
    expect(pools.next.map((c) => c.id)).not.toContain(20);
    expect(pools.path.map((c) => c.id)).not.toContain(20);
  });

  it('excludes class-start-allocated nodes from remove', () => {
    const nodes = [
      node(10, 'classstart', [], { classStartIndex: 0 }),
      node(11, 'normal', []),
    ];
    const pools = buildCandidatePools([10, 11], nodes);
    expect(pools.remove.map((c) => c.id)).toEqual([11]);
  });
});
