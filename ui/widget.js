(function () {
  'use strict';
  const target = document.currentScript && document.currentScript.getAttribute('data-target');
  const host = (document.currentScript && document.currentScript.src.split('/widget.js')[0]) || '';
  const container = target ? document.querySelector(target) : null;
  const root = container || document.createElement('div');
  if (!container) { document.currentScript.parentNode.insertBefore(root, document.currentScript); }
  root.className = 'aradhana-widget';
  root.innerHTML = '<div style="font-family:Inter,sans-serif;border:1px solid #e5d8c4;border-radius:12px;padding:14px;background:#fffdf8;max-width:320px"><strong style="color:#571f2b">Aradhana</strong><p style="font-size:.8rem;color:#74695f;margin:6px 0">Check today\'s availability</p><button id="aw-btn" style="background:#cf7136;color:#fff;border:0;border-radius:999px;padding:8px 16px;font-size:.78rem;cursor:pointer">Check slots</button><div id="aw-out" style="margin-top:8px;font-size:.78rem;color:#2c2621"></div></div>';
  const btn = root.querySelector('#aw-btn');
  const out = root.querySelector('#aw-out');
  btn.addEventListener('click', async () => {
    try {
      const res = await fetch(host + '/api/widget/availability');
      const data = await res.json();
      out.textContent = data.available ? `${data.pandit} · ${data.slotsToday} slots today` : 'Availability unavailable';
      if (data.bookUrl) { const a = document.createElement('a'); a.href = host + data.bookUrl; a.textContent = 'Book a puja →'; a.style.color = '#571f2b'; a.style.fontWeight = '600'; out.appendChild(document.createElement('br')); out.appendChild(a); }
    } catch (e) { out.textContent = 'Could not load availability'; }
  });
})();