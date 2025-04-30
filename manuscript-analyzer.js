// Manuscript Analyzer with Claude API Token Counting
// This tool analyzes manuscripts to identify chapters and create optimal groupings for line editing

const fs = require('fs');
const path = require('path');

/**
 * Main function to analyze a manuscript file
 * @param {string} filePath - Path to the manuscript text file
 * @param {Object} claudeService - Claude API service instance
 * @param {number} maxChaptersPerGroup - Maximum chapters per group (default: 5)
 * @param {number} targetTokensPerGroup - Target tokens per group (default: 20000)
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeManuscript(filePath, claudeService, maxChaptersPerGroup = 5, targetTokensPerGroup = 20000) {
    try {
        // Verify inputs
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`Manuscript file not found: ${filePath}`);
        }
        
        if (!claudeService) {
            throw new Error('Claude API service is required');
        }
        
        console.log(`Analyzing manuscript: ${filePath}`);
        
        // Read the manuscript file
        const text = fs.readFileSync(filePath, 'utf8');
        
        // Identify chapters in the manuscript
        const chapters = identifyChapters(text);
        console.log(`Identified ${chapters.length} chapters`);
        
        // Count words and tokens for each chapter
        const chaptersWithCounts = await countWordsAndTokens(chapters, claudeService);
        
        // Create suggested groupings
        const groupings = createChapterGroupings(chaptersWithCounts, maxChaptersPerGroup, targetTokensPerGroup);
        
        // Calculate totals
        const totalWords = chaptersWithCounts.reduce((sum, ch) => sum + ch.wordCount, 0);
        const totalTokens = chaptersWithCounts.reduce((sum, ch) => sum + ch.tokenCount, 0);
        const wordsPerToken = totalWords / totalTokens;
        
        // Return results
        return {
            totalChapters: chapters.length,
            totalWords,
            totalTokens,
            wordsPerToken: wordsPerToken.toFixed(2),
            chapters: chaptersWithCounts,
            suggestedGroupings: groupings
        };
    } catch (error) {
        console.error('Error analyzing manuscript:', error);
        throw error;
    }
}

/**
 * Identifies chapters in the manuscript text
 * @param {string} text - Full manuscript text
 * @returns {Array} Array of chapter objects
 */
function identifyChapters(text) {
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
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
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
 * @param {Object} claudeService - Claude API service
 * @returns {Promise<Array>} Chapters with word and token counts
 */
async function countWordsAndTokens(chapters, claudeService) {
    const updatedChapters = [];
    
    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        
        // Count words
        const words = chapter.content.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        
        try {
            // Use Claude API to count tokens
            console.log(`Counting tokens for Chapter ${chapter.number}...`);
            const tokenCount = await claudeService.countTokens(chapter.content);
            console.log(`Chapter ${chapter.number}: ${wordCount} words, ${tokenCount} tokens`);
            
            updatedChapters.push({
                ...chapter,
                wordCount,
                tokenCount
            });
        } catch (error) {
            console.error(`Error counting tokens for Chapter ${chapter.number}:`, error);
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
 * @returns {Array} Suggested chapter groupings
 */
function createChapterGroupings(chapters, maxChaptersPerGroup, targetTokensPerGroup) {
    const groupings = [];
    let currentGroup = [];
    let currentTokens = 0;
    
    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        
        // Check if we need to start a new group
        if ((currentGroup.length >= maxChaptersPerGroup) || 
            (currentTokens >= targetTokensPerGroup && currentGroup.length > 0)) {
            
            if (currentGroup.length > 0) {
                // Finalize the current group
                const firstChapter = currentGroup[0].number;
                const lastChapter = currentGroup[currentGroup.length - 1].number;
                
                groupings.push({
                    range: `${firstChapter}-${lastChapter}`,
                    chapters: currentGroup.map(c => c.number),
                    totalTokens: currentTokens,
                    totalWords: currentGroup.reduce((sum, ch) => sum + ch.wordCount, 0),
                    description: generateGroupDescription(currentGroup)
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
            description: generateGroupDescription(currentGroup)
        });
    }
    
    return groupings;
}

/**
 * Generates a description for a group of chapters
 * @param {Array} chapters - Chapter objects in the group
 * @returns {string} Group description
 */
function generateGroupDescription(chapters) {
    if (chapters.length === 1) {
        const ch = chapters[0];
        return `Chapter ${ch.number}${ch.title ? `: ${ch.title}` : ''} (${ch.wordCount} words, ${ch.tokenCount} tokens)`;
    } else {
        const firstCh = chapters[0];
        const lastCh = chapters[chapters.length - 1];
        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        const totalTokens = chapters.reduce((sum, ch) => sum + ch.tokenCount, 0);
        return `Chapters ${firstCh.number}-${lastCh.number} (${totalWords} words, ${totalTokens} tokens)`;
    }
}

/**
 * Displays analysis results in a readable format
 * @param {Object} results - Analysis results
 */
function displayResults(results) {
    console.log(`\nManuscript Analysis:`);
    console.log(`Total Chapters: ${results.totalChapters}`);
    console.log(`Total Words: ${results.totalWords}`);
    console.log(`Total Tokens: ${results.totalTokens}`);
    console.log(`Words per token ratio: ${results.wordsPerToken}`);
    
    console.log(`\nChapters:`);
    results.chapters.forEach(ch => {
        console.log(`Chapter ${ch.number}${ch.title ? `: ${ch.title}` : ''} - ${ch.wordCount} words, ${ch.tokenCount} tokens`);
    });
    
    console.log(`\nSuggested Groupings for Line Editing:`);
    results.suggestedGroupings.forEach((group, idx) => {
        console.log(`Group ${idx + 1}: ${group.range} - ${group.totalTokens} tokens`);
        console.log(`  ${group.description}`);
    });
}

// Export functions for modules
module.exports = {
    analyzeManuscript,
    identifyChapters,
    countWordsAndTokens,
    createChapterGroupings,
    displayResults
};

// Command-line usage
if (require.main === module) {
    const manuscriptPath = process.argv[2];
    if (!manuscriptPath) {
        console.error('Error: Please provide a manuscript file path');
        console.error('Usage: node manuscript-analyzer.js path/to/manuscript.txt');
        process.exit(1);
    }
    
    // Import the Claude API Service
    const ClaudeAPIService = require('./client');
    
    // Create Claude service with the required configuration
    // Using the same configuration seen in your screenshot and error messages
    const claudeService = new ClaudeAPIService({
        max_retries: 3,
        request_timeout: 120,
        context_window: 200000,
        thinking_budget_tokens: 32000,
        betas_max_tokens: 128000,
        desired_output_tokens: 8000,
        model_name: 'claude-3-7-sonnet-20250219',
        // The 'extended_thinking' value was causing problems in your API call
        // Let's use an empty string to avoid issues
        betas: 'output-128k-2025-02-19',
        max_thinking_budget: 32000,
        max_tokens: 128000
    });
    
    // Run analysis
    analyzeManuscript(manuscriptPath, claudeService)
        .then(results => {
            displayResults(results);
            console.log('Analysis complete!');
        })
        .catch(err => {
            console.error('Analysis failed:', err.message);
            process.exit(1);
        });
}
