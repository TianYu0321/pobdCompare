import { inflateSync } from 'node:zlib';

export interface PoeNinjaCharacterRef {
  league: string;
  account: string;
  name: string;
}

export interface PoeNinjaBuildResult {
  character: Record<string, unknown>;
  buildXml: string;
  snapshotVersion: string;
  sourceUrl: string;
}

export function decodePobCode(code: string): string {
  const normalized = code.replace(/-/g, '+').replace(/_/g, '/');
  return inflateSync(Buffer.from(normalized, 'base64')).toString('utf8');
}

export class PoeNinjaAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  isPoeNinjaLink(link: string): boolean {
    try {
      const url = new URL(link);
      return url.hostname === 'poe.ninja' || url.hostname === 'www.poe.ninja';
    } catch {
      return false;
    }
  }

  parseCharacterUrl(link: string): PoeNinjaCharacterRef {
    const url = new URL(link);
    const match = url.pathname.match(
      /^\/poe2\/builds\/([^/]+)\/character\/([^/]+)\/([^/]+)\/?$/,
    );
    if (!match) throw new Error(`Unsupported poe.ninja character URL: ${link}`);
    return {
      league: decodeURIComponent(match[1]),
      account: decodeURIComponent(match[2]),
      name: decodeURIComponent(match[3]),
    };
  }

  async fetchBuild(link: string): Promise<PoeNinjaBuildResult> {
    const characterRef = this.parseCharacterUrl(link);
    const pageResponse = await this.fetcher(link, {
      headers: { Accept: 'text/html' },
    });
    if (!pageResponse.ok) {
      throw new Error(`poe.ninja page request failed: ${pageResponse.status}`);
    }
    await pageResponse.text();
    const indexResponse = await this.fetcher('https://poe.ninja/poe2/api/data/index-state', {
      headers: { Accept: 'application/json' },
    });
    if (!indexResponse.ok) {
      throw new Error(`poe.ninja index-state request failed: ${indexResponse.status}`);
    }
    const indexState = (await indexResponse.json()) as {
      snapshotVersions?: Array<{ url?: string; version?: string; snapshotName?: string }>;
    };
    const snapshot = indexState.snapshotVersions?.find(
      (candidate) => candidate.url === characterRef.league,
    );
    const snapshotVersion = snapshot?.version;
    if (!snapshotVersion || !snapshot.snapshotName) {
      throw new Error(`Unable to discover poe.ninja snapshot version for ${characterRef.league}`);
    }

    const query = new URLSearchParams({
      account: characterRef.account,
      name: characterRef.name,
      overview: snapshot.snapshotName,
    });
    const endpoint = `https://poe.ninja/poe2/api/builds/${snapshotVersion}/character?${query}`;
    const apiResponse = await this.fetcher(endpoint, {
      headers: { Accept: 'application/json' },
    });
    if (!apiResponse.ok) {
      throw new Error(`poe.ninja character API failed: ${apiResponse.status}`);
    }
    const character = (await apiResponse.json()) as Record<string, unknown>;
    const exportCode = character.pathOfBuildingExport;
    if (typeof exportCode !== 'string' || exportCode.length === 0) {
      throw new Error('poe.ninja character does not provide pathOfBuildingExport');
    }

    return {
      character,
      buildXml: decodePobCode(exportCode),
      snapshotVersion,
      sourceUrl: link,
    };
  }

}
