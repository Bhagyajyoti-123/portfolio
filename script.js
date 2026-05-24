/* ============================================================
   FIREBASE CONFIG — certificates saved to cloud
   Visible on every device, everywhere
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBsPBXkfZ6-06r-V3Q0TVKelCxcuwPCY6E",
    authDomain: "bhagyajyoti-portfolio.firebaseapp.com",
    projectId: "bhagyajyoti-portfolio",
    storageBucket: "bhagyajyoti-portfolio.firebasestorage.app",
    messagingSenderId: "982860168007",
    appId: "1:982860168007:web:2fbc6ea8b85396bbea2a62"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const COL = collection(db, 'certificates');

/* ============================================================
   DO NOT EDIT BELOW THIS LINE
============================================================ */
let editId     = null;   // Firestore doc id being edited
let fromUpload = false;
let b64        = null;
let imgBlob    = null;

/* ── RENDER CERT CARDS ── */
async function render() {
    const grid  = document.getElementById('cert-grid');
    const empty = document.getElementById('cert-empty');
    grid.innerHTML = '<p style="color:#888;font-size:.9rem;padding:10px">Loading...</p>';

    try {
        const snap  = await getDocs(COL);
        const certs = [];
        snap.forEach(d => certs.push({ id: d.id, ...d.data() }));

        grid.innerHTML = '';
        if (!certs.length) { empty.style.display = 'block'; return; }
        empty.style.display = 'none';

        certs.forEach(c => {
            const card = document.createElement('div');
            card.className = 'cert-card';
            card.innerHTML = `
                <div class="cert-card-top">
                    <span class="cert-badge">${x(c.category)}</span>
                    <div class="cert-acts">
                        <button title="Edit" onclick="openEdit('${c.id}')">✎</button>
                        <button class="del" title="Delete" onclick="del('${c.id}')">✕</button>
                    </div>
                </div>
                <h3>${x(c.name)}</h3>
                <p class="issuer">${x(c.issuer)}</p>
                <p class="cdate">${x(c.date)}</p>
                ${c.url ? `<a class="cert-link" href="${x(c.url)}" target="_blank">View Certificate ↗</a>` : ''}
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        grid.innerHTML = '';
        document.getElementById('cert-empty').style.display = 'block';
        console.error('Firebase error:', e);
    }
}

function x(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

/* ── DELETE ── */
async function del(id) {
    if (!confirm('Delete this certificate?')) return;
    try {
        await deleteDoc(doc(db, 'certificates', id));
        render();
    } catch(e) { alert('Error deleting. Try again.'); }
}

/* ── UPLOAD MODAL ── */
function openUpload() {
    editId = null; fromUpload = true;
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
    if (file.type === 'application/pdf') { convertPDF(file); }
    else {
        imgBlob = file;
        const r = new FileReader();
        r.onload = ev => { b64 = ev.target.result; showPreview(b64, file.name); };
        r.readAsDataURL(file);
    }
}

/* ── PDF → IMAGE ── */
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
        const vp   = page.getViewport({ scale: 3.0 });
        const cv   = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        b64     = cv.toDataURL('image/png');
        const r = await fetch(b64);
        imgBlob = await r.blob();
        hideAIBar();
        showPreview(b64, file.name + ' (page 1)');
    } catch (e) {
        hideAIBar();
        document.getElementById('upload-err').textContent = 'Could not read PDF. Try a JPG/PNG instead.';
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

/* ── OCR WITH TESSERACT.JS ── */
async function analyze() {
    if (!imgBlob && !b64) return;
    showAIBar('Loading OCR engine (first time ~10 seconds)...');
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('upload-err').textContent = '';
    try {
        if (!window.Tesseract) {
            await loadJS('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        }
        showAIBar('Reading text from certificate...');
        const source = imgBlob || b64;
        const result = await Tesseract.recognize(source, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    showAIBar(`Reading certificate... ${Math.round((m.progress||0)*100)}%`);
                }
            }
        });
        const text = result.data.text;
        if (!text || text.trim().length < 10) throw new Error('Could not read text. Make sure the image is clear and not blurry.');
        showAIBar('Extracting details...');
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

/* ── TEXT PARSER ── */
function parseText(raw) {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const text  = raw.toLowerCase();
    const skip  = ['certificate','congratulations','this is to certify','certify that','successfully','completed','issued','date','valid','verify','credential','signature','authorized','director','instructor','linkedin','coursera','udemy','nptel','google','microsoft','amazon','presented to','awarded to','has successfully','of completion','of achievement'];
    let nameLine = '', nameScore = 0;
    for (const line of lines) {
        const ll = line.toLowerCase();
        if (skip.some(w => ll.includes(w))) continue;
        if (/\d{4}|\d{1,2}[\/\-]\d{1,2}/.test(line)) continue;
        if (line.length < 8) continue;
        const score = line.length + (line === line.toUpperCase() && line.length > 4 ? 20 : 0);
        if (score > nameScore) { nameScore = score; nameLine = line; }
    }
    const issuers = ['coursera','udemy','nptel','linkedin learning','google','microsoft','amazon','aws','oracle','ibm','infosys','tcs','wipro','nasscom','simplilearn','edx','pluralsight','great learning','upgrad','internshala','swayam'];
    let issuer = '';
    for (const org of issuers) {
        if (text.includes(org)) {
            const found = lines.find(l => l.toLowerCase().includes(org));
            issuer = found && found.length < 60 ? found : org.charAt(0).toUpperCase() + org.slice(1);
            break;
        }
    }
    const months = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';
    const datePatterns = [new RegExp(`(${months})\\s+\\d{4}`,'i'), new RegExp(`\\d{1,2}\\s+(${months})\\s+\\d{4}`,'i'), /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, /\d{4}/];
    let date = '';
    for (const p of datePatterns) { const m = raw.match(p); if (m) { date = m[0]; break; } }
    let category = 'Other';
    const catMap = [
        { cat:'Full-Stack', keys:['full stack','full-stack','mern','mean','web development'] },
        { cat:'Backend',    keys:['java','spring','node','python','django','backend','api','rest','microservice'] },
        { cat:'Frontend',   keys:['html','css','javascript','react','angular','vue','frontend','ui','ux'] },
        { cat:'Database',   keys:['mysql','postgresql','mongodb','oracle','database','sql','nosql','dbms'] },
        { cat:'Cloud',      keys:['aws','azure','cloud','gcp','devops','docker','kubernetes'] },
    ];
    for (const { cat, keys } of catMap) { if (keys.some(k => text.includes(k))) { category = cat; break; } }
    return { name: nameLine || '', issuer: issuer || '', date: date || '', category };
}

/* ── FORM MODAL — new ── */
function openForm(data, manual) {
    editId = null;
    document.getElementById('form-title').textContent = 'Certificate Details';
    const hint = document.getElementById('form-hint');
    hint.textContent = manual
        ? 'Fill in your certificate details. Fields marked * are required.'
        : '✓ Details extracted. Review and fix anything, then save.';
    hint.style.display = 'block';
    document.getElementById('back-btn').style.display = fromUpload ? 'inline-block' : 'none';
    fill(data);
    document.getElementById('form-err').textContent = '';
    open_('form-overlay');
}

/* ── FORM MODAL — edit ── */
async function openEdit(id) {
    editId = id; fromUpload = false;
    try {
        const snap = await getDocs(COL);
        let certData = null;
        snap.forEach(d => { if (d.id === id) certData = d.data(); });
        if (!certData) return;
        document.getElementById('form-title').textContent  = 'Edit Certificate';
        document.getElementById('form-hint').style.display = 'none';
        document.getElementById('back-btn').style.display  = 'none';
        fill(certData);
        document.getElementById('form-err').textContent = '';
        open_('form-overlay');
    } catch(e) { alert('Error loading certificate.'); }
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

function closeForm() { close_('form-overlay'); editId = null; }
function goBack()    { closeForm(); openUpload(); }

/* ── SAVE TO FIREBASE ── */
async function saveCert() {
    const name   = document.getElementById('f-name').value.trim();
    const issuer = document.getElementById('f-issuer').value.trim();
    const date   = document.getElementById('f-date').value.trim();
    const url    = document.getElementById('f-url').value.trim();
    const cat    = document.getElementById('f-cat').value;
    const errEl  = document.getElementById('form-err');
    const btn    = document.querySelector('#form-overlay .btn-analyze');

    if (!name || !issuer || !date) { errEl.textContent = 'Name, Issuer, and Date are required.'; return; }
    if (url && !validURL(url))     { errEl.textContent = 'Enter a valid URL starting with https://'; return; }

    errEl.textContent = '';
    btn.textContent   = 'Saving...';
    btn.disabled      = true;

    try {
        const cert = { name, issuer, date, url, category: cat };
        if (editId) {
            await updateDoc(doc(db, 'certificates', editId), cert);
        } else {
            await addDoc(COL, cert);
        }
        btn.textContent = 'Save Certificate';
        btn.disabled    = false;
        closeForm();
        render();
    } catch(e) {
        btn.textContent = 'Save Certificate';
        btn.disabled    = false;
        errEl.textContent = 'Error saving. Check your internet connection.';
    }
}

/* ── HELPERS ── */
function showAIBar(msg) { document.getElementById('ai-bar').style.display='flex'; document.getElementById('ai-bar-text').textContent=msg; }
function hideAIBar()    { document.getElementById('ai-bar').style.display='none'; }
function open_(id)      { document.getElementById(id).classList.add('open'); }
function close_(id)     { document.getElementById(id).classList.remove('open'); }
function validURL(u)    { try { return Boolean(new URL(u)); } catch { return false; } }

document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => {
        if (e.target === o) {
            if (o.id === 'upload-overlay') closeUpload();
            if (o.id === 'form-overlay')   closeForm();
        }
    });
});

document.addEventListener('keydown', e => { if (e.key==='Escape') { closeUpload(); closeForm(); } });
document.addEventListener('DOMContentLoaded', render);

/* ── EXPOSE FUNCTIONS TO HTML ── */
window.openUpload = openUpload;
window.closeUpload = closeUpload;
window.resetUpload = resetUpload;
window.onFileSelect = onFileSelect;
window.onDragOver = onDragOver;
window.onDragLeave = onDragLeave;
window.onDrop = onDrop;
window.analyze = analyze;
window.openEdit = openEdit;
window.del = del;
window.closeForm = closeForm;
window.goBack = goBack;
window.saveCert = saveCert;