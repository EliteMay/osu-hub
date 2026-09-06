(() => {
  const W = window.OsuWorkspace;
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const {DB,$,n,esc,dateOf,fmtDate,fmtDateTime,delta,snapshot,ensureSessions,compareRecent,difficultyGroups,difficultyInsight,periodRows,sessionInsight,valid} = W;
      const [results, practice, account] = await Promise.all([DB.getAll('results'), DB.getAll('practice'), DB.get('settings','osuAccount')]);
      const sessions = await ensureSessions(results);
      const practices = practice.map(DB.normalizePracticeRecord);
      const snap = snapshot(results), compare = compareRecent(results);
      const difficulty = difficultyInsight(difficultyGroups(periodRows(results,30)));
      $('#dashboardResultCount').textContent = results.length;
      $('#dashboardAvgAcc').textContent = snap.averageAccuracy==null?'--':`${snap.averageAccuracy.toFixed(2)}%`;
      $('#dashboardActivePractice').textContent = practices.filter(x=>x.status==='active').length;
      $('#dashboardLastSync').textContent = account?.lastSyncAt ? fmtDate(account.lastSyncAt) : '--';
      $('#dashboardSyncStatus').className = account?.lastSyncAt ? 'success' : 'notice';
      $('#dashboardSyncStatus').textContent = account?.lastSyncAt ? `${account.resolvedUsername||account.user||'osu!'} / 最終同期 ${fmtDateTime(account.lastSyncAt)}` : 'Account Syncはまだ実行されていません。保存済みLocal Dataはそのまま利用できます。';
      $('#dashboardChange').className = compare ? '' : 'list-empty';
      $('#dashboardChange').innerHTML = compare ? `<div class="insight-grid"><article class="insight-item"><span>ACC</span><strong>${delta(compare.acc,'pt')}</strong><small>直近${compare.after.resultCount}件 vs その前</small></article><article class="insight-item"><span>Miss</span><strong>${delta(compare.miss)}</strong><small>1play平均</small></article><article class="insight-item"><span>PP</span><strong>${compare.pp==null?'--':delta(compare.pp,'pp')}</strong><small>PP取得分</small></article></div>` : '比較には6件以上のResultが必要です。';
      $('#dashboardTrend').className = '';
      $('#dashboardTrend').innerHTML = `<div class="callout"><strong>難易度</strong><p>${esc(difficulty.text)}</p></div><div class="callout" style="margin-top:10px"><strong>Session</strong><p>${esc(sessionInsight(sessions))}</p></div>`;
      const recentP = practices.sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)).slice(0,4);
      $('#dashboardPractice').className = recentP.length ? 'data-list' : 'list-empty';
      $('#dashboardPractice').innerHTML = recentP.length ? recentP.map(x=>`<div class="practice-card"><span class="status-chip ${x.status}">${x.status}</span><div><strong>${esc(x.theme)}</strong><small>${esc(x.goal||x.action||'')}</small></div><span></span></div>`).join('') : 'Practiceはまだありません。';
      const recent = valid(results).sort((a,b)=>dateOf(b)-dateOf(a)).slice(0,5);
      $('#dashboardRecent').className = recent.length ? 'data-list' : 'list-empty';
      $('#dashboardRecent').innerHTML = recent.length ? recent.map(r=>`<a class="data-row" href="./pages/results.html?open=${encodeURIComponent(r.id)}"><div><div class="primary-text">${esc(r.mapName||'名称未設定')}</div><small>${fmtDate(r.playedAt||r.date||r.createdAt)} · ${esc(r.mods||'NM')}</small></div><div class="stat">${n(r.accuracy).toFixed(2)}%</div><div class="stat">${n(r.miss)} miss</div><div class="stat">${n(r.pp)?`${n(r.pp).toFixed(1)}pp`:'--'}</div><div class="stat">${n(r.stars)?`${n(r.stars).toFixed(2)}★`:'--'}</div><span>→</span></a>`).join('') : 'まだResultがありません。';
    } catch (error) { W.toast(`Dashboard初期化エラー: ${error.message||error}`, true); }
  });
})();
