import type { VariantRevision, VariantSession } from '@pobd/schemas';

export class VariantSessionManager {
  private revisions: VariantRevision[];
  private cursor = 0;

  constructor(private readonly baselineHash: string) {
    this.revisions = [
      {
        revisionId: 'rev-0',
        variantHash: baselineHash,
        createdAt: Date.now(),
      },
    ];
  }

  append(revision: VariantRevision): VariantRevision {
    const head = this.revisions[this.cursor];
    if (revision.parentRevisionId && revision.parentRevisionId !== head.revisionId) {
      throw new Error(`stale_revision: parent ${revision.parentRevisionId} !== head ${head.revisionId}`);
    }
    this.revisions = this.revisions.slice(0, this.cursor + 1);
    this.revisions.push(revision);
    this.cursor = this.revisions.length - 1;
    return this.current();
  }

  current(): VariantRevision {
    return this.revisions[this.cursor];
  }

  undo(): VariantRevision {
    this.cursor = Math.max(0, this.cursor - 1);
    return this.current();
  }

  redo(): VariantRevision {
    this.cursor = Math.min(this.revisions.length - 1, this.cursor + 1);
    return this.current();
  }

  reset(): VariantRevision {
    this.cursor = 0;
    return this.current();
  }

  snapshot(): VariantSession {
    return {
      baselineHash: this.baselineHash,
      revisions: [...this.revisions],
      cursor: this.cursor,
    };
  }
}
