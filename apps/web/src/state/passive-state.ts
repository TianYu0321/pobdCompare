import type { PassiveRankings } from '@/api';

export type PassiveState = {
  a?: PassiveRankings;
  b?: PassiveRankings;
};

export function replaceSidePassives(
  previous: PassiveState,
  side: 'a' | 'b',
  incoming?: PassiveState,
): PassiveState {
  return {
    ...previous,
    [side]: incoming?.[side],
  };
}
