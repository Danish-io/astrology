'use strict';

const { all, get, run, insert, tx, getSetting, audit } = require('./db');
const {
  uuid, nowIso, istDateKey, addDaysKey, istToIso, normalizePhone,
  maskPhone, maskName, canTransition, STATUS_LABELS, STATUS_TONES, parseJson,
} = require('./util');
const { HttpError, str, assert, bool, int, oneOf, isEmail } = require('./http');
const { holdSlot, releaseSlot } = require('./slots');
const { queueNewBooking, queueStatusNotification, notifyInApp, outboxForBooking } = require('./notify');
const { ensureSlotsForProvider } = require('./slots');

const PUJA_LOCATIONS = ['CUSTOMER_HOME', 'TEMPLE', 'ONLINE', 'PRIEST_PLACE'];
const CONSULT_MODES = ['CHAT', 'VOICE', 'VIDEO', 'IN_PERSON'];
const CONTACT_CHANNELS = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL'];

function findBooking(refOrId) {
  return get('SELECT * FROM bookings WHERE booking_ref = ? OR id = ?', [refOrId, refOrId]);
}

function isOwnerViewer(user, booking) {
  return Boolean(user && booking.customer_id === user.id);
}

function isProviderViewer(user, booking) {
  return Boolean(user?.provider && booking.provider_id === user.provider.id);
}

function canViewBooking(user, booking) {
  if (!user) return false;
  if (['OWNER', 'ADMIN', 'SUPPORT'].includes(user.role)) return true;
  if (booking.customer_id === user.id) return true;
  if (isProviderViewer(user, booking)) return true;
  return false;
}

function bookingSummary(row) {
  const review = get('SELECT id FROM reviews WHERE booking_id = ?', [row.id]);
  const registration = get('SELECT * FROM event_registrations WHERE booking_id = ?', [row.id]);
  return {
    id: row.id,
    ref: row.booking_ref,
    type: row.booking_type,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    statusTone: STATUS_TONES[row.status] || 'slate',
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    service: row.service_name ? { id: row.service_id, name: row.service_name, slug: row.service_slug, type: row.service_type } : null,
    provider: row.provider_name ? { id: row.provider_id, name: row.provider_name, slug: row.provider_slug } : null,
    event: row.event_title ? { id: row.event_id, title: row.event_title, slug: row.event_slug, startAt: row.event_start_at, endAt: row.event_end_at } : null,
    preferredStartAt: row.preferred_start_at,
    altStartAt: row.alt_start_at,
    confirmedStartAt: row.confirmed_start_at,
    confirmedEndAt: row.confirmed_end_at,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    participants: row.participants_count,
    meetingLink: row.meeting_link,
    paymentState: row.payment_state,
    hasReview: Boolean(review),
    eventRegistration: registration ? {
      seats: registration.seats, status: registration.status, attendanceMode: registration.attendance_mode,
      qrToken: registration.qr_token, checkedInAt: registration.checked_in_at,
    } : null,
    canReview: row.status === 'COMPLETED' && !review && Boolean(row.provider_id),
    canCancel: ['REQUESTED', 'CONTACTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'].includes(row.status),
    canReschedule: row.status === 'CONFIRMED',
  };
}

function bookingsList(customerId) {
  const rows = all(
    `SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.service_type AS service_type,
       p.display_name AS provider_name, p.slug AS provider_slug,
       e.title AS event_title, e.slug AS event_slug, e.start_at AS event_start_at, e.end_at AS event_end_at
     FROM bookings b
     LEFT JOIN services s ON s.id = b.service_id
     LEFT JOIN providers p ON p.id = b.provider_id
     LEFT JOIN events e ON e.id = b.event_id
     WHERE b.customer_id = ? ORDER BY b.requested_at DESC`,
    [customerId]
  ).map(bookingSummary);
  return rows;
}

function detailFor(booking, viewer) {
  const staff = Boolean(viewer && ['OWNER', 'ADMIN', 'SUPPORT'].includes(viewer.role));
  const owner = Boolean(viewer && ['OWNER', 'ADMIN'].includes(viewer.role));
  const provider = isProviderViewer(viewer, booking);
  const customer = isOwnerViewer(viewer, booking);
  const service = booking.service_id ? get('SELECT * FROM services WHERE id = ?', [booking.service_id]) : null;
  const providerRow = booking.provider_id ? get('SELECT * FROM providers WHERE id = ?', [booking.provider_id]) : null;
  const event = booking.event_id ? get('SELECT * FROM events WHERE id = ?', [booking.event_id]) : null;
  const puja = get('SELECT * FROM booking_puja_details WHERE booking_id = ?', [booking.id]);
  const consult = get('SELECT * FROM booking_consultation_details WHERE booking_id = ?', [booking.id]);
  const births = all('SELECT * FROM booking_birth_details WHERE booking_id = ?', [booking.id]);
  const history = all('SELECT * FROM booking_status_history WHERE booking_id = ? ORDER BY created_at ASC, id ASC', [booking.id]);
  const reschedules = all('SELECT * FROM booking_reschedules WHERE booking_id = ? ORDER BY created_at DESC', [booking.id]);
  const media = all('SELECT * FROM booking_media WHERE booking_id = ? AND (visible_to_customer = 1 OR ?) ORDER BY created_at', [booking.id, staff ? 1 : 0]);
  const documents = all('SELECT * FROM booking_documents WHERE booking_id = ? AND (visible_to_customer = 1 OR ?) ORDER BY created_at', [booking.id, staff ? 1 : 0]);
  const review = get('SELECT * FROM reviews WHERE booking_id = ?', [booking.id]);
  const registration = get('SELECT * FROM event_registrations WHERE booking_id = ?', [booking.id]);
  const attendees = registration ? all('SELECT * FROM event_attendees WHERE registration_id = ?', [registration.id]) : [];
  const waitlist = get('SELECT * FROM event_waitlist WHERE booking_id = ?', [booking.id]);
  const slot = booking.time_slot_id ? get('SELECT * FROM time_slots WHERE id = ?', [booking.time_slot_id]) : null;

  const payments = owner ? all('SELECT * FROM offline_payment_records WHERE booking_id = ? ORDER BY created_at DESC', [booking.id]) : [];
  const notes = staff ? all('SELECT * FROM booking_notes WHERE booking_id = ? ORDER BY is_pinned DESC, created_at DESC', [booking.id]) : [];
  const contactAttempts = staff || provider
    ? all('SELECT * FROM booking_contact_attempts WHERE booking_id = ? ORDER BY created_at DESC', [booking.id]) : [];
  const notifications = staff ? outboxForBooking(booking.id) : [];

  const phone = staff || customer ? booking.customer_phone : maskPhone(booking.customer_phone);
  const email = staff || customer ? booking.customer_email : null;
  const birthOut = births.map((b) => ({
    id: b.id, label: b.person_label, name: (staff || customer) ? b.full_name : maskName(b.full_name), gender: b.gender,
    dateOfBirth: b.date_of_birth, timeOfBirth: b.time_of_birth, timeUnknown: Boolean(b.time_of_birth_unknown),
    place: b.place_of_birth, gotra: b.gotra, nakshatra: b.nakshatra, rashi: b.rashi,
  }));

  return {
    booking: {
      ...bookingSummary({
        ...booking,
        service_name: service?.name, service_slug: service?.slug, service_type: service?.service_type,
        provider_name: providerRow?.display_name, provider_slug: providerRow?.slug,
        event_title: event?.title, event_slug: event?.slug, event_start_at: event?.start_at, event_end_at: event?.end_at,
      }),
      customerEmail: email,
      preferredContactChannel: booking.preferred_contact_channel,
      preferredCallWindow: booking.preferred_call_window,
      specialRequests: booking.special_requests,
      cancelReason: booking.cancel_reason,
      cancelledBy: booking.cancelled_by,
      ownerNotifiedAt: booking.owner_notified_at,
      slot: slot ? { id: slot.id, startAt: slot.start_at, endAt: slot.end_at, status: slot.status, holdExpiresAt: slot.hold_expires_at } : null,
      puja: puja ? {
        locationType: puja.location_type,
        address: parseJson(puja.address_snapshot, null),
        occasion: puja.occasion,
        sankalpamNames: parseJson(puja.sankalpam_names, []),
        gotra: puja.gotra,
        samagriBy: puja.samagri_by,
        attendeeEstimate: puja.attendee_estimate,
        liveStream: Boolean(puja.live_stream_required),
      } : null,
      consultation: consult ? {
        mode: consult.consult_mode, topics: parseJson(consult.topics, []), question: consult.question_summary,
        duration: consult.duration_min, language: consult.language,
        hasPreviousChart: Boolean(consult.has_previous_chart), matchingRequired: Boolean(consult.matching_required),
      } : null,
      birthDetails: birthOut,
      registration: registration ? {
        id: registration.id, seats: registration.seats, status: registration.status,
        attendanceMode: registration.attendance_mode, qrToken: registration.qr_token,
        checkedInAt: registration.checked_in_at, attendees,
      } : null,
      waitlist: waitlist ? { seats: waitlist.seats_wanted, position: waitlist.position, notifiedAt: waitlist.notified_at } : null,
      history: history.map((h) => ({
        id: h.id, from: h.from_status, to: h.to_status, toLabel: STATUS_LABELS[h.to_status], tone: STATUS_TONES[h.to_status],
        role: h.changed_by_role, reason: h.reason, at: h.created_at,
      })),
      reschedules: reschedules.map((r) => ({
        id: r.id, requestedBy: r.requested_by, oldStartAt: r.old_start_at, newStartAt: r.new_start_at,
        oldSlotId: r.old_slot_id, newSlotId: r.new_slot_id, reason: r.reason, status: r.status,
        createdAt: r.created_at, decidedAt: r.decided_at,
      })),
      media,
      documents,
      review: review ? {
        id: review.id, rating: review.rating, title: review.title, comment: review.comment,
        reply: review.owner_reply, published: Boolean(review.is_published), createdAt: review.created_at,
      } : null,
      payments,
      notes,
      contactAttempts,
      notifications: notifications.map((n) => ({
        id: n.id, code: n.template_code, channel: n.channel, address: n.recipient_address,
        status: n.delivery_status || n.status, sentAt: n.sent_at, createdAt: n.created_at,
      })),
      service: service ? { id: service.id, name: service.name, slug: service.slug, type: service.service_type, duration: service.default_duration_min, priceText: service.indicative_price_text, prepNotes: service.preparation_notes } : null,
      provider: providerRow ? { id: providerRow.id, name: providerRow.display_name, slug: providerRow.slug, type: providerRow.provider_type, city: providerRow.city } : null,
      event: event ? { id: event.id, title: event.title, slug: event.slug, startAt: event.start_at, endAt: event.end_at, venue: event.venue_name } : null,
      viewer: {
        isStaff: staff, isOwner: owner, isProvider: provider, isCustomer: customer,
        phoneMasked: !(staff || customer),
      },
      can: {
        confirm: ['REQUESTED', 'CONTACTED', 'RESCHEDULE_REQUESTED'].includes(booking.status) && (staff || provider),
        reject: ['REQUESTED', 'CONTACTED'].includes(booking.status) && (staff || provider),
        cancel: ['REQUESTED', 'CONTACTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'].includes(booking.status) && (staff || customer),
        complete: booking.status === 'CONFIRMED' && (staff || provider),
        noShow: booking.status === 'CONFIRMED' && staff,
        reschedule: booking.status === 'CONFIRMED' && (customer || staff),
        logContact: (staff || provider) && ['REQUESTED', 'CONTACTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'].includes(booking.status),
        notes: staff,
        payments: owner,
        download: staff,
        review: booking.status === 'COMPLETED' && customer && !review && Boolean(booking.provider_id),
      },
    },
  };
}

function nextRef() {
  const dateKey = istDateKey().replaceAll('-', '');
  for (let i = 0; i < 20; i++) {
    const ref = `BK-${dateKey}-${String(1000 + Math.floor(Math.random() * 9000))}`;
    if (!get('SELECT id FROM bookings WHERE booking_ref = ?', [ref])) return ref;
  }
  return `BK-${dateKey}-${Date.now().toString().slice(-6)}`;
}

function recordHistory(bookingId, fromStatus, toStatus, role, reason = null, userId = null) {
  insert('booking_status_history', {
    booking_id: bookingId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by_user_id: userId,
    changed_by_role: role,
    reason,
    created_at: nowIso(),
  });
}

function validateContact(user, body) {
  const contact = body.contact || {};
  const name = str(contact.name || user.full_name, { min: 2, max: 150, field: 'Name', required: true });
  const phone = normalizePhone(contact.phone || user.phone);
  assert(phone, 422, 'Enter a valid mobile number');
  if (user.phone && phone !== user.phone) {
    throw new HttpError(422, 'Please use the mobile number verified on your account, or sign in with the new number.');
  }
  const email = str(contact.email || user.email || '', { max: 150, field: 'Email' });
  if (email) assert(isEmail(email), 422, 'Enter a valid email address');
  const channel = CONTACT_CHANNELS.includes(contact.contactChannel) ? contact.contactChannel : 'CALL';
  return {
    name, phone, email: email || null,
    channel,
    callWindow: str(contact.callWindow, { max: 40, field: 'Call window' }) || null,
    language: str(contact.language || user.preferred_language || 'en', { max: 5, field: 'Language' }),
    participants: int(contact.participants, 1, { min: 1, max: 500, field: 'Participants' }),
    specialRequests: str(contact.specialRequests, { max: 3000, field: 'Special requests' }) || null,
  };
}

function validateBirthDetails(list, { required = false, matching = false } = {}) {
  const items = Array.isArray(list) ? list : [];
  if (required) assert(items.length >= (matching ? 2 : 1), 422, matching ? 'Kundli matching needs two birth profiles' : 'Birth details are required');
  if (items.length > 2) throw new HttpError(422, 'You can add up to two birth profiles');
  return items.map((item, index) => {
    const name = str(item.name, { min: 2, max: 150, field: `Person ${index + 1} name`, required: true });
    const dob = str(item.dateOfBirth, { max: 10, field: 'Date of birth', required: true });
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dob), 422, 'Enter a valid date of birth');
    assert(new Date(dob).getTime() < Date.now(), 422, 'Date of birth must be in the past');
    const unknown = bool(item.timeUnknown);
    const time = unknown ? null : str(item.timeOfBirth, { max: 8, field: 'Time of birth' });
    return {
      label: str(item.label, { max: 60, field: 'Profile label' }) || (index === 0 ? 'Self' : 'Second person'),
      name,
      gender: ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'].includes(item.gender) ? item.gender : 'UNDISCLOSED',
      dob, time, unknown: unknown ? 1 : 0,
      place: str(item.placeOfBirth, { min: 2, max: 200, field: 'Place of birth', required: true }),
      gotra: str(item.gotra, { max: 80 }), nakshatra: str(item.nakshatra, { max: 40 }), rashi: str(item.rashi, { max: 40 }),
    };
  });
}

function createBookingFlow(user, body, req) {
  const type = body.type;
  oneOf(type, ['PUJA', 'CONSULTATION', 'EVENT'], 'Booking type');
  const contact = validateContact(user, body);
  const openCount = get(
    "SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND status IN ('REQUESTED','CONTACTED','RESCHEDULE_REQUESTED')",
    [user.id]
  ).n;
  const maxOpen = Number(getSetting('booking.max_open_requests_per_phone', 3));
  assert(openCount < maxOpen, 429, `You already have ${openCount} open requests. Please wait for us to contact you before sending another.`);

  let service = null;
  let provider = null;
  const primarySlug = getSetting('site.primary_provider_slug', 'pandit-ramesh-sharma');
  provider = get('SELECT * FROM providers WHERE slug = ?', [primarySlug]) || get('SELECT * FROM providers WHERE is_active = 1 LIMIT 1');
  assert(provider && provider.is_active, 409, 'Online booking is paused right now. Please send an enquiry instead.');

  if (type === 'EVENT') {
    return createEventBooking(user, body, contact, req);
  }

  assert(body.serviceId, 422, 'Please choose a service');
  service = get('SELECT * FROM services WHERE (id = ? OR slug = ?) AND is_active = 1', [body.serviceId, body.serviceId]);
  assert(service, 404, 'That service is not available');
  assert(service.service_type === type, 422, 'This service does not match the booking type');
  const offered = get('SELECT 1 AS ok FROM provider_services WHERE provider_id = ? AND service_id = ? AND is_active = 1', [provider.id, service.id]);
  assert(offered, 409, 'Pandit ji is not currently taking requests for this service');

  let slot = null;
  if (body.timeSlotId) {
    slot = get('SELECT * FROM time_slots WHERE id = ?', [body.timeSlotId]);
    assert(slot, 404, 'That time slot could not be found');
    assert(slot.status === 'AVAILABLE', 409, 'That slot was just requested. Please choose another time.', { code: 'SLOT_TAKEN' });
    const notice = Number(getSetting('booking.min_notice_hours', 12));
    assert(new Date(slot.start_at).getTime() > Date.now() + notice * 3600000, 422, 'Please choose a time at least 12 hours from now');
    assert(slot.service_type === service.service_type, 422, 'This slot does not match the service');
  }
  const altStartAt = body.altStartAt ? new Date(body.altStartAt) : null;
  if (!slot) assert(altStartAt && !Number.isNaN(altStartAt.getTime()), 422, 'Please choose a slot or suggest an alternative time');
  const preferredStartAt = slot ? slot.start_at : altStartAt.toISOString();

  let pujaDetails = null;
  let consultDetails = null;
  let birthDetails = [];
  if (type === 'PUJA') {
    const d = body.details || {};
    const allowed = parseJson(service.allowed_locations, PUJA_LOCATIONS);
    const locationType = allowed.includes(d.locationType) ? d.locationType : (allowed[0] || 'TEMPLE');
    let address = null;
    if (locationType === 'CUSTOMER_HOME') {
      if (d.addressId) {
        const saved = get('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', [d.addressId, user.id]);
        if (saved) {
          address = {
            line1: saved.line1, line2: saved.line2, landmark: saved.landmark, city: saved.city,
            state: saved.state, postalCode: saved.postal_code,
          };
        }
      }
      if (!address && d.address) {
        address = {
          line1: str(d.address.line1, { min: 3, max: 200, field: 'Address', required: true }),
          line2: str(d.address.line2, { max: 200 }),
          landmark: str(d.address.landmark, { max: 150 }),
          city: str(d.address.city, { min: 2, max: 80, field: 'City', required: true }),
          state: str(d.address.state, { max: 80 }),
          postalCode: str(d.address.postalCode, { max: 15 }),
        };
      }
      assert(address, 422, 'Please add the address for a home puja');
    }
    pujaDetails = {
      locationType,
      address,
      occasion: str(d.occasion, { max: 100 }) || 'Family puja',
      names: Array.isArray(d.sankalpamNames) ? d.sankalpamNames.slice(0, 20).map((n) => String(n).slice(0, 80)) : [],
      gotra: str(d.gotra, { max: 80 }) || null,
      samagriBy: ['CUSTOMER', 'PRIEST', 'DISCUSS'].includes(d.samagriBy) ? d.samagriBy : 'PRIEST',
      attendees: int(d.attendeeEstimate, contact.participants, { min: 1, max: 500, field: 'Attendees' }),
      live: bool(d.liveStreamRequired) ? 1 : 0,
    };
  } else {
    const d = body.details || {};
    const allowedModes = parseJson(service.allowed_consult_modes, CONSULT_MODES);
    const mode = allowedModes.includes(d.mode) ? d.mode : (allowedModes[0] || 'VOICE');
    const topics = Array.isArray(d.topics) ? d.topics.filter((t) => typeof t === 'string').slice(0, 8).map((t) => t.slice(0, 40)) : [];
    assert(topics.length > 0, 422, 'Choose at least one topic for the consultation');
    birthDetails = validateBirthDetails(body.birthDetails, { required: Boolean(service.requires_birth_details), matching: Boolean(d.matchingRequired) || service.slug === 'kundli-matching' });
    consultDetails = {
      mode,
      topics,
      question: str(d.question, { max: 2000 }) || null,
      duration: service.default_duration_min,
      language: contact.language,
      previous: bool(d.hasPreviousChart) ? 1 : 0,
      matching: (bool(d.matchingRequired) || service.slug === 'kundli-matching') ? 1 : 0,
    };
  }

  const holdHours = Number(getSetting('booking.hold_hours', 24));
  const result = tx(() => {
    if (slot) {
      const fresh = get('SELECT * FROM time_slots WHERE id = ?', [slot.id]);
      if (!fresh || fresh.status !== 'AVAILABLE') throw new HttpError(409, 'That slot was just requested. Please choose another time.', { code: 'SLOT_TAKEN' });
    }
    const bookingId = uuid();
    const ref = nextRef();
    const requestedAt = nowIso();
    insert('bookings', {
      id: bookingId, booking_ref: ref, booking_type: type, status: 'REQUESTED',
      customer_id: user.id, service_id: service.id, provider_id: provider.id,
      time_slot_id: slot?.id || null, event_id: null,
      preferred_start_at: preferredStartAt, alt_start_at: slot && altStartAt ? altStartAt.toISOString() : (!slot ? preferredStartAt : null),
      confirmed_start_at: null, confirmed_end_at: null,
      customer_name: contact.name, customer_phone: contact.phone, customer_email: contact.email,
      preferred_contact_channel: contact.channel, preferred_call_window: contact.callWindow,
      preferred_language: contact.language, participants_count: contact.participants,
      special_requests: contact.specialRequests, source: 'WEB', assigned_to_user_id: null,
      meeting_link: null, payment_state: 'NOT_DISCUSSED', requested_at: requestedAt,
      first_contacted_at: null, confirmed_at: null, completed_at: null, cancelled_at: null,
      cancel_reason: null, cancelled_by: null,
      expires_at: new Date(Date.now() + Number(getSetting('booking.auto_expire_hours', 48)) * 3600000).toISOString(),
      owner_notified_at: null, ip_address: req?.ip || null, user_agent: req?.userAgent || null,
      created_at: requestedAt, updated_at: requestedAt,
    });
    if (slot) {
      const held = holdSlot(slot.id, bookingId, 'TENTATIVE', holdHours);
      if (!held) throw new HttpError(409, 'That slot was just requested. Please choose another time.', { code: 'SLOT_TAKEN' });
    }
    if (pujaDetails) {
      insert('booking_puja_details', {
        booking_id: bookingId, location_type: pujaDetails.locationType,
        address_snapshot: pujaDetails.address ? JSON.stringify(pujaDetails.address) : null,
        occasion: pujaDetails.occasion, sankalpam_names: JSON.stringify(pujaDetails.names),
        gotra: pujaDetails.gotra, samagri_by: pujaDetails.samagriBy, need_travel: 0,
        attendee_estimate: pujaDetails.attendees, live_stream_required: pujaDetails.live,
      });
    }
    if (consultDetails) {
      insert('booking_consultation_details', {
        booking_id: bookingId, consult_mode: consultDetails.mode, topics: JSON.stringify(consultDetails.topics),
        question_summary: consultDetails.question, duration_min: consultDetails.duration,
        meeting_link: null, language: consultDetails.language,
        has_previous_chart: consultDetails.previous, matching_required: consultDetails.matching,
      });
      for (const person of birthDetails) {
        insert('booking_birth_details', {
          id: uuid(), booking_id: bookingId, person_label: person.label, full_name: person.name,
          gender: person.gender, date_of_birth: person.dob, time_of_birth: person.time,
          time_of_birth_unknown: person.unknown, place_of_birth: person.place,
          birth_latitude: null, birth_longitude: null, gotra: person.gotra || null,
          nakshatra: person.nakshatra || null, rashi: person.rashi || null, source_birth_profile_id: null,
        });
      }
    }
    recordHistory(bookingId, null, 'REQUESTED', 'CUSTOMER', 'Request submitted through the website', user.id);
    const policyVersion = getSetting('privacy.policy_version', '2026-01');
    for (const consentType of ['PRIVACY_POLICY', 'CONTACT_BY_PHONE', ...(type === 'CONSULTATION' ? ['BIRTH_DATA_PROCESSING'] : [])]) {
      insert('consents', {
        id: uuid(), user_id: user.id, booking_id: bookingId, consent_type: consentType,
        policy_version: policyVersion, granted: 1, granted_at: requestedAt, ip_address: req?.ip || null,
      });
    }
    const booking = get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    queueNewBooking(booking, {
      booking_ref: ref, booking_type: type, service_name: service.name,
      customer_name: contact.name, customer_phone: contact.phone, customer_email: contact.email,
      preferred_datetime: preferredStartAt, provider_name: provider.display_name,
      location: pujaDetails?.locationType || (consultDetails ? consultDetails.mode : ''), participants: contact.participants,
      special_requests: contact.specialRequests, contact_preference: contact.channel,
    });
    notifyInApp(user.id, 'Request received', `${service.name} · ${ref}. We will contact you within a few hours to confirm the details.`, `#/my/bookings/${ref}`);
    return { id: bookingId, ref, status: 'REQUESTED' };
  });
  audit(req, 'BOOKING_CREATED', 'booking', result.id, null, { ref: result.ref, type, service: service.name });
  return result;
}

function createEventBooking(user, body, contact, req) {
  const event = get('SELECT * FROM events WHERE (id = ? OR slug = ?) AND status = ?', [body.eventId, body.eventId, 'PUBLISHED']);
  assert(event, 404, 'That gathering is not open for registration');
  const seats = int(body.seats, 1, { min: 1, max: event.max_per_registration, field: 'Seats' });
  const mode = body.attendanceMode === 'ONLINE' ? 'ONLINE' : 'IN_PERSON';
  if (mode === 'ONLINE') assert(event.is_online_available, 422, 'This gathering is in person only');
  const now = Date.now();
  assert(!event.registration_closes_at || new Date(event.registration_closes_at).getTime() > now, 409, 'Registration for this gathering has closed');
  assert(!event.registration_opens_at || new Date(event.registration_opens_at).getTime() <= now, 409, 'Registration has not opened yet');
  assert(event.end_at && new Date(event.end_at).getTime() > now, 409, 'This gathering has already taken place');
  const attendees = Array.isArray(body.attendees) ? body.attendees.slice(0, seats).map((a) => ({
    name: str(a.name, { max: 150, field: 'Attendee name' }), gotra: str(a.gotra, { max: 80 }),
    ageGroup: ['CHILD', 'ADULT', 'SENIOR'].includes(a.ageGroup) ? a.ageGroup : 'ADULT',
    nakshatra: str(a.nakshatra, { max: 40 }),
  })) : [];
  const dietary = str(body.dietaryNote, { max: 150 });

  const result = tx(() => {
    const fresh = get('SELECT * FROM events WHERE id = ?', [event.id]);
    const seatsLeft = fresh.capacity - fresh.seats_taken;
    let waitlisted = false;
    if (seatsLeft < seats) {
      assert(fresh.waitlist_enabled, 409, 'This gathering is full and the waitlist is closed.');
      waitlisted = true;
    }
    const bookingId = uuid();
    const ref = nextRef();
    const requestedAt = nowIso();
    insert('bookings', {
      id: bookingId, booking_ref: ref, booking_type: 'EVENT', status: 'REQUESTED',
      customer_id: user.id, service_id: event.service_id, provider_id: event.lead_provider_id,
      time_slot_id: null, event_id: event.id, preferred_start_at: event.start_at, alt_start_at: null,
      confirmed_start_at: null, confirmed_end_at: null,
      customer_name: contact.name, customer_phone: contact.phone, customer_email: contact.email,
      preferred_contact_channel: contact.channel, preferred_call_window: contact.callWindow,
      preferred_language: contact.language, participants_count: seats,
      special_requests: contact.specialRequests, source: 'WEB', assigned_to_user_id: null,
      meeting_link: null, payment_state: 'NOT_DISCUSSED', requested_at: requestedAt,
      first_contacted_at: null, confirmed_at: null, completed_at: null, cancelled_at: null,
      cancel_reason: null, cancelled_by: null,
      expires_at: new Date(Date.now() + 72 * 3600000).toISOString(), owner_notified_at: null,
      ip_address: req?.ip || null, user_agent: req?.userAgent || null, created_at: requestedAt, updated_at: requestedAt,
    });
    recordHistory(bookingId, null, 'REQUESTED', 'CUSTOMER', waitlisted ? 'Waitlist request submitted' : 'Registration requested', user.id);
    const registrationId = uuid();
    insert('event_registrations', {
      id: registrationId, event_id: event.id, booking_id: bookingId, seats,
      status: waitlisted ? 'WAITLISTED' : 'REGISTERED', attendance_mode: mode,
      checked_in_at: null, qr_token: `AR-${uuid().slice(0, 8).toUpperCase()}`, created_at: requestedAt,
    });
    attendees.forEach((person, i) => {
      insert('event_attendees', {
        id: uuid(), registration_id: registrationId, full_name: person.name,
        gotra: person.gotra || null, nakshatra: person.nakshatra || null,
        age_group: i === 0 ? 'ADULT' : person.ageGroup, dietary_note: i === 0 ? dietary || null : null,
      });
    });
    if (!waitlisted) {
      const updated = run(
        'UPDATE events SET seats_taken = seats_taken + ?, status = CASE WHEN seats_taken + ? >= capacity THEN \'FULL\' ELSE status END, updated_at = ? WHERE id = ? AND seats_taken + ? <= capacity',
        [seats, seats, requestedAt, event.id, seats]
      );
      if (!updated.changes) throw new HttpError(409, 'Those seats were just taken. Please join the waitlist.', { code: 'EVENT_FULL' });
    } else {
      const position = (get('SELECT COUNT(*) AS n FROM event_waitlist WHERE event_id = ?', [event.id]).n || 0) + 1;
      insert('event_waitlist', {
        id: uuid(), event_id: event.id, booking_id: bookingId, seats_wanted: seats,
        position, notified_at: null, created_at: requestedAt,
      });
    }
    const policyVersion = getSetting('privacy.policy_version', '2026-01');
    for (const consentType of ['PRIVACY_POLICY', 'CONTACT_BY_PHONE']) {
      insert('consents', {
        id: uuid(), user_id: user.id, booking_id: bookingId, consent_type: consentType,
        policy_version: policyVersion, granted: 1, granted_at: requestedAt, ip_address: req?.ip || null,
      });
    }
    const booking = get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    queueNewBooking(booking, {
      booking_ref: ref, booking_type: 'EVENT', service_name: event.title,
      customer_name: contact.name, customer_phone: contact.phone, customer_email: contact.email,
      preferred_datetime: event.start_at, provider_name: 'Pandit Ramesh Sharma',
      location: event.venue_name, participants: seats,
    });
    notifyInApp(user.id, waitlisted ? 'You are on the waitlist' : 'Registration received',
      `${event.title} · ${ref}. ${waitlisted ? 'We will contact you if a seat opens.' : 'We will call you to confirm your seats.'}`,
      `#/my/bookings/${ref}`);
    return { id: bookingId, ref, status: 'REQUESTED', waitlisted };
  });
  audit(req, 'EVENT_REGISTRATION_CREATED', 'booking', result.id, null, { event: event.title, seats });
  return result;
}

function cancelBooking(user, booking, reason, role = null) {
  assert(['REQUESTED', 'CONTACTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'].includes(booking.status), 409, 'This booking can no longer be cancelled online. Please call us.');
  const cleanReason = str(reason, { min: 3, max: 300, field: 'Reason', required: true });
  const staff = role || (['OWNER', 'ADMIN', 'SUPPORT'].includes(user.role) ? 'STAFF' : 'CUSTOMER');
  tx(() => {
    releaseSlot(booking.time_slot_id);
    if (booking.booking_type === 'EVENT') {
      const registration = get('SELECT * FROM event_registrations WHERE booking_id = ?', [booking.id]);
      if (registration && ['REGISTERED', 'CONFIRMED'].includes(registration.status)) {
        run('UPDATE event_registrations SET status = ? WHERE id = ?', ['CANCELLED', registration.id]);
        run(
          `UPDATE events SET seats_taken = MAX(0, seats_taken - ?), status = CASE WHEN status = 'FULL' THEN 'PUBLISHED' ELSE status END WHERE id = ?`,
          [registration.seats, booking.event_id]
        );
        const wait = get('SELECT * FROM event_waitlist WHERE event_id = ? ORDER BY position LIMIT 1', [booking.event_id]);
        if (wait) {
          const waitBooking = get('SELECT * FROM bookings WHERE id = ?', [wait.booking_id]);
          if (waitBooking) {
            notifyInApp(waitBooking.customer_id, 'A seat may be available',
              `Good news — a seat has opened for an event you are waitlisted for. We will call you to confirm.`, `#/my/bookings/${waitBooking.booking_ref}`);
            queueStatusNotification(waitBooking, 'EVENT_WAITLIST_SEAT_OPENED', { service_name: get('SELECT title FROM events WHERE id = ?', [booking.event_id])?.title });
            run('UPDATE event_waitlist SET notified_at = ? WHERE id = ?', [nowIso(), wait.id]);
          }
        }
      } else if (registration) {
        run('UPDATE event_registrations SET status = ? WHERE id = ?', ['CANCELLED', registration.id]);
      }
    }
    run(
      `UPDATE bookings SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = ?, cancelled_by = ?, updated_at = ? WHERE id = ?`,
      [nowIso(), cleanReason, staff, nowIso(), booking.id]
    );
    recordHistory(booking.id, booking.status, 'CANCELLED', staff, cleanReason, user.id);
    const fresh = get('SELECT * FROM bookings WHERE id = ?', [booking.id]);
    queueStatusNotification(fresh, 'CUSTOMER_CANCELLED', { service_name: get('SELECT name FROM services WHERE id = ?', [booking.service_id])?.name || 'your booking', reason: cleanReason });
  });
  if (booking.customer_id) notifyInApp(booking.customer_id, 'Booking cancelled', `${booking.booking_ref} has been cancelled. ${cleanReason}`, `#/my/bookings/${booking.booking_ref}`);
  return { ok: true };
}

function requestReschedule(user, booking, body) {
  assert(booking.status === 'CONFIRMED', 409, 'Only a confirmed booking can be rescheduled online. Please contact us.');
  const newSlot = body.newSlotId ? get('SELECT * FROM time_slots WHERE id = ?', [body.newSlotId]) : null;
  const newStart = newSlot ? newSlot.start_at : (body.newStartAt ? new Date(body.newStartAt).toISOString() : null);
  assert(newStart && newStart !== 'Invalid Date', 422, 'Choose a new date and time');
  const reason = str(body.reason, { min: 3, max: 300, field: 'Reason', required: true });
  const result = tx(() => {
    let slotId = null;
    if (newSlot) {
      assert(newSlot.status === 'AVAILABLE', 409, 'That slot is no longer available. Please choose another.');
      assert(newSlot.provider_id === booking.provider_id, 422, 'That slot belongs to a different provider');
      slotId = newSlot.id;
      if (!holdSlot(slotId, booking.id, 'TENTATIVE', Number(getSetting('booking.hold_hours', 24)))) {
        throw new HttpError(409, 'That slot was just taken. Please choose another.');
      }
    }
    insert('booking_reschedules', {
      id: uuid(), booking_id: booking.id, requested_by: isOwnerViewer(user, booking) ? 'CUSTOMER' : 'STAFF',
      old_slot_id: booking.time_slot_id, new_slot_id: slotId,
      old_start_at: booking.confirmed_start_at || booking.preferred_start_at, new_start_at: newStart,
      reason, status: 'PENDING', decided_by: null, decided_at: null, created_at: nowIso(),
    });
    run('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?', ['RESCHEDULE_REQUESTED', nowIso(), booking.id]);
    recordHistory(booking.id, booking.status, 'RESCHEDULE_REQUESTED', 'CUSTOMER', reason, user.id);
    return { ok: true };
  });
  const fresh = get('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  queueStatusNotification(fresh, 'CUSTOMER_RESCHEDULED', { service_name: get('SELECT name FROM services WHERE id = ?', [booking.service_id])?.name, reason });
  if (booking.customer_id) notifyInApp(booking.customer_id, 'Reschedule requested', 'We have your new time preference and will confirm shortly.', `#/my/bookings/${booking.booking_ref}`);
  return result;
}

function createReview(user, booking, body) {
  assert(booking.customer_id === user.id, 403, 'You can only review your own booking');
  assert(booking.status === 'COMPLETED', 422, 'You can review a booking after it is completed');
  assert(!get('SELECT id FROM reviews WHERE booking_id = ?', [booking.id]), 409, 'You have already reviewed this booking');
  assert(booking.provider_id, 422, 'This booking does not have a provider to review');
  const rating = int(body.rating, null, { min: 1, max: 5, field: 'Rating' });
  assert(rating, 422, 'Choose a rating');
  const title = str(body.title, { max: 100, field: 'Title' });
  const comment = str(body.comment, { min: 10, max: 2000, field: 'Review', required: true });
  const id = uuid();
  tx(() => {
    insert('reviews', {
      id, booking_id: booking.id, provider_id: booking.provider_id, user_id: user.id,
      customer_name: user.full_name, rating, title, comment, is_published: 1,
      owner_reply: null, created_at: nowIso(),
    });
    const provider = get('SELECT * FROM providers WHERE id = ?', [booking.provider_id]);
    if (provider) {
      const newCount = (provider.review_count || 0) + 1;
      const newAvg = (((provider.average_rating || 0) * (provider.review_count || 0)) + rating) / newCount;
      run('UPDATE providers SET average_rating = ?, review_count = ?, updated_at = ? WHERE id = ?', [Math.round(newAvg * 10) / 10, newCount, nowIso(), provider.id]);
    }
    notifyInApp(user.id, 'Thank you for your review', 'Your words help other families find the right guidance.', '#/my/bookings');
  });
  return { ok: true, id };
}

module.exports = {
  PUJA_LOCATIONS, CONSULT_MODES, CONTACT_CHANNELS,
  findBooking, canViewBooking, bookingSummary, bookingsList, detailFor,
  createBookingFlow, cancelBooking, requestReschedule, createReview,
  recordHistory, validateContact, validateBirthDetails,
};
