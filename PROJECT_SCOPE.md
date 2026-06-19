# PoE2 BD 差异比较工具 — 修改后项目范围

> 修改日期：2026-06-18
> 原始文档：MVP 详细实现设计方案（第一版"精确实战 DPS 模拟"从"暂不支持的"改为**必须支持的**）

## 修改后的里程碑

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **P1.5a 回归** | 真实 Build 回归测试（baseline + mutation 链路），≥90% 成功率 | ✅ 完成 |
| **M1 WeGame API 探针** | WeGame 分享链接解析，获取角色/装备/技能/DPS/天赋/面板/珠宝 | ⏳ 当前 |
| **M2 NormalizedBuild** | 将 WeGame 原始数据转成统一模型 | ⏳ 依赖 M1 |
| **M3 Diff Engine** | 两个 NormalizedBuild 差异对比（技能链、DPS、武器组、天赋） | ⏳ 依赖 M2 |
| **M4 Rule Engine** | 风险检测（Dance with Death、辅助缺失、版本风险） | ⏳ 依赖 M3 |
| **M5 Agent Report** | 基于结构化 diff 生成自然语言分析报告 | ⏳ 依赖 M4 |
| **M6 版本化知识库** | 接入官方天赋树数据，技能/辅助/天赋/规则 JSON | ⏳ 后续 |
| **M7 前端分析页** | 双 BD 输入 + 结果展示 + Agent 报告 | ⏳ 后续 |

## 已完成交付物

- `pob2-worker` Python ctypes ↔ Lua 桥接（4 worker，状态复用）
- `baseline.lua` / `mutation_passive_add.lua` / `mutation_passive_remove.lua` / `mutation_gear_swap.lua`
- `P1.5a` 回归测试：10 builds × 210 jobs = 100% 成功率，耗时 45.4s

## 当前任务：M1 WeGame API 探针

### 目标
输入 WeGame 分享链接 → 成功获取角色信息、装备、技能、DPS、天赋、面板、珠宝 → 保存原始 JSON → 验证接口稳定性。

### 已知接口（从文档）
- GetRoleInfo
- GetEquipments
- GetSkills
- GetSkillsDps
- GetTalentTree
- GetPanelAttr
- GetJewels
- GetRoleKeyData
- GetRoleSummary
- GetDimensionEvaluation

### 当前状态
`wegame-adapter.ts` 只有框架（placeholder），没有实际 API 调用。

## 下一步
1. 研究 WeGame 分享页的真实 API（接口地址、参数、响应格式）
2. 实现 `fetchWeGameBuild(shareUrl)` 方法
3. 保存原始 JSON
4. 验证接口稳定性
