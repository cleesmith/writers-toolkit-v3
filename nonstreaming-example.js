// Load environment variables from ~/.env
require('dotenv').config({ path: require('os').homedir() + '/.env' });
const anthropic = require('@anthropic-ai/sdk');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Usage: node nonstreaming-example.js <path-to-manuscript.txt>
const manuscriptPath = process.argv[2];
if (!manuscriptPath) {
  console.error('Error: Please provide the path to your manuscript .txt file.');
  console.error('Usage: node nonstreaming-example.js path/to/book.txt');
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
 * Send a non-streaming analysis request with dynamic prompts and display rate limit headers.
 * @param {string} num - The sequence number of the analysis
 * @param {{type:string,text:string,cache_control:object}} bookTextBlock - The manuscript content
 * @param {string} userQuery - The query to send to the API
 */
async function analyzeWith(num, bookTextBlock, userQuery) {
  console.log('Sending request to Claude API...');
  console.log(`Query: "${userQuery}"`);
  
  try {
    // Use beta.messages.create for non-streaming
    console.log('Using beta.messages.create API...');
    
    const systemMessages = [
      bookTextBlock
    ];
    
    // Make the non-streaming request
    const response = await client.beta.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 50000,
      system: systemMessages,
      messages: [{ role: 'user', content: userQuery }],
      thinking: { type: 'enabled', budget_tokens: 32000 },
      betas: ['output-128k-2025-02-19']
    });
    console.log(`client:\n${client}\n`);

    // Debug: Log the structure of the response object
    console.log('\n=== RESPONSE STRUCTURE ===');
    console.log(`response:\n${JSON.stringify(response)}\n`);
    console.log('Response keys:', Object.keys(response));
    
    // Attempt to access headers through various possible paths
    let headers = null;
    let headerSource = 'Not found';
    
    try {
      // Try different possible locations of headers
      if (response._response && response._response.headers) {
        headers = response._response.headers;
        headerSource = 'response._response.headers';
      } else if (response.httpResponse && response.httpResponse.headers) {
        headers = response.httpResponse.headers;
        headerSource = 'response.httpResponse.headers';
      } else if (response.metadata && response.metadata.headers) {
        headers = response.metadata.headers;
        headerSource = 'response.metadata.headers';
      }
      
      console.log('Headers found at:', headerSource);
      
      if (!headers) {
        // If still not found, log entire response for debugging
        console.log('Full response structure:');
        console.dir(response, { depth: 3 });
        console.log('=== END RESPONSE STRUCTURE ===\n');
        console.log('Unable to find headers in response object');
        return;
      }
    } catch (error) {
      console.error('Error accessing headers:', error);
      return;
    }
    
    console.log('\n=== RATE LIMIT HEADERS ===');
    const rateLimitHeaders = [
      'retry-after',
      'anthropic-ratelimit-requests-limit',
      'anthropic-ratelimit-requests-remaining',
      'anthropic-ratelimit-requests-reset',
      'anthropic-ratelimit-tokens-limit',
      'anthropic-ratelimit-tokens-remaining',
      'anthropic-ratelimit-tokens-reset',
      'anthropic-ratelimit-input-tokens-limit',
      'anthropic-ratelimit-input-tokens-remaining',
      'anthropic-ratelimit-input-tokens-reset',
      'anthropic-ratelimit-output-tokens-limit',
      'anthropic-ratelimit-output-tokens-remaining',
      'anthropic-ratelimit-output-tokens-reset'
    ];
    
    // Handle both Map-like headers (with .get()) and plain objects
    for (const header of rateLimitHeaders) {
      let value;
      if (typeof headers.get === 'function') {
        value = headers.get(header);
      } else {
        value = headers[header];
      }
      
      if (value) {
        console.log(`${header}: ${value}`);
      } else {
        console.log(`${header}: [not present]`);
      }
    }
    console.log('=== END RATE LIMIT HEADERS ===\n');
    
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
        } else {
          console.log(`[Non-text content of type: ${block.type}]`);
        }
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