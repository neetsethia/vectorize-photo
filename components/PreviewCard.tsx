
import React, { useState, useRef, useEffect } from 'react';
import { Download, Copy, RefreshCw, Layers, ChevronDown, FileCode, FileImage, FileType, Check } from 'lucide-react';

interface PreviewCardProps {
  originalUrl: string;
  vectorSvg: string | null;
  isProcessing: boolean;
  onReset: () => void;
  onDownload: (format: 'svg' | 'png' | 'pdf' | 'eps' | 'ai') => void;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({ 
  originalUrl, 
  vectorSvg, 
  isProcessing,
  onReset,
  onDownload
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = () => {
    if (vectorSvg) {
      navigator.clipboard.writeText(vectorSvg);
      alert("SVG code copied to clipboard!");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const downloadOptions = [
    { id: 'svg', name: 'SVG (Vector)', icon: <FileCode className="w-4 h-4" />, desc: 'Best for Web & Scaling', badge: 'PRO' },
    { id: 'png', name: 'PNG (Raster)', icon: <FileImage className="w-4 h-4" />, desc: 'High Res 4K Export', badge: '300DPI' },
    { id: 'pdf', name: 'PDF (Vector)', icon: <FileType className="w-4 h-4" />, desc: 'Print Ready Document' },
    { id: 'eps', name: 'EPS (Vector)', icon: <Layers className="w-4 h-4" />, desc: 'Standard for Print' },
    { id: 'ai', name: 'AI (Illustrator)', icon: <Check className="w-4 h-4" />, desc: 'Adobe Optimized' },
  ];

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Original Image Section */}
        <div className="p-6 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              Original Raster
            </h3>
          </div>
          <div className="aspect-square rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center relative">
             <img src={originalUrl} alt="Original" className="max-w-full max-h-full object-contain" />
          </div>
        </div>

        {/* Vectorized Section */}
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              AI Vector Result
            </h3>
            {vectorSvg && (
               <div className="flex gap-2">
                 <button 
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500" 
                  title="Copy SVG Code"
                >
                   <Copy className="w-4 h-4" />
                 </button>
               </div>
            )}
          </div>
          
          <div className="flex-grow aspect-square rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center relative group">
            {isProcessing ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="relative w-16 h-16">
                   <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                   <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-sm font-medium text-slate-500 animate-pulse">AI is tracing paths...</p>
              </div>
            ) : vectorSvg ? (
              <div 
                className="w-full h-full flex items-center justify-center p-4 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-50"
                dangerouslySetInnerHTML={{ __html: vectorSvg }}
              />
            ) : (
              <div className="text-center p-8">
                <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Waiting for conversion...</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3 relative" ref={dropdownRef}>
            <button
              onClick={onReset}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reset</span>
            </button>
            
            <div className="flex-grow flex items-stretch">
              <button
                onClick={() => onDownload('svg')}
                disabled={!vectorSvg || isProcessing}
                className="flex-grow px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-l-xl font-semibold transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download SVG</span>
              </button>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={!vectorSvg || isProcessing}
                className="px-3 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-400 text-white rounded-r-xl border-l border-indigo-500 transition-all flex items-center justify-center"
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                <div className="p-2 space-y-1">
                  {downloadOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        onDownload(opt.id as any);
                        setShowDropdown(false);
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-slate-50 flex items-center gap-3 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600">
                        {opt.icon}
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-700">{opt.name}</span>
                          {opt.badge && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-black">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
