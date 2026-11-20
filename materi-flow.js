/* KREASI DKV — Mode Langkah untuk halaman Materi
   Memecah tiap bab (artikel panjang) menjadi kartu-kartu satu layar:
   Pengantar → Tonton & amati → sub-materi → Latihan & checkpoint.
   Isi, ID, dan tombol lama (.tab-btn, .mark-chapter-btn) tidak diubah/dipindah ke luar bab.
   Mematikan fitur: hapus <script src="materi-flow.js"> dari index.html. */
(function () {
  'use strict';
  var ROOT = document.getElementById('section-1');
  if (!ROOT) return;
  var chapters = [].slice.call(ROOT.querySelectorAll('article.m-chapter'));
  if (!chapters.length) return;

  var mode = 'cards';
  try { if (localStorage.getItem('mf-mode') === 'all') mode = 'all'; } catch (e) {}
  var refreshers = [];
  var toggles = [];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function strip(t) { return t.replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim(); }

  chapters.forEach(function (ch, ci) {
    var head = [], watch = [], secs = [], tail = [], seenSec = false;
    [].slice.call(ch.children).forEach(function (k) {
      if (k.matches('section:not(.m-video)') && k.querySelector('h4')) { secs.push(k); seenSec = true; }
      else if (k.matches('.m-video, .m-figure, .m-refs-wrap')) watch.push(k);
      else if (seenSec) tail.push(k);
      else head.push(k);
    });

    var steps = [];
    function add(nodes, title, kind) { if (nodes.length) steps.push({ nodes: nodes, title: title, kind: kind }); }
    add(head, 'Pengantar', 'intro');
    add(watch, 'Tonton & amati', 'watch');
    secs.forEach(function (s) { add([s], null, 'sec'); });
    add(tail, 'Latihan & checkpoint', 'end');
    if (steps.length < 3) return; // struktur tak dikenali: biarkan tampilan lama

    var total = steps.length;
    var holder = el('div', 'mf-steps');
    var bar = el('div', 'mf-bar');
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Langkah bab');
    var now = el('span', 'mf-now');
    var toggle = el('button', 'mf-toggle'); toggle.type = 'button';
    var row = el('div', 'mf-row'); row.appendChild(now); row.appendChild(toggle);
    var chips = el('div', 'mf-chips');
    var track = el('div', 'mf-track'), fill = el('div', 'mf-fill'); track.appendChild(fill);
    bar.appendChild(row); bar.appendChild(chips); bar.appendChild(track);

    var nav = el('div', 'mf-nav');
    var prev = el('button', 'mf-btn mf-prev'); prev.type = 'button';
    var next = el('button', 'mf-btn mf-next'); next.type = 'button';
    var count = el('span', 'mf-count');
    nav.appendChild(prev); nav.appendChild(count); nav.appendChild(next);

    steps.forEach(function (st, i) {
      var color = 'mf-c' + ((ci + i) % 5);
      var w = el('div', 'mf-step ' + color);
      st.w = w; st.color = color;

      if (st.kind !== 'intro') {
        var s0 = st.kind === 'sec' ? st.nodes[0] : null;
        var h = s0 && s0.querySelector(':scope > h4');
        if (h) { st.title = strip(h.textContent); h.textContent = st.title; }
        else if (s0) {
          st.title = [].map.call(s0.querySelectorAll('h4'), function (x) { return strip(x.textContent); }).join(' · ');
        }
        var top = el('div', 'mf-top');
        top.appendChild(el('span', 'mf-num', String(i + 1)));
        var ttl = el('div', 'mf-ttl');
        ttl.appendChild(el('span', 'mf-kick', 'Langkah ' + (i + 1) + ' dari ' + total));
        if (h) { h.classList.add('mf-h'); ttl.appendChild(h); }
        else ttl.appendChild(el('h4', 'mf-h', esc(st.title)));
        top.appendChild(ttl);
        w.appendChild(top);
      }
      st.nodes.forEach(function (n) { w.appendChild(n); });
      holder.appendChild(w);

      var chip = el('button', 'mf-chip ' + color, String(i + 1));
      chip.type = 'button';
      chip.title = st.title;
      chip.setAttribute('aria-label', 'Langkah ' + (i + 1) + ': ' + st.title);
      chip.addEventListener('click', function () {
        if (mode === 'all') w.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else go(i, true);
      });
      st.chip = chip; chips.appendChild(chip);
    });

    ch.appendChild(bar); ch.appendChild(holder); ch.appendChild(nav);
    var cur = 0;

    function lastLabel() {
      return ci < chapters.length - 1
        ? { t: 'Buka Bab ' + String(ci + 2).padStart(2, '0'), s: 'Lanjut belajar →' }
        : { t: 'Ke Design Studio', s: 'Waktunya praktik ↓' };
    }

    function go(n, scroll) {
      cur = Math.max(0, Math.min(total - 1, n));
      steps.forEach(function (st, i) {
        st.w.classList.toggle('mf-off', mode === 'cards' && i !== cur);
        st.w.classList.toggle('mf-on', i === cur);
        st.chip.setAttribute('aria-current', i === cur ? 'step' : 'false');
        st.chip.classList.toggle('done', i < cur);
      });
      ch.classList.toggle('mf-all', mode === 'all');
      ch.classList.toggle('mf-cards', mode === 'cards');
      fill.style.width = (mode === 'all' ? 100 : ((cur + 1) / total) * 100) + '%';
      var cs = steps[cur];
      bar.className = 'mf-bar ' + cs.color;
      now.innerHTML = '<i>' + (cur + 1) + '/' + total + '</i>' + esc(cs.title);
      toggle.textContent = mode === 'all' ? '▣ Mode langkah' : '☰ Tampilkan semua';
      toggle.setAttribute('aria-pressed', mode === 'all' ? 'true' : 'false');
      count.textContent = 'Langkah ' + (cur + 1) + ' dari ' + total;

      prev.disabled = cur === 0;
      prev.innerHTML = '<b>← Sebelumnya</b>' + (cur > 0 ? '<small>' + esc(steps[cur - 1].title) + '</small>' : '');
      if (cur < total - 1) {
        next.className = 'mf-btn mf-next ' + steps[cur + 1].color;
        next.innerHTML = '<b>Lanjut →</b><small>' + esc(steps[cur + 1].title) + '</small>';
      } else {
        var L = lastLabel();
        next.className = 'mf-btn mf-next ' + steps[0].color;
        next.innerHTML = '<b>' + L.t + '</b><small>' + L.s + '</small>';
      }
      var c = cs.chip;
      chips.scrollTo({ left: c.offsetLeft - (chips.clientWidth - c.offsetWidth) / 2, behavior: scroll ? 'smooth' : 'auto' });
      if (scroll && mode === 'cards' && ch.getBoundingClientRect().top < 0) ch.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    prev.addEventListener('click', function () { go(cur - 1, true); });
    next.addEventListener('click', function () {
      if (cur < total - 1) { go(cur + 1, true); return; }
      if (ci < chapters.length - 1) {
        var b = document.querySelector('.tab-btn[data-tab="' + chapters[ci + 1].id + '"]');
        if (b) { b.click(); if (chapters[ci + 1].mfGo) chapters[ci + 1].mfGo(0, false); chapters[ci + 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      } else {
        var d = document.getElementById('design-studio');
        if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    toggle.addEventListener('click', function () {
      mode = mode === 'all' ? 'cards' : 'all';
      try { localStorage.setItem('mf-mode', mode); } catch (e) {}
      refreshers.forEach(function (f) { f(); });
    });

    ch.mfGo = go;
    ch.mfStep = function (d) { go(cur + d, true); };
    refreshers.push(function () { go(cur, false); });
    go(0, false);
  });

  // Panah kiri/kanan untuk pindah langkah (diabaikan saat mengetik atau memakai kontrol form/video)
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || mode !== 'cards') return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, video, [contenteditable="true"]')) return;
    if (ROOT.classList.contains('hidden')) return;
    var open = chapters.filter(function (c) { return !c.classList.contains('hidden'); })[0];
    if (open && open.mfStep) open.mfStep(e.key === 'ArrowRight' ? 1 : -1);
  });
})();
