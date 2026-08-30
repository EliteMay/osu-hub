(() => {
  const DB = window.OsuDB;
  const page = document.body.dataset.page || '';
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const download = (name, content, type = 'application/json') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  function toast(message, error = false) {
    const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message; document.body.append(el);
    setTimeout(() => el.remove(), 2800);
  }
  function fmtDate(value) {
    if (!value) return '--';
    const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('ja-JP');
  }
  function setActiveNav() {
    $$('.nav a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if ((page === 'coaching' && href.includes('coaching')) || (page === 'results' && href.includes('results')) || (page === 'practice' && href.includes('practice')) || (page === 'stats' && href.includes('stats')) || (page === 'settings' && href.includes('settings')) || (page === 'tools' && href.includes('tools'))) a.classList.add('active');
    });
  }

  async function initHome() {
    const [results, coaching, practice] = await Promise.all([DB.getAll('results'), DB.getAll('coaching'), DB.getAll('practice')]);
    $('#homeResultCount').textContent = results.length;
    $('#homeCoachingCount').textContent = coaching.length;
    $('#homePracticeCount').textContent = practice.length;
    const accs = results.map((r) => num(r.accuracy)).filter((v) => v > 0);
    $('#homeAverageAcc').textContent = accs.length ? `${(accs.reduce((a,b)=>a+b,0)/accs.length).toFixed(2)}%` : '--';
    const recent = [...results].sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0,5);
    const host = $('#homeRecentResults');
    if (!recent.length) return;
    host.className = 'data-list';
    host.innerHTML = recent.map((r) => `<div class="data-row"><div><div class="primary-text">${esc(r.mapName || '名称未設定')}</div><small>${fmtDate(r.date || r.createdAt)} · ${esc(r.mods || 'NM')}</small></div><div class="stat">${num(r.accuracy).toFixed(2)}%</div><div class="stat">${num(r.miss)} miss</div><div class="stat">${num(r.pp) ? `${num(r.pp).toFixed(1)}pp` : '--'}</div><div class="stat">${num(r.stars) ? `${num(r.stars).toFixed(2)}★` : '--'}</div><span></span></div>`).join('');
  }

  async function initResults() {
    const form = $('#resultForm');
    const list = $('#resultList');
    const render = async () => {
      const rows = (await DB.getAll('results')).sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
      $('#resultCount').textContent = rows.length;
      const accs = rows.map(r => num(r.accuracy)).filter(v=>v>0);
      $('#resultAvgAcc').textContent = accs.length ? `${(accs.reduce((a,b)=>a+b,0)/accs.length).toFixed(2)}%` : '--';
      $('#resultTotalMiss').textContent = rows.reduce((s,r)=>s+num(r.miss),0);
      if (!rows.length) { list.className='list-empty'; list.textContent='まだリザルトがありません。'; return; }
      list.className='data-list';
      list.innerHTML = rows.map((r) => `<div class="data-row"><div><div class="primary-text">${esc(r.mapName)}</div><small>${fmtDate(r.date)} · ${esc(r.mods || 'NM')} · ${num(r.bpm) || '--'} BPM</small></div><div class="stat">${num(r.accuracy).toFixed(2)}%</div><div class="stat">${num(r.miss)} miss</div><div class="stat">${num(r.pp) ? `${num(r.pp).toFixed(1)}pp` : '--'}</div><div class="stat">${num(r.stars) ? `${num(r.stars).toFixed(2)}★` : '--'}</div><button class="button small danger" data-delete-result="${r.id}">削除</button></div>`).join('');
      $$('[data-delete-result]').forEach(btn => btn.onclick = async () => { if (!confirm('このリザルトを削除しますか？')) return; await DB.remove('results', btn.dataset.deleteResult); render(); });
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const row = { id: uid(), createdAt:new Date().toISOString(), date:fd.get('date') || new Date().toISOString().slice(0,10), mapName:String(fd.get('mapName')||'').trim(), accuracy:num(fd.get('accuracy')), miss:num(fd.get('miss')), combo:num(fd.get('combo')), pp:num(fd.get('pp')), stars:num(fd.get('stars')), bpm:num(fd.get('bpm')), mods:String(fd.get('mods')||'NM').trim().toUpperCase(), note:String(fd.get('note')||'').trim() };
      if (!row.mapName) return toast('譜面名を入力してください。', true);
      await DB.put('results', row); form.reset(); $('#resultDate').value = new Date().toISOString().slice(0,10); toast('リザルトを保存しました。'); render();
    };
    $('#resultDate').value = new Date().toISOString().slice(0,10);
    render();
  }

  let coachingFiles = [];
  function coachingPrompt(meta, files) {
    const imageList = files.map((f,i)=>`${i+1}. ${f.name}`).join('\n');
    return `あなたはosu!のコーチです。添付されたリザルト画像をまとめて分析してください。\n\n【セッション】\nタイトル: ${meta.title}\n日付: ${meta.date}\n練習目的: ${meta.goal || '未記入'}\n本人メモ: ${meta.note || '未記入'}\n\n【画像】\n${imageList}\n\n各画像を独立して見るだけでなく、セッション全体の共通傾向を探してください。Accuracy、Miss、Combo、譜面難易度、BPM、MOD、スコア画面から読み取れる範囲を根拠にし、推測は推測と明記してください。\n\n特に以下を分析してください。\n- 強み\n- 弱み\n- 失敗が増える条件や共通パターン\n- 精度不足、速度不足、Reading、Aim、Stream/Burst、Finger Control、安定性などの可能性\n- 練習の優先順位\n- 次の1週間で試す練習\n- 次回比較する指標\n\n最後は説明文の後ではなく、必ず次のJSON形式だけをコードブロックなしで出力してください。\n{\n  "schemaVersion": 1,\n  "summary": "全体まとめ",\n  "strengths": ["..."],\n  "weaknesses": ["..."],\n  "patterns": ["..."],\n  "recommendedPractice": [{"title":"...","minutes":15,"reason":"..."}],\n  "nextGoals": ["..."],\n  "confidenceNotes": ["画像だけでは断定できない点"]\n}`;
  }
  async function initCoaching() {
    const input = $('#resultImages'), preview = $('#imagePreview'), drop = $('#dropzone'), count = $('#imageCount');
    function renderFiles() {
      count.textContent = coachingFiles.length;
      preview.innerHTML = '';
      coachingFiles.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div'); div.className='preview-item'; div.innerHTML=`<img alt="${esc(file.name)}"><button class="preview-remove" aria-label="削除">×</button><span>${esc(file.name)}</span>`; div.querySelector('img').src=url;
        div.querySelector('img').onload=()=>URL.revokeObjectURL(url);
        div.querySelector('button').onclick=()=>{coachingFiles.splice(i,1);renderFiles();}; preview.append(div);
      });
    }
    function addFiles(files){ [...files].filter(f=>f.type.startsWith('image/')).forEach(f=>{ if(!coachingFiles.some(x=>x.name===f.name&&x.size===f.size)) coachingFiles.push(f); }); renderFiles(); }
    input.onchange=()=>addFiles(input.files);
    drop.onclick=()=>input.click();
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag');}));
    drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
    $('#coachDate').value=new Date().toISOString().slice(0,10);

    $('#buildCoachZip').onclick = async () => {
      const meta={ id:uid(), title:$('#coachTitle').value.trim()||`osu session ${new Date().toLocaleDateString('ja-JP')}`, date:$('#coachDate').value, goal:$('#coachGoal').value.trim(), note:$('#coachNote').value.trim(), createdAt:new Date().toISOString(), imageCount:coachingFiles.length, imageNames:coachingFiles.map(f=>f.name) };
      if(!coachingFiles.length) return toast('リザルト画像を1枚以上追加してください。',true);
      const prompt=coachingPrompt(meta,coachingFiles);
      await DB.put('coaching',{...meta,status:'prepared',analysis:null});
      const manifest={schemaVersion:1,type:'osu-hub-coaching-request',session:meta,images:meta.imageNames,expectedResponseSchema:{schemaVersion:1,summary:'string',strengths:['string'],weaknesses:['string'],patterns:['string'],recommendedPractice:[{title:'string',minutes:15,reason:'string'}],nextGoals:['string'],confidenceNotes:['string']}};
      if(window.JSZip){
        const zip=new JSZip(); zip.file('prompt.txt',prompt); zip.file('coaching_manifest.json',JSON.stringify(manifest,null,2)); zip.file('notes.txt',`練習目的: ${meta.goal}\n本人メモ: ${meta.note}`); coachingFiles.forEach((f,i)=>zip.file(`results/${String(i+1).padStart(3,'0')}_${f.name}`,f));
        const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}}); download(`osu_coaching_${meta.date||'session'}.zip`,blob,'application/zip'); toast('ChatGPT提出用ZIPを作成しました。');
      }else{
        download('coaching_manifest.json',JSON.stringify(manifest,null,2)); download('prompt.txt',prompt,'text/plain;charset=utf-8'); toast('ZIPライブラリを読み込めなかったためJSONとTXTを保存しました。',true);
      }
      renderHistory();
    };

    const parseAnalysis = async () => {
      try{
        let text=$('#analysisJson').value.trim(); const file=$('#analysisFile').files[0]; if(file) text=await file.text();
        if(!text) throw new Error('JSONを入力してください。');
        text=text.replace(/^```json\s*/i,'').replace(/```$/,'').trim(); const data=JSON.parse(text);
        if(!data.summary) throw new Error('summaryがありません。');
        const record={id:uid(),createdAt:new Date().toISOString(),date:new Date().toISOString().slice(0,10),title:'ChatGPT分析',status:'analyzed',analysis:data,imageCount:0,imageNames:[]}; await DB.put('coaching',record);
        $('#analysisJson').value=''; $('#analysisFile').value=''; renderAnalysis(data); renderHistory(); toast('AI分析結果を保存しました。');
      }catch(err){toast(err.message||'JSONの読み込みに失敗しました。',true);}
    };
    $('#importAnalysis').onclick=parseAnalysis;

    function renderAnalysis(data){
      const box=$('#analysisPreview'); box.classList.remove('list-empty'); box.innerHTML=`<div class="analysis-section"><h3>まとめ</h3><p>${esc(data.summary||'')}</p><h3>強み</h3><div class="pill-list">${(data.strengths||[]).map(x=>`<span class="pill">${esc(x)}</span>`).join('')||'<span class="muted">なし</span>'}</div><h3>弱み</h3><div class="pill-list">${(data.weaknesses||[]).map(x=>`<span class="pill">${esc(x)}</span>`).join('')||'<span class="muted">なし</span>'}</div><h3>練習提案</h3><div class="data-list">${(data.recommendedPractice||[]).map(x=>`<div class="practice-card"><span>${num(x.minutes)||'-'}分</span><div><strong>${esc(x.title||'')}</strong><small>${esc(x.reason||'')}</small></div><span></span></div>`).join('')||'<div class="muted">なし</div>'}</div></div>`;
    }
    async function renderHistory(){
      const rows=(await DB.getAll('coaching')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,12), host=$('#coachHistory');
      if(!rows.length){host.className='list-empty';host.textContent='まだ履歴がありません。';return;}
      host.className='data-list'; host.innerHTML=rows.map(r=>`<div class="data-row"><div><div class="primary-text">${esc(r.title||'Coaching')}</div><small>${fmtDate(r.date||r.createdAt)} · ${r.imageCount||0} images</small></div><div class="stat">${r.status==='analyzed'?'分析済み':'提出準備'}</div><div></div><div></div><div></div><button class="button small danger" data-delete-coach="${r.id}">削除</button></div>`).join('');
      $$('[data-delete-coach]').forEach(b=>b.onclick=async()=>{await DB.remove('coaching',b.dataset.deleteCoach);renderHistory();});
      const latest=rows.find(r=>r.analysis); if(latest) renderAnalysis(latest.analysis);
    }
    renderHistory();
  }

  async function initPractice(){
    const form=$('#practiceForm'), host=$('#practiceList');
    async function render(){const rows=(await DB.getAll('practice')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));$('#practiceCount').textContent=rows.length;$('#practiceDone').textContent=rows.filter(r=>r.done).length;if(!rows.length){host.className='list-empty';host.textContent='練習メニューはまだありません。';return;}host.className='data-list';host.innerHTML=rows.map(r=>`<div class="practice-card ${r.done?'done':''}"><input type="checkbox" data-toggle-practice="${r.id}" ${r.done?'checked':''}><div><strong>${esc(r.title)}</strong><small>${esc(r.category||'General')} · ${num(r.minutes)||0}分 · ${fmtDate(r.date)}</small>${r.note?`<small>${esc(r.note)}</small>`:''}</div><button class="button small danger" data-delete-practice="${r.id}">削除</button></div>`).join('');$$('[data-toggle-practice]').forEach(b=>b.onchange=async()=>{const r=rows.find(x=>x.id===b.dataset.togglePractice);r.done=b.checked;await DB.put('practice',r);render();});$$('[data-delete-practice]').forEach(b=>b.onclick=async()=>{await DB.remove('practice',b.dataset.deletePractice);render();});}
    form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);await DB.put('practice',{id:uid(),createdAt:new Date().toISOString(),date:fd.get('date'),title:String(fd.get('title')||'').trim(),category:String(fd.get('category')||'General'),minutes:num(fd.get('minutes')),note:String(fd.get('note')||'').trim(),done:false});form.reset();$('#practiceDate').value=new Date().toISOString().slice(0,10);render();toast('練習メニューを追加しました。');};$('#practiceDate').value=new Date().toISOString().slice(0,10);render();
  }

  async function initStats(){
    const rows=await DB.getAll('results'); $('#statsResultCount').textContent=rows.length; if(!rows.length){$('#statsEmpty').classList.remove('hidden');return;}
    const avg=(key)=>rows.map(r=>num(r[key])).filter(v=>v>0); const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
    $('#statsAvgAcc').textContent=`${mean(avg('accuracy')).toFixed(2)}%`; $('#statsAvgMiss').textContent=mean(rows.map(r=>num(r.miss))).toFixed(1); $('#statsBestPP').textContent=avg('pp').length?`${Math.max(...avg('pp')).toFixed(1)}pp`:'--';
    const recent=[...rows].sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt)).slice(-20); const host=$('#accChart'); host.innerHTML=recent.map(r=>{const value=Math.min(100,Math.max(0,num(r.accuracy)));return `<div class="bar-row"><span>${esc((r.mapName||'Map').slice(0,16))}</span><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><small>${value.toFixed(2)}%</small></div>`}).join('');
    const mods={};rows.forEach(r=>{const k=r.mods||'NM';mods[k]??={count:0,acc:0};mods[k].count++;mods[k].acc+=num(r.accuracy);});$('#modStats').innerHTML=Object.entries(mods).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>`<div class="data-row"><div class="primary-text">${esc(k)}</div><div>${v.count} plays</div><div>${(v.acc/v.count).toFixed(2)}%</div><div></div><div></div><span></span></div>`).join('');
  }

  async function initSettings(){
    const form=$('#settingsForm'), saved=await DB.get('settings','player'); if(saved){Object.entries(saved).forEach(([k,v])=>{const el=form.elements[k];if(el)el.value=v??'';});}
    form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const value={key:'player'};for(const [k,v] of fd.entries())value[k]=v;await DB.put('settings',value);toast('設定を保存しました。');};
    $('#exportBackup').onclick=async()=>download(`osu_hub_backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(await DB.exportAll(),null,2));
    $('#importBackup').onclick=async()=>{const f=$('#backupFile').files[0];if(!f)return toast('バックアップJSONを選択してください。',true);try{await DB.importAll(JSON.parse(await f.text()),false);toast('バックアップを読み込みました。ページを再読み込みします。');setTimeout(()=>location.reload(),700);}catch(e){toast(e.message,true);}};
  }

  async function initTools(){
    try{const base=location.pathname.includes('/pages/')?'../data/site.json':'./data/site.json';const data=await fetch(base).then(r=>r.json());$$('[data-launcher-release]').forEach(a=>a.href=data.launcher.releasesUrl);$('#launcherVersion').textContent=data.launcher.version;}catch{}
  }

  async function init(){
    setActiveNav();
    try{ if(page==='home')await initHome(); if(page==='results')await initResults(); if(page==='coaching')await initCoaching(); if(page==='practice')await initPractice(); if(page==='stats')await initStats(); if(page==='settings')await initSettings(); if(page==='tools')await initTools(); }
    catch(error){console.error(error);toast(`初期化エラー: ${error.message}`,true);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
