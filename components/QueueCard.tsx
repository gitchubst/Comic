import React, { useState } from 'react';
import { Download, AlertCircle, Clock, Loader2, ImageIcon, Trash2, ArrowLeft, ArrowRight, RefreshCcw, Edit3, Save, X, PauseCircle, Play } from 'lucide-react';
import { QueueItem } from '../types';

interface QueueCardProps {
  item: QueueItem;
  index: number;
  totalItems: number;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'left' | 'right') => void;
  onRegenerate: (id: string, newPrompt?: string) => void;
}

export const QueueCard: React.FC<QueueCardProps> = ({ item, index, totalItems, onDelete, onMove, onRegenerate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState(item.prompt);

  const downloadImage = () => {
    if (!item.resultImage) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${item.resultImage}`;
    link.download = `Image_${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveAndRegenerate = () => {
    onRegenerate(item.id, editPrompt);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditPrompt(item.prompt);
    setIsEditing(false);
  };

  return (
    <div className={`
        border rounded-xl overflow-hidden transition-all duration-300 flex flex-col h-full group/card relative
        ${item.status === 'stopped' ? 'bg-slate-800/30 border-slate-700/50 opacity-75' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
    `}>
      
      {/* Control Overlay - Always visible on hover */}
      <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
        <button 
          onClick={() => onMove(item.id, 'left')}
          disabled={index === 0}
          className="p-1.5 bg-slate-900/80 text-slate-200 rounded-md hover:bg-indigo-600 disabled:opacity-30 disabled:hover:bg-slate-900/80 disabled:cursor-not-allowed"
          title="Move Earlier"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onMove(item.id, 'right')}
          disabled={index === totalItems - 1}
          className="p-1.5 bg-slate-900/80 text-slate-200 rounded-md hover:bg-indigo-600 disabled:opacity-30 disabled:hover:bg-slate-900/80 disabled:cursor-not-allowed"
          title="Move Later"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onDelete(item.id)}
          className="p-1.5 bg-slate-900/80 text-red-400 rounded-md hover:bg-red-600 hover:text-white"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Image Area */}
      <div className="relative aspect-[16/9] bg-slate-900 flex items-center justify-center group/image border-b border-slate-700/50">
        {item.status === 'completed' && item.resultImage ? (
          <>
            <img 
              src={`data:image/png;base64,${item.resultImage}`} 
              alt={item.prompt} 
              className="w-full h-full object-cover"
            />
            {/* Overlay for download */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center">
                <button 
                    onClick={downloadImage}
                    className="flex items-center gap-2 bg-white text-slate-900 px-4 py-2 rounded-full font-bold transform translate-y-4 group-hover/image:translate-y-0 transition-all shadow-lg"
                >
                    <Download className="w-4 h-4" />
                    Download
                </button>
            </div>
          </>
        ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                {item.status === 'pending' && <Clock className="w-8 h-8 mb-2 animate-pulse" />}
                {item.status === 'processing' && <Loader2 className="w-8 h-8 mb-2 animate-spin text-indigo-500" />}
                {item.status === 'failed' && <AlertCircle className="w-8 h-8 mb-2 text-red-500" />}
                {item.status === 'stopped' && <PauseCircle className="w-8 h-8 mb-2 text-slate-600" />}
                
                <span className="text-xs uppercase tracking-wider font-semibold">
                    {item.status}
                </span>
            </div>
        )}

        {/* Story Metadata Badge (Floating on Image) */}
        {item.storyMetadata && (
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm border border-white/10 px-2 py-1 rounded text-[10px] text-white font-mono z-10">
                {item.storyMetadata.sceneName} • {item.storyMetadata.globalIndex}/{item.storyMetadata.totalImages}
            </div>
        )}
      </div>

      {/* Info Area */}
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
                 <div className="bg-slate-700 text-xs font-mono px-2 py-0.5 rounded text-slate-300">
                    #{index + 1}
                 </div>
                 <div className={`w-2 h-2 rounded-full ${
                    item.status === 'completed' ? 'bg-green-500' :
                    item.status === 'processing' ? 'bg-indigo-500 animate-pulse' :
                    item.status === 'failed' ? 'bg-red-500' :
                    item.status === 'stopped' ? 'bg-slate-600' :
                    'bg-slate-500'
                 }`} />
            </div>
            {item.referenceImages && item.referenceImages.length > 0 && (
                <div className="relative group/ref cursor-help">
                    <div className="flex items-center gap-1 text-slate-500 hover:text-indigo-400">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-[10px] font-bold">{item.referenceImages.length}</span>
                    </div>
                    <div className="absolute bottom-full right-0 mb-2 p-2 bg-slate-900 border border-slate-600 rounded-lg hidden group-hover/ref:flex flex-col gap-2 z-10 shadow-xl min-w-[100px]">
                        {item.referenceImages.map((ref, idx) => (
                            <div key={idx} className="w-24 h-24 rounded overflow-hidden border border-slate-700">
                                <img 
                                    src={`data:${ref.mimeType};base64,${ref.data}`}
                                    className="w-full h-full object-cover"
                                    alt={`Ref ${idx}`}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {isEditing ? (
            <div className="flex-grow flex flex-col gap-2">
                <textarea 
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    className="w-full h-24 p-2 text-sm bg-slate-900 border border-indigo-500 rounded text-white resize-none focus:outline-none"
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button onClick={handleCancelEdit} className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-white" title="Cancel">
                        <X className="w-4 h-4" />
                    </button>
                    <button onClick={handleSaveAndRegenerate} className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold text-white">
                        <RefreshCcw className="w-3 h-3" /> Save & Retry
                    </button>
                </div>
            </div>
        ) : (
            <>
                <p className={`text-sm line-clamp-3 mb-2 flex-grow font-medium leading-relaxed ${item.status === 'stopped' ? 'text-slate-400' : 'text-slate-200'}`} title={item.prompt}>
                {item.prompt}
                </p>
                
                {item.error && (
                    <p className="text-xs text-red-400 mt-2 bg-red-900/20 p-2 rounded border border-red-500/30">
                        Error: {item.error}
                    </p>
                )}

                {/* Action Buttons for Completed/Failed/Stopped Items */}
                {(item.status === 'completed' || item.status === 'failed' || item.status === 'stopped') && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700/50">
                        <button 
                            onClick={() => onRegenerate(item.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-xs font-medium transition-colors ${
                                item.status === 'stopped' 
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                : 'bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white'
                            }`}
                        >
                            {item.status === 'stopped' ? (
                                <><Play className="w-3 h-3" /> Generate Now</>
                            ) : (
                                <><RefreshCcw className="w-3 h-3" /> {item.status === 'failed' ? 'Retry' : 'Regenerate'}</>
                            )}
                        </button>
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors"
                            title="Edit Prompt & Regenerate"
                        >
                            <Edit3 className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </>
        )}

      </div>
    </div>
  );
};