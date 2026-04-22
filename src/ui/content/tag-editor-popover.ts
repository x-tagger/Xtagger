/**
 * @module tag-editor-popover
 * @layer UI / Content
 * @description Tag editor popover — opens on hover-icon click.
 *
 * Sections:
 *   1. Quick-assign — all previously used tag names, one-click assign
 *   2. New tag — name input + 32-colour palette (2 rows of 16)
 *   3. User's current tags — edit/delete
 */

import type {
  Tag,
  UserIdentifier,
} from '@core/model/entities';
import type {
  CreateTagRequest,
  CreateTagResponse,
  UpdateTagRequest,
  UpdateTagResponse,
  GetTagsForUserResponse,
  GetAllTagNamesResponse,
  DeleteTagRequest,
  QueryTagsRequest,
  QueryTagsResponse,
} from '@shared/messages';

import { sendMessage }   from '@shared/messages';
import { getColor, getExtendedPalette } from '@core/services/color-palette';
import { announce }      from './announcer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PopoverOptions {
  mode:        'add' | 'edit';
  userId:      UserIdentifier;
  anchor:      Element;
  existingTag?: Tag;
  onSaved:     (tag: Tag)     => void;
  onDeleted:   (tagId: string) => void;
  onClosed:    ()              => void;
}

// ─── Singleton management ─────────────────────────────────────────────────────

let activePopover: TagEditorPopover | null = null;
function closeActive(): void { activePopover?.close(); activePopover = null; }

// ─── TagEditorPopover ─────────────────────────────────────────────────────────

export class TagEditorPopover {
  private host:   HTMLElement  | null = null;
  private shadow: ShadowRoot   | null = null;
  private selectedColorIndex          = 0;
  private allTagNames:  string[]      = [];
  private allTagColors: Map<string, { hex: string; textColor: string; colorIndex: number }> = new Map();
  private userTags:     Tag[]         = [];

  constructor(private readonly log: { debug: (m:string, d?:object) => void; error: (m:string, d?:object) => void }) {}

  async open(opts: PopoverOptions): Promise<void> {
    closeActive();
    activePopover = this;
    this.selectedColorIndex = opts.existingTag?.colorIndex ?? 0;

    const [namesResult, tagsResult, queryResult] = await Promise.all([
      sendMessage<GetAllTagNamesResponse>({ channel: 'tags:get-all-names', payload: {} }),
      sendMessage<GetTagsForUserResponse>({
        channel: 'tags:get-for-user',
        payload: { platform: opts.userId.platform, username: opts.userId.username },
      }),
      sendMessage<QueryTagsResponse>({
        channel: 'tags:query',
        payload: { limit: 200 } satisfies QueryTagsRequest,
      }),
    ]);
    this.allTagNames = namesResult.ok && namesResult.data ? [...namesResult.data] : [];
    this.userTags    = tagsResult.ok  && tagsResult.data  ? [...tagsResult.data]  : [];
    // Build name→color map from most-recently-updated tag with each name
    this.allTagColors = new Map();
    if (queryResult.ok && queryResult.data) {
      for (const { tags } of queryResult.data.users) {
        for (const t of tags) {
          const c = getColor(t.colorIndex);
          this.allTagColors.set(t.name, { hex: c.hex, textColor: c.textColor, colorIndex: t.colorIndex });
        }
      }
    }

    this.render(opts);
    this.position(opts.anchor);
    this.log.debug('Popover opened', { mode: opts.mode, username: opts.userId.username });
  }

  close(): void {
    this.host?.remove();
    this.host   = null;
    this.shadow = null;
    if (activePopover === this) activePopover = null;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private render(opts: PopoverOptions): void {
    this.host = document.createElement('div');
    this.host.setAttribute('data-xtagger-popover', '1');
    this.host.style.cssText = 'position:absolute;z-index:2147483640;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = this.buildHTML(opts);
    this.bindEvents(opts);
    document.documentElement.appendChild(this.host);
    requestAnimationFrame(() => {
      (this.shadow?.querySelector<HTMLInputElement>('#xt-name'))?.focus();
    });
  }

  private buildHTML(opts: PopoverOptions): string {
    const isEdit   = opts.mode === 'edit';
    const tag      = opts.existingTag;
    const username = opts.userId.username;
    const palette  = getExtendedPalette(); // all 32

    // ── Palette grid: 2 rows × 16 ──
    const paletteHTML = palette.map((color, i) => `
      <button
        type="button"
        class="color-swatch ${i === this.selectedColorIndex ? 'selected' : ''}"
        data-index="${i}"
        style="background:${color.hex};"
        title="${color.name}"
        aria-label="${color.name}${i === this.selectedColorIndex ? ' (selected)' : ''}"
        aria-pressed="${i === this.selectedColorIndex}"
        tabindex="${i === this.selectedColorIndex ? '0' : '-1'}"
        role="radio"
      ></button>`).join('');

    // ── Quick-assign: all known tag names (excluding ones already on this user) ──
    const userTagNames = new Set(this.userTags.map(t => t.name));
    const quickTags = this.allTagNames.filter(n => !userTagNames.has(n));
    const quickHTML = quickTags.length > 0 ? `
      <div class="section-label">Quick assign</div>
      <div class="quick-tags">
        ${quickTags.slice(0, 20).map(n => {
          const qc = this.allTagColors.get(n);
          const bg  = qc?.hex      ?? '#1e2230';
          const fg  = qc?.textColor ?? '#c9cdd4';
          const border = qc ? 'transparent' : '#2a2d36';
          // data-color-index carries the canonical colour for this tag name.
          // Clicking the pill saves with THIS colour, not whatever the palette is on.
          const ci = qc?.colorIndex;
          return `<button type="button" class="quick-pill" data-name="${n}"${ci !== undefined ? ` data-color-index="${ci}"` : ''}
            style="background:${bg};color:${fg};border-color:${border};">${n}</button>`;
        }).join('')}
      </div>` : '';

    // ── User's current tags ──
    const userTagsHTML = this.userTags.length > 0 ? `
      <hr class="divider"/>
      <div class="section-label">@${username}'s tags</div>
      <div class="existing-tags">
        ${this.userTags.map(t => {
          const c = getColor(t.colorIndex);
          const active = isEdit && t.id === tag?.id;
          return `<button type="button" class="existing-pill${active ? ' active' : ''}"
            data-tag-id="${t.id}" data-tag-name="${t.name}" data-color="${t.colorIndex}"
            style="background:${c.hex};color:${c.textColor};"
            title="${t.notes ?? ''}">${t.name}</button>`;
        }).join('')}
      </div>` : '';

    return `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :host { display: block; }

        .popover {
          background: #0f1117;
          border: 1px solid #2a2d36;
          border-radius: 14px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4);
          width: 300px;
          font-family: system-ui, -apple-system, sans-serif;
          color: #e7e9ea;
          overflow: hidden;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 14px 0;
        }
        .header-title { font-size: 13px; font-weight: 600; color: #e7e9ea; }
        .close-btn {
          background: none; border: none; color: #6b7280;
          cursor: pointer; font-size: 15px; line-height: 1; padding: 3px;
          border-radius: 4px;
        }
        .close-btn:hover { color: #e7e9ea; background: #2a2d36; }

        .body { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 9px; }

        .section-label {
          font-size: 10px; font-weight: 600; color: #6b7280;
          text-transform: uppercase; letter-spacing: 0.07em;
          margin-bottom: 4px;
        }

        /* ── Quick assign ── */
        .quick-tags { display: flex; flex-wrap: wrap; gap: 5px; }
        .quick-pill {
          background: #1e2230; color: #c9cdd4;
          border: 1px solid #2a2d36; border-radius: 9999px;
          padding: 3px 10px; font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit;
          transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .quick-pill:hover { filter: brightness(1.15); }

        /* ── Name input ── */
        input[type="text"], textarea {
          width: 100%;
          background: #1a1d26; border: 1px solid #2a2d36;
          border-radius: 7px; color: #e7e9ea;
          font-size: 13px; padding: 7px 9px; outline: none;
          font-family: inherit;
        }
        input[type="text"]:focus, textarea:focus { border-color: #D4A000; }

        .autocomplete {
          background: #0f1117; border: 1px solid #2a2d36;
          border-radius: 7px; max-height: 110px; overflow-y: auto;
          display: none; position: absolute; width: 272px; z-index: 10;
        }
        .autocomplete.open { display: block; }
        .autocomplete-item {
          padding: 6px 10px; cursor: pointer; font-size: 12px; color: #e7e9ea;
        }
        .autocomplete-item:hover { background: #1e2230; }

        /* ── Colour palette: 2 rows × 16 ── */
        .palette { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; }
        .color-swatch {
          width: 100%; aspect-ratio: 1; border-radius: 50%;
          border: 2px solid transparent; cursor: pointer;
          transition: transform 0.1s, border-color 0.1s;
        }
        .color-swatch:hover { transform: scale(1.2); }
        .color-swatch.selected {
          border-color: #fff; transform: scale(1.15);
          box-shadow: 0 0 0 2px #0f1117;
        }

        /* ── Notes ── */
        .notes-toggle {
          background: none; border: none; color: #D4A000;
          cursor: pointer; font-size: 11px; padding: 0;
          font-family: inherit; text-align: left;
        }
        .notes-toggle:hover { text-decoration: underline; }
        textarea { resize: vertical; min-height: 50px; font-size: 12px; display: none; }
        textarea.visible { display: block; }
        .char-count { font-size: 10px; color: #6b7280; text-align: right; margin-top: 2px; }
        .char-count.warn { color: #f59e0b; }

        /* ── Actions ── */
        .actions { display: flex; gap: 6px; }
        .btn {
          flex: 1; padding: 7px 0; border-radius: 9999px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          border: none; font-family: inherit; transition: opacity 0.15s;
        }
        .btn:hover { opacity: 0.85; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary { background: #D4A000; color: #0f1117; }
        .btn-cancel  { background: #2a2d36; color: #e7e9ea; flex: 0 0 auto; padding: 7px 13px; }
        .btn-delete  { background: #c0392b; color: #fff; flex: 0 0 auto; padding: 7px 10px; }

        .divider { border: none; border-top: 1px solid #2a2d36; margin: 1px 0; }

        /* ── User's existing tags ── */
        .existing-tags { display: flex; flex-wrap: wrap; gap: 5px; }
        .existing-pill {
          border: none; border-radius: 9999px; padding: 3px 10px;
          font-size: 12px; font-weight: 500; cursor: pointer;
          font-family: inherit; opacity: 0.8;
          transition: opacity 0.12s, outline 0.1s;
        }
        .existing-pill:hover { opacity: 1; }
        .existing-pill.active { opacity: 1; outline: 2px solid #fff; outline-offset: 1px; }

        .error-msg { font-size: 11px; color: #e63946; display: none; }
        .error-msg.visible { display: block; }
      </style>

      <div class="popover" role="dialog" aria-label="Tag editor" tabindex="-1">
        <div class="header">
          <span class="header-title">${isEdit ? `Edit tag · @${username}` : `Tag @${username}`}</span>
          <button type="button" class="close-btn" id="xt-close" aria-label="Close">✕</button>
        </div>
        <div class="body">

          ${quickHTML}

          ${quickTags.length > 0 ? '<hr class="divider"/>' : ''}

          <div>
            <div class="section-label">${isEdit ? 'Edit tag' : 'New tag'}</div>
            <div style="position:relative;">
              <input type="text" id="xt-name" maxlength="50"
                placeholder="Tag name…"
                value="${isEdit ? (tag?.name ?? '') : ''}"
                autocomplete="off" spellcheck="false"/>
              <div class="autocomplete" id="xt-autocomplete"></div>
            </div>
            <div class="error-msg" id="xt-name-error">Tag name is required</div>
          </div>

          <div>
            <div class="section-label">Colour</div>
            <div class="palette" id="xt-palette" role="radiogroup" aria-label="Tag colour">
              ${paletteHTML}
            </div>
          </div>

          <div>
            <button type="button" class="notes-toggle" id="xt-notes-toggle">
              ${isEdit && tag?.notes ? '▾ Notes' : '+ Add notes'}
            </button>
            <textarea id="xt-notes" maxlength="500" placeholder="Optional context…"
              class="${isEdit && tag?.notes ? 'visible' : ''}"
            >${isEdit ? (tag?.notes ?? '') : ''}</textarea>
            <div class="char-count" id="xt-char-count"
              style="display:${isEdit && tag?.notes ? 'block' : 'none'}">
              ${(tag?.notes?.length ?? 0)}/500
            </div>
          </div>

          <div class="actions">
            ${isEdit ? `<button type="button" class="btn btn-delete" id="xt-delete" title="Delete tag">🗑</button>` : ''}
            <button type="button" class="btn btn-cancel" id="xt-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="xt-save">
              ${isEdit ? 'Update' : 'Add tag'}
            </button>
          </div>

          ${userTagsHTML}
        </div>
      </div>`;
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  private bindEvents(opts: PopoverOptions): void {
    const shadow        = this.shadow!;
    const nameInput     = shadow.querySelector<HTMLInputElement>('#xt-name')!;
    const notesTextarea = shadow.querySelector<HTMLTextAreaElement>('#xt-notes')!;
    const autocomplete  = shadow.querySelector<HTMLDivElement>('#xt-autocomplete')!;
    const charCount     = shadow.querySelector<HTMLDivElement>('#xt-char-count')!;
    const nameError     = shadow.querySelector<HTMLDivElement>('#xt-name-error')!;

    shadow.querySelector('#xt-close')?.addEventListener('click', () => { this.close(); opts.onClosed(); });
    shadow.querySelector('#xt-cancel')?.addEventListener('click', () => { this.close(); opts.onClosed(); });

    // ── Quick-assign pills ──
    shadow.querySelector('.quick-tags')?.addEventListener('click', async (e) => {
      const pill = (e.target as Element).closest('.quick-pill') as HTMLElement | null;
      if (!pill) return;
      const name = pill.dataset['name'] ?? '';
      if (!name) return;
      // Pill-wins: save with the pill's own data-color-index. Only fall back to the
      // current palette selection when the pill has no canonical colour, which today
      // means data-color-index is absent (tag name never stored before).
      const raw = pill.dataset['colorIndex'];
      const parsed = raw !== undefined ? Number(raw) : Number.NaN;
      const colorIndex = Number.isFinite(parsed) ? parsed : this.selectedColorIndex;
      await this.saveTag(opts, name, undefined, colorIndex);
    });

    // ── Palette ──
    const PALETTE_COLS = 16;
    const PALETTE_SIZE = 32;

    const selectSwatch = (index: number): void => {
      this.selectedColorIndex = Math.max(0, Math.min(PALETTE_SIZE - 1, index));
      shadow.querySelectorAll<HTMLElement>('.color-swatch').forEach((s, i) => {
        const sel = i === this.selectedColorIndex;
        s.classList.toggle('selected', sel);
        s.setAttribute('aria-pressed', String(sel));
        s.setAttribute('tabindex', sel ? '0' : '-1');
        s.setAttribute('aria-label',
          (getExtendedPalette()[i]?.name ?? '') + (sel ? ' (selected)' : ''));
      });
      shadow.querySelector<HTMLElement>('.color-swatch.selected')?.focus();
    };

    shadow.querySelector('#xt-palette')?.addEventListener('click', (e) => {
      const sw = (e.target as Element).closest('.color-swatch') as HTMLElement | null;
      if (sw) selectSwatch(Number(sw.dataset['index'] ?? 0));
    });

    shadow.querySelector('#xt-palette')?.addEventListener('keydown', (e) => {
      const cur = this.selectedColorIndex;
      let next  = cur;
      switch ((e as KeyboardEvent).key) {
        case 'ArrowRight': next = cur + 1; break;
        case 'ArrowLeft':  next = cur - 1; break;
        case 'ArrowDown':  next = cur + PALETTE_COLS; break;
        case 'ArrowUp':    next = cur - PALETTE_COLS; break;
        case 'Home':       next = 0; break;
        case 'End':        next = PALETTE_SIZE - 1; break;
        default: return;
      }
      (e as KeyboardEvent).preventDefault();
      selectSwatch(next);
    });

    // ── Notes ──
    shadow.querySelector('#xt-notes-toggle')?.addEventListener('click', () => {
      const visible = notesTextarea.classList.toggle('visible');
      charCount.style.display = visible ? 'block' : 'none';
      (shadow.querySelector('#xt-notes-toggle') as HTMLButtonElement).textContent =
        visible ? '▾ Notes' : '+ Add notes';
      if (visible) notesTextarea.focus();
    });
    notesTextarea.addEventListener('input', () => {
      const len = notesTextarea.value.length;
      charCount.textContent = `${len}/500`;
      charCount.classList.toggle('warn', len > 450);
    });

    // ── Name / autocomplete ──
    // Adopt the canonical colour whenever the input settles on an existing
    // tag name — either via autocomplete click or direct typing of an exact
    // (case-insensitive) match. Without this, typing "funny" and hitting Save
    // uses whatever palette colour is currently selected, not the colour of
    // the existing "funny" tag.
    // Pre-Option-A, "canonical" here means first-match-by-case-insensitive
    // lookup over allTagColors — deterministic by Map insertion order but
    // not yet a guaranteed invariant across rows sharing a name. Post-Option-A
    // migration, case-normalisation reduces each equivalence class to one
    // name with one colour, so this becomes a true canonical lookup.
    const adoptCanonicalColour = (name: string): void => {
      const needle = name.trim().toLowerCase();
      if (!needle) return;
      for (const [k, v] of this.allTagColors) {
        if (k.toLowerCase() === needle) { selectSwatch(v.colorIndex); return; }
      }
    };
    nameInput.addEventListener('input', () => {
      this.updateAutocomplete(nameInput, autocomplete, adoptCanonicalColour);
      nameError.classList.remove('visible');
      adoptCanonicalColour(nameInput.value);
    });
    nameInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        (e as KeyboardEvent).preventDefault();
        this.handleSave(opts, nameInput, notesTextarea, nameError);
      } else if ((e as KeyboardEvent).key === 'Escape') {
        if (autocomplete.classList.contains('open')) {
          autocomplete.classList.remove('open');
        } else { this.close(); opts.onClosed(); }
      }
    });
    shadow.querySelector('.popover')?.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('#xt-autocomplete') &&
          !(e.target as Element).closest('#xt-name'))
        autocomplete.classList.remove('open');
    });

    // ── Save / Delete ──
    shadow.querySelector('#xt-save')?.addEventListener('click', () =>
      this.handleSave(opts, nameInput, notesTextarea, nameError));

    shadow.querySelector('#xt-delete')?.addEventListener('click', async () => {
      if (!opts.existingTag) return;
      const saveBtn = shadow.querySelector<HTMLButtonElement>('#xt-save')!;
      const delBtn  = shadow.querySelector<HTMLButtonElement>('#xt-delete')!;
      saveBtn.disabled = true; delBtn.disabled = true; delBtn.textContent = '…';
      await sendMessage<void>({
        channel: 'tags:delete',
        payload: { userId: opts.userId, tagId: opts.existingTag.id } satisfies DeleteTagRequest,
      });
      this.close();
      announce(`Tag deleted from @${opts.userId.username}`, 'polite');
      opts.onDeleted(opts.existingTag.id);
    });

    // ── Existing tag pills → edit ──
    shadow.querySelector('.existing-tags')?.addEventListener('click', async (e) => {
      const pill = (e.target as Element).closest('.existing-pill') as HTMLElement | null;
      if (!pill) return;
      const existingTag = this.userTags.find(t => t.id === pill.dataset['tagId']);
      if (existingTag) await this.open({ ...opts, mode: 'edit', existingTag });
    });

    // ── Click outside → close ──
    const outside = (e: MouseEvent): void => {
      if (!this.host?.contains(e.target as Node) &&
          !(e.target as Element).closest('[data-xtagger-add-btn]')) {
        this.close(); opts.onClosed();
        document.removeEventListener('click', outside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', outside, true), 100);
  }

  // ── Save helpers ──────────────────────────────────────────────────────────

  private async saveTag(
    opts: PopoverOptions,
    name: string,
    notes: string | undefined,
    colorIndex: number,
  ): Promise<void> {
    const res = await sendMessage<CreateTagResponse>({
      channel: 'tags:create',
      payload: { userId: opts.userId, name, colorIndex, notes } satisfies CreateTagRequest,
    });
    if (res.ok && res.data) {
      this.close();
      announce(`Tag "${res.data.name}" added to @${opts.userId.username}`, 'polite');
      opts.onSaved(res.data);
    }
  }

  private async handleSave(
    opts: PopoverOptions,
    nameInput: HTMLInputElement,
    notesTextarea: HTMLTextAreaElement,
    nameError: HTMLDivElement,
  ): Promise<void> {
    const name = nameInput.value.trim();
    if (!name) { nameError.classList.add('visible'); nameInput.focus(); return; }

    const saveBtn = this.shadow?.querySelector<HTMLButtonElement>('#xt-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
    const notes = notesTextarea.value.trim() || undefined;

    let savedTag: Tag | null = null;

    if (opts.mode === 'add') {
      const res = await sendMessage<CreateTagResponse>({
        channel: 'tags:create',
        payload: {
          userId: opts.userId, name,
          colorIndex: this.selectedColorIndex, notes,
        } satisfies CreateTagRequest,
      });
      if (res.ok && res.data) savedTag = res.data;
    } else {
      const res = await sendMessage<UpdateTagResponse>({
        channel: 'tags:update',
        payload: {
          userId: opts.userId, tagId: opts.existingTag!.id,
          name, colorIndex: this.selectedColorIndex, notes,
        } satisfies UpdateTagRequest,
      });
      if (res.ok && res.data) savedTag = res.data;
    }

    if (savedTag) {
      this.close();
      announce(
        opts.mode === 'add'
          ? `Tag "${savedTag.name}" added to @${opts.userId.username}`
          : `Tag "${savedTag.name}" updated`,
        'polite',
      );
      opts.onSaved(savedTag);
    } else {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = opts.mode === 'add' ? 'Add tag' : 'Update';
      }
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────

  private updateAutocomplete(
    input: HTMLInputElement,
    container: HTMLDivElement,
    onPick: (name: string) => void,
  ): void {
    const query = input.value.toLowerCase().trim();
    if (!query) { container.classList.remove('open'); return; }

    const matches = this.allTagNames
      .filter(n => n.toLowerCase().includes(query) && n.toLowerCase() !== query)
      .slice(0, 6);

    if (matches.length === 0) { container.classList.remove('open'); return; }

    container.innerHTML = matches.map(n =>
      `<div class="autocomplete-item" data-name="${n}">${n}</div>`
    ).join('');
    container.classList.add('open');
    container.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        const picked = (item as HTMLElement).dataset['name'] ?? '';
        input.value = picked;
        container.classList.remove('open');
        input.focus();
        onPick(picked);
      });
    });
  }

  // ── Positioning ───────────────────────────────────────────────────────────

  position(anchor: Element): void {
    if (!this.host) return;
    const rect    = anchor.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const POPOVER_H = 360;
    const POPOVER_W = 300;

    let top  = rect.bottom + scrollY + 6;
    let left = Math.min(rect.left + scrollX, window.innerWidth - POPOVER_W - 8);
    if (rect.bottom + POPOVER_H > window.innerHeight)
      top = rect.top + scrollY - POPOVER_H - 6;

    this.host.style.top  = `${Math.max(scrollY + 8, top)}px`;
    this.host.style.left = `${Math.max(8, left)}px`;
  }
}
