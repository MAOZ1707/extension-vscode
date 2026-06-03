import { useState } from 'react';
import type { AgenticAsset, AssetType } from '../../../src/scanner/types';
import { ASSET_TYPE_LABELS } from '../../../src/scanner/types';
import { AssetItem } from './AssetItem';

interface AssetGroupProps {
  type: AssetType;
  assets: AgenticAsset[];
}

export function AssetGroup({ type, assets }: AssetGroupProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="asset-group">
      <button
        className="asset-group__header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`codicon-chevron ${expanded ? 'is-open' : ''}`} aria-hidden="true">
          ▸
        </span>
        <span className="asset-group__title">{ASSET_TYPE_LABELS[type]}</span>
        <span className="asset-group__count">{assets.length}</span>
      </button>
      {expanded && (
        <ul className="asset-group__list">
          {assets.map((asset) => (
            <AssetItem key={asset.id} asset={asset} />
          ))}
        </ul>
      )}
    </section>
  );
}
