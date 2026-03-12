// ══════════════════════════════════════════════════════════════════════════════
//  SureSkills — View Booked Slots (slots.js)
// ══════════════════════════════════════════════════════════════════════════════

async function loadAllSlots() {
  const container = document.getElementById('allSlotsContainer');
  if (!container) return;
  
  try {
    const res = await fetch('/api/todays-slots'); // API returns ALL approved slots from CSV
    if (!res.ok) throw new Error('Failed to fetch slots from CSV');
    const slots = await res.json();
    
    // Sort all slots by start time
    slots.sort((a,b) => new Date(a.interviewStart) - new Date(b.interviewStart));
    
    if (slots.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 40px; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px;">
          <div style="font-size: 2rem; margin-bottom: 10px;">📭</div>
          No approved interviews scheduled yet.
        </div>`;
      return;
    }
    
    container.innerHTML = slots.map(s => {
      const dateObj = new Date(s.interviewStart);
      const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const timeStart = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const timeEnd   = new Date(s.interviewEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      return `
        <div style="padding:16px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size: 1.1rem; margin-bottom: 4px;"><strong>${s.candidateName}</strong></div>
            <div style="color:var(--muted);font-size:0.9rem">${s.round} @ ${s.company}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight:600;color:var(--primary); margin-bottom: 4px;">${dateStr}</div>
            <div style="color:var(--text);font-size:0.9rem;">${timeStart} - ${timeEnd}</div>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="text-align:center; padding: 40px; color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); border-radius: 8px;">
        <div style="font-size: 2rem; margin-bottom: 10px;">❌</div>
        Could not load booked slots. Make sure the server is running.
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', loadAllSlots);
