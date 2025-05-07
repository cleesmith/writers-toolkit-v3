// Load environment variables from ~/.env
require('dotenv').config({ path: require('os').homedir() + '/.env' });
const anthropic = require('@anthropic-ai/sdk');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Usage: node streaming_example.js <path-to-manuscript.txt>
const manuscriptPath = process.argv[2];
if (!manuscriptPath) {
  console.error('Error: Please provide the path to your manuscript .txt file.');
  console.error('Usage: node streaming_example.js path/to/book.txt');
  process.exit(1);
}

// Ensure API key is set
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: `ANTHROPIC_API_KEY` environment variable not found.');
  process.exit(1);
}

// Instantiate Anthropic client with custom timeout and no retries
const client = new anthropic.Anthropic({
  apiKey: apiKey,
  timeout: 300 * 1000,   // 300 seconds in milliseconds
  maxRetries: 0,
});

// Read the manuscript text from disk
async function loadManuscript(filePath) {
  try {
    console.log(`Reading manuscript from: ${path.resolve(filePath)}`);
    return await fs.readFile(path.resolve(filePath), 'utf-8');
  } catch (err) {
    console.error(`Failed to read manuscript at ${filePath}:`, err.message);
    process.exit(1);
  }
}

/**
 * Send a streaming analysis request with dynamic prompts and track cache metrics.
 * @param {{type:string,text:string,cache_control:object}} bookTextBlock
 * @param {string} dynamicSystemText
 * @param {string} userQuery
 */
async function analyzeWith(num, bookTextBlock, userQuery) {
  console.log('Sending request to Claude API...');
  console.log(`Query: "${userQuery}"`);
  
  try {
    // Use beta.messages.stream specifically as required
    console.log('Using beta.messages.stream API...');
    
    const systemMessages = [
      bookTextBlock
    ];
    
    // We'll use the raw stream instead of the standard helpers
    // This gives us more direct control to debug
    const stream = await client.beta.messages.stream({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 50000,
      system: systemMessages,
      messages: [{ role: 'user', content: userQuery }],
      thinking: { type: 'enabled', budget_tokens: 32000 },
      betas: ['output-128k-2025-02-19']
    });

    // const rateLimit = stream.response?.headers?.get('anthropic-ratelimit-requests-limit');
    // console.log('Rate Limit via suggested method:', rateLimit);
    
    // Add error handler
    stream.on('error', (error) => {
      console.error('Stream error:', error);
    });
    
    // Start processing the stream
    console.log(`\n--- ${num}. CLAUDE RESPONSE ---\n`);
    
    let alreadyPrintedCache = false;
    
    for await (const chunk of stream) {
      // console.log(JSON.stringify(chunk, null, 2));
      
      // Check if this is a message_start event with usage info
      if (chunk.type === 'message_start' && !alreadyPrintedCache) {
        try {
          const usage = chunk.message?.usage;
          if (usage) {
            console.log('\n=== CACHE METRICS ===');
            console.log('cache_creation_input_tokens:', usage.cache_creation_input_tokens || 0);
            console.log('cache_read_input_tokens:    ', usage.cache_read_input_tokens || 0);
            console.log('input_tokens (uncached):    ', usage.input_tokens || 0);
            console.log('=== END CACHE METRICS ===\n');
            alreadyPrintedCache = true;
          }
        } catch (e) {
          console.error('Error extracting cache metrics:', e);
        }
      }
      
      // Also extract any completion text
      if (chunk.completion) {
        process.stdout.write(chunk.completion);
      }
    }
    
    console.log('\n\n--- END OF RESPONSE ---');
  } catch (error) {
    console.error('Error during API call:', error);
    console.error('Error details:', error.message);
    if (error.response) {
      console.error('Response error:', error.response);
    }
  }
}

// Main IIFE
;(async () => {
  try {
    console.log('Starting manuscript analysis...');
    const manuscriptContent = await loadManuscript(manuscriptPath);
    console.log(`Manuscript size: ${manuscriptContent.length} characters`);
    
    const BOOK_TEXT = { 
      type: 'text', 
      text: `=== MANUSCRIPT: A Darker Roast ===\n${manuscriptContent}\n=== END MANUSCRIPT: A Darker Roast ===`,
      cache_control: { type: 'ephemeral' } 
    };
    
    await analyzeWith(
      "1",
      BOOK_TEXT,
      'What is the last word in my manuscript.'
    );
    console.log('Analysis complete.');
    
    await analyzeWith(
      "2",
      BOOK_TEXT,
      'You are an AI assistant specializing in thematic analysis of fiction. ' +
      'List the names of all of the characters in my manuscript.'
    );
    console.log('Analysis complete.');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
})();