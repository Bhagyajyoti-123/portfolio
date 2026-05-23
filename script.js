/* ============================================================
   NO API KEY NEEDED — 100% FREE — WORKS OFFLINE
   Uses Tesseract.js (OCR) to read certificate text locally
   in your browser. No data is sent anywhere.
============================================================ */

const STORE_KEY = 'bj_portfolio_certs';

let b64       = null;   // base64 image for preview
let imgBlob   = null;   // image blob for OCR
let editI     = null;   // index being edited
let fromUpload = false;

/* ── STORAGE ── */
function load()      { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } }
function save(certs) { localStorage.setItem(STORE_KEY, JSON.stringify(certs)); }

/* ── RENDER CERT CARDS ── */
function render() {
    const certs = load();
    const grid  = document.getElementById('cert-grid');
    const empty = document.getElementById('cert-empty');
    grid.innerHTML = '';
    if (!certs.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    certs.forEach((c, i) => {
        const d = document.createElement('div');
        d.className = 'cert-card';
        d.innerHTML = `
            <div class="cert-card-top">
                <span class="cert-badge">${x(c.category)}</span>
                <div class="cert-acts">
                    <button title="Edit" onclick="openEdit(${i})">✎</button>
                    <button class="del" title="Delete" onclick="del(${i})">✕</button>
                </div>
            </div>
            <h3>${x(c.name)}</h3>
            <p class="issuer">${x(c.issuer)}</p>
            <p class="cdate">${x(c.date)}</p>
            ${c.url ? `<a class="cert-link" href="${x(c.url)}" target="_blank">View Certificate ↗</a>` : ''}
        `;
        grid.appendChild(d);
    });
}

function x(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

/* ── DELETE ── */
function del(i) {
    if (!confirm('Delete this certificate?')) return;
    const c = load(); c.splice(i, 1); save(c); render();
}

/* ── UPLOAD MODAL ── */
function openUpload() {
    editI = null; fromUpload = true;
    resetUpload();
    open_('upload-overlay');
}
function closeUpload() { close_('upload-overlay'); resetUpload(); }

function resetUpload() {
    b64 = null; imgBlob = null;
    document.getElementById('file-input').value            = '';
    document.getElementById('drop-zone').style.display     = 'block';
    document.getElementById('file-preview').style.display  = 'none';
    document.getElementById('ai-bar').style.display        = 'none';
    document.getElementById('upload-err').textContent      = '';
    document.getElementById('analyze-btn').disabled        = true;
    document.getElementById('drop-zone').classList.remove('drag-on');
}

/* ── FILE HANDLING ── */
function onFileSelect(e) { const f = e.target.files[0]; if (f) pick(f); }
function onDragOver(e)   { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-on'); }
function onDragLeave()   { document.getElementById('drop-zone').classList.remove('drag-on'); }
function onDrop(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-on');
    const f = e.dataTransfer.files[0]; if (f) pick(f);
}

function pick(file) {
    const errEl = document.getElementById('upload-err');
    errEl.textContent = '';
    const ok = ['image/jpeg','image/png','image/webp','application/pdf'];
    if (!ok.includes(file.type)) { errEl.textContent = 'Please upload a JPG, PNG, or PDF file.'; return; }
    if (file.size > 20 * 1024 * 1024) { errEl.textContent = 'File too large. Use a file under 20MB.'; return; }

    if (file.type === 'application/pdf') {
        convertPDF(file);
    } else {
        imgBlob = file;
        const r = new FileReader();
        r.onload = ev => {
            b64 = ev.target.result;
            showPreview(b64, file.name);
        };
        r.readAsDataURL(file);
    }
}

/* ── PDF → IMAGE via PDF.js ── */
async function convertPDF(file) {
    showAIBar('Converting PDF...');
    try {
        if (!window.pdfjsLib) {
            await loadJS('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const buf  = await file.arrayBuffer();
        const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const vp   = page.getViewport({ scale: 3.0 }); // high res for better OCR
        const cv   = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        b64 = cv.toDataURL('image/png');
        // Convert dataURL to blob for Tesseract
        const res  = await fetch(b64);
        imgBlob    = await res.blob();
        hideAIBar();
        showPreview(b64, file.name + ' (page 1)');
    } catch (e) {
        hideAIBar();
        document.getElementById('upload-err').textContent = 'Could not read PDF. Try a JPG/PNG screenshot instead.';
    }
}

function loadJS(src) {
    return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
}

function showPreview(dataUrl, name) {
    document.getElementById('drop-zone').style.display    = 'none';
    document.getElementById('file-preview').style.display = 'flex';
    document.getElementById('preview-thumb').src          = dataUrl;
    document.getElementById('preview-name').textContent   = name;
    document.getElementById('analyze-btn').disabled       = false;
}

/* ── OCR WITH TESSERACT.JS (100% FREE, RUNS IN BROWSER) ── */
async function analyze() {
    if (!imgBlob && !b64) return;

    showAIBar('Loading OCR engine (first time takes ~10 seconds)...');
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('upload-err').textContent = '';

    try {
        // Load Tesseract.js from CDN
        if (!window.Tesseract) {
            await loadJS('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        }

        showAIBar('Reading text from certificate...');

        const source = imgBlob || b64;
        const result = await Tesseract.recognize(source, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round((m.progress || 0) * 100);
                    showAIBar(`Reading certificate... ${pct}%`);
                }
            }
        });

        const text = result.data.text;
        if (!text || text.trim().length < 10) {
            throw new Error('Could not read text from image. Make sure the certificate is clear and not blurry.');
        }

        showAIBar('Extracting certificate details...');
        const extracted = parseText(text);
        hideAIBar();
        closeUpload();
        openForm(extracted, false);

    } catch (e) {
        hideAIBar();
        document.getElementById('analyze-btn').disabled = false;
        document.getElementById('upload-err').textContent = '⚠ ' + e.message;
    }
}

/* ── SMART TEXT PARSER ── */
function parseText(raw) {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const text  = raw.toLowerCase();

    // ── NAME: find the longest meaningful line (usually the course title) ──
    // Skip short lines, lines that are just numbers, common header words
    const skipWords = ['certificate','congratulations','this is to certify','certify that','successfully','completed','issued','date','valid','verify','credential','authentication','signature','authorized','director','instructor','linkedin','coursera','udemy','nptel','google','microsoft','amazon','issued by','presented to','awarded to','has successfully','of completion','of achievement'];

    let nameLine = '';
    let nameScore = 0;

    for (const line of lines) {
        const ll = line.toLowerCase();
        const isSkip = skipWords.some(w => ll.includes(w));
        const isDate = /\d{4}|\d{1,2}[\/\-]\d{1,2}/.test(line);
        const isShort = line.length < 8;
        const isCaps = line === line.toUpperCase() && line.length > 4; // ALL CAPS often = title

        // Score: longer non-skip lines score higher
        if (!isSkip && !isDate && !isShort) {
            const score = line.length + (isCaps ? 20 : 0);
            if (score > nameScore) { nameScore = score; nameLine = line; }
        }
    }

    // ── ISSUER: look for known platforms and organizations ──
    const issuers = [
        'coursera','udemy','nptel','linkedin learning','linkedin',
        'google','microsoft','amazon','aws','oracle','ibm',
        'infosys','tcs','wipro','nasscom','simplilearn','edx',
        'pluralsight','codecademy','great learning','upgrad',
        'internshala','skillshare','alison','swayam','spoken tutorial'
    ];
    let issuer = '';
    for (const org of issuers) {
        if (text.includes(org)) {
            // Find the line that contains it (preserve original case)
            const found = lines.find(l => l.toLowerCase().includes(org));
            if (found) { issuer = found.length < 60 ? found : org.charAt(0).toUpperCase() + org.slice(1); break; }
        }
    }

    // ── DATE: find date patterns ──
    const months = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';
    const datePatterns = [
        new RegExp(`(${months})\\s+\\d{4}`, 'i'),          // March 2025
        new RegExp(`\\d{1,2}\\s+(${months})\\s+\\d{4}`, 'i'), // 15 March 2025
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,               // 03/15/2025
        /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,                  // 2025-03-15
        /\d{4}/                                              // just year
    ];
    let date = '';
    for (const pat of datePatterns) {
        const m = raw.match(pat);
        if (m) { date = m[0]; break; }
    }

    // ── CATEGORY: keyword matching ──
    let category = 'Other';
    const catMap = [
        { cat: 'Full-Stack', keys: ['full stack','full-stack','mern','mean','web development','web dev'] },
        { cat: 'Backend',    keys: ['java','spring','spring boot','node','python','django','flask','backend','server','api','rest','database design','sql','mongodb','microservice'] },
        { cat: 'Frontend',   keys: ['html','css','javascript','react','angular','vue','frontend','front-end','ui','ux','bootstrap','tailwind'] },
        { cat: 'Database',   keys: ['mysql','postgresql','mongodb','oracle','database','sql','nosql','dbms'] },
        { cat: 'Cloud',      keys: ['aws','azure','cloud','gcp','google cloud','devops','docker','kubernetes','ci/cd'] },
    ];
    for (const { cat, keys } of catMap) {
        if (keys.some(k => text.includes(k))) { category = cat; break; }
    }

    return {
        name:     nameLine || '',
        issuer:   issuer   || '',
        date:     date     || '',
        category
    };
}

/* ── FORM MODAL — new ── */
function openForm(data, manual) {
    editI = null;
    document.getElementById('form-title').textContent = 'Certificate Details';
    const hint = document.getElementById('form-hint');
    hint.textContent = manual
        ? 'Fill in your certificate details. Fields marked * are required.'
        : '✓ Details extracted from your certificate. Review and fix anything, then save.';
    hint.style.display = 'block';
    document.getElementById('back-btn').style.display = fromUpload ? 'inline-block' : 'none';
    fill(data);
    document.getElementById('form-err').textContent = '';
    open_('form-overlay');
}

/* ── FORM MODAL — edit ── */
function openEdit(i) {
    editI = i; fromUpload = false;
    const c = load()[i]; if (!c) return;
    document.getElementById('form-title').textContent  = 'Edit Certificate';
    document.getElementById('form-hint').style.display = 'none';
    document.getElementById('back-btn').style.display  = 'none';
    fill(c);
    document.getElementById('form-err').textContent = '';
    open_('form-overlay');
}

function fill(d) {
    document.getElementById('f-name').value   = d.name   || '';
    document.getElementById('f-issuer').value = d.issuer || '';
    document.getElementById('f-date').value   = d.date   || '';
    document.getElementById('f-url').value    = d.url    || '';
    const sel = document.getElementById('f-cat');
    const cat = d.category || 'Full-Stack';
    sel.value = [...sel.options].some(o => o.value === cat) ? cat : 'Other';
}

function closeForm() { close_('form-overlay'); editI = null; }
function goBack()    { closeForm(); openUpload(); }

/* ── SAVE ── */
function saveCert() {
    const name   = document.getElementById('f-name').value.trim();
    const issuer = document.getElementById('f-issuer').value.trim();
    const date   = document.getElementById('f-date').value.trim();
    const url    = document.getElementById('f-url').value.trim();
    const cat    = document.getElementById('f-cat').value;
    const errEl  = document.getElementById('form-err');

    if (!name || !issuer || !date) { errEl.textContent = 'Name, Issuer, and Date are required.'; return; }
    if (url && !validURL(url))     { errEl.textContent = 'Enter a valid URL starting with https://'; return; }

    errEl.textContent = '';
    const certs = load();
    const cert  = { name, issuer, date, url, category: cat };
    if (editI !== null) certs[editI] = cert; else certs.push(cert);
    save(certs); render(); closeForm();
}

/* ── HELPERS ── */
function showAIBar(msg) {
    document.getElementById('ai-bar').style.display = 'flex';
    document.getElementById('ai-bar-text').textContent = msg;
}
function hideAIBar() { document.getElementById('ai-bar').style.display = 'none'; }
function open_(id)   { document.getElementById(id).classList.add('open'); }
function close_(id)  { document.getElementById(id).classList.remove('open'); }
function validURL(u) { try { return Boolean(new URL(u)); } catch { return false; } }

document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => {
        if (e.target === o) {
            if (o.id === 'upload-overlay') closeUpload();
            if (o.id === 'form-overlay')   closeForm();
        }
    });
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeUpload(); closeForm(); }
});

document.addEventListener('DOMContentLoaded', render);