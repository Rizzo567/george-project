// I video con le richieste Range (206), che Pages da solo non fa.
//
// Safari su iPhone chiede SEMPRE `Range: bytes=0-…` come prima richiesta di un
// <video>: se l'host risponde 200 col file intero, rinuncia e non riproduce
// niente. Gli asset statici di Pages rispondono 200 e senza `Accept-Ranges`
// (misurato il 08/09/2026 su george-project.pages.dev), quindi sul telefono i
// video restavano neri. Questa funzione prende il file dagli asset e serve la
// fetta chiesta con lo stato giusto.
//
// I file sono piccoli (≤4 MB, ricodificati con +faststart): leggerli in memoria
// per affettarli sta comodamente dentro i limiti di un Worker.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const asset = await env.ASSETS.fetch(new Request(url.toString(), {
    // niente compressione: serve la lunghezza vera in byte per il Content-Range
    headers: { 'accept-encoding': 'identity' },
  }));
  if (!asset.ok) return asset;

  const body = await asset.arrayBuffer();
  const total = body.byteLength;
  const type = asset.headers.get('content-type') || 'video/mp4';
  const headers = new Headers({
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });

  const range = request.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!m) {
    headers.set('content-length', String(total));
    return new Response(body, { status: 200, headers });
  }

  // `bytes=-500` = gli ultimi 500 byte; `bytes=100-` = da 100 alla fine.
  let start, end;
  if (m[1] === '') {
    const suffix = parseInt(m[2], 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return unsatisfiable(total, headers);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return unsatisfiable(total, headers);
  }
  end = Math.min(end, total - 1);

  headers.set('content-range', `bytes ${start}-${end}/${total}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

function unsatisfiable(total, headers) {
  headers.set('content-range', `bytes */${total}`);
  return new Response(null, { status: 416, headers });
}
