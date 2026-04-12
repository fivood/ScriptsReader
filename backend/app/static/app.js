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
  lineTranslations: {},
  translateAllActive: false,
  readingProgress: {},
  progressSaveTimer: null,
  collections: [],
  selectedCollectionId: null,
  collectionFilter: '',
};

const elements = {
  libraryTree: document.getElementById('library-tree'),
  librarySearch: document.getElementById('library-search'),
  libraryCount: document.getElementById('library-count'),
  rebuildLibrary: document.getElementById('rebuild-library'),
  manualImport: document.getElementById('manual-import'),
  downloadStatus: document.getElementById('download-status'),
  episodeTitle: document.getElementById('episode-title'),
  episodeMeta: document.getElementById('episode-meta'),
  lineCount: document.getElementById('line-count'),
  dialogueList: document.getElementById('dialogue-list'),
  speakerFilters: document.getElementById('speaker-filters'),
  speakerCount: document.getElementById('speaker-count'),
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
  ollamaModel: document.getElementById('ollama-model'),
  ollamaRefreshModels: document.getElementById('ollama-refresh-models'),
  aiPanel: document.getElementById('ai-panel'),
  aiProfileBtn: document.getElementById('ai-profile-btn'),
  translateAllBtn: document.getElementById('translate-all-btn'),
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

function speakerColor(name) {
  const palette = ['speaker-a', 'speaker-b', 'speaker-c', 'speaker-d', 'speaker-e', 'speaker-f'];
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  return palette[hash % palette.length];
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
    <details class="tree-show" open>
      <summary>${show.name}</summary>
      ${show.seasons.map(season => `
        <details class="tree-season" open>
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
    return `
      <article class="dialogue-line${focused} ${highlightColor ? `hl-${highlightColor}` : ''}" data-line-index="${line.line_index}">
        <div class="speaker-tag ${speakerColor(speaker)}">${speaker}</div>
        <div class="line-body">
          <p>${escapeHtml(line.text)}</p>
          ${inlineTranslation ? `<div class="inline-translation">${escapeHtml(inlineTranslation)}</div>` : ''}
          <div class="line-actions">
            <button class="tiny-btn" data-translate-line="${line.line_index}">译</button>
            <button class="tiny-btn ai-btn" data-analyze-line="${line.line_index}">析</button>
            <button class="tiny-btn ai-btn" data-explain-line="${line.line_index}">注释</button>
            <button class="tiny-btn ai-btn" data-rewrite-line="${line.line_index}">改</button>
            <button class="tiny-btn ai-btn" data-sentiment-line="${line.line_index}">情</button>
            <button class="tiny-btn" data-collect-line="${line.line_index}">藏</button>
            <button class="tiny-btn" data-highlight-line="${line.line_index}">标</button>
            <button class="tiny-btn" data-note-line="${line.line_index}">注</button>
          </div>
        </div>
        ${noteText ? `<p class="note-preview">NOTE: ${escapeHtml(noteText)}</p>` : ''}
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-translate-line]').forEach(button => {
    button.addEventListener('click', () => translateLine(Number(button.dataset.translateLine)));
  });
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
  if (!confirm('确认删除当前收藏夹及其条目？')) return;
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
  const tagsRaw = prompt('收藏标签（逗号分隔，可留空）', '');
  if (tagsRaw === null) return;
  const noteRaw = prompt('收藏备注（可留空）', '') || '';
  const tags = tagsRaw.split(',').map(item => item.trim()).filter(Boolean);
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
  state.lineTranslations = {};
  state.translateAllActive = false;
  elements.translationPanel.className = 'translation-panel empty-state';
  elements.translationPanel.textContent = '点击任意对白行上的"译"按钮查看结果。';
  elements.translateAllBtn.textContent = '⚡ 全文翻译';
  elements.translateAllBtn.disabled = false;
  elements.translateAllBtn.classList.remove('running');
  renderSpeakers();
  renderDialogue();

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
  const choice = prompt('高亮颜色：yellow/red/green/blue/purple，留空清除', current);
  if (choice === null) return;
  const color = choice.trim().toLowerCase();
  const valid = ['yellow', 'red', 'green', 'blue', 'purple'];
  const payload = {
    episode_id: state.currentEpisode.id,
    line_index: lineIndex,
    color: valid.includes(color) ? color : null,
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
  const content = prompt('输入笔记内容（留空删除）', current);
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

async function loadOllamaStatus() {
  try {
    const h = await request('/api/ollama/health');
    state.ollamaOnline = h.online;
    elements.ollamaStatus.textContent = h.online ? '✓ 在线' : '✗ 离线';
    elements.ollamaStatus.className = h.online ? 'muted ai-online' : 'muted ai-offline';
    if (h.online) await loadOllamaModels();
  } catch {
    state.ollamaOnline = false;
    elements.ollamaStatus.textContent = '✗ 不可用';
    elements.ollamaStatus.className = 'muted ai-offline';
  }
}

async function loadOllamaModels() {
  const models = await request('/api/ollama/models');
  elements.ollamaModel.innerHTML = models.length
    ? models.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('')
    : '<option value="">无可用模型</option>';
  if (models.length) {
    state.ollamaModel = models[0].name;
    elements.ollamaModel.value = models[0].name;
  }
}

function getSelectedModel() {
  return elements.ollamaModel.value || state.ollamaModel;
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
  const model = getSelectedModel();
  if (!model) { showAiResult('请先选择模型'); return; }
  const { line, context } = buildLineContext(lineIndex);
  if (!line) return;

  const taskLabels = { analyze: '台词点评', explain: '注释', rewrite: '改写', sentiment: '情感' };
  showAiResult(`正在${taskLabels[task] || task}…`);

  try {
    const result = await request('/api/ollama/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, task, content: context }),
    });
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
    const result = await request('/api/ollama/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, task, content }),
    });
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
    const idx = state.currentEpisode.lines.indexOf(line);
    const contextBefore = state.currentEpisode.lines
      .slice(Math.max(idx - 1, 0), idx).map(l => l.text);
    const contextAfter = state.currentEpisode.lines
      .slice(idx + 1, idx + 2).map(l => l.text);
    try {
      const result = await request('/api/translate/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line.text, context_before: contextBefore, context_after: contextAfter }),
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
  elements.translateAllBtn.textContent = stopped
    ? `⚡ 继续翻译 (${done}/${total})`
    : `✓ 已翻译 ${total} 行`;
}

async function translateLine(lineIndex) {
  if (!state.currentEpisode) return;
  const currentIndex = state.currentEpisode.lines.findIndex(line => line.line_index === lineIndex);
  const line = state.currentEpisode.lines[currentIndex];
  const contextBefore = state.currentEpisode.lines.slice(Math.max(currentIndex - 2, 0), currentIndex).map(item => item.text);
  const contextAfter = state.currentEpisode.lines.slice(currentIndex + 1, currentIndex + 3).map(item => item.text);
  elements.translationPanel.className = 'translation-panel';
  elements.translationPanel.innerHTML = '<div class="status-item">翻译中...</div>';
  try {
    const result = await request('/api/translate/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: line.text, context_before: contextBefore, context_after: contextAfter }),
    });
    elements.translationPanel.innerHTML = `
      <div class="translation-block">
        <div class="translation-label">原文</div>
        <p>${escapeHtml(line.text)}</p>
      </div>
      <div class="translation-block accent-block">
        <div class="translation-label">译文</div>
        <p>${escapeHtml(result.translation || result.message || '暂无结果')}</p>
      </div>
      <div class="translation-footnote">${result.provider || '未配置翻译引擎'}</div>
    `;
  } catch (error) {
    elements.translationPanel.innerHTML = `<div class="status-item warn">翻译失败：${escapeHtml(String(error.message || error))}</div>`;
  }
}

function wireEvents() {
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
  elements.fdDownload.addEventListener('click', () => advancedDownload({
    target: 'foreverdreaming',
    index_url: (elements.fdIndexUrl.value || '').trim(),
    show_name: (elements.fdShowName.value || '').trim(),
  }));
  elements.advSpringfieldDownload.addEventListener('click', () => advancedDownload({
    target: 'springfield',
    show_slug: (elements.advSpringfieldSlug.value || '').trim(),
    all_seasons: true,
  }));
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
  elements.dialogueList.addEventListener('scroll', () => {
    const idx = topVisibleLineIndex();
    if (idx) saveReadingProgress(idx);
  });
  window.addEventListener('beforeunload', () => {
    const idx = topVisibleLineIndex() || state.focusedLineIndex;
    if (idx) saveReadingProgress(idx, true);
  });
  elements.ollamaRefreshModels.addEventListener('click', loadOllamaStatus);
  elements.ollamaModel.addEventListener('change', () => {
    state.ollamaModel = elements.ollamaModel.value;
  });
  document.querySelectorAll('[data-ai-task]').forEach(btn => {
    btn.addEventListener('click', () => aiEpisodeTask(btn.dataset.aiTask));
  });
}

async function bootstrap() {
  wireEvents();
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
