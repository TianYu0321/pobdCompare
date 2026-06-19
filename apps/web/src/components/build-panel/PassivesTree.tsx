import { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Move } from 'lucide-react';

interface TreeNode {
  id: number;
  name: string;
  x: number;
  y: number;
  icon: string;
  stats: string[];
  connections: number[];
  isNotable: boolean;
  isKeystone: boolean;
  isMastery: boolean;
  ascendancyName: string;
  classStartIndex: number | null;
  isAscendancyStart: boolean;
  orbit: number;
  orbitIndex: number;
  group: number;
}

interface TreeData {
  nodes: TreeNode[];
  bounds: { min_x: number; max_x: number; min_y: number; max_y: number };
}

interface PassivesTreeProps {
  allocatedNodeIds: number[];
}

const NODE_COLORS = {
  normal: { fill: '#5c5668', stroke: '#3a3542', radius: 4 },
  allocated: { fill: '#4caf50', stroke: '#66bb6a', radius: 5 },
  notable: { fill: '#c8a415', stroke: '#ffd54f', radius: 7 },
  notableAllocated: { fill: '#ffeb3b', stroke: '#fff176', radius: 7 },
  keystone: { fill: '#af6025', stroke: '#ff9800', radius: 10 },
  keystoneAllocated: { fill: '#ff9800', stroke: '#ffcc80', radius: 10 },
  ascendancy: { fill: '#4a90d9', stroke: '#64b5f6', radius: 5 },
  ascendancyAllocated: { fill: '#64b5f6', stroke: '#90caf9', radius: 5 },
  mastery: { fill: '#9c27b0', stroke: '#ce93d8', radius: 6 },
};

export default function PassivesTree({ allocatedNodeIds }: PassivesTreeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [scale, setScale] = useState(0.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Load tree data
  useEffect(() => {
    fetch('/tree_full.json')
      .then((r) => r.json())
      .then((d) => {
        setTreeData(d);
        // Center the tree initially
        const bounds = d.bounds;
        const cx = (bounds.min_x + bounds.max_x) / 2;
        const cy = (bounds.min_y + bounds.max_y) / 2;
        panRef.current = { x: -cx * 0.15, y: -cy * 0.15 };
        setPan({ x: -cx * 0.15, y: -cy * 0.15 });
      })
      .catch(console.error);
  }, []);

  const allocatedSet = new Set(allocatedNodeIds);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !treeData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.fillStyle = '#0f0e12';
    ctx.fillRect(0, 0, w, h);

    const s = scale;
    const px = pan.x + w / 2;
    const py = pan.y + h / 2;

    // Build node map for connection lookup
    const nodeMap = new Map<number, TreeNode>();
    for (const n of treeData.nodes) nodeMap.set(n.id, n);

    // Draw connections (only for allocated nodes, or all with low opacity)
    ctx.lineWidth = 1.5;
    for (const n of treeData.nodes) {
      const isAllocated = allocatedSet.has(n.id);
      for (const cid of n.connections) {
        const target = nodeMap.get(cid);
        if (!target) continue;

        const tAllocated = allocatedSet.has(cid);

        // Both allocated: bright green line
        if (isAllocated && tAllocated) {
          ctx.strokeStyle = '#4caf50';
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 2.5;
        }
        // One allocated: dim line
        else if (isAllocated || tAllocated) {
          ctx.strokeStyle = '#3a3542';
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1;
        }
        // Neither allocated: very dim
        else {
          ctx.strokeStyle = '#25222b';
          ctx.globalAlpha = 0.15;
          ctx.lineWidth = 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(n.x * s + px, n.y * s + py);
        ctx.lineTo(target.x * s + px, target.y * s + py);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    // Draw orbit rings (simple circles for each group)
    const drawnRings = new Set<string>();
    for (const n of treeData.nodes) {
      const group = treeData.nodes.find((nn) => nn.group === n.group && nn.orbit === 0);
      if (!group) continue;

      const orbitRadii = [0, 82, 162, 335, 493, 662, 841, 1025, 1232, 1445];
      const radius = orbitRadii[n.orbit] || 0;
      if (radius === 0) continue;

      const key = `${n.group}-${n.orbit}`;
      if (drawnRings.has(key)) continue;
      drawnRings.add(key);

      const anyAllocatedInOrbit = treeData.nodes.some(
        (nn) => nn.group === n.group && nn.orbit === n.orbit && allocatedSet.has(nn.id)
      );

      ctx.beginPath();
      ctx.arc(group.x * s + px, group.y * s + py, radius * s, 0, Math.PI * 2);
      ctx.strokeStyle = anyAllocatedInOrbit ? '#3a3542' : '#1a181f';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw nodes
    for (const n of treeData.nodes) {
      const isAllocated = allocatedSet.has(n.id);
      const nx = n.x * s + px;
      const ny = n.y * s + py;

      // Skip if off-screen (culling)
      if (nx < -20 || nx > w + 20 || ny < -20 || ny > h + 20) continue;

      let style;
      if (n.isKeystone) {
        style = isAllocated ? NODE_COLORS.keystoneAllocated : NODE_COLORS.keystone;
      } else if (n.isNotable) {
        style = isAllocated ? NODE_COLORS.notableAllocated : NODE_COLORS.notable;
      } else if (n.ascendancyName) {
        style = isAllocated ? NODE_COLORS.ascendancyAllocated : NODE_COLORS.ascendancy;
      } else if (n.isMastery) {
        style = NODE_COLORS.mastery;
      } else {
        style = isAllocated ? NODE_COLORS.allocated : NODE_COLORS.normal;
      }

      // Draw glow for allocated nodes
      if (isAllocated) {
        ctx.beginPath();
        ctx.arc(nx, ny, style.radius * 1.5 + 2, 0, Math.PI * 2);
        ctx.fillStyle = style.fill;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Draw node circle
      ctx.beginPath();
      ctx.arc(nx, ny, style.radius, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = isAllocated ? 2 : 1;
      ctx.stroke();
    }

    // Draw node labels (only for notables, keystones, and allocated nodes at higher zoom)
    if (s > 0.25) {
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      for (const n of treeData.nodes) {
        const isAllocated = allocatedSet.has(n.id);
        if (!isAllocated && !n.isNotable && !n.isKeystone && !n.ascendancyName) continue;

        const nx = n.x * s + px;
        const ny = n.y * s + py;
        if (nx < -50 || nx > w + 50 || ny < -50 || ny > h + 50) continue;

        const name = n.name || `Node ${n.id}`;
        if (!name || name === 'Attribute') continue;

        ctx.fillStyle = isAllocated ? '#e0dce6' : '#5c5668';
        ctx.fillText(name, nx, ny - (n.isKeystone ? 14 : n.isNotable ? 10 : 8));
      }
    }
  }, [treeData, scale, pan, allocatedNodeIds]);

  // Redraw on changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: mx, y: my });

    if (isDragging) {
      const newPan = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      panRef.current = newPan;
      setPan(newPan);
    } else if (treeData) {
      // Find hovered node
      const s = scale;
      const px = pan.x + rect.width / 2;
      const py = pan.y + rect.height / 2;

      let closest: TreeNode | null = null;
      let closestDist = Infinity;
      for (const n of treeData.nodes) {
        const nx = n.x * s + px;
        const ny = n.y * s + py;
        const dist = Math.hypot(nx - mx, ny - my);
        const radius = n.isKeystone ? 10 : n.isNotable ? 7 : 5;
        if (dist < radius + 4 && dist < closestDist) {
          closest = n;
          closestDist = dist;
        }
      }
      setHoveredNode(closest);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.05, Math.min(3, scale * zoomFactor));

    // Zoom towards mouse position
    const scaleRatio = newScale / scale;
    const newPan = {
      x: pan.x - (mx - rect.width / 2) * (scaleRatio - 1),
      y: pan.y - (my - rect.height / 2) * (scaleRatio - 1),
    };

    setScale(newScale);
    panRef.current = newPan;
    setPan(newPan);
  };

  if (!treeData) {
    return (
      <div className="h-[500px] flex items-center justify-center text-poe-textDim">
        加载天赋树数据...
      </div>
    );
  }

  return (
    <div className="relative w-full h-[500px] bg-poe-bg rounded border border-poe-border overflow-hidden">
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setScale((s) => Math.min(3, s * 1.2))}
          className="p-1.5 rounded bg-poe-surface border border-poe-border text-poe-text hover:bg-poe-surfaceHighlight"
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.05, s * 0.8))}
          className="p-1.5 rounded bg-poe-surface border border-poe-border text-poe-text hover:bg-poe-surfaceHighlight"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            const bounds = treeData.bounds;
            const cx = (bounds.min_x + bounds.max_x) / 2;
            const cy = (bounds.min_y + bounds.max_y) / 2;
            const newPan = { x: -cx * 0.15, y: -cy * 0.15 };
            setScale(0.15);
            panRef.current = newPan;
            setPan(newPan);
          }}
          className="p-1.5 rounded bg-poe-surface border border-poe-border text-poe-text hover:bg-poe-surfaceHighlight"
          title="重置视图"
        >
          <Move className="w-4 h-4" />
        </button>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-10 bg-poe-surface border border-poe-border rounded p-2 max-w-[200px] pointer-events-none"
          style={{
            left: Math.min(mousePos.x + 10, (canvasRef.current?.width || 0) / (window.devicePixelRatio || 1) - 210),
            top: Math.min(mousePos.y + 10, (canvasRef.current?.height || 0) / (window.devicePixelRatio || 1) - 150),
          }}
        >
          <div className={`font-semibold text-sm ${
            hoveredNode.isKeystone ? 'text-poe-unique' : 
            hoveredNode.isNotable ? 'text-poe-rare' : 
            hoveredNode.ascendancyName ? 'text-poe-magic' : 'text-poe-text'
          }`}>
            {hoveredNode.name || `节点 #${hoveredNode.id}`}
          </div>
          {hoveredNode.stats.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {hoveredNode.stats.slice(0, 3).map((s, i) => (
                <div key={i} className="text-xs text-poe-textMuted">{s}</div>
              ))}
            </div>
          )}
          {hoveredNode.ascendancyName && (
            <div className="text-xs text-poe-magic mt-1">{hoveredNode.ascendancyName}</div>
          )}
          <div className="text-xs text-poe-textDim mt-1">
            {allocatedSet.has(hoveredNode.id) ? '✓ 已分配' : '未分配'}
          </div>
        </div>
      )}

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-2 z-10 text-xs text-poe-textMuted space-y-0.5">
        <div>节点: {treeData.nodes.length}</div>
        <div>已分配: {allocatedNodeIds.length}</div>
        <div>缩放: {(scale * 100).toFixed(0)}%</div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 z-10 bg-poe-surface border border-poe-border rounded p-2 text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#4caf50]" />
          <span className="text-poe-text">已分配</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#af6025]" />
          <span className="text-poe-text">Keystone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#c8a415]" />
          <span className="text-poe-text">Notable</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#4a90d9]" />
          <span className="text-poe-text">Ascendancy</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  );
}
