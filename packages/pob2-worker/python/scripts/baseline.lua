function toJSON(obj)
    local t = type(obj)
    if t == "nil" then return "null" end
    if t == "boolean" then return obj and "true" or "false" end
    if t == "number" then return tostring(obj) end
    if t == "string" then
        local s = obj
        s = s:gsub("\\", "\\\\")
        s = s:gsub("\"", "\\\"")
        s = s:gsub("\n", "\\n")
        s = s:gsub("\r", "\\r")
        s = s:gsub("\t", "\\t")
        return '"' .. s .. '"'
    end
    if t == "table" then
        local isArray = true
        local maxIndex = 0
        for k, v in pairs(obj) do
            if type(k) ~= "number" or k <= 0 or math.floor(k) ~= k then
                isArray = false
            else
                maxIndex = math.max(maxIndex, k)
            end
        end
        if isArray and maxIndex >= 0 then
            local parts = {}
            for i = 1, maxIndex do
                parts[i] = toJSON(obj[i])
            end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local parts = {}
            local keys = {}
            for k, _ in pairs(obj) do table.insert(keys, k) end
            table.sort(keys, function(a, b)
                if type(a) == "number" and type(b) == "number" then return a < b
                elseif type(a) == "number" then return true
                elseif type(b) == "number" then return false
                else return tostring(a) < tostring(b) end
            end)
            for _, k in ipairs(keys) do
                table.insert(parts, toJSON(tostring(k)) .. ":" .. toJSON(obj[k]))
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    return "null"
end

newBuild()
runCallback("OnFrame")

-- Load build from request (XML or JSON)
local buildXml = _build_xml
if buildXml:sub(1,1) == "{" then
    -- JSON format (e.g., PoB2 .build file with passive tree link)
    local json = require("dkjson")
    local data, _, err = json.decode(buildXml)
    if err then
        print("JSON decode error: " .. tostring(err))
    elseif data and data.parts and data.parts[1] and data.parts[1].link then
        local link = data.parts[1].link
        build.spec:DecodeURL(link)
        runCallback("OnFrame")
    else
        print("No link found in JSON build")
    end
else
    -- XML format
    loadBuildFromXML(buildXml, "request")
    runCallback("OnFrame")
end

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

local function weakestElementalMaximumHitTaken(co)
    local min
    if type(co.FireMaximumHitTaken) == "number" and co.FireMaximumHitTaken > 0 then min = co.FireMaximumHitTaken end
    if type(co.ColdMaximumHitTaken) == "number" and co.ColdMaximumHitTaken > 0 then
        if not min or co.ColdMaximumHitTaken < min then min = co.ColdMaximumHitTaken end
    end
    if type(co.LightningMaximumHitTaken) == "number" and co.LightningMaximumHitTaken > 0 then
        if not min or co.LightningMaximumHitTaken < min then min = co.LightningMaximumHitTaken end
    end
    return min
end

local function buildCalcsOutput(co)
    local out = {
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
    if co.PhysicalMaximumHitTaken ~= nil then out.PhysicalMaximumHitTaken = co.PhysicalMaximumHitTaken end
    if co.FireMaximumHitTaken ~= nil then out.FireMaximumHitTaken = co.FireMaximumHitTaken end
    if co.ColdMaximumHitTaken ~= nil then out.ColdMaximumHitTaken = co.ColdMaximumHitTaken end
    if co.LightningMaximumHitTaken ~= nil then out.LightningMaximumHitTaken = co.LightningMaximumHitTaken end
    if co.ChaosMaximumHitTaken ~= nil then out.ChaosMaximumHitTaken = co.ChaosMaximumHitTaken end
    if co.EnergyShield ~= nil then out.EnergyShield = co.EnergyShield end
    if co.Evasion ~= nil then out.Evasion = co.Evasion end
    if co.EffectiveBlockChance ~= nil then out.BlockChance = co.EffectiveBlockChance elseif co.BlockChance ~= nil then out.BlockChance = co.BlockChance end
    if co.FireResist ~= nil then out.FireResist = co.FireResist end
    if co.ColdResist ~= nil then out.ColdResist = co.ColdResist end
    if co.LightningResist ~= nil then out.LightningResist = co.LightningResist end
    if co.ChaosResist ~= nil then out.ChaosResist = co.ChaosResist end
    if co.TotalEHP ~= nil then out.TotalEHP = co.TotalEHP end
    local elem = weakestElementalMaximumHitTaken(co)
    if elem ~= nil then out.ElementalMaximumHitTaken = elem end
    return out
end

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
    result.calcsOutput = buildCalcsOutput(build.calcsTab.calcsOutput)
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
