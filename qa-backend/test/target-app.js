const express = require('express');
const app = express();
const port = 3001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple login form HTML
const loginHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Enterprise Auth Login</title>
  <style>
    body { background: #0f172a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 8px; border: 1px solid #334155; }
    h2 { margin-top: 0; color: #38bdf8; }
    input { width: 100%; padding: 8px; margin: 8px 0 16px 0; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 4px; box-sizing: border-box; }
    button { background: #0ea5e9; color: #fff; border: none; padding: 10px; border-radius: 4px; width: 100%; cursor: pointer; font-weight: bold; }
    button:hover { background: #0284c7; }
    .error { color: #f43f5e; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Enterprise Secure Portal</h2>
    <div id="error-msg" class="error"></div>
    <form action="/login" method="POST">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" placeholder="admin" required />
      
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="supersecret" required />
      
      <button type="submit" id="submit-btn">Sign In</button>
    </form>
  </div>
</body>
</html>
`;

// Simple dashboard HTML
const dashboardHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Enterprise Dashboard</title>
  <style>
    body { background: #0f172a; color: #fff; font-family: sans-serif; padding: 2rem; }
    h1 { color: #38bdf8; }
    .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; border: 1px solid #334155; max-width: 600px; }
    button { background: #f43f5e; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Welcome, Administrator</h1>
    <p>This is a secure enterprise portal page protected by cookie authentication.</p>
    <div id="content-block">
      <span id="secure-token-display">Secret session token active!</span>
    </div>
    <br/>
    <form action="/logout" method="POST">
      <button type="submit">Sign Out</button>
    </form>
  </div>
</body>
</html>
`;

// Check auth helper
function isAuthenticated(req) {
  const cookie = req.headers.cookie || '';
  return cookie.includes('session_token=secret_val');
}

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) {
    return res.redirect('/dashboard');
  }
  res.send(loginHtml);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'supersecret') {
    res.setHeader('Set-Cookie', 'session_token=secret_val; Path=/; HttpOnly');
    return res.redirect('/dashboard');
  }
  // Send login page with error inline
  res.send(loginHtml.replace('<div id="error-msg" class="error"></div>', '<div id="error-msg" class="error">Invalid username or password</div>'));
});

app.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/login');
});

app.get('/dashboard', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/login');
  }
  res.send(dashboardHtml);
});

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.listen(port, () => {
  console.log(`Test Target Application running at http://localhost:${port}`);
});
