import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

export function resolveRepoPath(...segments: string[]): string {
  return path.resolve(repositoryRoot, ...segments);
}
