/**
 * PawMeMaybe - Frontend Application Logic
 * Talks to pet-service and adoption-service over REST. Authentication is a Bearer token
 * issued by adoption-service; every authorisation decision is enforced server-side.
 */

const CFG = window.PAWME_CONFIG || { PET_SERVICE_URL: "", ADOPTION_SERVICE_URL: "" };
const PET_SERVICE_URL = CFG.PET_SERVICE_URL;
const ADOPTION_SERVICE_URL = CFG.ADOPTION_SERVICE_URL;

let petsData = [];
let applications = [];
let petsOffline = false;

const GUEST = { role: 'guest', name: 'Guest' };
let currentUser = GUEST;
let authToken = null;
let currentSelectedPetId = "";

// ---------- Safety helpers ----------
// Everything that came from a user or the API is escaped before it goes into innerHTML.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const DEFAULT_PHOTO = 'images/shiba.jpg';
function safePhoto(url) {
  return /^(https?:\/\/|images\/)[^\s"'<>]+$/.test(url || '') ? url : DEFAULT_PHOTO;
}

function setStoredSession(token, user) {
  try {
    if (token) sessionStorage.setItem('pawme_session', JSON.stringify({ token, user }));
    else sessionStorage.removeItem('pawme_session');
  } catch (e) { /* storage unavailable: session lasts until reload */ }
}

// ---------- API helper ----------
async function api(base, path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (err) {
    throw new Error('Cannot reach the server. Check that the backend services are running (ports 8001/8002) and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && authToken) {
      clearSession();
      throw new Error('Your session has expired. Please sign in again.');
    }
    let detail = data && data.detail;
    if (Array.isArray(detail)) {
      detail = detail.map(d => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('\n');
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}
const petApi = (path, opts) => api(PET_SERVICE_URL, path, opts);
const adoptionApi = (path, opts) => api(ADOPTION_SERVICE_URL, path, opts);

// ---------- Data loading ----------
async function fetchPetsFromBackend() {
  try {
    petsData = await petApi('/api/pets');
    petsOffline = false;
  } catch (err) {
    petsOffline = true;
    console.warn('⚠️ Pet service unavailable:', err.message);
  }
  renderPetCards();
  renderStaffPetsTable();
  updateStaffStats();
}

async function fetchApplicationsFromBackend() {
  if (currentUser.role !== 'staff') { applications = []; return; }
  try {
    applications = await adoptionApi('/api/adoptions');
  } catch (err) {
    console.warn('⚠️ Could not load applications:', err.message);
  }
  renderStaffAppsTable();
  updateStaffStats();
}

function refreshAll() {
  return Promise.all([fetchPetsFromBackend(), fetchApplicationsFromBackend()]);
}

// ---------- Breed dropdowns ----------
const BREEDS = {
  dog: ['Japanese Shiba Inu', 'Golden Retriever', 'Pembroke Corgi', 'Border Collie',
        'Labrador Retriever', 'Siberian Husky', 'Beagle', 'Poodle'],
  cat: ['British Shorthair']
};
const OTHER_BREED = '__other__';

function breedOptionsFor(species) {
  const set = new Set(BREEDS[species] || []);
  petsData.filter(p => p.species === species).forEach(p => set.add(p.breed));
  return [...set];
}

function populateBreedSelect(selectId, otherId, species, current) {
  const sel = document.getElementById(selectId);
  const options = breedOptionsFor(species);
  if (current && !options.includes(current)) options.push(current);
  sel.innerHTML = options.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('') +
                  `<option value="${OTHER_BREED}">Other…</option>`;
  if (current) sel.value = current;
  toggleBreedOther(selectId, otherId);
}

function toggleBreedOther(selectId, otherId) {
  const isOther = document.getElementById(selectId).value === OTHER_BREED;
  const other = document.getElementById(otherId);
  other.style.display = isOther ? 'block' : 'none';
  other.required = isOther;
}

function getBreedValue(selectId, otherId) {
  const v = document.getElementById(selectId).value;
  return v === OTHER_BREED ? document.getElementById(otherId).value.trim() : v;
}

// ---------- Navigation ----------
function toggleMobileMenu() {
  document.getElementById('hamburgerBtn').classList.toggle('open');
  document.getElementById('navLinks').classList.toggle('show');
}

function closeMobileMenu() {
  const btn = document.getElementById('hamburgerBtn');
  const nav = document.getElementById('navLinks');
  if (btn && nav) { btn.classList.remove('open'); nav.classList.remove('show'); }
}

function switchTab(tabName) {
  closeMobileMenu();
  if (tabName === 'staff' && currentUser.role !== 'staff') tabName = 'pets';

  ['pets', 'tracking', 'staff'].forEach(t => {
    document.getElementById(`page-${t}`).style.display = 'none';
    document.getElementById(`nav-${t}`).classList.remove('active');
  });
  document.getElementById(`page-${tabName}`).style.display = 'block';
  document.getElementById(`nav-${tabName}`).classList.add('active');

  if (tabName === 'pets') {
    fetchPetsFromBackend();
  } else if (tabName === 'tracking') {
    setupTrackingPage();
  } else if (tabName === 'staff') {
    renderStaffTables();
    refreshAll();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Pet catalogue ----------
function ageInMonths(ageText) {
  const m = /^(\d+)\s*(year|month)/i.exec(ageText || '');
  if (!m) return null;
  return m[2].toLowerCase() === 'year' ? parseInt(m[1], 10) * 12 : parseInt(m[1], 10);
}

function matchesAgeGroup(pet, group) {
  if (group === 'all') return true;
  const months = ageInMonths(pet.age);
  if (months === null) return true;
  if (group === 'puppy') return months < 12;
  if (group === 'young') return months >= 12 && months < 36;
  return months >= 36;
}

function renderPetCards() {
  const grid = document.getElementById('petGrid');
  if (!grid) return;

  if (petsOffline && petsData.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted);">⚠️ The pet catalogue is temporarily unavailable. Please try again shortly.</p>';
    return;
  }

  const species = document.getElementById('speciesFilter').value;
  const breed = document.getElementById('breedInput').value.toLowerCase().trim();
  const ageGroup = document.getElementById('ageFilter').value;

  const visible = petsData.filter(pet =>
    (species === 'all' || pet.species === species) &&
    (!breed || pet.breed.toLowerCase().includes(breed) || pet.name.toLowerCase().includes(breed)) &&
    matchesAgeGroup(pet, ageGroup));

  if (visible.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted);">No pets match your search.</p>';
    return;
  }

  grid.innerHTML = visible.map(pet => {
    let tagBg = '#ffffff', tagColor = 'var(--accent)';
    if (pet.status === 'Adopted') { tagBg = '#FED7D7'; tagColor = '#C53030'; }
    else if (pet.status === 'Pending Adoption') { tagBg = '#FEEBC8'; tagColor = '#C05621'; }
    const adopted = pet.status === 'Adopted';
    const badgesHtml = (pet.badges || []).map(b => `<span class="badge">${esc(b)}</span>`).join(' ');

    return `
      <div class="pet-card" data-species="${esc(pet.species)}" data-breed="${esc(pet.breed.toLowerCase())}">
        <div class="pet-img-wrap">
          <img src="${esc(safePhoto(pet.photo))}" alt="${esc(pet.name)}" onerror="this.onerror=null;this.src='${DEFAULT_PHOTO}'">
          <span class="pet-tag" style="background:${tagBg}; color:${tagColor};">${esc(pet.status)}</span>
        </div>
        <div class="pet-info">
          <h2 class="pet-name">${esc(pet.name)}</h2>
          <div class="pet-meta">${esc(pet.breed)} • ${esc(pet.age)} • ${esc(pet.gender)}</div>
          <p class="pet-desc">${esc(pet.desc)}</p>
          <div class="pet-badges">${badgesHtml}</div>
          <button class="adopt-btn" ${adopted ? 'disabled style="background:#cbd5e0; cursor:not-allowed;"' : ''} onclick="openAdoptModal('${esc(pet.id)}')">
            ${adopted ? 'Already Adopted 🎉' : 'Apply to Adopt 💌'}
          </button>
        </div>
      </div>`;
  }).join('');
}

function applyFilter() {
  renderPetCards();
}

// ---------- Adoption application ----------
function openAdoptModal(petId) {
  if (currentUser.role === 'guest') {
    alert('🔒 Please sign in (or create an account) before submitting an application.');
    openLoginModal();
    return;
  }
  if (currentUser.role !== 'adopter') {
    alert('Staff accounts cannot submit adoption applications.');
    return;
  }
  const pet = petsData.find(p => p.id === petId);
  if (!pet) return;

  currentSelectedPetId = pet.id;
  document.getElementById('modalPetName').textContent = `${pet.name} (${pet.breed})`;
  document.getElementById('applicantName').value = currentUser.name;
  document.getElementById('applicantEmail').value = currentUser.email || '';
  document.getElementById('adoptModal').style.display = 'flex';
}

function closeAdoptModal() {
  document.getElementById('adoptModal').style.display = 'none';
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const payload = {
    pet_id: currentSelectedPetId,
    applicant: document.getElementById('applicantName').value.trim(),
    email: document.getElementById('applicantEmail').value.trim(),
    phone: document.getElementById('applicantPhone').value.trim() || 'N/A',
    experience: document.getElementById('applicantExperience').value.trim()
  };

  try {
    const created = await adoptionApi('/api/adoptions', { method: 'POST', body: payload });
    document.getElementById('adoptForm').reset();
    closeAdoptModal();
    alert(`🎉 Application submitted successfully!\n\nYour Reference ID: ${created.id}\n"${created.pet}" is now marked as "Pending Adoption 🟡" while under review!`);
    switchTab('tracking');
  } catch (err) {
    alert(`⚠️ Could not submit your application:\n\n${err.message}`);
  }
}

// ---------- Application status tracking ----------
function setupTrackingPage() {
  const form = document.getElementById('trackingForm');
  const container = document.getElementById('statusResultsContainer');
  container.innerHTML = '';

  if (currentUser.role === 'adopter') {
    form.style.display = 'none';
    document.getElementById('trackingTitle').textContent = 'My Applications';
    document.getElementById('trackingHint').textContent = 'The real-time status of every application you have submitted.';
    adoptionApi('/api/adoptions/mine')
      .then(renderStatusCards)
      .catch(err => { container.innerHTML = `<p style="color: var(--text-muted);">${esc(err.message)}</p>`; });
  } else {
    form.style.display = 'flex';
    document.getElementById('trackingTitle').textContent = 'Lookup Your Application';
    document.getElementById('trackingHint').innerHTML =
      'Enter your Application Reference Number (e.g. <code>APP-2026-001</code>) and the email used on the application, or sign in to see all of yours.';
  }
}

async function checkApplicationStatus(e) {
  if (e) e.preventDefault();
  const container = document.getElementById('statusResultsContainer');
  const id = document.getElementById('trackingInput').value.trim();
  const email = document.getElementById('trackingEmail').value.trim();
  if (!id || !email) {
    alert('Please enter both the Application Reference Number and the email address.');
    return;
  }
  try {
    const app = await adoptionApi(`/api/adoptions/lookup?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`);
    renderStatusCards([app]);
  } catch (err) {
    container.innerHTML = `
      <div class="status-result-card" style="text-align: center; color: var(--text-muted);">
        <p>🔍 No application found for that reference and email.</p>
        <small>Please check both and try again.</small>
      </div>`;
  }
}

function renderStatusCards(apps) {
  const container = document.getElementById('statusResultsContainer');
  if (!apps.length) {
    container.innerHTML = `
      <div class="status-result-card" style="text-align: center; color: var(--text-muted);">
        <p>📭 You have not submitted any applications yet.</p>
      </div>`;
    return;
  }

  container.innerHTML = apps.map(app => {
    let badgeText = app.status, badgeBg = '#FEEBC8', badgeColor = '#C05621';
    let noteText = '💡 Your application is currently being assessed by shelter staff.';
    let s2 = 'step step-active', l2 = 'step-line', s3 = 'step', l3 = 'step-line', s4 = 'step';
    let step3Title = 'Interview';

    if (app.status === 'Interview') {
      s2 = 'step step-done'; l2 = 'step-line active'; s3 = 'step step-active';
      noteText = '📞 Great news - the shelter would like to interview you. They will be in touch.';
    } else if (app.status === 'Approved') {
      badgeBg = '#C6F6D5'; badgeColor = '#22543D';
      s2 = 'step step-done'; l2 = 'step-line active'; s3 = 'step step-done'; l3 = 'step-line active'; s4 = 'step step-done';
      noteText = '🎉 Congratulations! Your adoption has been approved. Our team will contact you for pet pickup!';
    } else if (app.status === 'Not Selected') {
      badgeBg = '#FED7D7'; badgeColor = '#9B2C2C'; badgeText = 'Not Selected ✕';
      s2 = 'step step-done';
      noteText = 'ℹ️ Another suitable home was selected for this pet. Thank you for your interest; please explore other rescue companions!';
    }

    return `
      <div class="status-result-card">
        <div class="status-card-header">
          <div>
            <h3>🐾 Pet Applied: ${esc(app.pet)} <span style="font-size:0.85rem; color:#718096; font-weight:normal;">(${esc(app.id)})</span></h3>
            <span class="status-subtext">Applicant: <strong>${esc(app.applicant)}</strong></span>
          </div>
          <span class="badge status-pill" style="background:${badgeBg}; color:${badgeColor}; font-weight:700;">${esc(badgeText)}</span>
        </div>
        <div class="stepper-wrap">
          <div class="step step-done"><div class="step-circle">✓</div><div class="step-title">Submitted</div></div>
          <div class="step-line active"></div>
          <div class="${s2}"><div class="step-circle">2</div><div class="step-title">Under Review</div></div>
          <div class="${l2}"></div>
          <div class="${s3}"><div class="step-circle">3</div><div class="step-title">${step3Title}</div></div>
          <div class="${l3}"></div>
          <div class="${s4}"><div class="step-circle">4</div><div class="step-title">${app.status === 'Approved' ? 'Approved 🎉' : 'Decision'}</div></div>
        </div>
        <p class="status-note">${noteText}</p>
      </div>`;
  }).join('');
}

// ---------- Staff portal ----------
function renderStaffTables() {
  renderStaffPetsTable();
  renderStaffAppsTable();
}

function updateStaffStats() {
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  set('statActive', petsData.filter(p => p.status !== 'Adopted').length);
  set('statPending', applications.filter(a => a.status === 'Under Review' || a.status === 'Interview').length);
  set('statAdopted', petsData.filter(p => p.status === 'Adopted').length);
}

function renderStaffPetsTable() {
  const tbody = document.getElementById('staffPetsTableBody');
  if (!tbody) return;

  tbody.innerHTML = petsData.map(pet => {
    let badgeColor = 'background:#c6f6d5; color:#22543d;';
    if (pet.status === 'Pending Adoption') badgeColor = 'background:#feebc8; color:#c05621;';
    if (pet.status === 'Adopted') badgeColor = 'background:#fed7d7; color:#c53030;';
    return `
      <tr>
        <td><code>${esc(pet.id)}</code></td>
        <td><strong>${esc(pet.name)}</strong></td>
        <td>${pet.species === 'dog' ? '🐶' : '🐱'} ${esc(pet.breed)}</td>
        <td><span class="badge" style="${badgeColor}">${esc(pet.status)}</span></td>
        <td>
          <button class="action-btn" onclick="openEditPetModal('${esc(pet.id)}')">✏️ Edit</button>
          <button class="action-btn" style="background:#fed7d7; color:#9b2c2c;" onclick="deletePet('${esc(pet.id)}')">🗑 Delete</button>
        </td>
      </tr>`;
  }).join('');
  updateStaffStats();
}

function renderStaffAppsTable() {
  const tbody = document.getElementById('staffTableBody');
  if (!tbody) return;

  tbody.innerHTML = applications.map(app => {
    let badgeClass = 'background:#feebc8; color:#c05621;';
    if (app.status === 'Approved') badgeClass = 'background:#c6f6d5; color:#22543d;';
    if (app.status === 'Not Selected') badgeClass = 'background:#fed7d7; color:#9b2c2c;';

    let actionBtn = `<button class="action-btn" onclick="approveApplication('${esc(app.id)}')">Approve</button>`;
    if (app.status === 'Approved') actionBtn = `<button class="action-btn disabled">Finalized ✓</button>`;
    else if (app.status === 'Not Selected') actionBtn = `<button class="action-btn disabled" style="background:#fed7d7; color:#9b2c2c;">Closed ✕</button>`;
    actionBtn += ` <button class="action-btn" style="background:#fed7d7; color:#9b2c2c;" onclick="deleteApplication('${esc(app.id)}')">🗑</button>`;

    return `
      <tr>
        <td><code>${esc(app.id)}</code></td>
        <td><strong>${esc(app.applicant)}</strong><br><small style="color:#718096;">${esc(app.email)}</small></td>
        <td>${esc(app.pet)}</td>
        <td><span class="badge" style="${badgeClass}">${esc(app.status)}</span></td>
        <td>${actionBtn}</td>
      </tr>`;
  }).join('');
  updateStaffStats();
}

async function approveApplication(appId) {
  const target = applications.find(a => a.id === appId);
  if (!target) return;
  try {
    await adoptionApi(`/api/adoptions/${encodeURIComponent(appId)}/status`, { method: 'PUT', body: { status: 'Approved' } });
    alert(`✅ Application ${appId} for ${target.applicant} has been APPROVED! 🎉\n\n"${target.pet}" is now officially ADOPTED.\nOther open applications for this pet were closed as "Not Selected".`);
  } catch (err) {
    alert(`⚠️ Could not approve:\n\n${err.message}`);
  }
  await refreshAll();
}

async function deleteApplication(appId) {
  if (!confirm(`Delete application ${appId}? This cannot be undone.`)) return;
  try {
    await adoptionApi(`/api/adoptions/${encodeURIComponent(appId)}`, { method: 'DELETE' });
  } catch (err) {
    alert(`⚠️ Could not delete:\n\n${err.message}`);
  }
  await refreshAll();
}

async function deletePet(petId) {
  const pet = petsData.find(p => p.id === petId);
  if (!pet || !confirm(`Remove ${pet.name} (${pet.id}) from the catalogue? This cannot be undone.`)) return;
  try {
    await petApi(`/api/pets/${encodeURIComponent(petId)}`, { method: 'DELETE' });
  } catch (err) {
    alert(`⚠️ Could not delete:\n\n${err.message}`);
  }
  await refreshAll();
}

// ---------- Authentication ----------
function openLoginModal() { document.getElementById('loginModal').style.display = 'flex'; }
function closeLoginModal() { document.getElementById('loginModal').style.display = 'none'; }

function showAuthTab(which) {
  const login = which === 'login';
  document.getElementById('loginForm').style.display = login ? 'block' : 'none';
  document.getElementById('registerForm').style.display = login ? 'none' : 'block';
  document.getElementById('tabLogin').style.background = login ? '' : '#a0aec0';
  document.getElementById('tabRegister').style.background = login ? '#a0aec0' : '';
}

function applySession(token, user) {
  authToken = token;
  currentUser = user;
  setStoredSession(token, user);
  updateAuthUI();
}

function clearSession() {
  authToken = null;
  currentUser = GUEST;
  applications = [];
  setStoredSession(null);
  updateAuthUI();
}

function updateAuthUI() {
  const staff = currentUser.role === 'staff';
  const guest = currentUser.role === 'guest';
  const btn = document.getElementById('authBtn');
  document.getElementById('nav-staff').style.display = staff ? 'inline-block' : 'none';
  document.getElementById('nav-tracking').style.display = staff ? 'none' : 'inline-block';
  document.getElementById('nav-pets').textContent = staff ? '🐾 View Public Catalog' : 'Find a Pet';
  if (guest) {
    btn.textContent = '👤 Login';
    btn.classList.remove('logged-in');
    btn.onclick = openLoginModal;
  } else {
    btn.textContent = `${staff ? '🛡️' : '🐶'} ${currentUser.name} (Logout)`;
    btn.classList.add('logged-in');
    btn.onclick = logout;
  }
}

function afterSignIn() {
  closeLoginModal();
  document.getElementById('loginForm').reset();
  document.getElementById('registerForm').reset();
  if (currentUser.role === 'staff') {
    alert(`🛡️ Signed in as ${currentUser.name}!\n\nStaff Management Portal unlocked.`);
    switchTab('staff');
  } else {
    alert(`🐶 Welcome, ${currentUser.name}!\n\nYou can now submit adoption applications.`);
    switchTab('pets');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  try {
    const res = await adoptionApi('/api/auth/login', {
      method: 'POST',
      body: { username: document.getElementById('loginUser').value.trim(), password: document.getElementById('loginPass').value }
    });
    applySession(res.token, { ...res.user, role: res.user.role });
    afterSignIn();
  } catch (err) {
    alert(`⚠️ ${err.message}`);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  try {
    const res = await adoptionApi('/api/auth/register', {
      method: 'POST',
      body: {
        name: document.getElementById('regName').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        username: document.getElementById('regUser').value.trim(),
        password: document.getElementById('regPass').value
      }
    });
    applySession(res.token, res.user);
    afterSignIn();
  } catch (err) {
    alert(`⚠️ ${err.message}`);
  }
}

function logout() {
  clearSession();
  alert('You have logged out.');
  switchTab('pets');
}

async function restoreSession() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('pawme_session') || 'null'); } catch (e) { /* ignore */ }
  if (!saved || !saved.token) return;
  authToken = saved.token;
  try {
    const user = await adoptionApi('/api/auth/me');
    applySession(saved.token, user);
  } catch (err) {
    clearSession();
  }
}

// ---------- Add / edit pets ----------
function openAddPetModal() {
  populateBreedSelect('newPetBreed', 'newPetBreedOther', document.getElementById('newPetSpecies').value);
  document.getElementById('addPetModal').style.display = 'flex';
}

function closeAddPetModal() {
  document.getElementById('addPetModal').style.display = 'none';
}

function getPhotoForBreed(species, breed) {
  const b = breed.toLowerCase();
  if (species === 'cat') return 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=600&q=80';
  if (b.includes('corgi')) return 'https://images.unsplash.com/photo-1612536057832-2ff7ead58194?auto=format&fit=crop&w=600&q=80';
  if (b.includes('golden')) return 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80';
  if (b.includes('shiba')) return 'images/shiba.jpg';
  if (b.includes('husky')) return 'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?auto=format&fit=crop&w=600&q=80';
  if (b.includes('collie') || b.includes('border')) return 'https://images.unsplash.com/photo-1503256207526-0d5d80fa2f33?auto=format&fit=crop&w=600&q=80';
  if (b.includes('beagle')) return 'https://images.unsplash.com/photo-1505628346881-b72b27e84530?auto=format&fit=crop&w=600&q=80';
  if (b.includes('poodle')) return 'https://images.unsplash.com/photo-1516371535707-512a1e83bb9a?auto=format&fit=crop&w=600&q=80';
  if (b.includes('labrador')) return 'https://images.unsplash.com/photo-1591769225440-811ad7d6eab2?auto=format&fit=crop&w=600&q=80';
  return 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80';
}

function formatAge(num, unit) {
  const singular = String(num) === '1';
  return `${num} ${unit === 'Years' ? (singular ? 'Year' : 'Years') : (singular ? 'Month' : 'Months')} Old`;
}

async function handleAddPetSubmit(e) {
  e.preventDefault();
  const species = document.getElementById('newPetSpecies').value;
  const breed = getBreedValue('newPetBreed', 'newPetBreedOther');
  const payload = {
    name: document.getElementById('newPetName').value.trim(),
    species,
    breed,
    age: formatAge(document.getElementById('newPetAgeNum').value.trim(), document.getElementById('newPetAgeUnit').value),
    gender: document.getElementById('newPetGender').value,
    desc: document.getElementById('newPetDesc').value.trim(),
    photo: document.getElementById('newPetPhoto').value.trim() || getPhotoForBreed(species, breed),
    status: 'Available'
  };

  try {
    const created = await petApi('/api/pets', { method: 'POST', body: payload });
    document.getElementById('addPetForm').reset();
    closeAddPetModal();
    alert(`🎉 "${created.name}" (${created.breed}, ${created.age}) published to pet-service!`);
    await fetchPetsFromBackend();
    switchTab('pets');
  } catch (err) {
    alert(`⚠️ Could not publish the pet:\n\n${err.message}`);
  }
}

function openEditPetModal(petId) {
  const pet = petsData.find(p => p.id === petId);
  if (!pet) return;

  document.getElementById('editPetId').value = pet.id;
  document.getElementById('editPetName').value = pet.name;
  populateBreedSelect('editPetBreed', 'editPetBreedOther', pet.species, pet.breed);
  document.getElementById('editPetAgeNum').value = parseInt(pet.age, 10) || 2;
  document.getElementById('editPetAgeUnit').value = pet.age.toLowerCase().includes('month') ? 'Months' : 'Years';
  document.getElementById('editPetStatus').value = pet.status;
  document.getElementById('editPetDesc').value = pet.desc;
  document.getElementById('editPetModal').style.display = 'flex';
}

function closeEditPetModal() {
  document.getElementById('editPetModal').style.display = 'none';
}

async function handleEditPetSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editPetId').value;
  const payload = {
    name: document.getElementById('editPetName').value.trim(),
    breed: getBreedValue('editPetBreed', 'editPetBreedOther'),
    age: formatAge(document.getElementById('editPetAgeNum').value.trim(), document.getElementById('editPetAgeUnit').value),
    status: document.getElementById('editPetStatus').value,
    desc: document.getElementById('editPetDesc').value.trim()
  };
  try {
    const updated = await petApi(`/api/pets/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
    alert(`✅ Pet ${updated.name} (${updated.id}) updated successfully!\n\nAge: ${updated.age}, Status: ${updated.status}`);
    closeEditPetModal();
  } catch (err) {
    alert(`⚠️ Could not update the pet:\n\n${err.message}`);
  }
  await fetchPetsFromBackend();
}

// Modal click-outside handlers
window.onclick = function (event) {
  if (event.target === document.getElementById('adoptModal')) closeAdoptModal();
  if (event.target === document.getElementById('loginModal')) closeLoginModal();
  if (event.target === document.getElementById('addPetModal')) closeAddPetModal();
  if (event.target === document.getElementById('editPetModal')) closeEditPetModal();
};

// ---------- Initial load ----------
(async function init() {
  updateAuthUI();
  await restoreSession();
  await refreshAll();
})();
