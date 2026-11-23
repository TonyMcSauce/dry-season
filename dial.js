/* Dry Season dial: a 24 hour ring for setting when a round started and stopped.
 * Midnight is at the top and time runs clockwise. Arcs are circles with
 * pathLength 1440 (one unit per minute), so a round is a dash: its length is
 * the minutes drunk and its offset the minute it began. Geometry is pure and
 * tested in Node; render() builds the ring once and then only moves things, so
 * CSS transitions animate every change. Browser: window.DryDial.
 */
(function (root) {
  'use strict';

  const MIN = 60000;
  const NS = 'http://www.w3.org/2000/svg';
  const C = 130, R = 100;        // ring centre and radius in the 260 x 260 viewBox

  function minuteOfDay(ms) { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }

  /** Dash for a span of time on the ring. Spans across midnight stay one arc. */
  function arc(start, end) {
    const len = Math.max(1, Math.min(1439, Math.round((end - start) / MIN)));
    return { dasharray: len + ' 1440', dashoffset: -minuteOfDay(start) };
  }

  function point(ms, r, cx, cy) {
    const a = minuteOfDay(ms) / 1440 * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const ring = (cls, parent) => el('circle', { class: cls, cx: C, cy: C, r: R, pathLength: 1440, transform: 'rotate(-90 ' + C + ' ' + C + ')' }, parent);

  function build(svg) {
    svg.setAttribute('viewBox', '0 0 260 260');
    el('circle', { class: 'dl-track', cx: C, cy: C, r: R }, svg);
    for (let h = 0; h < 24; h++) {
      const a = h / 24 * 2 * Math.PI - Math.PI / 2, long = h % 6 === 0;
      const r1 = 78, r2 = long ? 88 : 84;
      el('line', { class: long ? 'dl-tick major' : 'dl-tick', x1: C + r1 * Math.cos(a), y1: C + r1 * Math.sin(a), x2: C + r2 * Math.cos(a), y2: C + r2 * Math.sin(a) }, svg);
    }
    [['00', C, 14], ['06', 251, C + 4], ['12', C, 254], ['18', 9, C + 4]].forEach(([t, x, y]) => {
      el('text', { class: 'dl-hour', x, y, 'text-anchor': 'middle' }, svg).textContent = t;
    });
    el('g', { class: 'dl-others' }, svg);
    ring('dl-tail', svg);
    ring('dl-arc', svg);
    el('circle', { class: 'dl-handle start', r: 11, cx: C, cy: C - R }, svg);
    el('circle', { class: 'dl-handle end', r: 11, cx: C, cy: C - R }, svg);
    el('circle', { class: 'dl-moon', r: 5, cx: C, cy: C - R }, svg);
    el('circle', { class: 'dl-now', r: 3.5, cx: C, cy: C - 70 }, svg);
    svg.dataset.built = '1';
  }

  function place(node, ms, r) {
    const p = point(ms, r, C, C);
    node.setAttribute('cx', p.x.toFixed(1)); node.setAttribute('cy', p.y.toFixed(1));
    node.style.cx = p.x.toFixed(1) + 'px'; node.style.cy = p.y.toFixed(1) + 'px';
  }
  function dash(node, start, end) {
    const a = arc(start, end);
    node.style.strokeDasharray = a.dasharray; node.style.strokeDashoffset = a.dashoffset;
  }

  /** view: { round: {start, end}, others: [{start, end}], soberAt, now, tone: 'amber' | 'history' } */
  function render(svg, view) {
    if (!svg.dataset.built) build(svg);
    const q = (s) => svg.querySelector(s);
    svg.classList.toggle('history', view.tone === 'history');
    const r = view.round;
    dash(q('.dl-arc'), r.start, r.end);
    const tail = q('.dl-tail');
    tail.style.display = view.soberAt > r.end ? '' : 'none';
    if (view.soberAt > r.end) dash(tail, r.end, view.soberAt);
    place(q('.dl-handle.start'), r.start, R);
    place(q('.dl-handle.end'), r.end, R);
    place(q('.dl-moon'), view.soberAt, R);
    place(q('.dl-now'), view.now, 70);
    const others = q('.dl-others');
    others.innerHTML = '';
    (view.others || []).forEach((o) => dash(ring('dl-other', others), o.start, o.end));
  }

  const api = { minuteOfDay, arc, point, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryDial = api;
})(typeof self !== 'undefined' ? self : this);
