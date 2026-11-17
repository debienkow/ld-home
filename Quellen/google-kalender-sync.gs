/* WombiCoon: Google-Kalender-Sync v1.5 (17.11.2026) */
const TOKEN = 'HIER-EIN-GEHEIMWORT-EINTRAGEN';
const CAL_NAME = 'WombiCoon App';
const VERSION = '1.5';
const TZ = 'Europe/Berlin';

function cal_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CAL_ID');
  let c = id ? CalendarApp.getCalendarById(id) : null;
  if (!c) c = CalendarApp.getOwnedCalendarsByName(CAL_NAME)[0] || CalendarApp.createCalendar(CAL_NAME, { timeZone: TZ });
  if (c.getId() !== id) props.setProperty('CAL_ID', c.getId());
  return c;
}
function find_(gid, cal) {
  if (!gid) return null;
  let e = cal.getEventById(gid);
  if (e) return e;
  const cals = CalendarApp.getAllOwnedCalendars();
  for (let i = 0; i < cals.length; i++) {
    if (cals[i].getId() === cal.getId()) continue;
    e = cals[i].getEventById(gid);
    if (e) return e;
  }
  return null;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function d_(s, t) {
  const [y, m, d] = s.split('-').map(Number);
  const [h, mi] = (t || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}
function fmt_(date, f) { return Utilities.formatDate(date, TZ, f); }
function plus_(s, n) { const x = d_(s); x.setDate(x.getDate() + n); return fmt_(x, 'yyyy-MM-dd'); }

function ev_(e) {
  const allDay = e.isAllDayEvent();
  const s = e.getStartTime(), en = e.getEndTime();
  const start = fmt_(s, 'yyyy-MM-dd');
  const end = allDay ? plus_(fmt_(en, 'yyyy-MM-dd'), -1) : fmt_(en, 'yyyy-MM-dd');
  return {
    gid: e.getId(), title: e.getTitle(), allDay, start, end: end < start ? start : end,
    startTime: allDay ? '' : fmt_(s, 'HH:mm'), endTime: allDay ? '' : fmt_(en, 'HH:mm'),
    location: e.getLocation() || '', note: e.getDescription() || '', updated: e.getLastUpdated().getTime(),
    recurring: e.isRecurringEvent()
  };
}

function apply_(e, p) {
  e.setTitle(p.title);
  e.setLocation(p.location || '');
  e.setDescription(p.note || '');
  if (p.allDay) e.setAllDayDates(d_(p.start), d_(plus_(p.end || p.start, 1)));
  else e.setTime(d_(p.start, p.startTime || '00:00'), d_(p.end || p.start, p.endTime || p.startTime || '01:00'));
}

function doPost(req) {
  try {
    return run_(req);
  } catch (err) {
    return out_({ error: 'skript: ' + String(err && err.message || err).slice(0, 120) });
  }
}

function run_(req) {
  const r = JSON.parse(req.postData.contents);
  if (TOKEN.length < 16 || TOKEN.indexOf('HIER-') === 0) return out_({ error: 'geheimwort im skript fehlt oder ist zu kurz' });
  if (typeof r.token !== 'string' || r.token !== TOKEN) return out_({ error: 'token' });
  const cal = cal_();
  if (r.action === 'ping') return out_({ ok: true, calendar: cal.getName(), version: VERSION });
  if (r.action === 'list') {
    const list = [];
    CalendarApp.getAllOwnedCalendars().forEach((c) => c.getEvents(d_(r.from), d_(r.to)).forEach((e) => list.push(ev_(e))));
    return out_({ ok: true, events: list });
  }
  if (r.action === 'listAll') {
    const all = [];
    CalendarApp.getAllOwnedCalendars().forEach((c) => { if (c.getId() !== cal.getId()) c.getEvents(d_(r.from), d_(r.to)).forEach((e) => all.push(ev_(e))); });
    return out_({ ok: true, events: all });
  }
  if (r.action === 'upsert') {
    const p = r.event;
    let e = find_(p.gid, cal);
    if (e && e.isRecurringEvent()) return out_({ error: 'serie' });
    if (!e) {
      e = p.allDay
        ? cal.createAllDayEvent(p.title, d_(p.start), d_(plus_(p.end || p.start, 1)))
        : cal.createEvent(p.title, d_(p.start, p.startTime || '00:00'), d_(p.end || p.start, p.endTime || p.startTime || '01:00'));
    }
    apply_(e, p);
    return out_({ ok: true, gid: e.getId(), updated: e.getLastUpdated().getTime() });
  }
  if (r.action === 'delete') {
    const e = find_(r.gid, cal);
    if (e && e.isRecurringEvent()) return out_({ error: 'serie' });
    if (e) e.deleteEvent();
    return out_({ ok: true, found: !!e });
  }
  return out_({ error: 'action' });
}
