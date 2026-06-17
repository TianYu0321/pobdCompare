dofile("HeadlessWrapper.lua")
if mainObject == nil and launch ~= nil then mainObject = launch end

newBuild()
runCallback("OnFrame")

-- Load build from request XML
loadBuildFromXML(_build_xml, "request")
runCallback("OnFrame")

-- Set skill number and weapon set
build.calcsTab.input.skill_number = _skill_number
build.itemsTab.activeItemSet.useSecondWeaponSet = (_weapon_set == 2)
runCallback("OnFrame")

-- Apply config overrides
if _config then
    for k, v in pairs(_config) do
        build.configTab.input[k] = v
    end
    runCallback("OnFrame")
end

-- Build output
build.calcsTab:BuildOutput()
runCallback("OnFrame")

-- Capture baseline result
local result = {
    success = true,
    calcsOutput = {},
    breakdown = {},
    skillDpsList = {},
    itemSlots = {},
    passiveNodes = {},
}

if build.calcsTab and build.calcsTab.calcsOutput then
    local co = build.calcsTab.calcsOutput
    result.calcsOutput = {
        CombinedDPS = co.CombinedDPS or 0,
        Speed = co.Speed or 0,
        CritChance = co.CritChance or 0,
        CritMultiplier = co.CritMultiplier or 0,
        HitChance = co.HitChance or 0,
        AverageDamage = co.AverageDamage or 0,
        MainHand_AverageHit = (co.MainHand and co.MainHand.AverageHit) or 0,
        Life = co.Life or 0,
        Mana = co.Mana or 0,
        Armour = co.Armour or 0,
    }
end

local env = build.calcsTab and build.calcsTab.calcsEnv
if env and env.player and env.player.breakdown then
    local bd = env.player.breakdown
    result.breakdown = {}
    for k, v in pairs(bd) do
        if type(v) == "number" then
            result.breakdown[k] = v
        elseif type(v) == "table" then
            local snapshot = {}
            for sk, sv in pairs(v) do
                if type(sv) == "number" then snapshot[sk] = sv end
            end
            if next(snapshot) then result.breakdown[k] = snapshot end
        end
    end
end

if build.skillsTab and build.skillsTab.socketGroupList then
    for i, group in ipairs(build.skillsTab.socketGroupList) do
        if group and group.displayLabel then
            table.insert(result.skillDpsList, {
                skillNumber = i,
                name = group.displayLabel,
                dps = 0,
                enabled = group.enabled or false,
            })
        end
    end
end

if build.itemsTab and build.itemsTab.slots then
    for slotName, slot in pairs(build.itemsTab.slots) do
        if slot.selItemId and slot.selItemId ~= 0 then
            local item = build.itemsTab.items[slot.selItemId]
            table.insert(result.itemSlots, {
                slotName = slotName,
                itemId = slot.selItemId,
                name = item and item.name or "unknown",
                baseType = item and item.base and item.base.type or "unknown",
            })
        else
            table.insert(result.itemSlots, {
                slotName = slotName,
                itemId = 0,
                name = "empty",
                baseType = "none",
            })
        end
    end
end

if build.spec and build.spec.allocNodes then
    for id, _ in pairs(build.spec.allocNodes) do
        table.insert(result.passiveNodes, id)
    end
    table.sort(result.passiveNodes)
end

return toJSON(result)
