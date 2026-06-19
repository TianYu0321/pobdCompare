import { describe, expect, it } from 'vitest';

import { JobRegistry } from './job-registry';

describe('JobRegistry', () => {
  it('replays events to late subscribers and marks completion', () => {
    const jobs = new JobRegistry();
    const job = jobs.create('import');
    jobs.emit(job.id, {
      type: 'stage',
      stage: 'read_build_a',
      message: 'Reading build',
      timestamp: 1,
    });
    jobs.complete(job.id, { importId: 'import-1' });

    expect(jobs.get(job.id)).toMatchObject({
      status: 'completed',
      result: { importId: 'import-1' },
    });
    expect(jobs.events(job.id).map((event) => event.type)).toEqual([
      'stage',
      'result',
      'complete',
    ]);
  });

  it('records failures without discarding prior events', () => {
    const jobs = new JobRegistry();
    const job = jobs.create('comparison');
    jobs.emit(job.id, {
      type: 'stage',
      stage: 'compute_baselines',
      message: 'Computing',
      timestamp: 1,
    });
    jobs.fail(job.id, new Error('PoB2 failed'));

    expect(jobs.get(job.id)?.status).toBe('failed');
    expect(jobs.events(job.id).map((event) => event.type)).toEqual(['stage', 'error']);
  });
});
