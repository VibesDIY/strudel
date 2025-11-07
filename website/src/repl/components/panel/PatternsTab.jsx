import {
  exportPatterns,
  importPatterns,
  loadAndSetFeaturedPatterns,
  loadAndSetPublicPatterns,
  patternFilterName,
  useActivePattern,
  useViewingPatternData,
  userPattern,
} from '../../../user_pattern_utils.mjs';
import { useMemo, useState, useEffect } from 'react';
import { getMetadata } from '../../../metadata_parser.js';
import { useExamplePatterns } from '../../useExamplePatterns.jsx';
import { parseJSON, isUdels } from '../../util.mjs';
import { useSettings } from '../../../settings.mjs';
import { ActionButton } from '../button/action-button.jsx';
import { Pagination } from '../pagination/Pagination.jsx';
import { useDebounce } from '../usedebounce.jsx';
import cx from '@src/cx.mjs';
import { getSnapshotCountByPattern, getRecentVersions, formatTimestamp, saveVersion } from '../../fireproofHistory.js';
import { logger } from '@strudel/core';

export function PatternLabel({ pattern } /* : { pattern: Tables<'code'> } */) {
  const meta = useMemo(() => getMetadata(pattern.code), [pattern]);

  let title = meta.title;
  if (title == null) {
    const date = new Date(pattern.created_at);
    if (!isNaN(date)) {
      title = date.toLocaleDateString();
    } else {
      title = 'unnamed';
    }
  }

  const author = Array.isArray(meta.by) ? meta.by.join(',') : 'Anonymous';
  return <>{`${pattern.id}: ${title} by ${author.slice(0, 100)}`.slice(0, 60)}</>;
}

function PatternButton({ showOutline, onClick, pattern, showHiglight, snapshotCount, isExpanded, onToggleExpand }) {
  const hasSnapshots = snapshotCount > 0;

  return (
    <div className={cx('mr-4 cursor-pointer', showHiglight && 'bg-selection')}>
      <div className="flex items-center justify-between hover:opacity-50">
        <a
          className={cx(
            'flex-1 block',
            showOutline && 'outline outline-1',
          )}
          onClick={onClick}
        >
          <PatternLabel pattern={pattern} />
        </a>
        {hasSnapshots && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="ml-2 px-1 text-foreground opacity-50 hover:opacity-100"
            aria-label={isExpanded ? 'Collapse snapshots' : 'Expand snapshots'}
          >
            {isExpanded ? '🔽' : '◀️'}
          </button>
        )}
      </div>
    </div>
  );
}

function SnapshotList({ snapshots, onLoadSnapshot, currentCode }) {
  return (
    <div className="ml-4 border-l border-foreground border-opacity-20">
      {snapshots.map((snapshot) => {
        const isSelected = currentCode === snapshot.code;
        return (
          <div
            key={snapshot._id}
            className="pl-4 py-1 text-sm hover:bg-lineHighlight cursor-pointer text-foreground opacity-70"
            onClick={() => onLoadSnapshot(snapshot)}
          >
            <div className="flex items-center gap-1">
              {isSelected && <span>🔥</span>}
              <div className="truncate">{snapshot.preview}</div>
            </div>
            <div className="text-xs opacity-50">{formatTimestamp(snapshot.timestamp)}</div>
          </div>
        );
      })}
    </div>
  );
}

function PatternButtons({ patterns, activePattern, onClick, started, context, expandPatternId }) {
  const viewingPatternStore = useViewingPatternData();
  const viewingPatternData = parseJSON(viewingPatternStore);
  const viewingPatternID = viewingPatternData.id;

  const [snapshotCounts, setSnapshotCounts] = useState({});
  const [expandedPatterns, setExpandedPatterns] = useState(new Set());
  const [patternSnapshots, setPatternSnapshots] = useState({});

  useEffect(() => {
    loadSnapshotCounts();
  }, [patterns]);

  // Listen for snapshot-saved events to reload counts
  useEffect(() => {
    const handleSnapshotSaved = () => {
      loadSnapshotCounts();
    };
    window.addEventListener('fireproof-snapshot-saved', handleSnapshotSaved);
    return () => window.removeEventListener('fireproof-snapshot-saved', handleSnapshotSaved);
  }, []);

  // Auto-expand when expandPatternId changes
  useEffect(() => {
    if (expandPatternId && snapshotCounts[expandPatternId] > 0) {
      toggleExpand(expandPatternId);
    }
  }, [expandPatternId]);

  async function loadSnapshotCounts() {
    const counts = await getSnapshotCountByPattern();
    setSnapshotCounts(counts);
  }

  async function toggleExpand(patternId) {
    const newExpandedPatterns = new Set(expandedPatterns);
    if (newExpandedPatterns.has(patternId)) {
      newExpandedPatterns.delete(patternId);
    } else {
      newExpandedPatterns.add(patternId);
      // Load snapshots for this pattern if not already loaded
      if (!patternSnapshots[patternId]) {
        const snapshots = await getRecentVersions(50, patternId);
        setPatternSnapshots(prev => ({ ...prev, [patternId]: snapshots }));
      }
    }
    setExpandedPatterns(newExpandedPatterns);
  }

  const handleLoadSnapshot = (snapshot) => {
    context.handleLoadVersion(snapshot);
  };

  return (
    <div className="">
      {Object.values(patterns)
        .reverse()
        .map((pattern) => {
          const id = pattern.id;
          const isExpanded = expandedPatterns.has(id);
          const snapshots = patternSnapshots[id] || [];

          return (
            <div key={id}>
              <PatternButton
                pattern={pattern}
                showHiglight={id === viewingPatternID}
                showOutline={id === activePattern && started}
                onClick={() => onClick(id)}
                snapshotCount={snapshotCounts[id] || 0}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleExpand(id)}
              />
              {isExpanded && snapshots.length > 0 && (
                <SnapshotList
                  snapshots={snapshots}
                  onLoadSnapshot={handleLoadSnapshot}
                  currentCode={viewingPatternData.code}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

const updateCodeWindow = (context, patternData, reset = false) => {
  context.handleUpdate(patternData, reset);
};

function UserPatterns({ context, expandPatternId }) {
  const activePattern = useActivePattern();
  const viewingPatternStore = useViewingPatternData();
  const viewingPatternData = parseJSON(viewingPatternStore);
  const { userPatterns, patternFilter, patternAutoStart } = useSettings();
  const viewingPatternID = viewingPatternData?.id;

  const handleSnap = async () => {
    const code = context.editorRef.current?.code || viewingPatternData?.code || '';
    const patternId = viewingPatternID || null;
    try {
      await saveVersion(code, patternId);
      logger('[fireproof] snapshot saved', 'success');
      // Trigger reload of snapshot counts - this will be picked up by PatternButtons
      window.dispatchEvent(new CustomEvent('fireproof-snapshot-saved'));
    } catch (err) {
      console.error('[fireproof] failed to save:', err);
      logger('[fireproof] failed to save snapshot', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-2 flex-grow overflow-hidden h-full pb-2 ">
      <div className="pr-4 space-x-4  flex max-w-full overflow-x-auto">
        <ActionButton label="snap" onClick={handleSnap} />
        <ActionButton
          label="new"
          onClick={() => {
            const { data } = userPattern.createAndAddToDB();
            updateCodeWindow(context, data);
          }}
        />
        <ActionButton
          label="duplicate"
          onClick={() => {
            const { data } = userPattern.duplicate(viewingPatternData);
            updateCodeWindow(context, data);
          }}
        />
        <ActionButton
          label="delete"
          onClick={() => {
            const { data } = userPattern.delete(viewingPatternID);
            updateCodeWindow(context, { ...data, collection: userPattern.collection });
          }}
        />
        <label className="hover:opacity-50 cursor-pointer">
          <input
            style={{ display: 'none' }}
            type="file"
            multiple
            accept="text/plain,text/x-markdown,application/json"
            onChange={(e) => importPatterns(e.target.files)}
          />
          import
        </label>
        <ActionButton label="export" onClick={exportPatterns} />

        <ActionButton
          label="delete-all"
          onClick={() => {
            const { data } = userPattern.clearAll();
            updateCodeWindow(context, data);
          }}
        />
      </div>

      <div className="overflow-auto h-full bg-background p-2 rounded-md">
        {/* {patternFilter === patternFilterName.user && ( */}
        <PatternButtons
          onClick={(id) => {
            updateCodeWindow(context, { ...userPatterns[id], collection: userPattern.collection }, patternAutoStart);

            if (context.started && activePattern === id) {
              context.handleEvaluate();
            }
          }}
          patterns={userPatterns}
          started={context.started}
          activePattern={activePattern}
          viewingPatternID={viewingPatternID}
          context={context}
          expandPatternId={expandPatternId}
        />
        {/* )} */}
      </div>
    </div>
  );
}

function PatternPageWithPagination({ patterns, patternOnClick, context, paginationOnChange, initialPage }) {
  const [page, setPage] = useState(initialPage);
  const debouncedPageChange = useDebounce(() => {
    paginationOnChange(page);
  });

  const onPageChange = (pageNum) => {
    setPage(pageNum);
    debouncedPageChange();
  };

  const activePattern = useActivePattern();
  return (
    <div className="flex flex-grow flex-col  h-full overflow-hidden justify-between">
      <div className="overflow-auto flex flex-col flex-grow bg-background p-2 rounded-md ">
        <PatternButtons
          onClick={(id) => patternOnClick(id)}
          started={context.started}
          patterns={patterns}
          activePattern={activePattern}
        />
      </div>
      <div className="flex items-center gap-2 py-2">
        <label htmlFor="pattern pagination">Page</label>
        <Pagination id="pattern pagination" currPage={page} onPageChange={onPageChange} />
      </div>
    </div>
  );
}

let featuredPageNum = 1;
function FeaturedPatterns({ context }) {
  const examplePatterns = useExamplePatterns();
  const collections = examplePatterns.collections;
  const patterns = collections.get(patternFilterName.featured);
  const { patternAutoStart } = useSettings();
  return (
    <PatternPageWithPagination
      patterns={patterns}
      context={context}
      initialPage={featuredPageNum}
      patternOnClick={(id) => {
        updateCodeWindow(context, { ...patterns[id], collection: patternFilterName.featured }, patternAutoStart);
      }}
      paginationOnChange={async (pageNum) => {
        await loadAndSetFeaturedPatterns(pageNum - 1);
        featuredPageNum = pageNum;
      }}
    />
  );
}

let latestPageNum = 1;
function LatestPatterns({ context }) {
  const examplePatterns = useExamplePatterns();
  const collections = examplePatterns.collections;
  const patterns = collections.get(patternFilterName.public);
  const { patternAutoStart } = useSettings();
  return (
    <PatternPageWithPagination
      patterns={patterns}
      context={context}
      initialPage={latestPageNum}
      patternOnClick={(id) => {
        updateCodeWindow(context, { ...patterns[id], collection: patternFilterName.public }, patternAutoStart);
      }}
      paginationOnChange={async (pageNum) => {
        await loadAndSetPublicPatterns(pageNum - 1);
        latestPageNum = pageNum;
      }}
    />
  );
}

function PublicPatterns({ context }) {
  const { patternFilter } = useSettings();
  if (patternFilter === patternFilterName.featured) {
    return <FeaturedPatterns context={context} />;
  }
  return <LatestPatterns context={context} />;
}

export function PatternsTab({ context, expandPatternId }) {
  const { patternFilter } = useSettings();

  return (
    <div className="px-4 w-full text-foreground  space-y-2  flex flex-col overflow-hidden max-h-full h-full">
      <UserPatterns context={context} expandPatternId={expandPatternId} />
    </div>
  );
  /* return (
    <div className="px-4 w-full text-foreground  space-y-2  flex flex-col overflow-hidden max-h-full h-full">
      <ButtonGroup
        value={patternFilter}
        onChange={(value) => settingsMap.setKey('patternFilter', value)}
        items={patternFilterName}
      ></ButtonGroup>

      {patternFilter === patternFilterName.user ? (
        <UserPatterns context={context} />
      ) : (
        <PublicPatterns context={context} />
      )}
    </div>
  ); */
}
