
export interface ReferenceImage {
  data: string; // Base64 string
  mimeType: string;
}

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'stopped';

export type ColorMode = 'color' | 'bw';
export type LayoutMode = '5x2' | '2x5';
export type PanelStyle = 'equal' | 'dynamic';

export interface GenerationOptions {
  colorMode: ColorMode;
  layout: LayoutMode;
  panelStyle: PanelStyle;
}

export interface QueueItem {
  id: string;
  prompt: string;
  referenceImages: ReferenceImage[]; // Changed from single to array
  options: GenerationOptions;
  status: QueueStatus;
  resultImage: string | null; // Base64 string
  error: string | null;
  createdAt: number;
  // Optional metadata for story mode items
  storyMetadata?: {
    sceneName: string;
    globalIndex: number;
    totalImages: number;
  };
}

export interface Project {
  id: string;
  name: string;
  items: QueueItem[];
  createdAt: number;
}

// --- Story Mode Types ---

export type CharacterRole = 'Main' | 'Side';
export type DialogueLevel = 'Low' | 'Medium' | 'High';

export interface StoryCharacter {
  id: string;
  name: string;
  hairColor?: string; // New field
  hardDescription?: string; // New field for persistent visual traits
  description: string;
  role: CharacterRole;
  sceneFrequency?: string; // e.g. "Every 2 scenes", "Only climax"
}

export interface CustomSceneDef {
    id: string;
    type: 'random' | 'custom';
    description: string;
    characterOverride?: string; // Per-scene visual trait override
    referenceImage?: ReferenceImage; // Per-scene reference image override
}

export interface StorySettings {
  storyPrompt: string;
  imagesPerScene: number;
  totalScenes: number;
  dialogueLevel: DialogueLevel;
  characters: StoryCharacter[];
  includeRomance: boolean;
  includeFunny: boolean; // New field
  colorMode?: ColorMode; // New field
  sceneGenerationMode?: 'auto' | 'custom'; // New field
  customSceneGuide?: CustomSceneDef[]; // New field
  settingCounts: {
    beach: number;
    amusementPark: number;
    home: number;
  };
}

export interface StoryPage {
  id: string;
  globalIndex: number; // 1 to N across entire story
  sceneIndex: number;
  pageInSceneIndex: number; // 1 to N within scene
  prompt: string;
}

export interface StoryScene {
  id: string;
  title: string;
  pages: StoryPage[];
  referenceImage?: ReferenceImage; // Carried over from CustomSceneDef
}

export interface StoryBlueprint {
  title: string;
  scenes: StoryScene[];
}

// --- Library Types ---

export interface SavedStoryDraft {
  id: string;
  name: string;
  settings: StorySettings;
  createdAt: number;
}

export interface SavedBlueprint {
  id: string;
  name: string;
  blueprint: StoryBlueprint;
  createdAt: number;
  isArchived: boolean;
}
