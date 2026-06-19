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
  treeVersion?: string;
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

function isJsonFormat(content: string): boolean {
  return content.trim().startsWith("{");
}

function extractAttribute(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, "i");
  const match = regex.exec(xml);
  return match?.[1];
}

function parseJsonBuild(content: string): Partial<BaselineSnapshot> {
  try {
    const data = JSON.parse(content);

    // poe.ninja JSON format
    if (data.character || data.passives || data.skills) {
      const passives = (data.passives || []).map((p: any) => p.id).filter(Boolean);
      const skills = (data.skills || []).map((s: any) => s.id).filter(Boolean);
      const items = (data.items || []).map((i: any) => ({
        slotName: i.slot || "unknown",
        itemId: i.id || 0,
        name: i.name || "unknown",
        baseType: i.baseType || "unknown",
      }));

      return {
        source: "poe_ninja_json",
        buildXml: content,
        character: {
          name: data.character,
          level: data.level,
          className: data.class,
          ascendancyName: data.ascendancy,
        },
        passiveNodes: [], // poe.ninja uses string IDs, cannot map directly
        skillGroups: [{ groupId: 1, label: "main", skills }],
        items,
      };
    }

    // PoB2 .build JSON format (Saved Build)
    if (data.parts && data.parts[0] && data.parts[0].link) {
      return {
        source: "pob2_build_json",
        buildXml: content,
        character: {
          name: data.parts[0].label || "Saved Build",
        },
        passiveNodes: [], // Will be populated by pob2-worker after Decoding URL
      };
    }

    return {
      source: "unknown_json",
      buildXml: content,
    };
  } catch (e) {
    return {
      source: "invalid_json",
      buildXml: content,
    };
  }
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

  // Legacy/simple fixtures place the slot and item name directly on Item.
  const directItems: BuildXmlParseResult["items"] = [];
  const directRegex = /<Item\b[^>]*\bslot=["'][^"']+["'][^>]*\/?>/gi;
  let directMatch: RegExpExecArray | null;
  let directId = 1;
  while ((directMatch = directRegex.exec(itemsSection)) !== null) {
    const tag = directMatch[0];
    directItems.push({
      slotName: extractAttribute(tag, "Item", "slot") ?? `item_${directId}`,
      itemId: directId++,
      name: extractAttribute(tag, "Item", "name") ?? "Unknown Item",
      baseType: extractAttribute(tag, "Item", "baseType") ?? "",
    });
  }
  if (directItems.length > 0) return directItems;

  // Real PoB2 XML stores Item blocks separately and binds them through
  // ItemSet/Slot records.
  const itemById = new Map<
    number,
    { itemId: number; name: string; baseType: string; rawText: string }
  >();
  const blockRegex = /<Item\b([^>]*)>([\s\S]*?)<\/Item>/gi;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(itemsSection)) !== null) {
    const tag = `<Item${blockMatch[1]}>`;
    const idValue = extractAttribute(tag, "Item", "id");
    const itemId = idValue ? Number(idValue) : NaN;
    if (!Number.isFinite(itemId)) continue;
    const rawText = blockMatch[2]
      .replace(/<[^>]+>/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
    const lines = rawText.split(/\r?\n/);
    const rarityIndex = lines.findIndex((line) => /^Rarity:/i.test(line));
    itemById.set(itemId, {
      itemId,
      name: lines[rarityIndex + 1] ?? "Unknown Item",
      baseType: lines[rarityIndex + 2] ?? "",
      rawText,
    });
  }

  const itemsTag = xml.match(/<Items\b[^>]*>/i)?.[0] ?? "<Items>";
  const activeItemSet = extractAttribute(itemsTag, "Items", "activeItemSet");
  const itemSetRegex = /<ItemSet\b([^>]*)>([\s\S]*?)<\/ItemSet>/gi;
  let selectedItemSet = "";
  let itemSetMatch: RegExpExecArray | null;
  while ((itemSetMatch = itemSetRegex.exec(itemsSection)) !== null) {
    const tag = `<ItemSet${itemSetMatch[1]}>`;
    const id = extractAttribute(tag, "ItemSet", "id");
    if (!selectedItemSet || !activeItemSet || id === activeItemSet) {
      selectedItemSet = itemSetMatch[2];
    }
    if (activeItemSet && id === activeItemSet) break;
  }

  const items: BuildXmlParseResult["items"] = [];
  const slotRegex = /<Slot\b[^>]*>/gi;
  let slotMatch: RegExpExecArray | null;
  while ((slotMatch = slotRegex.exec(selectedItemSet)) !== null) {
    const slotName = extractAttribute(slotMatch[0], "Slot", "name");
    const itemIdValue = extractAttribute(slotMatch[0], "Slot", "itemId");
    const itemId = itemIdValue ? Number(itemIdValue) : 0;
    const item = itemById.get(itemId);
    if (!slotName || !item || itemId === 0) continue;
    items.push({ slotName, ...item });
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

function parseTree(xml: string): Pick<BuildXmlParseResult, "passiveNodes" | "ascendNodes" | "jewels" | "treeVersion"> {
  const treeSection = extractTagContent(xml, "Tree");
  if (!treeSection) return { passiveNodes: [], ascendNodes: [], jewels: [], treeVersion: undefined };

  // Find the <Spec> start tag with attributes (not just the content between tags)
  const specStartMatch = treeSection.match(/<Spec\b([^>]*)>/i);
  if (!specStartMatch) return { passiveNodes: [], ascendNodes: [], jewels: [], treeVersion: undefined };
  
  const specStartTag = specStartMatch[0];

  // Parse tree version from <Spec> start tag
  const treeVersion = extractAttribute(specStartTag, "Spec", "treeVersion");

  // Current PoB2 builds store nodes on <Spec>. Older/exported builds may
  // encode them in the nested passive-tree URL, so support both forms.
  const nodesAttr = extractAttribute(specStartTag, "Spec", "nodes");
  const specContent = extractTagContent(treeSection, "Spec");
  const urlContent = specContent ? extractTagContent(specContent, "URL") : undefined;
  const urlNodes = urlContent?.match(/[?&](?:amp;)?nodes=([\d,]+)/)?.[1];
  let passiveNodes: number[] = [];
  const passiveNodeList = nodesAttr ?? urlNodes;
  if (passiveNodeList) {
    passiveNodes = passiveNodeList
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
  }

  // Same compatibility rule for ascendancy nodes.
  const ascendNodesAttr = extractAttribute(specStartTag, "Spec", "ascendNodes");
  const urlAscendNodes = urlContent?.match(/[?&](?:amp;)?ascendNodes=([\d,]+)/)?.[1];
  let ascendNodes: number[] = [];
  const ascendNodeList = ascendNodesAttr ?? urlAscendNodes;
  if (ascendNodeList) {
    ascendNodes = ascendNodeList
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
  }

  // Parse jewels: <Socket> elements inside <Sockets>
  const jewels: BuildXmlParseResult["jewels"] = [];
  if (specContent) {
    const socketsContent = extractTagContent(specContent, "Sockets");
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
  }

  return { passiveNodes, ascendNodes, jewels, treeVersion };
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
    if (isJsonFormat(buildXml)) {
      return parseJsonBuild(buildXml);
    }

    const characterName = extractAttribute(buildXml, "Build", "characterName");
    const levelStr = extractAttribute(buildXml, "Build", "level");
    const className = extractAttribute(buildXml, "Build", "className");
    const ascendancyName = extractAttribute(buildXml, "Build", "ascendClassName");

    const items = parseItems(buildXml);
    const skillGroups = parseSkills(buildXml);
    const { passiveNodes, ascendNodes, jewels, treeVersion } = parseTree(buildXml);

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
      treeVersion,
    };
  }
}
