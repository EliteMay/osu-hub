(() => {
  const DB = window.OsuDB;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dateOf = r => new Date(r?.playedAt || r?.date || r?.createdAt || 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const stddev = a => a.length > 1 ? Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)) || 0) : null;
  const fmtDate = v => { const d = new Date(v); return v && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('ja-JP') : '--'; };
  const fmtDateTime = v => { const d = new Date(v); return v && !Number.isNaN(d.getTime()) ? d.toLocaleString('ja-JP') : '--'; };
  const delta = (v, suffix = '') => Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}${suffix}` : '--';

  function toast(message, error = false) {
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.textContent = message;
    el.setAttribute('role', error ? 'alert' : 'status');
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
  }

  const valid = rows => rows.filter(r => !Number.isNaN(dateOf(r).getTime()));
  function periodRows(rows, days) {
    if (days === 'all') return valid(rows);
    const cutoff = Date.now() - Number(days) * 86400000;
    return valid(rows).filter(r => dateOf(r).getTime() >= cutoff);
  }
  function snapshot(rows, label = '') {
    const r = valid(rows);
    const values = key => r.map(x => n(x[key], NaN)).filter(Number.isFinite);
    const positive = key => values(key).filter(x => x > 0);
    return { label, capturedAt: new Date().toISOString(), resultCount: r.length,
      averageAccuracy: mean(values('accuracy')), averageMiss: mean(values('miss')),
      averagePp: mean(positive('pp')), averageStars: mean(positive('stars')) };
  }
  function snapshotLine(s) {
    if (!s?.resultCount) return '<span class="muted">比較できるResultがありません。</span>';
    return `<span>${s.resultCount} plays</span><span>${s.averageAccuracy == null ? '--' : `${s.averageAccuracy.toFixed(2)}% ACC`}</span><span>${s.averageMiss == null ? '--' : `${s.averageMiss.toFixed(2)} miss`}</span><span>${s.averagePp == null ? '--' : `${s.averagePp.toFixed(1)}pp`}</span>`;
  }

  function sessionGroups(rows, gapMin = 45) {
    const sorted = valid(rows).sort((a,b) => dateOf(a) - dateOf(b));
    const groups = [];
    for (const row of sorted) {
      const time = dateOf(row).getTime();
      const group = groups[groups.length - 1];
      if (!group || time - group.last > gapMin * 60000) groups.push({rows:[row], last:time});
      else { group.rows.push(row); group.last = time; }
    }
    return groups;
  }
  function sessionRecord(group) {
    const rows = group.rows;
    const cut = Math.max(1, Math.ceil(rows.length / 2));
    const all = snapshot(rows), first = snapshot(rows.slice(0, cut)), second = snapshot(rows.slice(cut));
    return { id:`session:auto:${rows[0].id}`, schemaVersion:1, source:'auto',
      startAt:dateOf(rows[0]).toISOString(), endAt:dateOf(rows[rows.length - 1]).toISOString(),
      resultIds:rows.map(r=>r.id), playCount:rows.length, averageAccuracy:all.averageAccuracy,
      totalMiss:rows.reduce((s,r)=>s+n(r.miss),0), averagePp:all.averagePp,
      firstHalf:first, secondHalf:second, updatedAt:new Date().toISOString() };
  }
  async function ensureSessions(results) {
    const old = await DB.getAll('sessions');
    const byId = new Map(old.map(x => [x.id, x]));
    const generated = sessionGroups(results).map(sessionRecord);
    const live = new Set(generated.map(x => x.id));
    for (const session of generated) await DB.put('sessions', {...session, selfReview:byId.get(session.id)?.selfReview || '', memo:byId.get(session.id)?.memo || ''});
    for (const session of old) if (session.source === 'auto' && !live.has(session.id) && !session.selfReview && !session.memo) await DB.remove('sessions', session.id);
    return generated;
  }

  function compareRecent(rows) {
    const sorted = valid(rows).sort((a,b)=>dateOf(a)-dateOf(b));
    if (sorted.length < 6) return null;
    const size = Math.min(10, Math.floor(sorted.length / 2));
    const before = snapshot(sorted.slice(-size * 2, -size));
    const after = snapshot(sorted.slice(-size));
    return { before, after,
      acc: after.averageAccuracy - before.averageAccuracy,
      miss: after.averageMiss - before.averageMiss,
      pp: after.averagePp == null || before.averagePp == null ? null : after.averagePp - before.averagePp };
  }
  function difficultyGroups(rows) {
    const bins = [['< 4.0★',0,4],['4.0–4.99★',4,5],['5.0–5.99★',5,6],['6.0–6.99★',6,7],['7.0★+',7,Infinity]];
    return bins.map(([label,min,max]) => {
      const items = rows.filter(r => { const s=n(r.stars,NaN); return Number.isFinite(s)&&s>=min&&s<max; });
      return {label,min,max,items,...snapshot(items)};
    }).filter(g => g.resultCount);
  }
  function difficultyInsight(groups) {
    const eligible = groups.filter(g => g.resultCount >= 3 && g.averageAccuracy != null && g.averageMiss != null);
    if (!eligible.length) return {text:'難易度帯ごとの判定には、同じ帯で3プレイ以上あると精度が上がります。'};
    const stable = [...eligible].sort((a,b)=>(a.averageMiss-b.averageMiss)||(b.averageAccuracy-a.averageAccuracy))[0];
    const challenge = eligible.find(g => g.min > stable.min && (g.averageMiss >= Math.max(2, stable.averageMiss*1.8) || g.averageAccuracy <= stable.averageAccuracy-1.5));
    return challenge
      ? {text:`${stable.label} は比較的安定し、${challenge.label} から崩れやすくなっています。`,stable,challenge}
      : {text:`${stable.label} は比較的安定しています。明確な崩れ始める境界はまだ見えません。`,stable};
  }
  function sessionInsight(sessions) {
    const usable = sessions.filter(s => s.playCount >= 4 && s.secondHalf?.resultCount);
    if (!usable.length) return 'Session後半の変化を見るには、4プレイ以上あるSessionが必要です。';
    const acc = mean(usable.map(s => (s.secondHalf.averageAccuracy??0)-(s.firstHalf.averageAccuracy??0)));
    const miss = mean(usable.map(s => (s.secondHalf.averageMiss??0)-(s.firstHalf.averageMiss??0)));
    if (acc < -.5 || miss > .8) return `Session後半でACC ${delta(acc,'pt')} / Miss ${delta(miss)}。疲労や集中低下の兆候があります。`;
    if (acc > .5 && miss <= 0) return `Session後半でACC ${delta(acc,'pt')}。Warm-up後に安定する傾向があります。`;
    return 'Session前半・後半の差は現時点では大きくありません。';
  }

  window.OsuWorkspace = { DB, $, $$, uid, n, esc, dateOf, today, mean, stddev, fmtDate, fmtDateTime, delta, toast,
    valid, periodRows, snapshot, snapshotLine, ensureSessions, compareRecent, difficultyGroups, difficultyInsight, sessionInsight };
})();
