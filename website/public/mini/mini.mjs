import { fireproof } from 'https://esm.sh/use-fireproof';
import { callAI } from 'https://esm.sh/use-vibes';
import { soundMap } from 'https://esm.sh/superdough';

// Strudel LLM Context
const STRUDEL_CONTEXT = `## Strudel (LLM Prompt Spec — compact)

### Core idea
Patterns loop over **1 cycle** by default. Space separates events within a cycle. Most functions accept **numbers or patterns** and are chainable.

### Mini-notation (inside quotes)
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
- \`cat(p1, p2, ...)\`   cycle-by-cycle concatenation
- \`seq(p1, p2, ...)\`   sequence within a cycle

### Sound & notes
- \`s("bd hh sd")\` or \`.sound("triangle")\` to select samples/synths
- \`note("c4 d4 g4")\` letters **or** MIDI numbers \`"60 62 67"\`
- **Chords (simultaneous):** \`note("[c3,eb3,g3]")\`
- **Chord names:** \`chord("<Gm7 Cm7>").voicing()\`

### Time utilities
- \`.fast(n)\` \`.slow(n)\` \`.euclid(k,n)\`
- \`.swing(amount)\` human shuffle (0–1)

### Common params (numbers or patterns)
- Level/pan: \`.gain(n)\` \`.pan(0..1)\`
- Filters: \`.lpf(hz)\`, \`.hpf(hz)\`, \`.lpq(q)\`
- Envelope: \`.attack(s)\` \`.decay(s)\` \`.sustain(0..1)\` \`.release(s)\`
- Space: \`.room(0..1)\` \`.delay(time)\`
- Sample banks: \`.bank("RolandTR909")\`

### Example
\`\`\`js
stack(
  s("bd ~ sd ~"),
  s("hh*8"),
  note("<c2 c2 g1 c2>").s("sawtooth").lpf(400).gain(0.8)
).swing(0.6)
\`\`\`
`;

// Default song
const DEFAULT_SONG = `// Euclid Drive
stack(
  // drums
  stack(
    s("bd ~ bd ~, ~ sd ~ sd").bank("RolandTR909").gain(0.2),
    s("[hh oh]*4").struct("x(5,8,2)")
      .gain(0.15)
      .bank("RolandTR909")
      .lpf(1500)
      .room(0.2)
  )._pianoroll({ labels: 1, cycles: 2 }),
  // lead
  note("g3 bb3 d4 g4 d4 bb3 g3 d3").euclid(isaw.range(3,7).slow(4).floor(), 8)
    .s("gm_electric_guitar_muted")
    .dist(0.25).gain(0.75)
    .room(0.45)
    .release(0.25)
    .lpf(2000)._scope({ pos: 0.5 }),
  // bass
  note("g1 ~ d1 g1 ~ bb1 g1 ~")
    .sound("sawtooth")
    .lpf(400).lpq(4)
    .decay(0.15).sustain(0),
  // chords
  chord("<Gm7 Cm7 Dm7 Cm7>/2")
    .voicing()
    .sound("sawtooth")
    .lpf(sine.range(600, 1800).slow(8))
    .decay(0.3).sustain(0.2).release(0.5)
    .gain(0.4)
)`;

// API Key handling - support #key=xxx hash param
function initApiKey() {
  const hash = window.location.hash;
  const keyMatch = hash.match(/#key=([^&]+)/);
  if (keyMatch) {
    localStorage.setItem('openrouter_api_key', keyMatch[1]);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return localStorage.getItem('openrouter_api_key');
}

function updateKeyUI() {
  const hasKey = !!localStorage.getItem('openrouter_api_key');
  document.getElementById('apiKeyInput').style.display = hasKey ? 'none' : 'block';
  document.getElementById('vibePrompt').style.display = hasKey ? 'block' : 'none';
  document.getElementById('vibe').textContent = hasKey ? '✨ Vibe' : '🔑 Save Key';
  document.getElementById('balance').style.display = hasKey ? 'inline' : 'none';
}

// Fetch and display OpenRouter key limit remaining
async function updateBalance() {
  const apiKey = localStorage.getItem('openrouter_api_key');
  const balanceEl = document.getElementById('balance');
  if (!apiKey) {
    balanceEl.textContent = '';
    return;
  }

  balanceEl.textContent = '...';
  balanceEl.className = 'loading';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      balanceEl.textContent = response.status === 401 ? '⚠️ invalid key' : '⚠️ error';
      balanceEl.className = 'low';
      return;
    }

    const data = await response.json();
    const remaining = data.data?.limit_remaining;

    if (remaining === null || remaining === undefined) {
      // No limit set on key - show usage instead
      const usage = data.data?.usage || 0;
      balanceEl.textContent = `used $${usage.toFixed(2)}`;
      balanceEl.className = '';
    } else if (remaining < 0.02) {
      // Key exhausted - delete it
      localStorage.removeItem('openrouter_api_key');
      balanceEl.textContent = '';
      updateKeyUI();
      document.getElementById('status').textContent = 'API key expired (< $0.02 remaining)';
    } else {
      balanceEl.textContent = `$${remaining.toFixed(2)}`;
      balanceEl.className = remaining < 1 ? 'low' : '';
    }
  } catch (err) {
    console.error('[balance] Error:', err);
    balanceEl.textContent = '⚠️ error';
    balanceEl.className = 'low';
  }
}

// Initialize API key from hash
initApiKey();

// Fetch initial balance
updateBalance();

const db = fireproof('mini-strudel');
let currentSongId = null;
let editorInstance = null;

// Wait for strudel-editor to be ready
await customElements.whenDefined('strudel-editor');
const editorEl = document.getElementById('editor');

// Get editor instance once it's ready
const waitForEditor = setInterval(() => {
  if (editorEl.editor) {
    editorInstance = editorEl.editor;
    editorInstance.setAutocompletionEnabled(true);
    clearInterval(waitForEditor);
    // Set default song after a delay to ensure editor is fully ready
    setTimeout(() => {
      if (!editorInstance.code || editorInstance.code.trim() === '') {
        editorInstance.setCode(DEFAULT_SONG);
      }
      document.getElementById('status').textContent = 'Ready - Ctrl+Enter to play, Ctrl+S to save';
    }, 200);
  }
}, 100);

// Helper: get code from editor
function getEditorCode() {
  return editorInstance?.code || '';
}

// Helper: set code in editor
function setEditorCode(code) {
  if (editorInstance) {
    editorInstance.setCode(code);
  }
}

// Helper: generate preview from code
function generatePreview(code) {
  if (!code) return '(empty)';
  const titleMatch = code.match(/^\/\/\s*(.+)$/m);
  if (titleMatch) return titleMatch[1].trim();
  const firstLine = code.split('\n').find(l => l.trim()) || '';
  return firstLine.trim().substring(0, 40) + (firstLine.length > 40 ? '...' : '');
}

// Helper: format timestamp
function formatTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Vibe: Get available sounds from soundMap
function getAvailableSounds() {
  try {
    const sounds = soundMap.get() || {};
    const soundNames = Object.keys(sounds)
      .filter(key => !key.startsWith('_'))
      .sort();
    return soundNames.length > 0
      ? `\n\n### Available sounds\n${soundNames.join(', ')}`
      : '';
  } catch (e) {
    return '';
  }
}

// Vibe: Get editor selection
function getSelection() {
  if (!editorInstance) return { text: '', range: null };
  // editorInstance is StrudelMirror, access underlying CodeMirror via .editor
  const cm = editorInstance.editor;
  if (!cm || !cm.state) {
    // Fallback: use full code
    const code = getEditorCode();
    return { text: code, range: { from: 0, to: code.length } };
  }
  const state = cm.state;
  const sel = state.selection.main;
  if (!sel.empty) {
    return {
      text: state.doc.sliceString(sel.from, sel.to),
      range: { from: sel.from, to: sel.to }
    };
  }
  // No selection = entire document
  return {
    text: state.doc.toString(),
    range: { from: 0, to: state.doc.length }
  };
}

// Vibe: Call AI via use-vibes
async function vibeCall(prompt) {
  const apiKey = localStorage.getItem('openrouter_api_key');
  if (!apiKey) return null;

  const response = await callAI(prompt, {
    model: 'anthropic/claude-sonnet-4',
    temperature: 0.7,
    max_tokens: 4000,
    apiKey,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name for this groove' },
        code: { type: 'string', description: 'The Strudel code' },
        explanation: { type: 'string', description: 'Brief explanation of changes' }
      },
      required: ['code']
    }
  });

  return typeof response === 'string' ? JSON.parse(response) : response;
}

// Vibe: Handle vibe button
async function handleVibe() {
  const promptText = document.getElementById('vibePrompt').value.trim();
  if (!promptText) return;

  const vibeBtn = document.getElementById('vibe');
  const vibeResponse = document.getElementById('vibeResponse');

  vibeBtn.disabled = true;
  vibeBtn.textContent = '⏳ vibing...';
  vibeResponse.textContent = '';

  try {
    const { text: selectedText, range } = getSelection();
    const fullCode = getEditorCode();
    const isPartial = range && (range.from > 0 || range.to < fullCode.length);

    const availableSounds = getAvailableSounds();

    const userPrompt = `## Current Song
\`\`\`js
${fullCode}
\`\`\`

${STRUDEL_CONTEXT}${availableSounds}

## User Request
${promptText}

${isPartial ? `## Selected Region to Modify (chars ${range.from}-${range.to})
\`\`\`js
${selectedText}
\`\`\`
IMPORTANT: Provide replacement code for ONLY the selected region. It must fit in context of the surrounding code.` : '## Task\nModify the entire code above.'}

Return JSON with: name (short groove name), code (the replacement code only), explanation (brief)`;

    const result = await vibeCall(userPrompt);

    if (result && result.code && range) {
      // Ensure title comment at top
      let newCode = result.code;
      const title = result.name || 'Untitled';

      // If replacing entire doc, prepend title comment
      if (!isPartial) {
        // Remove existing title comment if present
        newCode = newCode.replace(/^\/\/\s*.+\n?/, '');
        newCode = `// ${title}\n${newCode.trim()}`;
      }

      // Replace selection with new code
      const cm = editorInstance.editor;
      if (cm) {
        cm.dispatch({
          changes: { from: range.from, to: range.to, insert: newCode }
        });
      } else {
        // Fallback: replace entire code
        setEditorCode(newCode);
      }

      // Show explanation
      vibeResponse.textContent = result.explanation || 'Done!';
      document.getElementById('status').textContent = result.name ? `✨ ${result.name}` : '✨ Vibed!';

      // Auto-evaluate
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('repl-evaluate'));
      }, 100);

      // Update balance after successful vibe
      updateBalance();
    }
  } catch (err) {
    console.error('[vibe] Error:', err);
    vibeResponse.textContent = `Error: ${err.message}`;
    document.getElementById('status').textContent = 'Vibe failed';
  } finally {
    vibeBtn.disabled = false;
    vibeBtn.textContent = '✨ Vibe';
  }
}

// Save pattern
async function savePattern() {
  const code = getEditorCode();
  if (!code.trim()) return;

  const pattern = {
    type: 'pattern',
    code,
    songId: currentSongId,
    timestamp: Date.now(),
    preview: generatePreview(code)
  };

  const result = await db.put(pattern);

  // If this was a new song (songId was null), this pattern becomes the song root
  if (currentSongId === null) {
    currentSongId = result.id;
  }

  document.getElementById('status').textContent = `Saved! (${formatTime(Date.now())})`;
  await renderSidebar();
}

// Load and render sidebar
async function renderSidebar() {
  const result = await db.query(
    (doc) => doc.type === 'pattern' ? doc.timestamp : null,
    { descending: true }
  );

  // Group patterns by song
  const songs = new Map(); // songId -> { root: pattern, children: [] }

  result.rows.forEach(row => {
    const doc = row.doc || row.value;
    const pattern = {
      _id: row.id || doc._id,
      code: doc.code,
      songId: doc.songId,
      timestamp: doc.timestamp,
      preview: doc.preview
    };

    if (pattern.songId === null) {
      // This is a song root
      if (!songs.has(pattern._id)) {
        songs.set(pattern._id, { root: pattern, children: [] });
      } else {
        songs.get(pattern._id).root = pattern;
      }
    } else {
      // This belongs to a song
      if (!songs.has(pattern.songId)) {
        songs.set(pattern.songId, { root: null, children: [pattern] });
      } else {
        songs.get(pattern.songId).children.push(pattern);
      }
    }
  });

  // Render
  const container = document.getElementById('patterns');
  container.innerHTML = '';

  if (songs.size === 0) {
    container.innerHTML = '<div style="padding: 20px; color: #666; text-align: center;">No songs yet.<br>Press Ctrl+S to save.</div>';
    return;
  }

  songs.forEach((song, songId) => {
    const isActive = currentSongId === songId;
    const allPatterns = song.root ? [song.root, ...song.children] : song.children;
    allPatterns.sort((a, b) => b.timestamp - a.timestamp);

    const group = document.createElement('div');
    group.className = 'song-group';

    const header = document.createElement('div');
    header.className = 'song-header' + (isActive ? ' active' : '');
    header.innerHTML = `
      <span class="song-title">${song.root?.preview || 'Song'}</span>
      <span class="song-count">${allPatterns.length}</span>
    `;
    header.onclick = () => {
      const list = group.querySelector('.pattern-list');
      list.classList.toggle('expanded');
    };

    const list = document.createElement('div');
    list.className = 'pattern-list' + (isActive ? ' expanded' : '');

    allPatterns.forEach(p => {
      const item = document.createElement('div');
      item.className = 'pattern-item' + (currentSongId === songId ? '' : '');
      item.innerHTML = `
        <div class="pattern-preview">${p.preview}</div>
        <div class="pattern-time">${formatTime(p.timestamp)}</div>
        <button class="pattern-delete">✕</button>
      `;
      item.querySelector('.pattern-delete').onclick = async (e) => {
        e.stopPropagation();
        await db.del(p._id);
        await renderSidebar();
      };
      item.onclick = (e) => {
        if (e.target.classList.contains('pattern-delete')) return;
        e.stopPropagation();
        setEditorCode(p.code);
        currentSongId = p.songId === null ? p._id : p.songId;
        renderSidebar();
        // Auto-play the loaded pattern
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('repl-evaluate'));
          document.getElementById('status').textContent = 'Playing...';
        }, 50);
      };
      list.appendChild(item);
    });

    group.appendChild(header);
    group.appendChild(list);
    container.appendChild(group);
  });
}

// Event handlers
document.getElementById('play').onclick = () => {
  document.dispatchEvent(new CustomEvent('repl-evaluate'));
  document.getElementById('status').textContent = 'Playing...';
};

document.getElementById('stop').onclick = () => {
  document.dispatchEvent(new CustomEvent('repl-stop'));
  document.getElementById('status').textContent = 'Stopped';
};

document.getElementById('newSong').onclick = () => {
  currentSongId = null;
  setEditorCode('// New Song\n');
  renderSidebar();
  document.getElementById('status').textContent = 'New song - Ctrl+S to save';
};

document.getElementById('save').onclick = () => {
  savePattern();
};

// Ctrl+S to save
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    await savePattern();
  }
});

// Vibe button handler
document.getElementById('vibe').onclick = () => {
  if (!localStorage.getItem('openrouter_api_key')) {
    // Save key mode
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
      localStorage.setItem('openrouter_api_key', key);
      document.getElementById('apiKeyInput').value = '';
      updateKeyUI();
      updateBalance();
      document.getElementById('status').textContent = 'API key saved! Enter a prompt to vibe.';
    }
  } else {
    // Vibe mode
    handleVibe();
  }
};

// Enter key to submit vibe prompt
document.getElementById('vibePrompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleVibe();
  }
});

// Enter key to save API key
document.getElementById('apiKeyInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('vibe').click();
  }
});

// Click balance to copy shareable URL with key
document.getElementById('balance').addEventListener('click', async () => {
  const apiKey = localStorage.getItem('openrouter_api_key');
  if (!apiKey) return;

  const url = `${window.location.origin}${window.location.pathname}#key=${apiKey}`;
  try {
    await navigator.clipboard.writeText(url);
    const balanceEl = document.getElementById('balance');
    const original = balanceEl.textContent;
    balanceEl.textContent = '✓ copied!';
    setTimeout(() => { balanceEl.textContent = original; }, 1500);
  } catch (err) {
    console.error('[copy] Error:', err);
  }
});

// Initialize vibe UI
updateKeyUI();

// Live updates
db.subscribe(async () => {
  await renderSidebar();
});

// Initial render
await renderSidebar();
