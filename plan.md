# P1.5a 后续计划

## 目标
P1.5a 对称验证已通过（3 个 build，100% 成功率）。接下来需要：
1. 修复 Gear Swap 始终为 0 的问题
2. 扩展验证覆盖更多 build
3. 性能优化（Worker 复用状态）
4. 清理 Lua stdout 污染

## 阶段 1：调查与并行修复（当前）

### 任务 A：Gear Swap 修复
- 问题：`generateGearSwapCandidates([], baseline)` 第一个参数传了空数组，且 Lua 返回的 `itemSlots` 全是 `empty`
- 需要：从 `.build` 文件/导入中正确读取装备 XML，或从 PoB2 的 items 数据中提取实际装备信息
- 关键文件：`baseline.lua`（items 读取逻辑）、`mutation_gear_swap.lua`、`BuildXmlAdapter`（装备解析）

### 任务 B：Worker 性能优化
- 问题：每个 mutation 都要重新启动 Python 进程（加载 tree/uniques/rares 约 30-40s）
- 方案：Worker 复用状态，只在 pool 初始化时加载一次，mutations 间不复位
- 关键文件：`driver.py`（状态加载）、`bridge.ts`（worker 生命周期）、`worker-pool.ts`

### 任务 C：Lua stdout 清理
- 问题：`ConPrintf("missing node "..otherId)` 在 `PassiveTree.lua` 中输出大量污染日志
- 方案：在 `driver.py` 的 Lua 脚本中设置 `ConPrintf = function() end`，或修改 `PassiveTree.lua`

## 阶段 2：扩展验证
- 在修复后逐步扩展到 10/20/74 个 build
- 调整 batch size 和 timeout 以支持更多 build

## 输出
- 修复后的 `baseline.lua`、`mutation_gear_swap.lua`、`driver.py`、`bridge.ts` 等
- 扩展后的 P1.5a 测试报告
