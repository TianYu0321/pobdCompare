import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PoB2Installation {
  root: string;
  version: string;
  luaDllPath: string;
}

export const DEFAULT_POB2_ROOTS = [
  process.env.POB2_ROOT,
  'D:\\PathOfBuilding-PoE2-dev\\PathOfBuilding-PoE2-dev',
  'D:\\Path of Building Community (PoE2)',
].filter((value): value is string => Boolean(value));

export async function detectPoB2Installation(
  candidates: string[] = DEFAULT_POB2_ROOTS,
): Promise<PoB2Installation> {
  for (const root of candidates) {
    const luaDllPath = join(root, 'runtime', 'lua51.dll');
    const manifestPath = join(root, 'manifest.xml');
    try {
      await access(luaDllPath);
      const manifest = await readFile(manifestPath, 'utf8');
      const version = manifest.match(/<Version\s+number=["']([^"']+)["']/i)?.[1];
      if (!version) continue;
      return { root, version, luaDllPath };
    } catch {
      // Try the next configured installation.
    }
  }

  throw new Error(
    `No usable Path of Building Community (PoE2) installation found. Checked: ${candidates.join(', ')}`,
  );
}
