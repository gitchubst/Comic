
import { GoogleGenAI, Part, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ReferenceImage, GenerationOptions, StorySettings, StoryBlueprint, StoryScene } from '../types';

const getClient = () => {
  // 1. Check for manual override key first
  const customKey = localStorage.getItem('gemini_custom_api_key');
  if (customKey) {
      return new GoogleGenAI({ apiKey: customKey });
  }

  // 2. Fallback to environment/injected key (AI Studio / IDX)
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please select a Google Cloud Project or enter a key manually.");
  }
  return new GoogleGenAI({ apiKey });
}

// Helper: Common safety settings to prevent blocking on creative content
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export const generateImageWithGemini = async (
  prompt: string,
  referenceImages: ReferenceImage[],
  options: GenerationOptions
): Promise<string> => {
  const ai = getClient();
  const parts: Part[] = [];

  if (referenceImages && referenceImages.length > 0) {
    referenceImages.forEach(img => {
        parts.push({
            inlineData: {
                data: img.data,
                mimeType: img.mimeType,
            },
        });
    });
  }

  // Inject strict style and formatting constraints
  const technicalPrompt = `
  Requirement: High quality art. Adhere to panel layout. This image should be strict to the style of the reference image. The chapter number or page number should not be in the picture. The panels should be separated by a thin black line and there should be no white space between panels.
  `;

  const finalPrompt = `${prompt}\n${technicalPrompt}`;

  const aspectRatioConfig = options.layout === '5x2' ? "16:9" : "9:16";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [...parts, { text: finalPrompt }] },
      config: {
        imageConfig: {
          aspectRatio: aspectRatioConfig,
          imageSize: "1K",
        },
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) throw new Error("No candidates returned");

    const content = candidates[0].content;
    if (!content || !content.parts) throw new Error("Empty content");

    for (const part of content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    throw new Error("No image data found");

  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    if (error.message && (error.message.includes("Requested entity was not found") || error.message.includes("403") || error.message.includes("API Key"))) {
        throw new Error("API_KEY_INVALID");
    }
    throw new Error(error.message || "Failed to generate image.");
  }
};

// --- Story Mode Services ---

export const enhanceStoryConcept = async (concept: string): Promise<string> => {
  const ai = getClient();
  const systemPrompt = `You are a creative writing assistant.
  Task: Expand the story concept. 
  Style: Casual, natural, detailed.
  Input: "${concept}"
  Output: A single paragraph.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: systemPrompt,
      config: {
        safetySettings: SAFETY_SETTINGS,
      }
    });
    return response.text || "";
  } catch (error: any) {
    console.error("Enhancement Error:", error);
    throw new Error("Failed to enhance story.");
  }
};

const chunkArray = <T>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
};

const cleanJson = (text: string) => {
    try {
        return JSON.parse(text);
    } catch (e) {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        if (match) {
            return JSON.parse(match[1]);
        }
        throw new Error("Failed to parse JSON response: " + text.substring(0, 50) + "...");
    }
};

interface OutlineScene {
    title: string;
    synopsis: string;
    index: number;
    characterOverride?: string;
}

const generateOutline = async (settings: StorySettings): Promise<{ title: string, scenes: OutlineScene[] }> => {
    const ai = getClient();
    const charSummary = settings.characters.map(c => `${c.name} (${c.role})`).join(', ');

    let allScenes: OutlineScene[] = [];
    let storyTitle = "Untitled Story";
    
    // Chunk outline generation to prevent output token limits on large scene counts (e.g., 150 scenes)
    const BATCH_SIZE = 20;
    const totalBatches = Math.ceil(settings.totalScenes / BATCH_SIZE);

    for (let i = 0; i < totalBatches; i++) {
        const startIdx = i * BATCH_SIZE; 
        const endIdx = Math.min((i + 1) * BATCH_SIZE, settings.totalScenes);
        const currentBatchCount = endIdx - startIdx;
        const startSceneNum = startIdx + 1;
        const endSceneNum = endIdx;

        let structurePrompt = "";
        
        if (settings.sceneGenerationMode === 'custom' && settings.customSceneGuide) {
            structurePrompt = `
            REQUIREMENT:
            Generate a structural outline following this EXACT scene guide for Scenes ${startSceneNum} to ${endSceneNum}:
            `;
            const batchGuide = settings.customSceneGuide.slice(startIdx, endIdx);
            
            batchGuide.forEach((scene, localIdx) => {
                const globalSceneNum = startSceneNum + localIdx;
                const instruction = scene.type === 'custom' && scene.description.trim()
                    ? `MUST BE SPECIFICALLY: "${scene.description}"` 
                    : "Generate naturally based on story flow.";
                structurePrompt += `Scene ${globalSceneNum}: ${instruction}\n`;
            });
        } else {
            structurePrompt = `
            REQUIREMENT:
            Generate a structural outline for Scenes ${startSceneNum} to ${endSceneNum} (Batch ${i+1}/${totalBatches}).
            Total story length is ${settings.totalScenes} scenes.
            ${i === 0 ? "This is the beginning of the story." : "This is a continuation of the story. Maintain continuity."}
            ${i === totalBatches - 1 ? "This is the conclusion/end of the story." : ""}
            `;
        }

        const isFirstBatch = i === 0;

        const prompt = `
        ACT AS A COMIC STORY ARCHITECT.
        STORY CONCEPT: "${settings.storyPrompt}"
        CHARACTERS: ${charSummary}
        
        ${structurePrompt}
        
        OUTPUT SCHEMA (JSON):
        {
          ${isFirstBatch ? '"title": "Story Title",' : ''}
          "scenes": [
            { "index": ${startSceneNum}, "title": "Scene Title", "synopsis": "Brief summary" }
             ... up to Scene ${endSceneNum}
          ]
        }
        `;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: prompt,
                config: { responseMimeType: "application/json", safetySettings: SAFETY_SETTINGS }
            });

            const data = cleanJson(response.text || "{}");
            
            if (isFirstBatch && data.title) {
                storyTitle = data.title;
            }

            if (data.scenes && Array.isArray(data.scenes)) {
                 // Validate and fix indices
                 const normalizedScenes = data.scenes.map((s: any, idx: number) => ({
                     ...s,
                     index: startSceneNum + idx
                 }));
                 allScenes = [...allScenes, ...normalizedScenes];
            }
        } catch (error) {
            console.error(`Error generating outline batch ${i}`, error);
            // Fallback for failed batch will be handled by filling missing scenes below
        }
    }

    // Fallback: Fill missing scenes if generation failed
    if (allScenes.length < settings.totalScenes) {
        const missing = settings.totalScenes - allScenes.length;
        const startFill = allScenes.length + 1;
        for (let k = 0; k < missing; k++) {
             allScenes.push({
                index: startFill + k,
                title: `Scene ${startFill + k}`,
                synopsis: "Scene content auto-filled due to generation interruption."
            });
        }
    }

    // Stitch back per-scene overrides for custom mode
    if (settings.sceneGenerationMode === 'custom' && settings.customSceneGuide) {
        allScenes = allScenes.map((s, idx) => ({
            ...s,
            characterOverride: settings.customSceneGuide![idx]?.characterOverride
        }));
    }

    return { title: storyTitle, scenes: allScenes };
};

const generateSceneBatch = async (
    outlineScenes: OutlineScene[], 
    settings: StorySettings,
    storyTitle: string
): Promise<StoryScene[]> => {
    const ai = getClient();
    const isBW = settings.colorMode === 'bw';

    const characterRules = settings.characters.map(c => {
        const hairPart = c.hairColor ? `${c.hairColor}-haired ` : '';
        const visualPart = c.hardDescription ? `${c.hardDescription} ` : '';
        const fullName = `${hairPart}${visualPart}${c.name}`.replace(/\s+/g, ' ').trim();
        return { originalName: c.name, enforcedName: fullName, bio: c.description };
    });

    const namingInstructions = characterRules.map(r => 
        `- ${r.originalName}: MUST refer to as "${r.enforcedName}"`
    ).join('\n');

    let dialogueRules = "";
    if (settings.dialogueLevel === 'High') {
        dialogueRules = `EXTREME DIALOGUE DENSITY (High). 10 out of 10 panels MUST have dialogue. 4-5 short sentences per bubble.`;
    } else if (settings.dialogueLevel === 'Medium') {
        dialogueRules = `VERY HIGH DIALOGUE DENSITY (Medium). 7-9 out of 10 panels MUST have dialogue. 1-3 short sentences.`;
    } else {
        dialogueRules = "MODERATE DIALOGUE DENSITY. 5-7 panels with dialogue.";
    }
    dialogueRules += " STYLE: Dialogue MUST be casual, natural, and less robotic. Use robust, easy-to-read English. Use contractions often.";

    let visualSpecificityRules = "";
    if (isBW) {
        visualSpecificityRules = `
         a) CLOTHING: In EVERY panel description, specify exactly what each clothing piece looks like. DO NOT include any colors in the description.
         b) SETTING: In EVERY panel description, provide more details on the location/background. DO NOT include any colors.
        `;
    } else {
        visualSpecificityRules = `
         a) CLOTHING: In EVERY panel description, specify exactly what each clothing piece looks like. Be specific in every scene.
         b) SETTING: In EVERY panel description, provide more details on the location/background.
        `;
    }

    const sharedInstructions = "this image should be strict to the style of the reference image. The chapter number or page number should not be in the picture. The panels should be separated by a thin black line and there should be no white space between panels.";

    const templatePrefix = isBW 
        ? `Make a comic in the same art style as the given reference images (the character designs should be strictly based on the reference images, especially the face, while the clothes should not need to be based on the reference images while the body type should be the same as the reference images except for the possibility of a pregnant belly) and make your image only black and white (this comic should be only black and white), with exactly 10 panels in a 5x2 grid. Make sure the only colors in this comic are black and white. There should be no color in this. It should strictly have 10 panels exactly (nothing more, nothing less) and it should be exactly 5 blocks long and exactly 2 blocks tall. The blocks should be next to each other and be 5 blocks on one row and then a second row right bellow it of 5 blocks again to make it 5 blocks long and 2 blocks tall. The topic should be different though than the png/image, but just the art style should be the same. ${sharedInstructions}`
        : `Make a comic in the same art style as the given reference images (the character designs should be strictly based on the reference images, especially the face, while the clothes should not need to be based on the reference images while the body type should be the same as the reference images except for the possibility of a pregnant belly), but colored, with exactly 10 panels in a 5x2 grid. It should strictly have 10 panels exactly (nothing more, nothing less) and it should be exactly 5 blocks long and exactly 2 blocks tall. The blocks should be next to each other and be 5 blocks on one row and then a second row right bellow it of 5 blocks again to make it 5 blocks long and 2 blocks tall. The topic should be different though than the png/image, but just the art style should be the same. ${sharedInstructions}`;

    const sceneDescriptions = outlineScenes.map(os => {
        let overridePrompt = "";
        if (os.characterOverride && os.characterOverride.trim() !== "") {
            const firstMain = settings.characters.find(c => c.role === 'Main');
            if (firstMain) {
                const hairPart = firstMain.hairColor ? `${firstMain.hairColor}-haired ` : '';
                const forcedName = `${hairPart}${os.characterOverride} ${firstMain.name}`.replace(/\s+/g, ' ').trim();
                overridePrompt = `\n[STRICT VISUAL RULE FOR THIS SCENE ONLY]: For ${firstMain.name}, you MUST use the physical description: "${forcedName}". This replaces the default hard description for this scene.`;
            }
        }
        return `Scene ${os.index}: ${os.title}. Synopsis: ${os.synopsis}.${overridePrompt}`;
    }).join('\n\n');

    const batchPrompt = `
    ACT AS A STRICT COMIC SCRIPTWRITING ENGINE.
    STORY TITLE: ${storyTitle}
    
    TASK: Generate full scripts for the following ${outlineScenes.length} scenes:
    ${sceneDescriptions}
    
    RULES:
    1. EACH scene must have EXACTLY ${settings.imagesPerScene} "pages" (prompt strings).
    2. STRICTLY FOLLOW NAMING (unless overriden in scene-specific rules above):
    ${namingInstructions}
    3. DIALOGUE: ${dialogueRules}
    4. PROMPT STRUCTURE:
       Each 'page' string MUST start with: "${templatePrefix}"
       Then immediately follow with: "Scene {N}: {Title}. Setting: {Detailed Setting}. Characters: {List}."
       Then: "Panel Breakdown: P1: {Content} P2: {Content} ... P10: {Content}"
    5. VISUAL SPECIFICITY:
    ${visualSpecificityRules}
    
    OUTPUT SCHEMA (JSON):
    {
      "scenes": [
        {
          "index": number,
          "title": "Scene Title",
          "pages": [
             "Full Prompt String...",
             ...
          ]
        }
      ]
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: batchPrompt,
            config: { 
                responseMimeType: "application/json", 
                safetySettings: SAFETY_SETTINGS 
            }
        });
        const data = cleanJson(response.text || "{}");
        
        return (data.scenes || []).map((s: any) => ({
            id: crypto.randomUUID(),
            title: s.title,
            pages: (s.pages || []).map((p: string, pIdx: number) => ({
                id: crypto.randomUUID(),
                globalIndex: 0,
                sceneIndex: s.index,
                pageInSceneIndex: pIdx + 1,
                prompt: p
            }))
        }));

    } catch (e: any) {
        console.error("Batch generation failed:", e);
        throw e;
    }
};

export const generateStoryScript = async (settings: StorySettings): Promise<StoryBlueprint> => {
  try {
    const outline = await generateOutline(settings);
    // Increase batch size to 5 for efficiency with large scene counts
    const batchSize = 5; 
    const sceneChunks = chunkArray(outline.scenes, batchSize);
    
    let allScenes: StoryScene[] = [];
    for (const chunk of sceneChunks) {
        const chunkScenes = await generateSceneBatch(chunk, settings, outline.title);
        allScenes = [...allScenes, ...chunkScenes];
    }
    
    let globalCounter = 1;
    allScenes.sort((a, b) => {
        const indexA = parseInt(a.pages[0]?.prompt?.match(/Scene (\d+):/)?.[1] || "0") || 0;
        const indexB = parseInt(b.pages[0]?.prompt?.match(/Scene (\d+):/)?.[1] || "0") || 0;
        return indexA - indexB;
    });

    if (settings.sceneGenerationMode === 'custom' && settings.customSceneGuide) {
        allScenes.forEach((scene, idx) => {
            if (settings.customSceneGuide && settings.customSceneGuide[idx]) {
                scene.referenceImage = settings.customSceneGuide[idx].referenceImage;
            }
        });
    }

    allScenes.forEach((scene, sIdx) => {
        scene.pages.forEach((page, pIdx) => {
            page.globalIndex = globalCounter++;
            page.sceneIndex = sIdx + 1;
            page.pageInSceneIndex = pIdx + 1;
        });
    });

    return {
        title: outline.title,
        scenes: allScenes
    };
  } catch (error: any) {
    console.error("Story Script Generation Error:", error);
    throw new Error("Failed to generate story script: " + error.message);
  }
};

export const generateAdditionalScenes = async (
    settings: StorySettings,
    newSceneDescription: string,
    count: number,
    currentBlueprint: StoryBlueprint,
    insertionIndex: number
): Promise<StoryScene[]> => {
    const ai = getClient();
    const charSummary = settings.characters.map(c => `${c.name} (${c.role})`).join(', ');

    const outlinePrompt = `
    ACT AS A COMIC STORY ARCHITECT. ADDING SCENES TO EXISTING STORY.
    EXISTING STORY TITLE: "${currentBlueprint.title}"
    CHARACTERS: ${charSummary}
    TASK: Create ${count} NEW scenes.
    CONTENT OF NEW SCENES: "${newSceneDescription}"
    OUTPUT SCHEMA (JSON):
    {
      "scenes": [
        { "index": 1, "title": "New Scene Title", "synopsis": "Detailed summary..." }
      ]
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: outlinePrompt,
            config: { 
                responseMimeType: "application/json", 
                safetySettings: SAFETY_SETTINGS 
            }
        });
        const data = cleanJson(response.text || "{}");
        return await generateSceneBatch(data.scenes || [], settings, currentBlueprint.title);
    } catch (error: any) {
        throw new Error("Failed to generate additional scenes: " + error.message);
    }
};

export const refineStoryPrompts = async (
  currentBlueprint: StoryBlueprint,
  instruction: string,
  scope: 'story' | 'scene' | 'page',
  targetId?: string
): Promise<StoryBlueprint> => {
  const ai = getClient();
  const systemPrompt = `
  You are a JSON editor helper.
  Task: Modify the Comic Script JSON based on: "${instruction}".
  Scope: ${scope} ${targetId ? `(Target ID: ${targetId})` : ''}
  RULES:
  1. Only edit 'prompt' strings.
  2. Maintain JSON structure and existing format.
  3. Ensure constraints about reference style and panel lines remain in the prompts.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: systemPrompt + "\n\nINPUT JSON:\n" + JSON.stringify(currentBlueprint),
      config: {
        responseMimeType: "application/json",
        safetySettings: SAFETY_SETTINGS,
      }
    });
    return JSON.parse(response.text || "{}") as StoryBlueprint;
  } catch (error: any) {
    throw new Error("Failed to refine script: " + error.message);
  }
};
