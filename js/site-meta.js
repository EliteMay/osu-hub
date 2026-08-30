(() => {
  function siteJsonPath() {
    return location.pathname.includes('/pages/') ? '../data/site.json' : './data/site.json';
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

      const workerReady = Boolean(String(site?.osuApi?.workerUrl || '').trim());
      document.querySelectorAll('[data-account-sync-badge]').forEach((el) => {
        el.textContent = workerReady ? 'READY' : 'SETUP REQUIRED';
      });
      document.querySelectorAll('[data-account-sync-cta]').forEach((el) => {
        el.textContent = workerReady ? '同期する →' : '設定する →';
      });
    } catch (error) {
      console.warn('site metadata could not be loaded:', error);
      document.querySelectorAll('[data-site-version]').forEach((el) => {
        if (!el.textContent.trim()) el.textContent = 'version unavailable';
      });
    }
  }

  loadSiteMeta();
})();
