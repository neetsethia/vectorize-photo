
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  Sparkles, Github, Zap, X, CheckCircle2, Loader2, Archive, 
  Layers, Files, Settings2, WifiOff, Activity, 
  Edit3, Monitor, Box, FileDown, Play, StopCircle, 
  RotateCcw, ArrowRightLeft, Image as ImageIcon,
  Eye, Wand2, Palette, FileText, ChevronDown,
  // Added FileCode to resolve missing import error
  FileCode
} from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { VectorEditor } from './components/VectorEditor';
import { ComparisonModal } from './components/ComparisonModal';
import { ProcessingStep, BatchItem, BatchConfig, ConversionMode } from './types';
import { convertToVector } from './services/gemini';
import { traceImageOffline } from './services/offlineTracer';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

const App: React.FC = () => {
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

  // Handle outside click for export menu
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
          // Vector to Raster logic
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

    // Detect if we need special sizing
    const isFit = config.pdfPageSize === 'fit';
    
    // Initial PDF setup
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

      // Calculate source aspect ratio (respecting user request for dimension preservation)
      const srcWidth = img.naturalWidth;
      const srcHeight = img.naturalHeight;
      const ratio = srcWidth / srcHeight;

      if (i > 0) {
        if (isFit) {
          // For 'fit' mode, we add a page that matches exactly the aspect ratio
          pdf.addPage([srcWidth, srcHeight], ratio > 1 ? 'l' : 'p');
        } else {
          pdf.addPage();
        }
      } else if (isFit) {
        // Handle first page sizing if fit
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

      // Use the raster preview for PDF embedding as browser-side SVG->PDF is limited in layout
      // but ensure high quality by taking the result if it was vector-to-raster
      const dataUrl = conversionMode === 'vector-to-raster' ? item.result! : item.previewUrl;
      pdf.addImage(dataUrl, 'PNG', x, y, drawWidth, drawHeight);
    }

    pdf.save(`VectorAI_Batch_Export_${new Date().getTime()}.pdf`);
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
    link.download = `VectorAI_Archive_${new Date().getTime()}.zip`;
    link.click();
    setShowBatchExportDropdown(false);
  };

  const refineWithAI = async (id: string) => {
    const item = batchItems.find(i => i.id === id);
    if (!item) return;

    setBatchItems(prev => prev.map(bi => bi.id === id ? { ...bi, status: ProcessingStep.ANALYZING, progress: 20 } : bi));
    
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
       setBatchItems(prev => prev.map(bi => bi.id === id ? { ...bi, status: ProcessingStep.ERROR, error: 'AI refinement failed' } : bi));
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
    <div className="flex min-h-screen bg-[#f7f7f7]">
      {/* Sidebar - Ubuntu Brand Identity */}
      <aside className="w-80 ubuntu-gradient text-white flex flex-col shadow-2xl fixed h-full z-50">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-[#E95420] p-2 rounded-lg">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">VectorAI</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Standard Web v2.8</p>
            </div>
          </div>
        </div>

        <nav className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
          {/* Conversion Direction */}
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
              <ArrowRightLeft className="w-3 h-3" /> Operation Mode
            </h3>
            <div className="bg-white/5 p-1 rounded-xl flex gap-1 border border-white/10">
              <button 
                onClick={() => !isProcessing && setConversionMode('raster-to-vector')}
                className={`flex-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 ${conversionMode === 'raster-to-vector' ? 'bg-[#E95420] text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
              >
                <ImageIcon className="w-3 h-3" />
                Vectorize
              </button>
              <button 
                onClick={() => !isProcessing && setConversionMode('vector-to-raster')}
                className={`flex-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 ${conversionMode === 'vector-to-raster' ? 'bg-[#E95420] text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
              >
                <FileCode className="w-3 h-3" />
                Rasterize
              </button>
            </div>
          </div>

          {/* Engine Settings */}
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> {conversionMode === 'raster-to-vector' ? 'Trace Parameters' : 'Render Scale'}
            </h3>
            
            <div className="space-y-4">
              {conversionMode === 'raster-to-vector' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {presets.map(p => (
                      <button
                        key={p.name}
                        onClick={() => applyPreset(p)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${selectedPreset === p.name ? 'bg-white text-[#300a24] border-white shadow-lg' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
                      >
                        {p.icon}
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Simplification</span>
                      <span className="text-[#E95420] font-bold">{config.simplification}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="5" 
                      value={config.simplification} 
                      disabled={isProcessing}
                      onChange={(e) => {
                        setConfig({...config, simplification: parseInt(e.target.value)});
                        setSelectedPreset('Custom');
                      }}
                      className="w-full accent-[#E95420] disabled:opacity-30" 
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Target Detail</span>
                  <span className="text-[#E95420] font-bold">{resolutionLabels[config.targetResolution]}</span>
                </div>
                <input 
                  type="range" min="0" max="4" step="1" 
                  value={config.targetResolution} 
                  disabled={isProcessing}
                  onChange={(e) => setConfig({...config, targetResolution: parseInt(e.target.value)})}
                  className="w-full accent-[#E95420] disabled:opacity-30" 
                />
              </div>
            </div>
          </div>

          {/* PDF Branding Options */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
              <FileText className="w-3 h-3" /> Document Output
            </h3>
            <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-white/60">Page Size</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['a4', 'letter', 'fit'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => setConfig({...config, pdfPageSize: size})}
                      className={`py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${config.pdfPageSize === size ? 'bg-[#E95420] text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-white/60">Orientation</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setConfig({...config, pdfOrientation: 'p'})}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 ${config.pdfOrientation === 'p' ? 'bg-[#E95420] text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    <Monitor className="w-3 h-3" /> Port
                  </button>
                  <button
                    onClick={() => setConfig({...config, pdfOrientation: 'l'})}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 ${config.pdfOrientation === 'l' ? 'bg-[#E95420] text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    <Monitor className="w-3 h-3 rotate-90" /> Land
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase font-bold text-white/60">
                  <span>Margins</span>
                  <span className="text-[#E95420]">{config.pdfMargins}mm</span>
                </div>
                <input 
                  type="range" min="0" max="50" step="5" 
                  value={config.pdfMargins} 
                  onChange={(e) => setConfig({...config, pdfMargins: parseInt(e.target.value)})}
                  className="w-full accent-[#E95420]" 
                />
              </div>
            </div>
          </div>

          {/* System Control */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
              <Monitor className="w-3 h-3" /> Engine Source
            </h3>
            <button 
              disabled={isProcessing}
              onClick={() => setConfig({...config, offlineMode: !config.offlineMode})}
              className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${config.offlineMode ? 'bg-[#E95420]/20 border-[#E95420] text-white' : 'bg-white/5 border-white/10 text-white/60'} disabled:opacity-30`}
            >
              <div className="flex items-center gap-3">
                <WifiOff className="w-4 h-4" />
                <span className="text-sm font-bold">GPU Offline</span>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${config.offlineMode ? 'bg-[#E95420]' : 'bg-white/20'}`}>
                <div className={`absolute top-1 w-2 h-2 bg-white rounded-full transition-all ${config.offlineMode ? 'left-5' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </nav>

        <div className="p-6 bg-black/20 text-[10px] text-white/40 font-medium">
          <div className="flex items-center justify-between mb-4">
            <span>Stable Production v2.8</span>
            <Github className="w-3 h-3" />
          </div>
          <p>© 2025 VectorAI Team</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow ml-80 p-8 min-h-screen">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[#333]">
              {conversionMode === 'raster-to-vector' ? 'Vectorize Queue' : 'Render Assets'}
            </h2>
            <p className="text-sm text-slate-500">
              {conversionMode === 'raster-to-vector' ? 'Trace high-precision SVG paths from images' : 'Generate high-res rasters from vector source'}
            </p>
          </div>
          
          {batchItems.length > 0 && (
            <div className="flex items-center gap-3">
              <button 
                onClick={clearQueue}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-30"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Queue
              </button>

              <div className="flex items-center gap-2 relative" ref={batchExportRef}>
                {completedCount > 0 && (
                   <button 
                    onClick={() => setShowBatchExportDropdown(!showBatchExportDropdown)}
                    className="px-4 py-2.5 bg-white border border-slate-200 text-[#333] rounded-lg font-bold shadow-sm flex items-center gap-2 hover:bg-slate-50"
                  >
                    <FileDown className="w-4 h-4 text-[#E95420]" />
                    <span>Download All</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                )}

                {showBatchExportDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="p-2 space-y-1">
                      <button 
                        onClick={downloadAllZip}
                        className="w-full text-left p-3 hover:bg-slate-50 rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <Archive className="w-4 h-4 text-slate-400" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">Native Archive (ZIP)</span>
                          <span className="text-[10px] text-slate-400">All generated {conversionMode === 'raster-to-vector' ? 'SVGs' : 'PNGs'}</span>
                        </div>
                      </button>
                      <button 
                        onClick={downloadAllPDF}
                        className="w-full text-left p-3 hover:bg-slate-50 rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-[#E95420]" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">Unified Document (PDF)</span>
                          <span className="text-[10px] text-slate-400">Respects source dimensions</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {!isProcessing ? (
                   <button 
                    onClick={processBatch} 
                    disabled={batchItems.every(i => i.status === ProcessingStep.COMPLETED)}
                    className="px-6 py-2.5 ubuntu-button-primary rounded-lg font-bold shadow-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Start Processing
                  </button>
                ) : (
                  <button 
                    onClick={cancelBatch}
                    className="px-6 py-2.5 bg-slate-800 text-white rounded-lg font-bold shadow-lg flex items-center gap-2 hover:bg-slate-900"
                  >
                    <StopCircle className="w-4 h-4 animate-pulse text-red-500" />
                    Abort
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        {isProcessing && (
          <div className="mb-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-xl animate-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#E95420] animate-spin" />
                <span className="text-sm font-bold uppercase tracking-widest text-[#E95420]">Processing Batch...</span>
              </div>
              <span className="text-xs font-bold text-slate-500">{overallProgress}% Complete</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
               <div 
                className="h-full bg-[#E95420] transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
               />
            </div>
          </div>
        )}

        {batchItems.length === 0 ? (
          <div className="max-w-4xl mx-auto mt-20">
            <Dropzone 
              onImagesSelected={handleImagesSelected} 
              isProcessing={isProcessing} 
              accept={conversionMode === 'raster-to-vector' ? 'image/*' : '.svg,image/svg+xml'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {batchItems.map((item) => (
              <div key={item.id} className="ubuntu-card rounded-2xl overflow-hidden group hover:border-[#E95420]/50 transition-all hover:shadow-xl bg-white border-slate-200">
                <div className="aspect-square bg-slate-50 relative flex items-center justify-center p-6 border-b border-slate-100">
                  <img src={item.previewUrl} alt="preview" className="max-w-full max-h-full object-contain" />
                  
                  <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3 backdrop-blur-sm px-4">
                    {!isProcessing && (
                      <>
                        <button onClick={() => removeBatchItem(item.id)} className="p-2.5 bg-white/10 hover:bg-red-500 rounded-xl text-white transition-all shadow-lg" title="Delete"><X className="w-5 h-5" /></button>
                        {item.result && (
                          <>
                            <button onClick={() => setActiveCompareId(item.id)} className="p-2.5 bg-white/10 hover:bg-blue-500 rounded-xl text-white transition-all shadow-lg" title="Compare"><Eye className="w-5 h-5" /></button>
                            {conversionMode === 'raster-to-vector' && (
                              <>
                                <button onClick={() => setActiveEditId(item.id)} className="p-2.5 bg-white/10 hover:bg-amber-500 rounded-xl text-white transition-all shadow-lg" title="Edit Path"><Edit3 className="w-5 h-5" /></button>
                                <button onClick={() => refineWithAI(item.id)} className="p-2.5 bg-white/10 hover:bg-emerald-500 rounded-xl text-white transition-all shadow-lg" title="Refine with Gemini"><Wand2 className="w-5 h-5" /></button>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="absolute top-4 right-4">
                    {item.status === ProcessingStep.COMPLETED && <div className="p-1 bg-green-500 rounded-full shadow-lg"><CheckCircle2 className="w-4 h-4 text-white" /></div>}
                    {(item.status === ProcessingStep.ANALYZING || item.status === ProcessingStep.CLEANING) && <Loader2 className="w-5 h-5 text-[#E95420] animate-spin" />}
                  </div>
                </div>
                <div className="p-4 flex justify-between items-center bg-white">
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-800 truncate">{item.file.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {item.status === ProcessingStep.COMPLETED ? 'Ready' : item.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <button 
              onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
              disabled={isProcessing}
              className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-[#E95420] hover:text-[#E95420] transition-all bg-white hover:bg-[#E95420]/5 group"
            >
              <div className="p-4 bg-slate-50 rounded-full group-hover:bg-[#E95420]/10 transition-colors">
                <Files className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest">Append Item</span>
            </button>
          </div>
        )}
      </main>

      {/* Vector Editor Modal */}
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

      {/* Quality Comparison Modal */}
      {activeCompareId && batchItems.find(i => i.id === activeCompareId) && (
        <ComparisonModal 
          item={batchItems.find(i => i.id === activeCompareId)!}
          conversionMode={conversionMode}
          onClose={() => setActiveCompareId(null)}
        />
      )}
    </div>
  );
};

export default App;
