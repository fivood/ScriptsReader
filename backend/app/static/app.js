const state = {
  library: [],
  selectedEpisodeId: null,
  selectedSpeakers: new Set(),
  currentEpisode: null,
  currentSearch: '',
  focusedLineIndex: null,
  annotations: { highlights: {}, notes: {} },
  catalogResults: [],
  ollamaOnline: false,
  ollamaModel: '',
  ollamaSource: 'none',
  ollamaEndpoint: '',
  lineTranslations: {},
  translateAllActive: false,
  readingProgress: {},
  progressSaveTimer: null,
  collections: [],
  selectedCollectionId: null,
  collectionFilter: '',
};

const LOCAL_OLLAMA_BASE = 'http://127.0.0.1:11434';

const elements = {
  libraryTree: document.getElementById('library-tree'),
  librarySearch: document.getElementById('library-search'),
  libraryCount: document.getElementById('library-count'),
  appVersion: document.getElementById('app-version'),
  rebuildLibrary: document.getElementById('rebuild-library'),
  manualImport: document.getElementById('manual-import'),
  downloadStatus: document.getElementById('download-status'),
  episodeTitle: document.getElementById('episode-title'),
  episodeMeta: document.getElementById('episode-meta'),
  lineCount: document.getElementById('line-count'),
  dialogueList: document.getElementById('dialogue-list'),
  speakerFilters: document.getElementById('speaker-filters'),
  speakerCount: document.getElementById('speaker-count'),
  trackSpeakerBtn: document.getElementById('track-speaker-btn'),
  bulkSpeakerBtn: document.getElementById('bulk-speaker-btn'),
  speakerTrackResults: document.getElementById('speaker-track-results'),
  translationPanel: document.getElementById('translation-panel'),
  episodeSearch: document.getElementById('episode-search'),
  clearFilters: document.getElementById('clear-filters'),
  globalSearch: document.getElementById('global-search'),
  runGlobalSearch: document.getElementById('run-global-search'),
  searchResults: document.getElementById('search-results'),
  refreshCatalog: document.getElementById('refresh-catalog'),
  catalogStatus: document.getElementById('catalog-status'),
  catalogSearch: document.getElementById('catalog-search'),
  runCatalogSearch: document.getElementById('run-catalog-search'),
  catalogResults: document.getElementById('catalog-results'),
  fdIndexUrl: document.getElementById('fd-index-url'),
  fdShowName: document.getElementById('fd-show-name'),
  fdDownload: document.getElementById('fd-download'),
  advSpringfieldSlug: document.getElementById('adv-springfield-slug'),
  advSpringfieldDownload: document.getElementById('adv-springfield-download'),
  ollamaStatus: document.getElementById('ollama-status'),
  ollamaModelLabel: document.getElementById('ollama-model-label'),
  ollamaModel: document.getElementById('ollama-model'),
  ollamaRefreshModels: document.getElementById('ollama-refresh-models'),
  aiPanel: document.getElementById('ai-panel'),
  aiProfileBtn: document.getElementById('ai-profile-btn'),
  // ── Settings modal ──
  openSettings: document.getElementById('open-settings'),
  themeToggle: document.getElementById('theme-toggle'),
  settingsOverlay: document.getElementById('settings-overlay'),
  closeSettings: document.getElementById('close-settings'),
  sOllamaUrl: document.getElementById('s-ollama-url'),
  sOllamaModel: document.getElementById('s-ollama-model'),
  sOllamaRefresh: document.getElementById('s-ollama-refresh'),
  sOllamaStatus: document.getElementById('s-ollama-status'),
  sTransProvider: document.getElementById('s-trans-provider'),
  sBaiduAppid: document.getElementById('s-baidu-appid'),
  sBaiduSecret: document.getElementById('s-baidu-secret'),
  sBaiduBadge: document.getElementById('s-baidu-badge'),
  sYoudaoAppkey: document.getElementById('s-youdao-appkey'),
  sYoudaoSecret: document.getElementById('s-youdao-secret'),
  sYoudaoBadge: document.getElementById('s-youdao-badge'),
  sDeeplKey: document.getElementById('s-deepl-key'),
  sDeeplBadge: document.getElementById('s-deepl-badge'),
  sSave: document.getElementById('s-save'),
  sSaveMsg: document.getElementById('s-save-msg'),
  translateAllBtn: document.getElementById('translate-all-btn'),
  editEpisodeMetaBtn: document.getElementById('edit-episode-meta'),
  collectionCount: document.getElementById('collection-count'),
  collectionSelect: document.getElementById('collection-select'),
  collectionDelete: document.getElementById('collection-delete'),
  collectionExportMd: document.getElementById('collection-export-md'),
  collectionExportJson: document.getElementById('collection-export-json'),
  collectionName: document.getElementById('collection-name'),
  collectionCreate: document.getElementById('collection-create'),
  collectionFilter: document.getElementById('collection-filter'),
  collectionItems: document.getElementById('collection-items'),
};

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function requestLocalOllama(path, options = {}) {
  const response = await fetch(`${LOCAL_OLLAMA_BASE}${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Local Ollama request failed: ${response.status}`);
  }
  return response.json();
}

// ── HUD Modal System（替换系统 prompt / confirm）──────────────────────────

let _hudModalResolve = null;

function _hudModalClose() {
  if (_hudModalResolve) { _hudModalResolve(null); _hudModalResolve = null; }
  document.getElementById('hud-modal-overlay').hidden = true;
  document.getElementById('hud-modal-body').innerHTML = '';
  document.getElementById('hud-modal-confirm').onclick = null;
  document.getElementById('hud-modal-confirm').style.display = '';
}

function _hudModalOpen({ title, bodyHtml, confirmText = '确认', showConfirm = true, showCancel = true, cancelText = '取消' }) {
  document.getElementById('hud-modal-title').textContent = title;
  document.getElementById('hud-modal-body').innerHTML = bodyHtml;
  const confirmBtn = document.getElementById('hud-modal-confirm');
  const cancelBtn = document.getElementById('hud-modal-cancel');
  confirmBtn.textContent = confirmText;
  confirmBtn.style.display = showConfirm ? '' : 'none';
  cancelBtn.textContent = cancelText;
  cancelBtn.style.display = showCancel ? '' : 'none';
  document.getElementById('hud-modal-overlay').hidden = false;
  const firstInput = document.getElementById('hud-modal-body').querySelector('input, textarea, select');
  if (firstInput) setTimeout(() => firstInput.focus(), 30);
}

/**
 * 单行/多行文本输入弹窗，返回 string 或 null（取消）。
 */
function hudPrompt({ title, label, defaultValue = '', placeholder = '', textarea = false }) {
  return new Promise(resolve => {
    _hudModalResolve = () => resolve(null);
    const tag = textarea ? 'textarea' : 'input';
    const extra = textarea ? ' class="hud-modal-textarea" rows="3"' : ` type="text" value="${escapeAttr(defaultValue)}"`;
    const inner = textarea ? escapeHtml(defaultValue) : '';
    const ph = placeholder ? ` placeholder="${escapeAttr(placeholder)}"` : '';
    _hudModalOpen({
      title,
      bodyHtml: `<label class="settings-label">${escapeHtml(label)}</label><${tag} id="hud-inp"${extra}${ph}>${inner}</${tag}>`,
    });
    document.getElementById('hud-modal-confirm').onclick = () => {
      const val = document.getElementById('hud-inp')?.value ?? '';
      _hudModalResolve = null;
      _hudModalClose();
      resolve(val);
    };
    if (!textarea) {
      setTimeout(() => {
        const inp = document.getElementById('hud-inp');
        if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('hud-modal-confirm').click(); });
      }, 40);
    }
  });
}

/**
 * 确认/取消弹窗，返回 true/false。
 */
function hudConfirm({ title, message, confirmText = '确认' }) {
  return new Promise(resolve => {
    _hudModalResolve = () => resolve(false);
    _hudModalOpen({
      title,
      bodyHtml: `<p class="hud-modal-message">${escapeHtml(message)}</p>`,
      confirmText,
    });
    document.getElementById('hud-modal-confirm').onclick = () => {
      _hudModalResolve = null;
      _hudModalClose();
      resolve(true);
    };
  });
}

/**
 * 收藏台词专用表单（标签 + 备注），返回 { tags, note } 或 null。
 */
function hudCollectForm() {
  return new Promise(resolve => {
    _hudModalResolve = () => resolve(null);
    _hudModalOpen({
      title: '收藏台词',
      bodyHtml: `
        <label class="settings-label">标签（逗号分隔，可留空）</label>
        <input id="hud-tags" type="text" placeholder="励志, 幽默, Reese…">
        <label class="settings-label" style="margin-top:8px">备注（可留空）</label>
        <textarea id="hud-note" class="hud-modal-textarea" rows="2" placeholder="分析或摘录原因…"></textarea>
      `,
    });
    document.getElementById('hud-modal-confirm').onclick = () => {
      const tags = document.getElementById('hud-tags')?.value ?? '';
      const note = document.getElementById('hud-note')?.value ?? '';
      _hudModalResolve = null;
      _hudModalClose();
      resolve({ tags, note });
    };
  });
}

/**
 * 高亮颜色选择弹窗，返回颜色字符串（空串=清除）或 null（取消）。
 */
function hudColorPicker({ currentColor = '' } = {}) {
  return new Promise(resolve => {
    _hudModalResolve = () => resolve(null);
    const colors = [
      { value: 'yellow', label: 'Yellow', bg: '#b8900a' },
      { value: 'red',    label: 'Red',    bg: '#a03030' },
      { value: 'green',  label: 'Green',  bg: '#1a6e50' },
      { value: 'blue',   label: 'Blue',   bg: '#1870a0' },
      { value: 'purple', label: 'Purple', bg: '#6030b0' },
    ];
    const btns = colors.map(c =>
      `<button class="hud-color-btn${currentColor === c.value ? ' active' : ''}" data-color="${c.value}" style="background:${c.bg};">${c.label}</button>`
    ).join('');
    _hudModalOpen({
      title: '高亮颜色',
      bodyHtml: `<div class="hud-color-grid">${btns}</div><button class="hud-color-clear-btn" data-color="">✕  清除高亮</button>`,
      showConfirm: false,
      showCancel: true,
    });
    setTimeout(() => {
      document.getElementById('hud-modal-body').querySelectorAll('[data-color]').forEach(btn => {
        btn.addEventListener('click', () => {
          _hudModalResolve = null;
          document.getElementById('hud-modal-overlay').hidden = true;
          document.getElementById('hud-modal-body').innerHTML = '';
          resolve(btn.dataset.color);
        });
      });
    }, 0);
  });
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function speakerColor(name) {
  const palette = ['speaker-a', 'speaker-b', 'speaker-c', 'speaker-d', 'speaker-e', 'speaker-f'];
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  return palette[hash % palette.length];
}

async function loadAppVersion() {
  try {
    const result = await request('/api/version');
    if (elements.appVersion && result.version) {
      elements.appVersion.textContent = `v${result.version}`;
    }
  } catch (_) {
    if (elements.appVersion) {
      elements.appVersion.textContent = 'v?.?.?';
    }
  }
}

function showExists(name) {
  const lowerName = name.toLowerCase().trim();
  return state.library.some(show => show.name.toLowerCase() === lowerName);
}

function renderLibrary() {
  const keyword = elements.librarySearch.value.trim().toLowerCase();
  const filteredShows = state.library
    .map(show => ({
      ...show,
      seasons: show.seasons
        .map(season => ({
          ...season,
          episodes: season.episodes.filter(episode => {
            const haystack = `${show.name} ${episode.episode_code || ''} ${episode.title}`.toLowerCase();
            return !keyword || haystack.includes(keyword);
          }),
        }))
        .filter(season => season.episodes.length > 0),
    }))
    .filter(show => show.seasons.length > 0);

  const totalEpisodes = filteredShows.reduce((sum, show) => sum + show.seasons.reduce((acc, season) => acc + season.episodes.length, 0), 0);
  elements.libraryCount.textContent = `${filteredShows.length} 部剧 / ${totalEpisodes} 集`;

  if (!filteredShows.length) {
    elements.libraryTree.innerHTML = '<div class="empty-state">没有匹配结果</div>';
    return;
  }

  elements.libraryTree.innerHTML = filteredShows.map(show => `
    <details class="tree-show">
      <summary>${show.name}</summary>
      ${show.seasons.map(season => `
        <details class="tree-season">
          <summary>Season ${String(season.season_number).padStart(2, '0')}</summary>
          <div class="tree-episodes">
            ${season.episodes.map(episode => `
              <button class="episode-link ${state.selectedEpisodeId === episode.id ? 'active' : ''}" data-episode-id="${episode.id}">
                <span class="reading-dot ${episode.reading_status || 'unread'}" title="${episode.reading_status || 'unread'}"></span>
                <span>${episode.episode_code || 'EP'}</span>
                <strong>${episode.title}</strong>
                <small>${episode.line_count} 行</small>
              </button>
            `).join('')}
          </div>
        </details>
      `).join('')}
    </details>
  `).join('');

  document.querySelectorAll('[data-episode-id]').forEach(button => {
    button.addEventListener('click', () => selectEpisode(Number(button.dataset.episodeId)));
  });
}

function filteredLines() {
  if (!state.currentEpisode) return [];
  const keyword = state.currentSearch.trim().toLowerCase();
  return state.currentEpisode.lines.filter(line => {
    const matchSpeaker = state.selectedSpeakers.size === 0 || line.is_direction || (line.speaker && state.selectedSpeakers.has(line.speaker));
    const haystack = `${line.speaker || ''} ${line.text}`.toLowerCase();
    const matchKeyword = !keyword || haystack.includes(keyword);
    return matchSpeaker && matchKeyword;
  });
}

function renderSpeakers() {
  const speakers = state.currentEpisode?.speakers || [];
  elements.speakerCount.textContent = `${speakers.length} 位角色`;

  if (!speakers.length) {
    elements.speakerFilters.innerHTML = '<div class="empty-state">暂无角色</div>';
    return;
  }

  elements.speakerFilters.innerHTML = speakers.map(speaker => `
    <button class="speaker-chip ${speakerColor(speaker)} ${state.selectedSpeakers.has(speaker) ? 'selected' : ''}" data-speaker="${speaker}">
      ${speaker}
    </button>
  `).join('');

  document.querySelectorAll('[data-speaker]').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.speaker;
      if (state.selectedSpeakers.has(name)) {
        state.selectedSpeakers.delete(name);
      } else {
        state.selectedSpeakers.add(name);
      }
      renderSpeakers();
      renderDialogue();
    });
  });
  // Enable profile button when exactly 1 speaker selected
  if (elements.aiProfileBtn) {
    elements.aiProfileBtn.disabled = state.selectedSpeakers.size !== 1;
  }
  if (elements.trackSpeakerBtn) {
    elements.trackSpeakerBtn.disabled = state.selectedSpeakers.size !== 1;
  }
  if (elements.bulkSpeakerBtn) {
    elements.bulkSpeakerBtn.disabled = !state.currentEpisode;
  }
}

async function runSpeakerTimeline() {
  if (state.selectedSpeakers.size !== 1) {
    elements.speakerTrackResults.className = 'search-results empty-state';
    elements.speakerTrackResults.textContent = '请先选择 1 个角色。';
    return;
  }
  const speaker = [...state.selectedSpeakers][0];
  const result = await request(`/api/search/speaker/${encodeURIComponent(speaker)}?limit=500`);
  if (!result.items.length) {
    elements.speakerTrackResults.className = 'search-results empty-state';
    elements.speakerTrackResults.textContent = `未找到 ${speaker} 的跨集台词。`;
    return;
  }

  elements.speakerTrackResults.className = 'search-results';
  elements.speakerTrackResults.innerHTML = result.items.map(item => `
    <button class="search-hit" data-track-episode="${item.episode_id}" data-track-line="${item.line_index}">
      <div class="search-hit-meta">${escapeHtml(item.show_name)} · S${String(item.season_number).padStart(2, '0')} · ${escapeHtml(item.episode_code || item.episode_title)} · L${item.line_index}</div>
      <div class="search-hit-line"><strong>${escapeHtml(item.speaker || 'DIRECTION')}:</strong> ${escapeHtml(item.text)}</div>
    </button>
  `).join('');

  document.querySelectorAll('[data-track-episode]').forEach(button => {
    button.addEventListener('click', async () => {
      state.focusedLineIndex = Number(button.dataset.trackLine);
      await selectEpisode(Number(button.dataset.trackEpisode));
    });
  });
}

function renderDialogue() {
  const lines = filteredLines();
  elements.lineCount.textContent = `${lines.length} 行`;

  if (!lines.length) {
    elements.dialogueList.className = 'dialogue-list empty-state';
    elements.dialogueList.textContent = '当前过滤条件下没有对白。';
    return;
  }

  elements.dialogueList.className = 'dialogue-list';
  elements.dialogueList.innerHTML = lines.map(line => {
    const lineKey = String(line.line_index);
    const highlightColor = state.annotations.highlights[lineKey] || '';
    const noteText = state.annotations.notes[lineKey] || '';
    const inlineTranslation = state.lineTranslations[lineKey] || '';
    if (line.is_direction) {
      return `
        <article class="direction-card ${highlightColor ? `hl-${highlightColor}` : ''}">
          <div class="direction-badge">SCENE / ACTION</div>
          <p>${line.text}</p>
          ${noteText ? `<p class="note-preview">NOTE: ${escapeHtml(noteText)}</p>` : ''}
        </article>
      `;
    }

    const speaker = line.speaker || 'NARRATION';
    const focused = state.focusedLineIndex === line.line_index ? ' focused-line' : '';
    const isSubtitle = line.speaker == null && line.translation;
    return `
      <article class="dialogue-line${focused} ${highlightColor ? `hl-${highlightColor}` : ''}${isSubtitle ? ' subtitle-line' : ''}" data-line-index="${line.line_index}">
        <div class="speaker-tag ${speakerColor(speaker)}">${speaker}${isSubtitle ? '<span class="subtitle-badge">CC</span>' : ''}</div>
        <div class="line-body">
          <p>${escapeHtml(line.text)}</p>
          ${inlineTranslation ? `<div class="inline-translation">${escapeHtml(inlineTranslation)}</div>` : ''}
          <div class="line-actions">
            <button class="tiny-btn ai-btn" data-analyze-line="${line.line_index}" data-tip="台词分析" aria-label="台词分析">⟡</button>
            <button class="tiny-btn ai-btn" data-explain-line="${line.line_index}" data-tip="文化注释" aria-label="文化注释">⊙</button>
            <button class="tiny-btn ai-btn" data-rewrite-line="${line.line_index}" data-tip="改写台词" aria-label="改写台词">↻</button>
            <button class="tiny-btn ai-btn" data-sentiment-line="${line.line_index}" data-tip="情感标注" aria-label="情感标注">♡</button>
            <button class="tiny-btn" data-collect-line="${line.line_index}" data-tip="收藏台词" aria-label="收藏台词">★</button>
            <button class="tiny-btn" data-highlight-line="${line.line_index}" data-tip="高亮标记" aria-label="高亮标记">◈</button>
            <button class="tiny-btn" data-note-line="${line.line_index}" data-tip="添加笔记" aria-label="添加笔记">✎</button>
          </div>
        </div>
        ${noteText ? `<p class="note-preview">NOTE: ${escapeHtml(noteText)}</p>` : ''}
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-highlight-line]').forEach(button => {
    button.addEventListener('click', () => editHighlight(Number(button.dataset.highlightLine)));
  });
  document.querySelectorAll('[data-note-line]').forEach(button => {
    button.addEventListener('click', () => editNote(Number(button.dataset.noteLine)));
  });
  document.querySelectorAll('[data-collect-line]').forEach(button => {
    button.addEventListener('click', () => collectLine(Number(button.dataset.collectLine)));
  });
  document.querySelectorAll('[data-analyze-line]').forEach(button => {
    button.addEventListener('click', () => aiLineTask('analyze', Number(button.dataset.analyzeLine)));
  });
  document.querySelectorAll('[data-explain-line]').forEach(button => {
    button.addEventListener('click', () => aiLineTask('explain', Number(button.dataset.explainLine)));
  });
  document.querySelectorAll('[data-rewrite-line]').forEach(button => {
    button.addEventListener('click', () => aiLineTask('rewrite', Number(button.dataset.rewriteLine)));
  });
  document.querySelectorAll('[data-sentiment-line]').forEach(button => {
    button.addEventListener('click', () => aiLineTask('sentiment', Number(button.dataset.sentimentLine)));
  });
  document.querySelectorAll('[data-line-index]').forEach(card => {
    card.addEventListener('click', () => {
      const lineIndex = Number(card.dataset.lineIndex);
      state.focusedLineIndex = lineIndex;
      saveReadingProgress(lineIndex);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function saveReadingProgress(lineIndex, force = false) {
  if (!state.currentEpisode || !lineIndex) return;
  const episodeId = state.currentEpisode.id;
  if (!force && state.progressSaveTimer) {
    window.clearTimeout(state.progressSaveTimer);
  }
  const runSave = async () => {
    try {
      const progress = await request('/api/library/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: episodeId, last_line: Number(lineIndex) }),
      });
      state.readingProgress[episodeId] = progress;
      const show = state.library.find(s => s.seasons.some(se => se.episodes.some(ep => ep.id === episodeId)));
      if (show) {
        for (const season of show.seasons) {
          const ep = season.episodes.find(item => item.id === episodeId);
          if (ep) {
            ep.last_line = progress.last_line;
            ep.reading_status = progress.status;
            break;
          }
        }
      }
      renderLibrary();
    } catch {
      // Ignore transient save failures.
    }
  };

  if (force) {
    await runSave();
    return;
  }
  state.progressSaveTimer = window.setTimeout(runSave, 1200);
}

function topVisibleLineIndex() {
  const cards = [...elements.dialogueList.querySelectorAll('[data-line-index]')];
  if (!cards.length) return null;
  const containerTop = elements.dialogueList.getBoundingClientRect().top;
  const firstVisible = cards.find(card => card.getBoundingClientRect().bottom > containerTop + 8);
  if (!firstVisible) return null;
  return Number(firstVisible.dataset.lineIndex);
}

function selectedCollection() {
  return state.collections.find(item => item.id === state.selectedCollectionId) || null;
}

function renderCollections() {
  const all = state.collections;
  const selected = selectedCollection();
  const itemCount = selected ? selected.items.length : 0;
  elements.collectionCount.textContent = `${itemCount} 条`;

  elements.collectionSelect.innerHTML = all.length
    ? all.map(item => `<option value="${item.id}" ${item.id === state.selectedCollectionId ? 'selected' : ''}>${escapeHtml(item.name)} (${item.item_count})</option>`).join('')
    : '<option value="">选择收藏夹</option>';

  if (!selected) {
    elements.collectionItems.className = 'collection-items empty-state';
    elements.collectionItems.textContent = '暂无收藏内容';
    elements.collectionDelete.disabled = true;
    elements.collectionExportMd.disabled = true;
    elements.collectionExportJson.disabled = true;
    return;
  }

  elements.collectionDelete.disabled = false;
  elements.collectionExportMd.disabled = false;
  elements.collectionExportJson.disabled = false;
  const keyword = state.collectionFilter.trim().toLowerCase();
  const filtered = selected.items.filter(item => {
    if (!keyword) return true;
    const haystack = `${item.show_name} ${item.episode_code || ''} ${item.episode_title} ${item.speaker || ''} ${item.text} ${(item.tags || []).join(' ')} ${item.note || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });

  if (!filtered.length) {
    elements.collectionItems.className = 'collection-items empty-state';
    elements.collectionItems.textContent = '当前筛选下没有收藏';
    return;
  }

  elements.collectionItems.className = 'collection-items';
  elements.collectionItems.innerHTML = filtered.map(item => `
    <article class="collection-item">
      <div class="collection-meta">${escapeHtml(item.show_name)} · S${String(item.season_number).padStart(2, '0')} · ${escapeHtml(item.episode_code || 'EP')} · L${item.line_index}</div>
      <div class="collection-text"><strong>${escapeHtml(item.speaker || 'NARRATION')}:</strong> ${escapeHtml(item.text)}</div>
      ${item.tags && item.tags.length ? `<div class="collection-tags">${item.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      ${item.note ? `<div class="collection-note">${escapeHtml(item.note)}</div>` : ''}
      <div class="line-actions">
        <button class="tiny-btn" data-open-collection-episode="${item.episode_id}" data-open-collection-line="${item.line_index}">跳转</button>
        <button class="tiny-btn" data-delete-collection-item="${item.id}">移除</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-delete-collection-item]').forEach(button => {
    button.addEventListener('click', async () => {
      await request(`/api/collections/items/${button.dataset.deleteCollectionItem}`, { method: 'DELETE' });
      await loadCollections();
    });
  });
  document.querySelectorAll('[data-open-collection-episode]').forEach(button => {
    button.addEventListener('click', async () => {
      state.focusedLineIndex = Number(button.dataset.openCollectionLine);
      await selectEpisode(Number(button.dataset.openCollectionEpisode));
    });
  });
}

async function loadCollections() {
  state.collections = await request('/api/collections');
  if (state.collections.length && !state.collections.some(item => item.id === state.selectedCollectionId)) {
    state.selectedCollectionId = state.collections[0].id;
  }
  if (!state.collections.length) {
    state.selectedCollectionId = null;
  }
  renderCollections();
}

async function createCollection() {
  const name = (elements.collectionName.value || '').trim();
  if (!name) return;
  await request('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  elements.collectionName.value = '';
  await loadCollections();
}

async function deleteSelectedCollection() {
  if (!state.selectedCollectionId) return;
  if (!await hudConfirm({ title: '删除确认', message: '确认删除当前收藏夹及其全部条目？此操作无法撤销。', confirmText: '删除' })) return;
  await request(`/api/collections/${state.selectedCollectionId}`, { method: 'DELETE' });
  await loadCollections();
}

function exportSelectedCollection(kind) {
  if (!state.selectedCollectionId) return;
  const suffix = kind === 'json' ? 'json' : 'md';
  window.open(`/api/collections/${state.selectedCollectionId}/export.${suffix}`, '_blank');
}

async function collectLine(lineIndex) {
  if (!state.currentEpisode) return;
  if (!state.selectedCollectionId) {
    elements.collectionItems.className = 'collection-items';
    elements.collectionItems.innerHTML = '<div class="status-item warn">请先新建或选择收藏夹</div>';
    return;
  }
  const line = state.currentEpisode.lines.find(item => item.line_index === lineIndex && !item.is_direction);
  if (!line) return;
  const result = await hudCollectForm();
  if (result === null) return;
  const tags = result.tags.split(',').map(item => item.trim()).filter(Boolean);
  const noteRaw = result.note || '';
  await request('/api/collections/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collection_id: state.selectedCollectionId,
      episode_id: state.currentEpisode.id,
      line_index: lineIndex,
      speaker: line.speaker || null,
      text: line.text,
      tags,
      note: noteRaw,
    }),
  });
  await loadCollections();
}

async function selectEpisode(episodeId) {
  state.selectedEpisodeId = episodeId;
  const speakerQuery = state.selectedSpeakers.size ? `?speakers=${encodeURIComponent([...state.selectedSpeakers].join(','))}` : '';
  state.currentEpisode = await request(`/api/library/episodes/${episodeId}${speakerQuery}`);
  state.annotations = await request(`/api/annotations/episodes/${episodeId}`);
  const progress = await request(`/api/library/progress/${episodeId}`);
  state.readingProgress[episodeId] = progress;
  state.focusedLineIndex = progress.last_line || null;
  state.selectedSpeakers.clear();
  renderLibrary();
  elements.episodeTitle.textContent = `${state.currentEpisode.episode_code || ''} ${state.currentEpisode.title}`.trim();
  elements.episodeMeta.textContent = `${state.currentEpisode.show_name} · Season ${String(state.currentEpisode.season_number).padStart(2, '0')} · ${state.currentEpisode.source_path}`;
  if (elements.editEpisodeMetaBtn) elements.editEpisodeMetaBtn.style.display = 'inline-block';
  // Load any previously saved translations
  state.lineTranslations = {};
  let savedCount = 0;
  for (const line of state.currentEpisode.lines || []) {
    if (line.translation) {
      state.lineTranslations[String(line.line_index)] = line.translation;
      savedCount++;
    }
  }
  state.translateAllActive = false;
  if (savedCount > 0) {
    elements.translationPanel.className = 'translation-panel';
    elements.translationPanel.innerHTML = `<div class="translation-content">已加载 ${savedCount} 条保存的翻译</div>`;
    elements.translateAllBtn.textContent = `✓ 已翻译 ${savedCount} 行`;
  } else {
    elements.translationPanel.className = 'translation-panel empty-state';
    elements.translationPanel.textContent = '使用“全文翻译”后，翻译结果会显示在每条台词下方。';
    elements.translateAllBtn.textContent = '⚡ 全文翻译';
  }
  elements.translateAllBtn.disabled = false;
  elements.translateAllBtn.classList.remove('running');
  renderSpeakers();
  renderDialogue();

  // Close mobile sidebar after episode selection
  const sidebarEl = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebarEl) sidebarEl.classList.remove('open');
  if (overlay) overlay.classList.remove('open');

  if (state.focusedLineIndex) {
    const target = document.querySelector(`[data-line-index="${state.focusedLineIndex}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

async function editHighlight(lineIndex) {
  if (!state.currentEpisode) return;
  const key = String(lineIndex);
  const current = state.annotations.highlights[key] || '';
  const choice = await hudColorPicker({ currentColor: current });
  if (choice === null) return; // 取消
  const valid = ['yellow', 'red', 'green', 'blue', 'purple'];
  const payload = {
    episode_id: state.currentEpisode.id,
    line_index: lineIndex,
    color: valid.includes(choice) ? choice : null,
  };
  state.annotations = await request('/api/annotations/highlight', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  renderDialogue();
}

async function editNote(lineIndex) {
  if (!state.currentEpisode) return;
  const key = String(lineIndex);
  const current = state.annotations.notes[key] || '';
  const content = await hudPrompt({ title: '添加笔记', label: '笔记内容（留空则删除）', defaultValue: current, textarea: true });
  if (content === null) return;
  state.annotations = await request('/api/annotations/note', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episode_id: state.currentEpisode.id,
      line_index: lineIndex,
      content,
    }),
  });
  renderDialogue();
}

async function editEpisodeMeta() {
  if (!state.currentEpisode) return;
  const ep = state.currentEpisode;
  const showName = await hudPrompt({ title: '编辑剧集信息', label: '剧名', defaultValue: ep.show_name || '' });
  if (showName === null) return;
  const seasonNum = await hudPrompt({ title: '编辑剧集信息', label: '季号（数字）', defaultValue: String(ep.season_number || 0) });
  if (seasonNum === null) return;
  const episodeCode = await hudPrompt({ title: '编辑剧集信息', label: '集代码（如 S01E01，可留空）', defaultValue: ep.episode_code || '' });
  if (episodeCode === null) return;
  const title = await hudPrompt({ title: '编辑剧集信息', label: '标题', defaultValue: ep.title || '' });
  if (title === null) return;

  try {
    await request(`/api/library/episodes/${ep.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        show_name: showName.trim() || ep.show_name,
        season_number: parseInt(seasonNum.trim(), 10) || ep.season_number,
        episode_code: episodeCode.trim() || null,
        title: title.trim() || ep.title,
      }),
    });
    await loadLibrary();
    await selectEpisode(ep.id);
    elements.downloadStatus.innerHTML = '<div class="status-item success">剧集信息已更新</div>';
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">更新失败：${escapeHtml(String(error.message || error))}</div>`;
  }
}

async function bulkRenameSpeaker() {
  if (!state.currentEpisode) return;
  const oldName = await hudPrompt({ title: '批量改角色名', label: '旧角色名（或 NARRATION）', defaultValue: 'NARRATION' });
  if (oldName === null) return;
  const newName = await hudPrompt({ title: '批量改角色名', label: '新角色名', defaultValue: '' });
  if (newName === null || !newName.trim()) return;

  const updates = state.currentEpisode.lines
    .filter(line => (line.speaker || 'NARRATION') === oldName.trim())
    .map(line => ({ line_index: line.line_index, speaker: newName.trim() }));

  if (!updates.length) {
    elements.downloadStatus.innerHTML = '<div class="status-item warn">没有找到匹配的角色</div>';
    return;
  }

  try {
    await request(`/api/library/episodes/${state.currentEpisode.id}/lines/bulk`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    await selectEpisode(state.currentEpisode.id);
    elements.downloadStatus.innerHTML = `<div class="status-item success">已更新 ${updates.length} 行角色名</div>`;
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">更新失败：${escapeHtml(String(error.message || error))}</div>`;
  }
}

async function runGlobalSearch() {
  const keyword = (elements.globalSearch?.value || '').trim();
  if (!keyword) {
    elements.searchResults.className = 'search-results empty-state';
    elements.searchResults.textContent = '请输入关键词。';
    return;
  }

  const result = await request(`/api/search/lines?q=${encodeURIComponent(keyword)}&limit=80`);
  if (!result.items.length) {
    elements.searchResults.className = 'search-results empty-state';
    elements.searchResults.textContent = '没有找到匹配对白。';
    return;
  }

  elements.searchResults.className = 'search-results';
  elements.searchResults.innerHTML = result.items.map(item => `
    <button class="search-hit" data-hit-episode="${item.episode_id}" data-hit-line="${item.line_index}">
      <div class="search-hit-meta">${escapeHtml(item.show_name)} · S${String(item.season_number).padStart(2, '0')} · ${escapeHtml(item.episode_code || item.episode_title)}</div>
      <div class="search-hit-line"><strong>${escapeHtml(item.speaker || 'DIRECTION')}:</strong> ${escapeHtml(item.text)}</div>
    </button>
  `).join('');

  document.querySelectorAll('[data-hit-episode]').forEach(button => {
    button.addEventListener('click', async () => {
      state.focusedLineIndex = Number(button.dataset.hitLine);
      await selectEpisode(Number(button.dataset.hitEpisode));
    });
  });
}

async function loadLibrary() {
  state.library = await request('/api/library/shows');
  for (const show of state.library) {
    for (const season of show.seasons) {
      for (const episode of season.episodes) {
        state.readingProgress[episode.id] = {
          episode_id: episode.id,
          last_line: episode.last_line || 0,
          status: episode.reading_status || 'unread',
        };
      }
    }
  }
  renderLibrary();
}

async function rebuildLibrary() {
  elements.rebuildLibrary.disabled = true;
  try {
    const result = await request('/api/library/rebuild', { method: 'POST' });
    await loadLibrary();
    elements.downloadStatus.innerHTML = `<div class="status-item success">已重建索引：${result.files} 个文件 / ${result.episodes} 集</div>`;
  } finally {
    elements.rebuildLibrary.disabled = false;
  }
}

async function uploadFiles(files) {
  if (!files.length) return;
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  const result = await request('/api/imports/files', { method: 'POST', body: formData });
  await loadLibrary();
  elements.downloadStatus.innerHTML = `
    <div class="status-item success">导入 ${result.imported_files} 个文件，新增 ${result.imported_episodes} 集</div>
    ${result.skipped_files.map(item => `<div class="status-item warn">跳过：${item}</div>`).join('')}
  `;
}

function renderJobProgress(job) {
  if (job.progress_percent != null) {
    return `
      <div class="poi-progressbar">
        <div class="poi-progressbar-value" style="width:${job.progress_percent}%"></div>
        <div class="poi-progressbar-text">${job.progress_percent}%</div>
      </div>
    `;
  }
  if (job.status === 'running') {
    return `
      <div class="poi-progressbar">
        <div class="poi-progressbar-value indeterminate"></div>
        <div class="poi-progressbar-text">PROCESSING...</div>
      </div>
    `;
  }
  return '';
}

async function loadDownloadJobs() {
  const jobs = await request('/api/downloads');
  if (!jobs.length) {
    elements.downloadStatus.innerHTML = '<div class="status-item">暂无下载任务</div>';
    return;
  }
  elements.downloadStatus.innerHTML = jobs.map(job => `
    <div class="status-item ${job.status}">
      <div class="job-head">
        <strong>${job.target.toUpperCase()}</strong>
        <span class="job-status">${job.status}</span>
      </div>
      ${renderJobProgress(job)}
      ${job.progress_text ? `<div class="job-progress">${escapeHtml(job.progress_text)}</div>` : ''}
      ${job.current_item && job.current_item !== job.progress_text ? `<div class="job-current">当前：${escapeHtml(job.current_item)}</div>` : ''}
      ${job.status === 'failed' && job.error_line ? `<div class="job-error">错误：${escapeHtml(job.error_line)}</div>` : ''}
      ${job.last_log_line ? `<small class="job-log">日志：${escapeHtml(job.last_log_line)}</small>` : ''}
      ${job.status === 'running' ? `<button class="tiny-btn job-cancel-btn" data-cancel-job="${job.job_id}">停止任务</button>` : ''}
      <small>${job.started_at}${job.finished_at ? ` -> ${job.finished_at}` : ''}</small>
    </div>
  `).join('');

  document.querySelectorAll('[data-cancel-job]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await request(`/api/downloads/${button.dataset.cancelJob}/cancel`, { method: 'POST' });
        await loadDownloadJobs();
      } catch (error) {
        button.disabled = false;
        elements.downloadStatus.insertAdjacentHTML(
          'afterbegin',
          `<div class="status-item warn">停止失败：${escapeHtml(String(error.message || error))}</div>`,
        );
      }
    });
  });
}

// ── Catalog search & download ───────────────────────────────────────────
async function refreshCatalog() {
  elements.refreshCatalog.disabled = true;
  try {
    await request('/api/catalog/refresh', { method: 'POST' });
    pollCatalogStatus();
  } catch (error) {
    elements.catalogStatus.textContent = `刷新失败：${error.message || error}`;
    elements.refreshCatalog.disabled = false;
  }
}

let _catalogPollTimer = null;

function pollCatalogStatus() {
  if (_catalogPollTimer) return;
  _catalogPollTimer = window.setInterval(async () => {
    try {
      const st = await request('/api/catalog/status');
      elements.catalogStatus.textContent = st.scraping
        ? st.progress
        : `目录共 ${st.total_entries} 部${st.updated_at ? '（' + st.updated_at.slice(0, 16).replace('T', ' ') + '）' : ''}`;
      if (!st.scraping) {
        elements.refreshCatalog.disabled = false;
        window.clearInterval(_catalogPollTimer);
        _catalogPollTimer = null;
      }
    } catch {
      // ignore transient errors
    }
  }, 2000);
}

async function searchCatalog() {
  const query = (elements.catalogSearch?.value || '').trim();
  if (!query) {
    elements.catalogResults.innerHTML = '';
    state.catalogResults = [];
    return;
  }
  state.catalogResults = await request(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=50`);
  renderCatalogResults();
}

function renderCatalogResults() {
  const results = state.catalogResults;
  if (!results.length) {
    elements.catalogResults.innerHTML = '<div class="empty-state" style="min-height:40px">未找到匹配剧名</div>';
    return;
  }
  elements.catalogResults.innerHTML = results.map((group, gi) => `
    <div class="catalog-group">
      <div class="catalog-name">${escapeHtml(group.name)}</div>
      <div class="catalog-sources">
        ${group.sources.map((src, si) => `
          <button class="site-badge site-${src.site}" data-cg="${gi}" data-cs="${si}">
            ${escapeHtml(src.site_label)} ↓
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-cg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const group = state.catalogResults[Number(btn.dataset.cg)];
      const source = group.sources[Number(btn.dataset.cs)];
      btn.disabled = true;
      btn.textContent = '…';
      try {
          // Check if already exists
          const canDownload = await startDownloadWithCheck(group.name, source.params);
          if (!canDownload) {
            btn.disabled = false;
            btn.textContent = `${source.site_label} ↓`;
            return;
          }

        await request('/api/downloads/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(source.params),
        });
        await loadDownloadJobs();
        elements.downloadStatus.innerHTML = `<div class="status-item success">已开始下载：${escapeHtml(group.name)}（${escapeHtml(source.site_label)}）</div>`;
      } catch (error) {
        elements.downloadStatus.innerHTML = `<div class="status-item warn">下载失败：${escapeHtml(String(error.message || error))}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = `${source.site_label} ↓`;
      }
    });
  });
}

async function loadCatalogStatus() {
  try {
    const st = await request('/api/catalog/status');
    elements.catalogStatus.textContent = st.scraping
      ? st.progress
      : st.total_entries
        ? `目录共 ${st.total_entries} 部${st.updated_at ? '（' + st.updated_at.slice(0, 16).replace('T', ' ') + '）' : ''}`
        : '尚未刷新目录';
    if (st.scraping) {
      elements.refreshCatalog.disabled = true;
      pollCatalogStatus();
    }
  } catch {
    // ignore
  }
}

async function advancedDownload(params) {
  try {
    await request('/api/downloads/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    await loadDownloadJobs();
    elements.downloadStatus.innerHTML = `<div class="status-item success">已开始下载（${escapeHtml(params.target)}）</div>`;
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">下载失败：${escapeHtml(String(error.message || error))}</div>`;
  }
}

// ── Ollama / AI helpers ─────────────────────────────────────────────────

async function startDownloadWithCheck(showName, params) {
  // Check if show already exists in library before downloading
  if (showName && showExists(showName)) {
    const shouldContinue = confirm(`"${escapeHtml(showName)}" 已在剧本库中。是否继续下载？`);
    if (!shouldContinue) {
      elements.downloadStatus.innerHTML = `<div class="status-item">已取消：${escapeHtml(showName)}</div>`;
      return false;
    }
  }
  return true;
}

async function loadOllamaStatus() {
  let localError = '';
  try {
    const localTags = await requestLocalOllama('/api/tags');
    const localModels = Array.isArray(localTags.models) ? localTags.models : [];
    state.ollamaOnline = true;
    state.ollamaSource = 'local';
    state.ollamaEndpoint = LOCAL_OLLAMA_BASE;
    elements.ollamaStatus.textContent = localModels.length
      ? `✓ 本机在线 · ${localModels.length} 模型`
      : '⚠ 本机在线但无模型';
    elements.ollamaStatus.className = 'muted ai-online';
    elements.ollamaStatus.title = `endpoint: ${LOCAL_OLLAMA_BASE}`;
    if (elements.sOllamaStatus) elements.sOllamaStatus.textContent = '当前来源：本机 Ollama';
    await loadOllamaModels();
    return;
  } catch (error) {
    localError = String(error.message || error);
  }

  try {
    const h = await request('/api/ollama/health');
    state.ollamaOnline = !!h.online;
    state.ollamaSource = h.online ? 'server' : 'none';
    state.ollamaEndpoint = h.online ? (h.base_url || '/api/ollama') : '';
    if (h.online && h.models > 0) {
      elements.ollamaStatus.textContent = `✓ 服务器在线 · ${h.models} 模型`;
    } else if (h.online) {
      elements.ollamaStatus.textContent = '⚠ 服务器在线但无模型';
    } else {
      elements.ollamaStatus.textContent = '✗ 离线';
    }
    elements.ollamaStatus.className = h.online ? 'muted ai-online' : 'muted ai-offline';
    elements.ollamaStatus.title = h.error || `本机失败: ${localError}`;
    if (elements.sOllamaStatus) {
      elements.sOllamaStatus.textContent = h.online
        ? '当前来源：服务器回退地址'
        : '本机与服务器均不可用';
    }
    if (h.online) {
      await loadOllamaModels();
    } else {
      elements.ollamaModel.innerHTML = '<option value="">Ollama 未连接</option>';
      if (elements.sOllamaModel) elements.sOllamaModel.innerHTML = '<option value="">Ollama 未连接</option>';
      if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = 'Ollama 未连接';
      state.ollamaModel = '';
      state.ollamaSource = 'none';
      state.ollamaEndpoint = '';
    }
  } catch {
    state.ollamaOnline = false;
    state.ollamaSource = 'none';
    state.ollamaEndpoint = '';
    elements.ollamaStatus.textContent = '✗ 不可用';
    elements.ollamaStatus.className = 'muted ai-offline';
    elements.ollamaStatus.title = `本机失败: ${localError}；服务器代理也不可用`;
    if (elements.sOllamaStatus) elements.sOllamaStatus.textContent = '本机与服务器均不可用';
    elements.ollamaModel.innerHTML = '<option value="">Ollama 未连接</option>';
    if (elements.sOllamaModel) elements.sOllamaModel.innerHTML = '<option value="">Ollama 未连接</option>';
    if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = 'Ollama 未连接';
    state.ollamaModel = '';
  }
}

async function loadOllamaModels() {
  try {
    let models = [];
    if (state.ollamaSource === 'local') {
      const localData = await requestLocalOllama('/api/tags');
      const localModels = Array.isArray(localData.models) ? localData.models : [];
      models = localModels.map(item => ({ name: item.name }));
    } else {
      models = await request('/api/ollama/models');
    }
    const opts = models.length
      ? models.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('')
      : '<option value="">无可用模型（请先 ollama pull）</option>';
    elements.ollamaModel.innerHTML = opts;
    if (elements.sOllamaModel) elements.sOllamaModel.innerHTML = opts;
    if (models.length) {
      const current = state.ollamaModel;
      const exists = models.some(m => m.name === current);
      const selected = exists ? current : models[0].name;
      state.ollamaModel = selected;
      elements.ollamaModel.value = selected;
      if (elements.sOllamaModel) elements.sOllamaModel.value = selected;
      if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = selected;
    } else {
      state.ollamaModel = '';
      if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = '无可用模型';
    }
  } catch {
    elements.ollamaModel.innerHTML = '<option value="">模型加载失败</option>';
    if (elements.sOllamaModel) elements.sOllamaModel.innerHTML = '<option value="">模型加载失败</option>';
    if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = '模型加载失败';
    state.ollamaModel = '';
  }
}

function getSelectedModel() {
  return elements.sOllamaModel?.value || elements.ollamaModel.value || state.ollamaModel;
}

function buildOllamaPrompt(task, targetLang = '中文') {
  const prompts = {
    translate: `You are a professional translator. Translate the dialogue line to ${targetLang}. Output ONLY the translation, no explanation.`,
    analyze: 'You are a professional screenwriting teacher. Analyze this dialogue line in depth: what is the subtext, the dramatic tension, the character motivation, and why this line works dramatically. Answer in Chinese (简体中文), concise but insightful (3-5 bullet points).',
    sentiment: 'You are an emotion analysis expert for screenplays. For the given dialogue line, output a single JSON object with two keys: "label" and "confidence" (0.0-1.0). Output ONLY JSON.',
    explain: 'You are a cultural and language expert. Explain slang, idioms, cultural references, or unusual expressions in this dialogue. If none, say briefly. Answer in Chinese (简体中文).',
    rewrite: 'You are a skilled screenwriter. Rewrite the dialogue in three tones: formal, casual, and emotionally intense. Use Chinese labels: 正式版 / 口语版 / 激烈版.',
    profile: 'You are a screenwriting analyst. Build a brief voice profile for the character from lines provided. Answer in Chinese bullet points.',
    summary: 'You are a professional script reader. Summarize the episode plot from provided dialogue in 3-5 Chinese sentences.',
  };
  return prompts[task] || prompts.analyze;
}

async function localOllamaChat(model, task, content) {
  const systemPrompt = buildOllamaPrompt(task, '中文');
  try {
    const resp = await requestLocalOllama('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        stream: false,
      }),
    });
    const text = String(resp?.message?.content || '').trim();
    if (text) return { ok: true, reply: text };
  } catch (error) {
    // Fall through to generate API for compatibility.
    if (!String(error.message || '').includes('404') && !String(error.message || '').includes('400')) {
      throw error;
    }
  }

  const prompt = `[System]\n${systemPrompt}\n\n[User]\n${content}`;
  const fallback = await requestLocalOllama('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  const text = String(fallback?.response || '').trim();
  if (!text) throw new Error('本机 Ollama 返回空响应');
  return { ok: true, reply: text };
}

async function ollamaChat(model, task, content) {
  let localErr = '';
  try {
    const result = await localOllamaChat(model, task, content);
    state.ollamaSource = 'local';
    state.ollamaEndpoint = LOCAL_OLLAMA_BASE;
    return result;
  } catch (error) {
    localErr = String(error.message || error);
  }

  const serverResult = await request('/api/ollama/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, task, content }),
  });
  if (!serverResult.ok && localErr) {
    return { ok: false, error: `本机失败: ${localErr}; 服务器返回: ${serverResult.error || '未知错误'}` };
  }
  if (serverResult.ok) {
    state.ollamaSource = 'server';
  }
  return serverResult;
}

// ── Settings helpers ──────────────────────────────────────────────────────

function setBadge(el, configured) {
  if (!el) return;
  el.textContent = configured ? '已配置' : '未配置';
  el.className = 'settings-badge ' + (configured ? 'configured' : 'not-configured');
}

async function loadSettings() {
  try {
    const data = await request('/api/settings');
    if (elements.sOllamaUrl) elements.sOllamaUrl.value = data.ollama_base_url || '';
  } catch {
    // silent fail — settings modal will still open
  }
}

async function saveSettings() {
  const patch = {};
  const ollUrl = elements.sOllamaUrl?.value.trim();
  if (ollUrl) patch.ollama_base_url = ollUrl;

  if (!Object.keys(patch).length) {
    elements.sSaveMsg.textContent = '没有要保存的变更';
    setTimeout(() => { if (elements.sSaveMsg) elements.sSaveMsg.textContent = ''; }, 2000);
    return;
  }

  try {
    elements.sSave.disabled = true;
    await request('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    elements.sSaveMsg.textContent = '✓ 已保存';
    await loadSettings();
    // if URL changed, re-probe Ollama
    if (patch.ollama_base_url) await loadOllamaStatus();
  } catch {
    elements.sSaveMsg.textContent = '✗ 保存失败';
  } finally {
    elements.sSave.disabled = false;
    setTimeout(() => { if (elements.sSaveMsg) elements.sSaveMsg.textContent = ''; }, 3000);
  }
}

function buildLineContext(lineIndex) {
  if (!state.currentEpisode) return { line: null, context: '' };
  const idx = state.currentEpisode.lines.findIndex(l => l.line_index === lineIndex);
  const line = state.currentEpisode.lines[idx];
  if (!line) return { line: null, context: '' };
  const before = state.currentEpisode.lines.slice(Math.max(idx - 3, 0), idx);
  const after = state.currentEpisode.lines.slice(idx + 1, idx + 4);
  const fmt = l => `${l.speaker || 'DIRECTION'}: ${l.text}`;
  const context = [...before.map(fmt), `>>> ${fmt(line)} <<<`, ...after.map(fmt)].join('\n');
  return { line, context };
}

async function aiLineTask(task, lineIndex) {
  if (!state.ollamaOnline) { showAiResult('Ollama 未连接，请先启动 ollama serve。'); return; }
  const model = getSelectedModel();
  if (!model) { showAiResult('请先选择模型'); return; }
  const { line, context } = buildLineContext(lineIndex);
  if (!line) return;

  const taskLabels = { analyze: '台词点评', explain: '注释', rewrite: '改写', sentiment: '情感' };
  showAiResult(`正在${taskLabels[task] || task}…`);

  try {
    const result = await ollamaChat(model, task, context);
    if (result.ok) {
      showAiResult(
        `<div class="ai-result-header">${escapeHtml(taskLabels[task] || task)}</div>` +
        `<div class="ai-result-quote">${escapeHtml(line.speaker || 'DIRECTION')}: ${escapeHtml(line.text)}</div>` +
        `<div class="ai-result-body">${formatAiReply(result.reply)}</div>`
      , true);
    } else {
      showAiResult(`出错：${escapeHtml(result.error || '未知错误')}`);
    }
  } catch (error) {
    showAiResult(`请求失败：${escapeHtml(String(error.message || error))}`);
  }
}

async function aiEpisodeTask(task) {
  if (!state.ollamaOnline) { showAiResult('Ollama 未连接，请先启动 ollama serve。'); return; }
  const model = getSelectedModel();
  if (!model) { showAiResult('请先选择模型'); return; }
  if (!state.currentEpisode) { showAiResult('请先选择一集'); return; }

  const taskLabels = { summary: '本集摘要', profile: '角色画像' };
  showAiResult(`正在生成${taskLabels[task] || task}…`);

  let content = '';
  if (task === 'summary') {
    content = state.currentEpisode.lines
      .map(l => `${l.speaker || 'DIRECTION'}: ${l.text}`)
      .slice(0, 200)
      .join('\n');
  } else if (task === 'profile') {
    const speaker = [...state.selectedSpeakers][0];
    if (!speaker) { showAiResult('请先在右侧选中一位角色，再点击角色画像。'); return; }
    const speakerLines = state.currentEpisode.lines
      .filter(l => l.speaker === speaker)
      .map(l => `${l.speaker}: ${l.text}`)
      .slice(0, 120);
    content = `Character: ${speaker}\n\n${speakerLines.join('\n')}`;
  }

  try {
    const result = await ollamaChat(model, task, content);
    if (result.ok) {
      showAiResult(
        `<div class="ai-result-header">${escapeHtml(taskLabels[task] || task)}</div>` +
        `<div class="ai-result-body">${formatAiReply(result.reply)}</div>`
      , true);
    } else {
      showAiResult(`出错：${escapeHtml(result.error || '未知错误')}`);
    }
  } catch (error) {
    showAiResult(`请求失败：${escapeHtml(String(error.message || error))}`);
  }
}

function showAiResult(htmlOrText, isHtml = false) {
  elements.aiPanel.className = 'ai-panel';
  if (isHtml) {
    elements.aiPanel.innerHTML = htmlOrText;
  } else {
    elements.aiPanel.innerHTML = `<div class="status-item">${escapeHtml(htmlOrText)}</div>`;
  }
}

function formatAiReply(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function loadTheme() {
  const saved = localStorage.getItem('scriptsreader-theme');
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  if (elements.themeToggle) {
    elements.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('scriptsreader-theme', next);
  if (elements.themeToggle) {
    elements.themeToggle.textContent = next === 'light' ? '🌙' : '☀️';
  }
}

async function translateAll() {
  if (!state.currentEpisode) return;
  if (state.translateAllActive) {
    state.translateAllActive = false;
    return;
  }

  const allLines = state.currentEpisode.lines.filter(l => !l.is_direction && l.text.trim());
  const total = allLines.length;
  let done = 0;

  state.translateAllActive = true;
  elements.translateAllBtn.textContent = `⏹ 停止 (0/${total})`;
  elements.translateAllBtn.classList.add('running');

  for (const line of allLines) {
    if (!state.translateAllActive) break;
    try {
      const result = await request('/api/translate/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line.text, context_before: [], context_after: [] }),
      });
      const translation = result.translation || result.message || '';
      if (translation) {
        state.lineTranslations[String(line.line_index)] = translation;
        const article = elements.dialogueList.querySelector(`[data-line-index="${line.line_index}"]`);
        if (article) {
          let translDiv = article.querySelector('.inline-translation');
          if (!translDiv) {
            translDiv = document.createElement('div');
            translDiv.className = 'inline-translation';
            const linePara = article.querySelector('.line-body p');
            if (linePara) linePara.after(translDiv);
          }
          translDiv.textContent = translation;
        }
      }
    } catch (_) { /* silently skip */ }
    done++;
    if (state.translateAllActive) {
      elements.translateAllBtn.textContent = `⏹ 停止 (${done}/${total})`;
    }
  }

  state.translateAllActive = false;
  elements.translateAllBtn.classList.remove('running');
  const stopped = done < total;

  // Auto-save translations to the server
  if (Object.keys(state.lineTranslations).length > 0) {
    try {
      const translations = Object.entries(state.lineTranslations).map(([line_index, translation]) => ({
        line_index: parseInt(line_index, 10),
        translation,
      }));
      await request('/api/translate/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: state.currentEpisode.id, translations }),
      });
    } catch (err) {
      console.error('保存翻译失败', err);
    }
  }

  elements.translateAllBtn.textContent = stopped
    ? `⚡ 继续翻译 (${done}/${total})`
    : `✓ 已翻译 ${total} 行`;
}

function wireEvents() {
  // ── HUD Modal 全局关闭事件 ──
  const hudOverlay = document.getElementById('hud-modal-overlay');
  const hudClose = document.getElementById('hud-modal-close');
  const hudCancel = document.getElementById('hud-modal-cancel');
  if (hudOverlay) {
    hudClose?.addEventListener('click', _hudModalClose);
    hudCancel?.addEventListener('click', _hudModalClose);
    hudOverlay.addEventListener('click', e => { if (e.target === hudOverlay) _hudModalClose(); });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && hudOverlay && !hudOverlay.hidden) _hudModalClose();
  });

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebarEl = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (menuBtn && sidebarEl && overlay) {
    const openSidebar = () => { sidebarEl.classList.add('open'); overlay.classList.add('open'); };
    const closeSidebar = () => { sidebarEl.classList.remove('open'); overlay.classList.remove('open'); };
    menuBtn.addEventListener('click', () => sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar());
    overlay.addEventListener('click', closeSidebar);
  }

  elements.librarySearch.addEventListener('input', renderLibrary);
  elements.rebuildLibrary.addEventListener('click', rebuildLibrary);
  elements.manualImport.addEventListener('change', event => uploadFiles(event.target.files));
  elements.episodeSearch.addEventListener('input', event => {
    state.currentSearch = event.target.value;
    renderDialogue();
  });
  elements.clearFilters.addEventListener('click', () => {
    state.selectedSpeakers.clear();
    renderSpeakers();
    renderDialogue();
    elements.speakerTrackResults.className = 'search-results empty-state';
    elements.speakerTrackResults.textContent = '选中 1 个角色后可跨集追踪其全部台词。';
  });
  elements.runGlobalSearch.addEventListener('click', runGlobalSearch);
  elements.globalSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      runGlobalSearch();
    }
  });
  elements.refreshCatalog.addEventListener('click', refreshCatalog);
  elements.runCatalogSearch.addEventListener('click', searchCatalog);
  elements.catalogSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      searchCatalog();
    }
  });
  elements.fdDownload.addEventListener('click', async () => {
    const showName = (elements.fdShowName.value || '').trim();
    if (showName && showExists(showName)) {
      const shouldContinue = confirm(`"${escapeHtml(showName)}" 已存在于剧本库。要继续下载吗？`);
      if (!shouldContinue) {
        elements.downloadStatus.innerHTML = `<div class="status-item">已取消：${escapeHtml(showName)}</div>`;
        return;
      }
    }
    await advancedDownload({
      target: 'foreverdreaming',
      index_url: (elements.fdIndexUrl.value || '').trim(),
      show_name: showName,
    });
  });
  elements.advSpringfieldDownload.addEventListener('click', async () => {
    const slug = (elements.advSpringfieldSlug.value || '').trim();
    await advancedDownload({
      target: 'springfield',
      show_slug: slug,
      all_seasons: true,
    });
  });
  elements.translateAllBtn.addEventListener('click', translateAll);
  elements.collectionCreate.addEventListener('click', createCollection);
  elements.collectionDelete.addEventListener('click', deleteSelectedCollection);
  elements.collectionExportMd.addEventListener('click', () => exportSelectedCollection('md'));
  elements.collectionExportJson.addEventListener('click', () => exportSelectedCollection('json'));
  elements.collectionName.addEventListener('keydown', event => {
    if (event.key === 'Enter') createCollection();
  });
  elements.collectionSelect.addEventListener('change', () => {
    state.selectedCollectionId = Number(elements.collectionSelect.value) || null;
    renderCollections();
  });
  elements.collectionFilter.addEventListener('input', event => {
    state.collectionFilter = event.target.value || '';
    renderCollections();
  });
  elements.trackSpeakerBtn.addEventListener('click', runSpeakerTimeline);
  if (elements.bulkSpeakerBtn) elements.bulkSpeakerBtn.addEventListener('click', bulkRenameSpeaker);
  if (elements.editEpisodeMetaBtn) elements.editEpisodeMetaBtn.addEventListener('click', editEpisodeMeta);
  elements.dialogueList.addEventListener('scroll', () => {
    const idx = topVisibleLineIndex();
    if (idx) saveReadingProgress(idx);
  });
  window.addEventListener('beforeunload', () => {
    const idx = topVisibleLineIndex() || state.focusedLineIndex;
    if (idx) saveReadingProgress(idx, true);
  });
  elements.ollamaRefreshModels.addEventListener('click', () => elements.openSettings.click());
  elements.ollamaModel.addEventListener('change', () => {
    state.ollamaModel = elements.ollamaModel.value;
    if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = elements.ollamaModel.value || '未选择模型';
    if (elements.sOllamaModel) elements.sOllamaModel.value = elements.ollamaModel.value;
  });
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', toggleTheme);
  }
  // ── Settings modal ──
  elements.openSettings.addEventListener('click', async () => {
    await loadSettings();
    // sync model list into modal select
    if (elements.sOllamaModel && elements.ollamaModel) {
      elements.sOllamaModel.innerHTML = elements.ollamaModel.innerHTML;
      elements.sOllamaModel.value = state.ollamaModel;
    }
    elements.settingsOverlay.hidden = false;
  });
  elements.closeSettings.addEventListener('click', () => {
    elements.settingsOverlay.hidden = true;
  });
  elements.settingsOverlay.addEventListener('click', e => {
    if (e.target === elements.settingsOverlay) elements.settingsOverlay.hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !elements.settingsOverlay.hidden) elements.settingsOverlay.hidden = true;
  });
  elements.sOllamaRefresh.addEventListener('click', async () => {
    elements.sOllamaStatus.textContent = '刷新中…';
    await loadOllamaStatus();
    if (elements.sOllamaModel && elements.ollamaModel) {
      elements.sOllamaModel.innerHTML = elements.ollamaModel.innerHTML;
      elements.sOllamaModel.value = state.ollamaModel;
    }
    elements.sOllamaStatus.textContent = state.ollamaOnline ? '已连接' : '未连接';
  });
  elements.sOllamaModel.addEventListener('change', () => {
    state.ollamaModel = elements.sOllamaModel.value;
    elements.ollamaModel.value = elements.sOllamaModel.value;
    if (elements.ollamaModelLabel) elements.ollamaModelLabel.textContent = elements.sOllamaModel.value || '未选择模型';
  });
  elements.sSave.addEventListener('click', saveSettings);
  document.querySelectorAll('[data-ai-task]').forEach(btn => {
    btn.addEventListener('click', () => aiEpisodeTask(btn.dataset.aiTask));
  });
}

async function bootstrap() {
  loadTheme();
  wireEvents();
  loadAppVersion();
  await loadCatalogStatus();
  await loadLibrary();
  await loadCollections();
  await loadDownloadJobs();
  await loadOllamaStatus();
  window.setInterval(loadDownloadJobs, 2500);
}

bootstrap().catch(error => {
  elements.dialogueList.className = 'dialogue-list empty-state';
  elements.dialogueList.textContent = `初始化失败：${error.message || error}`;
});
