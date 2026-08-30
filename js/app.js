(() => {
  const DB = window.OsuDB;
  const page = document.body.dataset.page || '';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  const download = (name, content, type = 'application/json') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1500);
  };

  function toast(message, error = false) {
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.textContent = message;
    el.setAttribute('role', error ? 'alert' : 'status');
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
  }

  function fmtDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ja-JP');
  }

  function setActiveNav() {
    $$('.nav a').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      const active = [
        ['account', 'account'],
        ['coaching', 'coaching'],
        ['results', 'results'],
        ['practice', 'practice'],
        ['stats', 'stats'],
        ['settings', 'settings'],
        ['tools', 'tools'],
      ].some(([pageName, token]) => page === pageName && href.includes(token));
      if (active) anchor.classList.add('active');
    });
  }

  async function initHome() {
    const [results, coaching, practice] = await Promise.all([
      DB.getAll('results'),
      DB.getAll('coaching'),
      DB.getAll('practice'),
    ]);
    $('#homeResultCount').textContent = results.length;
    $('#homeCoachingCount').textContent = coaching.length;
    $('#homePracticeCount').textContent = practice.length;
    const accs = results.map((row) => num(row.accuracy)).filter((value) => value > 0);
    $('#homeAverageAcc').textContent = accs.length
      ? `${(accs.reduce((sum, value) => sum + value, 0) / accs.length).toFixed(2)}%`
      : '--';

    const recent = [...results]
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
      .slice(0, 5);
    const host = $('#homeRecentResults');
    if (!recent.length) return;
    host.className = 'data-list';
    host.innerHTML = recent.map((row) => `
      <div class="data-row">
        <div>
          <div class="primary-text">${esc(row.mapName || '名称未設定')}</div>
          <small>${fmtDate(row.date || row.createdAt)} · ${esc(row.mods || 'NM')}</small>
        </div>
        <div class="stat">${num(row.accuracy).toFixed(2)}%</div>
        <div class="stat">${num(row.miss)} miss</div>
        <div class="stat">${num(row.pp) ? `${num(row.pp).toFixed(1)}pp` : '--'}</div>
        <div class="stat">${num(row.stars) ? `${num(row.stars).toFixed(2)}★` : '--'}</div>
        <span></span>
      </div>
    `).join('');
  }

  async function initResults() {
    const form = $('#resultForm');
    const list = $('#resultList');

    const render = async () => {
      const rows = (await DB.getAll('results'))
        .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
      $('#resultCount').textContent = rows.length;
      const accs = rows.map((row) => num(row.accuracy)).filter((value) => value > 0);
      $('#resultAvgAcc').textContent = accs.length
        ? `${(accs.reduce((sum, value) => sum + value, 0) / accs.length).toFixed(2)}%`
        : '--';
      $('#resultTotalMiss').textContent = rows.reduce((sum, row) => sum + num(row.miss), 0);
      if (!rows.length) {
        list.className = 'list-empty';
        list.textContent = 'まだリザルトがありません。Account Syncまたは手動入力から追加できます。';
        return;
      }
      list.className = 'data-list';
      list.innerHTML = rows.map((row) => `
        <div class="data-row">
          <div>
            <div class="primary-text">${esc(row.mapName || '名称未設定')}</div>
            <small>${fmtDate(row.date || row.createdAt)} · ${esc(row.mods || 'NM')} · ${num(row.bpm) || '--'} BPM${row.source === 'osu-api' ? ' · API' : ''}</small>
          </div>
          <div class="stat">${num(row.accuracy).toFixed(2)}%</div>
          <div class="stat">${num(row.miss)} miss</div>
          <div class="stat">${num(row.pp) ? `${num(row.pp).toFixed(1)}pp` : '--'}</div>
          <div class="stat">${num(row.stars) ? `${num(row.stars).toFixed(2)}★` : '--'}</div>
          <button class="button small danger" data-delete-result="${esc(row.id)}">削除</button>
        </div>
      `).join('');
      $$('[data-delete-result]').forEach((button) => {
        button.onclick = async () => {
          if (!confirm('このリザルトを削除しますか？')) return;
          try {
            await DB.remove('results', button.dataset.deleteResult);
            toast('リザルトを削除しました。');
            await render();
          } catch (error) {
            toast(error.message || '削除に失敗しました。', true);
          }
        };
      });
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const row = {
        id: uid(),
        source: 'manual',
        createdAt: new Date().toISOString(),
        date: fd.get('date') || new Date().toISOString().slice(0, 10),
        mapName: String(fd.get('mapName') || '').trim(),
        accuracy: num(fd.get('accuracy')),
        miss: num(fd.get('miss')),
        combo: num(fd.get('combo')),
        pp: num(fd.get('pp')),
        stars: num(fd.get('stars')),
        bpm: num(fd.get('bpm')),
        mods: String(fd.get('mods') || 'NM').trim().toUpperCase(),
        note: String(fd.get('note') || '').trim(),
      };
      if (!row.mapName) return toast('譜面名を入力してください。', true);
      if (row.accuracy < 0 || row.accuracy > 100) return toast('Accuracyは0〜100で入力してください。', true);
      try {
        await DB.put('results', row);
        form.reset();
        $('#resultDate').value = new Date().toISOString().slice(0, 10);
        toast('リザルトを保存しました。');
        await render();
      } catch (error) {
        toast(error.message || 'リザルトの保存に失敗しました。', true);
      }
    };

    $('#resultDate').value = new Date().toISOString().slice(0, 10);
    await render();
  }

  let coachingFiles = [];

  function coachingPrompt(meta, files) {
    const imageList = files.map((file, index) => `${index + 1}. ${file.name}`).join('\n');
    return `あなたはosu!のコーチです。添付されたリザルト画像をまとめて分析してください。\n\n【セッション】\nタイトル: ${meta.title}\n日付: ${meta.date}\n練習目的: ${meta.goal || '未記入'}\n本人メモ: ${meta.note || '未記入'}\n\n【画像】\n${imageList}\n\n各画像を独立して見るだけでなく、セッション全体の共通傾向を探してください。Accuracy、Miss、Combo、譜面難易度、BPM、MOD、スコア画面から読み取れる範囲を根拠にし、推測は推測と明記してください。\n\n特に以下を分析してください。\n- 強み\n- 弱み\n- 失敗が増える条件や共通パターン\n- 精度不足、速度不足、Reading、Aim、Stream/Burst、Finger Control、安定性などの可能性\n- 練習の優先順位\n- 次の1週間で試す練習\n- 次回比較する指標\n\n最後は説明文の後ではなく、必ず次のJSON形式だけをコードブロックなしで出力してください。\n{\n  "schemaVersion": 1,\n  "summary": "全体まとめ",\n  "strengths": ["..."],\n  "weaknesses": ["..."],\n  "patterns": ["..."],\n  "recommendedPractice": [{"title":"...","minutes":15,"reason":"..."}],\n  "nextGoals": ["..."],\n  "confidenceNotes": ["画像だけでは断定できない点"]\n}`;
  }

  function validateStringArray(value, name) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new Error(`${name} は文字列配列である必要があります。`);
    }
    return value.map((item) => item.trim()).filter(Boolean).slice(0, 50);
  }

  function validateAnalysis(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('分析JSONがObjectではありません。');
    if (data.schemaVersion !== 1) throw new Error('対応していないAI分析Schemaです。');
    if (typeof data.summary !== 'string' || !data.summary.trim()) throw new Error('summaryがありません。');
    if (!Array.isArray(data.recommendedPractice)) throw new Error('recommendedPracticeが配列ではありません。');

    return {
      schemaVersion: 1,
      summary: data.summary.trim(),
      strengths: validateStringArray(data.strengths || [], 'strengths'),
      weaknesses: validateStringArray(data.weaknesses || [], 'weaknesses'),
      patterns: validateStringArray(data.patterns || [], 'patterns'),
      recommendedPractice: data.recommendedPractice.slice(0, 30).map((item, index) => {
        if (!item || typeof item !== 'object' || typeof item.title !== 'string') {
          throw new Error(`recommendedPractice[${index}] が不正です。`);
        }
        return {
          title: item.title.trim().slice(0, 200),
          minutes: Math.min(240, Math.max(1, num(item.minutes) || 15)),
          reason: String(item.reason || '').trim().slice(0, 1000),
        };
      }),
      nextGoals: validateStringArray(data.nextGoals || [], 'nextGoals'),
      confidenceNotes: validateStringArray(data.confidenceNotes || [], 'confidenceNotes'),
    };
  }

  async function initCoaching() {
    const input = $('#resultImages');
    const preview = $('#imagePreview');
    const drop = $('#dropzone');
    const count = $('#imageCount');

    function renderFiles() {
      count.textContent = coachingFiles.length;
      preview.innerHTML = '';
      coachingFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `<img alt=""><button class="preview-remove" type="button" aria-label="${esc(file.name)}を削除">×</button><span>${esc(file.name)}</span>`;
        const image = div.querySelector('img');
        image.alt = file.name;
        image.src = url;
        const cleanup = () => URL.revokeObjectURL(url);
        image.onload = cleanup;
        image.onerror = cleanup;
        div.querySelector('button').onclick = () => {
          coachingFiles.splice(index, 1);
          renderFiles();
        };
        preview.append(div);
      });
    }

    function addFiles(files) {
      let rejected = 0;
      for (const file of [...files]) {
        if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024 || coachingFiles.length >= 100) {
          rejected += 1;
          continue;
        }
        if (!coachingFiles.some((existing) => existing.name === file.name && existing.size === file.size)) {
          coachingFiles.push(file);
        }
      }
      renderFiles();
      if (rejected) toast('画像以外・20MB超・100枚超のファイルは追加しませんでした。', true);
    }

    input.onchange = () => addFiles(input.files);
    drop.onclick = () => input.click();
    ['dragenter', 'dragover'].forEach((eventName) => drop.addEventListener(eventName, (event) => {
      event.preventDefault();
      drop.classList.add('drag');
    }));
    ['dragleave', 'drop'].forEach((eventName) => drop.addEventListener(eventName, (event) => {
      event.preventDefault();
      drop.classList.remove('drag');
    }));
    drop.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
    $('#coachDate').value = new Date().toISOString().slice(0, 10);

    $('#buildCoachZip').onclick = async () => {
      const button = $('#buildCoachZip');
      button.disabled = true;
      try {
        const meta = {
          id: uid(),
          title: $('#coachTitle').value.trim() || `osu session ${new Date().toLocaleDateString('ja-JP')}`,
          date: $('#coachDate').value,
          goal: $('#coachGoal').value.trim(),
          note: $('#coachNote').value.trim(),
          createdAt: new Date().toISOString(),
          imageCount: coachingFiles.length,
          imageNames: coachingFiles.map((file) => file.name),
        };
        if (!coachingFiles.length) throw new Error('リザルト画像を1枚以上追加してください。');
        const prompt = coachingPrompt(meta, coachingFiles);
        await DB.put('coaching', { ...meta, status: 'prepared', analysis: null });
        const manifest = {
          schemaVersion: 1,
          type: 'osu-hub-coaching-request',
          session: meta,
          images: meta.imageNames,
          expectedResponseSchema: {
            schemaVersion: 1,
            summary: 'string',
            strengths: ['string'],
            weaknesses: ['string'],
            patterns: ['string'],
            recommendedPractice: [{ title: 'string', minutes: 15, reason: 'string' }],
            nextGoals: ['string'],
            confidenceNotes: ['string'],
          },
        };

        if (window.JSZip) {
          const zip = new JSZip();
          zip.file('prompt.txt', prompt);
          zip.file('coaching_manifest.json', JSON.stringify(manifest, null, 2));
          zip.file('notes.txt', `練習目的: ${meta.goal}\n本人メモ: ${meta.note}`);
          coachingFiles.forEach((file, index) => zip.file(`results/${String(index + 1).padStart(3, '0')}_${file.name}`, file));
          const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
          download(`osu_coaching_${meta.date || 'session'}.zip`, blob, 'application/zip');
          toast('ChatGPT提出用ZIPを作成しました。');
        } else {
          download('coaching_manifest.json', JSON.stringify(manifest, null, 2));
          download('prompt.txt', prompt, 'text/plain;charset=utf-8');
          toast('ZIPライブラリを読み込めなかったためJSONとTXTを保存しました。', true);
        }
        await renderHistory();
      } catch (error) {
        toast(error.message || '提出データの作成に失敗しました。', true);
      } finally {
        button.disabled = false;
      }
    };

    $('#importAnalysis').onclick = async () => {
      try {
        let textValue = $('#analysisJson').value.trim();
        const file = $('#analysisFile').files[0];
        if (file) textValue = await file.text();
        if (!textValue) throw new Error('JSONを入力してください。');
        textValue = textValue.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        const data = validateAnalysis(JSON.parse(textValue));
        const record = {
          id: uid(),
          createdAt: new Date().toISOString(),
          date: new Date().toISOString().slice(0, 10),
          title: 'ChatGPT分析',
          status: 'analyzed',
          analysis: data,
          imageCount: 0,
          imageNames: [],
        };
        await DB.put('coaching', record);
        $('#analysisJson').value = '';
        $('#analysisFile').value = '';
        renderAnalysis(data);
        await renderHistory();
        toast('AI分析結果を検証して保存しました。');
      } catch (error) {
        toast(error.message || 'JSONの読み込みに失敗しました。', true);
      }
    };

    function renderAnalysis(data) {
      const box = $('#analysisPreview');
      box.classList.remove('list-empty');
      box.innerHTML = `<div class="analysis-section">
        <h3>まとめ</h3><p>${esc(data.summary || '')}</p>
        <h3>強み</h3><div class="pill-list">${(data.strengths || []).map((item) => `<span class="pill">${esc(item)}</span>`).join('') || '<span class="muted">なし</span>'}</div>
        <h3>弱み</h3><div class="pill-list">${(data.weaknesses || []).map((item) => `<span class="pill">${esc(item)}</span>`).join('') || '<span class="muted">なし</span>'}</div>
        <h3>練習提案</h3><div class="data-list">${(data.recommendedPractice || []).map((item) => `<div class="practice-card"><span>${num(item.minutes) || '-'}分</span><div><strong>${esc(item.title || '')}</strong><small>${esc(item.reason || '')}</small></div><span></span></div>`).join('') || '<div class="muted">なし</div>'}</div>
      </div>`;
    }

    async function renderHistory() {
      const rows = (await DB.getAll('coaching'))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 12);
      const host = $('#coachHistory');
      if (!rows.length) {
        host.className = 'list-empty';
        host.textContent = 'まだ履歴がありません。';
        return;
      }
      host.className = 'data-list';
      host.innerHTML = rows.map((row) => `
        <div class="data-row">
          <div><div class="primary-text">${esc(row.title || 'Coaching')}</div><small>${fmtDate(row.date || row.createdAt)} · ${row.imageCount || 0} images</small></div>
          <div class="stat">${row.status === 'analyzed' ? '分析済み' : '提出準備'}</div>
          <div></div><div></div><div></div>
          <button class="button small danger" data-delete-coach="${esc(row.id)}">削除</button>
        </div>
      `).join('');
      $$('[data-delete-coach]').forEach((button) => {
        button.onclick = async () => {
          if (!confirm('このコーチング履歴を削除しますか？')) return;
          try {
            await DB.remove('coaching', button.dataset.deleteCoach);
            toast('コーチング履歴を削除しました。');
            await renderHistory();
          } catch (error) {
            toast(error.message || '削除に失敗しました。', true);
          }
        };
      });
      const latest = rows.find((row) => row.analysis);
      if (latest) renderAnalysis(latest.analysis);
    }

    await renderHistory();
  }

  async function initPractice() {
    const form = $('#practiceForm');
    const host = $('#practiceList');

    async function render() {
      const rows = (await DB.getAll('practice')).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      $('#practiceCount').textContent = rows.length;
      $('#practiceDone').textContent = rows.filter((row) => row.done).length;
      if (!rows.length) {
        host.className = 'list-empty';
        host.textContent = '練習メニューはまだありません。左のフォームから追加できます。';
        return;
      }
      host.className = 'data-list';
      host.innerHTML = rows.map((row) => `
        <div class="practice-card ${row.done ? 'done' : ''}">
          <input type="checkbox" aria-label="${esc(row.title)}を完了にする" data-toggle-practice="${esc(row.id)}" ${row.done ? 'checked' : ''}>
          <div><strong>${esc(row.title)}</strong><small>${esc(row.category || 'General')} · ${num(row.minutes) || 0}分 · ${fmtDate(row.date)}</small>${row.note ? `<small>${esc(row.note)}</small>` : ''}</div>
          <button class="button small danger" data-delete-practice="${esc(row.id)}">削除</button>
        </div>
      `).join('');
      $$('[data-toggle-practice]').forEach((checkbox) => {
        checkbox.onchange = async () => {
          const row = rows.find((item) => item.id === checkbox.dataset.togglePractice);
          if (!row) return;
          const updated = { ...row, done: checkbox.checked };
          try {
            await DB.put('practice', updated);
            await render();
          } catch (error) {
            checkbox.checked = row.done;
            toast(error.message || '更新に失敗しました。', true);
          }
        };
      });
      $$('[data-delete-practice]').forEach((button) => {
        button.onclick = async () => {
          if (!confirm('この練習メニューを削除しますか？')) return;
          try {
            await DB.remove('practice', button.dataset.deletePractice);
            toast('練習メニューを削除しました。');
            await render();
          } catch (error) {
            toast(error.message || '削除に失敗しました。', true);
          }
        };
      });
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim();
      if (!title) return toast('練習内容を入力してください。', true);
      try {
        await DB.put('practice', {
          id: uid(),
          createdAt: new Date().toISOString(),
          date: fd.get('date') || new Date().toISOString().slice(0, 10),
          title,
          category: String(fd.get('category') || 'General'),
          minutes: Math.max(1, num(fd.get('minutes')) || 15),
          note: String(fd.get('note') || '').trim(),
          done: false,
        });
        form.reset();
        $('#practiceDate').value = new Date().toISOString().slice(0, 10);
        toast('練習メニューを追加しました。');
        await render();
      } catch (error) {
        toast(error.message || '練習メニューの保存に失敗しました。', true);
      }
    };

    $('#practiceDate').value = new Date().toISOString().slice(0, 10);
    await render();
  }

  async function initStats() {
    const rows = await DB.getAll('results');
    $('#statsResultCount').textContent = rows.length;
    if (!rows.length) {
      $('#statsEmpty').classList.remove('hidden');
      return;
    }
    const values = (key) => rows.map((row) => num(row[key])).filter((value) => value > 0);
    const mean = (array) => array.length ? array.reduce((sum, value) => sum + value, 0) / array.length : 0;
    $('#statsAvgAcc').textContent = `${mean(values('accuracy')).toFixed(2)}%`;
    $('#statsAvgMiss').textContent = mean(rows.map((row) => num(row.miss))).toFixed(1);
    $('#statsBestPP').textContent = values('pp').length ? `${Math.max(...values('pp')).toFixed(1)}pp` : '--';

    const recent = [...rows]
      .sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt))
      .slice(-20);
    $('#accChart').innerHTML = recent.map((row) => {
      const value = Math.min(100, Math.max(0, num(row.accuracy)));
      return `<div class="bar-row"><span>${esc((row.mapName || 'Map').slice(0, 16))}</span><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><small>${value.toFixed(2)}%</small></div>`;
    }).join('');

    const mods = {};
    rows.forEach((row) => {
      const key = row.mods || 'NM';
      mods[key] ??= { count: 0, acc: 0 };
      mods[key].count += 1;
      mods[key].acc += num(row.accuracy);
    });
    $('#modStats').innerHTML = Object.entries(mods)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, value]) => `<div class="data-row"><div class="primary-text">${esc(key)}</div><div>${value.count} plays</div><div>${(value.acc / value.count).toFixed(2)}%</div><div></div><div></div><span></span></div>`)
      .join('');
  }

  async function initSettings() {
    const form = $('#settingsForm');
    const saved = await DB.get('settings', 'player');
    if (saved) {
      Object.entries(saved).forEach(([key, value]) => {
        const el = form.elements[key];
        if (el) el.value = value ?? '';
      });
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const value = { key: 'player' };
      for (const [key, fieldValue] of fd.entries()) value[key] = fieldValue;
      try {
        await DB.put('settings', value);
        toast('設定を保存しました。');
      } catch (error) {
        toast(error.message || '設定の保存に失敗しました。', true);
      }
    };

    $('#exportBackup').onclick = async () => {
      try {
        const payload = await DB.exportAll();
        download(`osu_hub_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
        toast('バックアップを書き出しました。');
      } catch (error) {
        toast(error.message || 'バックアップの書き出しに失敗しました。', true);
      }
    };

    $('#importBackup').onclick = async () => {
      const file = $('#backupFile').files[0];
      if (!file) return toast('バックアップJSONを選択してください。', true);
      try {
        const payload = JSON.parse(await file.text());
        DB.validateImportPayload(payload);
        await DB.importAll(payload, false);
        toast('バックアップを検証して読み込みました。ページを再読み込みします。');
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        toast(error.message || 'バックアップの読み込みに失敗しました。元データは変更していません。', true);
      }
    };
  }

  async function initTools() {
    try {
      const base = location.pathname.includes('/pages/') ? '../data/site.json' : './data/site.json';
      const response = await fetch(base, { cache: 'no-store' });
      if (!response.ok) throw new Error(`site.json ${response.status}`);
      const data = await response.json();
      $$('[data-launcher-release]').forEach((anchor) => {
        if (data?.launcher?.releasesUrl) anchor.href = data.launcher.releasesUrl;
      });
      if ($('#launcherVersion') && data?.launcher?.version) $('#launcherVersion').textContent = data.launcher.version;
    } catch (error) {
      console.warn('Desktop Tools metadata load failed:', error);
    }
  }

  async function init() {
    setActiveNav();
    try {
      if (page === 'home') await initHome();
      if (page === 'results') await initResults();
      if (page === 'coaching') await initCoaching();
      if (page === 'practice') await initPractice();
      if (page === 'stats') await initStats();
      if (page === 'settings') await initSettings();
      if (page === 'tools') await initTools();
    } catch (error) {
      console.error(error);
      toast(`初期化エラー: ${error.message}`, true);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
