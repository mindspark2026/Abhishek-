/* =========================================================
   UQTxNova — enhancements.js
   1. ChapterAutocomplete — suggests chapters from the existing
      syllabus (Storage 'chapters') while typing in a Description
      field. "+ Custom" keeps the typed text as a one-off value;
      nothing is ever written back to the syllabus.
   2. Stopwatch — separate from Pomodoro, timestamp-based so it
      stays accurate even when the tab is throttled.
   3. Timer mode switch (Pomodoro / Stopwatch).
   ========================================================= */

const ChapterAutocomplete = (function(){
  const MAX_RESULTS = 8;
  // Description input -> its Subject <select>, so picking a chapter also sets the subject.
  const FIELDS = {
    todayTitle: 'todaySubject',
    editTitle: 'editSubject',
    editEntryDesc: 'editEntrySubject'
  };

  function allChapters(){
    const data = Storage.get('chapters', {}) || {};
    const out = [];
    Object.keys(data).forEach(subject => {
      (data[subject] || []).forEach(c => { if(c && c.name) out.push({ name: c.name, subject }); });
    });
    return out;
  }

  function search(query){
    const q = query.toLowerCase();
    const byName = [], bySubject = [];
    allChapters().forEach(c => {
      if(c.name.toLowerCase().includes(q)) byName.push(c);
      else if(c.subject.toLowerCase().includes(q)) bySubject.push(c);
    });
    return byName.concat(bySubject).slice(0, MAX_RESULTS);
  }

  function attach(inputId, subjectId){
    const input = document.getElementById(inputId);
    if(!input) return;
    const host = input.parentElement;
    host.classList.add('ac-host');

    const list = document.createElement('ul');
    list.className = 'ac-list';
    list.id = inputId + 'AcList';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    host.appendChild(list);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');

    let items = [], active = -1;

    function close(){
      list.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function setActive(i){
      active = i;
      Array.from(list.children).forEach((li, idx) => {
        li.classList.toggle('active', idx === i);
        li.setAttribute('aria-selected', idx === i ? 'true' : 'false');
      });
      if(i >= 0){
        input.setAttribute('aria-activedescendant', list.children[i].id);
        list.children[i].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function pick(i){
      const it = items[i];
      if(!it) return;
      if(!it.custom){
        input.value = it.name;
        const sel = document.getElementById(subjectId);
        if(sel && Array.from(sel.options).some(o => o.value === it.subject)) sel.value = it.subject;
      }
      // Custom: keep whatever was typed, only for this task.
      close();
      input.focus();
    }

    function render(){
      const raw = input.value.trim();
      if(!raw){ close(); return; }
      items = search(raw);
      items.push({ custom: true, text: raw });
      list.textContent = '';
      items.forEach((it, i) => {
        const li = document.createElement('li');
        li.id = list.id + '-' + i;
        li.className = 'ac-item' + (it.custom ? ' ac-custom' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const main = document.createElement('span');
        const sub = document.createElement('span');
        sub.className = 'ac-sub';
        if(it.custom){ main.textContent = '+ Custom'; sub.textContent = it.text; }
        else { main.textContent = it.name; sub.textContent = it.subject; }
        li.append(main, sub);
        // pointerdown + preventDefault: selects before the input blurs (works for touch too)
        li.addEventListener('pointerdown', ev => { ev.preventDefault(); pick(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    }

    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', close);
    input.addEventListener('keydown', ev => {
      if(list.hidden) return;
      if(ev.key === 'ArrowDown'){ ev.preventDefault(); setActive((active + 1) % items.length); }
      else if(ev.key === 'ArrowUp'){ ev.preventDefault(); setActive((active - 1 + items.length) % items.length); }
      else if(ev.key === 'Enter' && active >= 0){ ev.preventDefault(); pick(active); }
      else if(ev.key === 'Escape'){ ev.stopPropagation(); close(); }
    });
  }

  function init(){ Object.keys(FIELDS).forEach(id => attach(id, FIELDS[id])); }
  return { init };
})();

const Stopwatch = (function(){
  let elapsed = 0;     // ms accumulated while paused
  let startedAt = 0;   // Date.now() of the current run, 0 when paused
  let timer = null;

  const $ = id => document.getElementById(id);
  const PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  function total(){ return elapsed + (startedAt ? Date.now() - startedAt : 0); }

  function format(ms){
    const s = Math.floor(ms / 1000);
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(Utils.pad2).join(':');
  }

  function paint(){
    const t = $('swTime');
    if(t) t.textContent = format(total());
  }

  function paintControls(){
    const running = !!startedAt;
    const label = running ? 'Pause' : (elapsed > 0 ? 'Resume' : 'Start');
    const btn = $('swToggle');
    if(btn){ btn.setAttribute('aria-label', label + ' stopwatch'); btn.title = label; }
    if($('swIcon')) $('swIcon').innerHTML = running ? PAUSE : PLAY;
    if($('swState')) $('swState').textContent = running ? 'Running' : (elapsed > 0 ? 'Paused' : 'Ready');
    if($('swReset')) $('swReset').disabled = !running && elapsed === 0;
  }

  function toggle(){
    if(startedAt){
      elapsed += Date.now() - startedAt;
      startedAt = 0;
      clearInterval(timer);
    } else {
      startedAt = Date.now();
      timer = setInterval(paint, 200);
    }
    paint();
    paintControls();
  }

  function reset(){
    clearInterval(timer);
    startedAt = 0;
    elapsed = 0;
    paint();
    paintControls();
  }

  function init(){ paint(); paintControls(); }
  return { toggle, reset, init };
})();

const TimerMode = (function(){
  function set(mode){
    const isStopwatch = mode === 'stopwatch';
    document.getElementById('pomodoroPanel').hidden = isStopwatch;
    document.getElementById('stopwatchPanel').hidden = !isStopwatch;
    document.querySelectorAll('#timerModeTabs button').forEach(b => {
      const on = b.dataset.timer === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  return { set };
})();

ChapterAutocomplete.init();
Stopwatch.init();
(function(){
  const y = document.getElementById('footYear');
  if(y) y.textContent = new Date().getFullYear();
})();
