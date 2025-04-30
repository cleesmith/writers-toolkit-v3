# Writer’s Toolkit

The following AI (Claude 3.7 Sonnet) Tools run using:
~/writing/yourBook/manuscript.txt

## Creative Fiction Writing Tools

1. **tokens-words-counter** - Counts the approximate tokens and words in text files. Helps estimate Claude API usage and context window requirements for your writing.
1. **narrative-integrity** - Checks a manuscript for integrity against a world document and optionally an outline. Supports different types of consistency checks: world, internal, development, and unresolved plot elements.
1. **character-analyzer** - Analyzes manuscript, outline, and world files to identify and compare character appearances across different story documents. Helps maintain character consistency throughout your story.
1. **plot-thread-tracker** - Analyzes manuscripts to identify and track distinct plot threads. Shows how plot threads interconnect, converge, and diverge throughout the narrative.
1. **tense-consistency-checker** - Analyzes manuscripts for verb tense consistency issues. Identifies shifts between past/present tense that might confuse readers and breaks the narrative flow.
1. **conflict-analyzer** - Analyzes manuscripts for conflict patterns at different structural levels. Identifies conflict nature, escalation, and resolution at scene, chapter, and arc levels.
1. **foreshadowing-tracker** - Analyzes manuscripts for foreshadowing elements, planted clues, and their payoffs. Tracks setup and resolution of story elements, ensuring narrative promises are fulfilled.
1. **dangling-modifier-checker** - Analyzes manuscripts for dangling and misplaced modifiers. Identifies phrases that don't logically connect to the subject they're meant to modify, which can create unintended humor or confusion.
1. **crowding-leaping-evaluator** - Analyzes manuscripts for **pacing issues** based on Ursula K. Le Guin's concepts of "crowding" (intense detail) and "leaping" (jumping over time or events). Identifies dense paragraphs, abrupt transitions, and visualizes pacing patterns.
1. **adjective-adverb-optimizer** - Analyzes manuscripts for adjective and adverb usage. Identifies unnecessary modifiers, overused qualifiers, and suggests stronger verbs/nouns to replace adjective-heavy descriptions.
1. **rhythm-analyzer** - Analyzes manuscripts for rhythm and flow of prose. Measures sentence length variations, detects monotonous patterns, and highlights passages where the sound doesn't match the intended mood.
1. **punctuation-auditor** - Analyzes manuscripts for punctuation effectiveness. Identifies issues like run-on sentences, missing commas, and odd punctuation patterns that might hinder clarity and flow.

---

# Understanding Claude's Token Limits and Context Window

You're right to be confused about how these different token limits interact. Let me clarify how all these numbers work together:

## The Core Limits

1. **Context Window (200K tokens)** - This is the absolute maximum size for everything combined:
   - Your input (manuscript + prompt)
   - All of Claude's output (thinking + visible response)

2. **Max Output Tokens (128K in beta)** - This is how much Claude can generate in total:
   - Includes both thinking tokens and visible response
   - Is capped by the `anthropic-beta: output-128k-2025-02-19` header
   - Cannot exceed what's left in the context window after your input

3. **Thinking Budget (32K tokens)** - This is the space for Claude's internal reasoning:
   - Used for deep analysis but not shown to you
   - Is a portion of the output tokens

## How These Limits Interact

For your manuscript analysis with 106,448 input tokens:

```
CONTEXT WINDOW (200K)
┌─────────────────────────────────────────────────────────────────────┐
│                           |                                         │
│ INPUT (106,448)           │         OUTPUT (93,552 available)       │
│ Manuscript + Prompt       │                                         │
│                           │ THINKING (32K) │ VISIBLE (61,552 max)   │
│                           │                │                        │
└─────────────────────────────────────────────────────────────────────┘
OUTPUT = 200000 - 106448   = 93552
                  THINKING
VISIBLE = 93552 - 32000    = 61552

```

The important formula is:
- Input tokens + Output tokens ≤ 200K (Context window)
- Thinking tokens + Visible tokens ≤ Output tokens

So even though the beta allows for 128K output tokens, you can only use what's left in the context window after your input. With a 106K token input, you have about 94K tokens available for output (which includes both thinking and visible response).

## What This Means for Your Analysis Tasks

- With a 106K manuscript, you can get the full 32K thinking budget
- You have 62K tokens left for visible output (though you only used 4,183)
- As your manuscript size increases, you'll eventually have to reduce thinking

--- 

> The **tipping point** comes when:
> **Input tokens > (200K - 32K - minimum visible tokens)**

For example, if you need at least 3K tokens for visible output, you'd 
# start losing thinking capacity 
# when your input exceeds 165K tokens.

---

## Token Budget Management

### Quality Guarantee and Manuscript Size Limits

The Writer's Toolkit prioritizes analysis quality above all else. To ensure professional-grade insights, we require Claude's full 32K token thinking capacity for all analyses.

**Why does this matter?** 
The difference between full and reduced thinking capacity is significant - similar to the difference between a quick skim and a deep read of your manuscript. Our tools guarantee the thoroughness that professional writers deserve.

**Manuscript Size Limits:**
- Maximum manuscript size: ~164,000 tokens (~123,000 words)
- If your manuscript exceeds this size, the analysis will abort rather than produce lower-quality results

**What to do with larger manuscripts:**
1. Split your manuscript into logical sections and analyze each separately
2. Focus analysis on specific chapters or sections that need the most attention
3. Remove any unnecessary content before analysis (e.g., notes, formatting marks)
4. Wait for upcoming context window improvements (Claude's context window is expected to increase to 500K in future releases)

**Technical Details:**
The system automatically calculates token budgets to maximize thinking capacity while ensuring sufficient space for thorough visible output. It will adjust visible output size when needed but will never compromise on thinking capacity.

For developer reference, the Token Budget Calculator prioritizes:
1. Full thinking budget (32K tokens)
2. Desired output (12K tokens when space allows)
3. Minimum output (4K tokens at minimum)

Manuscripts exceeding the size limit receive a clear error message rather than proceeding with reduced thinking capacity, as this would compromise our quality standards.

---

Here’s a concise breakdown of the **core types of editing** used in
book creation, focusing on definitions and purposes:

---

### **1. Developmental Editing**  
- **Purpose**: Big-picture shaping of the manuscript.  
- **Focus**:  
  - Structure, plot, pacing, character arcs (fiction).  
  - Argument flow, organization, clarity (non-fiction).  
- **Example**: Fixing plot holes, suggesting new chapters, or reordering sections.  

---

### **2. Line Editing**  
- **Purpose**: Enhancing readability and voice.  
- **Focus**:  
  - Sentence flow, rhythm, and tone.  
  - Word choice, eliminating redundancy, and improving clarity.  
- **Example**: Rewriting clunky sentences or adjusting dialogue to sound more natural.  

---

### **3. Copyediting**  
- **Purpose**: Technical precision and consistency.  
- **Focus**:  
  - Grammar, spelling, punctuation.  
  - Adherence to style guides (e.g., *Chicago Manual of Style*).  
  - Consistency in terms, timelines, or formatting (e.g., “UK vs. US spelling”).  
- **Example**: Correcting “their” vs. “there” or ensuring “e-mail” becomes “email” throughout.  

---

### **4. Proofreading**  
- **Purpose**: Final polish before publication.  
- **Focus**:  
  - Catching typos, formatting errors, or layout issues (e.g., misplaced page numbers).  
  - No major rewriting—just surface-level fixes.  
- **Example**: Fixing a missing period or a widow/orphan line in a printed book.  

---

### **5. Substantive Editing** (a blend of developmental + line editing)  
- **Purpose**: Deep revision of content and language.  
- **Focus**:  
  - Improving both structure *and* prose.  
  - Often used in academic or complex non-fiction.  
- **Example**: Streamlining a dense research chapter while clarifying jargon.  

---

### **6. Sensitivity Reading**  
- **Purpose**: Ensuring respectful, accurate representation.  
- **Focus**:  
  - Cultural, racial, gender, or disability-related content.  
  - Often performed by external experts.  
- **Example**: Flagging stereotypes in a character’s portrayal.  

---

### **7. Fact-Checking** (common in non-fiction/memoir)  
- **Purpose**: Verifying accuracy.  
- **Focus**:  
  - Dates, names, quotes, scientific claims, or historical events.  
- **Example**: Confirming a cited study actually supports the author’s argument.  

---

### **8. Editorial Assessment**  
- **Purpose**: A high-level critique *before* full editing.  
- **Focus**:  
  - A 5–10 page report identifying strengths/weaknesses.  
  - No in-manuscript edits—just guidance.  
- **Example**: “The memoir’s middle section sags; consider cutting Chapter 8.”  

---

### **Key Differences**  
- **Developmental**: “Does this story *work*?”  
- **Line**: “Does this sentence *sing*?”  
- **Copy**: “Is this sentence *correct*?”  
- **Proofreading**: “Is this sentence *perfect*?”  

Most manuscripts go through multiple rounds (e.g., developmental → line → copy → proofreading). Let me know if you want deeper dives into any! 📚
