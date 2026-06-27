# PoE2 双 BD 可计算工作台：项目状态

> 最后更新：2026-06-21（第三次）
>
> 分支：`main`
>
> 本次收尾基线提交：`b471678 feat: complete PoE2 P3 calculable workbench bridge`

## 当前结论

P3/MVP 的本地 Web 工作台、PoB2 baseline、装备 Variant、天赋收益榜和双 BD 浏览器链路已经实现。产品主界面已经从调试面板改为游戏化双 BD 工作台，完整天赋树 UI 已退出 P3。

独立最终验证（2026-06-21）：
- `npm run build`：**PASS**。
- `npm test`：**410 passed，2 skipped**（412 total，skipped 为仅 `POB2_INTEGRATION=1` 环境运行的 worker 测试）。
- `POB2_INTEGRATION=1 packages/pob2-worker/src`：**16/16 passed**（bridge 4、environment 2、lua contract 8、convert-wegame integration 1、gear-swap integration 1）。
- `git diff --check`：**PASS**（仅 line-ending 警告，无空白错误）。

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
- WeGame → PoB2 原生导入桥：`ImportItemsAndSkills`、`ImportPassiveTreeAndJewels`、SaveDB 后用全新 Build reload、round-trip/baseline/主技能验证。
- PoB2 路径优先使用开发目录，回退安装目录；版本从 `manifest.xml` 读取。
- PoB2 输出中的 DPS、Average Hit、物理/元素一击线和防御面板进入 baseline。
- Transcendent Limb 严格映射：`闪避之腿` → `Evasive Leg`、`偏转之臂` → `Deflective Arm`；exact implicit section matching（`implicit:闪避值提高 #%` → `#% increased Evasion Rating` 等）。
- Incursion 槽位映射：`IncursionArmRight` → `Arm 1`、`IncursionLegRight` → `Leg 1` 等。
- Cache schema v10 + overrideIdentity invalidation，阻止 stale 缓存跳过 modOverrides。
- NORMAL item 解析器：正确提取 name/baseType 而非使用 `Unique ID` 作为 baseType。
- 选中组/gear-swap DPS 协议：CombinedDPS 仅赋值给实际计算的 `_skill_number`/选中组，gear-swap skillDpsList 正确填充。

### 本地 API

- 导入、对比、作业查询和 SSE 增量事件。
- Workspace 装备候选、换装、undo、redo、reset。
- baseline 与 Variant revision 分离；A/B baseline 永久不可变。
- 新 revision 会刷新摘要、Diff Rail、装备 badge 和天赋收益榜。
- `incompatible`、`invalid_variant`、`calc_failed` 为独立状态。

### P3 前端

- 顶部 A/B 文件与 URL 输入；双 BD `42% / 16% / 42%` 三栏；单 BD 主 Build 面板加轻量第二套 BD dropzone。
- Diff Rail 覆盖等待、真实进度和结果状态。
- A/B 面板镜像，固定为装备、技能、天赋三个 Tab；固定角色装备槽位布局和装备详情抽屉。
- 候选装备应用、undo、redo、reset。
- 三类天赋收益榜（下一点、路径包、移除损失）、`pathAutoFilled`/`cascadeRemoved` 正确口径、攻击端/防御端切换。
- 不做评分，不以报告页作为主界面。
- 1280×720 布局回归通过（空状态无溢出；结果状态三栏 535/210/535，左右面板独立 overflow-y:auto，Diff Rail 完全可见）。

## 已验证的真实样本

### PoB2 XML（test_pob_raw.xml）

- 导入 `calculable`，角色 Lv95 Monk / Martial Artist，主技能 Hollow Focus，DPS 38.4。
- A/B 对比通过（A = Skull Edge/Soaring Spear 38.4；B = Atziri's Contempt/Pronged Spear 61.8，+60.9%）。
- 三类天赋榜返回并展示，failures=0。

### WeGame — 独立最终验证（2026-06-21）

使用当前构建代码和已保存的实时 WeGame 分享数据一键导入：

- 角色：Lv96 Martial Artist「不逢时初生铁」。
- 导入 ID：**`ef66989c-a878-449f-83e6-4954e7684c0c`**。
- 状态：`calculable`，报告 `complete`，**blockers []**。
- 验证三项：`roundTripValid=true`、`baselineValid=true`、`mainSkillValid=true`。
- itemCount=18，rawTextCount=18。
- 主技能：Spear Throw #2，CombinedDPS=**2657.8212391027**，无选择警告。选中 #2 的 skillDpsList 条目标有该 DPS；未计算组 dps=0（design）。
- Arm 1 Deflective Arm 和 Leg 1 Evasive Leg 名称/baseType 正确，explicit/implicit raw text 准确。
- 历史 2026-06-20 Spear Throw 2572.8258 保持独立历史记录。

### 跨源装备互换 — 独立真实构筑证明

使用已保存的 WeGame probe（离线重建，经当前严格映射和 PoB2 桥）和独立的 `test_pob_raw.xml` 完成跨源同槽位互换：

- WeGame probe baseline hash：`ea0ff0164bf4fa11245d83878ba2c7ef97c41b21f8e9432dc310651e952dd078`。
- 目标 XML baseline hash：`7a4b63ab5d06afa9afa4216e144ff11dba1abaa2d0447a04e138affa425be177`，DPS 38.39756097561。
- 互换：WeGame Ring 1 / Amethyst Ring → XML 目标 Ring 1。
- 结果：`resultKind=normal_gain`，`mainSkillStillValid=true`，无警告，互换后 DPS=47.529268292683。
- 这是两个独立真实来源（已保存的 WeGame 角色数据和独立的 PoB2 XML），不是同一 XML 的派生 A/B 证明。**独立真实构筑跨侧装备互换证据缺口已完成**。该离线 probe 的 DPS（881.15808383691）与上述实时新鲜导入的 2657.82 出自不同时间戳，不作合并或对比。

### 后续回归与修复

#### Hollow Focus 73.4156 / 全部 skillDpsList 为零（已修复）

此问题为已确认的桥接协议 bug：Lua 硬编码/忽略选中技能 DPS，导致首选 #2 被拒绝而使用首个可用 #1。修复方案：将 CombinedDPS 仅赋值给实际计算的 `_skill_number`/选中组，并正确填充 gear-swap skillDpsList。最终验证中 Spear Throw #2 CombinedDPS=2657.82 且无警告，证实已修复。不保留未解决/推测性的根源分析章节。

#### 映射阻断 → calculable

最初 2026-06-21 重检因 `闪避之腿`/`偏转之臂` unknown_item 阻断（未产出 baseline）。映射修复（base name override、explicit/implicit 模板、Incursion 槽位、cache v10）后一键导入通过。

## 当前发布阻断

### poe.ninja fail-closed

poe.ninja 页面可访问、snapshot discovery 正常，但 `/poe2/api/builds/{version}/character` 和 `/poe2/pob/raw/overview/code` 均返回 **HTTP 404**，poe.ninja 导入无法到达 `calculable`。P3/MVP 关于 poe.ninja 输入的验收未通过。待 poe.ninja 恢复导出 API 后重新启用，或通过其他数据源获取。

## 剩余缺口

1. ❌ poe.ninja fail-closed：两个导出端点均 404，无法到达 calculable。
2. 对后续 PoE2/PoB2 新版本持续刷新映射目录；新内容在目录更新前应明确阻断。

## 明确后置

- 装备词条编辑、技能等级/品质/辅助宝石编辑、天赋与珠宝编辑、游戏级完整天赋树、BD/装备/防御/综合评分、报告页作为主界面。

后续编辑能力必须复用现有 Variant、mutation 和 PoB2 validation 架构。

## 快速启动

双击根目录 `启动工作台.cmd`，或手动执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-workbench.ps1
```

行为：
- API (8787) 与 Web (4173) 都已监听 → 直接打开 http://127.0.0.1:4173
- 两端口都空闲 → 自动执行 `npm run dev`（新窗口），等待就绪后打开浏览器
- 仅一个端口在线 → 报错（退出码 1），需手动关闭已有终端窗口后重试
- Node.js/npm 缺失 → 报错（退出码 2）

选项：
- `-NoBrowser`：启动服务但不打开浏览器
- `-DryRun`：仅打印计划，不执行任何实际操作

测试：
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-workbench.test.ps1
```
单元测试使用依赖注入，100% 无副作用，不会启动服务或打开浏览器。
