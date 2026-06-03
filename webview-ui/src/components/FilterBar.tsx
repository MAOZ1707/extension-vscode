import { ECOSYSTEM_LABELS } from '../../../src/scanner/types';

/** Which ecosystem the sidebar list is filtered to. */
export type FilterValue = 'all' | 'claude' | 'copilot';

interface FilterBarProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

const CHIPS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'claude', label: ECOSYSTEM_LABELS.claude },
  { value: 'copilot', label: ECOSYSTEM_LABELS.copilot },
];

/** Segmented control to filter the asset list by ecosystem. */
export function FilterBar({ value, onChange }: FilterBarProps) {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filter by ecosystem">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          role="tab"
          aria-selected={value === chip.value}
          className={`filter-bar__chip ${value === chip.value ? 'is-active' : ''}`}
          onClick={() => onChange(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
