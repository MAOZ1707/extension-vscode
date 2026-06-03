import type { AgenticAsset, Ecosystem } from '../../../src/scanner/types';
import { ASSET_TYPE_ORDER, ECOSYSTEM_LABELS } from '../../../src/scanner/types';
import { AssetGroup } from './AssetGroup';

interface EcosystemSectionProps {
  ecosystem: Ecosystem;
  assets: AgenticAsset[];
}

/**
 * A labelled section for one ecosystem (Claude / Copilot / Generic) that
 * contains the existing per-type asset groups. Used only in the "All" view.
 */
export function EcosystemSection({ ecosystem, assets }: EcosystemSectionProps) {
  const groups = ASSET_TYPE_ORDER.map((type) => ({
    type,
    assets: assets.filter((a) => a.type === type),
  })).filter((g) => g.assets.length > 0);

  return (
    <section className="ecosystem-section">
      <h2 className={`ecosystem-section__header ecosystem-section__header--${ecosystem}`}>
        {ECOSYSTEM_LABELS[ecosystem]}
        <span className="ecosystem-section__count">{assets.length}</span>
      </h2>
      {groups.map((group) => (
        <AssetGroup key={group.type} type={group.type} assets={group.assets} />
      ))}
    </section>
  );
}
