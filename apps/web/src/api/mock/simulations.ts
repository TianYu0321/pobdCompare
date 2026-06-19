import type { NormalizedBuild, SimulationCandidate, SimulationProgress } from '@/types';

export async function getGearSwapCandidates(build: NormalizedBuild): Promise<SimulationCandidate[]> {
  // MVP: mock 候选数据
  return build.equipments.map((slot, i) => ({
    id: `gear-${i}`,
    type: 'gear_swap',
    description: `${slot.slotName}: ${slot.item?.name ?? '空'}`,
    compatibility: 'compatible',
    status: 'idle',
  }));
}

export async function getPassiveMarginalCandidates(build: NormalizedBuild): Promise<SimulationCandidate[]> {
  // MVP: mock 候选数据
  return build.passives.map((node, i) => ({
    id: `passive-${i}`,
    type: 'passive_add',
    description: `节点 ${node.id}${node.name ? ` (${node.name})` : ''}`,
    compatibility: 'compatible',
    status: 'idle',
  }));
}

export async function runSimulation(candidate: SimulationCandidate): Promise<SimulationCandidate> {
  // MVP: 模拟后端调用，固定延迟后返回 mock 结果
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
  return {
    ...candidate,
    status: 'completed',
    dpsDelta: (Math.random() - 0.5) * 20000,
  };
}

export async function getSimulationProgress(): Promise<SimulationProgress> {
  // MVP: 固定进度
  return { total: 10, completed: 10, failed: 0, percent: 100 };
}
