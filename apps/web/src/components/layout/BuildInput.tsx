import { useCallback } from 'react';
import { useBuildStore } from '@/stores';
import { Upload } from 'lucide-react';
import type { NormalizedBuild } from '@/types';

interface BuildInputProps {
  label: string;
  build: NormalizedBuild | null;
  onFileSelect: (file: File) => void;
}

export default function BuildInput({ label, build, onFileSelect }: BuildInputProps) {
  const { clearBuilds } = useBuildStore();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text/plain');
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        // TODO: URL 解析（WeGame / poe.ninja / pobb.in）
        console.log('URL pasted:', text);
      }
    },
    []
  );

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-poe-textMuted uppercase tracking-wider">
          {label}
        </span>
        {build && (
          <button
            onClick={clearBuilds}
            className="text-[10px] text-poe-textDim hover:text-poe-text"
          >
            清除
          </button>
        )}
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={handlePaste}
        className={`relative border rounded-md px-3 py-2 flex items-center gap-2 transition
          ${build
            ? 'border-poe-borderHighlight bg-poe-surfaceHighlight'
            : 'border-poe-border border-dashed bg-poe-surface hover:border-poe-borderHighlight'
          }`}
      >
        <Upload className="w-4 h-4 text-poe-textMuted shrink-0" />
        <span className="text-sm truncate min-w-0">
          {build
            ? `${build.character.name ?? 'Unknown'} (Lv.${build.character.level ?? '?'}) — ${build.character.className ?? '?'}`
            : '拖拽文件或粘贴 URL'}
        </span>
        <input
          type="file"
          accept=".build,.json,.xml"
          onChange={handleChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
