# Fireproof Local History Integration

Branch: `control-enter.fp`

## Overview

This implementation adds local-first version history to Strudel using Fireproof, enabling users to:
- Save versions with **Ctrl+Enter** (automatic on code evaluation)
- Browse history with **Shift+Ctrl+Enter**
- Navigate versions with arrow keys and load with Enter
- Keep stable history for auditioning (only saves on Ctrl+Enter, not on code changes)

## Features

### Local-First Storage
- All versions stored locally in browser using Fireproof
- No backend or network required
- Works completely offline
- Ready for future multi-user sync (Fireproof supports it)

### Smart Version Management
- **Ctrl+Enter**: Evaluates code AND saves a version
- **Shift+Ctrl+Enter**: Opens history selector modal
- **Arrow keys**: Navigate through versions
- **Enter**: Load selected version into editor
- **Esc**: Close selector without loading
- Versions only saved on evaluation, not on every keystroke
- History remains stable while auditioning different versions

### User Experience
- Clean modal UI with version previews
- Timestamps with relative time (e.g., "5m ago", "2h ago")
- Shows first line of code or title comment as preview
- Visual indicator for selected version
- Keyboard-driven workflow (no mouse required)

## Implementation Details

### Files Changed

1. **`website/src/repl/fireproofHistory.js`** (NEW)
   - Core Fireproof integration
   - Functions: `saveVersion()`, `getRecentVersions()`, `formatTimestamp()`
   - Manages local IndexedDB storage via Fireproof

2. **`website/src/repl/components/HistorySelector.jsx`** (NEW)
   - Modal UI component for browsing versions
   - Keyboard navigation (↑↓ arrows, Enter, Esc)
   - Responsive design with Tailwind CSS

3. **`packages/codemirror/codemirror.mjs`** (MODIFIED)
   - Added `onOpenHistory` callback to `initEditor()`
   - Added **Shift+Ctrl+Enter** keybinding
   - Passes callback through to StrudelMirror

4. **`website/src/repl/useReplContext.jsx`** (MODIFIED)
   - Imports Fireproof history functions
   - Initializes Fireproof database on mount
   - Saves version in `afterEval` callback
   - Manages history selector state
   - Provides `handleLoadVersion()` to load versions

5. **`website/src/repl/components/ReplEditor.jsx`** (MODIFIED)
   - Renders `HistorySelector` component
   - Wires up state and callbacks from context

6. **`website/package.json`** (MODIFIED)
   - Added `use-fireproof` dependency

## How It Works

### Save Flow (Ctrl+Enter)
```
User presses Ctrl+Enter
  ↓
Code evaluates (existing behavior)
  ↓
afterEval callback fires
  ↓
saveVersion(code) writes to Fireproof
  ↓
Version stored: { code, timestamp, preview, type }
```

### Load Flow (Shift+Ctrl+Enter)
```
User presses Shift+Ctrl+Enter
  ↓
onOpenHistory callback fires
  ↓
setIsHistorySelectorOpen(true)
  ↓
HistorySelector component loads versions
  ↓
getRecentVersions() fetches from Fireproof
  ↓
User navigates with arrows, presses Enter
  ↓
handleLoadVersion(version) sets editor code
  ↓
Code loaded (NOT automatically evaluated)
```

### Data Structure

Each version document:
```javascript
{
  _id: "auto-generated",
  type: "version",
  code: "sound('bd sd')",
  timestamp: 1730923456789,
  preview: "sound('bd sd')" // first line or title
}
```

## Future Enhancements (Ready for Multi-User)

The architecture is designed to enable multi-user collaboration:

1. **Enable Fireproof Sync**
   - Add PartyKit or Netlify connector
   - Share session ID with collaborators
   - Automatic CRDT merging via Fireproof

2. **Passive Merge Pattern**
   - Remote changes update editor without saving
   - Only Ctrl+Enter creates committed versions
   - No conflicts - each user's saves are independent

3. **Add Client ID Tracking**
   - Tag versions with user ID
   - Show who saved each version
   - Color-code by user in history

4. **Live Presence**
   - Track active users
   - Show remote cursors
   - Sync playback state

## Testing

To test locally:

1. Start dev server:
   ```bash
   pnpm run dev
   ```

2. Open browser to Strudel REPL

3. Test save flow:
   - Type some code
   - Press **Ctrl+Enter** (evaluates and saves)
   - Verify console shows "[fireproof] saved version"

4. Test load flow:
   - Press **Shift+Ctrl+Enter**
   - Verify modal appears with saved version
   - Use ↑↓ arrows to navigate
   - Press Enter to load version
   - Verify code appears in editor

5. Test history stability:
   - Save a version (Ctrl+Enter)
   - Type new code (don't press Ctrl+Enter)
   - Open history (Shift+Ctrl+Enter)
   - Load previous version
   - Type more changes
   - Reopen history - should show same list (stable)

## Keyboard Shortcuts

- **Ctrl+Enter** / **Alt+Enter**: Evaluate code and save version
- **Shift+Ctrl+Enter**: Open version history selector
- **↑↓ Arrows**: Navigate versions (when selector open)
- **Enter**: Load selected version (when selector open)
- **Esc**: Close history selector
- **Ctrl+.** / **Alt+.**: Stop playback (existing)

## Architecture Notes

### Why This Approach?

1. **Local-first**: Works offline, fast, no server needed initially
2. **Explicit saves**: Only Ctrl+Enter saves (stable history)
3. **Non-destructive**: Loading doesn't auto-save (audition safely)
4. **Future-ready**: Fireproof CRDT enables multi-user with minimal changes
5. **Minimal changes**: ~200 lines of code total, non-invasive

### Why Fireproof?

- **Document-based**: Each version is a document (good fit for snapshots)
- **Built-in CRDT**: Automatic conflict resolution for future sync
- **No backend**: Works entirely client-side until sync enabled
- **Encrypted**: Can sync via commodity storage (S3, R2, etc.)
- **React hooks**: Clean API for React apps

### Alternative Considered: Yjs

Yjs provides character-level operational transform, but:
- Overkill for version snapshots (not live collaboration yet)
- Requires more setup (WebSocket server, signaling)
- Fireproof gives us snapshots now, can add Yjs later if needed

## Next Steps

1. **Test in production**: Verify Fireproof IndexedDB works across browsers
2. **Add metadata**: Store evaluation success/error, tempo (CPS), etc.
3. **Export/Import**: Let users backup/share history as JSON
4. **Search**: Add text search across version history
5. **Tags**: Let users tag important versions
6. **Enable sync**: Add PartyKit connector for multi-user sessions

## Dependencies

- `use-fireproof@^0.23.15`: Core Fireproof client library
- Built on IndexedDB (native browser storage)
- No additional backends or services required
