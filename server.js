require('dotenv').config();
const express = require('express');
const fs = require('fs').promises; // Switched to promises for non-blocking I/O
const path = require('path');
const session = require('express-session');
const app = express();

const PORT = process.env.PORT || 8080;
const DB = path.join(__dirname, 'bookings.json');
const CSV_DB = path.join(__dirname, 'approved_slots.csv');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sureskills123';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'sureskills-secret-123',
  resave: false,
  saveUninitialized: false
}));

function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}


app.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Login - SureSkills</title>
        <link rel="stylesheet" href="style.css">
        <style>
          body { display: flex; align-items: center; justify-content: center; height: 100vh; background: var(--bg); color: var(--text); font-family: sans-serif; }
          .login-card { background: var(--card-bg); padding: 2rem; border-radius: 12px; border: 1px solid var(--border); text-align: center; width: 100%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
          .login-form { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
          input { padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); }
          .login-btn { background: var(--primary); color: white; padding: 0.75rem; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; }
          .login-btn:hover { background: var(--primary-hover); transform: translateY(-2px); }
        </style>
      </head>
      <body>
        <div class="login-card">
          <h1>Sure<span>Skills</span></h1>
          <p>Admin Access Only</p>
          <form action="/login" method="POST" class="login-form">
            <input type="password" name="password" placeholder="Admin Password" required autofocus>
            <button type="submit" class="login-btn">Login</button>
          </form>
          ${req.query.error ? `<p style="color:red; margin-top:1rem">${req.query.error}</p>` : ''}
        </div>
      </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/admin.html');
  } else {
    res.redirect('/login?error=Incorrect password');
  }
});

app.get('/admin.html', ensureAuthenticated);
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/bookings') return next();
  if (req.method === 'GET' && req.path === '/todays-slots') return next();
  
  ensureAuthenticated(req, res, next);
});

app.use(express.static(__dirname));

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

async function writeApprovedToCSV(db) {
  const approved = db.filter(b => b.status === 'approved');
  const headers = ['ID', 'CandidateName', 'InterviewStart', 'InterviewEnd', 'Round', 'Company'];
  
  if (approved.length === 0) {
    await fs.writeFile(CSV_DB, headers.join(',') + '\n', 'utf8');
    return;
  }
  
  const clean = str => String(str).replace(/,/g, ' ').replace(/\n/g, ' ');
  const rows = approved.map(b => [
    clean(b.id), clean(b.candidateName), clean(b.interviewStart), clean(b.interviewEnd), clean(b.round), clean(b.company)
  ].join(','));
  
  await fs.writeFile(CSV_DB, headers.join(',') + '\n' + rows.join('\n'), 'utf8');
}

async function readDB() {
  try { 
    const data = await fs.readFile(DB, 'utf8');
    return JSON.parse(data); 
  } catch (error) { 
    return []; 
  }
}

async function writeDB(data) {
  await fs.writeFile(DB, JSON.stringify(data, null, 2), 'utf8');
  await writeApprovedToCSV(data);
}



app.get('/api/todays-slots', async (req, res) => {
  try {
    try {
      await fs.access(CSV_DB); 
    } catch {
      return res.json([]); 
    }

    const csvData = await fs.readFile(CSV_DB, 'utf8');
    const lines = csvData.trim().split(/\r?\n/);
    if (lines.length <= 1) return res.json([]);

    const slots = lines.slice(1).map(line => {
      const parts = line.split(',');
      return {
        id: parts[0],
        candidateName: parts[1],
        interviewStart: parts[2],
        interviewEnd: parts[3],
        round: parts[4],
        company: parts[5]
      };
    });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read today\'s slots.' });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const data = await readDB();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const body = req.body;
    const db = await readDB();

    const booking = {
      id: 'BK' + Date.now(),
      candidateName: String(body.candidateName || '').trim(),
      contactNumber: String(body.contactNumber || '').trim(),
      company: String(body.company || '').trim(),
      role: String(body.role || '').trim(),
      interviewStart: String(body.interviewStart || '').trim(),
      interviewEnd: String(body.interviewEnd || '').trim(),
      round: String(body.round || '').trim(),
      meetingLink: String(body.meetingLink || '').trim(),
      jd: String(body.jd || '').trim(),
      status: 'pending',
      submittedAt: new Date().toISOString(),
      calendarAdded: false,
    };

    db.push(booking);
    await writeDB(db);
    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

app.patch('/api/bookings/:id', async (req, res) => {
  try {
    const db = await readDB();
    const index = db.findIndex(b => b.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Booking not found' });

    const allowed = ['status', 'calendarAdded', 'calendarEventId', 'reviewedAt'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) db[index][k] = req.body[k];
    });

    await writeDB(db);
    res.json(db[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const db = await readDB();
    const index = db.findIndex(b => b.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Booking not found' });

    db.splice(index, 1);
    await writeDB(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SureSkills server running!`);
  console.log(`Port:     ${PORT}`);
  console.log(`Admin:    /admin.html (Protected by Password)\n`);
});

