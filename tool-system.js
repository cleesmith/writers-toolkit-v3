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
  // console.log(`Base directory for tool loading: ${baseDir}`);
  
  // Safe logging that works in any context
  function log(message) {
    // console.log(message);
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
      // log(`File exists at: ${modulePath}`);
      const module = require(modulePath);
      // log(`Successfully loaded module: ${hyphenatedName}.js`);
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
const DevelopmentalEditing = loadToolClass('developmental-editing');
const LineEditing = loadToolClass('line-editing');
const CopyEditing = loadToolClass('copy_editing');
const ProofreaderMechanical = loadToolClass('proofreader-mechanical');
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
const DrunkClaude = loadToolClass('drunk-claude');
const BrainstormTool = loadToolClass('brainstorm');
const OutlineWriter = loadToolClass('outline-writer');
const WorldWriter = loadToolClass('world-writer');
const ChapterWriter = loadToolClass('chapter-writer');

// non-AI tools:
const DocxComments = loadToolClass('docx-comments');
const EpubConverter = loadToolClass('epub-converter');

const TOOL_DEFS = [
  { id: 'tokens_words_counter', title: `Tokens & Words Counter`, description: `This is a free call to test that your ANTHROPIC_API_KEY is working properly!  Also, use it to count the approximate tokens and words in text files (mostly for manuscript.txt).  This helps to estimate Claude API usage and context window requirements for your writing, and may help with API Settings for larger manuscripts.`, Class: TokensWordsCounter, options: [
    {
      "name": "input_file",
      "label": "Input File",
      "type": "file",
      "description": "Count tokens & words in text file.",
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
  { id: 'manuscript_to_outline_characters_world', title: `Manuscript.txt to create: outline, characters, and world files`, description: `Works in reverse to create: outline, characters, and world files given a manuscript. May be useful for pantsers, and old manuscript files.`, Class: ManuscriptToOutlineCharactersWorld, options: [
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
  { id: 'narrative_integrity', title: `Narrative Integrity`, description: `Focused on consistency issues within the entire manuscript, or consistency between the manuscript and the world document and/or the outline.\nThis tool supports various consistency checks: world, internal, development, and unresolved.\nConfigurable options enable targeted analysis of character, setting, timeline, and thematic consistency, producing detailed reports with examples and recommendations for resolving discrepancies.`, Class: NarrativeIntegrity, options: [
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
      "required": false,
      "default": "",
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
      "name": "check_type",
      "label": "Check Type",
      "type": "select",
      "description": "Select type of integrity check to perform",
      "required": false,
      "default": "internal",
      "group": "Analysis Options",
      "choices": [
        { "value": "world", "label": "World Integrity" },
        { "value": "internal", "label": "Internal Integrity" },
        { "value": "development", "label": "Development Integrity" },
        { "value": "unresolved", "label": "Unresolved Elements" },
        { "value": "all", "label": "All Checks" }
      ]
    }
  ]},
  { id: 'developmental_editing', title: `Developmental Editing`, description: `Performs developmental editing for your manuscript, with all chapter numbers/headers removed.`, Class: DevelopmentalEditing, options: [
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
      "name": "language",
      "label": "Language",
      "type": "text",
      "description": "Language for proofreading (e.g., English, Spanish, French)",
      "required": false,
      "default": "English",
      "group": "Settings"
    }
  ]},
  { id: 'line_editing', title: `Line Editing`, description: `Performs line editing for a specified chapter in your manuscript, as this can be an intensive task.`, Class: LineEditing, options: [
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
  { id: 'copy_editing', title: `Copy Editing`, description: `Performs copy editing for an entire manuscript, with all chapter numbers/headers removed.`, Class: CopyEditing, options: [
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
      "name": "language",
      "label": "Language",
      "type": "text",
      "description": "Language for proofreading (e.g., English, Spanish, French)",
      "required": false,
      "default": "English",
      "group": "Settings"
    }
  ]},
  { id: 'proofreader_mechanical', title: `Proofreader Mechanical`, description: `Performs proofreading for an entire manuscript. Mechanical checks for spelling, typos, punctuation, and grammar.`, Class: ProofreaderMechanical, options: [
    {
      "name": "manuscript_file",
      "label": "Manuscript File",
      "type": "file",
      "description": "Manuscript file to proofread.",
      "required": true,
      "default": "manuscript.txt",
      "filters": [
        {
          "name": "Text Files",
          "extensions": ["txt"]
        }
      ],
      "group": "Input Files"
    },
    {
      "name": "language",
      "label": "Language",
      "type": "text",
      "description": "Language for proofreading (e.g., English, Spanish, French)",
      "required": false,
      "default": "English",
      "group": "Settings"
    }
  ]},
  { id: 'proofreader_plot_consistency', title: `Proofreader Plot Consistency`, description: `Focused solely on plot inconsistencies.`, Class: ProofreaderMechanical, options: [
    {
      "name": "manuscript_file",
      "label": "Manuscript File",
      "type": "file",
      "description": "Manuscript file to proofread.",
      "required": true,
      "default": "manuscript.txt",
      "filters": [
        {
          "name": "Text Files",
          "extensions": ["txt"]
        }
      ],
      "group": "Input Files"
    },
    {
      "name": "language",
      "label": "Language",
      "type": "text",
      "description": "Language for proofreading (e.g., English, Spanish, French)",
      "required": false,
      "default": "English",
      "group": "Settings"
    }
  ]},
  { id: 'plot_thread_tracker', title: `Plot Thread Tracker`, description: `Manuscript analysis utility for identifying and tracking distinct plot threads\u2014revealing how they interconnect, converge, and diverge throughout the narrative.\n It uses text-based representations (with optional ASCII art visualization) and supports configurable analysis depth (basic, detailed, or comprehensive) to produce detailed reports with progression maps, thread connections, and narrative assessments, including manuscript excerpts and recommendations for strengthening the plot architecture.`, Class: PlotThreadTracker, options: [
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
      "name": "thread_focus",
      "label": "thread_focus",
      "type": "text",
      "description": "Optional list of specific plot threads to focus on (e.g., 'romance' 'mystery'). \nAlternative default: [\"romance\", \"mystery\"]",
      "required": false,
      "default": null,
      "group": "Output Configuration"
    }
  ]},
  { id: 'tense_consistency_checker', title: `Tense Consistency Checker`, description: `Examines the manuscript to evaluate verb tense consistency. It identifies shifts between past and present tense that might confuse readers, focusing on unintentional changes in narrative flow. With customizable analysis levels and configurable chapter markers, it generates a detailed report with examples, explanations, and suggestions for improving consistency.`, Class: TenseConsistencyChecker, options: [
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
    }
  ]},
  { id: 'character_analyzer', title: `Character Analyzer`, description: `Analyzes manuscript, outline, and world files to identify and compare character appearances. It extracts a master character list that details which files each character appears in, examines consistency across documents, and highlights discrepancies in names, roles, or relationships. The analysis produces a detailed report with sections and recommendations to improve character coherence. This is needed because AI rough draft writing has a tendency to add new characters! AI just loves new characters, especially those that whisper and hear echoes.`, Class: CharacterAnalyzer, options: [
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
    }
  ]},
  { id: 'adjective_adverb_optimizer', title: `Adjective Adverb Optimizer`, description: `Analyzes manuscript adjective and adverb usage to pinpoint unnecessary modifiers and overused qualifiers, offering specific suggestions for replacing weak descriptive patterns with stronger verbs and nouns, in line with Ursula K. Le Guin's guidance.`, Class: AdjectiveAdverbOptimizer, options: [
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
  { id: 'dangling_modifier_checker', title: `Dangling Modifier Checker`, description: `Manuscript analysis software that detects dangling and misplaced modifiers.\nIt examines text to pinpoint instances where descriptive phrases don\u2019t logically connect to their intended subjects, potentially causing confusion or unintended humor.\nWith customizable analysis level, sensitivity, and specific modifier types, it generates a detailed report complete with examples, explanations, and revision suggestions to enhance clarity and precision.`, Class: DanglingModifierChecker, options: [
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
    }
  ]},
  { id: 'rhythm_analyzer', title: `Rhythm Analyzer`, description: `Manuscript analysis utility for evaluating the rhythm and flow of prose.\nIt measures sentence length variations, detects monotonous patterns, and highlights sections where the writing\u2019s rhythm doesn\u2019t match the intended mood.\n Configurable analysis levels, selectable scene types, and adjustable sensitivity settings allow it to generate a detailed report with examples, explanations, and suggestions for enhancing overall narrative rhythm.`, Class: RhythmAnalyzer, options: [
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
  { id: 'crowding_leaping_evaluator', title: `Crowding Leaping Evaluator`, description: `Manuscript pacing evaluator that examines narrative structure for pacing issues.\nIt identifies overly dense sections (crowding) and abrupt transitions or time jumps (leaping) based on concepts inspired by Ursula K. Le Guin.\n With configurable analysis levels and sensitivity settings, it produces a detailed report\u2014including optional text-based visualizations\u2014that offers feedback and suggestions for improving narrative rhythm and clarity.`, Class: CrowdingLeapingEvaluator, options: [
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
  { id: 'punctuation_auditor', title: `Punctuation Auditor`, description: `Manuscript analysis utility focused on evaluating punctuation effectiveness.\nIt detects issues such as run-on sentences, missing commas, and irregular punctuation patterns that may hinder clarity and flow.\nConfigurable analysis levels, strictness settings, and selectable punctuation elements enable it to generate a detailed report with examples, explanations, and recommendations for enhancing punctuation and overall readability.`, Class: PunctuationAuditor, options: [
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
  { id: 'conflict_analyzer', title: `Conflict Analyzer`, description: `Manuscript conflict analysis utility that examines conflict patterns at different narrative levels.\nIt identifies conflict nature, escalation, and resolution at scene, chapter, and arc levels.\nWith customizable analysis levels and selectable conflict types, it produces a detailed report featuring examples, assessments, and recommendations for strengthening narrative tension and coherence.`, Class: ConflictAnalyzer, options: [
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
      "name": "analysis_level",
      "label": "analysis_level",
      "type": "text",
      "description": "Level of conflict analysis to perform (default: all)\nChoices: scene, chapter, arc, all",
      "required": false,
      "default": "all",
      "group": "Analysis Options"
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
  { id: 'foreshadowing_tracker', title: `Foreshadowing Tracker`, description: `Manuscript analysis utility for identifying foreshadowing elements and tracking their payoffs.\n It pinpoints explicit clues, subtle hints, and Chekhov's Gun elements to evaluate how well narrative setups are resolved.\n With customizable options to select foreshadowing types and organization modes (chronological or by type), it generates detailed reports featuring examples, assessments, and recommendations for fulfilling narrative promises.`, Class: ForeshadowingTracker, options: [
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
    }
  ]},
  { id: 'kdp_publishing_prep', title: `KDP Publishing Preparation`, description: `Analyzes manuscript in preparation for KDP publishing.`, Class: KdpPublishingPrep, options: [
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
  { id: 'drunk_claude', title: `Drunk Claude`, description: `Claude pretends to be drunk while critiquing your manuscript. Sometimes insightful, other times just an annoying drunk.`, Class: DrunkClaude, options: [
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
  { id: 'brainstorm', title: `Brainstorm`, description: `Helps generate initial story ideas, prompts, and creative angles. Appends more ideas to the existing 'ideas.txt' file.`, Class: BrainstormTool, options: [
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
  { id: 'outline_writer', title: `Outline Writer`, description: `Generates a plot outline from your brainstorming file.  You can provide your own outline skeleton and let the AI fill in details.`, Class: OutlineWriter, options: [
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
  { id: 'world_writer', title: `World Writer`, description: `Extract and develop characters and world elements from a novel outline.  It requires: title, POV, and characters.txt and outline.txt.`, Class: WorldWriter, options: [
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
  { id: 'chapter_writer', title: `Chapter Writer`, description: `Uses the outline, chapters list, world document, and any existing manuscript to write rough draft chapters`, Class: ChapterWriter, options: [
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
  { id: 'docx_comments', title: 'DOCX Text/Comments Extractor', description: 'Extracts comments and associated text from DOCX files and saves them to a text file', Class: DocxComments, options: [
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
            "extensions": ["docx"]
          }
        ],
        "group": "Input Files"
      }
  ]},
  { id: 'epub_converter', title: 'EPUB to TXT Converter', description: 'Converts EPUB files to plain text format while preserving structure', Class: EpubConverter, options: [
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
  ]}
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
  console.log('Initializing tool system...');
  
  if (typeof global.logToFile === 'function') {
    global.logToFile('[tool-system] Starting tool system initialization');
  }
  
  try {
    // Create Claude API service with the provided settings
    const claudeService = new ClaudeAPIService(settings);
    console.log('Created ClaudeAPIService instance');
    
    // Define which tools are non-AI and don't need Claude service
    const nonAiToolIds = ['docx_comments', 'epub_converter'];
    
    // Register each tool with proper configuration
    let toolCount = 0;
    TOOL_DEFS.forEach(def => {
      if (typeof global.logToFile === 'function') {
        global.logToFile(`[tool-system] Registering tool #${toolCount + 1}: ${def.id}`);
      }
      
      // Create tool config with all properties from definition
      const toolConfig = {
        name: def.id,
        title: def.title,
        description: def.description,
        options: def.options || [],
        ...settings
      };
      
      console.log(`Creating instance of tool: ${def.id}`);
      
      // Create tool instance
      let instance;
      
      // Check if this is a non-AI tool
      if (nonAiToolIds.includes(def.id)) {
        // Non-AI tools don't get Claude service
        instance = new def.Class(def.id, toolConfig);
        console.log(`Initialized non-AI tool ${def.id} without Claude service`);
      } else {
        // AI tools get Claude service as first parameter
        console.log(`Passing claudeService to AI tool ${def.id}`);
        instance = new def.Class(claudeService, toolConfig);
        
        // Verify the service was stored
        console.log(`Tool ${def.id} has claudeService: ${!!instance.claudeService}`);
        
        // If the tool doesn't properly store claudeService, add it here
        if (!instance.claudeService) {
          console.log(`Manually setting claudeService for tool ${def.id}`);
          instance.claudeService = claudeService;
        }
        
        console.log(`Initialized AI tool ${def.id} with Claude service`);
      }
      
      // Add to registry
      toolRegistry.registerTool(def.id, instance);
      
      // Verify the tool in registry
      const registeredTool = toolRegistry.getTool(def.id);
      console.log(`Verified tool ${def.id} in registry has claudeService: ${!!registeredTool.claudeService}`);
      
      toolCount++;
    });
    
    // Log registration summary
    const allTools = toolRegistry.getAllToolIds();
    // console.log(`Registered ${allTools.length} built-in tools:`, allTools);
    
    return { claudeService, toolRegistry };
  } catch (error) {
    console.error(`[tool-system] ERROR during initialization: ${error.message}`);
    throw error;
  }
}

/**
 * Execute a tool by ID
 * @param {string} toolId - Tool ID
 * @param {Object} options - Tool options
 * @returns {Promise<Object>} - Tool execution result
 */
async function executeToolById(toolId, options) {
  console.log(`Executing tool: ${toolId} with options:`, options);
  
  // Get the tool implementation
  const tool = toolRegistry.getTool(toolId);
  
  if (!tool) {
    console.error(`Tool not found: ${toolId}`);
    throw new Error(`Tool not found: ${toolId}`);
  }
  
  // Store the original claudeService in case we need to restore it
  const originalClaudeService = tool.claudeService;
  
  try {
    console.log('*** Client before recreate:', !!tool.claudeService?.client);
    
    // Only try to recreate if tool has a claudeService
    if (tool.claudeService && typeof tool.claudeService.recreate === 'function') {
      tool.claudeService.recreate();
    } else {
      console.log(`Tool ${toolId} does not have a valid Claude service (has claudeService: ${!!tool.claudeService})`);
    }
    
    console.log('*** Client after recreate:', !!tool.claudeService?.client);
    
    // Execute the tool
    console.log(`Starting execution of tool: ${toolId}`);
    const result = await tool.execute(options);
    console.log(`Tool execution complete: ${toolId}`);
    
    // Close the client after successful execution
    if (tool.claudeService && typeof tool.claudeService.close === 'function') {
      try {
        tool.claudeService.close();
      } catch (error) {
        console.warn(`Error closing Claude service for tool ${toolId}:`, error);
      } finally {
        // Don't set to null here - this might be causing the problem!
        // tool.claudeService = null;
      }
    }
    
    return result;
  } catch (error) {
    console.error(`Error executing tool ${toolId}:`, error);
    
    // Ensure the client is closed even if execution fails
    if (tool && tool.claudeService && typeof tool.claudeService.close === 'function') {
      try {
        tool.claudeService.close();
      } catch (closeError) {
        console.warn(`Error closing Claude service after execution error:`, closeError);
      } finally {
        // Don't set to null here either
        // tool.claudeService = null;
      }
    }
    
    throw error;
  }
}

/**
 * Reinitialize the Claude API service with updated settings
 * @param {Object} settings - Claude API settings
 * @returns {Object} - New Claude API service instance
 */
// In tool-system.js, update the reinitializeClaudeService function (around line 1559):

/**
 * Reinitialize the Claude API service with updated settings
 * @param {Object} settings - Claude API settings
 * @returns {Object} - New Claude API service instance
 */
function reinitializeClaudeService(settings) {
  // Create a new Claude service with the updated settings
  const claudeService = new ClaudeAPIService(settings);
  
  // Update the service in all registered tools
  for (const toolId of toolRegistry.getAllToolIds()) {
    const tool = toolRegistry.getTool(toolId);
    
    // Close any existing client first
    if (tool.claudeService) {
      try {
        tool.claudeService.close();
      } catch (error) {
        console.warn(`Error closing Claude service during reinitialization:`, error);
      } finally {
        tool.claudeService = null;  // This ALWAYS happens
      }
    }
    
    tool.claudeService = claudeService;
  }
  
  return claudeService;
}

module.exports = {
  initializeToolSystem,
  executeToolById,
  reinitializeClaudeService,
  toolRegistry
};
