// Load environment variables from ~/.env
require('dotenv').config({ path: require('os').homedir() + '/.env' });
const anthropic = require('@anthropic-ai/sdk');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Ensure API key is set
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: `ANTHROPIC_API_KEY` environment variable not found.');
  process.exit(1);
}

// Instantiate Anthropic client with custom timeout and no retries
const client = new anthropic.Anthropic({
  apiKey: apiKey,
  timeout: 300 * 1000, // 300 seconds in milliseconds
  maxRetries: 0,
});

/**
 * First check current token limits to understand our quota
 */
async function checkCurrentLimits() {
  try {
    console.log('Checking current API limits...');
    
    // Make a minimal request to check headers
    // Note: max_tokens must be greater than thinking.budget_tokens
    const { data, response } = await client.beta.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 2000,  // Must be greater than thinking.budget_tokens
      messages: [{ role: 'user', content: 'Hi' }],
      thinking: { type: 'enabled', budget_tokens: 1024 },  // Minimum allowed value
      betas: ['output-128k-2025-02-19']
    }).withResponse();
    
    // Display all headers from the raw response
    console.log('\n=== CURRENT RATE LIMITS ===');
    
    // Headers is a Map-like object, get all entries and sort them
    const headerEntries = Array.from(response.headers.entries())
      .filter(([name]) => name.includes('anthropic-ratelimit'))
      .sort();
    
    // Print each header and its value
    for (const [name, value] of headerEntries) {
      console.log(`${name}: ${value}`);
    }
    
    // Extract token limits specifically
    const inputTokenLimit = parseInt(response.headers.get('anthropic-ratelimit-input-tokens-limit'));
    const inputTokenRemaining = parseInt(response.headers.get('anthropic-ratelimit-input-tokens-remaining'));
    const outputTokenLimit = parseInt(response.headers.get('anthropic-ratelimit-output-tokens-limit'));
    const outputTokenRemaining = parseInt(response.headers.get('anthropic-ratelimit-output-tokens-remaining'));
    
    return {
      inputTokenLimit,
      inputTokenRemaining,
      outputTokenLimit,
      outputTokenRemaining
    };
  } catch (error) {
    console.error('Error checking limits:', error.message);
    throw error;
  }
}

/**
 * Generate a large text to trigger the input token limit
 * @param {number} targetTokens - Approximate number of tokens to generate
 */
function generateLargeInput(targetTokens) {
  // A rough approximation is that 1 token ≈ 4 characters in English
  const charsPerToken = 4;
  const targetChars = targetTokens * charsPerToken;
  console.log(`\n>>> targetTokens=${targetTokens}`);
  console.log(`>>> targetChars=${targetChars}\n`);
  
  // Create a repeating text to reach our target size
  let text = '';
  const paragraph = 'This is a test paragraph designed to consume tokens. Each sentence adds to the token count. ' +
                    'We need to exceed the input token limit to trigger the rate limit error. ' +
                    'By repeating this paragraph many times, we will eventually reach our target token count. ' +
                    'The Claude API will then return a rate limit error with the retry-after header. ';
  
  while (text.length < targetChars) {
    text += paragraph;
  }
  
  console.log(`Generated input text of approximately ${Math.floor(text.length / charsPerToken)} tokens (${text.length} characters)`);
  return text;
}

/**
 * Use the SDK to send an oversized request that will trigger a rate limit
 */
async function analyzeWithOversizedInput() {
  try {
    // First, check our current limits
    const limits = await checkCurrentLimits();
    
    // Generate input that is larger than our remaining input token allowance (add 20% to ensure we exceed it)
    const targetTokens = Math.ceil(limits.inputTokenRemaining * 1.2);
    
    console.log(`\n=== RATE LIMIT TEST ===`);
    console.log(`Attempting to exceed input token limit (${limits.inputTokenRemaining}) with request of ~${targetTokens} tokens`);
    
    // Generate the large input
    // const largeInput = generateLargeInput(targetTokens);
    // cls: hardcode book size:
    const largeInput = generateLargeInput(120000);
    
    console.log('Sending request to Claude API using SDK...');
    console.log('Using beta.messages.create API with withResponse()...');
    
    // No system messages needed for this test
    const systemMessages = [];
    
    // Make the oversized request using the SDK with all your original parameters
    // Note: max_tokens (50000) is greater than thinking.budget_tokens (32000) as required
    const { data: response, response: rawResponse } = await client.beta.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 50000,  // greater than thinking.budget_tokens (32000)
      system: systemMessages,
      messages: [{ role: 'user', content: largeInput }],
      thinking: { type: 'enabled', budget_tokens: 32000 },
      betas: ['output-128k-2025-02-19']
    }).withResponse();
    
    // If we get here, we didn't exceed the limit
    console.log('Request succeeded without hitting limits. You may need to increase the input size further.');
    
    // Display all headers from the raw response
    console.log('\n=== ALL RESPONSE HEADERS ===');
    
    // Headers is a Map-like object, get all entries and sort them
    const headerEntries = Array.from(rawResponse.headers.entries()).sort();
    
    // Print each header and its value
    for (const [name, value] of headerEntries) {
      console.log(`${name}: ${value}`);
    }
    console.log('=== END RESPONSE HEADERS ===\n');

    // Log the entire content array to see all blocks
    console.log("All response blocks:");
    console.log(JSON.stringify(response.content, null, 2));

    // Display usage information
    if (response.usage) {
      console.log('\n=== USAGE METRICS ===');
      console.log('input_tokens:', response.usage.input_tokens || 0);
      console.log('output_tokens:', response.usage.output_tokens || 0);
      console.log('=== END USAGE METRICS ===\n');
    }
    
    return { success: true, response, rawResponse };
  } catch (error) {
    // Check if this is a rate limit error
    if (error.status === 429) {
      console.log(`\n🚨 RATE LIMIT EXCEEDED! 🚨`);
      console.log(`Status: ${error.status}`);
      
      // Try to extract and display headers from the error response
      try {
        if (error.response && error.response.headers) {
          const retryAfter = error.response.headers.get('retry-after');
          console.log(`retry-after: ${retryAfter} seconds`);
          
          console.log('\n=== ALL ERROR RESPONSE HEADERS ===');
          const headerEntries = Array.from(error.response.headers.entries()).sort();
          for (const [name, value] of headerEntries) {
            console.log(`${name}: ${value}`);
          }
          console.log('=== END ERROR RESPONSE HEADERS ===\n');
        } else {
          console.log('No headers available in the error response');
        }
      } catch (headerError) {
        console.error('Error accessing headers:', headerError);
      }
      
      return { success: false, error };
    } else {
      // Some other error occurred
      console.error('Error during API call:', error);
      console.error('Error details:', error.message);
      return { success: false, error };
    }
  }
}

// Main IIFE
;(async () => {
  try {
    console.log('Starting rate limit test...');
    
    // Run the test
    await analyzeWithOversizedInput();
    
    console.log('Test complete.');
  } catch (error) {
    console.error('Unexpected error:', error);
  }
})();