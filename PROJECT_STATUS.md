# PoE2 BD 差异比较工具 — 项目完成状态

> 最后更新：2026-06-18 上午
> 位置：`D:\pobdCompare`

## 总体完成度

| 阶段 | 状态 | 完成度 |
|---|---|---|
| 阶段 1：工程骨架 | ✅ 完成 | 100% |
| 阶段 2：P1.5a 真实 Build 回归 | ⏳ 等待用户 build 文件 | 0% |

## 各模块完成状态

### 1. Schemas (`packages/schemas`)
- ✅ `baseline.ts` — BaselineSnapshot、BaselineHashPayload、SkillDpsInfo、ItemInfo、JewelInfo 等
- ✅ `mutation.ts` — BuildMutation、MutationType、所有 Payload 类型
- ✅ `variant.ts` — BuildVariant、VariantValidation、CalcValidation、CompatibilityResult
- ✅ `simulation.ts` — SimulationResult、OutputDiff、HitLineDelta、EvidenceRef
- ✅ `comparator.ts` — GearSwapResult、ComparatorOutput
- ✅ `breakdown.ts` — NormalizedBreakdown、BreakdownDiffGroup、FormulaRole
- ✅ `agent.ts` — ConversionReport、UnknownMod、UnmappedNode 等
- ✅ `cache.ts` — SimulationJob、SimulationBatch、FailedJobReport、CacheEntry
- ✅ `index.ts` — 全量导出 + 组合类型（FullBaselineSnapshot、FullBuildVariant 等）
- ✅ Zod 验证：所有类型均有 Zod Schema 定义
- **验证**：`tsc --build` 编译通过

### 2. PoB2 Worker (`packages/pob2-worker`)
- ✅ `protocol.ts` — Pob2WorkerRequest、Pob2WorkerResponse、WorkerPoolConfig、WorkerState
- ✅ `bridge.ts` — Pob2Bridge 类：spawn Python 子进程、stdin/stdout JSON 通信、超时控制、错误处理
- ✅ `worker-pool.ts` — Pob2WorkerPool 类：管理多 Worker（默认 4 个）、工作分配、崩溃恢复、队列调度
- ✅ `python/driver.py` — Python 入口：读取 stdin JSON、加载 lua51.dll、动态生成 Lua 脚本、执行并输出 JSON
- ✅ `python/scripts/baseline.lua` — 基准线 Lua 模板
- ✅ `python/scripts/mutation_passive_add.lua` — 被动加点 Lua 模板
- ✅ `python/scripts/mutation_passive_remove.lua` — 被动减点 Lua 模板
- ✅ `python/scripts/mutation_gear_swap.lua` — 装备替换 Lua 模板
- **验证**：`tsc --build` 编译通过

### 3. Core Engine (`packages/core`)
- ✅ `baseline/baseline-manager.ts` — BaselineManager：创建 baseline、SHA256 哈希、缓存读写
- ✅ `variant/variant-generator.ts` — VariantGenerator：生成 variant、调用 Worker、验证前后状态
- ✅ `mutation/mutation-applier.ts` — MutationFactory：createXxxMutation 工厂 + generateXxxCandidates 候选生成
- ✅ `comparator/result-comparator.ts` — ResultComparator：baseline vs variant 对比、resultKind 判定、outputDiff 构建、hitLineDelta 计算
- ✅ `analyzer/passive-marginal-analyzer.ts` — PassiveMarginalAnalyzer：生成所有 passive_add/remove 候选，批量分析，top gains/losses
- ✅ `analyzer/gear-swap-analyzer.ts` — GearSwapAnalyzer：生成所有 gear_swap 候选，兼容性检查，批量分析
- ✅ `jobqueue/job-queue.ts` — JobQueue：批量入队、WorkerPool 并行调度、超时重试、失败隔离、进度追踪
- **验证**：`tsc --build` 编译通过

### 4. Adapters (`packages/adapters`)
- ✅ `build-xml/build-xml-adapter.ts` — BuildXmlAdapter：读取 .build/.xml 文件，轻量解析元数据
- ✅ `wegame/wegame-adapter.ts` — WeGameAdapter：解析链接、数据转换框架、错误降级处理
- ✅ `wegame/conversion-report.ts` — ConversionReport 构建工具
- **验证**：`tsc --build` 编译通过

### 5. CLI (`apps/cli`)
- ⏳ `index.ts` — 占位代码，需替换为完整 Commander.js CLI
- ⏳ `commands/analyze.ts` — 待创建：analyze 命令实现
- ⏳ `commands/p1-5a-test.ts` — 待创建：P1.5a 回归测试命令
- ⏳ `utils/logger.ts` — 待创建：彩色日志
- ⏳ `utils/file-utils.ts` — 待创建：文件读写工具
- **验证**：尚未完成

### 6. 测试
- ⏳ `tests/p0/p0-verify.test.ts` — 待创建：P0 验证（基础 Lua 调用）
- ⏳ `tests/p1/p1-runner.test.ts` — 待创建：P1 验证（单 variant 模拟）
- ⏳ `tests/p1-5/p1-5a-real-build.test.ts` — 待创建：P1.5a 真实 build 回归
- ⏳ `tests/fixtures/builds/` — 等待用户放入真实 build 文件

## 技术债务

| 问题 | 影响 | 优先级 |
|---|---|---|
| `tsconfig.json` 中 `paths` 映射未生效于 `tsc --noEmit`（需 `--build`） | 开发体验 | 低 |
| 部分测试文件使用 `any` 类型（ gear-swap-analyzer.test.ts 第 316 行） | 类型安全 | 低 |
| CLI 包未包含 `commander` 依赖 | 编译/运行 | 中（正在处理） |

## 下一步行动

1. ✅ 完成 CLI 入口和命令实现
2. ✅ 安装 `commander` 依赖
3. ✅ 运行集成测试（合成 build mock）
4. ⏳ 用户放入真实 `.build` 文件 → 运行 P1.5a 回归测试

## 定版决策（已确认）

- Lua 桥接：保持 Python ctypes 子进程方案
- Worker 进程：阶段1即并行（4 Worker）
- 项目结构：Monorepo（npm workspace）
- 输入范围：`.build` + WeGame Adapter（框架先行，解析后补）
- Breakdown：阶段1保留 raw，阶段4归一化
- 技术栈：TS strict + Vitest + Zod + Commander.js
- 总体范围：先做阶段1+2，3~6后续排
