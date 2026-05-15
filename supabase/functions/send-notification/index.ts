const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN_URL = Deno.env.get('ADMIN_URL')!;

const BARBER_EMAILS: Record<string, string> = {
  george: 'georgevelozperez5@gmail.com',
  berlin: 'superberlin0204@gmail.com',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let body: {
    barber: string; name: string; phone: string;
    service: string; date: string; time: string; notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const { barber, name, phone, service, date, time, notes } = body;

  if (!barber || !name || !phone || !service || !date || !time) {
    return new Response(JSON.stringify({ error: 'Campi obbligatori mancanti' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const emailTo = BARBER_EMAILS[barber];
  if (!emailTo) {
    return new Response(JSON.stringify({ error: 'Barbiere non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const barberName = barber === 'george' ? 'George' : 'Berlin';
  const emailBody = [
    `Nuova prenotazione — Mister Barber`,
    ``,
    `Barbiere: ${barberName}`,
    `Nome: ${name}`,
    `Telefono: ${phone}`,
    `Servizio: ${service}`,
    `Data: ${date}`,
    `Orario: ${time}`,
    `Note: ${notes || 'nessuna'}`,
    ``,
    `→ Pannello admin: ${ADMIN_URL}`,
  ].join('\n');

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mister Barber <onboarding@resend.dev>',
      to: [emailTo],
      subject: `Nuova prenotazione — ${name} — ${date} ${time}`,
      text: emailBody,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ error: 'Errore invio email' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
