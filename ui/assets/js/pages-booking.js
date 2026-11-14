'use strict';
import {
  state, API, escapeHtml, fmtDate, fmtTime, fmtDateTime, initials, badge, icon,
  layout, pageHero, empty, spinner, modal, toast, navigate, statusLabel, parseJson, ensure, qsa, enhance
} from './core.js?v=13';
import * as authSupabase from './auth-supabase.js?v=13';
import { currentSession } from './supabase-client.js?v=13';

const TYPES = { puja: 'PUJA', consultation: 'CONSULTATION', event: 'EVENT' };

let B = {
  type: 'PUJA',
  slug: '',
  service: null,
  event: null,
  step: 1,
  selectedDate: new Date().toISOString().slice(0, 10),
  selectedSlot: null,
  altStart: '',
  contact: {},
  details: {},
  birth: [],
  seats: 1,
  mode: 'IN_PERSON',
  attendees: [],
  dietary: '',
};

function resetBooking(type, slug) {
  B = {
    type: TYPES[type] || 'PUJA',
    slug,
    service: null,
    event: null,
    step: 1,
    selectedDate: new Date().toISOString().slice(0, 10),
    selectedSlot: null,
    altStart: '',
    contact: {},
    details: {},
    birth: [],
    seats: 1,
    mode: 'IN_PERSON',
    attendees: [],
    dietary: '',
  };
}

async function loadService() {
  if (B.type === 'EVENT') {
    const d = await API.get(`/api/events/${B.slug}`);
    B.event = d.event;
    B.service = d.event?.service ? { id: d.event.service.id, name: d.event.service.name, slug: d.event.service.slug, type: 'EVENT' } : null;
  } else {
    const d = await API.get(`/api/services/${B.slug}`);
    B.service = d.service;
    // prefill contact from profile
  }
}

function stepBar() {
  const steps = B.type === 'EVENT'
    ? ['Seats & mode', 'Attendees & details', 'Review & submit']
    : ['Choose time', 'Your details', 'Review & submit'];
  return `<div class="stepper">${steps.map((s, i) => {
    const n = i + 1;
    const cls = B.step === n ? 'active' : (B.step > n ? 'done' : '');
    return `<div class="stepper-item ${cls}"><span class="num">${B.step > n ? 'âœ“' : n}</span><span class="label">${escapeHtml(s)}</span></div>`;
  }).join('')}</div>`;
}

function serviceSummary() {
  if (B.type === 'EVENT') {
    const e = B.event;
    return `<div class="summary-card"><h3>${escapeHtml(e.title)}</h3>
      <div class="summary-line"><span>When</span><strong>${fmtDateTime(e.startAt)}</strong></div>
      <div class="summary-line"><span>Where</span><strong>${escapeHtml(e.venue)}</strong></div>
      <div class="summary-line"><span>Seats left</span><strong>${e.seatsLeft} of ${e.capacity}</strong></div>
      <div class="summary-line"><span>Contribution</span><strong>${escapeHtml(e.contributionText)}</strong></div>
      <div class="summary-note">${icon('spark')}<span>No payment is taken online. Settled directly with Pandit ji.</span></div></div>`;
  }
  const s = B.service;
  return `<div class="summary-card"><h3>${escapeHtml(s.name)}</h3>
    <div class="summary-line"><span>Duration</span><strong>${s.duration} minutes</strong></div>
    <div class="summary-line"><span>Indicative</span><strong>${escapeHtml(s.priceText)}</strong></div>
    <div class="summary-line"><span>Locations</span><strong>${escapeHtml((s.locations||[]).join(', ').replace(/_/g,' '))}</strong></div>
    ${s.type==='CONSULTATION' ? `<div class="summary-line"><span>Modes</span><strong>${escapeHtml((s.modes||[]).join(', '))}</strong></div>` : ''}
    <div class="summary-note">${icon('spark')}<span>This is a request. We will call you to confirm.</span></div></div>`;
}

function loginGate() {
  return `<div class="auth-card" style="max-width:460px;margin:0 auto">
    <h1 class="display" style="font-size:2rem">Sign in to continue</h1>
    <p>Booking needs an account so we can reach you to confirm. Sign in or create one â€” it only takes a moment. Phone SMS sign-in is coming soon.</p>
    <div class="auth-tabs"><button class="auth-tab active" data-tab="email" data-tab-group="gate">Email account</button><button class="auth-tab" data-tab="pw" data-tab-group="gate">Staff &amp; Pandit</button></div>
    <div data-panel-group="gate" data-panel="email">
      <div id="gSignInView">
        <div class="field"><label>Email</label><input id="gEmail" type="email" autocomplete="email" /></div>
        <div class="field"><label>Password</label><input id="gPass" type="password" autocomplete="current-password" /></div>
        <button class="btn btn-primary btn-block" id="gSignInBtn">Sign in</button>
        <div class="auth-alt" style="margin-top:12px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <a href="#" id="gForgotLink">Forgot password?</a>
          <a href="#" id="gToSignup">New here? Create an account</a>
        </div>
      </div>
      <div id="gSignupView" class="hide">
        <div class="field"><label>Full name</label><input id="gName" autocomplete="name" /></div>
        <div class="field"><label>Email</label><input id="gEmail2" type="email" autocomplete="email" /></div>
        <div class="field"><label>Phone (optional)</label><input id="gPhone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" /></div>
        <div class="field"><label>Password</label><input id="gPass2" type="password" autocomplete="new-password" /></div>
        <span class="hint">At least 8 characters, with a letter and a number.</span>
        <div class="field"><label>Confirm password</label><input id="gPass2b" type="password" autocomplete="new-password" /></div>
        <button class="btn btn-primary btn-block" id="gSignUpBtn">Create account</button>
        <div class="auth-alt" style="margin-top:12px"><a href="#" id="gToSignin">Already have an account? Sign in</a></div>
      </div>
      <div id="gNote" class="auth-note hide" style="margin-top:12px"></div>
    </div>
    <div data-panel-group="gate" data-panel="pw" class="hide">
      <div class="field"><label>Email</label><input id="pwEmail" type="email" autocomplete="email" /></div>
      <div class="field"><label>Password</label><input id="pwPass" type="password" autocomplete="current-password" /></div>
      <button class="btn btn-primary btn-block" id="pwBtn">Sign in</button>
      <div class="auth-alt" style="margin-top:10px"><a href="#" id="pwForgotLink">Forgot password?</a></div>
    </div>
  </div>`;
}

function wireLoginGate() {
  const finish = async () => {
    await (await import('./core.js?v=13')).loadMe();
    renderCurrent();
  };
  const showNote = (msg) => {
    const n = document.getElementById('gNote');
    if (!n) return;
    if (!msg) { n.classList.add('hide'); n.textContent = ''; return; }
    n.textContent = msg; n.classList.remove('hide');
  };
  const switchView = (signup) => {
    document.getElementById('gSignInView').classList.toggle('hide', signup);
    document.getElementById('gSignupView').classList.toggle('hide', !signup);
    showNote('');
  };
  document.getElementById('gToSignup')?.addEventListener('click', (e) => { e.preventDefault(); switchView(true); });
  document.getElementById('gToSignin')?.addEventListener('click', (e) => { e.preventDefault(); switchView(false); });

  const signInBtn = document.getElementById('gSignInBtn');
  if (signInBtn) signInBtn.addEventListener('click', async () => {
    signInBtn.disabled = true;
    showNote('');
    try {
      await authSupabase.signIn(document.getElementById('gEmail').value, document.getElementById('gPass').value);
      await finish();
    } catch (e) { toast('Sign in failed', e.message, 'error'); }
    signInBtn.disabled = false;
  });

  const signUpBtn = document.getElementById('gSignUpBtn');
  if (signUpBtn) signUpBtn.addEventListener('click', async () => {
    signUpBtn.disabled = true;
    showNote('');
    const fullName = document.getElementById('gName').value;
    const email = document.getElementById('gEmail2').value;
    const phone = document.getElementById('gPhone').value;
    const pass = document.getElementById('gPass2').value;
    const confirm = document.getElementById('gPass2b').value;
    try {
      if (pass !== confirm) throw new Error('Passwords do not match.');
      const res = await authSupabase.signUp({ fullName, email, password: pass, phone });
      if (res.hasSession) {
        toast('Welcome to Aradhana', 'Your account is ready.', 'success');
        await finish();
      } else {
        switchView(false);
        showNote(`Account created for ${email}. We sent you a confirmation link â€” open it, then sign in here.`);
        document.getElementById('gEmail').value = email;
      }
    } catch (e) { toast('Could not create account', e.message, 'error'); }
    signUpBtn.disabled = false;
  });

  const forgotLink = document.getElementById('gForgotLink');
  if (forgotLink) forgotLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('gEmail').value;
    if (!email) { toast('Enter your email first', 'Type your email above, then tap "Forgot password?" again.', 'error'); return; }
    try {
      await authSupabase.sendPasswordReset(email);
      showNote(`Reset link sent to ${email}. Open it on this device to set a new password.`);
    } catch (err) { toast('Could not send reset link', err.message, 'error'); }
  });

  const pwBtn = document.getElementById('pwBtn');
  if (pwBtn) pwBtn.addEventListener('click', async () => {
    pwBtn.disabled = true;
    try {
      await authSupabase.signIn(document.getElementById('pwEmail').value, document.getElementById('pwPass').value);
      await finish();
    } catch (e) { toast('Sign in failed', e.message, 'error'); }
    pwBtn.disabled = false;
  });
  const pwForgot = document.getElementById('pwForgotLink');
  if (pwForgot) pwForgot.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('pwEmail').value;
    if (!email) { toast('Enter your email first', 'Type your email above, then tap "Forgot password?" again.', 'error'); return; }
    try {
      await authSupabase.sendPasswordReset(email);
      toast('Check your inbox', 'Password reset link sent.', 'success');
    } catch (err) { toast('Could not send reset link', err.message, 'error'); }
  });
}

let renderCurrent = () => {};

export async function renderBook(type, slug) {
  resetBooking(type, slug);
  await loadService();
  // prefill contact
  if (state.user) {
    B.contact = { name: state.user.fullName, phone: state.user.phone || '', email: state.user.email || '', channel: state.user.contactChannel || 'CALL', callWindow: state.user.callWindow || '', language: state.user.preferredLanguage || 'en', participants: 1, specialRequests: '' };
  }
  renderCurrent = () => renderBook(type, slug).then(html => { document.getElementById('app').innerHTML = html; enhance(document.getElementById('app')); enhanceBook(); });
  const html = await buildBookHtml();
  setTimeout(enhanceBook, 0);
  return html;
}

async function buildBookHtml() {
  if (!state.user) {
    return layout(`<section class="section"><div class="container">${loginGate()}</div></section>`, { mode: 'public' });
  }
  if (B.step === 1) return layout(step1Html(), { mode: 'public' });
  if (B.step === 2) return layout(step2Html(), { mode: 'public' });
  return layout(step3Html(), { mode: 'public' });
}

function step1Html() {
  return `<section class="booking-shell"><div class="container">
    <div class="booking-head">
      <div><span class="eyebrow">${B.type === 'EVENT' ? 'Event registration' : (B.type === 'CONSULTATION' ? 'Personal guidance' : 'Puja request')}</span><h1 class="display">${B.type === 'EVENT' ? escapeHtml(B.event.title) : escapeHtml(B.service.name)}</h1><p class="muted">${B.type === 'EVENT' ? fmtDateTime(B.event.startAt) : (B.service.shortDescription || '')}</p></div>
      <a class="text-link" href="${B.type === 'EVENT' ? '#/events/'+B.slug : '#/services/'+B.slug}">${icon('arrowLeft')} Back to details</a>
    </div>
    ${stepBar()}
    <div class="booking-grid">
      <div class="booking-main">
        <h2>Choose a time</h2>
        <p class="step-sub">Pick a date, then a slot. Tentative slots (dashed) are being discussed with someone else â€” you can still request them.</p>
        <div id="slotArea">${spinner()}</div>
        <div class="alt-time">
          <h4>None of these work?</h4>
          <p>Suggest an alternative date and time and we will try to accommodate your family.</p>
          <div class="field-row">
            <div class="field"><label>Alternative date &amp; time</label><input type="datetime-local" id="altStart" value="${escapeHtml(B.altStart)}" /></div>
            <div class="field" style="align-self:end"><button class="btn btn-outline" id="altBtn">Use this time</button></div>
          </div>
        </div>
      </div>
      <aside class="booking-aside">${serviceSummary()}<div class="summary-note" style="margin-top:0">${icon('spark')}<span>Slots are held for 24 hours while we confirm.</span></div></aside>
    </div>
    <div class="booking-actions">
      <a class="btn btn-ghost" href="${B.type === 'EVENT' ? '#/events/'+B.slug : '#/services/'+B.slug}">Cancel</a>
      <button class="btn btn-primary" id="next1" ${B.selectedSlot||B.altStart?'':'disabled'}>Continue ${icon('arrow')}</button>
    </div>
  </div></section>`;
}

async function loadSlots() {
  const area = document.getElementById('slotArea');
  if (!area) return;
  try {
    const data = await API.get(`/api/availability?service=${encodeURIComponent(B.slug)}&date=${encodeURIComponent(B.selectedDate)}`);
    B.slotsData = data;
    if (!B.selectedDate) B.selectedDate = data.selectedDate;
    renderSlotArea(data);
  } catch (e) {
    area.innerHTML = `<div class="empty-state"><h3>Could not load slots</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function renderSlotArea(data) {
  const area = document.getElementById('slotArea');
  if (!area) return;
  const days = data.days || [];
  const groups = data.groups || { morning: [], afternoon: [], evening: [] };
  const html = `
    <div class="slot-calendar">${days.map(d => `<button class="slot-day ${d.date===B.selectedDate?'active':''} ${d.count?'':'empty'}" data-date="${d.date}"><span class="wd">${escapeHtml(d.weekday)}</span><span class="dd">${d.day}</span><span class="ct">${d.count?d.count+' open':'â€”'}</span></button>`).join('')}</div>
    ${['morning','afternoon','evening'].map(g => groups[g]?.length ? `<div class="slot-group"><h4>${g}</h4><div class="slot-chips">${groups[g].map(s=>`<button class="slot-chip ${s.id===B.selectedSlot?'active':''} ${s.status!=='AVAILABLE'?'tentative':''}" data-slot="${s.id}">${fmtTime(s.startAt)}<small>${s.status==='AVAILABLE'?'available':'request pending'}</small></button>`).join('')}</div></div>` : '').join('')}
    ${!Object.values(groups).flat().length ? `<p class="muted small">No slots on this day. Pick another date, or use the alternative time below.</p>` : ''}`;
  area.innerHTML = html;
  qsa('.slot-day').forEach(b => b.addEventListener('click', () => {
    B.selectedDate = b.dataset.date;
    B.selectedSlot = null;
    loadSlots();
  }));
  qsa('.slot-chip').forEach(b => b.addEventListener('click', () => {
    B.selectedSlot = b.dataset.slot;
    B.altStart = '';
    const alt = document.getElementById('altStart'); if (alt) alt.value = '';
    renderSlotArea(B.slotsData);
    updateNext1();
  }));
}

function updateNext1() {
  const btn = document.getElementById('next1');
  if (btn) btn.disabled = !(B.selectedSlot || B.altStart);
}

function enhanceBook() {
  if (!state.user) { wireLoginGate(); return; }
  if (B.step === 1) {
    loadSlots();
    const alt = document.getElementById('altStart');
    if (alt) alt.addEventListener('change', (e) => { B.altStart = e.target.value; B.selectedSlot = null; renderSlotArea(B.slotsData); updateNext1(); });
    const altBtn = document.getElementById('altBtn');
    if (altBtn) altBtn.addEventListener('click', () => {
      const v = document.getElementById('altStart').value;
      if (!v) { toast('Choose a date & time', 'Please pick an alternative time first.', 'error'); return; }
      B.altStart = v; B.selectedSlot = null; renderSlotArea(B.slotsData); updateNext1(); toast('Alternative time set', fmtDateTime(new Date(v).toISOString()), 'success');
    });
    const next1 = document.getElementById('next1');
    if (next1) next1.addEventListener('click', () => { B.step = 2; rerender(); });
  }
  if (B.step === 2) wireStep2();
  if (B.step === 3) wireStep3();
}

function rerender() {
  buildBookHtml().then(html => {
    document.getElementById('app').innerHTML = html;
    enhance(document.getElementById('app'));
    enhanceBook();
  });
}

function step2Html() {
  const isConsult = B.type === 'CONSULTATION';
  const isEvent = B.type === 'EVENT';
  const u = state.user;
  const service = B.service;
  const contact = B.contact || {};
  const savedProfiles = []; // could fetch; keep simple
  let detailsHtml = '';
  if (isEvent) {
    detailsHtml = `
      <div class="form-section">
        <div class="form-section-title">Seats & attendance</div>
        <div class="field-row">
          <div class="field"><label>Seats (max ${B.event.maxPerRegistration})</label><input id="evSeats" type="number" min="1" max="${B.event.maxPerRegistration}" value="${B.seats}" /></div>
          <div class="field"><label>Attendance mode</label><div class="segmented">
            <label><input type="radio" name="attMode" value="IN_PERSON" ${B.mode==='IN_PERSON'?'checked':''} /><span>In person</span></label>
            ${B.event.online ? `<label><input type="radio" name="attMode" value="ONLINE" ${B.mode==='ONLINE'?'checked':''} /><span>Online</span></label>` : ''}
          </div></div>
        </div>
        <div class="field"><label>Dietary note (optional)</label><input id="evDiet" value="${escapeHtml(B.dietary)}" placeholder="No onion/garlic, etc." /></div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Attendees</div>
        <p class="form-section-sub">One name per seat. Add gotra or nakshatra if you know them.</p>
        <div id="attendeesArea"></div>
        <button class="btn btn-soft btn-sm" id="addAttendee" type="button">${icon('plus')} Add attendee</button>
      </div>`;
  } else if (!isConsult) {
    detailsHtml = `
      <div class="form-section">
        <div class="form-section-title">Puja details</div>
        <div class="field"><label>Location</label><div class="segmented">
          ${(service.locations||['CUSTOMER_HOME','TEMPLE','ONLINE']).map(loc=>`<label><input type="radio" name="locType" value="${loc}" ${ (B.details.locationType|| (service.locations||[])[0])===loc?'checked':''} /><span>${loc.replace('_',' ').toLowerCase().replace(/^\w/,c=>c.toUpperCase())}</span></label>`).join('')}
        </div></div>
        <div id="addressArea"></div>
        <div class="field-row">
          <div class="field"><label>Occasion</label><input id="occ" value="${escapeHtml(B.details.occasion||'Family puja')}" /></div>
          <div class="field"><label>Gotra (optional)</label><input id="gotra" value="${escapeHtml(B.details.gotra||'')}" /></div>
        </div>
        <div class="field"><label>Sankalpam names (comma separated)</label><input id="names" value="${escapeHtml((B.details.sankalpamNames||[]).join(', '))}" placeholder="Anita Rao, Ravi Rao" /></div>
        <div class="field-row">
          <div class="field"><label>Samagri by</label><select id="samagri"><option value="PRIEST" ${B.details.samagriBy==='PRIEST'?'selected':''}>Pandit ji brings</option><option value="CUSTOMER" ${B.details.samagriBy==='CUSTOMER'?'selected':''}>I will arrange</option><option value="DISCUSS" ${B.details.samagriBy==='DISCUSS'?'selected':''}>Discuss on call</option></select></div>
          <div class="field"><label>Expected attendees</label><input id="attendees" type="number" min="1" value="${B.details.attendeeEstimate||contact.participants||5}" /></div>
        </div>
        <div class="check-line"><input type="checkbox" id="live" ${B.details.liveStreamRequired?'checked':''} /><span><strong>Live stream required</strong> â€” for family joining online</span></div>
      </div>`;
  } else {
    const topics = ['Career','Marriage','Health','Finance','Family','Education','Travel','General'];
    detailsHtml = `
      <div class="form-section">
        <div class="form-section-title">Consultation details</div>
        <div class="field"><label>Mode</label><div class="segmented">
          ${(service.modes||['VOICE','VIDEO','CHAT','IN_PERSON']).map(m=>`<label><input type="radio" name="cMode" value="${m}" ${ (B.details.mode|| (service.modes||[])[0])===m?'checked':''} /><span>${m.replace('_',' ').toLowerCase().replace(/^\w/,c=>c.toUpperCase())}</span></label>`).join('')}
        </div></div>
        <div class="field"><label>Topics (choose at least one)</label><div class="chip-options" id="topics">
          ${topics.map(t=>`<label class="chip-option"><input type="checkbox" value="${t}" ${(B.details.topics||[]).includes(t)?'checked':''} /><span>${t}</span></label>`).join('')}
        </div></div>
        <div class="field"><label>Your question</label><textarea id="question" placeholder="What would you like guidance on?">${escapeHtml(B.details.question||'')}</textarea></div>
        <div class="check-line"><input type="checkbox" id="prevChart" ${B.details.hasPreviousChart?'checked':''} /><span>I have a previous chart or reading to share</span></div>
        ${service.slug==='kundli-matching' ? `<div class="check-line"><input type="checkbox" id="matching" checked disabled /><span><strong>Kundli matching</strong> â€” two birth profiles required</span></div>` : `<div class="check-line"><input type="checkbox" id="matching" ${B.details.matchingRequired?'checked':''} /><span>Kundli matching included</span></div>`}
      </div>
      <div class="form-section">
        <div class="form-section-title">Birth details</div>
        <p class="form-section-sub">Use a saved profile or type directly. Time of birth is optional.</p>
        <div id="birthArea"></div>
        <button class="btn btn-soft btn-sm" id="addBirth" type="button">${icon('plus')} Add person</button>
      </div>`;
  }

  return `<section class="booking-shell"><div class="container">
    <div class="booking-head">
      <div><span class="eyebrow">${escapeHtml(B.type)}</span><h1 class="display">${B.type==='EVENT'?escapeHtml(B.event.title):escapeHtml(B.service.name)}</h1></div>
      <a class="text-link" href="${B.type==='EVENT'?'#/events/'+B.slug:'#/services/'+B.slug}">${icon('arrowLeft')} Back</a>
    </div>
    ${stepBar()}
    <div class="booking-grid">
      <div class="booking-main">
        <h2>Your details</h2>
        <p class="step-sub">We only ask what is needed to begin. The rest is collected on the call.</p>
        <div class="form-section">
          <div class="form-section-title">Contact</div>
          <div class="field-row">
            <div class="field"><label>Name *</label><input id="cName" value="${escapeHtml(contact.name||'')}" required /></div>
            <div class="field"><label>Mobile (verified) *</label><input id="cPhone" value="${escapeHtml(contact.phone||'')}" readonly /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Email</label><input id="cEmail" type="email" value="${escapeHtml(contact.email||'')}" /></div>
            <div class="field"><label>Preferred language</label><select id="cLang">${['en','hi','te','ta','kn','mr'].map(l=>`<option value="${l}" ${contact.language===l?'selected':''}>${l}</option>`).join('')}</select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Preferred contact</label><select id="cChannel"><option value="CALL" ${contact.channel==='CALL'?'selected':''}>Call</option><option value="WHATSAPP" ${contact.channel==='WHATSAPP'?'selected':''}>WhatsApp</option><option value="SMS" ${contact.channel==='SMS'?'selected':''}>SMS</option><option value="EMAIL" ${contact.channel==='EMAIL'?'selected':''}>Email</option></select></div>
            <div class="field"><label>Call window</label><input id="cWindow" value="${escapeHtml(contact.callWindow||'')}" placeholder="Evening 6â€“9 PM" /></div>
          </div>
          <div class="field"><label>Participants</label><input id="cParts" type="number" min="1" value="${contact.participants||1}" /></div>
          <div class="field"><label>Special requests (optional)</label><textarea id="cSpec" placeholder="Anything we should know">${escapeHtml(contact.specialRequests||'')}</textarea></div>
        </div>
        ${detailsHtml}
      </div>
      <aside class="booking-aside">${serviceSummary()}</aside>
    </div>
    <div class="booking-actions">
      <button class="btn btn-ghost" id="back2">${icon('arrowLeft')} Back</button>
      <button class="btn btn-primary" id="next2">Review ${icon('arrow')}</button>
    </div>
  </div></section>`;
}

function step3Html() {
  const slot = B.selectedSlot ? (B.slotsData?.slots||[]).find(s=>s.id===B.selectedSlot) : null;
  const when = slot ? fmtDateTime(slot.startAt) : (B.altStart ? fmtDateTime(new Date(B.altStart).toISOString()) : 'â€”');
  return `<section class="booking-shell"><div class="container">
    <div class="booking-head"><div><span class="eyebrow">Review</span><h1 class="display">Almost there</h1><p class="muted">Check everything, then submit. We will call you to confirm.</p></div></div>
    ${stepBar()}
    <div class="booking-grid">
      <div class="booking-main">
        <div class="review-block"><div class="review-block-head"><h3>Service</h3><button type="button" id="edit1">Edit</button></div>
          <dl class="review-dl">
            <dt>Service</dt><dd>${escapeHtml(B.type==='EVENT'?B.event.title:B.service.name)}</dd>
            <dt>When</dt><dd>${escapeHtml(when)}</dd>
            ${B.type==='EVENT'?`<dt>Seats</dt><dd>${B.seats} Â· ${B.mode.replace('_',' ').toLowerCase()}</dd>`:''}
          </dl>
        </div>
        <div class="review-block"><div class="review-block-head"><h3>Contact</h3><button type="button" id="edit2a">Edit</button></div>
          <dl class="review-dl">
            <dt>Name</dt><dd>${escapeHtml(B.contact.name)}</dd>
            <dt>Mobile</dt><dd>${escapeHtml(B.contact.phone)}</dd>
            <dt>Email</dt><dd>${escapeHtml(B.contact.email||'â€”')}</dd>
            <dt>Channel</dt><dd>${escapeHtml(B.contact.channel)} Â· ${escapeHtml(B.contact.callWindow||'any time')}</dd>
          </dl>
        </div>
        <div class="consent-block">
          <label class="check-line"><input type="checkbox" id="consentPrivacy" required /> <span>I have read the <a href="#/privacy" target="_blank">privacy policy</a> and consent to being contacted about this request.</span></label>
          <label class="check-line"><input type="checkbox" id="consentPhone" required /> <span>You may call or WhatsApp me on the number above.</span></label>
          ${B.type==='CONSULTATION' ? `<label class="check-line"><input type="checkbox" id="consentBirth" required /> <span>I consent to my birth details being processed for this consultation.</span></label>` : ''}
        </div>
        <div class="booking-actions">
          <button class="btn btn-ghost" id="back3">${icon('arrowLeft')} Back</button>
          <button class="btn btn-primary btn-lg" id="submitBtn">Request booking ${icon('arrow')}</button>
        </div>
        <p class="muted small" style="margin-top:12px;text-align:center">By submitting you agree this is a request. No payment is taken online.</p>
      </div>
      <aside class="booking-aside">${serviceSummary()}</aside>
    </div>
  </div></section>`;
}

function wireStep2() {
  // contact collection
  const collectContact = () => {
    B.contact = {
      name: document.getElementById('cName')?.value || '',
      phone: document.getElementById('cPhone')?.value || '',
      email: document.getElementById('cEmail')?.value || '',
      language: document.getElementById('cLang')?.value || 'en',
      channel: document.getElementById('cChannel')?.value || 'CALL',
      callWindow: document.getElementById('cWindow')?.value || '',
      participants: Number(document.getElementById('cParts')?.value || 1),
      specialRequests: document.getElementById('cSpec')?.value || '',
    };
  };

  if (B.type === 'EVENT') {
    // attendees
    const area = document.getElementById('attendeesArea');
    const renderAttendees = () => {
      const seats = Number(document.getElementById('evSeats')?.value || 1);
      B.seats = seats;
      if (!B.attendees.length) B.attendees = Array.from({ length: seats }, (_, i) => ({ name: i === 0 ? (state.user?.fullName || '') : '', gotra: '', nakshatra: '', ageGroup: 'ADULT' }));
      B.attendees = B.attendees.slice(0, seats);
      while (B.attendees.length < seats) B.attendees.push({ name: '', gotra: '', nakshatra: '', ageGroup: 'ADULT' });
      area.innerHTML = B.attendees.map((a, i) => `
        <div class="field-row" style="margin-bottom:10px">
          <div class="field"><label>Attendee ${i+1} name</label><input class="attName" data-i="${i}" value="${escapeHtml(a.name)}" /></div>
          <div class="field"><label>Gotra</label><input class="attGotra" data-i="${i}" value="${escapeHtml(a.gotra)}" /></div>
        </div>`).join('');
      qsa('.attName').forEach(inp => inp.addEventListener('change', e => { B.attendees[+e.target.dataset.i].name = e.target.value; }));
      qsa('.attGotra').forEach(inp => inp.addEventListener('change', e => { B.attendees[+e.target.dataset.i].gotra = e.target.value; }));
    };
    const seatsInput = document.getElementById('evSeats');
    if (seatsInput) seatsInput.addEventListener('change', renderAttendees);
    renderAttendees();
  }

  // puja address area
  const addressArea = document.getElementById('addressArea');
  if (addressArea) {
    const renderAddress = () => {
      const loc = document.querySelector('input[name="locType"]:checked')?.value || (B.service.locations||[])[0];
      B.details.locationType = loc;
      if (loc === 'CUSTOMER_HOME') {
        addressArea.innerHTML = `
          <div class="field"><label>Saved address</label><select id="addrSelect"><option value="">â€” enter new address â€”</option></select></div>
          <div id="newAddr">
            <div class="field"><label>Address line 1 *</label><input id="aLine1" value="${escapeHtml(B.details.address?.line1||'')}" /></div>
            <div class="field-row">
              <div class="field"><label>City *</label><input id="aCity" value="${escapeHtml(B.details.address?.city||'')}" /></div>
              <div class="field"><label>Postal code</label><input id="aPostal" value="${escapeHtml(B.details.address?.postalCode||'')}" /></div>
            </div>
            <div class="field"><label>Landmark</label><input id="aLand" value="${escapeHtml(B.details.address?.landmark||'')}" /></div>
          </div>`;
        // load saved addresses
        API.get('/api/account/addresses').then(d => {
          const sel = document.getElementById('addrSelect');
          if (!sel) return;
          (d.addresses||[]).forEach(a => {
            const o = document.createElement('option'); o.value = a.id; o.textContent = `${a.label} Â· ${a.line1}, ${a.city}`;
            sel.appendChild(o);
          });
          sel.addEventListener('change', () => {
            const chosen = (d.addresses||[]).find(x=>x.id===sel.value);
            if (chosen) {
              document.getElementById('aLine1').value = chosen.line1;
              document.getElementById('aCity').value = chosen.city;
              document.getElementById('aPostal').value = chosen.postalCode || '';
              document.getElementById('aLand').value = chosen.landmark || '';
              B.details.addressId = chosen.id;
            } else {
              B.details.addressId = null;
            }
          });
        }).catch(()=>{});
      } else {
        addressArea.innerHTML = '';
      }
    };
    qsa('input[name="locType"]').forEach(r => r.addEventListener('change', renderAddress));
    renderAddress();
  }

  // birth area for consult
  const birthArea = document.getElementById('birthArea');
  if (birthArea) {
    const renderBirth = () => {
      if (!B.birth.length) B.birth = [{ label: 'Self', name: state.user?.fullName || '', dateOfBirth: '', timeOfBirth: '', timeUnknown: false, placeOfBirth: '', gender: 'UNDISCLOSED', gotra: '', nakshatra: '', rashi: '' }];
      birthArea.innerHTML = B.birth.map((b, i) => `
        <div class="review-block" style="margin-bottom:10px">
          <div class="review-block-head"><h3>Person ${i+1}</h3>${B.birth.length>1?`<button class="btn btn-ghost btn-sm" data-rm="${i}">Remove</button>`:''}</div>
          <div class="field-row">
            <div class="field"><label>Label</label><input class="bLabel" data-i="${i}" value="${escapeHtml(b.label)}" /></div>
            <div class="field"><label>Full name *</label><input class="bName" data-i="${i}" value="${escapeHtml(b.name)}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Date of birth *</label><input class="bDob" data-i="${i}" type="date" value="${escapeHtml(b.dateOfBirth)}" /></div>
            <div class="field"><label>Time of birth</label><input class="bTob" data-i="${i}" type="time" value="${escapeHtml(b.timeOfBirth)}" ${b.timeUnknown?'disabled':''} /></div>
          </div>
          <div class="check-line" style="margin-bottom:8px"><input type="checkbox" class="bUnknown" data-i="${i}" ${b.timeUnknown?'checked':''} /><span>I donâ€™t know the time</span></div>
          <div class="field"><label>Place of birth *</label><input class="bPlace" data-i="${i}" value="${escapeHtml(b.placeOfBirth)}" placeholder="City, State, Country" /></div>
          <div class="field-row">
            <div class="field"><label>Gotra</label><input class="bGotra" data-i="${i}" value="${escapeHtml(b.gotra)}" /></div>
            <div class="field"><label>Nakshatra</label><input class="bNak" data-i="${i}" value="${escapeHtml(b.nakshatra)}" /></div>
          </div>
        </div>`).join('');
      const bind = (cls, key) => qsa('.'+cls).forEach(inp => inp.addEventListener('change', e => { B.birth[+e.target.dataset.i][key] = e.target.value; }));
      bind('bLabel','label'); bind('bName','name'); bind('bDob','dateOfBirth'); bind('bTob','timeOfBirth'); bind('bPlace','placeOfBirth'); bind('bGotra','gotra'); bind('bNak','nakshatra');
      qsa('.bUnknown').forEach(inp => inp.addEventListener('change', e => {
        const i = +e.target.dataset.i;
        B.birth[i].timeUnknown = e.target.checked;
        const tob = document.querySelector(`.bTob[data-i="${i}"]`);
        if (tob) tob.disabled = e.target.checked;
      }));
      qsa('[data-rm]').forEach(btn => btn.addEventListener('click', () => {
        B.birth.splice(+btn.dataset.rm, 1);
        renderBirth();
      }));
    };
    const addBtn = document.getElementById('addBirth');
    if (addBtn) addBtn.addEventListener('click', () => {
      if (B.birth.length >= 2) { toast('Limit reached', 'You can add up to two people.', 'error'); return; }
      B.birth.push({ label: 'Second person', name: '', dateOfBirth: '', timeOfBirth: '', timeUnknown: false, placeOfBirth: '', gender: 'UNDISCLOSED', gotra: '', nakshatra: '', rashi: '' });
      renderBirth();
    });
    renderBirth();
  }

  const back2 = document.getElementById('back2');
  if (back2) back2.addEventListener('click', () => { B.step = 1; rerender(); });
  const next2 = document.getElementById('next2');
  if (next2) next2.addEventListener('click', () => {
    collectContact();
    // collect puja details
    if (B.type === 'PUJA') {
      const loc = document.querySelector('input[name="locType"]:checked')?.value;
      B.details = {
        locationType: loc,
        addressId: B.details.addressId || null,
        address: loc === 'CUSTOMER_HOME' ? {
          line1: document.getElementById('aLine1')?.value || '',
          city: document.getElementById('aCity')?.value || '',
          postalCode: document.getElementById('aPostal')?.value || '',
          landmark: document.getElementById('aLand')?.value || '',
        } : null,
        occasion: document.getElementById('occ')?.value || 'Family puja',
        sankalpamNames: (document.getElementById('names')?.value || '').split(',').map(s=>s.trim()).filter(Boolean),
        gotra: document.getElementById('gotra')?.value || null,
        samagriBy: document.getElementById('samagri')?.value || 'PRIEST',
        attendeeEstimate: Number(document.getElementById('attendees')?.value || 5),
        liveStreamRequired: !!document.getElementById('live')?.checked,
      };
    } else if (B.type === 'CONSULTATION') {
      B.details = {
        mode: document.querySelector('input[name="cMode"]:checked')?.value || (B.service.modes||[])[0],
        topics: Array.from(document.querySelectorAll('#topics input:checked')).map(i=>i.value),
        question: document.getElementById('question')?.value || '',
        hasPreviousChart: !!document.getElementById('prevChart')?.checked,
        matchingRequired: !!document.getElementById('matching')?.checked || B.service.slug === 'kundli-matching',
      };
      B.birth = B.birth.map(b => ({ ...b, timeUnknown: b.timeUnknown || false }));
    } else {
      B.seats = Number(document.getElementById('evSeats')?.value || 1);
      B.mode = document.querySelector('input[name="attMode"]:checked')?.value || 'IN_PERSON';
      B.dietary = document.getElementById('evDiet')?.value || '';
      B.attendees = B.attendees.map((a, i) => ({
        name: document.querySelector(`.attName[data-i="${i}"]`)?.value || a.name,
        gotra: document.querySelector(`.attGotra[data-i="${i}"]`)?.value || a.gotra,
        ageGroup: 'ADULT',
      }));
    }
    if (B.type === 'CONSULTATION' && !(B.details.topics||[]).length) { toast('Choose a topic', 'Please pick at least one topic.', 'error'); return; }
    if (B.type === 'PUJA' && B.details.locationType === 'CUSTOMER_HOME' && !B.details.address?.line1) { toast('Address needed', 'Please add the address for a home puja.', 'error'); return; }
    B.step = 3;
    rerender();
  });
}

function wireStep3() {
  const edit1 = document.getElementById('edit1'); if (edit1) edit1.addEventListener('click', () => { B.step = 1; rerender(); });
  const edit2a = document.getElementById('edit2a'); if (edit2a) edit2a.addEventListener('click', () => { B.step = 2; rerender(); });
  const back3 = document.getElementById('back3'); if (back3) back3.addEventListener('click', () => { B.step = 2; rerender(); });
  const submit = document.getElementById('submitBtn');
  if (submit) submit.addEventListener('click', async () => {
    const cp = document.getElementById('consentPrivacy')?.checked;
    const cph = document.getElementById('consentPhone')?.checked;
    const cb = document.getElementById('consentBirth');
    if (!cp || !cph || (cb && !cb.checked)) { toast('Consent required', 'Please tick the consent boxes to continue.', 'error'); return; }
    submit.disabled = true; submit.textContent = 'Submittingâ€¦';
    try {
      const body = buildSubmitBody();
      const res = await API.post('/api/bookings', body);
      toast('Request received', res.ref, 'success');
      navigate(`#/book/success?ref=${encodeURIComponent(res.ref)}`);
    } catch (e) {
      toast('Could not submit', e.message, 'error');
      submit.disabled = false; submit.textContent = 'Request booking';
    }
  });
}

function buildSubmitBody() {
  const body = {
    type: B.type,
    serviceId: B.type === 'EVENT' ? null : B.service.id,
    eventId: B.type === 'EVENT' ? B.event.id : undefined,
    timeSlotId: B.selectedSlot || null,
    altStartAt: !B.selectedSlot && B.altStart ? new Date(B.altStart).toISOString() : null,
    contact: B.contact,
    details: B.details,
  };
  if (B.type === 'EVENT') {
    body.seats = B.seats;
    body.attendanceMode = B.mode;
    body.attendees = B.attendees;
    body.dietaryNote = B.dietary;
  }
  if (B.type === 'CONSULTATION') {
    body.birthDetails = (B.birth || []).map(b => ({
      label: b.label, name: b.name, dateOfBirth: b.dateOfBirth,
      timeOfBirth: b.timeOfBirth, timeUnknown: !!b.timeUnknown,
      placeOfBirth: b.placeOfBirth, gotra: b.gotra, nakshatra: b.nakshatra,
      rashi: b.rashi, gender: b.gender || 'UNDISCLOSED',
    }));
  }
  return body;
}

export async function renderBookingSuccess(query = {}) {
  const ref = query.ref;
  let detail = null;
  try { detail = await API.get(`/api/my/bookings/${ref}`); } catch {}
  const b = detail?.booking;
  const inner = `
  <section class="booking-success">
    <div class="success-mark">${icon('check')}</div>
    <span class="eyebrow" style="justify-content:center">Request received</span>
    <h1 class="display">Thank you. Your request is with us.</h1>
    <div class="success-ref">${escapeHtml(ref || '')}</div>
    <p class="lede" style="margin:0 auto 10px;max-width:56ch">We have your request and a slot is held for 24 hours. Pandit ji or our team will call or WhatsApp you to confirm the details. No payment has been taken.</p>
    <div class="success-steps">
      <div class="success-step"><div class="num">1</div><strong>We call you</strong><span>Within a few hours, to confirm time, place and samagri.</span></div>
      <div class="success-step"><div class="num">2</div><strong>You confirm</strong><span>Agree the contribution and any preparation needed.</span></div>
      <div class="success-step"><div class="num">3</div><strong>The ceremony</strong><span>Performed with care. You can reschedule or cancel anytime.</span></div>
    </div>
    <div class="row" style="justify-content:center;gap:12px">
      ${state.user ? `<a class="btn btn-primary" href="#/my/bookings/${encodeURIComponent(ref||'')}">View booking ${icon('arrow')}</a>` : ''}
      <a class="btn btn-outline" href="#/">Return home</a>
      <a class="btn btn-outline" href="https://wa.me/${(state.settings?.['site.contact_whatsapp']||'+919000012345').replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp us</a>
    </div>
  </section>`;
  return layout(inner);
}

export async function renderLogin() {
  if (state.user) { navigate(state.user.isStaff ? (state.user.isOwner ? '#/admin' : '#/provider') : '#/my'); return layout(`<div class="spin-center"><div class="spinner"></div></div>`); }
  const inner = `
  <div class="auth-page">
    <div class="auth-art">
      <div class="auth-art-content">
        <blockquote>â€œA puja is not a transaction. It is a conversation between a family and its priest.â€</blockquote>
        <span>â€” Pandit Ramesh Sharma</span>
      </div>
    </div>
    <div class="auth-panel">
      <div class="auth-card">
        <span class="eyebrow">Sign in</span>
        <h1 class="display">Welcome back.</h1>
        <p>Sign in with your email account. Staff and Pandit ji use the staff sign-in.</p>
        <div class="auth-tabs"><button class="auth-tab active" data-tab="email" data-tab-group="auth">Email account</button><button class="auth-tab" data-tab="pw" data-tab-group="auth">Staff &amp; Pandit</button></div>
        <div data-panel-group="auth" data-panel="email">
          <div id="sbSignInView">
            <div class="field"><label>Email</label><input id="sbEmail" type="email" autocomplete="email" /></div>
            <div class="field"><label>Password</label><input id="sbPass" type="password" autocomplete="current-password" /></div>
            <button class="btn btn-primary btn-block" id="sbSignInBtn">Sign in</button>
            <div class="auth-alt" style="margin-top:12px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <a href="#" id="sbForgotLink">Forgot password?</a>
              <a href="#" id="sbToSignup">New here? Create an account</a>
            </div>
          </div>
          <div id="sbSignupView" class="hide">
            <div class="field"><label>Full name</label><input id="sbName" autocomplete="name" /></div>
            <div class="field"><label>Email</label><input id="sbEmail2" type="email" autocomplete="email" /></div>
            <div class="field"><label>Phone (optional)</label><input id="sbPhone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" /></div>
            <div class="field"><label>Password</label><input id="sbPass2" type="password" autocomplete="new-password" /></div>
            <span class="hint">At least 8 characters, with a letter and a number.</span>
            <div class="field"><label>Confirm password</label><input id="sbPass2b" type="password" autocomplete="new-password" /></div>
            <button class="btn btn-primary btn-block" id="sbSignUpBtn">Create account</button>
            <div class="auth-alt" style="margin-top:12px"><a href="#" id="sbToSignin">Already have an account? Sign in</a></div>
          </div>
          <div id="sbNote" class="auth-note hide" style="margin-top:12px"></div>
        </div>
        <div data-panel-group="auth" data-panel="pw" class="hide">
          <div class="field"><label>Email</label><input id="pwEmail" type="email" autocomplete="email" /></div>
          <div class="field"><label>Password</label><input id="pwPass" type="password" autocomplete="current-password" /></div>
          <button class="btn btn-primary btn-block" id="pwBtn">Sign in</button>
          <div class="auth-alt" style="margin-top:10px"><a href="#" id="pwForgotLink">Forgot password?</a></div>
        </div>
        <p class="auth-alt">New here? <a href="#/pujas">Browse pujas</a> â€” you can sign in at checkout.</p>
      </div>
    </div>
  </div>`;
  setTimeout(() => {
    /* If we landed here after an expired/invalid auth link, show why. */
    try {
      const note = sessionStorage.getItem('aradhana:authNote');
      if (note) {
        sessionStorage.removeItem('aradhana:authNote');
        const el = document.getElementById('sbNote');
        if (el) { el.textContent = note; el.classList.remove('hide'); }
      }
    } catch { /* storage unavailable */ }
    /* ---------- Real staff/pandit sign-in (Supabase email + password) ---------- */
    const pwBtn = document.getElementById('pwBtn');
    if (pwBtn) pwBtn.addEventListener('click', async () => {
      pwBtn.disabled = true;
      try {
        await authSupabase.signIn(document.getElementById('pwEmail').value, document.getElementById('pwPass').value);
        await (await import('./core.js?v=13')).loadMe();
        toast('Welcome back', '', 'success');
        const u = state.user;
        navigate(u?.isOwner ? '#/admin' : u?.provider ? '#/provider' : '#/my');
      } catch (e) { toast('Sign in failed', e.message, 'error'); }
      pwBtn.disabled = false;
    });
    const pwForgot = document.getElementById('pwForgotLink');
    if (pwForgot) pwForgot.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('pwEmail').value;
      if (!email) { toast('Enter your email first', 'Type your email above, then tap "Forgot password?" again.', 'error'); return; }
      try {
        await authSupabase.sendPasswordReset(email);
        toast('Check your inbox', 'Password reset link sent.', 'success');
      } catch (err) { toast('Could not send reset link', err.message, 'error'); }
    });

    /* ---------- Supabase email account: sign in / create / recover ---------- */
    const showNote = (msg) => {
      const n = document.getElementById('sbNote');
      if (!n) return;
      if (!msg) { n.classList.add('hide'); n.textContent = ''; return; }
      n.textContent = msg; n.classList.remove('hide');
    };
    const switchView = (signup) => {
      document.getElementById('sbSignInView').classList.toggle('hide', signup);
      document.getElementById('sbSignupView').classList.toggle('hide', !signup);
      showNote('');
    };
    const goIn = async () => {
      await (await import('./core.js?v=13')).loadMe();
      const u = state.user;
      navigate(u?.isOwner ? '#/admin' : u?.provider ? '#/provider' : '#/my');
    };
    document.getElementById('sbToSignup')?.addEventListener('click', (e) => { e.preventDefault(); switchView(true); });
    document.getElementById('sbToSignin')?.addEventListener('click', (e) => { e.preventDefault(); switchView(false); });

    const signInBtn = document.getElementById('sbSignInBtn');
    if (signInBtn) signInBtn.addEventListener('click', async () => {
      signInBtn.disabled = true;
      showNote('');
      try {
        await authSupabase.signIn(document.getElementById('sbEmail').value, document.getElementById('sbPass').value);
        toast('Welcome back', '', 'success');
        await goIn();
      } catch (e) { toast('Sign in failed', e.message, 'error'); }
      signInBtn.disabled = false;
    });

    const signUpBtn = document.getElementById('sbSignUpBtn');
    if (signUpBtn) signUpBtn.addEventListener('click', async () => {
      signUpBtn.disabled = true;
      showNote('');
      const fullName = document.getElementById('sbName').value;
      const email = document.getElementById('sbEmail2').value;
      const phone = document.getElementById('sbPhone').value;
      const pass = document.getElementById('sbPass2').value;
      const confirm = document.getElementById('sbPass2b').value;
      try {
        if (pass !== confirm) throw new Error('Passwords do not match.');
        const res = await authSupabase.signUp({ fullName, email, password: pass, phone });
        if (res.hasSession) {
          toast('Welcome to Aradhana', 'Your account is ready.', 'success');
          await goIn();
        } else {
          // Email confirmation is required before first sign-in.
          switchView(false);
          showNote(`Account created for ${email}. We sent you a confirmation link â€” open it, then sign in here.`);
          document.getElementById('sbEmail').value = email;
          toast('Check your inbox', 'Confirm your email to activate your account.', 'success');
        }
      } catch (e) { toast('Could not create account', e.message, 'error'); }
      signUpBtn.disabled = false;
    });

    const forgotLink = document.getElementById('sbForgotLink');
    if (forgotLink) forgotLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('sbEmail').value;
      if (!email) { toast('Enter your email first', 'Type your email above, then tap "Forgot password?" again.', 'error'); return; }
      try {
        await authSupabase.sendPasswordReset(email);
        showNote(`Reset link sent to ${email}. Open it on this device to set a new password.`);
        toast('Check your inbox', 'Password reset link sent.', 'success');
      } catch (err) { toast('Could not send reset link', err.message, 'error'); }
    });
  }, 0);
  return layout(inner);
}

/* ---------- Password recovery page (opened from the email link) ---------- */
export async function renderResetPassword() {
  // The recovery link lands here with ?code=...; the Supabase client
  // (detectSessionInUrl) exchanges it into a temporary session.
  const session = await currentSession();
  if (!session) {
    const inner = `
    <section class="section-tight"><div class="container" style="max-width:560px">
      <div class="panel" style="text-align:center;padding:38px 26px">
        <h2 class="display" style="font-size:1.6rem">Reset link expired</h2>
        <p class="muted" style="margin:10px 0 18px">This password reset link is invalid or has expired. Request a fresh one â€” it only takes a moment.</p>
        <a class="btn btn-primary" href="#/login">Back to sign in</a>
      </div>
    </div></section>`;
    return layout(inner);
  }
  const inner = `
  ${pageHero('Set a new password', 'Password recovery', 'Choose a strong password you have not used elsewhere.')}
  <section class="section-tight"><div class="container" style="max-width:560px">
    <div class="panel">
      <form id="resetForm">
        <div class="field"><label>New password</label><input id="rpPass" type="password" autocomplete="new-password" /></div>
        <span class="hint">At least 8 characters, with a letter and a number.</span>
        <div class="field"><label>Confirm new password</label><input id="rpPass2" type="password" autocomplete="new-password" /></div>
        <button class="btn btn-primary btn-block" type="submit">Update password</button>
      </form>
    </div>
  </div></section>`;
  setTimeout(() => {
    const form = document.getElementById('resetForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = document.getElementById('rpPass').value;
      const confirm = document.getElementById('rpPass2').value;
      try {
        if (pass !== confirm) throw new Error('Passwords do not match.');
        await authSupabase.updatePassword(pass, confirm);
        await authSupabase.syncBackend(session.access_token);
        await (await import('./core.js?v=13')).loadMe();
        toast('Password updated', 'You are signed in with your new password.', 'success');
        navigate('#/my');
      } catch (err) { toast('Could not update password', err.message, 'error'); }
    });
  }, 0);
  return layout(inner);
}
