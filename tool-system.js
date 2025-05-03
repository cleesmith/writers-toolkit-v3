// tool-system.js
const fs = require('fs');
const path = require('path');

// Basic logging setup that works even if logToFile isn't defined in this context
function safeLog(message) {
  // Log to console first (works in development)
  console.log(message);
  
  // Try to log to file if the function exists in global scope (from main.js)
  if (typeof global.logToFile === 'function') {
    global.logToFile(`[tool-system.js] ${message}`);
  } else {
    // Fallback file logging if needed
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const logPath = path.join(os.homedir(), 'writers-toolkit-debug.log');
      const timestamp = new Date().toISOString();
      const logLine = `${timestamp}: [tool-system.js] ${message}\n`;
      fs.appendFileSync(logPath, logLine);
    } catch (e) {
      // Can't do anything if this fails
    }
  }
}

// Log module loading
safeLog('Module loading started');

// Log require attempts
try {
  safeLog('Loading base modules...');
  const { app } = require('electron');
  safeLog('Base modules loaded successfully');
} catch (error) {
  safeLog(`ERROR loading base modules: ${error.message}`);
}

const ClaudeAPIService = require('./client');

const toolRegistry = require('./registry');

function loadToolClass(toolName) {
  const hyphenatedName = toolName.replace(/_/g, '-');
  
  // Get the directory where tool-system.js is located
  const baseDir = __dirname;
  console.log(`Base directory for tool loading: ${baseDir}`);
  
  // Safe logging that works in any context
  function log(message) {
    console.log(message);
    if (typeof global.logToFile === 'function') {
      global.logToFile(`[tool-system] ${message}`);
    }
  }
  
  log(`Loading tool: ${toolName} (${hyphenatedName}.js)`);
  log(`Base directory for tool loading: ${baseDir}`);
  
  try {
    // Use path.resolve to get absolute path to the module
    const modulePath = path.resolve(baseDir, `${hyphenatedName}.js`);
    log(`Resolved tool ${toolName} to: ${modulePath}`);
    
    // Check if file exists
    if (fs.existsSync(modulePath)) {
      log(`File exists at: ${modulePath}`);
      const module = require(modulePath);
      log(`Successfully loaded module: ${hyphenatedName}.js`);
      return module;
    } else {
      log(`ERROR: Tool file not found at: ${modulePath}`);
      
      // Try an alternative location as a last resort
      const altPath = path.resolve(baseDir, '..', `${hyphenatedName}.js`);
      log(`Trying alternative path: ${altPath}`);
      
      if (fs.existsSync(altPath)) {
        log(`File exists at alternative path: ${altPath}`);
        const module = require(altPath);
        log(`Successfully loaded module from alternative path: ${hyphenatedName}.js`);
        return module;
      }
      
      throw new Error(`Tool file not found: ${hyphenatedName}.js`);
    }
  } catch (error) {
    log(`ERROR loading tool ${toolName}: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
    throw error;
  }
}

// AI based tools:
const TokensWordsCounter = loadToolClass('tokens-words-counter');
const ManuscriptToOutlineCharactersWorld = loadToolClass('manuscript-to-outline-characters-world');
const NarrativeIntegrity = loadToolClass('narrative-integrity');
const LineEditing = loadToolClass('line-editing');
const DrunkClaude = loadToolClass('drunk-claude');
const BrainstormTool = loadToolClass('brainstorm');
const OutlineWriter = loadToolClass('outline-writer');
const WorldWriter = loadToolClass('world-writer');
const ChapterWriter = loadToolClass('chapter-writer');
const CharacterAnalyzer = loadToolClass('character-analyzer');
const TenseConsistencyChecker = loadToolClass('tense-consistency-checker');
const AdjectiveAdverbOptimizer = loadToolClass('adjective-adverb-optimizer');
const DanglingModifierChecker = loadToolClass('dangling-modifier-checker');
const RhythmAnalyzer = loadToolClass('rhythm-analyzer');
const CrowdingLeapingEvaluator = loadToolClass('crowding-leaping-evaluator');
const PunctuationAuditor = loadToolClass('punctuation-auditor');
const ConflictAnalyzer = loadToolClass('conflict-analyzer');
const ForeshadowingTracker = loadToolClass('foreshadowing-tracker');
const PlotThreadTracker = loadToolClass('plot-thread-tracker');
const KdpPublishingPrep = loadToolClass('kdp-publishing-prep');

// non-AI tools:
const DocxComments = loadToolClass('docx-comments');
const EpubConverter = loadToolClass('epub-converter');

const TOOL_DEFS = [
  { id: 'tokens_words_counter', title: `Tokens & Words Counter`, Class: TokensWordsCounter, options: [
    {
      "name": "input_file",
      "label": "Input File",
      "type": "file",
      "description": "The text file to analyze",
      "required": true,
      "default": "manuscript.txt",
      "filters": [
        {
          "name": "Text Files",
          "extensions": [
            "txt"
          ]
        }
      ]
    }
  ]},
  { id: 'manuscript_to_outline_characters_world', title: `Use manuscript.txt  to create: outline, characters, and world files`, Class: ManuscriptToOutlineCharactersWorld, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript/narrative to use",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    }
  ]},
  { id: 'line_editing', title: `Line Editing`, Class: LineEditing, options: [
    {
      "name": "manuscript_file",
      "label": "Manuscript File",
      "type": "file",
      "description": "Fiction manuscript file to analyze",
      "required": true,
      "default": "manuscript.txt",
      "filters": [
        {
          "name": "Text Files",
          "extensions": [
            "txt"
          ]
        }
      ],
      "group": "Input Files"
    },
    {
      "name": "chapter_number",
      "label": "Chapter Number",
      "type": "text",
      "description": "The chapter number to analyze (e.g. '1', '5', '20')",
      "required": true,
      "default": "1",
      "group": "Analysis Options"
    }
  ]},
  { id: 'narrative_integrity', title: `Narrative Integrity`, Class: NarrativeIntegrity, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript/narrative to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "world_file",
      "label": "world_file",
      "type": "file",
      "description": "File containing the world details (required)",
      "required": true,
      "default": "world.txt",
      "group": "Input Files"
    },
    {
      "name": "outline_file",
      "label": "outline_file",
      "type": "file",
      "description": "File containing the story outline (optional)",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "check_type",
      "label": "Check Type",
      "type": "select",
      "description": "Select type of integrity check to perform",
      "required": false,
      "default": "all",
      "group": "Analysis Options",
      "choices": [
        { "value": "world", "label": "World Integrity" },
        { "value": "internal", "label": "Internal Integrity" },
        { "value": "development", "label": "Development Integrity" },
        { "value": "unresolved", "label": "Unresolved Elements" },
        { "value": "all", "label": "All Checks" }
      ]
    },
    {
      "name": "check_description",
      "label": "check_description",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    }
  ]},
  { id: 'drunk_claude', title: `Drunk Claude`, Class: DrunkClaude, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    }
  ]},
  { id: 'brainstorm', title: `Brainstorm`, Class: BrainstormTool, options: [
    {
      "name": "ideas_file",
      "label": "IDEAS_FILE",
      "type": "file",
      "description": "Path to ideas.txt file containing the concept and/or characters",
      "required": true,
      "default": "ideas.txt",
      "group": "Input Files"
    },
    {
      "name": "continue",
      "label": "CONTINUE",
      "type": "boolean",
      "description": "Continue building on existing ideas in the ideas file",
      "required": false,
      "default": false,
      "group": "Operation Mode"
    },
    {
      "name": "lang",
      "label": "LANG",
      "type": "text",
      "description": "Language for writing (default: English)",
      "required": false,
      "default": "English",
      "group": "Content Configuration"
    },
    {
      "name": "title",
      "label": "TITLE",
      "type": "text",
      "description": "Suggested title for the writing (optional)",
      "required": false,
      "default": null,
      "group": "Content Configuration"
    },
    {
      "name": "genre",
      "label": "GENRE",
      "type": "text",
      "description": "Suggested genre for the writing (optional)",
      "required": false,
      "default": null,
      "group": "Content Configuration"
    },
    {
      "name": "num_characters",
      "label": "NUM_CHARACTERS",
      "type": "number",
      "description": "Number of main characters to generate (default: 5)",
      "required": false,
      "default": 5,
      "group": "Content Configuration"
    },
    {
      "name": "worldbuilding_depth",
      "label": "WORLDBUILDING_DEPTH",
      "type": "number",
      "description": "Depth of worldbuilding detail (1-5, where 5 is most detailed) (default: 3)",
      "required": false,
      "default": 3,
      "group": "Content Configuration"
    },
    {
      "name": "character_relationships",
      "label": "CHARACTER_RELATIONSHIPS",
      "type": "boolean",
      "description": "Include detailed character relationships",
      "required": false,
      "default": false,
      "group": "Content Configuration"
    },
    {
      "name": "concept_only",
      "label": "CONCEPT_ONLY",
      "type": "boolean",
      "description": "Generate only the concept file",
      "required": false,
      "default": false,
      "group": "Operation Mode"
    },
    {
      "name": "characters_only",
      "label": "CHARACTERS_ONLY",
      "type": "boolean",
      "description": "Generate only the characters file",
      "required": false,
      "default": false,
      "group": "Operation Mode"
    },
    {
      "name": "allow_new_characters",
      "label": "ALLOW_NEW_CHARACTERS",
      "type": "boolean",
      "description": "Allow creation of new characters not in the ideas file",
      "required": false,
      "default": false,
      "group": "Content Configuration"
    }
  ]},
  { id: 'outline_writer', title: `Outline Writer`, Class: OutlineWriter, options: [
    {
      "name": "premise_file",
      "label": "PREMISE_FILE",
      "type": "file",
      "description": "File containing the story premise (required)",
      "required": true,
      "default": "ideas.txt",
      "group": "Input Files"
    },
    {
      "name": "example_outline",
      "label": "EXAMPLE_OUTLINE",
      "type": "text",
      "description": "Example outline for reference",
      "required": false,
      "default": null,
      "group": "Input Files"
    },
    {
      "name": "concept_file",
      "label": "CONCEPT_FILE",
      "type": "file",
      "description": "File containing detailed concept information (optional)",
      "required": false,
      "default": null,
      "group": "Input Files"
    },
    {
      "name": "characters_file",
      "label": "CHARACTERS_FILE",
      "type": "file",
      "description": "File containing character descriptions (optional)",
      "required": false,
      "default": null,
      "group": "Input Files"
    },
    {
      "name": "sections",
      "label": "SECTIONS",
      "type": "number",
      "description": "Number of main parts/sections in the outline (default: 5)",
      "required": false,
      "default": 5,
      "group": "Output Configuration"
    },
    {
      "name": "chapters",
      "label": "CHAPTERS",
      "type": "number",
      "description": "Number of chapters in the outline (default: 25)",
      "required": false,
      "default": 25,
      "group": "Output Configuration"
    },
    {
      "name": "lang",
      "label": "LANG",
      "type": "text",
      "description": "Language for writing (default: English)",
      "required": false,
      "default": "English",
      "group": "Output Configuration"
    },
    {
      "name": "title",
      "label": "TITLE",
      "type": "text",
      "description": "Suggested title for the novel (optional)",
      "required": false,
      "default": null,
      "group": "Output Configuration"
    },
    {
      "name": "genre",
      "label": "GENRE",
      "type": "text",
      "description": "Suggested genre for the novel (optional)",
      "required": false,
      "default": null,
      "group": "Output Configuration"
    },
    {
      "name": "detailed",
      "label": "DETAILED",
      "type": "boolean",
      "description": "Generate a more detailed outline with chapter summaries",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    }
  ]},
  { id: 'world_writer', title: `World Writer`, Class: WorldWriter, options: [
    {
      "name": "lang",
      "label": "LANG",
      "type": "text",
      "description": "Language for writing (default: English)",
      "required": false,
      "default": "English",
      "group": "Content Configuration"
    },
    {
      "name": "title",
      "label": "TITLE",
      "type": "text",
      "description": "Title of story",
      "required": true,
      "default": "",
      "group": "Content Configuration"
    },
    {
      "name": "pov",
      "label": "POV",
      "type": "text",
      "description": "Point of view",
      "required": true,
      "default": "third person perspective",
      "group": "Content Configuration"
    },
    {
      "name": "characters_file",
      "label": "CHARACTERS_FILE",
      "type": "file",
      "description": "Characters",
      "required": true,
      "default": "characters.txt",
      "group": "Input Files"
    },
    {
      "name": "outline_file",
      "label": "OUTLINE_FILE",
      "type": "file",
      "description": "Path to the outline file generated by outline_writer.py",
      "required": true,
      "default": null,
      "group": "Input Files"
    },
    {
      "name": "detailed",
      "label": "DETAILED",
      "type": "boolean",
      "description": "Generate more detailed character and world profiles",
      "required": false,
      "default": false,
      "group": "Content Configuration"
    }
  ]},
  { id: 'chapter_writer', title: `Chapter Writer`, Class: ChapterWriter, options: [
    {
      "name": "chapters_to_write",
      "label": "chapters_to_write",
      "type": "file",
      "description": "Path to a file containing a list of chapters to write sequentially, and the format is \"9. Chapter Title\" per line. \nIt may contain one or more chapters. \nIt must match the chapter format in the outline.",
      "required": false,
      "default": "chapters.txt",
      "group": "Input Files"
    },
    {
      "name": "manuscript",
      "label": "manuscript",
      "type": "file",
      "description": "Path to manuscript file",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "outline",
      "label": "outline",
      "type": "file",
      "description": "Path to outline file",
      "required": true,
      "default": "outline.txt",
      "group": "Input Files"
    },
    {
      "name": "world",
      "label": "world",
      "type": "file",
      "description": "Path to world file",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "lang",
      "label": "lang",
      "type": "text",
      "description": "Language for writing",
      "required": false,
      "default": "English",
      "group": "Input Files"
    },
    {
      "name": "chapter_delay",
      "label": "chapter_delay",
      "type": "number",
      "description": "Delay in seconds between processing multiple chapters (default: 15 seconds)",
      "required": false,
      "default": 15,
      "group": "Input Files"
    },
    {
      "name": "no_dialogue_emphasis",
      "label": "no_dialogue_emphasis",
      "type": "boolean",
      "description": "Turn off the additional dialogue emphasis (dialogue emphasis is ON by default)",
      "required": false,
      "default": true,
      "group": "Input Files"
    },
    {
      "name": "no_append",
      "label": "no_append",
      "type": "boolean",
      "description": "Disable auto-appending new chapters to manuscript file",
      "required": false,
      "default": false,
      "group": "Input Files"
    },
    {
      "name": "backup",
      "label": "backup",
      "type": "boolean",
      "description": "Create backup of manuscript file before appending (default: False)",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "show_token_stats",
      "label": "show_token_stats",
      "type": "boolean",
      "description": "Show tokens stats but do not call API\nYou just want to double check the settings/numbers.",
      "required": false,
      "default": false,
      "group": "Claude API Configuration"
    },
    {
      "name": "request",
      "label": "request",
      "type": "text",
      "description": "Single chapter format: \"Chapter 9: Title\"   or  \"9: Title\"   or  \"9. Title\"",
      "required": false,
      "default": null,
      "group": "Input Files"
    }
  ]},
  { id: 'character_analyzer', title: `Character Analyzer`, Class: CharacterAnalyzer, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze (required)",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "outline_file",
      "label": "OUTLINE_FILE",
      "type": "file",
      "description": "File containing the story outline (optional)",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "world_file",
      "label": "WORLD_FILE",
      "type": "file",
      "description": "File containing the story world/lore information (optional)",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process (smaller output files)",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    }
  ]},
  { id: 'tense_consistency_checker', title: `Tense Consistency Checker`, Class: TenseConsistencyChecker, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze (required)",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of tense analysis detail:\nbasic, standard, detailed",
      "required": false,
      "default": "detailed",
      "group": "Analysis Options"
    },
    {
      "name": "chapter_markers",
      "label": "CHAPTER_MARKERS",
      "type": "text",
      "description": "Text that marks the start of chapters (default: 'Chapter')",
      "required": false,
      "default": "Chapter",
      "group": "Analysis Options"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process (smaller output files)",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    }
  ]},
  { id: 'adjective_adverb_optimizer', title: `Adjective Adverb Optimizer`, Class: AdjectiveAdverbOptimizer, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    },
    {
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of analysis detail (default: standard)\nChoices: basic, standard, detailed",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "focus_areas",
      "label": "focus_areas",
      "type": "text",
      "description": "Specific areas to focus analysis on (default: all areas)\nChoices: qualifiers, adverbs, adjectives, imagery",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    }
  ]},
  { id: 'dangling_modifier_checker', title: `Dangling Modifier Checker`, Class: DanglingModifierChecker, options: [
    {
      "name": "manuscript_file",
      "label": "Select Manuscript file",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "analysis_level",
      "label": "Select Analysis Level",
      "type": "select",
      "description": "Level of analysis detail (default: all)",
      "required": true,
      "default": "all",
      "group": "Analysis Options",
      "choices": [
        {
          "value": "basic",
          "label": "basic"
        },
        {
          "value": "standard",
          "label": "standard"
        },
        {
          "value": "detailed",
          "label": "detailed"
        },
        {
          "value": "all",
          "label": "all"
        }
      ]
    },
    {
      "name": "modifier_types",
      "label": "Select Modifier Types",
      "type": "select",
      "description": "Specific modifier types to focus on (default: all types)",
      "required": true,
      "default": "all",
      "group": "Analysis Options",
      "choices": [
        {
          "value": "dangling",
          "label": "dangling"
        },
        {
          "value": "misplaced",
          "label": "misplaced"
        },
        {
          "value": "squinting",
          "label": "squinting"
        },
        {
          "value": "limiting",
          "label": "limiting"
        },
        {
          "value": "all",
          "label": "all"
        }
      ]
    },
    {
      "name": "sensitivity",
      "label": "Select Sensitivity Level",
      "type": "select",
      "description": "Sensitivity level for modifier detection (default: medium)",
      "required": true,
      "default": "medium",
      "group": "Analysis Options",
      "choices": [
        {
          "value": "low",
          "label": "low"
        },
        {
          "value": "medium",
          "label": "medium"
        },
        {
          "value": "high",
          "label": "high"
        }
      ]
    },
    {
      "name": "skip_thinking",
      "label": "Don't save a thinking file",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    }
  ]},
  { id: 'rhythm_analyzer', title: `Rhythm Analyzer`, Class: RhythmAnalyzer, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    },
    {
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of analysis detail (default: standard)\nChoices: basic, standard, detailed",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "scene_types",
      "label": "scene_types",
      "type": "text",
      "description": "Specific scene types to focus analysis on (default: all types)\nChoices: action, dialogue, description, exposition",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "rhythm_sensitivity",
      "label": "rhythm_sensitivity",
      "type": "text",
      "description": "Sensitivity level for rhythm analysis (default: medium)\nChoices: low, medium, high",
      "required": false,
      "default": "medium",
      "group": "Analysis Options"
    }
  ]},
  { id: 'crowding_leaping_evaluator', title: `Crowding Leaping Evaluator`, Class: CrowdingLeapingEvaluator, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "include_visualization",
      "label": "include_visualization",
      "type": "boolean",
      "description": "Include a text-based visualization of pacing patterns",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    },
    {
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of analysis detail (default: standard)\nChoices: basic, standard, detailed",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "focus_areas",
      "label": "focus_areas",
      "type": "text",
      "description": "Specific areas to focus on (default: all areas)\nChoices: crowding, leaping, transitions, pacing",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "sensitivity",
      "label": "sensitivity",
      "type": "text",
      "description": "Sensitivity level for pattern detection (default: medium)\nChoices: low, medium, high",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    }
  ]},
  { id: 'punctuation_auditor', title: `Punctuation Auditor`, Class: PunctuationAuditor, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    },
    {
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of analysis detail (default: standard)\nChoices: basic, standard, detailed",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "elements",
      "label": "elements",
      "type": "text",
      "description": "Specific punctuation elements to focus on (default: all elements)\nChoices: commas, periods, semicolons, dashes, parentheses, colons, run-ons",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "strictness",
      "label": "strictness",
      "type": "text",
      "description": "Strictness level for punctuation analysis (default: medium)\nChoices: low, medium, high",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    }
  ]},
  { id: 'conflict_analyzer', title: `Conflict Analyzer`, Class: ConflictAnalyzer, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "outline_file",
      "label": "outline_file",
      "type": "file",
      "description": "File containing the story outline (optional)",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of conflict analysis to perform (default: all)\nChoices: scene, chapter, arc, all",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    },
    {
      "name": "conflict_types",
      "label": "conflict_types",
      "type": "text",
      "description": "Specific conflict types to analyze (default: all main types)\nChoices: internal, interpersonal, environmental, societal, cosmic",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    }
  ]},
  { id: 'foreshadowing_tracker', title: `Foreshadowing Tracker`, Class: ForeshadowingTracker, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "outline_file",
      "label": "outline_file",
      "type": "file",
      "description": "File containing the story outline (optional)",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "chronological",
      "label": "chronological",
      "type": "boolean",
      "description": "Sort foreshadowing elements chronologically rather than by type",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "foreshadowing_type",
      "label": "foreshadowing_type",
      "type": "text",
      "description": "Type of foreshadowing to analyze (default: all)\nChoices: explicit, implicit, chekhov, all",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    }
  ]},
  { id: 'plot_thread_tracker', title: `Plot Thread Tracker`, Class: PlotThreadTracker, options: [
    {
      "name": "manuscript_file",
      "label": "MANUSCRIPT_FILE",
      "type": "file",
      "description": "File containing the manuscript to analyze",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "outline_file",
      "label": "outline_file",
      "type": "file",
      "description": "File containing the story outline (optional)",
      "required": false,
      "default": "",
      "group": "Input Files"
    },
    {
      "name": "skip_thinking",
      "label": "skip_thinking",
      "type": "boolean",
      "description": "Skip saving the AI thinking process",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "ascii_art",
      "label": "ascii_art",
      "type": "boolean",
      "description": "Include simple ASCII art visualization in the output",
      "required": false,
      "default": false,
      "group": "Output Configuration"
    },
    {
      "name": "analysis_depth",
      "label": "analysis_depth",
      "type": "text",
      "description": "Depth of plot thread analysis to perform (default: comprehensive)",
      "required": false,
      "default": "comprehensive",
      "group": "Analysis Options"
    },
    {
      "name": "analysis_description",
      "label": "ANALYSIS_DESCRIPTION",
      "type": "text",
      "description": "Optional description to include in output filenames",
      "required": false,
      "default": "",
      "group": "Output Configuration"
    },
    {
      "name": "thread_focus",
      "label": "thread_focus",
      "type": "text",
      "description": "Optional list of specific plot threads to focus on (e.g., 'romance' 'mystery'). \nAlternative default: [\"romance\", \"mystery\"]",
      "required": false,
      "default": null,
      "group": "Output Configuration"
    }
  ]},
  { id: 'kdp_publishing_prep', title: `KDP Publishing Prep - Generate Amazon KDP Elements`, Class: KdpPublishingPrep, options: [
    {
      "name": "manuscript_file",
      "label": "Manuscript File",
      "type": "file",
      "description": "Your completed manuscript text file (.txt)",
      "required": true,
      "default": "manuscript.txt",
      "group": "Input Files"
    },
    {
      "name": "book_type",
      "label": "Book Type",
      "type": "select",
      "description": "Select the type of book",
      "required": true,
      "default": "fiction",
      "choices": [
        {
          "value": "fiction",
          "label": "Fiction"
        },
        {
          "value": "nonfiction",
          "label": "Non-Fiction"
        }
      ],
      "group": "Book Information"
    },
    {
      "name": "existing_title",
      "label": "Existing Title (Optional)",
      "type": "text",
      "description": "If you already have a title, enter it here for evaluation",
      "required": false,
      "group": "Book Information"
    },
    {
      "name": "title_ideas",
      "label": "Title Ideas/Concepts (Optional)",
      "type": "text",
      "description": "Any title themes or concepts you want incorporated",
      "required": false,
      "group": "Book Information"
    },
    {
      "name": "target_audience",
      "label": "Target Audience (Optional)",
      "type": "text",
      "description": "Describe your intended audience (age group, interests, etc.)",
      "required": false,
      "group": "Book Information"
    },
    {
      "name": "include_html",
      "label": "Include HTML Description",
      "type": "boolean",
      "description": "Generate an HTML-formatted description for KDP",
      "default": true,
      "group": "Output Options"
    }
  ]},
  { id: 'docx_comments', title: `DOCX Text/Comments Extractor`, Class: DocxComments, options: [
    {
      "name": "docx_file",
      "label": "DOCX File",
      "type": "file",
      "description": "Word document file containing comments to extract and match to text",
      "required": true,
      "default": "",
      "filters": [
        {
          "name": "DOCX Files",
          "extensions": [
            "docx"
          ]
        }
      ],
      "group": "Input Files"
    }
  ]},
  { 
    id: 'epub_converter', 
    title: `EPUB to TXT Converter`, 
    Class: EpubConverter, 
    options: [
      {
        "name": "epub_file",
        "label": "EPUB File",
        "type": "file",
        "description": "EPUB file to convert to plain text",
        "required": true,
        "filters": [
          {
            "name": "EPUB Files",
            "extensions": ["epub"]
          }
        ]
      }
    ]
  }

];

module.exports = TOOL_DEFS;


function getAbsoluteToolPath(toolName) {
  // Convert name variations (with underscore or hyphen)
  const hyphenatedName = toolName.replace(/_/g, '-');
  
  // Build possible paths at root level
  const possiblePaths = [
    `./${toolName}.js`,
    `./${hyphenatedName}.js`
  ];
  
  // Log paths for debugging
  console.log(`Possible paths for tool ${toolName}:`);
  possiblePaths.forEach(p => console.log(` - ${p}`));
  
  // Return all possible paths to try
  return possiblePaths;
}

function getToolPath(toolName) {
  try {
    // Get the app path
    const appPath = app.getAppPath();
    console.log(`App path: ${appPath}`);
    
    // Check if running from asar archive
    if (appPath.includes('.asar')) {
      // For unpacked files, we need to use .asar.unpacked path
      const unpackedPath = appPath.replace('.asar', '.asar.unpacked');
      const toolUnpackedPath = path.join(unpackedPath, 'src', 'tools', `${toolName}.js`);
      
      const fs = require('fs');
      if (fs.existsSync(toolUnpackedPath)) {
        console.log(`Found tool at: ${toolUnpackedPath}`);
        return toolUnpackedPath;
      }
      
      // Try with hyphens instead of underscores (tokens-words-counter vs tokens_words_counter)
      const hyphenatedName = toolName.replace(/_/g, '-');
      const hyphenatedPath = path.join(unpackedPath, 'src', 'tools', `${hyphenatedName}.js`);
      
      if (fs.existsSync(hyphenatedPath)) {
        console.log(`Found tool with hyphenated name at: ${hyphenatedPath}`);
        return hyphenatedPath;
      }
      
      console.warn(`Tool not found at unpacked path: ${toolUnpackedPath}`);
    }
    
    // Development fallback
    return `./tools/${toolName}`;
  } catch (error) {
    console.error(`Error resolving path for tool ${toolName}:`, error);
    return `./tools/${toolName}`;
  }
}

async function initializeToolSystem(settings) {
  console.log('Initializing tool system (no external DB)…');
  
  // This part is working - your existing logging code that shows file listings
  if (typeof global.logToFile === 'function') {
    global.logToFile('[tool-system] Starting tool system initialization');
    global.logToFile(`[tool-system] Current directory: ${process.cwd()}`);
    global.logToFile(`[tool-system] __dirname: ${__dirname}`);
    
    // This is your existing code that lists files in directories
    try {
      const files = fs.readdirSync(__dirname);
      global.logToFile(`[tool-system] Files in __dirname: ${files.join(', ')}`);
      
      // Also check the parent directory
      const parentDir = path.dirname(__dirname);
      const parentFiles = fs.readdirSync(parentDir);
      global.logToFile(`[tool-system] Files in parent directory: ${parentFiles.join(', ')}`);
    } catch (error) {
      global.logToFile(`[tool-system] Error listing files: ${error.message}`);
    }
    
    // NEW CODE STARTS HERE - Add these new logs
    global.logToFile('[tool-system] About to create Claude API service');
    try {
      global.logToFile(`[tool-system] ClaudeAPIService settings: ${JSON.stringify(settings)}`);
    } catch (e) {
      global.logToFile(`[tool-system] Cannot stringify settings: ${e.message}`);
    }
  }
  
  try {
    // Create Claude API service with the provided settings
    if (typeof global.logToFile === 'function') {
      global.logToFile('[tool-system] Creating Claude API service');
    }
    
    const claudeService = new ClaudeAPIService(settings);
    
    if (typeof global.logToFile === 'function') {
      global.logToFile('[tool-system] Claude API service created successfully');
      global.logToFile('[tool-system] Beginning tool registration');
    }
    
    // Register each tool with proper configuration
    let toolCount = 0;
    TOOL_DEFS.forEach(def => {
      if (typeof global.logToFile === 'function') {
        global.logToFile(`[tool-system] Registering tool #${toolCount + 1}: ${def.id}`);
      }
      
      // Ensure required properties exist
      const toolConfig = {
        title: def.title || def.id,
        description: def.description || def.title || `Tool: ${def.id}`,
        options: def.options || [],
        ...settings
      };
      
      if (typeof global.logToFile === 'function') {
        global.logToFile(`[tool-system] Creating instance of tool: ${def.id}`);
      }
      
      // Create tool instance
      const instance = new def.Class(claudeService, toolConfig);
      
      if (typeof global.logToFile === 'function') {
        global.logToFile(`[tool-system] Adding tool to registry: ${def.id}`);
      }
      
      // Add to registry
      toolRegistry.registerTool(def.id, instance);
      
      if (typeof global.logToFile === 'function') {
        global.logToFile(`[tool-system] Successfully registered tool: ${def.id}`);
      }
      
      toolCount++;
    });
    
    if (typeof global.logToFile === 'function') {
      global.logToFile(`[tool-system] Completed registering all ${toolCount} tools`);
    }
    
    // Log registration summary
    const allTools = toolRegistry.getAllToolIds();
    console.log(`Registered ${allTools.length} built-in tools:`, allTools);
    
    if (typeof global.logToFile === 'function') {
      global.logToFile('[tool-system] Tool system initialization completed successfully');
    }
    
    return { claudeService, toolRegistry };
  } catch (error) {
    if (typeof global.logToFile === 'function') {
      global.logToFile(`[tool-system] ERROR during tool system initialization: ${error.message}`);
      global.logToFile(`[tool-system] Error stack: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Execute a tool by ID
 * @param {string} toolId - Tool ID
 * @param {Object} options - Tool options
 * @returns {Promise<Object>} - Tool execution result
 */
// async function executeToolById(toolId, options) {
//   console.log(`Executing tool: ${toolId} with options:`, options);
  
//   // Get the tool implementation
//   const tool = toolRegistry.getTool(toolId);
  
//   if (!tool) {
//     console.error(`Tool not found: ${toolId}`);
//     throw new Error(`Tool not found: ${toolId}`);
//   }
  
//   try {
//     // Execute the tool
//     console.log(`Starting execution of tool: ${toolId}`);
//     const result = await tool.execute(options);
//     console.log(`Tool execution complete: ${toolId}`);
//     return result;
//   } catch (error) {
//     console.error(`Error executing tool ${toolId}:`, error);
//     throw error;
//   }
// }
async function executeToolById(toolId, options) {
  console.log(`Executing tool: ${toolId} with options:`, options);
  
  // Get the tool implementation
  const tool = toolRegistry.getTool(toolId);
  
  if (!tool) {
    console.error(`Tool not found: ${toolId}`);
    throw new Error(`Tool not found: ${toolId}`);
  }
  
  try {
    console.log('*** Client before recreate:', !!tool.claudeService.client);
    // Recreate the Claude API client for a fresh connection
    if (tool.claudeService) {
      tool.claudeService.recreate();
    }
    console.log('*** Client after recreate:', !!tool.claudeService.client);
    
    // Execute the tool
    console.log(`Starting execution of tool: ${toolId}`);

    const result = await tool.execute(options);
    console.log(`Tool execution complete: ${toolId}`);
    
    // Close the client after successful execution
    if (tool.claudeService) {
      tool.claudeService.close();
    }
    
    return result;
  } catch (error) {
    console.error(`Error executing tool ${toolId}:`, error);
    
    // Ensure the client is closed even if execution fails
    if (tool && tool.claudeService) {
      tool.claudeService.close();
    }
    
    throw error;
  }
}

/**
 * Reinitialize the Claude API service with updated settings
 * @param {Object} settings - Claude API settings
 * @returns {Object} - New Claude API service instance
 */
// function reinitializeClaudeService(settings) {
//   // Create a new Claude service with the updated settings
//   const claudeService = new ClaudeAPIService(settings);
  
//   // Update the service in all registered tools
//   for (const toolId of toolRegistry.getAllToolIds()) {
//     const tool = toolRegistry.getTool(toolId);
//     tool.claudeService = claudeService;
//   }
  
//   return claudeService;
// }
function reinitializeClaudeService(settings) {
  // Create a new Claude service with the updated settings
  const claudeService = new ClaudeAPIService(settings);
  
  // Update the service in all registered tools
  for (const toolId of toolRegistry.getAllToolIds()) {
    const tool = toolRegistry.getTool(toolId);
    
    // Close any existing client first
    if (tool.claudeService) {
      tool.claudeService.close();
    }
    
    tool.claudeService = claudeService;
  }
  
  return claudeService;
}

/**
 * Verify that tools are properly loaded and accessible
 * @returns {boolean} - True if verification passes
 */
// function verifyToolLoading() {
//   console.log('Verifying tool classes are accessible in tool-system.js...');
  
//   try {
//     // Verify the registry has tools
//     const toolIds = toolRegistry.getAllToolIds();
//     if (!toolIds.length) {
//       throw new Error('No tools registered in registry');
//     }
//     console.log(`Tool registry contains ${toolIds.length} tools`);
    
//     // Try to get a specific tool
//     const tokensTool = toolRegistry.getTool('tokens_words_counter');
//     if (!tokensTool) {
//       throw new Error('Could not retrieve tokens_words_counter tool');
//     }
    
//     // Verify the tool has core properties and methods
//     if (typeof tokensTool.execute !== 'function') {
//       throw new Error('Tool missing execute method');
//     }
    
//     if (!tokensTool.config) {
//       throw new Error('Tool missing config object');
//     }
    
//     console.log('Tool verification passed in tool-system.js');
//     return true;
//   } catch (error) {
//     console.error('Tool verification failed in tool-system.js:', error);
//     throw error;
//   }
// }

module.exports = {
  initializeToolSystem,
  executeToolById,
  reinitializeClaudeService,
  toolRegistry,
  // verifyToolLoading
};
