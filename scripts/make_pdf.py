# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, ListFlowable, ListItem, KeepTogether)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

NAVY = colors.HexColor('#3b131f')
MAROON = colors.HexColor('#571f2b')
SAFFRON = colors.HexColor('#cf7136')
GOLD = colors.HexColor('#ad8240')
INK = colors.HexColor('#2c2621')
MUTED = colors.HexColor('#6b6055')
CREAM = colors.HexColor('#fbf6ec')
PAPER = colors.HexColor('#fffdf8')
LINE = colors.HexColor('#e5d8c4')

doc = SimpleDocTemplate(
    r'B:\astrology website\Aradhana_Planning.pdf',
    pagesize=A4,
    leftMargin=1.9*cm, rightMargin=1.9*cm,
    topMargin=1.7*cm, bottomMargin=1.7*cm,
    title='Aradhana — Product Planning & Build Specification',
    author='Aradhana',
)

styles = getSampleStyleSheet()
title_style = ParagraphStyle('TitleX', parent=styles['Title'], fontName='Times-Bold', fontSize=30, leading=34,
                             textColor=MAROON, alignment=TA_CENTER, spaceAfter=6)
subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontName='Times-Italic', fontSize=13,
                               textColor=GOLD, alignment=TA_CENTER, spaceAfter=18)
h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Times-Bold', fontSize=19, leading=23,
                    textColor=MAROON, spaceBefore=18, spaceAfter=8, keepWithNext=True)
h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Times-Bold', fontSize=14, leading=17,
                    textColor=MAROON, spaceBefore=12, spaceAfter=5, keepWithNext=True)
h3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName='Times-BoldItalic', fontSize=11.5, leading=14,
                    textColor=SAFFRON, spaceBefore=9, spaceAfter=3, keepWithNext=True)
body = ParagraphStyle('Body', parent=styles['Normal'], fontName='Helvetica', fontSize=9.6, leading=13.2,
                      textColor=INK, alignment=TA_JUSTIFY, spaceAfter=6)
bodyl = ParagraphStyle('BodyL', parent=body, alignment=TA_LEFT)
small = ParagraphStyle('Small', parent=body, fontSize=8.6, leading=11, spaceAfter=4)
bullet = ParagraphStyle('Bullet', parent=body, leftIndent=14, firstLineIndent=-10, spaceAfter=3, bulletIndent=4)
code = ParagraphStyle('Code', parent=styles['Code'], fontName='Courier', fontSize=8.4, leading=10.4,
                      textColor=NAVY, backColor=CREAM, spaceAfter=6, leftIndent=8, rightIndent=8)
center = ParagraphStyle('Center', parent=body, alignment=TA_CENTER)
caption = ParagraphStyle('Caption', parent=small, fontName='Helvetica-Oblique', textColor=MUTED, spaceAfter=10)

def P(text, style=body): return Paragraph(text, style)
def B(text): return Paragraph('• ' + text, bullet)
def S(text=None): return Spacer(1, 6)
def HR(): return Table([['']], colWidths=[17.2*cm], style=TableStyle([('LINEBELOW', (0,0), (-1,-1), 0.6, LINE)]))

story = []

# ---------- cover ----------
story.append(Spacer(1, 3*cm))
story.append(Paragraph('ARADHANA', title_style))
story.append(Paragraph('A single-pandit practice — pujas, jyotish guidance and sacred gatherings', subtitle_style))
story.append(HR())
story.append(Spacer(1, 1*cm))
story.append(Paragraph(
    'Product planning, data model, architecture, feature specification and build guide',
    ParagraphStyle('cover2', parent=center, fontSize=11, textColor=MUTED, spaceAfter=24)
))
cover_meta = [
    ['Document', 'Aradhana Planning & Build Specification'],
    ['Version', '1.0 · November 2026'],
    ['Practice type', 'Solo pandit (one priest / astrologer, not a marketplace)'],
    ['Demo pandit', 'Pandit Ramesh Sharma · Hyderabad'],
    ['Stack', 'Node.js 24 · node:sqlite · Vanilla JavaScript SPA'],
    ['Live URL', 'http://localhost:4321 (run locally)'],
    ['Scope', 'Full-stack web application + admin back office + provider portal'],
]
t = Table(cover_meta, colWidths=[3.6*cm, 13.6*cm])
t.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('FONTNAME', (1,0), (1,-1), 'Helvetica'),
    ('FONTSIZE', (0,0), (-1,-1), 9.2),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('TEXTCOLOR', (1,0), (1,-1), INK),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('LINEBELOW', (0,0), (-1,-1), 0.3, LINE),
]))
story.append(t)
story.append(Spacer(1, 2*cm))
story.append(Paragraph(
    '“Every request is a conversation, not a transaction.”',
    ParagraphStyle('quote', parent=center, fontName='Times-Italic', fontSize=13, textColor=GOLD, spaceAfter=8)
))
story.append(PageBreak())

# ---------- 1. executive summary ----------
story.append(Paragraph('1. Executive summary', h1))
story.append(P(
    'Aradhana is a full-stack web application for a single Vedic priest and jyotish guide. '
    'It replaces the multi-provider marketplace model with a single, personal practice: one pandit, '
    'his pujas, his consultations, his gatherings, his calendar and his back office. Customers request '
    'a puja, a horoscope discussion or an event seat; the pandit (or his assistant) calls back to '
    'confirm; payment, if any, is settled directly and offline. No payment gateway is ever involved.'
))
story.append(P(
    'The product is deliberately honest about what a booking is: a request. There is no fake '
    'instant-confirmation, no card capture and no urgency trickery. The whole experience is built '
    'around trust, clarity and a calm, editorial celestial aesthetic.'
))
story.append(Paragraph('What was built', h2))
for item in [
    'A complete Node.js 24 application using the built-in node:sqlite (DatabaseSync), with zero runtime dependencies.',
    'A 32-table SQLite schema covering users, consent, providers, services, samagri, availability, slots, bookings, events, reviews, media, documents, notifications, horoscope, panchang, festivals, FAQs, testimonials, enquiries, newsletter, audit and settings.',
    'A responsive single-page application in vanilla JavaScript (ES modules) with hash routing and a full design system.',
    'Public site, customer account, admin back office and a separate provider portal.',
    'A deterministic panchang and daily/weekly/monthly/yearly horoscope engine.',
    'An offline notification outbox (email, WhatsApp, SMS, in-app) with templates, recipients and delivery logs.',
    'Seed data for a realistic solo practice: 17 services, 4 events, 6 reviews, 14 bookings in every status, 214 slots.',
    'A smoke test that exercises 18 end-to-end API scenarios (all passing).',
]:
    story.append(B(item))
story.append(S())
story.append(Paragraph('Key design decisions', h2))
decisions = [
    ('Solo practice, not marketplace', 'The public site is built around one pandit. Other seeded providers are retained internally (for realism and for the admin “related” data) but are inactive and never appear publicly.'),
    ('Request, not transaction', 'Every booking starts as REQUESTED. A slot is held tentatively. Confirmation happens after a call or message.'),
    ('No payment gateway', 'Offline payment records are notes of what was agreed and received; they are never charges.'),
    ('Configurable identity', 'The pandit’s name, title, city, bio, languages, specialisations and since-year are editable from Admin → Pandit profile and Settings, so the demo identity can be replaced without touching code.'),
    ('Demo OTP', 'The OTP is fixed to 123456 in demo mode. Change DEMO_OTP or remove it in production.'),
]
dt = Table(decisions, colWidths=[4.2*cm, 13*cm])
dt.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('FONTNAME', (1,0), (1,-1), 'Helvetica'),
    ('FONTSIZE', (0,0), (-1,-1), 9.2),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('LINEBELOW', (0,0), (-1,-1), 0.25, LINE),
]))
story.append(dt)

# ---------- 2. inspiration ----------
story.append(PageBreak())
story.append(Paragraph('2. UI inspiration and what was borrowed from each', h1))
story.append(P(
    'Three well-known astrology products were analysed and the strongest pattern from each was merged into '
    'one original design system. The result is not a copy of any one site; it is a new brand (“Aradhana”) '
    'with a calm, editorial celestial aesthetic.'
))
insp = [
    ('AstroTalk', 'Conversion and trust patterns: prominent primary actions, priest/astrologer cards with experience and languages, “how it works” in three steps, honest “request, not instant book” microcopy, floating WhatsApp, mobile-first bottom action bar.'),
    ('AstroSage', 'Utility depth: panchang card with tithi, nakshatra, rahu kalam and abhijit, daily horoscope by sign, festival calendar, a serious availability calendar with slot colours, and a complete admin back office.'),
    ('CHANI', 'Editorial celestial aesthetic: serif display type (Cormorant Garamond), warm cream and maroon palette, gold hairlines, generous white space, a mandala/oil-lamp hero, restrained ornament, and a quiet, non-pushy tone.'),
]
it = Table(insp, colWidths=[3.2*cm, 14*cm])
it.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,-1), 9.2),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 7),
    ('LINEBELOW', (0,0), (-1,-1), 0.25, LINE),
]))
story.append(it)
story.append(Paragraph('Design system summary', h2))
for item in [
    'Colours: warm off-white #fbf6ec, deep maroon #571f2b, saffron #cf7136, gold #ad8240, charcoal #2c2621.',
    'Type: Cormorant Garamond (display), Inter (body), Noto Sans (Indic fallbacks).',
    'Tokens: 16 px card radius, soft shadows, 999 px pill buttons, 44 px touch targets (WCAG 2.1 AA).',
    'Components: sticky header + top bar, mobile drawer, floating WhatsApp, hero with mandala art, panchang strip, path cards, service cards, event cards, testimonials, FAQ accordion, CTA band, footer.',
    'Breakpoints: 1100, 900, 720, 500 px. A fixed mobile bottom bar (Book / WhatsApp / Call / Account) appears below 900 px.',
]:
    story.append(B(item))

# ---------- 3. architecture ----------
story.append(PageBreak())
story.append(Paragraph('3. Architecture and technology', h1))
story.append(Paragraph('Stack', h2))
stack = [
    ['Layer', 'Choice', 'Reason'],
    ['Runtime', 'Node.js 24 (CommonJS)', 'Built-in sqlite, no build step, easy to run locally.'],
    ['Database', 'node:sqlite DatabaseSync (WAL, FKs on)', 'Zero dependencies, single file, ACID, perfect for a single practice.'],
    ['HTTP', 'Custom http server (no Express)', 'Full control over routing, cookies, static files and SPA fallback.'],
    ['Frontend', 'Vanilla JS ES modules + hash router', 'No bundler; fast first paint; works offline.'],
    ['Styling', 'One global CSS file, design tokens', 'Consistent, easy to theme for a real pandit.'],
    ['Almanac', 'Deterministic SHA-256 seeded generators', 'Panchang + horoscope without an external API.'],
    ['PDF', 'reportlab (Python) for this document', 'Reproducible, version-controllable.'],
]
st = Table(stack, colWidths=[2.8*cm, 5.4*cm, 9*cm])
st.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), MAROON),
    ('TEXTCOLOR', (0,0), (-1,0), colors.white),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,-1), 8.6),
    ('GRID', (0,0), (-1,-1), 0.3, LINE),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, CREAM]),
]))
story.append(st)
story.append(Paragraph('Project layout', h2))
for line in [
    'server.js — HTTP server, router, static files, seed-on-start, background jobs.',
    'lib/db.js — schema (32 tables), query helpers, settings, audit.',
    'lib/auth.js — OTP + password login, sessions, cookies, role guards, /api/me.',
    'lib/util.js — IST dates, IDs, hashing, CSV, status maps, transitions.',
    'lib/slots.js — slot generation from rules, holds, release, expiry.',
    'lib/notify.js — templates, outbox, delivery simulation, in-app notifications.',
    'lib/almanac.js — zodiac, panchang, daily/weekly/monthly/yearly horoscope.',
    'lib/data.js — serializers for services, providers, events, panchang, reviews, stats.',
    'lib/http.js — HTTP helpers, body parsing, validation.',
    'lib/bookings.js — booking lifecycle, cancellation, reschedule, reviews, consent.',
    'lib/routes-public.js — all public APIs (solo-pandit aware).',
    'lib/routes-account.js — customer account, birth profiles, addresses, export/delete.',
    'lib/routes-admin.js — admin dashboard, inbox, actions, calendar, availability, services, events, customers, notifications, reports, settings.',
    'lib/routes-provider.js — pandit portal: dashboard, bookings, availability, profile.',
    'lib/seed.js — full seed for a realistic solo practice.',
    'scripts/seed.js, scripts/smoke.js — seed and end-to-end smoke test.',
    'public/ — SPA: index.html, assets/styles.css, assets/app.js and page modules.',
]:
    story.append(B(line))
story.append(Paragraph('Runtime background jobs', h2))
for item in [
    'Every 8 s — process the notification outbox (simulated delivery, writes a log).',
    'Every 60 s — expire tentative slot holds past their hold_expires_at and mark the booking EXPIRED.',
    'Every 6 h — rebuild future slots from availability rules for the active pandit.',
]:
    story.append(B(item))

# ---------- 4. roles ----------
story.append(PageBreak())
story.append(Paragraph('4. User roles and permissions', h1))
roles = [
    ['Visitor', 'Browse pujas, events, horoscope, panchang, FAQs, pandit profile, availability.', 'No login required.'],
    ['Customer', 'Everything a visitor can do, plus request bookings, view and manage own bookings, save birth profiles and addresses, export/delete data.', 'Phone OTP login (demo code 123456).'],
    ['Support', 'Handle requests, log contact attempts, confirm or reject, add notes, view customers.', 'Email + password.'],
    ['Owner / Admin', 'Everything support can do, plus services, events, pandit profile, availability, notifications, reports, settings, payments, audit, CSV exports.', 'Email + password.'],
    ['Provider (Pandit)', 'Own dashboard, own bookings, own availability, own profile. Cannot see other providers or global settings.', 'Email + password.'],
]
rt = Table(roles, colWidths=[3.2*cm, 9.2*cm, 4.8*cm])
rt.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), MAROON),
    ('TEXTCOLOR', (0,0), (-1,0), colors.white),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
    ('TEXTCOLOR', (0,1), (0,-1), MAROON),
    ('FONTSIZE', (0,0), (-1,-1), 8.6),
    ('GRID', (0,0), (-1,-1), 0.3, LINE),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, CREAM]),
]))
story.append(rt)
story.append(Paragraph('Demo credentials', h2))
creds = [
    ['Customer (phone OTP)', '+91 98765 43210', 'OTP 123456'],
    ['Owner / Admin', 'owner@aradhana.in', 'admin123'],
    ['Support', 'support@aradhana.in', 'support123'],
    ['Pandit (provider)', 'ramesh@aradhana.in', 'provider123'],
]
ct = Table(creds, colWidths=[4.2*cm, 5.6*cm, 4*cm])
ct.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), GOLD),
    ('TEXTCOLOR', (0,0), (-1,0), colors.white),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('GRID', (0,0), (-1,-1), 0.3, LINE),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, CREAM]),
]))
story.append(ct)
story.append(P('These are demo values. Replace them (and the DEMO_OTP) before going live.', small))

# ---------- 5. data model ----------
story.append(PageBreak())
story.append(Paragraph('5. Data model (32 tables)', h1))
story.append(P(
    'The schema is a direct implementation of the supplied data model, adapted for a single pandit. '
    'All foreign keys are enforced, WAL mode is on, and busy_timeout is set to 5 seconds. '
    'Tables are grouped into the following domains.'
))
domains = [
    ['Identity & consent', 'users, sessions, otp_verifications, consents, customer_profiles, birth_profiles, addresses'],
    ['Providers & services', 'providers, service_categories, services, service_samagri, provider_services, availability_rules, availability_exceptions, time_slots'],
    ['Bookings', 'bookings, booking_puja_details, booking_consultation_details, booking_birth_details, booking_status_history, booking_notes, booking_contact_attempts, booking_reschedules, offline_payment_records, booking_media, booking_documents'],
    ['Events', 'events, event_sessions, event_registrations, event_attendees, event_waitlist'],
    ['Reviews & content', 'reviews, zodiac_signs, daily_horoscopes, panchang_days, festivals, faqs, testimonials, enquiries, newsletter_subscribers'],
    ['Notifications', 'notification_templates, notification_recipients, notification_outbox, notification_delivery_logs, inapp_notifications'],
    ['System', 'app_settings, audit_logs, system_jobs'],
]
dt2 = Table(domains, colWidths=[4.2*cm, 13*cm])
dt2.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('FONTSIZE', (0,0), (-1,-1), 8.6),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LINEBELOW', (0,0), (-1,-1), 0.25, LINE),
]))
story.append(dt2)
story.append(Paragraph('Booking status machine', h2))
story.append(P(
    'REQUESTED → CONTACTED → CONFIRMED → COMPLETED, with side branches REJECTED, CANCELLED, '
    'RESCHEDULE_REQUESTED, NO_SHOW and EXPIRED. Transitions are validated in code (TRANSITIONS map) '
    'and every change is written to booking_status_history with who, when and why.'
))
story.append(Paragraph('Consent capture', h2))
story.append(P(
    'Every booking writes consent rows (PRIVACY_POLICY, CONTACT_BY_PHONE, and BIRTH_DATA_PROCESSING for '
    'consultations) with the policy version, IP address and timestamp. Customers can export or delete '
    'their data from the account page, which anonymises booking contact details and removes birth profiles '
    'and addresses.'
))

# ---------- 6. public features ----------
story.append(PageBreak())
story.append(Paragraph('6. Public website features', h1))
public_features = [
    ('Home', 'Hero with three actions, quick availability checker, today’s panchang strip, featured pujas, pandit feature, how-it-works, events strip, testimonials, horoscope teaser by sign, FAQ preview, CTA band.'),
    ('Pujas catalogue', 'Search, filter by category, type, location, featured; sort; card grid with duration, rating and quick link.'),
    ('Puja detail', 'Full description, benefits, samagri list (who brings what), preparation notes, FAQs, reviews, related services and a sticky booking card with next available slot.'),
    ('Personal guidance', 'Consultation catalogue and detail pages, modes (chat/voice/video/in person), topics, birth details requirement, pandit’s consultation hours.'),
    ('Gatherings', 'Event list with kind filter and seat counts; event detail with sessions, venue, dress code, instructions, lead pandit, related events; registration and waitlist.'),
    ('Request Submitted', 'Reference number, what happens next, reminders, link to My Bookings.'),
    ('Daily horoscope', 'Sign selector, daily/weekly/monthly/yearly readings with love, career, finance, health, lucky number and colour; panchang side panel; festivals.'),
    ('Panchang', 'Full day card (tithi, paksha, nakshatra, yoga, karana, sunrise, sunset, rahu kalam, abhijit, moon phase) plus a 7-day strip and festival list.'),
    ('About / Contact / FAQ / Policies', 'Pandit’s story, contact form, full FAQ, privacy, terms, cancellation and refund (offline) policies.'),
    ('Login', 'Phone OTP for customers, email + password for staff and pandit, with a demo code shown in demo mode.'),
]
pf = Table(public_features, colWidths=[3.6*cm, 13.6*cm])
pf.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('FONTSIZE', (0,0), (-1,-1), 8.6),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LINEBELOW', (0,0), (-1,-1), 0.25, LINE),
]))
story.append(pf)

# ---------- 7. booking flows ----------
story.append(PageBreak())
story.append(Paragraph('7. Booking flows', h1))
story.append(Paragraph('Puja request (4 steps)', h2))
for item in [
    'Step 1 — Choose time: 14-day calendar with available/tentative/booked counts, slots grouped into morning/afternoon/evening, plus an “alternative time” fallback when no slot fits.',
    'Step 2 — Your details: contact (name, phone, email, preferred channel, call window, language, participants, special requests), puja location (home/temple/online), saved or new address, occasion, sankalpam names, gotra, samagri (you / priest / discuss), attendees, live stream.',
    'Step 3 — Review: everything is shown back; consent checkboxes (privacy policy, contact by phone); submit.',
    'Step 4 — Success: reference number, “what happens next”, links to My Bookings.',
]:
    story.append(B(item))
story.append(Paragraph('Consultation request (4 steps)', h2))
for item in [
    'Step 1 — Choose time: consultation slots only.',
    'Step 2 — Details: mode (chat/voice/video/in person), topics, question, has-previous-chart, matching-required; birth details for one or two people, with saved profiles selectable.',
    'Step 3 — Review and consent (adds birth-data processing consent).',
    'Step 4 — Success.',
]:
    story.append(B(item))
story.append(Paragraph('Event registration (3 steps)', h2))
for item in [
    'Step 1 — Seats and attendance mode (in person / online where available).',
    'Step 2 — Attendees (name, gotra, nakshatra, age group, dietary note) and contact details.',
    'Step 3 — Review and submit; waitlist is offered automatically when the event is full.',
]:
    story.append(B(item))
story.append(Paragraph('Anti-spam and safety', h2))
for item in [
    'A phone may have at most 3 open (REQUESTED / CONTACTED / RESCHEDULE_REQUESTED) requests at once.',
    'Slots require at least 12 hours’ notice (configurable).',
    'Slot holds expire after 24 hours (configurable).',
    'Every booking writes consent rows with policy version, IP and timestamp.',
    'Phone numbers and birth details are masked in any non-staff/non-owner view.',
]:
    story.append(B(item))

# ---------- 8. account ----------
story.append(PageBreak())
story.append(Paragraph('8. Customer account', h1))
for item in [
    'Dashboard: open/upcoming/completed counts, next booking card, recent bookings, unread notifications.',
    'My Bookings: filter by status and type; detail page with timeline, slot, puja/consultation details, birth details, media, documents, payments (masked), history, reschedules, review.',
    'Actions: cancel (with reason), request reschedule (new slot or alternative time), submit a review after completion.',
    'Saved birth profiles: create, edit, delete, set default; up to 12 per account.',
    'Saved addresses: create, edit, delete, set default; used in home-puja booking.',
    'Account & privacy: edit profile, notification preferences, export all data as JSON, request deletion (type DELETE to confirm).',
    'In-app notifications: bell with unread count, mark all read.',
]:
    story.append(B(item))

# ---------- 9. admin ----------
story.append(PageBreak())
story.append(Paragraph('9. Admin back office (owner / support)', h1))
admin = [
    ('Dashboard', 'KPIs (pending, today, confirmed, completed, revenue, enquiries, customers), recent requests, attention queue (oldest first), 7-day trend bars, top services, upcoming events, today’s panchang.'),
    ('Requests inbox', 'Filterable, sortable, paginated table of all bookings; status/type/search/date filters; counts by status; one click to open.'),
    ('Request detail', 'Full customer, service, provider, slot, puja/consultation/birth details, history, notes, contact attempts, payments, media, documents, notifications; action buttons (contact, confirm, reject, complete, no-show, cancel, approve/decline reschedule); add note; record payment.'),
    ('Calendar', 'Month grid of confirmed and pending bookings with colour coding; day drill-down agenda; availability exceptions shown.'),
    ('Availability', 'Weekly rules (add/remove, active toggle), blocked/extra exceptions, 21-day day counts, regenerate slots.'),
    ('Pandit profile', 'Edit name, headline, bio, city, experience, tradition, languages, specialisations, offers, radius, notice, active; syncs site settings.'),
    ('Services', 'CRUD for the service catalogue: name, category, type, description, benefits, duration, price text, locations, modes, featured, active; provider assignment.'),
    ('Gatherings', 'CRUD for events with capacity, registration window, waitlist, featured; registrations list with attendees, check-in, waitlist.'),
    ('Customers', 'Searchable list with booking counts and last booking; detail with profiles, addresses, bookings, consents.'),
    ('Messages', 'Enquiries (NEW/IN PROGRESS/CLOSED), reviews (publish, reply).'),
    ('Notifications', 'Recipients (add/edit/delete), templates (edit body/subject), outbox log with delivery status, manual process button.'),
    ('Reports', 'Date range; totals, completion rate, revenue agreed/received, average rating; by status, by type, top services, daily trend; CSV links.'),
    ('Settings', 'Every app_setting grouped and editable; pandit identity; export buttons; audit log (owner only).'),
    ('Audit log', 'Who did what, when, to which entity, with IP address.'),
]
at = Table(admin, colWidths=[3.4*cm, 13.8*cm])
at.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('FONTSIZE', (0,0), (-1,-1), 8.6),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LINEBELOW', (0,0), (-1,-1), 0.25, LINE),
]))
story.append(at)

# ---------- 10. provider portal ----------
story.append(PageBreak())
story.append(Paragraph('10. Provider portal (pandit workspace)', h1))
for item in [
    'Dashboard: today’s bookings, upcoming, attention queue, weekly count, panchang.',
    'Bookings: list with filters; detail with the same timeline and actions (contact, confirm, complete, notes).',
    'Schedule: 21-day agenda with confirmed/pending bookings and exceptions.',
    'Availability: weekly rules, exceptions, day counts, regenerate slots.',
    'Profile: headline, bio, city, languages, specialisations, offers, notice hours.',
    'The portal is scoped to the signed-in pandit; an owner can also open it.',
]:
    story.append(B(item))

# ---------- 11. notifications ----------
story.append(Paragraph('11. Notifications and templates', h1))
story.append(P(
    'A notification outbox stores every message (email, WhatsApp, SMS, in-app push) with a template code, '
    'recipient, payload, scheduled time, status and attempts. A background job renders the template against '
    'the payload and marks it DELIVERED (demo mode). In production, replace the simulated delivery with '
    'real SMTP / WhatsApp Cloud API / SMS gateway calls; the queue, templates and logs stay the same.'
))
story.append(Paragraph('Template codes shipped', h2))
for item in [
    'OWNER_NEW_BOOKING — new request alert to owners (WhatsApp, email, SMS).',
    'CUSTOMER_REQUEST_RECEIVED — confirmation of receipt to the customer.',
    'CUSTOMER_BOOKING_CONFIRMED — confirmation with date and time.',
    'CUSTOMER_BOOKING_REJECTED — decline with alternatives.',
    'CUSTOMER_CANCELLED — cancellation notice.',
    'REMINDER_24H — 24-hour reminder.',
    'REVIEW_REQUEST — post-service review request.',
    'EVENT_WAITLIST_SEAT_OPENED — waitlist seat opened.',
    'PROVIDER_ASSIGNED — assignment notice to the pandit.',
    'OWNER_UNHANDLED_ESCALATION — escalation if a request waits too long.',
]:
    story.append(B(item))

# ---------- 12. almanac ----------
story.append(PageBreak())
story.append(Paragraph('12. Panchang, horoscope and almanac', h1))
for item in [
    'Panchang: computed per date from a deterministic formula (tithi, paksha, nakshatra, yoga, karana, sunrise, sunset, rahu kalam, abhijit, moon phase, auspiciousness). Location defaults to Hyderabad and is shown on every card.',
    'Festivals: 7 seeded festivals with dates, descriptions and a suggested service.',
    'Horoscope: 12 signs with a daily/weekly/monthly/yearly reading generated deterministically from a SHA-256 hash of sign + period + date, so the same day always returns the same reading and is cached in the database.',
    'Sign cards: symbol, element, ruling planet, date range, blurb and today’s reading.',
    'No external API is required; the engine is fully offline and reproducible.',
]:
    story.append(B(item))

# ---------- 13. solo-pandit config ----------
story.append(Paragraph('13. Solo-pandit configuration', h1))
story.append(P(
    'The public site reads one setting — site.primary_provider_slug — to decide whose practice it is. '
    'All public APIs (home, service detail, availability, check, providers, provider profile) resolve '
    'to that single pandit. Other seeded providers stay in the database (inactive) and are never shown.'
))
story.append(Paragraph('Settings that drive the public identity', h2))
for item in [
    'site.primary_provider_slug, site.pandit_name, site.pandit_short_name, site.pandit_title, site.pandit_since, site.consult_heading.',
    'site.name, site.tagline, site.contact_phone, site.contact_whatsapp, site.email, site.address, site.hours.',
    'booking.hold_hours, booking.auto_expire_hours, booking.min_notice_hours, booking.max_advance_days, booking.max_open_requests_per_phone, booking.cancellation_window_hours.',
    'privacy.retention_months, privacy.policy_version.',
    'site.instagram, site.youtube.',
]:
    story.append(B(item))
story.append(Paragraph('To put the real pandit in place', h2))
for item in [
    'Sign in as owner (owner@aradhana.in / admin123).',
    'Open Admin → Pandit profile and edit name, headline, bio, city, languages, specialisations, photo, notice hours.',
    'Open Admin → Settings and update contact phone, WhatsApp, email, address, hours, social links.',
    'Edit service catalogue (Admin → Services) to match the pandit’s actual offerings and durations.',
    'Adjust availability (Admin → Availability) to his real weekly hours and holidays.',
    'Replace demo reviews/testimonials if needed (Admin → Messages / Testimonials).',
    'Change demo credentials and remove DEMO_OTP before going live.',
]:
    story.append(B(item))

# ---------- 14. security/privacy ----------
story.append(PageBreak())
story.append(Paragraph('14. Security, privacy and compliance', h1))
for item in [
    'Passwords hashed with scrypt (salted). Sessions are random 32-byte tokens stored only as SHA-256 hashes in the database, with a 30-day expiry and HttpOnly, SameSite=Lax cookies.',
    'Role guards on every API route (requireUser, requireStaff, requireOwner, requireProvider).',
    'Input validation on every field (length, format, enum) with structured 422 errors.',
    'Body size limit (2 MB), security headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options).',
    'Phone numbers and emails are masked in any view that is not the customer or staff.',
    'Birth details are visible only to staff, the assigned provider and the customer.',
    'Consent rows captured per booking with policy version, IP and timestamp.',
    'Audit log records every staff action with user, entity, before/after and IP.',
    'Right to export (JSON) and right to deletion (anonymises bookings, removes profiles and addresses, deactivates the account).',
    'Retention setting (36 months) for anonymisation scheduling.',
    'No card data is ever collected; offline payment records are notes only.',
]:
    story.append(B(item))

# ---------- 15. api summary ----------
story.append(PageBreak())
story.append(Paragraph('15. API surface (summary)', h1))
story.append(P('All endpoints are JSON. Authenticated routes read the session cookie. The full list is implemented in lib/routes-*.js.', small))
api_groups = [
    ('Public', '/api/meta, /api/home, /api/services, /api/services/:slug, /api/providers, /api/providers/:slug, /api/availability, /api/events, /api/events/:slug, /api/horoscope, /api/panchang, /api/faqs, /api/testimonials, /api/settings/public, /api/check, /api/enquiries, /api/newsletter, /api/notifications'),
    ('Auth', '/api/auth/otp/request, /api/auth/otp/verify, /api/auth/login, /api/auth/logout, /api/me'),
    ('Account', '/api/account/summary, /api/account/birth-profiles, /api/account/addresses, /api/account/consents, /api/account/export, /api/account/delete, /api/my/bookings, /api/my/bookings/:ref, cancel, reschedule, review'),
    ('Admin', '/api/admin/dashboard, inbox, bookings/:ref + actions, calendar, availability (+rules, exceptions, regenerate), services, events (+registrations, check-in), customers, pandit, notifications (+recipients, templates, process), enquiries, reviews, faqs, testimonials, reports, audit, settings, export/:kind'),
    ('Provider', '/api/provider/dashboard, bookings, bookings/:ref + actions, schedule, availability (+rules, exceptions, regenerate), profile'),
]
at2 = Table(api_groups, colWidths=[2.6*cm, 14.6*cm])
at2.setStyle(TableStyle([
    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
    ('TEXTCOLOR', (0,0), (0,-1), MAROON),
    ('FONTSIZE', (0,0), (-1,-1), 8.4),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LINEBELOW', (0,0), (-1,-1), 0.25, LINE),
]))
story.append(at2)

# ---------- 16. running ----------
story.append(PageBreak())
story.append(Paragraph('16. Running, testing and deployment', h1))
story.append(Paragraph('Local run', h2))
for line in [
    'Install Node.js 22.5 or newer (24 recommended).',
    'npm install (no dependencies are required; this only sets up scripts).',
    'npm run seed            # first run, creates data/aradhana.db',
    'npm run seed:reset      # rebuild from scratch',
    'npm start              # http://localhost:4321',
    'npm run dev            # watch mode',
    'npm run smoke          # 18 end-to-end checks',
]:
    story.append(Paragraph(line, code))
story.append(Paragraph('Environment variables', h2))
env = [
    ['PORT', '4321', 'HTTP port.'],
    ['HOST', '127.0.0.1', 'Bind address (use 0.0.0.0 to expose on the LAN).'],
    ['DB_PATH', 'data/aradhana.db', 'SQLite file location.'],
    ['DEMO_OTP', '123456', 'Fixed OTP in demo mode. Remove in production.'],
    ['NODE_ENV', 'production', 'Hides stack traces and demo tokens.'],
]
et = Table(env, colWidths=[3*cm, 5*cm, 9.2*cm])
et.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), GOLD),
    ('TEXTCOLOR', (0,0), (-1,0), colors.white),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTNAME', (0,1), (0,-1), 'Courier'),
    ('FONTSIZE', (0,0), (-1,-1), 8.6),
    ('GRID', (0,0), (-1,-1), 0.3, LINE),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, CREAM]),
]))
story.append(et)
story.append(Paragraph('Production notes', h2))
for item in [
    'Put the app behind a reverse proxy (nginx / Caddy) with HTTPS; the cookie is already SameSite=Lax and HttpOnly.',
    'Back up data/aradhana.db (and its -wal/-shm files) on a schedule; it is the whole system.',
    'Replace the simulated notification delivery in lib/notify.js with real providers; keep the outbox.',
    'Set a real DEMO_OTP replacement (remove the devOtp field from the API response).',
    'Replace the demo pandit identity via Admin → Pandit profile and Settings.',
    'Review the seed testimonials and reviews before going live.',
    'The app is a single process; for a small practice this is enough. Scale horizontally only if traffic demands.',
]:
    story.append(B(item))

# ---------- 17. sitemap ----------
story.append(PageBreak())
story.append(Paragraph('17. Sitemap', h1))
sitemap = [
    'Public: Home · Pujas · Puja detail · Personal guidance · Consultation detail · Gatherings · Event detail · Request submitted · Daily horoscope · Panchang · About · Contact · FAQ · Policies · Login',
    'Customer: My account · My bookings · Booking detail · Saved birth profiles · Saved addresses · Account & privacy · Notifications',
    'Admin: Dashboard · Requests inbox · Request detail · Calendar · Availability · Pandit profile · Services · Gatherings · Customers · Customer detail · Messages (enquiries, reviews) · Notifications · Reports · Settings · Audit log',
    'Provider: Dashboard · Bookings · Booking detail · Schedule · Availability · Profile',
]
for s in sitemap:
    story.append(B(s))

# ---------- 18. roadmap ----------
story.append(Paragraph('18. Suggested next steps (status after v2.0)', h1))
for item in [
    'Replace the demo pandit with the real one (name, city, bio, contact, photo, services, hours).',
    'Connect real notification providers (SMTP, WhatsApp Cloud API, SMS gateway) in lib/notify.js.',
    'Add file uploads for booking media/documents (currently metadata only).',
    'Add a second language (Hindi or Telugu) using the existing language fields and template language column.',
    'Add Google/Apple calendar export for confirmed bookings.',
    'Add automated reminders (24 h and 1 h) driven by the reminder_hours setting.',
    'Add a public “availability” widget embeddable on the pandit’s own site.',
    'Add a simple accounting export for the offline payments.',
    'Replace the deterministic horoscope with a reviewed monthly editorial if desired.',
]:
    story.append(B(item))

# ---------- 19. next-generation upgrades ----------
story.append(PageBreak())
story.append(Paragraph('19. Next-generation upgrades (v2.0)', h1))
story.append(Paragraph(
    'The application has been upgraded with the following next-generation features, focused on ease of use for '
    'customers, staff and the pandit, while preserving the original request-not-transaction philosophy and all '
    'existing APIs.', body))
for item in [
    'PWA support: web app manifest, service worker with offline shell caching and installability.',
    'Floating AI assistant (FAQ + service search) available on every page.',
    'Back-to-top control and smoother navigation.',
    'Calendar export: download a confirmed booking as an .ics file (Google/Apple/Outlook compatible).',
    'Automated 24-hour reminders enqueued by a background job.',
    'File uploads: base64 upload endpoint storing media/documents against a booking.',
    'Accounting export: Payments CSV for offline payment records.',
    'Embeddable availability widget (/widget.js) for the pandit\'s own website.',
    'Assistant endpoint (/api/assistant) for conversational help.',
    'Hardened caching: JS/CSS served with no-cache for fresh deployments.',
    'Fixed broken tab handling in the front-end enhance routine.',
]:
    story.append(B(item))

story.append(Spacer(1, 1.2*cm))
story.append(HR())
story.append(Paragraph(
    'End of document · Aradhana planning and build specification · v2.0',
    ParagraphStyle('footer', parent=center, fontSize=8.4, textColor=MUTED, spaceBefore=6)
))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(1.9*cm, 1.1*cm, 'Aradhana — Product Planning & Build Specification')
    canvas.drawRightString(A4[0]-1.9*cm, 1.1*cm, f'Page {doc.page}')
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('PDF written to B:\\astrology website\\Aradhana_Planning.pdf')
