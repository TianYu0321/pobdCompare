interface StatBadgeProps {
  label: string;
  value: string | number;
  delta?: number;
  unit?: string;
  highlight?: boolean;
}

export default function StatBadge({ label, value, delta, unit, highlight }: StatBadgeProps) {
  const deltaNum = delta;
  const deltaStr = deltaNum !== undefined && deltaNum !== null
    ? `${deltaNum >= 0 ? '+' : ''}${deltaNum.toFixed(1)}${unit ?? ''}`
    : null;

  return (
    <div className={`card p-2 ${highlight ? 'border-poe-unique' : ''}`}>
      <div className="text-xs text-poe-textMuted">{label}</div>
      <div className="font-mono text-sm font-semibold text-poe-text">
        {value}{unit ?? ''}
      </div>
      {deltaStr && (
        <div className={`text-xs font-mono ${deltaNum !== undefined && deltaNum !== null && deltaNum >= 0 ? 'stat-positive' : 'stat-negative'}`}>
          {deltaStr}
        </div>
      )}
    </div>
  );
}
