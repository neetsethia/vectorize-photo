
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Save, MousePointer2, Move, Maximize2, Palette, Undo2, Layers, Trash2 } from 'lucide-react';

interface EditableShape {
  id: string;
  type: string;
  d: string;
  fill: string;
  x: number;
  y: number;
  scale: number;
  originalPath: string;
}

interface VectorEditorProps {
  svgString: string;
  onSave: (newSvg: string) => void;
  onClose: () => void;
  fileName: string;
}

export const VectorEditor: React.FC<VectorEditorProps> = ({ svgString, onSave, onClose, fileName }) => {
  const [shapes, setShapes] = useState<EditableShape[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [tool, setTool] = useState<'select' | 'move' | 'scale' | 'color'>('select');
  const [viewBox, setViewBox] = useState({ w: 1000, h: 1000 });
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Parse SVG string into editable objects
  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    
    if (svgEl) {
      const vb = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number) || [0, 0, 1000, 1000];
      setViewBox({ w: vb[2] || 1000, h: vb[3] || 1000 });

      const paths = Array.from(doc.querySelectorAll('path, rect, circle')).map((el, i) => {
        let d = '';
        if (el.tagName === 'path') d = el.getAttribute('d') || '';
        else if (el.tagName === 'rect') {
          const w = el.getAttribute('width') || '0';
          const h = el.getAttribute('height') || '0';
          const x = el.getAttribute('x') || '0';
          const y = el.getAttribute('y') || '0';
          d = `M${x},${y}h${w}v${h}h-${w}z`;
        }

        return {
          id: `shape-${i}`,
          type: el.tagName,
          d: d,
          originalPath: d,
          fill: el.getAttribute('fill') || '#000000',
          x: 0,
          y: 0,
          scale: 1,
        };
      });
      setShapes(paths);
    }
  }, [svgString]);

  const getMousePos = (e: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d
    };
  };

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setSelectedIndex(index);
    isDragging.current = true;
    lastPos.current = getMousePos(e);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || selectedIndex === null) return;

    const currentPos = getMousePos(e);
    const dx = currentPos.x - lastPos.current.x;
    const dy = currentPos.y - lastPos.current.y;

    setShapes(prev => prev.map((s, i) => {
      if (i !== selectedIndex) return s;
      
      if (tool === 'move') {
        return { ...s, x: s.x + dx, y: s.y + dy };
      } else if (tool === 'scale') {
        const factor = 1 + (dx / 100);
        return { ...s, scale: Math.max(0.1, s.scale * factor) };
      }
      return s;
    }));

    lastPos.current = currentPos;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [tool, selectedIndex]);

  const handleColorChange = (color: string) => {
    if (selectedIndex !== null) {
      setShapes(prev => prev.map((s, i) => i === selectedIndex ? { ...s, fill: color } : s));
    }
  };

  const deleteSelected = () => {
    if (selectedIndex !== null) {
      setShapes(prev => prev.filter((_, i) => i !== selectedIndex));
      setSelectedIndex(null);
    }
  };

  const generateSvg = () => {
    const paths = shapes.map(s => {
      const transform = `translate(${s.x}, ${s.y}) scale(${s.scale})`;
      return `<path d="${s.d}" fill="${s.fill}" transform="${transform}" />`;
    }).join('\n');
    return `<svg viewBox="0 0 ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">\n${paths}\n</svg>`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
      {/* Top Bar */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-slate-900">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-white font-bold text-sm leading-tight">Vector Editor</h2>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">{fileName}</p>
          </div>
        </div>

        <div className="flex items-center bg-slate-800 p-1 rounded-xl gap-1">
          <ToolButton active={tool === 'select'} onClick={() => setTool('select')} icon={<MousePointer2 className="w-4 h-4" />} label="Select" />
          <ToolButton active={tool === 'move'} onClick={() => setTool('move')} icon={<Move className="w-4 h-4" />} label="Move" />
          <ToolButton active={tool === 'scale'} onClick={() => setTool('scale')} icon={<Maximize2 className="w-4 h-4" />} label="Scale" />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <ToolButton active={tool === 'color'} onClick={() => setTool('color')} icon={<Palette className="w-4 h-4" />} label="Styles" />
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => onSave(generateSvg())}
            className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Save className="w-4 h-4" />
            Apply Changes
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-grow flex overflow-hidden">
        {/* Sidebar Tools */}
        <aside className="w-64 border-r border-white/10 bg-slate-900 p-4 space-y-6">
          <div className="space-y-4">
            <h3 className="text-white/40 text-[10px] uppercase font-black tracking-widest">Properties</h3>
            {selectedIndex !== null ? (
              <div className="space-y-4 animate-in slide-in-from-left-2">
                <div className="p-3 bg-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs">Fill Color</span>
                    <input 
                      type="color" 
                      value={shapes[selectedIndex].fill}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="w-6 h-6 rounded border-none bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold">Scaling</label>
                    <input 
                      type="range" min="0.1" max="3" step="0.1"
                      value={shapes[selectedIndex].scale}
                      onChange={(e) => setShapes(prev => prev.map((s, i) => i === selectedIndex ? { ...s, scale: parseFloat(e.target.value) } : s))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>
                <button 
                  onClick={deleteSelected}
                  className="w-full py-2 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-bold hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Path
                </button>
              </div>
            ) : (
              <div className="text-center py-12 px-4 border border-dashed border-white/5 rounded-2xl">
                <MousePointer2 className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-xs">Select a vector path to edit its properties</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-white/40 text-[10px] uppercase font-black tracking-widest">Layers ({shapes.length})</h3>
            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {shapes.map((s, i) => (
                <button 
                  key={s.id}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full text-left p-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${selectedIndex === i ? 'bg-indigo-600 text-white' : 'hover:bg-white/5 text-slate-400'}`}
                >
                  <div className="w-4 h-4 rounded border border-white/10" style={{ backgroundColor: s.fill }} />
                  Path {i + 1}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-grow relative bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] flex items-center justify-center p-12">
          <div className="bg-white shadow-2xl rounded-sm overflow-hidden relative" style={{ width: '80vh', height: '80vh' }}>
            <svg 
              ref={svgRef}
              viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
              className="w-full h-full cursor-crosshair"
              onClick={() => setSelectedIndex(null)}
            >
              {shapes.map((s, i) => (
                <path
                  key={s.id}
                  d={s.d}
                  fill={s.fill}
                  transform={`translate(${s.x}, ${s.y}) scale(${s.scale})`}
                  onMouseDown={(e) => handleMouseDown(e, i)}
                  className={`transition-shadow cursor-move ${selectedIndex === i ? 'stroke-indigo-500 stroke-[4px] stroke-dasharray-[10,5]' : 'hover:stroke-slate-300 hover:stroke-[2px]'}`}
                />
              ))}
            </svg>
            
            {/* Info Overlay */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 text-[10px] text-white/80 font-mono">
              Viewport: {viewBox.w}x{viewBox.h} | Selection: {selectedIndex !== null ? `#${selectedIndex}` : 'None'}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-white/5'}`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);
