/*
Fireproof History - Local-first version history for Strudel
Copyright (C) 2025 Strudel contributors
This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
*/

import { fireproof } from 'use-fireproof';

let db;
let initialized = false;

/**
 * Initialize Fireproof database for local history
 */
export function initHistory() {
  if (initialized) return db;

  db = fireproof('strudel-history');
  initialized = true;

  return db;
}

/**
 * Save a new version (called on Ctrl+S)
 * @param {string} code - The code to save
 * @param {string} patternId - The pattern ID this snapshot belongs to
 * @returns {Promise<object>} The saved document
 */
export async function saveVersion(code, patternId = null) {
  if (!db) initHistory();

  const version = {
    type: 'version',
    code,
    patternId,
    timestamp: Date.now(),
    preview: generatePreview(code),
  };

  const result = await db.put(version);
  console.log('[fireproof] saved version:', result.id, 'for pattern:', patternId);
  return { ...version, _id: result.id };
}

/**
 * Get recent versions (for history selector)
 * @param {number} limit - Maximum number of versions to return
 * @param {string} patternId - Optional pattern ID to filter by
 * @returns {Promise<Array>} Array of version documents
 */
export async function getRecentVersions(limit = 20, patternId = null) {
  if (!db) initHistory();

  try {
    // Query by timestamp field (descending = newest first)
    const result = await db.query(
      (doc) => doc.type === 'version' ? doc.timestamp : null,
      {
        descending: true,
        limit: patternId ? 1000 : limit  // Get more if we need to filter
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

    // Filter by patternId if provided
    if (patternId) {
      versions = versions.filter(v => v.patternId === patternId);
      versions = versions.slice(0, limit);
    }

    console.log(`[fireproof] loaded ${versions.length} versions for pattern:`, patternId || 'all');
    return versions;
  } catch (err) {
    console.error('[fireproof] error loading versions:', err);
    return [];
  }
}

/**
 * Get a specific version by ID
 * @param {string} id - Document ID
 * @returns {Promise<object>} The version document
 */
export async function getVersion(id) {
  if (!db) initHistory();
  return await db.get(id);
}

/**
 * Get total count of all snapshots across all patterns
 * @returns {Promise<number>} Total count of version documents
 */
export async function getTotalVersionCount() {
  if (!db) initHistory();

  try {
    const result = await db.query(
      (doc) => doc.type === 'version' ? doc.timestamp : null,
      { descending: true, limit: 10000 }
    );
    return result.rows.length;
  } catch (err) {
    console.error('[fireproof] error counting versions:', err);
    return 0;
  }
}

/**
 * Get snapshot count grouped by pattern ID
 * @returns {Promise<Object>} Object mapping patternId to count { patternId: count, ... }
 */
export async function getSnapshotCountByPattern() {
  if (!db) initHistory();

  try {
    const result = await db.query(
      (doc) => doc.type === 'version' ? doc.timestamp : null,
      { descending: true, limit: 10000 }
    );

    const counts = {};
    result.rows.forEach(row => {
      const doc = row.doc || row.value;
      const patternId = doc.patternId;
      if (patternId) {
        counts[patternId] = (counts[patternId] || 0) + 1;
      }
    });

    console.log('[fireproof] snapshot counts by pattern:', counts);
    return counts;
  } catch (err) {
    console.error('[fireproof] error counting snapshots by pattern:', err);
    return {};
  }
}

/**
 * Generate a preview string from code (first line or pattern name)
 * @param {string} code - The code to preview
 * @returns {string} Preview text
 */
function generatePreview(code) {
  if (!code) return '(empty)';

  // Try to find a title comment
  const titleMatch = code.match(/^\/\/\s*(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Otherwise use first non-empty line, truncated
  const firstLine = code.split('\n').find(line => line.trim().length > 0) || '';
  return firstLine.trim().substring(0, 60) + (firstLine.length > 60 ? '...' : '');
}

/**
 * Format timestamp for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTimestamp(timestamp) {
  // Ensure timestamp is a valid number
  if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
    console.warn('[fireproof] invalid timestamp:', timestamp);
    return 'unknown time';
  }

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Format as date
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');

  return `${month}/${day} ${hours}:${mins}`;
}
