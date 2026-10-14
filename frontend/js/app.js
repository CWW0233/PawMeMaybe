/**
 * PawMeMaybe - Frontend Application Logic
 * Interactive prototype simulating REST API calls to pet-service & adoption-service
 */

// Simulated In-Memory Database (will connect to MySQL on GKE)
let applications = [
  {
    id: "APP-2026-001",
    applicant: "John Citizen",
    email: "john@example.com",
    phone: "0412 345 678",
    pet: "Mochi (Shiba Inu)",
    experience: "Fenced yard with loving family.",
    status: "Under Review" // 'Submitted', 'Under Review', 'Interview', 'Approved'
  },
  {
    id: "APP-2026-002",
    applicant: "Sarah Miller",
    email: "sarah@example.com",
    phone: "0498 765 432",
    pet: "Bailey (Golden)",
    experience: "Experienced dog owner, working from home.",
    status: "Approved"
  }
];

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
  // Auto-close mobile menu if open
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
  } else if (tabName === 'tracking') {
    document.getElementById('page-tracking').style.display = 'block';
    document.getElementById('nav-tracking').classList.add('active');
  } else if (tabName === 'staff') {
    document.getElementById('page-staff').style.display = 'block';
    document.getElementById('nav-staff').classList.add('active');
    renderStaffTable();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 2. Pet Search & Filtering (Feature 1)
function applyFilter() {
  const species = document.getElementById('speciesFilter').value;
  const breed = document.getElementById('breedInput').value.toLowerCase().trim();
  const cards = document.querySelectorAll('.pet-card');

  cards.forEach(card => {
    const cardSpecies = card.getAttribute('data-species');
    const cardBreed = card.getAttribute('data-breed');

    const matchSpecies = (species === 'all' || cardSpecies === species);
    const matchBreed = (!breed || cardBreed.includes(breed));

    if (matchSpecies && matchBreed) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
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

  // Generate unique App ID
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

  // Save to list (simulating POST /api/adoptions)
  applications.unshift(newApp);

  // Clear form
  document.getElementById('adoptForm').reset();
  closeAdoptModal();

  alert(`🎉 Application submitted successfully!\n\nYour Reference ID: ${newId}\nYou can now track this application in "Application Tracking" or view it in "Staff Portal"!`);

  // Auto-switch to tracking view and show the newly created application!
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

  // Find in application records
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

  // Reset all steps
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

// 5. Staff Portal: Render Table & Live Approve Action
function renderStaffTable() {
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
    renderStaffTable();
  }
}

// Close modal when user clicks on background overlay
window.onclick = function(event) {
  const modal = document.getElementById('adoptModal');
  if (event.target === modal) {
    closeAdoptModal();
  }
};

// Initialize table on first load
renderStaffTable();
