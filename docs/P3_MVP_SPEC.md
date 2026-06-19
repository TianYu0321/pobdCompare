# PoE2 双 BD 可计算工作台 P3/MVP 规格

版本：2026-06-19

## 产品范围

P3/MVP 是本地 Web 双 BD 可计算工作台，不是调试面板或报告页。

- 输入：PoB2 `.build/.xml`、WeGame 分享链接、poe.ninja 角色链接。
- `.build/.xml` 与 poe.ninja 的 `pathOfBuildingExport` 必须经过本地 PoB2 加载和 baseline 计算，才可标记为 `calculable`。
- WeGame 属于 MVP 正式输入。当前数据可规范化展示；只有 metadata ID、装备、技能、词条与天赋映射完整并通过 PoB2 加载验证后，才开放模拟。
- 产品模型不接入 WeGame `DimensionEvaluation` 评分。
- 所有 DPS、一击线、装备替换收益、天赋收益和兼容性均来自 PoB2 mutation 重算。

## 工作台 UI

- 双 BD：`Build A 42% / Diff Rail 16% / Build B 42%`。
- 单 BD：已导入侧占主区域，另一侧为 280px 轻量 dropzone。
- Build A/B 面板严格镜像，固定 Tab 为 `[装备] [技能] [天赋]`。
- 装备按角色槽位排列；完整词条和替换动作位于侧边抽屉。
- Diff Rail 始终呈现等待、进度或结果，并支持攻击端/防御端切换。
- 不展示未达到游戏级视觉标准的完整天赋树或 raw node 散点图。

## 数据接入

### PoB2 文件

支持：

- XML 中 `<Spec nodes="">`。
- passive-tree URL query 中的 `nodes` / `ascendNodes`。
- PoB2 的 `<Item>` 原始文本与 `<ItemSet><Slot>` 槽位绑定。

### poe.ninja

- 从角色 URL 解析 league、account、character name。
- 从页面状态发现 snapshot version，不硬编码版本。
- 调用页面实际使用的 `/poe2/api/builds/{version}/character`。
- 只使用返回的 `pathOfBuildingExport` 导入 PoB2。

### WeGame

- 支持 hash、path、query 三种分享 URL。
- 接入 Profile API 的角色、装备、技能、DPS、天赋、面板和珠宝数据。
- 未完成稳定 metadata 映射时状态为 `normalized`，禁止用假 XML 或前端估算冒充 PoB2 结果。

## 本地 API

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

导入、对比和 mutation 为异步作业。SSE 事件使用真实阶段枚举，不伪造计时进度。

## Variant 规则

- A/B baseline 永久不可变。
- 每次装备替换生成带 `parentRevisionId` 的临时 revision。
- 新 revision 会截断当前 cursor 之后的 redo 分支。
- 支持 undo、redo、reset。
- `incompatible`、`invalid_variant`、`calc_failed` 保持独立状态。
- 不兼容替换的 DPS delta 固定为 0，并展示兼容性原因，不显示为普通 `-100%`。

## 天赋收益榜

P3 交付：

- 下一点收益榜。
- 路径包收益榜。
- 移除损失榜。

PoB2 worker 返回实际新增和移除节点：

- `pathAutoFilled` 表示自动补路径，按实际点数计算每点收益。
- `cascadeRemoved` 表示级联移除，展示级联节点数和总损失。

完整天赋树 UI 后置到 P3.5/P4。

## 后置能力

- 装备词条编辑。
- 技能等级、品质和辅助宝石编辑。
- 天赋与珠宝编辑。
- 游戏级完整天赋树。

这些能力必须复用本期 Variant、mutation 和 PoB2 validation 架构。
