import { useEffect, useRef, useState } from 'react';
import { ChevronRight, RotateCcw, Undo2, Redo2, X } from 'lucide-react';

import {
  applyGearCandidate,
  createComparison,
  getGearCandidates,
  getImport,
  importFile,
  importUrl,
  revisionAction,
  waitForJob,
  type GearCandidate,
  type GearSwapOutcome,
  type ImportResult,
  type PassiveRankings,
  type WorkspaceResult,
  type WorkspaceView,
  type WorkspaceSideView,
  type RevisionResult,
} from '@/api';
import type { BuildDiffResult, EquipmentSlot, NormalizedBuild } from '@/types';
import { extractHitLines, computeHitLinesDelta, safePercentDelta } from '@/lib/hit-lines';
import { slotDeltaText } from '@/lib/slot-delta';

type Side = 'a' | 'b';
type Tab = 'equipment' | 'skills' | 'passives';

const STAGES = [
  '读取 Build A',
  '读取 Build B',
  '识别主技能',
  '计算 baseline',
  '计算静态差异',
  '执行装备替换模拟',
  '执行天赋收益模拟',
  '提取 breakdown',
  '生成对比结果',
];

interface SideState {
  result?: ImportResult;
  label?: string;
  loading: boolean;
  workspace?: WorkspaceSideView;
}

const emptySide = (): SideState => ({ loading: false });

const cursorFlags = (workspace: WorkspaceSideView | undefined) => {
  if (!workspace) return { disableUndo: true, disableRedo: true, disableReset: true };
  return {
    disableUndo: workspace.session.cursor <= 0,
    disableRedo: workspace.session.cursor >= workspace.session.revisions.length - 1,
    disableReset: workspace.session.cursor <= 0,
  };
};

export default function ComparePage() {
  const [sides, setSides] = useState<Record<Side, SideState>>({
    a: emptySide(),
    b: emptySide(),
  });
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [diff, setDiff] = useState<BuildDiffResult>();
  const [passives, setPassives] = useState<{ a?: PassiveRankings; b?: PassiveRankings }>({});
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'offence' | 'defence'>('offence');
  const [candidates, setCandidates] = useState<GearCandidate[]>([]);
  const [drawer, setDrawer] = useState<{ side: Side; slot: EquipmentSlot }>();
  const [mutationMessage, setMutationMessage] = useState('');
  const dual = Boolean(sides.a.result && sides.b.result);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const load = async (side: Side, id: string | null) => {
      if (!id) return;
      try {
        const result = await getImport(id);
        setSides((current) => ({
          ...current,
          [side]: { result, label: result.normalizedBuild?.character.name ?? '已导入构筑', loading: false },
        }));
      } catch {
        // A stale local import id should not prevent the workbench from loading.
      }
    };
    void load('a', params.get('a'));
    void load('b', params.get('b'));
  }, []);

  const setSide = (side: Side, patch: Partial<SideState>) =>
    setSides((current) => ({ ...current, [side]: { ...current[side], ...patch } }));

  const updateWorkspaceState = (side: Side, workspace: WorkspaceView) => {
    const sideView = side === 'a' ? workspace.a : workspace.b;
    if (sideView) {
      setSide(side, { workspace: sideView });
    }
    if (workspace.diff) {
      setDiff(workspace.diff);
    }
  };

  const runImport = async (side: Side, source: File | string) => {
    setError('');
    setWorkspaceId(undefined);
    setDiff(undefined);
    setPassives({});
    setSide(side, {
      loading: true,
      label: source instanceof File ? source.name : source,
    });
    try {
      const jobId = source instanceof File ? await importFile(source) : await importUrl(source);
      const result = await waitForJob<ImportResult>(
        jobId,
        (job) => setStage(job.message ?? `正在导入 Build ${side.toUpperCase()}`),
      );
      setSide(side, { result, loading: false });
      setStage(
        result.status === 'calculable'
          ? 'PoB2 baseline 已验证'
          : result.conversionReport.blockers[0]?.reason ?? '数据已接入，但存在精确映射阻断',
      );
    } catch (caught) {
      setSide(side, { loading: false });
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const compare = async () => {
    if (!sides.a.result) {
      setError('请先导入 Build A');
      return;
    }
    if (sides.a.result.status !== 'calculable' || (sides.b.result && sides.b.result.status !== 'calculable')) {
      const blocked = sides.a.result.status !== 'calculable'
        ? sides.a.result
        : sides.b.result;
      const reason = blocked?.conversionReport.blockers[0]?.reason;
      setError(reason
        ? `当前构筑未通过 PoB2 可计算验证：${reason}`
        : '当前构筑尚未通过 PoB2 可计算验证，不能启动模拟。');
      return;
    }
    setError('');
    setStage('创建本地计算工作区');
    try {
      const jobId = await createComparison(sides.a.result.id, sides.b.result?.id);
      const result = await waitForJob<WorkspaceResult>(jobId, (job) =>
        setStage(job.status === 'running' ? 'PoB2 正在生成对比结果' : '完成'),
      );
      setWorkspaceId(result.workspace.id);
      setDiff(result.diff);
      setPassives(result.passives ?? {});
      setStage('对比结果已就绪');

      const workspace = result.workspace as unknown as WorkspaceView;
      if (workspace.a) {
        setSide('a', { workspace: workspace.a });
      }
      if (workspace.b && dual) {
        setSide('b', { workspace: workspace.b });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const openItem = async (side: Side, slot: EquipmentSlot) => {
    setDrawer({ side, slot });
    setMutationMessage('');
    if (!workspaceId) return setCandidates([]);
    try {
      const list = await getGearCandidates(workspaceId, side);
      setCandidates(list.filter((candidate) =>
        candidate.sourceSide !== side &&
        normalizeSlot(candidate.slotName) === normalizeSlot(slot.slotName),
      ));
    } catch (caught) {
      setMutationMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const applyCandidate = async (candidate: GearCandidate) => {
    if (!workspaceId || !drawer) return;
    setMutationMessage('PoB2 正在重算...');
    try {
      const jobId = await applyGearCandidate(workspaceId, drawer.side, candidate.id, drawer.slot.slotName);
      const outcome = await waitForJob<GearSwapOutcome>(jobId);
      if (outcome.applied && outcome.workspace) {
        updateWorkspaceState(drawer.side, outcome.workspace);
        const simulation = outcome.result;
        if (simulation?.resultKind === 'normal_gain' || simulation?.resultKind === 'normal_loss' || simulation?.resultKind === 'neutral') {
          setMutationMessage(`创建 Variant：DPS ${formatDelta(simulation.dpsDeltaPercent)}`);
        }
      } else if (outcome.result?.resultKind === 'incompatible') {
        setMutationMessage(`不兼容：${outcome.result.resultKind}`);
      } else if (outcome.result?.resultKind === 'calc_failed') {
        setMutationMessage(`计算失败：${outcome.result.resultKind}`);
      } else {
        setMutationMessage(outcome.result ? `结果：${outcome.result.resultKind}` : '操作未生效');
      }
    } catch (caught) {
      setMutationMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const doRevision = async (side: Side, action: 'undo' | 'redo' | 'reset') => {
    if (!workspaceId) return;
    try {
      const workspace = await revisionAction(workspaceId, side, action);
      updateWorkspaceState(side, workspace);
      setMutationMessage(action === 'undo' ? '已撤销' : action === 'redo' ? '已重做' : '已重置到 baseline');
    } catch (caught) {
      setMutationMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="workbench">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div><b>POE2 BUILD LAB</b><small>双 BD 可计算工作台 · 本地 PoB2</small></div>
        </div>
        <div className="input-pair">
          <BuildInput side="a" state={sides.a} onImport={runImport} onClear={() => setSide('a', emptySide())} />
          <BuildInput side="b" state={sides.b} onImport={runImport} onClear={() => setSide('b', emptySide())} />
        </div>
        <button className="compare-button" onClick={compare} disabled={!sides.a.result || sides.a.loading || sides.b.loading}>
          {dual ? '开始对比' : '分析 Build'}
          <ChevronRight size={15} />
        </button>
      </header>

      {(error || stage) && (
        <div className={`notice ${error ? 'notice-error' : ''}`}>{error || stage}</div>
      )}

      <main className={dual ? 'columns dual' : sides.a.result || sides.b.result ? 'columns single' : 'columns none'}>
        {sides.a.result ? (
          <BuildPanel
            side="a"
            result={sides.a.result}
            workspace={sides.a.workspace}
            workspaceReady={Boolean(workspaceId)}
            onItem={openItem}
            onRevision={doRevision}
            passives={passives.a}
          />
        ) : (
          <EmptyDrop side="a" onImport={runImport} />
        )}

        {dual && (
          <DiffRail
            diff={diff}
            stage={stage}
            view={view}
            onView={setView}
            resultA={sides.a.result}
            resultB={sides.b.result}
          />
        )}

        {sides.b.result ? (
          <BuildPanel
            side="b"
            result={sides.b.result}
            workspace={sides.b.workspace}
            workspaceReady={Boolean(workspaceId)}
            onItem={openItem}
            onRevision={doRevision}
            passives={passives.b}
          />
        ) : (
          <EmptyDrop side="b" onImport={runImport} compact={Boolean(sides.a.result)} />
        )}
      </main>

      {drawer && (
        <ItemDrawer
          drawer={drawer}
          candidates={candidates}
          message={mutationMessage}
          onApply={applyCandidate}
          onClose={() => setDrawer(undefined)}
        />
      )}
    </div>
  );
}

function BuildInput({
  side,
  state,
  onImport,
  onClear,
}: {
  side: Side;
  state: SideState;
  onImport: (side: Side, value: File | string) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const submitUrl = () => {
    if (url.trim()) void onImport(side, url.trim());
  };
  return (
    <div
      className={`build-input ${state.result ? 'has-build' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void onImport(side, file);
      }}
    >
      <span className="side-label">{side.toUpperCase()}</span>
      <input
        value={state.result ? state.label ?? state.result.normalizedBuild?.character.name ?? '已导入构筑' : url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && submitUrl()}
        onClick={() => state.result ? undefined : fileRef.current?.click()}
        readOnly={Boolean(state.result)}
        placeholder="拖入 .build / .xml，或粘贴 WeGame / poe.ninja URL"
      />
      <input
        ref={fileRef}
        type="file"
        accept=".build,.xml"
        hidden
        onChange={(event) => event.target.files?.[0] && void onImport(side, event.target.files[0])}
      />
      {!state.result && url && <button onClick={submitUrl}>导入</button>}
      {(state.result || state.loading) && <button className="icon-button" onClick={onClear}><X size={14} /></button>}
      <span className={`source-dot ${state.result?.status ?? ''}`} />
    </div>
  );
}

function EmptyDrop({
  side,
  onImport,
  compact,
}: {
  side: Side;
  onImport: (side: Side, value: File | string) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button className={`empty-drop ${compact ? 'compact' : ''}`} onClick={() => ref.current?.click()}>
      <span>BUILD {side.toUpperCase()}</span>
      <b>{compact ? '拖入第二套 BD 进行对比' : '导入构筑开始分析'}</b>
      <small>.build / .xml / WeGame / poe.ninja</small>
      <input ref={ref} hidden type="file" accept=".build,.xml" onChange={(e) => e.target.files?.[0] && void onImport(side, e.target.files[0])} />
    </button>
  );
}

function BuildPanel({
  side,
  result,
  workspace,
  workspaceReady,
  onItem,
  onRevision,
  passives,
}: {
  side: Side;
  result: ImportResult;
  workspace?: WorkspaceSideView;
  workspaceReady: boolean;
  onItem: (side: Side, slot: EquipmentSlot) => void;
  onRevision: (side: Side, action: 'undo' | 'redo' | 'reset') => void;
  passives?: PassiveRankings;
}) {
  const [tab, setTab] = useState<Tab>('equipment');
  const build = (workspace?.currentNormalizedBuild ?? result.normalizedBuild)!;
  if (!build) return <section className="build-panel missing">构筑数据不可用</section>;
  const selectedSkill = result.baseline?.mainSkillSelection.selectedSkillName ?? build.skillDps[0]?.skillName;
  const dps = result.baseline?.calcsOutput.CombinedDPS ?? build.skillDps.find((skill) => skill.skillName === selectedSkill)?.dps;
  const flags = cursorFlags(workspace);
  return (
    <section className="build-panel">
      <div className="panel-kicker">BUILD {side.toUpperCase()} · {sourceLabel(result.source)}</div>
      <div className="character-head">
        <div>
          <h2>{build.character.name ?? '未命名角色'}</h2>
          <p>{build.character.className ?? '待识别'} / {build.character.ascendancy ?? '未升华'} · Lv.{build.character.level ?? '待计算'}</p>
        </div>
        <span className={`calc-state ${result.status}`}>{result.status === 'calculable' ? 'POB2 已验证' : '仅展示'}</span>
      </div>
      <div className="summary-grid">
        <Summary label="主技能" value={selectedSkill ?? '待选择'} wide />
        <Summary label="DPS" value={formatNumber(dps)} accent />
        <Summary label="物理一击线" value={hitLineSummary(result).physical} />
        <Summary label="元素一击线" value={hitLineSummary(result).elemental} />
        <Summary label="转换状态" value={result.status === 'calculable' ? 'PoB2 原生' : '映射未完成'} />
      </div>
      <div className="panel-tools">
        <div className="tabs">
          <button className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>装备</button>
          <button className={tab === 'skills' ? 'active' : ''} onClick={() => setTab('skills')}>技能</button>
          <button className={tab === 'passives' ? 'active' : ''} onClick={() => setTab('passives')}>天赋</button>
        </div>
        <div className="revision-tools">
          <button disabled={!workspaceReady || flags.disableUndo} title="撤销" onClick={() => onRevision(side, 'undo')}><Undo2 size={13} /></button>
          <button disabled={!workspaceReady || flags.disableRedo} title="重做" onClick={() => onRevision(side, 'redo')}><Redo2 size={13} /></button>
          <button disabled={!workspaceReady || flags.disableReset} title="重置" onClick={() => onRevision(side, 'reset')}><RotateCcw size={13} /></button>
        </div>
      </div>
      <div className="tab-content">
        {tab === 'equipment' && <EquipmentGrid build={build} side={side} onItem={onItem} currentRevision={workspace?.currentRevision} />}
        {tab === 'skills' && <Skills build={build} selected={selectedSkill} />}
        {tab === 'passives' && <PassiveRanks calculable={result.status === 'calculable'} rankings={passives} />}
      </div>
      {result.conversionReport.blockers.length > 0 && (
        <div className="warning-line">
          {result.conversionReport.blockers.slice(0, 3).map((blocker) => (
            <div key={`${blocker.code}:${blocker.source}`}>
              {blocker.category} · {blocker.source}：{blocker.reason}
            </div>
          ))}
        </div>
      )}
      {result.conversionReport.blockers.length === 0 && result.warnings.length > 0 && (
        <div className="warning-line">{result.warnings[0]}</div>
      )}
    </section>
  );
}

const SLOT_LAYOUT = [
  ['Helm'],
  ['Weapon 1', 'Body Armour', 'Offhand'],
  ['Gloves', 'Belt', 'Boots'],
  ['Ring 1', 'Amulet', 'Ring 2'],
  ['Charm 1', 'Charm 2', 'Charm 3'],
];

function EquipmentGrid({
  build,
  side,
  onItem,
  currentRevision,
}: {
  build: NormalizedBuild;
  side: Side;
  onItem: (side: Side, slot: EquipmentSlot) => void;
  currentRevision?: { result?: RevisionResult };
}) {
  return (
    <div className="equipment-grid">
      {SLOT_LAYOUT.map((row, rowIndex) => (
        <div className={`equipment-row row-${rowIndex}`} key={row.join('-')}>
          {row.map((slotName) => {
            const slot = findSlot(build.equipments, slotName);
            return (
              <button className={`gear-slot rarity-${(slot?.item?.rarity ?? 'normal').toLowerCase()}`} key={slotName} onClick={() => onItem(side, slot ?? { slotName, empty: true })}>
                <span className="slot-name">{slotName.toUpperCase()}</span>
                <span className="item-icon">{slot?.item?.icon ? <img src={slot.item.icon} alt="" /> : '◇'}</span>
                <b>{slot?.item?.name || '空'}</b>
                <small>{slot?.item?.baseType || '未装备'}</small>
                <span className="slot-delta">{slotDeltaText(currentRevision, slotName)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Skills({ build, selected }: { build: NormalizedBuild; selected?: string }) {
  return (
    <div className="skill-list">
      <div className="current-skill">当前对比技能：<b>{selected ?? '待选择'}</b><button>切换主技能</button></div>
      {build.skills.length === 0 && <EmptyState text="PoB2 未返回技能组详情" />}
      {build.skills.map((skill) => {
        const dps = build.skillDps.find((entry) => entry.skillName === skill.name)?.dps;
        return (
          <article className="skill-card" key={skill.id ?? skill.name}>
            <div><b>{skill.name}</b><small>Lv.{skill.level ?? '待计算'} · 品质 {skill.quality ?? '待计算'} · 武器组 {skill.weaponSet ?? '未绑定'}</small></div>
            <strong>{formatNumber(dps)} DPS</strong>
            <div className="support-list">{skill.supports.map((support) => <span key={support.name}>{support.name}</span>)}</div>
          </article>
        );
      })}
    </div>
  );
}

function PassiveRanks({ calculable, rankings }: { calculable: boolean; rankings?: PassiveRankings }) {
  const groups = [
    ['下一点收益榜', '单个相邻节点', rankings?.nextPoint ?? []],
    ['路径包收益榜', 'pathAutoFilled · 按实际点数', rankings?.pathPackage ?? []],
    ['移除损失榜', 'cascadeRemoved · 级联总损失', rankings?.removeLoss ?? []],
  ] as const;
  return (
    <div className="passive-columns">
      {groups.map(([title, note, results]) => (
        <section className="rank-card" key={title}>
          <h3>{title}</h3><p>{note}</p>
          {results.length === 0 ? (
            <EmptyState text={calculable ? '等待渐进模拟结果' : '需要 PoB2 可计算构筑'} />
          ) : results.slice(0, 6).map((result) => (
            <article className="rank-row" key={`${title}-${result.target.id}`}>
              <div><b>{result.target.name ?? `节点 ${result.target.id}`}</b>
                <small>
                  {result.passiveAddMeta?.pathAutoFilled && `pathAutoFilled · ${result.passiveAddMeta.actualPointCost} 点`}
                  {result.passiveRemoveMeta?.cascadeRemoved && `cascadeRemoved · ${result.passiveRemoveMeta.cascadeNodeCount + 1} 节点`}
                  {!result.passiveAddMeta?.pathAutoFilled && !result.passiveRemoveMeta?.cascadeRemoved && '独立变更'}
                </small>
              </div>
              <strong className={result.dpsDeltaPercent >= 0 ? 'positive' : 'negative'}>{formatDelta(result.dpsDeltaPercent)}</strong>
            </article>
          ))}
        </section>
      ))}
      <div className="tree-paused">完整天赋树 UI 已暂停：P3 仅展示可追溯的收益榜，不展示 raw node 散点图。</div>
    </div>
  );
}

function DiffRail({
  diff,
  stage,
  view,
  onView,
  resultA,
  resultB,
}: {
  diff?: BuildDiffResult;
  stage: string;
  view: 'offence' | 'defence';
  onView: (view: 'offence' | 'defence') => void;
  resultA?: ImportResult;
  resultB?: ImportResult;
}) {
  const coDps = (r: ImportResult | undefined): number | undefined => {
    const co = r?.baseline?.calcsOutput;
    if (!co) return undefined;
    const d = co.CombinedDPS;
    return typeof d === 'number' ? d : undefined;
  };
  const dpsA = diff?.dpsDiff?.myDps ?? coDps(resultA) ?? resultA?.normalizedBuild?.skillDps[0]?.dps;
  const dpsB = diff?.dpsDiff?.targetDps ?? coDps(resultB) ?? resultB?.normalizedBuild?.skillDps[0]?.dps;
  const hitDelta = resultA && resultB ? computeHitLinesDelta(resultA, resultB) : undefined;
  const avgVal = (r: ImportResult | undefined): number | undefined => {
    const co = r?.baseline?.calcsOutput;
    if (!co) return undefined;
    const ad = co.AverageDamage;
    if (typeof ad === 'number') return ad;
    const mh = co.MainHand_AverageHit;
    if (typeof mh === 'number') return mh;
    return undefined;
  };
  const critVal = (r: ImportResult | undefined): number | undefined => {
    const co = r?.baseline?.calcsOutput;
    if (!co) return undefined;
    const c = co.CritChance;
    return typeof c === 'number' ? c : undefined;
  };
  const avgA = avgVal(resultA);
  const avgB = avgVal(resultB);
  const critA = critVal(resultA);
  const critB = critVal(resultB);

  return (
    <aside className="diff-rail">
      <div className="rail-title">DIFF RAIL</div>
      <div className="rail-toggle"><button className={view === 'offence' ? 'active' : ''} onClick={() => onView('offence')}>攻击端</button><button className={view === 'defence' ? 'active' : ''} onClick={() => onView('defence')}>防御端</button></div>
      {!diff ? (
        <div className="rail-progress">
          <b>{stage || '点击开始对比'}</b>
          {STAGES.map((item) => <span className={stage.includes(item.replace('计算 ', '').replace('执行', '').slice(0, 4)) ? 'current' : ''} key={item}>{item}</span>)}
        </div>
      ) : (
        <>
          <div className="rail-skill">当前对比技能<strong>{diff.mainSkill}</strong></div>
          {view === 'offence' ? (
            <>
              <CompareMetric label="DPS" a={dpsA} b={dpsB} delta={diff.dpsDiff?.diffPercent} />
              <CompareMetric label="平均击中" a={avgA} b={avgB} delta={safePercentDelta(avgA, avgB)} />
              <CompareMetric label="暴击率" a={critA} b={critB} delta={safePercentDelta(critA, critB)} />
            </>
          ) : (
            <>
              <CompareMetric label="物理一击线" a={hitDelta?.physical.a} b={hitDelta?.physical.b} delta={hitDelta?.physical.deltaPercent} />
              <CompareMetric label="元素一击线" a={hitDelta?.elemental.a} b={hitDelta?.elemental.b} delta={hitDelta?.elemental.deltaPercent} />
              <CompareMetric label="生命" a={hitDelta?.life.a} b={hitDelta?.life.b} delta={hitDelta?.life.deltaPercent} />
            </>
          )}
          <div className="top-diffs"><h3>关键差异 TOP 3</h3>
            {diff.ruleWarnings.slice(0, 3).map((warning) => <p key={warning.ruleId}>{warning.title}</p>)}
            {diff.ruleWarnings.length === 0 && diff.equipmentDiff.slotDiffs.filter((slot) => slot.myItem !== slot.targetItem).slice(0, 3).map((slot) => <p key={slot.slotName}>{slot.slotName}<small>{slot.myItem ?? '空'} → {slot.targetItem ?? '空'}</small></p>)}
          </div>
        </>
      )}
    </aside>
  );
}

function ItemDrawer({
  drawer,
  candidates,
  message,
  onApply,
  onClose,
}: {
  drawer: { side: Side; slot: EquipmentSlot };
  candidates: GearCandidate[];
  message: string;
  onApply: (candidate: GearCandidate) => void;
  onClose: () => void;
}) {
  const item = drawer.slot.item;
  const rawMods = item?.rawText
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !/^Rarity:/i.test(line) &&
      line !== item.name &&
      line !== item.baseType &&
      !/^(Unique ID|Item Level|Quality|Sockets|LevelReq):/i.test(line),
    ) ?? [];
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="item-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}><X /></button>
        <div className="panel-kicker">BUILD {drawer.side.toUpperCase()} · {drawer.slot.slotName}</div>
        <h2>{item?.name ?? '空槽位'}</h2><p>{item?.baseType ?? '未装备'}</p>
        <div className="drawer-tabs"><b>词条</b><b>与对方差异</b><b>替换收益</b></div>
        <div className="mods">
          {[...(item?.implicitMods ?? []), ...(item?.explicitMods ?? []), ...(item?.bondedMods ?? []), ...rawMods].map((mod, index) => <span key={`${mod}-${index}`}>{mod}</span>)}
          {!item?.explicitMods?.length && rawMods.length === 0 && <EmptyState text="此来源未提供完整词条文本" />}
        </div>
        <h3>对方装备候选</h3>
        <div className="candidate-list">
          {candidates.map((candidate) => (
            <article key={candidate.id}>
              <div><b>{candidate.name}</b><small>{candidate.baseType}</small></div>
              <button disabled={!candidate.applicable} onClick={() => onApply(candidate)}>{candidate.applicable ? '应用装备' : '不可应用'}</button>
            </article>
          ))}
          {candidates.length === 0 && <EmptyState text="该槽位没有来自对方构筑的候选" />}
        </div>
        {message && <div className={`mutation-message ${message.includes('不兼容') || message.includes('失败') ? 'bad' : ''}`}>{message}</div>}
      </aside>
    </div>
  );
}

function Summary({ label, value, wide, accent }: { label: string; value: string; wide?: boolean; accent?: boolean }) {
  return <div className={`${wide ? 'wide' : ''} ${accent ? 'accent' : ''}`}><span>{label}</span><b>{value}</b></div>;
}

function CompareMetric({ label, a, b, delta }: { label: string; a?: number; b?: number; delta?: number }) {
  return <div className="compare-metric"><span>{label}</span><div><b>{formatNumber(a)}</b><i>↔</i><b>{formatNumber(b)}</b></div><strong className={(delta ?? 0) >= 0 ? 'positive' : 'negative'}>{formatDelta(delta)}</strong></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function hitLineSummary(result: ImportResult): { physical: string; elemental: string } {
  const h = extractHitLines(result);
  return { physical: formatNumber(h.physical), elemental: formatNumber(h.elemental) };
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, notation: value > 999999 ? 'compact' : 'standard' }).format(value)
    : '待计算';
}

function formatDelta(value?: number): string {
  return value === undefined ? '待计算' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function sourceLabel(source: ImportResult['source']): string {
  return source === 'wegame' ? 'WEGAME' : source === 'poe_ninja' ? 'POE.NINJA' : 'BUILD FILE';
}

function findSlot(slots: EquipmentSlot[], target: string): EquipmentSlot | undefined {
  const normalized = normalizeSlot(target);
  return slots.find((slot) => normalizeSlot(slot.slotName) === normalized);
}

function normalizeSlot(slot: string): string {
  const value = slot.toLowerCase().replace(/[\s_-]/g, '');
  const aliases: Record<string, string> = {
    helmet: 'helm',
    bodyarmour: 'bodyarmour',
    body: 'bodyarmour',
    weapon: 'weapon1',
    mainhand: 'weapon1',
    offhand1: 'offhand',
    ring: 'ring1',
    ringleft: 'ring1',
    ringright: 'ring2',
  };
  return aliases[value] ?? value;
}
