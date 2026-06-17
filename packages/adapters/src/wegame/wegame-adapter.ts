import type { ConversionReport, BaselineSnapshot } from "@pobd/schemas";
import {
  createConversionReport,
  addWarning,
  finalizeReport,
  incrementMapped,
  incrementTotal,
  addUnmappedItem,
  addUnmappedSkill,
  addUnknownMod,
  addUnmappedNode,
  addUnmappedAscendancy,
} from "./conversion-report";

/**
 * WeGame share-link adapter.
 *
 * **Important:** The exact WeGame data format is not yet known.  This adapter
 * implements a robust framework that:
 * 1. Detects WeGame share links.
 * 2. Attempts to fetch / extract raw data.
 * 3. Tries multiple parsing strategies (JSON, key-value, generic).
 * 4. Falls back to a `partial` / `failed` ConversionReport with detailed warnings.
 *
 * When the real WeGame data format is provided, only the parsing helpers below
 * need to be updated; the pipeline, report generation, and error handling are
 * already in place.
 */

const WEGAME_HOSTS = ["wegame.com.cn", "www.wegame.com.cn", "m.wegame.com.cn"];

interface WeGameRawData {
  shareId: string;
  payload: unknown;
  format: "json" | "key-value" | "unknown";
}

export class WeGameAdapter {
  /**
   * Check whether a URL is a WeGame share link.
   */
  isWeGameLink(link: string): boolean {
    try {
      const url = new URL(link);
      return WEGAME_HOSTS.includes(url.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * Parse a WeGame share link and attempt to extract raw character data.
   *
   * Because the exact format is still unknown, this method:
   * - Extracts a `shareId` from the URL.
   * - Returns a placeholder `rawData` string that downstream code can inspect.
   */
  async parseWeGameShareLink(link: string): Promise<{ rawData: string; shareId: string }> {
    if (!this.isWeGameLink(link)) {
      throw new Error(`Not a valid WeGame link: ${link}`);
    }

    const url = new URL(link);
    const shareId = url.searchParams.get("id") ?? url.searchParams.get("shareId") ?? this.extractShareIdFromPath(url.pathname) ?? "unknown";

    // Framework: when real API / scraping is available, replace this block.
    // For now, we return a structured placeholder so the caller knows parsing
    // has not been implemented yet.
    const placeholder = {
      _meta: {
        adapter: "@pobd/adapters/wegame",
        shareId,
        url: link,
        note: "WeGame data format not yet known — placeholder payload",
      },
      data: null,
    };

    const rawData = JSON.stringify(placeholder);
    return { rawData, shareId };
  }

  /**
   * Convert raw WeGame data into a PoB2 `buildXml` string and a detailed
   * `ConversionReport`.
   *
   * The conversion pipeline is generic so it can evolve once the real data
   * format is revealed.  It attempts:
   * 1. JSON parsing.
   * 2. Generic key-value extraction.
   * 3. Fallback to `partial`/`failed` with warnings.
   */
  async convertToBuildXml(rawData: string): Promise<{ buildXml: string; conversionReport: ConversionReport }> {
    const report = createConversionReport();
    let parsed: WeGameRawData | null = null;

    // Attempt 1 — JSON
    try {
      const json = JSON.parse(rawData) as Record<string, unknown>;
      const meta = json._meta as Record<string, unknown> | undefined;
      if (meta?.adapter === "@pobd/adapters/wegame" && json.data === null) {
        addWarning(report, "WeGame data is a placeholder; real format not yet available.");
      }
      parsed = {
        shareId: (meta?.shareId as string) ?? "unknown",
        payload: json,
        format: "json",
      };
    } catch {
      // Attempt 2 — generic key-value (e.g. query-string-like or INI-style)
      try {
        const kv = this.parseKeyValue(rawData);
        parsed = {
          shareId: (kv.shareId as string) ?? (kv.id as string) ?? "unknown",
          payload: kv,
          format: "key-value",
        };
      } catch {
        addWarning(report, "Unable to parse WeGame data as JSON or key-value format.");
      }
    }

    if (!parsed) {
      addWarning(report, "Raw data could not be parsed — conversion aborted.");
      report.status = "failed";
      const buildXml = this.buildXmlFromPlaceholder(report, "failed");
      finalizeReport(report);
      return { buildXml, conversionReport: report };
    }

    // Build the PoB2 XML from whatever we have.
    const buildXml = this.buildXmlFromWeGameData(parsed, report);
    finalizeReport(report);
    return { buildXml, conversionReport: report };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractShareIdFromPath(pathname: string): string | undefined {
    const match = pathname.match(/\/share\/([a-zA-Z0-9_-]+)/);
    return match?.[1];
  }

  private parseKeyValue(raw: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      // Try to coerce numbers / booleans
      if (value === "true" || value === "false") {
        result[key] = value === "true";
      } else if (/^-?\d+$/.test(value)) {
        result[key] = parseInt(value, 10);
      } else if (/^-?\d+\.\d+$/.test(value)) {
        result[key] = parseFloat(value);
      } else {
        result[key] = value;
      }
    }
    // If the input was non-empty but we parsed nothing, it's not valid key-value format
    const nonEmpty = raw.replace(/\s/g, "").length > 0;
    if (nonEmpty && Object.keys(result).length === 0) {
      throw new Error("No valid key-value pairs found in raw data");
    }
    return result;
  }

  private buildXmlFromPlaceholder(report: ConversionReport, status: "partial" | "failed"): string {
    const build = {
      level: 1,
      className: "Unknown",
      ascendClassName: "None",
      characterName: "WeGame_Import",
    };
    return this.renderBuildXml(build, [], [], [], []);
  }

  private buildXmlFromWeGameData(data: WeGameRawData, report: ConversionReport): string {
    const payload = data.payload as Record<string, unknown>;

    // Extract what we can from the payload
    const level = typeof payload.level === "number" ? payload.level : 1;
    const className = typeof payload.class === "string" ? payload.class : typeof payload.className === "string" ? payload.className : "Unknown";
    const ascendClassName = typeof payload.ascendancy === "string" ? payload.ascendancy : typeof payload.ascendClassName === "string" ? payload.ascendClassName : "None";
    const characterName = typeof payload.name === "string" ? payload.name : typeof payload.characterName === "string" ? payload.characterName : `WeGame_${data.shareId}`;

    const build = { level, className, ascendClassName, characterName };

    // Skills
    const skills: string[] = [];
    if (Array.isArray(payload.skills)) {
      incrementTotal(report, "skill", payload.skills.length);
      for (const skill of payload.skills) {
        if (typeof skill === "string") {
          skills.push(skill);
          incrementMapped(report, "skill");
        } else if (typeof skill === "object" && skill !== null) {
          const skillName = (skill as Record<string, unknown>).name ?? (skill as Record<string, unknown>).skillName;
          if (typeof skillName === "string") {
            skills.push(skillName);
            incrementMapped(report, "skill");
          } else {
            addUnmappedSkill(report, { rawName: JSON.stringify(skill), reason: "Missing skill name" });
          }
        } else {
          addUnmappedSkill(report, { rawName: String(skill), reason: "Unsupported skill type" });
        }
      }
    } else {
      addWarning(report, "No skill array found in WeGame payload.");
    }

    // Items
    const items: Array<{ slotName: string; itemId: number; name: string; baseType: string }> = [];
    if (Array.isArray(payload.items)) {
      incrementTotal(report, "item", payload.items.length);
      let itemId = 1;
      for (const item of payload.items) {
        if (typeof item === "object" && item !== null) {
          const itemRecord = item as Record<string, unknown>;
          const name = typeof itemRecord.name === "string" ? itemRecord.name : "Unknown";
          const slotName = typeof itemRecord.slot === "string" ? itemRecord.slot : `slot_${itemId}`;
          const baseType = typeof itemRecord.baseType === "string" ? itemRecord.baseType : "";
          items.push({ slotName, itemId, name, baseType });
          incrementMapped(report, "item");
        } else {
          addUnmappedItem(report, { slotName: "unknown", name: String(item), reason: "Unsupported item type" });
        }
        itemId++;
      }
    } else {
      addWarning(report, "No item array found in WeGame payload.");
    }

    // Passive nodes
    const passiveNodes: number[] = [];
    if (Array.isArray(payload.passiveNodes)) {
      incrementTotal(report, "passive", payload.passiveNodes.length);
      for (const node of payload.passiveNodes) {
        if (typeof node === "number") {
          passiveNodes.push(node);
          incrementMapped(report, "passive");
        } else if (typeof node === "string" && /^\d+$/.test(node)) {
          passiveNodes.push(parseInt(node, 10));
          incrementMapped(report, "passive");
        } else {
          addUnmappedNode(report, { sourceNodeId: String(node), reason: "Invalid passive node format" });
        }
      }
    } else {
      addWarning(report, "No passiveNodes array found in WeGame payload.");
    }

    // Ascendancy nodes
    const ascendNodes: number[] = [];
    if (Array.isArray(payload.ascendancyNodes)) {
      incrementTotal(report, "ascendancy", payload.ascendancyNodes.length);
      for (const node of payload.ascendancyNodes) {
        if (typeof node === "number") {
          ascendNodes.push(node);
          incrementMapped(report, "ascendancy");
        } else if (typeof node === "string" && /^\d+$/.test(node)) {
          ascendNodes.push(parseInt(node, 10));
          incrementMapped(report, "ascendancy");
        } else {
          addUnmappedAscendancy(report, { sourceNodeId: String(node), reason: "Invalid ascendancy node format" });
        }
      }
    }

    // Mods (from items)
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) {
        if (typeof item === "object" && item !== null) {
          const mods = (item as Record<string, unknown>).mods ?? (item as Record<string, unknown>).implicitMods ?? (item as Record<string, unknown>).explicitMods;
          if (Array.isArray(mods)) {
            incrementTotal(report, "mod", mods.length);
            for (const mod of mods) {
              if (typeof mod === "string") {
                incrementMapped(report, "mod");
              } else {
                addUnknownMod(report, {
                  sourceItemSlot: String((item as Record<string, unknown>).slot ?? "unknown"),
                  sourceItemName: String((item as Record<string, unknown>).name ?? "unknown"),
                  rawText: JSON.stringify(mod),
                  tags: ["wegame"],
                });
              }
            }
          }
        }
      }
    }

    // Config
    if (typeof payload.config === "object" && payload.config !== null) {
      const configKeys = Object.keys(payload.config);
      incrementTotal(report, "config", configKeys.length);
      for (const key of configKeys) {
        incrementMapped(report, "config");
      }
    }

    return this.renderBuildXml(build, skills, items, passiveNodes, ascendNodes);
  }

  private renderBuildXml(
    build: { level: number; className: string; ascendClassName: string; characterName: string },
    skills: string[],
    items: Array<{ slotName: string; itemId: number; name: string; baseType: string }>,
    passiveNodes: number[],
    ascendNodes: number[]
  ): string {
    const skillXml = skills
      .map((s, i) => `    <Gem name="${this.escapeXml(s)}" skillId="${i}"/>`)
      .join("\n");

    const itemXml = items
      .map((it) => `    <Item slot="${this.escapeXml(it.slotName)}" name="${this.escapeXml(it.name)}" baseType="${this.escapeXml(it.baseType)}"/>`)
      .join("\n");

    const passiveStr = passiveNodes.join(",");
    const ascendStr = ascendNodes.join(",");

    return `<?xml version="1.0" encoding="UTF-8" ?>
<PathOfBuilding>
  <Build level="${build.level}" className="${this.escapeXml(build.className)}" ascendClassName="${this.escapeXml(build.ascendClassName)}" characterName="${this.escapeXml(build.characterName)}"/>
  <Skills>
    <Skill>
${skillXml}
    </Skill>
  </Skills>
  <Items>
${itemXml}
  </Items>
  <Tree>
    <Spec>
      <URL>https://www.pathofexile.com/passive-skill-tree?nodes=${passiveStr}&amp;ascendNodes=${ascendStr}</URL>
    </Spec>
  </Tree>
</PathOfBuilding>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
