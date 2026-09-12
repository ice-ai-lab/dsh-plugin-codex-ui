/**
 * Browser half of `dsh-plugin-codex-ui`.
 *
 * Shipped in the built-bundle format the client module system serves from
 * `exports["./client"]`: the host composes it into `window.__DSH_BOOT__` and the
 * shell evaluates this factory lazily on first use. Only platform seed modules
 * are requested (`react`, `@deepseek-ai/dsh-client-ui-primitives`), so
 * `dsh.client.external` stays empty.
 *
 * What it registers:
 *
 *   - `sidebar.brand.name` — the Codex wordmark that replaces the shipped build
 *     badge in the sidebar's brand row;
 *   - `sidebar.workspaces` — the whole browsing region, rebuilt as two
 *     collapsible sections (Projects, Recents) under a single New chat row.
 *
 * Why `sidebar.workspaces` and not a seat of its own: the shell declares that
 * hole as the browsing region and this skin IS a different browsing region.
 * `sidebar.workspaces` is a `single` slot, so this registration shadows the
 * shipped browser rather than stacking beside it (the registry gives a
 * dynamically registered entry lower priority, and lower priority wins a
 * `single` cell) — and if this plugin is unloaded, or this entry ever abdicates
 * after a render crash, the shipped browser takes the cell back with no reload.
 * `sidebar.workspaces.directoryFlow` is deliberately NOT declared: this skin
 * adds projects through the Workspace Controller directly, so the composed
 * directory-picking packages have nothing to fill here.
 *
 * Why the shell chrome is edited with CSS and not shadowed: removing the
 * shipped global panel rows (Pull requests / Scheduled / Plugins) and the
 * shipped New Session button is a *subtraction*, and the cheapest correct way
 * to subtract from another component's output is a stylesheet rule. Shadowing
 * `sidebar` wholesale would mean reimplementing the brand row, the collapse
 * animation, the rail, and the settings foot — four shipped behaviours this
 * skin has no opinion about. The two rules that do this are marked below.
 *
 * The New chat row replaces the shipped button because the gesture differs, not
 * the styling: the shipped one inherits the current or most recent workspace,
 * so with no project registered it can only drop the reader on the project
 * picker. This skin's row starts a session with no project at all, which means
 * asking the node half for a fresh working directory first.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-codex-ui',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let react = require('react');
    let primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    const {
      Tooltip,
      IconChevronDownOutline14, IconChevronRightOutline14,
      IconCloseOutline16, IconFolderClose16, IconFolderOpen16,
      IconNewChatOutline16, IconPlusOutline16, IconProjectAddOutline16,
      IconRefreshOutline16, IconRightUpOutline16, IconTrashOutline16, IconWarningOutline16,
    } = primitives;

    /** Routes owned by this package's node half. */
    const SCRATCH_PATH = '/dsh-codex-ui/scratch';
    const SCRATCH_DELETE_PATH = '/dsh-codex-ui/scratch/delete';

    /** Copy namespace for this package's dictionaries. */
    const NS = 'codexUi';

    /** Stylesheet identity, so a re-registration does not stack duplicate tags. */
    const STYLE_ID = 'dsh-plugin-codex-ui/client.css';

    /** Persisted section fold state, so the sidebar opens the way it was left. */
    const SECTIONS_KEY = 'dsh-codex-ui.sections';

    /** Recents shown before the reader asks for more. */
    const RECENT_DEFAULT = 8;

    /** How many more recents one "show more" reveals. */
    const RECENT_PAGE = 14;

    /** Sessions shown inside one expanded project before it only reports a count. */
    const PROJECT_SESSIONS = 5;

    /**
     * How long a directory-chooser round trip may stay unanswered before the
     * gesture gives up. A native dialog the operator never dismisses must not be
     * able to leave a control pending for the rest of the session.
     */
    const PICK_TIMEOUT_MS = 120000;

    /**
     * The priority this skin registers its two `single`-cell takeovers at.
     *
     * A `single` slot is claimed, not composed: the registry refuses a second
     * registration at the same priority outright ("register at a different
     * priority to shadow it"), so shadowing the shipped brand name and the
     * shipped browsing region has to be asked for explicitly. Among the
     * surviving entries the LOWEST priority renders, and every shipped entry
     * sits at the default 0, so a negative number is what takes the cell over.
     */
    const SHADOW_PRIORITY = -10;

    /** English dictionary (the key-set source of truth). */
    const en = {
      'new.label': 'New chat',
      'new.hint': 'Start without a project — nothing is created until you send',
      'draft.placeholder': 'Ask anything, or describe what you want to build',
      'draft.send': 'Send (Enter)',
      'draft.sending': 'Starting…',
      'draft.failed': 'Could not start the chat: {message}',
      'projects.title': 'Projects',
      'projects.empty': 'No projects yet',
      'projects.add': 'Choose project',
      'projects.newChat': 'New chat in this project',
      'projects.remove': 'Remove project',
      'projects.sessionsEmpty': 'No chats in this project yet',
      'projects.more': '{n} more chats',
      'recents.title': 'Recents',
      'recents.empty': 'No recent chats yet',
      'recents.more': 'Show more',
      'recents.less': 'Show less',
      'sessions.remove': 'Remove chat (archive — the log file stays on disk)',
      'sessions.removeConfirm': 'Archive “{title}”?',
      'sessions.removeYes': 'Archive',
      'sessions.removeNo': 'Cancel',
      'sessions.removeFailed': 'Could not archive the chat: {message}',
      'add.failed': 'Could not open the directory chooser: {message}',
      'start.failed': 'Could not start a chat: {message}',
      'action.failed': 'That action failed: {message}',
      'dismiss': 'Dismiss',
      'loading': 'Loading…',
      'time.now': 'now',
      'time.minutes': '{n}m',
      'time.hours': '{n}h',
      'time.days': '{n}d',
      'time.date': '{month}/{day}',
    };

    /** Simplified Chinese dictionary, the shape this skin is designed against. */
    const zh = {
      'new.label': '新对话',
      'new.hint': '不选择项目直接开始，发送前不会创建任何东西',
      'draft.placeholder': '直接提问，或描述你想构建的内容',
      'draft.send': '发送（Enter）',
      'draft.sending': '正在开始…',
      'draft.failed': '无法开始对话：{message}',
      'projects.title': '项目',
      'projects.empty': '还没有项目',
      'projects.add': '选择项目',
      'projects.newChat': '在此项目中新对话',
      'projects.remove': '移除项目',
      'projects.sessionsEmpty': '该项目还没有对话',
      'projects.more': '还有 {n} 个对话',
      'recents.title': '最近',
      'recents.empty': '还没有最近的对话',
      'recents.more': '显示更多',
      'recents.less': '收起',
      'sessions.remove': '移除对话（归档：日志文件仍保留在磁盘上）',
      'sessions.removeConfirm': '归档「{title}」？',
      'sessions.removeYes': '归档',
      'sessions.removeNo': '取消',
      'sessions.removeFailed': '归档失败：{message}',
      'add.failed': '无法打开目录选择器：{message}',
      'start.failed': '无法开始新对话：{message}',
      'action.failed': '操作失败：{message}',
      'dismiss': '关闭提示',
      'loading': '加载中…',
      'time.now': '刚刚',
      'time.minutes': '{n} 分',
      'time.hours': '{n} 小时',
      'time.days': '{n} 天',
      'time.date': '{month}/{day}',
    };

    /**
     * This skin's stylesheet.
     *
     * Colour and font values are the shipped theme's own alias tokens, so light,
     * dark, and any future theme apply without this file knowing about them.
     *
     * The last block is the only part that touches shipped chrome. Both of its
     * rules subtract rather than restyle, and both need `!important` to beat the
     * shipped component's own single-class selectors regardless of which
     * stylesheet the shell happened to append last:
     *
     *   - `nav[class*="_panelList"]` is the shell's global panel row list (the
     *     Pull requests / Scheduled / Plugins rows). This skin shows Projects
     *     and Recents instead, so the row list is removed in both the expanded
     *     column and the collapsed rail. The selector is not scoped to this
     *     plugin's marker attribute on purpose: the rail drops the marker, and
     *     the class suffix is unique to the sidebar's own CSS module.
     *   - `[data-dshcx] [class*="_newSession"]` is the shipped New Session
     *     button, which this skin replaces with its own New chat row while the
     *     column is expanded. The rail keeps the shipped button, because a
     *     36px icon is already the right shape there.
     */
    const CSS = `
.dshcx-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding-right: var(--dsh-sidebar-inline-padding, 12px);
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}

/* The one gesture that needs no project. */
.dshcx-new {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  margin: 2px 0 6px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dshcx-new:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshcx-new-on { background: var(--dsw-alias-interactive-bg-active); font-weight: 500; }
.dshcx-new:disabled { cursor: default; opacity: .6; }
.dshcx-newicon { display: inline-flex; flex: none; color: var(--dsw-alias-label-secondary); }
.dshcx-newlabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshcx-spin { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary); animation: dshcx-spin 1s linear infinite; }
@keyframes dshcx-spin { to { transform: rotate(360deg); } }

.dshcx-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-bottom: 8px; }
.dshcx-scroll::-webkit-scrollbar { width: 8px; }
.dshcx-scroll::-webkit-scrollbar-track { background: transparent; }
.dshcx-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
.dshcx-scroll:hover::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l2); }
.dshcx-scroll::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-scrollbar-hover-l2); }

.dshcx-section { display: block; margin-bottom: 4px; }
.dshcx-sectionhead { display: flex; align-items: center; gap: 2px; height: 26px; }
.dshcx-sectiontoggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 6px 0 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.dshcx-sectiontoggle:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshcx-chev { display: inline-flex; flex: none; transition: transform .12s var(--ds-ease-in-out, ease); }
.dshcx-chev-open { transform: rotate(90deg); }
.dshcx-sectionlabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshcx-sectioncount { flex: none; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
.dshcx-headaction {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: 0;
}
.dshcx-sectionhead:hover .dshcx-headaction,
.dshcx-headaction:focus-visible { opacity: 1; }
.dshcx-headaction:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

.dshcx-rowwrap { position: relative; display: block; }
.dshcx-nested { padding-left: 18px; }
.dshcx-row {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dshcx-row:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshcx-row:disabled { cursor: default; }
.dshcx-row-on { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); font-weight: 500; }
.dshcx-rowicon { display: inline-flex; flex: none; }
.dshcx-rowlabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshcx-rowtime { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dshcx-rowwrap:hover .dshcx-rowtime { visibility: hidden; }
.dshcx-rowactions {
  position: absolute;
  top: 50%;
  right: 4px;
  display: none;
  align-items: center;
  gap: 2px;
  transform: translateY(-50%);
}
.dshcx-rowwrap:hover .dshcx-rowactions { display: inline-flex; }
.dshcx-rowaction {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dshcx-rowaction:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.dshcx-rowaction:disabled { cursor: default; opacity: .5; }
/* The confirm strip a session row becomes between the gesture and the archive:
   the row itself is the question and the two answers, so nothing new appears
   under the reader's cursor. */
.dshcx-confirm {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 6px 0 8px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.dshcx-confirmtext { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshcx-confirmbtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dshcx-confirmyes { background: var(--dsw-alias-state-error-primary); color: #fff; }
.dshcx-confirmyes:hover:not(:disabled) { opacity: .85; }
.dshcx-confirmyes:disabled { cursor: default; opacity: .5; }
.dshcx-confirmno { background: transparent; color: var(--dsw-alias-label-secondary); }
.dshcx-confirmno:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshcx-confirmno:disabled { cursor: default; opacity: .5; }
.dshcx-confirmerror { flex: none; max-width: 45%; overflow: hidden; color: var(--dsw-alias-state-error-primary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.dshcx-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }

.dshcx-empty { padding: 4px 8px 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dshcx-emptytext { margin-bottom: 6px; }
.dshcx-emptybtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dshcx-emptybtn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshcx-more { padding: 2px 8px 6px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dshcx-morebtn {
  display: flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.dshcx-morebtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

.dshcx-alert {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 17px;
}
.dshcx-alerttext { flex: 1; min-width: 0; word-break: break-word; }
.dshcx-alertclose {
  display: inline-flex;
  flex: none;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

/* The draft composer: a live twin of the shipped blank-state composer's input box
   and send control, positioned over them in viewport coordinates. The values are
   the shipped composer's own, so the twin is indistinguishable from the real one
   until it is used.
   Its fill is the card's own (--dsw-specific-input-major) and never
   transparent: the shipped placeholder occupies exactly this box, and behind a
   clear twin it shows through and collides with the twin's own placeholder into
   one unreadable line. Same token as the card, so the twin stays invisible.
   The inset and the type scale are likewise the shipped input's own — the text
   the reader types has to land exactly where the shipped text would. */
.dshcx-drafttext {
  position: fixed;
  z-index: 6;
  box-sizing: border-box;
  margin: 0;
  padding: 4px 8px 0 14px;
  border: none;
  outline: none;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
  caret-color: var(--dsw-alias-state-business-primary);
  font-family: var(--dsw-font-family);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  resize: none;
  overflow: auto;
}
.dshcx-drafttext::placeholder { color: var(--dsw-alias-label-caption); }
.dshcx-drafttext:disabled { color: var(--dsw-alias-label-dimmed); }
.dshcx-draftsend {
  position: fixed;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--dsw-alias-button-info-fill);
  color: #fff;
  cursor: pointer;
  transition: background-color .1s;
}
.dshcx-draftsend:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.dshcx-draftsend:disabled { opacity: .4; cursor: default; }
.dshcx-drafterror {
  position: fixed;
  z-index: 6;
  box-sizing: border-box;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: var(--dsw-elevation-soft);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  word-break: break-word;
}

/* --- shipped chrome this skin subtracts (see the stylesheet note above) --- */
nav[class*="_panelList"] { display: none !important; }
[data-dshcx] [class*="_newSession"] { display: none !important; }
[data-dshcx] > *:has(> [class*="_newSession"]) { display: none !important; }
[data-dshcx] { --dsh-sidebar-inline-padding: 10px !important; }
[data-dshcx] [class*="_logoRow"] { height: 44px !important; margin-bottom: 4px !important; }
`;

    /** One readable line for any thrown value. */
    const messageOf = (error) => {
      if (error === null || error === undefined) return String(error);
      if (typeof error === 'string') return error;
      if (typeof error.message === 'string' && error.message !== '') return error.message;
      return String(error);
    };

    /**
     * Insert this plugin's stylesheet once.
     * @returns a disposer that removes the tag this call inserted.
     */
    const insertStyles = () => {
      if (typeof document === 'undefined') return () => {};
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']') !== null) {
        return () => {};
      }
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-codex-ui';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => { tag.remove(); };
    };

    /** Read one persisted JSON value. */
    const readStored = (key) => {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch (error) {
        return undefined;
      }
    };

    /** Persist one JSON value. A private-mode or quota failure only costs persistence. */
    const writeStored = (key, value) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        // Deliberately swallowed.
      }
    };

    /**
     * Section fold state that outlives a reload.
     * @param key - storage key.
     * @param initial - the fold state used before anything is stored.
     * @returns the current state and a patch function.
     */
    const useStored = (key, initial) => {
      const [value, setValue] = react.useState(() => {
        const stored = readStored(key);
        return stored !== null && typeof stored === 'object' && !Array.isArray(stored)
          ? Object.assign({}, initial, stored)
          : initial;
      });
      const patch = react.useCallback((change) => {
        setValue((previous) => {
          const next = Object.assign({}, previous, change);
          writeStored(key, next);
          return next;
        });
      }, [key]);
      return [value, patch];
    };

    /** Last path segment, for labels that must stay short. */
    const baseName = (value) => {
      if (typeof value !== 'string' || value === '') return '';
      const parts = value.split(/[/\\]/).filter(Boolean);
      return parts.length === 0 ? value : parts[parts.length - 1];
    };

    /** Separator- and trailing-slash-insensitive spelling of a host path. */
    const pathKey = (value) => (
      typeof value === 'string' ? value.replace(/\\/g, '/').replace(/\/+$/, '') : ''
    );

    /** Whether a working directory sits inside a project directory. */
    const withinPath = (cwd, root) => {
      const child = pathKey(cwd);
      const parent = pathKey(root);
      if (parent === '' || child === '') return false;
      return child === parent || child.startsWith(parent + '/');
    };

    /**
     * Compact relative time, in the shape a narrow sidebar can afford.
     * @param updatedAt - the session's last update, in ms.
     * @param t - translate bound to this plugin's namespace.
     * @returns the label, or '' when there is nothing to show.
     */
    const compactTime = (updatedAt, t) => {
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return '';
      const elapsed = Date.now() - updatedAt;
      if (elapsed < 60_000) return t('time.now');
      const minutes = Math.floor(elapsed / 60_000);
      if (minutes < 60) return t('time.minutes', { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t('time.hours', { n: hours });
      const days = Math.floor(hours / 24);
      if (days < 7) return t('time.days', { n: days });
      const at = new Date(updatedAt);
      return t('time.date', { month: at.getMonth() + 1, day: at.getDate() });
    };

    /** The label one session row shows: the durable title, then the projected one. */
    const sessionLabel = (row) => {
      if (typeof row.title === 'string' && row.title !== '') return row.title;
      if (typeof row.displayTitle === 'string' && row.displayTitle !== '') return row.displayTitle;
      return String(row.id);
    };

    /**
     * Whether one session belongs in a list — the shipped browser's own rule,
     * shared by both listing paths so they cannot disagree: the store knows the
     * row, it is not a subagent, and a BLANK row is listed only while it is the
     * selection. A blank session is an empty new session, and a project that
     * showed every abandoned one would fill up with empty chats.
     * @param row - the list-store row, possibly absent.
     * @param id - the row's session id.
     * @param currentId - the selected session, if any.
     */
    const isListable = (row, id, currentId) => row !== undefined && row !== null
      && row.origin !== 'subagent'
      && !(row.blank === true && id !== currentId);

    /**
     * Allocate one fresh working directory through this package's node half.
     * @returns the allocation payload, or a payload carrying `error`.
     */
    const allocateScratch = async () => {
      try {
        const response = await fetch(SCRATCH_PATH, {
          method: 'POST',
          headers: { accept: 'application/json' },
        });
        const payload = await response.json().catch(() => null);
        if (payload === null || typeof payload !== 'object') return { error: 'the server sent no usable reply' };
        return payload;
      } catch (error) {
        return { error: messageOf(error) };
      }
    };

    /**
     * Report the allocation root, and every directory currently minted under it.
     * @returns the payload, or {} when the node half did not answer.
     */
    const readScratch = async () => {
      try {
        const response = await fetch(SCRATCH_PATH, { headers: { accept: 'application/json' } });
        const payload = await response.json().catch(() => null);
        if (payload === null || typeof payload !== 'object') return {};
        return payload;
      } catch (error) {
        return {};
      }
    };

    /**
     * Delete working directories this plugin allocated, by name.
     * @param names - single path segments returned by a previous allocation.
     */
    const deleteScratch = async (names) => {
      try {
        await fetch(SCRATCH_DELETE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ names }),
        });
      } catch (error) {
        // A failed rollback only leaves an empty directory behind.
      }
    };

    /**
     * The pieces of the shipped blank-state composer a draft has to cover: the
     * box the reader types into, and the send control at its right edge.
     *
     * Addressed by the SEMANTIC attributes the shipped component sets on purpose
     * (`data-phase="hero"` on the conversation root, `data-composer-card` on the
     * card, `data-composer-input` on its editable host) — never by a hashed CSS
     * module class, so a restyle cannot silently break the draft.
     * @returns the two boxes, or null when the blank-state composer is off screen.
     */
    const findComposerBoxes = () => {
      if (typeof document === 'undefined') return null;
      const heroRoot = document.querySelector('[data-phase="hero"]');
      if (heroRoot === null) return null;
      const card = heroRoot.querySelector('[data-composer-card]');
      if (card === null) return null;
      const input = card.querySelector('[data-composer-input]');
      if (input === null) return null;
      const inputRect = input.getBoundingClientRect();
      if (inputRect.width < 40 || inputRect.height < 20) return null;
      // The send control is the card's primary button — inert in the blank state,
      // which is exactly why the draft lays a live twin over it.
      const primaries = card.querySelectorAll('button[class*="primary"]');
      const send = primaries.length === 0 ? null : primaries[primaries.length - 1];
      const sendRect = send === null ? null : send.getBoundingClientRect();
      return {
        input: inputRect,
        send: sendRect === null || sendRect.width < 8 || sendRect.height < 8 ? null : sendRect,
      };
    };

    /**
     * Poll briefly for a freshly created session's binding.
     *
     * `sessions.create` resolves with an id that is already addressable, but the
     * session FACE — the object carrying `prompt` — materializes when the session
     * is first addressed. The first message therefore waits a beat instead of
     * failing outright.
     * @param ctx - client root context.
     * @param id - the session just created and opened.
     * @returns the session binding.
     */
    const waitForSessionBinding = (ctx, id) => new Promise((resolve, reject) => {
      const started = Date.now();
      const attempt = () => {
        let binding;
        try { binding = ctx.sessions.binding(id); } catch (error) { binding = undefined; }
        if (binding !== undefined && binding !== null && binding.session !== undefined) {
          resolve(binding);
          return;
        }
        if (Date.now() - started > 5000) {
          reject(new Error('the session did not become ready'));
          return;
        }
        window.setTimeout(attempt, 50);
      };
      attempt();
    });

    /**
     * One collapsible section header: a chevron, a title, and an optional action.
     * @param props - label, fold state, count, toggle, and the action element.
     */
    function SectionHeader({ label, open, count, onToggle, action }) {
      return react.createElement('div', { className: 'dshcx-sectionhead' },
        react.createElement('button', {
          type: 'button',
          className: 'dshcx-sectiontoggle',
          'aria-expanded': open,
          onClick: onToggle,
        },
        react.createElement('span', { className: 'dshcx-chev' + (open ? ' dshcx-chev-open' : '') },
          react.createElement(IconChevronRightOutline14, { size: 12 })),
        react.createElement('span', { className: 'dshcx-sectionlabel' }, label),
        open ? null : react.createElement('span', { className: 'dshcx-sectioncount' }, String(count))),
        action === undefined || action === null ? null : action);
    }

    /**
     * One session row: title, a running dot, a relative time that yields to the
     * row's own actions on hover, and the remove control.
     *
     * Removing a chat IS archiving it, because `archiveSession` is the only
     * removal the Host has. Archiving is one-way — no unarchive exists in the
     * client API, in the Host commands, or in the shipped UI — while the session
     * log itself stays on disk. So the control is deliberately two steps: the
     * trash turns the row into the question, naming the chat it would archive,
     * and only the answer archives it. A hover-revealed, one-click, one-way
     * control at the exact right edge of a row the reader is aiming at is a trap;
     * a question is not.
     *
     * The row is never `disabled` either: a gesture that hangs elsewhere must not
     * be able to take the whole list away from the reader.
     * @param props - row, selection, indentation, and the row's callbacks.
     */
    function SessionRow({ t, row, selected, nested, onOpen, onRemove }) {
      const label = sessionLabel(row);
      const time = compactTime(row.updatedAt, t);
      const detail = typeof row.cwd === 'string' && row.cwd !== '' ? row.cwd : '';
      const [asking, setAsking] = react.useState(false);
      const [busy, setBusy] = react.useState(false);
      const [failure, setFailure] = react.useState(null);
      const indent = nested === true ? ' dshcx-nested' : '';

      if (asking) {
        return react.createElement('div', { className: 'dshcx-rowwrap' + indent },
          react.createElement('div', { className: 'dshcx-confirm' },
            react.createElement('span', {
              className: 'dshcx-confirmtext',
              title: detail === '' ? label : label + ' — ' + detail,
            }, t('sessions.removeConfirm', { title: label })),
            failure === null ? null : react.createElement('span', {
              className: 'dshcx-confirmerror',
              title: failure,
            }, failure),
            react.createElement('button', {
              type: 'button',
              className: 'dshcx-confirmbtn dshcx-confirmyes',
              disabled: busy,
              onClick: () => {
                setBusy(true);
                setFailure(null);
                Promise.resolve(onRemove(row.id)).then(() => {
                  // The row normally disappears with the archive; this only covers
                  // a Host that accepted the call without the list moving.
                  setBusy(false);
                  setAsking(false);
                }).catch((reason) => {
                  setFailure(t('sessions.removeFailed', { message: messageOf(reason) }));
                  setBusy(false);
                });
              },
            }, t('sessions.removeYes')),
            react.createElement('button', {
              type: 'button',
              className: 'dshcx-confirmbtn dshcx-confirmno',
              disabled: busy,
              onClick: () => { setAsking(false); setFailure(null); },
            }, t('sessions.removeNo'))));
      }

      return react.createElement('div', { className: 'dshcx-rowwrap' + indent },
        react.createElement('button', {
          type: 'button',
          className: 'dshcx-row' + (selected ? ' dshcx-row-on' : ''),
          title: detail === '' ? label : label + ' — ' + detail,
          'aria-current': selected ? 'page' : undefined,
          onClick: () => { onOpen(row.id); },
        },
        react.createElement('span', { className: 'dshcx-rowlabel' }, label),
        row.running === true ? react.createElement('span', { className: 'dshcx-dot', 'aria-hidden': 'true' }) : null,
        time === '' ? null : react.createElement('span', { className: 'dshcx-rowtime' }, time)),
        onRemove === undefined
          ? null
          : react.createElement('span', { className: 'dshcx-rowactions' },
            react.createElement(Tooltip, { label: t('sessions.remove'), delayMs: 500 },
              react.createElement('button', {
                type: 'button',
                className: 'dshcx-rowaction',
                'aria-label': t('sessions.remove'),
                onClick: (event) => { event.stopPropagation(); setAsking(true); },
              }, react.createElement(IconTrashOutline16, { size: 12 })))));
    }

    /**
     * One project row: a fold control, its sessions when open, and the two
     * gestures that belong to a project — a new chat inside it, and removing its
     * registration (which never touches the directory or the session logs).
     *
     * The folder glyph carries the fold state (closed vs open) instead of a
     * chevron, which keeps the row to one leading mark and still says whether the
     * row is showing its chats.
     * @param props - workspace, its sessions, and the row's callbacks.
     */
    function ProjectRow({ t, workspace, sessions, selectedId, open, onToggle, onOpen, onNewChat, onRemove, onRemoveSession }) {
      const title = typeof workspace.title === 'string' && workspace.title !== ''
        ? workspace.title
        : baseName(workspace.path);
      const holdsCurrent = sessions.some((row) => row.id === selectedId);
      return react.createElement('div', { className: 'dshcx-project' },
        react.createElement('div', { className: 'dshcx-rowwrap' },
          react.createElement('button', {
            type: 'button',
            className: 'dshcx-row' + (holdsCurrent ? ' dshcx-row-on' : ''),
            title: workspace.path,
            'aria-expanded': open,
            onClick: onToggle,
          },
          react.createElement('span', { className: 'dshcx-rowicon' },
            react.createElement(open ? IconFolderOpen16 : IconFolderClose16, { size: 14 })),
          react.createElement('span', { className: 'dshcx-rowlabel' }, title)),
          react.createElement('span', { className: 'dshcx-rowactions' },
            react.createElement(Tooltip, { label: t('projects.newChat'), delayMs: 500 },
              react.createElement('button', {
                type: 'button',
                className: 'dshcx-rowaction',
                'aria-label': t('projects.newChat'),
                onClick: (event) => { event.stopPropagation(); onNewChat(workspace.workspaceId); },
              }, react.createElement(IconPlusOutline16, { size: 12 }))),
            react.createElement(Tooltip, { label: t('projects.remove'), delayMs: 500 },
              react.createElement('button', {
                type: 'button',
                className: 'dshcx-rowaction',
                'aria-label': t('projects.remove'),
                onClick: (event) => { event.stopPropagation(); onRemove(workspace.workspaceId); },
              }, react.createElement(IconTrashOutline16, { size: 12 }))))),
        open === true
          ? react.createElement('div', { className: 'dshcx-projectbody' },
            sessions.length === 0
              ? react.createElement('div', { className: 'dshcx-empty dshcx-nested' }, t('projects.sessionsEmpty'))
              : sessions.slice(0, PROJECT_SESSIONS).map((row) => react.createElement(SessionRow, {
                key: row.id,
                t,
                row,
                nested: true,
                selected: row.id === selectedId,
                onOpen,
                onRemove: onRemoveSession,
              })),
            sessions.length > PROJECT_SESSIONS
              ? react.createElement('div', { className: 'dshcx-more dshcx-nested' },
                t('projects.more', { n: sessions.length - PROJECT_SESSIONS }))
              : null)
          : null);
    }

    /**
     * The draft composer: a live input laid exactly over the shipped blank-state
     * composer, which is inert until the session has a workspace.
     *
     * This overlay is the price of "create nothing until the reader actually
     * sends". A session cannot be typed into without a working directory, so
     * deferring the directory defers the session, and the shipped composer is
     * then left with nothing to be live for — it renders disabled behind "choose
     * a workspace to start". Covering its input box and its send control is what
     * makes typing possible before anything exists on disk.
     *
     * Only those two boxes are covered. The card itself, the tool row, the
     * workspace picker and the mode chip stay exactly the shipped ones.
     *
     * Sending is the single gesture that touches the disk, and it is staged so a
     * retry after a failure can never mint a second directory: the directory, the
     * workspace registration and the session are each created at most once per
     * draft.
     */
    function DraftComposer({ ctx, t, draft, useSessions }) {
      const active = draft.useActive();
      const [boxes, setBoxes] = react.useState(null);
      const [text, setText] = react.useState('');
      const [busy, setBusy] = react.useState(false);
      const [error, setError] = react.useState(null);
      const staged = react.useRef(null);
      const currentId = useSessions((snapshot) => (
        snapshot === undefined || snapshot === null ? undefined : snapshot.current
      ));

      // Track the two boxes with one rAF-coalesced pass: a poll (the shipped hero
      // mounts and animates in after this component), a window resize listener,
      // and a body-subtree MutationObserver.
      react.useEffect(() => {
        let frame = 0;
        let alive = true;
        const same = (left, right) => (left === null && right === null)
          || (left !== null && right !== null
            && Math.abs(left.left - right.left) < 1 && Math.abs(left.top - right.top) < 1
            && Math.abs(left.width - right.width) < 1 && Math.abs(left.height - right.height) < 1);
        const locate = () => {
          if (!alive) return;
          const next = findComposerBoxes();
          if (next === null) {
            setBoxes((previous) => (previous === null ? previous : null));
            return;
          }
          setBoxes((previous) => {
            if (previous === null) return next;
            return same(previous.input, next.input) && same(previous.send, next.send) ? previous : next;
          });
        };
        const schedule = () => {
          if (frame !== 0) return;
          frame = window.requestAnimationFrame(() => { frame = 0; locate(); });
        };
        locate();
        const poll = window.setInterval(schedule, 400);
        window.addEventListener('resize', schedule);
        let observer = null;
        try {
          observer = new MutationObserver(schedule);
          observer.observe(document.body, { childList: true, subtree: true });
        } catch (mutationError) {
          // A missing observer only costs live re-measurement; the poll remains.
        }
        return () => {
          alive = false;
          window.clearInterval(poll);
          window.removeEventListener('resize', schedule);
          if (frame !== 0) window.cancelAnimationFrame(frame);
          if (observer !== null) observer.disconnect();
        };
      }, []);

      // A session becoming current means this draft was sent, or the reader went
      // somewhere else instead. Either way it is no longer a draft.
      react.useEffect(() => {
        if (currentId !== undefined && draft.isActive()) draft.setActive(false);
      }, [currentId, draft]);

      /**
       * Turn the draft into a real chat.
       *
       * Ordered so the only partially-done state a failure can leave behind is a
       * directory nothing references — and that is removed again. Once the
       * registration exists the directory is referenced and is never deleted from
       * under it.
       */
      const send = () => {
        const value = text.trim();
        if (value === '' || busy) return;
        setBusy(true);
        setError(null);
        void (async () => {
          if (staged.current === null) staged.current = {};
          const stage = staged.current;
          if (stage.workspaceId === undefined) {
            const scratch = await allocateScratch();
            if (scratch === null || typeof scratch !== 'object'
              || typeof scratch.path !== 'string' || scratch.path === '') {
              const detail = scratch !== null && typeof scratch === 'object' && scratch.error !== undefined
                ? messageOf(scratch.error)
                : 'the working directory could not be created';
              throw new Error(detail);
            }
            let workspace;
            try {
              workspace = await ctx.workspaces.create({ path: scratch.path });
            } catch (reason) {
              if (typeof scratch.name === 'string' && scratch.name !== '') await deleteScratch([scratch.name]);
              throw reason;
            }
            if (workspace === null || workspace === undefined || typeof workspace.workspaceId !== 'string') {
              throw new Error('the Host did not return a workspace for ' + scratch.path);
            }
            stage.workspaceId = workspace.workspaceId;
          }
          if (stage.sessionId === undefined) {
            stage.sessionId = await ctx.sessions.create({ workspaceId: stage.workspaceId });
            ctx.sessions.open(stage.sessionId);
          }
          const binding = await waitForSessionBinding(ctx, stage.sessionId);
          const result = await binding.session.prompt([{ type: 'text', text: value }], 'queue');
          if (result === null || result === undefined || result.ok !== true) {
            const detail = result !== null && result !== undefined
              && result.error !== undefined && typeof result.error.message === 'string'
              ? result.error.message
              : 'the message was not accepted';
            throw new Error(detail);
          }
          staged.current = null;
          setText('');
          draft.setActive(false);
        })().catch((reason) => { setError(messageOf(reason)); })
          .finally(() => { setBusy(false); });
      };

      if (active !== true) return null;
      if (boxes === null) return null;
      const input = boxes.input;
      const send_ = boxes.send;
      return react.createElement(react.Fragment, null,
        error === null ? null : react.createElement('div', {
          className: 'dshcx-drafterror',
          role: 'alert',
          style: { left: input.left + 'px', top: Math.max(8, input.top - 30) + 'px', width: input.width + 'px' },
        }, t('draft.failed', { message: error })),
        react.createElement('textarea', {
          className: 'dshcx-drafttext',
          value: text,
          autoFocus: true,
          spellCheck: false,
          placeholder: t('draft.placeholder'),
          'aria-label': t('draft.placeholder'),
          disabled: busy,
          style: {
            left: input.left + 'px',
            top: input.top + 'px',
            width: input.width + 'px',
            height: input.height + 'px',
          },
          // The shipped card treats a press anywhere on it as "open the workspace
          // picker"; the editable twin must not relay its own.
          onPointerDown: (event) => { event.stopPropagation(); },
          onClick: (event) => { event.stopPropagation(); },
          onChange: (event) => { setText(event.target.value); },
          onKeyDown: (event) => {
            if (event.key !== 'Enter') return;
            if (event.shiftKey || (event.nativeEvent !== undefined && event.nativeEvent.isComposing)) return;
            event.preventDefault();
            send();
          },
        }),
        send_ === null ? null : react.createElement('button', {
          type: 'button',
          className: 'dshcx-draftsend',
          title: busy ? t('draft.sending') : t('draft.send'),
          'aria-label': busy ? t('draft.sending') : t('draft.send'),
          disabled: busy || text.trim() === '',
          style: {
            left: send_.left + 'px',
            top: send_.top + 'px',
            width: send_.width + 'px',
            height: send_.height + 'px',
          },
          onPointerDown: (event) => { event.stopPropagation(); },
          onClick: (event) => { event.stopPropagation(); send(); },
        }, busy
          ? react.createElement('span', { className: 'dshcx-spin' },
            react.createElement(IconRefreshOutline16, { size: 14 }))
          : react.createElement(IconRightUpOutline16, { size: 16 })));
    }

    /**
     * The browsing region: a New chat row over two collapsible sections.
     *
     * Data arrives through the framework's global standard hooks
     * (`useSessions` / `useWorkspaces`), and every Host action arrives through
     * this registration's own inject face. Nothing here reads a Host fact that
     * would freeze at first render, which is why the inject factories return
     * plain callbacks and not values.
     * @param props - shell owner share, standard hooks, locale, and the inject face.
     */
    function CodexBrowser(props) {
      const {
        wide, t, useSessions, useWorkspaces,
        startDraft, startInWorkspace, openSession, useDraftActive,
        adoptWorkspace, removeWorkspace, pickDirectory, loadScratchRoot, archiveSession,
      } = props;

      const hostRef = react.useRef(null);
      const [sections, patchSections] = useStored(SECTIONS_KEY, { projects: true, recents: true });
      const [expanded, setExpanded] = react.useState({});
      const [recentVisible, setRecentVisible] = react.useState(RECENT_DEFAULT);
      const [busy, setBusy] = react.useState(false);
      const [alert, setAlert] = react.useState(null);
      const draftActive = useDraftActive();

      const sessions = useSessions((snapshot) => snapshot);
      const workspaceState = useWorkspaces((snapshot) => snapshot);

      const workspaces = workspaceState !== undefined && workspaceState !== null
        && Array.isArray(workspaceState.items) ? workspaceState.items : [];
      const rows = sessions === undefined || sessions === null ? undefined : sessions.byId;
      const ids = sessions === undefined || sessions === null || !Array.isArray(sessions.ids) ? [] : sessions.ids;
      const currentId = sessions === undefined || sessions === null ? undefined : sessions.current;
      const loading = (sessions !== undefined && sessions !== null && sessions.phase === 'pending')
        || (workspaceState !== undefined && workspaceState !== null && workspaceState.phase === 'pending');

      /**
       * The Host's archive set, as a lookup.
       *
       * The session list itself never carries this: archiving is a Workspace
       * projection concern, so the shipped browsing region subtracts the set
       * itself — and so must this one. Without it a chat the reader just removed
       * would keep its row until the page was reloaded.
       */
      const archivedIds = react.useMemo(() => {
        const archived = workspaceState !== undefined && workspaceState !== null
          && Array.isArray(workspaceState.archivedSessionIds)
          ? workspaceState.archivedSessionIds
          : [];
        return new Set(archived);
      }, [workspaceState]);

      /**
       * The directory root this skin mints project-less working directories
       * under, which is the only thing that distinguishes a workspace it created
       * from one the reader registered on purpose.
       *
       * The read is retried while it has not answered yet: the root never
       * changes, so one successful answer is enough for the life of the page, and
       * until it arrives every workspace reads as a project — the safe direction,
       * since nothing is hidden from Projects on a guess.
       */
      const [scratchRoot, setScratchRoot] = react.useState(undefined);
      react.useEffect(() => {
        if (scratchRoot !== undefined) return () => {};
        let alive = true;
        void loadScratchRoot().then((root) => {
          if (alive && typeof root === 'string' && root !== '') setScratchRoot(root);
        });
        return () => { alive = false; };
      }, [scratchRoot, workspaces.length, loadScratchRoot]);

      /** The workspaces that are projects: every workspace this skin did not mint. */
      const projectWorkspaces = react.useMemo(
        () => workspaces.filter((workspace) => scratchRoot === undefined || !withinPath(workspace.path, scratchRoot)),
        [workspaces, scratchRoot],
      );

      // Mark the shipped sidebar column so the stylesheet can subtract the two
      // shipped controls this skin replaces. The marker is only set while the
      // column is expanded: the rail keeps the shipped New Session button.
      react.useEffect(() => {
        const node = hostRef.current;
        if (node === null) return () => {};
        const region = node.closest('[class*="regionArea"]');
        const root = region === null ? node.parentElement : region.parentElement;
        if (root === null) return () => {};
        root.setAttribute('data-dshcx', '');
        return () => { root.removeAttribute('data-dshcx'); };
      }, [wide]);

      // Open the project that owns the selected session, once per selection, so
      // the current chat is always reachable without hunting for it. A chat that
      // lives in a project-less workspace has no project row to open.
      const followedCurrent = react.useRef(undefined);
      react.useEffect(() => {
        if (currentId === undefined || followedCurrent.current === currentId) return;
        followedCurrent.current = currentId;
        const owner = projectWorkspaces.find((workspace) => (
          Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(currentId)
        ));
        if (owner === undefined) return;
        setExpanded((previous) => (
          previous[owner.workspaceId] === true
            ? previous
            : Object.assign({}, previous, { [owner.workspaceId]: true })
        ));
      }, [currentId, projectWorkspaces]);

      /**
       * Every session that can be listed, in host list order: the archived ones
       * are already gone, and so is anything that is not a chat of its own.
       */
      const listable = react.useMemo(() => {
        if (rows === undefined) return [];
        const collected = [];
        for (const id of ids) {
          if (archivedIds.has(id)) continue;
          const row = rows[id];
          if (isListable(row, id, currentId)) collected.push(row);
        }
        return collected;
      }, [rows, ids, currentId, archivedIds]);

      /**
       * Where every listable chat belongs: one bucket per project, plus Recents.
       *
       * Ownership takes `sessionIds` as authoritative — a session accounted to a
       * workspace belongs to it even if its directory later moved — and falls
       * back to directory containment, assigned to the DEEPEST matching
       * workspace, so a workspace nested inside another never claims the inner
       * one's chats as well.
       *
       * Only the owner's KIND decides the list, not whether an owner exists:
       * ownership by a project puts the chat under that project, and ownership by
       * a workspace this skin minted — or by nothing at all — puts it in Recents.
       * That is what keeps a project-less chat out of Projects while still
       * letting it be a perfectly ordinary workspace session.
       */
      const classify = react.useMemo(() => {
        const claimed = new Map();
        for (const workspace of workspaces) {
          if (!Array.isArray(workspace.sessionIds)) continue;
          for (const id of workspace.sessionIds) {
            if (!claimed.has(id)) claimed.set(id, workspace.workspaceId);
          }
        }
        const deepest = (cwd) => {
          let best;
          let bestLength = -1;
          for (const workspace of workspaces) {
            if (!withinPath(cwd, workspace.path)) continue;
            const length = pathKey(workspace.path).length;
            if (length > bestLength) {
              best = workspace.workspaceId;
              bestLength = length;
            }
          }
          return best;
        };
        const projectIds = new Set(projectWorkspaces.map((workspace) => workspace.workspaceId));
        const buckets = new Map();
        for (const workspace of projectWorkspaces) buckets.set(workspace.workspaceId, []);
        const recents = [];
        for (const row of listable) {
          const owner = claimed.has(row.id) ? claimed.get(row.id) : deepest(row.cwd);
          if (owner !== undefined && projectIds.has(owner)) buckets.get(owner).push(row);
          else recents.push(row);
        }
        const newestFirst = (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0);
        for (const bucket of buckets.values()) bucket.sort(newestFirst);
        recents.sort(newestFirst);
        return { buckets, recents };
      }, [workspaces, projectWorkspaces, listable]);

      /**
       * Run one PROJECT gesture with shared failure reporting.
       *
       * Only the gestures that mutate a registration come through here, and the
       * busy flag gates nothing but them: it must never be able to disable the
       * list, because a control the reader cannot press is worse than one that
       * can be pressed twice.
       */
      const run = (work, message) => {
        if (busy) return;
        setBusy(true);
        setAlert(null);
        Promise.resolve()
          .then(work)
          .catch((reason) => { setAlert(t(message, { message: messageOf(reason) })); })
          .finally(() => { setBusy(false); });
      };

      /**
       * Open a chat. Deliberately outside the busy guard: navigation has to keep
       * working whatever else may be in flight.
       */
      const openNow = (sessionId) => {
        try {
          openSession(sessionId);
        } catch (reason) {
          setAlert(t('action.failed', { message: messageOf(reason) }));
        }
      };

      const projectsOpen = sections.projects !== false;
      const recentsOpen = sections.recents !== false;

      // The rail draws its own icons, so this region renders nothing there.
      if (wide !== true) return null;

      /**
       * Add a project: ask the Host for its directory chooser, then adopt what
       * came back. A cancelled chooser resolves to null and is not a failure —
       * only a chooser that could not be opened, or a directory the registry
       * refuses, reaches the caller as one.
       * @returns the adopted workspace, or null when the chooser was cancelled.
       */
      const onChooseProject = async () => {
        const picked = await pickDirectory();
        if (typeof picked !== 'string' || picked === '') return null;
        const workspace = await adoptWorkspace(picked);
        if (workspace !== undefined && workspace !== null && typeof workspace.workspaceId === 'string') {
          setExpanded((previous) => Object.assign({}, previous, { [workspace.workspaceId]: true }));
          patchSections({ projects: true });
        }
        return workspace;
      };

      return react.createElement('div', { className: 'dshcx-root', ref: hostRef },
        react.createElement(Tooltip, { label: t('new.hint'), delayMs: 600 },
          react.createElement('button', {
            type: 'button',
            className: 'dshcx-new' + (draftActive === true ? ' dshcx-new-on' : ''),
            'aria-pressed': draftActive === true,
            onClick: () => { startDraft(); },
          },
          react.createElement('span', { className: 'dshcx-newicon' },
            react.createElement(IconNewChatOutline16, { size: 14 })),
          react.createElement('span', { className: 'dshcx-newlabel' }, t('new.label')))),

        alert === null ? null : react.createElement('div', { className: 'dshcx-alert', role: 'alert' },
          react.createElement(IconWarningOutline16, { size: 12 }),
          react.createElement('span', { className: 'dshcx-alerttext' }, alert),
          react.createElement('button', {
            type: 'button',
            className: 'dshcx-alertclose',
            'aria-label': t('dismiss'),
            onClick: () => { setAlert(null); },
          }, react.createElement(IconCloseOutline16, { size: 12 }))),

        react.createElement('div', { className: 'dshcx-scroll' },
          loading
            ? react.createElement('div', { className: 'dshcx-empty' }, t('loading'))
            : react.createElement(react.Fragment, null,
              react.createElement('section', { className: 'dshcx-section' },
                react.createElement(SectionHeader, {
                  label: t('projects.title'),
                  open: projectsOpen,
                  count: projectWorkspaces.length,
                  onToggle: () => { patchSections({ projects: !projectsOpen }); },
                  action: react.createElement(Tooltip, { label: t('projects.add'), delayMs: 500 },
                    react.createElement('button', {
                      type: 'button',
                      className: 'dshcx-headaction',
                      'aria-label': t('projects.add'),
                      onClick: () => { run(onChooseProject, 'add.failed'); },
                    }, react.createElement(IconProjectAddOutline16, { size: 14 }))),
                }),
                projectsOpen
                  ? react.createElement('div', { className: 'dshcx-sectionbody' },
                    projectWorkspaces.length === 0
                      ? react.createElement('div', { className: 'dshcx-empty' },
                        react.createElement('div', { className: 'dshcx-emptytext' }, t('projects.empty')),
                        react.createElement('button', {
                          type: 'button',
                          className: 'dshcx-emptybtn',
                          onClick: () => { run(onChooseProject, 'add.failed'); },
                        }, t('projects.add')))
                      : projectWorkspaces.map((workspace) => react.createElement(ProjectRow, {
                        key: workspace.workspaceId,
                        t,
                        workspace,
                        sessions: classify.buckets.get(workspace.workspaceId) || [],
                        selectedId: currentId,
                        open: expanded[workspace.workspaceId] === true,
                        onToggle: () => {
                          setExpanded((previous) => Object.assign({}, previous, {
                            [workspace.workspaceId]: previous[workspace.workspaceId] !== true,
                          }));
                        },
                        onOpen: openNow,
                        onNewChat: (workspaceId) => { run(() => startInWorkspace(workspaceId), 'start.failed'); },
                        onRemove: (workspaceId) => { run(() => removeWorkspace(workspaceId), 'action.failed'); },
                        onRemoveSession: archiveSession,
                      })))
                  : null),

              react.createElement('section', { className: 'dshcx-section' },
                react.createElement(SectionHeader, {
                  label: t('recents.title'),
                  open: recentsOpen,
                  count: classify.recents.length,
                  onToggle: () => { patchSections({ recents: !recentsOpen }); },
                }),
                recentsOpen
                  ? react.createElement('div', { className: 'dshcx-sectionbody' },
                    classify.recents.length === 0
                      ? react.createElement('div', { className: 'dshcx-empty' },
                        react.createElement('div', { className: 'dshcx-emptytext' }, t('recents.empty')))
                      : react.createElement(react.Fragment, null,
                        classify.recents.slice(0, recentVisible).map((row) => react.createElement(SessionRow, {
                          key: row.id,
                          t,
                          row,
                          selected: row.id === currentId,
                          onOpen: openNow,
                          onRemove: archiveSession,
                        })),
                        classify.recents.length > recentVisible
                          ? react.createElement('button', {
                            type: 'button',
                            className: 'dshcx-morebtn',
                            onClick: () => { setRecentVisible((visible) => visible + RECENT_PAGE); },
                          },
                          react.createElement(IconChevronDownOutline14, { size: 12 }),
                          t('recents.more'))
                          : null,
                        recentVisible > RECENT_DEFAULT && classify.recents.length <= recentVisible
                          ? react.createElement('button', {
                            type: 'button',
                            className: 'dshcx-morebtn',
                            onClick: () => { setRecentVisible(RECENT_DEFAULT); },
                          }, t('recents.less'))
                          : null))
                  : null))));
    }

    /**
     * The wordmark that takes the shipped build badge's place in the brand row.
     *
     * The shipped fallback is the local build stamp, so naming the product here
     * is the whole point; the string below is the one place to change it.
     */
    function BrandName() {
      return 'DeepSeek Harness';
    }

    /**
     * Required browser services: the seat ledger, the copy, the session list feed
     * this region reads through the global `useSessions` hook, and the Workspace
     * plus navigation controllers every start and open gesture goes through.
     */
    const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'];

    /**
     * Client plugin body: seat the dictionary and the stylesheet, then fill the
     * brand-name cell and the browsing region.
     * @param {import('@deepseek-ai/cordis').Context} ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-codex-ui: dictionaries');
      ctx.effect(() => insertStyles(), 'dsh-plugin-codex-ui: stylesheet');

      /**
       * The draft: a chat the reader has started but not yet sent.
       *
       * A draft is a piece of UI state and nothing else. No session row, no
       * Workspace registration, and above all no directory — the whole point of
       * the gesture is that clicking New chat repeatedly costs nothing. Only
       * sending mints anything.
       */
      let draftActive = false;
      const draftListeners = new Set();
      const useActive = () => {
        const [value, setValue] = react.useState(draftActive);
        react.useEffect(() => {
          const listener = () => { setValue(draftActive); };
          draftListeners.add(listener);
          return () => { draftListeners.delete(listener); };
        }, []);
        return value;
      };
      const setActive = (next) => {
        if (draftActive === next) return;
        draftActive = next;
        for (const listener of Array.from(draftListeners)) listener();
      };
      const draft = { useActive, isActive: () => draftActive, setActive };

      /**
       * Open a draft: clear the selection so the blank-state view is on screen,
       * and let the draft composer take over its input. Nothing is written.
       */
      const startDraft = () => {
        ctx.sessions.clear();
        setActive(true);
      };

      /**
       * The registration's own inject face. Every entry is a plain callback over
       * services resolved at click time: the renderer memoizes this object for
       * the registration's lifetime, so a captured VALUE would freeze.
       */
      const browserInject = () => ({
        startDraft,
        useDraftActive: useActive,
        startInWorkspace: (workspaceId) => { ctx.uiWorkspace.startSession(workspaceId); },
        openSession: (sessionId) => {
          // Opening a chat abandons whatever draft was in progress.
          setActive(false);
          ctx.uiWorkspace.openSession(sessionId);
        },
        loadScratchRoot: async () => {
          const payload = await readScratch();
          return typeof payload.root === 'string' && payload.root !== '' ? payload.root : undefined;
        },
        adoptWorkspace: (path) => ctx.workspaces.create({ path }),
        removeWorkspace: (workspaceId) => ctx.workspaces.delete(workspaceId),
        // Removing a chat from the sidebar is the Host's `archiveSession`: the
        // session leaves every grouping surface and its log file stays on disk.
        archiveSession: (sessionId) => ctx.workspaces.archiveSession(sessionId),
        // `pickDirectory` is a Host round trip that may end in a native dialog.
        // Bounded here so a chooser that never answers cannot leave a gesture
        // pending for the rest of the session.
        pickDirectory: () => Promise.race([
          ctx.uiWorkspace.pickDirectory(),
          new Promise((_resolve, reject) => {
            window.setTimeout(() => { reject(new Error('the directory chooser did not answer')); }, PICK_TIMEOUT_MS);
          }),
        ]),
      });

      // The product row: this skin names itself rather than showing a build hash.
      ctx.effect(() => ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
        { name: 'sidebar.brand.name', priority: SHADOW_PRIORITY, locale: NS },
        BrandName,
      )), 'dsh-plugin-codex-ui: brand name');

      // The browsing region. Registering here takes the cell from the shipped
      // browser, which resumes the moment this entry is disposed or abdicates.
      ctx.effect(() => ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
        {
          name: 'sidebar.workspaces',
          priority: SHADOW_PRIORITY,
          locale: NS,
          inject: browserInject,
        },
        CodexBrowser,
      )), 'dsh-plugin-codex-ui: sidebar browser');

      // The draft composer rides the frame-wide overlay seat, because it covers
      // the CONVERSATION's blank-state composer — a surface outside this plugin's
      // own sidebar cell. `shell.overlay` is an additive list seat, so nothing
      // shipped is shadowed.
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'dsh-plugin-codex-ui/draft', order: -100, label: NS, locale: NS },
        (slotProps) => react.createElement(DraftComposer, Object.assign({}, slotProps, { ctx, draft })),
      )), 'dsh-plugin-codex-ui: draft composer');
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
