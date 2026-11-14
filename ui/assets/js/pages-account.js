'use strict';
import {
  state, API, escapeHtml, fmtDate, fmtTime, fmtDateTime, initials, badge, icon, stars,
  layout, pageHero, empty, spinner, modal, toast, navigate, statusLabel, statusTone, parseJson, qsa
} from './core.js?v=13';
import * as authSupabase from './auth-supabase.js?v=13';
import { currentSession } from './supabase-client.js?v=13';

export async function renderAccountDashboard() {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const data = await API.get('/api/account/summary');
  const user = state.user;
  const next = data.nextBooking;
  const inner = `
  ${pageHero('My account', `Namaste, ${escapeHtml(user.fullName.split(' ')[0])}`, 'Your bookings, saved profiles and addresses.')}
  <section class="section-tight">
    <div class="container">
      <div class="stat-grid">
        <div class="stat-card"><span>Open requests</span><strong>${data.counts.open}</strong><small>Being handled</small></div>
        <div class="stat-card"><span>Upcoming</span><strong>${data.counts.upcoming}</strong><small>Confirmed</small></div>
        <div class="stat-card"><span>Completed</span><strong>${data.counts.completed}</strong><small>Ceremonies</small></div>
        <div class="stat-card"><span>Saved profiles</span><strong>${data.counts.profiles}</strong><small>Birth details</small></div>
      </div>
      ${next ? `<div class="next-booking">
        <div><div class="label">Next booking</div><h3>${escapeHtml(next.service?.name || next.type)}</h3><p>${fmtDateTime(next.confirmedStartAt || next.preferredStartAt)} Â· ${escapeHtml(next.statusLabel)}</p></div>
        <a class="btn btn-soft" href="#/my/bookings/${next.ref}">Open ${icon('arrow')}</a>
      </div>` : ''}
      <div class="panel">
        <div class="panel-head"><div><h2>Recent bookings</h2><p>Your latest requests and ceremonies.</p></div><a class="text-link" href="#/my/bookings">All bookings ${icon('arrow')}</a></div>
        <div class="booking-list">${(data.bookings||[]).map(bookingRow).join('') || empty('No bookings yet', 'Browse pujas to request your first ceremony.', `<a class="btn btn-primary" href="#/pujas">Browse pujas</a>`)}</div>
      </div>
    </div>
  </section>`;
  return layout(inner);
}

function bookingRow(b) {
  return `<div class="booking-row">
    <div class="booking-row-main">
      <h3>${escapeHtml(b.service?.name || b.type)}</h3>
      <p>${escapeHtml(b.ref)} Â· ${fmtDate(b.preferredStartAt,'date')} Â· ${escapeHtml(b.provider?.name || 'Pandit ji')}</p>
    </div>
    <div class="booking-row-side">
      ${badge(b.status)}
      <a class="btn btn-outline btn-sm" href="#/my/bookings/${b.ref}">Open</a>
    </div>
  </div>`;
}

export async function renderMyBookings(query = {}) {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  const data = await API.get('/api/my/bookings' + (params.toString() ? '?' + params.toString() : ''));
  const inner = `
  ${pageHero('My bookings', 'Your requests & ceremonies', 'Track every request, reschedule or cancel, and leave a review after.')}
  <section class="section-tight">
    <div class="container">
      <div class="booking-filters">
        ${['','REQUESTED','CONTACTED','CONFIRMED','COMPLETED','CANCELLED'].map(s=>`<button class="filter-chip ${(query.status||'')===s?'active':''}" data-status="${s}">${s||'All'}</button>`).join('')}
        <span style="flex:1"></span>
        <select id="typeFilter" style="min-height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--paper);font-size:.74rem">
          <option value="">All types</option>
          <option value="PUJA" ${query.type==='PUJA'?'selected':''}>Pujas</option>
          <option value="CONSULTATION" ${query.type==='CONSULTATION'?'selected':''}>Consultations</option>
          <option value="EVENT" ${query.type==='EVENT'?'selected':''}>Gatherings</option>
        </select>
      </div>
      <div class="booking-list">${(data.bookings||[]).map(bookingRow).join('') || empty('No bookings match', 'Try a different filter, or request a new ceremony.', `<a class="btn btn-primary" href="#/pujas">Browse pujas</a>`)}</div>
    </div>
  </section>`;
  setTimeout(() => {
    qsa('[data-status]').forEach(b => b.addEventListener('click', () => {
      const p = new URLSearchParams(location.hash.split('?')[1]||'');
      if (b.dataset.status) p.set('status', b.dataset.status); else p.delete('status');
      const t = document.getElementById('typeFilter')?.value;
      if (t) p.set('type', t); else p.delete('type');
      navigate('#/my/bookings' + (p.toString() ? '?' + p.toString() : ''));
    }));
    const tf = document.getElementById('typeFilter');
    if (tf) tf.addEventListener('change', () => {
      const p = new URLSearchParams(location.hash.split('?')[1]||'');
      if (tf.value) p.set('type', tf.value); else p.delete('type');
      navigate('#/my/bookings' + (p.toString() ? '?' + p.toString() : ''));
    });
  }, 0);
  return layout(inner);
}

export async function renderBookingDetail(params) {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const data = await API.get(`/api/my/bookings/${params.ref}`);
  const b = data.booking;
  const inner = `
  <section class="section-tight"><div class="container">
    <div class="detail-hero-card">
      <div class="top">
        <div>
          <span class="ref">${escapeHtml(b.ref)}</span>
          <h1 class="display">${escapeHtml(b.service?.name || b.type)}</h1>
          <p>${escapeHtml(b.statusLabel)} Â· ${fmtDateTime(b.confirmedStartAt || b.preferredStartAt)}</p>
        </div>
        ${badge(b.status)}
      </div>
    </div>
    <div class="grid-2" style="align-items:start">
      <div>
        <div class="panel">
          <div class="panel-head"><h2>Timeline</h2></div>
          <div class="timeline">${(b.history||[]).map(h=>`<div class="timeline-item"><div class="timeline-dot"></div><div><strong>${escapeHtml(h.toLabel)}</strong><span> Â· ${fmtDateTime(h.at)}</span>${h.reason?`<p>${escapeHtml(h.reason)}</p>`:''}</div></div>`).join('')}</div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Details</h2></div>
          <div class="info-grid">
            <div><dt>Customer</dt><dd>${escapeHtml(b.customerName)}</dd></div>
            <div><dt>Mobile</dt><dd>${escapeHtml(state.user?.phone || 'â€”')}</dd></div>
            <div><dt>Preferred channel</dt><dd>${escapeHtml(b.preferredContactChannel)}</dd></div>
            <div><dt>Call window</dt><dd>${escapeHtml(b.preferredCallWindow||'Any time')}</dd></div>
            <div><dt>Participants</dt><dd>${escapeHtml(String(b.participants))}</dd></div>
            <div><dt>Requested on</dt><dd>${fmtDateTime(b.requestedAt)}</dd></div>
            ${b.specialRequests ? `<div class="full"><dt>Special requests</dt><dd>${escapeHtml(b.specialRequests)}</dd></div>` : ''}
            ${b.puja ? `<div><dt>Location</dt><dd>${escapeHtml(b.puja.locationType.replace('_',' '))}</dd></div><div><dt>Occasion</dt><dd>${escapeHtml(b.puja.occasion)}</dd></div><div><dt>Samagri by</dt><dd>${escapeHtml(b.puja.samagriBy)}</dd></div><div><dt>Attendees</dt><dd>${escapeHtml(String(b.puja.attendeeEstimate))}</dd></div>${b.puja.sankalpamNames?.length?`<div class="full"><dt>Sankalpam</dt><dd>${escapeHtml(b.puja.sankalpamNames.join(', '))}</dd></div>`:''}` : ''}
            ${b.consultation ? `<div><dt>Mode</dt><dd>${escapeHtml(b.consultation.mode)}</dd></div><div><dt>Duration</dt><dd>${b.consultation.duration} min</dd></div><div><dt>Topics</dt><dd>${escapeHtml((b.consultation.topics||[]).join(', '))}</dd></div><div><dt>Language</dt><dd>${escapeHtml(b.consultation.language)}</dd></div>${b.consultation.question?`<div class="full"><dt>Question</dt><dd>${escapeHtml(b.consultation.question)}</dd></div>`:''}` : ''}
          </div>
          ${b.birthDetails?.length ? `<h3 class="display" style="font-size:1.3rem;margin:20px 0 8px">Birth details</h3><div class="info-grid">${b.birthDetails.map(p=>`<div><dt>${escapeHtml(p.label)}</dt><dd>${escapeHtml(p.name)} Â· ${fmtDate(p.dateOfBirth,'date')}${p.timeOfBirth?' Â· '+p.timeOfBirth:''} Â· ${escapeHtml(p.place)}</dd></div>`).join('')}</div>` : ''}
          ${b.media?.length ? `<h3 class="display" style="font-size:1.3rem;margin:20px 0 8px">Photos</h3><p class="muted small">${b.media.map(m=>escapeHtml(m.caption)).join(' Â· ')}</p>` : ''}
          ${b.documents?.length ? `<h3 class="display" style="font-size:1.3rem;margin:20px 0 8px">Documents</h3><ul class="samagri-list">${b.documents.map(d=>`<div class="samagri-row"><span>${escapeHtml(d.title||d.doc_type)}</span><span class="by">${escapeHtml(d.doc_type)}</span></div>`).join('')}</ul>` : ''}
          ${b.slot ? `<h3 class="display" style="font-size:1.3rem;margin:20px 0 8px">Slot</h3><p class="muted small">${fmtDateTime(b.slot.startAt)} â€“ ${fmtTime(b.slot.endAt)} Â· ${escapeHtml(b.slot.status)}</p>` : ''}
        </div>
        <div>
          <div class="panel">
            <div class="panel-head"><h2>Actions</h2></div>
            <div class="action-bar" style="border:0;padding:0;margin:0">
              ${b.can.cancel ? `<button class="btn btn-outline btn-sm" id="cancelBtn">Cancel request</button>` : ''}
              ${b.can.reschedule ? `<button class="btn btn-outline btn-sm" id="reschedBtn">Request reschedule</button>` : ''}
              ${b.can.review ? `<button class="btn btn-primary btn-sm" id="reviewBtn">Leave a review</button>` : ''}
              <a class="btn btn-outline btn-sm" href="/api/bookings/${encodeURIComponent(b.ref)}/calendar.ics" target="_blank">Add to calendar</a>
            </div>
            ${!b.can.cancel && !b.can.reschedule && !b.can.review ? `<p class="muted small">No actions available for this booking right now.</p>` : ''}
          </div>
          ${b.eventRegistration ? `<div class="panel"><div class="panel-head"><h2>Registration</h2></div>
            <div class="info-grid">
              <div><dt>Seats</dt><dd>${b.eventRegistration.seats}</dd></div>
              <div><dt>Status</dt><dd>${escapeHtml(b.eventRegistration.status)}</dd></div>
              <div><dt>Mode</dt><dd>${escapeHtml(b.eventRegistration.attendanceMode)}</dd></div>
              <div><dt>QR</dt><dd>${escapeHtml(b.eventRegistration.qrToken)}</dd></div>
            </div></div>` : ''}
          ${b.canReview ? '' : ''}
        </div>
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', async () => {
      const reason = prompt('Reason for cancellation (min 3 characters):');
      if (!reason) return;
      try {
        await API.post(`/api/my/bookings/${b.ref}/cancel`, { reason });
        toast('Cancelled', 'Your booking has been cancelled.', 'success');
        navigate(`#/my/bookings/${b.ref}`);
        location.reload();
      } catch (e) { toast('Could not cancel', e.message, 'error'); }
    });
    const reschedBtn = document.getElementById('reschedBtn');
    if (reschedBtn) reschedBtn.addEventListener('click', async () => {
      const newStart = prompt('New preferred date & time (YYYY-MM-DDTHH:mm, IST):');
      if (!newStart) return;
      const reason = prompt('Reason for rescheduling:');
      if (!reason) return;
      try {
        await API.post(`/api/my/bookings/${b.ref}/reschedule`, { newStartAt: newStart, reason });
        toast('Reschedule requested', 'We will confirm shortly.', 'success');
        navigate(`#/my/bookings/${b.ref}`);
        location.reload();
      } catch (e) { toast('Could not reschedule', e.message, 'error'); }
    });
    const reviewBtn = document.getElementById('reviewBtn');
    if (reviewBtn) reviewBtn.addEventListener('click', () => {
      const m = modal({
        title: 'Leave a review',
        body: `<div class="field"><label>Rating</label><select id="rvRating">${[5,4,3,2,1].map(n=>`<option value="${n}">${n} star${n>1?'s':''}</option>`).join('')}</select></div>
          <div class="field"><label>Title (optional)</label><input id="rvTitle" /></div>
          <div class="field"><label>Your review *</label><textarea id="rvComment" minlength="10"></textarea></div>`,
        actions: `<button class="btn btn-ghost" id="rvCancel">Cancel</button><button class="btn btn-primary" id="rvSubmit">Submit review</button>`,
      });
      document.getElementById('rvCancel').addEventListener('click', m.close);
      document.getElementById('rvSubmit').addEventListener('click', async () => {
        try {
          await API.post(`/api/my/bookings/${b.ref}/review`, {
            rating: Number(document.getElementById('rvRating').value),
            title: document.getElementById('rvTitle').value,
            comment: document.getElementById('rvComment').value,
          });
          toast('Thank you', 'Your review helps other families.', 'success');
          m.close();
          navigate(`#/my/bookings/${b.ref}`);
          location.reload();
        } catch (e) { toast('Could not submit', e.message, 'error'); }
      });
    });
  }, 0);
  return layout(inner);
}

export async function renderProfiles() {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const data = await API.get('/api/account/birth-profiles');
  const inner = `
  ${pageHero('Birth profiles', 'Saved family birth details', 'Save once, reuse for every consultation.')}
  <section class="section-tight"><div class="container">
    <div class="panel">
      <div class="panel-head"><h2>Your profiles</h2><p>${(data.profiles||[]).length} saved</p><button class="btn btn-primary btn-sm" id="addProfileBtn">${icon('plus')} Add profile</button></div>
      <div class="profile-grid">${(data.profiles||[]).map(p=>`
        <div class="profile-card">
          <span class="label-tag">${escapeHtml(p.label)}${p.isDefault?' Â· default':''}</span>
          <h3>${escapeHtml(p.fullName)}</h3>
          <p>${fmtDate(p.dateOfBirth,'date')} ${p.timeUnknown?'(time unknown)':p.timeOfBirth?'Â· '+p.timeOfBirth:''}<br>${escapeHtml(p.placeOfBirth)}${p.gotra?' Â· '+escapeHtml(p.gotra):''}${p.nakshatra?' Â· '+escapeHtml(p.nakshatra):''}</p>
          <div class="card-actions">
            <button class="btn btn-outline btn-sm" data-edit="${p.id}">${icon('edit')} Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">${icon('trash')} Remove</button>
          </div>
        </div>`).join('') || empty('No profiles yet', 'Add your birth details to speed up consultations.')}
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    document.getElementById('addProfileBtn')?.addEventListener('click', () => openProfileModal());
    qsa('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = (data.profiles||[]).find(x=>x.id===b.dataset.edit);
      openProfileModal(p);
    }));
    qsa('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this birth profile?')) return;
      try { await API.del(`/api/account/birth-profiles/${b.dataset.del}`); toast('Removed', '', 'success'); navigate('#/my/profiles'); location.reload(); }
      catch (e) { toast('Could not remove', e.message, 'error'); }
    }));
  }, 0);
  return layout(inner);
}

function profileForm(p = {}) {
  return `<div class="field-row">
      <div class="field"><label>Label</label><input id="pfLabel" value="${escapeHtml(p.label||'Self')}" /></div>
      <div class="field"><label>Full name *</label><input id="pfName" value="${escapeHtml(p.fullName||'')}" required /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Date of birth *</label><input id="pfDob" type="date" value="${escapeHtml(p.dateOfBirth||'')}" required /></div>
      <div class="field"><label>Time of birth</label><input id="pfTob" type="time" value="${escapeHtml(p.timeOfBirth||'')}" ${p.timeUnknown?'disabled':''} /></div>
    </div>
    <div class="check-line" style="margin-bottom:12px"><input type="checkbox" id="pfUnknown" ${p.timeUnknown?'checked':''} /><span>I donâ€™t know the time</span></div>
    <div class="field"><label>Place of birth *</label><input id="pfPlace" value="${escapeHtml(p.placeOfBirth||'')}" required /></div>
    <div class="field-row">
      <div class="field"><label>Gotra</label><input id="pfGotra" value="${escapeHtml(p.gotra||'')}" /></div>
      <div class="field"><label>Nakshatra</label><input id="pfNak" value="${escapeHtml(p.nakshatra||'')}" /></div>
    </div>
    <div class="field"><label>Rashi</label><input id="pfRashi" value="${escapeHtml(p.rashi||'')}" /></div>
    <div class="check-line"><input type="checkbox" id="pfDefault" ${p.isDefault?'checked':''} /><span>Set as default</span></div>`;
}

function openProfileModal(p) {
  const m = modal({
    title: p ? 'Edit birth profile' : 'Add birth profile',
    body: profileForm(p || {}),
    actions: `<button class="btn btn-ghost" id="pfCancel">Cancel</button><button class="btn btn-primary" id="pfSave">${p?'Save changes':'Add profile'}</button>`,
  });
  const unknown = document.getElementById('pfUnknown');
  const tob = document.getElementById('pfTob');
  unknown.addEventListener('change', () => { tob.disabled = unknown.checked; if (unknown.checked) tob.value = ''; });
  document.getElementById('pfCancel').addEventListener('click', m.close);
  document.getElementById('pfSave').addEventListener('click', async () => {
    const body = {
      label: document.getElementById('pfLabel').value,
      fullName: document.getElementById('pfName').value,
      dateOfBirth: document.getElementById('pfDob').value,
      timeOfBirth: document.getElementById('pfTob').value,
      timeUnknown: document.getElementById('pfUnknown').checked,
      placeOfBirth: document.getElementById('pfPlace').value,
      gotra: document.getElementById('pfGotra').value,
      nakshatra: document.getElementById('pfNak').value,
      rashi: document.getElementById('pfRashi').value,
      isDefault: document.getElementById('pfDefault').checked,
    };
    try {
      if (p) await API.put(`/api/account/birth-profiles/${p.id}`, body);
      else await API.post('/api/account/birth-profiles', body);
      toast('Saved', 'Birth profile saved.', 'success');
      m.close();
      navigate('#/my/profiles'); location.reload();
    } catch (e) { toast('Could not save', e.message, 'error'); }
  });
}

export async function renderAddresses() {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const data = await API.get('/api/account/addresses');
  const inner = `
  ${pageHero('Addresses', 'Saved locations', 'For home pujas and ceremony visits.')}
  <section class="section-tight"><div class="container">
    <div class="panel">
      <div class="panel-head"><h2>Your addresses</h2><p>${(data.addresses||[]).length} saved</p><button class="btn btn-primary btn-sm" id="addAddrBtn">${icon('plus')} Add address</button></div>
      <div class="profile-grid">${(data.addresses||[]).map(a=>`
        <div class="profile-card">
          <span class="label-tag">${escapeHtml(a.label)}${a.isDefault?' Â· default':''}</span>
          <h3>${escapeHtml(a.line1)}</h3>
          <p>${escapeHtml(a.line2||'')}${a.line2?', ':''}${escapeHtml(a.city)}${a.state?', '+escapeHtml(a.state):''} ${escapeHtml(a.postalCode||'')}<br>${a.landmark?'Near '+escapeHtml(a.landmark):''}</p>
          <div class="card-actions">
            <button class="btn btn-outline btn-sm" data-edit="${a.id}">${icon('edit')} Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${a.id}">${icon('trash')} Remove</button>
          </div>
        </div>`).join('') || empty('No addresses yet', 'Add your home address for home pujas.')}
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    document.getElementById('addAddrBtn')?.addEventListener('click', () => openAddressModal());
    qsa('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const a = (data.addresses||[]).find(x=>x.id===b.dataset.edit);
      openAddressModal(a);
    }));
    qsa('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this address?')) return;
      try { await API.del(`/api/account/addresses/${b.dataset.del}`); toast('Removed', '', 'success'); navigate('#/my/addresses'); location.reload(); }
      catch (e) { toast('Could not remove', e.message, 'error'); }
    }));
  }, 0);
  return layout(inner);
}

function addressForm(a = {}) {
  return `<div class="field-row">
      <div class="field"><label>Label</label><input id="afLabel" value="${escapeHtml(a.label||'Home')}" /></div>
      <div class="field"><label>Line 1 *</label><input id="afLine1" value="${escapeHtml(a.line1||'')}" required /></div>
    </div>
    <div class="field"><label>Line 2</label><input id="afLine2" value="${escapeHtml(a.line2||'')}" /></div>
    <div class="field-row">
      <div class="field"><label>City *</label><input id="afCity" value="${escapeHtml(a.city||'')}" required /></div>
      <div class="field"><label>State</label><input id="afState" value="${escapeHtml(a.state||'')}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Postal code</label><input id="afPostal" value="${escapeHtml(a.postalCode||'')}" /></div>
      <div class="field"><label>Landmark</label><input id="afLand" value="${escapeHtml(a.landmark||'')}" /></div>
    </div>
    <div class="check-line"><input type="checkbox" id="afDefault" ${a.isDefault?'checked':''} /><span>Set as default</span></div>`;
}

function openAddressModal(a) {
  const m = modal({ title: a ? 'Edit address' : 'Add address', body: addressForm(a||{}), actions: `<button class="btn btn-ghost" id="afCancel">Cancel</button><button class="btn btn-primary" id="afSave">${a?'Save changes':'Add address'}</button>` });
  document.getElementById('afCancel').addEventListener('click', m.close);
  document.getElementById('afSave').addEventListener('click', async () => {
    const body = {
      label: document.getElementById('afLabel').value,
      line1: document.getElementById('afLine1').value,
      line2: document.getElementById('afLine2').value,
      city: document.getElementById('afCity').value,
      state: document.getElementById('afState').value,
      postalCode: document.getElementById('afPostal').value,
      landmark: document.getElementById('afLand').value,
      isDefault: document.getElementById('afDefault').checked,
    };
    try {
      if (a) await API.put(`/api/account/addresses/${a.id}`, body);
      else await API.post('/api/account/addresses', body);
      toast('Saved', 'Address saved.', 'success');
      m.close();
      navigate('#/my/addresses'); location.reload();
    } catch (e) { toast('Could not save', e.message, 'error'); }
  });
}

export async function renderAccountSettings() {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const user = state.user;
  // Phase 10: if this user signed up with an email account, pull the
  // RLS-protected profile row from Supabase (only their own row is readable).
  let cloud = null;
  if (user.email) {
    try {
      const s = await currentSession();
      if (s) cloud = await authSupabase.getMyProfile();
    } catch { /* cloud profile optional */ }
  }
  const inner = `
  ${pageHero('Account settings', 'Your details & privacy', 'Update your profile, export your data, or request deletion.')}
  <section class="section-tight"><div class="container">
    <div class="grid-2" style="align-items:start">
      <div class="panel">
        <div class="panel-head"><h2>Profile</h2></div>
        <form id="profileForm">
          <div class="field"><label>Full name *</label><input name="fullName" value="${escapeHtml(user.fullName)}" required /></div>
          <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(user.email||'')}" /></div>
          <div class="field"><label>City</label><input name="city" value="${escapeHtml(user.city||'')}" /></div>
          <div class="field"><label>Preferred language</label><select name="preferredLanguage"><option value="en" ${user.preferredLanguage==='en'?'selected':''}>English</option><option value="hi" ${user.preferredLanguage==='hi'?'selected':''}>Hindi</option><option value="te" ${user.preferredLanguage==='te'?'selected':''}>Telugu</option><option value="ta" ${user.preferredLanguage==='ta'?'selected':''}>Tamil</option></select></div>
          <div class="field"><label>Preferred contact</label><select name="contactChannel"><option value="CALL" ${user.contactChannel==='CALL'?'selected':''}>Call</option><option value="WHATSAPP" ${user.contactChannel==='WHATSAPP'?'selected':''}>WhatsApp</option></select></div>
          <div class="field"><label>Call window</label><input name="callWindow" value="${escapeHtml(user.callWindow||'')}" placeholder="Evening 6â€“9 PM" /></div>
          <div class="check-line" style="margin-bottom:14px"><input type="checkbox" name="marketingOptIn" ${user.marketingOptIn?'checked':''} /><span>Send me a gentle note with the full moon</span></div>
          <button class="btn btn-primary" type="submit">Save changes</button>
        </form>
      </div>
      <div>
        <div class="panel">
          <div class="panel-head"><h2>Account</h2></div>
          <dl class="detail-list" style="display:grid;gap:10px;margin:0">
            <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line-soft);padding-bottom:10px"><dt class="muted small">Full name</dt><dd style="margin:0;font-weight:600">${escapeHtml(user.fullName)}</dd></div>
            <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line-soft);padding-bottom:10px"><dt class="muted small">Email</dt><dd style="margin:0;font-weight:600;word-break:break-all;text-align:right">${escapeHtml(user.email || 'â€”')}</dd></div>
            <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line-soft);padding-bottom:10px"><dt class="muted small">Phone</dt><dd style="margin:0;font-weight:600">${user.phone ? `${escapeHtml(user.phone)} <span class="muted" style="font-weight:400;font-size:.72rem">(unverified)</span>` : 'â€”'}</dd></div>
            <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line-soft);padding-bottom:10px"><dt class="muted small">Account role</dt><dd style="margin:0;font-weight:600">${escapeHtml(({ OWNER:'Owner', ADMIN:'Admin', STAFF:'Staff', PROVIDER:'Pandit', CUSTOMER:'Customer' }[user.role] || user.role || 'Customer'))}</dd></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><dt class="muted small">Member since</dt><dd style="margin:0;font-weight:600">${user.createdAt ? fmtDate(user.createdAt, 'long') : 'â€”'}</dd></div>
          </dl>
          <p class="muted small" style="margin-top:12px">Roles are assigned by Aradhana and cannot be changed from this page. Phone sign-in will arrive in a future update.</p>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Privacy</h2></div>
          <p class="muted small" style="margin-bottom:14px">Your data belongs to you. Export everything as JSON, or request deletion.</p>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <a class="btn btn-outline btn-sm" href="/api/account/export" target="_blank">Export my data</a>
            <button class="btn btn-danger btn-sm" id="deleteBtn">Delete my account</button>
          </div>
          <div id="deleteArea" class="hide" style="margin-top:14px">
            <div class="auth-note" style="background:var(--red-soft);color:var(--red)">This removes your saved profiles, addresses and anonymises your bookings. Type DELETE to confirm.</div>
            <div class="field"><label>Confirmation</label><input id="deleteConfirm" placeholder="DELETE" /></div>
            <button class="btn btn-danger btn-sm" id="deleteConfirmBtn">Permanently delete</button>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Notifications</h2><a class="text-link" href="#/my/notifications">View all ${icon('arrow')}</a></div>
          <p class="muted small">Unread: ${state.unread}</p>
        </div>
        ${cloud ? `
        <div class="panel" style="margin-top:18px">
          <div class="panel-head"><h2>Email account profile</h2></div>
          <p class="muted small" style="margin-bottom:12px">Stored in Supabase PostgreSQL with row-level security â€” only you can read or change it.</p>
          <form id="cloudForm">
            <div class="field"><label>Full name</label><input name="fullName" value="${escapeHtml(cloud.full_name || user.fullName || '')}" /></div>
            <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(cloud.phone || user.phone || '')}" /></div>
            <button class="btn btn-outline btn-sm" type="submit">Save cloud profile</button>
          </form>
        </div>` : ''}
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    const form = document.getElementById('profileForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.marketingOptIn = fd.has('marketingOptIn');
      try {
        await API.put('/api/me', body);
        await (await import('./core.js?v=13')).loadMe();
        toast('Saved', 'Your details have been updated.', 'success');
      } catch (err) { toast('Could not save', err.message, 'error'); }
    });
    const cloudForm = document.getElementById('cloudForm');
    if (cloudForm) cloudForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(cloudForm);
      try {
        // Supabase profiles row (RLS guarantees only own-row update).
        await authSupabase.updateMyProfile({ fullName: fd.get('fullName'), phone: fd.get('phone') });
        // Keep the app's own users table consistent too (mirrors to Supabase).
        try { await API.put('/api/me', { fullName: fd.get('fullName') }); } catch { /* non-fatal */ }
        await (await import('./core.js?v=13')).loadMe();
        toast('Saved', 'Your email account profile is updated.', 'success');
      } catch (err) { toast('Could not save', err.message, 'error'); }
    });
    const delBtn = document.getElementById('deleteBtn');
    if (delBtn) delBtn.addEventListener('click', () => document.getElementById('deleteArea').classList.remove('hide'));
    const delConfirm = document.getElementById('deleteConfirmBtn');
    if (delConfirm) delConfirm.addEventListener('click', async () => {
      try {
        await API.post('/api/account/delete', { confirm: document.getElementById('deleteConfirm').value });
        toast('Account deleted', 'Your data has been removed.', 'success');
        await (await import('./core.js?v=13')).logout();
      } catch (e) { toast('Could not delete', e.message, 'error'); }
    });
  }, 0);
  return layout(inner);
}

export async function renderNotifications() {
  if (!state.user) { navigate('#/login'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const data = await API.get('/api/notifications');
  const inner = `
  ${pageHero('Notifications', 'Updates from Aradhana', 'Booking updates, reminders and gentle notes.')}
  <section class="section-tight"><div class="container">
    <div class="panel">
      <div class="panel-head"><h2>Your notifications</h2><p>${data.unread} unread</p><button class="btn btn-outline btn-sm" id="markReadBtn">Mark all read</button></div>
      <div class="booking-list">${(data.notifications||[]).map(n=>`
        <div class="booking-row" style="align-items:flex-start">
          <div class="booking-row-main"><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.body||'')}</p><p class="muted small">${fmtDateTime(n.createdAt)}</p></div>
          <div class="booking-row-side">${n.read?'':`<span class="badge badge-amber">New</span>`}${n.link?`<a class="btn btn-outline btn-sm" href="${escapeHtml(n.link)}">Open</a>`:''}</div>
        </div>`).join('') || empty('No notifications', 'You are all caught up.')}
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    document.getElementById('markReadBtn')?.addEventListener('click', async () => {
      try { await API.post('/api/notifications/read'); toast('Done', 'All marked as read.', 'success'); navigate('#/my/notifications'); location.reload(); }
      catch (e) { toast('Could not update', e.message, 'error'); }
    });
  }, 0);
  return layout(inner);
}
