(() => {
  const W = window.OsuWorkspace;
  document.addEventListener('DOMContentLoaded', async () => {
    const {DB,$,$$,uid,n,esc,dateOf,today,fmtDate,delta,snapshot,snapshotLine,valid,toast} = W;
    try {
      const form=$('#practiceForm'), host=$('#practiceList'), id=$('#practiceId');
      let rows=[], pending=null, results=await DB.getAll('results');
      const beforeRows=d=>valid(results).filter(r=>dateOf(r).getTime()<=new Date(`${d}T23:59:59`).getTime()).sort((a,b)=>dateOf(a)-dateOf(b)).slice(-20);
      const afterRows=d=>valid(results).filter(r=>dateOf(r).getTime()>=new Date(`${d}T00:00:00`).getTime()).sort((a,b)=>dateOf(a)-dateOf(b)).slice(-30);
      function setForm(r=null){
        id.value=r?.id||''; $('#practiceTheme').value=r?.theme||''; $('#practiceIssue').value=r?.issue||''; $('#practiceGoal').value=r?.goal||''; $('#practiceAction').value=r?.action||'';
        $('#practiceStartDate').value=r?.startDate||today(); $('#practiceDays').value=r?.durationDays||7; $('#practiceMinutes').value=r?.minutes||15;
        $('#practiceSubmit').textContent=r?'変更を保存':'Practiceを作成'; $('#cancelPracticeEdit').classList.toggle('hidden',!r);
      }
      function compareHtml(r){
        if(!r.before&&!r.after)return'';
        const a=r.before||{}, b=r.after||{};
        const ad=a.averageAccuracy==null||b.averageAccuracy==null?null:b.averageAccuracy-a.averageAccuracy;
        const md=a.averageMiss==null||b.averageMiss==null?null:b.averageMiss-a.averageMiss;
        return `<div class="practice-comparison"><div><small>Before</small><div class="snapshot-line">${snapshotLine(a)}</div></div><div><small>After</small><div class="snapshot-line">${snapshotLine(b)}</div></div><div class="comparison-delta">ACC ${ad==null?'--':delta(ad,'pt')} / Miss ${md==null?'--':delta(md)}</div></div>`;
      }
      async function render(){
        rows=(await DB.getAll('practice')).map(DB.normalizePracticeRecord).sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
        $('#practiceCount').textContent=rows.length; $('#practiceActive').textContent=rows.filter(r=>r.status==='active').length; $('#practiceCompleted').textContent=rows.filter(r=>r.status==='completed').length;
        host.className=rows.length?'practice-board':'list-empty';
        host.innerHTML=rows.length?rows.map(r=>`<article class="practice-cycle ${r.status}"><div class="practice-cycle-head"><div><span class="status-chip ${r.status}">${r.status}</span><h3>${esc(r.theme)}</h3><small>${fmtDate(r.startDate)} · ${r.durationDays}日 · ${r.minutes}分目安</small></div><div class="compact-actions">${r.status==='planned'?`<button class="button small primary" data-start="${encodeURIComponent(r.id)}">開始</button>`:''}${r.status!=='completed'?`<button class="button small ghost" data-complete="${encodeURIComponent(r.id)}">完了・振り返り</button>`:''}<button class="button small ghost" data-edit="${encodeURIComponent(r.id)}">編集</button><button class="button small danger" data-del="${encodeURIComponent(r.id)}">削除</button></div></div><div class="practice-detail-grid"><div><span>苦手 / 原因</span><p>${esc(r.issue||'未記入')}</p></div><div><span>目標</span><p>${esc(r.goal||'未記入')}</p></div><div><span>やること</span><p>${esc(r.action||'未記入')}</p></div></div>${r.linkedAnalysis?`<div class="analysis-link-note">Analysis連携: ${esc(r.linkedAnalysis.type||'analysis')} / ${esc(r.linkedAnalysis.period||'all')}</div>`:''}${compareHtml(r)}${r.review?`<div class="practice-review"><strong>振り返り</strong><p>${esc(r.review)}</p></div>`:''}</article>`).join(''):'Practiceはまだありません。Analysisから作るか、フォームで追加できます。';
        $$('[data-start]',host).forEach(b=>b.onclick=async()=>{const r=rows.find(x=>x.id===decodeURIComponent(b.dataset.start));if(!r)return;await DB.put('practice',{...r,status:'active',done:false,updatedAt:new Date().toISOString()});toast('Practiceを開始しました。');await render();});
        $$('[data-edit]',host).forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.id===decodeURIComponent(b.dataset.edit));if(r){setForm(r);form.scrollIntoView({behavior:'smooth',block:'start'});}});
        $$('[data-del]',host).forEach(b=>b.onclick=async()=>{const key=decodeURIComponent(b.dataset.del);if(confirm('このPracticeを削除しますか？')){await DB.remove('practice',key);toast('Practiceを削除しました。');await render();}});
        $$('[data-complete]',host).forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.id===decodeURIComponent(b.dataset.complete));if(!r)return;$('#completePracticeId').value=r.id;$('#practiceReviewText').value=r.review||'';$('#completePracticeSummary').innerHTML=`<strong>現在のAfter候補</strong><div class="snapshot-line">${snapshotLine(snapshot(afterRows(r.startDate),'After'))}</div><small>開始日以降の直近最大30件を使用します。</small>`;const d=$('#practiceReviewDialog');d.showModal?d.showModal():d.setAttribute('open','');});
      }
      form.onsubmit=async e=>{
        e.preventDefault(); const fd=new FormData(form), old=rows.find(r=>r.id===id.value), start=String(fd.get('startDate')||today());
        const row=DB.normalizePracticeRecord({...old,id:old?.id||uid(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),status:old?.status||'planned',theme:String(fd.get('theme')||'').trim(),issue:String(fd.get('issue')||'').trim(),goal:String(fd.get('goal')||'').trim(),action:String(fd.get('action')||'').trim(),startDate:start,durationDays:Math.max(1,n(fd.get('durationDays'),7)),minutes:Math.max(1,n(fd.get('minutes'),15)),linkedAnalysis:old?.linkedAnalysis||pending||null,before:old?.before||snapshot(beforeRows(start),'Before')});
        if(!row.theme||!row.action)return toast('練習テーマと「やること」を入力してください。',true);
        try{await DB.put('practice',row);if(!old)pending=null;toast(old?'Practiceを更新しました。':'Practiceを作成しました。');form.reset();setForm();await render();}catch(err){toast(err.message||'保存に失敗しました。',true);}
      };
      $('#cancelPracticeEdit').onclick=()=>{form.reset();setForm();};
      $('#cancelPracticeReview').onclick=()=>{const d=$('#practiceReviewDialog');d.close?d.close():d.removeAttribute('open');};
      $('#savePracticeReview').onclick=async()=>{const r=rows.find(x=>x.id===$('#completePracticeId').value);if(!r)return;await DB.put('practice',{...r,status:'completed',done:true,completedAt:new Date().toISOString(),after:snapshot(afterRows(r.startDate),'After'),review:$('#practiceReviewText').value.trim(),updatedAt:new Date().toISOString()});const d=$('#practiceReviewDialog');d.close?d.close():d.removeAttribute('open');toast('Before / Afterと振り返りを保存しました。');await render();};
      const q=new URLSearchParams(location.search); setForm();
      if(q.get('from')==='analysis'){
        $('#practiceTheme').value=q.get('theme')||''; $('#practiceIssue').value=q.get('issue')||''; $('#practiceGoal').value=q.get('goal')||''; $('#practiceAction').value=q.get('action')||'';
        pending={type:q.get('type')||'analysis',period:q.get('period')||'all',createdAt:new Date().toISOString()}; $('#analysisPrefillNotice').classList.remove('hidden');
      }
      await render();
    } catch (error) { W.toast(`Practice初期化エラー: ${error.message||error}`, true); }
  });
})();
