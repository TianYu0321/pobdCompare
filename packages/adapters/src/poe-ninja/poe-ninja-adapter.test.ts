import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

import { PoeNinjaAdapter, decodePobCode } from './poe-ninja-adapter';

function encodePob(xml: string): string {
  return deflateSync(Buffer.from(xml, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('decodePobCode', () => {
  it('decodes URL-safe PoB exports into XML', () => {
    const xml = '<PathOfBuilding><Build level="90"/></PathOfBuilding>';
    expect(decodePobCode(encodePob(xml))).toBe(xml);
  });
});

describe('PoeNinjaAdapter', () => {
  it('parses PoE2 character URLs', () => {
    const adapter = new PoeNinjaAdapter();
    expect(
      adapter.parseCharacterUrl(
        'https://poe.ninja/poe2/builds/runesofaldur/character/Account-123/MyCharacter',
      ),
    ).toEqual({
      league: 'runesofaldur',
      account: 'Account-123',
      name: 'MyCharacter',
    });
  });

  it('discovers the snapshot version and returns a decoded calculable export', async () => {
    const xml = '<PathOfBuilding><Build level="98"/></PathOfBuilding>';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<title>Character</title>',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          snapshotVersions: [
            {
              url: 'runesofaldur',
              version: '0332-20260618-12087',
              snapshotName: 'runes-of-aldur',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          account: 'Account-123',
          name: 'MyCharacter',
          league: 'Runes of Aldur',
          level: 98,
          class: 'Martial Artist',
          pathOfBuildingExport: encodePob(xml),
        }),
      });
    const adapter = new PoeNinjaAdapter(fetcher as typeof fetch);

    const result = await adapter.fetchBuild(
      'https://poe.ninja/poe2/builds/runesofaldur/character/Account-123/MyCharacter',
    );

    expect(fetcher).toHaveBeenLastCalledWith(
      'https://poe.ninja/poe2/api/builds/0332-20260618-12087/character?account=Account-123&name=MyCharacter&overview=runes-of-aldur',
      expect.any(Object),
    );
    expect(result.buildXml).toBe(xml);
    expect(result.snapshotVersion).toBe('0332-20260618-12087');
  });
});
