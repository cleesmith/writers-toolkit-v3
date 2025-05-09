// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

// import {
//   GoogleGenAI,
// } from '@google/genai';
const { GoogleGenAI } = require('@google/genai');

async function main() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
  const config = {
    responseMimeType: 'text/plain',
  };
  const model = 'gemini-2.5-pro-exp-03-25';
  // const model = 'gemini-2.5-pro-preview-05-06';
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `list planets ... respond without using Markdown`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });
  let output = "";
  for await (const chunk of response) {
    output += chunk.text;
  }
  console.log(output);
}

main();
