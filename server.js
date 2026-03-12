require('dotenv').config();
const express = require('express');
const fs = require('fs');
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
          ${req.query.error ? `<p style="color:var(--danger); margin-top:1rem">${req.query.error}</p>` : ''}
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
  ensureAuthenticated(req, res, next);
});

app.use(express.static(__dirname));

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

function writeApprovedToCSV(db) {
  const approved = db.filter(b => b.status === 'approved');
  const headers = ['ID', 'CandidateName', 'InterviewStart', 'InterviewEnd', 'Round', 'Company'];
  if (approved.length === 0) {
    fs.writeFileSync(CSV_DB, headers.join(',') + '\n', 'utf8');
    return;
  }
  const clean = str => String(str).replace(/,/g, ' ').replace(/\n/g, ' ');
  const rows = approved.map(b => [
    clean(b.id), clean(b.candidateName), clean(b.interviewStart), clean(b.interviewEnd), clean(b.round), clean(b.company)
  ].join(','));
  fs.writeFileSync(CSV_DB, headers.join(',') + '\n' + rows.join('\n'), 'utf8');
}

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch { return []; }
}
function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2), 'utf8');
  writeApprovedToCSV(data);
}

app.get('/api/todays-slots', (req, res) => {
  try {
    if (!fs.existsSync(CSV_DB)) return res.json([]);
    const csvData = fs.readFileSync(CSV_DB, 'utf8');
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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', (req, res) => {
  res.json(readDB());
});

app.post('/api/bookings', (req, res) => {
  const body = req.body;
  const db = readDB();


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
  writeDB(db);
  res.status(201).json(booking);
});

app.patch('/api/bookings/:id', (req, res) => {
  const db = readDB();
  const index = db.findIndex(b => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const allowed = ['status', 'calendarAdded', 'calendarEventId', 'reviewedAt'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) db[index][k] = req.body[k];
  });

  writeDB(db);
  res.json(db[index]);
});

app.delete('/api/bookings/:id', (req, res) => {
  const db = readDB();
  const index = db.findIndex(b => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  db.splice(index, 1);
  writeDB(db);
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SureSkills server running!`);
  console.log(`Port:     ${PORT}`);
  console.log(`Admin:    /admin.html (Protected by Password)\n`);
});

