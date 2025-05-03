// tokens-words-counter.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs').promises;

/**
 * TokensWordsCounter Tool
 * Enhanced to analyze manuscripts, count tokens/words, and identify chapters
 * with visualizations for each chapter's token usage
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
    if (!this.claudeService) {
      throw new Error('Claude service not initialized for TokensWordsCounter');
    }

    try {
      // Clear the cache for this tool
      const toolName = 'tokens_words_counter';
      fileCache.clear(toolName);

      // Extract options
      let inputFile = options.input_file;

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
      }

      // Read the input file
      this.emitOutput(`Reading file: ${inputFile}\n`);
      const text = await this.readInputFile(inputFile);
      
      // Basic token and word counting
      this.emitOutput('Counting words...\n');
      const wordCount = this.countWords(text);
      this.emitOutput(`Word count: ${wordCount.toLocaleString()}\n`);
      
      const totalTokens = await this.claudeService.countTokens(text);
      this.emitOutput(`Token count: ${totalTokens.toLocaleString()}\n`);

      const wordsPerToken = totalTokens > 0 ? wordCount / totalTokens : 0;
      
      if (totalTokens >= contextWindow) {
        this.emitOutput(`\nDocument is too large to anaylze chapters: ${totalTokens} tokens is greater than ${contextWindow} tokens\n`);
        const availableOutputTokens = 0;
        return {
          success: false,
          outputFiles,
          stats: {
            wordCount,
            tokenCount: totalTokens,
            wordsPerToken: wordsPerToken.toFixed(2),
            chapterCount: null,
            thinkingBudget,
            availableOutputTokens
          }
        };
      }
      
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
      
      // Generate the full report
      let reportContent = this.generateReport(
        inputFile, 
        wordCount, 
        totalTokens, 
        wordsPerToken, 
        tokenBudgets, 
        chaptersWithCounts,
        thinkingBudget,
        contextWindow
      );
      
      // Output the summary report to the console
      this.emitOutput('\n' + reportContent + '\n');
      
      // Save the report to a file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const inputBase = path.basename(inputFile);
      const inputName = path.parse(inputBase).name;
      const outputFileName = `tokens_words_counter_${inputName}_${timestamp}.txt`;
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
          thinkingBudget,
          availableOutputTokens
        }
      };
    } catch (error) {
      console.error('Error in TokensWordsCounter:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      if (!this.claudeService) {
        console.error('claudeService is null');
      }
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
    
    // Helper function to pause execution
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Use a very short delay of 5ms between API calls
    const delayMs = 5;
    
    // Get configuration values we need for visualization
    const thinkingBudget = this.config.thinking_budget_tokens;
    const contextWindow = this.config.context_window;
    
    // Inform user about processing
    if (chapters.length > 1) {
      this.emitOutput(`Processing ${chapters.length} chapters with minimal delay between requests.\n\n`);
    }
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      
      // Count words
      const wordCount = this.countWords(chapter.content);
      
      try {
        // Use Claude API to count tokens
        const tokenCount = await this.claudeService.countTokens(chapter.content);
        
        // Calculate remaining tokens for this chapter
        const remainingTokens = contextWindow - tokenCount - thinkingBudget;
        
        // Calculate tool capacity score (0-100%)
        const toolCapacity = Math.min(100, Math.round((remainingTokens / 100000) * 100));
        
        // Calculate context utilization percentage
        const contextPercent = ((tokenCount / contextWindow) * 100).toFixed(1);
        
        // Add the chapter with counts to our results
        updatedChapters.push({
          ...chapter,
          wordCount,
          tokenCount
        });
        
        // Output the chapter analysis immediately
        // this.emitOutput(`\nChapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''} - ${wordCount.toLocaleString()} words, ${tokenCount.toLocaleString()} tokens, available for Tool: ${remainingTokens.toLocaleString()} tokens\n`);
        // this.emitOutput(`${this.generateContextVisualization(tokenCount, thinkingBudget, contextWindow)}\n\n`);
        
        // Add minimal delay between API calls (except for the last chapter)
        if (i < chapters.length - 1) {
          await sleep(delayMs);
        }
      } catch (error) {
        this.emitOutput(`Error analyzing Chapter ${chapter.number}: ${error.message}\n`);
        throw error;
      }
    }
    
    return updatedChapters;
  }
  
  /**
   * Creates a visual representation of context window utilization with emojis
   * @param {number} usedTokens - Tokens used by chapter
   * @param {number} thinkingBudget - Tokens reserved for thinking (from config)
   * @param {number} contextWindow - Total context window size (from config)
   * @returns {string} Visualization with emojis
   */
  generateContextVisualization(usedTokens, thinkingBudget, contextWindow) {
    try {
      const totalWidth = 50; // Width of visualization in characters
      // Calculate proportions
      const usedWidth = Math.round((usedTokens / contextWindow) * totalWidth);
      const thinkingWidth = Math.round((thinkingBudget / contextWindow) * totalWidth);
      const remainingWidth = totalWidth - usedWidth - thinkingWidth;
      // Create the visualization with emojis
      let usedBar = '📝'.repeat(Math.ceil(usedWidth/2)); // for chapters
      if (usedBar.length <= 0) {
        usedBar = '📝';
      }
      const thinkingBar = '🧠'.repeat(Math.ceil(thinkingWidth/2)); // for thinking
      const remainingBar = '🤖'.repeat(Math.ceil(remainingWidth/2)); // for available
      // Assemble the visualization
      return `visualize Context Window usage:\n${usedBar}${thinkingBar}${remainingBar} ${Math.round((usedTokens + thinkingBudget) / contextWindow * 100)}% used\n📝 chapters | 🧠 thinking (${thinkingBudget.toLocaleString()}) | 🤖 available for Tool usage`;
    } catch (error) {
      console.error('Error in TokensWordsCounter:', error);
      this.emitOutput(`\nError: ${error}\n`);
      throw error;
    }

  }

  /**
   * Generate the final analysis report
   * @param {string} filePath - Path to the input file
   * @param {number} wordCount - Total word count
   * @param {number} totalTokens - Total token count
   * @param {number} wordsPerToken - Words per token ratio
   * @param {Object} tokenBudgets - Token budget calculations
   * @param {Array} chapters - Analyzed chapters
   * @param {number} thinkingBudget - Thinking budget from configuration
   * @param {number} contextWindow - Context window size from configuration
   * @returns {string} Formatted report
   */
  generateReport(filePath, wordCount, totalTokens, wordsPerToken, tokenBudgets, chapters, thinkingBudget, contextWindow) {
    const availableOutputTokens = tokenBudgets.availableTokens - thinkingBudget;
    
    let report = `MANUSCRIPT ANALYSIS REPORT  ${new Date().toLocaleString()}

File: ${filePath}


-------
SUMMARY

Total Chapters: ${chapters.length}
Total Human Words: ${wordCount.toLocaleString()}
Total AI Tokens: ${totalTokens.toLocaleString()}
Words per token ratio: ${wordsPerToken.toFixed(2)}

-------------------
TOOL CONFIGURATION:

Context window: ${contextWindow.toLocaleString()} tokens
Thinking budget (preserved): ${thinkingBudget.toLocaleString()} tokens (for deep manuscript analysis)
Manuscript size: ${totalTokens.toLocaleString()} tokens
Remaining For Tool: ${availableOutputTokens.toLocaleString()} tokens

${this.generateContextVisualization(totalTokens, thinkingBudget, contextWindow)}


------------------
CHAPTER BREAKDOWN:

`;

    // Add detailed analysis for each chapter with visualization
    chapters.forEach(ch => {
      // Calculate remaining tokens for this chapter
      const remainingTokens = contextWindow - ch.tokenCount - thinkingBudget;
      
      // Calculate tool capacity score (0-100%)
      const toolCapacity = Math.min(100, Math.round((remainingTokens / 100000) * 100));
      
      // Calculate context utilization percentage
      const contextPercent = ((ch.tokenCount / contextWindow) * 100).toFixed(1);
      
      report += `\nChapter ${ch.number}${ch.title ? `: ${ch.title}` : ''} - ${ch.wordCount.toLocaleString()} words, ${ch.tokenCount.toLocaleString()} tokens, available for Tool: ${remainingTokens.toLocaleString()} tokens\n`;
      report += `${this.generateContextVisualization(ch.tokenCount, thinkingBudget, contextWindow)}\n\n`;
    });

    report += `\n
--------------------
TOOL RECOMMENDATIONS

1. For best results, preserve the ${thinkingBudget.toLocaleString()} token thinking budget for Claude to thoroughly analyze your writing
2. Each chapter can be processed individually for detailed analysis
3. The "TOOL CAPACITY" percentage provides a quick reference for how much detailed feedback Claude can provide:
   - 90-100%: Excellent capacity for very detailed feedback
   - 70-89%: Good capacity for comprehensive suggestions
   - 50-69%: Moderate capacity for targeted analysis of key passages
   - Below 50%: Limited capacity, focus on most critical sections only

4. When submitting chapters for processing:
   - Include specific instructions about style, clarity, word choice, and sentence structure
   - Consider breaking larger chapters into smaller segments if you need more detailed feedback
   - Request sample rewrites of problematic passages to maximize the value of remaining tokens

5. IMPORTANT: The large token numbers (150K+) represent the theoretical maximum space for Claude's response, 
   but actual effective feedback is typically 10-20K tokens. Higher remaining tokens simply ensure Claude 
   has plenty of room to provide thorough analysis without hitting token limits.
`;

    return report;
  }
}

module.exports = TokensWordsCounter;
