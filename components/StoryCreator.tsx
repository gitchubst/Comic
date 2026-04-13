
import React, { useState, useRef, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  Wand2, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  PlayCircle,
  MessageSquare,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles, 
  Loader2,
  Upload,
  X,
  Palette,
  Grid,
  LayoutTemplate,
  Heart,
  Home,
  Tent,
  Sun,
  Archive,
  FileText,
  Clock,
  RotateCcw,
  Library,
  Download,
  ListPlus,
  ArrowRight,
  Smile,
  FilePlus,
  FileUp,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  FolderPlus
} from 'lucide-react';
import JSZip from 'jszip';
import { StorySettings, StoryCharacter, StoryBlueprint, StoryScene, StoryPage, ReferenceImage, GenerationOptions, ColorMode, LayoutMode, PanelStyle, SavedStoryDraft, SavedBlueprint, QueueItem, CustomSceneDef } from '../types';
import { generateStoryScript, refineStoryPrompts, enhanceStoryConcept, generateAdditionalScenes } from '../services/geminiService';

interface StoryCreatorProps {
  onQueueStory: (blueprint: StoryBlueprint, referenceImages: ReferenceImage[], options: GenerationOptions) => void;
  onAddItemsToActiveProject: (items: QueueItem[]) => void;
  activeProjectName: string;
  onAddCost: (amount: number) => void;
}

export const StoryCreator: React.FC<StoryCreatorProps> = ({ onQueueStory, onAddItemsToActiveProject, activeProjectName, onAddCost }) => {
  const [activeTab, setActiveTab] = useState<'setup' | 'blueprint' | 'library'>('setup');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  // New Scene Generation State
  const [isAddingScenes, setIsAddingScenes] = useState(false);
  const [newSceneDescription, setNewSceneDescription] = useState('');
  const [newSceneCount, setNewSceneCount] = useState(1);
  const [newSceneInsertIndex, setNewSceneInsertIndex] = useState(0);

  // --- Visual Settings State ---
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [colorMode, setColorMode] = useState<ColorMode>('color');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('5x2');
  const [panelStyle, setPanelStyle] = useState<PanelStyle>('equal');
  const [sceneGenerationMode, setSceneGenerationMode] = useState<'auto' | 'custom'>('auto');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptUploadRef = useRef<HTMLInputElement>(null);
  
  // Custom Scene Image Upload Refs
  const sceneUploadRef = useRef<HTMLInputElement>(null);
  const scriptSceneImagesRef = useRef<HTMLInputElement>(null);
  const [activeSceneUploadId, setActiveSceneUploadId] = useState<string | null>(null);

  // --- Setup State ---
  const [storyPrompt, setStoryPrompt] = useState('');
  const [imagesPerScene, setImagesPerScene] = useState(5);
  const [totalScenes, setTotalScenes] = useState(10);
  const [customScenes, setCustomScenes] = useState<CustomSceneDef[]>([]);

  // Init custom scenes if empty
  useEffect(() => {
    if (customScenes.length === 0) {
        setCustomScenes(Array.from({ length: 5 }, () => ({
            id: crypto.randomUUID(),
            type: 'random',
            description: '',
            characterOverride: ''
        })));
    }
  }, []);

  const [dialogueLevel, setDialogueLevel] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [characters, setCharacters] = useState<StoryCharacter[]>([
    { id: '1', name: '', hairColor: '', description: '', hardDescription: '', role: 'Main' }
  ]);
  
  // --- Theme & Setting State ---
  const [includeRomance, setIncludeRomance] = useState(true);
  const [includeFunny, setIncludeFunny] = useState(true);
  const [useBeach, setUseBeach] = useState(false);
  const [beachCount, setBeachCount] = useState(1);
  const [usePark, setUsePark] = useState(false);
  const [parkCount, setParkCount] = useState(1);
  const [useHome, setUseHome] = useState(false);
  const [homeCount, setHomeCount] = useState(1);
  
  // Custom Scene Management State
  const [customInsertPosition, setCustomInsertPosition] = useState<number>(999); // 999 = End


  // --- Blueprint State ---
  const [blueprint, setBlueprint] = useState<StoryBlueprint | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editPromptValue, setEditPromptValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // --- Generation Queue State (New) ---
  const [queuedCount, setQueuedCount] = useState(0);
  const [queueBatchSize, setQueueBatchSize] = useState(5);
  const [queueStartIndex, setQueueStartIndex] = useState(1);

  // --- AI Refine State ---
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiScope, setAiScope] = useState<'story' | 'scene' | 'page'>('story');
  const [aiTargetId, setAiTargetId] = useState<string>(''); 

  // --- Library State ---
  const [savedDrafts, setSavedDrafts] = useState<SavedStoryDraft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gemini_story_drafts') || '[]');
    } catch { return []; }
  });
  
  const [savedBlueprints, setSavedBlueprints] = useState<SavedBlueprint[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gemini_story_blueprints') || '[]');
    } catch { return []; }
  });

  const [librarySection, setLibrarySection] = useState<'drafts' | 'blueprints'>('drafts');

  useEffect(() => {
    localStorage.setItem('gemini_story_drafts', JSON.stringify(savedDrafts));
  }, [savedDrafts]);

  useEffect(() => {
    localStorage.setItem('gemini_story_blueprints', JSON.stringify(savedBlueprints));
  }, [savedBlueprints]);

  // Sync queue start index when queued count changes
  useEffect(() => {
    setQueueStartIndex(queuedCount + 1);
  }, [queuedCount]);

  // --- Custom Scene Handlers ---
  const handleSwitchToCustomMode = () => {
    setSceneGenerationMode('custom');
    // Set all existing custom scenes to 'custom' type by default when switching mode
    setCustomScenes(prev => prev.map(s => ({ ...s, type: 'custom' })));
  };

  const addCustomScene = () => {
      const newScene: CustomSceneDef = {
          id: crypto.randomUUID(),
          type: 'custom',
          description: '',
          characterOverride: ''
      };
      
      const newScenes = [...customScenes];
      if (customInsertPosition >= newScenes.length) {
          newScenes.push(newScene);
      } else {
          newScenes.splice(customInsertPosition, 0, newScene);
      }
      setCustomScenes(newScenes);
  };

  const updateCustomScene = (id: string, updates: Partial<CustomSceneDef>) => {
      setCustomScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeCustomScene = (id: string) => {
      setCustomScenes(prev => prev.filter(s => s.id !== id));
  };

  const moveCustomScene = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index === 0) return;
      if (direction === 'down' && index === customScenes.length - 1) return;
      
      const newScenes = [...customScenes];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newScenes[index], newScenes[targetIndex]] = [newScenes[targetIndex], newScenes[index]];
      setCustomScenes(newScenes);
  };

  // --- Helper: Flatten Pages ---
  const getFlatPages = () => {
    if (!blueprint) return [];
    const total = blueprint.scenes.reduce((acc, s) => acc + s.pages.length, 0);
    return blueprint.scenes.flatMap((scene) => 
        scene.pages.map(page => ({
            ...page, 
            sceneTitle: scene.title,
            totalImages: total,
            referenceImage: scene.referenceImage // Pass scene ref through
        }))
    );
  };

  // --- File Handlers ---
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
    
    // Clear input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSceneFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeSceneUploadId) return;

      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onloadend = () => {
          const base64String = reader.result as string;
          const base64Data = base64String.split(',')[1];
          updateCustomScene(activeSceneUploadId, { 
              referenceImage: { data: base64Data, mimeType: file.type } 
          });
          setActiveSceneUploadId(null);
      };
      reader.readAsDataURL(file);
      
      if (sceneUploadRef.current) sceneUploadRef.current.value = '';
  };

  const handleBatchSceneImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !blueprint) return;

      const fileList = Array.from(files).filter((f: any) => f.type.startsWith('image/')) as File[];
      
      // Strict count matching check
      if (fileList.length !== blueprint.scenes.length) {
          alert(`Image count mismatch!\n\nYou uploaded ${fileList.length} images, but the story has ${blueprint.scenes.length} scenes.\n\nPlease upload exactly one image per scene.`);
          if (scriptSceneImagesRef.current) scriptSceneImagesRef.current.value = '';
          return;
      }

      const updates = new Map<number, ReferenceImage>();

      await Promise.all(fileList.map(file => new Promise<void>((resolve) => {
          // Look for number at start of filename (e.g., "1.png", "2_scene.jpg")
          const match = file.name.match(/^(\d+)/);
          if (match) {
              const sceneIndex = parseInt(match[1]) - 1; // 1-based to 0-based
              const reader = new FileReader();
              reader.onload = (ev) => {
                  const result = ev.target?.result as string;
                  const base64Data = result.split(',')[1];
                  updates.set(sceneIndex, { data: base64Data, mimeType: file.type });
                  resolve();
              };
              reader.readAsDataURL(file);
          } else {
              resolve();
          }
      })));

      setBlueprint(prev => {
          if (!prev) return null;
          const newScenes = [...prev.scenes];
          updates.forEach((img, idx) => {
              if (newScenes[idx]) {
                  newScenes[idx] = { ...newScenes[idx], referenceImage: img };
              }
          });
          return { ...prev, scenes: newScenes };
      });

      alert(`Successfully loaded ${updates.size} scene reference images!`);
      
      if (scriptSceneImagesRef.current) scriptSceneImagesRef.current.value = '';
  };

  const removeReferenceImage = (indexToRemove: number) => {
    setReferenceImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // --- Script Parser & Upload ---
  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsedBlueprint = parseUploadedScript(text);
        if (parsedBlueprint) {
          setBlueprint(parsedBlueprint);
          setEditedTitle(parsedBlueprint.title);
          setQueuedCount(0);
          setQueueStartIndex(1);
          const allSceneIds = new Set(parsedBlueprint.scenes.map(s => s.id));
          setExpandedScenes(allSceneIds);
          
          setActiveTab('blueprint');
          
          // No prompt, user must click button manually

        } else {
          alert("Could not parse script format. Ensure it follows the standard format.");
        }
      } catch (error) {
        console.error(error);
        alert("Error parsing script file.");
      }
    };
    reader.readAsText(file);
    if (scriptUploadRef.current) scriptUploadRef.current.value = '';
  };

  const parseUploadedScript = (text: string): StoryBlueprint | null => {
    const lines = text.split('\n');
    const titleMatch = text.match(/STORY SCRIPT: (.*)/);
    const title = titleMatch ? titleMatch[1].trim() : "Uploaded Story";
    
    const scenes: StoryScene[] = [];
    let currentScene: StoryScene | null = null;
    let globalIndex = 1;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      if (line.startsWith('SCENE')) {
        const sceneTitleMatch = line.match(/SCENE \d+: (.*)/);
        const sceneTitle = sceneTitleMatch ? sceneTitleMatch[1].trim() : line;
        
        currentScene = {
          id: crypto.randomUUID(),
          title: sceneTitle,
          pages: []
        };
        scenes.push(currentScene);
      } 
      else if (line.startsWith('[Image')) {
        if (currentScene) {
          // Read prompts until next tag or empty lines that signify break
          let promptText = "";
          i++; // Move to next line after [Image X]
          while (i < lines.length) {
            const nextLine = lines[i].trim();
            if (nextLine.startsWith('SCENE') || nextLine.startsWith('[Image') || nextLine.startsWith('===')) {
              i--; // Step back so outer loop catches it
              break;
            }
            if (nextLine) promptText += nextLine + " ";
            i++;
          }
          
          currentScene.pages.push({
            id: crypto.randomUUID(),
            globalIndex: globalIndex++,
            sceneIndex: scenes.length,
            pageInSceneIndex: currentScene.pages.length + 1,
            prompt: promptText.trim()
          });
        }
      }
      i++;
    }

    return scenes.length > 0 ? { title, scenes } : null;
  };


  // --- Character Helpers ---
  const addCharacter = () => {
    setCharacters([...characters, {
      id: crypto.randomUUID(),
      name: '',
      hairColor: '',
      description: '',
      hardDescription: '',
      role: 'Side',
      sceneFrequency: '' 
    }]);
  };

  const updateCharacter = (id: string, field: keyof StoryCharacter, value: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCharacter = (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
  };

  // --- Library Handlers ---
  const saveDraft = () => {
    const name = prompt("Enter a name for this draft:", storyPrompt.substring(0, 20) || "Untitled Draft");
    if (!name) return;

    const settings: StorySettings = {
      storyPrompt,
      imagesPerScene,
      totalScenes: sceneGenerationMode === 'auto' ? totalScenes : customScenes.length,
      dialogueLevel,
      characters,
      includeRomance,
      includeFunny,
      colorMode,
      sceneGenerationMode,
      customSceneGuide: sceneGenerationMode === 'custom' ? customScenes : undefined,
      settingCounts: {
          beach: useBeach ? beachCount : 0,
          amusementPark: usePark ? parkCount : 0,
          home: useHome ? homeCount : 0
      }
    };

    const newDraft: SavedStoryDraft = {
      id: crypto.randomUUID(),
      name,
      settings,
      createdAt: Date.now()
    };

    setSavedDrafts(prev => [newDraft, ...prev]);
    alert("Draft saved to Library!");
  };

  const loadDraft = (draft: SavedStoryDraft) => {
    if (!confirm("Loading this draft will overwrite current settings. Continue?")) return;
    
    const s = draft.settings;
    setStoryPrompt(s.storyPrompt);
    setImagesPerScene(s.imagesPerScene);
    setTotalScenes(s.totalScenes);
    setDialogueLevel(s.dialogueLevel);
    setCharacters(s.characters);
    setIncludeRomance(s.includeRomance);
    setIncludeFunny(s.includeFunny ?? true);
    setColorMode(s.colorMode || 'color');
    setSceneGenerationMode(s.sceneGenerationMode || 'auto');
    if (s.customSceneGuide) setCustomScenes(s.customSceneGuide);
    
    setUseBeach(s.settingCounts.beach > 0);
    setBeachCount(s.settingCounts.beach || 1);
    
    setUsePark(s.settingCounts.amusementPark > 0);
    setParkCount(s.settingCounts.amusementPark || 1);
    
    setUseHome(s.settingCounts.home > 0);
    setHomeCount(s.settingCounts.home || 1);

    setActiveTab('setup');
  };

  const deleteDraft = (id: string) => {
    if (!confirm("Delete this draft?")) return;
    setSavedDrafts(prev => prev.filter(d => d.id !== id));
  };

  const saveBlueprintToLibrary = () => {
    if (!blueprint) {
        alert("Generate a script blueprint first before saving!");
        return;
    }
    const name = prompt("Enter a name for this blueprint:", blueprint.title);
    if (!name) return;

    const newSave: SavedBlueprint = {
      id: crypto.randomUUID(),
      name,
      blueprint,
      createdAt: Date.now(),
      isArchived: false
    };

    setSavedBlueprints(prev => [newSave, ...prev]);
    alert("Blueprint saved to Library!");
  };

  const loadBlueprintFromLibrary = (item: SavedBlueprint) => {
    setBlueprint(item.blueprint);
    setEditedTitle(item.blueprint.title);
    const allSceneIds = new Set(item.blueprint.scenes.map(s => s.id));
    setExpandedScenes(allSceneIds);
    setQueuedCount(0); // Reset progress on load
    setActiveTab('blueprint');
  };

  const toggleArchive = (id: string) => {
    setSavedBlueprints(prev => prev.map(b => b.id === id ? { ...b, isArchived: !b.isArchived } : b));
  };

  const deleteSavedBlueprint = (id: string) => {
    if (!confirm("Delete this saved blueprint?")) return;
    setSavedBlueprints(prev => prev.filter(b => b.id !== id));
  };

  // --- Script Download ---
  const downloadScript = async () => {
    if (!blueprint) return;

    const zip = new JSZip();
    
    // 1. Add Script Text
    let content = `STORY SCRIPT: ${blueprint.title}\n`;
    content += `===================================\n\n`;
    blueprint.scenes.forEach((scene, index) => {
      content += `SCENE ${index + 1}: ${scene.title}\n`;
      content += `-----------------------------------\n`;
      scene.pages.forEach((page) => {
        content += `[Image ${page.pageInSceneIndex}]\n`;
        content += `${page.prompt}\n\n`;
      });
      content += `\n`;
    });
    zip.file(`${blueprint.title.replace(/[^a-z0-9]/gi, '_')}_script.txt`, content);

    // 2. Add Scene Images
    const imgFolder = zip.folder("scene_images");
    if (imgFolder) {
        let hasImages = false;
        blueprint.scenes.forEach((scene, idx) => {
            if (scene.referenceImage) {
                const ext = scene.referenceImage.mimeType.split('/')[1] || 'png';
                imgFolder.file(`${idx + 1}.${ext}`, scene.referenceImage.data, { base64: true });
                hasImages = true;
            }
        });
        if (!hasImages) zip.remove("scene_images");
    }

    // 3. Generate and Download
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${blueprint.title.replace(/[^a-z0-9]/gi, '_')}_project.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  // --- Generation ---
  const handleEnhanceConcept = async () => {
      if (!storyPrompt.trim()) return;
      setIsEnhancing(true);
      try {
          // Track input text cost
          const inputCost = storyPrompt.length * 0.0000005;
          
          const enhancement = await enhanceStoryConcept(storyPrompt);
          setStoryPrompt(prev => prev + "\n\n" + enhancement);
          
          // Track output text cost and total
          const outputCost = enhancement.length * 0.0000015;
          onAddCost(inputCost + outputCost);
      } catch (e) {
          alert("Failed to enhance concept: " + (e as Error).message);
      } finally {
          setIsEnhancing(false);
      }
  };

  const handleGenerateScript = async () => {
    if (!storyPrompt.trim()) return;
    
    // Check constraints if auto mode
    if (sceneGenerationMode === 'auto') {
        const totalSpecific = (useBeach ? beachCount : 0) + (usePark ? parkCount : 0) + (useHome ? homeCount : 0);
        if (totalSpecific > totalScenes) {
            if (!confirm(`You have allocated ${totalSpecific} specific scenes, but the total scene count is ${totalScenes}. Some settings may be merged or ignored. Continue?`)) {
                return;
            }
        }
    }

    setIsGenerating(true);
    try {
      const finalTotalScenes = sceneGenerationMode === 'auto' ? totalScenes : customScenes.length;

      const settings: StorySettings = {
        storyPrompt,
        imagesPerScene,
        totalScenes: finalTotalScenes,
        dialogueLevel,
        characters,
        includeRomance,
        includeFunny,
        colorMode,
        sceneGenerationMode,
        customSceneGuide: sceneGenerationMode === 'custom' ? customScenes : undefined,
        settingCounts: {
            beach: useBeach ? beachCount : 0,
            amusementPark: usePark ? parkCount : 0,
            home: useHome ? homeCount : 0
        }
      };
      
      // Approximate input cost (JSON string of settings + prompts)
      const inputLength = JSON.stringify(settings).length + 2000; // +2000 for system prompt overhead
      const inputCost = inputLength * 0.0000005;

      const result = await generateStoryScript(settings);
      setBlueprint(result);
      setEditedTitle(result.title);
      setQueuedCount(0);
      
      const allSceneIds = new Set(result.scenes.map(s => s.id));
      setExpandedScenes(allSceneIds);
      
      // Approximate output cost
      const outputLength = JSON.stringify(result).length;
      const outputCost = outputLength * 0.0000015;
      
      onAddCost(inputCost + outputCost);
      
      setActiveTab('blueprint');
    } catch (e) {
      alert("Failed to generate story: " + (e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Add Scene Handler ---
  const handleAddScenes = async () => {
      if (!blueprint || !newSceneDescription.trim()) return;

      setIsAddingScenes(true);
      try {
          // Reconstruct current settings from state to pass to generator
          const currentSettings: StorySettings = {
              storyPrompt,
              imagesPerScene,
              totalScenes, // This acts as context for density, though we are adding more
              dialogueLevel,
              characters,
              includeRomance,
              includeFunny,
              colorMode,
              settingCounts: {
                  beach: useBeach ? beachCount : 0,
                  amusementPark: usePark ? parkCount : 0,
                  home: useHome ? homeCount : 0
              }
          };

          const newScenes = await generateAdditionalScenes(
              currentSettings,
              newSceneDescription,
              newSceneCount,
              blueprint,
              newSceneInsertIndex
          );
          
          // Cost calculation
          // Estimate input size: blueprint context + settings + new description
          const inputLength = JSON.stringify(blueprint).length / 2 + JSON.stringify(currentSettings).length + newSceneDescription.length + 1000;
          const inputCost = inputLength * 0.0000005;
          // Estimate output size: new scenes JSON
          const outputLength = JSON.stringify(newScenes).length;
          const outputCost = outputLength * 0.0000015;
          onAddCost(inputCost + outputCost);


          if (newScenes && newScenes.length > 0) {
              // Insert new scenes
              const updatedScenes = [...blueprint.scenes];
              updatedScenes.splice(newSceneInsertIndex, 0, ...newScenes);

              // Re-index everything globally
              let globalCounter = 1;
              updatedScenes.forEach((scene, sIdx) => {
                  scene.pages.forEach((page, pIdx) => {
                      page.globalIndex = globalCounter++;
                      page.sceneIndex = sIdx + 1;
                      page.pageInSceneIndex = pIdx + 1;
                  });
              });

              setBlueprint({ ...blueprint, scenes: updatedScenes });
              setNewSceneDescription('');
              
              // Automatically expand the new scenes
              const newSceneIds = new Set(expandedScenes);
              newScenes.forEach(s => newSceneIds.add(s.id));
              setExpandedScenes(newSceneIds);
              
              alert(`Successfully added ${newSceneCount} scene(s)!`);
          } else {
              throw new Error("No scenes were generated.");
          }

      } catch (error: any) {
          console.error(error);
          alert("Failed to add scenes: " + error.message);
      } finally {
          setIsAddingScenes(false);
      }
  };

  // --- Batch Queueing ---
  const handleQueueBatch = () => {
      if (!blueprint) return;
      
      const allPages = getFlatPages();
      
      // Determine actual start index (0-based for array)
      // User input is 1-based
      const startIndex = Math.max(0, queueStartIndex - 1);
      
      const pagesToQueue = allPages.slice(startIndex, startIndex + queueBatchSize);
      
      if (pagesToQueue.length === 0) {
          alert("No images found in range.");
          return;
      }

      const items: QueueItem[] = pagesToQueue.map(p => {
          // Use scene-specific reference image if available, else fall back to global ones
          const specificRef = (p as any).referenceImage;
          const finalRefs = specificRef ? [specificRef] : referenceImages;

          return {
            id: crypto.randomUUID(),
            prompt: p.prompt,
            referenceImages: finalRefs,
            options: {
                colorMode,
                layout: layoutMode,
                panelStyle
            },
            status: 'pending',
            resultImage: null,
            error: null,
            createdAt: Date.now(),
            storyMetadata: {
                sceneName: p.sceneTitle,
                globalIndex: p.globalIndex,
                totalImages: p.totalImages
            }
          };
      });

      onAddItemsToActiveProject(items);
      
      // Update cursor for next batch
      const nextStart = startIndex + queueBatchSize;
      setQueuedCount(nextStart); 
      setQueueStartIndex(nextStart + 1);
  };

  // --- Refinement ---
  const handleAiRefine = async () => {
    if (!blueprint || !aiInstruction.trim()) return;
    setIsRefining(true);
    try {
      let target = undefined;
      if (aiScope === 'scene' && aiTargetId) target = aiTargetId;
      if (aiScope === 'page' && aiTargetId) target = aiTargetId; 
      
      // Estimate cost
      const inputLength = JSON.stringify(blueprint).length + aiInstruction.length + 500;
      const inputCost = inputLength * 0.0000005;

      const updated = await refineStoryPrompts(blueprint, aiInstruction, aiScope, target);
      setBlueprint(updated);
      setAiInstruction('');
      
      // Estimate output cost (roughly same size as blueprint for full edit, smaller if scoped, but model returns full JSON usually)
      const outputLength = JSON.stringify(updated).length;
      const outputCost = outputLength * 0.0000015;
      onAddCost(inputCost + outputCost);

    } catch (e) {
      alert("AI Edit failed: " + (e as Error).message);
    } finally {
      setIsRefining(false);
    }
  };

  // --- Manual Editing ---
  const startEditing = (page: StoryPage) => {
    setEditingPageId(page.id);
    setEditPromptValue(page.prompt);
  };

  const saveEdit = (sceneId: string, pageId: string) => {
    if (!blueprint) return;
    const newScenes = blueprint.scenes.map(scene => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        pages: scene.pages.map(page => 
          page.id === pageId ? { ...page, prompt: editPromptValue } : page
        )
      };
    });
    setBlueprint({ ...blueprint, scenes: newScenes });
    setEditingPageId(null);
  };

  const saveTitleEdit = () => {
    if (blueprint) {
      setBlueprint({ ...blueprint, title: editedTitle });
      setIsEditingTitle(false);
    }
  };

  const toggleScene = (id: string) => {
    const newSet = new Set(expandedScenes);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedScenes(newSet);
  };

  // --- Finalize (Create New Project from All) ---
  const handleFinalize = () => {
    if (blueprint) {
      onQueueStory(blueprint, referenceImages, {
        colorMode,
        layout: layoutMode,
        panelStyle
      });
    }
  };

  // --- Tabs UI ---
  const renderHeader = () => (
    <div className="flex bg-slate-800 p-1 rounded-xl mb-6 border border-slate-700 w-fit mx-auto">
        <button
            onClick={() => setActiveTab('setup')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'setup' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
        >
            <Wand2 className="w-4 h-4" /> Setup
        </button>
        <button
            onClick={() => setActiveTab('blueprint')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'blueprint' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
        >
            <Layers className="w-4 h-4" /> Blueprint
        </button>
        <button
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'library' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
        >
            <Library className="w-4 h-4" /> Library
        </button>
    </div>
  );

  if (activeTab === 'library') {
    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {renderHeader()}
            
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl min-h-[500px]">
                <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Library className="w-6 h-6 text-indigo-400" /> Library
                        </h2>
                        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                             <button 
                                onClick={() => setLibrarySection('drafts')}
                                className={`px-3 py-1 text-sm rounded-md transition-colors ${librarySection === 'drafts' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
                             >
                                Drafts
                             </button>
                             <button 
                                onClick={() => setLibrarySection('blueprints')}
                                className={`px-3 py-1 text-sm rounded-md transition-colors ${librarySection === 'blueprints' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
                             >
                                Blueprints & Archives
                             </button>
                        </div>
                    </div>
                </div>

                {/* Library Content */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {librarySection === 'drafts' && (
                        savedDrafts.length === 0 ? (
                            <div className="col-span-full text-center py-20 text-slate-500">
                                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No saved drafts found.</p>
                                <p className="text-xs">Save your current setup in the 'Setup' tab.</p>
                            </div>
                        ) : (
                            savedDrafts.map(draft => (
                                <div key={draft.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 hover:border-indigo-500/50 transition-all group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-white truncate pr-6" title={draft.name}>{draft.name}</h3>
                                        <button 
                                            onClick={() => deleteDraft(draft.id)}
                                            className="text-slate-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-4 space-y-1">
                                        <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(draft.createdAt).toLocaleDateString()}</div>
                                        <div>Scenes: {draft.settings.totalScenes} | Chars: {draft.settings.characters.length}</div>
                                        <div className="line-clamp-2 italic opacity-75">{draft.settings.storyPrompt}</div>
                                    </div>
                                    <button 
                                        onClick={() => loadDraft(draft)}
                                        className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg text-sm font-bold border border-indigo-500/30 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw className="w-4 h-4" /> Load Draft
                                    </button>
                                </div>
                            ))
                        )
                    )}

                    {librarySection === 'blueprints' && (
                        savedBlueprints.length === 0 ? (
                             <div className="col-span-full text-center py-20 text-slate-500">
                                <Archive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No saved blueprints found.</p>
                                <p className="text-xs">Save generated stories in the 'Blueprint' tab.</p>
                            </div>
                        ) : (
                            savedBlueprints.sort((a,b) => (a.isArchived === b.isArchived) ? 0 : a.isArchived ? 1 : -1).map(bp => (
                                <div key={bp.id} className={`border rounded-xl p-4 transition-all group relative ${bp.isArchived ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-900 border-slate-700 hover:border-indigo-500/50'}`}>
                                    {bp.isArchived && <div className="absolute top-2 right-10 px-2 py-0.5 bg-slate-800 text-slate-500 text-[10px] rounded border border-slate-700 uppercase font-bold">Archived</div>}
                                    
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className={`font-bold truncate pr-6 ${bp.isArchived ? 'text-slate-500' : 'text-white'}`} title={bp.name}>{bp.name}</h3>
                                        <button 
                                            onClick={() => deleteSavedBlueprint(bp.id)}
                                            className="text-slate-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="text-xs text-slate-400 mb-4 space-y-1">
                                        <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(bp.createdAt).toLocaleDateString()}</div>
                                        <div>Title: {bp.blueprint.title}</div>
                                        <div>{bp.blueprint.scenes.length} Scenes | {bp.blueprint.scenes.reduce((acc, s) => acc + s.pages.length, 0)} Images</div>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => loadBlueprintFromLibrary(bp)}
                                            className="flex-1 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg text-sm font-bold border border-indigo-500/30 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Wand2 className="w-4 h-4" /> Load Project
                                        </button>
                                        <button 
                                            onClick={() => toggleArchive(bp.id)}
                                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg border border-slate-700"
                                            title={bp.isArchived ? "Unarchive" : "Archive"}
                                        >
                                            <Archive className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )
                    )}
                </div>
            </div>
        </div>
    );
  }

  if (activeTab === 'setup') {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        {renderHeader()}
        
        {/* Hidden File Input for Scene Uploads */}
        <input 
            type="file" 
            ref={sceneUploadRef}
            accept="image/*" 
            className="hidden"
            onChange={handleSceneFileChange}
        />

        {/* Visual Settings Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
           <div className="flex items-center gap-3 mb-6 border-b border-slate-700 pb-4">
            <Palette className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Project Configuration</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Reference Image Upload */}
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Global Reference Images</label>
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        relative group cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all duration-200
                        flex flex-col items-center justify-center text-center
                        ${referenceImages.length > 0
                            ? 'border-indigo-500/50 bg-slate-900/50 min-h-[160px]' 
                            : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-700/30 h-40'
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
                            <div className="flex flex-col items-center justify-center border border-slate-700 rounded-lg bg-slate-800/50 text-slate-500 text-xs aspect-square">
                                <Plus className="w-4 h-4 mb-1" />
                                Add More
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mx-auto">
                                <Upload className="w-5 h-5 text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-300">Upload Art Style References</p>
                            <p className="text-xs text-slate-500">Supports Multiple Files</p>
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

            {/* Config Toggles */}
            <div className="space-y-4">
                 {/* Structure Mode Toggle (Updated) */}
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Structure Mode</label>
                    <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button onClick={() => setSceneGenerationMode('auto')} className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1 ${sceneGenerationMode === 'auto' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                            <Wand2 className="w-3 h-3" /> Auto
                        </button>
                        <button onClick={handleSwitchToCustomMode} className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1 ${sceneGenerationMode === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                            <ListOrdered className="w-3 h-3" /> Custom
                        </button>
                    </div>
                </div>
                 {/* Color Mode */}
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Color Mode</label>
                    <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button onClick={() => setColorMode('color')} className={`py-1.5 text-xs font-medium rounded-md ${colorMode === 'color' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Color</button>
                        <button onClick={() => setColorMode('bw')} className={`py-1.5 text-xs font-medium rounded-md ${colorMode === 'bw' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>B&W</button>
                    </div>
                </div>
                {/* Layout Mode */}
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Layout</label>
                    <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button onClick={() => setLayoutMode('5x2')} className={`py-1.5 text-xs font-medium rounded-md ${layoutMode === '5x2' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>5x2 (Wide)</button>
                        <button onClick={() => setLayoutMode('2x5')} className={`py-1.5 text-xs font-medium rounded-md ${layoutMode === '2x5' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>2x5 (Tall)</button>
                    </div>
                </div>

                {/* Panel Style */}
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Panel Style</label>
                    <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button onClick={() => setPanelStyle('equal')} className={`py-1.5 text-xs font-medium rounded-md ${panelStyle === 'equal' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Same Sized</button>
                        <button onClick={() => setPanelStyle('dynamic')} className={`py-1.5 text-xs font-medium rounded-md ${panelStyle === 'dynamic' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Dynamic</button>
                    </div>
                </div>
            </div>
          </div>
        </div>

        {/* Story Content Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
            <div className="flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">Story Content</h2>
            </div>
            <button 
                onClick={saveDraft}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
                <Save className="w-4 h-4" /> Save Draft
            </button>
          </div>
          
           <div className="space-y-6">
            {/* Main Prompt */}
            <div>
              <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-400">Story Concept</label>
                  <button 
                    onClick={handleEnhanceConcept}
                    disabled={isEnhancing || !storyPrompt.trim()}
                    className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                     {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                     Expand & Enhance
                  </button>
              </div>
              <textarea
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 placeholder-slate-600 text-sm leading-relaxed"
                placeholder="Describe your story idea here..."
              />
            </div>

             {/* Special Settings: Romance and Scenes */}
            <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-700/50 inline-flex flex-wrap gap-4">
                {/* Romance Toggle */}
                <div className="flex items-center gap-3">
                   <button 
                     onClick={() => setIncludeRomance(!includeRomance)}
                     className={`w-12 h-6 rounded-full transition-colors relative ${includeRomance ? 'bg-pink-600' : 'bg-slate-700'}`}
                   >
                     <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${includeRomance ? 'translate-x-6' : 'translate-x-0'}`} />
                   </button>
                   <span className="text-sm font-bold flex items-center gap-2 text-white">
                     <Heart className={`w-4 h-4 ${includeRomance ? 'text-pink-400 fill-pink-400' : 'text-slate-500'}`} />
                     Romance
                   </span>
                </div>

                 {/* Funny Toggle */}
                 <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
                   <button 
                     onClick={() => setIncludeFunny(!includeFunny)}
                     className={`w-12 h-6 rounded-full transition-colors relative ${includeFunny ? 'bg-yellow-500' : 'bg-slate-700'}`}
                   >
                     <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${includeFunny ? 'translate-x-6' : 'translate-x-0'}`} />
                   </button>
                   <span className="text-sm font-bold flex items-center gap-2 text-white">
                     <Smile className={`w-4 h-4 ${includeFunny ? 'text-yellow-300 fill-yellow-300' : 'text-slate-500'}`} />
                     Funny
                   </span>
                </div>
            </div>

            <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-400">Specific Scene Allocations</label>
                
                {/* Beach */}
                <div className="flex items-center gap-4 bg-slate-900/30 p-2 rounded-lg border border-slate-700/30">
                    <div className="flex items-center gap-3 w-48">
                         <input 
                            type="checkbox" 
                            checked={useBeach} 
                            onChange={(e) => setUseBeach(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                         />
                         <span className={`text-sm flex items-center gap-2 ${useBeach ? 'text-white' : 'text-slate-500'}`}>
                            <Sun className="w-4 h-4" /> Beach
                         </span>
                    </div>
                    {useBeach && (
                        <div className="flex items-center gap-2">
                             <input 
                                type="number" 
                                min={1} 
                                max={totalScenes} 
                                value={beachCount} 
                                onChange={(e) => setBeachCount(parseInt(e.target.value))}
                                className="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                             />
                             <span className="text-xs text-slate-500">scenes</span>
                        </div>
                    )}
                </div>

                {/* Amusement Park */}
                <div className="flex items-center gap-4 bg-slate-900/30 p-2 rounded-lg border border-slate-700/30">
                    <div className="flex items-center gap-3 w-48">
                         <input 
                            type="checkbox" 
                            checked={usePark} 
                            onChange={(e) => setUsePark(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                         />
                         <span className={`text-sm flex items-center gap-2 ${usePark ? 'text-white' : 'text-slate-500'}`}>
                            <Tent className="w-4 h-4" /> Amusement Park
                         </span>
                    </div>
                    {usePark && (
                        <div className="flex items-center gap-2">
                             <input 
                                type="number" 
                                min={1} 
                                max={totalScenes} 
                                value={parkCount} 
                                onChange={(e) => setParkCount(parseInt(e.target.value))}
                                className="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                             />
                             <span className="text-xs text-slate-500">scenes</span>
                        </div>
                    )}
                </div>

                {/* Home */}
                <div className="flex items-center gap-4 bg-slate-900/30 p-2 rounded-lg border border-slate-700/30">
                    <div className="flex items-center gap-3 w-48">
                         <input 
                            type="checkbox" 
                            checked={useHome} 
                            onChange={(e) => setUseHome(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                         />
                         <span className={`text-sm flex items-center gap-2 ${useHome ? 'text-white' : 'text-slate-500'}`}>
                            <Home className="w-4 h-4" /> Home
                         </span>
                    </div>
                    {useHome && (
                        <div className="flex items-center gap-2">
                             <input 
                                type="number" 
                                min={1} 
                                max={totalScenes} 
                                value={homeCount} 
                                onChange={(e) => setHomeCount(parseInt(e.target.value))}
                                className="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                             />
                             <span className="text-xs text-slate-500">scenes</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Structure Settings */}
            <div className="grid grid-cols-1 gap-6 pt-4 border-t border-slate-700/50">
              
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Total Scenes - Only visible in Auto */}
                 {sceneGenerationMode === 'auto' && (
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Total Scenes</label>
                        <input 
                        type="number" 
                        min={1} max={10}
                        value={totalScenes}
                        onChange={(e) => setTotalScenes(parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        />
                    </div>
                 )}

                 {/* Images per Scene - Always visible */}
                 <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Images per Scene</label>
                    <input 
                    type="number" 
                    min={1} max={10}
                    value={imagesPerScene}
                    onChange={(e) => setImagesPerScene(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                </div>

                {/* Dialogue Amount - Always visible */}
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Dialogue Amount</label>
                    <select 
                    value={dialogueLevel}
                    onChange={(e) => setDialogueLevel(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    </select>
                </div>
              </div>
              
              {/* Scene Structure Manager - Only visible in Custom */}
              {sceneGenerationMode === 'custom' && (
                  <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-700/50">
                      <div className="flex items-center justify-between mb-4">
                          <label className="block text-sm font-medium text-white flex items-center gap-2">
                              <ListOrdered className="w-4 h-4 text-indigo-400" /> Custom Scene Guide
                          </label>
                          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                              Total Scenes: {customScenes.length}
                          </span>
                      </div>
                      
                      <div className="space-y-3 mb-4">
                          {customScenes.map((scene, idx) => (
                              <div key={scene.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-slate-500 w-16">Scene {idx + 1}</span>
                                          <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700">
                                              <button 
                                                onClick={() => updateCustomScene(scene.id, { type: 'random' })}
                                                className={`px-2 py-0.5 text-[10px] font-bold rounded ${scene.type === 'random' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                                              >
                                                  Random
                                              </button>
                                              <button 
                                                onClick={() => updateCustomScene(scene.id, { type: 'custom' })}
                                                className={`px-2 py-0.5 text-[10px] font-bold rounded ${scene.type === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                                              >
                                                  Custom
                                              </button>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                          <button onClick={() => moveCustomScene(idx, 'up')} disabled={idx === 0} className="p-1 text-slate-500 hover:text-white disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                                          <button onClick={() => moveCustomScene(idx, 'down')} disabled={idx === customScenes.length - 1} className="p-1 text-slate-500 hover:text-white disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                                          <button onClick={() => removeCustomScene(scene.id)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                  </div>
                                  
                                  {scene.type === 'custom' ? (
                                      <textarea 
                                          value={scene.description}
                                          onChange={(e) => updateCustomScene(scene.id, { description: e.target.value })}
                                          placeholder="Describe what happens in this scene..."
                                          className="w-full h-16 bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white resize-none focus:border-indigo-500 focus:outline-none"
                                      />
                                  ) : (
                                      <div className="w-full h-8 bg-slate-900/50 border border-slate-700/50 rounded flex items-center px-3 text-xs text-slate-500 italic">
                                          Content will be auto-generated based on story flow.
                                      </div>
                                  )}

                                  {/* Visual Override Input */}
                                  <div className="mt-1 border-t border-slate-700 pt-2">
                                      <label className="block text-[10px] font-bold text-indigo-300 mb-1 uppercase tracking-wider">Main Character Visual Override</label>
                                      <input 
                                          value={scene.characterOverride || ''}
                                          onChange={(e) => updateCustomScene(scene.id, { characterOverride: e.target.value })}
                                          placeholder="e.g. '8 months pregnant' (replaces default hard description for this scene)"
                                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:border-indigo-500 outline-none"
                                      />
                                  </div>

                                  {/* Reference Image Override */}
                                  <div className="mt-1 flex items-center gap-2">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Ref Image</div>
                                      {scene.referenceImage ? (
                                          <div className="relative group/img">
                                              <img src={`data:${scene.referenceImage.mimeType};base64,${scene.referenceImage.data}`} className="w-8 h-8 rounded object-cover border border-slate-600" />
                                              <button onClick={() => updateCustomScene(scene.id, { referenceImage: undefined })} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity"><X className="w-2 h-2" /></button>
                                          </div>
                                      ) : (
                                          <button onClick={() => { setActiveSceneUploadId(scene.id); sceneUploadRef.current?.click(); }} className="p-1 bg-slate-900 border border-slate-700 rounded hover:border-indigo-500 text-slate-500">
                                              <Upload className="w-3 h-3" />
                                          </button>
                                      )}
                                      <span className="text-[10px] text-slate-600 italic">Optional. Overrides global ref.</span>
                                  </div>
                              </div>
                          ))}
                      </div>

                      {/* Add Scene Controls */}
                      <div className="flex gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
                           <button 
                              onClick={addCustomScene}
                              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-2"
                           >
                               <Plus className="w-3 h-3" /> Add Scene
                           </button>
                           <select
                                value={customInsertPosition}
                                onChange={(e) => setCustomInsertPosition(parseInt(e.target.value))}
                                className="bg-slate-900 border border-slate-600 text-white text-xs rounded px-2"
                           >
                               <option value={999}>At End</option>
                               <option value={0}>At Start</option>
                               {customScenes.map((_, i) => (
                                   <option key={i} value={i+1}>After Scene {i+1}</option>
                               ))}
                           </select>
                      </div>
                  </div>
              )}
            </div>

            {/* Characters */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-400">Characters</label>
                <button onClick={addCharacter} className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                  <Plus className="w-3 h-3" /> Add Character
                </button>
              </div>
              
              <div className="space-y-4">
                {characters.map((char, idx) => (
                  <div key={char.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex flex-col gap-3">
                    <div className="flex gap-2">
                        <input
                          placeholder="Name"
                          value={char.name}
                          onChange={(e) => updateCharacter(char.id, 'name', e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500"
                        />
                        <select
                          value={char.role}
                          onChange={(e) => updateCharacter(char.id, 'role', e.target.value)}
                          className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white"
                        >
                          <option value="Main">Main</option>
                          <option value="Side">Side</option>
                        </select>
                        {characters.length > 1 && (
                            <button onClick={() => removeCharacter(char.id)} className="p-1.5 text-slate-500 hover:text-red-400 bg-slate-800 rounded border border-slate-700">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    
                    <textarea
                        placeholder="Character Bio / Personality"
                        value={char.description}
                        onChange={(e) => updateCharacter(char.id, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white h-16 resize-none placeholder-slate-500"
                    />

                    {/* Hard Description Field */}
                    <div className="bg-indigo-900/20 p-2 rounded border border-indigo-500/30 space-y-2">
                        <div>
                            <label className="block text-xs font-bold text-indigo-300 mb-1 uppercase tracking-wider">Hard Description (Visual Enforcer)</label>
                            <input
                                placeholder="e.g. 'pregnant bellied' or 'muscular'"
                                value={char.hardDescription}
                                onChange={(e) => updateCharacter(char.id, 'hardDescription', e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-indigo-300 mb-1 uppercase tracking-wider">Hair Color</label>
                            <input
                                placeholder="e.g. 'black', 'blonde', 'red'"
                                value={char.hairColor}
                                onChange={(e) => updateCharacter(char.id, 'hairColor', e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500"
                            />
                        </div>
                        <p className="text-[10px] text-indigo-300/70 mt-1">
                            Format generated: [Hair Color]-haired [Visual Enforcer] [Name]<br/>
                            Example: "black-haired pregnant bellied Sarah"
                        </p>
                    </div>

                    {char.role === 'Side' && (
                        <input
                          type="number"
                          min="1"
                          max={totalScenes}
                          placeholder="Scene Count (e.g. 2)"
                          value={char.sceneFrequency}
                          onChange={(e) => updateCharacter(char.id, 'sceneFrequency', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300"
                        />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={handleGenerateScript}
              disabled={isGenerating || !storyPrompt.trim()}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
              Generate Story Blueprint
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6">
      {/* Sidebar: AI Editor & Controls */}
      <div className="lg:w-1/3 flex flex-col gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex-grow flex flex-col min-h-[400px]">
           <div className="flex items-center gap-2 mb-4 text-white font-bold">
             <Sparkles className="w-5 h-5 text-indigo-400" />
             AI Script Editor
           </div>
           
           <div className="flex-grow space-y-4">
             <div>
               <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Instruction</label>
               <textarea
                 value={aiInstruction}
                 onChange={(e) => setAiInstruction(e.target.value)}
                 placeholder="e.g., 'Make the dialogue darker' or 'Add rain to scene 2'"
                 className="w-full h-24 mt-2 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white resize-none"
               />
             </div>
             
             <div>
               <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scope</label>
               <div className="flex gap-2 mt-2">
                 {(['story', 'scene', 'page'] as const).map(s => (
                   <button
                    key={s}
                    onClick={() => setAiScope(s)}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded border ${
                      aiScope === s 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                   >
                     {s}
                   </button>
                 ))}
               </div>
             </div>

             {aiScope === 'scene' && (
               <select 
                 value={aiTargetId}
                 onChange={(e) => setAiTargetId(e.target.value)}
                 className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-sm text-white"
               >
                 <option value="">Select Scene...</option>
                 {blueprint?.scenes.map((s, idx) => (
                   <option key={s.id} value={s.id}>{idx + 1}. {s.title}</option>
                 ))}
               </select>
             )}

             {aiScope === 'page' && (
               <select 
                 value={aiTargetId}
                 onChange={(e) => setAiTargetId(e.target.value)}
                 className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-sm text-white"
               >
                 <option value="">Select Page...</option>
                 {blueprint?.scenes.map((s, idx) => (
                    <optgroup key={s.id} label={`Scene ${idx + 1}: ${s.title}`}>
                        {s.pages.map((p) => (
                             <option key={p.id} value={p.id}>
                                Image {p.pageInSceneIndex}: {p.prompt.length > 30 ? p.prompt.substring(0, 30) + '...' : p.prompt}
                             </option>
                        ))}
                    </optgroup>
                 ))}
               </select>
             )}
             
             <button
               onClick={handleAiRefine}
               disabled={isRefining || !aiInstruction}
               className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2"
             >
               {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
               Apply AI Changes
             </button>
           </div>
        </div>

        {/* --- Add New Scenes Section --- */}
        {blueprint && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-xl space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                    <FilePlus className="w-4 h-4 text-purple-400" />
                    Add New Scenes
                </h3>
                
                <div>
                   <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Scene Description</label>
                   <textarea
                     value={newSceneDescription}
                     onChange={(e) => setNewSceneDescription(e.target.value)}
                     placeholder="What happens in these new scenes?"
                     className="w-full h-20 mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white resize-none"
                   />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Count</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="5"
                            value={newSceneCount}
                            onChange={(e) => setNewSceneCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                        />
                    </div>
                    <div>
                         <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Position</label>
                         <select
                            value={newSceneInsertIndex}
                            onChange={(e) => setNewSceneInsertIndex(parseInt(e.target.value))}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                         >
                            <option value={0}>Before Scene 1</option>
                            {blueprint.scenes.map((s, idx) => (
                                <option key={s.id} value={idx + 1}>
                                    {idx === blueprint.scenes.length - 1 ? `After Scene ${idx + 1}` : `Between Scene ${idx + 1} & ${idx + 2}`}
                                </option>
                            ))}
                         </select>
                    </div>
                </div>

                <button
                    onClick={handleAddScenes}
                    disabled={isAddingScenes || !newSceneDescription}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                    {isAddingScenes ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4" />
                            Generate & Add Scenes
                        </>
                    )}
                </button>
            </div>
        )}
        
        {/* --- Batch Generation Controls --- */}
        {blueprint && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-xl space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                    <ListPlus className="w-4 h-4 text-emerald-400" />
                    Generation Queue
                </h3>
                
                <div className="bg-black/30 p-2 rounded-lg text-xs space-y-1 font-mono">
                    <div className="flex justify-between">
                        <span className="text-slate-400">Target Project:</span>
                        <span className="text-white truncate max-w-[150px]" title={activeProjectName}>{activeProjectName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Queued:</span>
                        <span className="text-emerald-400">{queuedCount} / {getFlatPages().length}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <span className="text-xs font-bold text-slate-400 block mb-1">Start From #</span>
                        <input 
                            type="number" 
                            min={1} 
                            max={getFlatPages().length}
                            value={queueStartIndex}
                            onChange={(e) => setQueueStartIndex(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-center text-sm font-bold text-white"
                        />
                    </div>
                    <div>
                        <span className="text-xs font-bold text-slate-400 block mb-1">Batch Size</span>
                        <input 
                            type="number" 
                            min={1} 
                            max={20}
                            value={queueBatchSize}
                            onChange={(e) => setQueueBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-center text-sm font-bold text-white"
                        />
                    </div>
                </div>

                <button
                    onClick={handleQueueBatch}
                    disabled={queuedCount >= getFlatPages().length && queueStartIndex > getFlatPages().length}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all"
                >
                    {queuedCount >= getFlatPages().length && queueStartIndex > getFlatPages().length ? (
                        "All Images Queued"
                    ) : (
                        <>
                            Queue Next {queueBatchSize}
                            <ArrowRight className="w-4 h-4" />
                            <span className="text-xs opacity-75 font-normal">
                                ({queueStartIndex}-{Math.min(queueStartIndex + queueBatchSize - 1, getFlatPages().length)})
                            </span>
                        </>
                    )}
                </button>
            </div>
        )}

        <div className="grid grid-cols-2 gap-2">
             <button
              onClick={saveBlueprintToLibrary}
              disabled={!blueprint}
              className="py-3 bg-slate-700 hover:bg-indigo-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <Save className="w-4 h-4" />
              Save Lib
            </button>

             {/* Script Download Button */}
             <button
              onClick={downloadScript}
              disabled={!blueprint}
              className="py-3 bg-slate-700 hover:bg-indigo-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Script
            </button>
        </div>

        <button
          onClick={handleFinalize}
          disabled={!blueprint}
          className="w-full py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm"
        >
          <PlayCircle className="w-4 h-4" />
          Queue All (New Project)
        </button>
      </div>

      {/* Main Content: Script Visualization */}
      <div className="lg:w-2/3 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex flex-col gap-2">
           {renderHeader()}
           
           <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-400" />
                        Story Blueprint
                    </h3>
                    {/* Upload Button */}
                    <button 
                        onClick={() => scriptUploadRef.current?.click()}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded border border-slate-600 flex items-center gap-1 transition-colors"
                        title="Upload previously downloaded script (.txt)"
                    >
                        <FileUp className="w-3 h-3" /> Upload Script
                    </button>
                    {blueprint && (
                        <button
                            onClick={() => scriptSceneImagesRef.current?.click()}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded border border-indigo-500 flex items-center gap-1 transition-colors font-bold shadow-sm"
                            title="Upload folder containing 1.png, 2.png, etc."
                        >
                            <FolderPlus className="w-3 h-3" /> Upload Scene Images
                        </button>
                    )}
                    <input 
                        type="file" 
                        ref={scriptUploadRef} 
                        onChange={handleScriptUpload} 
                        accept=".txt" 
                        className="hidden" 
                    />
                    <input 
                        type="file" 
                        ref={scriptSceneImagesRef} 
                        onChange={handleBatchSceneImagesUpload}
                        accept="image/*" 
                        multiple
                        className="hidden" 
                    />
                </div>
                <div className="flex items-center gap-3">
                    {referenceImages.length > 0 && (
                        <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> {referenceImages.length} Ref Image{referenceImages.length !== 1 ? 's' : ''} Active
                        </span>
                    )}
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                    Total Images: {blueprint?.scenes.reduce((acc, s) => acc + s.pages.length, 0)}
                    </span>
                </div>
           </div>
           
           {/* Title Editor */}
           <div className="flex items-center gap-2 mt-2">
             <span className="text-xs text-slate-500 uppercase font-bold">Title:</span>
             {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-grow">
                    <input 
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="flex-grow px-2 py-1 bg-slate-900 border border-indigo-500 rounded text-sm text-white focus:outline-none"
                        autoFocus
                    />
                    <button onClick={saveTitleEdit} className="p-1 bg-green-600 rounded text-white"><Save className="w-4 h-4" /></button>
                </div>
             ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                    <span className="text-lg font-bold text-indigo-300 border-b border-transparent group-hover:border-indigo-500/50 transition-all">
                        {blueprint?.title || "Untitled Story"}
                    </span>
                    <Edit3 className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
             )}
           </div>
           
            <input 
                type="file" 
                ref={fileInputRef}
                accept="image/*" 
                multiple
                onChange={handleFileChange}
                className="hidden" 
            />
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {blueprint?.scenes.map((scene, sIndex) => (
            <div key={scene.id} className="border border-slate-700 rounded-xl bg-slate-900/30 overflow-hidden">
              <button 
                onClick={() => toggleScene(scene.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedScenes.has(scene.id) ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="font-mono text-indigo-400 font-bold">Scene {sIndex + 1}</span>
                  <span className="text-white font-medium">{scene.title}</span>
                </div>
                <div className="flex items-center gap-2">
                     <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{scene.pages.length} Images</span>
                </div>
              </button>

              {expandedScenes.has(scene.id) && (
                <div className="border-t border-slate-700 p-4 space-y-4 bg-slate-900/50">
                  {scene.pages.map((page) => (
                    <div key={page.id} className="relative group flex items-stretch gap-4">
                      {/* Image Number / Status */}
                      <div className="flex-shrink-0 w-16 pt-3 flex flex-col items-center">
                           <button
                               onClick={() => {
                                    if (confirm(`Reset queue cursor to Image ${page.globalIndex}? The next batch will start from here.`)) {
                                        setQueuedCount(page.globalIndex - 1);
                                        setQueueStartIndex(page.globalIndex);
                                    }
                               }}
                               className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold font-mono shadow-lg transition-all relative group/btn ${
                                   page.globalIndex < queueStartIndex 
                                   ? 'bg-slate-800 border-slate-600 text-slate-500' // Passed
                                   : page.globalIndex < queueStartIndex + queueBatchSize
                                      ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400 hover:bg-amber-600 hover:border-amber-400 hover:text-white' // Next up
                                      : 'bg-slate-800 border-slate-600 text-indigo-400 hover:bg-indigo-600 hover:border-indigo-400 hover:text-white' // Future
                               }`}
                               title="Click to set queue cursor here"
                           >
                                <span className="group-hover/btn:hidden">{page.globalIndex}</span>
                                <RotateCcw className="w-4 h-4 hidden group-hover/btn:block" />
                           </button>
                           <div className="w-px h-full bg-slate-700 my-2 last:hidden"></div>
                      </div>
                      
                      {/* Content Box */}
                      <div className="flex-grow min-w-0">
                          {editingPageId === page.id ? (
                            <div className="space-y-2 bg-slate-800 p-3 rounded-lg border border-indigo-500/50">
                              <div className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-2">Editing Image Prompt</div>
                              <textarea
                                value={editPromptValue}
                                onChange={(e) => setEditPromptValue(e.target.value)}
                                className="w-full h-32 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingPageId(null)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white font-bold">Cancel</button>
                                <button onClick={() => saveEdit(scene.id, page.id)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 font-bold shadow-lg shadow-indigo-900/20">Save Changes</button>
                              </div>
                            </div>
                          ) : (
                            <div 
                              onClick={() => startEditing(page)}
                              className={`relative p-4 rounded-xl border transition-all group-item shadow-sm hover:shadow-md cursor-pointer ${
                                  page.globalIndex >= queueStartIndex && page.globalIndex < queueStartIndex + queueBatchSize
                                  ? 'bg-emerald-900/10 border-emerald-500/30'
                                  : 'bg-slate-800 border-slate-700 hover:border-indigo-500/30 hover:bg-slate-700/50'
                              }`}
                            >
                               {/* Label Badge */}
                               <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  Image {page.pageInSceneIndex}
                               </div>

                               <p className="text-sm text-slate-300 leading-relaxed font-medium">{page.prompt}</p>
                               
                               <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="p-1.5 bg-slate-900 rounded-lg text-indigo-400 border border-slate-700">
                                    <Edit3 className="w-3 h-3" />
                                  </div>
                                </div>
                            </div>
                          )}
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
