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
        if isArray and maxIndex > 0 then
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

build.calcsTab.input.skill_number = _skill_number
build.itemsTab.activeItemSet.useSecondWeaponSet = (_weapon_set == 2)
runCallback("OnFrame")

if _config then
    for k, v in pairs(_config) do
        build.configTab.input[k] = v
    end
    runCallback("OnFrame")
end

-- Apply passive_add mutation
local nodeId = _mutation_payload and _mutation_payload.targetNodeId
local node = nodeId and build.spec.nodes[nodeId]

if not node then
    -- Node not in tree.lua; return success with no change (tree.json vs tree.lua mismatch)
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
            PhysicalMaximumHitTaken = co.PhysicalMaximumHitTaken or 0,
            FireMaximumHitTaken = co.FireMaximumHitTaken or 0,
            ColdMaximumHitTaken = co.ColdMaximumHitTaken or 0,
            LightningMaximumHitTaken = co.LightningMaximumHitTaken or 0,
            ChaosMaximumHitTaken = co.ChaosMaximumHitTaken or 0,
            EnergyShield = co.EnergyShield or 0,
            Evasion = co.Evasion or 0,
            BlockChance = co.BlockChance or 0,
            FireResist = co.FireResist or 0,
            ColdResist = co.ColdResist or 0,
            LightningResist = co.LightningResist or 0,
            ChaosResist = co.ChaosResist or 0,
            TotalEHP = co.TotalEHP or 0,
        }
    end
    if build.spec and build.spec.allocNodes then
        for id, _ in pairs(build.spec.allocNodes) do
            table.insert(result.passiveNodes, id)
        end
        table.sort(result.passiveNodes)
    end
    return toJSON(result)
end

local beforeAlloc = {}
for id, _ in pairs(build.spec.allocNodes) do beforeAlloc[id] = true end

build.spec:AllocNode(node, false)

local afterAlloc = {}
for id, _ in pairs(build.spec.allocNodes) do afterAlloc[id] = true end

local addedIds = {}
for id, _ in pairs(afterAlloc) do
    if not beforeAlloc[id] then table.insert(addedIds, id) end
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
    actuallyAddedNodeIds = addedIds,
    pointCost = #addedIds,
    pathAutoFilled = #addedIds > 1,
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
        PhysicalMaximumHitTaken = co.PhysicalMaximumHitTaken or 0,
        FireMaximumHitTaken = co.FireMaximumHitTaken or 0,
        ColdMaximumHitTaken = co.ColdMaximumHitTaken or 0,
        LightningMaximumHitTaken = co.LightningMaximumHitTaken or 0,
        ChaosMaximumHitTaken = co.ChaosMaximumHitTaken or 0,
        EnergyShield = co.EnergyShield or 0,
        Evasion = co.Evasion or 0,
        BlockChance = co.BlockChance or 0,
        FireResist = co.FireResist or 0,
        ColdResist = co.ColdResist or 0,
        LightningResist = co.LightningResist or 0,
        ChaosResist = co.ChaosResist or 0,
        TotalEHP = co.TotalEHP or 0,
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
