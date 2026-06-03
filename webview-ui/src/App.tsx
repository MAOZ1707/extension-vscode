import { useEffect, useMemo, useState } from 'react';
import type { AgenticAsset, Ecosystem } from '../../src/scanner/types';
import { ASSET_TYPE_ORDER, ECOSYSTEM_LABELS } from '../../src/scanner/types';
import type { HostToWebview } from '../../src/shared/messages';
import type { Lock } from '../../src/canvas/workflowFile';
import { postMessage } from './vscodeApi';
import { AssetGroup } from './components/AssetGroup';
import { EcosystemSection } from './components/EcosystemSection';
import { FilterBar, type FilterValue } from './components/FilterBar';
import { LockContext } from './lockContext';

type Status = 'loading' | 'ready';

/** Order of ecosystem sections shown in the "All" view. */
const ECOSYSTEM_ORDER: Ecosystem[] = ['claude', 'copilot', 'generic'];

export function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [assets, setAssets] = useState<AgenticAsset[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [lock, setLock] = useState<Lock>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<HostToWebview>) {
      const message = event.data;
      switch (message.type) {
        case 'setLoading':
          postMessage({ type: 'log', text: 'received setLoading' });
          setStatus('loading');
          break;
        case 'setAssets':
          postMessage({ type: 'log', text: `received setAssets: ${message.assets.length} asset(s)` });
          setAssets(message.assets);
          setWorkspaceOpen(message.workspaceOpen);
          setError(message.error);
          setStatus('ready');
          break;
        case 'setLock':
          setLock(message.llm);
          break;
      }
    }
    window.addEventListener('message', onMessage);
    postMessage({ type: 'log', text: 'App effect: listener attached, sending ready' });
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // "All" → assets grouped under per-ecosystem sections.
  const ecosystemSections = useMemo(() => {
    return ECOSYSTEM_ORDER.map((ecosystem) => ({
      ecosystem,
      assets: assets.filter((a) => a.ecosystem === ecosystem),
    })).filter((s) => s.assets.length > 0);
  }, [assets]);

  // A specific ecosystem → flat per-type groups (current behaviour, scoped).
  const filteredGroups = useMemo(() => {
    if (filter === 'all') return [];
    const scoped = assets.filter((a) => a.ecosystem === filter);
    return ASSET_TYPE_ORDER.map((type) => ({
      type,
      assets: scoped.filter((a) => a.type === type),
    })).filter((g) => g.assets.length > 0);
  }, [assets, filter]);

  const visibleCount = useMemo(() => {
    if (filter === 'all') return assets.length;
    return assets.filter((a) => a.ecosystem === filter).length;
  }, [assets, filter]);

  const emptyMessage =
    filter === 'all'
      ? 'No agentic assets found in this workspace.'
      : `No ${ECOSYSTEM_LABELS[filter]} assets found in this workspace.`;

  return (
    <LockContext.Provider value={lock}>
    <div className="app">
      <header className="app__toolbar">
        <span className="app__total">
          {visibleCount} {visibleCount === 1 ? 'asset' : 'assets'}
        </span>
        <button className="app__refresh" onClick={() => postMessage({ type: 'refresh' })}>
          Refresh
        </button>
      </header>

      {lock !== null && (
        <div className="app__lock-banner" role="status">
          <span className="app__lock-dot" aria-hidden="true" />
          Locked to {ECOSYSTEM_LABELS[lock]} · clear the canvas to switch
        </div>
      )}

      <FilterBar value={filter} onChange={setFilter} />

      {status === 'loading' && <p className="app__message">Scanning workspace…</p>}

      {status === 'ready' && error && (
        <p className="app__message app__message--error">Scan error: {error}</p>
      )}

      {status === 'ready' && !workspaceOpen && (
        <p className="app__message">Open a folder to scan for agentic assets.</p>
      )}

      {status === 'ready' && workspaceOpen && !error && visibleCount === 0 && (
        <p className="app__message">{emptyMessage}</p>
      )}

      {status === 'ready' &&
        filter === 'all' &&
        ecosystemSections.map((section) => (
          <EcosystemSection
            key={section.ecosystem}
            ecosystem={section.ecosystem}
            assets={section.assets}
          />
        ))}

      {status === 'ready' &&
        filter !== 'all' &&
        filteredGroups.map((group) => (
          <AssetGroup key={group.type} type={group.type} assets={group.assets} />
        ))}
    </div>
    </LockContext.Provider>
  );
}
