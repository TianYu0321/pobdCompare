# PoE2 双 BD 可计算工作台：项目状态

> 最后更新：2026-06-20
>
> 分支：`main`
>
> 当前提交：`4dab0b9 fix: close real runtime and browser E2E gaps`

## 当前结论

P3/MVP 的本地 Web 工作台、PoB2 baseline、装备 Variant、天赋收益榜和双 BD 浏览器链路已经实现。产品主界面已经从调试面板改为游戏化双 BD 工作台，完整天赋树 UI 已退出 P3。

截至本次文档更新前的最近一次完整验证：

- `npm run build`：通过。
- `npm test`：381 项通过，1 项因 `POB2_INTEGRATION` 未开启而跳过。
- `POB2_INTEGRATION=1` 原生 WeGame bridge：1 项通过。
- 真实 PoB2 XML 浏览器 E2E：通过。
- 当前真实 WeGame 分享链接：导入、PoB2 round-trip、双 BD 对比和天赋榜通过。
- 双 BD、单 BD、装备替换、undo/redo/reset、三类天赋榜：已在 1440×900 浏览器中验证。

## 已实现

### 数据接入与计算

- `.build/.xml` 导入，经本地 PoB2 加载并生成 baseline。
- poe.ninja 角色 URL 解析、动态 snapshot 发现和 `pathOfBuildingExport` 导入。
- WeGame Profile API 接入。
- WeGame 版本化精确映射目录：
  - PoB2 manifest、Gems、Bases、Mods、TreeData 参与 hash。
  - 中英文交易目录配对。
  - 基底、暗金、技能、辅助、词条、珠宝和天赋的精确映射及版本化 override。
  - 未映射内容阻断计算，不做 fuzzy match。
- WeGame → PoB2 原生导入桥：
  - `ImportItemsAndSkills`。
  - `ImportPassiveTreeAndJewels`。
  - SaveDB 后用全新 Build reload。
  - round-trip、baseline、主技能验证。
- PoB2 路径优先使用开发目录，回退安装目录；版本从 `manifest.xml` 读取。
- PoB2 输出中的 DPS、Average Hit、物理/元素一击线和防御面板进入 baseline。

### 本地 API

- 导入、对比、作业查询和 SSE 增量事件。
- Workspace 装备候选、换装、undo、redo、reset。
- baseline 与 Variant revision 分离；A/B baseline 永久不可变。
- 新 revision 会刷新摘要、Diff Rail、装备 badge 和天赋收益榜。
- `incompatible`、`invalid_variant`、`calc_failed` 为独立状态，不伪装成普通负收益。

### P3 前端

- 顶部 A/B 文件与 URL 输入。
- 双 BD：`42% / 16% / 42%` 三栏。
- 单 BD：主 Build 面板加轻量第二套 BD dropzone。
- Diff Rail 覆盖等待、真实进度和结果状态。
- A/B 面板镜像，固定为装备、技能、天赋三个 Tab。
- 固定角色装备槽位布局和装备详情抽屉。
- 候选装备应用、undo、redo、reset。
- 三类天赋收益榜：
  - 下一点收益榜。
  - 路径包收益榜。
  - 移除损失榜。
- `pathAutoFilled` 与 `cascadeRemoved` 使用正确产品口径。
- 攻击端/防御端切换。
- 不做评分，不以报告页作为主界面。

## 已验证的真实样本

### PoB2 XML

使用 `test_pob_raw.xml` 在本地 PoB2 和浏览器中完成：

- 导入状态为 `calculable`。
- 角色：Lv95 Monk / Martial Artist。
- 主技能：Hollow Focus。
- PoB2 baseline：DPS 38.4，物理一击线 4516，元素一击线 6948。
- A/B 同构筑对比完成。
- 三类天赋榜返回并展示。
- 装备详情、应用候选、Variant 创建、undo、redo 可用。
- 单 BD 模式无大片空白。

### WeGame

使用 2026-06-20 抓取并保存于 `wegame_probe.json` 的真实分享角色完成：

- 角色：Lv96 Martial Artist「不逢时初生铁」。
- 映射：装备 16/16、技能条目 53/53、词条 99/99、天赋 104/104，blocker 0。
- PoB2 round-trip、baseline 和主技能验证均通过。
- 主技能：Spear Throw。
- PoB2 baseline：DPS 2572.8258，Average Hit 556.8101，物理一击线 5805，元素一击线 9085。
- 连续导入 3 次的 baseline hash 与数值一致。
- 同构筑 A/B 对比完成；下一点 5、路径包 6、移除损失 6，失败 0。
- 修复了 WeGame calculable 结果技能组为空，以及 baseline 返回 113 个内部空槽的问题。

## 尚未取得的验收证据

以下不是“代码不存在”，而是发布前仍应补齐的真实样本证据：

1. 用当前真实 poe.ninja 角色链接完成同等级端到端验证。
2. 使用两套不同的真实构筑完成一次非同源装备替换；当前 WeGame 验收使用同一构筑 A/B，因此没有适用的异侧候选。
3. 对后续 PoE2/PoB2 新版本持续刷新映射目录；新内容在目录更新前应明确阻断。

## 明确后置

- 装备词条编辑。
- 技能等级、品质、辅助宝石编辑。
- 天赋与珠宝编辑。
- 游戏级完整天赋树。
- BD、装备、防御或综合评分。
- 报告页作为主界面。

后续编辑能力必须复用现有 Variant、mutation 和 PoB2 validation 架构。
