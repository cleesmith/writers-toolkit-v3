#!/usr/bin/env node
// standalone cli version of: narrative-integrity.js tool
// consistency-checker.js
//
// Description: Checks a manuscript for consistency against a world document using the Claude API.
//              Supports different types of consistency checks: world, internal, development, unresolved.
//
// Usage: 
// node consistency-checker.js --world_file world.txt --manuscript_file manuscript.txt [--outline_file outline.txt] [--check_type world|internal|development|unresolved]

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { Anthropic } = require('@anthropic-ai/sdk');
const { DateTime } = require('luxon');

/**
 * Remove Markdown formatting from text
 * @param {string} text - Text with Markdown formatting
 * @returns {string} - Plain text without Markdown
 */
function removeMarkdown(text) {
  const options = {
    listUnicodeChar: false,
    stripListLeaders: true,
    gfm: true,
    useImgAltText: true,
    preserveBlockSpacing: true
  };
  
  let output = text || '';
  // Remove horizontal rules
  output = output.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '');
  try {
    // Handle list markers
    if (options.stripListLeaders) {
      if (options.listUnicodeChar) {
        output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, options.listUnicodeChar + ' $1');
      } else {
        output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, '$1');
      }
    }
    // Handle GitHub Flavored Markdown features
    if (options.gfm) {
      output = output
        .replace(/\n={2,}/g, '\n')
        .replace(/~{3}.*\n/g, '')
        // Improved code block handling
        .replace(/(`{3,})([\s\S]*?)\1/gm, function(match, p1, p2) {
          return p2.trim() + '%%CODEBLOCK_END%%\n';
        })
        .replace(/~~/g, '');
    }
    // Process main markdown elements
    output = output
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove setext headers
      .replace(/^[=\-]{2,}\s*$/g, '')
      // Remove footnotes
      .replace(/\[\^.+?\](\: .*?$)?/g, '')
      .replace(/\s{0,2}\[.*?\]: .*?$/g, '')
      // Handle images and links
      .replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, options.useImgAltText ? '$1' : '')
      .replace(/\[(.*?)\][\[\(].*?[\]\)]/g, '$1')
      // Better blockquote handling with spacing
      .replace(/^\s*>+\s?/gm, function(match) {
        return options.preserveBlockSpacing ? '\n' : '';
      })
      // Remove list markers again (thorough cleanup)
      .replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, '$1')
      // Remove reference links
      .replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, '')
      // Remove headers
      .replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm, '$1$2$3')
      // Remove emphasis
      .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
      .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
      // Remove code markers
      .replace(/`(.+?)`/g, '$1');
    // Final cleanup and spacing
    output = output
      // Replace code block markers with proper spacing
      .replace(/%%CODEBLOCK_END%%\n/g, '\n\n\n')
      // Normalize multiple newlines while preserving block spacing
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/\n{3}/g, '\n\n')
      // Clean up any trailing whitespace
      .trim();
  } catch(e) {
    console.error('Error removing Markdown:', e);
    return text;
  }
  return output;
}

/**
 * Parse command line arguments
 */
function parseArguments() {
  program
    .description('Check manuscript consistency against outline, world, and manuscript documents using Claude thinking API.')
    .requiredOption('--world_file <filepath>', 'File containing the world details (required)')
    .requiredOption('--manuscript_file <filepath>', 'File containing the manuscript to check (required)')
    .option('--outline_file <filepath>', 'File containing the story outline (optional)')
    .option('--check_type <type>', 'Type of consistency check to perform', /^(world|internal|development|unresolved|all)$/i, 'unresolved')
    .option('--check_description <description>', 'Optional description to include in output filenames', '')
    .option('--context_window <number>', 'Context window for Claude 3.7 Sonnet', '200000')
    .option('--betas_max_tokens <number>', 'Maximum tokens for AI output', '128000')
    .option('--thinking_budget_tokens <number>', 'Maximum tokens for AI thinking', '32000')
    .option('--desired_output_tokens <number>', 'User desired number of tokens to generate before stopping output', '12000')
    .option('--request_timeout <number>', 'Maximum timeout for each *streamed chunk* of output (seconds)', '300')
    .option('--max_thinking_budget <number>', 'Absolute cap for thinking tokens', '32000')
    .option('--save_dir <directory>', 'Directory to save consistency reports', '.')
    .option('--skip_thinking', 'Skip saving the AI thinking process (smaller output files)')
    .addHelpText('after', `
Example usages:
  node consistency-checker.js --world_file world.txt --manuscript_file manuscript.txt --outline_file outline.txt --check_type all
  node consistency-checker.js --world_file world.txt --manuscript_file manuscript.txt
  node consistency-checker.js --world_file world.txt --manuscript_file manuscript.txt --outline_file outline.txt --check_type internal
  node consistency-checker.js --world_file world.txt --manuscript_file manuscript.txt --check_type development --save_dir reports
    `)
    .parse(process.argv);

  const opts = program.opts();
  
  // Convert numeric arguments from strings to numbers
  opts.context_window = parseInt(opts.context_window, 10);
  opts.betas_max_tokens = parseInt(opts.betas_max_tokens, 10);
  opts.thinking_budget_tokens = parseInt(opts.thinking_budget_tokens, 10);
  opts.desired_output_tokens = parseInt(opts.desired_output_tokens, 10);
  opts.request_timeout = parseInt(opts.request_timeout, 10);
  opts.max_thinking_budget = parseInt(opts.max_thinking_budget, 10);
  
  return opts;
}

/**
 * Read file content with error handling
 * @param {string} filePath - Path to the file
 * @param {string} fileType - Type of file (for error messages)
 * @returns {string} - File content
 */
function readFile(filePath, fileType) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`Loaded ${fileType} from: ${filePath}`);
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Error: ${fileType.charAt(0).toUpperCase() + fileType.slice(1)} file not found: ${filePath}`);
      if (fileType === 'world' || fileType === 'manuscript') { // Required files
        console.error(`Please provide a valid ${fileType} file.`);
        process.exit(1);
      } else { // Optional files
        console.log(`Continuing without ${fileType} information.`);
        return "";
      }
    } else {
      console.error(`Error: Could not read ${fileType} file: ${error.message}`);
      if (fileType === 'world' || fileType === 'manuscript') { // Required files
        process.exit(1);
      } else { // Optional files
        console.log(`Continuing without ${fileType} information.`);
        return "";
      }
    }
  }
}

/**
 * Count words in text
 * @param {string} text - Text to count words in
 * @returns {number} - Word count
 */
function countWords(text) {
  return text.replace(/(\r\n|\r|\n)/g, ' ').split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Calculate token budgets and validate prompt size
 * @param {number} promptTokens - Number of tokens in the prompt
 * @param {object} config - Configuration settings
 * @returns {Object} - Calculated token budgets and limits
 */
function calculateTokenBudgets(promptTokens, config) {
  // Use configuration settings directly
  const contextWindow = config.context_window;
  const desiredOutputTokens = config.desired_output_tokens;
  const configuredThinkingBudget = config.thinking_budget_tokens;
  const betasMaxTokens = config.betas_max_tokens;
  const maxThinkingBudget = config.max_thinking_budget;
  
  // Calculate available tokens after prompt
  const availableTokens = contextWindow - promptTokens;
  
  // For API call, max_tokens must respect the API limit
  const maxTokens = Math.min(availableTokens, betasMaxTokens);
  
  // Thinking budget must be LESS than max_tokens to leave room for visible output
  let thinkingBudget = maxTokens - desiredOutputTokens;
  
  // Cap thinking budget if it's too large - use configurable limit
  const capThinkingBudget = thinkingBudget > maxThinkingBudget;
  if (capThinkingBudget) {
    thinkingBudget = maxThinkingBudget;
  }
  
  // Check if prompt is too large for the configured thinking budget
  const isPromptTooLarge = thinkingBudget < configuredThinkingBudget;
  
  // Return all calculated values for use in API calls and logging
  return {
    contextWindow,
    promptTokens,
    availableTokens,
    maxTokens,
    thinkingBudget,
    desiredOutputTokens,
    betasMaxTokens,
    configuredThinkingBudget,
    capThinkingBudget,
    isPromptTooLarge
  };
}

/**
 * Create prompt for the specified check type
 * @param {string} checkType - Type of consistency check
 * @param {string} outlineContent - Outline content
 * @param {string} worldContent - World content
 * @param {string} manuscriptContent - Manuscript content
 * @returns {string} - Prompt for the AI
 */
function createPrompt(checkType, outlineContent, worldContent, manuscriptContent) {
  const noMarkdown = "IMPORTANT: - NO Markdown formatting";
  
  const prompts = {
    "world": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== WORLD ===
${worldContent}
=== END WORLD ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor with exceptional attention to detail.
Using the WORLD document as the established source of truth, analyze
the MANUSCRIPT for any inconsistencies or contradictions with the
established facts. Focus on:

1. CHARACTER CONSISTENCY:
   - Are characters acting in ways that match their established
     personality traits?
   - Does dialogue reflect their documented speech patterns and
     knowledge level?
   - Are relationships developing consistently with established
     dynamics?
   - Are physical descriptions matching those in the WORLD document?

2. SETTING & WORLD CONSISTENCY:
   - Are locations described consistently with their established
     features?
   - Does the manuscript respect the established rules of the world?

3. TIMELINE COHERENCE:
   - Does the manuscript respect the established historical events and
     their sequence?
   - Are there any temporal contradictions with established dates?
   - Is character knowledge appropriate for their place in the
     timeline?
   - Are seasonal elements consistent with the story's temporal
     placement?

4. THEMATIC INTEGRITY:
   - Are the established themes being consistently developed?
   - Are symbolic elements used consistently with their established meanings?

For each inconsistency, provide:
- The specific element in the manuscript that contradicts the WORLD
- The established fact in the WORLD it contradicts
- The location in the manuscript where this occurs using verbatim text
- A suggested correction that would maintain narrative integrity

Use the extensive thinking space to thoroughly cross-reference the
manuscript against the story's world before identifying issues.
`,

    "internal": `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor focusing on internal narrative
consistency. Analyze the MANUSCRIPT to identify elements that are
internally inconsistent or contradictory, regardless of the
established story world. Focus on:

1. NARRATIVE CONTINUITY:
   - Events that contradict earlier established facts within the
     manuscript itself
   - Description inconsistencies (characters, objects, settings
     changing without explanation)
   - Dialogue that contradicts earlier statements by the same
     character
   - Emotional arcs that show sudden shifts without sufficient
     development

2. SCENE-TO-SCENE COHERENCE:
   - Physical positioning and transitions between locations
   - Time of day and lighting inconsistencies
   - Character presence/absence in scenes without explanation
   - Weather or environmental conditions that change illogically

3. PLOT LOGIC:
   - Character motivations that seem inconsistent with their actions
   - Convenient coincidences that strain credibility
   - Information that characters possess without logical means of
     acquisition
   - Plot developments that contradict earlier established rules or
     limitations

4. POV CONSISTENCY:
   - Shifts in viewpoint that break established narrative patterns
   - Knowledge revealed that the POV character couldn't logically
     possess
   - Tone or voice inconsistencies within the same POV sections

For each issue found, provide:
- The specific inconsistency with exact manuscript locations
- Why it creates a continuity problem
- A suggested revision approach
`,

    "development": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== WORLD ===
${worldContent}
=== END WORLD ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor analyzing character and plot
development. Track how key elements evolve throughout the manuscript
and identify any development issues:

1. CHARACTER ARC TRACKING:
   - For each major character, trace their development through the manuscript
   - Identify key transformation moments and their emotional progression
   - Highlight any character development that feels rushed, stalled,
     or inconsistent
   - Note if their arc is following the trajectory established in the
     WORLD document

2. MYSTERY DEVELOPMENT:
   - Track the progression of the central mystery
   - Ensure clues are being revealed at an appropriate pace
   - Identify any critical information that's missing or presented out
     of logical sequence
   - Check if red herrings and misdirections are properly balanced
     with genuine progress

3. RELATIONSHIP EVOLUTION:
   - Track how key relationships develop
   - Ensure relationship changes are properly motivated and paced
   - Identify any significant jumps in relationship dynamics that need
     development

4. THEME DEVELOPMENT:
   - Track how the core themes from the WORLD document are being
     developed
   - Identify opportunities to strengthen thematic elements
   - Note if any established themes are being neglected

Provide a structured analysis showing the progression points for each
tracked element, identifying any gaps, pacing issues, or development
opportunities.
`,

    "unresolved": `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative
completeness. Analyze the MANUSCRIPT to identify elements that have
been set up but not resolved:

1. UNRESOLVED PLOT ELEMENTS:
   - Mysteries or questions raised but not answered
   - Conflicts introduced but not addressed
   - Promises made to the reader (through foreshadowing or explicit
     setup) without payoff
   - Character goals established but not pursued

2. CHEKHOV'S GUNS:
   - Significant objects introduced but not used
   - Skills or abilities established but never employed
   - Locations described in detail but not utilized in the plot
   - Information revealed but not made relevant

3. CHARACTER THREADS:
   - Side character arcs that begin but don't complete
   - Character-specific conflicts that don't reach resolution
   - Backstory elements introduced but not integrated into the main
     narrative
   - Relationship dynamics that are established but not developed

For each unresolved element, provide:
- What was introduced and where in the manuscript
- Why it creates an expectation of resolution
- Suggested approaches for resolution or intentional non-resolution
`
  };
  
  return prompts[checkType] || "";
}

/**
 * Run a consistency check
 * @param {string} checkType - Type of consistency check
 * @param {string} outlineContent - Outline content
 * @param {string} worldContent - World content
 * @param {string} manuscriptContent - Manuscript content
 * @param {object} args - Command line arguments
 * @returns {Promise<Object>} - Results of the consistency check
 */
async function runConsistencyCheck(checkType, outlineContent, worldContent, manuscriptContent, args) {
  const prompt = createPrompt(checkType, outlineContent, worldContent, manuscriptContent);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: args.request_timeout * 1000, // Convert to milliseconds
  });
  
  let promptTokenCount = 0;
  try {
    const response = await client.beta.messages.countTokens({
      model: "claude-3-7-sonnet-20250219",
      messages: [{ role: "user", content: prompt }],
      thinking: {
        type: "enabled",
        budget_tokens: args.thinking_budget_tokens
      },
      betas: ["output-128k-2025-02-19"]
    });
    promptTokenCount = response.input_tokens;
    console.log(`Actual input/prompt tokens: ${promptTokenCount}`);
  } catch (error) {
    console.error(`Token counting error: ${error.message}`);
  }

  // Calculate token budgets using our improved function
  const budgets = calculateTokenBudgets(promptTokenCount, args);
  
  console.log(`Running ${checkType} consistency check...`);
  console.log(`\nToken stats:`);
  console.log(`Max AI model context window: [${budgets.contextWindow}] tokens`);
  console.log(`Input prompt tokens: [${budgets.promptTokens}] ...`);
  console.log(`                     = outline.txt + world.txt + manuscript.txt`);
  console.log(`                       + prompt instructions`);
  console.log(`Available tokens: [${budgets.availableTokens}]  = ${budgets.contextWindow} - ${budgets.promptTokens} = context_window - prompt`);
  console.log(`Desired output tokens: [${budgets.desiredOutputTokens}]`);
  console.log(`AI model thinking budget: [${budgets.thinkingBudget}] tokens  = ${budgets.maxTokens} - ${budgets.desiredOutputTokens}`);
  console.log(`Max output tokens (max_tokens): [${budgets.maxTokens}] tokens  = min(${budgets.betasMaxTokens}, ${budgets.availableTokens})`);
  console.log(`                                = can not exceed: 'betas=["output-128k-2025-02-19"]'`);
  
  if (budgets.isPromptTooLarge) {
    console.error(`Error: prompt is too large to have a ${budgets.configuredThinkingBudget} thinking budget!`);
    process.exit(1);
  }
  
  let fullResponse = "";
  let thinkingContent = "";
  
  const startTime = Date.now();
  console.log(`Sending request to Claude API...`);
  console.log(`* max_tokens=`, budgets.maxTokens);
  console.log(`* thinkingBudget=`, budgets.thinkingBudget);
  
  try {
    const stream = await client.beta.messages.stream({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: budgets.maxTokens,
      messages: [{ role: "user", content: prompt }],
      thinking: {
        type: "enabled",
        budget_tokens: budgets.thinkingBudget
      },
      betas: ["output-128k-2025-02-19"]
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta") {
          thinkingContent += event.delta.thinking;
        } else if (event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
        }
      }
    }
  } catch (error) {
    console.error(`\nAPI Error: ${error.message}`);
    return { fullResponse: "", thinkingContent: "", promptTokenCount: 0, reportTokenCount: 0 };
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  const reportWordCount = countWords(fullResponse);
  console.log(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s. Report has ${reportWordCount} words.`);
  
  let reportTokenCount = 0;
  try {
    const response = await client.beta.messages.countTokens({
      model: "claude-3-7-sonnet-20250219",
      messages: [{ role: "user", content: fullResponse }],
      thinking: {
        type: "enabled",
        budget_tokens: budgets.thinkingBudget
      },
      betas: ["output-128k-2025-02-19"]
    });
    reportTokenCount = response.input_tokens;
  } catch (error) {
    console.error(`Response token counting error: ${error.message}`);
  }
  
  return { 
    fullResponse, 
    thinkingContent, 
    promptTokenCount, 
    reportTokenCount 
  };
}

/**
 * Save the consistency report and thinking content to files
 * @param {string} checkType - Type of consistency check
 * @param {string} fullResponse - AI's response
 * @param {string} thinkingContent - AI's thinking process
 * @param {number} promptTokenCount - Token count of the prompt
 * @param {number} reportTokenCount - Token count of the report
 * @param {object} args - Command line arguments
 * @param {string} stats - Statistics about the run
 * @returns {string} - Path to the saved report file
 */
function saveReport(checkType, fullResponse, thinkingContent, promptTokenCount, reportTokenCount, args, stats) {
  // Create save directory if it doesn't exist
  fs.mkdirSync(args.save_dir, { recursive: true });
  
  // Create descriptive filename
  const desc = args.check_description ? `_${args.check_description}` : "";
  const timestamp = DateTime.now().toFormat("yyyyMMdd_HHmmss");
  const baseFilename = `consistency_${checkType}${desc}_${timestamp}`;
  
  // Save full response
  const reportFilename = path.join(args.save_dir, `${baseFilename}.txt`);
  fs.writeFileSync(reportFilename, fullResponse, 'utf-8');
  
  // Save thinking content if available and not skipped
  if (thinkingContent && !args.skip_thinking) {
    const thinkingFilename = path.join(args.save_dir, `${baseFilename}_thinking.txt`);
    const thinkingContentFormatted = `=== CONSISTENCY CHECK TYPE ===\n${checkType}\n\n=== AI'S THINKING PROCESS ===\n\n${thinkingContent}\n=== END AI'S THINKING PROCESS ===\n${stats}`;
    fs.writeFileSync(thinkingFilename, thinkingContentFormatted, 'utf-8');
    console.log(`AI thinking saved to: ${thinkingFilename}`);
  }
  
  console.log(`Report saved to: ${reportFilename}`);
  return reportFilename;
}

/**
 * Main function
 */
async function main() {
  const args = parseArguments();
  
  const worldContent = readFile(args.world_file, "world");
  const manuscriptContent = readFile(args.manuscript_file, "manuscript");
  const outlineContent = args.outline_file ? readFile(args.outline_file, "outline") : "";
  
  const currentTime = DateTime.now().toFormat("h:mm:ss a").toLowerCase().replace(/^0/, '');
  console.log("\n=== Consistency Checker Configuration ===");
  console.log(`Check type: ${args.check_type}`);
  console.log(`Max request timeout: ${args.request_timeout} seconds`);
  console.log(`Save directory: ${path.resolve(args.save_dir)}`);
  console.log(`Started at: ${currentTime}`);
  console.log("========================================\n");
  
  // Handle "all" check type
  if (args.check_type === "all") {
    const checkTypes = ["world", "internal", "development", "unresolved"];
    const allReports = [];
    
    for (const check of checkTypes) {
      console.log(`\n=== Running ${check.toUpperCase()} Consistency Check ===`);
      const { fullResponse, thinkingContent, promptTokenCount, reportTokenCount } = 
        await runConsistencyCheck(check, outlineContent, worldContent, manuscriptContent, args);
      
      if (fullResponse) {
        // Calculate budgets again for stats
        const budgets = calculateTokenBudgets(promptTokenCount, args);
        
        const stats = `
Details:
Check type: ${check} consistency check
Max request timeout: ${args.request_timeout} seconds
Max AI model context window: ${args.context_window} tokens
AI model thinking budget: ${budgets.thinkingBudget} tokens
Max output tokens: ${budgets.maxTokens} tokens

Input tokens: ${promptTokenCount}
Output tokens: ${reportTokenCount}
`;
        
        fullResponseCleaned = removeMarkdown(fullResponse);

        const reportFile = saveReport(check, fullResponseCleaned, thinkingContent, 
                                    promptTokenCount, reportTokenCount, args, stats);
        allReports.push(reportFile);
      } else {
        console.log(`Failed to complete ${check} consistency check.`);
      }
    }
    
    console.log("\n=== All Consistency Checks Completed ===");
    console.log("Reports saved:");
    for (const report of allReports) {
      console.log(`- ${report}`);
    }
  } else {
    // Run a single check type
    const { fullResponse, thinkingContent, promptTokenCount, reportTokenCount } = 
      await runConsistencyCheck(args.check_type, outlineContent, worldContent, manuscriptContent, args);
    
    if (fullResponse) {
      // Calculate budgets again for stats
      const budgets = calculateTokenBudgets(promptTokenCount, args);
      
      const stats = `
Details:
Check type: ${args.check_type} consistency check
Max request timeout: ${args.request_timeout} seconds
Max AI model context window: ${args.context_window} tokens
AI model thinking budget: ${budgets.thinkingBudget} tokens
Max output tokens: ${budgets.maxTokens} tokens

Input tokens: ${promptTokenCount}
Output tokens: ${reportTokenCount}
`;
      
      fullResponseCleaned = removeMarkdown(fullResponse);

      saveReport(args.check_type, fullResponseCleaned, thinkingContent, 
               promptTokenCount, reportTokenCount, args, stats);
    } else {
      console.log("Failed to complete consistency check.");
    }
  }
}

// main().catch(error => {
//   console.error(`Error: ${error.message}`);
//   process.exit(1);
// });
main(); // let errors show
