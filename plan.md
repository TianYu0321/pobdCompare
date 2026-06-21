# P3/MVP 收尾与后续路线

> 更新日期：2026-06-21（第三次） | 本次收尾基线提交：b471678

## 已完成的工程阶段

1. PoB2 baseline、mutation、breakdown 和一击线提取。
2. Fastify 本地 API、作业状态和 SSE。
3. `.build/.xml` 与 poe.ninja 导入。
4. WeGame Profile API、MappingCatalog、原生 PoB2 转换桥和严格阻断。
5. 双 BD/单 BD 工作台。
6. 装备 Variant、连续 revision、undo/redo/reset。
7. 三类天赋收益榜及 revision 后刷新。
8. 真实 XML 浏览器 E2E 和运行时稳定性修复。
9. Lua 空表到 JS 数组的 normalizeArray 安全解码。
10. 跨 Build 装备替换 rawText 权威性验证（worker 集成测试 + BuildXmlAdapter 槽位证明）。
11. revision 并发 CAS 隔离和服务端/前端双层 stale 守卫。
12. ResultComparator 正确区分 incompatible/invalid_variant/calc_failed。
13. 被动收益榜全候选模拟（不下钻模拟，排序后截取 Top 6）。
14. WeGame 装备 rawText 回填（来自 PoB2 SaveDB XML）。
15. Transcendent Limb 严格映射（base name override、exact implicit section matching、Incursion 槽位、NORMAL 解析器修复）。
16. Cache schema v10 + overrideIdentity invalidation（阻止 stale 缓存跳过 modOverrides）。
17. 选中组/gear-swap DPS 协议修复（CombinedDPS 仅赋值给实际计算技能组，解决了 Hollow Focus 全零回归）。

## 最终独立验证证据（2026-06-21）

| 证据项 | 结果 |
|--------|------|
| `npm run build` | PASS |
| `npm test` | **410 passed, 2 skipped** (412 total) |
| `POB2_INTEGRATION=1` worker 套件 | **16/16 passed**（bridge 4、environment 2、lua 8、convert-wegame 1、gear-swap 1） |
| `git diff --check` | PASS（仅 line-ending 警告） |
| 实时 WeGame 导入（最新代码） | id `ef66989c`、`calculable`、blockers []、三项验证 true、itemCount=18、rawTextCount=18、Spear Throw #2 CombinedDPS=2657.82 |
| 跨源装备互换（独立真实 WeGame probe → 独立 XML） | Ring 1 Amethyst Ring 成功，`normal_gain`、DPS 38.40→47.53 |
| 1280×720 布局回归 | PASS |
| poe.ninja fail-closed | ❌ 两个导出端点 404 |

## 当前发布阻断

- **poe.ninja fail-closed**：两个已知 PoB 导出端点均返回 404，poe.ninja 导入无法到达 `calculable`。

## P3.5/P4

- 游戏级完整天赋树。
- 装备词条编辑。
- 技能等级、品质和辅助宝石编辑。
- 天赋与珠宝编辑。
- 更完整的 breakdown 辅助抽屉。

所有后续编辑能力必须复用现有 Variant、mutation、revision 和 PoB2 validation 架构。
