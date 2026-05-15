# Setup — Booking System

Il codice è completo. Servono 5 passi manuali da fare una sola volta.

---

## Step 1 — Crea account Supabase (5 min)

1. Vai su https://supabase.com → Sign Up (gratis)
2. New Project → nome: `mister-barber`, regione: West EU
3. Aspetta che il progetto sia pronto (~2 min)
4. Vai su **Settings → API** e copia:
   - **Project URL** (es. `https://abcdefgh.supabase.co`)
   - **anon public** key (stringa lunga `eyJ...`)

---

## Step 2 — Esegui lo schema DB

1. Supabase Dashboard → **SQL Editor → New Query**
2. Incolla il contenuto di `supabase/schema.sql`
3. Clicca **Run**
4. Verifica: Table Editor → tabella `appointments` esiste ✓

---

## Step 3 — Crea bucket Storage

1. Dashboard → **Storage → New Bucket**
   - Nome: `bookings`
   - Public: NO
   - Crea

2. Storage → **Policies → bookings → New Policy → For full customization**:
   ```sql
   create policy "anon_upload"
     on storage.objects for insert
     to anon
     with check (bucket_id = 'bookings');
   ```

---

## Step 4 — Crea account Resend (3 min)

1. Vai su https://resend.com → Sign Up (gratis)
2. Dashboard → **API Keys → Create API Key**
3. Copia la chiave (es. `re_xxxxxxxxxxxx`)

---

## Step 5 — Aggiorna config.js

Apri `assets/js/config.js` e sostituisci i placeholder con i valori reali:

```javascript
window.MB_CONFIG = {
  SUPABASE_URL:  'https://TUOREF.supabase.co',    // ← Step 1
  SUPABASE_KEY:  'eyJ...',                          // ← Step 1
  EDGE_FN_URL:   'https://TUOREF.supabase.co/functions/v1/send-notification'
};
```

---

## Step 6 — Deploy Edge Function

Nel terminale, dalla cartella del progetto:

```bash
npx supabase login
npx supabase link --project-ref TUOREF
npx supabase secrets set RESEND_API_KEY=re_TUACHIAVE
npx supabase secrets set ADMIN_URL=https://TUODOMINIO.pages.dev/admin-mb26.html
npx supabase functions deploy send-notification --no-verify-jwt
```

Il `TUOREF` è il Reference ID del progetto: Supabase Dashboard → Settings → General.

---

## Step 7 — Crea utenti admin

1. Supabase Dashboard → **Authentication → Users → Add User**
2. Crea:
   - Email: `georgevelozperez5@gmail.com` — password temporanea a tua scelta
   - Email: `superberlin0204@gmail.com` — password temporanea a tua scelta
3. Comunica le password temporanee a George e Berlin
4. Al primo accesso su `admin-mb26.html` possono cambiarla con "Hai dimenticato la password?"

---

## Step 8 — Push e deploy

```bash
git push origin master
```

Cloudflare Pages fa il deploy automaticamente.

---

## URL Admin

Il pannello admin è su: `https://TUODOMINIO.pages.dev/admin-mb26.html`

L'URL non è linkato da nessuna parte del sito — solo George e Berlin lo conoscono.
