/**
 * PawMeMaybe - Frontend Logic
 * Connects to GKE backend microservices: pet-service and adoption-service
 */

function openAdoptModal(petName) {
  document.getElementById('modalPetName').innerText = petName;
  document.getElementById('adoptModal').style.display = 'flex';
}

function closeAdoptModal() {
  document.getElementById('adoptModal').style.display = 'none';
}

function handleFormSubmit(e) {
  e.preventDefault();
  // In later steps, this will make a real REST API POST call to adoption-service
  alert('🎉 Application submitted successfully! (This connects to adoption-service on GKE)');
  closeAdoptModal();
}

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

// Close modal when user clicks on background overlay
window.onclick = function(event) {
  const modal = document.getElementById('adoptModal');
  if (event.target === modal) {
    closeAdoptModal();
  }
};

/**
 * Feature 4: Application Status Tracking
 * Simulates real-time status inquiry from adoption-service
 */
function checkApplicationStatus() {
  const query = document.getElementById('trackingInput').value.trim();
  const card = document.getElementById('statusResultCard');

  if (!query) {
    alert('Please enter an Application Reference Number or Email.');
    return;
  }

  // Visual simulation for testing (will link to adoption-service REST API)
  card.style.display = 'block';
  
  if (query.toLowerCase().includes('approved') || query.includes('002')) {
    document.getElementById('statusApplicantName').innerText = 'Applicant: Sarah Miller';
    document.getElementById('statusPetApplied').innerText = 'Pet Applied: Bailey (Golden Retriever)';
    document.getElementById('statusBadge').innerText = 'Approved 🎉';
    document.getElementById('statusBadge').style.background = '#C6F6D5';
    document.getElementById('statusBadge').style.color = '#22543D';

    // Update stepper to full approved
    ['step1', 'step2', 'step3', 'step4'].forEach(id => {
      document.getElementById(id).className = 'step step-done';
    });
    ['line1', 'line2', 'line3'].forEach(id => {
      document.getElementById(id).className = 'step-line active';
    });
    document.getElementById('statusNote').innerText = '🎉 Congratulations! Your adoption has been approved. Our team will contact you for pickup schedule.';
  } else {
    // Default Under Review
    document.getElementById('statusApplicantName').innerText = 'Applicant: John Citizen (' + query + ')';
    document.getElementById('statusPetApplied').innerText = 'Pet Applied: Mochi (Shiba Inu)';
    document.getElementById('statusBadge').innerText = 'Under Review';
    document.getElementById('statusBadge').style.background = '#FEEBC8';
    document.getElementById('statusBadge').style.color = '#C05621';

    document.getElementById('step1').className = 'step step-done';
    document.getElementById('line1').className = 'step-line active';
    document.getElementById('step2').className = 'step step-active';
    document.getElementById('line2').className = 'step-line';
    document.getElementById('step3').className = 'step';
    document.getElementById('line3').className = 'step-line';
    document.getElementById('step4').className = 'step';
    document.getElementById('statusNote').innerText = '💡 Your application has been received and is currently being assessed by our shelter staff.';
  }
}

