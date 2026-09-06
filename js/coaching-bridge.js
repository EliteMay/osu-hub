(() => {
  const DB = window.OsuDB;
  const host = document.getElementById('coachPracticeSuggestions');
  if (!DB || !host) return;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function practiceHref(item, analysis) {
    const params = new URLSearchParams({
      from: 'analysis',
      type: 'coaching',
      period: 'ai',
      theme: String(item.title || 'AI Coaching Practice').slice(0, 200),
      issue: String(item.reason || analysis.summary || '').slice(0, 1200),
      goal: String((analysis.nextGoals || [])[0] || '').slice(0, 1200),
      action: String(item.title || '').slice(0, 1600),
    });
    return `./practice.html?${params.toString()}`;
  }

  async function render() {
    try {
      const rows = (await DB.getAll('coaching'))
        .filter((row) => row?.analysis && Array.isArray(row.analysis.recommendedPractice))
        .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
      const latest = rows[0];
      const items = latest?.analysis?.recommendedPractice || [];
      if (!items.length) {
        host.className = 'list-empty';
        host.textContent = 'Practiceへ反映できるAI提案はまだありません。分析JSONを取り込むとここに表示されます。';
        return;
      }
      host.className = 'data-list';
      host.innerHTML = items.map((item) => `
        <div class="practice-card">
          <span>${Number(item.minutes) || 15}分</span>
          <div><strong>${esc(item.title || 'Practice')}</strong><small>${esc(item.reason || '')}</small></div>
          <a class="button small ghost" href="${esc(practiceHref(item, latest.analysis))}">Practiceで確認</a>
        </div>
      `).join('');
    } catch (error) {
      host.className = 'notice';
      host.textContent = `AI提案を読み込めませんでした: ${error.message || error}`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    const importButton = document.getElementById('importAnalysis');
    if (importButton) importButton.addEventListener('click', () => setTimeout(render, 250));
  });
})();
