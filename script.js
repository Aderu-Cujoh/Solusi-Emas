/* script.js
   Handles: lazy video load, price fetch & update, calculator logic, lightbox, resilience & accessibility.
*/

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- Config ---------- */
const PRICE_URL = 'data.json'; // swap to /api/gold for dynamic API
const PRICE_UPDATE_MS = 3 * 60 * 1000; // 3 minutes

/* ---------- Video lazy loader for desktop ---------- */
function initHeroVideo(){
  const prefersReduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const videoEl = document.querySelector('.hero-video');
  if(!videoEl) return;
  // only load video on non-mobile and if motion allowed
  if(!isMobile && !prefersReduced){
    // set sources dynamically to allow fast LCP
    const srcWebm = 'assets/hero-video.webm';
    const srcMp4 = 'assets/hero-video.mp4';
    const s1 = document.createElement('source'); s1.type='video/webm'; s1.src = srcWebm;
    const s2 = document.createElement('source'); s2.type='video/mp4'; s2.src = srcMp4;
    videoEl.appendChild(s1); videoEl.appendChild(s2);
    videoEl.setAttribute('preload','auto');
    // try play (muted required for autoplay)
    videoEl.play().catch(()=>{/* autoplay may be blocked */});
  } else {
    // ensure poster visible; hide video element to avoid network
    videoEl.style.display = 'none';
    document.querySelector('.hero').style.backgroundImage = 'linear-gradient(180deg, rgba(4,12,22,0.5), rgba(4,12,22,0.6)), url(assets/hero-poster.jpg)';
    document.querySelector('.hero').style.backgroundSize = 'cover';
  }
}

/* ---------- Price fetching & ticker ---------- */
async function fetchPrice(retry=0){
  try {
    const res = await fetch(PRICE_URL, {cache: 'no-cache'});
    if(!res.ok) throw new Error('Network response not ok');
    const data = await res.json();
    updatePriceUI(data.pricePerGram);
    return data;
  } catch (err) {
    console.warn('fetchPrice failed', err);
    // retry a few times
    if(retry < 2){
      setTimeout(()=> fetchPrice(retry+1), 1000 * (retry+1));
    } else {
      // fallback: show static message
      document.getElementById('gold-price').textContent = 'Tidak dapat memuat harga. Coba lagi.';
    }
  }
}

function updatePriceUI(price){
  const el = document.getElementById('gold-price');
  if(!el) return;
  el.textContent = `Rp ${Number(price).toLocaleString('id-ID')}`;
}

/* Auto-update */
let priceInterval;
function startPriceAutoUpdate(){
  fetchPrice();
  priceInterval = setInterval(()=> fetchPrice(), PRICE_UPDATE_MS);
}

/* ---------- Calculator ---------- */
/* Formula:
   result = weight (g) * pricePerGram * (karat/24) * conditionFactor * (1 - feePercent/100)
*/
async function handleCalcSubmit(e){
  e.preventDefault();
  const weight = parseFloat(document.getElementById('weight').value || 0);
  const karat = Number(document.getElementById('karat').value);
  const condition = document.getElementById('condition').value;
  const feeInput = parseFloat(document.getElementById('fee').value || 0);

  if(!weight || weight <= 0) {
    return showCalcResult({ error: 'Masukkan berat yang valid (lebih dari 0).' });
  }

  // get price from data.json (fallback if API fails)
  const data = await fetchPrice() || { pricePerGram: 0 };
  const pricePerGram = Number(data.pricePerGram || 0);

  const karatFactor = karat / 24;
  const conditionFactor = condition === 'rusak' ? 0.95 : 1;
  const feeFactor = (feeInput && feeInput > 0) ? (1 - feeInput/100) : 1;

  const gross = weight * pricePerGram * karatFactor;
  const net = gross * conditionFactor * feeFactor;

  showCalcResult({
    weight, karat, condition, feeInput,
    pricePerGram, gross, net
  });
}

function showCalcResult(result){
  const container = document.getElementById('calc-result');
  if(result.error){
    container.innerHTML = `<div class="error" style="color:#b91c1c">${result.error}</div>`;
    container.focus();
    return;
  }
  container.innerHTML = `
    <div>
      <h3>Estimasi Harga</h3>
      <p>Harga dasar: <strong>Rp ${Number(result.pricePerGram).toLocaleString('id-ID')} /gram</strong></p>
      <p>Berat: <strong>${result.weight} g</strong> • Karat: <strong>${result.karat}K</strong> • Kondisi: <strong>${result.condition}</strong></p>
      <p>Gross: <strong>Rp ${Math.round(result.gross).toLocaleString('id-ID')}</strong></p>
      <p>Setelah potongan & fee: <strong>Rp ${Math.round(result.net).toLocaleString('id-ID')}</strong></p>
      <div style="margin-top:10px;">
        <a class="btn btn-primary" href="https://wa.me/6281234567890?text=Halo%20Solusi%20Emas%20saya%20mau%20tanya%20estimasi%20harga%20${result.weight}g" target="_blank">Hubungi via WA</a>
        <button id="calc-download" class="btn btn-ghost" style="margin-left:8px">Simpan Rincian</button>
      </div>
    </div>
  `;
  // allow keyboard focus
  container.querySelector('a,button')?.focus();
  // optional: allow save (download) of result
  const dl = document.getElementById('calc-download');
  if(dl) dl.addEventListener('click', ()=> {
    const payload = {
      created: new Date().toISOString(),
      pricePerGram: result.pricePerGram,
      weight: result.weight,
      karat: result.karat,
      condition: result.condition,
      gross: Math.round(result.gross),
      net: Math.round(result.net)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `estimasi-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  });
}

/* ---------- Gallery lightbox ---------- */
function initGallery(){
  const items = $$('.gallery-item');
  const lb = $('#lightbox');
  items.forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const src = btn.dataset.src;
      if(!src) return;
      lb.innerHTML = `<img src="${src}" alt="Galeri">`;
      lb.style.display = 'flex'; lb.removeAttribute('aria-hidden');
      // close on click outside or ESC
      function close(){ lb.style.display='none'; lb.setAttribute('aria-hidden','true'); document.removeEventListener('keydown', onEsc); lb.removeEventListener('click', onClick); }
      function onEsc(ev){ if(ev.key==='Escape') close(); }
      function onClick(ev){ if(ev.target === lb) close(); }
      document.addEventListener('keydown', onEsc); lb.addEventListener('click', onClick);
    });
  });
}

/* ---------- Simulate Gadai (example modal flow) ---------- */
function initSimulate(){
  const btn = $('#simulate');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    // For MVP: open WA with prefilled message to start gadai flow
    const weight = document.getElementById('weight').value || '—';
    const karat = document.getElementById('karat').value || '—';
    const msg = encodeURIComponent(`Halo Solusi Emas, saya ingin simulasi gadai: Berat ${weight} g, Karat ${karat}K. Mohon bantuannya.`);
    window.open(`https://wa.me/6281234567890?text=${msg}`, '_blank');
  });
}

/* ---------- On DOM ready ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initHeroVideo();
  startPriceAutoUpdate();
  initGallery();
  initSimulate();

  // Attach calc submit
  const form = document.getElementById('calc-form');
  if(form) form.addEventListener('submit', handleCalcSubmit);

  // lazy-load gallery images (very simple)
  $$('img[data-src]').forEach(img=>{
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  });
});
