// manuscript-extractor.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ManuscriptExtractor Tool
 * Analyzes an existing manuscript and extracts the outline, world elements, and character details
 * to help users transition into the Writer's Toolkit workflow with complete project files.
 */
class ManuscriptExtractor extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('manuscript_extractor', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing ManuscriptExtractor with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'manuscript_extractor';
    fileCache.clear(toolName);
    
    // Extract options
    const manuscriptFile = options.manuscript_file;
    const title = options.title || this.extractTitleFromFileName(manuscriptFile);
    const genre = options.genre || '';
    const language = options.lang || 'English';
    const pov = options.pov || 'undetermined';
    const outlineLevel = options.outline_level || 'standard';
    const worldLevel = options.world_level || 'standard';
    const characterLevel = options.character_level || 'standard';
    const includeTimelineFile = options.include_timeline || false;
    
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    const outputFiles = [];
    
    // Validate save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
    
    // Ensure file paths are absolute
    const absoluteManuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    
    try {
      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${absoluteManuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(absoluteManuscriptFile);
      
      // Generate outline, world, and characters files
      this.emitOutput(`\nAnalyzing manuscript to extract project files...\n`);
      this.emitOutput(`Title: ${title}\n`);
      if (genre) this.emitOutput(`Genre: ${genre}\n`);
      this.emitOutput(`Language: ${language}\n`);
      this.emitOutput(`POV: ${pov}\n`);
      
      // Process each file type in sequence
      const outlineFile = await this.generateOutline(
        title, 
        genre, 
        manuscriptContent, 
        language, 
        outlineLevel, 
        saveDir
      );
      outputFiles.push(...outlineFile);
      
      const characterFile = await this.generateCharacters(
        title, 
        genre, 
        manuscriptContent, 
        language, 
        characterLevel, 
        saveDir
      );
      outputFiles.push(...characterFile);
      
      const worldFile = await this.generateWorld(
        title, 
        genre, 
        pov,
        manuscriptContent, 
        language, 
        worldLevel, 
        saveDir
      );
      outputFiles.push(...worldFile);
      
      // Generate timeline if requested
      if (includeTimelineFile) {
        const timelineFile = await this.generateTimeline(
          title, 
          genre, 
          manuscriptContent, 
          language, 
          saveDir
        );
        outputFiles.push(...timelineFile);
      }
      
      // Add all files to the cache
      for (const file of outputFiles) {
        fileCache.addFile(toolName, file);
      }
      
      // Display final message
      this.emitOutput(`\nExtraction complete! Generated files:\n`);
      outputFiles.forEach(file => {
        this.emitOutput(`- ${path.basename(file)}\n`);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          extractedFiles: outputFiles.length
        }
      };
      
    } catch (error) {
      console.error('Error in ManuscriptExtractor:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Extract title from filename
   * @param {string} filename - Manuscript filename
   * @returns {string} - Extracted title
   */
  extractTitleFromFileName(filename) {
    if (!filename) return 'Untitled Manuscript';
    
    const baseName = path.basename(filename, path.extname(filename));
    
    // Convert snake_case or kebab-case to Title Case
    const title = baseName
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    
    return title;
  }
  
  /**
   * Generate outline file
   * @param {string} title - Title
   * @param {string} genre - Genre
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language
   * @param {string} outlineLevel - Detail level (basic, standard, detailed)
   * @param {string} saveDir - Directory to save output
   * @returns {Promise<string[]>} - Paths to saved files
   */
  async generateOutline(
    title,
    genre,
    manuscriptContent,
    language,
    outlineLevel,
    saveDir
  ) {
    this.emitOutput(`\n=== Generating outline.txt ===\n`);
    
    // Create prompt for outline extraction
    const prompt = this.createOutlineExtractionPrompt(
      title,
      genre,
      manuscriptContent,
      language,
      outlineLevel
    );
    
    // Count tokens in prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);
    
    // Calculate available tokens
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);
    
    // Display token stats
    this.emitOutput(`\nToken stats for outline extraction:\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
    this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}]\n`);
    this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
    
    // Check if prompt is too large
    if (tokenBudgets.isPromptTooLarge) {
      this.emitOutput(`Error: prompt is too large for the configured thinking budget!\n`);
      throw new Error(`Prompt is too large for outline extraction - consider reducing manuscript size`);
    }
    
    // Call Claude API with streaming
    this.emitOutput(`Sending request to Claude API (streaming)...\n`);
    
    // Add a waiting message
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Analyzing manuscript structure and extracting outline...                \n`);
    this.emitOutput(`*  This process typically takes several minutes.                           \n`);
    this.emitOutput(`****************************************************************************\n\n`);
    
    const startTime = Date.now();
    let fullResponse = "";
    let thinkingContent = "";
    
    // Create system prompt
    const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";
    
    try {
      // Use streaming API call
      await this.claudeService.streamWithThinking(
        prompt,
        {
          system: systemPrompt,
          max_tokens: tokenBudgets.maxTokens,
          thinking: {
            type: "enabled",
            budget_tokens: tokenBudgets.thinkingBudget
          },
          betas: ["output-128k-2025-02-19"]
        },
        // Callback for thinking content
        (thinkingDelta) => {
          thinkingContent += thinkingDelta;
        },
        // Callback for response text
        (textDelta) => {
          fullResponse += textDelta;
        }
      );
    } catch (error) {
      this.emitOutput(`\nAPI Error: ${error.message}\n`);
      throw error;
    }
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    this.emitOutput(`Outline extraction completed in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // Count words in response
    const wordCount = this.countWords(fullResponse);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(fullResponse);
    
    // Save the outline to a file
    const outlineFilename = 'outline.txt';
    const outlinePath = path.join(saveDir, outlineFilename);
    
    await this.writeOutputFile(fullResponse, saveDir, outlineFilename);
    this.emitOutput(`Outline saved to: ${outlinePath}\n`);
    
    // Save thinking content if available and not skipped
    const outputFiles = [outlinePath];
    
    if (thinkingContent) {
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const thinkingFilename = `outline_thinking_${timestamp}.txt`;
      
      // Create stats
      const stats = `
Stats:
Prompt tokens: ${promptTokens}
Elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Word count: ${wordCount}
Token count: ${responseTokens}
`;
      
      const thinkingContent2 = `=== OUTLINE EXTRACTION FROM MANUSCRIPT ===

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}`;
      
      await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
      const thinkingPath = path.join(saveDir, thinkingFilename);
      this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
      
      outputFiles.push(thinkingPath);
    }
    
    return outputFiles;
  }
  
  /**
   * Generate characters file
   * @param {string} title - Title
   * @param {string} genre - Genre
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language
   * @param {string} characterLevel - Detail level (basic, standard, detailed)
   * @param {string} saveDir - Directory to save output
   * @returns {Promise<string[]>} - Paths to saved files
   */
  async generateCharacters(
    title,
    genre,
    manuscriptContent,
    language,
    characterLevel,
    saveDir
  ) {
    this.emitOutput(`\n=== Generating characters.txt ===\n`);
    
    // Create prompt for character extraction
    const prompt = this.createCharacterExtractionPrompt(
      title,
      genre,
      manuscriptContent,
      language,
      characterLevel
    );
    
    // Count tokens in prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);
    
    // Calculate available tokens
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);
    
    // Display token stats
    this.emitOutput(`\nToken stats for character extraction:\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
    this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}]\n`);
    this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
    
    // Check if prompt is too large
    if (tokenBudgets.isPromptTooLarge) {
      this.emitOutput(`Error: prompt is too large for the configured thinking budget!\n`);
      throw new Error(`Prompt is too large for character extraction - consider reducing manuscript size`);
    }
    
    // Call Claude API with streaming
    this.emitOutput(`Sending request to Claude API (streaming)...\n`);
    
    // Add a waiting message
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Analyzing manuscript and extracting character profiles...               \n`);
    this.emitOutput(`*  This process typically takes several minutes.                           \n`);
    this.emitOutput(`****************************************************************************\n\n`);
    
    const startTime = Date.now();
    let fullResponse = "";
    let thinkingContent = "";
    
    // Create system prompt
    const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";
    
    try {
      // Use streaming API call
      await this.claudeService.streamWithThinking(
        prompt,
        {
          system: systemPrompt,
          max_tokens: tokenBudgets.maxTokens,
          thinking: {
            type: "enabled",
            budget_tokens: tokenBudgets.thinkingBudget
          },
          betas: ["output-128k-2025-02-19"]
        },
        // Callback for thinking content
        (thinkingDelta) => {
          thinkingContent += thinkingDelta;
        },
        // Callback for response text
        (textDelta) => {
          fullResponse += textDelta;
        }
      );
    } catch (error) {
      this.emitOutput(`\nAPI Error: ${error.message}\n`);
      throw error;
    }
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    this.emitOutput(`Character extraction completed in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // Count words in response
    const wordCount = this.countWords(fullResponse);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(fullResponse);
    
    // Save the characters to a file
    const charactersFilename = 'characters.txt';
    const charactersPath = path.join(saveDir, charactersFilename);
    
    await this.writeOutputFile(fullResponse, saveDir, charactersFilename);
    this.emitOutput(`Characters saved to: ${charactersPath}\n`);
    
    // Save thinking content if available and not skipped
    const outputFiles = [charactersPath];
    
    if (thinkingContent) {
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const thinkingFilename = `characters_thinking_${timestamp}.txt`;
      
      // Create stats
      const stats = `
Stats:
Prompt tokens: ${promptTokens}
Elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Word count: ${wordCount}
Token count: ${responseTokens}
`;
      
      const thinkingContent2 = `=== CHARACTER EXTRACTION FROM MANUSCRIPT ===

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}`;
      
      await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
      const thinkingPath = path.join(saveDir, thinkingFilename);
      this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
      
      outputFiles.push(thinkingPath);
    }
    
    return outputFiles;
  }
  
  /**
   * Generate world file
   * @param {string} title - Title
   * @param {string} genre - Genre
   * @param {string} pov - Point of view
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language
   * @param {string} worldLevel - Detail level (basic, standard, detailed)
   * @param {string} saveDir - Directory to save output
   * @returns {Promise<string[]>} - Paths to saved files
   */
  async generateWorld(
    title,
    genre,
    pov,
    manuscriptContent,
    language,
    worldLevel,
    saveDir
  ) {
    this.emitOutput(`\n=== Generating world.txt ===\n`);
    
    // Create prompt for world extraction
    const prompt = this.createWorldExtractionPrompt(
      title,
      genre,
      pov,
      manuscriptContent,
      language,
      worldLevel
    );
    
    // Count tokens in prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);
    
    // Calculate available tokens
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);
    
    // Display token stats
    this.emitOutput(`\nToken stats for world extraction:\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
    this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}]\n`);
    this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
    
    // Check if prompt is too large
    if (tokenBudgets.isPromptTooLarge) {
      this.emitOutput(`Error: prompt is too large for the configured thinking budget!\n`);
      throw new Error(`Prompt is too large for world extraction - consider reducing manuscript size`);
    }
    
    // Call Claude API with streaming
    this.emitOutput(`Sending request to Claude API (streaming)...\n`);
    
    // Add a waiting message
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Analyzing manuscript and extracting world elements...                   \n`);
    this.emitOutput(`*  This process typically takes several minutes.                           \n`);
    this.emitOutput(`****************************************************************************\n\n`);
    
    const startTime = Date.now();
    let fullResponse = "";
    let thinkingContent = "";
    
    // Create system prompt
    const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";
    
    try {
      // Use streaming API call
      await this.claudeService.streamWithThinking(
        prompt,
        {
          system: systemPrompt,
          max_tokens: tokenBudgets.maxTokens,
          thinking: {
            type: "enabled",
            budget_tokens: tokenBudgets.thinkingBudget
          },
          betas: ["output-128k-2025-02-19"]
        },
        // Callback for thinking content
        (thinkingDelta) => {
          thinkingContent += thinkingDelta;
        },
        // Callback for response text
        (textDelta) => {
          fullResponse += textDelta;
        }
      );
    } catch (error) {
      this.emitOutput(`\nAPI Error: ${error.message}\n`);
      throw error;
    }
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    this.emitOutput(`World extraction completed in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // Count words in response
    const wordCount = this.countWords(fullResponse);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(fullResponse);
    
    // Save the world to a file
    const worldFilename = 'world.txt';
    const worldPath = path.join(saveDir, worldFilename);
    
    await this.writeOutputFile(fullResponse, saveDir, worldFilename);
    this.emitOutput(`World document saved to: ${worldPath}\n`);
    
    // Save thinking content if available and not skipped
    const outputFiles = [worldPath];
    
    if (thinkingContent) {
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const thinkingFilename = `world_thinking_${timestamp}.txt`;
      
      // Create stats
      const stats = `
Stats:
Prompt tokens: ${promptTokens}
Elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Word count: ${wordCount}
Token count: ${responseTokens}
`;
      
      const thinkingContent2 = `=== WORLD EXTRACTION FROM MANUSCRIPT ===

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}`;
      
      await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
      const thinkingPath = path.join(saveDir, thinkingFilename);
      this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
      
      outputFiles.push(thinkingPath);
    }
    
    return outputFiles;
  }
  
  /**
   * Generate timeline file
   * @param {string} title - Title
   * @param {string} genre - Genre
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language
   * @param {string} saveDir - Directory to save output
   * @returns {Promise<string[]>} - Paths to saved files
   */
  async generateTimeline(
    title,
    genre,
    manuscriptContent,
    language,
    saveDir
  ) {
    this.emitOutput(`\n=== Generating timeline.txt ===\n`);
    
    // Create prompt for timeline extraction
    const prompt = this.createTimelineExtractionPrompt(
      title,
      genre,
      manuscriptContent,
      language
    );
    
    // Count tokens in prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);
    
    // Calculate available tokens
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);
    
    // Display token stats
    this.emitOutput(`\nToken stats for timeline extraction:\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
    this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}]\n`);
    this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
    
    // Check if prompt is too large
    if (tokenBudgets.isPromptTooLarge) {
      this.emitOutput(`Error: prompt is too large for the configured thinking budget!\n`);
      throw new Error(`Prompt is too large for timeline extraction - consider reducing manuscript size`);
    }
    
    // Call Claude API with streaming
    this.emitOutput(`Sending request to Claude API (streaming)...\n`);
    
    // Add a waiting message
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Analyzing manuscript chronology and creating timeline...                \n`);
    this.emitOutput(`*  This process typically takes several minutes.                           \n`);
    this.emitOutput(`****************************************************************************\n\n`);
    
    const startTime = Date.now();
    let fullResponse = "";
    let thinkingContent = "";
    
    // Create system prompt
    const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";
    
    try {
      // Use streaming API call
      await this.claudeService.streamWithThinking(
        prompt,
        {
          system: systemPrompt,
          max_tokens: tokenBudgets.maxTokens,
          thinking: {
            type: "enabled",
            budget_tokens: tokenBudgets.thinkingBudget
          },
          betas: ["output-128k-2025-02-19"]
        },
        // Callback for thinking content
        (thinkingDelta) => {
          thinkingContent += thinkingDelta;
        },
        // Callback for response text
        (textDelta) => {
          fullResponse += textDelta;
        }
      );
    } catch (error) {
      this.emitOutput(`\nAPI Error: ${error.message}\n`);
      throw error;
    }
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    this.emitOutput(`Timeline extraction completed in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // Count words in response
    const wordCount = this.countWords(fullResponse);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(fullResponse);
    
    // Save the timeline to a file
    const timelineFilename = 'timeline.txt';
    const timelinePath = path.join(saveDir, timelineFilename);
    
    await this.writeOutputFile(fullResponse, saveDir, timelineFilename);
    this.emitOutput(`Timeline saved to: ${timelinePath}\n`);
    
    // Save thinking content if available and not skipped
    const outputFiles = [timelinePath];
    
    if (thinkingContent) {
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const thinkingFilename = `timeline_thinking_${timestamp}.txt`;
      
      // Create stats
      const stats = `
Stats:
Prompt tokens: ${promptTokens}
Elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Word count: ${wordCount}
Token count: ${responseTokens}
`;
      
      const thinkingContent2 = `=== TIMELINE EXTRACTION FROM MANUSCRIPT ===

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}`;
      
      await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
      const thinkingPath = path.join(saveDir, thinkingFilename);
      this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
      
      outputFiles.push(thinkingPath);
    }
    
    return outputFiles;
  }
  
  /**
   * Create outline extraction prompt
   * @param {string} title - Title of manuscript
   * @param {string} genre - Genre of manuscript
   * @param {string} manuscriptContent - Content of manuscript
   * @param {string} language - Language of manuscript
   * @param {string} outlineLevel - Level of detail (basic, standard, detailed)
   * @returns {string} - Prompt for Claude API
   */
  createOutlineExtractionPrompt(
    title,
    genre,
    manuscriptContent,
    language,
    outlineLevel = "standard"
  ) {
    // Genre inclusion
    const genreText = genre ? `Genre: ${genre}` : 'Please determine the most appropriate genre.';
    
    // Detail level instructions
    const detailInstructions = {
      basic: `
Create a basic outline with:
- 3-5 major parts or acts
- Limited to 15-20 chapters total 
- Brief 1-2 sentence chapter descriptions
- Focus only on the main plot arc`,
      
      standard: `
Create a standard outline with:
- 3-5 major parts or acts
- 20-30 chapters total
- 3-4 bullet points per chapter describing key events
- Include main plot and significant subplots`,
      
      detailed: `
Create a detailed outline with:
- 3-7 major parts or acts
- 25-40 chapters total
- 5-7 bullet points per chapter with detailed scene descriptions
- Include main plot, all subplots, and character arcs
- Note important thematic developments within chapters`
    };
    
    // Select appropriate detail level
    const detailLevel = detailInstructions[outlineLevel] || detailInstructions.standard;
    
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

You are a skilled story editor and narrative architect helping to extract a comprehensive, well-structured outline from an existing manuscript written in ${language}.

Task: Create an outline document for the novel: "${title}"
${genreText}

${detailLevel}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "OUTLINE:" followed by the novel title on the next line
3. For parts/sections, use plain text like: "PART I: THE BEGINNING"
4. For chapters, use ONLY simple numbering like: "1. Chapter Title" (no "Chapter" word, just the number and title)
5. Format each bullet point starting with "- " (dash followed by space)
6. Each bullet point should describe a single key event, character moment, or plot development
7. Make bullet points substantive but concise, focusing on important elements
8. Include a brief epilogue section at the end if applicable

The outline should accurately reflect the existing manuscript's structure, timeline, and content. Use actual chapter divisions from the manuscript when possible. Create appropriate chapter titles that capture the essence of each section.

This outline will be saved as 'outline.txt' and used for further development and analysis of the novel, so ensure it provides a complete map of the story.`;
  }
  
  /**
   * Create character extraction prompt
   * @param {string} title - Title of manuscript
   * @param {string} genre - Genre of manuscript
   * @param {string} manuscriptContent - Content of manuscript
   * @param {string} language - Language of manuscript
   * @param {string} characterLevel - Level of detail (basic, standard, detailed)
   * @returns {string} - Prompt for Claude API
   */
  createCharacterExtractionPrompt(
    title,
    genre,
    manuscriptContent,
    language,
    characterLevel = "standard"
  ) {
    // Genre inclusion
    const genreText = genre ? `Genre: ${genre}` : '';
    
    // Detail level instructions
    const detailInstructions = {
      basic: `
Extract basic character information including:
- Character name and role
- Basic physical description
- Core personality traits
- Primary relationships
- Main goal or motivation
Focus only on main and important secondary characters (5-8 characters total).`,
      
      standard: `
Extract standard character information including:
- Character name and role
- Physical description (age, appearance, distinctive features)
- Personality traits, strengths, and flaws
- Background and key history
- Relationships with other characters
- Goals, motivations, and conflicts
- Character arc across the story
Include all main characters, important secondary characters, and notable minor characters (8-15 characters total).`,
      
      detailed: `
Extract detailed character information including:
- Character name, role, and significance
- Comprehensive physical description
- Detailed personality profile with traits, strengths, weaknesses, fears, and desires
- Complete background and personal history
- Complex web of relationships with all other characters
- Deep motivations, conflicting desires, and inner struggles
- Complete character arc with transformation points
- Speech patterns and mannerisms
- Symbolic significance in the story
- Key scenes that define the character
Include all characters with any significant role in the story (15+ characters, depending on the manuscript).`
    };
    
    // Select appropriate detail level
    const detailLevel = detailInstructions[characterLevel] || detailInstructions.standard;
    
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

You are a skilled character analyst and story editor helping to extract comprehensive character profiles from an existing manuscript written in ${language}.

Task: Create a characters document for the novel: "${title}"
${genreText}

${detailLevel}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "CHARACTERS:" followed by the novel title
3. For each character, clearly indicate their name in ALL CAPS as a header
4. Use consistent section headers for each aspect of the character (PHYSICAL DESCRIPTION, PERSONALITY, etc.)
5. Format information in clean paragraphs without bullet points
6. Separate each character profile with a row of dashes (-------)
7. Present characters in order of importance to the story
8. Be specific and concrete rather than vague or general
9. Include exact details as described in the manuscript, not generic assumptions

Important: This document will be used for further development and analysis of the novel. Focus on extracting factual information about the characters as they appear in the text. Arrange the information in a logical, organized manner that makes it easy to reference character details.

Aim to capture the essence of each character and their role in the story, while providing enough specific detail to be useful for world-building and narrative analysis.`;
  }
  
  /**
   * Create world extraction prompt
   * @param {string} title - Title of manuscript
   * @param {string} genre - Genre of manuscript
   * @param {string} pov - Point of view
   * @param {string} manuscriptContent - Content of manuscript
   * @param {string} language - Language of manuscript
   * @param {string} worldLevel - Level of detail (basic, standard, detailed)
   * @returns {string} - Prompt for Claude API
   */
  createWorldExtractionPrompt(
    title,
    genre,
    pov,
    manuscriptContent,
    language,
    worldLevel = "standard"
  ) {
    // Genre inclusion
    const genreText = genre ? `Genre: ${genre}` : '';
    
    // POV inclusion
    const povText = pov !== 'undetermined' ? `Point of View: ${pov}` : '';
    
    // Detail level instructions
    const detailInstructions = {
      basic: `
Extract basic world information including:
- Setting overview (time period, general location)
- Social structure basics
- Key locations mentioned
- Basic rules or limitations of the world
Focus on the most important elements needed to understand the story context.`,
      
      standard: `
Extract standard world information including:
- Detailed setting overview (time, place, era)
- Geography and environment
- Social structure and governance
- History relevant to the plot
- Technology or magic systems
- Economy and resources
- Cultural norms and values
- Important locations with descriptions
- Rules and limitations of the world
- Themes and symbols
Include all worldbuilding elements that appear in the manuscript.`,
      
      detailed: `
Extract comprehensive world information including:
- Exhaustive setting details (specific time period, exact locations, climate, ecology)
- Complete geographical layout and environmental features
- Intricate social hierarchies and political structures
- Detailed historical timeline with significant events
- Comprehensive technological or magical systems with rules and limitations
- Economic systems, trade networks, and resource distribution
- Rich cultural details including customs, beliefs, languages, arts
- All locations with complete physical descriptions and significance
- Legal systems, taboos, and societal norms
- Symbolic elements and thematic motifs embedded in the world
- Sensory aspects of the world (sounds, smells, tastes, textures)
Include every worldbuilding detail mentioned directly or implied in the manuscript.`
    };
    
    // Select appropriate detail level
    const detailLevel = detailInstructions[worldLevel] || detailInstructions.standard;
    
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

You are a skilled worldbuilding expert and literary analyst helping to extract a comprehensive world document from an existing manuscript written in ${language}.

Task: Create a world-building document for the novel: "${title}"
${genreText}
${povText}

${detailLevel}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "WORLD: [TITLE]" as the header
3. Organize information in clear thematic sections with ALL CAPS headers
4. Use consistent formatting throughout
5. Separate major sections with a row of dashes (-------)
6. Be specific and detailed rather than vague or general
7. Include only information that is explicitly stated or strongly implied in the manuscript
8. Do not include character profiles (these will be in a separate file)

REQUIRED SECTIONS (at minimum):
- SETTING OVERVIEW
- SOCIAL STRUCTURE
- HISTORY
- TECHNOLOGY AND/OR MAGIC
- ECONOMY
- THEMES AND SYMBOLS
- RULES OF THE WORLD
- KEY LOCATIONS

This document will serve as the definitive reference for the novel's world and setting, to be used for further analysis and development. Extract all relevant world-building information from the manuscript and organize it in a clear, logical manner that makes the world easy to understand.`;
  }
  
  /**
   * Create timeline extraction prompt
   * @param {string} title - Title of manuscript
   * @param {string} genre - Genre of manuscript
   * @param {string} manuscriptContent - Content of manuscript
   * @param {string} language - Language of manuscript
   * @returns {string} - Prompt for Claude API
   */
  createTimelineExtractionPrompt(
    title,
    genre,
    manuscriptContent,
    language
  ) {
    // Genre inclusion
    const genreText = genre ? `Genre: ${genre}` : '';
    
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

You are a skilled story analyst and timeline expert helping to extract a comprehensive chronological timeline from an existing manuscript written in ${language}.

Task: Create a detailed timeline document for the novel: "${title}"
${genreText}

Extract a complete chronological timeline from the manuscript, including:
- All explicit time markers and dates mentioned in the text
- The sequence of events as they occur in the story world (not necessarily as presented in the narrative)
- Important backstory events mentioned or referenced
- Relative time periods (before/after significant events)
- Duration of events when specified
- Time jumps and their approximate lengths
- Flashbacks placed in their proper chronological position
- Future events mentioned or foreshadowed

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "TIMELINE: [TITLE]" as the header
3. Format entries chronologically from earliest to latest
4. Use clear time markers or relative time indicators for each entry
5. Include brief descriptions of events tied to each time marker
6. Group events that happen simultaneously or in the same time period
7. Use consistent formatting throughout
8. Separate major time periods with a row of dashes (-------)
9. Note any ambiguities or uncertainties in the chronology

This timeline will serve as a reference document for the novel's chronological structure, to be used for further analysis and development. Extract all time-related information from the manuscript and organize it in a clear, logical manner that represents the true chronology of events in the story world.`;
  }
  
  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.replace(/(\r\n|\r|\n)/g, ' ').split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Ensure file path is absolute
   * @param {string} filePath - File path (may be relative or absolute)
   * @param {string} basePath - Base path to prepend for relative paths
   * @returns {string} - Absolute file path
   */
  ensureAbsolutePath(filePath, basePath) {
    if (!filePath) return filePath;
    
    // Check if the path is already absolute
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    
    // Make the path absolute by joining with the base path
    return path.join(basePath, filePath);
  }
}

module.exports = ManuscriptExtractor;