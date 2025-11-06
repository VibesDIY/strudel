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
 * Save a new version (called on Ctrl+Enter)
 * @param {string} code - The code to save
 * @returns {Promise<object>} The saved document
 */
export async function saveVersion(code) {
  if (!db) initHistory();

  const version = {
    type: 'version',
    code,
    timestamp: Date.now(),
    preview: generatePreview(code),
  };

  const result = await db.put(version);
  console.log('[fireproof] saved version:', result.id);
  return { ...version, _id: result.id };
}

/**
 * Get recent versions (for history selector)
 * @param {number} limit - Maximum number of versions to return
 * @returns {Promise<Array>} Array of version documents
 */
export async function getRecentVersions(limit = 20) {
  if (!db) initHistory();

  try {
    // Query by timestamp field (descending = newest first)
    const result = await db.query(
      (doc) => doc.type === 'version' ? doc.timestamp : null,
      {
        descending: true,
        limit
      }
    );

    return result.rows.map(row => ({
      _id: row.id,
      ...row.value
    }));
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
