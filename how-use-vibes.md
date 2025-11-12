# How Strudel Uses the `use-vibes` Package

This document provides a comprehensive exposition of how the Strudel live coding environment integrates and utilizes the `use-vibes` package.

## Overview

Strudel is a browser-based music live coding environment (a JavaScript port of TidalCycles). The `use-vibes` package provides two critical capabilities that enhance Strudel's functionality:

1. **Fireproof Database** - Local-first, embedded database for version history and pattern storage
2. **callAI Function** - LLM integration for AI-assisted code generation

## Package Import Locations

```javascript
// File: website/src/repl/fireproofHistory.js
import { fireproof } from 'use-vibes';

// File: website/src/repl/components/panel/VibeTab.jsx
import { callAI } from 'use-vibes';
```

---

## Feature 1: Local Version History with Fireproof

### Purpose

Strudel uses Fireproof to implement a local-first version control system for musical patterns. Users can save snapshots of their code (Ctrl+S) and restore previous versions without any server infrastructure.

### Architecture

**File:** `website/src/repl/fireproofHistory.js`

This module wraps Fireproof's API to provide version history specifically tailored for Strudel patterns.

### Fireproof Database Initialization

```javascript
let db;
let initialized = false;

export function initHistory() {
  if (initialized) return db;

  db = fireproof('strudel-history');  // Named database in IndexedDB
  initialized = true;

  return db;
}
```

**What this does:**
- Creates a Fireproof database named `'strudel-history'`
- Data persists in the browser's IndexedDB
- Single initialization pattern ensures one database instance
- No configuration required - works out of the box

### Core Operations

#### 1. Saving Pattern Snapshots

```javascript
export async function saveVersion(code, patternId = null) {
  if (!db) initHistory();

  const version = {
    type: 'version',
    code,
    patternId,              // Links snapshot to a specific pattern
    timestamp: Date.now(),
    preview: generatePreview(code),  // First line or title comment
  };

  const result = await db.put(version);
  console.log('[fireproof] saved version:', result.id, 'for pattern:', patternId);
  return { ...version, _id: result.id };
}
```

**Fireproof APIs used:**
- `db.put(document)` - Inserts document, returns `{ id, ok }`
- Auto-generates `_id` if not provided
- Immutable documents (updates create new versions)

**When triggered:**
- User presses Ctrl+S in the code editor
- Keybinding handled in `website/src/repl/useReplContext.jsx:100-119`

#### 2. Querying Version History

```javascript
export async function getRecentVersions(limit = 20, patternId = null) {
  if (!db) initHistory();

  try {
    const result = await db.query(
      (doc) => doc.type === 'version' ? doc.timestamp : null,
      {
        descending: true,   // Newest first
        limit: patternId ? 1000 : limit
      }
    );

    let versions = result.rows.map(row => {
      const doc = row.doc || row.value;
      return {
        _id: row.id || doc._id,
        type: doc.type,
        code: doc.code,
        patternId: doc.patternId,
        timestamp: doc.timestamp,
        preview: doc.preview
      };
    });

    // Filter by pattern if specified
    if (patternId) {
      versions = versions.filter(v => v.patternId === patternId);
      versions = versions.slice(0, limit);
    }

    return versions;
  } catch (err) {
    console.error('[fireproof] error loading versions:', err);
    return [];
  }
}
```

**Fireproof APIs used:**
- `db.query(mapFn, options)` - MapReduce-style queries
- Map function returns index value (timestamp) or null to exclude
- Options: `descending`, `limit` for pagination
- Returns `{ rows: [...] }` where each row has `id`, `key`, `value`, `doc`

**Query Strategy:**
1. Index by timestamp for chronological ordering
2. Return null for non-version documents (filtered out)
3. Client-side filtering by patternId (could be optimized with compound index)
4. Used by PatternsTab to display history list

#### 3. Duplicate Detection

```javascript
export async function isDuplicateSnapshot(code, patternId = null) {
  if (!db) initHistory();

  try {
    const versions = await getRecentVersions(50, patternId);
    return versions.some(v => v.code === code);
  } catch (err) {
    console.error('[fireproof] error checking for duplicates:', err);
    return false; // On error, allow save
  }
}
```

**Purpose:**
- Prevents saving identical snapshots
- Checks last 50 versions for the pattern
- Simple string equality on code content

#### 4. Document Retrieval and Deletion

```javascript
export async function getVersion(id) {
  if (!db) initHistory();
  return await db.get(id);
}

export async function deleteVersion(id) {
  if (!db) initHistory();
  try {
    const result = await db.del(id);
    console.log('[fireproof] deleted version:', id);
    return result;
  } catch (err) {
    console.error('[fireproof] error deleting version:', err);
    throw err;
  }
}
```

**Fireproof APIs used:**
- `db.get(id)` - Fetch document by ID
- `db.del(id)` - Delete document (creates tombstone in CRDTs)

### Data Model

#### Version Document Schema

```javascript
{
  _id: "auto-generated-uuid",
  type: "version",
  code: "s(\"bd sd hh sd\")",
  patternId: "pattern-abc123",
  timestamp: 1704067200000,
  preview: "Basic drum pattern"
}
```

**Fields:**
- `type`: Document type discriminator (allows multiple schemas in one DB)
- `code`: Full Strudel pattern code
- `patternId`: Links snapshot to specific pattern (nullable)
- `timestamp`: Unix milliseconds for sorting
- `preview`: Display-friendly title (extracted from code comments)

### Analytics Queries

The module provides aggregation functions for UI statistics:

```javascript
// Count all snapshots
export async function getTotalVersionCount() {
  const result = await db.query(
    (doc) => doc.type === 'version' ? doc.timestamp : null,
    { descending: true, limit: 10000 }
  );
  return result.rows.length;
}

// Group by pattern
export async function getSnapshotCountByPattern() {
  const result = await db.query(/* ... */);
  const counts = {};
  result.rows.forEach(row => {
    const doc = row.doc || row.value;
    const patternId = doc.patternId;
    if (patternId) {
      counts[patternId] = (counts[patternId] || 0) + 1;
    }
  });
  return counts;
}

// List all patterns with snapshots
export async function getAllSnapshotPatternIds() {
  const result = await db.query(/* ... */);
  const patternIds = new Set();
  result.rows.forEach(row => {
    const doc = row.doc || row.value;
    if (doc.patternId) {
      patternIds.add(doc.patternId);
    }
  });
  return Array.from(patternIds);
}
```

**Use cases:**
- Display "3 snapshots saved" in UI
- Show per-pattern snapshot counts
- Identify orphaned patterns (have snapshots but no active reference)

### Integration Points

#### 1. Keyboard Shortcut Handler

**File:** `website/src/repl/useReplContext.jsx`

```javascript
useEffect(() => {
  const handleKeyDown = async (e) => {
    // Ctrl+S or Cmd+S: Save snapshot
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      const code = editorRef.current?.code;
      const patternId = getViewingPatternData()?.id;

      if (code) {
        const isDuplicate = await isDuplicateSnapshot(code, patternId);
        if (!isDuplicate) {
          await saveVersion(code, patternId);
          logger('[snapshot] Saved', 'success');
        } else {
          logger('[snapshot] Duplicate - not saved', 'warning');
        }
      }
    }

    // Ctrl+Shift+S: Open history
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && e.shiftKey) {
      e.preventDefault();
      setIsPanelOpened(true);
      setActiveFooter('patterns');
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

#### 2. Patterns Tab UI

**File:** `website/src/repl/components/panel/PatternsTab.jsx`

Displays snapshot history in a list with:
- Timestamp formatting (e.g., "2m ago", "5h ago")
- Preview text (first line of code)
- Load/delete actions
- Pattern grouping

#### 3. Initialization

**File:** `website/src/repl/useReplContext.jsx`

```javascript
useEffect(() => {
  if (typeof window !== 'undefined') {
    initHistory();
    // Expose for debugging
    window.createTestSnapshot = createTestSnapshot;
  }
}, []);
```

### Why Fireproof Was Chosen

1. **Zero Infrastructure** - No backend required, works offline
2. **Immutability** - Perfect for version control (CRDTs)
3. **Query Capabilities** - MapReduce for filtering/sorting
4. **Browser Native** - IndexedDB storage, no dependencies
5. **Simple API** - `put/get/del/query` covers all use cases

### Current Limitations & Future

**Current:**
- Client-side filtering by patternId (queries entire collection)
- No compound indexes
- 10,000 document limit for counts
- No sync between devices

**Future Possibilities (with use-vibes):**
- Sync via Fireproof's built-in replication
- Cloud backup
- Shared pattern libraries
- Real-time collaboration

---

## Feature 2: AI-Assisted Code Generation with callAI

### Purpose

Strudel's "Vibe" tab allows users to modify their patterns using natural language. Instead of manually editing code, users can type requests like "add more hi-hats" or "make it darker and slower", and Claude generates the modified pattern.

### Architecture

**File:** `website/src/repl/components/panel/VibeTab.jsx`

This React component provides a chat-like interface where users can:
1. Select code in the editor (or use entire pattern)
2. Type a natural language prompt
3. Receive AI-generated modifications
4. Auto-evaluate the new pattern

### callAI Integration

#### Core Request Structure

```javascript
const aiResponse = await callAI(userPrompt, {
  model: "anthropic/claude-sonnet-4.5",
  temperature: 0.7,
  max_tokens: 4000,
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "A short, descriptive name for the groove"
      },
      code: {
        type: "string",
        description: "The JavaScript/Strudel code"
      },
      explanation: {
        type: "string",
        description: "Brief explanation of changes made"
      }
    },
    required: ["name", "code"]
  },
  ...(apiKey && { apiKey })
});
```

**callAI Features Used:**

1. **Model Selection**
   - Uses OpenRouter routing
   - Model: `anthropic/claude-sonnet-4.5`
   - High-quality code generation with musical understanding

2. **Structured Output (Schema)**
   - Returns JSON with guaranteed fields
   - Separates code from explanation
   - Includes pattern name for UI display

3. **API Key Handling**
   - Optional apiKey parameter
   - Priority: localStorage → window.CALLAI_API_KEY → import.meta.env.PUBLIC_OPENROUTER_API_KEY
   - Falls back to OpenRouter's free tier if no key provided

4. **Temperature & Tokens**
   - `temperature: 0.7` - Creative but consistent
   - `max_tokens: 4000` - Full patterns with explanations

### System Prompt Engineering

The key to Strudel's AI integration is the comprehensive system prompt:

```javascript
const STRUDEL_LLM_CONTEXT = `## Strudel (LLM Prompt Spec — compact)

### Core idea
Patterns loop over **1 cycle** by default. Space separates events within a cycle.

### Mini‑notation (inside quotes)
- Sequence: \`"a b c"\` (equal subdivisions)
- Rest: \`"~"\`
- Parallel (stack): \`"a,b"\`
- Concatenate: \`"<a b>"\`
- Group: \`"[a b]"\`
- Repeat: \`"x*2"\` ↔ \`.fast(2)\`
- Euclidean: \`"x(3,8)"\`

### Pattern builders
- \`stack(p1, p2)\` parallel layers
- \`cat(p1, p2)\` cycle concatenation

### Sound & notes
- \`s("bd hh sd")\` samples
- \`note("c4 d4 g4")\` or MIDI numbers

### Common params
- \`.gain(n)\` \`.pan(0..1)\`
- \`.lpf(hz)\` \`.hpf(hz)\` \`.resonance(q)\`
- \`.room(0..1)\` \`.delay(time)\`

### Text-to-speech
- \`.speak(lang, voice)\`
- IMPORTANT: Audio effects don't work with speak()
- Only time methods work after speak (slow, fast, delay)

### Available sounds
${soundNames.join(', ')}
`;
```

**Dynamic Elements:**
- Available sounds list (from loaded sample banks)
- Strudel syntax reference
- Audio effect limitations
- Real examples

### Context-Aware Prompting

The full prompt includes:

```javascript
const userPrompt = `${STRUDEL_LLM_CONTEXT}${availableSounds}

User request: ${prompt}

Current groove name: ${currentName}

Complete current code:
\`\`\`js
${currentCode}
\`\`\`

${isPartialSelection ? `
Selected region to modify (${selectionRange.from}-${selectionRange.to}):
\`\`\`js
${selectedText}
\`\`\`

IMPORTANT: Provide replacement code that fits exactly in this selected region.
` : `You are modifying the entire code.`}

Provide:
1. An updated name for this groove
2. The replacement code (${isPartialSelection ? 'for the selected region' : 'entire file'})
3. A brief explanation of changes
`;
```

**Context Provided to AI:**
1. **Strudel Language Spec** - Syntax rules, functions, available sounds
2. **Current State** - Full pattern code and groove name
3. **Selection Context** - If user selected specific lines, only modify those
4. **Character Positions** - Exact range for replacements
5. **User Intent** - Natural language request

### Selection-Based Editing

One of the most sophisticated features:

```javascript
// Get selection from CodeMirror
const editor = context.editorRef.current?.editor;
const state = editor.state;
const selection = state.selection.main;

if (!selection.empty) {
  // User selected specific code
  selectedText = state.doc.sliceString(selection.from, selection.to);
  selectionRange = { from: selection.from, to: selection.to };
} else {
  // No selection - treat entire document as selected
  selectedText = currentCode;
  selectionRange = { from: 0, to: state.doc.length };
}
```

**Why this matters:**
- User can modify just one layer of a stack
- AI knows context (full pattern) but only replaces selection
- Prevents unintended changes to working code

### Code Replacement & Name Update

```javascript
// Parse structured response
const { name, code, explanation } = responseData;

// Show explanation in sidebar
setResponse(explanation || 'Changes applied');

// Replace selection with the code
const changes = [
  {
    from: selectionRange.from,
    to: selectionRange.to,
    insert: code
  }
];

// Update name comment at the beginning
const firstLineEnd = state.doc.lineAt(1).to;
const hasNameComment = state.doc.sliceString(0, firstLineEnd).match(/^\/\/\s*.+$/);

if (hasNameComment) {
  changes.push({
    from: 0,
    to: firstLineEnd,
    insert: `// ${name}`
  });
} else {
  changes.push({
    from: 0,
    to: 0,
    insert: `// ${name}\n`
  });
}

editor.dispatch({ changes });
```

**CodeMirror Transaction:**
- Atomic update (both changes apply together)
- Maintains undo history
- Preserves cursor position

### Auto-Evaluation

After AI modifies code, it automatically plays:

```javascript
// Trigger evaluation (same as Ctrl+Enter)
if (context.handleEvaluate) {
  setTimeout(() => context.handleEvaluate(), 100);
}

logger(`[vibe] "${name}" - ${explanation || 'Changes applied'}`, 'success');
```

**User Experience:**
1. Type prompt: "make it faster"
2. Press Enter
3. AI generates new code
4. Code updates in editor
5. Pattern starts playing immediately
6. User hears the changes

### UI Component Structure

```jsx
<div className="vibe-tab">
  <div className="prompt-input">
    <input
      value={prompt}
      onChange={(e) => setPrompt(e.target.value)}
      onKeyDown={handleKeyDown}  // Enter to submit
      placeholder="Enter your prompt... (Enter to send)"
      disabled={loading}
    />
    <button onClick={handleVibe} disabled={loading}>
      {loading ? 'vibing...' : 'vibe'}
    </button>
  </div>

  {selection && (
    <div className="selected-text">
      <div>Selected text:</div>
      <pre>{selection}</pre>
    </div>
  )}

  {response && (
    <div className="ai-response">
      <pre>{response}</pre>
    </div>
  )}
</div>
```

**State Management:**
- `prompt` - User's natural language request
- `response` - AI's explanation of changes
- `loading` - Shows "vibing..." during API call
- `selection` - Preview of selected code

### Error Handling

```javascript
try {
  const aiResponse = await callAI(userPrompt, options);
  // ... handle response
} catch (error) {
  console.error('[vibe] callAI error:', error);
  logger(`[vibe] Error: ${error.message}`, 'error');
  setResponse(`Error: ${error.message}`);
}
```

**Error Types:**
- Network failures
- API key issues
- Rate limiting
- Invalid responses
- JSON parse errors

### Why callAI Was Chosen

1. **Simple API** - Single function call, no complex setup
2. **Structured Output** - Schema validation ensures parseable responses
3. **Model Routing** - OpenRouter access to best models
4. **Flexible Auth** - Works with or without API keys
5. **No Backend** - All requests from client browser

### Performance Considerations

**Request Size:**
- Full pattern code: ~1-10KB
- System prompt: ~3KB
- Total context: ~5-15KB per request
- Response: ~1-5KB (code + explanation)

**Latency:**
- Typical: 2-5 seconds for Claude Sonnet
- Depends on pattern complexity
- User sees "vibing..." indicator

**Caching:**
- No caching of AI responses (each generation is unique)
- System prompt could be cached (not implemented)

### API Key Management

```javascript
const apiKey = typeof window !== 'undefined'
  ? localStorage.getItem('openrouter_api_key') ||
    window.CALLAI_API_KEY ||
    import.meta.env.PUBLIC_OPENROUTER_API_KEY
  : undefined;
```

**Priority Order:**
1. **localStorage** - User sets in browser devtools
2. **window.CALLAI_API_KEY** - Injected by hosting environment
3. **import.meta.env** - Build-time environment variable
4. **Fallback** - OpenRouter free tier (limited)

**Configuration:**
```bash
# .env file
PUBLIC_OPENROUTER_API_KEY=sk-or-v1-...
```

### Future Enhancements

**Current:**
- Single-turn conversations (no history)
- Selection-based editing
- Auto-play after generation

**Potential (with use-vibes):**
- Multi-turn refinement ("make it even faster")
- Voice input via Web Speech API
- Pattern suggestions based on history
- Collaborative editing with shared vibes

---

## Combined Architecture

### How Fireproof and callAI Work Together

While they serve different purposes, both features share architectural principles:

1. **Client-Side First**
   - No backend servers required
   - Works offline (Fireproof) or with minimal network (callAI)
   - Data stays in user's browser

2. **Progressive Enhancement**
   - Core functionality works without use-vibes
   - Features gracefully degrade if unavailable
   - No hard dependencies

3. **React Integration**
   - Hooks-based (useState, useEffect, useCallback)
   - Async operations handled properly
   - Loading states for UX

### Data Flow Diagram

```
User Action
    ↓
┌───────────────────────────────────────┐
│  Strudel REPL (React)                │
│  - Code Editor (CodeMirror)          │
│  - Pattern Scheduler                 │
│  - UI Tabs (Patterns, Vibe, etc.)   │
└───────────────────────────────────────┘
    ↓                           ↓
[Ctrl+S]                   [Enter prompt]
    ↓                           ↓
┌──────────────────┐      ┌────────────────┐
│  fireproof()     │      │  callAI()      │
│  - save snapshot │      │  - send prompt │
│  - IndexedDB     │      │  - get code    │
└──────────────────┘      └────────────────┘
    ↓                           ↓
[Ctrl+Shift+S]              [Auto-insert]
    ↓                           ↓
┌──────────────────┐      ┌────────────────┐
│  query()         │      │  editor.       │
│  - load history  │      │  dispatch()    │
│  - display list  │      │  - update code │
└──────────────────┘      └────────────────┘
    ↓                           ↓
[Click Load]                [Evaluate]
    ↓                           ↓
┌─────────────────────────────────────────┐
│  Pattern Playing                        │
│  - Web Audio API                        │
│  - Visual Feedback                      │
└─────────────────────────────────────────┘
```

### Module Boundaries

```
use-vibes Package
├── fireproof          (CRDT database)
│   ├── put()         → Save documents
│   ├── get()         → Fetch by ID
│   ├── del()         → Delete documents
│   └── query()       → MapReduce queries
│
└── callAI            (LLM integration)
    ├── model         → Route to Claude/GPT
    ├── schema        → Structured output
    ├── apiKey        → Authentication
    └── response      → JSON with code
```

---

## Testing & Debugging

### Fireproof Debugging

The module exposes a test function:

```javascript
// Exposed on window object
window.createTestSnapshot = async function() {
  const versions = await getRecentVersions(1);
  if (versions.length === 0) return null;

  const original = versions[0];
  const copy = {
    type: 'version',
    code: original.code,
    patternId: original.patternId.split('').reverse().join(''),
    timestamp: Date.now(),
    preview: original.preview
  };

  return await db.put(copy);
}
```

**Usage in browser console:**
```javascript
await window.createTestSnapshot()
// Creates a test snapshot with reversed patternId
```

### callAI Debugging

Enable verbose logging:

```javascript
console.log('[vibe] Calling AI...', {
  prompt,
  currentCode: currentCode.substring(0, 100),
  selectionRange,
  model: "anthropic/claude-sonnet-4.5"
});
```

**Check API response:**
```javascript
const aiResponse = await callAI(userPrompt, options);
console.log('[vibe] Raw response:', aiResponse);
console.log('[vibe] Parsed:', JSON.parse(aiResponse));
```

---

## Dependencies and Version Management

### Package Version

**File:** `website/package.json`

```json
{
  "dependencies": {
    "use-vibes": "*"
  }
}
```

**Current version:** 0.15.17 (as of last install)

**Update strategy:**
- Wildcard `*` ensures latest version
- Breaking changes handled via feature detection
- No version pinning (trusts semantic versioning)

### Import Resolution

**ESM only:**
```javascript
import { fireproof } from 'use-vibes';  // ESM
import { callAI } from 'use-vibes';     // ESM

// NOT:
const { fireproof } = require('use-vibes');  // ❌ CommonJS
```

**Build tool:** Vite
- Native ESM support
- Tree-shaking compatible
- No transpilation needed for use-vibes

---

## Security Considerations

### API Keys

1. **Never committed to git**
   - `.env` file in `.gitignore`
   - Only `.env.example` committed

2. **Client-side exposure**
   - `PUBLIC_` prefix means key is in client bundle
   - Anyone can inspect and reuse
   - Rate limiting on OpenRouter side

3. **Recommended approach**
   - Development: Personal API keys in `.env`
   - Production: Environment variables in Netlify
   - Free tier: No key (limited usage)

### Data Privacy

**Fireproof (Local):**
- All data stays in browser
- No server uploads
- User controls deletion
- IndexedDB can be cleared

**callAI (Remote):**
- Pattern code sent to OpenRouter → Anthropic
- No personal data in prompts
- No pattern storage on AI side
- Consider private patterns before using AI features

---

## Performance Impact

### Bundle Size

```javascript
// use-vibes breakdown (estimated)
import { fireproof }  // ~50KB (includes IndexedDB adapter)
import { callAI }     // ~10KB (HTTP client + JSON handling)
// Total: ~60KB gzipped
```

**Strudel total bundle:** ~500KB
**use-vibes contribution:** ~12% of bundle

### Runtime Performance

**Fireproof:**
- `put()`: ~1-5ms (IndexedDB write)
- `get()`: <1ms (IndexedDB read)
- `query()`: 5-50ms (depends on dataset size)
- No perceptible latency for users

**callAI:**
- Network latency: 2-5 seconds
- UI remains responsive (async)
- Loading indicators prevent confusion

---

## Browser Compatibility

### Requirements

**Fireproof:**
- IndexedDB (all modern browsers)
- ES6 async/await
- No polyfills needed

**callAI:**
- Fetch API (all modern browsers)
- Promise support
- JSON parsing

**Minimum supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Not supported:**
- Internet Explorer (any version)
- Opera Mini (lacks IndexedDB)

---

## Conclusion

The `use-vibes` package provides two essential capabilities for Strudel:

1. **Fireproof** enables offline-first version control, allowing musicians to experiment freely knowing they can revert to any previous state. This reduces anxiety around breaking working patterns and encourages exploration.

2. **callAI** democratizes music coding by letting users express intent in natural language. Instead of memorizing syntax, users can say "make it groovy" or "add a bassline" and let AI translate that into code.

Together, these features make Strudel more accessible to beginners while maintaining the power and flexibility that experienced live coders expect. The local-first architecture ensures low latency and offline capability, while the AI integration leverages cutting-edge language models without requiring backend infrastructure.

The integration is clean, with only two import statements and straightforward APIs. Both features are optional (Strudel works fine without them) but significantly enhance the user experience when present.

---

## Contact & Attribution

**Strudel Project:**
- Website: https://strudel.cc
- Repository: https://codeberg.org/uzu/strudel
- License: AGPL-3.0-or-later

**use-vibes Package:**
- Author: Fireproof/Vibes team
- Version: 0.15.17
- Used under permissive license

**This document:**
- Last updated: 2025-01-12
- Maintained by: Strudel contributors
- Purpose: Required exposition for use-vibes package authors
