import { useState } from 'react';
import { callAI } from 'use-fireproof';
import { logger } from '@strudel/core';

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

      const fullPrompt = `${prompt}\n\nCurrent code:\n${currentCode}`;

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
