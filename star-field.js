(() => {
  const mulberry = (a) => () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  class StarField extends HTMLElement {
    connectedCallback() {
      if (this.canvas) return;
      this.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
      this.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.spin = parseFloat(this.getAttribute('spin') || '0.05');
      this.density = parseFloat(this.getAttribute('density') || '1');
      this.seed = parseInt(this.getAttribute('seed') || '7', 10);
      this.layer = this.getAttribute('layer') || 'back';
      this.propSrcs = (this.getAttribute('props') || '').split(',').map(s => s.trim()).filter(Boolean);
      this.propImgs = this.propSrcs.map(src => { const im = new Image(); im.src = src; return im; });
      this.ink = this.getAttribute('ink') || '212,208,202';
      if (this.parentElement) this.parentElement.style.pointerEvents = 'none';
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this);
      this.resize();
      this.t0 = performance.now();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pr = this.parentElement && this.parentElement.getBoundingClientRect();
      const w = this.clientWidth || (pr && pr.width) || window.innerWidth;
      const h = this.clientHeight || (pr && pr.height) || window.innerHeight;
      if (!w || !h) return;
      this.w = w; this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.build();
    }

    build() {
      const { w, h } = this;
      const rnd = mulberry(this.seed);
      const maxR = Math.hypot(w, h) * 0.7;
      this.f = maxR * 1.25;
      const n = Math.round((w * h) / 4200 * this.density);
      this.objects = this.propImgs.map((img, i) => ({
        img,
        a: (i / Math.max(1, this.propImgs.length)) * Math.PI * 2 + rnd() * 0.5,
        r: (0.5 + rnd() * 0.55) * maxR,
        y0: (rnd() - 0.5) * h * 0.9,
        size: (0.10 + rnd() * 0.07) * Math.min(w, h) * 2.1,
        sp: 0.9 + rnd() * 0.25,
        rot: rnd() * Math.PI * 2,
        rotS: (rnd() - 0.5) * 0.14,
        bob: rnd() * Math.PI * 2,
        bobS: 0.18 + rnd() * 0.2,
        tiltS: 0.11 + rnd() * 0.12
      }));
      this.stars = Array.from({ length: n }, () => {
        const big = rnd() < 0.06;
        return {
          a: rnd() * Math.PI * 2,
          r: (0.22 + rnd() * 1.05) * maxR,
          y0: (rnd() - 0.5) * h * 1.35,
          s: big ? 3.4 + rnd() * 3.2 : 0.9 + rnd() * 1.7,
          base: big ? 0.16 + rnd() * 0.14 : 0.3 + rnd() * 0.6,
          tw: rnd() * Math.PI * 2,
          tws: 0.3 + rnd() * 1,
          sq: rnd() < 0.75,
          sp: 0.82 + rnd() * 0.4
        };
      });
    }

    loop(now) {
      const ctx = this.ctx;
      const { w, h, f } = this;
      if (!w || !h) { this.raf = requestAnimationFrame(this.loop); return; }
      const t = (now - this.t0) / 1000;
      const front = this.layer === 'front';
      const cx = w / 2, cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(' + this.ink + ')';

      for (const st of this.stars) {
        const ang = st.a + t * this.spin * st.sp;
        const z = Math.sin(ang) * st.r;
        if (front ? z <= 0 : z > 0) continue;
        if (z > f * 0.94) continue;
        const p = f / (f - z);
        if (p > 4.6) continue;
        const x = cx + Math.cos(ang) * st.r * p;
        const y = cy + st.y0 * 0.5 * p + z * 0.12;
        const sz = st.s * p;
        if (x < -sz - 8 || x > w + sz + 8 || y < -sz - 8 || y > h + sz + 8) continue;
        const tw = 0.72 + 0.28 * Math.sin(st.tw + t * st.tws);
        const near = Math.min(1, Math.max(0, (p - 3.1) / 1.5));
        ctx.globalAlpha = Math.min(1, st.base * tw * (1 - near * 0.7));
        if (st.sq) ctx.fillRect(x, y, sz, sz);
        else { ctx.beginPath(); ctx.arc(x, y, sz * 0.5, 0, Math.PI * 2); ctx.fill(); }
      }
      for (const ob of (front ? [] : (this.objects || []))) {
        if (!ob.img.complete || !ob.img.naturalWidth) continue;
        const ang = ob.a + t * this.spin * ob.sp;
        const z = Math.sin(ang) * ob.r;
        const p = f / (f - z);
        if (p > 1.34) continue;
        const x = cx + Math.cos(ang) * ob.r * p;
        const y = cy + ob.y0 * 0.5 * p + z * 0.12 + Math.sin(ob.bob + t * ob.bobS) * 14 * p;
        const wd = ob.size * p * 0.5;
        const ht = wd * (ob.img.naturalHeight / ob.img.naturalWidth);
        if (x < -wd || x > w + wd || y < -ht || y > h + ht) continue;
        const sm = (e0, e1, v) => { const u = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
        const alpha = 0.62 * sm(0.52, 0.78, p) * (1 - sm(1.06, 1.34, p));
        if (alpha < 0.012) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(ob.rot + t * ob.rotS);
        const sq = 1 + 0.06 * Math.sin(ob.bob + t * ob.tiltS);
        ctx.transform(1, 0.05 * Math.sin(ob.bob * 1.7 + t * ob.tiltS), 0, sq, 0, 0);
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur = 26 * p;
        ctx.shadowOffsetY = 10 * p;
        ctx.drawImage(ob.img, -wd / 2, -ht / 2, wd, ht);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  if (!customElements.get('star-field')) customElements.define('star-field', StarField);
})();
