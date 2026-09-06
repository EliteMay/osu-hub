(() => {
  const isPage = location.pathname.includes('/pages/');

  function siteJsonPath() {
    return isPage ? '../data/site.json' : './data/site.json';
  }

  function workspaceCssPath() {
    return isPage ? '../css/workspace.css' : './css/workspace.css';
  }

  function injectWorkspaceStyles() {
    if (document.querySelector('link[data-workspace-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = workspaceCssPath();
    link.dataset.workspaceStyles = 'true';
    document.head.append(link);
  }

  function renderPrimaryNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const base = isPage ? './' : './pages/';
    const home = isPage ? '../index.html' : './index.html';
    const page = document.body?.dataset.page || '';
    const items = [
      ['home', 'Dashboard', home],
      ['results', 'Results', `${base}results.html`],
      ['stats', 'Analysis', `${base}stats.html`],
      ['practice', 'Practice', `${base}practice.html`],
      ['coaching', 'Coaching', `${base}coaching.html`],
      ['separator'],
      ['tools', 'Tools', `${base}tools.html`],
      ['settings', 'Settings', `${base}settings.html`],
    ];
    nav.innerHTML = items.map((item) => {
      if (item[0] === 'separator') return '<span class="nav-separator" aria-hidden="true"></span>';
      const [key, label, href] = item;
      const active = page === key || (key === 'stats' && page === 'analysis');
      return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
    }).join('');
  }

  async function hasSavedEndpoint() {
    try {
      if (!window.OsuDB) return false;
      const saved = await window.OsuDB.get('settings', 'osuAccount');
      return Boolean(String(saved?.endpointUrl || saved?.workerUrl || '').trim());
    } catch {
      return false;
    }
  }

  async function loadSiteMeta() {
    try {
      const response = await fetch(siteJsonPath(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`site.json ${response.status}`);
      const site = await response.json();
      const version = String(site?.siteVersion || '').trim();
      if (version) {
        document.querySelectorAll('[data-site-version]').forEach((el) => {
          el.textContent = `v${version}`;
        });
        document.documentElement.dataset.siteVersion = version;
      }

      const syncReady = Boolean(String(site?.osuApi?.endpointUrl || site?.osuApi?.workerUrl || '').trim()) || await hasSavedEndpoint();
      document.querySelectorAll('[data-account-sync-badge]').forEach((el) => {
        el.textContent = syncReady ? 'READY' : 'SETUP REQUIRED';
      });
      document.querySelectorAll('[data-account-sync-cta]').forEach((el) => {
        el.textContent = syncReady ? '同期する →' : '設定する →';
      });
    } catch (error) {
      console.warn('site metadata could not be loaded:', error);
      document.querySelectorAll('[data-site-version]').forEach((el) => {
        if (!el.textContent.trim()) el.textContent = 'version unavailable';
      });
    }
  }

  injectWorkspaceStyles();
  renderPrimaryNav();
  loadSiteMeta();
})();
