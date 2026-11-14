'use strict';
import {
  state, API, escapeHtml, fmtDate, fmtTime, fmtDateTime, initials, badge, icon, iconFilled,
  stars, layout, sectionHead, empty, spinner, pageHero, breadcrumb, serviceIcon, setting,
  panditName, panditShort, siteName, parseJson, ensure, navigate, toast, modal, qsa
} from './core.js?v=14';

function serviceCard(s) {
  const artClass = s.type === 'CONSULTATION' ? 'art-consult' : (s.type === 'EVENT' ? 'art-event' : '');
  return `<article class="service-card">
    <a href="#/services/${s.slug}">
      <div class="service-art ${artClass}">
        ${serviceIcon(s.slug, s.type)}
        <span class="art-label">${s.type === 'CONSULTATION' ? 'Guidance' : s.type === 'EVENT' ? 'Gathering' : 'Puja'}</span>
      </div>
    </a>
    <div class="service-card-body">
      <div class="meta-row">
        <span>${escapeHtml(s.category?.name || (s.type === 'CONSULTATION' ? 'Consultation' : 'Puja'))}</span>
        <span class="dot"></span>
        <span>${s.duration} min</span>
        ${s.featured ? `<span class="dot"></span><span style="color:var(--saffron)">Featured</span>` : ''}
      </div>
      <h3><a href="#/services/${s.slug}">${escapeHtml(s.name)}</a></h3>
      <p>${escapeHtml(s.shortDescription || '')}</p>
      <div class="service-card-footer">
        <div class="service-price"><small>Indicative</small><strong>${escapeHtml(s.priceText || 'Discussed after request')}</strong></div>
        <a class="round-arrow" href="#/services/${s.slug}" aria-label="View ${escapeHtml(s.name)}">${icon('arrow')}</a>
      </div>
    </div>
  </article>`;
}

function eventCard(e) {
  const full = e.full || (e.seatsLeft <= 0);
  const date = new Date(e.startAt);
  const day = new Intl.DateTimeFormat('en-IN', { day: '2-digit', timeZone: 'Asia/Kolkata' }).format(date);
  const mon = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).format(date);
  return `<article class="event-card">
    <div class="event-banner">
      <span class="event-kind">${escapeHtml(e.kind.replace(/_/g,' '))}</span>
      <div class="event-date-chip"><b>${day}</b><span>${mon}</span></div>
    </div>
    <div class="event-card-body">
      <h3><a href="#/events/${e.slug}">${escapeHtml(e.title)}</a></h3>
      <div class="event-meta">
        <span>${icon('calendar')} ${fmtDateTime(e.startAt)}</span>
        <span>${icon('map')} ${escapeHtml(e.venue)}</span>
        ${e.online ? `<span>${icon('spark')} Online option available</span>` : ''}
      </div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">${escapeHtml((e.description || '').slice(0, 150))}${(e.description||'').length>150?'â€¦':''}</p>
      <div class="event-card-footer">
        <span class="${full ? 'seats-pill full' : 'seats-pill'}">${full ? 'Full Â· waitlist open' : `${e.seatsLeft} of ${e.capacity} seats left`}</span>
        <a class="text-link" href="#/events/${e.slug}">${full ? 'Join waitlist' : 'Register'} ${icon('arrow')}</a>
      </div>
    </div>
  </article>`;
}

function testimonialMini(t) {
  return `<div class="testimonial-mini">
    ${stars(t.rating)}
    <p>â€œ${escapeHtml(t.quote)}â€</p>
    <strong>${escapeHtml(t.customer_name)}</strong><span>Â· ${escapeHtml(t.city || '')}</span>
  </div>`;
}

export async function renderHome() {
  const home = await API.get('/api/home');
  const pandit = home.pandit || {};
  const featured = (home.featured || []).slice(0, 6);
  const events = (home.events || []).slice(0, 3);
  const testimonials = (home.testimonials || []).slice(0, 4);
  const featuredReview = home.featuredReview || testimonials[0];
  const panchang = home.panchang || {};
  const stats = home.stats || {};
  const signs = (home.signs || []).slice(0, 12);

  const pathwayIcons = {
    puja: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6h6v6"/></svg>`,
    guidance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5 12 15l-2.5-5.5L15 12z"/></svg>`,
    events: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  };

  const inner = `
  <section class="home-hero">
    <div class="container">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">${escapeHtml(home.settings?.['site.pandit_title'] || 'Vedic priest & jyotish guide Â· Hyderabad')}</span>
          <h1 class="display">A sacred pause for the life you are living.</h1>
          <p class="lede">Request a puja, a personal jyotish consultation, or a seat at a sacred gathering with ${escapeHtml(panditName())}. Every request is read personally. We call you to confirm. No payment is taken online.</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/pujas">Request a puja ${icon('arrow')}</a>
            <a class="btn btn-outline btn-lg" href="#/guidance">Personal guidance</a>
          </div>
          <div class="hero-note">${icon('spark')} <span>This is a request, not an instant booking. A slot is held gently while we speak. Payment, if any, is settled directly with Pandit ji.</span></div>
          <div class="hero-trust">
            <div class="trust"><strong>${escapeHtml(String(stats.years || 12))}+</strong><span>Years of practice</span></div>
            <div class="trust"><strong>${(stats.bookings || 0).toLocaleString('en-IN')}+</strong><span>Ceremonies performed</span></div>
            <div class="trust"><strong>${Number(pandit.rating || 4.8).toFixed(1)}</strong><span>Average rating</span></div>
            <div class="trust"><strong>${stats.services || 17}</strong><span>Services offered</span></div>
          </div>
        </div>
        <div class="hero-art-wrap">
          <div class="hero-art"><img src="/assets/hero.svg" alt="Ceremonial arch with a lotus and a lit diya" /></div>
          <div class="hero-float">
            <div class="icon-round" style="width:36px;height:36px;border-radius:50%;background:var(--gold-pale);color:var(--maroon);display:grid;place-items:center">${icon('calendar')}</div>
            <div><strong>Next available</strong><span>${pandit.nextSlot ? fmtDateTime(pandit.nextSlot) : 'Checking the calendarâ€¦'}</span></div>
          </div>
          <div class="hero-seal"><b>${escapeHtml((panditName().split(' ').slice(-1)[0] || 'R').slice(0,1))}</b>${escapeHtml(panditName().split(' ').slice(1).join(' '))}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="section-tight" style="position:relative;z-index:2;margin-top:-34px">
    <div class="container">
      <div class="check-card">
        <div class="check-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <div><strong>Check availability</strong><span>See open slots with Pandit ji</span></div>
        </div>
        <div class="field"><label>Service</label><select id="checkService">${(home.featured||[]).map(s=>`<option value="${s.slug}">${escapeHtml(s.name)}</option>`).join('')}${(home.categories||[]).length?'':''.replace('','')}<option value="">Any puja</option></select></div>
        <div class="field"><label>Date</label><input type="date" id="checkDate" value="${new Date().toISOString().slice(0,10)}" /></div>
        <button class="btn btn-primary" id="checkBtn">Check slots</button>
        <div id="checkResult" class="hide"></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:20px">
    <div class="container">
      <div class="panchang-strip" style="border-radius:18px">
        <div class="container" style="padding:0 28px">
          <div class="panchang-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>
            <div><strong>Todayâ€™s panchang</strong><span>${escapeHtml(panchang.dateLabel || '')}</span></div>
          </div>
          <div class="panchang-items">
            <div class="panchang-item"><span>Tithi</span><strong>${escapeHtml(panchang.tithi || '')}</strong></div>
            <div class="panchang-item"><span>Nakshatra</span><strong>${escapeHtml(panchang.nakshatra || '')}</strong></div>
            <div class="panchang-item"><span>Rahu kalam</span><strong>${escapeHtml(panchang.rahuKalam || '')}</strong></div>
            <div class="panchang-item"><span>Abhijit</span><strong>${escapeHtml(panchang.abhijit || '')}</strong></div>
            <div class="panchang-item"><span>Sunrise Â· Sunset</span><strong>${escapeHtml(panchang.sunrise || '')} Â· ${escapeHtml(panchang.sunset || '')}</strong></div>
          </div>
          <a class="text-link" href="#/panchang" style="color:var(--gold-light);border-color:transparent">Full almanac ${icon('arrow')}</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      ${sectionHead('Three paths', 'What would you like to begin?', 'Pujas at home or in the temple, a quiet conversation about your chart, or a seat at a sacred gathering.')}
      <div class="path-grid">
        <article class="path-card">
          <div class="path-icon">${pathwayIcons.puja}</div>
          <h3>Pujas &amp; homam</h3>
          <p>Griha pravesh, satyanarayana, rudrabhishek, navagraha shanti and more â€” performed at your home, in a temple, or online.</p>
          <a class="text-link" href="#/pujas">Browse pujas ${icon('arrow')}</a>
        </article>
        <article class="path-card">
          <div class="path-icon">${pathwayIcons.guidance}</div>
          <h3>Personal guidance</h3>
          <p>Birth chart, kundli matching, career and year-ahead readings in your language, without fear-based predictions.</p>
          <a class="text-link" href="#/guidance">Book a consultation ${icon('arrow')}</a>
        </article>
        <article class="path-card">
          <div class="path-icon">${pathwayIcons.events}</div>
          <h3>Sacred gatherings</h3>
          <p>Monthly homams, satsangs and workshops you can join in person or online, with family and friends.</p>
          <a class="text-link" href="#/events">See gatherings ${icon('arrow')}</a>
        </article>
      </div>
    </div>
  </section>

  <section class="section bg-paper" style="border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft)">
    <div class="container">
      ${sectionHead('Popular pujas', 'Ceremonies families request most', 'Every service page lists duration, samagri and preparation notes. Nothing is charged online.', `<a class="text-link" href="#/pujas">All pujas ${icon('arrow')}</a>`)}
      <div class="service-grid">${featured.map(serviceCard).join('') || empty('No services yet', 'Add services from the admin panel.')}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="pandit-feature">
        <div class="pandit-portrait">
          <div class="portrait-mono">
            <div class="mono-ring"><span>${initials(panditName())}</span></div>
            <strong>${escapeHtml(panditName())}</strong>
            <small>${escapeHtml(pandit.headline || '')}</small>
          </div>
        </div>
        <div class="pandit-copy">
          <span class="eyebrow">Meet the pandit</span>
          <h2 class="display">One priest. One relationship. For as long as you need.</h2>
          <p class="lede">${escapeHtml((pandit.bio || '').split('\n')[0] || '')}</p>
          <div class="pandit-facts">
            <div><span>Tradition</span><strong>${escapeHtml(pandit.tradition || 'Smartha')}</strong></div>
            <div><span>Experience</span><strong>${escapeHtml(String(pandit.experience || 22))} years</strong></div>
            <div><span>City</span><strong>${escapeHtml(pandit.city || 'Hyderabad')}</strong></div>
            <div><span>Languages</span><strong>${escapeHtml((pandit.languages || []).join(', '))}</strong></div>
            <div><span>Specialities</span><strong>${escapeHtml((pandit.specializations || []).slice(0,4).join(', '))}</strong></div>
            <div><span>Rating</span><strong>${Number(pandit.rating || 4.8).toFixed(1)} Â· ${pandit.reviewCount || 0} reviews</strong></div>
          </div>
          <p class="pandit-quote">â€œI perform each ceremony myself and explain every step, so grandparents and children can take part together.â€</p>
          <div class="row" style="gap:12px">
            <a class="btn btn-maroon" href="#/about">Read Pandit jiâ€™s story ${icon('arrow')}</a>
            <a class="btn btn-outline" href="#/providers/${pandit.slug || 'pandit-ramesh-sharma'}">Profile & reviews</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section bg-cream2">
    <div class="container">
      ${sectionHead('How it works', 'Three steps. No surprises.', 'We ask only what is needed to start the conversation. The rest is collected on the call.')}
      <div class="steps">
        <div class="step"><div class="step-number">01</div><h3>Choose & request</h3><p>Pick a service, a date and a slot. Add your details and submit. You receive a reference number instantly.</p></div>
        <div class="step"><div class="step-number">02</div><h3>We call you</h3><p>Pandit ji or our team calls or WhatsApps you to confirm time, place, samagri and contribution.</p></div>
        <div class="step"><div class="step-number">03</div><h3>The ceremony</h3><p>The puja is performed with care. You receive a thank-you note and an invitation to review.</p></div>
      </div>
    </div>
  </section>

  ${events.length ? `<section class="section">
    <div class="container">
      ${sectionHead('Upcoming gatherings', 'Join a homam, satsang or workshop', 'In person at the temple or courtyard, or online from wherever you are.', `<a class="text-link" href="#/events">All gatherings ${icon('arrow')}</a>`)}
      <div class="event-grid">${events.map(eventCard).join('')}</div>
    </div>
  </section>` : ''}

  <section class="section bg-paper" style="border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft)">
    <div class="container">
      ${sectionHead('Families say', 'Trust, earned one ceremony at a time', '')}
      <div class="testimonial-grid">
        ${featuredReview ? `<div class="testimonial-feature">
          ${stars(featuredReview.rating)}
          <blockquote>â€œ${escapeHtml(featuredReview.quote)}â€</blockquote>
          <div class="testimonial-author"><div class="avatar">${initials(featuredReview.customer_name)}</div><div><strong>${escapeHtml(featuredReview.customer_name)}</strong><span>${escapeHtml(featuredReview.city || '')} Â· ${escapeHtml(featuredReview.service_name || '')}</span></div></div>
        </div>` : ''}
        <div class="testimonial-stack">${testimonials.filter(t=>t!==featuredReview).slice(0,3).map(testimonialMini).join('')}</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="horoscope-band">
        <div>
          <span class="eyebrow">Daily horoscope</span>
          <h2 class="display" style="margin:12px 0 14px">What is the sky saying today?</h2>
          <p class="lede">A gentle, non-fatalistic reading for each of the twelve signs â€” love, career, money and health â€” refreshed every day.</p>
          <a class="btn btn-maroon" style="margin-top:20px" href="#/horoscope">Open todayâ€™s horoscope ${icon('arrow')}</a>
        </div>
        <div>
          <div class="sign-grid">
            ${(home.signs || []).map(s => `<a class="sign-tile" href="#/horoscope?sign=${s.code}">
              <span class="glyph">${escapeHtml(s.symbol)}</span>
              <span>${escapeHtml(s.name)}</span>
            </a>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section bg-cream2">
    <div class="container">
      ${sectionHead('Questions', 'Things people ask before booking', '')}
      <div class="faq-list">
        ${(home.faqs || []).slice(0,6).map(f => `<div class="faq-item"><button class="faq-q">${escapeHtml(f.question)}<span class="faq-plus">${icon('plus')}</span></button><div class="faq-a"><div class="faq-a-inner">${escapeHtml(f.answer)}</div></div></div>`).join('')}
      </div>
      <div style="text-align:center;margin-top:22px"><a class="text-link" href="#/faq">All questions ${icon('arrow')}</a></div>
    </div>
  </section>

  <section class="cta-band">
    <div class="container">
      <div class="cta-inner">
        <div><h2 class="display">Begin with one small request.</h2><p>Tell us what you need. We will call you back, find a time that suits your family, and perform the ceremony with care.</p></div>
        <div class="cta-actions">
          <a class="btn btn-primary btn-lg" href="#/pujas">Request a puja</a>
          <a class="btn btn-outline btn-lg" style="color:#f7ebd8;border-color:rgba(230,206,156,.4)" href="tel:${(home.settings?.['site.contact_phone']||'+91 90000 12345').replace(/\s/g,'')}">Call Pandit ji</a>
        </div>
      </div>
    </div>
  </section>`;

  setTimeout(() => {
    const btn = document.getElementById('checkBtn');
    if (btn) btn.addEventListener('click', async () => {
      const service = document.getElementById('checkService')?.value;
      const date = document.getElementById('checkDate')?.value;
      const res = document.getElementById('checkResult');
      res.classList.remove('hide');
      res.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-color:rgba(87,31,43,.2);border-top-color:var(--maroon)"></span> Checkingâ€¦`;
      try {
        const data = await API.get(`/api/check?${service ? `service=${encodeURIComponent(service)}&` : ''}date=${encodeURIComponent(date)}`);
        const count = data.totalAvailable || 0;
        res.innerHTML = count
          ? `<strong>${count} slot${count===1?'':'s'} open on ${escapeHtml(fmtDate(date+'T12:00:00+05:30','date'))}.</strong> <a href="#/availability?${service?`service=${service}&`:''}date=${date}">Choose a time â†’</a>`
          : `No open slots that day, but you can still <a href="#/availability?${service?`service=${service}&`:''}date=${date}">send a request with an alternative time</a>.`;
      } catch (e) {
        res.innerHTML = `Could not check right now: ${escapeHtml(e.message)}`;
      }
    });
  }, 0);

  return layout(inner);
}

export async function renderPujas(query = {}) {
  const params = new URLSearchParams();
  if (query.type) params.set('type', query.type);
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.featured) params.set('featured', query.featured);
  const data = await API.get('/api/services' + (params.toString() ? '?' + params.toString() : ''));
  const categories = data.categories || [];
  const type = query.type || '';
  const inner = `
  ${pageHero('Pujas & ceremonies', 'Pujas performed with care', 'Household pujas, life-event sanskaras, planet remedies, homams and fire rituals. Choose a service to read more and request a time.')}
  <section class="section-tight">
    <div class="container">
      <div class="catalog-bar">
        <div class="filter-chips">
          <button class="filter-chip ${!type?'active':''}" data-filter="type" data-value="">All</button>
          <button class="filter-chip ${type==='PUJA'?'active':''}" data-filter="type" data-value="PUJA">Pujas</button>
          <button class="filter-chip ${type==='CONSULTATION'?'active':''}" data-filter="type" data-value="CONSULTATION">Guidance</button>
          <button class="filter-chip ${type==='EVENT'?'active':''}" data-filter="type" data-value="EVENT">Gatherings</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="search-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="catSearch" type="search" placeholder="Search services" value="${escapeHtml(query.q||'')}" /></div>
          <span class="catalog-count">${data.services.length} services</span>
        </div>
      </div>
      <div class="catalog-grid">
        <div class="service-grid">${(data.services||[]).map(serviceCard).join('') || empty('No services match', 'Try a different filter or search.')}</div>
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    qsa('[data-filter="type"]').forEach(b => b.addEventListener('click', () => {
      const url = new URL(location.href);
      const p = new URLSearchParams(url.hash.split('?')[1] || '');
      if (b.dataset.value) p.set('type', b.dataset.value); else p.delete('type');
      const q = document.getElementById('catSearch')?.value;
      if (q) p.set('q', q); else p.delete('q');
      navigate('#/pujas' + (p.toString() ? '?' + p.toString() : ''));
    }));
    const search = document.getElementById('catSearch');
    if (search) search.addEventListener('change', () => {
      const p = new URLSearchParams((location.hash.split('?')[1]||''));
      if (search.value) p.set('q', search.value); else p.delete('q');
      navigate('#/pujas' + (p.toString() ? '?' + p.toString() : ''));
    });
  }, 0);
  return layout(inner);
}

export async function renderServiceDetail(params) {
  const data = await API.get(`/api/services/${params.slug}`);
  const s = data.service;
  const providers = data.providers || [];
  const pandit = providers[0];
  const inner = `
  ${pageHero(s.type === 'CONSULTATION' ? 'Personal guidance' : 'Puja detail', s.name, s.shortDescription || '')}
  <div class="container" style="padding-top:14px">${breadcrumb([{label:'Home',href:'#/'},{label: s.type==='CONSULTATION'?'Guidance':'Pujas',href: s.type==='CONSULTATION'?'#/guidance':'#/pujas'},{label:s.name}])}</div>
  <section class="section" style="padding-top:28px">
    <div class="container">
      <div class="detail-layout">
        <div class="detail-main">
          <div class="detail-hero-art"><div class="service-art ${s.type==='CONSULTATION'?'art-consult':''}">${serviceIcon(s.slug,s.type)}<span class="art-label">${s.type==='CONSULTATION'?'Guidance':'Puja'}</span></div></div>
          <div class="detail-meta">
            <div><span>Duration</span><strong>${s.duration} minutes</strong></div>
            <div><span>Category</span><strong>${escapeHtml(s.category?.name || 'â€”')}</strong></div>
            <div><span>Locations</span><strong>${escapeHtml((s.locations||[]).join(', ').replace(/_/g,' ') || 'â€”')}</strong></div>
            <div><span>Participants</span><strong>${s.minParticipants}â€“${s.maxParticipants}</strong></div>
            ${s.type==='CONSULTATION' ? `<div><span>Modes</span><strong>${escapeHtml((s.modes||[]).join(', '))}</strong></div>` : ''}
          </div>
          <div class="prose">
            <h2>About this ${s.type==='CONSULTATION'?'consultation':'puja'}</h2>
            ${(s.description||'').split('\n').map(p=>`<p>${escapeHtml(p)}</p>`).join('')}
            ${s.benefits ? `<div class="benefit-box"><h3>What it brings</h3><p>${escapeHtml(s.benefits)}</p></div>` : ''}
            ${s.preparationNotes ? `<h3>Preparation</h3><p>${escapeHtml(s.preparationNotes)}</p>` : ''}
          </div>
          ${data.samagri?.length ? `<h3 class="display" style="font-size:1.5rem;margin:30px 0 6px">Samagri</h3><p class="muted small" style="margin-bottom:10px">Materials and who brings them.</p><div class="samagri-list">${data.samagri.map(i=>`<div class="samagri-row"><span>${escapeHtml(i.item_name)} <small style="color:var(--muted-2)">Â· ${escapeHtml(i.quantity_text||'')}</small></span><span class="by">${escapeHtml(i.provided_by)}</span></div>`).join('')}</div>` : ''}
          ${data.faqs?.length ? `<h3 class="display" style="font-size:1.5rem;margin:30px 0 6px">Questions</h3><div class="faq-list">${data.faqs.map(f=>`<div class="faq-item"><button class="faq-q">${escapeHtml(f.question)}<span class="faq-plus">${icon('plus')}</span></button><div class="faq-a"><div class="faq-a-inner">${escapeHtml(f.answer)}</div></div></div>`).join('')}</div>` : ''}
          ${data.reviews?.length ? `<h3 class="display" style="font-size:1.5rem;margin:30px 0 14px">Reviews</h3><div class="review-list">${data.reviews.map(r=>`<div class="review-item"><div class="review-head"><div><strong>${escapeHtml(r.name)}</strong><span> Â· ${fmtDate(r.createdAt,'date')}</span></div>${stars(r.rating)}</div>${r.title?`<h4>${escapeHtml(r.title)}</h4>`:''}<p>${escapeHtml(r.comment)}</p>${r.reply?`<div class="review-reply"><strong>Pandit ji:</strong> ${escapeHtml(r.reply)}</div>`:''}</div>`).join('')}</div>` : ''}
          ${data.related?.length ? `<h3 class="display" style="font-size:1.5rem;margin:34px 0 14px">You may also like</h3><div class="service-grid">${data.related.map(serviceCard).join('')}</div>` : ''}
        </div>
        <aside>
          <div class="booking-card">
            <div class="booking-card-head">
              <div class="price">${escapeHtml(s.priceText || 'Discussed after request')}<small>Indicative contribution Â· settled offline</small></div>
            </div>
            <div class="booking-card-body">
              <a class="btn btn-primary btn-block btn-lg" href="#/book/${s.type==='CONSULTATION'?'consultation':'puja'}/${s.slug}">Request this ${s.type==='CONSULTATION'?'consultation':'puja'} ${icon('arrow')}</a>
              <a class="btn btn-outline btn-block" href="#/availability?service=${s.slug}">Check available slots</a>
              <div class="booking-card-note">${icon('spark')}<span>This is a request. We will call or WhatsApp you to confirm time, place and samagri. No payment is taken online.</span></div>
              <div class="booking-points">
                <div>${icon('check')}<span>${s.type==='CONSULTATION'?'Birth details are used only with your consent':'Samagri can be brought by you or by Pandit ji'}</span></div>
                <div>${icon('check')}<span>${s.type==='CONSULTATION'?'Sessions in your preferred language':'Home, temple or online with live stream'}</span></div>
                <div>${icon('check')}<span>Reschedule or cancel up to 12 hours before</span></div>
              </div>
            </div>
          </div>
          ${pandit ? `<div class="person-card">
            <div class="avatar">${initials(pandit.name)}</div>
            <div><strong>${escapeHtml(pandit.name)}</strong><span>${escapeHtml(pandit.headline||'')}</span><div style="margin-top:6px">${stars(pandit.rating)} <small style="color:var(--muted)">${pandit.reviewCount} reviews</small></div></div>
          </div>` : ''}
        </aside>
      </div>
    </div>
  </section>`;
  return layout(inner);
}

export async function renderGuidance() {
  const data = await API.get('/api/services?type=CONSULTATION');
  const inner = `
  ${pageHero('Personal guidance', 'A reading, not a prediction', 'Birth chart, kundli matching, career and year-ahead consultations with Pandit Ramesh Sharma â€” in Telugu, Hindi, English or Sanskrit.')}
  <section class="section-tight">
    <div class="container">
      <div class="catalog-bar" style="position:static;background:transparent;padding:0 0 18px;border:0">
        <div style="max-width:640px"><p class="lede">Every consultation begins with your question. There are no fear-based predictions and no miracle promises â€” just a careful reading of your chart and a practical next step.</p></div>
        <a class="btn btn-primary" href="#/book/consultation/${(data.services[0]||{}).slug||''}">Begin a consultation ${icon('arrow')}</a>
      </div>
      <div class="service-grid">${(data.services||[]).map(serviceCard).join('')}</div>
    </div>
  </section>
  <section class="section bg-paper" style="border-top:1px solid var(--line-soft)">
    <div class="container">
      <div class="grid-3">
        <div class="benefit-box" style="margin:0"><h3>Before the session</h3><p>Share your date, time and place of birth. If you do not know the time, tick â€œI donâ€™t knowâ€ â€” we work with a solar chart.</p></div>
        <div class="benefit-box" style="margin:0"><h3>During the session</h3><p>Voice, video or in person, in your language. Ask anything. We go at your pace.</p></div>
        <div class="benefit-box" style="margin:0"><h3>After the session</h3><p>A written summary with key dates and a simple remedy, plus one follow-up question by email.</p></div>
      </div>
    </div>
  </section>`;
  return layout(inner);
}

export async function renderEvents(query = {}) {
  const data = await API.get('/api/events' + (query.kind ? `?kind=${encodeURIComponent(query.kind)}` : ''));
  const kinds = ['HOMAM','GROUP_PUJA','FESTIVAL','SATSANG','WORKSHOP'];
  const inner = `
  ${pageHero('Sacred gatherings', 'Homams, satsangs & workshops', 'Join Pandit ji and other families for a morning of chanting and fire, an evening of bhajan, or a practical workshop. In person or online.')}
  <section class="section-tight">
    <div class="container">
      <div class="catalog-bar" style="position:static;background:transparent">
        <div class="filter-chips">
          <button class="filter-chip ${!query.kind?'active':''}" data-kind="">All</button>
          ${kinds.map(k=>`<button class="filter-chip ${query.kind===k?'active':''}" data-kind="${k}">${k.replace('_',' ').toLowerCase().replace(/^\w/,c=>c.toUpperCase())}</button>`).join('')}
        </div>
        <span class="catalog-count">${data.events.length} upcoming</span>
      </div>
      <div class="event-grid" style="margin-top:24px">${(data.events||[]).map(eventCard).join('') || empty('No gatherings scheduled', 'Check back soon, or send an enquiry.')}</div>
    </div>
  </section>`;
  setTimeout(() => {
    qsa('[data-kind]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.kind;
      navigate('#/events' + (k ? '?kind=' + k : ''));
    }));
  }, 0);
  return layout(inner);
}

export async function renderEventDetail(params) {
  const data = await API.get(`/api/events/${params.slug}`);
  const e = data.event;
  const full = e.full || e.seatsLeft <= 0;
  const inner = `
  ${pageHero('Gathering', e.title, e.description || '')}
  <div class="container" style="padding-top:14px">${breadcrumb([{label:'Home',href:'#/'},{label:'Gatherings',href:'#/events'},{label:e.title}])}</div>
  <section class="section" style="padding-top:28px">
    <div class="container">
      <div class="detail-layout">
        <div class="detail-main">
          <div class="detail-meta">
            <div><span>When</span><strong>${fmtDateTime(e.startAt)}</strong></div>
            <div><span>Where</span><strong>${escapeHtml(e.venue)}</strong></div>
            <div><span>Seats</span><strong>${e.seatsTaken} / ${e.capacity}${full?' Â· full':''}</strong></div>
            <div><span>Online</span><strong>${e.online ? 'Yes, live stream' : 'In person only'}</strong></div>
          </div>
          <div class="prose">
            ${e.rituals ? `<h3>Rituals included</h3><p>${escapeHtml(e.rituals)}</p>` : ''}
            ${e.instructions ? `<h3>Instructions</h3><p>${escapeHtml(e.instructions)}</p>` : ''}
            ${e.dressCode ? `<h3>Dress code</h3><p>${escapeHtml(e.dressCode)}</p>` : ''}
          </div>
          ${data.sessions?.length ? `<h3 class="display" style="font-size:1.5rem;margin:28px 0 10px">Schedule</h3><div class="samagri-list">${data.sessions.map(s=>`<div class="samagri-row"><span>${escapeHtml(s.title)}</span><span class="by">${fmtTime(s.startAt)} â€“ ${fmtTime(s.endAt)}</span></div>`).join('')}</div>` : ''}
          ${data.lead ? `<div class="person-card" style="margin-top:24px"><div class="avatar">${initials(data.lead.name)}</div><div><strong>${escapeHtml(data.lead.name)}</strong><span>Lead for this gathering</span></div></div>` : ''}
          ${data.faqs?.length ? `<h3 class="display" style="font-size:1.5rem;margin:30px 0 6px">Questions</h3><div class="faq-list">${data.faqs.map(f=>`<div class="faq-item"><button class="faq-q">${escapeHtml(f.question)}<span class="faq-plus">${icon('plus')}</span></button><div class="faq-a"><div class="faq-a-inner">${escapeHtml(f.answer)}</div></div></div>`).join('')}</div>` : ''}
          ${data.related?.length ? `<h3 class="display" style="font-size:1.5rem;margin:30px 0 14px">Other gatherings</h3><div class="event-grid">${data.related.map(eventCard).join('')}</div>` : ''}
        </div>
        <aside>
          <div class="booking-card">
            <div class="booking-card-head">
              <div class="price">${escapeHtml(e.contributionText || 'Contribution discussed offline')}<small>Settled offline Â· no online payment</small></div>
            </div>
            <div class="booking-card-body">
              <a class="btn btn-primary btn-block btn-lg" href="#/book/event/${e.slug}">${full ? 'Join the waitlist' : 'Register for this gathering'} ${icon('arrow')}</a>
              ${e.online ? `<a class="btn btn-outline btn-block" href="${escapeHtml(e.streamUrl||'#')}">Online link (after confirmation)</a>` : ''}
              <div class="booking-card-note">${icon('spark')}<span>${full ? 'This gathering is full. Join the waitlist and we will call you if a seat opens.' : `Registration closes ${fmtDate(e.registrationClosesAt,'date')}.`}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </section>`;
  return layout(inner);
}

export async function renderHoroscope(query = {}) {
  const sign = (query.sign || 'aries').toLowerCase();
  const period = (query.period || 'DAILY').toUpperCase();
  const data = await API.get(`/api/horoscope?sign=${encodeURIComponent(sign)}&period=${encodeURIComponent(period)}`);
  const r = data.reading || {};
  const signs = data.signs || [];
  const inner = `
  ${pageHero('Daily horoscope', 'A gentle reading for your sign', 'Non-fatalistic, practical and refreshed every day. Choose a sign and a period.')}
  <section class="section-tight">
    <div class="container">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px">
        ${['DAILY','WEEKLY','MONTHLY','YEARLY'].map(p=>`<a class="filter-chip ${period===p?'active':''}" href="#/horoscope?sign=${sign}&period=${p}">${p.charAt(0)+p.slice(1).toLowerCase()}</a>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:260px minmax(0,1fr);gap:34px;align-items:start">
        <div>
          <div class="sign-grid" style="grid-template-columns:repeat(3,1fr)">
            ${signs.map(s=>`<a class="sign-tile ${s.code===sign?'active':''}" href="#/horoscope?sign=${s.code}&period=${period}" style="color:var(--ink);border-color:${s.code===sign?'var(--gold)':'var(--line)'};background:${s.code===sign?'var(--gold-pale)':'var(--paper)'}">
              <span class="glyph" style="color:var(--maroon)">${escapeHtml(s.symbol)}</span>
              <span style="color:var(--muted)">${escapeHtml(s.name)}</span>
            </a>`).join('')}
          </div>
        </div>
        <div>
          <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:18px;flex-wrap:wrap">
            <span style="font-size:2.6rem;color:var(--maroon)">${escapeHtml(r.symbol || '')}</span>
            <div><h2 class="display" style="font-size:2.2rem;margin:0">${escapeHtml(r.sign_name || sign)} <em style="color:var(--saffron);font-size:1rem">${escapeHtml(data.periodLabel || '')}</em></h2><p class="muted small">${escapeHtml(r.sign_dates || '')} Â· ${escapeHtml(r.element || '')} Â· ruled by ${escapeHtml(r.planet || '')}</p></div>
          </div>
          <div class="benefit-box"><h3>Summary</h3><p>${escapeHtml(r.summary || '')}</p></div>
          <div class="grid-2" style="margin-top:14px">
            <div class="benefit-box" style="margin:0"><h3>Love</h3><p>${escapeHtml(r.love || '')}</p></div>
            <div class="benefit-box" style="margin:0"><h3>Career</h3><p>${escapeHtml(r.career || '')}</p></div>
            <div class="benefit-box" style="margin:0"><h3>Finance</h3><p>${escapeHtml(r.finance || '')}</p></div>
            <div class="benefit-box" style="margin:0"><h3>Health</h3><p>${escapeHtml(r.health || '')}</p></div>
          </div>
          <div class="row" style="gap:24px;margin-top:18px;font-size:.78rem;color:var(--muted)">
            <span><strong style="color:var(--maroon)">Lucky number</strong> ${escapeHtml(r.lucky_number || '')}</span>
            <span><strong style="color:var(--maroon)">Lucky colour</strong> ${escapeHtml(r.lucky_color || '')}</span>
            <span><strong style="color:var(--maroon)">Author</strong> ${escapeHtml(r.author_id || '')}</span>
          </div>
          <p class="muted small" style="margin-top:22px">Horoscopes are guidance, not fate. For a reading of your own chart, <a class="text-link" href="#/guidance">book a consultation ${icon('arrow')}</a>.</p>
        </div>
      </div>
      ${data.panchang ? `<div style="margin-top:40px">${sectionHead('Todayâ€™s panchang','Auspicious windows for the day','')}${panchangCard(data.panchang)}</div>` : ''}
    </div>
  </section>`;
  return layout(inner);
}

function panchangCard(p) {
  return `<div class="benefit-box" style="margin:0"><div class="grid-4">
    <div><span class="eyebrow no-line" style="color:var(--muted-2)">Tithi</span><strong style="display:block;font-family:var(--serif);font-size:1.15rem;color:var(--maroon);margin-top:4px">${escapeHtml(p.tithi)}</strong><small class="muted">${escapeHtml(p.paksha)}</small></div>
    <div><span class="eyebrow no-line" style="color:var(--muted-2)">Nakshatra</span><strong style="display:block;font-family:var(--serif);font-size:1.15rem;color:var(--maroon);margin-top:4px">${escapeHtml(p.nakshatra)}</strong><small class="muted">${escapeHtml(p.yoga)}</small></div>
    <div><span class="eyebrow no-line" style="color:var(--muted-2)">Rahu kalam</span><strong style="display:block;font-family:var(--serif);font-size:1.15rem;color:var(--maroon);margin-top:4px">${escapeHtml(p.rahuKalam)}</strong><small class="muted">Avoid new beginnings</small></div>
    <div><span class="eyebrow no-line" style="color:var(--muted-2)">Abhijit</span><strong style="display:block;font-family:var(--serif);font-size:1.15rem;color:var(--maroon);margin-top:4px">${escapeHtml(p.abhijit)}</strong><small class="muted">Favourable window</small></div>
  </div></div>`;
}

export async function renderPanchang(query = {}) {
  const date = query.date || new Date().toISOString().slice(0,10);
  const data = await API.get(`/api/panchang?date=${encodeURIComponent(date)}`);
  const p = data.panchang;
  const inner = `
  ${pageHero('Panchang', 'Todayâ€™s almanac', 'Tithi, nakshatra, yoga, karana, sunrise, sunset, rahu kalam and abhijit for Hyderabad.')}
  <section class="section-tight">
    <div class="container">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
        ${(data.dates||[]).map(d=>`<a class="filter-chip ${d===date?'active':''}" href="#/panchang?date=${d}">${fmtDate(d+'T12:00:00+05:30','short')}</a>`).join('')}
      </div>
      <div class="benefit-box" style="padding:28px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          <div><h2 class="display" style="font-size:2rem;margin:0">${escapeHtml(p.dateLabel)}</h2><p class="muted small">${escapeHtml(p.weekday)} Â· ${escapeHtml(p.location)}</p></div>
          <span class="badge ${p.auspicious?'badge-green':'badge-amber'}">${p.auspicious?'Auspicious for puja':'Proceed with care'}</span>
        </div>
        <div class="grid-4">
          ${[['Tithi',p.tithi,p.paksha],['Nakshatra',p.nakshatra,p.yoga],['Karana',p.karana,p.moonPhase],['Sunrise / Sunset',p.sunrise+' Â· '+p.sunset,'']].map(([k,v,s])=>`<div><span class="eyebrow no-line" style="color:var(--muted-2)">${k}</span><strong style="display:block;font-family:var(--serif);font-size:1.2rem;color:var(--maroon);margin-top:4px">${escapeHtml(v)}</strong><small class="muted">${escapeHtml(s)}</small></div>`).join('')}
        </div>
        <div class="grid-4" style="margin-top:18px">
          ${[['Rahu kalam',p.rahuKalam,'Avoid new beginnings'],['Abhijit muhurat',p.abhijit,'Favourable window'],['Yoga',p.yoga,''],['Moon phase',p.moonPhase,'']].map(([k,v,s])=>`<div><span class="eyebrow no-line" style="color:var(--muted-2)">${k}</span><strong style="display:block;font-family:var(--serif);font-size:1.2rem;color:var(--maroon);margin-top:4px">${escapeHtml(v)}</strong><small class="muted">${escapeHtml(s)}</small></div>`).join('')}
        </div>
        <p style="margin-top:18px;font-size:.8rem;color:var(--muted)">${escapeHtml(p.notes)}</p>
      </div>
      <h3 class="display" style="font-size:1.5rem;margin:30px 0 12px">The week ahead</h3>
      <div style="display:grid;gap:10px">
        ${(data.nearby||[]).map(n=>`<div class="samagri-row"><span><strong>${fmtDate(n.date+'T12:00:00+05:30','date')}</strong> Â· ${escapeHtml(n.tithi)} Â· ${escapeHtml(n.nakshatra)}</span><span class="by" style="color:${n.auspicious?'var(--green)':'var(--amber)'}">${n.auspicious?'Auspicious':'Caution'}</span></div>`).join('')}
      </div>
      <h3 class="display" style="font-size:1.5rem;margin:30px 0 12px">Festivals & observances</h3>
      <div class="grid-3">${(data.festivals||[]).map(f=>`<div class="benefit-box" style="margin:0"><h3>${escapeHtml(f.emoji||'') } ${escapeHtml(f.name)}</h3><p>${fmtDate(f.date+'T12:00:00+05:30','long')}<br>${escapeHtml(f.description)}</p>${f.service?`<a class="text-link" href="#/services/${f.service.slug}" style="margin-top:8px">Related service ${icon('arrow')}</a>`:''}</div>`).join('')}</div>
      <div style="text-align:center;margin-top:26px"><a class="btn btn-outline" href="#/availability">Check availability with Pandit ji ${icon('arrow')}</a></div>
    </div>
  </section>`;
  return layout(inner);
}

export async function renderAbout() {
  const p = await API.get('/api/providers/pandit-ramesh-sharma').catch(()=>null);
  const pandit = p?.provider || {};
  const inner = `
  ${pageHero('About', panditName(), 'A small, steady practice: one family priest who performs every puja himself, reads every chart himself, and answers every request himself.')}
  <section class="section">
    <div class="container">
      <div class="pandit-feature">
        <div class="pandit-portrait"><div class="portrait-mono"><div class="mono-ring"><span>${initials(panditName())}</span></div><strong>${escapeHtml(panditName())}</strong><small>${escapeHtml(pandit.headline||'')}</small></div></div>
        <div class="pandit-copy">
          <p class="lede">${escapeHtml((pandit.bio||'').replace(/\n\n/g,'</p><p class="lede" style="margin-top:16px">'))}</p>
          <div class="pandit-facts">
            <div><span>Tradition</span><strong>${escapeHtml(pandit.tradition||'Smartha')}</strong></div>
            <div><span>Experience</span><strong>${escapeHtml(String(pandit.experience||22))} years</strong></div>
            <div><span>City</span><strong>${escapeHtml(pandit.city||'Hyderabad')}</strong></div>
            <div><span>Languages</span><strong>${escapeHtml((pandit.languages||[]).join(', '))}</strong></div>
            <div><span>Service radius</span><strong>${escapeHtml(String(pandit.serviceRadiusKm||35))} km</strong></div>
            <div><span>Rating</span><strong>${Number(pandit.rating||4.8).toFixed(1)} Â· ${pandit.reviewCount||0} reviews</strong></div>
          </div>
          <div class="row" style="gap:12px;margin-top:18px">
            <a class="btn btn-primary" href="#/pujas">Request a puja ${icon('arrow')}</a>
            <a class="btn btn-outline" href="#/guidance">Personal guidance</a>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="section bg-paper" style="border-top:1px solid var(--line-soft)">
    <div class="container">
      ${sectionHead('Specialities','What Pandit ji is known for','')}
      <div class="grid-4">${(pandit.specializations||[]).map(sp=>`<div class="benefit-box" style="margin:0;text-align:center"><h3 style="font-size:1.15rem">${escapeHtml(sp)}</h3></div>`).join('')}</div>
    </div>
  </section>
  <section class="section">
    <div class="container">
      ${sectionHead('Reviews','What families say','')}
      <div class="review-list">${(p?.reviews||[]).map(r=>`<div class="review-item"><div class="review-head"><div><strong>${escapeHtml(r.name)}</strong><span> Â· ${fmtDate(r.createdAt,'date')}</span></div>${stars(r.rating)}</div>${r.title?`<h4>${escapeHtml(r.title)}</h4>`:''}<p>${escapeHtml(r.comment)}</p>${r.reply?`<div class="review-reply"><strong>Pandit ji:</strong> ${escapeHtml(r.reply)}</div>`:''}</div>`).join('') || empty('No reviews yet','Be the first to leave one after your ceremony.')}</div>
    </div>
  </section>`;
  return layout(inner);
}

export async function renderContact() {
  const inner = `
  ${pageHero('Contact', 'Write to us', 'A question, a special request, or a ceremony we have not listed. We reply within one working day.')}
  <section class="section-tight">
    <div class="container">
      <div class="grid-2" style="align-items:start">
        <form id="enquiryForm" class="panel">
          <div class="field-row">
            <div class="field"><label>Name *</label><input name="name" required minlength="2" /></div>
            <div class="field"><label>Phone</label>
            <div style="display:flex;gap:8px">
              <select name="countryCode" style="min-height:44px;border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:0 8px;max-width:110px">
                <option value="+91">+91 India</option>
                <option value="+971">+971 UAE</option>
                <option value="+966">+966 KSA</option>
                <option value="+974">+974 Qatar</option>
                <option value="+965">+965 Kuwait</option>
                <option value="+968">+968 Oman</option>
                <option value="+973">+973 Bahrain</option>
                <option value="+44">+44 UK</option>
                <option value="+1">+1 US/CA</option>
                <option value="+65">+65 Singapore</option>
                <option value="+61">+61 Australia</option>
                <option value="+60">+60 Malaysia</option>
                <option value="+94">+94 Sri Lanka</option>
                <option value="+977">+977 Nepal</option>
                <option value="+880">+880 Bangladesh</option>
              </select>
              <input name="phone" type="tel" placeholder="9876543210" inputmode="numeric" maxlength="10" pattern="[0-9]*" style="flex:1" />
            </div>
          </div>
          </div>
          <div class="field"><label>Email</label><input name="email" type="email" /></div>
          <div class="field"><label>Subject</label><input name="subject" value="General enquiry" /></div>
          <div class="field"><label>Message *</label><textarea name="message" required minlength="5"></textarea></div>
          <button class="btn btn-primary" type="submit">Send message ${icon('arrow')}</button>
        </form>
        <div>
          <div class="benefit-box"><h3>Call or WhatsApp</h3><p>${escapeHtml(setting('site.contact_phone','+91 90000 12345'))}<br>${escapeHtml(setting('site.contact_whatsapp','+91 90000 12345'))}</p></div>
          <div class="benefit-box"><h3>Visit</h3><p>${escapeHtml(setting('site.address','12 Lotus Lane, Jubilee Hills, Hyderabad 500033'))}<br>${escapeHtml(setting('site.hours','Monâ€“Sat, 9:00 AM â€“ 8:00 PM IST'))}</p></div>
          <div class="benefit-box"><h3>Email</h3><p>${escapeHtml(setting('site.email','namaste@aradhana.in'))}</p></div>
        </div>
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    const form = document.getElementById('enquiryForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      if (body.phone) body.phone = (body.countryCode || '+91') + ' ' + body.phone;
      delete body.countryCode;
      try {
        const res = await API.post('/api/enquiries', body);
        toast('Message sent', res.message, 'success');
        form.reset();
      } catch (err) { toast('Could not send', err.message, 'error'); }
    });
  }, 0);
  return layout(inner);
}

export async function renderFaq() {
  const data = await API.get('/api/faqs');
  const grouped = data.grouped || {};
  const inner = `
  ${pageHero('Questions', 'Frequently asked', 'Everything you might wonder before your first booking.')}
  <section class="section-tight">
    <div class="container">
      ${Object.entries(grouped).map(([cat, list]) => `
        <h3 class="display" style="font-size:1.6rem;margin:28px 0 10px">${escapeHtml(cat)}</h3>
        <div class="faq-list">${list.map(f=>`<div class="faq-item"><button class="faq-q">${escapeHtml(f.question)}<span class="faq-plus">${icon('plus')}</span></button><div class="faq-a"><div class="faq-a-inner">${escapeHtml(f.answer)}</div></div></div>`).join('')}</div>
      `).join('')}
    </div>
  </section>`;
  return layout(inner);
}

export async function renderPolicy(kind) {
  const titles = { privacy:'Privacy policy', terms:'Terms of use', cancellation:'Cancellation policy' };
  const body = {
    privacy: 'Birth details and phone numbers are visible only to Pandit ji and the person handling your booking. Lists are masked, access is logged, and you can request deletion at any time from your account. We do not sell or share your data with third parties. Data is retained for the period set in settings (default 36 months) before anonymisation.',
    terms: 'Aradhana is a request-based booking service. Submitting a request does not guarantee a slot until it is confirmed by our team. No payment is taken online; any contribution is agreed and settled directly with Pandit ji. Content on this site (horoscopes, panchang) is guidance and not a substitute for professional advice.',
    cancellation: 'There is no online payment, so there is nothing to refund on the website. For a confirmed booking, please give at least 12 hours notice so Pandit jiâ€™s time can be released. Cancellation after that window follows the policy shared on your confirmation call. Waitlist registrations can be cancelled at any time at no cost.',
  };
  const inner = `
  ${pageHero('Policy', titles[kind] || 'Policy', '')}
  <section class="section-tight"><div class="container-narrow"><div class="prose"><p>${escapeHtml(body[kind] || '')}</p></div></div></section>`;
  return layout(inner);
}

export async function renderAvailability(query = {}) {
  const params = new URLSearchParams();
  if (query.service) params.set('service', query.service);
  if (query.date) params.set('date', query.date);
  const data = await API.get('/api/availability' + (params.toString() ? '?' + params.toString() : ''));
  const days = data.days || [];
  const selected = data.selectedDate;
  const groups = data.groups || { morning: [], afternoon: [], evening: [] };
  const inner = `
  ${pageHero('Availability', 'Open slots with Pandit ji', data.service ? `For ${escapeHtml(data.service.name)}.` : 'Choose a service, then pick a slot.')}
  <section class="section-tight">
    <div class="container">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
        <select id="availService" style="min-height:40px;border:1px solid var(--line);border-radius:9px;padding:0 12px;background:var(--paper)">${(data.providers||[]).length?'':''}<option value="">All services</option></select>
        <span class="muted small">${data.message || ''}</span>
      </div>
      <div class="slot-calendar">
        ${days.map(d => `<button class="slot-day ${d.date===selected?'active':''} ${d.count?'':'empty'}" data-date="${d.date}">
          <span class="wd">${escapeHtml(d.weekday)}</span>
          <span class="dd">${d.day}</span>
          <span class="ct">${d.count ? d.count + ' open' : 'â€”'}</span>
        </button>`).join('')}
      </div>
      ${['morning','afternoon','evening'].map(g => groups[g]?.length ? `<div class="slot-group"><h4>${g}</h4><div class="slot-chips">${groups[g].map(s=>`<button class="slot-chip ${s.status!=='AVAILABLE'?'tentative':''}" data-slot="${s.id}">${fmtTime(s.startAt)}<small>${s.status==='AVAILABLE'?'available':'request pending'}</small></button>`).join('')}</div></div>` : '').join('')}
      <div style="margin-top:24px;padding:16px;border:1px dashed var(--line);border-radius:10px;background:var(--gold-pale)">
        <strong style="color:var(--maroon)">No suitable slot?</strong>
        <p class="muted small" style="margin:4px 0 10px">Send a request with an alternative time and we will find a slot that works for your family.</p>
        <a class="btn btn-outline btn-sm" href="#/pujas">Browse pujas ${icon('arrow')}</a>
      </div>
    </div>
  </section>`;
  setTimeout(() => {
    qsa('.slot-day').forEach(b => b.addEventListener('click', () => {
      const p = new URLSearchParams(location.hash.split('?')[1]||'');
      p.set('date', b.dataset.date);
      navigate('#/availability?' + p.toString());
    }));
    qsa('.slot-chip').forEach(b => b.addEventListener('click', () => {
      toast('Slot selected', 'Continue from the service page to submit a request.', 'info');
    }));
  }, 0);
  return layout(inner);
}
