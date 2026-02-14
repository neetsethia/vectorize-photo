import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  Github, Zap, X, CheckCircle2, Loader2, Archive, 
  Layers, Files, Settings2, WifiOff, Activity, 
  Edit3, Monitor, Box, FileDown, Play, StopCircle, 
  RotateCcw, ArrowRightLeft, Image as ImageIcon,
  Eye, Wand2, Palette, FileText, ChevronDown,
  FileCode
} from 'lucide-react';
import { Dropzone } from './components/Dropzone.tsx';
import { VectorEditor } from './components/VectorEditor.tsx';
import { ComparisonModal } from './components/ComparisonModal.tsx';
import { ProcessingStep, BatchItem, BatchConfig, ConversionMode } from './types.ts';
import { convertToVector } from './services/gemini.ts';
import { traceImageOffline } from './services/offlineTracer.ts';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

export default function App() {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversionMode, setConversionMode] = useState<ConversionMode>('raster-to-vector');
  const [showBatchExportDropdown, setShowBatchExportDropdown] = useState(false);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [activeCompareId, setActiveCompareId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('Standard');
  const batchExportRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [config, setConfig] = useState<BatchConfig>({
    simplification: 20,
    offlineMode: true,
    targetResolution: 1,
    maxFileSizeKB: 0,
    pdfPageSize: 'a4',
    pdfOrientation: 'p',
    pdfMargins: 10,
  });

  const resolutionLabels = ["Low", "Standard", "HD", "Ultra", "Insane"];
  const presets = [
    { name: 'Standard', simplification: 20, icon: <Zap className="w-3 h-3" /> },
    { name: 'Logo', simplification: 40, icon: <Layers className="w-3 h-3" /> },
    { name: 'Detailed', simplification: 5, icon: <Activity className="w-3 h-3" /> },
    { name: 'Stencil', simplification: 70, icon: <Palette className="w-3 h-3" /> },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (batchExportRef.current && !batchExportRef.current.contains(event.target as Node)) {
        setShowBatchExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleImagesSelected = useCallback((files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: ProcessingStep.IDLE,
      result: null,
      error: null,
      progress: 0,
    }));
    setBatchItems(prev => [...prev, ...newItems]);
  }, []);

  const clearQueue = useCallback(() => {
    batchItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setBatchItems([]);
    setIsProcessing(false);
    abortControllerRef.current?.abort();
  }, [batchItems]);

  const cancelBatch = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsProcessing(false);
  }, []);

  const processBatch = async () => {
    if (batchItems.length === 0 || isProcessing) return;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    const itemsToProcess = batchItems.filter(item => item.status !== ProcessingStep.COMPLETED);

    for (const item of itemsToProcess) {
      if (abortControllerRef.current?.signal.aborted) break;

      setBatchItems(prev => prev.map(bi => 
        bi.id === item.id ? { ...bi, status: ProcessingStep.ANALYZING, progress: 10 } : bi
      ));

      try {
        if (conversionMode === 'raster-to-vector') {
          let svg = '';
          if (config.offlineMode) {
            svg = await traceImageOffline(item.file, config.simplification);
          } else {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(item.file);
            });
            const base64 = await base64Promise;
            svg = await convertToVector(base64, item.file.type, config.simplification);
          }
          setBatchItems(prev => prev.map(bi => 
            bi.id === item.id ? { ...bi, status: ProcessingStep.COMPLETED, result: svg, progress: 100 } : bi
          ));
        } else {
          const svgText = await item.file.text();
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          const resultDataUrl = await new Promise<string>((resolve, reject) => {
            img.onload = () => {
              const scale = [1, 2, 4, 8, 16][config.targetResolution];
              canvas.width = (img.width || 800) * scale;
              canvas.height = (img.height || 800) * scale;
              ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject('Failed to load SVG');
            const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
            img.src = URL.createObjectURL(blob);
          });
          
          setBatchItems(prev => prev.map(bi => 
            bi.id === item.id ? { ...bi, status: ProcessingStep.COMPLETED, result: resultDataUrl, progress: 100 } : bi
          ));
        }
      } catch (err: any) {
        setBatchItems(prev => prev.map(bi => 
          bi.id === item.id ? { ...bi, status: ProcessingStep.ERROR, error: err.message || 'Processing failed', progress: 0 } : bi
        ));
      }
    }
    setIsProcessing(false);
  };

  const downloadAllPDF = async () => {
    const completed = batchItems.filter(i => i.status === ProcessingStep.COMPLETED && i.result);
    if (completed.length === 0) return;

    const isFit = config.pdfPageSize === 'fit';
    const pdf = new jsPDF({
      orientation: config.pdfOrientation,
      unit: 'mm',
      format: isFit ? 'a4' : config.pdfPageSize
    });

    for (let i = 0; i < completed.length; i++) {
      const item = completed[i];
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = item.previewUrl;
      });

      const srcWidth = img.naturalWidth;
      const srcHeight = img.naturalHeight;
      const ratio = srcWidth / srcHeight;

      if (i > 0) {
        if (isFit) {
          pdf.addPage([srcWidth, srcHeight], ratio > 1 ? 'l' : 'p');
        } else {
          pdf.addPage();
        }
      } else if (isFit) {
        pdf.deletePage(1);
        pdf.addPage([srcWidth, srcHeight], ratio > 1 ? 'l' : 'p');
      }

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = config.pdfMargins;
      const availableWidth = pageWidth - (margin * 2);
      const availableHeight = pageHeight - (margin * 2);

      let drawWidth = availableWidth;
      let drawHeight = availableWidth / ratio;

      if (drawHeight > availableHeight) {
        drawHeight = availableHeight;
        drawWidth = availableHeight * ratio;
      }

      const x = margin + (availableWidth - drawWidth) / 2;
      const y = margin + (availableHeight - drawHeight) / 2;
      const dataUrl = conversionMode === 'vector-to-raster' ? item.result! : item.previewUrl;
      pdf.addImage(dataUrl, 'PNG', x, y, drawWidth, drawHeight);
    }

    pdf.save(`VectorAI_Export_${new Date().getTime()}.pdf`);
    setShowBatchExportDropdown(false);
  };

  const downloadAllZip = async () => {
    const zip = new JSZip();
    const completed = batchItems.filter(i => i.status === ProcessingStep.COMPLETED && i.result);
    
    completed.forEach((item, idx) => {
      const ext = conversionMode === 'raster-to-vector' ? 'svg' : 'png';
      const fileName = item.file.name.replace(/\.[^/.]+$/, "") + `_${idx}.${ext}`;
      const content = item.result!;
      
      if (conversionMode === 'raster-to-vector') {
        zip.file(fileName, content);
      } else {
        const base64Data = content.split(',')[1];
        zip.file(fileName, base64Data, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `VectorAI_Batch_${new Date().getTime()}.zip`;
    link.click();
    setShowBatchExportDropdown(false);
  };

  const refineWithAI = async (id: string) => {
    const item = batchItems.find(i => i.id === id);
    if (!item) return;

    setBatchItems(prev => prev.map(bi => bi.id === id ? { ...bi, status: ProcessingStep.CLEANING, progress: 40 } : bi));
    
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(item.file);
      });
      const base64 = await base64Promise;
      const refinedSvg = await convertToVector(base64, item.file.type, config.simplification);
      setBatchItems(prev => prev.map(bi => bi.id === id ? { ...bi, status: ProcessingStep.COMPLETED, result: refinedSvg, progress: 100 } : bi));
    } catch (err: any) {
       setBatchItems(prev => prev.map(bi => bi.id === id ? { ...bi, status: ProcessingStep.ERROR, error: 'AI Refinement failed' } : bi));
    }
  };

  const removeBatchItem = (id: string) => {
    setBatchItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const overallProgress = useMemo(() => {
    if (batchItems.length === 0) return 0;
    const totalProgress = batchItems.reduce((acc, item) => acc + item.progress, 0);
    return Math.round(totalProgress / batchItems.length);
  }, [batchItems]);

  const completedCount = useMemo(() => 
    batchItems.filter(i => i.status === ProcessingStep.COMPLETED).length, 
  [batchItems]);

  const applyPreset = (preset: typeof presets[0]) => {
    setSelectedPreset(preset.name);
    setConfig(prev => ({ ...prev, simplification: preset.simplification }));
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-80 bg-slate-900 text-white flex flex-col shadow-2xl fixed h-full z-50">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">VectorAI</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Pro Edition</p>
              <a 
                href="https://x.com/navneeit" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors block mt-0.5"
              >
                @navneeit
              </a>
            </div>
          </div>
        </div>

        <nav className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex items-center gap-2">
              <ArrowRightLeft className="w-3 h-3" /> Operation Mode
            </h3>
            <div className="bg-slate-800 p-1 rounded-xl flex gap-1 border border-slate-700">
              <button 
                onClick={() => !isProcessing && setConversionMode('raster-to-vector')}
                className={`flex-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 ${conversionMode === 'raster-to-vector' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <ImageIcon className="w-3 h-3" /> Vectorize
              </button>
              <button 
                onClick={() => !isProcessing && setConversionMode('vector-to-raster')}
                className={`flex-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 ${conversionMode === 'vector-to-raster' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <FileCode className="w-3 h-3" /> Rasterize
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> Trace Engine
            </h3>
            <div className="space-y-4">
              {conversionMode === 'raster-to-vector' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {presets.map(p => (
                      <button
                        key={p.name}
                        onClick={() => applyPreset(p)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${selectedPreset === p.name ? 'bg-white text-slate-900 border-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                      >
                        {p.icon} {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-400">Simplification</span>
                      <span className="text-indigo-400 font-bold">{config.simplification}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="5" 
                      value={config.simplification} 
                      disabled={isProcessing}
                      onChange={(e) => {
                        setConfig({...config, simplification: parseInt(e.target.value)});
                        setSelectedPreset('Custom');
                      }}
                      className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-400">Output Detail</span>
                  <span className="text-indigo-400 font-bold">{resolutionLabels[config.targetResolution]}</span>
                </div>
                <input 
                  type="range" min="0" max="4" step="1" 
                  value={config.targetResolution} 
                  disabled={isProcessing}
                  onChange={(e) => setConfig({...config, targetResolution: parseInt(e.target.value)})}
                  className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex items-center gap-2">
              <FileText className="w-3 h-3" /> PDF Layout
            </h3>
            <div className="space-y-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-400">Page Size</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['a4', 'letter', 'fit'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => setConfig({...config, pdfPageSize: size})}
                      className={`py-1.5 rounded-lg text-[9px] font-bold uppercase ${config.pdfPageSize === size ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-400">Orientation</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setConfig({...config, pdfOrientation: 'p'})}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase flex items-center justify-center gap-1 ${config.pdfOrientation === 'p' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                  >
                    <Monitor className="w-3 h-3" /> Port
                  </button>
                  <button
                    onClick={() => setConfig({...config, pdfOrientation: 'l'})}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase flex items-center justify-center gap-1 ${config.pdfOrientation === 'l' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                  >
                    <Monitor className="w-3 h-3 rotate-90" /> Land
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
                  <span>Margins</span>
                  <span className="text-indigo-400">{config.pdfMargins}mm</span>
                </div>
                <input 
                  type="range" min="0" max="50" step="5" 
                  value={config.pdfMargins} 
                  onChange={(e) => setConfig({...config, pdfMargins: parseInt(e.target.value)})}
                  className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex items-center gap-2">
              <WifiOff className="w-3 h-3" /> System
            </h3>
            <button 
              onClick={() => setConfig({...config, offlineMode: !config.offlineMode})}
              className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${config.offlineMode ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
            >
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4" />
                <span className="text-sm font-bold">Local Tracing</span>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${config.offlineMode ? 'bg-indigo-500' : 'bg-slate-600'}`}>
                <div className={`absolute top-1 w-2 h-2 bg-white rounded-full transition-all ${config.offlineMode ? 'left-5' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </nav>
      </aside>

      <main className="flex-grow ml-80 p-8 min-h-screen">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {conversionMode === 'raster-to-vector' ? 'Vectorize Photos' : 'Render Assets'}
            </h2>
            <p className="text-sm text-slate-500">Professional path generation and rendering queue</p>
          </div>
          
          {batchItems.length > 0 && (
            <div className="flex items-center gap-3">
              <button onClick={clearQueue} disabled={isProcessing} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold shadow-sm flex items-center gap-2 hover:bg-slate-50">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <div className="flex items-center gap-2 relative" ref={batchExportRef}>
                {completedCount > 0 && (
                   <button 
                    onClick={() => setShowBatchExportDropdown(!showBatchExportDropdown)}
                    className="px-4 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-lg font-bold shadow-sm flex items-center gap-2 hover:bg-slate-50"
                  >
                    <FileDown className="w-4 h-4 text-indigo-600" /> Export
                  </button>
                )}
                {showBatchExportDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-2xl z-[60] overflow-hidden">
                    <button onClick={downloadAllZip} className="w-full text-left p-3 hover:bg-slate-50 rounded-lg flex items-center gap-3">
                      <Archive className="w-4 h-4 text-slate-400" /> ZIP Archive
                    </button>
                    <button onClick={downloadAllPDF} className="w-full text-left p-3 hover:bg-slate-50 rounded-lg flex items-center gap-3">
                      <FileText className="w-4 h-4 text-red-500" /> Unified PDF
                    </button>
                  </div>
                )}
                {!isProcessing ? (
                   <button onClick={processBatch} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 flex items-center gap-2 hover:bg-indigo-700 transition-colors">
                    <Play className="w-4 h-4" /> Run
                  </button>
                ) : (
                  <button onClick={cancelBatch} className="px-6 py-2.5 bg-slate-800 text-white rounded-lg font-bold shadow-lg flex items-center gap-2">
                    <StopCircle className="w-4 h-4 animate-pulse text-red-500" /> Stop
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        {isProcessing && (
          <div className="mb-6 bg-white p-4 rounded-xl border border-slate-100 shadow-sm animate-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Processing...</span>
              <span className="text-xs font-bold text-slate-500">{overallProgress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
               <div className="h-full bg-indigo-600 transition-all" style={{ width: `${overallProgress}%` }} />
            </div>
          </div>
        )}

        {batchItems.length === 0 ? (
          <div className="max-w-4xl mx-auto mt-20">
            <Dropzone onImagesSelected={handleImagesSelected} isProcessing={isProcessing} accept={conversionMode === 'raster-to-vector' ? 'image/*' : '.svg'} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {batchItems.map((item) => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden group hover:border-indigo-500 transition-all shadow-sm hover:shadow-md">
                <div className="aspect-square bg-slate-50 relative flex items-center justify-center p-4">
                  <img src={item.previewUrl} alt="preview" className="max-w-full max-h-full object-contain" />
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm px-4">
                    {!isProcessing && (
                      <>
                        <button onClick={() => removeBatchItem(item.id)} className="p-2 bg-white rounded-lg text-rose-600 shadow-lg hover:bg-rose-50"><X className="w-5 h-5" /></button>
                        {item.result && (
                          <>
                            <button onClick={() => setActiveCompareId(item.id)} className="p-2 bg-white rounded-lg text-indigo-600 shadow-lg hover:bg-indigo-50"><Eye className="w-5 h-5" /></button>
                            {conversionMode === 'raster-to-vector' && (
                              <>
                                <button onClick={() => setActiveEditId(item.id)} className="p-2 bg-white rounded-lg text-amber-600 shadow-lg hover:bg-amber-50"><Edit3 className="w-5 h-5" /></button>
                                <button onClick={() => refineWithAI(item.id)} className="p-2 bg-white rounded-lg text-emerald-600 shadow-lg hover:bg-emerald-50"><Wand2 className="w-5 h-5" /></button>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="absolute top-2 right-2">
                    {item.status === ProcessingStep.COMPLETED && <CheckCircle2 className="w-6 h-6 text-emerald-500 fill-white" />}
                    {item.status === ProcessingStep.ANALYZING && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
                  </div>
                </div>
                <div className="p-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-700 truncate">{item.file.name}</p>
                </div>
              </div>
            ))}
            <button onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()} className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-all bg-slate-50 hover:bg-indigo-50/10">
              <Files className="w-8 h-8" />
              <span className="text-[10px] font-bold uppercase">Add Item</span>
            </button>
          </div>
        )}
      </main>

      {activeEditId && batchItems.find(i => i.id === activeEditId)?.result && (
        <VectorEditor 
          svgString={batchItems.find(i => i.id === activeEditId)!.result!} 
          fileName={batchItems.find(i => i.id === activeEditId)!.file.name}
          onSave={(newSvg) => {
            setBatchItems(prev => prev.map(i => i.id === activeEditId ? { ...i, result: newSvg } : i));
            setActiveEditId(null);
          }}
          onClose={() => setActiveEditId(null)}
        />
      )}

      {activeCompareId && batchItems.find(i => i.id === activeCompareId) && (
        <ComparisonModal 
          item={batchItems.find(i => i.id === activeCompareId)!} 
          conversionMode={conversionMode} 
          onClose={() => setActiveCompareId(null)}
        />
      )}
    </div>
  );
}