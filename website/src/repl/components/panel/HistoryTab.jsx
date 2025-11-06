import { useEffect, useState } from 'react';
import { getRecentVersions, formatTimestamp } from '../../fireproofHistory.js';
import cx from '@src/cx.mjs';

export function HistoryTab({ context }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { handleLoadVersion } = context;

  useEffect(() => {
    loadVersions();
  }, []);

  async function loadVersions() {
    setLoading(true);
    const versions = await getRecentVersions(50);
    setVersions(versions);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-foreground opacity-50">Loading snapshots...</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-foreground opacity-50 text-center">
          No snapshots saved yet. Press <kbd className="font-bold">Ctrl+S</kbd> to save.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-foreground border-opacity-20">
        <p className="text-xs text-foreground opacity-70">
          {versions.length} snapshot{versions.length !== 1 ? 's' : ''} • Click to load
        </p>
      </div>

      <div className="overflow-y-auto flex-1">
        {versions.map((version) => (
          <div
            key={version._id}
            className={cx(
              'px-4 py-3 border-b border-foreground border-opacity-20 cursor-pointer transition-colors',
              'hover:bg-lineHighlight'
            )}
            onClick={() => handleLoadVersion(version)}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-foreground font-mono text-sm truncate">
                  {version.preview}
                </div>
                <div className="text-foreground opacity-50 text-xs mt-1">
                  {formatTimestamp(version.timestamp)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
