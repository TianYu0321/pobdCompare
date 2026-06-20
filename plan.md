# P3/MVP 收尾与后续路线

> 更新日期：2026-06-20

## 已完成的工程阶段

1. PoB2 baseline、mutation、breakdown 和一击线提取。
2. Fastify 本地 API、作业状态和 SSE。
3. `.build/.xml` 与 poe.ninja 导入。
4. WeGame Profile API、MappingCatalog、原生 PoB2 转换桥和严格阻断。
5. 双 BD/单 BD 工作台。
6. 装备 Variant、连续 revision、undo/redo/reset。
7. 三类天赋收益榜及 revision 后刷新。
8. 真实 XML 浏览器 E2E 和运行时稳定性修复。

## 发布前证据任务

1. 已于 2026-06-20 开启 `POB2_INTEGRATION=1`，原生 WeGame bridge 集成测试 1/1 通过。
2. 已于 2026-06-20 保存真实 WeGame 分享链接验收记录：`calculable`、round-trip、双 BD 对比和三类天赋榜通过。
3. 保存一条真实 poe.ninja 角色链接的端到端验收记录。
4. 对 1280×720 再做一次布局回归。
5. 如需团队共享，将本地 `main` 推送到远端；当前不自动执行 push。

## P3.5/P4

- 游戏级完整天赋树。
- 装备词条编辑。
- 技能等级、品质和辅助宝石编辑。
- 天赋与珠宝编辑。
- 更完整的 breakdown 辅助抽屉。

所有后续编辑能力必须复用现有 Variant、mutation、revision 和 PoB2 validation 架构。
