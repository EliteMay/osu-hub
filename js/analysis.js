(() => {
  const W = window.OsuWorkspace;
  document.addEventListener('DOMContentLoaded', async () => {
    const {DB,$,n,esc,stddev,fmtDateTime,delta,periodRows,snapshot,ensureSessions,compareRecent,difficultyGroups,difficultyInsight,sessionInsight} = W;
    try {
      const all=await DB.getAll('results'), sessions=await ensureSessions(all), period=$('#analysisPeriod');
      function practiceUrl(group, periodValue) {
        const p=new URLSearchParams({from:'analysis',type:'difficulty',period:periodValue,theme:`${group.label}の安定化`,issue:`${group.label}でAccuracy / Missが崩れやすい`,goal:'同難易度帯で成績を安定させる',action:'精度優先で同難易度帯を複数プレイし、Miss原因を記録する'});
        return `./practice.html?${p}`;
      }
      function render(){
        const rows=periodRows(all,period.value), snap=snapshot(rows), comp=compareRecent(rows), groups=difficultyGroups(rows), insight=difficultyInsight(groups);
        const targetSessions=sessions.filter(x=>period.value==='all'||new Date(x.startAt).getTime()>=Date.now()-Number(period.value)*86400000);
        $('#analysisResultCount').textContent=rows.length; $('#analysisAvgAcc').textContent=snap.averageAccuracy==null?'--':`${snap.averageAccuracy.toFixed(2)}%`; $('#analysisAvgMiss').textContent=snap.averageMiss==null?'--':snap.averageMiss.toFixed(2); $('#analysisSessionCount').textContent=targetSessions.length;
        $('#analysisInsufficient').classList.toggle('hidden',rows.length>=5);
        $('#growthAnalysis').innerHTML=comp?`<div class="insight-grid"><article class="insight-item"><span>ACC</span><strong>${delta(comp.acc,'pt')}</strong><small>最近 vs その前</small></article><article class="insight-item"><span>Miss</span><strong>${delta(comp.miss)}</strong><small>1play平均</small></article><article class="insight-item"><span>PP</span><strong>${comp.pp==null?'--':delta(comp.pp,'pp')}</strong><small>PP取得分</small></article></div>`:'<div class="list-empty">成長比較には6件以上必要です。</div>';
        $('#difficultyAnalysis').innerHTML=groups.length?`<div class="analysis-note">${esc(insight.text)}${insight.challenge?` <a class="inline-link" href="${practiceUrl(insight.challenge,period.value)}">この傾向からPracticeを作る →</a>`:''}</div><div class="analysis-table">${groups.map(g=>`<div class="analysis-row"><strong>${g.label}</strong><span>${g.resultCount} plays</span><span>${g.averageAccuracy==null?'--':`${g.averageAccuracy.toFixed(2)}%`}</span><span>${g.averageMiss==null?'--':`${g.averageMiss.toFixed(2)} miss`}</span></div>`).join('')}</div>`:'<div class="list-empty">Star Rating付きResultがありません。</div>';
        const acc=rows.map(r=>n(r.accuracy,NaN)).filter(Number.isFinite), miss=rows.map(r=>n(r.miss,NaN)).filter(Number.isFinite), accStd=stddev(acc), missStd=stddev(miss);
        $('#stabilityAnalysis').innerHTML=accStd==null?'<div class="list-empty">安定性には2件以上必要です。</div>':`<div class="insight-grid"><article class="insight-item"><span>ACC stddev</span><strong>${accStd.toFixed(2)}</strong><small>小さいほど安定</small></article><article class="insight-item"><span>Miss stddev</span><strong>${missStd?.toFixed(2)??'--'}</strong><small>ばらつき</small></article><article class="insight-item"><span>ACC Range</span><strong>${Math.min(...acc).toFixed(1)}–${Math.max(...acc).toFixed(1)}%</strong><small>期間内</small></article></div>`;
        $('#sessionAnalysis').innerHTML=targetSessions.length?`<div class="analysis-note">${esc(sessionInsight(targetSessions))}</div><div class="analysis-table">${targetSessions.slice(-8).reverse().map(x=>{const ad=x.secondHalf?.averageAccuracy==null||x.firstHalf?.averageAccuracy==null?null:x.secondHalf.averageAccuracy-x.firstHalf.averageAccuracy;const md=x.secondHalf?.averageMiss==null||x.firstHalf?.averageMiss==null?null:x.secondHalf.averageMiss-x.firstHalf.averageMiss;return `<div class="analysis-row"><strong>${fmtDateTime(x.startAt)}</strong><span>${x.playCount} plays</span><span>ACC ${ad==null?'--':delta(ad,'pt')}</span><span>Miss ${md==null?'--':delta(md)}</span></div>`;}).join('')}</div>`:'<div class="list-empty">Sessionを作れるResultがありません。</div>';
      }
      period.onchange=render; render();
    } catch (error) { W.toast(`Analysis初期化エラー: ${error.message||error}`, true); }
  });
})();
