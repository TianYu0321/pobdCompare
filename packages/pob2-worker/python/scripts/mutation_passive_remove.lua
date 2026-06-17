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

-- Apply passive_remove mutation
local nodeId = _mutation_payload and _mutation_payload.targetNodeId
local node = nodeId and build.spec.nodes[nodeId]

if not node then
    return toJSON({success = false, error = "Node not found: " .. tostring(nodeId)})
end

local beforeAlloc = {}
for id, _ in pairs(build.spec.allocNodes) do beforeAlloc[id] = true end

build.spec:DeallocNode(node)

local afterAlloc = {}
for id, _ in pairs(build.spec.allocNodes) do afterAlloc[id] = true end

local removedIds = {}
for id, _ in pairs(beforeAlloc) do
    if not afterAlloc[id] then table.insert(removedIds, id) end
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
