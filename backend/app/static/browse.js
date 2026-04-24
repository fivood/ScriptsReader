const state = {
  library: [],
  selectedEpisodeId: null,
  currentEpisode: null,
};

const elements = {
  libraryTree: document.getElementById('library-tree'),
  libraryCount: document.getElementById('library-count'),
  appVersion: document.getElementById('app-version'),
  episodeTitle: document.getElementById('episode-title'),
  episodeMeta: document.getElementById('episode-meta'),
  lineCount: document.getElementById('line-count'),
  dialogueList: document.getElementById('dialogue-list'),
  guestExit: document.getElementById('guest-exit'),
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'same-origin' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

function getShowFirstLetter(name) {
  const first = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

function renderLibrary() {
  const totalEpisodes = state.library.reduce(
    (sum, show) => sum + show.seasons.reduce((acc, season) => acc + season.episodes.length, 0),
    0
  );
  elements.libraryCount.textContent = `${state.library.length} shows / ${totalEpisodes} eps`;

  if (!state.library.length) {
    elements.libraryTree.innerHTML = '<div class="empty-state">No scripts yet</div>';
    return;
  }

  elements.libraryTree.innerHTML = state.library.map(show => `
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

async function selectEpisode(episodeId) {
  state.selectedEpisodeId = episodeId;
  state.currentEpisode = await request(`/api/library/episodes/${episodeId}`);
  renderLibrary();
  elements.episodeTitle.textContent = `${state.currentEpisode.episode_code || ''} ${state.currentEpisode.title}`.trim();
  elements.episodeMeta.textContent = `${state.currentEpisode.show_name} · Season ${String(state.currentEpisode.season_number).padStart(2, '0')} · ${state.currentEpisode.source_path}`;
  renderDialogue();

  const sidebarEl = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebarEl) sidebarEl.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function renderDialogue() {
  const lines = state.currentEpisode?.lines || [];
  elements.lineCount.textContent = `${lines.length} lines`;

  if (!lines.length) {
    elements.dialogueList.className = 'dialogue-list empty-state';
    elements.dialogueList.textContent = 'No dialogue in this episode.';
    return;
  }

  elements.dialogueList.className = 'dialogue-list';
  elements.dialogueList.innerHTML = lines.map(line => {
    if (line.is_direction) {
      return `
        <article class="direction-card">
          <div class="direction-badge">SCENE / ACTION</div>
          <p>${line.text}</p>
        </article>
      `;
    }
    const speaker = line.speaker || 'NARRATION';
    return `
      <article class="dialogue-line" data-line-index="${line.line_index}">
        <div class="speaker-tag ${speakerColor(speaker)}">
          <span class="speaker-name">${speaker}</span>
        </div>
        <div class="line-body">
          <p>${escapeHtml(line.text)}</p>
        </div>
      </article>
    `;
  }).join('');
}

async function loadLibrary() {
  state.library = await request('/api/library/guest-shows');
  renderLibrary();
}

function exitGuestMode() {
  localStorage.removeItem('scriptsreader-guest');
  document.cookie = 'sr_guest=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  window.location.href = '/login';
}

function wireEvents() {
  if (elements.guestExit) {
    elements.guestExit.addEventListener('click', exitGuestMode);
  }

  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebarEl = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (menuBtn && sidebarEl && overlay) {
    const openSidebar = () => { sidebarEl.classList.add('open'); overlay.classList.add('open'); };
    const closeSidebar = () => { sidebarEl.classList.remove('open'); overlay.classList.remove('open'); };
    menuBtn.addEventListener('click', () => sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar());
    overlay.addEventListener('click', closeSidebar);
  }
}

async function bootstrap() {
  if (!document.cookie.includes('sr_guest=1')) {
    window.location.href = '/guest-login';
    return;
  }
  loadAppVersion();
  wireEvents();
  await loadLibrary();
}

bootstrap().catch(error => {
  elements.dialogueList.className = 'dialogue-list empty-state';
  elements.dialogueList.textContent = `Initialization failed: ${error.message || error}`;
});
