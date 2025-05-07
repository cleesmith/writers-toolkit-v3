// Load environment variables from ~/.env
require('dotenv').config({ path: require('os').homedir() + '/.env' });
const anthropic = require('@anthropic-ai/sdk');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Usage: node sdk-with-headers.js <path-to-manuscript.txt>
const manuscriptPath = process.argv[2];
if (!manuscriptPath) {
  console.error('Error: Please provide the path to your manuscript .txt file.');
  console.error('Usage: node sdk-with-headers.js path/to/book.txt');
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
 * Use the SDK to analyze the manuscript and access response headers
 */
async function analyzeWith(num, bookTextBlock, userQuery) {
  console.log('Sending request to Claude API using SDK...');
  console.log(`Query: "${userQuery}"`);
  
  try {
    // Use beta.messages.create with withResponse() to get both data and headers
    console.log('Using beta.messages.create API with withResponse()...');
    
    const systemMessages = [
      bookTextBlock
    ];
    
    // Make the non-streaming request using the SDK, but get the raw response too
    const { data: response, response: rawResponse } = await client.beta.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 50000,
      system: systemMessages,
      messages: [{ role: 'user', content: userQuery }],
      thinking: { type: 'enabled', budget_tokens: 32000 },
      betas: ['output-128k-2025-02-19']
    }).withResponse();
    
    // Display all headers from the raw response
    console.log('\n=== ALL RESPONSE HEADERS ===');
    
    // Headers is a Map-like object, get all entries and sort them
    const headerEntries = Array.from(rawResponse.headers.entries()).sort();
    
    // Print each header and its value
    for (const [name, value] of headerEntries) {
      console.log(`${name}: ${value}`);
    }
    console.log('=== END RESPONSE HEADERS ===\n');
    
    // Display usage information if available
    if (response.usage) {
      console.log('\n=== USAGE METRICS ===');
      console.log('input_tokens:', response.usage.input_tokens || 0);
      console.log('output_tokens:', response.usage.output_tokens || 0);
      
      // Display cache metrics if available
      if (response.usage.cache_creation_input_tokens !== undefined ||
          response.usage.cache_read_input_tokens !== undefined) {
        console.log('cache_creation_input_tokens:', response.usage.cache_creation_input_tokens || 0);
        console.log('cache_read_input_tokens:', response.usage.cache_read_input_tokens || 0);
      }
      console.log('=== END USAGE METRICS ===\n');
    }
    
    // Display the response content
    console.log(`\n--- ${num}. CLAUDE RESPONSE ---\n`);
    
    // Extract and display the text content
    if (response.content) {
      for (const block of response.content) {
        if (block.type === 'text') {
          console.log(block.text);
        } else if (block.type === 'thinking') {
          // Format and display thinking content if present
          const thinkingPreview = block.thinking ? 
            block.thinking.substring(0, 100) + (block.thinking.length > 100 ? '...' : '') : 
            '[No thinking content]';
          console.log(`[Thinking: ${thinkingPreview}]`);
        } else {
          console.log(`[Non-text content of type: ${block.type}]`);
        }
      }
    }
    
    console.log('\n\n--- END OF RESPONSE ---');
    return response;
  } catch (error) {
    console.error('Error during API call:', error);
    console.error('Error details:', error.message);
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
    
    // Use the SDK for the manuscript analysis and get headers
    await analyzeWith(
      "1",
      BOOK_TEXT,
      'What is the last word in my manuscript.'
    );
    console.log('Analysis 1 complete.');
    
    await analyzeWith(
      "2",
      BOOK_TEXT,
      'You are an AI assistant specializing in thematic analysis of fiction. ' +
      'List the names of all of the characters in my manuscript.'
    );
    console.log('Analysis 2 complete.');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
})();