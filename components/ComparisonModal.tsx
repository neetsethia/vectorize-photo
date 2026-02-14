
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Layers, Image as ImageIcon, ArrowRightLeft } from 'lucide-react';
import { BatchItem, ConversionMode } from '../types.ts';

interface ComparisonModalProps {
  item: BatchItem;
  conversionMode: ConversionMode;
  onClose: () => void;
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({ item, conversionMode, onClose }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent | React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.min(Math.max(x, 0), 100));
  };

  // Fix: Added useMemo to imports from 'react' to resolve reference error
  const svgUrl = useMemo(() => {
    if (item.result && conversionMode === 'raster-to-vector') {
        return URL.createObjectURL(new Blob([item.result], { type: 'image/svg+xml' }));
    }
    return null;
  }, [item.result, conversionMode]);

  useEffect(() => {
    return () => {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
    };
  }, [svgUrl]);

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-slate-900">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-white font-bold text-sm">Quality Inspection</h2>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">{item.file.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-2 text-white/40">
            <ImageIcon className="w-3.5 h-3.5" /> Source
          </div>
          <div className="w-px h-3 bg-white/20" />
          <div className="flex items-center gap-2 text-[#E95420]">
             Vector Result <Layers className="w-3.5 h-3.5" />
          </div>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-12 overflow-hidden">
        <div 
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="relative max-w-full max-h-full aspect-square bg-white shadow-2xl rounded overflow-hidden cursor-ew-resize group"
          style={{ width: '80vh', height: '80vh' }}
        >
          {/* Base Image (Original) */}
          <img 
            src={item.previewUrl} 
            alt="Original" 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Top Image (Result) */}
          <div 
            className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
            style={{ width: `${sliderPos}%`, borderRight: '2px solid #E95420' }}
          >
            <div className="w-[80vh] h-[80vh] max-w-none max-h-none">
                <img 
                    src={conversionMode === 'raster-to-vector' ? svgUrl! : item.result!} 
                    className="w-full h-full object-contain"
                />
            </div>
          </div>

          {/* Slider UI Handle */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-[#E95420] pointer-events-none flex items-center justify-center"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="w-8 h-8 rounded-full bg-[#E95420] shadow-xl flex items-center justify-center text-white scale-110">
              <ArrowRightLeft className="w-4 h-4 rotate-90" />
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-4 left-4 bg-black/40 text-white text-[10px] px-2 py-1 rounded backdrop-blur">ORIGINAL</div>
          <div className="absolute top-4 right-4 bg-[#E95420]/80 text-white text-[10px] px-2 py-1 rounded backdrop-blur">VECTORIZED</div>
        </div>
      </main>

      <footer className="h-16 border-t border-white/10 flex items-center justify-center gap-8 bg-slate-900/50 text-slate-400 text-xs">
        <p>Move mouse over image to compare precision</p>
      </footer>
    </div>
  );
};
