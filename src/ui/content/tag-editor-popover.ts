/**
 * @module tag-editor-popover
 * @layer UI / Content
 * @description Inline tag editor popover — rendered in Shadow DOM adjacent to a username.
 *
 * Modes:
 *   - "add":  Empty form for creating a new tag. Shows existing tags for this user below.
 *   - "edit": Pre-filled form for editing/deleting an existing tag.
 *
 * Features:
 *   - Tag name input with real-time autocomplete from all existing tag names
 *   - 16-colour palette grid (4×4) with selection indicator
 *   - Optional notes textarea (max 500 chars, shown/hidden by toggle)
 *   - Existing tags shown as mini pills (click → switch to edit mode)
 *   - Keyboard: Enter to save, Escape to close
 *   - Positioned relative to the anchor, flips up if near viewport bottom
 *   - One popover at a time — opening a new one closes the previous
 *
 * All styles are inline/Shadow DOM — no external CSS dependencies.
 *
 * Dependencies: sendMessage (IPC to background), color-palette
 */

import type { Tag, UserIdentifier } from '@core/model/entities';
import type { LoggerPort } from '@core/ports/logger.port';
import type {
  CreateTagRequest, UpdateTagRequest, DeleteTagRequest,
  CreateTagResponse, UpdateTagResponse, GetAllTagNamesResponse,
  GetTagsForUserResponse,
} from '@shared/messages';

import { sendMessage }   from '@shared/messages';
import { getBasePalette, getColor } from '@core/services/color-palette';
import { announce } from './announcer';

// ─── Singleton management ─────────────────────────────────────────────────────

let activePopover: TagEditorPopover | null = null;

export function closeActivePopover(): void {
  activePopover?.close();
  activePopover = null;
}

// ─── TagEditorPopover ─────────────────────────────────────────────────────────

export type PopoverMode = 'add' | 'edit';

export interface PopoverOptions {
  mode: PopoverMode;
  userId: UserIdentifier;
  anchor: Element;
  existingTag?: Tag;          // only in edit mode
  onSaved: (tag: Tag) => void;
  onDeleted: (tagId: string) => void;
  onClosed: () => void;
}

export class TagEditorPopover {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private selectedColorIndex = 0;
  private allTagNames: string[] = [];
  private userTags: Tag[] = [];
  private readonly log: LoggerPort;

  constructor(logger: LoggerPort) {
    this.log = logger.child('TagEditorPopover');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async open(opts: PopoverOptions): Promise<void> {
    // Close any previously open popover
    closeActivePopover();
    activePopover = this;

    this.selectedColorIndex = opts.existingTag?.colorIndex ?? 0;

    // Fetch autocomplete data and user's current tags in parallel
    const [namesResult, tagsResult] = await Promise.all([
      sendMessage<GetAllTagNamesResponse>({ channel: 'tags:get-all-names', payload: {} }),
      sendMessage<GetTagsForUserResponse>({
        channel: 'tags:get-for-user',
        payload: { platform: opts.userId.platform, username: opts.userId.username },
      }),
    ]);
    this.allTagNames = namesResult.ok && namesResult.data ? [...namesResult.data] : [];
    this.userTags    = tagsResult.ok && tagsResult.data   ? [...tagsResult.data]  : [];

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
    this.host.style.cssText = [
      'position:absolute',
      'z-index:2147483640',
    ].join(';');

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = this.buildHTML(opts);

    this.bindEvents(opts);
    document.documentElement.appendChild(this.host);

    // Focus the name input
    requestAnimationFrame(() => {
      (this.shadow?.querySelector<HTMLInputElement>('#xt-name'))?.focus();
    });
  }

  private buildHTML(opts: PopoverOptions): string {
    const isEdit = opts.mode === 'edit';
    const tag = opts.existingTag;
    const palette = getBasePalette();
    const username = opts.userId.username;

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
      ></button>
    `).join('');

    const existingTagsHTML = this.userTags.length > 0
      ? `<div class="existing-label">Tags for @${username}</div>
         <div class="existing-tags">${this.userTags.map(t => {
           const c = getColor(t.colorIndex);
           const isActive = isEdit && t.id === tag?.id;
           return `<button type="button" class="existing-pill ${isActive ? 'active' : ''}"
             data-tag-id="${t.id}" data-tag-name="${t.name}" data-color="${t.colorIndex}"
             style="background:${c.hex};color:${c.textColor};"
             title="${t.notes ?? ''}"
           >${t.name}</button>`;
         }).join('')}</div>`
      : '';

    return `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :host { display: block; }

        .popover {
          background: #16181c;
          border: 1px solid #2f3336;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
          width: 260px;
          font-family: system-ui, -apple-system, sans-serif;
          color: #e7e9ea;
          overflow: hidden;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px 0;
        }

        .header-title {
          font-size: 13px;
          font-weight: 600;
          color: #e7e9ea;
        }

        .close-btn {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          padding: 2px;
          border-radius: 4px;
        }
        .close-btn:hover { color: #e7e9ea; background: #2f3336; }

        .body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }

        label {
          font-size: 11px;
          font-weight: 500;
          color: #71767b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: block;
          margin-bottom: 3px;
        }

        input[type="text"], textarea {
          width: 100%;
          background: #1e2127;
          border: 1px solid #2f3336;
          border-radius: 6px;
          color: #e7e9ea;
          font-size: 13px;
          padding: 6px 8px;
          outline: none;
          font-family: inherit;
        }
        input[type="text"]:focus, textarea:focus { border-color: #1d9bf0; }

        .autocomplete {
          background: #16181c;
          border: 1px solid #2f3336;
          border-radius: 6px;
          max-height: 120px;
          overflow-y: auto;
          display: none;
          position: absolute;
          width: 236px;
          z-index: 10;
        }
        .autocomplete.open { display: block; }
        .autocomplete-item {
          padding: 6px 10px;
          cursor: pointer;
          font-size: 12px;
          color: #e7e9ea;
        }
        .autocomplete-item:hover { background: #2f3336; }

        .palette { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
        .color-swatch {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform 0.1s, border-color 0.1s;
        }
        .color-swatch:hover { transform: scale(1.15); }
        .color-swatch.selected {
          border-color: #e7e9ea;
          transform: scale(1.1);
          box-shadow: 0 0 0 2px #16181c;
        }

        .notes-toggle {
          background: none;
          border: none;
          color: #1d9bf0;
          cursor: pointer;
          font-size: 11px;
          padding: 0;
          font-family: inherit;
          text-align: left;
        }
        .notes-toggle:hover { text-decoration: underline; }

        textarea { resize: vertical; min-height: 52px; font-size: 12px; display: none; }
        textarea.visible { display: block; }

        .char-count { font-size: 10px; color: #71767b; text-align: right; margin-top: 2px; }
        .char-count.warn { color: #f59e0b; }

        .actions { display: flex; gap: 6px; }
        .btn {
          flex: 1;
          padding: 6px 0;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          font-family: inherit;
          transition: opacity 0.15s;
        }
        .btn:hover { opacity: 0.85; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary { background: #1d9bf0; color: #fff; }
        .btn-cancel  { background: #2f3336; color: #e7e9ea; flex: 0 0 auto; padding: 6px 12px; }
        .btn-delete  { background: #e63946; color: #fff; flex: 0 0 auto; padding: 6px 10px; }

        .divider { border: none; border-top: 1px solid #2f3336; margin: 2px 0; }

        .existing-label {
          font-size: 10px;
          color: #71767b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 500;
        }
        .existing-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .existing-pill {
          border: none;
          border-radius: 9999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          opacity: 0.75;
          transition: opacity 0.12s;
        }
        .existing-pill:hover, .existing-pill.active { opacity: 1; }
        .existing-pill.active { outline: 2px solid #e7e9ea; outline-offset: 1px; }

        .error-msg {
          font-size: 11px;
          color: #e63946;
          display: none;
        }
        .error-msg.visible { display: block; }
      </style>

      <div class="popover" role="dialog" aria-label="Tag editor">
        <div class="header">
          <span class="header-title">${isEdit ? `Edit tag for @${username}` : `Tag @${username}`}</span>
          <button type="button" class="close-btn" id="xt-close" aria-label="Close">✕</button>
        </div>

        <div class="body">
          <div>
            <label for="xt-name">Tag name</label>
            <div style="position:relative;">
              <input
                type="text"
                id="xt-name"
                maxlength="50"
                placeholder="e.g. journalist, developer…"
                value="${isEdit ? (tag?.name ?? '') : ''}"
                autocomplete="off"
                spellcheck="false"
              />
              <div class="autocomplete" id="xt-autocomplete"></div>
            </div>
            <div class="error-msg" id="xt-name-error">Tag name is required</div>
          </div>

          <div>
            <label>Colour</label>
            <div class="palette" id="xt-palette" role="radiogroup" aria-label="Tag colour">${paletteHTML}</div>
          </div>

          <div>
            <button type="button" class="notes-toggle" id="xt-notes-toggle">
              ${isEdit && tag?.notes ? '▾ Notes' : '+ Add notes'}
            </button>
            <textarea
              id="xt-notes"
              maxlength="500"
              placeholder="Optional context…"
              class="${isEdit && tag?.notes ? 'visible' : ''}"
            >${isEdit ? (tag?.notes ?? '') : ''}</textarea>
            <div class="char-count" id="xt-char-count" style="display:${isEdit && tag?.notes ? 'block' : 'none'}">
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

          ${this.userTags.length > 0 ? '<hr class="divider" />' : ''}
          ${existingTagsHTML}
        </div>
      </div>
    `;
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  private bindEvents(opts: PopoverOptions): void {
    const shadow = this.shadow!;
    const nameInput = shadow.querySelector<HTMLInputElement>('#xt-name')!;
    const notesTextarea = shadow.querySelector<HTMLTextAreaElement>('#xt-notes')!;
    const autocomplete = shadow.querySelector<HTMLDivElement>('#xt-autocomplete')!;
    const charCount = shadow.querySelector<HTMLDivElement>('#xt-char-count')!;
    const nameError = shadow.querySelector<HTMLDivElement>('#xt-name-error')!;

    // Close button
    shadow.querySelector('#xt-close')?.addEventListener('click', () => {
      this.close();
      opts.onClosed();
    });
    shadow.querySelector('#xt-cancel')?.addEventListener('click', () => {
      this.close();
      opts.onClosed();
    });

    // Palette selection: click or keyboard (arrow keys)
    const paletteEl = shadow.querySelector('#xt-palette');
    const PALETTE_COLS = 8;
    const PALETTE_SIZE = 16;

    const selectSwatch = (index: number): void => {
      this.selectedColorIndex = Math.max(0, Math.min(PALETTE_SIZE - 1, index));
      shadow.querySelectorAll<HTMLElement>('.color-swatch').forEach((s, i) => {
        const isSelected = i === this.selectedColorIndex;
        s.classList.toggle('selected', isSelected);
        s.setAttribute('aria-pressed', String(isSelected));
        s.setAttribute('tabindex', isSelected ? '0' : '-1');
        s.setAttribute('aria-label',
          (getBasePalette()[i]?.name ?? '') + (isSelected ? ' (selected)' : ''));
      });
      // Move focus to selected swatch
      const selected = shadow.querySelector<HTMLElement>('.color-swatch.selected');
      selected?.focus();
    };

    paletteEl?.addEventListener('click', (e) => {
      const swatch = (e.target as Element).closest('.color-swatch') as HTMLElement | null;
      if (swatch) selectSwatch(Number(swatch.dataset['index'] ?? 0));
    });

    paletteEl?.addEventListener('keydown', (e) => {
      const swatches = shadow.querySelectorAll<HTMLElement>('.color-swatch');
      const cur = this.selectedColorIndex;
      let next = cur;

      switch (e.key) {
        case 'ArrowRight': next = cur + 1; break;
        case 'ArrowLeft':  next = cur - 1; break;
        case 'ArrowDown':  next = cur + PALETTE_COLS; break;
        case 'ArrowUp':    next = cur - PALETTE_COLS; break;
        case 'Home':       next = 0; break;
        case 'End':        next = swatches.length - 1; break;
        default: return;
      }

      e.preventDefault();
      selectSwatch(next);
    });

    // Notes toggle
    shadow.querySelector('#xt-notes-toggle')?.addEventListener('click', () => {
      const visible = notesTextarea.classList.toggle('visible');
      charCount.style.display = visible ? 'block' : 'none';
      if (visible) {
        notesTextarea.focus();
        (shadow.querySelector('#xt-notes-toggle') as HTMLButtonElement).textContent = '▾ Notes';
      } else {
        (shadow.querySelector('#xt-notes-toggle') as HTMLButtonElement).textContent = '+ Add notes';
      }
    });

    // Notes char count
    notesTextarea.addEventListener('input', () => {
      const len = notesTextarea.value.length;
      charCount.textContent = `${len}/500`;
      charCount.classList.toggle('warn', len > 450);
    });

    // Autocomplete
    nameInput.addEventListener('input', () => {
      this.updateAutocomplete(nameInput, autocomplete);
      nameError.classList.remove('visible');
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSave(opts, nameInput, notesTextarea, nameError);
      } else if (e.key === 'Escape') {
        if (autocomplete.classList.contains('open')) {
          autocomplete.classList.remove('open');
        } else {
          this.close();
          opts.onClosed();
        }
      }
    });

    // Click outside → close autocomplete
    this.shadow?.querySelector('.popover')?.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('#xt-autocomplete') &&
          !(e.target as Element).closest('#xt-name')) {
        autocomplete.classList.remove('open');
      }
    });

    // Save
    shadow.querySelector('#xt-save')?.addEventListener('click', () => {
      this.handleSave(opts, nameInput, notesTextarea, nameError);
    });

    // Delete (edit mode only)
    shadow.querySelector('#xt-delete')?.addEventListener('click', async () => {
      if (!opts.existingTag) return;
      const saveBtn = shadow.querySelector<HTMLButtonElement>('#xt-save')!;
      const delBtn  = shadow.querySelector<HTMLButtonElement>('#xt-delete')!;
      saveBtn.disabled = true;
      delBtn.disabled  = true;
      delBtn.textContent = '…';

      await sendMessage<void>({
        channel: 'tags:delete',
        payload: { userId: opts.userId, tagId: opts.existingTag.id } satisfies DeleteTagRequest,
      });

      this.close();
      announce(`Tag deleted from @${opts.userId.username}`, 'polite');
      opts.onDeleted(opts.existingTag.id);
    });

    // Existing tag pills — switch to edit mode
    shadow.querySelector('.existing-tags')?.addEventListener('click', async (e) => {
      const pill = (e.target as Element).closest('.existing-pill') as HTMLElement | null;
      if (!pill) return;
      const tagId    = pill.dataset['tagId'];
      const tagName  = pill.dataset['tagName'];
      const colorStr = pill.dataset['color'];
      if (!tagId) return;

      const existingTag = this.userTags.find(t => t.id === tagId);
      if (!existingTag) return;

      // Re-open in edit mode
      await this.open({
        ...opts,
        mode: 'edit',
        existingTag,
      });
    });

    // Click outside the popover → close
    const outsideHandler = (e: MouseEvent): void => {
      if (!this.host?.contains(e.target as Node) &&
          !(e.target as Element).closest('[data-xtagger-add-btn]')) {
        this.close();
        opts.onClosed();
        document.removeEventListener('click', outsideHandler, true);
      }
    };
    // Slight delay so the opening click doesn't immediately close it
    setTimeout(() => {
      document.addEventListener('click', outsideHandler, true);
    }, 100);
  }

  // ── Save logic ────────────────────────────────────────────────────────────

  private async handleSave(
    opts: PopoverOptions,
    nameInput: HTMLInputElement,
    notesTextarea: HTMLTextAreaElement,
    nameError: HTMLDivElement,
  ): Promise<void> {
    const name = nameInput.value.trim();
    if (!name) {
      nameError.classList.add('visible');
      nameInput.focus();
      return;
    }

    const saveBtn = this.shadow?.querySelector<HTMLButtonElement>('#xt-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

    const notes = notesTextarea.value.trim() || undefined;

    let savedTag: Tag | null = null;

    if (opts.mode === 'add') {
      const res = await sendMessage<CreateTagResponse>({
        channel: 'tags:create',
        payload: {
          userId: opts.userId,
          name,
          colorIndex: this.selectedColorIndex,
          notes,
        } satisfies CreateTagRequest,
      });
      if (res.ok && res.data) savedTag = res.data;
    } else {
      const res = await sendMessage<UpdateTagResponse>({
        channel: 'tags:update',
        payload: {
          userId: opts.userId,
          tagId: opts.existingTag!.id,
          name,
          colorIndex: this.selectedColorIndex,
          notes,
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
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = opts.mode === 'add' ? 'Add tag' : 'Update'; }
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────

  private updateAutocomplete(input: HTMLInputElement, container: HTMLDivElement): void {
    const query = input.value.toLowerCase().trim();
    if (!query) { container.classList.remove('open'); return; }

    const matches = this.allTagNames
      .filter(n => n.toLowerCase().includes(query) && n.toLowerCase() !== query)
      .slice(0, 6);

    if (matches.length === 0) { container.classList.remove('open'); return; }

    container.innerHTML = matches.map(name =>
      `<div class="autocomplete-item" data-name="${name}">${name}</div>`,
    ).join('');

    container.classList.add('open');

    container.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = (item as HTMLElement).dataset['name'] ?? '';
        container.classList.remove('open');
        input.focus();
      });
    });
  }

  // ── Positioning ───────────────────────────────────────────────────────────

  private position(anchor: Element): void {
    if (!this.host) return;
    const rect = anchor.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const vpHeight = window.innerHeight;
    const POPOVER_HEIGHT = 340; // approximate

    let top: number;
    const left = Math.min(rect.left + scrollX, window.innerWidth - 280);

    // Flip up if near viewport bottom
    if (rect.bottom + POPOVER_HEIGHT > vpHeight) {
      top = rect.top + scrollY - POPOVER_HEIGHT - 6;
    } else {
      top = rect.bottom + scrollY + 6;
    }

    this.host.style.top  = `${Math.max(scrollY + 8, top)}px`;
    this.host.style.left = `${Math.max(8, left)}px`;
  }
}
