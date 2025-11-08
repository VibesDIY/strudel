import { useState, useMemo } from 'react';
import { callAI } from 'use-vibes';
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

### Example
\`\`\`js
stack(
  s("bd ~ sd ~"),
  s("hh*8"),
  note("<c2 c2 g1 c2>").s("sawtooth").lpf(400).gain(0.8)
).swing(0.6)
\`\`\`
`;

export function VibeTab({ context }) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState('');

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

    setLoading(true);
    try {
      const editor = context.editorRef.current?.editor;
      const currentCode = context.editorRef.current?.code || '';

      // Get selection from CodeMirror
      let selectedText = '';
      let selectionRange = null;
      if (editor) {
        const state = editor.state;
        const selection = state.selection.main;
        if (!selection.empty) {
          selectedText = state.doc.sliceString(selection.from, selection.to);
          selectionRange = { from: selection.from, to: selection.to };
        }
      }

      setSelection(selectedText);

      // Build prompt based on whether there's a selection
      let userPrompt;
      if (selectedText) {
        userPrompt = `${STRUDEL_LLM_CONTEXT}${availableSounds}

User request: ${prompt}

Current code:
${currentCode}

Selected text to modify:
${selectedText}

Please provide only the replacement text for the selected region.`;
      } else {
        userPrompt = `${STRUDEL_LLM_CONTEXT}${availableSounds}

User request: ${prompt}

Current code:
${currentCode}`;
      }

      logger('[vibe] Calling AI...', 'highlight');

      // Check for API key (for local dev)
      // Priority: localStorage > window global > import.meta.env
      const apiKey = typeof window !== 'undefined'
        ? localStorage.getItem('openrouter_api_key') ||
          window.CALLAI_API_KEY ||
          import.meta.env.PUBLIC_OPENROUTER_API_KEY
        : undefined;

      const aiResponse = await callAI(userPrompt, {
        model: "anthropic/claude-haiku-4.5",
        temperature: 0.7,
        max_tokens: 2000,
        ...(apiKey && { apiKey })
      });

      // Show full response in sidebar
      setResponse(aiResponse);

      // If there was a selection, extract just the code and replace it
      if (selectionRange && editor) {
        // Extract code from markdown code blocks
        let codeToInsert = aiResponse;
        const codeBlockMatch = aiResponse.match(/```(?:js|javascript)?\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
          codeToInsert = codeBlockMatch[1];
        }

        editor.dispatch({
          changes: {
            from: selectionRange.from,
            to: selectionRange.to,
            insert: codeToInsert
          }
        });

        // Trigger evaluation (same as Ctrl+Enter)
        if (context.handleEvaluate) {
          setTimeout(() => context.handleEvaluate(), 100);
        }

        logger('[vibe] Selection replaced and evaluated', 'success');
      } else {
        logger('[vibe] Response received', 'success');
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleVibe();
    }
  };

  return (
    <div className="px-4 flex gap-2 flex-col w-full h-full text-foreground overflow-hidden">
      <div className="flex gap-2 items-start pt-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your prompt... (Ctrl+Enter to send)"
          disabled={loading}
          className="flex-1 px-3 py-2 bg-background border border-foreground border-opacity-20 rounded text-foreground placeholder-foreground placeholder-opacity-50 focus:outline-none focus:border-opacity-50"
        />
        <button
          onClick={handleVibe}
          disabled={loading}
          className="px-4 py-2 hover:opacity-50 disabled:opacity-30 text-foreground cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? 'vibing...' : 'vibe'}
        </button>
      </div>

      {selection && (
        <div className="bg-background p-3 rounded border border-foreground border-opacity-20">
          <div className="text-xs opacity-50 mb-1">Selected text:</div>
          <pre className="whitespace-pre-wrap text-sm font-mono">{selection}</pre>
        </div>
      )}

      {response && (
        <div className="flex-1 overflow-auto bg-background p-3 rounded border border-foreground border-opacity-20">
          <pre className="whitespace-pre-wrap text-sm font-mono">{response}</pre>
        </div>
      )}
    </div>
  );
}
