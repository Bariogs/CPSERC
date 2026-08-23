/* ==========================================================================
   ADMIN DASHBOARD LOGIC
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
/* SCHEDULE                                                                */
/* ---------------------------------------------------------------------- */
async function loadSchedule(){
  const doc = await db.collection('schedule').doc('current').get();
  const box = document.getElementById('scheduleStatusVal');
  const pill = document.getElementById('schedulePill');
  if(!doc.exists){
    box.textContent = 'No schedule set yet';
    pill.textContent = 'Closed';
    pill.className = 'pill pill-inactive';
    return;
  }
  const s = doc.data();
  document.getElementById('eventName').value = s.eventName || '';
  document.getElementById('eventDate').value = s.date || '';
  document.getElementById('timeStart').value = s.timeStart || '';
  document.getElementById('timeEnd').value = s.timeEnd || '';
  document.getElementById('eventActive').checked = !!s.active;

  const open = isScheduleOpen(s);
  box.textContent = `${s.eventName} · ${s.date}`;
  if(open){
    pill.textContent = 'Open now';
    pill.className = 'pill pill-active';
  } else if(s.active){
    pill.textContent = 'Scheduled';
    pill.className = 'pill pill-pending';
  } else {
    pill.textContent = 'Closed';
    pill.className = 'pill pill-inactive';
  }
}

document.getElementById('scheduleForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try{
    const payload = {
      eventName: document.getElementById('eventName').value.trim(),
      date: document.getElementById('eventDate').value,
      timeStart: document.getElementById('timeStart').value,
      timeEnd: document.getElementById('timeEnd').value,
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
/* ATTENDANCE REVIEW                                                       */
/* ---------------------------------------------------------------------- */
let attendanceLoaded = false;

document.getElementById('checkAttendanceBtn').addEventListener('click', ()=>{
  const sec = document.getElementById('attendanceSection');
  const show = sec.style.display === 'none';
  sec.style.display = show ? 'block' : 'none';
  if(show && !attendanceLoaded){
    loadAttendance();
    attendanceLoaded = true;
  }
});

let attendanceCache = {};

async function loadAttendance(){
  const list = document.getElementById('attList');
  list.innerHTML = '<div class="empty-state"><div class="glyph">…</div>Loading attendance records</div>';
  const snap = await db.collection('attendance').orderBy('timestamp', 'desc').limit(200).get();
  document.getElementById('attCount').textContent = snap.size + ' record(s)';
  if(snap.empty){
    list.innerHTML = '<div class="empty-state"><div class="glyph">🗒️</div>No check-ins yet.</div>';
    return;
  }
  list.innerHTML = '';
  attendanceCache = {};
  snap.forEach(doc=>{
    const a = doc.data();
    attendanceCache[doc.id] = a;

    const row = document.createElement('div');
    row.className = 'att-row';
    row.innerHTML = `
      <img class="att-thumb" src="${a.photo || ''}" alt="">
      <div>
        <div class="att-name">${escapeHTML(a.fullName)}</div>
        <div class="att-meta">${escapeHTML(a.eventName || '')} · ${fmtDateTime(a.timestamp)}</div>
      </div>
      <div class="att-qr" id="qr-${doc.id}"></div>
      <span class="pill ${a.status === 'accepted' ? 'pill-accepted' : 'pill-pending'} att-status">${a.status === 'accepted' ? 'Accepted' : 'Pending'}</span>
    `;
    row.addEventListener('click', ()=> openDetail(doc.id));
    list.appendChild(row);

    // QR encodes the record id, useful for physical verification / audit
    // eslint-disable-next-line no-new
    new QRCode(document.getElementById(`qr-${doc.id}`), {
      text: doc.id, width: 44, height: 44,
      colorDark: '#0F2540', colorLight: '#ffffff'
    });
  });
}

function openDetail(id){
  const a = attendanceCache[id];
  if(!a) return;
  const body = document.getElementById('detailBody');
  const accepted = a.status === 'accepted';
  body.innerHTML = `
    <img class="detail-photo" src="${a.photo || ''}" alt="Check-in photo">
    <div class="detail-grid">
      <div><div class="k">Name</div><div class="v">${escapeHTML(a.fullName)}</div></div>
      <div><div class="k">Username</div><div class="v">${escapeHTML(a.username || '—')}</div></div>
      <div><div class="k">Course</div><div class="v">${escapeHTML(a.course || '—')}</div></div>
      <div><div class="k">Year Level</div><div class="v">${escapeHTML(a.yearLevel || '—')}</div></div>
      <div><div class="k">Event</div><div class="v">${escapeHTML(a.eventName || '—')}</div></div>
      <div><div class="k">Timestamp</div><div class="v">${fmtDateTime(a.timestamp)}</div></div>
      <div class="v full"><div class="k">Address (Location Taken)</div>${escapeHTML(a.address || '—')}</div>
      <div class="v full"><div class="k">Photo Size</div>${a.photoSize ? fmtBytes(a.photoSize) : '—'}</div>
    </div>
    <div id="detailAction"></div>
  `;
  const actionBox = document.getElementById('detailAction');
  if(accepted){
    actionBox.innerHTML = `<span class="pill pill-accepted" style="padding:8px 14px;">✓ Accepted</span>`;
  } else {
    actionBox.innerHTML = `<button class="btn btn-green btn-block" id="acceptBtn">Accept &amp; Compress Photo</button>`;
    document.getElementById('acceptBtn').addEventListener('click', ()=> acceptAttendance(id));
  }
  openModal('detailModal');
}

/* NOTE: No Firebase Storage used — everything stays in Firestore (free
   Spark plan). Accepting a record just re-compresses the existing base64
   photo down further and re-saves it as a smaller base64 string in the
   same document. */
async function acceptAttendance(id){
  const a = attendanceCache[id];
  const btn = document.getElementById('acceptBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Compressing photo…';
  try{
    const compressedBlob = await compressImage(a.photo, 500 * 1024);
    const compressedBase64 = await blobToDataURL(compressedBlob);

    await db.collection('attendance').doc(id).update({
      status: 'accepted',
      photo: compressedBase64,
      photoSize: compressedBlob.size,
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    attendanceCache[id].status = 'accepted';
    attendanceCache[id].photo = compressedBase64;
    attendanceCache[id].photoSize = compressedBlob.size;

    showToast(`Accepted — photo compressed to ${fmtBytes(compressedBlob.size)}.`, 'ok');
    closeModal('detailModal');
    loadAttendance(); // refresh list + thumbnails
  } catch(err){
    console.error(err);
    showToast('Could not accept record: ' + err.message, 'err');
    btn.disabled = false; btn.textContent = 'Accept & Compress Photo';
  }
}

/* ---------------------------------------------------------------------- */
/* DOWNLOAD ALL DATA                                                       */
/* ---------------------------------------------------------------------- */
document.getElementById('downloadBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('downloadBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Preparing…';
  try{
    const snap = await db.collection('attendance').orderBy('timestamp', 'desc').get();
    const rows = [[
      'Full Name', 'Username', 'Course', 'Year Level', 'Event', 'Date/Time',
      'Address', 'Status', 'Photo Size (bytes)'
    ]];
    snap.forEach(doc=>{
      const a = doc.data();
      rows.push([
        a.fullName, a.username, a.course, a.yearLevel, a.eventName,
        fmtDateTime(a.timestamp), a.address, a.status, a.photoSize || ''
      ]);
    });
    downloadCSV(`cpserc-attendance-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast('Download started.', 'ok');
  } catch(err){
    console.error(err);
    showToast('Could not export data: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Download All Data (CSV)';
  }
});

/* ---------------------------------------------------------------------- */
function escapeHTML(str){
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}