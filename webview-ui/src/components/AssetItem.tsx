import { useContext, useEffect, useRef, useState } from 'react';
import type { AgenticAsset } from '../../../src/scanner/types';
import { ECOSYSTEM_LABELS } from '../../../src/scanner/types';
import { postMessage } from '../vscodeApi';
import { LockContext } from '../lockContext';

interface MenuPos {
  x: number;
  y: number;
}

export function AssetItem({ asset }: { asset: AgenticAsset }) {
  const [menu, setMenu] = useState<MenuPos | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lock = useContext(LockContext);
  const disabled = lock !== null && asset.ecosystem !== 'generic' && asset.ecosystem !== lock;

  function addToCanvas() {
    if (disabled) return;
    postMessage({ type: 'addToCanvas', assetId: asset.id });
    setMenu(null);
  }

  function openFile() {
    postMessage({ type: 'openAsset', assetId: asset.id });
    setMenu(null);
  }

  // Close the context menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(null);
    }
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  return (
    <li
      className={`asset-item ${disabled ? 'is-disabled' : ''}`}
      aria-disabled={disabled}
      title={
        disabled
          ? `${asset.relativePath}\n(Locked to ${ECOSYSTEM_LABELS[lock!]} — clear the canvas to add ${ECOSYSTEM_LABELS[asset.ecosystem]} assets)`
          : `${asset.relativePath}\n(double-click to add to canvas)`
      }
      onDoubleClick={addToCanvas}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="asset-item__header">
        <span className="asset-item__name">{asset.name}</span>
        <span className={`asset-item__badge asset-item__badge--${asset.ecosystem}`}>
          {ECOSYSTEM_LABELS[asset.ecosystem]}
        </span>
      </div>
      {asset.description && <p className="asset-item__description">{asset.description}</p>}
      <p className="asset-item__path">{asset.relativePath}</p>

      {menu && (
        <div
          ref={menuRef}
          className="asset-item__menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button className="asset-item__menu-item" role="menuitem" onClick={addToCanvas} disabled={disabled}>
            Add to canvas
          </button>
          <button className="asset-item__menu-item" role="menuitem" onClick={openFile}>
            Open file
          </button>
        </div>
      )}
    </li>
  );
}
