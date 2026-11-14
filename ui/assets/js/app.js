'use strict';
import { register, startRouter, state, loadMe, loadSettings, boot } from './core.js?v=15';
import * as P from './pages-public.js?v=15';
import * as B from './pages-booking.js?v=15';
import * as A from './pages-account.js?v=15';
import * as D from './pages-admin.js?v=15';

// Public routing (Website A structure, enhanced with Website B features)
register('/', (p, q) => P.renderHome());
register('pujas', (p, q) => P.renderPujas(q));
register('services/:slug', (p, q) => P.renderServiceDetail(p));
register('guidance', (p, q) => P.renderGuidance());
register('events', (p, q) => P.renderEvents(q));
register('events/:slug', (p, q) => P.renderEventDetail(p));
register('availability', (p, q) => P.renderAvailability(q));
register('horoscope', (p, q) => P.renderHoroscope(q));
register('panchang', (p, q) => P.renderPanchang(q));
register('about', (p, q) => P.renderAbout());
register('contact', (p, q) => P.renderContact());
register('faq', (p, q) => P.renderFaq());
register('privacy', (p, q) => P.renderPolicy('privacy'));
register('terms', (p, q) => P.renderPolicy('terms'));
register('cancellation', (p, q) => P.renderPolicy('cancellation'));

// Booking routes (Website B's multi-step wizard integrated)
register('book/puja/:slug', (p, q) => B.renderBook('puja', p.slug));
register('book/consultation/:slug', (p, q) => B.renderBook('consultation', p.slug));
register('book/event/:slug', (p, q) => B.renderBook('event', p.slug));
register('book/success', (p, q) => B.renderBookingSuccess(q));

// Auth & account routes
register('login', (p, q) => B.renderLogin());
register('reset-password', (p, q) => B.renderResetPassword());
register('my', (p, q) => A.renderAccountDashboard());
register('my/bookings', (p, q) => A.renderMyBookings(q));
register('my/bookings/:ref', (p, q) => A.renderBookingDetail(p));
register('my/profiles', (p, q) => A.renderProfiles());
register('my/addresses', (p, q) => A.renderAddresses());
register('my/settings', (p, q) => A.renderAccountSettings());
register('my/notifications', (p, q) => A.renderNotifications());

// Admin routes (Website B's full admin panel)
register('admin', (p, q) => D.renderAdminDashboard());
register('admin/inbox', (p, q) => D.renderAdminInbox(q));
register('admin/bookings/:ref', (p, q) => D.renderAdminBooking(p));
register('admin/calendar', (p, q) => D.renderAdminCalendar(q));
register('admin/availability', (p, q) => D.renderAdminAvailability());
register('admin/pandit', (p, q) => D.renderAdminPandit());
register('admin/services', (p, q) => D.renderAdminServices());
register('admin/events', (p, q) => D.renderAdminEvents());
register('admin/events/:id/registrations', (p, q) => D.renderAdminEventRegistrations(p));
register('admin/customers', (p, q) => D.renderAdminCustomers(q));
register('admin/customers/:id', (p, q) => D.renderAdminCustomerDetail(p));
register('admin/messages', (p, q) => D.renderAdminMessages());
register('admin/notifications', (p, q) => D.renderAdminNotifications());
register('admin/reports', (p, q) => D.renderAdminReports(q));
register('admin/settings', (p, q) => D.renderAdminSettings());
register('admin/audit', (p, q) => D.renderAdminAudit());

// Provider routes
register('provider', (p, q) => D.renderProviderDashboard());
register('provider/bookings', (p, q) => D.renderProviderBookings(q));
register('provider/bookings/:ref', (p, q) => D.renderProviderBookingDetail(p));
register('provider/schedule', (p, q) => D.renderProviderSchedule());
register('provider/availability', (p, q) => D.renderProviderAvailability());
register('provider/profile', (p, q) => D.renderProviderProfile());

boot();