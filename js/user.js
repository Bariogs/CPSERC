/* ==========================================================================
   MEMBER PORTAL LOGIC
   ========================================================================== */

const loginShell = document.getElementById('loginShell');
const dashShell  = document.getElementById('dashShell');

let currentUser = null;   // { id, fullName, course, yearLevel, username }
let currentSchedule = null;
let scheduleKey = null;
let alreadySubmitted = false;
let mediaStream = null;
let capturedBlob = null;
let capturedLocation = null; // { lat, lng, address }

/* ---------------------------------------------------------------------- */
/* AUTH                                                                    */
/* ---------------------------------------------------------------------- */
function loadSession(){
  const raw = sessionStorage.getItem('cpserc_user');
  return raw ? JSON.parse(raw) : null;
}

currentUser = loadSession();
if(currentUser) enterDashboard();

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Logging in…';
  try{
    const snap = await db.collection('users')
      .where('username', '==', username)
      .where('password', '==', password)
      .limit(1).get();
    if(snap.empty){
      showToast('Incorrect username or password.', 'err');
      return;
    }
    const doc = snap.docs[0];
    currentUser = { id: doc.id, ...doc.data() };
    sessionStorage.setItem('cpserc_user', JSON.stringify(currentUser));
    enterDashboard();
  } catch(err){
    console.error(err);
    showToast('Log-in failed: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Log In';
  }
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  sessionStorage.removeItem('cpserc_user');
  location.reload();
});

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                               */
/* ---------------------------------------------------------------------- */
function enterDashboard(){
  loginShell.style.display = 'none';
  dashShell.style.display = 'block';
  document.getElementById('userFullName').textContent = currentUser.fullName;
  document.getElementById('userMeta').textContent = `${currentUser.course || ''} · ${currentUser.yearLevel || ''} · ${currentUser.username}`;
  refreshScheduleState();
  setInterval(refreshScheduleState, 20000); // keep the button in sync as the window opens/closes
}

async function refreshScheduleState(){
  const doc = await db.collection('schedule').doc('current').get();
  const pill = document.getElementById('userSchedulePill');
  const text = document.getElementById('userScheduleText');
  const btn = document.getElementById('attendanceBtn');
  const title = document.getElementById('attTitle');
  const hint = document.getElementById('attHint');
  const glyph = document.getElementById('attGlyph');

  if(!doc.exists || !doc.data().eventName){
    currentSchedule = null;
    pill.textContent = 'None set';
    pill.className = 'pill pill-inactive';
    text.textContent = 'Your officer has not set an attendance schedule yet.';
    btn.disabled = true;
    title.textContent = 'Attendance';
    hint.textContent = 'The Take Attendance button unlocks once a duty schedule is open.';
    glyph.textContent = '🕓';
    return;
  }

  currentSchedule = doc.data();
  scheduleKey = `${currentSchedule.date}_${currentSchedule.eventName}`.replace(/\s+/g, '-');
  const open = isScheduleOpen(currentSchedule);

  text.textContent = `${currentSchedule.eventName} · ${currentSchedule.date}, ${currentSchedule.timeStart}–${currentSchedule.timeEnd}`;
  if(open){
    pill.textContent = 'Open now'; pill.className = 'pill pill-active';
  } else if(currentSchedule.active){
    pill.textContent = 'Scheduled'; pill.className = 'pill pill-pending';
  } else {
    pill.textContent = 'Closed'; pill.className = 'pill pill-inactive';
  }

  await checkAlreadySubmitted();

  if(alreadySubmitted){
    btn.disabled = true;
    title.textContent = 'Attendance Submitted';
    hint.textContent = 'You already logged attendance for this schedule. Thank you!';
    glyph.textContent = '✅';
  } else if(open){
    btn.disabled = false;
    title.textContent = 'Ready to Check In';
    hint.textContent = 'Tap below to take your photo and log your attendance.';
    glyph.textContent = '📷';
  } else {
    btn.disabled = true;
    title.textContent = 'Attendance';
    hint.textContent = currentSchedule.active
      ? 'This schedule is not open yet — check back during its time window.'
      : 'Your officer has not opened this schedule for attendance.';
    glyph.textContent = '🕓';
  }
}

async function checkAlreadySubmitted(){
  if(!currentSchedule) { alreadySubmitted = false; return; }
  const snap = await db.collection('attendance')
    .where('username', '==', currentUser.username)
    .where('scheduleKey', '==', scheduleKey)
    .limit(1).get();
  alreadySubmitted = !snap.empty;
}

/* ---------------------------------------------------------------------- */
/* CAMERA CAPTURE FLOW                                                     */
/* ---------------------------------------------------------------------- */
const video = document.getElementById('cameraVideo');
const canvas = document.getElementById('cameraCanvas');
const capturedImg = document.getElementById('capturedImg');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const usePhotoBtn = document.getElementById('usePhotoBtn');
const locationStep = document.getElementById('locationStep');
const locationText = document.getElementById('locationText');
const submitBtn = document.getElementById('submitAttendanceBtn');
const cameraStepLabel = document.getElementById('cameraStepLabel');

document.getElementById('attendanceBtn').addEventListener('click', openCameraModal);
document.getElementById('cameraCancelBtn').addEventListener('click', stopCamera);

async function openCameraModal(){
  resetCameraModal();
  openModal('cameraModal');
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = mediaStream;
  } catch(err){
    console.error(err);
    showToast('Could not access camera: ' + err.message, 'err');
    closeModal('cameraModal');
  }
}

function resetCameraModal(){
  capturedBlob = null;
  capturedLocation = null;
  video.style.display = 'block'; capturedImg.style.display = 'none';
  captureBtn.style.display = 'block';
  retakeBtn.style.display = 'none';
  usePhotoBtn.style.display = 'none';
  locationStep.style.display = 'none';
  submitBtn.disabled = true;
  cameraStepLabel.textContent = 'Step 1 of 3 · Take your photo';
}

captureBtn.addEventListener('click', ()=>{
  const w = video.videoWidth, h = video.videoHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Mirror the capture so it matches what the member sees in preview
  ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  capturedImg.src = canvas.toDataURL('image/jpeg', 0.92);
  video.style.display = 'none';
  capturedImg.style.display = 'block';
  captureBtn.style.display = 'none';
  retakeBtn.style.display = 'block';
  usePhotoBtn.style.display = 'block';
});

retakeBtn.addEventListener('click', ()=>{
  video.style.display = 'block';
  capturedImg.style.display = 'none';
  captureBtn.style.display = 'block';
  retakeBtn.style.display = 'none';
  usePhotoBtn.style.display = 'none';
});

usePhotoBtn.addEventListener('click', async ()=>{
  usePhotoBtn.disabled = true;
  cameraStepLabel.textContent = 'Step 2 of 3 · Confirm your location';
  retakeBtn.style.display = 'none';
  usePhotoBtn.style.display = 'none';
  locationStep.style.display = 'block';
  await fetchLocation();
  usePhotoBtn.disabled = false;
});

async function fetchLocation(){
  if(!navigator.geolocation){
    locationText.textContent = 'Location services are not available on this device.';
    return;
  }
  locationText.textContent = 'Requesting location access…';
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const { latitude, longitude } = pos.coords;
    locationText.textContent = 'Looking up your address…';
    const address = await reverseGeocode(latitude, longitude);
    capturedLocation = { lat: latitude, lng: longitude, address };
    locationText.innerHTML = `📍 <b>${escapeHTML(address)}</b>`;
    cameraStepLabel.textContent = 'Step 3 of 3 · Submit';
    submitBtn.disabled = false;
  }, (err)=>{
    console.error(err);
    locationText.textContent = 'Location access was denied. Please allow location access and try again.';
  }, { enableHighAccuracy: true, timeout: 15000 });
}

submitBtn.addEventListener('click', submitAttendance);

async function submitAttendance(){
  if(!capturedLocation){ showToast('Waiting for location.', 'err'); return; }
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Submitting…';
  try{
    const blob = await compressImage(capturedImg.src, 1.5 * 1024 * 1024);
    const docRef = db.collection('attendance').doc();
    const path = `attendance/${docRef.id}.jpg`;
    const ref = storage.ref(path);
    await ref.put(blob, { contentType: 'image/jpeg' });
    const photoURL = await ref.getDownloadURL();

    await docRef.set({
      userId: currentUser.id,
      fullName: currentUser.fullName,
      username: currentUser.username,
      course: currentUser.course || '',
      yearLevel: currentUser.yearLevel || '',
      eventName: currentSchedule.eventName,
      date: currentSchedule.date,
      scheduleKey,
      photoURL,
      photoSize: blob.size,
      lat: capturedLocation.lat,
      lng: capturedLocation.lng,
      address: capturedLocation.address,
      status: 'pending',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('Attendance submitted!', 'ok');
    stopCamera();
    refreshScheduleState();
  } catch(err){
    console.error(err);
    showToast('Could not submit attendance: ' + err.message, 'err');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Attendance';
  }
}

function stopCamera(){
  if(mediaStream){
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  closeModal('cameraModal');
}

function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

function escapeHTML(str){
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}