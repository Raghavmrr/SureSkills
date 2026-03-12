// ══════════════════════════════════════════════════════════════════════════════
//  SureSkills — Admin Dashboard (admin.js)
//  Data fetched from shared server API — works across all network devices.
//  Google Calendar: free URL method (no GCP / no payment required).
// ══════════════════════════════════════════════════════════════════════════════

// ── Config ────────────────────────────────────────────────────────────────────
const CALENDAR_EMAIL = 'remote.raghav@gmail.com';

// ── State ─────────────────────────────────────────────────────────────────────
let activeFilter = 'all';
let allBookings = [];
let selectedId = null;
let pollTimer = null;

// ── Alert helper ──────────────────────────────────────────────────────────────
function showAlert(type, icon, msg, areaId = 'alertArea') {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.innerHTML = `<div class="alert alert-${type}"><span>${icon}</span> ${msg}</div>`;
  setTimeout(() => { if (area) area.innerHTML = ''; }, 6000);
}

// ── Initialization ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  startPolling();
});

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Load / Poll ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await apiFetch('/api/bookings');
    allBookings = data.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    renderStats();
    renderTable();
  } catch (err) {
    showAlert('error', '❌', 'Could not reach server: ' + err.message);
  }
}

function startPolling() {
  // Refresh bookings every 5 seconds so new submissions appear automatically
  pollTimer = setInterval(loadDashboard, 5000);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('statTotal').textContent = allBookings.length;
  document.getElementById('statPending').textContent = allBookings.filter(b => b.status === 'pending').length;
  document.getElementById('statApproved').textContent = allBookings.filter(b => b.status === 'approved').length;
  document.getElementById('statRejected').textContent = allBookings.filter(b => b.status === 'rejected').length;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  const filtered = activeFilter === 'all'
    ? allBookings
    : allBookings.filter(b => b.status === activeFilter);

  const tbody = document.getElementById('bookingsBody');
  const empty = document.getElementById('emptyState');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = filtered.map((b, idx) => `
    <tr data-id="${b.id}" title="Click to view details">
      <td style="color:var(--muted);font-size:0.8rem">${idx + 1}</td>
      <td>
        <div style="font-weight:600">${esc(b.candidateName)}</div>
        <div style="color:var(--muted);font-size:0.8rem">${esc(b.contactNumber)}</div>
      </td>
      <td>${esc(b.company)}</td>
      <td>${esc(b.role)}</td>
      <td><span class="badge" style="background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3)">${esc(b.round)}</span></td>
      <td style="white-space:nowrap">${formatDate(b.interviewStart)}<br><span style="color:var(--muted);font-size:0.8rem">${formatTime(b.interviewStart)} → ${formatTime(b.interviewEnd)}</span></td>
      <td><span class="badge badge-${b.status}">${capitalize(b.status)}</span></td>
      <td class="actions-cell" onclick="event.stopPropagation()">
        ${b.status === 'pending' ? `
          <button class="btn btn-success btn-sm" onclick="updateStatus('${b.id}','approved')" title="Approve">✅</button>
          <button class="btn btn-danger  btn-sm" onclick="updateStatus('${b.id}','rejected')" title="Reject">❌</button>
        ` : ''}
        ${b.status === 'approved' ? `
          <button class="btn btn-calendar btn-sm" onclick="addToCalendar('${b.id}')" title="Add to Google Calendar">
            📅 ${b.calendarAdded ? '✅' : '+'}
          </button>
        ` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')" title="Delete Booking" style="margin-left:4px">🗑</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => openDetail(row.dataset.id));
  });
}

// ── Approve / Reject ──────────────────────────────────────────────────────────
async function updateStatus(id, newStatus) {
  try {
    const response = await fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, reviewedAt: new Date().toISOString() }),
    });

    if (response.status === 409) {
      showAlert('warn', '🚫', 'Cannot approve: Must keep a <strong>30-minute gap</strong> between approved interviews.');
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await loadDashboard();

    const booking = allBookings.find(b => b.id === id);
    const name = booking ? esc(booking.candidateName) : '';
    const icon = newStatus === 'approved' ? '✅' : '❌';
    const type = newStatus === 'approved' ? 'success' : 'error';
    showAlert(type, icon, `Booking for <strong>${name}</strong> has been <strong>${newStatus}</strong>.`);

    if (newStatus === 'approved') {
      setTimeout(() => showAlert('success', '📅',
        `Booking approved! <a href="#" onclick="addToCalendar('${id}');return false;" style="color:#a78bfa"><strong>Click here</strong></a> to add it to Google Calendar.`
      ), 700);
    }

    if (selectedId === id) closeDetail();
  } catch (err) {
    showAlert('error', '❌', 'Update failed: ' + err.message);
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteBooking(id) {
  if (!confirm('Are you sure you want to permanently delete this booking?')) return;

  try {
    const response = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await loadDashboard();
    showAlert('success', '🗑', 'Booking successfully deleted.');

    if (selectedId === id) closeDetail();
  } catch (err) {
    showAlert('error', '❌', 'Failed to delete: ' + err.message);
  }
}

// ── Google Calendar (free URL method — no GCP, no payment) ───────────────────
async function addToCalendar(id) {
  const booking = allBookings.find(b => b.id === id);
  if (!booking) return;

  const start = toGCalFormat(booking.interviewStart);
  const end   = toGCalFormat(booking.interviewEnd);

  // Title
  const title = encodeURIComponent(
    `${booking.round} Interview — ${booking.candidateName} @ ${booking.company}`
  );

  // Full description — every field auto-filled
  const lines = [
    `📅 Date         : ${formatDate(booking.interviewStart)}`,
    `🕐 Start Time   : ${formatTime(booking.interviewStart)}`,
    `🕑 End Time     : ${formatTime(booking.interviewEnd)}`,
    `📋 Booking ID   : ${booking.id}`,
    `👤 Candidate    : ${booking.candidateName}`,
    `📞 Contact      : ${booking.contactNumber}`,
    `🏢 Company      : ${booking.company}`,
    `💼 Role         : ${booking.role}`,
    `🔖 Round        : ${booking.round}`,
  ];
  if (booking.meetingLink) lines.push(`🔗 Meeting Link : ${booking.meetingLink}`);
  if (booking.jd)          lines.push(`📝 JD           : ${booking.jd}`);

  const details  = encodeURIComponent(lines.join('\n'));
  const location = encodeURIComponent(booking.meetingLink || '');
  const authuser = encodeURIComponent(CALENDAR_EMAIL);

  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}&authuser=${authuser}`;
  window.open(url, '_blank');

  // Mark as calendar-added in the server
  try {
    await apiFetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarAdded: true }),
    });
    await loadDashboard();
  } catch { /* non-critical */ }
}

// Converts a local datetime string (e.g. "2026-03-12T09:30" or with seconds)
// → Google Calendar format "20260312T093000"
function toGCalFormat(dt) {
  if (!dt) return '';
  const d   = new Date(dt);
  const pad = n => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function openDetail(id) {
  selectedId = id;
  const booking = allBookings.find(b => b.id === id);
  if (!booking) return;

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-item"><span class="detail-label">Candidate Name</span><span class="detail-value">${esc(booking.candidateName)}</span></div>
    <div class="detail-item"><span class="detail-label">Contact Number</span><span class="detail-value">${esc(booking.contactNumber)}</span></div>
    <div class="detail-item"><span class="detail-label">Company</span><span class="detail-value">${esc(booking.company)}</span></div>
    <div class="detail-item"><span class="detail-label">Role</span><span class="detail-value">${esc(booking.role)}</span></div>
    <div class="detail-item"><span class="detail-label">Round</span><span class="detail-value">${esc(booking.round)}</span></div>
    <div class="detail-item"><span class="detail-label">Date</span><span class="detail-value">${formatDate(booking.interviewStart)}</span></div>
    <div class="detail-item"><span class="detail-label">Start Time</span><span class="detail-value">${formatTime(booking.interviewStart)}</span></div>
    <div class="detail-item"><span class="detail-label">End Time</span><span class="detail-value">${formatTime(booking.interviewEnd)}</span></div>
    <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value"><span class="badge badge-${booking.status}">${capitalize(booking.status)}</span></span></div>
    <div class="detail-item"><span class="detail-label">Calendar</span><span class="detail-value">${booking.calendarAdded ? '✅ Added to Google Calendar' : '—'}</span></div>
    <div class="detail-item"><span class="detail-label">Submitted At</span><span class="detail-value">${new Date(booking.submittedAt).toLocaleString()}</span></div>
    ${booking.meetingLink ? `<div class="detail-item full"><span class="detail-label">Meeting Link</span><span class="detail-value"><a href="${esc(booking.meetingLink)}" target="_blank" style="color:var(--accent2)">${esc(booking.meetingLink)}</a></span></div>` : ''}
    ${booking.jd ? `<div class="detail-item full"><span class="detail-label">JD</span>
      <div class="detail-value" style="margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="downloadFile('${id}','jd')">⬇ Download JD (.txt)</button>
      </div>
    </div>` : ''}
  `;

  const actDiv = document.getElementById('detailActions');
  actDiv.innerHTML = '';

  if (booking.status === 'pending') {
    const ab = document.createElement('button');
    ab.className = 'btn btn-success'; ab.innerHTML = '✅ Approve';
    ab.onclick = () => updateStatus(id, 'approved');
    actDiv.appendChild(ab);

    const rb = document.createElement('button');
    rb.className = 'btn btn-danger'; rb.innerHTML = '❌ Reject';
    rb.onclick = () => updateStatus(id, 'rejected');
    actDiv.appendChild(rb);
  }

  if (booking.status === 'approved') {
    const cb = document.createElement('button');
    cb.className = 'btn btn-calendar';
    cb.innerHTML = booking.calendarAdded ? '📅 Re-add to Calendar' : '📅 Add to Google Calendar';
    cb.onclick = () => addToCalendar(id);
    actDiv.appendChild(cb);
  }

  // Delete option
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-danger';
  delBtn.innerHTML = '🗑 Delete';
  delBtn.style.marginLeft = 'auto'; // push to right
  delBtn.onclick = () => deleteBooking(id);
  actDiv.appendChild(delBtn);

  document.getElementById('detailModal').classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('detailModal').classList.add('hidden');
  selectedId = null;
}
document.getElementById('detailClose').addEventListener('click', closeDetail);
document.getElementById('detailModal').addEventListener('click', function (e) {
  if (e.target === this) closeDetail();
});

// ── File Download (Skill / JD) ───────────────────────────────────────────────
function downloadFile(id, field) {
  const booking = allBookings.find(b => b.id === id);
  if (!booking || !booking[field]) return;

  const labelMap = { skill: 'Skill', jd: 'JD', notes: 'JD' };
  const label = labelMap[field] || field;
  const content = `${label}\nCandidate: ${booking.candidateName}\nRole: ${booking.role} @ ${booking.company}\n\n` + booking[field];
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `${label}_${booking.candidateName}_${booking.company}.txt`
  });

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Filter Buttons ────────────────────────────────────────────────────────────
['All', 'Pending', 'Approved', 'Rejected'].forEach(f => {
  const btn = document.getElementById(`filter${f}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    activeFilter = f.toLowerCase();
    ['All', 'Pending', 'Approved', 'Rejected'].forEach(x => {
      const b = document.getElementById(`filter${x}`);
      if (b) b.className = 'btn btn-ghost btn-sm';
    });
    btn.className = 'btn btn-primary btn-sm';
    renderTable();
  });
});

// ── CSV Export ────────────────────────────────────────────────────────────────
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!allBookings.length) { showAlert('warn', '📭', 'No bookings to export yet.'); return; }

  const headers = ['ID', 'Candidate', 'Contact', 'Company', 'Role', 'Round', 'Start Time', 'End Time', 'Meeting Link', 'Status', 'Calendar Added', 'Submitted At', 'Reviewed At', 'JD'];
  const rows = allBookings.map(b => [
    b.id, b.candidateName, b.contactNumber, b.company, b.role,
    b.round, b.interviewStart, b.interviewEnd, b.meetingLink || '', b.status,
    b.calendarAdded ? 'Yes' : 'No',
    b.submittedAt, b.reviewedAt || '', b.jd || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `bookings-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showAlert('success', '✅', 'CSV downloaded!');
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function capitalize(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function formatDateTime(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return dt; }
}
function formatDate(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return dt; }
}
function formatTime(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return dt; }
}
