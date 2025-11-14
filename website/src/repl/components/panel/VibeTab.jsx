import { useState, useMemo } from 'react';
import { callAI, useFireproof } from 'use-vibes';
import { logger } from '@strudel/core';
import { soundMap } from '@strudel/webaudio';
import { useStore } from '@nanostores/react';

// Strudel language context for LLM
const STRUDEL_LLM_CONTEXT = `## Strudel (LLM Prompt Spec — compact)

### Core idea
Patterns loop over **1 cycle** by default. Space separates events within a cycle. Most functions accept **numbers or patterns** and are chainable.

### Mini‑notation (inside quotes)
- Sequence: \`"a b c"\` (equal subdivisions per cycle)
- Rest: \`"~"\`
- Parallel (stack): \`"a,b"\`  ↔ \`stack(a,b)\`
- Concatenate across cycles: \`"<a b>"\`
- Group/subdivide: \`"[a b]"\` (keeps items together)
- Repeat / speed: \`"x*2"\`  ↔ \`.fast(2)\`
- Slow (stretch): \`"x/2"\`   ↔ \`.slow(2)\`
- Euclidean: \`"x(3,8)"\`, rotation \`"x(3,8,1)"\`

### Pattern builders (JS)
- \`stack(p1, p2, ...)\` parallel layers
- \`cat(p1, p2, ...)\`   cycle‑by‑cycle concatenation
- \`seq(p1, p2, ...)\`   sequence within a cycle
- Polymeter: \`"{a b, x y}"\`

### Sound & notes
- \`s("bd hh sd")\` or \`.sound("triangle")\` to select samples/synths
- \`note("c4 d4 g4")\` letters **or** MIDI numbers \`"60 62 67"\`
- **Chords (simultaneous):** \`note("[c3,eb3,g3]")\`
- **Alternate chords:** \`note("<[c3,eb3,g3] [f3,a3,c4]>")\`

### Time utilities
- \`.fast(n)\` \`.slow(n)\` \`.euclid(k,n)\` \`.euclidRot(k,n,rot)\`
- \`.swing(amount)\` human shuffle (0–1)
- \`.nudge(cycles)\` small time shift (±)

### Common params (numbers or patterns)
- Level/pan: \`.gain(n)\` \`.pan(0..1)\`
- Filters: \`.lpf(hz)\`/\`.cutoff(hz)\`, \`.hpf(hz)\`/\`.hcutoff(hz)\`, \`.resonance(q)\`/\`.lpq(q)\`
- Envelope: \`.attack(s)\` \`.decay(s)\` \`.sustain(0..1)\` \`.release(s)\`
- Space/time: \`.room(0..1)\` \`.delay(time)\`
- Extras (examples): \`.phaser(n)\` \`.vib(n)\` \`.tremolo(n)\`

### Text-to-speech
- \`.speak(lang, voice)\` text-to-speech using Web Speech API
- \`lang\`: language code (e.g., "en", "de", "fr")
- \`voice\`: voice index (0-based, depends on browser voices)
- **IMPORTANT:** Audio effects (gain, room, echo, etc.) don't work with \`.speak()\`. Only use time methods (slow, fast, delay).
- Example: \`cat("hello", "world").speak("en", 0).slow(2)\` ✓
- Example: \`cat("hello", "world").gain(0.5).speak("en", 0)\` ✗ (don't mix audio effects with speak)
- Can pattern parameters: \`.speak("en de".slow(2), "<0 1 2>")\`

### Example
\`\`\`js
stack(
  s("bd ~ sd ~"),
  s("hh*8"),
  note("<c2 c2 g1 c2>").s("sawtooth").lpf(400).gain(0.8)
).swing(0.6)
\`\`\`
`;

// Helper to wait for login completion
function waitForLogin() {
  return new Promise((resolve) => {
    if (document.body.classList.contains('vibes-connect-true')) {
      resolve();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('vibes-connect-true')) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });
}

export function VibeTab({ context }) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState('');

  // Initialize Fireproof for auth
  const { syncEnabled, enableSync } = useFireproof('strudel-history');

  // Get available sounds
  const sounds = useStore(soundMap);
  const availableSounds = useMemo(() => {
    if (!sounds) return '';
    const soundNames = Object.keys(sounds)
      .filter(key => !key.startsWith('_'))
      .sort();
    return soundNames.length > 0
      ? `\n\n### Available sounds\n${soundNames.join(', ')}`
      : '';
  }, [sounds]);

  const handleVibe = async () => {
    if (!prompt.trim()) {
      logger('[vibe] Please enter a prompt', 'warning');
      return;
    }

    // Check if user is logged in
    if (!syncEnabled) {
      logger('[vibe] Please log in to use AI features...', 'warning');
      setResponse('Logging in...');

      // Trigger login
      enableSync();

      // Wait for login to complete
      await waitForLogin();

      logger('[vibe] Login successful! Processing your request...', 'success');
    }

    setLoading(true);
    try {
      const editor = context.editorRef.current?.editor;
      let currentCode = context.editorRef.current?.code || '';

      // If file is empty, add a default comment
      if (!currentCode.trim()) {
        currentCode = '// new pattern';
        // Update editor with the default comment
        if (editor) {
          editor.dispatch({
            changes: {
              from: 0,
              to: editor.state.doc.length,
              insert: currentCode
            }
          });
        }
      }

      // Extract current name from first line if it exists
      const nameMatch = currentCode.match(/^\/\/\s*(.+)$/m);
      const currentName = nameMatch ? nameMatch[1] : 'Untitled groove';

      // Get selection from CodeMirror, or use entire document if nothing selected
      let selectedText = '';
      let selectionRange = null;
      if (editor) {
        const state = editor.state;
        const selection = state.selection.main;
        if (!selection.empty) {
          selectedText = state.doc.sliceString(selection.from, selection.to);
          selectionRange = { from: selection.from, to: selection.to };
        } else {
          // No selection - treat entire document as selected
          selectedText = currentCode;
          selectionRange = { from: 0, to: state.doc.length };
        }
      }

      setSelection(selectedText);

      // Determine if this is a partial selection or full document
      const isPartialSelection = selectionRange.from > 0 || selectionRange.to < (editor?.state.doc.length || 0);

      // Build comprehensive prompt
      const userPrompt = `${STRUDEL_LLM_CONTEXT}${availableSounds}

User request: ${prompt}

Current groove name: ${currentName}

Complete current code:
\`\`\`js
${currentCode}
\`\`\`

${isPartialSelection ? `Selected region to modify (${selectionRange.from}-${selectionRange.to}):
\`\`\`js
${selectedText}
\`\`\`

IMPORTANT: You must provide replacement code that fits exactly in this selected region. The code you provide will replace only this selection, so it must work within the context of the surrounding code.` : `You are modifying the entire code.`}

Provide:
1. An updated name for this groove that reflects the changes
2. The replacement code (only for the selected region${isPartialSelection ? '' : ' - the entire file'})
3. A brief explanation of what you changed`;

      logger('[vibe] Calling AI...', 'highlight');

      // Check for API key (for local dev)
      // Priority: localStorage > window global > import.meta.env
      const apiKey = typeof window !== 'undefined'
        ? localStorage.getItem('openrouter_api_key') ||
          window.CALLAI_API_KEY ||
          import.meta.env.PUBLIC_OPENROUTER_API_KEY
        : undefined;

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

      // Parse structured response
      let responseData;
      try {
        responseData = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;
      } catch (e) {
        // Fallback if not JSON
        responseData = { name: currentName, code: aiResponse, explanation: '' };
      }

      const { name, code, explanation } = responseData;

      // Show explanation in sidebar
      setResponse(explanation || 'Changes applied');

      // Replace selection with the code and update name
      if (selectionRange && editor) {
        const state = editor.state;

        // Find the first line (name comment)
        const firstLineEnd = state.doc.lineAt(1).to;
        const firstLineText = state.doc.sliceString(0, firstLineEnd);
        const hasNameComment = firstLineText.match(/^\/\/\s*.+$/);

        const changes = [
          // Replace selection with new code
          {
            from: selectionRange.from,
            to: selectionRange.to,
            insert: code
          }
        ];

        // Update or add name comment at the beginning
        if (hasNameComment) {
          // Replace existing name comment
          changes.push({
            from: 0,
            to: firstLineEnd,
            insert: `// ${name}`
          });
        } else {
          // Add name comment at the beginning
          changes.push({
            from: 0,
            to: 0,
            insert: `// ${name}\n`
          });
        }

        editor.dispatch({ changes });

        // Trigger evaluation (same as Ctrl+Enter)
        if (context.handleEvaluate) {
          setTimeout(() => context.handleEvaluate(), 100);
        }

        logger(`[vibe] "${name}" - ${explanation || 'Changes applied'}`, 'success');
      }
    } catch (error) {
      console.error('[vibe] callAI error:', error);
      logger(`[vibe] Error: ${error.message}`, 'error');
      setResponse(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleVibe();
    }
  };

  return (
    <div className="px-4 flex gap-2 flex-col w-full h-full text-foreground overflow-hidden">
      {!syncEnabled && (
        <div className="mt-2 p-3 bg-background border border-foreground border-opacity-20 rounded">
          <div className="text-xs opacity-70 mb-1">⚠️ Login required for AI features</div>
          <button
            onClick={enableSync}
            className="text-sm px-3 py-1 hover:opacity-70 text-foreground border border-foreground border-opacity-20 rounded"
          >
            Login Now
          </button>
        </div>
      )}

      <div className="flex gap-2 items-start pt-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={syncEnabled ? "Enter your prompt... (Enter to send)" : "Login to use AI features"}
          disabled={loading || !syncEnabled}
          className="flex-1 px-3 py-2 bg-background border border-foreground border-opacity-20 rounded text-foreground placeholder-foreground placeholder-opacity-50 focus:outline-none focus:border-opacity-50"
        />
        <button
          onClick={handleVibe}
          disabled={loading || !syncEnabled}
          className="px-4 py-2 hover:opacity-50 disabled:opacity-30 text-foreground cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? 'vibing...' : 'vibe'}
        </button>
      </div>

      {selection && (
        <div className="max-h-32 overflow-auto bg-background p-3 rounded border border-foreground border-opacity-20">
          <div className="text-xs opacity-50 mb-1">Selected text:</div>
          <pre className="whitespace-pre-wrap text-sm font-mono">{selection}</pre>
        </div>
      )}

      {response && (
        <div className="flex-1 overflow-auto bg-background p-3 rounded border border-foreground border-opacity-20 min-h-0">
          <pre className="whitespace-pre-wrap text-sm font-mono">{response}</pre>
        </div>
      )}
    </div>
  );
}
