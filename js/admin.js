/* ==========================================================================
   ADMIN DASHBOARD LOGIC
   ==========================================================================
   NOTE ON DATA MODEL CHANGE:
   Each "attendance" document now represents ONE member's attendance for the
   currently active event, and can hold BOTH a time-in and a time-out entry:

     {
       fullName, username, course, yearLevel, eventName,
       timeInAt:  Firestore Timestamp | null,
       timeInPhoto: base64 string | null,
       timeInPhotoSize: number | null,
       timeInStatus: 'pending' | 'accepted' | null,
       timeInAddress: string | null,

       timeOutAt: Firestore Timestamp | null,
       timeOutPhoto: base64 string | null,
       timeOutPhotoSize: number | null,
       timeOutStatus: 'pending' | 'accepted' | null,
       timeOutAddress: string | null,

       createdAt: Firestore Timestamp   // set once, when the time-in record is first created
     }

   The member-facing check-in page must be updated to match this shape
   (write to timeInAt/timeInPhoto/... on time-in, and timeOutAt/timeOutPhoto/...
   on time-out, using the SAME document per member+event instead of creating a
   new document every scan). Ping me with that file if you want it updated too.
   ========================================================================== */

const loginShell = document.getElementById('loginShell');
const dashShell  = document.getElementById('dashShell');

let allMembers = [];
let editingMemberId = null;

/* ---------------------------------------------------------------------- */
/* AUTH                                                                    */
/* ---------------------------------------------------------------------- */
function isLoggedIn(){ return sessionStorage.getItem('cpserc_admin') === '1'; }

function enterDashboard(){
  loginShell.style.display = 'none';
  dashShell.style.display = 'block';
  document.getElementById('todayLabel').textContent =
    new Date().toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  loadSchedule();
  loadMembers();
}

if(isLoggedIn()) enterDashboard();

document.getElementById('loginForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if(u === ADMIN_USERNAME && p === ADMIN_PASSWORD){
    sessionStorage.setItem('cpserc_admin', '1');
    enterDashboard();
  } else {
    showToast('Incorrect username or password.', 'err');
  }
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  sessionStorage.removeItem('cpserc_admin');
  location.reload();
});

/* ---------------------------------------------------------------------- */
/* MODALS                                                                  */
/* ---------------------------------------------------------------------- */
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=> closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(bd=>{
  bd.addEventListener('click', (e)=>{ if(e.target === bd) bd.classList.remove('show'); });
});

/* ---------------------------------------------------------------------- */
/* SCHEDULE (Time In window + Time Out window)                             */
/* ---------------------------------------------------------------------- */

// Returns true if "now" falls between date+startTime and date+endTime
function isWindowOpen(dateStr, startStr, endStr){
  if(!dateStr || !startStr || !endStr) return false;
  const start = new Date(`${dateStr}T${startStr}:00`);
  const end   = new Date(`${dateStr}T${endStr}:00`);
  const now   = new Date();
  return now >= start && now <= end;
}

async function loadSchedule(){
  const doc = await db.collection('schedule').doc('current').get();

  const timeInVal  = document.getElementById('timeInStatusVal');
  const timeInPill = document.getElementById('timeInPill');
  const timeOutVal  = document.getElementById('timeOutStatusVal');
  const timeOutPill = document.getElementById('timeOutPill');

  if(!doc.exists){
    timeInVal.textContent = 'No schedule set yet';
    timeInPill.textContent = 'Closed';
    timeInPill.className = 'pill pill-inactive';
    timeOutVal.textContent = 'No schedule set yet';
    timeOutPill.textContent = 'Closed';
    timeOutPill.className = 'pill pill-inactive';
    return;
  }

  const s = doc.data();
  document.getElementById('eventName').value  = s.eventName || '';
  document.getElementById('eventDate').value  = s.date || '';
  document.getElementById('eventActive').checked = !!s.active;
  document.getElementById('timeInStart').value  = s.timeInStart  || '';
  document.getElementById('timeInEnd').value    = s.timeInEnd    || '';
  document.getElementById('timeOutStart').value = s.timeOutStart || '';
  document.getElementById('timeOutEnd').value   = s.timeOutEnd   || '';

  const timeInOpen  = s.active && isWindowOpen(s.date, s.timeInStart, s.timeInEnd);
  const timeOutOpen = s.active && isWindowOpen(s.date, s.timeOutStart, s.timeOutEnd);

  timeInVal.textContent = `${s.eventName} · ${s.timeInStart || '--:--'}–${s.timeInEnd || '--:--'}`;
  if(timeInOpen){
    timeInPill.textContent = 'Open now';
    timeInPill.className = 'pill pill-active';
  } else if(s.active){
    timeInPill.textContent = 'Scheduled';
    timeInPill.className = 'pill pill-pending';
  } else {
    timeInPill.textContent = 'Closed';
    timeInPill.className = 'pill pill-inactive';
  }

  timeOutVal.textContent = `${s.eventName} · ${s.timeOutStart || '--:--'}–${s.timeOutEnd || '--:--'}`;
  if(timeOutOpen){
    timeOutPill.textContent = 'Open now';
    timeOutPill.className = 'pill pill-active';
  } else if(s.active){
    timeOutPill.textContent = 'Scheduled';
    timeOutPill.className = 'pill pill-pending';
  } else {
    timeOutPill.textContent = 'Closed';
    timeOutPill.className = 'pill pill-inactive';
  }
}

document.getElementById('scheduleForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try{
    const timeInStart  = document.getElementById('timeInStart').value;
    const timeInEnd    = document.getElementById('timeInEnd').value;
    const timeOutStart = document.getElementById('timeOutStart').value;
    const timeOutEnd   = document.getElementById('timeOutEnd').value;

    if(timeInEnd <= timeInStart){
      showToast('Time In End must be after Time In Start.', 'err');
      return;
    }
    if(timeOutEnd <= timeOutStart){
      showToast('Time Out End must be after Time Out Start.', 'err');
      return;
    }

    const payload = {
      eventName: document.getElementById('eventName').value.trim(),
      date: document.getElementById('eventDate').value,
      timeInStart, timeInEnd,
      timeOutStart, timeOutEnd,
      active: document.getElementById('eventActive').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('schedule').doc('current').set(payload, { merge:true });
    showToast('Schedule saved.', 'ok');
    loadSchedule();
  } catch(err){
    console.error(err);
    showToast('Could not save schedule: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Schedule';
  }
});

/* ---------------------------------------------------------------------- */
/* MEMBERS / ADD USER / SEARCH / EDIT PASSWORD                             */
/* ---------------------------------------------------------------------- */
async function loadMembers(){
  const list = document.getElementById('memberList');
  list.innerHTML = '<div class="empty-state"><div class="glyph">…</div>Loading members</div>';
  const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
  allMembers = [];
  snap.forEach(doc=> allMembers.push({ id: doc.id, ...doc.data() }));
  document.getElementById('memberCount').textContent = allMembers.length + ' total';
  renderMembers(allMembers);
}

function renderMembers(members){
  const list = document.getElementById('memberList');
  if(members.length === 0){
    list.innerHTML = '<div class="empty-state"><div class="glyph">👤</div>No user found.</div>';
    return;
  }
  list.innerHTML = '';
  members.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <div>
        <div>${escapeHTML(m.fullName)}</div>
        <div class="u">${escapeHTML(m.course || '')} · ${escapeHTML(m.yearLevel || '')}</div>
      </div>
      <div class="u">${escapeHTML(m.username)}</div>`;
    row.addEventListener('click', ()=> openEditPassword(m.id, m.fullName));
    list.appendChild(row);
  });
}

/* -- Search -- */
function runMemberSearch(){
  const q = document.getElementById('memberSearchInput').value.trim().toLowerCase();
  if(!q){
    renderMembers(allMembers);
    return;
  }
  const filtered = allMembers.filter(m => (m.fullName || '').toLowerCase().includes(q));
  renderMembers(filtered);
}

document.getElementById('memberSearchBtn').addEventListener('click', runMemberSearch);
document.getElementById('memberSearchInput').addEventListener('keyup', runMemberSearch);

/* -- Add User -- */
document.getElementById('addUserBtn').addEventListener('click', ()=>{
  document.getElementById('addUserForm').reset();
  document.getElementById('addUserForm').style.display = 'block';
  document.getElementById('credResult').style.display = 'none';
  document.getElementById('credResult').innerHTML = '';
  openModal('addUserModal');
});

// Auto-fill username & password as the officer types the full name
document.getElementById('newFullName').addEventListener('input', (e)=>{
  const fullName = e.target.value.trim();
  if(!fullName) return;
  document.getElementById('newUsername').value = 'CPSERC.' + lastNameSlug(fullName);
  document.getElementById('newPassword').value = generatePassword(fullName);
});

document.getElementById('addUserForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = document.getElementById('addUserSubmitBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
  try{
    const fullName = document.getElementById('newFullName').value.trim();
    const course = document.getElementById('newCourse').value;
    const yearLevel = document.getElementById('newYearLevel').value;
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();

    // Quick uniqueness check (single query, not a loop)
    const existing = await db.collection('users').where('username', '==', username).limit(1).get();
    if(!existing.empty){
      showToast('That username is already taken. Please edit it.', 'err');
      return;
    }

    await db.collection('users').add({
      fullName, course, yearLevel, username, password,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('addUserForm').style.display = 'none';
    const box = document.getElementById('credResult');
    box.style.display = 'block';
    box.innerHTML = `
      <p style="margin-bottom:6px;">Account created for <b>${escapeHTML(fullName)}</b>. Share these credentials with the member:</p>
      <div class="cred-box">
        <div class="row"><span>Username</span><b>${escapeHTML(username)}</b></div>
        <div class="row"><span>Password</span><b>${escapeHTML(password)}</b></div>
      </div>
      <button class="btn btn-navy btn-block" style="margin-top:16px;" id="doneAddUser">Done</button>`;
    document.getElementById('doneAddUser').addEventListener('click', ()=>{
      closeModal('addUserModal');
      loadMembers();
    });
    showToast('Member account created.', 'ok');
  } catch(err){
    console.error(err);
    showToast('Could not create account: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
});

/* -- Edit Password -- */
function openEditPassword(id, fullName){
  editingMemberId = id;
  document.getElementById('editPassName').textContent = `Member: ${fullName}`;
  document.getElementById('editPassInput').value = '';
  openModal('editPassModal');
}

document.getElementById('editPassForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = document.getElementById('editPassSubmitBtn');
  const newPass = document.getElementById('editPassInput').value.trim();
  if(!newPass || !editingMemberId) return;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try{
    await db.collection('users').doc(editingMemberId).update({ password: newPass });
    showToast('Password updated.', 'ok');
    closeModal('editPassModal');
    loadMembers();
  } catch(err){
    console.error(err);
    showToast('Could not update password: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Password';
  }
});

/* ---------------------------------------------------------------------- */
/* ATTENDANCE REVIEW (Time In tab / Time Out tab)                          */
/* ---------------------------------------------------------------------- */
let attendanceLoaded = false;
let attendanceCache = {};
let activeTab = 'timeIn'; // 'timeIn' | 'timeOut'

document.getElementById('checkAttendanceBtn').addEventListener('click', ()=>{
  const sec = document.getElementById('attendanceSection');
  const show = sec.style.display === 'none';
  sec.style.display = show ? 'block' : 'none';
  if(show && !attendanceLoaded){
    loadAttendance();
    attendanceLoaded = true;
  }
});

document.getElementById('tabTimeIn').addEventListener('click', ()=> switchTab('timeIn'));
document.getElementById('tabTimeOut').addEventListener('click', ()=> switchTab('timeOut'));

function switchTab(tab){
  activeTab = tab;
  document.getElementById('tabTimeIn').classList.toggle('active', tab === 'timeIn');
  document.getElementById('tabTimeOut').classList.toggle('active', tab === 'timeOut');
  renderAttendanceList();
}

async function loadAttendance(){
  const list = document.getElementById('attList');
  list.innerHTML = '<div class="empty-state"><div class="glyph">…</div>Loading attendance records</div>';
  const snap = await db.collection('attendance').orderBy('createdAt', 'desc').limit(300).get();
  attendanceCache = {};
  snap.forEach(doc=>{ attendanceCache[doc.id] = doc.data(); });
  renderAttendanceList();
}

function renderAttendanceList(){
  const list = document.getElementById('attList');
  const field = activeTab === 'timeIn' ? 'timeInAt' : 'timeOutAt';
  const entries = Object.entries(attendanceCache).filter(([, a]) => !!a[field]);

  document.getElementById('attCount').textContent =
    entries.length + ' ' + (activeTab === 'timeIn' ? 'time-in' : 'time-out') + ' record(s)';

  if(entries.length === 0){
    list.innerHTML = '<div class="empty-state"><div class="glyph">🗒️</div>No records yet.</div>';
    return;
  }

  list.innerHTML = '';
  entries
    .sort((a, b) => (b[1][field]?.toMillis?.() || 0) - (a[1][field]?.toMillis?.() || 0))
    .forEach(([id, a])=>{
      const photo  = activeTab === 'timeIn' ? a.timeInPhoto  : a.timeOutPhoto;
      const status = activeTab === 'timeIn' ? a.timeInStatus : a.timeOutStatus;
      const stamp  = a[field];

      const row = document.createElement('div');
      row.className = 'att-row';
      row.innerHTML = `
        <img class="att-thumb" src="${photo || ''}" alt="">
        <div>
          <div class="att-name">${escapeHTML(a.fullName)}</div>
          <div class="att-meta">${escapeHTML(a.eventName || '')} · ${fmtDateTime(stamp)}</div>
        </div>
        <div class="att-qr" id="qr-${activeTab}-${id}"></div>
        <span class="pill ${status === 'accepted' ? 'pill-accepted' : 'pill-pending'} att-status">${status === 'accepted' ? 'Accepted' : 'Pending'}</span>
      `;
      row.addEventListener('click', ()=> openDetail(id));
      list.appendChild(row);

      // QR encodes "recordId:phase" so a physical scan can be traced to
      // the exact time-in or time-out entry
      // eslint-disable-next-line no-new
      new QRCode(document.getElementById(`qr-${activeTab}-${id}`), {
        text: `${id}:${activeTab}`, width: 44, height: 44,
        colorDark: '#0F2540', colorLight: '#ffffff'
      });
    });
}

function openDetail(id){
  const a = attendanceCache[id];
  if(!a) return;
  const phase = activeTab; // 'timeIn' | 'timeOut'
  const photo   = phase === 'timeIn' ? a.timeInPhoto   : a.timeOutPhoto;
  const address = phase === 'timeIn' ? a.timeInAddress : a.timeOutAddress;
  const status  = phase === 'timeIn' ? a.timeInStatus  : a.timeOutStatus;
  const size    = phase === 'timeIn' ? a.timeInPhotoSize : a.timeOutPhotoSize;
  const stamp   = phase === 'timeIn' ? a.timeInAt : a.timeOutAt;
  const accepted = status === 'accepted';

  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <img class="detail-photo" src="${photo || ''}" alt="Check-in photo">
    <div class="detail-grid">
      <div><div class="k">Name</div><div class="v">${escapeHTML(a.fullName)}</div></div>
      <div><div class="k">Username</div><div class="v">${escapeHTML(a.username || '—')}</div></div>
      <div><div class="k">Course</div><div class="v">${escapeHTML(a.course || '—')}</div></div>
      <div><div class="k">Year Level</div><div class="v">${escapeHTML(a.yearLevel || '—')}</div></div>
      <div><div class="k">Event</div><div class="v">${escapeHTML(a.eventName || '—')}</div></div>
      <div><div class="k">${phase === 'timeIn' ? 'Time In' : 'Time Out'}</div><div class="v">${fmtDateTime(stamp)}</div></div>
      <div class="v full"><div class="k">Address (Location Taken)</div>${escapeHTML(address || '—')}</div>
      <div class="v full"><div class="k">Photo Size</div>${size ? fmtBytes(size) : '—'}</div>
    </div>
    <div id="detailAction"></div>
  `;
  const actionBox = document.getElementById('detailAction');
  if(accepted){
    actionBox.innerHTML = `<span class="pill pill-accepted" style="padding:8px 14px;">✓ Accepted</span>`;
  } else {
    actionBox.innerHTML = `<button class="btn btn-green btn-block" id="acceptBtn">Accept &amp; Compress Photo</button>`;
    document.getElementById('acceptBtn').addEventListener('click', ()=> acceptAttendance(id, phase));
  }
  openModal('detailModal');
}

/* NOTE: No Firebase Storage used — everything stays in Firestore (free
   Spark plan). Accepting a record just re-compresses the existing base64
   photo down further and re-saves it as a smaller base64 string in the
   same document, under either the timeIn* or timeOut* fields depending on
   which phase is being accepted. */
async function acceptAttendance(id, phase){
  const a = attendanceCache[id];
  const photoField      = phase === 'timeIn' ? 'timeInPhoto'      : 'timeOutPhoto';
  const photoSizeField  = phase === 'timeIn' ? 'timeInPhotoSize'  : 'timeOutPhotoSize';
  const statusField     = phase === 'timeIn' ? 'timeInStatus'     : 'timeOutStatus';
  const acceptedAtField = phase === 'timeIn' ? 'timeInAcceptedAt' : 'timeOutAcceptedAt';

  const btn = document.getElementById('acceptBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Compressing photo…';
  try{
    const compressedBlob = await compressImage(a[photoField], 500 * 1024);
    const compressedBase64 = await blobToDataURL(compressedBlob);

    await db.collection('attendance').doc(id).update({
      [statusField]: 'accepted',
      [photoField]: compressedBase64,
      [photoSizeField]: compressedBlob.size,
      [acceptedAtField]: firebase.firestore.FieldValue.serverTimestamp()
    });

    attendanceCache[id][statusField] = 'accepted';
    attendanceCache[id][photoField] = compressedBase64;
    attendanceCache[id][photoSizeField] = compressedBlob.size;

    showToast(`Accepted — photo compressed to ${fmtBytes(compressedBlob.size)}.`, 'ok');
    closeModal('detailModal');
    renderAttendanceList();
  } catch(err){
    console.error(err);
    showToast('Could not accept record: ' + err.message, 'err');
    btn.disabled = false; btn.textContent = 'Accept & Compress Photo';
  }
}

/* ---------------------------------------------------------------------- */
/* DOWNLOAD ALL DATA  (then clear the attendance log)                      */
/* ---------------------------------------------------------------------- */
document.getElementById('downloadBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('downloadBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Preparing…';
  try{
    const snap = await db.collection('attendance').orderBy('createdAt', 'desc').get();

    if(snap.empty){
      showToast('No attendance records to download.', 'err');
      return;
    }

    const rows = [[
      'Full Name', 'Username', 'Course', 'Year Level', 'Event',
      'Time In', 'Time In Status', 'Time Out', 'Time Out Status',
      'Address (Time In)', 'Address (Time Out)'
    ]];

    snap.forEach(doc=>{
      const a = doc.data();
      const timeInText  = a.timeInAt  ? `✓ ${fmtDateTime(a.timeInAt)}`  : '✗';
      const timeOutText = a.timeOutAt ? `✓ ${fmtDateTime(a.timeOutAt)}` : '✗';
      rows.push([
        a.fullName, a.username, a.course, a.yearLevel, a.eventName,
        timeInText,  a.timeInAt  ? (a.timeInStatus  || 'pending') : '—',
        timeOutText, a.timeOutAt ? (a.timeOutStatus || 'pending') : '—',
        a.timeInAddress || '', a.timeOutAddress || ''
      ]);
    });

    downloadCSV(`cpserc-attendance-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast('Download started. Clearing the attendance log…', 'ok');

    // Zero-out the attendance log now that it's archived in the CSV.
    // Any check-ins/check-outs made AFTER this point are new records and
    // will simply repopulate the collection for the next download cycle.
    await clearAttendanceCollection(snap.docs.map(d => d.id));

    attendanceCache = {};
    attendanceLoaded = false;
    document.getElementById('attList').innerHTML = '';
    document.getElementById('attCount').textContent = '0 record(s)';
    showToast('Attendance log cleared. Ready for the next event.', 'ok');
  } catch(err){
    console.error(err);
    showToast('Could not export data: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Download All Data (CSV)';
  }
});

// Deletes the given attendance doc IDs in batches of 450 (Firestore's batch
// limit is 500 writes) so large logs don't fail in one shot.
async function clearAttendanceCollection(docIds){
  const chunkSize = 450;
  for(let i = 0; i < docIds.length; i += chunkSize){
    const chunk = docIds.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach(id => batch.delete(db.collection('attendance').doc(id)));
    await batch.commit();
  }
}

/* ---------------------------------------------------------------------- */
function escapeHTML(str){
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}