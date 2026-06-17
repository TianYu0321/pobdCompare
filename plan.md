# PoE2 BD 差异比较工具 MVP — 实施计划

> 定版确认完成，开始实施
> 日期：2026-06-18
> 工作目录：`D:\pobdCompare`
> PoB2 源码：`D:\PathOfBuilding-PoE2-dev\PathOfBuilding-PoE2-dev`

---

## 定版决策

| 问题 | 决策 |
|---|---|
| Lua 桥接 | 保持 Python ctypes 子进程方案 |
| Worker 进程 | **阶段1即并行** — JobQueue + WorkerPool 从第一天开始 |
| 项目结构 | Monorepo（npm workspace） |
| 测试数据 | 用户随时从 poe.ninja 手扒；先准备框架，后续补充 |
| 输入范围 | `.build` + **WeGame Adapter（纳入阶段1）** |
| Breakdown | 阶段1保留 raw，阶段4归一化，但必须在阶段1+2内完成 |
| 技术栈 | TS strict + Vitest + Zod + Commander.js |
| 总体范围 | 阶段1（工程骨架+并行引擎）+ 阶段2（P1.5a 回归） |

---

## 阶段划分

### 阶段 1：工程骨架 + 并行引擎

目标：所有模块可编译、WorkerPool 可调度、合成 build 可跑通。

模块清单：
1. `packages/schemas` — 所有文档接口 → TS + Zod
2. `packages/pob2-worker` — Python ctypes 子进程封装 + 协议
3. `packages/core/baseline` — BaselineManager
4. `packages/core/variant` — VariantGenerator
5. `packages/core/mutation` — BuildMutation 定义 + 应用逻辑
6. `packages/core/comparator` — ResultComparator
7. `packages/core/analyzer` — PassiveMarginalAnalyzer + GearSwapAnalyzer
8. `packages/core/jobqueue` — JobQueue + WorkerPool + 超时重试
9. `packages/adapters/wegame` — WeGame 数据转换（框架先行，解析后补）
10. `apps/cli` — CLI 入口 + P1.5a 测试运行器

### 阶段 2：P1.5a 真实 Build 回归

目标：5~10 套真实 buildXml，批量验证成功率 ≥ 90%。

依赖：用户提供真实 `.build` 文件。

---

## 集群任务分配

### Stage 1：基础层（可并行）

- **Worker A**：`packages/schemas` — 所有 TypeScript 接口 + Zod schemas
- **Worker B**：`packages/pob2-worker` — Python 驱动封装 + 协议层

### Stage 2：核心层（依赖 Stage 1）

- **Worker C**：`packages/core` 上 — BaselineManager + VariantGenerator + Mutation
- **Worker D**：`packages/core` 下 — Comparator + Analyzer + JobQueue/WorkerPool
- **Worker E**：`packages/adapters/wegame` — WeGame Adapter 框架 + 转换接口

### Stage 3：入口层（依赖 Stage 2）

- **Worker F**：`apps/cli` — CLI 入口 + P1.5a 测试框架

### Stage 4：合并与验证（主代理）

- 合并所有 worktree
- 运行集成测试（合成 build）
- 验证 JSON 输出

---

## 接口契约（Worker 必须遵守）

### PoB2 Worker 协议

```typescript
interface Pob2WorkerRequest {
  buildXml: string;
  skillNumber: number;
  weaponSet: number;
  config: Record<string, unknown>;
  mutation?: BuildMutation;
}

interface Pob2WorkerResponse {
  success: boolean;
  calcsOutput?: Record<string, unknown>;
  breakdown?: Record<string, unknown>;
  skillDpsList?: SkillDpsInfo[];
  itemSlots?: ItemSlotInfo[];
  passiveNodes?: number[];
  error?: string;
  variantXml?: string; // SaveDB 导出
}
```

Python 子进程：
- 输入：stdin 或 JSON 文件路径
- 输出：stdout JSON 或结果文件
- 错误：stderr

### JobQueue 调度

```typescript
interface JobQueueConfig {
  maxWorkers: number;        // 默认 4
  timeoutMs: number;         // 默认 30000
  maxRetries: number;        // 默认 1
  retryDelayMs: number;      // 默认 1000
}
```

每个 Worker 对应一个独立的 Python ctypes 子进程，独立的 Lua state。

---

## 目录结构

```
poe2-bd-analyzer/
├── package.json              # workspace root
├── tsconfig.json             # base tsconfig
├── vitest.config.ts          # 测试配置
├── .gitignore
├── packages/
│   ├── schemas/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── baseline.ts
│   │       ├── mutation.ts
│   │       ├── variant.ts
│   │       ├── simulation.ts
│   │       ├── comparator.ts
│   │       ├── breakdown.ts
│   │       ├── agent.ts
│   │       └── cache.ts
│   ├── pob2-worker/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── bridge.ts
│   │   │   ├── protocol.ts
│   │   │   └── worker-pool.ts
│   │   └── python/
│   │       ├── __init__.py
│   │       ├── driver.py
│   │       ├── lua_bridge.py
│   │       └── scripts/
│   │           ├── headless_runner.py
│   │           └── templates/
│   │               ├── baseline.lua
│   │               ├── mutation_passive_add.lua
│   │               ├── mutation_passive_remove.lua
│   │               └── mutation_gear_swap.lua
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── baseline/
│   │       │   ├── index.ts
│   │       │   └── baseline-manager.ts
│   │       ├── variant/
│   │       │   ├── index.ts
│   │       │   └── variant-generator.ts
│   │       ├── mutation/
│   │       │   ├── index.ts
│   │       │   └── mutation-applier.ts
│   │       ├── comparator/
│   │       │   ├── index.ts
│   │       │   └── result-comparator.ts
│   │       ├── analyzer/
│   │       │   ├── index.ts
│   │       │   ├── passive-marginal-analyzer.ts
│   │       │   └── gear-swap-analyzer.ts
│   │       └── jobqueue/
│   │           ├── index.ts
│   │           ├── job-queue.ts
│   │           ├── worker-pool.ts
│   │           └── simulation-job.ts
│   └── adapters/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── build-xml/
│           │   └── build-xml-adapter.ts
│           └── wegame/
│               ├── index.ts
│               ├── wegame-adapter.ts
│               └── conversion-report.ts
├── apps/
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       ├── bin/
│       │   └── pobd-compare
│       └── src/
│           ├── index.ts
│           ├── commands/
│           │   ├── analyze.ts
│           │   └── p1-5a-test.ts
│           └── utils/
│               └── logger.ts
├── tests/
│   ├── fixtures/
│   │   └── builds/
│   │       └── .gitkeep
│   ├── p0/
│   │   └── p0-verify.test.ts
│   ├── p1/
│   │   └── p1-runner.test.ts
│   └── p1-5/
│       └── p1-5a-real-build.test.ts
└── docs/
    └── .gitkeep
```

---

## 验证目标

### 阶段 1 验收

- [ ] `npm install` 成功
- [ ] `npm run build` 所有包编译通过
- [ ] `npm run test` 基础测试通过
- [ ] CLI `pobd-compare analyze --build-xml <path>` 可跑通
- [ ] 合成 build 的 passive_remove / passive_add / gear_swap 各至少 1 个成功
- [ ] JSON 输出可 `JSON.parse()`
- [ ] WorkerPool 至少 2 个 Worker 并行跑通

### 阶段 2 验收（P1.5a）

- [ ] 5~10 套真实 buildXml 导入成功
- [ ] 每套 passive_remove 50+，成功率 ≥ 90%
- [ ] 每套 passive_add 30+，成功率 ≥ 90%
- [ ] 每套 gear_swap 8+，成功率 ≥ 90%
- [ ] 单 job 失败不影响 batch
- [ ] 成功 variant 可 SaveDB / loadBuildFromXML
- [ ] 输出 `p1_5_real_build_result.json` 包含 topGains / topLosses / incompatibleResults / failedJobsReport

---

## 风险与对策

| 风险 | 对策 |
|---|---|
| WeGame 数据格式不确定 | 先定义接口和转换框架，用户提供数据后填解析逻辑 |
| Breakdown 结构多变 | 阶段1只保留 raw，阶段4做 Normalizer，Normalizer 基于实际样本写 |
| 多 Worker 并行 Lua 冲突 | 每个 Worker 独立子进程，独立 Lua state，不共享 |
| 真实 build 失败率高 | 先跑合成 build 验证骨架，再逐步引入真实 build 调优 |
| poe.ninja 手扒数据格式 | 用户提供样本后写 parser，目前先定义接口 |

---

## 下一步行动

1. 主代理创建项目骨架 → 提交 baseline
2. 创建 worktree → 并行派发 Stage 1 Worker
3. Stage 1 合并后 → 并行派发 Stage 2 Worker
4. Stage 2 合并后 → 派发 Stage 3 Worker
5. 最终合并验证 → 输出报告
