/*
HistorySelector - UI for browsing version history
Copyright (C) 2025 Strudel contributors
This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
*/

import { useEffect, useState, useRef } from 'react';
import { getRecentVersions, formatTimestamp } from '../fireproofHistory.js';
import cx from '@src/cx.mjs';

export function HistorySelector({ isOpen, onClose, onSelect }) {
  const [versions, setVersions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const listRef = useRef();

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen]);

  async function loadVersions() {
    setLoading(true);
    const versions = await getRecentVersions(20);
    setVersions(versions);
    setSelectedIndex(0);
    setLoading(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, versions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && versions.length > 0) {
        e.preventDefault();
        const selected = versions[selectedIndex];
        if (selected) {
          onSelect(selected);
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, versions, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && versions.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, versions]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-background border-2 border-foreground rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-foreground">
          <h2 className="text-lg font-bold text-foreground">Saved Snapshots</h2>
          <p className="text-sm text-foreground opacity-70">
            {versions.length > 0
              ? 'Use ↑↓ arrows to navigate, Enter to load, Esc to close'
              : 'No snapshots saved yet. Press Ctrl+S to save.'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-foreground opacity-50">Loading versions...</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-foreground opacity-50">No saved versions yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1" ref={listRef}>
            {versions.map((version, index) => (
              <div
                key={version._id}
                className={cx(
                  'px-4 py-3 border-b border-foreground border-opacity-20 cursor-pointer transition-colors',
                  selectedIndex === index
                    ? 'bg-lineHighlight'
                    : 'hover:bg-lineHighlight hover:bg-opacity-50'
                )}
                onClick={() => {
                  setSelectedIndex(index);
                  onSelect(version);
                  onClose();
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground font-mono text-sm truncate">
                      {version.preview}
                    </div>
                    <div className="text-foreground opacity-50 text-xs mt-1">
                      {formatTimestamp(version.timestamp)}
                    </div>
                  </div>
                  {selectedIndex === index && (
                    <div className="ml-2 text-foreground opacity-70">
                      <span className="text-xs">▶</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-2 border-t border-foreground bg-lineHighlight text-xs text-foreground opacity-70">
          {versions.length} snapshot{versions.length !== 1 ? 's' : ''} • Ctrl+S saves • Shift+Ctrl+S opens history
        </div>
      </div>
    </div>
  );
}
