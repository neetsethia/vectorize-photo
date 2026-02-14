import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Camera, Files } from 'lucide-react';

interface DropzoneProps {
  onImagesSelected: (files: File[]) => void;
  isProcessing: boolean;
  accept?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onImagesSelected, isProcessing, accept = 'image/*' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    // Fix: Cast the output of Array.from to File[] to ensure TypeScript recognizes the properties of individual files.
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => {
      if (accept.includes('image/*') && f.type.startsWith('image/')) return true;
      if (accept.includes('.svg') && (f.name.endsWith('.svg') || f.type === 'image/svg+xml')) return true;
      return false;
    });

    if (files.length > 0) {
      onImagesSelected(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      onImagesSelected(files);
    }
  };

  const isVectorMode = accept.includes('.svg');

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative group flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-2xl transition-all duration-300 ${
        isDragging 
          ? 'border-[#E95420] bg-[#E95420]/5' 
          : 'border-slate-300 bg-white hover:border-[#E95420] hover:bg-slate-50'
      } ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        multiple
        className="hidden"
      />
      
      <div className="flex flex-col items-center space-y-4 text-slate-500">
        <div className="p-4 bg-slate-100 rounded-full group-hover:scale-110 group-hover:bg-[#E95420]/10 transition-all duration-300">
          <Files className="w-8 h-8 text-[#E95420]" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700">
            {isVectorMode ? 'Select SVG files' : 'Select images for conversion'}
          </p>
          <p className="text-sm">
            {isVectorMode ? 'Scalable Vector Graphics (.svg)' : 'PNG, JPG, WEBP • Unlimited batching'}
          </p>
        </div>
      </div>
      
      <div className="absolute bottom-4 flex space-x-4">
        <button 
          className="flex items-center space-x-1 text-xs font-medium text-slate-400 hover:text-[#E95420] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Capture</span>
        </button>
        <button className="flex items-center space-x-1 text-xs font-medium text-slate-400 hover:text-[#E95420] transition-colors">
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Library</span>
        </button>
      </div>
    </div>
  );
};