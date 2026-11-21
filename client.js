window.__ModuleLoader__.load({
  id: '@local/conversation-find',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'conversation-find';

    const dicts = {
      zh: { 'find.open': '查找会话内容', 'find.close': '关闭查找面板', 'find.placeholder': '查找会话内容', 'find.noSession': '当前没有打开的会话，打开一个会话后即可搜索', 'find.previous': '上一处（Shift+Enter）', 'find.next': '下一处（Enter）', 'find.matchesOne': '1 个匹配项', 'find.matchesMany': '{count} 个匹配项', 'find.noMatches': '无匹配项', 'find.tooMany': '超过 {count} 个匹配项', 'find.truncated': '仅显示前 {count} 条，可细化关键词', 'find.resultAria': '跳转到第 {index} 处', 'find.caseSensitive': '区分大小写', 'find.hintKeys': 'Enter 下一处 · Shift+Enter 上一处 · Esc 关闭' },
      en: { 'find.open': 'Find in conversation', 'find.close': 'Close find panel', 'find.placeholder': 'Find in conversation', 'find.noSession': 'No session is open; open one to search its conversation', 'find.previous': 'Previous match (Shift+Enter)', 'find.next': 'Next match (Enter)', 'find.matchesOne': '1 match', 'find.matchesMany': '{count} matches', 'find.noMatches': 'No matches', 'find.tooMany': '{count}+ matches', 'find.truncated': 'Showing the first {count}; refine the query', 'find.resultAria': 'Go to match {index}', 'find.caseSensitive': 'Match case', 'find.hintKeys': 'Enter next match · Shift+Enter previous · Esc closes' },
    };

    const FLOW_SELECTOR = '[data-chat-flow]';
    const SESSION_ATTR = '[data-conversation-content][data-conversation-session]';
    const MAX_RESULTS = 500;
    const CONTEXT_CHARS = 60;
    const SEARCH_DELAY_MS = 180;
    const SEARCH_MAX_WAIT_MS = 700;
    const OBSERVE_THROTTLE_MS = 350;
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'IFRAME']);

    function collectMatches(needle, caseSensitive) {
      const results = [];
      if (!needle) return results;
      const flow = document.querySelector(FLOW_SELECTOR);
      if (!flow) return results;
      const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('[data-find-overlay], [data-text-interaction-surface]')) return NodeFilter.FILTER_REJECT;
          if (parent.closest('[hidden]')) return NodeFilter.FILTER_REJECT;
          return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const haystack = caseSensitive ? needle : needle.toLowerCase();
      let current = walker.nextNode();
      while (current !== null) {
        const text = current.nodeValue;
        const lowered = caseSensitive ? text : text.toLowerCase();
        let from = 0;
        for (;;) {
          const at = lowered.indexOf(haystack, from);
          if (at === -1) break;
          results.push({ node: current, start: at, end: at + needle.length });
          if (results.length >= MAX_RESULTS) return results;
          from = at + needle.length;
        }
        current = walker.nextNode();
      }
      return results;
    }

    function textContext(match) {
      const text = match.node.nodeValue || '';
      const from = Math.max(0, match.start - CONTEXT_CHARS);
      const to = Math.min(text.length, match.end + CONTEXT_CHARS);
      return {
        before: (from > 0 ? '…' : '') + text.slice(from, match.start),
        hit: text.slice(match.start, match.end),
        after: text.slice(match.end, to) + (to < text.length ? '…' : ''),
      };
    }

    function isLive(match) {
      return Boolean(match && match.node && match.node.isConnected);
    }

    function rangeOf(match) {
      try {
        if (!isLive(match)) return null;
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        return range;
      } catch {
        return null;
      }
    }

    function scrollToMatch(match) {
      if (!isLive(match)) return;
      const parent = match.node.parentElement;
      if (!parent) return;
      parent.scrollIntoView({ block: 'center' });
    }

    const state = { open: false, focusSeq: 0 };
    const listeners = new Set();
    function publish() {
      const snapshot = { open: state.open, focusSeq: state.focusSeq };
      for (const listener of listeners) {
        try { listener(snapshot); } catch { /* ignore */ }
      }
    }
    function openPanel() {
      state.open = true;
      state.focusSeq += 1;
      publish();
    }
    function closePanel() {
      if (!state.open) return;
      state.open = false;
      publish();
    }

    let stylesHandle = null;
    function ensureStyles() {
      if (stylesHandle && stylesHandle.isConnected) return;
      const css = ''
        + '.dsh-cf-scrim { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 1000; pointer-events: none; }'
        + '.dsh-cf-panel { pointer-events: auto; position: fixed; top: 64px; right: 20px; z-index: 1001;'
        + ' width: 372px; max-width: calc(100vw - 32px); max-height: calc(100vh - 96px);'
        + ' display: flex; flex-direction: column; overflow: hidden;'
        + ' background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #fff));'
        + ' border: 1px solid var(--dsw-alias-border-l2, #c9d1da); border-radius: 12px;'
        + ' box-shadow: 0 12px 40px rgba(0, 0, 0, .22); font-size: 13px; color: var(--dsw-alias-label-primary, inherit); font-family: inherit; }'
        + '.dsh-cf-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 8px 14px; }'
        + '.dsh-cf-title { font-size: 13px; font-weight: 600; margin: 0; }'
        + '.dsh-cf-close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;'
        + ' border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--dsw-alias-label-secondary, inherit); padding: 0; }'
        + '.dsh-cf-close:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.06)); color: var(--dsw-alias-label-primary, inherit); }'
        + '.dsh-cf-searchrow { display: flex; align-items: center; gap: 6px; padding: 0 12px 8px 12px; }'
        + '.dsh-cf-inputwrap { position: relative; flex: 1; display: flex; align-items: center; min-width: 0; }'
        + '.dsh-cf-input { width: 100%; box-sizing: border-box; height: 30px; padding: 0 10px; font: inherit; color: inherit;'
        + ' background: var(--dsw-alias-bg-layer-2, #f5f7fa); border: 1px solid var(--dsw-alias-border-l1, #d9dee5); border-radius: 8px; outline: none; }'
        + '.dsh-cf-input:focus { border-color: var(--dsw-alias-brand-primary, #2e6fbf); background: var(--dsw-alias-bg-overlay, #fff); }'
        + '.dsh-cf-input::placeholder { color: var(--dsw-alias-label-secondary, #8a94a0); }'
        + '.dsh-cf-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 30px; flex: none;'
        + ' border: 1px solid var(--dsw-alias-border-l1, #d9dee5); border-radius: 8px; cursor: pointer;'
        + ' background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, inherit); padding: 0; font: inherit; }'
        + '.dsh-cf-iconbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, #f5f7fa); color: var(--dsw-alias-label-primary, inherit); }'
        + '.dsh-cf-iconbtn:disabled { opacity: .45; cursor: default; }'
        + '.dsh-cf-iconbtn[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary, #2e6fbf); color: var(--dsw-alias-brand-primary, #2e6fbf); }'
        + '.dsh-cf-hint { padding: 0 14px 8px; font-size: 12px; color: var(--dsw-alias-label-secondary, #8a94a0); min-height: 20px; }'
        + '.dsh-cf-results { flex: 1; overflow-y: auto; border-top: 1px solid var(--dsw-alias-border-l1, #d9dee5); padding: 6px; min-height: 60px; }'
        + '.dsh-cf-empty { padding: 18px 10px; text-align: center; color: var(--dsw-alias-label-secondary, #8a94a0); }'
        + '.dsh-cf-truncated { padding: 8px 10px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-secondary, #8a94a0); }'
        + '.dsh-cf-item { display: block; width: 100%; text-align: left; cursor: pointer; border: none; background: transparent;'
        + ' color: inherit; font: inherit; line-height: 1.45; padding: 6px 8px; margin: 0 0 2px; border-radius: 8px;'
        + ' overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }'
        + '.dsh-cf-item:hover { background: var(--dsw-alias-bg-layer-2, #f5f7fa); }'
        + '.dsh-cf-item[data-active="true"] { background: var(--dsw-alias-bg-layer-2, #e8eef5); }'
        + '.dsh-cf-item-mark { background: rgba(232, 181, 74, .42); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #e8b54a) 42%, transparent); border-radius: 2px; padding: 0 1px; }'
        + '.dsh-cf-item-active-mark { background: rgba(232, 181, 74, .85); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #e8b54a) 85%, transparent); border-radius: 2px; padding: 0 1px; }'
        + '::highlight(dsh-find-all) { background-color: rgba(232, 181, 74, .32); background-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #e8b54a) 32%, transparent); color: inherit; }'
        + '::highlight(dsh-find-active) { background-color: rgba(232, 181, 74, .88); background-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #e8b54a) 88%, transparent); color: var(--dsw-alias-label-primary, inherit); }';
      const host = document.head || document.documentElement;
      const style = document.createElement('style');
      style.setAttribute('data-dsh-find-styles', '');
      style.textContent = css;
      host.appendChild(style);
      stylesHandle = style;
    }

    function highlightsSupported() {
      return typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined' && typeof Highlight !== 'undefined';
    }

    function clearHighlights() {
      try {
        if (typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined') {
          CSS.highlights.delete('dsh-find-all');
          CSS.highlights.delete('dsh-find-active');
        }
      } catch { /* ignore */ }
    }

    function FindPanel({ open, focusSeq, onClose, t }) {
      const [query, setQuery] = React.useState('');
      const [caseSensitive, setCaseSensitive] = React.useState(false);
      const [matches, setMatches] = React.useState([]);
      const [activeIndex, setActiveIndex] = React.useState(-1);
      const [flowRevision, setFlowRevision] = React.useState(0);
      const inputRef = React.useRef(null);
      const resultsRef = React.useRef(null);
      const searchTokenRef = React.useRef(0);
      const scheduledAtRef = React.useRef(0);
      const forceSearchRef = React.useRef(false);
      const matchesRef = React.useRef([]);
      const rangesRef = React.useRef([]);
      const activeIndexRef = React.useRef(-1);
      const scrollRequestRef = React.useRef(false);
      const lastQueryRef = React.useRef('');
      const lastCaseRef = React.useRef(false);
      const previousFocusRef = React.useRef(null);
      const supportsHighlight = highlightsSupported();

      React.useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

      React.useEffect(() => {
        if (open) {
          if (previousFocusRef.current === null) {
            previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }
        } else {
          const previous = previousFocusRef.current;
          previousFocusRef.current = null;
          if (previous && previous.isConnected) {
            try { previous.focus({ preventScroll: true }); } catch { previous.focus(); }
          }
        }
      }, [open]);

      React.useEffect(() => {
        if (!open) return;
        const input = inputRef.current;
        if (input) {
          input.focus();
          if (input.value) input.select();
        }
      }, [open, focusSeq]);

      React.useEffect(() => {
        if (!open) return undefined;
        let timer = null;
        const observer = new MutationObserver(() => {
          if (timer !== null) return;
          timer = setTimeout(() => { timer = null; setFlowRevision(v => v + 1); }, OBSERVE_THROTTLE_MS);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        return () => {
          observer.disconnect();
          if (timer !== null) { clearTimeout(timer); timer = null; }
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) {
          scheduledAtRef.current = 0;
          return undefined;
        }
        const token = ++searchTokenRef.current;
        const run = () => {
          scheduledAtRef.current = 0;
          if (token !== searchTokenRef.current) return;
          const needle = query.trim();
          const isQueryChange = lastQueryRef.current !== needle || lastCaseRef.current !== caseSensitive;
          lastQueryRef.current = needle;
          lastCaseRef.current = caseSensitive;
          const found = needle === '' ? [] : collectMatches(needle, caseSensitive);
          if (token !== searchTokenRef.current) return;
          matchesRef.current = found;
          rangesRef.current = supportsHighlight ? found.map(rangeOf).filter(Boolean) : [];
          if (supportsHighlight) {
            try {
              CSS.highlights.set('dsh-find-all', new Highlight(...rangesRef.current));
              CSS.highlights.set('dsh-find-active', new Highlight());
            } catch { /* ignore */ }
          }
          setMatches(found);
          if (isQueryChange) {
            setActiveIndex(found.length > 0 ? 0 : -1);
            scrollRequestRef.current = found.length > 0;
          } else {
            setActiveIndex((prev) => {
              if (found.length === 0) return -1;
              return Math.min(prev < 0 ? 0 : prev, found.length - 1);
            });
          }
        };
        if (forceSearchRef.current) {
          forceSearchRef.current = false;
          run();
          return undefined;
        }
        if (scheduledAtRef.current === 0) scheduledAtRef.current = Date.now();
        const elapsed = Date.now() - scheduledAtRef.current;
        const timer = setTimeout(run, Math.max(0, Math.min(SEARCH_DELAY_MS, SEARCH_MAX_WAIT_MS - elapsed)));
        return () => { clearTimeout(timer); };
      }, [open, query, caseSensitive, flowRevision, supportsHighlight]);

      React.useEffect(() => {
        if (!supportsHighlight || !open) return;
        try {
          const range = activeIndex >= 0 ? rangesRef.current[activeIndex] : undefined;
          CSS.highlights.set('dsh-find-active', range ? new Highlight(range) : new Highlight());
        } catch { /* ignore */ }
      }, [activeIndex, matches, supportsHighlight, open]);

      React.useEffect(() => {
        if (!open || activeIndex < 0) return;
        if (scrollRequestRef.current) {
          scrollRequestRef.current = false;
          scrollToMatch(matchesRef.current[activeIndex]);
        }
      }, [activeIndex, matches, open]);

      React.useEffect(() => {
        if (activeIndex < 0 || !resultsRef.current) return;
        const item = resultsRef.current.querySelector('.dsh-cf-item[data-active="true"]');
        if (item) item.scrollIntoView({ block: 'nearest' });
      }, [activeIndex, matches]);

      React.useEffect(() => {
        if (open) return undefined;
        clearHighlights();
        rangesRef.current = [];
        return undefined;
      }, [open]);
      React.useEffect(() => () => { clearHighlights(); }, []);

      const forceSearch = React.useCallback(() => {
        forceSearchRef.current = true;
        setFlowRevision(v => v + 1);
      }, []);

      const step = React.useCallback((delta) => {
        const list = matchesRef.current;
        const total = list.length;
        if (total === 0) return;
        let index = activeIndexRef.current;
        for (let visited = 0; visited < total; visited++) {
          index = (index + delta + total) % total;
          if (isLive(list[index])) {
            setActiveIndex(index);
            scrollToMatch(list[index]);
            return;
          }
        }
        forceSearch();
      }, [forceSearch]);

      const pick = React.useCallback((index) => {
        const target = matchesRef.current[index];
        if (isLive(target)) {
          setActiveIndex(index);
          scrollToMatch(target);
        } else {
          forceSearch();
        }
      }, [forceSearch]);

      const onKeyDown = React.useCallback((event) => {
        if (event.nativeEvent && event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('button')) return;
          event.preventDefault();
          event.stopPropagation();
          step(event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }, [step, onClose]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          if (event.isComposing || event.keyCode === 229) return;
          onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); };
      }, [open, onClose]);

      if (!open) return null;
      const count = matches.length;
      const needle = query.trim();
      const hasSession = Boolean(document.querySelector(SESSION_ATTR));
      const totalText = needle === ''
        ? ''
        : count === 0 ? t('find.noMatches')
          : count >= MAX_RESULTS ? t('find.tooMany', { count: MAX_RESULTS })
            : count === 1 ? t('find.matchesOne') : t('find.matchesMany', { count });
      const hintText = needle === ''
        ? t('find.hintKeys')
        : !hasSession ? t('find.noSession')
          : activeIndex >= 0 ? (activeIndex + 1) + ' / ' + totalText : totalText;

      return h('div', { className: 'dsh-cf-scrim', 'data-find-overlay': '' },
        h('div', {
          className: 'dsh-cf-panel',
          role: 'dialog',
          'aria-label': t('find.open'),
          onKeyDown,
        }, [
          h('div', { className: 'dsh-cf-head', key: 'head' }, [
            h('h2', { className: 'dsh-cf-title', key: 'title' }, t('find.open')),
            h('button', {
              className: 'dsh-cf-close', key: 'close', type: 'button',
              'aria-label': t('find.close'), title: t('find.close'), onClick: onClose,
            }, h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true },
              h('path', { d: 'M2 2l10 10M12 2L2 12', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))),
          ]),
          h('div', { className: 'dsh-cf-searchrow', key: 'row' }, [
            h('input', {
              className: 'dsh-cf-input', key: 'input',
              ref: inputRef,
              type: 'text',
              role: 'searchbox',
              'aria-label': t('find.open'),
              placeholder: t('find.placeholder'),
              value: query,
              onChange: (event) => { setQuery(event.target.value); },
              onKeyDown,
              spellCheck: false,
              autoComplete: 'off',
            }),
            h('button', {
              className: 'dsh-cf-iconbtn', key: 'prev', type: 'button',
              'aria-label': t('find.previous'), title: t('find.previous'),
              disabled: count === 0,
              onClick: () => { step(-1); },
            }, h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
              h('path', { d: 'M7.5 2L3.5 6l4 4', stroke: 'currentColor', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }))),
            h('button', {
              className: 'dsh-cf-iconbtn', key: 'next', type: 'button',
              'aria-label': t('find.next'), title: t('find.next'),
              disabled: count === 0,
              onClick: () => { step(1); },
            }, h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
              h('path', { d: 'M4.5 2l4 4-4 4', stroke: 'currentColor', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }))),
            h('button', {
              className: 'dsh-cf-iconbtn', key: 'case', type: 'button',
              'aria-label': t('find.caseSensitive'), title: t('find.caseSensitive'),
              'aria-pressed': caseSensitive ? 'true' : 'false',
              onClick: () => { setCaseSensitive(v => !v); },
            }, 'Aa'),
          ]),
          h('div', { className: 'dsh-cf-hint', key: 'hint', 'aria-live': 'polite' }, hintText),
          h('div', {
            className: 'dsh-cf-results', key: 'results', ref: resultsRef,
            role: 'listbox', 'aria-label': t('find.open'),
          }, [
            count === 0
              ? h('div', { className: 'dsh-cf-empty', key: 'empty' }, needle === '' ? t('find.placeholder') : t('find.noMatches'))
              : matches.map((match, index) => {
                const context = textContext(match);
                const active = index === activeIndex;
                return h('button', {
                  key: index,
                  type: 'button',
                  className: 'dsh-cf-item',
                  role: 'option',
                  'data-active': active ? 'true' : 'false',
                  'aria-selected': active ? 'true' : 'false',
                  'aria-label': t('find.resultAria', { index: index + 1 }),
                  onClick: () => { pick(index); },
                }, [
                  h('span', { key: 'b' }, context.before),
                  h('span', { key: 'hit', className: active ? 'dsh-cf-item-active-mark' : 'dsh-cf-item-mark' }, context.hit),
                  h('span', { key: 'a' }, context.after),
                ]);
              }),
            count >= MAX_RESULTS
              ? h('div', { className: 'dsh-cf-truncated', key: 'truncated' }, t('find.truncated', { count: MAX_RESULTS }))
              : null,
          ]),
        ]));
    }

    // Minimal working plugin: array inject export (like the built-in client
    // plugins) and a synchronous apply that reads services off ctx directly.
    const inject = ['slots', 'locale', 'shortcuts'];

    function apply(ctx) {
      const locale = ctx.locale;
      const slots = ctx.slots;
      const shortcuts = ctx.shortcuts;

      if (locale && typeof locale.register === 'function') {
        ctx.effect(() => locale.register(NS, dicts), 'conversation-find: dictionaries');
      }
      const t = locale && typeof locale.bind === 'function'
        ? locale.bind(NS)
        : (key) => String(key);

      ctx.effect(() => {
        ensureStyles();
        return () => {
          clearHighlights();
          if (stylesHandle) {
            stylesHandle.remove();
            stylesHandle = null;
          }
        };
      }, 'conversation-find: styles');

      ctx.effect(() => slots.inject('shell.overlay', () => slots.register({
        name: 'shell.overlay', id: 'conversation-find', locale: NS,
        label: () => t('find.open'),
        inject: () => ({ t: locale && locale.bind ? locale.bind(NS) : t }),
      }, (props) => {
        const translate = props.t || t;
        const [snapshot, setSnapshot] = React.useState(() => ({ ...state }));
        React.useEffect(() => {
          listeners.add(setSnapshot);
          return () => { listeners.delete(setSnapshot); };
        }, []);
        return h(FindPanel, {
          open: snapshot.open,
          focusSeq: snapshot.focusSeq,
          onClose: closePanel,
          t: translate,
        });
      })), 'conversation-find: overlay');

      if (shortcuts && typeof shortcuts.register === 'function') {
        ctx.effect(() => shortcuts.register({
          id: 'conversation.find',
          label: () => t('find.open'),
          aliases: ['find in conversation', 'search conversation', 'find'],
          defaults: {
            'desktop:macos': { code: 'KeyF', modifiers: ['primary'] },
            'desktop:windows': { code: 'KeyF', modifiers: ['primary'] },
            'desktop:linux': { code: 'KeyF', modifiers: ['primary'] },
            'web:macos': { code: 'KeyF', modifiers: ['primary', 'alt'] },
            'web:windows': { code: 'KeyF', modifiers: ['primary', 'alt'] },
            // Linux Web accepts only Mod+Slash and Mod+Shift+Comma/Period;
            // an unbound default keeps registration valid (rebindable in Settings).
          },
          regions: ['page', 'editable'],
          modals: ['sidebar'],
          // Always open the panel; without a session the panel explains the
          // situation itself, so the gesture never feels dead.
          resolve: () => ({ status: 'handled', run: openPanel }),
        }), 'conversation-find: command');
      }
    }

    return { inject, apply };
  },
});
