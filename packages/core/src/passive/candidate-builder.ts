export interface TreeNodeRecord {
  id: number;
  name: string;
  connections: number[];
  type?: string;
  isKeystone?: boolean;
  isMastery?: boolean;
  isAscendancyStart?: boolean;
  isMultipleChoice?: boolean;
  isJewelSocket?: boolean;
  isNotable?: boolean;
  classStartIndex?: number;
  ascendancyName?: string;
}

export interface PassiveCandidate {
  id: number;
  name: string;
}

export interface PassiveCandidatePools {
  next: PassiveCandidate[];
  path: PassiveCandidate[];
  remove: PassiveCandidate[];
}

export function buildCandidatePools(
  allocatedNodeIds: number[],
  allNodes: TreeNodeRecord[],
  maxBfsDepth = 4,
): PassiveCandidatePools {
  const allocatedSet = new Set(allocatedNodeIds);
  const nodeById = new Map<number, TreeNodeRecord>();
  for (const n of allNodes) {
    nodeById.set(n.id, n);
  }

  function isExcludedFromAdd(node: TreeNodeRecord): boolean {
    if (node.isAscendancyStart) return true;
    if (node.classStartIndex !== undefined && node.classStartIndex >= 0) return true;
    return false;
  }

  function isProtectedRemove(node: TreeNodeRecord): boolean {
    if (node.type === 'ClassStart') return true;
    if (node.type === 'AscendClassStart') return true;
    if (node.type === 'Keystone') return true;
    if (node.isMastery) return true;
    if (node.isMultipleChoice) return true;
    if (node.classStartIndex !== undefined && node.classStartIndex >= 0) return true;
    return false;
  }

  // ---- next candidates: direct adjacency ----
  const nextSet = new Map<number, PassiveCandidate>();
  for (const allocId of allocatedNodeIds) {
    const allocNode = nodeById.get(allocId);
    if (!allocNode) continue;
    for (const linkedId of allocNode.connections) {
      if (allocatedSet.has(linkedId)) continue;
      const linkedNode = nodeById.get(linkedId);
      if (!linkedNode) continue;
      if (isExcludedFromAdd(linkedNode)) continue;
      nextSet.set(linkedId, { id: linkedId, name: linkedNode.name });
    }
  }
  const next = [...nextSet.values()];

  // ---- path candidates: distance >= 2 by BFS from allocated nodes ----
  const pathSet = new Map<number, { id: number; distance: number; isNotableOrKeystone: boolean }>();
  const nextIds = new Set(nextSet.keys());

  for (const allocId of allocatedNodeIds) {
    interface BfsEntry { nodeId: number; dist: number }
    const queue: BfsEntry[] = [];
    const localVisited = new Set<number>();
    localVisited.add(allocId);

    const allocNode = nodeById.get(allocId);
    if (!allocNode) continue;
    for (const linkedId of allocNode.connections) {
      if (!allocatedSet.has(linkedId)) {
        queue.push({ nodeId: linkedId, dist: 1 });
        localVisited.add(linkedId);
      }
    }

    let head = 0;
    while (head < queue.length) {
      const { nodeId, dist } = queue[head++];
      if (dist < 1) continue;
      if (dist >= 2) {
        if (!nextIds.has(nodeId)) {
          const node = nodeById.get(nodeId);
          if (node && !isExcludedFromAdd(node) && !node.isMultipleChoice && !node.isJewelSocket) {
            if (!pathSet.has(nodeId) || pathSet.get(nodeId)!.distance > dist) {
              pathSet.set(nodeId, {
                id: nodeId,
                distance: dist,
                isNotableOrKeystone: Boolean(node.isNotable || node.type === 'Keystone'),
              });
            }
          }
        }
      }
      if (dist >= maxBfsDepth) continue;
      const node = nodeById.get(nodeId);
      if (!node) continue;
      for (const nextId of node.connections) {
        if (allocatedSet.has(nextId)) continue;
        if (localVisited.has(nextId)) continue;
        localVisited.add(nextId);
        queue.push({ nodeId: nextId, dist: dist + 1 });
      }
    }
  }

  const path = [...pathSet.values()]
    .sort((a, b) => {
      if (a.isNotableOrKeystone !== b.isNotableOrKeystone) {
        return a.isNotableOrKeystone ? -1 : 1;
      }
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.id - b.id;
    })
    .map((entry) => {
      const node = nodeById.get(entry.id);
      return { id: entry.id, name: node?.name ?? `节点 ${entry.id}` };
    });

  // ---- remove candidates: allocated, not protected ----
  const removeCandidates = allocatedNodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is TreeNodeRecord => node !== undefined && !isProtectedRemove(node))
    .map((node) => ({ id: node.id, name: node.name, connectionCount: node.connections.length }))
    .sort((a, b) => {
      if (a.connectionCount !== b.connectionCount) {
        return a.connectionCount - b.connectionCount;
      }
      return a.id - b.id;
    })
    .map((entry) => ({ id: entry.id, name: entry.name }));

  return { next, path, remove: removeCandidates };
}
