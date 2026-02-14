
export interface ImageState {
  originalUrl: string | null;
  base64: string | null;
  mimeType: string | null;
  vectorSvg: string | null;
  isProcessing: boolean;
  error: string | null;
}

export enum ProcessingStep {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  TRACING = 'TRACING',
  CLEANING = 'CLEANING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type ConversionMode = 'raster-to-vector' | 'vector-to-raster';

export interface ProcessingStatus {
  step: ProcessingStep;
  message: string;
}

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: ProcessingStep;
  result: string | null;
  error: string | null;
  progress: number; // 0 to 100
}

export interface BatchConfig {
  simplification: number; // 0 (detailed) to 100 (minimal)
  offlineMode: boolean;
  targetResolution: number; // 0: Low, 1: Standard, 2: HD, 3: 4K, 4: 8K
  maxFileSizeKB: number; // 0 for unlimited
  pdfPageSize: 'a4' | 'letter' | 'fit';
  pdfOrientation: 'p' | 'l';
  pdfMargins: number;
}
