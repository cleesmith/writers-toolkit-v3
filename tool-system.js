// tool-system.js
const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const ClaudeAPIService = require('./client');

const toolRegistry = require('./registry');

// function requireTool(toolName) {
//   console.log(`Attempting to require tool from: ${toolName}`);
//   // Always load the file that uses hyphens on disk
//   const file = path.join(__dirname, `${toolName.replace(/_/g, '-')}.js`);
//   if (fs.existsSync(file)) return require(file);

//   throw new Error(`Could not load tool: ${toolName}\nLooked for: ${file}`);
// }

// // Dynamically load all tools
// let TokensWordsCounter, ManuscriptToOutlineCharactersWorld, NarrativeIntegrity,
//     BrainstormTool, OutlineWriter, WorldWriter, ChapterWriter, CharacterAnalyzer,
//     TenseConsistencyChecker, AdjectiveAdverbOptimizer, DanglingModifierChecker,
//     RhythmAnalyzer, CrowdingLeapingEvaluator, PunctuationAuditor,
//     ConflictAnalyzer, ForeshadowingTracker, PlotThreadTracker, KDPPublishingPrep;

// try {
//   TokensWordsCounter = requireTool('tokens-words-counter');
//   ManuscriptToOutlineCharactersWorld = requireTool('manuscript-to-outline-characters-world');
//   NarrativeIntegrity = requireTool('narrative-integrity');
//   BrainstormTool = requireTool('brainstorm');
//   OutlineWriter = requireTool('outline-writer');
//   WorldWriter = requireTool('world-writer');
//   ChapterWriter = requireTool('chapter-writer');
//   CharacterAnalyzer = requireTool('character-analyzer');
//   TenseConsistencyChecker = requireTool('tense-consistency-checker');
//   AdjectiveAdverbOptimizer = requireTool('adjective-adverb-optimizer');
//   DanglingModifierChecker = requireTool('dangling-modifier-checker');
//   RhythmAnalyzer = requireTool('rhythm-analyzer');
//   CrowdingLeapingEvaluator = requireTool('crowding-leaping-evaluator');
//   PunctuationAuditor = requireTool('punctuation-auditor');
//   ConflictAnalyzer = requireTool('conflict-analyzer');
//   ForeshadowingTracker = requireTool('foreshadowing-tracker');
//   PlotThreadTracker = requireTool('plot-thread-tracker');
//   KDPPublishingPrep = requireTool('kdp-publishing-prep');
// } catch (error) {
//   console.error('Error loading tools:', error);
// }

const TokensWordsCounter = require('./tokens-words-counter');
const ManuscriptToOutlineCharactersWorld = require('./manuscript-to-outline-characters-world');
const NarrativeIntegrity = require('./narrative-integrity');
const BrainstormTool = require('./brainstorm');
const OutlineWriter = require('./outline-writer');
const WorldWriter = require('./world-writer');
const ChapterWriter = require('./chapter-writer');
const CharacterAnalyzer = require('./character-analyzer');
const TenseConsistencyChecker = require('./tense-consistency-checker');
const AdjectiveAdverbOptimizer = require('./adjective-adverb-optimizer');
const DanglingModifierChecker = require('./dangling-modifier-checker');
const RhythmAnalyzer = require('./rhythm-analyzer');
const CrowdingLeapingEvaluator = require('./crowding-leaping-evaluator');
const PunctuationAuditor = require('./punctuation-auditor');
const ConflictAnalyzer = require('./conflict-analyzer');
const ForeshadowingTracker = require('./foreshadowing-tracker');
const PlotThreadTracker = require('./plot-thread-tracker');
const KdpPublishingPrep = require('./kdp-publishing-prep');


// Built‑in tool definitions. No external JSON needed.

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
      "default": "outline.txt",
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
  { id: 'brainstorm', title: `Brainstorm`, Class: BrainstormTool, options: [
    {
      "name": "ideas_file",
      "label": "IDEAS_FILE",
      "type": "file",
      "description": "Path to ideas.txt file containing the concept and/or characters",
      "required": true,
      "default": "",
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
      "default": "",
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
      "default": "",
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
      "default": "",
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
      "default": "/Users/cleesmith/writing/A_Darker_Roast/manuscript.txt",
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
      "default": "outline.txt",
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
      "default": "outline.txt",
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
      "default": "outline.txt",
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

/**
 * Initialize the tool system
 * @param {Object} settings - Claude API settings
 * @param {Object} database - Database instance
 */
// async function initializeToolSystem(settings, database) {
//   console.log('Initializing tool system...');
  
//   // Make sure the database is initialized
//   if (!database.isInitialized) {
//     console.log('Initializing database...');
//     await database.init();
//   }
  
//   // Create Claude API service
//   console.log('Creating Claude API service...');
//   const claudeService = new ClaudeAPIService(settings);
  
//   // Get tools from database
//   const dbTools = database.getTools();
  
//   // Register available tool implementations
//   dbTools.forEach(toolInfo => {
//     // console.log(`Checking tool: ${toolInfo.name}`);
    
//     // For tokens_words_counter.js
//     if (toolInfo.name === 'tokens_words_counter') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name, // Use ID as the registry key
//           new TokensWordsCounter(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'manuscript_to_outline_characters_world') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Manuscript To Outline Characters World tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new ManuscriptToOutlineCharactersWorld(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`>>> Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'narrative_integrity') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Narrative Integrity tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new NarrativeIntegrity(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'brainstorm') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Brainstorm tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new BrainstormTool(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'outline_writer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Outline Writer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new OutlineWriter(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'world_writer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('World Writer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new WorldWriter(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'chapter_writer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Chapter Writer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new ChapterWriter(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'character_analyzer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Chapter Analyzer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new CharacterAnalyzer(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'tense_consistency_checker') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Tense Consistency Checker tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new TenseConsistencyChecker(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'adjective_adverb_optimizer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Adjective Adverb Optimizer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new AdjectiveAdverbOptimizer(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'dangling_modifier_checker') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Dangling Modifier Checker tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new DanglingModifierChecker(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'rhythm_analyzer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Rhythm Analyzer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new RhythmAnalyzer(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'crowding_leaping_evaluator') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Crowding Leaping Evaluator tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new CrowdingLeapingEvaluator(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'punctuation_auditor') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Punctuation Auditor tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new PunctuationAuditor(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'conflict_analyzer') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Conflict Analyzer tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new ConflictAnalyzer(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'foreshadowing_tracker') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Foreshadowing Tracker tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new ForeshadowingTracker(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'plot_thread_tracker') {
//       const toolConfig = database.getToolByName(toolInfo.name);
//       // console.log('Plot Thread Tracker tool config:', toolConfig);
      
//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new PlotThreadTracker(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }
//     else if (toolInfo.name === 'kdp_publishing_prep') {
//       const toolConfig = database.getToolByName(toolInfo.name);

//       if (toolConfig) {
//         // Register the tool
//         toolRegistry.registerTool(
//           toolInfo.name,
//           new KDPPublishingPrep(claudeService, {
//             ...toolConfig,
//             ...settings
//           })
//         );
//         // console.log(`Successfully registered tool: ${toolInfo.name}`);
//       }
//     }

//   });

//   console.log(`Found ${dbTools.length} tools in database`);
  
//   return {
//     claudeService,
//     toolRegistry
//   };
// }
async function initializeToolSystem(settings) {
  console.log('Initializing tool system (no external DB)…');
  // const ClaudeAPIService = require('./client');
  const claudeService = new ClaudeAPIService(settings);

  TOOL_DEFS.forEach(def => {
    const instance = new def.Class(claudeService, {
      title: def.title,
      description: def.title,
      options: def.options,
      ...settings
    });
    toolRegistry.registerTool(def.id, instance);
  });

  console.log('Registered', toolRegistry.getAllToolIds().length, 'built‑in tools');
  return { claudeService, toolRegistry };
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
  
  try {
    // Execute the tool
    console.log(`Starting execution of tool: ${toolId}`);
    const result = await tool.execute(options);
    console.log(`Tool execution complete: ${toolId}`);
    return result;
  } catch (error) {
    console.error(`Error executing tool ${toolId}:`, error);
    throw error;
  }
}

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
    tool.claudeService = claudeService;
  }
  
  return claudeService;
}

module.exports = {
  initializeToolSystem,
  executeToolById,
  reinitializeClaudeService, // Add the missing export here
  toolRegistry
};