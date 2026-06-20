# PoE2 双 BD 可计算工作台 P3/MVP 规格

版本：2026-06-20

## 1. 产品定义

P3/MVP 是本地 Web 双 BD 可计算工作台，不是调试面板，也不是报告页。

- 正式输入：PoB2 `.build/.xml`、WeGame 分享链接、poe.ninja 角色链接。
- 三种来源只有经本地 PoB2 加载并生成 baseline 后，才可标记为 `calculable`。
- 所有 DPS、一击线、装备替换收益、天赋收益和兼容性均来自 PoB2 重算。
- WeGame `DimensionEvaluation` 不进入产品模型。
- 不做 BD、装备、防御或综合评分。

## 2. 数据接入

### PoB2 文件

- 支持 `<Spec nodes="">`。
- 支持 passive-tree URL query 中的 `nodes` 与 `ascendNodes`。
- 解析 `<Item>` 原始文本和 `<ItemSet><Slot>` 槽位绑定。
- XML 实体必须正确解码。

### poe.ninja

- 从角色 URL 解析 league、account 和 character name。
- 动态发现 snapshot version，不硬编码版本。
- 调用 `/poe2/api/builds/{version}/character`。
- 只使用响应中的 `pathOfBuildingExport` 导入 PoB2。

### WeGame

严格转换链：

```text
WeGame API
→ 中文原始数据
→ 版本化双语 MappingCatalog
→ PoB2 官方角色数据结构
→ PoB2 原生 ImportTab
→ SaveDB
→ 全新 Build reload
→ PoB2 baseline
→ calculable
```

约束：

- 支持 hash、query、path 三种分享 URL。
- MappingCatalog hash 包含 PoB2 版本、核心数据校验和、交易目录和转换器版本。
- 只接受 `exact_id`、`exact_asset`、`exact_template_hash`、`versioned_override`。
- 禁止 fuzzy match，禁止手写假 Build XML 冒充 PoB2 结果。
- 任一计算相关字段未精确映射时保持 `normalized`，并展示 blocker。
- 新版目录刷新失败时返回 `catalog_refresh_failed`，不使用旧目录强行转换。

## 3. 本地 API

- `POST /api/imports`
- `GET /api/imports/:id`
- `POST /api/comparisons`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `GET /api/workspaces/:id`
- `GET /api/workspaces/:id/gear-candidates`
- `POST /api/workspaces/:id/gear-swaps`
- `POST /api/workspaces/:id/undo`
- `POST /api/workspaces/:id/redo`
- `POST /api/workspaces/:id/reset`

导入、对比和 mutation 为异步作业。SSE 使用真实阶段：

```text
refresh_mapping_catalog
map_wegame_metadata
validate_pob2_import
read_build_a
read_build_b
select_main_skill
compute_baselines
compute_static_diff
simulate_gear
simulate_passives
extract_breakdown
finalize
```

## 4. Variant 规则

- A/B baseline 永久不可变。
- 每次应用装备创建带 `parentRevisionId` 的临时 revision。
- 新 revision 截断 cursor 后的 redo 分支。
- 支持 undo、redo、reset。
- 连续换装后重新计算当前摘要、Diff Rail、装备 badge 和天赋榜。
- `incompatible`、`invalid_variant`、`calc_failed` 保持独立状态。
- 不兼容结果不得显示为普通 `DPS -100%`。

## 5. P3 工作台 UI

### 布局

- 双 BD：`Build A 42% / Diff Rail 16% / Build B 42%`。
- 单 BD：已导入侧占主区域，另一侧为 280px 轻量 dropzone。
- Build A/B 严格镜像。
- 固定 Tab：`[装备] [技能] [天赋]`。

### Diff Rail

- 分析前、分析中、分析后始终有内容。
- 展示当前对比技能、DPS、Average Hit、物理/元素一击线和关键差异。
- 支持攻击端/防御端切换。
- 主技能未对齐时要求用户明确选择。

### 装备

- 使用固定角色装备槽位，不使用卡片瀑布流。
- 槽位只显示图标、名称、基底/稀有度、DPS Δ 和一击线 Δ。
- 完整词条、双方差异、PoB2 替换收益和应用动作进入侧边抽屉。
- 候选先按槽位和 item class 过滤，最终兼容性只认 PoB2 mutation。

### 技能

- 展示技能组、主技能、等级、品质、启用状态、武器组、DPS 和辅助宝石。
- 双 BD 按 canonical skill ID 配对。

### 天赋

P3 只交付：

- 下一点收益榜。
- 路径包收益榜。
- 移除损失榜。

`pathAutoFilled` 表示路径包收益，按实际点数计算每点收益。

`cascadeRemoved` 表示级联总损失，不解释为单点独立贡献。

没有游戏级背景、真实坐标、连线、图标、pan/zoom 和 tooltip 时，不展示散点天赋树。完整天赋树后置到 P3.5/P4。

## 6. 验收

- 构建与普通测试全绿；真实 PoB2 集成测试由环境变量显式开启。
- `.build/.xml`、WeGame、poe.ninja 各至少保留一条端到端可计算样本。
- 浏览器覆盖单/双 BD、连续换装、undo/redo/reset、三类天赋榜和攻防切换。
- 视觉基准为 1440×900，最低支持 1280×720。
- 每个收益数字可追溯到 baseline hash、revision、mutation 和 PoB2 output。
- partial failure 不清空已完成结果，旧 revision 的异步结果不得污染当前视图。

## 7. 后置能力

- 装备词条编辑。
- 技能等级、品质和辅助宝石编辑。
- 天赋与珠宝编辑。
- 游戏级完整天赋树。

这些能力统一复用本期 Variant、mutation 和 PoB2 validation 架构。
