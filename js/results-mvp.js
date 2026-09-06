(() => {
  const W = window.OsuWorkspace;
  document.addEventListener('DOMContentLoaded', async () => {
    const {DB,$,$$,uid,n,esc,dateOf,today,fmtDateTime,snapshot,toast} = W;
    try {
      const form=$('#resultForm'), list=$('#resultList'), search=$('#resultSearch'), source=$('#resultSourceFilter'), sort=$('#resultSort'), minS=$('#resultMinStars'), maxS=$('#resultMaxStars'), more=$('#resultLoadMore');
      let all=[], shown=50, detail=null;
      function filtered() {
        const q=search.value.trim().toLowerCase(), min=n(minS.value,NaN), max=n(maxS.value,NaN);
        let rows=all.filter(r=>{
          const kinds=Array.isArray(r.syncKinds)?r.syncKinds:[], type=source.value;
          const sourceOk=type==='all'||(type==='manual'&&r.source==='manual')||(type==='api'&&r.source==='osu-api')||(type==='recent'&&(kinds.includes('recent')||r.lastSyncedFrom==='recent'))||(type==='best'&&(kinds.includes('best')||r.lastSyncedFrom==='best'));
          const text=[r.mapName,r.artist,r.title,r.difficulty,r.mapper,r.mods,r.note].join(' ').toLowerCase(), stars=n(r.stars,NaN);
          return sourceOk && (!q||text.includes(q)) && (!Number.isFinite(min)||stars>=min) && (!Number.isFinite(max)||stars<=max);
        });
        const key=sort.value;
        rows.sort((a,b)=> key==='date-asc'?dateOf(a)-dateOf(b):key==='acc-desc'?n(b.accuracy)-n(a.accuracy):key==='miss-asc'?n(a.miss)-n(b.miss):key==='pp-desc'?n(b.pp)-n(a.pp):key==='stars-desc'?n(b.stars)-n(a.stars):dateOf(b)-dateOf(a));
        return rows;
      }
      function open(row) {
        if (!row) return;
        detail=row;
        $('#resultDetailTitle').textContent=row.mapName||'Result Detail';
        $('#resultDetailMeta').textContent=`${fmtDateTime(row.playedAt||row.date||row.createdAt)} · ${row.source==='osu-api'?'osu! API':'Manual'} · ${row.mods||'NM'}`;
        $('#resultDetailStats').innerHTML=[['ACC',`${n(row.accuracy).toFixed(2)}%`],['Miss',n(row.miss)],['Combo',n(row.combo)||'--'],['PP',n(row.pp)?`${n(row.pp).toFixed(1)}pp`:'--'],['★',n(row.stars)?n(row.stars).toFixed(2):'--'],['BPM',n(row.bpm)||'--'],['Rank',row.rank||'--'],['Score',n(row.totalScore)||'--']].map(([a,b])=>`<div><span>${a}</span><strong>${esc(b)}</strong></div>`).join('');
        $('#resultMemo').value=row.note||'';
        const link=$('#resultBeatmapLink');
        if(row.beatmapUrl){link.href=row.beatmapUrl;link.classList.remove('hidden');}else link.classList.add('hidden');
        const dialog=$('#resultDetailDialog'); dialog.showModal?dialog.showModal():dialog.setAttribute('open','');
      }
      function render() {
        const rows=filtered(), snap=snapshot(rows), visible=rows.slice(0,shown);
        $('#resultCount').textContent=all.length; $('#resultShownCount').textContent=rows.length;
        $('#resultAvgAcc').textContent=snap.averageAccuracy==null?'--':`${snap.averageAccuracy.toFixed(2)}%`;
        $('#resultTotalMiss').textContent=rows.reduce((sum,r)=>sum+n(r.miss),0);
        list.className=visible.length?'data-list':'list-empty';
        list.innerHTML=visible.length?visible.map(r=>`<button class="data-row result-row" type="button" data-result-id="${encodeURIComponent(r.id)}"><div class="result-main"><div class="primary-text">${esc(r.mapName||'名称未設定')}</div><small>${fmtDateTime(r.playedAt||r.date||r.createdAt)} · ${esc(r.mods||'NM')} · ${r.source==='osu-api'?'API':'Manual'}${r.note?' · memo':''}</small></div><div class="stat">${n(r.accuracy).toFixed(2)}%</div><div class="stat">${n(r.miss)} miss</div><div class="stat">${n(r.pp)?`${n(r.pp).toFixed(1)}pp`:'--'}</div><div class="stat">${n(r.stars)?`${n(r.stars).toFixed(2)}★`:'--'}</div><span>詳細</span></button>`).join(''):'条件に一致するResultがありません。';
        more.classList.toggle('hidden',rows.length<=shown);
        $$('[data-result-id]',list).forEach(b=>b.onclick=()=>open(all.find(r=>r.id===decodeURIComponent(b.dataset.resultId))));
      }
      async function reload(){all=await DB.getAll('results');render();}
      [search,source,sort,minS,maxS].forEach(el=>el.addEventListener(el===search?'input':'change',()=>{shown=50;render();}));
      $('#clearResultFilters').onclick=()=>{search.value='';source.value='all';sort.value='date-desc';minS.value='';maxS.value='';shown=50;render();};
      more.onclick=()=>{shown+=50;render();};
      form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const row={id:uid(),source:'manual',createdAt:new Date().toISOString(),date:fd.get('date')||today(),mapName:String(fd.get('mapName')||'').trim(),accuracy:n(fd.get('accuracy')),miss:n(fd.get('miss')),combo:n(fd.get('combo')),pp:n(fd.get('pp')),stars:n(fd.get('stars')),bpm:n(fd.get('bpm')),mods:String(fd.get('mods')||'NM').trim().toUpperCase(),note:String(fd.get('note')||'').trim()};if(!row.mapName)return toast('譜面名を入力してください。',true);try{await DB.put('results',row);form.reset();$('#resultDate').value=today();toast('Resultを保存しました。');await reload();}catch(err){toast(err.message||'保存に失敗しました。',true);}};
      $('#saveResultMemo').onclick=async()=>{if(!detail)return;try{detail=await DB.put('results',{...detail,note:$('#resultMemo').value.trim(),updatedAt:new Date().toISOString()});toast('メモを保存しました。');await reload();}catch(err){toast(err.message||'メモ保存に失敗しました。',true);}};
      $('#deleteResult').onclick=async()=>{if(!detail||!confirm('このResultを削除しますか？'))return;await DB.remove('results',detail.id);detail=null;$('#resultDetailDialog').close?.();toast('Resultを削除しました。');await reload();};
      $('#closeResultDetail').onclick=()=>$('#resultDetailDialog').close?.();
      $('#resultDate').value=today(); await reload();
      const openId=new URLSearchParams(location.search).get('open'); if(openId) open(all.find(r=>r.id===openId));
    } catch (error) { W.toast(`Results初期化エラー: ${error.message||error}`, true); }
  });
})();
