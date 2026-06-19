function toJSON(obj)
    local t = type(obj)
    if t == "nil" then return "null" end
    if t == "boolean" then return obj and "true" or "false" end
    if t == "number" then return tostring(obj) end
    if t == "string" then
        local s = obj:gsub("\\", "\\\\"):gsub("\"", "\\\"")
        s = s:gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
        return '"' .. s .. '"'
    end
    if t == "table" then
        local isArray = true
        local maxIndex = 0
        for k, _ in pairs(obj) do
            if type(k) ~= "number" or k <= 0 or math.floor(k) ~= k then
                isArray = false
            else
                maxIndex = math.max(maxIndex, k)
            end
        end
        if isArray then
            local parts = {}
            for i = 1, maxIndex do parts[i] = toJSON(obj[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local keys = {}
        for k, _ in pairs(obj) do table.insert(keys, k) end
        table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
        local parts = {}
        for _, k in ipairs(keys) do
            table.insert(parts, toJSON(tostring(k)) .. ":" .. toJSON(obj[k]))
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    return "null"
end

local function selectedItemCount()
    local count = 0
    for _, slot in pairs(build.itemsTab.slots or {}) do
        if slot.selItemId and slot.selItemId ~= 0 and not slot.nodeId then
            count = count + 1
        end
    end
    return count
end

local function storedItemCount()
    local count = 0
    for id, item in pairs((build.itemsTab and build.itemsTab.items) or {}) do
        if type(id) == "number" and id > 0 and item then count = count + 1 end
    end
    return count
end

local function passiveCount()
    local count = 0
    for _, _ in pairs((build.spec and build.spec.allocNodes) or {}) do count = count + 1 end
    return count
end

local function skillCount()
    return #(build.skillsTab and build.skillsTab.socketGroupList or {})
end

local function selectMainSkill()
    local valid = skillCount() > 0
    if valid and _character.mainSkillHint then
        valid = false
        for index, group in ipairs(build.skillsTab.socketGroupList or {}) do
            if group.displayLabel == _character.mainSkillHint
                or group.label == _character.mainSkillHint then
                build.mainSocketGroup = index
                valid = true
            end
            for _, gem in ipairs(group.gemList or {}) do
                if gem.grantedEffect and gem.grantedEffect.name == _character.mainSkillHint
                    or gem.nameSpec == _character.mainSkillHint then
                    build.mainSocketGroup = index
                    valid = true
                    break
                end
            end
            if valid then break end
        end
    end
    if valid then
        build.calcsTab.input.skill_number = build.mainSocketGroup or 1
    end
    return valid
end

newBuild()
runCallback("OnFrame")

local importOk, importError = pcall(function()
    loadBuildFromJSON(_character, _character)
    runCallback("OnFrame")
end)
if not importOk then
    return toJSON({
        success = false,
        error = "PoB2 native WeGame import failed: " .. tostring(importError),
        catalogHash = _catalog_hash,
    })
end

local expectedEquipment = #(_character.equipment or {})
local expectedJewels = #(_character.jewels or {})
local expectedItems = expectedEquipment + expectedJewels
local expectedSkills = #(_character.skills or {})
local expectedPassives = #((_character.passives and _character.passives.hashes) or {})
local preSaveMainSkillValid = selectMainSkill()

local savedOk, savedXml = pcall(function() return build:SaveDB("wegame_import") end)
if not savedOk or not savedXml then
    return toJSON({
        success = false,
        error = "PoB2 SaveDB failed: " .. tostring(savedXml),
        catalogHash = _catalog_hash,
    })
end

local reloadOk, reloadError = pcall(function()
    loadBuildFromXML(savedXml, "wegame_round_trip")
    runCallback("OnFrame")
end)
if not reloadOk then
    return toJSON({
        success = false,
        error = "PoB2 round-trip reload failed: " .. tostring(reloadError),
        catalogHash = _catalog_hash,
    })
end

local selectedItems = selectedItemCount()
local importedItems = storedItemCount()
local importedSkills = skillCount()
local importedPassives = passiveCount()
local passivesValid = true
local missingPassiveIds = {}
for _, nodeId in ipairs((_character.passives and _character.passives.hashes) or {}) do
    if not (build.spec and build.spec.allocNodes and build.spec.allocNodes[nodeId]) then
        passivesValid = false
        table.insert(missingPassiveIds, nodeId)
    end
end
local roundTripValid =
    importedItems == expectedItems and
    selectedItems == expectedEquipment and
    importedSkills >= expectedSkills and
    passivesValid

local mainSkillValid = preSaveMainSkillValid and selectMainSkill()
build.itemsTab.activeItemSet.useSecondWeaponSet = false
runCallback("OnFrame")

local baselineOk, baselineError = pcall(function()
    build.calcsTab:BuildOutput()
    runCallback("OnFrame")
end)
local co = build.calcsTab and build.calcsTab.calcsOutput
local baselineValid = baselineOk and co ~= nil
local selectedSkillNumber = build.mainSocketGroup or 1
local selectedSkillGroup = build.skillsTab and build.skillsTab.socketGroupList
    and build.skillsTab.socketGroupList[selectedSkillNumber]

local result = {
    success = roundTripValid and baselineValid,
    error = nil,
    variantXml = savedXml,
    catalogHash = _catalog_hash,
    calcsOutput = {},
    skillDpsList = {},
    itemSlots = {},
    passiveNodes = {},
    selectedSkillNumber = selectedSkillNumber,
    selectedSkillName = selectedSkillGroup
        and (selectedSkillGroup.displayLabel or selectedSkillGroup.label)
        or nil,
    roundTrip = {
        expectedItems = expectedItems,
        expectedEquipment = expectedEquipment,
        expectedJewels = expectedJewels,
        importedItems = importedItems,
        selectedItems = selectedItems,
        expectedSkills = expectedSkills,
        importedSkills = importedSkills,
        expectedPassives = expectedPassives,
        importedPassives = importedPassives,
        missingPassiveIds = missingPassiveIds,
    },
    pobValidation = {
        roundTripValid = roundTripValid,
        baselineValid = baselineValid,
        mainSkillValid = mainSkillValid,
    },
}

if not roundTripValid then
    result.error = "PoB2 round-trip mismatch"
elseif not baselineValid then
    result.error = "PoB2 baseline failed: " .. tostring(baselineError)
end

if co then
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

if build.skillsTab and build.skillsTab.socketGroupList then
    for i, group in ipairs(build.skillsTab.socketGroupList) do
        table.insert(result.skillDpsList, {
            skillNumber = i,
            name = group.displayLabel or group.label or ("Skill " .. i),
            dps = 0,
            enabled = group.enabled or false,
        })
    end
end

for slotName, slot in pairs((build.itemsTab and build.itemsTab.slots) or {}) do
    if slot.selItemId and slot.selItemId ~= 0 and not slot.nodeId then
        local item = build.itemsTab.items[slot.selItemId]
        table.insert(result.itemSlots, {
            slotName = slotName,
            itemId = slot.selItemId,
            name = item and item.name or "",
            baseType = item and item.baseName or "",
        })
    end
end

for id, _ in pairs((build.spec and build.spec.allocNodes) or {}) do
    table.insert(result.passiveNodes, id)
end
table.sort(result.passiveNodes)

return toJSON(result)
