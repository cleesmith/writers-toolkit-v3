// kdp-publishing-prep.js
const BaseTool = require('./base-tool');
const path = require('path');
const fs = require('fs/promises');
const fileCache = require('./file-cache');
const appState = require('./state.js');

/**
 * KDP Publishing Prep Tool
 * Analyzes a manuscript and generates KDP publishing elements
 * including title suggestions, descriptions, categories, keywords, and more
 */
class KdpPublishingPrep extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('kdp_publishing_prep', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing KdpPublishingPrep with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const bookType = options.book_type;
    const titleIdeas = options.title_ideas;
    const existingTitle = options.existing_title;
    const targetAudience = options.target_audience;
    const includeHtml = options.include_html;

    let saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    // Check if we have a valid save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute by prepending the project path if needed
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    
    // Log the full paths for debugging
    console.log('Using full paths:');
    console.log(`Manuscript: ${manuscriptFile}`);
    console.log(`Save directory: ${saveDir}`);

    const outputFiles = [];
    
    try {
      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      
      // Get word count for progress reporting
      const wordCount = this.countWords(manuscriptContent);
      this.emitOutput(`Manuscript loaded. Word count: ${wordCount.toLocaleString()}\n`);
      
      // Prepare for analysis
      this.emitOutput(`Analyzing manuscript content for KDP publishing elements...\n`);
      
      // Prepare text sample for analysis (for large manuscripts)
      const textSample = this.prepareTextSample(manuscriptContent);
      
      // Start generating KDP elements
      this.emitOutput(`Generating KDP publishing elements with AI analysis...\n`);
      
      // Create appropriate prompt based on book type
      const prompt = this.createKDPPrompt(textSample, bookType, titleIdeas, existingTitle, targetAudience);
      
      // Count tokens in the prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Calculate token budgets
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Log token information
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
      this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}]\n`);
      this.emitOutput(`Desired output tokens: [${tokenBudgets.desiredOutputTokens}]\n`);
      this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
      this.emitOutput(`Max output tokens: [${tokenBudgets.maxTokens}] tokens\n`);

      // Check if the prompt is too large
      if (tokenBudgets.isPromptTooLarge) {
        this.emitOutput(`Error: prompt is too large to have a ${tokenBudgets.configuredThinkingBudget} thinking budget!\n`);
        this.emitOutput(`Run aborted!\n`);
        throw new Error(`Prompt is too large for ${tokenBudgets.configuredThinkingBudget} thinking budget - run aborted`);
      }
      
      // Call Claude API with streaming
      this.emitOutput(`Sending request to Claude API (streaming)...\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
        
      // Create system prompt to avoid markdown
      // const systemPrompt = "CRITICAL INSTRUCTION: NO Markdown formatting of ANY kind. Never use headers, bullets, or any formatting symbols. Plain text only with standard punctuation.";
      
      // Use the calculated values in the API call
      try {
        await this.claudeService.streamWithThinking(
          prompt,
          {
            max_tokens: tokenBudgets.maxTokens,
            thinking: {
              type: "enabled",
              budget_tokens: tokenBudgets.thinkingBudget
            }
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

      // Remove any markdown formatting
      // cls: also removes HTML so skip this:
      // fullResponse = this.removeMarkdown(fullResponse);

      const elapsed = (Date.now() - startTime) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
      // Count words in response
      const responseWordCount = this.countWords(fullResponse);
      this.emitOutput(`Analysis contains approximately ${responseWordCount} words.\n`);
      
      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      
      // Create base filename
      const baseFilename = `kdp_publishing_prep_${timestamp}`;
      
      // Save the KDP elements to file
      const mainOutputPath = path.join(saveDir, `${baseFilename}.txt`);
      await this.writeOutputFile(fullResponse, saveDir, `${baseFilename}.txt`);
      outputFiles.push(mainOutputPath);
      
      // Save the thinking content if available
      if (thinkingContent) {
        const thinkingPath = path.join(saveDir, `${baseFilename}_thinking.txt`);
        await this.writeOutputFile(thinkingContent, saveDir, `${baseFilename}_thinking.txt`);
        outputFiles.push(thinkingPath);
      }
      
      // If HTML formatting was requested, extract and save the HTML description
      if (includeHtml) {
        try {
          const htmlDescription = this.extractHTMLDescription(fullResponse);
          if (htmlDescription) {
            const htmlPath = path.join(saveDir, `${baseFilename}_description_html.txt`);
            await this.writeOutputFile(htmlDescription, saveDir, `${baseFilename}_description_html.txt`);
            outputFiles.push(htmlPath);
          }
        } catch (error) {
          this.emitOutput(`Warning: Could not extract HTML description. ${error.message}\n`);
        }
      }
      
      this.emitOutput(`\nKDP publishing elements saved to: ${mainOutputPath}\n`);
      this.emitOutput(`\n✅ KDP Publishing Prep complete!\n`);
      
      // Return success
      return {
        success: true,
        outputFiles,
        stats: {
          wordCount,
          responseWordCount,
          promptTokens,
          responseTokens: await this.claudeService.countTokens(fullResponse)
        }
      };
      
    } catch (error) {
      console.error('Error in KdpPublishingPrep:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt for KDP elements generation
   * @param {string} textSample - Manuscript sample text
   * @param {string} bookType - Fiction or non-fiction
   * @param {string} titleIdeas - Optional title ideas from the author
   * @param {string} existingTitle - Optional existing title
   * @param {string} targetAudience - Optional target audience info
   * @returns {string} - Prompt for Claude API
   */
  createKDPPrompt(textSample, bookType, titleIdeas, existingTitle, targetAudience) {
    const titleContext = existingTitle 
      ? `The author has an existing title in mind: "${existingTitle}". Evaluate if this title works well or suggest alternatives.`
      : titleIdeas 
        ? `The author has shared these title ideas or concepts: "${titleIdeas}". Incorporate these if they work well.`
        : "Generate fresh title ideas based on the manuscript content.";
        
    const audienceContext = targetAudience
      ? `The author has identified their target audience as: "${targetAudience}". Keep this in mind when making suggestions.`
      : "";
      
    return `You are a professional publishing consultant helping an author prepare their manuscript for Kindle Direct Publishing (KDP). 

The author has provided their manuscript text and needs your expertise to generate the essential elements for their KDP submission page. Amazon has specific requirements and limitations for each element.

Here's what the author needs:

1. TITLE AND SUBTITLE SUGGESTIONS
   - Provide 3-5 strong title options that reflect the manuscript's content
   - For each title, suggest an optional subtitle if appropriate
   - Maximum combined length: 200 characters
   - Titles should be marketable but authentic to the content
   - ${titleContext}

2. BOOK DESCRIPTION
   - Create a compelling book description (~400-600 words)
   - Character limit: 4,000 characters including spaces
   - This will appear on the Amazon product page
   - Engage readers while accurately representing the content
   - Maintain appropriate tone and style for the genre
   - Do NOT include:
     * Reviews, quotes, or testimonials
     * Requests for customer reviews
     * Advertisements or promotional material
     * Time-sensitive information
     * Availability or pricing information
     * Links to other websites
     * Spoilers
   
3. DESCRIPTION WITH HTML FORMATTING
   - Provide the same description formatted with simple HTML tags
   - Use only these supported tags: <br>, <p></p>, <b></b>, <em></em>, <i></i>, <u></u>, <h4></h4>, <h5></h5>, <h6></h6>, <ol>, <ul>, <li>
   - Character count includes HTML tags (still 4,000 character limit)

4. CATEGORY RECOMMENDATIONS
   - Recommend 3 specific Amazon browse categories for discoverability
   - Include both primary and secondary category paths
   - Follow Amazon's category structure (Fiction/Genre/Subgenre or Nonfiction/Topic/Subtopic)
   - Explain why these categories fit the work

5. KEYWORD SUGGESTIONS
   - Suggest 7 keywords/phrases (50 character limit each)
   - Focus on search terms potential readers might use
   - Optimize for Amazon's search algorithm
   - Avoid:
     * Other authors' names
     * Books by other authors
     * Sales rank terms (e.g., "bestselling")
     * Promotional terms (e.g., "free")
     * Unrelated content

6. CONCISE SYNOPSIS
   - Create a brief overview (150-200 words)
   - Capture the essence without spoilers
   - For fiction: main character, conflict, stakes, setting, tone
   - For non-fiction: core thesis, approach, perspective, value to readers

7. ELEVATOR PITCH
   - Ultra-short compelling hook (1-2 sentences)
   - Captures the book's essence/selling points

8. READING AGE RECOMMENDATION
   - Suggest appropriate age range for readers
   - For children's books: 0-2, 3-5, 6-8, 9-12
   - For YA: 13-17
   - For adult books: appropriate range based on content
   - Consider themes, language, and content maturity

9. GENERAL PUBLISHING RECOMMENDATIONS
   - Specific advice for maximizing this book's success on KDP
   - KDP Select enrollment recommendation (yes/no and why)
   - Any other relevant KDP strategy suggestions

${audienceContext}

Analyze the following manuscript and provide all requested elements in a clearly organized format. For a ${bookType} book:

=== MANUSCRIPT ===
${textSample}
=== END MANUSCRIPT ===`;
  }

  /**
   * Prepare a representative sample of the manuscript for analysis
   * @param {string} fullText - Complete manuscript text
   * @returns {string} - Sample text for analysis
   */
  prepareTextSample(fullText) {
    // Split text into paragraphs
    const paragraphs = fullText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // If text is short enough, use it all
    if (fullText.length < 60000) {
      return fullText;
    }
    
    // Otherwise, create a strategic sample:
    // 1. First 20 paragraphs (beginning)
    // 2. Middle 10 paragraphs (middle of story)
    // 3. Last 20 paragraphs (ending)
    // 4. Additional samples from quarter and three-quarter points
    
    const beginning = paragraphs.slice(0, 20).join('\n\n');
    
    const quarterIndex = Math.floor(paragraphs.length * 0.25);
    const quarterSample = paragraphs.slice(quarterIndex, quarterIndex + 5).join('\n\n');
    
    const middleIndex = Math.floor(paragraphs.length / 2);
    const middle = paragraphs.slice(middleIndex - 5, middleIndex + 5).join('\n\n');
    
    const threeQuarterIndex = Math.floor(paragraphs.length * 0.75);
    const threeQuarterSample = paragraphs.slice(threeQuarterIndex, threeQuarterIndex + 5).join('\n\n');
    
    const ending = paragraphs.slice(-20).join('\n\n');
    
    return `BEGINNING:\n${beginning}\n\nQUARTER POINT:\n${quarterSample}\n\nMIDDLE SECTION:\n${middle}\n\nTHREE-QUARTER POINT:\n${threeQuarterSample}\n\nENDING:\n${ending}`;
  }
  
  /**
   * Extract HTML formatted description from response
   * @param {string} response - Full response from Claude
   * @returns {string} - HTML formatted description
   */
  extractHTMLDescription(response) {
    const regex = /DESCRIPTION WITH HTML FORMATTING:?\s*\n*([\s\S]*?)(?=\n\s*\d+\.|$)/i;
    const match = response.match(regex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    return null;
  }
  
  /**
   * Read an input file
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} - File content
   */
  async readInputFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      this.emitOutput(`Error reading file: ${error.message}\n`);
      throw new Error(`Could not read file ${path.basename(filePath)}: ${error.message}`);
    }
  }
  
  /**
   * Write content to an output file
   * @param {string} content - Content to write
   * @param {string} saveDir - Directory to save to
   * @param {string} filename - Name of the file
   * @returns {Promise<void>}
   */
  async writeOutputFile(content, saveDir, filename) {
    try {
      const filePath = path.join(saveDir, filename);
      await fs.writeFile(filePath, content, 'utf8');
      
      // Add to file cache
      fileCache.addFile({
        path: filePath,
        toolId: this.id,
        type: 'text'
      });
      
      return filePath;
    } catch (error) {
      console.error(`Error writing file ${filename}:`, error);
      this.emitOutput(`Error writing file: ${error.message}\n`);
      throw error;
    }
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
  
  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
}

module.exports = KdpPublishingPrep;
