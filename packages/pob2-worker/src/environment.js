"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_POB2_ROOTS = void 0;
exports.detectPoB2Installation = detectPoB2Installation;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
exports.DEFAULT_POB2_ROOTS = [
    process.env.POB2_ROOT,
    'D:\\PathOfBuilding-PoE2-dev\\PathOfBuilding-PoE2-dev',
    'D:\\Path of Building Community (PoE2)',
].filter((value) => Boolean(value));
async function detectPoB2Installation(candidates = exports.DEFAULT_POB2_ROOTS) {
    for (const root of candidates) {
        const luaDllPath = (0, node_path_1.join)(root, 'runtime', 'lua51.dll');
        const manifestPath = (0, node_path_1.join)(root, 'manifest.xml');
        try {
            await (0, promises_1.access)(luaDllPath);
            const manifest = await (0, promises_1.readFile)(manifestPath, 'utf8');
            const version = manifest.match(/<Version\s+number=["']([^"']+)["']/i)?.[1];
            if (!version)
                continue;
            return { root, version, luaDllPath };
        }
        catch {
            // Try the next configured installation.
        }
    }
    throw new Error(`No usable Path of Building Community (PoE2) installation found. Checked: ${candidates.join(', ')}`);
}
//# sourceMappingURL=environment.js.map