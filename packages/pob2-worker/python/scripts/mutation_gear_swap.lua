dofile("HeadlessWrapper.lua")
if mainObject == nil and launch ~= nil then mainObject = launch end

newBuild()
runCallback("OnFrame")

loadBuildFromXML(_build_xml, "request")
runCallback("OnFrame")

build.calcsTab.input.skill_number = _skill_number
build.itemsTab.activeItemSet.useSecondWeaponSet = (_weapon_set == 2)
runCallback("OnFrame")

if _config then
    for k, v in pairs(_config) do
        build.configTab.input[k] = v
    end
    runCallback("OnFrame")
end

-- Apply gear_swap mutation
local slotName = _mutation_payload and _mutation_payload.slotName
local itemRaw = _mutation_payload and _mutation_payload.itemRaw

local slot = slotName and build.itemsTab.slots[slotName]
if not slot then
    return toJSON({success = false, error = "Slot not found: " .. tostring(slotName)})
end

local oldItemId = slot.selItemId

if itemRaw then
    local ok = pcall(function()
        build.itemsTab:CreateDisplayItemFromRaw(itemRaw)
        build.itemsTab:AddDisplayItem()
    end)
    if not ok then
        return toJSON({success = false, error = "Failed to create item from raw text"})
    end

    -- Find new item by matching raw text fragment
    local newItemId = nil
    for id, item in pairs(build.itemsTab.items) do
        if item.name and itemRaw:find(item.name) then
            newItemId = id
            break
        end
    end
    if not newItemId then
        return toJSON({success = false, error = "Could not find newly created item"})
    end
    slot.selItemId = newItemId
else
    local itemId = _mutation_payload and _mutation_payload.itemId
    if itemId then
        slot.selItemId = itemId
    else
        return toJSON({success = false, error = "No itemRaw or itemId provided"})
    end
end

runCallback("OnFrame")
build.calcsTab:BuildOutput()
runCallback("OnFrame")

-- Capture result
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

if build.itemsTab and build.itemsTab.slots then
    for sn, sl in pairs(build.itemsTab.slots) do
        if sl.selItemId and sl.selItemId ~= 0 then
            local item = build.itemsTab.items[sl.selItemId]
            table.insert(result.itemSlots, {
                slotName = sn,
                itemId = sl.selItemId,
                name = item and item.name or "unknown",
                baseType = item and item.base and item.base.type or "unknown",
            })
        else
            table.insert(result.itemSlots, {
                slotName = sn,
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

-- Save variant XML for downstream use
local variantOk, variantXml = pcall(function() return build:SaveDB("variant") end)
if variantOk then result.variantXml = variantXml end

return toJSON(result)
