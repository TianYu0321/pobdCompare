import { ReactNode } from 'react';

interface ThreeColumnLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export default function ThreeColumnLayout({ left, center, right }: ThreeColumnLayoutProps) {
  return (
    <div className="h-full grid grid-cols-[1fr_380px_1fr] gap-1">
      {/* 左侧 Build A */}
      <div className="h-full overflow-auto p-3">
        {left}
      </div>
      {/* 中央 Diff Rail */}
      <div className="h-full overflow-auto border-x border-poe-border bg-poe-surface/50 p-3">
        {center}
      </div>
      {/* 右侧 Build B */}
      <div className="h-full overflow-auto p-3">
        {right}
      </div>
    </div>
  );
}
