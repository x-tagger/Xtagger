/**
 * @file popup/main.ts
 * @layer UI / Popup
 * @description Extension popup — tag management dashboard.
 *
 * Views:
 *   - "home":   Search bar, tag cloud, tagged user list, stats
 *   - "import": File/paste import with preview
 *   - "export": Export options + copy/download
 *   - "settings": Display mode, theme, extended palette toggle
 *
 * All data fetched from background via typed message channels.
 * Vanilla TypeScript — no framework. DOM manipulation is minimal and deliberate.
 */

import { sendMessage } from '@shared/messages';
import { getColor, getBasePalette } from '@core/services/color-palette';
import { DEFAULT_SETTINGS } from '@core/model/entities';
import type { ExtensionSettings } from '@core/model/entities';
import type {
  QueryTagsResponse, GetSettingsResponse,
  ExportAllResponse, ExportCollectionResponse,
  ImportPreviewResponse, PingResponse,
  GetAllTagNamesResponse,
} from '@shared/messages';

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  view: 'home' | 'import' | 'export' | 'settings';
  settings: ExtensionSettings;
  searchQuery: string;
  version: string;
  schemaVersion: number;
}

const state: AppState = {
  view: 'home',
  settings: DEFAULT_SETTINGS,
  searchQuery: '',
  version: '?',
  schemaVersion: 0,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Ping background for version info
  const ping = await sendMessage<PingResponse>({ channel: 'extension:ping', payload: {} });
  if (ping.ok && ping.data) {
    state.version = ping.data.version;
    state.schemaVersion = ping.data.schemaVersion;
  }

  // Load settings
  const settingsRes = await sendMessage<GetSettingsResponse>({ channel: 'settings:get', payload: {} });
  if (settingsRes.ok && settingsRes.data) {
    state.settings = settingsRes.data;
  }

  applyTheme(state.settings.theme);
  renderView('home');
  bindNav();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme: 'auto' | 'light' | 'dark'): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function bindNav(): void {
  document.getElementById('nav-home')?.addEventListener('click', () => renderView('home'));
  document.getElementById('nav-import')?.addEventListener('click', () => renderView('import'));
  document.getElementById('nav-export')?.addEventListener('click', () => renderView('export'));
  document.getElementById('nav-settings')?.addEventListener('click', () => renderView('settings'));
}

function setActiveNav(view: AppState['view']): void {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`nav-${view}`)?.classList.add('active');
}

function renderView(view: AppState['view']): void {
  state.view = view;
  setActiveNav(view);
  const main = document.getElementById('main')!;
  main.innerHTML = '';

  switch (view) {
    case 'home':     renderHome(main); break;
    case 'import':   renderImport(main); break;
    case 'export':   renderExport(main); break;
    case 'settings': renderSettings(main); break;
  }
}

// ─── Home view ────────────────────────────────────────────────────────────────

async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="search-wrap">
      <input type="search" id="search" placeholder="Search users or tags…" autocomplete="off" />
    </div>
    <div id="results" class="results">
      <div class="loading">Loading…</div>
    </div>
  `;

  document.getElementById('search')?.addEventListener('input', (e) => {
    state.searchQuery = (e.target as HTMLInputElement).value.trim();
    loadResults();
  });

  await loadResults();
}

async function loadResults(): Promise<void> {
  const resultsEl = document.getElementById('results');
  if (!resultsEl) return;

  const res = await sendMessage<QueryTagsResponse>({
    channel: 'tags:query',
    payload: {
      usernameContains: state.searchQuery || undefined,
      tagNameContains:  state.searchQuery || undefined,
      limit: 50,
    },
  });

  if (!res.ok || !res.data) {
    resultsEl.innerHTML = '<div class="empty">Could not load tags. Is XTagger active?</div>';
    return;
  }

  const { users, totalCount } = res.data;

  if (users.length === 0) {
    resultsEl.innerHTML = state.searchQuery
      ? `<div class="empty">No results for "<strong>${escHtml(state.searchQuery)}</strong>"</div>`
      : `<div class="empty">
           <div class="empty-icon">🏷️</div>
           <div>No tagged users yet.</div>
           <div class="empty-sub">Hover over a username on X.com and click 🏷️ to add a tag.</div>
         </div>`;
    return;
  }

  const totalLabel = totalCount > 50
    ? `<div class="count-label">Showing 50 of ${totalCount} users</div>`
    : `<div class="count-label">${totalCount} tagged user${totalCount !== 1 ? 's' : ''}</div>`;

  const userHTML = users.map(({ user, tags }) => {
    const pillsHTML = tags.map(t => {
      const c = getColor(t.colorIndex);
      return `<span class="tag-pill" style="background:${c.hex};color:${c.textColor};" title="${escHtml(t.notes ?? '')}">${escHtml(t.name)}</span>`;
    }).join('');

    return `
      <div class="user-row" data-username="${escHtml(user.username)}">
        <div class="user-info">
          <span class="username">@${escHtml(user.username)}</span>
          ${user.displayName ? `<span class="display-name">${escHtml(user.displayName)}</span>` : ''}
        </div>
        <div class="user-tags">${pillsHTML}</div>
      </div>
    `;
  }).join('');

  resultsEl.innerHTML = totalLabel + `<div class="user-list">${userHTML}</div>`;
}

// ─── Import view ──────────────────────────────────────────────────────────────

function renderImport(container: HTMLElement): void {
  container.innerHTML = `
    <div class="section-title">Import Tags</div>
    <p class="hint">Paste an XTAG export string, upload a .xtagger.json file, or drag &amp; drop below.</p>

    <div class="drop-zone" id="drop-zone">
      <div class="drop-icon">📂</div>
      <div>Drop file here or <label for="file-input" class="file-label">browse</label></div>
      <input type="file" id="file-input" accept=".json,.xtagger.json" style="display:none" />
    </div>

    <div class="or-divider"><span>or paste</span></div>

    <textarea id="paste-input" placeholder="Paste XTAG: export string or JSON…" rows="4"></textarea>

    <div id="import-preview"></div>

    <div class="action-row">
      <button class="btn-secondary" id="btn-preview">Preview</button>
      <button class="btn-primary" id="btn-import" disabled>Import</button>
    </div>
  `;

  let pendingManifest: ImportPreviewResponse['manifest'] | null = null;

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const pasteInput = document.getElementById('paste-input') as HTMLTextAreaElement;
  const previewEl = document.getElementById('import-preview')!;
  const importBtn = document.getElementById('btn-import') as HTMLButtonElement;

  // File input
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    pasteInput.value = await file.text();
  });

  // Drop zone
  const dropZone = document.getElementById('drop-zone')!;
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) pasteInput.value = await file.text();
  });
  dropZone.addEventListener('click', () => fileInput.click());

  // Preview
  document.getElementById('btn-preview')?.addEventListener('click', async () => {
    const raw = pasteInput.value.trim();
    if (!raw) return;

    previewEl.innerHTML = '<div class="loading">Parsing…</div>';
    importBtn.disabled = true;

    const res = await sendMessage<ImportPreviewResponse>({
      channel: 'import:preview',
      payload: { raw },
    });

    if (!res.ok || !res.data) {
      previewEl.innerHTML = `<div class="error-box">Invalid format: ${escHtml(String(res.error?.message ?? 'unknown error'))}</div>`;
      return;
    }

    const p = res.data;
    pendingManifest = p.manifest;
    importBtn.disabled = false;

    const checksumBadge = p.checksumValid
      ? '<span class="badge badge-ok">✓ Checksum valid</span>'
      : '<span class="badge badge-warn">⚠ Checksum mismatch</span>';

    previewEl.innerHTML = `
      <div class="preview-box">
        <div class="preview-row"><span>Users affected</span><strong>${p.usersAffected}</strong></div>
        <div class="preview-row"><span>Tags to add</span><strong>${p.tagsToAdd}</strong></div>
        <div class="preview-row"><span>Conflicts</span><strong>${p.conflicts}</strong></div>
        <div class="preview-row"><span>Integrity</span>${checksumBadge}</div>
        ${p.conflicts > 0 ? `
          <div class="conflict-opts">
            <label class="radio-label"><input type="radio" name="conflict" value="keep-mine" checked /> Keep mine</label>
            <label class="radio-label"><input type="radio" name="conflict" value="keep-theirs" /> Keep theirs</label>
            <label class="radio-label"><input type="radio" name="conflict" value="merge-both" /> Keep both</label>
          </div>
        ` : ''}
      </div>
    `;
  });

  // Import
  importBtn.addEventListener('click', async () => {
    if (!pendingManifest) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';

    const strategy = (document.querySelector('input[name="conflict"]:checked') as HTMLInputElement | null)
      ?.value ?? 'keep-mine';

    const res = await sendMessage({
      channel: 'import:apply',
      payload: {
        manifest: pendingManifest,
        options: { conflictStrategy: strategy, filterUsernames: [], filterTagNames: [] },
      },
    });

    if (res.ok) {
      previewEl.innerHTML = '<div class="success-box">✓ Import complete! Reload X.com to see updated tags.</div>';
      importBtn.textContent = 'Done';
    } else {
      previewEl.innerHTML = `<div class="error-box">Import failed: ${escHtml(String(res.error?.message))}</div>`;
      importBtn.disabled = false;
      importBtn.textContent = 'Import';
    }
  });
}

// ─── Export view ──────────────────────────────────────────────────────────────

async function renderExport(container: HTMLElement): Promise<void> {
  // Load all known tag names for the pill selectors
  const namesRes = await sendMessage<GetAllTagNamesResponse>({
    channel: 'tags:get-all-names',
    payload: {},
  });
  const allNames: string[] = namesRes.ok && namesRes.data ? [...namesRes.data].sort() : [];

  container.innerHTML = `
    <div class="section-title">Export</div>

    <!-- Mode tabs -->
    <div class="export-tabs">
      <button class="export-tab active" data-tab="all">All tags</button>
      <button class="export-tab" data-tab="collection">Collection</button>
    </div>

    <!-- All tags panel -->
    <div id="tab-all" class="tab-panel">
      <p class="hint">Export every tagged user and all their tags — useful for full backups.</p>
      <div class="field-row">
        <label class="field-label">Your name <span class="hint-inline">(optional, appears in export)</span></label>
        <input type="text" id="all-author" placeholder="e.g. alice@nostr" maxlength="80" />
      </div>
      <div id="export-result-all"></div>
      <div class="action-row">
        <button class="btn-primary" id="btn-export-all">Export all</button>
      </div>
    </div>

    <!-- Collection panel -->
    <div id="tab-collection" class="tab-panel" style="display:none">
      <p class="hint">
        Build a named collection by filtering which users to include.
        Users matching <strong>Include (any)</strong> are added, then narrowed by <strong>Include (all)</strong>,
        then anyone with an <strong>Exclude</strong> tag is removed.
      </p>

      <div class="field-row">
        <label class="field-label">Collection name <span class="req">*</span></label>
        <input type="text" id="col-name" placeholder="e.g. British Journalists" maxlength="80" />
      </div>

      <div class="field-row">
        <label class="field-label">Description <span class="hint-inline">(optional)</span></label>
        <input type="text" id="col-desc" placeholder="e.g. UK-based journalists I follow" maxlength="200" />
      </div>

      <div class="field-row">
        <label class="field-label">Your name <span class="hint-inline">(optional)</span></label>
        <input type="text" id="col-author" placeholder="e.g. alice@nostr" maxlength="80" />
      </div>

      <div class="field-row">
        <label class="field-label">
          Include — any of these tags
          <span class="hint-inline">(users must have at least one)</span>
        </label>
        <div class="tag-chip-input" id="input-include-any">
          <div class="chips" id="chips-include-any"></div>
          <div class="chip-dropdown-wrap">
            <input type="text" class="chip-input" placeholder="Type or pick a tag…" autocomplete="off" />
            <div class="chip-dropdown" id="dd-include-any"></div>
          </div>
        </div>
      </div>

      <div class="field-row">
        <label class="field-label">
          Include — must also have all of these
          <span class="hint-inline">(AND filter, optional)</span>
        </label>
        <div class="tag-chip-input" id="input-include-all">
          <div class="chips" id="chips-include-all"></div>
          <div class="chip-dropdown-wrap">
            <input type="text" class="chip-input" placeholder="Type or pick a tag…" autocomplete="off" />
            <div class="chip-dropdown" id="dd-include-all"></div>
          </div>
        </div>
      </div>

      <div class="field-row">
        <label class="field-label">
          Exclude — remove users who have any of these
          <span class="hint-inline">(NOT filter, optional)</span>
        </label>
        <div class="tag-chip-input" id="input-exclude">
          <div class="chips" id="chips-exclude"></div>
          <div class="chip-dropdown-wrap">
            <input type="text" class="chip-input" placeholder="Type or pick a tag…" autocomplete="off" />
            <div class="chip-dropdown" id="dd-exclude"></div>
          </div>
        </div>
      </div>

      <div id="col-preview" class="col-preview"></div>

      <div class="action-row">
        <button class="btn-secondary" id="btn-preview-col">Preview</button>
        <button class="btn-primary" id="btn-export-col" disabled>Export collection</button>
      </div>

      <div id="export-result-col"></div>
    </div>
  `;

  // ── Tab switching ────────────────────────────────────────────────────────
  container.querySelectorAll('.export-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.export-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = (btn as HTMLElement).dataset['tab']!;
      (document.getElementById('tab-all') as HTMLElement).style.display     = tab === 'all' ? '' : 'none';
      (document.getElementById('tab-collection') as HTMLElement).style.display = tab === 'collection' ? '' : 'none';
    });
  });

  // ── Chip input factory ───────────────────────────────────────────────────
  const chipSets: Record<string, Set<string>> = {
    'include-any': new Set(),
    'include-all': new Set(),
    'exclude':     new Set(),
  };

  function renderChips(key: string): void {
    const el = document.getElementById(`chips-${key}`)!;
    el.innerHTML = [...chipSets[key]!].map(name =>
      `<span class="chip" data-key="${key}" data-name="${escHtml(name)}">${escHtml(name)} <button class="chip-remove" aria-label="Remove">×</button></span>`
    ).join('');
    el.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = (btn.closest('.chip') as HTMLElement).dataset['name']!;
        chipSets[key]!.delete(name);
        renderChips(key);
        updatePreviewBtn();
      });
    });
  }

  function addChip(key: string, name: string): void {
    if (name && !chipSets[key]!.has(name)) {
      chipSets[key]!.add(name);
      renderChips(key);
      updatePreviewBtn();
    }
  }

  function bindChipInput(key: string, ddId: string): void {
    const wrap  = document.getElementById(`input-${key}`)!;
    const input = wrap.querySelector('.chip-input') as HTMLInputElement;
    const dd    = document.getElementById(ddId)!;

    function showDropdown(filter: string): void {
      const matches = allNames.filter(n =>
        n.toLowerCase().includes(filter.toLowerCase()) && !chipSets[key]!.has(n)
      ).slice(0, 10);
      if (matches.length === 0) { dd.style.display = 'none'; return; }
      dd.innerHTML = matches.map(n =>
        `<div class="dd-item" data-name="${escHtml(n)}">${escHtml(n)}</div>`
      ).join('');
      dd.style.display = 'block';
      dd.querySelectorAll('.dd-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          addChip(key, (item as HTMLElement).dataset['name']!);
          input.value = '';
          dd.style.display = 'none';
        });
      });
    }

    input.addEventListener('input', () => showDropdown(input.value));
    input.addEventListener('focus', () => showDropdown(input.value));
    input.addEventListener('blur', () => setTimeout(() => { dd.style.display = 'none'; }, 150));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        addChip(key, input.value.trim());
        input.value = '';
        dd.style.display = 'none';
      }
    });
  }

  bindChipInput('include-any', 'dd-include-any');
  bindChipInput('include-all', 'dd-include-all');
  bindChipInput('exclude',     'dd-exclude');

  // ── Preview button state ─────────────────────────────────────────────────
  function updatePreviewBtn(): void {
    const hasName    = (document.getElementById('col-name') as HTMLInputElement).value.trim().length > 0;
    const hasInclude = chipSets['include-any']!.size > 0;
    const previewBtn = document.getElementById('btn-preview-col') as HTMLButtonElement;
    previewBtn.disabled = !(hasName && hasInclude);
    (document.getElementById('btn-export-col') as HTMLButtonElement).disabled = true;
    document.getElementById('col-preview')!.innerHTML = '';
  }

  document.getElementById('col-name')?.addEventListener('input', updatePreviewBtn);
  updatePreviewBtn();

  // ── Preview collection ───────────────────────────────────────────────────
  document.getElementById('btn-preview-col')?.addEventListener('click', async () => {
    const name    = (document.getElementById('col-name') as HTMLInputElement).value.trim();
    const previewEl = document.getElementById('col-preview')!;
    const exportBtn = document.getElementById('btn-export-col') as HTMLButtonElement;

    previewEl.innerHTML = '<div class="loading">Previewing…</div>';
    exportBtn.disabled  = true;

    const res = await sendMessage<ExportCollectionResponse>({
      channel: 'export:collection',
      payload: {
        name,
        description:    (document.getElementById('col-desc') as HTMLInputElement).value.trim() || undefined,
        exportedBy:     (document.getElementById('col-author') as HTMLInputElement).value.trim() || undefined,
        includeAnyTags: [...chipSets['include-any']!],
        includeAllTags: [...chipSets['include-all']!],
        excludeTags:    [...chipSets['exclude']!],
      },
    });

    if (!res.ok || !res.data) {
      previewEl.innerHTML = '<div class="error-box">Preview failed.</div>';
      return;
    }

    const { userCount, tagCount } = res.data;

    if (userCount === 0) {
      previewEl.innerHTML = '<div class="hint" style="color:var(--color-warn,#f59e0b);margin-top:8px">No users match these criteria. Try broadening your filters.</div>';
      return;
    }

    previewEl.innerHTML = `
      <div class="preview-box" style="margin-top:10px">
        <div class="preview-row"><span>Matched users</span><strong>${userCount}</strong></div>
        <div class="preview-row"><span>Tags included</span><strong>${tagCount}</strong></div>
      </div>
    `;
    exportBtn.disabled = false;
    // Store latest result for download
    (exportBtn as any)._lastResult = res.data;
  });

  // ── Export collection ────────────────────────────────────────────────────
  document.getElementById('btn-export-col')?.addEventListener('click', () => {
    const exportBtn = document.getElementById('btn-export-col') as HTMLButtonElement;
    const result: ExportCollectionResponse = (exportBtn as any)._lastResult;
    if (!result) return;
    renderExportOutputs('export-result-col', result.json, result.compact, result.userCount, result.tagCount, result.collectionName);
  });

  // ── Export all ───────────────────────────────────────────────────────────
  document.getElementById('btn-export-all')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-all') as HTMLButtonElement;
    const author = (document.getElementById('all-author') as HTMLInputElement).value.trim();
    btn.disabled = true;
    btn.textContent = 'Exporting…';

    const res = await sendMessage<ExportAllResponse>({
      channel: 'export:all',
      payload: { exportedBy: author || undefined },
    });

    btn.disabled = false;
    btn.textContent = 'Export all';

    if (!res.ok || !res.data) {
      document.getElementById('export-result-all')!.innerHTML = '<div class="error-box">Export failed.</div>';
      return;
    }
    renderExportOutputs('export-result-all', res.data.json, res.data.compact, res.data.userCount, res.data.tagCount);
  });
}

function renderExportOutputs(
  containerId: string,
  json: string,
  compact: string,
  userCount: number,
  tagCount: number,
  label?: string,
): void {
  const resultEl = document.getElementById(containerId)!;
  const slug = label
    ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : 'export';
  const filename = `xtagger-${slug}-${new Date().toISOString().slice(0, 10)}.xtagger.json`;

  resultEl.innerHTML = `
    <div class="preview-box" style="margin-top:10px">
      ${label ? `<div class="preview-row"><span>Collection</span><strong>${escHtml(label)}</strong></div>` : ''}
      <div class="preview-row"><span>Users</span><strong>${userCount}</strong></div>
      <div class="preview-row"><span>Tags</span><strong>${tagCount}</strong></div>
    </div>
    <div class="export-section">
      <label class="export-label">JSON file <span class="hint-inline">(full, importable)</span></label>
      <div class="export-actions">
        <button class="btn-secondary" id="btn-dl-json-${containerId}">⬇ Download</button>
        <button class="btn-secondary" id="btn-copy-json-${containerId}">⧉ Copy</button>
      </div>
    </div>
    <div class="export-section">
      <label class="export-label">XTAG: compact <span class="hint-inline">(share in a DM)</span></label>
      <textarea class="compact-output" readonly rows="3">${escHtml(compact)}</textarea>
      <button class="btn-secondary" id="btn-copy-compact-${containerId}">⧉ Copy XTAG</button>
    </div>
  `;

  document.getElementById(`btn-dl-json-${containerId}`)?.addEventListener('click', () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById(`btn-copy-json-${containerId}`)?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(json);
    flashBtn(`btn-copy-json-${containerId}`, '✓ Copied');
  });

  document.getElementById(`btn-copy-compact-${containerId}`)?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(compact);
    flashBtn(`btn-copy-compact-${containerId}`, '✓ Copied');
  });
}

// ─── Settings view ────────────────────────────────────────────────────────────

function renderSettings(container: HTMLElement): void {
  const s = state.settings;

  container.innerHTML = `
    <div class="section-title">Settings</div>

    <div class="setting-group">
      <label class="setting-label">Display mode</label>
      <div class="radio-group">
        <label class="radio-label"><input type="radio" name="display" value="compact" ${s.displayMode === 'compact' ? 'checked' : ''} /> Compact dots</label>
        <label class="radio-label"><input type="radio" name="display" value="pills"   ${s.displayMode === 'pills'   ? 'checked' : ''} /> Text pills</label>
        <label class="radio-label"><input type="radio" name="display" value="hidden"  ${s.displayMode === 'hidden'  ? 'checked' : ''} /> Hidden (pause)</label>
      </div>
    </div>

    <div class="setting-group">
      <label class="setting-label">Theme</label>
      <div class="radio-group">
        <label class="radio-label"><input type="radio" name="theme" value="auto"  ${s.theme === 'auto'  ? 'checked' : ''} /> Auto</label>
        <label class="radio-label"><input type="radio" name="theme" value="dark"  ${s.theme === 'dark'  ? 'checked' : ''} /> Dark</label>
        <label class="radio-label"><input type="radio" name="theme" value="light" ${s.theme === 'light' ? 'checked' : ''} /> Light</label>
      </div>
    </div>

    <div class="setting-group">
      <label class="toggle-label">
        <input type="checkbox" id="toggle-extended" ${s.extendedPalette ? 'checked' : ''} />
        Extended colour palette (32 colours)
      </label>
    </div>

    <div class="setting-group">
      <label class="toggle-label">
        <input type="checkbox" id="toggle-hover-edit" ${s.hoverToEdit ? 'checked' : ''} />
        Click pills to edit tags
      </label>
    </div>

    <div id="settings-status" class="settings-status"></div>

    <div class="version-info">
      v${escHtml(state.version)} · schema v${state.schemaVersion}
    </div>
  `;

  const autosave = async (): Promise<void> => {
    const displayMode = (document.querySelector('input[name="display"]:checked') as HTMLInputElement | null)?.value as ExtensionSettings['displayMode'] ?? 'compact';
    const theme       = (document.querySelector('input[name="theme"]:checked') as HTMLInputElement | null)?.value as ExtensionSettings['theme'] ?? 'auto';
    const extPalette  = (document.getElementById('toggle-extended') as HTMLInputElement).checked;
    const hoverEdit   = (document.getElementById('toggle-hover-edit') as HTMLInputElement).checked;

    state.settings = { ...state.settings, displayMode, theme, extendedPalette: extPalette, hoverToEdit: hoverEdit };
    applyTheme(theme);

    await sendMessage({ channel: 'settings:save', payload: state.settings });

    // Broadcast to any open X.com tabs
    const tabs = await chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          channel: 'settings:push',
          payload: { displayMode, theme },
        }).catch(() => {}); // Tab may not have content script
      }
    }

    const status = document.getElementById('settings-status')!;
    status.textContent = '✓ Saved';
    setTimeout(() => { status.textContent = ''; }, 1500);
  };

  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', autosave);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function flashBtn(id: string, label: string): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;
  const orig = btn.textContent ?? '';
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

init().catch(console.error);
