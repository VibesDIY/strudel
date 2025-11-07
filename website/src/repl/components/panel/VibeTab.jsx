import { useState } from 'react';
import { callAI } from 'use-vibes';
import { logger } from '@strudel/core';

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

  const handleVibe = async () => {
    if (!prompt.trim()) {
      logger('[vibe] Please enter a prompt', 'warning');
      return;
    }

    setLoading(true);
    try {
      const currentCode = context.editorRef.current?.code || '';

      const fullPrompt = `${STRUDEL_LLM_CONTEXT}

User request: ${prompt}

Current code:
${currentCode}`;

      logger('[vibe] Calling AI...', 'highlight');
      const aiResponse = await callAI(fullPrompt, {
        model: "anthropic/claude-3-opus",
        temperature: 0.7,
        max_tokens: 2000,
      });

      setResponse(aiResponse);
      logger('[vibe] Response received', 'success');
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
          className="px-4 py-2 bg-foreground bg-opacity-10 hover:bg-opacity-20 disabled:bg-opacity-5 rounded text-foreground cursor-pointer disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'vibing...' : 'vibe'}
        </button>
      </div>

      {response && (
        <div className="flex-1 overflow-auto bg-background p-3 rounded border border-foreground border-opacity-20">
          <pre className="whitespace-pre-wrap text-sm font-mono">{response}</pre>
        </div>
      )}
    </div>
  );
}
