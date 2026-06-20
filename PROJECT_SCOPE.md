# PoE2 BD 差异比较工具：项目范围

> 修订日期：2026-06-20

## MVP 必须包含

- `.build/.xml`、WeGame URL、poe.ninja URL 三类输入。
- 三类输入经本地 PoB2 验证后生成可计算 baseline。
- 双 BD 游戏化工作台和单 BD 分析模式。
- 固定装备槽位、技能组和三类天赋收益榜。
- PoB2 装备替换 Variant。
- 连续换装及 undo、redo、reset。
- DPS、Average Hit、物理/元素一击线和基础防御面板。
- 精确映射失败时明确阻断，不输出假收益。
- SSE 真实进度、partial failure 和 revision 隔离。

## MVP 不包含

- 市场价格、交易推荐和性价比。
- BD、装备、防御或综合评分。
- 报告页作为主界面。
- 完整天赋树 UI。
- 装备词条编辑。
- 技能等级、品质和辅助编辑。
- 天赋与珠宝编辑。

## 核心不变量

1. PoB2 是唯一计算内核。
2. 前端与 Agent 不手算 DPS 或一击线。
3. baseline 永久不可变，用户操作生成 Variant revision。
4. `incompatible`、`invalid_variant`、`calc_failed` 不得折叠为普通负收益。
5. `pathAutoFilled` 是路径包收益。
6. `cascadeRemoved` 是级联总损失。
7. WeGame 映射只允许精确证据，不允许模糊翻译。
8. 所有关键数字必须能追溯到 PoB2 output 与 revision。

详细规格见 [docs/P3_MVP_SPEC.md](docs/P3_MVP_SPEC.md)。
