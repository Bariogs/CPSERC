/* ==========================================================================
   COMMON UTILITIES — shared by admin.js and user.js
   ========================================================================== */

function showToast(message, type){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.classList.remove('show'); }, 3200);
}

/* Turn "Juan Miguel Dela Cruz" -> "delacruz" (last word, letters only) */
function lastNameSlug(fullName){
  const parts = fullName.trim().split(/\s+/);
  const last = parts[parts.length - 1] || 'member';
  return last.toLowerCase().replace(/[^a-z]/g, '') || 'member';
}

/* Build username in the CPSERC.<lastname> pattern, adding a number
   suffix (CPSERC.delacruz2) if that username is already taken. */
async function generateUsername(fullName){
  const base = 'CPSERC.' + lastNameSlug(fullName);
  let candidate = base;
  let n = 1;
  while(true){
    const snap = await db.collection('users').where('username', '==', candidate).get();
    if(snap.empty) return candidate;
    n += 1;
    candidate = base + n;
  }
}

/* Mirrors the style of the sample password (0021Bulawin): 4 random
   digits + capitalized surname. */
function generatePassword(fullName){
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const parts = fullName.trim().split(/\s+/);
  const last = (parts[parts.length - 1] || 'Member').replace(/[^a-zA-Z]/g, '');
  const cap = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
  return digits + cap;
}

/* Compress a data-URL (or Blob) image down under a target size (default
   1MB) by iteratively lowering JPEG quality, keeping the face legible.
   Resolves to a Blob. */
function compressImage(input, maxBytes){
  maxBytes = maxBytes || 1024 * 1024;
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      let { width, height } = img;
      const MAX_DIM = 1600;
      if(width > MAX_DIM || height > MAX_DIM){
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.92;
      const tryCompress = ()=>{
        canvas.toBlob((blob)=>{
          if(!blob){ reject(new Error('Compression failed')); return; }
          if(blob.size <= maxBytes || quality <= 0.35){
            resolve(blob);
          } else {
            quality -= 0.08;
            tryCompress();
          }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = reject;
    if(typeof input === 'string'){
      img.src = input;
    } else {
      img.src = URL.createObjectURL(input);
    }
  });
}

function blobToDataURL(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function fmtBytes(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
  return (bytes/1024/1024).toFixed(2) + ' MB';
}

function fmtDateTime(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-PH', { dateStyle:'medium', timeStyle:'short' });
}

/* CSV export helper */
function downloadCSV(filename, rows){
  const process = (v)=>{
    const s = (v === undefined || v === null) ? '' : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = rows.map(row => row.map(process).join(',')).join('\r\n');
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Reverse-geocode lat/lng into a readable address via OpenStreetMap's
   free Nominatim API (no key required, client-side fetch). */
async function reverseGeocode(lat, lng){
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch(e){
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/* Is "now" within [date + timeStart, date + timeEnd]? schedule.date is
   "YYYY-MM-DD", timeStart/timeEnd are "HH:MM" (24h). */
function isScheduleOpen(schedule){
  if(!schedule || !schedule.active) return false;
  const now = new Date();
  const start = new Date(`${schedule.date}T${schedule.timeStart}:00`);
  const end = new Date(`${schedule.date}T${schedule.timeEnd}:00`);
  return now >= start && now <= end;
}