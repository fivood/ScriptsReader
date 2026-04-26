const state = {
  library: [],
  selectedEpisodeId: null,
  currentEpisode: null,
  catalogResults: [],
  aiConfigured: false,
  aiProvider: '',
  aiModel: '',
  aiApiKey: '',
  aiBaseUrl: '',
  collections: [],
  selectedCollectionId: null,
  collectionFilter: '',
  libraryFilterLetter: null,
};



const elements = {
  libraryTree: document.getElementById('library-tree'),
  librarySearch: document.getElementById('library-search'),
  libraryCount: document.getElementById('library-count'),
  appVersion: document.getElementById('app-version'),
  rebuildLibrary: document.getElementById('rebuild-library'),
  manualImport: document.getElementById('manual-import'),
  importsList: document.getElementById('imports-list'),
  downloadStatus: document.getElementById('download-status'),
  mainPanelTitle: document.getElementById('main-panel-title'),
  systemDashboard: document.getElementById('system-dashboard'),
  episodeManager: document.getElementById('episode-manager'),
  episodeManagerBody: document.getElementById('episode-manager-body'),
  backToDashboard: document.getElementById('back-to-dashboard'),
  libraryStats: document.getElementById('library-stats'),
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
  // ── Settings modal ──
  openSettings: document.getElementById('open-settings'),
  themeToggle: document.getElementById('theme-toggle'),
  settingsOverlay: document.getElementById('settings-overlay'),
  closeSettings: document.getElementById('close-settings'),
  sAiProvider: document.getElementById('s-ai-provider'),
  sAiBaseUrl: document.getElementById('s-ai-base-url'),
  sAiApiKey: document.getElementById('s-ai-api-key'),
  sAiModel: document.getElementById('s-ai-model'),
  sAiRefresh: document.getElementById('s-ai-refresh'),
  sAiStatus: document.getElementById('s-ai-status'),
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
  collectionCount: document.getElementById('collection-count'),
  collectionSelect: document.getElementById('collection-select'),
  collectionDelete: document.getElementById('collection-delete'),
  collectionExportMd: document.getElementById('collection-export-md'),
  collectionExportJson: document.getElementById('collection-export-json'),
  collectionName: document.getElementById('collection-name'),
  collectionCreate: document.getElementById('collection-create'),
  collectionFilter: document.getElementById('collection-filter'),
  collectionItems: document.getElementById('collection-items'),
  libraryAlphaNav: document.getElementById('library-alpha-nav'),
  guestVisibilityList: document.getElementById('guest-visibility-list'),
  guestVisibilitySave: document.getElementById('guest-visibility-save'),
  guestVisibilityMsg: document.getElementById('guest-visibility-msg'),
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'same-origin' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

// ── HUD Modal System (replaces native prompt / confirm) ──────────────────

let _hudModalResolve = null;

function _hudModalClose() {
  if (_hudModalResolve) { _hudModalResolve(null); _hudModalResolve = null; }
  document.getElementById('hud-modal-overlay').hidden = true;
  document.getElementById('hud-modal-body').innerHTML = '';
  document.getElementById('hud-modal-confirm').onclick = null;
  document.getElementById('hud-modal-confirm').style.display = '';
}

function _hudModalOpen({ title, bodyHtml, confirmText = 'Confirm', showConfirm = true, showCancel = true, cancelText = 'Cancel' }) {
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
 * Single/multi-line text input modal, returns string or null (cancelled).
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
 * Confirm/cancel modal, returns true/false.
 */
function hudConfirm({ title, message, confirmText = 'Confirm' }) {
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
 * Collection form (tags + note), returns { tags, note } or null.
 */
function hudCollectForm() {
  return new Promise(resolve => {
    _hudModalResolve = () => resolve(null);
    _hudModalOpen({
      title: 'Collect Line',
      bodyHtml: `
        <label class="settings-label">Tags (comma-separated, optional)</label>
        <input id="hud-tags" type="text" placeholder="inspiring, humorous, Reese…">
        <label class="settings-label" style="margin-top:8px">Note (optional)</label>
        <textarea id="hud-note" class="hud-modal-textarea" rows="2" placeholder="Analysis or excerpt reason…"></textarea>
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
 * Highlight color picker, returns color string (empty=clear) or null (cancelled).
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
      title: 'Highlight Color',
      bodyHtml: `<div class="hud-color-grid">${btns}</div><button class="hud-color-clear-btn" data-color="">✕  Clear Highlight</button>`,
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

function getShowFirstLetter(name) {
  const first = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

function renderAlphaNav() {
  if (!elements.libraryAlphaNav) return;
  const letters = new Set();
  state.library.forEach(show => letters.add(getShowFirstLetter(show.name)));
  const sorted = Array.from(letters).sort();

  const items = sorted.map(letter => {
    const active = state.libraryFilterLetter === letter ? ' active' : '';
    return `<button class="alpha-btn${active}" data-alpha="${letter}">${letter}</button>`;
  });

  const allActive = state.libraryFilterLetter === null ? ' active' : '';
  items.unshift(`<button class="alpha-btn${allActive}" data-alpha="ALL">All</button>`);

  elements.libraryAlphaNav.innerHTML = items.join('');

  document.querySelectorAll('[data-alpha]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.alpha;
      state.libraryFilterLetter = val === 'ALL' ? null : val;
      renderAlphaNav();
      renderLibrary();
    });
  });
}

function renderLibrary() {
  const keyword = elements.librarySearch.value.trim().toLowerCase();
  const letterFilter = state.libraryFilterLetter;

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
    .filter(show => {
      if (show.seasons.length === 0) return false;
      if (letterFilter && getShowFirstLetter(show.name) !== letterFilter) return false;
      return true;
    });

  const totalEpisodes = filteredShows.reduce((sum, show) => sum + show.seasons.reduce((acc, season) => acc + season.episodes.length, 0), 0);
  elements.libraryCount.textContent = `${filteredShows.length} shows / ${totalEpisodes} eps`;

  if (!filteredShows.length) {
    elements.libraryTree.innerHTML = '<div class="empty-state">No matches</div>';
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
                <small>${episode.line_count} lines</small>
                <span class="episode-delete-btn" data-delete-episode="${episode.id}" title="Delete Episode">✕</span>
              </button>
            `).join('')}
          </div>
        </details>
      `).join('')}
    </details>
  `).join('');

  document.querySelectorAll('[data-episode-id]').forEach(button => {
    button.addEventListener('click', e => {
      if (e.target.closest('.episode-delete-btn')) return;
      showEpisodeManager(Number(button.dataset.episodeId));
    });
  });
  document.querySelectorAll('[data-delete-episode]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const episodeId = Number(btn.dataset.deleteEpisode);
      if (!await hudConfirm({ title: 'Delete Confirmation', message: 'Delete this episode? Related data (collections, progress, highlights, notes) will also be removed.', confirmText: 'Delete' })) return;
      try {
        await request(`/api/library/episodes/${episodeId}`, { method: 'DELETE' });
        if (state.selectedEpisodeId === episodeId) {
          state.selectedEpisodeId = null;
          state.currentEpisode = null;
          showSystemDashboard();
        }
        await loadLibrary();
        elements.downloadStatus.innerHTML = '<div class="status-item success">Episode deleted</div>';
      } catch (error) {
        elements.downloadStatus.innerHTML = `<div class="status-item warn">Delete failed: ${escapeHtml(String(error.message || error))}</div>`;
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


function selectedCollection() {
  return state.collections.find(item => item.id === state.selectedCollectionId) || null;
}

function renderCollections() {
  const all = state.collections;
  const selected = selectedCollection();
  const itemCount = selected ? selected.items.length : 0;
  elements.collectionCount.textContent = `${itemCount} items`;

  elements.collectionSelect.innerHTML = all.length
    ? all.map(item => `<option value="${item.id}" ${item.id === state.selectedCollectionId ? 'selected' : ''}>${escapeHtml(item.name)} (${item.item_count})</option>`).join('')
    : '<option value="">Select Collection</option>';

  if (!selected) {
    elements.collectionItems.className = 'collection-items empty-state';
    elements.collectionItems.textContent = 'No collection items';
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
    elements.collectionItems.textContent = 'No collections match current filter';
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
        <button class="tiny-btn" data-open-collection-episode="${item.episode_id}" data-open-collection-line="${item.line_index}">Jump</button>
        <button class="tiny-btn" data-delete-collection-item="${item.id}">Remove</button>
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
  if (!await hudConfirm({ title: 'Delete Confirmation', message: 'Delete this collection and all its items? This cannot be undone.', confirmText: 'Delete' })) return;
  await request(`/api/collections/${state.selectedCollectionId}`, { method: 'DELETE' });
  await loadCollections();
}

function exportSelectedCollection(kind) {
  if (!state.selectedCollectionId) return;
  const suffix = kind === 'json' ? 'json' : 'md';
  window.open(`/api/collections/${state.selectedCollectionId}/export.${suffix}`, '_blank');
}

async function loadEpisodeForManagement(episodeId) {
  state.selectedEpisodeId = episodeId;
  state.currentEpisode = await request(`/api/library/episodes/${episodeId}`);
  renderLibrary();
}

function showEpisodeManager(episodeId) {
  loadEpisodeForManagement(episodeId).then(() => {
    elements.systemDashboard.style.display = 'none';
    elements.episodeManager.style.display = '';
    elements.mainPanelTitle.textContent = 'Episode Management';
    renderEpisodeManager();
  });
}

function showSystemDashboard() {
  state.selectedEpisodeId = null;
  state.currentEpisode = null;
  renderLibrary();
  elements.episodeManager.style.display = 'none';
  elements.systemDashboard.style.display = '';
  elements.mainPanelTitle.textContent = 'System Dashboard';
}

function renderLibraryStats() {
  let totalEpisodes = 0;
  let totalLines = 0;
  const allSpeakers = new Set();
  for (const show of state.library) {
    for (const season of show.seasons) {
      for (const episode of season.episodes) {
        totalEpisodes++;
        totalLines += episode.line_count || 0;
      }
    }
  }
  // Count unique speakers across all episodes would require fetching each episode; keep it simple
  elements.libraryStats.innerHTML = `
    <div class="status-item">
      <div class="job-head"><strong>Total Shows</strong><span>${state.library.length}</span></div>
    </div>
    <div class="status-item">
      <div class="job-head"><strong>Total Episodes</strong><span>${totalEpisodes}</span></div>
    </div>
    <div class="status-item">
      <div class="job-head"><strong>Total Lines</strong><span>${totalLines.toLocaleString()}</span></div>
    </div>
  `;
}

function renderEpisodeManager() {
  const ep = state.currentEpisode;
  if (!ep) {
    elements.episodeManagerBody.innerHTML = '<div class="empty-state">No episode selected</div>';
    return;
  }
  const speakers = [...new Set((ep.lines || []).filter(l => l.speaker).map(l => l.speaker))];
  elements.episodeManagerBody.innerHTML = `
    <div class="status-item">
      <div class="job-head"><strong>${escapeHtml(ep.show_name)}</strong><span class="muted">S${String(ep.season_number).padStart(2, '0')} · ${escapeHtml(ep.episode_code || 'EP')}</span></div>
      <div style="margin-top:6px;"><strong>${escapeHtml(ep.title)}</strong></div>
      <div class="muted" style="margin-top:4px;">${escapeHtml(ep.source_path)}</div>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button class="ghost-btn" id="mgr-edit-meta">✎ Edit Info</button>
        <button class="ghost-btn" id="mgr-delete-episode" style="color:#c44;">✕ Delete Episode</button>
      </div>
    </div>
    <div class="status-item">
      <div class="job-head"><strong>Stats</strong></div>
      <div class="muted" style="margin-top:4px;">${ep.lines ? ep.lines.length : 0} lines · ${speakers.length} speakers</div>
    </div>
    <div class="status-item">
      <div class="job-head"><strong>Speakers</strong><span class="muted">${speakers.length}</span></div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
        ${speakers.map(s => `<span class="speaker-chip ${speakerColor(s)}">${escapeHtml(s)}</span>`).join('')}
      </div>
      <div style="margin-top:10px;">
        <button class="ghost-btn" id="mgr-bulk-rename">Bulk Rename Speakers</button>
      </div>
    </div>
  `;
  document.getElementById('mgr-edit-meta')?.addEventListener('click', () => editEpisodeMeta());
  document.getElementById('mgr-delete-episode')?.addEventListener('click', async () => {
    if (!await hudConfirm({ title: 'Delete Confirmation', message: 'Delete this episode? Related data will also be removed.', confirmText: 'Delete' })) return;
    try {
      await request(`/api/library/episodes/${ep.id}`, { method: 'DELETE' });
      await loadLibrary();
      showSystemDashboard();
      elements.downloadStatus.innerHTML = '<div class="status-item success">Episode deleted</div>';
    } catch (error) {
      elements.downloadStatus.innerHTML = `<div class="status-item warn">Delete failed: ${escapeHtml(String(error.message || error))}</div>`;
    }
  });
  document.getElementById('mgr-bulk-rename')?.addEventListener('click', () => bulkRenameSpeaker());
}

async function editSpeaker(lineIndex) {
  if (!state.currentEpisode) return;
  const line = state.currentEpisode.lines.find(l => l.line_index === lineIndex);
  if (!line) return;
  const current = line.speaker || '';
  const name = await hudPrompt({ title: 'Edit Speaker', label: 'New speaker name (blank = NARRATION)', defaultValue: current });
  if (name === null) return;
  const newSpeaker = name.trim() || null;
  try {
    await request(`/api/library/episodes/${state.currentEpisode.id}/lines/bulk`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ line_index: lineIndex, speaker: newSpeaker }] }),
    });
    await selectEpisode(state.currentEpisode.id);
    elements.downloadStatus.innerHTML = '<div class="status-item success">Speaker name updated</div>';
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">Update failed: ${escapeHtml(String(error.message || error))}</div>`;
  }
}

async function editEpisodeMeta() {
  if (!state.currentEpisode) return;
  const ep = state.currentEpisode;
  const showName = await hudPrompt({ title: 'Edit Episode Info', label: 'Show Name', defaultValue: ep.show_name || '' });
  if (showName === null) return;
  const seasonNum = await hudPrompt({ title: 'Edit Episode Info', label: 'Season Number', defaultValue: String(ep.season_number || 0) });
  if (seasonNum === null) return;
  const episodeCode = await hudPrompt({ title: 'Edit Episode Info', label: 'Episode Code (e.g. S01E01, optional)', defaultValue: ep.episode_code || '' });
  if (episodeCode === null) return;
  const title = await hudPrompt({ title: 'Edit Episode Info', label: 'Title', defaultValue: ep.title || '' });
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
    elements.downloadStatus.innerHTML = '<div class="status-item success">Episode info updated</div>';
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">Update failed: ${escapeHtml(String(error.message || error))}</div>`;
  }
}

async function bulkRenameSpeaker() {
  if (!state.currentEpisode) return;
  const oldName = await hudPrompt({ title: 'Bulk Rename Speakers', label: 'Old speaker name (or NARRATION)', defaultValue: 'NARRATION' });
  if (oldName === null) return;
  const newName = await hudPrompt({ title: 'Bulk Rename Speakers', label: 'New speaker name', defaultValue: '' });
  if (newName === null || !newName.trim()) return;

  const updates = state.currentEpisode.lines
    .filter(line => (line.speaker || 'NARRATION') === oldName.trim())
    .map(line => ({ line_index: line.line_index, speaker: newName.trim() }));

  if (!updates.length) {
    elements.downloadStatus.innerHTML = '<div class="status-item warn">No matching speakers found</div>';
    return;
  }

  try {
    await request(`/api/library/episodes/${state.currentEpisode.id}/lines/bulk`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    await selectEpisode(state.currentEpisode.id);
    elements.downloadStatus.innerHTML = `<div class="status-item success">Updated ${updates.length} speaker names</div>`;
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">Update failed: ${escapeHtml(String(error.message || error))}</div>`;
  }
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
  renderAlphaNav();
  renderLibrary();
}

async function rebuildLibrary() {
  elements.rebuildLibrary.disabled = true;
  try {
    const result = await request('/api/library/rebuild', { method: 'POST' });
    await loadLibrary();
    elements.downloadStatus.innerHTML = `<div class="status-item success">Index rebuilt: ${result.files} files / ${result.episodes} eps</div>`;
  } finally {
    elements.rebuildLibrary.disabled = false;
  }
}

async function loadImportsList() {
  try {
    const files = await request('/api/imports/files');
    if (!files.length) {
      elements.importsList.innerHTML = '<div class="status-item">No manual imports</div>';
      return;
    }
    elements.importsList.innerHTML = files.map(f => {
      const size = f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
      const date = new Date(f.modified_at * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<div class="status-item" data-import-name="${escapeHtml(f.name)}">
        <div class="job-head"><strong>${escapeHtml(f.name)}</strong><span class="muted">${size}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
          <small class="muted">${date}</small>
          <button class="tiny-btn" data-delete-import="${escapeHtml(f.name)}">Delete</button>
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('[data-delete-import]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await hudConfirm({ title: 'Delete Confirmation', message: `Delete import file "${btn.dataset.deleteImport}" and its associated episodes?`, confirmText: 'Delete' })) return;
        try {
          await request(`/api/imports/files/${encodeURIComponent(btn.dataset.deleteImport)}`, { method: 'DELETE' });
          await loadImportsList();
          await loadLibrary();
          elements.downloadStatus.innerHTML = '<div class="status-item success">File deleted</div>';
        } catch (error) {
          elements.downloadStatus.innerHTML = `<div class="status-item warn">Delete failed: ${escapeHtml(String(error.message || error))}</div>`;
        }
      });
    });
  } catch {
    elements.importsList.innerHTML = '';
  }
}

async function uploadFiles(files) {
  if (!files.length) return;
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  const result = await request('/api/imports/files', { method: 'POST', body: formData });
  await loadLibrary();
  await loadImportsList();
  elements.downloadStatus.innerHTML = `
    <div class="status-item success">Imported ${result.imported_files} files, added ${result.imported_episodes} eps</div>
    ${result.skipped_files.map(item => `<div class="status-item warn">Skipped: ${item}</div>`).join('')}
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
    elements.downloadStatus.innerHTML = '<div class="status-item">No download tasks</div>';
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
      ${job.current_item && job.current_item !== job.progress_text ? `<div class="job-current">Current: ${escapeHtml(job.current_item)}</div>` : ''}
      ${job.status === 'failed' && job.error_line ? `<div class="job-error">Error: ${escapeHtml(job.error_line)}</div>` : ''}
      ${job.last_log_line ? `<small class="job-log">Log: ${escapeHtml(job.last_log_line)}</small>` : ''}
      ${job.status === 'running' ? `<button class="tiny-btn job-cancel-btn" data-cancel-job="${job.job_id}">Stop</button>` : ''}
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
          `<div class="status-item warn">Stop failed: ${escapeHtml(String(error.message || error))}</div>`,
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
    elements.catalogStatus.textContent = `Refresh failed: ${error.message || error}`;
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
        : `Catalog: ${st.total_entries} shows${st.updated_at ? ' (' + st.updated_at.slice(0, 16).replace('T', ' ') + ')' : ''}`;
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
    elements.catalogResults.innerHTML = '<div class="empty-state" style="min-height:40px">No matching shows found</div>';
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
        elements.downloadStatus.innerHTML = `<div class="status-item success">Download started: ${escapeHtml(group.name)} (${escapeHtml(source.site_label)})</div>`;
      } catch (error) {
        elements.downloadStatus.innerHTML = `<div class="status-item warn">Download failed: ${escapeHtml(String(error.message || error))}</div>`;
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
        ? `Catalog: ${st.total_entries} shows${st.updated_at ? ' (' + st.updated_at.slice(0, 16).replace('T', ' ') + ')' : ''}`
        : 'Catalog not refreshed yet';
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
    elements.downloadStatus.innerHTML = `<div class="status-item success">Download started (${escapeHtml(params.target)})</div>`;
  } catch (error) {
    elements.downloadStatus.innerHTML = `<div class="status-item warn">Download failed: ${escapeHtml(String(error.message || error))}</div>`;
  }
}

// ── Ollama / AI helpers ─────────────────────────────────────────────────

async function startDownloadWithCheck(showName, params) {
  // Check if show already exists in library before downloading
  if (showName && showExists(showName)) {
    const shouldContinue = confirm(`"${escapeHtml(showName)}"  already in library. Continue downloading?`);
    if (!shouldContinue) {
      elements.downloadStatus.innerHTML = `<div class="status-item">Cancelled: ${escapeHtml(showName)}</div>`;
      return false;
    }
  }
  return true;
}

// ── Settings helpers ──────────────────────────────────────────────────────

function setBadge(el, configured) {
  if (!el) return;
  el.textContent = configured ? 'Configured' : 'Not configured';
  el.className = 'settings-badge ' + (configured ? 'configured' : 'not-configured');
}

async function loadSettings() {
  try {
    const data = await request('/api/settings');
    if (elements.sAiProvider) elements.sAiProvider.value = data.ai_provider || '';
    if (elements.sAiBaseUrl) elements.sAiBaseUrl.value = data.ai_base_url || '';
    if (elements.sAiApiKey) elements.sAiApiKey.value = '';
    if (elements.sAiModel) {
      elements.sAiModel.innerHTML = data.ai_model
        ? `<option value="${escapeHtml(data.ai_model)}">${escapeHtml(data.ai_model)}</option>`
        : '<option value="">Click ⟳ to detect models</option>';
      elements.sAiModel.value = data.ai_model || '';
    }
    // Update state
    state.aiProvider = data.ai_provider || '';
    state.aiBaseUrl = data.ai_base_url || '';
    state.aiModel = data.ai_model || '';
    state.aiConfigured = !!data.ai_configured;
  } catch {
    // silent fail — settings modal will still open
  }
}

async function saveSettings() {
  const patch = {};
  const provider = elements.sAiProvider?.value.trim();
  const baseUrl = elements.sAiBaseUrl?.value.trim();
  const apiKey = elements.sAiApiKey?.value.trim();
  const model = elements.sAiModel?.value.trim();

  if (provider !== undefined) patch.ai_provider = provider;
  if (baseUrl !== undefined) patch.ai_base_url = baseUrl;
  if (apiKey) patch.ai_api_key = apiKey;
  if (model !== undefined) patch.ai_model = model;

  if (!Object.keys(patch).length) {
    elements.sSaveMsg.textContent = 'No changes to save';
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
    elements.sSaveMsg.textContent = '✓ Saved';
    await loadSettings();
    await loadAiStatus();
  } catch {
    elements.sSaveMsg.textContent = '✗ Save failed';
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

function wireEvents() {
  // ── HUD Modal global close event ──
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
      const shouldContinue = confirm(`"${escapeHtml(showName)}"  already in library. Continue downloading?`);
      if (!shouldContinue) {
        elements.downloadStatus.innerHTML = `<div class="status-item">Cancelled: ${escapeHtml(showName)}</div>`;
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
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', toggleTheme);
  }
  // ── Settings modal ──
  elements.openSettings.addEventListener('click', async () => {
    await loadSettings();
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
  if (elements.sAiRefresh) {
    elements.sAiRefresh.addEventListener('click', async () => {
      await detectAiModels();
    });
  }
  if (elements.sAiModel) {
    elements.sAiModel.addEventListener('change', () => {
      state.aiModel = elements.sAiModel.value;
    });
  }
  elements.sSave.addEventListener('click', saveSettings);
  if (elements.backToDashboard) {
    elements.backToDashboard.addEventListener('click', showSystemDashboard);
  }
  if (elements.guestVisibilitySave) {
    elements.guestVisibilitySave.addEventListener('click', saveGuestVisibility);
  }
}

async function bootstrap() {
  // Front-end guard: verify admin token exists; otherwise redirect to login
  if (!document.cookie.includes('sr_token=')) {
    window.location.href = '/login';
    return;
  }
  loadTheme();
  wireEvents();
  loadAppVersion();
  await loadCatalogStatus();
  await loadLibrary();
  await loadCollections();
  await loadDownloadJobs();
  await loadImportsList();
  renderLibraryStats();
  await loadGuestVisibility();
  window.setInterval(async () => {
    await loadDownloadJobs();
    if (state.selectedEpisodeId === null) {
      renderLibraryStats();
    }
  }, 2500);
}

async function loadGuestVisibility() {
  if (!elements.guestVisibilityList) return;
  try {
    const shows = await request('/api/guest-visible-shows');
    if (!shows.length) {
      elements.guestVisibilityList.innerHTML = '<div class="empty-state">No shows in library</div>';
      return;
    }
    elements.guestVisibilityList.innerHTML = shows.map(item => `
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px;">
        <input type="checkbox" class="gv-checkbox" value="${escapeAttr(item.name)}" ${item.visible ? 'checked' : ''}>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.name)}</span>
      </label>
    `).join('');
  } catch (error) {
    elements.guestVisibilityList.innerHTML = `<div class="status-item warn">Load failed: ${escapeHtml(String(error.message || error))}</div>`;
  }
}

async function saveGuestVisibility() {
  if (!elements.guestVisibilityList) return;
  const checkboxes = elements.guestVisibilityList.querySelectorAll('.gv-checkbox');
  const showNames = [...checkboxes].filter(cb => cb.checked).map(cb => cb.value);
  elements.guestVisibilitySave.disabled = true;
  try {
    await request('/api/guest-visible-shows', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_names: showNames }),
    });
    if (elements.guestVisibilityMsg) {
      elements.guestVisibilityMsg.textContent = '✓ Saved';
      setTimeout(() => { if (elements.guestVisibilityMsg) elements.guestVisibilityMsg.textContent = ''; }, 2000);
    }
  } catch (error) {
    if (elements.guestVisibilityMsg) {
      elements.guestVisibilityMsg.textContent = `✗ Save failed: ${escapeHtml(String(error.message || error))}`;
      setTimeout(() => { if (elements.guestVisibilityMsg) elements.guestVisibilityMsg.textContent = ''; }, 3000);
    }
  } finally {
    elements.guestVisibilitySave.disabled = false;
  }
}

bootstrap().catch(error => {
  console.error('Initialization failed:', error);
});
