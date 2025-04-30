// tokens-words-counter.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs').promises;

/**
 * TokensWordsCounter Tool
 * Enhanced to analyze manuscripts, count tokens/words, identify chapters,
 * and suggest optimal chapter groupings for line editing
 */
class TokensWordsCounter extends BaseTool {
  constructor(claudeService, config = {}) {
    super('tokens_words_counter', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    try {
      // Clear the cache for this tool
      const toolName = 'tokens_words_counter';
      fileCache.clear(toolName);

      // Extract options
      let inputFile = options.input_file;

      // Extract and validate the chapter grouping options
      const originalMaxChapters = options.max_chapters_per_group;
      const maxChaptersOption = this.config.options.find(opt => opt.name === 'max_chapters_per_group');
      let maxChaptersPerGroup = originalMaxChapters !== undefined ? originalMaxChapters : maxChaptersOption.default;
      
      // Apply min/max constraints
      const validatedMaxChapters = Math.max(maxChaptersOption.min, Math.min(maxChaptersOption.max, maxChaptersPerGroup));
      // Notify if adjusted
      if (validatedMaxChapters !== maxChaptersPerGroup) {
        this.emitOutput(`Note: Max Chapters Per Group value (${maxChaptersPerGroup}) adjusted to ${validatedMaxChapters} to stay within allowed range (${maxChaptersOption.min}-${maxChaptersOption.max}).\n`);
      }
      maxChaptersPerGroup = validatedMaxChapters;

      // Do the same validation for target tokens
      const originalTargetTokens = options.target_tokens_per_group;
      const targetTokensOption = this.config.options.find(opt => opt.name === 'target_tokens_per_group');
      let targetTokensPerGroup = originalTargetTokens !== undefined ? originalTargetTokens : targetTokensOption.default;
      
      // Apply min/max constraints
      const validatedTargetTokens = Math.max(targetTokensOption.min, Math.min(targetTokensOption.max, targetTokensPerGroup));
      // Notify if adjusted
      if (validatedTargetTokens !== targetTokensPerGroup) {
        this.emitOutput(`Note: Target Tokens Per Group value (${targetTokensPerGroup}) adjusted to ${validatedTargetTokens} to stay within allowed range (${targetTokensOption.min}-${targetTokensOption.max}).\n`);
      }
      targetTokensPerGroup = validatedTargetTokens;
      
      this.emitOutput(`Using values: maxChaptersPerGroup=${maxChaptersPerGroup}, targetTokensPerGroup=${targetTokensPerGroup}\n`);

      // Get Claude API configuration from this.config
      const thinkingBudget = this.config.thinking_budget_tokens;
      const contextWindow = this.config.context_window;
      
      this.emitOutput(`API Configuration: Context Window=${contextWindow}, Thinking Budget=${thinkingBudget}\n`);

      const outputFiles = [];

      // Get the project directory path
      const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
      if (!saveDir) {
        const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                        'Please select a project or specify a save directory.';
        this.emitOutput(errorMsg);
        throw new Error('No save directory available');
      }
    
      // Fix relative paths by resolving them against the project directory
      if (inputFile && !path.isAbsolute(inputFile) && !inputFile.startsWith('~/')) {
        inputFile = path.join(saveDir, inputFile);
        this.emitOutput(`Using file: ${inputFile}\n`);
      }

      // Read the input file
      this.emitOutput(`Reading file: ${inputFile}\n`);
      const text = await this.readInputFile(inputFile);
      
      // Basic token and word counting
      this.emitOutput('Counting words...\n');
      const wordCount = this.countWords(text);
      this.emitOutput(`Word count: ${wordCount.toLocaleString()}\n`);
      
      this.emitOutput('Counting tokens using Claude API (this may take a few seconds)...\n');
      const totalTokens = await this.claudeService.countTokens(text);
      this.emitOutput(`Token count: ${totalTokens.toLocaleString()}\n`);
      
      // Calculate words per token ratio
      const wordsPerToken = totalTokens > 0 ? wordCount / totalTokens : 0;
      
      // Use the shared token budgets calculator from the Claude service
      const tokenBudgets = this.claudeService.calculateTokenBudgets(totalTokens);
      
      // Calculate available tokens for output (after thinking budget)
      const availableOutputTokens = tokenBudgets.availableTokens - thinkingBudget;
      
      this.emitOutput(`Using configured thinking budget: ${thinkingBudget} tokens\n`);
      this.emitOutput(`Available tokens for output: ${availableOutputTokens.toLocaleString()}\n`);
      
      // Enhanced functionality: Identify chapters in the manuscript
      this.emitOutput('\nAnalyzing manuscript for chapters...\n');
      const chapters = this.identifyChapters(text);
      this.emitOutput(`Identified ${chapters.length} chapters\n`);
      
      // Count tokens for each chapter
      this.emitOutput('Analyzing chapter statistics...\n');
      const chaptersWithCounts = await this.countChapterStats(chapters);
      
      // Create optimal chapter groupings for line editing
      this.emitOutput('\nCreating optimal chapter groupings for line editing...\n');
      const groupings = this.createChapterGroupings(
        chaptersWithCounts, 
        maxChaptersPerGroup, 
        targetTokensPerGroup,
        thinkingBudget,
        contextWindow
      );
      
      // Generate the full report
      let reportContent = this.generateReport(
        inputFile, 
        wordCount, 
        totalTokens, 
        wordsPerToken, 
        tokenBudgets, 
        chaptersWithCounts, 
        groupings,
        thinkingBudget,
        contextWindow
      );
      
      // Output the summary report to the console
      this.emitOutput('\n' + reportContent + '\n');
      
      // Save the report to a file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const inputBase = path.basename(inputFile);
      const inputName = path.parse(inputBase).name;
      const outputFileName = `analysis_${inputName}_${timestamp}.txt`;
      this.emitOutput(`Saving report to: ${path.join(saveDir, outputFileName)}\n`);
      
      const outputFile = await this.writeOutputFile(
        reportContent, 
        saveDir, 
        outputFileName
      );
      
      // Add to local tracking array
      outputFiles.push(outputFile);
      
      // Add to the shared file cache
      fileCache.addFile(toolName, outputFile);
      
      this.emitOutput('Analysis complete!\n');
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          wordCount,
          tokenCount: totalTokens,
          wordsPerToken: wordsPerToken.toFixed(2),
          chapterCount: chapters.length,
          groupingCount: groupings.length,
          thinkingBudget,
          availableOutputTokens
        }
      };
    } catch (error) {
      console.error('Error in TokensWordsCounter:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Identifies chapters in the manuscript text
   * @param {string} text - Full manuscript text
   * @returns {Array} Array of chapter objects
   */
  identifyChapters(text) {
    const chapters = [];
    
    // Common chapter patterns
    const patterns = [
      // "Chapter X" or "Chapter X: Title" or "Chapter X - Title"
      /Chapter\s+(\d+|[IVXLCDM]+|[A-Za-z]+)(?:\s*[:|\-|\s]\s*(.+?))?(?=\r?\n)/gi,
      
      // Just the number with a newline (e.g. "1\n" or "I.\n")
      /^(?:\s*)(\d+|[IVXLCDM]+)\.?(?:\s*)(.*?)(?=\r?\n)/gm,
    ];
    
    // Try each pattern to find chapter breaks
    let chapterMatches = [];
    for (const pattern of patterns) {
      let match;
      const regexCopy = new RegExp(pattern); // Create a fresh copy of the regex
      while ((match = regexCopy.exec(text)) !== null) {
        chapterMatches.push({
          chapterNumber: match[1].trim(),
          title: match[2] ? match[2].trim() : '',
          index: match.index
        });
      }
      if (chapterMatches.length > 0) break;
    }
    
    // Sort matches by position in text
    chapterMatches.sort((a, b) => a.index - b.index);
    
    // Extract chapter content
    for (let i = 0; i < chapterMatches.length; i++) {
      const current = chapterMatches[i];
      const next = chapterMatches[i + 1];
      
      const startIndex = current.index;
      const endIndex = next ? next.index : text.length;
      const content = text.substring(startIndex, endIndex);
      
      chapters.push({
        number: i + 1,
        originalNumber: current.chapterNumber,
        title: current.title || '',
        content: content.trim()
      });
    }
    
    // If no chapters were found, treat the entire manuscript as a single chapter
    if (chapters.length === 0) {
      chapters.push({
        number: 1,
        originalNumber: '1',
        title: '',
        content: text.trim()
      });
    }
    
    return chapters;
  }

  /**
   * Counts words and tokens for each chapter
   * @param {Array} chapters - Array of chapter objects
   * @returns {Promise<Array>} Chapters with word and token counts
   */
  async countChapterStats(chapters) {
    const updatedChapters = [];
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      
      // Count words
      const wordCount = this.countWords(chapter.content);
      
      try {
        // Use Claude API to count tokens
        const tokenCount = await this.claudeService.countTokens(chapter.content);
        
        updatedChapters.push({
          ...chapter,
          wordCount,
          tokenCount
        });
      } catch (error) {
        this.emitOutput(`Error analyzing Chapter ${chapter.number}: ${error.message}\n`);
        throw error;
      }
    }
    
    return updatedChapters;
  }

  /**
   * Creates optimal chapter groupings for line editing
   * @param {Array} chapters - Chapters with word and token counts
   * @param {number} maxChaptersPerGroup - Maximum chapters per group
   * @param {number} targetTokensPerGroup - Target tokens per group
   * @param {number} thinkingBudget - Thinking budget from configuration
   * @param {number} contextWindow - Context window size from configuration
   * @returns {Array} Suggested chapter groupings
   */
  createChapterGroupings(chapters, maxChaptersPerGroup, targetTokensPerGroup, thinkingBudget, contextWindow) {
    // Use passed parameters directly - they've been validated in execute()
    const groupings = [];
    let currentGroup = [];
    let currentTokens = 0;
    
    // Define overhead buffer as a percentage of the context window
    const PROMPT_OVERHEAD_PERCENT = 0.025; // 2.5% of context window
    const promptOverheadBuffer = Math.floor(contextWindow * PROMPT_OVERHEAD_PERCENT);
    
    // Calculate maximum tokens per group
    const maxTokensPerGroup = Math.min(
      targetTokensPerGroup,
      contextWindow - thinkingBudget - promptOverheadBuffer
    );
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      
      // Check if we need to start a new group
      if ((currentGroup.length >= maxChaptersPerGroup) || 
          (currentTokens + chapter.tokenCount > maxTokensPerGroup && currentGroup.length > 0)) {
        
        if (currentGroup.length > 0) {
          // Finalize the current group
          const firstChapter = currentGroup[0].number;
          const lastChapter = currentGroup[currentGroup.length - 1].number;
          
          groupings.push({
            range: `${firstChapter}-${lastChapter}`,
            chapters: currentGroup.map(c => c.number),
            totalTokens: currentTokens,
            totalWords: currentGroup.reduce((sum, ch) => sum + ch.wordCount, 0),
            description: this.generateGroupDescription(currentGroup),
            // Calculate context utilization and remaining tokens
            contextUtilization: (currentTokens / (contextWindow - thinkingBudget)) * 100,
            remainingTokens: (contextWindow - thinkingBudget) - currentTokens,
            thinkingBudget: thinkingBudget
          });
          
          // Reset for next group
          currentGroup = [];
          currentTokens = 0;
        }
      }
      
      // Add chapter to current group
      currentGroup.push(chapter);
      currentTokens += chapter.tokenCount;
    }
    
    // Add any remaining chapters as the final group
    if (currentGroup.length > 0) {
      const firstChapter = currentGroup[0].number;
      const lastChapter = currentGroup[currentGroup.length - 1].number;
      
      groupings.push({
        range: `${firstChapter}-${lastChapter}`,
        chapters: currentGroup.map(c => c.number),
        totalTokens: currentTokens,
        totalWords: currentGroup.reduce((sum, ch) => sum + ch.wordCount, 0),
        description: this.generateGroupDescription(currentGroup),
        // Calculate context utilization and remaining tokens
        contextUtilization: (currentTokens / (contextWindow - thinkingBudget)) * 100,
        remainingTokens: (contextWindow - thinkingBudget) - currentTokens,
        thinkingBudget: thinkingBudget
      });
    }
    
    return groupings;
  }

  /**
   * Generates a description for a group of chapters
   * @param {Array} chapters - Chapter objects in the group
   * @returns {string} Group description
   */
  generateGroupDescription(chapters) {
    if (chapters.length === 1) {
      const ch = chapters[0];
      return `Chapter ${ch.number}${ch.title ? `: ${ch.title}` : ''} (${ch.wordCount.toLocaleString()} words, ${ch.tokenCount.toLocaleString()} tokens)`;
    } else {
      const firstCh = chapters[0];
      const lastCh = chapters[chapters.length - 1];
      const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      const totalTokens = chapters.reduce((sum, ch) => sum + ch.tokenCount, 0);
      return `Chapters ${firstCh.number}-${lastCh.number} (${totalWords.toLocaleString()} words, ${totalTokens.toLocaleString()} tokens)`;
    }
  }

  /**
   * Creates a visual representation of context window utilization with high contrast
   * @param {number} usedTokens - Tokens used by chapters
   * @param {number} thinkingBudget - Tokens reserved for thinking (from config)
   * @param {number} contextWindow - Total context window size (from config)
   * @returns {string} ASCII visualization
   */
  generateContextVisualization(usedTokens, thinkingBudget, contextWindow) {
    const totalWidth = 50; // Width of visualization in characters
    
    // Calculate proportions
    const usedWidth = Math.round((usedTokens / contextWindow) * totalWidth);
    const thinkingWidth = Math.round((thinkingBudget / contextWindow) * totalWidth);
    const remainingWidth = totalWidth - usedWidth - thinkingWidth;
    
    // Create the visualization with high contrast characters
    const usedBar = '##'.repeat(Math.ceil(usedWidth/2));      // ## for chapters
    const thinkingBar = '=='.repeat(Math.ceil(thinkingWidth/2)); // == for thinking
    const remainingBar = '..'.repeat(Math.ceil(remainingWidth/2)); // .. for available
    
    // Calculate the available tokens for line editing
    const availableForOutput = contextWindow - usedTokens - thinkingBudget;
    
    // Assemble the visualization with legend and emphasis on available tokens
    return `Context window utilization:
[${usedBar}${thinkingBar}${remainingBar}] ${Math.round((usedTokens + thinkingBudget) / contextWindow * 100)}% used
 ${usedBar ? '## Chapters' : ''} ${thinkingBar ? `== Thinking (${thinkingBudget.toLocaleString()})` : ''} ${remainingBar ? '.. Available for Line Editing' : ''}
 
 AVAILABLE FOR LINE EDITING: ${availableForOutput.toLocaleString()} tokens`;
  }

  /**
   * Generate the final analysis report
   * @param {string} filePath - Path to the input file
   * @param {number} wordCount - Total word count
   * @param {number} totalTokens - Total token count
   * @param {number} wordsPerToken - Words per token ratio
   * @param {Object} tokenBudgets - Token budget calculations
   * @param {Array} chapters - Analyzed chapters
   * @param {Array} groupings - Chapter groupings
   * @param {number} thinkingBudget - Thinking budget from configuration
   * @param {number} contextWindow - Context window size from configuration
   * @returns {string} Formatted report
   */
  generateReport(filePath, wordCount, totalTokens, wordsPerToken, tokenBudgets, chapters, groupings, thinkingBudget, contextWindow) {
    const availableOutputTokens = tokenBudgets.availableTokens - thinkingBudget;
    
    // Calculate recommended output token size for line editing (15% of available, max 20K)
    const recommendedLineEditingSize = Math.min(20000, Math.floor(availableOutputTokens * 0.15));
    
    let report = `MANUSCRIPT ANALYSIS REPORT
=========================

File: ${filePath}
Generated on: ${new Date().toLocaleString()}

SUMMARY
-------
Total Chapters: ${chapters.length}
Total Words: ${wordCount.toLocaleString()}
Total Tokens: ${totalTokens.toLocaleString()}
Words per token ratio: ${wordsPerToken.toFixed(2)}

LINE EDITING CONFIGURATION
-------------------------
Context window: ${contextWindow.toLocaleString()} tokens
Thinking budget (preserved): ${thinkingBudget.toLocaleString()} tokens (for deep manuscript analysis)
Manuscript size: ${totalTokens.toLocaleString()} tokens
REMAINING FOR LINE EDITING: ${availableOutputTokens.toLocaleString()} tokens

RECOMMENDED LINE EDITING OUTPUT SIZE: ${recommendedLineEditingSize.toLocaleString()} tokens
(This is the suggested token limit for Claude's responses when doing line editing)

${this.generateContextVisualization(totalTokens, thinkingBudget, contextWindow)}

CHAPTER BREAKDOWN
----------------
`;

    chapters.forEach(ch => {
      report += `Chapter ${ch.number}${ch.title ? `: ${ch.title}` : ''} - ${ch.wordCount.toLocaleString()} words, ${ch.tokenCount.toLocaleString()} tokens\n`;
    });

    report += `\nSUGGESTED GROUPINGS FOR LINE EDITING
---------------------------------
These groupings are optimized for Claude API with a preserved ${thinkingBudget.toLocaleString()} token thinking budget.
Each group is designed to fit well within Claude's token limits while maximizing available tokens for detailed line editing.

`;

    // Enhanced group formatting with focus on line editing capacity
    groupings.forEach((group, idx) => {
      const totalWords = group.totalWords.toLocaleString();
      const totalTokens = group.totalTokens.toLocaleString();
      const contextPercent = ((group.totalTokens / (contextWindow - thinkingBudget)) * 100).toFixed(1);
      const remainingTokens = group.remainingTokens.toLocaleString();
      
      // Calculate a line editing capacity score (0-100%)
      // Higher score = more tokens available for detailed editing feedback
      const lineEditingCapacity = Math.min(100, Math.round((group.remainingTokens / 100000) * 100));
      
      report += `GROUP ${idx + 1}: Chapters ${group.range}  is `;
      report += `${totalWords} words or ${totalTokens} AI tokens\n`;
      report += `LINE EDITING CAPACITY: ${lineEditingCapacity}% (${remainingTokens} tokens available for detailed feedback)\n`;
      report += `${contextPercent}% of available context used\n`;
      report += `${this.generateContextVisualization(group.totalTokens, thinkingBudget, contextWindow)}\n\n`;
    });

    report += `\nLINE EDITING RECOMMENDATIONS
-------------------------
1. For best results, preserve the ${thinkingBudget.toLocaleString()} token thinking budget for Claude to thoroughly analyze your writing
2. Each group above can be processed as a single unit for line editing
3. The "LINE EDITING CAPACITY" percentage provides a quick reference for how much detailed feedback Claude can provide:
   - 90-100%: Excellent capacity for very detailed line-by-line feedback
   - 70-89%: Good capacity for comprehensive editing suggestions
   - 50-69%: Moderate capacity for targeted editing of key passages
   - Below 50%: Limited capacity, focus on most critical sections only

4. When submitting chapters for line editing:
   - Include specific instructions about style, clarity, word choice, and sentence structure
   - Consider breaking larger chapters into smaller segments if you need more detailed feedback
   - Request sample rewrites of problematic passages to maximize the value of remaining tokens

5. IMPORTANT: The large token numbers (150K+) represent the theoretical maximum space for Claude's response, 
   but actual effective feedback is typically 10-20K tokens. Higher remaining tokens simply ensure Claude 
   has plenty of room to provide thorough line edits without hitting token limits.
`;

    return report;
  }
}

module.exports = TokensWordsCounter;