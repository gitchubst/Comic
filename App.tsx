import React, { useState, useEffect, useRef, memo } from 'react';
import { 
  Sparkles, 
  Upload, 
  X, 
  Plus, 
  Layers,
  Image as ImageIcon,
  FolderPlus,
  ChevronDown,
  Download as DownloadIcon,
  FolderOpen,
  Palette,
  Grid,
  LayoutTemplate,
  BookOpen,
  Play,
  Pause,
  Square,
  ListFilter,
  Zap,
  AlertTriangle,
  Edit2,
  LogOut,
  Key,
  RotateCcw,
  DollarSign,
  RefreshCw
} from 'lucide-react';
import JSZip from 'jszip';
import { ApiKeyModal } from './components/ApiKeyModal';
import { QueueCard } from './components/QueueCard';
import { StoryCreator } from './components/StoryCreator';
import { QueueItem, QueueStatus, ReferenceImage, Project, GenerationOptions, ColorMode, LayoutMode, PanelStyle, StoryBlueprint } from './types';
import { generateImageWithGemini } from './services/geminiService';

// Declaration for the injected AI Studio helper
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

// Memoized QueueCard wrapper to improve performance with large lists
const MemoizedQueueCard = memo(QueueCard);

const App: React.FC = () => {
  // --- State ---
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Cost Tracking State
  const [sessionCost, setSessionCost] = useState<number>(0);
  const [isCostPaused, setIsCostPaused] = useState<boolean>(false);

  // Projects State (Persisted)
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('gemini_comic_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Migration check: ensure items have referenceImages array if they had referenceImage
            return parsed.map((p: any) => ({
                ...p,
                items: p.items.map((i: any) => ({
                    ...i,
                    referenceImages: i.referenceImages || (i.referenceImage ? [i.referenceImage] : [])
                }))
            }));
        }
      } catch (e) {
        console.error("Failed to parse saved projects", e);
      }
    }
    return [{ id: 'default', name: 'My First Comic', items: [], createdAt: Date.now() }];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem('gemini_active_project_id') || 'default';
  });

  // Derived state with fallback
  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || {
      id: 'fallback',
      name: 'New Project',
      items: [],
      createdAt: Date.now()
  };
  const queue = activeProject.items || [];

  // View Mode: 'manual' | 'story'
  const [viewMode, setViewMode] = useState<'manual' | 'story'>('manual');

  // Input State (Manual Mode)
  const [prompt, setPrompt] = useState('');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  
  // New Options State
  const [colorMode, setColorMode] = useState<ColorMode>('color');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('5x2');
  const [panelStyle, setPanelStyle] = useState<PanelStyle>('equal');

  // Queue Control State
  const [batchSize, setBatchSize] = useState<number>(1);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // UI State
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  
  // Renaming State
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState('');

  // Queue Range State
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [showRangeInput, setShowRangeInput] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Persistence Effects ---
  useEffect(() => {
    try {
      localStorage.setItem('gemini_comic_projects', JSON.stringify(projects));
      if (storageError) setStorageError(null); // Clear error if save succeeds
    } catch (e: any) {
      console.warn("LocalStorage Quota Exceeded:", e);
      // We do not stop the app, just notify
      setStorageError("Storage full. New images won't persist if you refresh.");
    }
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('gemini_active_project_id', activeProjectId);
  }, [activeProjectId]);

  // --- Initialization ---
  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      // Check manual override first
      if (localStorage.getItem('gemini_custom_api_key')) {
          setHasKey(true);
          setIsCheckingKey(false);
          return;
      }

      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    } catch (e) {
      console.error("Failed to check API key status", e);
    } finally {
      setIsCheckingKey(false);
    }
  };

  const handleConnectSuccess = () => {
      setHasKey(true);
      setShowAuthModal(false);
      setAuthError(null);
      // If queue was paused due to auth error, resume (optional, let's keep it manual safety)
      if (authError) {
          setIsQueuePaused(false);
      }
  };

  // --- Cost Management ---
  const handleAddCost = (amount: number) => {
      if (!isCostPaused) {
          setSessionCost(prev => prev + amount);
      }
  };

  const handleResetCost = () => {
      setSessionCost(0);
  };

  // --- Helper: Update Item in Project ---
  const updateQueueItem = (projectId: string, itemId: string, updates: Partial<QueueItem>) => {
    setProjects(prev => prev.map(proj => {
      if (proj.id !== projectId) return proj;
      return {
        ...proj,
        items: proj.items.map(item => item.id === itemId ? { ...item, ...updates } : item)
      };
    }));
  };

  // --- Concurrent Queue Processor ---
  useEffect(() => {
    const processQueue = async () => {
      if (!hasKey || isQueuePaused) return;

      const activeProj = projects.find(p => p.id === activeProjectId);
      if (!activeProj) return;

      // Count currently processing items
      const processingCount = activeProj.items.filter(i => i.status === 'processing').length;
      
      // Calculate available slots
      const slotsAvailable = batchSize - processingCount;
      if (slotsAvailable <= 0) return;

      // Find next pending items
      const pendingItems = activeProj.items
        .filter(i => i.status === 'pending')
        .slice(0, slotsAvailable);

      if (pendingItems.length === 0) return;

      // Launch jobs for all picked items
      pendingItems.forEach(async (item) => {
        // 1. Mark as processing immediately to prevent re-selection
        updateQueueItem(activeProjectId, item.id, { status: 'processing' });

        try {
          // 2. Generate
          const resultBase64 = await generateImageWithGemini(
            item.prompt, 
            item.referenceImages,
            item.options
          );

          // 3. Update Cost (Nano Banana Pro rate)
          handleAddCost(0.139);

          updateQueueItem(activeProjectId, item.id, { 
            status: 'completed', 
            resultImage: resultBase64,
            error: null
          });
        } catch (error: any) {
          const errorMessage = error.message || "Unknown error occurred";
          
          if (errorMessage === "API_KEY_INVALID" || errorMessage.includes("403") || errorMessage.includes("Requested entity was not found")) {
              console.warn("API Key invalid or project issue. Pausing queue.");
              setIsQueuePaused(true);
              setAuthError("API Key or Quota Error. Please switch account or enter a valid key.");
              // Mark this item as failed so it can be retried
              updateQueueItem(activeProjectId, item.id, { 
                status: 'failed', 
                error: "API Authorization Error" 
              });
              return;
          }

          updateQueueItem(activeProjectId, item.id, { 
            status: 'failed', 
            error: errorMessage 
          });
        }
      });
    };

    processQueue();
    // Re-run whenever projects change (to catch completion updates) or control params change
  }, [projects, activeProjectId, batchSize, hasKey, isQueuePaused, isCostPaused]); // Added isCostPaused dependency although it's handled via ref/callback usually, simple state works here


  // --- Project Management Handlers ---

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProject: Project = {
      id: crypto.randomUUID(),
      name: newProjectName.trim(),
      items: [],
      createdAt: Date.now()
    };

    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(newProject.id);
    setNewProjectName('');
    setShowNewProjectInput(false);
    setIsProjectDropdownOpen(false);
  };

  const startRenaming = () => {
      setEditingProjectName(activeProject.name);
      setIsRenamingProject(true);
  };

  const handleRenameProject = () => {
      if (editingProjectName.trim()) {
          setProjects(prev => prev.map(p => 
              p.id === activeProjectId ? { ...p, name: editingProjectName.trim() } : p
          ));
      }
      setIsRenamingProject(false);
  };

  const handleDeleteImage = (itemId: string) => {
    setProjects(prev => prev.map(proj => {
      if (proj.id !== activeProjectId) return proj;
      return {
        ...proj,
        items: proj.items.filter(item => item.id !== itemId)
      };
    }));
  };

  const handleMoveImage = (itemId: string, direction: 'left' | 'right') => {
    setProjects(prev => prev.map(proj => {
      if (proj.id !== activeProjectId) return proj;
      
      const index = proj.items.findIndex(i => i.id === itemId);
      if (index === -1) return proj;
      if (direction === 'left' && index === 0) return proj;
      if (direction === 'right' && index === proj.items.length - 1) return proj;

      const newItems = [...proj.items];
      const swapIndex = direction === 'left' ? index - 1 : index + 1;
      
      [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];

      return { ...proj, items: newItems };
    }));
  };

  const handleRegenerateImage = (itemId: string, newPrompt?: string) => {
    setProjects(prev => prev.map(proj => {
        if (proj.id !== activeProjectId) return proj;
        return {
            ...proj,
            items: proj.items.map(item => {
                if (item.id !== itemId) return item;
                return {
                    ...item,
                    status: 'pending',
                    resultImage: null,
                    error: null,
                    prompt: newPrompt || item.prompt
                };
            })
        };
    }));
    
    // Clear auth errors if user is retrying, assuming they might have fixed it
    if (authError) setAuthError(null);
    if (isQueuePaused) setIsQueuePaused(false); 
  };

  const handleStopQueue = () => {
    setIsQueuePaused(true);
    // Convert all 'pending' items to 'stopped'
    setProjects(prev => prev.map(proj => {
        if (proj.id !== activeProjectId) return proj;
        return {
            ...proj,
            items: proj.items.map(item => {
                if (item.status === 'pending') return { ...item, status: 'stopped' };
                return item;
            })
        };
    }));
  };

  const handleContinueQueue = () => {
    setIsQueuePaused(false);
    setAuthError(null);
    setProjects(prev => prev.map(proj => {
        if (proj.id !== activeProjectId) return proj;
        return {
            ...proj,
            items: proj.items.map(item => {
                if (item.status === 'stopped' || item.status === 'failed') {
                    return { ...item, status: 'pending', error: null };
                }
                return item;
            })
        };
    }));
  };

  const handleQueueRange = () => {
    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);
    
    if (isNaN(start) || isNaN(end) || start > end) {
        alert("Invalid Range");
        return;
    }

    const startIdx = Math.max(0, start - 1);
    const endIdx = end; 

    setProjects(prev => prev.map(proj => {
        if (proj.id !== activeProjectId) return proj;
        return {
            ...proj,
            items: proj.items.map((item, index) => {
                // Keep active states
                if (item.status === 'completed' || item.status === 'processing') return item;
                
                // Set range to pending
                if (index >= startIdx && index < endIdx) {
                    return { ...item, status: 'pending' };
                }
                
                // Stop others
                if (item.status === 'pending') {
                    return { ...item, status: 'stopped' };
                }

                return item;
            })
        };
    }));
    
    setAuthError(null);
    setIsQueuePaused(false);
    setShowRangeInput(false);
    setRangeStart('');
    setRangeEnd('');
  };

  const handleDownloadProject = async () => {
    const completedItems = activeProject.items.filter(item => item.status === 'completed' && item.resultImage);
    if (completedItems.length === 0) {
      alert("No completed images to download.");
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder(activeProject.name) || zip;

    completedItems.forEach((item, index) => {
      if (item.resultImage) {
        let filename = `${index + 1}.png`;
        
        // Use global index from story mode if available, ensuring numbering matches script
        if (item.storyMetadata && typeof item.storyMetadata.globalIndex === 'number') {
             filename = `${item.storyMetadata.globalIndex}.png`;
        }
        
        folder.file(filename, item.resultImage, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeProject.name}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Input Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach((file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          const base64Data = base64String.split(',')[1];
          setReferenceImages(prev => [...prev, { data: base64Data, mimeType: file.type }]);
        };
        reader.readAsDataURL(file);
    });
    
    // Clear input so same files can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeReferenceImage = (indexToRemove: number) => {
    setReferenceImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // --- Queue Actions ---

  const addToQueue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      prompt: prompt.trim(),
      referenceImages: referenceImages,
      options: {
        colorMode,
        layout: layoutMode,
        panelStyle
      },
      status: 'pending',
      resultImage: null,
      error: null,
      createdAt: Date.now()
    };

    setProjects(prev => prev.map(proj => {
      if (proj.id !== activeProjectId) return proj;
      return { ...proj, items: [...proj.items, newItem] };
    }));
    
    if (authError) setAuthError(null);
    if (isQueuePaused) setIsQueuePaused(false);
    setPrompt('');
  };

  // Add a batch of items to the ACTIVE project
  const handleQueueItems = (items: QueueItem[]) => {
    setProjects(prev => prev.map(proj => {
      if (proj.id !== activeProjectId) return proj;
      return { ...proj, items: [...proj.items, ...items] };
    }));
    setAuthError(null);
    setIsQueuePaused(false);
  };

  // Create a NEW project from blueprint (Legacy/Queue All support)
  const handleQueueStory = (blueprint: StoryBlueprint, storyRefImages: ReferenceImage[], storyOptions: GenerationOptions) => {
    const newProjectId = crypto.randomUUID();
    const newProjectName = blueprint.title || `Story ${new Date().toLocaleDateString()}`;

    const newItems: QueueItem[] = [];
    const totalImages = blueprint.scenes.reduce((acc, s) => acc + s.pages.length, 0);

    blueprint.scenes.forEach(scene => {
      scene.pages.forEach(page => {
        newItems.push({
          id: crypto.randomUUID(),
          prompt: page.prompt,
          referenceImages: storyRefImages, 
          options: storyOptions,         
          status: 'pending',
          resultImage: null,
          error: null,
          createdAt: Date.now(),
          storyMetadata: {
            sceneName: scene.title,
            globalIndex: page.globalIndex,
            totalImages: totalImages
          }
        });
      });
    });

    const newProject: Project = {
        id: newProjectId,
        name: newProjectName,
        items: newItems,
        createdAt: Date.now()
    };

    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(newProjectId);
    setViewMode('manual');
    setAuthError(null);
    setIsQueuePaused(false);
  };

  // --- Render ---

  if (isCheckingKey) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-500">Loading...</div>;
  }

  // Initial blocking modal
  if (!hasKey) {
    return <ApiKeyModal onConnect={handleConnectSuccess} />;
  }

  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const completedCount = queue.filter(i => i.status === 'completed').length;
  const processingCount = queue.filter(i => i.status === 'processing').length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 selection:bg-indigo-500/30 font-sans relative">
      
      {/* On-Demand Auth Modal */}
      {showAuthModal && (
          <ApiKeyModal onConnect={handleConnectSuccess} onClose={() => setShowAuthModal(false)} isOverlay />
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h1 className="font-bold text-xl tracking-tight text-white hidden sm:block">Gemini<span className="text-indigo-400">Comics</span></h1>
            </div>

            {/* Cost Tracker */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 shadow-sm">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-sm font-bold text-white min-w-[50px] text-right">
                    ${sessionCost.toFixed(3)}
                </span>
                <div className="h-4 w-px bg-slate-600 mx-1"></div>
                {isCostPaused ? (
                    <button 
                        onClick={() => setIsCostPaused(false)}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-green-400 transition-colors"
                        title="Resume Cost Tracking"
                    >
                        <Play className="w-3 h-3 fill-current" />
                    </button>
                ) : (
                    <button 
                         onClick={() => setIsCostPaused(true)}
                         className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-yellow-400 transition-colors"
                         title="Pause Cost Tracking"
                    >
                        <Pause className="w-3 h-3 fill-current" />
                    </button>
                )}
                <button 
                    onClick={handleResetCost}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-colors"
                    title="Reset Cost Counter"
                >
                    <RefreshCw className="w-3 h-3" />
                </button>
            </div>

            {/* Project Selector */}
            <div className="relative">
              {isRenamingProject ? (
                  <div className="flex items-center gap-2">
                      <input 
                          autoFocus
                          type="text"
                          value={editingProjectName}
                          onChange={(e) => setEditingProjectName(e.target.value)}
                          onBlur={handleRenameProject}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()}
                          className="px-3 py-1.5 bg-slate-800 border border-indigo-500 rounded-lg text-sm text-white focus:outline-none w-[200px]"
                      />
                  </div>
              ) : (
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <FolderOpen className="w-4 h-4 text-indigo-400" />
                        <span className="max-w-[150px] truncate">{activeProject.name}</span>
                        <ChevronDown className="w-3 h-3 text-slate-500" />
                    </button>
                    <button onClick={startRenaming} className="p-1.5 text-slate-500 hover:text-indigo-400 rounded-lg transition-colors" title="Rename Project">
                        <Edit2 className="w-3 h-3" />
                    </button>
                </div>
              )}

              {isProjectDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="max-h-60 overflow-y-auto">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveProjectId(p.id);
                          setIsProjectDropdownOpen(false);
                          setShowNewProjectInput(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-slate-700/50 transition-colors ${activeProjectId === p.id ? 'bg-slate-700/50 text-indigo-400' : 'text-slate-300'}`}
                      >
                        <span className="truncate">{p.name}</span>
                        {activeProjectId === p.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-700 p-2">
                    {!showNewProjectInput ? (
                      <button 
                        onClick={() => setShowNewProjectInput(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Create New Project
                      </button>
                    ) : (
                      <form onSubmit={handleCreateProject} className="flex flex-col gap-2 p-1">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Project Name"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex gap-2">
                          <button 
                            type="submit"
                            className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-500"
                          >
                            Create
                          </button>
                          <button 
                            type="button"
                            onClick={() => setShowNewProjectInput(false)}
                            className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs font-bold rounded hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
               <button
                  onClick={() => setViewMode('manual')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-2 ${viewMode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
               >
                 <ImageIcon className="w-4 h-4" /> Queue
               </button>
               <button
                  onClick={() => setViewMode('story')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-2 ${viewMode === 'story' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
               >
                 <BookOpen className="w-4 h-4" /> Story Creator
               </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Switch Account Button */}
             <button 
                onClick={() => setShowAuthModal(true)}
                className="hidden md:flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors border border-transparent hover:border-slate-700"
                title="Switch Google Cloud Project or enter API Key"
             >
                <Key className="w-4 h-4" />
                Switch Key
             </button>

             {storageError && (
                 <div className="hidden md:flex items-center gap-2 text-amber-400 text-xs bg-amber-900/30 px-3 py-1 rounded-full border border-amber-500/30">
                     <AlertTriangle className="w-3 h-3" />
                     Storage Full
                 </div>
             )}
             {completedCount > 0 && (
                <button 
                    onClick={handleDownloadProject}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5"
                >
                    <DownloadIcon className="w-4 h-4" />
                    Download Project
                </button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Auth Error Banner */}
        {authError && (
            <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                    <div>
                        <h3 className="font-bold text-red-400">Generation Paused: Authorization Error</h3>
                        <p className="text-sm text-red-300/80">{authError}</p>
                    </div>
                </div>
                <button 
                    onClick={() => setShowAuthModal(true)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2"
                >
                    <Key className="w-4 h-4" /> Switch API Key
                </button>
            </div>
        )}

        {/* Story Creator View - Persisted */}
        <div style={{ display: viewMode === 'story' ? 'block' : 'none' }}>
           <StoryCreator 
            onQueueStory={handleQueueStory} 
            activeProjectName={activeProject.name}
            onAddItemsToActiveProject={handleQueueItems}
            onAddCost={handleAddCost}
          />
        </div>

        {/* Manual Queue View - Persisted */}
        <div style={{ display: viewMode === 'manual' ? 'block' : 'none' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Input & Controls (Sticky) */}
            <section className="lg:col-span-4 lg:sticky lg:top-24 h-fit space-y-6">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-indigo-400" />
                    Add Page
                </h2>
                
                <form onSubmit={addToQueue} className="space-y-6">
                    
                    {/* Reference Image */}
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Reference Images (Optional)</label>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                                relative group cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all duration-200
                                flex flex-col items-center justify-center text-center
                                ${referenceImages.length > 0
                                    ? 'border-indigo-500/50 bg-slate-900/50 min-h-[160px]' 
                                    : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-700/30 h-48'
                                }
                            `}
                        >
                            {referenceImages.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2 w-full">
                                    {referenceImages.map((img, idx) => (
                                        <div key={idx} className="relative aspect-square">
                                            <img 
                                                src={`data:${img.mimeType};base64,${img.data}`} 
                                                alt={`Ref ${idx}`} 
                                                className="h-full w-full object-cover rounded-lg"
                                            />
                                            <button
                                                type="button" 
                                                onClick={(e) => { e.stopPropagation(); removeReferenceImage(idx); }}
                                                className="absolute top-1 right-1 p-0.5 bg-black/60 hover:bg-red-500/80 rounded-full text-white transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex flex-col items-center justify-center border border-slate-700 rounded-lg bg-slate-800/50 text-slate-500 text-xs">
                                        <Plus className="w-4 h-4 mb-1" />
                                        Add More
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2 group-hover:transform group-hover:scale-105 transition-transform duration-200">
                                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center mx-auto mb-2">
                                        <Upload className="w-6 h-6 text-slate-400" />
                                    </div>
                                    <p className="text-sm text-slate-300 font-medium">Click to upload references</p>
                                    <p className="text-xs text-slate-500">Supports JPG, PNG (Multiple)</p>
                                </div>
                            )}
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept="image/*" 
                                multiple
                                onChange={handleFileChange}
                                className="hidden" 
                            />
                        </div>
                        {referenceImages.length > 0 && (
                            <div className="flex justify-end mt-1">
                                <button type="button" onClick={() => setReferenceImages([])} className="text-xs text-red-400 hover:text-red-300">Clear All</button>
                            </div>
                        )}
                    </div>

                    {/* --- New Controls --- */}
                    <div className="space-y-4">
                        {/* Color Mode */}
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                <Palette className="w-4 h-4" /> Color Mode
                            </label>
                            <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setColorMode('color')}
                                    className={`py-2 text-sm font-medium rounded-md transition-colors ${colorMode === 'color' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Color
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setColorMode('bw')}
                                    className={`py-2 text-sm font-medium rounded-md transition-colors ${colorMode === 'bw' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Black & White
                                </button>
                            </div>
                        </div>

                        {/* Layout Mode */}
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                <Grid className="w-4 h-4" /> Layout
                            </label>
                            <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setLayoutMode('5x2')}
                                    className={`py-2 text-sm font-medium rounded-md transition-colors ${layoutMode === '5x2' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    5x2 (Wide)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLayoutMode('2x5')}
                                    className={`py-2 text-sm font-medium rounded-md transition-colors ${layoutMode === '2x5' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    2x5 (Tall)
                                </button>
                            </div>
                        </div>

                        {/* Panel Style */}
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                <LayoutTemplate className="w-4 h-4" /> Panel Style
                            </label>
                            <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setPanelStyle('equal')}
                                    className={`py-2 text-sm font-medium rounded-md transition-colors ${panelStyle === 'equal' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Same Sized
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanelStyle('dynamic')}
                                    className={`py-2 text-sm font-medium rounded-md transition-colors ${panelStyle === 'dynamic' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Dynamic
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Prompt Input */}
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Panel Description</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe this comic strip page..."
                            className="w-full h-32 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    addToQueue(e);
                                }
                            }}
                        />
                        <div className="mt-2 text-xs text-slate-500 flex justify-end">
                            Press Enter to queue
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!prompt.trim()}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <Layers className="w-5 h-5" />
                        Queue Page
                    </button>
                </form>
              </div>
            </section>

            {/* Right Column: Queue & Results */}
            <section className="lg:col-span-8 space-y-6">
                
                {/* Queue Control Bar */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col xl:flex-row items-center justify-between gap-4 shadow-lg">
                    {/* ... (Existing Queue Control Bar) ... */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                             <ImageIcon className="w-5 h-5 text-indigo-400" />
                             <h2 className="text-lg font-bold text-white truncate max-w-[150px] md:max-w-[200px]">{activeProject.name}</h2>
                        </div>
                        {/* Status Pills */}
                        <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">{pendingCount} Wait</span>
                            <span className="bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20">{processingCount} Active</span>
                            <span className="bg-emerald-900/30 text-emerald-300 px-2 py-1 rounded">{completedCount} Done</span>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
                        
                        {/* Batch Control */}
                         <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
                             <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                             <span className="text-xs font-bold text-slate-400 uppercase">Batch</span>
                             <input 
                                type="number" 
                                min="1" 
                                max="10" 
                                value={batchSize} 
                                onChange={(e) => setBatchSize(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                                className="w-10 bg-slate-800 border border-slate-600 rounded text-center text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
                             />
                         </div>

                        <div className="h-6 w-px bg-slate-700 hidden md:block"></div>

                        {/* Queue Controls */}
                        <div className="flex items-center gap-2 w-full md:w-auto justify-center">
                            {isQueuePaused ? (
                                <button onClick={() => { setIsQueuePaused(false); setAuthError(null); }} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-colors">
                                    <Play className="w-4 h-4" /> Resume
                                </button>
                            ) : (
                                <button onClick={() => setIsQueuePaused(true)} className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-bold transition-colors">
                                    <Pause className="w-4 h-4" /> Pause
                                </button>
                            )}

                            <button onClick={handleContinueQueue} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors" title="Retry Failed & Continue Stopped">
                                <RotateCcw className="w-4 h-4" /> Continue
                            </button>

                            <button onClick={handleStopQueue} className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors" title="Cancel All Pending">
                                <Square className="w-4 h-4 fill-current" /> Stop
                            </button>
                            
                            <div className="relative">
                                <button 
                                    onClick={() => setShowRangeInput(!showRangeInput)}
                                    className={`flex items-center gap-2 px-3 py-1.5 border border-slate-600 rounded-lg text-sm font-bold transition-colors ${showRangeInput ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-700 text-slate-300 hover:text-white'}`}
                                >
                                    <ListFilter className="w-4 h-4" /> Range
                                </button>
                                
                                {showRangeInput && (
                                    <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-600 p-3 rounded-xl shadow-xl z-20 w-64">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Queue Range</h4>
                                        <div className="flex gap-2 mb-2">
                                            <input 
                                                type="number" 
                                                placeholder="Start #" 
                                                value={rangeStart}
                                                onChange={(e) => setRangeStart(e.target.value)}
                                                className="w-1/2 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white"
                                            />
                                            <input 
                                                type="number" 
                                                placeholder="End #" 
                                                value={rangeEnd}
                                                onChange={(e) => setRangeEnd(e.target.value)}
                                                className="w-1/2 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white"
                                            />
                                        </div>
                                        <button 
                                            onClick={handleQueueRange}
                                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold"
                                        >
                                            Start Generation
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Queue List */}
                {queue.length === 0 ? (
                    <div className="bg-slate-800/30 border border-slate-700/50 border-dashed rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                            <FolderPlus className="w-10 h-10 text-slate-600" />
                        </div>
                        <h3 className="text-xl font-medium text-slate-300 mb-2">Project is empty</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            Start building your comic book by adding pages. 
                            Configure layout and style on the left, then click Queue.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {queue.map((item, index) => (
                            <div key={item.id} className="w-full">
                                <MemoizedQueueCard 
                                    item={item} 
                                    index={index}
                                    totalItems={queue.length}
                                    onDelete={handleDeleteImage}
                                    onMove={handleMoveImage}
                                    onRegenerate={handleRegenerateImage}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;