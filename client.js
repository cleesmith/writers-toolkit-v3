// claude-api/client.js
const anthropic = require('@anthropic-ai/sdk');

/**
 * Claude API Service
 * Handles interactions with the Claude AI API
 * Uses UI settings with no hardcoded values
 */
class ClaudeAPIService {

  /**
   * Constructor
   * @param {Object} config - API configuration from UI settings
   */
  constructor(config = {}) {
    // Validate required settings
    this.validateConfig(config);
    
    // Store all config values
    this.config = {
      max_retries: config.max_retries,
      request_timeout: config.request_timeout,
      context_window: config.context_window,
      thinking_budget_tokens: config.thinking_budget_tokens,
      betas_max_tokens: config.betas_max_tokens,
      desired_output_tokens: config.desired_output_tokens,
      model_name: config.model_name,
      betas: config.betas,
      max_thinking_budget: config.max_thinking_budget,
      max_tokens: config.max_tokens
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable not found');
      // throw new Error(
      //   "Claude API key not found. Please set the ANTHROPIC_API_KEY environment variable."
      // );
      this.apiKeyMissing = true;
      return; // don't create the client but don't crash
    }

    this.client = new anthropic.Anthropic({
      apiKey: apiKey,
      timeout: this.config.request_timeout * 1000, // convert seconds to ms
      maxRetries: this.config.max_retries,
    });
    
    console.log('Claude API Service initialized with:');
    console.log('- Context window:', this.config.context_window);
    console.log('- Model name:', this.config.model_name);
    console.log('- Beta features:', this.config.betas);
    console.log('- Max thinking budget:', this.config.max_thinking_budget);
    console.log('- Max tokens:', this.config.max_tokens);
  }
  
  /**
   * Helper method to convert betas string to array for API calls
   * @returns {string[]} Array of beta features
   */
  _getBetasArray() {
    return this.config.betas.split(',')
      .map(beta => beta.trim())
      .filter(beta => beta.length > 0);
  }

  validateConfig(config) {
    // Check if config exists at all
    if (!config || Object.keys(config).length === 0) {
      throw new Error("No Claude API configuration provided.");
    }

    // List required settings
    const requiredSettings = [
      'max_retries',
      'request_timeout',
      'context_window',
      'thinking_budget_tokens',
      'betas_max_tokens',
      'desired_output_tokens',
      'model_name',
      'betas',
      'max_thinking_budget',
      'max_tokens'
    ];
    
    // Log warnings but don't crash
    const missingSettings = requiredSettings.filter(setting => config[setting] === undefined);
    if (missingSettings.length > 0) {
      console.warn(`Warning: Some Claude API settings missing: ${missingSettings.join(', ')}`);
      console.warn("Please update API settings from the application.");
    }
  }
  
  /**
   * Count tokens in a text string
   * @param {string} text - Text to count tokens in
   * @returns {Promise<number>} - Token count
   */
  async countTokens(text) {
    try {
      const response = await this.client.beta.messages.countTokens({
        model: this.config.model_name,
        messages: [{ role: "user", content: text }],
        thinking: {
          type: "enabled",
          budget_tokens: this.config.thinking_budget_tokens
        },
        betas: this._getBetasArray()
      });
      
      return response.input_tokens;
    } catch (error) {
      console.error('Token counting error:', error);
      throw error;
    }
  }
  
  /**
   * Stream a response with thinking using callbacks
   * @param {string} prompt - Prompt to complete
   * @param {Object} options - API options (only system is allowed to be overridden)
   * @param {Function} onThinking - Callback for thinking content
   * @param {Function} onText - Callback for response text
   * @returns {Promise<void>}
   */
  async streamWithThinking(prompt, options = {}, onThinking, onText) {
    const modelOptions = {
      model: this.config.model_name,
      max_tokens: options.max_tokens,
      messages: [{ role: "user", content: prompt }],
      thinking: {
        type: "enabled",
        budget_tokens: options.thinking.budget_tokens
      },
      betas: this._getBetasArray()
    };

    // Only allow system prompt to be overridden
    if (options.system) {
      modelOptions.system = options.system;
    }
    
    try {
      const stream = await this.client.beta.messages.stream(modelOptions);
      
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            // Call thinking callback with delta
            if (onThinking && typeof onThinking === 'function') {
              onThinking(event.delta.thinking);
            }
          } else if (event.delta.type === "text_delta") {
            // Call text callback with delta
            if (onText && typeof onText === 'function') {
              onText(event.delta.text);
            }
          }
        }
      }
    } catch (error) {
      console.error('API streaming error:', error);
      throw error;
    }
  }
  
  /**
   * Stream a response with thinking and message start stats using callbacks
   * @param {string} prompt - Prompt to complete
   * @param {Object} options - API options (only system is allowed to be overridden)
   * @param {Function} onThinking - Callback for thinking content
   * @param {Function} onText - Callback for response text
   * @returns {Promise<void>}
   */
  async streamWithThinkingAndMessageStart(prompt, options = {}, onThinking, onText, onMessageStart, onResponseHeaders, onStatus) {
    const modelOptions = {
      model: this.config.model_name,
      max_tokens: options.max_tokens,
      messages: [{ role: "user", content: prompt }],
      thinking: {
        type: "enabled",
        budget_tokens: options.thinking.budget_tokens
      },
      betas: this._getBetasArray()
    };

    // Only allow system prompt to be overridden
    if (options.system) {
      modelOptions.system = options.system;
    }
    
    try {
      // const { data: response, response: rawResponse } = await client.beta.messages.create({
      //   model: 'claude-3-7-sonnet-20250219',
      //   max_tokens: 50000,  // greater than thinking.budget_tokens (32000)
      //   system: systemMessages,
      //   messages: [{ role: 'user', content: largeInput }],
      //   thinking: { type: 'enabled', budget_tokens: 32000 },
      //   betas: ['output-128k-2025-02-19']
      // }).withResponse();

      // const stream = await this.client.beta.messages.stream(modelOptions);
      const { data: stream, response: rawResponse } = await this.client.beta.messages
        .stream(modelOptions)
        .withResponse();

      // display all headers from the raw response
      onResponseHeaders(`\n=== CURRENT RATE LIMITS ===`);
      // headers is a Map-like object, get all entries
      const headerEntries = Array.from(rawResponse.headers.entries());
      for (const [name, value] of headerEntries) {
        onResponseHeaders(`${name}: ${value}`);
      }

      // event: message_start
      // data: {"type": "message_start", "message": {"id": "msg_01...", "type": "message", "role": "assistant", "content": [], "model": "claude-3-7-sonnet-20250219", "stop_reason": null, "stop_sequence": null}}
      // ⬇️
      // ⬇️
      //        ******************* = THINKING
      // event: content_block_start
      // data: {"type": "content_block_start", "index": 0, "content_block": {"type": "thinking", "thinking": ""}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "Let me solve this step by step:\n\n1. First break down 27 * 453"}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "\n2. 453 = 400 + 50 + 3"}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "\n3. 27 * 400 = 10,800"}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "\n4. 27 * 50 = 1,350"}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "\n5. 27 * 3 = 81"}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "\n6. 10,800 + 1,350 + 81 = 12,231"}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 0, "delta": {"type": "signature_delta", "signature": "EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds..."}}
      // ⬇️
      // event: content_block_stop
      // data: {"type": "content_block_stop", "index": 0}
      // ⬇️
      // ⬇️
      //        ******************* = TEXT
      // event: content_block_start
      // data: {"type": "content_block_start", "index": 1, "content_block": {"type": "text", "text": ""}}
      // ⬇️
      // event: content_block_delta
      // data: {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "27 * 453 = 12,231"}}
      // ⬇️
      // event: content_block_stop
      // data: {"type": "content_block_stop", "index": 1}
      // ⬇️
      // ⬇️
      // event: message_delta
      // data: {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": null}}
      // ⬇️
      // event: message_stop
      // data: {"type": "message_stop"}

      for await (const event of stream) {
        if (event.type === "message_start") {
          onMessageStart(`\n=== MESSAGE START ===`);
          onMessageStart(`${JSON.stringify(event.message)}`);
        }

        if (event.type === "content_block_start") {
          if (event.content_block.type == "thinking") {
            if (onStatus && typeof onStatus === 'function') {
              onStatus(`\n🧍🏽stand by 🤓 thinking...\n\n`);
            }
          } else if (event.content_block.type == "text") {
            if (onStatus && typeof onStatus === 'function') {
              onStatus(`\n🗣️ now 🤖 responding...\n\n`);
            }
          }
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            // call thinking callback with delta, which is the text of the thinking
            if (onThinking && typeof onThinking === 'function') {
              onThinking(event.delta.thinking);
            }
          } else if (event.delta.type === "text_delta") {
            // call text callback with delta, which is the final output text of the AI's response
            if (onText && typeof onText === 'function') {
              onText(event.delta.text);
            }
          }
        }
      }
    } catch (error) {
      console.error('API streaming error:', error);
      throw error;
    }
  }

  /**
   * Calculate token budgets and validate prompt size
   * @param {number} promptTokens - Number of tokens in the prompt
   * @returns {Object} - Calculated token budgets and limits
   */
  calculateTokenBudgets(promptTokens) {
    // Use configuration settings directly
    const contextWindow = this.config.context_window;
    const desiredOutputTokens = this.config.desired_output_tokens;
    const configuredThinkingBudget = this.config.thinking_budget_tokens;
    const betasMaxTokens = this.config.betas_max_tokens;
    const maxThinkingBudget = this.config.max_thinking_budget;
    let maxTokens = this.config.maxTokens;
    
    // Calculate available tokens after prompt
    const availableTokens = contextWindow - promptTokens;

    // For API call, max_tokens must respect the API limit
    maxTokens = Math.min(availableTokens, betasMaxTokens);
    if (maxTokens > contextWindow) {
      maxTokens = availableTokens
    }
    
    // Thinking budget must be LESS than max_tokens to leave room for visible output
    let thinkingBudget = maxTokens - desiredOutputTokens;
    
    // Cap thinking budget if it's too large - use configurable limit
    const capThinkingBudget = thinkingBudget > maxThinkingBudget;
    if (capThinkingBudget) {
      thinkingBudget = maxThinkingBudget;
    }

    // client.js: execute:
    // API Error: 400 {
    //     "type":"error",
    //     "error":{
    //       "type":"invalid_request_error",
    //       "message":"input length and `max_tokens` exceed 
    //          context limit: 107398 + 128000 > 200000, 
    //          decrease input length or `max_tokens` and try again"
    //     }}

    // ---------------------------------------------------------------
    // May 2025: Claude 3.7 Sonnet with 32K extended thinking & betas
    // _______________________________________________________________
    // OUTPUT  =  contextWindow - promptTokens     =  availableTokens
    //                                ↓ THINKING ↓
    // VISIBLE =  availableTokens  -    32000      =  maxTokens
    // ---------------------------------------------------------------
    
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
  
  // /**
  //  * Complete a prompt with thinking
  //  * @param {string} prompt - Prompt to complete
  //  * @param {Object} options - API options (only system is allowed to be overridden)
  //  * @returns {Promise<Object>} - Response with content and thinking
  //  */
  // async completeWithThinking(prompt, options = {}) {
  //   const modelOptions = {
  //     model: this.config.model_name,
  //     max_tokens: this.config.betas_max_tokens,
  //     messages: [{ role: "user", content: prompt }],
  //     thinking: {
  //       type: "enabled",
  //       budget_tokens: this.config.thinking_budget_tokens
  //     },
  //     betas: this._getBetasArray()
  //   };
    
  //   // Only allow system prompt to be overridden
  //   if (options.system) {
  //     modelOptions.system = options.system;
  //   }
    
  //   try {
  //     const response = await this.client.beta.messages.create(modelOptions);
      
  //     // Extract main content and thinking
  //     const content = response.content[0].text;
  //     const thinking = response.thinking || "";
      
  //     return { content, thinking };
  //   } catch (error) {
  //     console.error('API error:', error);
  //     throw error;
  //   }
  // }

  /**
   * Close the Anthropic client and clean up resources
   */
  close() {
    if (this.client) {
      console.log('Closing Anthropic client...');
      // The Anthropic SDK doesn't have an explicit close method,
      // but we can remove our reference to allow garbage collection
      this.client = null;
    }
  }

  /**
   * Recreate the client with the same settings
   * Useful when we need a fresh connection
   */
  recreate() {
    console.log('Recreating Anthropic client...');
    console.log('*** recreate: client before closing:', !!this.client);
    
    // Ensure any existing client is closed first
    this.close();
    console.log('*** recreate: client after closing:', !!this.client);
    
    // Only create a new client if the API key exists
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable not found');
      this.apiKeyMissing = true;
      return;
    }

    // Create a new client with the same settings
    this.client = new anthropic.Anthropic({
      apiKey: apiKey,
      timeout: this.config.request_timeout * 1000, // convert seconds to ms
      maxRetries: this.config.max_retries,
    });
    
    console.log('*** recreate: client after recreate:', !!this.client);
    console.log('Anthropic client recreated successfully');
  }

}

module.exports = ClaudeAPIService;
