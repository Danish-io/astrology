'use strict';
import {
  state, API, escapeHtml, fmtDate, fmtTime, fmtDateTime, initials, badge, icon, stars,
  empty, spinner, modal, toast, navigate, statusLabel, statusTone, parseJson, setting, qsa
} from './core.js?v=13';

function workspaceLayout(content, active, type = 'admin') {
  const u = state.user || {};
  const nav = type === 'admin' ? adminNav(active) : providerNav(active);
  const brandSub = type === 'admin' ? 'Back office' : 'Pandit workspace';
  return `
  <header class="site-header" id="siteHeader">
    <div class="container" style="min-height:62px">
      <a class="brand" href="#/"><span class="brand-mark"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c5 10 5 17 0 25-5-8-5-15 0-25Z" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg></span><span class="brand-text"><span class="brand-name">${escapeHtml(setting('site.name','Aradhana'))}</span><span class="brand-sub">${brandSub}</span></span></a>
      <div class="header-actions">
        <button class="workspace-mobile-toggle icon-btn" id="wsToggle" aria-label="Menu">${icon('chevDown')}</button>
        <a class="header-login" href="#/my">${escapeHtml(u.fullName||'')}</a>
        <button class="btn btn-ghost btn-sm" id="signOutBtn">Sign out</button>
      </div>
    </div>
  </header>
  <div class="workspace">
    <aside class="workspace-side" id="wsSide">${nav}</aside>
    <main class="workspace-main">${content}</main>
  </div>`;
}

function adminNav(active) {
  const pending = '';
  return `<div class="workspace-brand"><span class="brand-mark"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c5 10 5 17 0 25-5-8-5-15 0-25Z" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg></span><div><strong>${escapeHtml(setting('site.name','Aradhana'))}</strong><span>Back office</span></div></div>
  <nav class="workspace-nav">
    <span class="group-label">Overview</span>
    <a href="#/admin" class="${active==='dashboard'?'active':''}">${icon('spark')} Dashboard</a>
    <a href="#/admin/inbox" class="${active==='inbox'?'active':''}">${icon('calendar')} Requests</a>
    <a href="#/admin/calendar" class="${active==='calendar'?'active':''}">${icon('calendar')} Calendar</a>
    <span class="group-label">Practice</span>
    <a href="#/admin/availability" class="${active==='availability'?'active':''}">${icon('clock')} Availability</a>
    <a href="#/admin/pandit" class="${active==='pandit'?'active':''}">${icon('user')} Pandit profile</a>
    <a href="#/admin/services" class="${active==='services'?'active':''}">${icon('spark')} Services</a>
    <a href="#/admin/events" class="${active==='events'?'active':''}">${icon('calendar')} Gatherings</a>
    <span class="group-label">People</span>
    <a href="#/admin/customers" class="${active==='customers'?'active':''}">${icon('user')} Customers</a>
    <a href="#/admin/messages" class="${active==='messages'?'active':''}">${icon('mail')} Messages</a>
    <span class="group-label">System</span>
    <a href="#/admin/notifications" class="${active==='notifications'?'active':''}">${icon('mail')} Notifications</a>
    <a href="#/admin/reports" class="${active==='reports'?'active':''}">${icon('calendar')} Reports</a>
    <a href="#/admin/settings" class="${active==='settings'?'active':''}">${icon('edit')} Settings</a>
  </nav>
  <div class="workspace-foot">Signed in as ${escapeHtml(state.user?.fullName||'')}<br>${escapeHtml(state.user?.role||'')}</div>`;
}

function providerNav(active) {
  return `<div class="workspace-brand"><span class="brand-mark"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c5 10 5 17 0 25-5-8-5-15 0-25Z" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg></span><div><strong>${escapeHtml(setting('site.name','Aradhana'))}</strong><span>Pandit workspace</span></div></div>
  <nav class="workspace-nav">
    <a href="#/provider" class="${active==='dashboard'?'active':''}">${icon('spark')} Dashboard</a>
    <a href="#/provider/bookings" class="${active==='bookings'?'active':''}">${icon('calendar')} My bookings</a>
    <a href="#/provider/schedule" class="${active==='schedule'?'active':''}">${icon('calendar')} Schedule</a>
    <a href="#/provider/availability" class="${active==='availability'?'active':''}">${icon('clock')} Availability</a>
    <a href="#/provider/profile" class="${active==='profile'?'active':''}">${icon('user')} Profile</a>
  </nav>
  <div class="workspace-foot">Signed in as ${escapeHtml(state.user?.fullName||'')}</div>`;
}

function wireWorkspace() {
  setTimeout(() => {
    const t = document.getElementById('wsToggle');
    const side = document.getElementById('wsSide');
    if (t && side) t.addEventListener('click', () => side.classList.toggle('open'));
    // sign-out handled by delegated handler in core.js
  }, 0);
}

// ---------- dashboard ----------
export async function renderAdminDashboard() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(), 'dashboard'); }
  const d = await API.get('/api/admin/dashboard');
  const s = d.stats || {};
  const inner = `
  <div class="workspace-top"><div><h1>Dashboard</h1><p>Today at a glance Â· ${fmtDate(new Date().toISOString(),'long')}</p></div><div class="workspace-top-actions"><a class="btn btn-primary btn-sm" href="#/admin/inbox">Open inbox</a></div></div>
  <div class="kpi-grid">
    <div class="kpi attention"><div class="kpi-label">${icon('clock')} Pending requests</div><strong>${s.pending||0}</strong><small>Awaiting first contact</small></div>
    <div class="kpi"><div class="kpi-label">${icon('calendar')} Today</div><strong>${s.todayBookings||0}</strong><small>Bookings today</small></div>
    <div class="kpi"><div class="kpi-label">${icon('check')} Confirmed</div><strong>${s.confirmed||0}</strong><small>Upcoming</small></div>
    <div class="kpi"><div class="kpi-label">${icon('spark')} Completed</div><strong>${s.completed||0}</strong><small>All time</small></div>
    <div class="kpi"><div class="kpi-label">${icon('user')} Customers</div><strong>${s.customers||0}</strong><small>Registered</small></div>
    <div class="kpi"><div class="kpi-label">${icon('mail')} Enquiries</div><strong>${s.enquiries||0}</strong><small>New</small></div>
    <div class="kpi"><div class="kpi-label">${icon('spark')} Revenue</div><strong>â‚¹${(s.revenue||0).toLocaleString('en-IN')}</strong><small>This month</small></div>
    <div class="kpi"><div class="kpi-label">${icon('star')} Rating</div><strong>${Number(d.panchang?4.8:4.8).toFixed(1)}</strong><small>Average</small></div>
  </div>
  <div class="panel-grid">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Recent requests</h2><p>Latest submissions</p></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Ref</th><th>Customer</th><th>Service</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
        ${(d.recent||[]).map(b=>`<tr><td class="cell-main">${escapeHtml(b.ref)}</td><td><div class="cell-main">${escapeHtml(b.customerName)}</div><div class="cell-sub">${escapeHtml(b.customerPhone)}</div></td><td>${escapeHtml(b.service?.name||b.type)}</td><td class="cell-sub">${fmtDate(b.preferredStartAt,'short')}</td><td>${badge(b.status)}</td><td><a class="btn btn-ghost btn-sm" href="#/admin/bookings/${b.ref}">Open</a></td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Needs attention</h2><p>Oldest first</p></div>
        <div class="mini-list">${(d.attention||[]).map(b=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(b.customerName)}</strong><span>${escapeHtml(b.service?.name||b.type)} Â· ${escapeHtml(b.ref)}</span></div><span>${escapeHtml(b.waiting||'')}</span>${badge(b.status)}<a class="btn btn-ghost btn-sm" href="#/admin/bookings/${b.ref}">Open</a></div>`).join('') || empty('All caught up','No pending requests.')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>7-day trend</h2><p>Requests per day</p></div>
        <div class="trend-bars">${(d.trend||[]).map(t=>`<div class="trend-bar"><b>${t.count}</b><div class="bar" style="height:${Math.max(4, t.count*14)}px"></div><span>${escapeHtml(t.label)}</span></div>`).join('')}</div>
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Top services</h2></div>
        <div class="mini-list">${(d.topServices||[]).map(s=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(s.name)}</strong><span>${escapeHtml(s.service_type)}</span></div><strong>${s.n}</strong></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Upcoming gatherings</h2></div>
        <div class="mini-list">${(d.upcomingEvents||[]).map(e=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(e.title)}</strong><span>${fmtDate(e.startAt,'short')} Â· ${e.seatsTaken}/${e.capacity} seats</span></div><a class="btn btn-ghost btn-sm" href="#/admin/events">Open</a></div>`).join('') || empty('None scheduled','')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Quick links</h2></div>
        <div class="quick-links">
          <a class="quick-link" href="#/admin/inbox">Requests inbox ${icon('chevRight')}</a>
          <a class="quick-link" href="#/admin/availability">Manage availability ${icon('chevRight')}</a>
          <a class="quick-link" href="#/admin/services">Edit services ${icon('chevRight')}</a>
          <a class="quick-link" href="#/admin/pandit">Pandit profile ${icon('chevRight')}</a>
          <a class="quick-link" href="#/admin/settings">Settings ${icon('chevRight')}</a>
        </div>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner, 'dashboard', 'admin');
  wireWorkspace();
  return html;
}

// ---------- inbox ----------
export async function renderAdminInbox(query = {}) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'inbox'); }
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k,v]) => { if (v) params.set(k,v); });
  const data = await API.get('/api/admin/inbox' + (params.toString() ? '?'+params.toString() : ''));
  const inner = `
  <div class="workspace-top"><div><h1>Requests inbox</h1><p>${data.total} bookings Â· page ${data.page} of ${data.pages}</p></div><div class="workspace-top-actions"><a class="btn btn-outline btn-sm" href="#/admin/calendar">Calendar</a></div></div>
  <div class="filter-bar">
    <select id="statusFilter"><option value="ALL">All statuses</option>${Object.keys(data.counts||{}).map(s=>`<option value="${s}" ${query.status===s?'selected':''}>${statusLabel(s)} (${data.counts[s]})</option>`).join('')}</select>
    <select id="typeFilter"><option value="">All types</option><option value="PUJA" ${query.type==='PUJA'?'selected':''}>Puja</option><option value="CONSULTATION" ${query.type==='CONSULTATION'?'selected':''}>Consultation</option><option value="EVENT" ${query.type==='EVENT'?'selected':''}>Event</option></select>
    <input id="qFilter" placeholder="Search name, phone, ref, service" value="${escapeHtml(query.q||'')}" />
    <input id="fromFilter" type="date" value="${escapeHtml(query.from||'')}" />
    <input id="toFilter" type="date" value="${escapeHtml(query.to||'')}" />
    <button class="btn btn-primary btn-sm" id="applyFilters">Apply</button>
  </div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Ref</th><th>Customer</th><th>Service</th><th>When</th><th>Waiting</th><th>Status</th><th></th></tr></thead><tbody>
    ${(data.bookings||[]).map(b=>`<tr>
      <td class="cell-main">${escapeHtml(b.ref)}</td>
      <td><div class="cell-main">${escapeHtml(b.customerName)}</div><div class="cell-sub">${escapeHtml(b.customerPhone)}</div></td>
      <td>${escapeHtml(b.service?.name||b.type)}</td>
      <td class="cell-sub">${fmtDate(b.preferredStartAt,'short')}</td>
      <td class="cell-sub">${escapeHtml(b.waiting||'')}</td>
      <td>${badge(b.status)}</td>
      <td><a class="btn btn-ghost btn-sm" href="#/admin/bookings/${b.ref}">Open</a></td>
    </tr>`).join('') || `<tr><td colspan="7">${empty('No bookings','Try different filters.')}</td></tr>`}
    </tbody></table></div>
  </div>
  ${data.pages>1?`<div class="pagination">${Array.from({length:data.pages},(_,i)=>`<button class="page-btn ${data.page===i+1?'active':''}" data-page="${i+1}">${i+1}</button>`).join('')}</div>`:''}`;
  const html = workspaceLayout(inner,'inbox','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('applyFilters')?.addEventListener('click', () => {
      const p = new URLSearchParams();
      const st = document.getElementById('statusFilter').value;
      if (st && st !== 'ALL') p.set('status', st);
      const t = document.getElementById('typeFilter').value; if (t) p.set('type', t);
      const q = document.getElementById('qFilter').value; if (q) p.set('q', q);
      const f = document.getElementById('fromFilter').value; if (f) p.set('from', f);
      const to = document.getElementById('toFilter').value; if (to) p.set('to', to);
      navigate('#/admin/inbox' + (p.toString()?'?'+p.toString():''));
    });
    qsa('[data-page]').forEach(b => b.addEventListener('click', () => {
      const p = new URLSearchParams(location.hash.split('?')[1]||'');
      p.set('page', b.dataset.page);
      navigate('#/admin/inbox?' + p.toString());
    }));
  },0);
  return html;
}

// ---------- booking detail ----------
export async function renderAdminBooking(params) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'inbox'); }
  const data = await API.get(`/api/admin/bookings/${params.ref}`);
  const b = data.booking;
  const inner = `
  <div class="workspace-top"><div><h1>${escapeHtml(b.ref)}</h1><p>${escapeHtml(b.service?.name||b.type)} Â· ${escapeHtml(b.statusLabel)}</p></div><div class="workspace-top-actions"><a class="btn btn-outline btn-sm" href="#/admin/inbox">â† Inbox</a></div></div>
  <div class="request-layout">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Request details</h2></div>
        <div class="request-meta">
          <div><dt>Customer</dt><dd>${escapeHtml(b.customerName)}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(b.customerPhone)}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(b.customerEmail||'â€”')}</dd></div>
          <div><dt>Channel</dt><dd>${escapeHtml(b.preferredContactChannel)} Â· ${escapeHtml(b.preferredCallWindow||'any')}</dd></div>
          <div><dt>Service</dt><dd>${escapeHtml(b.service?.name||b.type)}</dd></div>
          <div><dt>Provider</dt><dd>${escapeHtml(b.provider?.name||'â€”')}</dd></div>
          <div><dt>Preferred time</dt><dd>${fmtDateTime(b.preferredStartAt)}</dd></div>
          <div><dt>Confirmed time</dt><dd>${b.confirmedStartAt?fmtDateTime(b.confirmedStartAt):'â€”'}</dd></div>
          <div><dt>Participants</dt><dd>${b.participants}</dd></div>
          <div><dt>Payment state</dt><dd>${escapeHtml(b.paymentState)}</dd></div>
          ${b.specialRequests?`<div class="full"><dt>Special requests</dt><dd>${escapeHtml(b.specialRequests)}</dd></div>`:''}
          ${b.puja?`<div class="full"><dt>Puja</dt><dd>${escapeHtml(b.puja.locationType.replace('_',' '))} Â· ${escapeHtml(b.puja.occasion)} Â· ${escapeHtml(b.puja.samagriBy)} samagri Â· ${b.puja.attendeeEstimate} attendees${b.puja.liveStream?' Â· live stream':''}</dd></div>${b.puja.address?`<div class="full"><dt>Address</dt><dd>${escapeHtml(JSON.stringify(b.puja.address))}</dd></div>`:''}`:''}
          ${b.consultation?`<div class="full"><dt>Consultation</dt><dd>${escapeHtml(b.consultation.mode)} Â· ${escapeHtml((b.consultation.topics||[]).join(', '))} Â· ${b.consultation.duration} min${b.consultation.question?' Â· â€œ'+escapeHtml(b.consultation.question)+'â€':''}</dd></div>`:''}
          ${b.birthDetails?.length?`<div class="full"><dt>Birth details</dt><dd>${b.birthDetails.map(p=>escapeHtml(p.name+' Â· '+p.dateOfBirth+' Â· '+p.place)).join('; ')}</dd></div>`:''}
        </div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Timeline</h2></div>
        <div class="timeline compact">${(b.history||[]).map(h=>`<div class="timeline-item"><div class="timeline-dot"></div><div><strong>${escapeHtml(h.toLabel)}</strong><span> Â· ${fmtDateTime(h.at)}</span><p>${escapeHtml(h.reason||'')}</p></div></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Notes</h2></div>
        ${(b.notes||[]).map(n=>`<div class="note-item"><strong>${escapeHtml(n.author_name||'Team')}${n.is_pinned?' <span class="pin-tag">pinned</span>':''}</strong><p>${escapeHtml(n.note)}</p><span>${fmtDateTime(n.created_at)}</span></div>`).join('') || `<p class="muted small">No notes yet.</p>`}
        <form id="noteForm" style="margin-top:10px"><div class="field"><textarea name="note" placeholder="Add an internal noteâ€¦" required></textarea></div><button class="btn btn-outline btn-sm" type="submit">Add note</button></form>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Contact log</h2></div>
        ${(b.contactAttempts||[]).map(c=>`<div class="note-item"><strong>${escapeHtml(c.channel)} Â· ${escapeHtml(c.outcome)}</strong><p>${escapeHtml(c.summary||'')}</p><span>${escapeHtml(c.staff_name||'')} Â· ${fmtDateTime(c.created_at)}</span></div>`).join('') || `<p class="muted small">No contact attempts yet.</p>`}
        <form id="contactForm" style="margin-top:10px">
          <div class="field-row">
            <div class="field"><label>Channel</label><select name="channel"><option>CALL</option><option>WHATSAPP</option><option>SMS</option><option>EMAIL</option></select></div>
            <div class="field"><label>Outcome</label><select name="outcome"><option>REACHED</option><option>NO_ANSWER</option><option>RESCHEDULED</option><option>NOT_INTERESTED</option></select></div>
          </div>
          <div class="field"><label>Summary</label><textarea name="summary" required></textarea></div>
          <button class="btn btn-outline btn-sm" type="submit">Log contact</button>
        </form>
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Actions</h2></div>
        <div class="stack">
          ${b.can.confirm ? `<button class="btn btn-primary btn-block btn-sm" id="confirmBtn">Confirm booking</button>` : ''}
          ${b.can.reject ? `<button class="btn btn-danger btn-block btn-sm" id="rejectBtn">Decline</button>` : ''}
          ${b.can.complete ? `<button class="btn btn-primary btn-block btn-sm" id="completeBtn">Mark completed</button>` : ''}
          ${b.can.noShow ? `<button class="btn btn-outline btn-block btn-sm" id="noshowBtn">Mark no-show</button>` : ''}
          ${b.can.cancel ? `<button class="btn btn-danger btn-block btn-sm" id="cancelBtn">Cancel booking</button>` : ''}
          ${b.can.reschedule && (b.reschedules||[]).some(r=>r.status==='PENDING') ? `<button class="btn btn-primary btn-block btn-sm" id="approveResched">Approve reschedule</button><button class="btn btn-outline btn-block btn-sm" id="declineResched">Decline reschedule</button>` : ''}
        </div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Record payment</h2><p>Offline note only</p></div>
        <form id="payForm">
          <div class="field-row">
            <div class="field"><label>Agreed (â‚¹)</label><input name="agreedAmount" type="number" min="0" value="0" /></div>
            <div class="field"><label>Received (â‚¹)</label><input name="receivedAmount" type="number" min="0" value="0" /></div>
          </div>
          <div class="field"><label>Mode</label><select name="mode"><option>UPI</option><option>CASH</option><option>BANK_TRANSFER</option><option>OTHER</option></select></div>
          <div class="field"><label>Reference note</label><input name="referenceNote" placeholder="UPI ref, receipt no." /></div>
          <div class="field"><label>Remarks</label><textarea name="remarks"></textarea></div>
          <button class="btn btn-outline btn-sm btn-block" type="submit">Save payment note</button>
        </form>
        ${(b.payments||[]).length ? `<div style="margin-top:10px">${(b.payments||[]).map(p=>`<div class="note-item"><strong>â‚¹${(p.received_amount||0).toLocaleString('en-IN')} / â‚¹${(p.agreed_amount||0).toLocaleString('en-IN')}</strong><p>${escapeHtml(p.mode)} Â· ${escapeHtml(p.reference_note||'')} Â· ${escapeHtml(p.remarks||'')}</p><span>${fmtDate(p.created_at,'date')}</span></div>`).join('')}</div>` : ''}
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Notifications</h2></div>
        <div class="mini-list">${(b.notifications||[]).map(n=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(n.template_code)}</strong><span>${escapeHtml(n.channel)} Â· ${escapeHtml(n.delivery_status||n.status)}</span></div><span>${fmtDate(n.created_at,'short')}</span></div>`).join('') || empty('None','')}</div>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'inbox','admin');
  wireWorkspace();
  setTimeout(() => {
    const ref = b.ref;
    const reload = () => navigate(`#/admin/bookings/${ref}`);
    document.getElementById('noteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await API.post(`/api/admin/bookings/${ref}/notes`, { note: fd.get('note') }); toast('Note added','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await API.post(`/api/admin/bookings/${ref}/contact`, Object.fromEntries(fd.entries())); toast('Contact logged','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    const confirmBtn = document.getElementById('confirmBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', async () => {
      const start = prompt('Confirmed start (ISO or local, IST). Leave blank to use preferred time:');
      try { await API.post(`/api/admin/bookings/${ref}/confirm`, start ? { confirmedStartAt: new Date(start).toISOString() } : {}); toast('Confirmed','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('rejectBtn')?.addEventListener('click', async () => {
      const reason = prompt('Reason for declining:'); if (!reason) return;
      try { await API.post(`/api/admin/bookings/${ref}/reject`, { reason }); toast('Declined','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('completeBtn')?.addEventListener('click', async () => {
      try { await API.post(`/api/admin/bookings/${ref}/complete`); toast('Completed','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('noshowBtn')?.addEventListener('click', async () => {
      try { await API.post(`/api/admin/bookings/${ref}/no-show`, { reason: 'No show' }); toast('Marked no-show','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('cancelBtn')?.addEventListener('click', async () => {
      const reason = prompt('Reason for cancellation:'); if (!reason) return;
      try { await API.post(`/api/admin/bookings/${ref}/cancel`, { reason }); toast('Cancelled','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('approveResched')?.addEventListener('click', async () => {
      try { await API.post(`/api/admin/bookings/${ref}/reschedule/decide`, { decision: 'APPROVE' }); toast('Approved','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('declineResched')?.addEventListener('click', async () => {
      try { await API.post(`/api/admin/bookings/${ref}/reschedule/decide`, { decision: 'REJECT' }); toast('Declined','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('payForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await API.post(`/api/admin/bookings/${ref}/payments`, Object.fromEntries(fd.entries())); toast('Payment recorded','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
  },0);
  return html;
}

// ---------- calendar ----------
export async function renderAdminCalendar(query = {}) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'calendar'); }
  const from = query.from || new Date().toISOString().slice(0,7)+'-01';
  const to = query.to || new Date(new Date(from).setMonth(new Date(from).getMonth()+1)).toISOString().slice(0,10);
  const data = await API.get(`/api/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const bookings = data.bookings || [];
  // build month grid
  const monthDate = new Date(from+'T00:00:00Z');
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstDay.getUTCDay(); // 0 Sun
  const daysInMonth = new Date(Date.UTC(year, month+1, 0)).getUTCDate();
  const byDate = {};
  bookings.forEach(b => { const k = (b.date||b.startAt?.slice(0,10)); (byDate[k] ||= []).push(b); });
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push('<div class="calendar-cell blank"></div>');
  const todayKey = new Date().toISOString().slice(0,10);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const bs = byDate[key] || [];
    cells.push(`<div class="calendar-cell ${key===todayKey?'today':''}">
      <span class="day-num">${d}</span>
      ${bs.slice(0,3).map(b=>`<span class="cal-pill ${b.status==='CONFIRMED'?'confirmed':b.status==='COMPLETED'?'completed':''}" title="${escapeHtml(b.customerName)}">${escapeHtml(b.customerName.split(' ')[0])} ${fmtTime(b.startAt)}</span>`).join('')}
      ${bs.length>3?`<span class="cal-more">+${bs.length-3} more</span>`:''}
    </div>`);
  }
  const inner = `
  <div class="workspace-top"><div><h1>Calendar</h1><p>${fmtDate(from+'T12:00:00+05:30','long')} â€” ${fmtDate(to+'T12:00:00+05:30','long')}</p></div>
    <div class="workspace-top-actions">
      <input type="month" id="monthPick" value="${escapeHtml(from.slice(0,7))}" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--paper)" />
    </div>
  </div>
  <div class="workspace-panel" style="padding:14px">
    <div class="calendar-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(w=>`<span>${w}</span>`).join('')}</div>
    <div class="calendar-grid">${cells.join('')}</div>
  </div>
  <div class="workspace-panel">
    <div class="workspace-panel-head"><h2>Agenda</h2><p>${bookings.length} bookings in range</p></div>
    <div class="agenda-list">${bookings.map(b=>`<div class="agenda-row"><div class="agenda-time">${fmtTime(b.startAt)}<br>${fmtDate(b.startAt,'short')}</div><div class="agenda-body"><strong>${escapeHtml(b.customerName)} Â· ${escapeHtml(b.service||'')}</strong><span>${escapeHtml(b.ref)} Â· ${escapeHtml(b.statusLabel)}${b.confirmed?' Â· confirmed':''}</span></div><a class="btn btn-ghost btn-sm" href="#/admin/bookings/${b.ref}">Open</a></div>`).join('') || empty('No bookings','')}</div>
  </div>`;
  const html = workspaceLayout(inner,'calendar','admin');
  wireWorkspace();
  setTimeout(() => {
    const mp = document.getElementById('monthPick');
    if (mp) mp.addEventListener('change', () => {
      const v = mp.value; // YYYY-MM
      navigate(`#/admin/calendar?from=${v}-01`);
    });
  },0);
  return html;
}

// ---------- availability ----------
export async function renderAdminAvailability() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'availability'); }
  const data = await API.get('/api/admin/availability');
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const rulesByDay = {};
  (data.rules||[]).forEach(r => { (rulesByDay[r.weekday] ||= []).push(r); });
  const inner = `
  <div class="workspace-top"><div><h1>Availability</h1><p>Weekly windows, exceptions and day counts for ${escapeHtml(data.provider?.name||'Pandit ji')}</p></div>
    <div class="workspace-top-actions"><button class="btn btn-primary btn-sm" id="regenBtn">Rebuild slots</button></div></div>
  <div class="panel-grid">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Weekly windows</h2><p>Add a recurring window; slots are generated automatically.</p></div>
        <form id="ruleForm" style="margin-bottom:14px">
          <div class="field-row">
            <div class="field"><label>Weekday</label><select name="weekday">${weekdays.map((w,i)=>`<option value="${i}">${w}</option>`).join('')}</select></div>
            <div class="field"><label>Service type</label><select name="serviceType"><option value="PUJA">Puja</option><option value="CONSULTATION">Consultation</option></select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Start (HH:MM)</label><input name="startTime" type="time" value="07:00" required /></div>
            <div class="field"><label>End (HH:MM)</label><input name="endTime" type="time" value="12:00" required /></div>
            <div class="field"><label>Slot length (min)</label><input name="duration" type="number" value="90" min="15" max="480" /></div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Add window</button>
        </form>
        <div class="week-grid">${weekdays.map((w,i)=>`<div class="week-row"><div class="weekday">${w}</div><div class="rule-chips">${(rulesByDay[i]||[]).map(r=>`<span class="rule-chip">${escapeHtml(r.startTime)}â€“${escapeHtml(r.endTime)} Â· ${r.duration}m Â· ${escapeHtml(r.serviceType)} <button class="rm" data-rule="${r.id}">Ã—</button></span>`).join('') || '<span class="muted small">No windows</span>'}</div></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Exceptions</h2><p>Blocked or extra hours.</p></div>
        <form id="excForm" style="margin-bottom:12px">
          <div class="field-row">
            <div class="field"><label>Type</label><select name="type"><option value="BLOCKED">Blocked</option><option value="EXTRA">Extra</option></select></div>
            <div class="field"><label>Start</label><input name="startAt" type="datetime-local" required /></div>
            <div class="field"><label>End</label><input name="endAt" type="datetime-local" required /></div>
          </div>
          <div class="field"><label>Reason</label><input name="reason" /></div>
          <button class="btn btn-outline btn-sm" type="submit">Add exception</button>
        </form>
        ${(data.exceptions||[]).map(e=>`<div class="exception-row"><div><strong>${escapeHtml(e.type)}</strong><span>${fmtDateTime(e.startAt)} â†’ ${fmtDateTime(e.endAt)}${e.reason?' Â· '+escapeHtml(e.reason):''}</span></div><button class="icon-btn danger" data-exc="${e.id}">${icon('trash')}</button></div>`).join('') || empty('No exceptions','')}
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Next 21 days</h2><p>Available vs booked slots</p></div>
        <div class="day-counts">${(data.days||[]).map(d=>`<div class="day-count"><b>${d.available}</b><span>${fmtDate(d.date+'T12:00:00+05:30','short')}</span><small>${d.booked} booked</small></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Profile settings</h2></div>
        <p class="muted small">Min notice: ${data.profile?.minNoticeHours}h Â· Buffer: ${data.profile?.bufferMinutes}m Â· Offers online: ${data.profile?.offersOnline?'yes':'no'} Â· in person: ${data.profile?.offersInPerson?'yes':'no'}</p>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'availability','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('ruleForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await API.post('/api/admin/availability/rules', Object.fromEntries(fd.entries())); toast('Window added','Slots will appear shortly.','success'); navigate('#/admin/availability'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('excForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.startAt = new Date(body.startAt).toISOString();
      body.endAt = new Date(body.endAt).toISOString();
      try { await API.post('/api/admin/availability/exceptions', body); toast('Exception added','','success'); navigate('#/admin/availability'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('regenBtn')?.addEventListener('click', async () => {
      try { const r = await API.post('/api/admin/availability/regenerate'); toast('Rebuilt', r.message, 'success'); navigate('#/admin/availability'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    qsa('[data-rule]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this window?')) return;
      try { await API.del(`/api/admin/availability/rules/${b.dataset.rule}`); navigate('#/admin/availability'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
    qsa('[data-exc]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this exception?')) return;
      try { await API.del(`/api/admin/availability/exceptions/${b.dataset.exc}`); navigate('#/admin/availability'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
  },0);
  return html;
}

// ---------- services ----------
export async function renderAdminServices() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'services'); }
  const data = await API.get('/api/admin/services');
  const inner = `
  <div class="workspace-top"><div><h1>Services</h1><p>${data.services.length} services in the catalogue</p></div><div class="workspace-top-actions"><button class="btn btn-primary btn-sm" id="addSvcBtn">Add service</button></div></div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Service</th><th>Type</th><th>Category</th><th>Duration</th><th>Featured</th><th>Active</th><th>Bookings</th><th></th></tr></thead><tbody>
    ${data.services.map(s=>`<tr>
      <td><div class="cell-main">${escapeHtml(s.name)}</div><div class="cell-sub">${escapeHtml(s.slug)}</div></td>
      <td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.category||'â€”')}</td><td>${s.duration}m</td>
      <td>${s.featured?'â˜…':''}</td><td>${s.active?'Yes':'No'}</td><td>${s.bookings}</td>
      <td><div class="table-actions"><button class="icon-btn" data-edit="${s.id}">${icon('edit')}</button><button class="icon-btn danger" data-del="${s.id}">${icon('trash')}</button></div></td>
    </tr>`).join('')}
    </tbody></table></div>
  </div>`;
  const html = workspaceLayout(inner,'services','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('addSvcBtn')?.addEventListener('click', () => openServiceModal(null, data.categories));
    qsa('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const s = data.services.find(x=>x.id===b.dataset.edit);
      openServiceModal(s, data.categories);
    }));
    qsa('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete or archive this service?')) return;
      try { const r = await API.del(`/api/admin/services/${b.dataset.del}`); toast('Done', r.message, 'success'); navigate('#/admin/services'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
  },0);
  return html;
}

function openServiceModal(s, categories) {
  const m = modal({
    title: s ? 'Edit service' : 'Add service',
    size: 'wide',
    body: `<form id="svcForm">
      <div class="field-row">
        <div class="field"><label>Name *</label><input name="name" value="${escapeHtml(s?.name||'')}" required /></div>
        <div class="field"><label>Type</label><select name="type"><option value="PUJA" ${s?.type==='PUJA'?'selected':''}>Puja</option><option value="CONSULTATION" ${s?.type==='CONSULTATION'?'selected':''}>Consultation</option></select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Category</label><select name="categoryId">${(categories||[]).map(c=>`<option value="${c.id}" ${s?.categoryId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Duration (min)</label><input name="duration" type="number" value="${s?.duration||60}" min="15" max="480" /></div>
      </div>
      <div class="field"><label>Short description</label><input name="shortDescription" value="${escapeHtml(s?.shortDescription||'')}" /></div>
      <div class="field"><label>Description</label><textarea name="description" rows="4">${escapeHtml(s?.description||'')}</textarea></div>
      <div class="field"><label>Benefits</label><textarea name="benefits" rows="3">${escapeHtml(s?.benefits||'')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Price text</label><input name="priceText" value="${escapeHtml(s?.priceText||'Discussed after request')}" /></div>
        <div class="field"><label>Preparation notes</label><input name="preparationNotes" value="${escapeHtml(s?.preparationNotes||'')}" /></div>
      </div>
      <div class="check-line"><input type="checkbox" name="featured" ${s?.featured?'checked':''} /><span>Featured</span></div>
      <div class="check-line"><input type="checkbox" name="active" ${s?.active!==false?'checked':''} /><span>Active</span></div>
    </form>`,
    actions: `<button class="btn btn-ghost" id="svcCancel">Cancel</button><button class="btn btn-primary" id="svcSave">${s?'Save':'Create'}</button>`,
  });
  document.getElementById('svcCancel').addEventListener('click', m.close);
  document.getElementById('svcSave').addEventListener('click', async () => {
    const form = document.getElementById('svcForm');
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.featured = fd.has('featured');
    body.active = fd.has('active');
    body.locations = ['CUSTOMER_HOME','TEMPLE','ONLINE','PRIEST_PLACE'];
    body.modes = ['CHAT','VOICE','VIDEO','IN_PERSON'];
    try {
      if (s) await API.put(`/api/admin/services/${s.id}`, body);
      else await API.post('/api/admin/services', body);
      toast('Saved','Service saved.','success');
      m.close();
      navigate('#/admin/services'); location.reload();
    } catch (e) { toast('Error', e.message, 'error'); }
  });
}

// ---------- events ----------
export async function renderAdminEvents() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'events'); }
  const data = await API.get('/api/admin/events');
  const inner = `
  <div class="workspace-top"><div><h1>Gatherings</h1><p>${data.events.length} events</p></div><div class="workspace-top-actions"><button class="btn btn-primary btn-sm" id="addEvtBtn">Add gathering</button></div></div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Kind</th><th>When</th><th>Venue</th><th>Seats</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.events.map(e=>`<tr>
      <td><div class="cell-main">${escapeHtml(e.title)}</div><div class="cell-sub">${escapeHtml(e.slug)}</div></td>
      <td>${escapeHtml(e.kind)}</td>
      <td class="cell-sub">${fmtDateTime(e.startAt)}</td>
      <td class="cell-sub">${escapeHtml(e.venue)}</td>
      <td>${e.seatsTaken}/${e.capacity}</td>
      <td>${badge(e.status==='PUBLISHED'?'CONFIRMED':e.status==='DRAFT'?'REQUESTED':'CANCELLED')}</td>
      <td><div class="table-actions"><a class="icon-btn" href="#/admin/events/${e.id}/registrations">${icon('user')}</a><button class="icon-btn" data-edit="${e.id}">${icon('edit')}</button><button class="icon-btn danger" data-del="${e.id}">${icon('trash')}</button></div></td>
    </tr>`).join('') || `<tr><td colspan="7">${empty('No gatherings','')}</td></tr>`}
    </tbody></table></div>
  </div>`;
  const html = workspaceLayout(inner,'events','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('addEvtBtn')?.addEventListener('click', () => openEventModal(null));
    qsa('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const e = data.events.find(x=>x.id===b.dataset.edit);
      openEventModal(e);
    }));
    qsa('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete or cancel this gathering?')) return;
      try { const r = await API.del(`/api/admin/events/${b.dataset.del}`); toast('Done', r.message, 'success'); navigate('#/admin/events'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
  },0);
  return html;
}

function openEventModal(e) {
  const m = modal({
    title: e ? 'Edit gathering' : 'Add gathering',
    size: 'wide',
    body: `<form id="evtForm">
      <div class="field"><label>Title *</label><input name="title" value="${escapeHtml(e?.title||'')}" required /></div>
      <div class="field-row">
        <div class="field"><label>Kind</label><select name="kind">${['HOMAM','GROUP_PUJA','FESTIVAL','SATSANG','WORKSHOP'].map(k=>`<option value="${k}" ${e?.kind===k?'selected':''}>${k.replace('_',' ')}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select name="status">${['DRAFT','PUBLISHED'].map(s=>`<option value="${s}" ${e?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Description</label><textarea name="description" rows="3">${escapeHtml(e?.description||'')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Start (ISO/local)</label><input name="startAt" type="datetime-local" value="${e?.startAt?e.startAt.slice(0,16):''}" required /></div>
        <div class="field"><label>End (ISO/local)</label><input name="endAt" type="datetime-local" value="${e?.endAt?e.endAt.slice(0,16):''}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Venue</label><input name="venue" value="${escapeHtml(e?.venue||'')}" /></div>
        <div class="field"><label>Venue address</label><input name="venueAddress" value="${escapeHtml(e?.venueAddress||'')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Capacity</label><input name="capacity" type="number" value="${e?.capacity||50}" min="1" /></div>
        <div class="field"><label>Max per registration</label><input name="maxPerRegistration" type="number" value="${e?.maxPerRegistration||4}" min="1" /></div>
      </div>
      <div class="field"><label>Rituals (comma text)</label><input name="rituals" value="${escapeHtml(e?.rituals||'')}" /></div>
      <div class="field"><label>Instructions</label><textarea name="instructions" rows="2">${escapeHtml(e?.instructions||'')}</textarea></div>
      <div class="check-line"><input type="checkbox" name="online" ${e?.online?'checked':''} /><span>Online option available</span></div>
      <div class="check-line"><input type="checkbox" name="featured" ${e?.featured?'checked':''} /><span>Featured</span></div>
    </form>`,
    actions: `<button class="btn btn-ghost" id="evtCancel">Cancel</button><button class="btn btn-primary" id="evtSave">${e?'Save':'Create'}</button>`,
  });
  document.getElementById('evtCancel').addEventListener('click', m.close);
  document.getElementById('evtSave').addEventListener('click', async () => {
    const form = document.getElementById('evtForm');
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.online = fd.has('online');
    body.featured = fd.has('featured');
    body.startAt = new Date(body.startAt).toISOString();
    if (body.endAt) body.endAt = new Date(body.endAt).toISOString();
    try {
      if (e) await API.put(`/api/admin/events/${e.id}`, body);
      else await API.post('/api/admin/events', body);
      toast('Saved','Gathering saved.','success');
      m.close();
      navigate('#/admin/events'); location.reload();
    } catch (err) { toast('Error', err.message, 'error'); }
  });
}

export async function renderAdminEventRegistrations(params) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'events'); }
  const data = await API.get(`/api/admin/events/${params.id}/registrations`);
  const inner = `
  <div class="workspace-top"><div><h1>Registrations</h1><p>${escapeHtml(data.event.title)} Â· ${data.registrations.length} registrations</p></div><div class="workspace-top-actions"><a class="btn btn-outline btn-sm" href="#/admin/events">â† Gatherings</a></div></div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Ref</th><th>Customer</th><th>Seats</th><th>Mode</th><th>Status</th><th>Checked in</th><th></th></tr></thead><tbody>
    ${data.registrations.map(r=>`<tr>
      <td class="cell-main">${escapeHtml(r.ref)}</td>
      <td><div class="cell-main">${escapeHtml(r.name)}</div><div class="cell-sub">${escapeHtml(r.phone)}</div></td>
      <td>${r.seats}</td><td>${escapeHtml(r.mode)}</td><td>${escapeHtml(r.status)}</td>
      <td class="cell-sub">${r.checkedInAt?fmtDateTime(r.checkedInAt):'â€”'}</td>
      <td>${r.checkedInAt?'':`<button class="btn btn-outline btn-sm" data-checkin="${r.id}">Check in</button>`}</td>
    </tr>`).join('') || `<tr><td colspan="7">${empty('No registrations','')}</td></tr>`}
    </tbody></table></div>
  </div>
  ${data.waitlist?.length?`<div class="workspace-panel"><div class="workspace-panel-head"><h2>Waitlist</h2></div><div class="mini-list">${data.waitlist.map(w=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(w.customer_name)}</strong><span>${w.seats_wanted} seats Â· position ${w.position}</span></div><span>${escapeHtml(w.customer_phone)}</span></div>`).join('')}</div></div>`:''}`;
  const html = workspaceLayout(inner,'events','admin');
  wireWorkspace();
  setTimeout(() => {
    qsa('[data-checkin]').forEach(b => b.addEventListener('click', async () => {
      try { await API.post(`/api/admin/registrations/${b.dataset.checkin}/check-in`); toast('Checked in','','success'); navigate(location.hash); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
  },0);
  return html;
}

// ---------- customers ----------
export async function renderAdminCustomers(query = {}) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'customers'); }
  const params = new URLSearchParams(); if (query.q) params.set('q', query.q); if (query.page) params.set('page', query.page);
  const data = await API.get('/api/admin/customers' + (params.toString()?'?'+params.toString():''));
  const inner = `
  <div class="workspace-top"><div><h1>Customers</h1><p>${data.total} customers</p></div></div>
  <div class="filter-bar">
    <input id="custQ" placeholder="Search name, phone, email, city" value="${escapeHtml(query.q||'')}" style="min-width:260px" />
    <button class="btn btn-primary btn-sm" id="custSearch">Search</button>
  </div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Bookings</th><th>Completed</th><th>Last booking</th><th></th></tr></thead><tbody>
    ${data.customers.map(c=>`<tr>
      <td class="cell-main">${escapeHtml(c.fullName)}</td>
      <td class="cell-sub">${escapeHtml(c.phone||'â€”')}</td>
      <td>${escapeHtml(c.city||'â€”')}</td>
      <td>${c.bookingCount}</td><td>${c.completedCount}</td>
      <td class="cell-sub">${c.lastBookingAt?fmtDate(c.lastBookingAt,'short'):'â€”'}</td>
      <td><a class="btn btn-ghost btn-sm" href="#/admin/customers/${c.id}">Open</a></td>
    </tr>`).join('') || `<tr><td colspan="7">${empty('No customers','')}</td></tr>`}
    </tbody></table></div>
  </div>`;
  const html = workspaceLayout(inner,'customers','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('custSearch')?.addEventListener('click', () => {
      const q = document.getElementById('custQ').value;
      navigate('#/admin/customers' + (q?'?q='+encodeURIComponent(q):''));
    });
  },0);
  return html;
}

export async function renderAdminCustomerDetail(params) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'customers'); }
  const data = await API.get(`/api/admin/customers/${params.id}`);
  const c = data.customer;
  const inner = `
  <div class="workspace-top"><div><h1>${escapeHtml(c.fullName)}</h1><p>${escapeHtml(c.phone||'')} Â· ${escapeHtml(c.email||'')}</p></div><div class="workspace-top-actions"><a class="btn btn-outline btn-sm" href="#/admin/customers">â† Customers</a></div></div>
  <div class="panel-grid">
    <div>
      <div class="workspace-panel"><div class="workspace-panel-head"><h2>Bookings</h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Ref</th><th>Service</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
        ${data.bookings.map(b=>`<tr><td class="cell-main">${escapeHtml(b.ref)}</td><td>${escapeHtml(b.service?.name||b.type)}</td><td class="cell-sub">${fmtDate(b.preferredStartAt,'short')}</td><td>${badge(b.status)}</td><td><a class="btn btn-ghost btn-sm" href="#/admin/bookings/${b.ref}">Open</a></td></tr>`).join('') || `<tr><td colspan="5">${empty('No bookings','')}</td></tr>`}
        </tbody></table></div>
      </div>
    </div>
    <div>
      <div class="workspace-panel"><div class="workspace-panel-head"><h2>Profiles</h2></div>
        <div class="mini-list">${data.profiles.map(p=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(p.fullName)}</strong><span>${fmtDate(p.dateOfBirth,'date')} Â· ${escapeHtml(p.placeOfBirth)}</span></div></div>`).join('') || empty('None','')}</div>
      </div>
      <div class="workspace-panel"><div class="workspace-panel-head"><h2>Addresses</h2></div>
        <div class="mini-list">${data.addresses.map(a=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(a.label)}</strong><span>${escapeHtml(a.line1)}, ${escapeHtml(a.city)}</span></div></div>`).join('') || empty('None','')}</div>
      </div>
      <div class="workspace-panel"><div class="workspace-panel-head"><h2>Consents</h2></div>
        <div class="mini-list">${data.consents.map(c=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(c.consent_type)}</strong><span>v${escapeHtml(c.policy_version)} Â· ${fmtDate(c.granted_at,'short')}</span></div></div>`).join('') || empty('None','')}</div>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'customers','admin');
  wireWorkspace();
  return html;
}

// ---------- pandit profile ----------
export async function renderAdminPandit() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'pandit'); }
  const data = await API.get('/api/admin/pandit');
  const p = data.pandit;
  const inner = `
  <div class="workspace-top"><div><h1>Pandit profile</h1><p>Public identity and practice details</p></div></div>
  <div class="workspace-panel">
    <form id="panditForm">
      <div class="field-row">
        <div class="field"><label>Name</label><input name="name" value="${escapeHtml(p.name)}" required /></div>
        <div class="field"><label>Title line</label><input name="title" value="${escapeHtml(data.settings?.['site.pandit_title']||'')}" /></div>
      </div>
      <div class="field"><label>Headline</label><input name="headline" value="${escapeHtml(p.headline||'')}" /></div>
      <div class="field"><label>Bio</label><textarea name="bio" rows="6">${escapeHtml(p.bio||'')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>City</label><input name="city" value="${escapeHtml(p.city||'')}" /></div>
        <div class="field"><label>Experience (years)</label><input name="experience" type="number" value="${p.experience||0}" min="0" max="80" /></div>
        <div class="field"><label>Tradition</label><input name="tradition" value="${escapeHtml(p.tradition||'')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Languages (comma)</label><input name="languages" value="${escapeHtml((p.languages||[]).join(', '))}" /></div>
        <div class="field"><label>Specialisations (comma)</label><input name="specializations" value="${escapeHtml((p.specializations||[]).join(', '))}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Consultation heading</label><input name="consultHeading" value="${escapeHtml(data.settings?.['site.consult_heading']||'')}" /></div>
        <div class="field"><label>Practice since (year)</label><input name="since" value="${escapeHtml(data.settings?.['site.pandit_since']||'')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Min notice (hours)</label><input name="minNoticeHours" type="number" value="${p.minNoticeHours||12}" min="1" max="168" /></div>
        <div class="field"><label>Service radius (km)</label><input name="serviceRadiusKm" type="number" value="${p.serviceRadiusKm||35}" min="0" max="500" /></div>
      </div>
      <div class="check-line"><input type="checkbox" name="offersOnline" ${p.offersOnline?'checked':''} /><span>Offers online</span></div>
      <div class="check-line" style="margin-bottom:14px"><input type="checkbox" name="offersInPerson" ${p.offersInPerson?'checked':''} /><span>Offers in person</span></div>
      <div class="check-line" style="margin-bottom:14px"><input type="checkbox" name="active" ${p.active?'checked':''} /><span>Active on the public site</span></div>
      <button class="btn btn-primary" type="submit">Save profile</button>
    </form>
  </div>`;
  const html = workspaceLayout(inner,'pandit','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('panditForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.languages = (body.languages||'').split(',').map(s=>s.trim()).filter(Boolean);
      body.specializations = (body.specializations||'').split(',').map(s=>s.trim()).filter(Boolean);
      body.offersOnline = fd.has('offersOnline');
      body.offersInPerson = fd.has('offersInPerson');
      body.active = fd.has('active');
      try { await API.put('/api/admin/pandit', body); toast('Saved','Pandit profile updated.','success'); navigate('#/admin/pandit'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
  },0);
  return html;
}

// ---------- messages ----------
export async function renderAdminMessages() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'messages'); }
  const [enq, rev] = await Promise.all([API.get('/api/admin/enquiries'), API.get('/api/admin/reviews')]);
  const inner = `
  <div class="workspace-top"><div><h1>Messages</h1><p>Enquiries and reviews</p></div></div>
  <div class="tabs">
    <button class="tab active" data-tab="enq" data-tab-group="msg">Enquiries (${enq.enquiries.length})</button>
    <button class="tab" data-tab="rev" data-tab-group="msg">Reviews (${rev.reviews.length})</button>
  </div>
  <div data-panel-group="msg" data-panel="enq">
    <div class="workspace-panel" style="padding:0">
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Subject</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
      ${enq.enquiries.map(e=>`<tr>
        <td><div class="cell-main">${escapeHtml(e.name)}</div><div class="cell-sub">${escapeHtml(e.phone||e.email||'')}</div></td>
        <td>${escapeHtml(e.subject)}</td>
        <td class="cell-sub">${escapeHtml((e.message||'').slice(0,80))}</td>
        <td><select data-enq="${e.id}" class="enqStatus" style="min-height:28px;border:1px solid var(--line);border-radius:6px;background:var(--paper);font-size:.7rem"><option ${e.status==='NEW'?'selected':''}>NEW</option><option ${e.status==='IN_PROGRESS'?'selected':''}>IN_PROGRESS</option><option ${e.status==='CLOSED'?'selected':''}>CLOSED</option></select></td>
        <td class="cell-sub">${fmtDate(e.createdAt,'short')}</td>
      </tr>`).join('') || `<tr><td colspan="5">${empty('No enquiries','')}</td></tr>`}
      </tbody></table></div>
    </div>
  </div>
  <div data-panel-group="msg" data-panel="rev" class="hide">
    <div class="workspace-panel" style="padding:0">
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Customer</th><th>Rating</th><th>Title</th><th>Comment</th><th>Published</th><th></th></tr></thead><tbody>
      ${rev.reviews.map(r=>`<tr>
        <td class="cell-main">${escapeHtml(r.name)}</td>
        <td>${stars(r.rating)}</td>
        <td>${escapeHtml(r.title||'')}</td>
        <td class="cell-sub">${escapeHtml((r.comment||'').slice(0,90))}</td>
        <td>${r.published?'Yes':'No'}</td>
        <td><button class="btn btn-ghost btn-sm" data-rev="${r.id}">Edit</button></td>
      </tr>`).join('') || `<tr><td colspan="6">${empty('No reviews','')}</td></tr>`}
      </tbody></table></div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'messages','admin');
  wireWorkspace();
  setTimeout(() => {
    qsa('.enqStatus').forEach(sel => sel.addEventListener('change', async () => {
      try { await API.put(`/api/admin/enquiries/${sel.dataset.enq}`, { status: sel.value }); toast('Updated','','success'); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
    qsa('[data-rev]').forEach(b => b.addEventListener('click', () => {
      const r = rev.reviews.find(x=>x.id===b.dataset.rev);
      const m = modal({
        title: 'Review',
        body: `<p><strong>${escapeHtml(r.name)}</strong> Â· ${stars(r.rating)}</p><p style="margin:8px 0">${escapeHtml(r.comment)}</p>
          <div class="field"><label>Reply from Pandit ji</label><textarea id="replyText">${escapeHtml(r.reply||'')}</textarea></div>
          <div class="check-line"><input type="checkbox" id="pubCheck" ${r.published?'checked':''} /><span>Published on the site</span></div>`,
        actions: `<button class="btn btn-ghost" id="revCancel">Cancel</button><button class="btn btn-primary" id="revSave">Save</button>`,
      });
      document.getElementById('revCancel').addEventListener('click', m.close);
      document.getElementById('revSave').addEventListener('click', async () => {
        try {
          await API.put(`/api/admin/reviews/${r.id}`, { reply: document.getElementById('replyText').value, published: document.getElementById('pubCheck').checked });
          toast('Saved','','success'); m.close(); navigate('#/admin/messages'); location.reload();
        } catch (e) { toast('Error', e.message, 'error'); }
      });
    }));
  },0);
  return html;
}

// ---------- notifications ----------
export async function renderAdminNotifications() {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'notifications'); }
  const data = await API.get('/api/admin/notifications');
  const inner = `
  <div class="workspace-top"><div><h1>Notifications</h1><p>${data.stats.pending} pending Â· ${data.stats.delivered} delivered Â· ${data.stats.recipients} recipients</p></div>
    <div class="workspace-top-actions"><button class="btn btn-outline btn-sm" id="processBtn">Process outbox</button></div></div>
  <div class="panel-grid">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Recipients</h2><button class="btn btn-primary btn-sm" id="addRecipientBtn">Add</button></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Channel</th><th>Address</th><th>Types</th><th>Active</th><th></th></tr></thead><tbody>
        ${data.recipients.map(r=>`<tr><td class="cell-main">${escapeHtml(r.name)}</td><td>${escapeHtml(r.channel)}</td><td class="cell-sub">${escapeHtml(r.address)}</td><td class="cell-sub">${escapeHtml((r.bookingTypes||[]).join(', '))}</td><td>${r.active?'Yes':'No'}</td><td><button class="icon-btn danger" data-delrec="${r.id}">${icon('trash')}</button></td></tr>`).join('') || `<tr><td colspan="6">${empty('No recipients','')}</td></tr>`}
        </tbody></table></div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Outbox</h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Code</th><th>Channel</th><th>To</th><th>Booking</th><th>Status</th><th>Sent</th></tr></thead><tbody>
        ${data.outbox.map(o=>`<tr><td class="cell-main">${escapeHtml(o.code)}</td><td>${escapeHtml(o.channel)}</td><td class="cell-sub">${escapeHtml(o.address)}</td><td class="cell-sub">${escapeHtml(o.bookingRef||'â€”')}</td><td>${escapeHtml(o.status)}</td><td class="cell-sub">${o.sentAt?fmtDate(o.sentAt,'short'):'â€”'}</td></tr>`).join('') || `<tr><td colspan="6">${empty('Empty','')}</td></tr>`}
        </tbody></table></div>
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Templates</h2></div>
        <div class="mini-list">${data.templates.map(t=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(t.code)}</strong><span>${escapeHtml(t.channel)} Â· ${escapeHtml((t.subject||'').slice(0,40))}</span></div><button class="btn btn-ghost btn-sm" data-tpl="${t.id}">Edit</button></div>`).join('')}</div>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'notifications','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('processBtn')?.addEventListener('click', async () => {
      try { const r = await API.post('/api/admin/notifications/process'); toast('Processed', r.message, 'success'); navigate('#/admin/notifications'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    });
    document.getElementById('addRecipientBtn')?.addEventListener('click', () => {
      const m = modal({
        title: 'Add recipient',
        body: `<form id="recForm">
          <div class="field"><label>Name</label><input name="name" required /></div>
          <div class="field"><label>Channel</label><select name="channel"><option>EMAIL</option><option>WHATSAPP</option><option>SMS</option></select></div>
          <div class="field"><label>Address</label><input name="address" required /></div>
          <div class="field"><label>Booking types (comma)</label><input name="bookingTypes" value="PUJA, CONSULTATION, EVENT" /></div>
        </form>`,
        actions: `<button class="btn btn-ghost" id="recCancel">Cancel</button><button class="btn btn-primary" id="recSave">Add</button>`,
      });
      document.getElementById('recCancel').addEventListener('click', m.close);
      document.getElementById('recSave').addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('recForm'));
        const body = Object.fromEntries(fd.entries());
        body.bookingTypes = (body.bookingTypes||'').split(',').map(s=>s.trim()).filter(Boolean);
        try { await API.post('/api/admin/notifications/recipients', body); toast('Added','','success'); m.close(); navigate('#/admin/notifications'); location.reload(); }
        catch (e) { toast('Error', e.message, 'error'); }
      });
    });
    qsa('[data-delrec]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this recipient?')) return;
      try { await API.del(`/api/admin/notifications/recipients/${b.dataset.delrec}`); navigate('#/admin/notifications'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
    qsa('[data-tpl]').forEach(b => b.addEventListener('click', () => {
      const t = data.templates.find(x=>x.id===b.dataset.tpl);
      const m = modal({
        title: 'Edit template',
        size: 'wide',
        body: `<form id="tplForm">
          <div class="field"><label>Subject</label><input name="subject" value="${escapeHtml(t.subject||'')}" /></div>
          <div class="field"><label>Body</label><textarea name="body" rows="8">${escapeHtml(t.body)}</textarea></div>
        </form>`,
        actions: `<button class="btn btn-ghost" id="tplCancel">Cancel</button><button class="btn btn-primary" id="tplSave">Save</button>`,
      });
      document.getElementById('tplCancel').addEventListener('click', m.close);
      document.getElementById('tplSave').addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('tplForm'));
        try { await API.put(`/api/admin/notifications/templates/${t.id}`, Object.fromEntries(fd.entries())); toast('Saved','','success'); m.close(); navigate('#/admin/notifications'); location.reload(); }
        catch (e) { toast('Error', e.message, 'error'); }
      });
    }));
  },0);
  return html;
}

// ---------- reports ----------
export async function renderAdminReports(query = {}) {
  if (!state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'reports'); }
  const from = query.from || new Date(new Date().setDate(1)).toISOString().slice(0,10);
  const to = query.to || new Date().toISOString().slice(0,10);
  const data = await API.get(`/api/admin/reports?from=${from}&to=${to}`);
  const t = data.totals || {};
  const inner = `
  <div class="workspace-top"><div><h1>Reports</h1><p>${fmtDate(from+'T12:00:00+05:30','date')} â€” ${fmtDate(to+'T12:00:00+05:30','date')}</p></div>
    <div class="workspace-top-actions">
      <input type="date" id="fromDate" value="${escapeHtml(from)}" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--paper)" />
      <input type="date" id="toDate" value="${escapeHtml(to)}" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--paper)" />
      <button class="btn btn-primary btn-sm" id="applyDates">Apply</button>
      <a class="btn btn-outline btn-sm" href="/api/admin/export/bookings" target="_blank">CSV bookings</a>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Bookings</div><strong>${t.bookings||0}</strong></div>
    <div class="kpi"><div class="kpi-label">Confirmed</div><strong>${t.confirmed||0}</strong></div>
    <div class="kpi"><div class="kpi-label">Completed</div><strong>${t.completed||0}</strong></div>
    <div class="kpi"><div class="kpi-label">Cancelled</div><strong>${t.cancelled||0}</strong></div>
    <div class="kpi"><div class="kpi-label">Completion rate</div><strong>${t.completionRate||0}%</strong></div>
    <div class="kpi"><div class="kpi-label">Agreed</div><strong>â‚¹${(t.totalAgreed||0).toLocaleString('en-IN')}</strong></div>
    <div class="kpi"><div class="kpi-label">Received</div><strong>â‚¹${(t.totalReceived||0).toLocaleString('en-IN')}</strong></div>
    <div class="kpi"><div class="kpi-label">Avg rating</div><strong>${t.avgRating||0}</strong><small>${t.reviewCount||0} reviews</small></div>
  </div>
  <div class="panel-grid">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>By status</h2></div>
        <div class="mini-list">${Object.entries(data.byStatus||{}).map(([k,v])=>`<div class="mini-row"><div class="grow"><strong>${statusLabel(k)}</strong></div><strong>${v}</strong></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>By type</h2></div>
        <div class="mini-list">${Object.entries(data.byType||{}).map(([k,v])=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(k)}</strong></div><strong>${v}</strong></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Daily trend</h2></div>
        <div class="trend-bars">${(data.daily||[]).map(d=>`<div class="trend-bar"><b>${d.count}</b><div class="bar" style="height:${Math.max(4,d.count*14)}px"></div><span>${fmtDate(d.date+'T12:00:00+05:30','short')}</span></div>`).join('')}</div>
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Top services</h2></div>
        <div class="mini-list">${(data.topServices||[]).map(s=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(s.name)}</strong></div><strong>${s.count}</strong></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Exports</h2></div>
        <div class="quick-links">
          <a class="quick-link" href="/api/admin/export/bookings" target="_blank">Bookings CSV ${icon('chevRight')}</a>
          <a class="quick-link" href="/api/admin/export/customers" target="_blank">Customers CSV ${icon('chevRight')}</a>
          <a class="quick-link" href="/api/admin/export/reviews" target="_blank">Reviews CSV ${icon('chevRight')}</a>
          <a class="quick-link" href="/api/admin/export/enquiries" target="_blank">Enquiries CSV ${icon('chevRight')}</a>
          <a class="quick-link" href="/api/admin/export/audit" target="_blank">Audit CSV ${icon('chevRight')}</a>
          <a class="quick-link" href="/api/admin/payments/export.csv" target="_blank">Payments CSV ${icon('chevRight')}</a>
        </div>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'reports','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('applyDates')?.addEventListener('click', () => {
      const f = document.getElementById('fromDate').value;
      const t = document.getElementById('toDate').value;
      navigate(`#/admin/reports?from=${f}&to=${t}`);
    });
  },0);
  return html;
}

// ---------- settings ----------
export async function renderAdminSettings() {
  if (!state.user?.isOwner) { navigate('#/login'); return workspaceLayout(spinner(),'settings'); }
  const data = await API.get('/api/admin/settings');
  const settings = data.settings || [];
  const grouped = {};
  settings.forEach(s => { const k = s.key.split('.')[0]; (grouped[k] ||= []).push(s); });
  const inner = `
  <div class="workspace-top"><div><h1>Settings</h1><p>Every setting that drives the site</p></div></div>
  <div class="workspace-panel">
    <form id="settingsForm">
      ${Object.entries(grouped).map(([group, list]) => `
        <h3 class="display" style="font-size:1.3rem;margin:18px 0 10px;text-transform:capitalize">${escapeHtml(group)}</h3>
        ${list.map(s => `<div class="field"><label>${escapeHtml(s.key)} <small style="text-transform:none;letter-spacing:0;color:var(--muted-2)">${escapeHtml(s.description||'')}</small></label>
          <input name="${escapeHtml(s.key)}" value="${escapeHtml(typeof s.value === 'object' ? JSON.stringify(s.value) : (s.value ?? ''))}" /></div>`).join('')}
      `).join('')}
      <button class="btn btn-primary" type="submit" style="margin-top:14px">Save all settings</button>
    </form>
  </div>
  <div class="workspace-panel">
    <div class="workspace-panel-head"><h2>Audit log</h2><a class="text-link" href="#/admin/audit">View full log ${icon('arrow')}</a></div>
  </div>`;
  const html = workspaceLayout(inner,'settings','admin');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const settings = {};
      for (const [k,v] of fd.entries()) {
        try { settings[k] = JSON.parse(v); } catch { settings[k] = v; }
      }
      try { const r = await API.put('/api/admin/settings', { settings }); toast('Saved', r.message, 'success'); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
  },0);
  return html;
}

export async function renderAdminAudit() {
  if (!state.user?.isOwner) { navigate('#/login'); return workspaceLayout(spinner(),'settings'); }
  const data = await API.get('/api/admin/audit');
  const inner = `
  <div class="workspace-top"><div><h1>Audit log</h1><p>${data.total} entries</p></div><div class="workspace-top-actions"><a class="btn btn-outline btn-sm" href="#/admin/settings">â† Settings</a></div></div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead><tbody>
    ${data.logs.map(l=>`<tr><td class="cell-sub">${fmtDateTime(l.createdAt)}</td><td>${escapeHtml(l.userName)}</td><td class="cell-main">${escapeHtml(l.action)}</td><td class="cell-sub">${escapeHtml(l.entityType||'')} ${escapeHtml(l.entityId||'')}</td><td class="cell-sub">${escapeHtml(l.ip||'')}</td></tr>`).join('') || `<tr><td colspan="5">${empty('No entries','')}</td></tr>`}
    </tbody></table></div>
  </div>`;
  const html = workspaceLayout(inner,'settings','admin');
  wireWorkspace();
  return html;
}

// ---------- provider ----------
export async function renderProviderDashboard() {
  if (!state.user?.provider && !state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'dashboard'); }
  const d = await API.get('/api/provider/dashboard');
  const p = d.profile || {};
  const inner = `
  <div class="workspace-top"><div><h1>Namaste, ${escapeHtml(state.user.fullName.split(' ')[0])}</h1><p>${escapeHtml(p.headline||'')} Â· ${escapeHtml(p.city||'')}</p></div></div>
  <div class="kpi-grid">
    <div class="kpi attention"><div class="kpi-label">${icon('clock')} Pending</div><strong>${d.counts.pending}</strong><small>Awaiting contact</small></div>
    <div class="kpi"><div class="kpi-label">${icon('check')} Confirmed</div><strong>${d.counts.confirmed}</strong><small>Upcoming</small></div>
    <div class="kpi"><div class="kpi-label">${icon('spark')} Completed</div><strong>${d.counts.completed}</strong><small>All time</small></div>
    <div class="kpi"><div class="kpi-label">${icon('calendar')} This week</div><strong>${d.counts.thisWeek}</strong><small>Requests</small></div>
  </div>
  <div class="panel-grid">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Today</h2><p>${fmtDate(new Date().toISOString(),'long')}</p></div>
        <div class="mini-list">${(d.today||[]).map(b=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(b.name)}</strong><span>${escapeHtml(b.service)} Â· ${escapeHtml(b.time)}</span></div>${badge(b.status)}<a class="btn btn-ghost btn-sm" href="#/provider/bookings/${b.ref}">Open</a></div>`).join('') || empty('Nothing scheduled today','')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Needs attention</h2></div>
        <div class="mini-list">${(d.attention||[]).map(b=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(b.customerName)}</strong><span>${escapeHtml(b.service?.name||b.type)} Â· ${escapeHtml(b.ref)}</span></div>${badge(b.status)}<a class="btn btn-ghost btn-sm" href="#/provider/bookings/${b.ref}">Open</a></div>`).join('') || empty('All caught up','')}</div>
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Upcoming</h2></div>
        <div class="mini-list">${(d.upcoming||[]).map(b=>`<div class="mini-row"><div class="grow"><strong>${escapeHtml(b.name)}</strong><span>${escapeHtml(b.service)} Â· ${fmtDateTime(b.startAt)}</span></div></div>`).join('') || empty('None','')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Quick links</h2></div>
        <div class="quick-links">
          <a class="quick-link" href="#/provider/bookings">My bookings ${icon('chevRight')}</a>
          <a class="quick-link" href="#/provider/schedule">Schedule ${icon('chevRight')}</a>
          <a class="quick-link" href="#/provider/availability">Availability ${icon('chevRight')}</a>
          <a class="quick-link" href="#/provider/profile">Profile ${icon('chevRight')}</a>
        </div>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'dashboard','provider');
  wireWorkspace();
  return html;
}

export async function renderProviderBookings(query = {}) {
  if (!state.user?.provider && !state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'bookings'); }
  const data = await API.get('/api/provider/bookings' + (query.status?`?status=${query.status}`:''));
  const inner = `
  <div class="workspace-top"><div><h1>My bookings</h1><p>${data.total} bookings</p></div></div>
  <div class="filter-bar">
    ${['','REQUESTED','CONTACTED','CONFIRMED','COMPLETED'].map(s=>`<button class="filter-chip ${ (query.status||'')===s?'active':''}" data-pstatus="${s}">${s||'All'}</button>`).join('')}
  </div>
  <div class="workspace-panel" style="padding:0">
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Ref</th><th>Customer</th><th>Service</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.bookings.map(b=>`<tr><td class="cell-main">${escapeHtml(b.ref)}</td><td><div class="cell-main">${escapeHtml(b.customerName)}</div><div class="cell-sub">${escapeHtml(b.customerPhone)}</div></td><td>${escapeHtml(b.service?.name||b.type)}</td><td class="cell-sub">${fmtDate(b.preferredStartAt,'short')}</td><td>${badge(b.status)}</td><td><a class="btn btn-ghost btn-sm" href="#/provider/bookings/${b.ref}">Open</a></td></tr>`).join('') || `<tr><td colspan="6">${empty('No bookings','')}</td></tr>`}
    </tbody></table></div>
  </div>`;
  const html = workspaceLayout(inner,'bookings','provider');
  wireWorkspace();
  setTimeout(() => {
    qsa('[data-pstatus]').forEach(b => b.addEventListener('click', () => {
      const s = b.dataset.pstatus;
      navigate('#/provider/bookings' + (s?`?status=${s}`:''));
    }));
  },0);
  return html;
}

export async function renderProviderBookingDetail(params) {
  if (!state.user?.provider && !state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'bookings'); }
  const data = await API.get(`/api/provider/bookings/${params.ref}`);
  const b = data.booking;
  const inner = `
  <div class="workspace-top"><div><h1>${escapeHtml(b.ref)}</h1><p>${escapeHtml(b.service?.name||b.type)} Â· ${escapeHtml(b.statusLabel)}</p></div><div class="workspace-top-actions"><a class="btn btn-outline btn-sm" href="#/provider/bookings">â† Back</a></div></div>
  <div class="request-layout">
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Details</h2></div>
        <div class="request-meta">
          <div><dt>Customer</dt><dd>${escapeHtml(b.customerName)}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(b.customerPhone)}</dd></div>
          <div><dt>Preferred time</dt><dd>${fmtDateTime(b.preferredStartAt)}</dd></div>
          <div><dt>Confirmed time</dt><dd>${b.confirmedStartAt?fmtDateTime(b.confirmedStartAt):'â€”'}</dd></div>
          ${b.specialRequests?`<div class="full"><dt>Special requests</dt><dd>${escapeHtml(b.specialRequests)}</dd></div>`:''}
          ${b.puja?`<div class="full"><dt>Puja</dt><dd>${escapeHtml(b.puja.locationType.replace('_',' '))} Â· ${escapeHtml(b.puja.occasion)} Â· ${b.puja.attendeeEstimate} attendees</dd></div>`:''}
          ${b.consultation?`<div class="full"><dt>Consultation</dt><dd>${escapeHtml(b.consultation.mode)} Â· ${escapeHtml((b.consultation.topics||[]).join(', '))}</dd></div>`:''}
          ${b.birthDetails?.length?`<div class="full"><dt>Birth details</dt><dd>${b.birthDetails.map(p=>escapeHtml(p.name+' Â· '+p.dateOfBirth+' Â· '+p.place)).join('; ')}</dd></div>`:''}
        </div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Timeline</h2></div>
        <div class="timeline compact">${(b.history||[]).map(h=>`<div class="timeline-item"><div class="timeline-dot"></div><div><strong>${escapeHtml(h.toLabel)}</strong><span> Â· ${fmtDateTime(h.at)}</span></div></div>`).join('')}</div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Notes</h2></div>
        ${(b.notes||[]).map(n=>`<div class="note-item"><strong>${escapeHtml(n.author_name)}</strong><p>${escapeHtml(n.note)}</p><span>${fmtDateTime(n.created_at)}</span></div>`).join('') || `<p class="muted small">No notes.</p>`}
        <form id="noteForm" style="margin-top:10px"><div class="field"><textarea name="note" required></textarea></div><button class="btn btn-outline btn-sm" type="submit">Add note</button></form>
      </div>
    </div>
    <div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Actions</h2></div>
        <div class="stack">
          ${b.can.confirm?`<button class="btn btn-primary btn-block btn-sm" id="confirmBtn">Confirm booking</button>`:''}
          ${b.can.complete?`<button class="btn btn-primary btn-block btn-sm" id="completeBtn">Mark completed</button>`:''}
        </div>
      </div>
      <div class="workspace-panel">
        <div class="workspace-panel-head"><h2>Contact log</h2></div>
        <form id="contactForm">
          <div class="field"><label>Channel</label><select name="channel"><option>CALL</option><option>WHATSAPP</option><option>SMS</option><option>EMAIL</option></select></div>
          <div class="field"><label>Outcome</label><select name="outcome"><option>REACHED</option><option>NO_ANSWER</option></select></div>
          <div class="field"><label>Summary</label><textarea name="summary" required></textarea></div>
          <button class="btn btn-outline btn-sm btn-block" type="submit">Log contact</button>
        </form>
      </div>
    </div>
  </div>`;
  const html = workspaceLayout(inner,'bookings','provider');
  wireWorkspace();
  setTimeout(() => {
    const ref = b.ref;
    const reload = () => navigate(`#/provider/bookings/${ref}`);
    document.getElementById('noteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await API.post(`/api/provider/bookings/${ref}/notes`, { note: fd.get('note') }); toast('Note added','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await API.post(`/api/provider/bookings/${ref}/contact`, Object.fromEntries(fd.entries())); toast('Logged','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('confirmBtn')?.addEventListener('click', async () => {
      try { await API.post(`/api/provider/bookings/${ref}/confirm`, {}); toast('Confirmed','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('completeBtn')?.addEventListener('click', async () => {
      try { await API.post(`/api/provider/bookings/${ref}/complete`); toast('Completed','','success'); reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
  },0);
  return html;
}

export async function renderProviderSchedule() {
  if (!state.user?.provider && !state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'schedule'); }
  const data = await API.get('/api/provider/schedule');
  const inner = `
  <div class="workspace-top"><div><h1>Schedule</h1><p>${fmtDate(data.from+'T12:00:00+05:30','date')} â€” ${fmtDate(data.to+'T12:00:00+05:30','date')}</p></div></div>
  <div class="workspace-panel">
    <div class="agenda-list">${(data.bookings||[]).map(b=>`<div class="agenda-row"><div class="agenda-time">${fmtTime(b.startAt)}<br>${fmtDate(b.startAt,'short')}</div><div class="agenda-body"><strong>${escapeHtml(b.name)} Â· ${escapeHtml(b.service)}</strong><span>${escapeHtml(b.ref)} Â· ${escapeHtml(b.statusLabel)}</span></div><a class="btn btn-ghost btn-sm" href="#/provider/bookings/${b.ref}">Open</a></div>`).join('') || empty('No bookings in range','')}</div>
  </div>
  ${data.exceptions?.length?`<div class="workspace-panel"><div class="workspace-panel-head"><h2>Exceptions</h2></div>${data.exceptions.map(e=>`<div class="exception-row"><div><strong>${escapeHtml(e.type)}</strong><span>${fmtDateTime(e.startAt)} â†’ ${fmtDateTime(e.endAt)}${e.reason?' Â· '+escapeHtml(e.reason):''}</span></div></div>`).join('')}</div>`:''}`;
  const html = workspaceLayout(inner,'schedule','provider');
  wireWorkspace();
  return html;
}

export async function renderProviderAvailability() {
  if (!state.user?.provider && !state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'availability'); }
  const data = await API.get('/api/provider/availability');
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const rulesByDay = {};
  (data.rules||[]).forEach(r => { (rulesByDay[r.weekday] ||= []).push(r); });
  const inner = `
  <div class="workspace-top"><div><h1>Availability</h1><p>Weekly windows and exceptions</p></div>
    <div class="workspace-top-actions"><button class="btn btn-primary btn-sm" id="regenBtn">Rebuild slots</button></div></div>
  <div class="workspace-panel">
    <form id="ruleForm" style="margin-bottom:14px">
      <div class="field-row">
        <div class="field"><label>Weekday</label><select name="weekday">${weekdays.map((w,i)=>`<option value="${i}">${w}</option>`).join('')}</select></div>
        <div class="field"><label>Service type</label><select name="serviceType"><option value="PUJA">Puja</option><option value="CONSULTATION">Consultation</option></select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Start</label><input name="startTime" type="time" value="07:00" required /></div>
        <div class="field"><label>End</label><input name="endTime" type="time" value="12:00" required /></div>
        <div class="field"><label>Slot length (min)</label><input name="duration" type="number" value="90" min="15" max="480" /></div>
      </div>
      <button class="btn btn-primary btn-sm" type="submit">Add window</button>
    </form>
    <div class="week-grid">${weekdays.map((w,i)=>`<div class="week-row"><div class="weekday">${w}</div><div class="rule-chips">${(rulesByDay[i]||[]).map(r=>`<span class="rule-chip">${escapeHtml(r.startTime)}â€“${escapeHtml(r.endTime)} Â· ${r.duration}m Â· ${escapeHtml(r.serviceType)} <button class="rm" data-rule="${r.id}">Ã—</button></span>`).join('') || '<span class="muted small">No windows</span>'}</div></div>`).join('')}</div>
  </div>
  <div class="workspace-panel">
    <div class="workspace-panel-head"><h2>Exceptions</h2></div>
    <form id="excForm" style="margin-bottom:12px">
      <div class="field-row">
        <div class="field"><label>Type</label><select name="type"><option value="BLOCKED">Blocked</option><option value="EXTRA">Extra</option></select></div>
        <div class="field"><label>Start</label><input name="startAt" type="datetime-local" required /></div>
        <div class="field"><label>End</label><input name="endAt" type="datetime-local" required /></div>
      </div>
      <div class="field"><label>Reason</label><input name="reason" /></div>
      <button class="btn btn-outline btn-sm" type="submit">Add exception</button>
    </form>
    ${(data.exceptions||[]).map(e=>`<div class="exception-row"><div><strong>${escapeHtml(e.type)}</strong><span>${fmtDateTime(e.startAt)} â†’ ${fmtDateTime(e.endAt)}${e.reason?' Â· '+escapeHtml(e.reason):''}</span></div><button class="icon-btn danger" data-exc="${e.id}">${icon('trash')}</button></div>`).join('') || empty('No exceptions','')}
  </div>`;
  const html = workspaceLayout(inner,'availability','provider');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('ruleForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await API.post('/api/provider/availability/rules', Object.fromEntries(fd.entries())); toast('Window added','','success'); navigate('#/provider/availability'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('excForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.startAt = new Date(body.startAt).toISOString();
      body.endAt = new Date(body.endAt).toISOString();
      try { await API.post('/api/provider/availability/exceptions', body); toast('Exception added','','success'); navigate('#/provider/availability'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    document.getElementById('regenBtn')?.addEventListener('click', async () => {
      try { const r = await API.post('/api/provider/availability/regenerate'); toast('Rebuilt', r.message, 'success'); navigate('#/provider/availability'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
    qsa('[data-rule]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this window?')) return;
      try { await API.del(`/api/provider/availability/rules/${b.dataset.rule}`); navigate('#/provider/availability'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
    qsa('[data-exc]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this exception?')) return;
      try { await API.del(`/api/provider/availability/exceptions/${b.dataset.exc}`); navigate('#/provider/availability'); location.reload(); }
      catch (e) { toast('Error', e.message, 'error'); }
    }));
  },0);
  return html;
}

export async function renderProviderProfile() {
  if (!state.user?.provider && !state.user?.isStaff) { navigate('#/login'); return workspaceLayout(spinner(),'profile'); }
  const data = await API.get('/api/provider/profile');
  const p = data.profile;
  const inner = `
  <div class="workspace-top"><div><h1>Profile</h1><p>How customers see you</p></div></div>
  <div class="workspace-panel">
    <form id="profForm">
      <div class="field"><label>Headline</label><input name="headline" value="${escapeHtml(p.headline||'')}" /></div>
      <div class="field"><label>Bio</label><textarea name="bio" rows="6">${escapeHtml(p.bio||'')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>City</label><input name="city" value="${escapeHtml(p.city||'')}" /></div>
        <div class="field"><label>Languages (comma)</label><input name="languages" value="${escapeHtml((p.languages||[]).join(', '))}" /></div>
      </div>
      <div class="field"><label>Specialisations (comma)</label><input name="specializations" value="${escapeHtml((p.specializations||[]).join(', '))}" /></div>
      <div class="field-row">
        <div class="field"><label>Min notice (hours)</label><input name="minNoticeHours" type="number" value="${p.minNoticeHours||12}" min="1" max="168" /></div>
      </div>
      <div class="check-line"><input type="checkbox" name="offersOnline" ${p.offersOnline?'checked':''} /><span>Offers online</span></div>
      <div class="check-line" style="margin-bottom:14px"><input type="checkbox" name="offersInPerson" ${p.offersInPerson?'checked':''} /><span>Offers in person</span></div>
      <button class="btn btn-primary" type="submit">Save profile</button>
    </form>
  </div>`;
  const html = workspaceLayout(inner,'profile','provider');
  wireWorkspace();
  setTimeout(() => {
    document.getElementById('profForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.languages = (body.languages||'').split(',').map(s=>s.trim()).filter(Boolean);
      body.specializations = (body.specializations||'').split(',').map(s=>s.trim()).filter(Boolean);
      body.offersOnline = fd.has('offersOnline');
      body.offersInPerson = fd.has('offersInPerson');
      try { await API.put('/api/provider/profile', body); toast('Saved','Profile updated.','success'); navigate('#/provider/profile'); location.reload(); }
      catch (err) { toast('Error', err.message, 'error'); }
    });
  },0);
  return html;
}
