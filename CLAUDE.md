# George Website

## Cos'è
Sito web per il cliente George. Build da zero partendo dalle immagini di riferimento nella cartella.

## Immagini di riferimento
- `WhatsApp Image 2026-04-03 at 17.20.42.jpeg` (e varianti 1, 2, 3) — screenshot visual reference
- `cap.avif` / `cap.png` — mockup o screenshot aggiuntivi

## Stack
- HTML5 + CSS3 + JavaScript vanilla (no build tool, deploy statico)
- Tailwind CSS via CDN
- Cloudflare Pages per deploy

## Struttura target
```
george-website/
├── index.html          — homepage
├── assets/
│   ├── css/style.css   — stili custom
│   └── img/            — immagini ottimizzate
├── CLAUDE.md
├── BACKLOG.md
└── AGENT-LOG.md
```

---

## Istruzioni per agenti autonomi

Quando sei un agente che lavora su george-website in modo autonomo:

### Loop standard

1. Leggi `BACKLOG.md` — prendi il **primo task non completato** in ordine di priorità
2. Guarda le immagini di riferimento (jpeg/avif) nella root per capire il design target
3. Implementa il task
4. Controlla che l'HTML sia valido e non ci siano errori di sintassi
5. Committa con messaggio descrittivo in italiano
6. Aggiorna `BACKLOG.md` e `AGENT-LOG.md`
7. Push

### Regole
- Pixel-perfect rispetto alle immagini di riferimento
- Mobile-first: ogni componente deve funzionare su 375px
- No dipendenze npm — solo CDN o vanilla JS
- Se non riesci a interpretare chiaramente un'immagine di riferimento: scrivi in AGENT-LOG.md `Stato: bloccato` con descrizione, non inventare
