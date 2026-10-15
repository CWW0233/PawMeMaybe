/**
 * PawMeMaybe - Frontend Application Logic
 * Interactive prototype simulating REST API calls to pet-service & adoption-service
 */

// Simulated In-Memory Database for Pets (pet-service on GKE)
let petsData = [
  {
    id: "PET-001",
    name: "Mochi",
    species: "dog",
    breed: "Japanese Shiba Inu",
    age: "2 Years Old",
    gender: "Male",
    status: "Available",
    desc: "Classic red sesame Shiba Inu! High spirit, loyal, and fully house-trained. Vaccinated and microchipped.",
    photo: "images/shiba.jpg",
    badges: ["Vaccinated", "Microchipped", "Good with kids"]
  },
  {
    id: "PET-002",
    name: "Bailey",
    species: "dog",
    breed: "Golden Retriever",
    age: "3 Years Old",
    gender: "Female",
    status: "Available",
    desc: "Gentle giant with a heart of gold. Loves swimming and cuddle sessions on lazy Sundays.",
    photo: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80",
    badges: ["House Trained", "Health Checked"]
  },
  {
    id: "PET-003",
    name: "Luna",
    species: "cat",
    breed: "British Shorthair",
    age: "1 Year Old",
    gender: "Female",
    status: "Available",
    desc: "Calm, curious, and adores purring by warm windows. Great companion for apartment living.",
    photo: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80",
    badges: ["Desexed", "Indoor Only"]
  },
  {
    id: "PET-004",
    name: "Waffles",
    species: "dog",
    breed: "Pembroke Corgi",
    age: "8 Months",
    gender: "Male",
    status: "Available",
    desc: "Small legs with immense charm! Loves squeaky toys, snacks, and making new dog friends.",
    photo: "https://images.unsplash.com/photo-1612536057832-2ff7ead58194?auto=format&fit=crop&w=600&q=80",
    badges: ["Puppy Class Grad", "Microchipped"]
  }
];

// Simulated In-Memory Database for Applications (adoption-service on GKE)
let applications = [
  {
    id: "APP-2026-001",
    applicant: "John Citizen",
    email: "john@example.com",
    phone: "0412 345 678",
    pet: "Mochi (Japanese Shiba Inu)",
    experience: "Fenced yard with loving family.",
    status: "Under Review"
  },
  {
    id: "APP-2026-002",
    applicant: "Sarah Miller",
    email: "sarah@example.com",
    phone: "0498 765 432",
    pet: "Bailey (Golden Retriever)",
    experience: "Experienced dog owner, working from home.",
    status: "Approved"
  }
];

let currentUser = {
  role: 'adopter',
  name: 'Guest Adopter'
};

let currentSelectedPet = "";

// 1. Navigation & Page View Router
function toggleMobileMenu() {
  const btn = document.getElementById('hamburgerBtn');
  const nav = document.getElementById('navLinks');
  btn.classList.toggle('open');
  nav.classList.toggle('show');
}

function closeMobileMenu() {
  const btn = document.getElementById('hamburgerBtn');
  const nav = document.getElementById('navLinks');
  if (btn && nav) {
    btn.classList.remove('open');
    nav.classList.remove('show');
  }
}

function switchTab(tabName) {
  closeMobileMenu();

  document.getElementById('page-pets').style.display = 'none';
  document.getElementById('page-tracking').style.display = 'none';
  document.getElementById('page-staff').style.display = 'none';

  document.getElementById('nav-pets').classList.remove('active');
  document.getElementById('nav-tracking').classList.remove('active');
  document.getElementById('nav-staff').classList.remove('active');

  if (tabName === 'pets') {
    document.getElementById('page-pets').style.display = 'block';
    document.getElementById('nav-pets').classList.add('active');
    renderPetCards();
  } else if (tabName === 'tracking') {
    document.getElementById('page-tracking').style.display = 'block';
    document.getElementById('nav-tracking').classList.add('active');
  } else if (tabName === 'staff') {
    document.getElementById('page-staff').style.display = 'block';
    document.getElementById('nav-staff').classList.add('active');
    renderStaffTables();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 2. Render Pet Cards Dynamically from petsData (Feature 1 & Feature 2)
function renderPetCards() {
  const grid = document.getElementById('petGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const species = document.getElementById('speciesFilter').value;
  const breed = document.getElementById('breedInput').value.toLowerCase().trim();

  petsData.forEach(pet => {
    const matchSpecies = (species === 'all' || pet.species === species);
    const matchBreed = (!breed || pet.breed.toLowerCase().includes(breed) || pet.name.toLowerCase().includes(breed));

    if (matchSpecies && matchBreed) {
      let tagBg = '#ffffff';
      let tagColor = 'var(--accent)';
      if (pet.status === 'Adopted') {
        tagBg = '#FED7D7'; tagColor = '#C53030';
      } else if (pet.status === 'Pending Adoption') {
        tagBg = '#FEEBC8'; tagColor = '#C05621';
      }

      const card = document.createElement('div');
      card.className = 'pet-card';
      card.setAttribute('data-species', pet.species);
      card.setAttribute('data-breed', pet.breed.toLowerCase());

      const badgesHtml = pet.badges.map(b => `<span class="badge">${b}</span>`).join(' ');

      card.innerHTML = `
        <div class="pet-img-wrap">
          <img src="${pet.photo}" alt="${pet.name}" onerror="this.src='images/shiba.jpg'">
          <span class="pet-tag" style="background:${tagBg}; color:${tagColor};">${pet.status}</span>
        </div>
        <div class="pet-info">
          <h2 class="pet-name">${pet.name}</h2>
          <div class="pet-meta">${pet.breed} • ${pet.age} • ${pet.gender}</div>
          <p class="pet-desc">${pet.desc}</p>
          <div class="pet-badges">
            ${badgesHtml}
          </div>
          <button class="adopt-btn" ${pet.status === 'Adopted' ? 'disabled style="background:#cbd5e0; cursor:not-allowed;"' : ''} onclick="openAdoptModal('${pet.name} (${pet.breed})')">
            ${pet.status === 'Adopted' ? 'Already Adopted 🎉' : 'Apply to Adopt 💌'}
          </button>
        </div>
      `;
      grid.appendChild(card);
    }
  });
}

function applyFilter() {
  renderPetCards();
}

// 3. Adoption Modal & Form Submission (Feature 3)
function openAdoptModal(petName) {
  currentSelectedPet = petName;
  document.getElementById('modalPetName').innerText = petName;
  document.getElementById('adoptModal').style.display = 'flex';
}

function closeAdoptModal() {
  document.getElementById('adoptModal').style.display = 'none';
}

function handleFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('applicantName').value.trim();
  const email = document.getElementById('applicantEmail').value.trim();
  const phone = document.getElementById('applicantPhone').value.trim();
  const exp = document.getElementById('applicantExperience').value.trim();

  const newId = 'APP-2026-00' + (applications.length + 1);

  const newApp = {
    id: newId,
    applicant: name,
    email: email,
    phone: phone,
    pet: currentSelectedPet || "Rescue Pet",
    experience: exp,
    status: "Under Review"
  };

  applications.unshift(newApp);
  document.getElementById('adoptForm').reset();
  closeAdoptModal();

  alert(`🎉 Application submitted successfully!\n\nYour Reference ID: ${newId}\nYou can now track this application in "Application Tracking"!`);

  document.getElementById('trackingInput').value = newId;
  switchTab('tracking');
  checkApplicationStatus();
}

// 4. Application Status Tracking & Stepper (Feature 4)
function checkApplicationStatus() {
  const query = document.getElementById('trackingInput').value.trim().toLowerCase();
  const card = document.getElementById('statusResultCard');

  if (!query) {
    alert('Please enter an Application Reference Number (e.g. APP-2026-001) or Email.');
    return;
  }

  const app = applications.find(a => 
    a.id.toLowerCase() === query || 
    a.email.toLowerCase() === query ||
    a.applicant.toLowerCase().includes(query)
  );

  if (!app) {
    alert(`No application found for "${query}".\nPlease check the ID or try "APP-2026-001" / "sarah@example.com".`);
    return;
  }

  card.style.display = 'block';
  document.getElementById('statusApplicantName').innerText = `Applicant: ${app.applicant} (${app.id})`;
  document.getElementById('statusPetApplied').innerText = `Pet Applied: ${app.pet}`;
  
  updateStepperDisplay(app.status);
}

function updateStepperDisplay(status) {
  const badge = document.getElementById('statusBadge');
  const note = document.getElementById('statusNote');

  ['step1', 'step2', 'step3', 'step4'].forEach(id => {
    document.getElementById(id).className = 'step';
  });
  ['line1', 'line2', 'line3'].forEach(id => {
    document.getElementById(id).className = 'step-line';
  });

  if (status === 'Submitted') {
    badge.innerText = 'Submitted';
    badge.style.background = '#E2E8F0';
    badge.style.color = '#4A5568';
    document.getElementById('step1').className = 'step step-active';
    note.innerText = '💡 Application received. Shelter team will begin verification shortly.';
  } else if (status === 'Under Review') {
    badge.innerText = 'Under Review';
    badge.style.background = '#FEEBC8';
    badge.style.color = '#C05621';
    document.getElementById('step1').className = 'step step-done';
    document.getElementById('line1').className = 'step-line active';
    document.getElementById('step2').className = 'step step-active';
    note.innerText = '💡 Your application is currently being assessed by shelter staff.';
  } else if (status === 'Interview') {
    badge.innerText = 'Interview Scheduled';
    badge.style.background = '#EBF8FF';
    badge.style.color = '#2B6CB0';
    document.getElementById('step1').className = 'step step-done';
    document.getElementById('step2').className = 'step step-done';
    document.getElementById('line1').className = 'step-line active';
    document.getElementById('line2').className = 'step-line active';
    document.getElementById('step3').className = 'step step-active';
    note.innerText = '📞 Phone or meet-and-greet interview scheduled with the applicant!';
  } else if (status === 'Approved') {
    badge.innerText = 'Approved 🎉';
    badge.style.background = '#C6F6D5';
    badge.style.color = '#22543D';
    ['step1', 'step2', 'step3', 'step4'].forEach(id => {
      document.getElementById(id).className = 'step step-done';
    });
    ['line1', 'line2', 'line3'].forEach(id => {
      document.getElementById(id).className = 'step-line active';
    });
    note.innerText = '🎉 Congratulations! Your adoption has been approved. Please prepare for pet pickup!';
  }
}

// 5. Staff Portal: Render Pet Inventory & Application Tables
function renderStaffTables() {
  renderStaffPetsTable();
  renderStaffAppsTable();
}

function renderStaffPetsTable() {
  const tbody = document.getElementById('staffPetsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  petsData.forEach(pet => {
    const tr = document.createElement('tr');
    let badgeColor = 'background:#c6f6d5; color:#22543d;';
    if (pet.status === 'Pending Adoption') badgeColor = 'background:#feebc8; color:#c05621;';
    if (pet.status === 'Adopted') badgeColor = 'background:#fed7d7; color:#c53030;';

    tr.innerHTML = `
      <td><code>${pet.id}</code></td>
      <td><strong>${pet.name}</strong></td>
      <td>${pet.species === 'dog' ? '🐶' : '🐱'} ${pet.breed}</td>
      <td><span class="badge" style="${badgeColor}">${pet.status}</span></td>
      <td>
        <button class="action-btn" onclick="openEditPetModal('${pet.id}')">✏️ Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update stat count
  const activeCount = petsData.filter(p => p.status !== 'Adopted').length;
  const statNum = document.querySelector('.stat-num');
  if (statNum) statNum.innerText = activeCount;
}

function renderStaffAppsTable() {
  const tbody = document.getElementById('staffTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  applications.forEach(app => {
    const tr = document.createElement('tr');
    let badgeClass = 'background:#feebc8; color:#c05621;';
    if (app.status === 'Approved') badgeClass = 'background:#c6f6d5; color:#22543d;';

    let actionBtn = `<button class="action-btn" onclick="approveApplication('${app.id}')">Approve</button>`;
    if (app.status === 'Approved') {
      actionBtn = `<button class="action-btn disabled">Finalized ✓</button>`;
    }

    tr.innerHTML = `
      <td><code>${app.id}</code></td>
      <td><strong>${app.applicant}</strong><br><small style="color:#718096;">${app.email}</small></td>
      <td>${app.pet}</td>
      <td><span class="badge" style="${badgeClass}">${app.status}</span></td>
      <td>${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

function approveApplication(appId) {
  const app = applications.find(a => a.id === appId);
  if (app) {
    app.status = 'Approved';
    alert(`✅ Application ${appId} for ${app.applicant} has been APPROVED!\n\nDatabase updated! If you switch to "Application Tracking", the progress bar is now fully green!`);
    renderStaffAppsTable();
  }
}

// 6. Authentication & Role Switcher
function openLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
}

function closeLoginModal() {
  document.getElementById('loginModal').style.display = 'none';
}

function loginAs(role) {
  if (role === 'staff') {
    currentUser = { role: 'staff', name: 'Staff Jane' };
    document.getElementById('nav-staff').style.display = 'inline-block';
    // In staff mode, hide Adopter-specific tracking tab to streamline UX
    document.getElementById('nav-tracking').style.display = 'none';
    document.getElementById('nav-pets').innerText = '🐾 View Public Catalog';
    document.getElementById('authBtn').innerHTML = '🛡️ Staff Jane (Logout)';
    document.getElementById('authBtn').classList.add('logged-in');
    document.getElementById('authBtn').onclick = logout;
    closeLoginModal();
    alert('🛡️ Logged in as Shelter Staff!\n\n Staff Management Portal unlocked!');
    switchTab('staff');
  } else {
    currentUser = { role: 'adopter', name: 'Adopter' };
    document.getElementById('nav-staff').style.display = 'none';
    document.getElementById('nav-tracking').style.display = 'inline-block';
    document.getElementById('nav-pets').innerText = 'Find a Pet';
    document.getElementById('authBtn').innerHTML = '🐶 Adopter (Logout)';
    document.getElementById('authBtn').classList.add('logged-in');
    document.getElementById('authBtn').onclick = logout;
    closeLoginModal();
    alert('🐶 Hi! Adopter!\n\nYou can browse pets and submit adoptions.');
    switchTab('pets');
  }
}

function logout() {
  currentUser = { role: 'adopter', name: 'Guest' };
  document.getElementById('nav-staff').style.display = 'none';
  document.getElementById('nav-tracking').style.display = 'inline-block';
  document.getElementById('nav-pets').innerText = 'Find a Pet';
  document.getElementById('authBtn').innerHTML = '👤 Login';
  document.getElementById('authBtn').classList.remove('logged-in');
  document.getElementById('authBtn').onclick = openLoginModal;
  alert('You have logged out.');
  switchTab('pets');
}

function handleManualLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.toLowerCase().trim();
  if (username.includes('staff') || username.includes('admin')) {
    loginAs('staff');
  } else {
    loginAs('adopter');
  }
}

// 7. Add New Pet & Edit Pet (CRUD for pet-service)
function openAddPetModal() {
  document.getElementById('addPetModal').style.display = 'flex';
}

function closeAddPetModal() {
  document.getElementById('addPetModal').style.display = 'none';
}

function getPhotoForBreed(species, breed) {
  const b = breed.toLowerCase();
  if (species === 'cat') {
    return 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=600&q=80';
  }
  if (b.includes('corgi')) return 'https://images.unsplash.com/photo-1612536057832-2ff7ead58194?auto=format&fit=crop&w=600&q=80';
  if (b.includes('golden')) return 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80';
  if (b.includes('shiba')) return 'images/shiba.jpg';
  if (b.includes('husky')) return 'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?auto=format&fit=crop&w=600&q=80';
  // Default cute rescue dog
  return 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80';
}

function handleAddPetSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('newPetName').value.trim();
  const species = document.getElementById('newPetSpecies').value;
  const breed = document.getElementById('newPetBreed').value.trim();
  const age = document.getElementById('newPetAge').value.trim();
  const gender = document.getElementById('newPetGender').value;
  const desc = document.getElementById('newPetDesc').value.trim();
  let photo = document.getElementById('newPetPhoto').value.trim() || getPhotoForBreed(species, breed);

  const newPet = {
    id: 'PET-00' + (petsData.length + 1),
    name: name,
    species: species,
    breed: breed,
    age: age,
    gender: gender,
    status: "Available",
    desc: desc,
    photo: photo,
    badges: ["Newly Rescued", "Health Checked"]
  };

  petsData.unshift(newPet);
  document.getElementById('addPetForm').reset();
  closeAddPetModal();

  alert(`🎉 "${name}" (${breed}) published via pet-service!\n\nProfile added with matching photo.`);
  renderPetCards();
  renderStaffPetsTable();
  switchTab('pets');
}

// Edit Pet
function openEditPetModal(petId) {
  const pet = petsData.find(p => p.id === petId);
  if (!pet) return;

  document.getElementById('editPetId').value = pet.id;
  document.getElementById('editPetName').value = pet.name;
  document.getElementById('editPetBreed').value = pet.breed;
  document.getElementById('editPetAge').value = pet.age;
  document.getElementById('editPetStatus').value = pet.status;
  document.getElementById('editPetDesc').value = pet.desc;

  document.getElementById('editPetModal').style.display = 'flex';
}

function closeEditPetModal() {
  document.getElementById('editPetModal').style.display = 'none';
}

function handleEditPetSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editPetId').value;
  const pet = petsData.find(p => p.id === id);

  if (pet) {
    pet.name = document.getElementById('editPetName').value.trim();
    pet.breed = document.getElementById('editPetBreed').value.trim();
    pet.age = document.getElementById('editPetAge').value.trim();
    pet.status = document.getElementById('editPetStatus').value;
    pet.desc = document.getElementById('editPetDesc').value.trim();

    alert(`✅ Pet ${pet.name} (${pet.id}) updated successfully via pet-service!`);
    closeEditPetModal();
    renderStaffPetsTable();
    renderPetCards();
  }
}

// Modal Click-Outside Handlers
window.onclick = function(event) {
  const adoptModal = document.getElementById('adoptModal');
  const loginModal = document.getElementById('loginModal');
  const addPetModal = document.getElementById('addPetModal');
  const editPetModal = document.getElementById('editPetModal');

  if (event.target === adoptModal) closeAdoptModal();
  if (event.target === loginModal) closeLoginModal();
  if (event.target === addPetModal) closeAddPetModal();
  if (event.target === editPetModal) closeEditPetModal();
};

// Initial Render
renderPetCards();
renderStaffTables();
