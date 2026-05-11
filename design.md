# MISTER BARBER — Design System
**Direction:** Pavement Saint (no crosses)
**Version:** 1.0 — May 2026
**Owners:** George & Berlin

---

## 1. Brand essence

Mister Barber è una barberia di Milano per gente che già sa cosa vuole.
Non è vintage. Non è "old school". È **streetwear adulto**: confidenza,
peso, attitudine — con la disciplina di una maison.

**Mood in tre parole:** loud · sharp · ownable.
**Riferimenti culturali:** Amiri, distressed New Era, Trapstar lookbooks,
fight posters anni '70, copertine Wu-Tang, editoriali di SSENSE.
**Anti-riferimenti:** pali rotanti rossi/blu, font script, "since 1952"
finto, foto di forbici e pettini, pavimenti a scacchi.

**Tono di voce:** corto, deciso, in maiuscolo quando serve colpire.
Mai paternalistico, mai "premium experience". Mai punto esclamativo.
Numeri romani solo per i capitoli (I, II, III, IV).

---

## 2. Color system

Il sistema vive su **4 colori** + 2 neutri funzionali. Niente gradienti.
Niente colori "vicini" (no due grigi, no due blu).

### Core palette

| Token              | Hex        | Uso                                             |
|--------------------|------------|--------------------------------------------------|
| `--asphalt`        | `#0B0B0B`  | Sfondo principale scuro, nav, slab di testo     |
| `--canvas`         | `#E5E1D8`  | Sfondo principale chiaro, testo su asphalt      |
| `--ember`          | `#E85A1F`  | Accent primario — un solo elemento per schermata |
| `--silver`         | `#8E8E8E`  | Metadati, label, testo terziario                 |

### Neutri funzionali

| Token              | Hex        | Uso                                              |
|--------------------|------------|--------------------------------------------------|
| `--asphalt-soft`   | `#1A1A1A`  | Card su sfondo asphalt, hover state              |
| `--canvas-soft`    | `#D6D2C8`  | Divider su canvas, hover state                   |

### Regole d'uso

- **Ember è scarso**: una sola occorrenza per schermata, max due.
  È il prezzo "saint", il CTA del momento, una parola in un titolo.
  Mai un bottone secondario. Mai un bordo. È il fuoco — usato con
  parsimonia, brucia il resto della pagina.
- **Mai bianco puro**. Il bianco è `--canvas`. Punto.
- **Mai nero puro tranne `--asphalt`**. Non `#000`.
- **Ember su asphalt è la combinazione signature** — il blocco arancio
  pieno su nero è autorizzato (slab prezzo, diagonal tag, drop card).
  Mai ember su canvas in blocchi grandi (troppo aggressivo) — solo come
  testo o piccola etichetta.
- Ogni sezione ha uno **sfondo dominante** (asphalt o canvas). Si
  alternano per ritmo.

### Contrast pairs approvate

- canvas su asphalt ✓
- asphalt su canvas ✓
- silver su asphalt (metadati) ✓
- ember su canvas (titoli accent, parola singola) ✓
- ember su asphalt (slab, tag, numero/prezzo, blocco pieno) ✓
- canvas su ember (testo dentro slab arancio) ✓
- silver su canvas ✗ — troppo debole

---

## 3. Typography

Due famiglie. Punto. Nessun corsivo. Nessun script.

### H — Anton

`'Anton', 'Druk Wide', Impact, sans-serif`
Heavy condensed-wide. Solo MAIUSCOLO. Letter-spacing 0.005em.
Per titoli, numeri grandi (prezzi), nomi di sezione, drop labels.

### B — Inter

`'Inter', 'PP Neue Montreal', system-ui, sans-serif`
Pesi: 400 (body), 500 (UI), 600 (emphasis), 700 (CTA inline).
Per tutto il resto.

### Scala (desktop, 1440+)

| Token        | Size    | Line | Weight | Tracking | Famiglia | Uso                        |
|--------------|---------|------|--------|----------|----------|----------------------------|
| `display-xl` | 180px   | 0.84 | Anton  | 0.005em  | Anton    | Hero giganti (homepage)    |
| `display-l`  | 140px   | 0.86 | Anton  | 0.005em  | Anton    | Hero sezione               |
| `display-m`  | 96px    | 0.9  | Anton  | 0.01em   | Anton    | Section header             |
| `display-s`  | 64px    | 0.95 | Anton  | 0.01em   | Anton    | Card title, prezzo grande  |
| `h1`         | 48px    | 1.0  | Anton  | 0.02em   | Anton    | Titoli interni             |
| `h2`         | 32px    | 1.05 | Anton  | 0.04em   | Anton    | Sotto-sezioni              |
| `h3`         | 20px    | 1.2  | 600    | 0       | Inter    | Mini titoli, card label    |
| `body-l`     | 18px    | 1.55 | 400    | -0.005em | Inter    | Lede, paragrafi grandi     |
| `body`       | 15px    | 1.65 | 400    | 0       | Inter    | Paragrafo standard         |
| `body-s`     | 13px    | 1.55 | 400    | 0       | Inter    | Note, captions             |
| `eyebrow`    | 11px    | 1.2  | 500    | 0.22em   | Inter    | TAG SOPRA AI TITOLI        |
| `meta`       | 10px    | 1.2  | 500    | 0.2em    | Inter    | Footer, metadati, navbar   |

### Scala mobile (≤768px)

`display-xl → 92px`, `display-l → 72px`, `display-m → 56px`,
`display-s → 40px`, `h1 → 32px`. Resto invariato.

### Trattamenti tipografici autorizzati

- **Outline display**: `display-xl/l` con `-webkit-text-stroke: 2px`
  e `color: transparent`. Solo su una parola per titolo, mai due righe.
- **Ember word**: una sola parola del titolo in `--ember`. Sostituisce
  l'outline, non si combina.
- **Slab text**: testo bianco dentro un rettangolo asphalt — letter-spacing
  0.04em, mai più di 3 parole.

### Vietato

- Anton in minuscolo
- Anton in body o paragrafi
- Inter in display
- Corsivo
- Sottolineato (mai)
- Tre stili tipografici nella stessa schermata

---

## 4. Grid & spacing

### Grid

12 colonne, gap 24px (desktop) / 16px (tablet) / 8px (mobile).
Margine pagina: 56px desktop / 32px tablet / 20px mobile.
Max width contenuto: 1440px.

### Scala di spacing (4px base)

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192`

### Density rules

- Tra section block: **128px** desktop, 80px mobile.
- Tra titolo e sottotesto: **24px**.
- Tra paragrafi: **16px**.
- Padding nav: **20px verticale, 56px orizzontale**.
- Padding card servizio: **32px**.

---

## 5. Visual devices (sostituti delle croci)

Avendo rimosso le croci, il sistema si fonda su **quattro device**
che danno identità a tutte le sezioni:

### 5.1 Roman chapters
Ogni sezione principale apre con un'eyebrow `CHAPTER · I`, `CHAPTER · II`,
ecc. Numeri romani solo qui. Costanti, mai decorativi.

### 5.2 Diagonal cut
Le immagini possono essere tagliate da una linea diagonale (clip-path)
a 4° o 8°. Una sola diagonale per schermata. Mai su testo.
```css
clip-path: polygon(0 0, 100% 0, 100% 92%, 0 100%);
```

### 5.3 Asphalt slabs
Blocchi neri pieni che contengono testo bianco — usati come "etichette
architettoniche" sopra/sotto le immagini, contenitori di prezzo, card
servizio. Sempre rettangolari, mai arrotondati.

### 5.4 Diagonal tag
Piccola etichetta in `--ember` ruotata di 4°, fissata sopra un'immagine.
Contiene "DROP · 001", "N° 02", "NOW SHOWING". Una per schermata.

### Non usare

- Croci ✗ (rimosse per scelta)
- Stelle, cuori, simboli religiosi ✗
- Pattern decorativi ✗
- Pavé, glitter, oro ✗
- Linee curve ✗
- Bordi arrotondati (mai, eccetto pulsanti pill specifici — vedi sotto)

---

## 6. Iconography

**Default: nessuna icona.** Il sistema vive di tipografia e blocchi pieni.

Eccezioni:
- **Arrow `→`**: testuale, Inter 500. Mai SVG.
- **Bullet `●`**: testuale, per status (`● LIVE`, `● APERTO`).
- **Pipe `|`**: separatore in navbar e meta.

Se serve un'icona di servizio (telefono, indirizzo, orario), usare
**lettere stenografiche** maiuscole Anton (`T`, `A`, `H`) dentro uno slab
20×20px. Mai pittogrammi.

---

## 7. Components

### 7.1 Button — Primary
```
background: --asphalt
color: --canvas
padding: 18px 32px
font: Inter 500, 12px, 0.24em tracking, UPPERCASE
border: none, rectangular
hover: background --ember
active: translateY(1px)
```

### 7.2 Button — Ghost
```
background: transparent
color: --asphalt (su canvas) / --canvas (su asphalt)
border: 1px solid currentColor
padding: 18px 32px
font: stessa primary
hover: background invertito
```

### 7.3 Button — Accent
Solo per il CTA primario di pagina. Identico a primary ma
`background: --ember`, testo `--asphalt` (non canvas — il contrasto
ember/asphalt è quello che funziona). **Massimo uno per pagina**.

### 7.4 Service card
- Rettangolare, 1px border `--asphalt` su sfondo canvas (o viceversa)
- Header: nome servizio in `display-s` Anton MAIUSCOLO
- Subheader: durata in `meta` con `silver`
- Body: descrizione 2-3 righe in `body`
- Footer: prezzo in `display-s` Anton, allineato a destra. Il prezzo
  della card "saint" (una sola nella griglia) è in `--ember`.
- Hover: fill completo invertito (canvas→asphalt o asphalt→canvas)
- **No icone, no immagini dentro la card**

### 7.5 Slab caption
Rettangolo asphalt, padding 24px 32px, contiene 2 colonne:
- Sinistra: micro-label `meta` color silver + numero/prezzo `display-s`
- Destra: stesso pattern, con il prezzo eventualmente in `--ember`
Posizione: sovrapposto al bordo inferiore di un'immagine.

### 7.6 Diagonal tag
Etichetta 6×14px padding, background `--ember`, testo `--asphalt`,
Anton 12px, ruotata 4° con `transform: rotate(4deg)`.
Posizione assoluta sopra un'immagine, top-right o bottom-left.

### 7.7 Navbar
- Background `--asphalt`, altezza 72px, padding 20px 56px
- Logo a sinistra: `MISTER BARBER` in Anton 26px, letter-spacing 0.06em
- Link al centro o destra: Inter 500, 12px, 0.2em tracking, MAIUSCOLO
- Booking button: ghost canvas su asphalt, all'estrema destra
- **Sticky** dopo 80px di scroll
- Mai con dropdown — solo link diretti

### 7.8 Meta strip
Sottile striscia sotto la navbar o sopra il footer. Background nullo,
border-top 1px asphalt. Padding 24px 56px. Contiene 4-5 tag spaziati con
`gap: 80px`, in `meta` color silver. Es: `I · FADES   II · BEARD ...`

### 7.9 Form input
- Background `--canvas` (su asphalt) o `--asphalt-soft` (su canvas)
- 1px border, no border-radius
- Padding 16px 20px
- Font Inter 400, 15px
- Label sopra in `eyebrow`, mai placeholder come label
- Focus: border `--ember`

### 7.10 Image frame
- Sempre rettangolare
- Mai border-radius (eccetto avatar barber: 0 — quadrato puro)
- Diagonale opzionale tramite clip-path (vedi 5.2)
- Filtri: `contrast(1.05)` standard, niente di più
- Mai shadow (eccezione: hero photo, vedi sotto)

### 7.11 Hero photo treatment
Sull'immagine hero principale è autorizzato:
- Sfondo asphalt dietro
- Overlay top-left "CHAPTER · I" in `eyebrow` color silver
- Slab caption sovrapposto al bordo basso
- Diagonal tag in alto a destra

---

## 8. Layout patterns

### 8.1 Asymmetric split (default hero)
50/50 ma con tensione: testo a sinistra con padding generoso, immagine
a destra full-bleed fino al margine pagina. Il titolo "sfonda" verticalmente
con `display-xl` su 3 righe.

### 8.2 Stacked slabs
Tre o più sezioni full-width, alternando background asphalt/canvas/asphalt.
Ogni slab ha eyebrow CHAPTER + titolo display-m + corpo + CTA.

### 8.3 Service grid
3 colonne desktop, 1 colonna mobile. Service card 7.4. Hover invertito.
Gap: 0 (le card si toccano e condividono i bordi).

### 8.4 Editorial duo
Due immagini affiancate (50/50), una più alta una più bassa. Slab
caption sovrapposto a una sola delle due. Usata per "Meet the barbers".

### 8.5 Full-bleed photo
Una sola immagine larga tutto lo schermo, 70vh, con titolo display-l
sovrapposto in basso a sinistra, color canvas. Usata per page intro.

---

## 9. Imagery direction

### Fotografia
- **Contrasto alto**, ombre profonde, niente HDR
- Soggetti: **mani che lavorano**, dettagli (rasoio, capelli che cadono,
  collo della camicia), volti seri di sbieco, **mai sorrisi forzati**
- Palette nel frame: dominanti scuri, un tocco di blu o pelle calda
- Backdrop: muri scrostati, vetri, asphalt bagnato, mai studio bianco

### Product photography
- Floating, illuminazione da un lato, sfondo gradiente caldo-nero o
  canvas piatto
- Ombra dura sotto, mai morbida
- Si possono usare le immagini fornite (cap distressed, clipper Wahl,
  trucker, cross necklace **solo come oggetto, non come simbolo**)

### Character illustrations
Le illustrazioni dei personaggi (immagini caricate, stile cartoon
con cappello e barba) si usano **solo nella sezione "I Barbieri"**,
come ritratti firmati. Mai come icone UI.

---

## 10. Copywriting voice

### Regole
- Frasi corte. Punto. Punto.
- Verbi attivi, mai gerundi promozionali ("offrendo", "garantendo").
- Numeri come parole solo sotto 10, mai per prezzi.
- Tempo: minuti, non "ore". `45'` non "45 minuti", nel display.
- Mai "esperienza", "viaggio", "passione", "team".

### Esempi

| ✗ Non così                                | ✓ Così                              |
|--------------------------------------------|-------------------------------------|
| "Un'esperienza di taglio premium"          | "Tagli. Punto."                     |
| "Scopri il nostro team di esperti barbieri"| "Due barbieri. George. Berlin."     |
| "Prenota la tua sessione adesso!"          | "Prenota — 45'"                     |
| "Da oltre 50 anni di tradizione"           | "Aperto dal 2026"                   |
| "I migliori prodotti per la tua barba"     | "Olio. Cera. Tonico. Basta."        |

### Sezioni-headline approvate

- `SHARP LIKE SAINTS.`
- `DUE SEDIE. UN TAGLIO.`
- `NON SI ENTRA SENZA APPUNTAMENTO.`
- `IL FADE NON SI IMPROVVISA.`
- `MILANO · BRERA · 2026`

---

## 11. Section blueprint (pagine da costruire)

Sezioni che compongono il sito (in ordine):

1. **HERO** — display-xl titolo + immagine cap/clipper + slab prezzi
2. **CHAPTER I · IL TAGLIO** — descrittivo, full-bleed photo + lede
3. **SERVIZI** — service grid (Cut, Fade, Beard, Razor, Full)
4. **CHAPTER II · I BARBIERI** — editorial duo (George + Berlin)
5. **CHAPTER III · IL POSTO** — galleria 2-3 immagini, indirizzo, ore
6. **CHAPTER IV · DROP** — sezione collezione cap/merch, ottica streetwear
7. **PRENOTA** — form essenziale, 4 campi, button accent
8. **FOOTER** — asphalt full-width, logo grande, social testuali,
   indirizzo, P.IVA, copyright

---

## 12. Tokens (CSS variables)

```css
:root {
  /* color */
  --asphalt: #0B0B0B;
  --asphalt-soft: #1A1A1A;
  --canvas: #E5E1D8;
  --canvas-soft: #D6D2C8;
  --ember: #E85A1F;
  --ember-glow: radial-gradient(ellipse at center, #FF7A3C 0%, #C4421A 60%, #0B0B0B 100%);
  --silver: #8E8E8E;

  /* type */
  --font-display: 'Anton', 'Druk Wide', Impact, sans-serif;
  --font-body: 'Inter', 'PP Neue Montreal', system-ui, sans-serif;

  /* spacing */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;
  --s-9: 96px; --s-10: 128px; --s-11: 192px;

  /* layout */
  --page-margin: 56px;
  --max-width: 1440px;
  --nav-height: 72px;

  /* type sizes (desktop) */
  --display-xl: 180px;
  --display-l: 140px;
  --display-m: 96px;
  --display-s: 64px;
  --h1: 48px; --h2: 32px; --h3: 20px;
  --body-l: 18px; --body: 15px; --body-s: 13px;
  --eyebrow: 11px; --meta: 10px;
}

@media (max-width: 768px) {
  :root {
    --page-margin: 20px;
    --display-xl: 92px;
    --display-l: 72px;
    --display-m: 56px;
    --display-s: 40px;
    --h1: 32px;
  }
}
```

---

## 13. Non-negotiables

1. **Niente croci.** Rimosse dal sistema.
2. **Un solo Ember per schermata.** È il fuoco — non spegnerlo annacquandolo.
3. **Anton solo MAIUSCOLO.**
4. **Mai border-radius oltre 0px** (eccetto stato debug).
5. **Mai bianco puro, mai nero puro.**
6. **Mai più di 2 famiglie tipografiche.**
7. **Mai emoji.**
8. **Mai shadow su elementi UI** (solo eventualmente su hero photo).
9. **Una sola immagine "saint" per pagina** — la diagonal tag in
   Ember è scarsa.
10. **Roman numerals solo nei CHAPTER**, mai altrove.

---

## 14. Build order

Quando costruirai le sezioni, l'ordine consigliato è:

1. **Tokens + base styles** (`base.css`)
2. **Navbar + Footer** (chrome globale)
3. **Hero** (è il manifesto — fissalo prima del resto)
4. **Service grid** (verifica la card)
5. **CHAPTER intros** (testa il ritmo asphalt/canvas)
6. **Editorial duo** (Meet the barbers)
7. **Booking form**
8. **Drop section** (ultima — è il più "rischioso", il sistema deve già
   reggere prima)

---

*Fine documento. Quando vuoi partire con la prima sezione, dimmi quale
e la costruisco rispettando questo file.*
