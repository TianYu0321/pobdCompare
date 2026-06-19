import { describe, it, expect } from "vitest";
import { BuildXmlAdapter } from "./build-xml-adapter";

const adapter = new BuildXmlAdapter();

const sampleBuildXml = `<?xml version="1.0" encoding="UTF-8" ?>
<PathOfBuilding>
  <Build level="95" className="Shadow" ascendClassName="Trickster" characterName="TestChar"/>
  <Skills>
    <Skill slot="Skill1">
      <Gem name="Lightning Strike" skillId="123"/>
      <Gem name="Added Lightning Damage" skillId="456"/>
    </Skill>
    <Skill slot="Skill2">
      <Gem name="Whirling Blades" skillId="789"/>
    </Skill>
  </Skills>
  <Items>
    <Item slot="Weapon1" name="Exquisite Blade" baseType="Thrusting One Hand Sword"/>
    <Item slot="Body Armour" name="Lightning Coil" baseType="Desert Brigandine"/>
  </Items>
  <Tree>
    <Spec>
      <URL>https://www.pathofexile.com/passive-skill-tree?nodes=1,2,3,4,5&amp;ascendNodes=10,11</URL>
      <Sockets>
        <Socket nodeId="20" itemId="1"/>
        <Socket nodeId="21" itemId="2"/>
      </Sockets>
    </Spec>
  </Tree>
</PathOfBuilding>`;

describe("BuildXmlAdapter", () => {
  describe("isBuildFile", () => {
    it("returns true for .build files", () => {
      expect(adapter.isBuildFile("/path/to/my.build")).toBe(true);
      expect(adapter.isBuildFile("C:\\Users\\test\\character.build")).toBe(true);
    });

    it("returns true for .xml files", () => {
      expect(adapter.isBuildFile("/path/to/my.xml")).toBe(true);
      expect(adapter.isBuildFile("build.xml")).toBe(true);
    });

    it("returns false for other extensions", () => {
      expect(adapter.isBuildFile("/path/to/my.txt")).toBe(false);
      expect(adapter.isBuildFile("/path/to/my")).toBe(false);
      expect(adapter.isBuildFile("/path/to/my.json")).toBe(false);
    });
  });

  describe("parseBuildXml", () => {
    it("extracts character metadata", async () => {
      const result = await adapter.parseBuildXml(sampleBuildXml);
      expect(result.character).toEqual({
        name: "TestChar",
        level: 95,
        className: "Shadow",
        ascendancyName: "Trickster",
      });
      expect(result.source).toBe("build_xml");
      expect(result.buildXml).toBe(sampleBuildXml);
    });

    it("extracts items", async () => {
      const result = await adapter.parseBuildXml(sampleBuildXml);
      expect(result.items).toHaveLength(2);
      expect(result.items?.[0]).toMatchObject({
        slotName: "Weapon1",
        itemId: 1,
        name: "Exquisite Blade",
        baseType: "Thrusting One Hand Sword",
      });
      expect(result.items?.[1]).toMatchObject({
        slotName: "Body Armour",
        itemId: 2,
        name: "Lightning Coil",
        baseType: "Desert Brigandine",
      });
    });

    it("maps PoB2 ItemSet slots to raw Item blocks", async () => {
      const xml = `
        <PathOfBuilding2>
          <Items activeItemSet="1">
            <Item id="7">
              Rarity: RARE
              Fate Crown
              Kamasan Tiara
              +20 to maximum Life
            </Item>
            <ItemSet id="1">
              <Slot name="Helmet" itemId="7"/>
            </ItemSet>
          </Items>
        </PathOfBuilding2>`;

      const parsed = await adapter.parseBuildXml(xml);

      expect(parsed.items).toEqual([
        expect.objectContaining({
          slotName: "Helmet",
          itemId: 7,
          name: "Fate Crown",
          baseType: "Kamasan Tiara",
          rawText: expect.stringContaining("+20 to maximum Life"),
        }),
      ]);
    });

    it("extracts skill groups", async () => {
      const result = await adapter.parseBuildXml(sampleBuildXml);
      expect(result.skillGroups).toHaveLength(2);
      expect(result.skillGroups?.[0]).toMatchObject({
        groupId: 1,
        label: "Skill1",
        skills: ["Lightning Strike", "Added Lightning Damage"],
      });
      expect(result.skillGroups?.[1]).toMatchObject({
        groupId: 2,
        label: "Skill2",
        skills: ["Whirling Blades"],
      });
    });

    it("extracts passive and ascendancy nodes", async () => {
      const result = await adapter.parseBuildXml(sampleBuildXml);
      expect(result.passiveNodes).toEqual([1, 2, 3, 4, 5]);
      expect(result.ascendNodes).toEqual([10, 11]);
    });

    it("extracts jewel sockets", async () => {
      const result = await adapter.parseBuildXml(sampleBuildXml);
      expect(result.jewels).toHaveLength(2);
      expect(result.jewels?.[0]).toMatchObject({
        slotName: "20",
        itemId: 1,
        passiveNodes: [20],
      });
    });

    it("handles empty XML gracefully", async () => {
      const result = await adapter.parseBuildXml("<PathOfBuilding></PathOfBuilding>");
      expect(result.character).toEqual({
        name: undefined,
        level: undefined,
        className: undefined,
        ascendancyName: undefined,
      });
      expect(result.items).toEqual([]);
      expect(result.skillGroups).toEqual([]);
      expect(result.passiveNodes).toEqual([]);
      expect(result.ascendNodes).toEqual([]);
      expect(result.jewels).toEqual([]);
    });
  });
});
