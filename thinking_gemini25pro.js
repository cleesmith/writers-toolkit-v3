// To run this code you need to install the following dependencies:
// npm install @google/genai

const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    return;
  }  

  const modelName = 'gemini-2.5-pro-preview-05-06';
  // const modelName = 'gemini-2.5-pro-exp-03-25';

  const originalUserQuery = "list planets";

  // --- MODIFIED PROMPT TO STRONGLY DISCOURAGE MARKDOWN ---
  const structuredPrompt = `
You are a helpful assistant. Your responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

Follow these instructions carefully:
1. First, explain your thinking process for how you will answer the query: "${originalUserQuery}".
   This thinking process MUST be in plain text. Do not use any Markdown.
   Enclose this plain text thinking process within <thinking>...</thinking> tags.

2. After the </thinking> tag, provide the direct answer to the query: "${originalUserQuery}".
   This answer MUST also be in plain text. Strictly avoid any Markdown formatting.
`;
  // --- END OF MODIFIED PROMPT ---

  const generationConfig = {
    responseMimeType: 'text/plain', // This helps but isn't a foolproof guarantee against internal Markdown generation
  };

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const contents = [
    {
      role: 'user',
      parts: [{ text: structuredPrompt }],
    },
  ];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    console.log(`Using model: ${modelName}`);
    console.log("Sending request to Gemini...\n");

    const resultStream = await ai.models.generateContentStream({
      model: modelName,
      generationConfig: generationConfig,
      contents: contents,
      safetySettings: safetySettings,
    });

    let fullResponseText = "";
    for await (const chunk of resultStream) {
      if (chunk.text) {
        fullResponseText += chunk.text;
      } else if (chunk.candidates && chunk.candidates.length > 0 && chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts.length > 0 && chunk.candidates[0].content.parts[0].text) {
        fullResponseText += chunk.candidates[0].content.parts[0].text;
      }
    }

    console.log("\n--- Processing Complete ---");

    let thinkingText = "";
    let contentText = "";

    const thinkingStartTag = "<thinking>";
    const thinkingEndTag = "</thinking>";

    const thinkingStartIndex = fullResponseText.indexOf(thinkingStartTag);
    const thinkingEndIndex = fullResponseText.indexOf(thinkingEndTag);

    if (thinkingStartIndex !== -1 && thinkingEndIndex !== -1 && thinkingEndIndex > thinkingStartIndex) {
      thinkingText = fullResponseText.substring(thinkingStartIndex + thinkingStartTag.length, thinkingEndIndex).trim();
      contentText = fullResponseText.substring(thinkingEndIndex + thinkingEndTag.length).trim();
    } else {
      console.warn("Warning: <thinking> tags not found in the response. Treating entire response as content.");
      contentText = fullResponseText.trim();
    }

    console.log("\n--- Captured Thinking/Reasoning (Plain Text) ---");
    if (thinkingText) {
      console.log(thinkingText);
    } else {
      console.log("(No explicit thinking/reasoning captured)");
    }

    console.log("\n--- Captured Content Stream (Final Answer - Plain Text) ---");
    console.log(contentText);

  } catch (error) {
    console.error("Error during Gemini API call:", error);
    if (error.response && error.response.data) {
        console.error("API Error Details:", JSON.stringify(error.response.data, null, 2));
    } else {
        console.error("Full Error Object:", error);
    }
  }
}

main();
