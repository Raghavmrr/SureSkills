// ══════════════════════════════════════════════════════════════════════════════
//  SureSkills — Booking Form (app.js)
//  All data goes to the shared server API (bookings.json on server)
// ══════════════════════════════════════════════════════════════════════════════

// ── Alert helper ──────────────────────────────────────────────────────────────
function showAlert(type, icon, html) {
  const area = document.getElementById('alertArea');
  area.innerHTML = `<div class="alert alert-${type}"><span>${icon}</span> ${html}</div>`;
  area.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (type === 'success') setTimeout(() => { area.innerHTML = ''; }, 8000);
}

// ── Form submit ───────────────────────────────────────────────────────────────
document.getElementById('bookingForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const candidateName = document.getElementById('candidateName').value.trim();
  const contactNumber = document.getElementById('contactNumber').value.trim();
  const company       = document.getElementById('company').value.trim();
  const role          = document.getElementById('role').value.trim();
  const interviewDate      = document.getElementById('interviewDate').value;
  const interviewStartTime = document.getElementById('interviewStartTime').value;
  const interviewEndTime   = document.getElementById('interviewEndTime').value;
  const interviewStart     = interviewDate && interviewStartTime ? `${interviewDate}T${interviewStartTime}` : '';
  const interviewEnd       = interviewDate && interviewEndTime   ? `${interviewDate}T${interviewEndTime}`   : '';
  const round         = document.getElementById('round').value;
  const meetingLink   = document.getElementById('meetingLink').value.trim();
  const jd            = document.getElementById('jd').value.trim();

  // Basic validation
  if (!candidateName || !contactNumber || !company || !role || !interviewDate || !interviewStartTime || !interviewEndTime || !round) {
    showAlert('error', '⚠️', 'Please fill in all required fields before submitting.');
    return;
  }
  
  if (new Date(interviewEnd) <= new Date(interviewStart)) {
    showAlert('error', '⚠️', 'End time must be after the start time.');
    return;
  }
  if (!/\d{7,}/.test(contactNumber.replace(/\D/g, ''))) {
    showAlert('error', '⚠️', 'Please enter a valid contact number (at least 7 digits).');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> Submitting…';

  try {
    const res = await fetch('/api/bookings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateName, contactNumber, company, role, interviewStart, interviewEnd, round, meetingLink, jd }),
    });

    if (res.status === 409) {
      // Slot too close to an approved booking
      showAlert('warn', '🚫',
        'Please keep at least <strong>30 minutes</strong> between interview slots. This time overlaps with an approved booking.');
      document.getElementById('interviewStart').focus();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Server error');
    }

    // Success
    this.reset();
    showAlert('success', '✅',
      'Your interview request has been submitted! The admin will review and confirm your slot.');

  } catch (err) {
    showAlert('error', '❌', 'Failed to submit: ' + err.message + '. Is the server running?');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>🚀</span> Submit Booking Request';
  }
});

// ── Set minimum datetime to now ───────────────────────────────────────────────
(function () {
  const dtDate  = document.getElementById('interviewDate');
  if (dtDate) {
    const today = new Date().toISOString().split('T')[0];
    dtDate.min = today;
  }
})();

// ── Fetch today's slots ───────────────────────────────────────────────────────
async function loadTodaysSlots() {
  const container = document.getElementById('todaysSlotsContainer');
  if (!container) return;
  
  try {
    const res = await fetch('/api/todays-slots');
    if (!res.ok) throw new Error('Failed to fetch slots from CSV');
    const slots = await res.json();
    
    // Filter out today's slots
    const offset = new Date().getTimezoneOffset() * 60000;
    const todayStr = new Date(Date.now() - offset).toISOString().split('T')[0];
    const todaysSlots = slots.filter(s => {
      return s.interviewStart && s.interviewStart.startsWith(todayStr);
    });
    
    todaysSlots.sort((a,b) => new Date(a.interviewStart) - new Date(b.interviewStart));
    
    const card = document.getElementById('todaysSlotsCard');
    
    if (todaysSlots.length === 0) {
      if (card) card.style.display = 'none';
      return;
    }
    
    if (card) card.style.display = 'block';
    container.innerHTML = todaysSlots.map(s => {
      const timeStart = new Date(s.interviewStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const timeEnd   = new Date(s.interviewEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      return `
        <div style="padding:10px; border:1px solid var(--border); border-radius:6px; background:var(--card-bg); display:flex; justify-content:space-between; align-items:center;">
          <div><strong>${s.candidateName}</strong> <span style="color:var(--muted);font-size:0.85rem">(${s.round} @ ${s.company})</span></div>
          <div style="font-weight:600;color:var(--primary);">${timeStart} - ${timeEnd}</div>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="color:var(--danger);font-size:0.9rem;">Could not load today's slots.</div>`;
  }
}

// Call on load
document.addEventListener('DOMContentLoaded', loadTodaysSlots);
