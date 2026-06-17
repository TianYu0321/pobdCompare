import { readFile } from "node:fs/promises";
import type { BaselineSnapshot } from "@pobd/schemas";

/**
 * Lightweight XML metadata extraction for PoB2 `.build` / `.xml` files.
 *
 * This does NOT perform full PoB2 computation — that is the responsibility of
 * the pob2-worker.  It only extracts enough metadata to populate a
 * `Partial<BaselineSnapshot>`.
 */

interface BuildXmlParseResult {
  characterName?: string;
  level?: number;
  className?: string;
  ascendancyName?: string;
  skillGroups: Array<{ groupId?: number; label?: string; skills: string[] }>;
  items: Array<{
    slotName: string;
    itemId: number;
    name: string;
    baseType: string;
    rawText?: string;
  }>;
  passiveNodes: number[];
  ascendNodes: number[];
  jewels: Array<{
    slotName?: string;
    itemId?: number;
    passiveNodes?: number[];
  }>;
}

function extractAttribute(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, "i");
  const match = regex.exec(xml);
  return match?.[1];
}

function extractTagContent(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = regex.exec(xml);
  return match?.[1];
}

function extractAllTagContents(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function parseItems(xml: string): BuildXmlParseResult["items"] {
  const itemsSection = extractTagContent(xml, "Items");
  if (!itemsSection) return [];

  const items: BuildXmlParseResult["items"] = [];
  const itemRegex = /<Item[^>]*>/gi;
  let itemMatch: RegExpExecArray | null;
  let itemId = 1;

  while ((itemMatch = itemRegex.exec(itemsSection)) !== null) {
    const itemTag = itemMatch[0];
    const slotName = extractAttribute(itemTag, "Item", "slot") ?? extractAttribute(itemTag, "Item", "id") ?? `item_${itemId}`;
    const name = extractAttribute(itemTag, "Item", "name") ?? "Unknown Item";
    const baseType = extractAttribute(itemTag, "Item", "baseType") ?? "";

    // Try to find the raw text content of this item (if present as a child)
    const rawTextMatch = /<Item[^>]*>([\s\S]*?)<\/Item>/i.exec(itemsSection.substring(itemMatch.index));
    const rawText = rawTextMatch ? rawTextMatch[1].trim() : undefined;

    items.push({
      slotName,
      itemId,
      name,
      baseType,
      rawText,
    });
    itemId++;
  }

  return items;
}

function parseSkills(xml: string): BuildXmlParseResult["skillGroups"] {
  const skillsSection = extractTagContent(xml, "Skills");
  if (!skillsSection) return [];

  const skillGroups: BuildXmlParseResult["skillGroups"] = [];
  const groupRegex = /<Skill[^>]*>/gi;
  let groupMatch: RegExpExecArray | null;
  let groupId = 1;

  while ((groupMatch = groupRegex.exec(skillsSection)) !== null) {
    const groupTag = groupMatch[0];
    const label = extractAttribute(groupTag, "Skill", "slot") ?? extractAttribute(groupTag, "Skill", "label") ?? "";

    // Find the corresponding closing tag to extract gems within this skill group
    const groupStart = groupMatch.index;
    const groupEndMatch = /<\/Skill>/i.exec(skillsSection.substring(groupStart));
    if (!groupEndMatch) continue;

    const groupContent = skillsSection.substring(
      groupStart + groupTag.length,
      groupStart + groupEndMatch.index + groupEndMatch[0].length
    );
    const gemNames: string[] = [];
    const gemRegex = /<Gem[^>]*>/gi;
    let gemMatch: RegExpExecArray | null;
    while ((gemMatch = gemRegex.exec(groupContent)) !== null) {
      const gemName = extractAttribute(gemMatch[0], "Gem", "name") ?? extractAttribute(gemMatch[0], "Gem", "skillId") ?? "";
      if (gemName) gemNames.push(gemName);
    }

    skillGroups.push({ groupId, label, skills: gemNames });
    groupId++;
  }

  return skillGroups;
}

function parseTree(xml: string): Pick<BuildXmlParseResult, "passiveNodes" | "ascendNodes" | "jewels"> {
  const treeSection = extractTagContent(xml, "Tree");
  if (!treeSection) return { passiveNodes: [], ascendNodes: [], jewels: [] };

  const spec = extractTagContent(treeSection, "Spec");
  if (!spec) return { passiveNodes: [], ascendNodes: [], jewels: [] };

  // Parse passive nodes: <URL>...</URL> or <Sockets>...</Sockets> may contain node hashes
  // PoB build files typically store node hashes in a comma-separated list inside <URL>
  const urlContent = extractTagContent(spec, "URL");
  let passiveNodes: number[] = [];
  if (urlContent) {
    const hashMatch = urlContent.match(/[?&](?:amp;)?nodes=([\d,]+)/);
    if (hashMatch) {
      passiveNodes = hashMatch[1]
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
    }
  }

  // Parse ascendancy nodes from the same URL or a separate list
  const ascendMatch = urlContent?.match(/[?&](?:amp;)?ascendNodes=([\d,]+)/);
  let ascendNodes: number[] = [];
  if (ascendMatch) {
    ascendNodes = ascendMatch[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
  }

  // Parse jewels: <Socket> elements inside <Sockets>
  const jewels: BuildXmlParseResult["jewels"] = [];
  const socketsContent = extractTagContent(spec, "Sockets");
  if (socketsContent) {
    const socketRegex = /<Socket[^>]*>/gi;
    let socketMatch: RegExpExecArray | null;
    while ((socketMatch = socketRegex.exec(socketsContent)) !== null) {
      const socketTag = socketMatch[0];
      const nodeIdStr = extractAttribute(socketTag, "Socket", "nodeId");
      const itemIdStr = extractAttribute(socketTag, "Socket", "itemId");
      jewels.push({
        slotName: nodeIdStr ?? undefined,
        itemId: itemIdStr ? parseInt(itemIdStr, 10) : undefined,
        passiveNodes: nodeIdStr ? [parseInt(nodeIdStr, 10)] : undefined,
      });
    }
  }

  return { passiveNodes, ascendNodes, jewels };
}

export class BuildXmlAdapter {
  /**
   * Check whether a file path looks like a PoB build file.
   */
  isBuildFile(path: string): boolean {
    const lower = path.toLowerCase();
    return lower.endsWith(".build") || lower.endsWith(".xml");
  }

  /**
   * Read a `.build` or `.xml` file from disk and return the raw XML
   * together with a source tag.
   */
  async readBuildFile(filePath: string): Promise<{ buildXml: string; source: string }> {
    if (!this.isBuildFile(filePath)) {
      throw new Error(`Not a valid build file: ${filePath}`);
    }
    const buildXml = await readFile(filePath, "utf-8");
    const source = filePath.toLowerCase().endsWith(".build") ? "build_file" : "build_xml";
    return { buildXml, source };
  }

  /**
   * Lightweight parse of a PoB2 build XML string.
   *
   * Returns a partial `BaselineSnapshot` containing only the metadata
   * that can be extracted without running PoB2 itself.
   */
  async parseBuildXml(buildXml: string): Promise<Partial<BaselineSnapshot>> {
    const characterName = extractAttribute(buildXml, "Build", "characterName");
    const levelStr = extractAttribute(buildXml, "Build", "level");
    const className = extractAttribute(buildXml, "Build", "className");
    const ascendancyName = extractAttribute(buildXml, "Build", "ascendClassName");

    const items = parseItems(buildXml);
    const skillGroups = parseSkills(buildXml);
    const { passiveNodes, ascendNodes, jewels } = parseTree(buildXml);

    return {
      source: "build_xml",
      buildXml,
      character: {
        name: characterName,
        level: levelStr ? parseInt(levelStr, 10) : undefined,
        className,
        ascendancyName,
      },
      skillGroups,
      items,
      passiveNodes,
      ascendNodes,
      jewels,
    };
  }
}
