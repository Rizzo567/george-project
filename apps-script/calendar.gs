// ── MISTER BARBER — Google Apps Script ──────────────────────────────────────
// Incolla questo script su https://script.google.com
// Menu: Distribuisci → Nuova distribuzione → App Web
//   - Esegui come: Me
//   - Chi ha accesso: Chiunque
// Copia l'URL e mettilo in Cloudflare come GEORGE_SCRIPT_URL o BERLIN_SCRIPT_URL

var SECRET = 'INSERISCI_QUI_IL_TUO_SECRET'; // deve coincidere con BOOKING_SECRET su Cloudflare

// ── GET: legge disponibilità ────────────────────────────────────────────────
function doGet(e) {
  if (e.parameter.secret !== SECRET) {
    return response({ error: 'Non autorizzato' });
  }

  var dateStr = e.parameter.date; // es. "2026-05-14"
  if (!dateStr) return response({ error: 'Date mancante' });

  var start = new Date(dateStr + 'T00:00:00');
  var end   = new Date(dateStr + 'T23:59:59');

  var cal    = CalendarApp.getDefaultCalendar();
  var events = cal.getEvents(start, end);

  var busy = events.map(function (ev) {
    return {
      start: ev.getStartTime().toISOString(),
      end:   ev.getEndTime().toISOString(),
    };
  });

  return response({ busy: busy });
}

// ── POST: crea prenotazione ─────────────────────────────────────────────────
function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return response({ error: 'Body non valido' }); }

  if (data.secret !== SECRET) {
    return response({ error: 'Non autorizzato' });
  }

  var cal   = CalendarApp.getDefaultCalendar();
  var start = new Date(data.start);
  var end   = new Date(data.end);

  cal.createEvent(data.summary, start, end, {
    description: data.description || '',
  });

  return response({ ok: true });
}

function response(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
