const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {
  console.warn('Notice: Could not load .env file:', e.message);
}

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash'
].filter(Boolean);

let verifiedModel = null;

function isGeminiConfigured() {
  return Boolean(
    GEMINI_API_KEY &&
    GEMINI_API_KEY.trim() !== '' &&
    !GEMINI_API_KEY.includes('YOUR_GEMINI_API_KEY_HERE')
  );
}

// =====================================================
// DATABASE & AUTH HELPERS
// =====================================================
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]', 'utf8');
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, '{}', 'utf8');
  }
}
ensureDataFiles();

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write JSON:', file, err.message);
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return verify === hash;
}

function getUserFromReq(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const sessions = readJSON(SESSIONS_FILE, {});
  const userId = sessions[token];
  if (!userId) return null;

  const users = readJSON(USERS_FILE, []);
  return users.find(u => u.id === userId) || null;
}

function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    savedProfile: u.savedProfile || null,
    lastAnalysis: u.lastAnalysis || null
  };
}

// =====================================================
// GEMINI API HELPER
// =====================================================
async function callGemini(profile) {
  const apiKey = GEMINI_API_KEY.trim();

  const prompt = `You are an elite campus placement coach and tech recruiter. Analyze this student's placement profile and provide strategic, actionable, and encouraging guidance.

Student Profile:
- Name: ${profile.name || 'Student'}
- College: ${profile.college || 'N/A'}
- Branch: ${profile.branch || 'Computer Science'}
- Year: ${profile.year || '3rd/4th'}
- CGPA: ${profile.cgpa || 'N/A'} (Backlogs: ${profile.backlogs || 0})
- Skills: ${(profile.skills || []).join(', ') || 'General CS'}
- DSA Level: ${profile.dsaLevel || 'Intermediate'} (LeetCode Solved: ${profile.leetcodeCount || 0})
- Internships: ${profile.internships || 'None'} (${profile.internshipDesc || ''})
- Projects: ${profile.projectCount || '1-2'} (${profile.projectsDesc || ''})
- Hackathons: ${profile.hackathons || 'None'}
- Target Roles: ${(profile.targetRoles || []).join(', ') || 'Software Engineer'}
- Target Companies: ${(profile.companyTypes || []).join(', ') || 'Product & Service'}
- Daily Prep Time: ${profile.prepTime || 2} hours/day
- Additional Notes: ${profile.additionalInfo || 'None'}

Please respond with ONLY a valid JSON object strictly matching this schema (do not wrap in markdown or backticks, just valid raw JSON):
{
  "readinessLabel": "Early Stage" | "Building Up" | "Good Shape" | "Interview Ready" | "Highly Competitive",
  "aiInsights": "A 3-paragraph evaluation covering: 1) Key strengths & competitive advantages, 2) Crucial gaps to fix for their target roles, 3) Daily preparation and mindset strategy.",
  "strengths": ["string", "string", "string"],
  "priorityGaps": [
    { "skill": "string", "reason": "why this is crucial", "actionPlan": "concrete steps to master it" }
  ],
  "companyInterviewTips": [
    {
      "companyType": "e.g. FAANG / Product / Fintech",
      "hiringFocus": "what they emphasize",
      "predictedQuestions": ["likely interview question 1", "likely interview question 2"]
    }
  ],
  "personalizedRoadmapTip": "Strategic advice on pacing their preparation with their ${profile.prepTime || 2}h/day commitment"
}`;

  const bodyPayload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json"
    }
  };

  const modelsToTry = verifiedModel ? [verifiedModel] : CANDIDATE_MODELS;
  let lastError = null;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Model ${model} error (${response.status}): ${errorText}`);
        console.warn(`Model ${model} returned ${response.status}, trying alternative candidate...`);
        continue;
      }

      const data = await response.json();
      const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textOutput) {
        verifiedModel = model;
        console.log(`✓ Gemini analysis succeeded using model: ${model}`);
        try {
          return JSON.parse(textOutput);
        } catch {
          const cleaned = textOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          return JSON.parse(cleaned);
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('All candidate Gemini models failed.');
}

// =====================================================
// SERVER ROUTER
// =====================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. API Route: Status check
  if (req.method === 'GET' && pathname === '/api/status') {
    return sendJSON(res, 200, {
      geminiConfigured: isGeminiConfigured(),
      model: verifiedModel || CANDIDATE_MODELS[0]
    });
  }

  // 2. Auth: Register
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const { name, email, password } = await readBody(req);
    if (!name || !email || !password) {
      return sendJSON(res, 400, { success: false, message: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return sendJSON(res, 400, { success: false, message: 'Password must be at least 6 characters.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const users = readJSON(USERS_FILE, []);
    if (users.some(u => u.email === cleanEmail)) {
      return sendJSON(res, 400, { success: false, message: 'An account with this email already exists.' });
    }

    const { salt, hash } = hashPassword(password);
    const newUser = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      name: name.trim(),
      email: cleanEmail,
      salt,
      hash,
      createdAt: new Date().toISOString(),
      savedProfile: null,
      lastAnalysis: null
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const sessions = readJSON(SESSIONS_FILE, {});
    sessions[token] = newUser.id;
    writeJSON(SESSIONS_FILE, sessions);

    return sendJSON(res, 200, {
      success: true,
      token,
      user: safeUser(newUser)
    });
  }

  // 3. Auth: Login
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const { email, password } = await readBody(req);
    if (!email || !password) {
      return sendJSON(res, 400, { success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const users = readJSON(USERS_FILE, []);
    const user = users.find(u => u.email === cleanEmail);

    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      return sendJSON(res, 401, { success: false, message: 'Invalid email or password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const sessions = readJSON(SESSIONS_FILE, {});
    sessions[token] = user.id;
    writeJSON(SESSIONS_FILE, sessions);

    return sendJSON(res, 200, {
      success: true,
      token,
      user: safeUser(user)
    });
  }

  // 4. Auth: Get Current User (Me)
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getUserFromReq(req);
    if (!user) {
      return sendJSON(res, 401, { success: false, message: 'Not authenticated' });
    }
    return sendJSON(res, 200, { success: true, user: safeUser(user) });
  }

  // 5. Auth: Logout
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const sessions = readJSON(SESSIONS_FILE, {});
      delete sessions[token];
      writeJSON(SESSIONS_FILE, sessions);
    }
    return sendJSON(res, 200, { success: true });
  }

  // 6. User: Save Profile & Analysis
  if (req.method === 'POST' && pathname === '/api/user/save') {
    const user = getUserFromReq(req);
    if (!user) {
      return sendJSON(res, 401, { success: false, message: 'Log in to save your profile' });
    }

    const { profile, analysis } = await readBody(req);
    const users = readJSON(USERS_FILE, []);
    const userIndex = users.findIndex(u => u.id === user.id);

    if (userIndex !== -1) {
      if (profile) users[userIndex].savedProfile = profile;
      if (analysis) users[userIndex].lastAnalysis = analysis;
      writeJSON(USERS_FILE, users);
    }

    return sendJSON(res, 200, { success: true, user: safeUser(users[userIndex]) });
  }

  // 7. API Route: AI Profile Analysis with Gemini
  if (req.method === 'POST' && pathname === '/api/analyze') {
    try {
      const profile = await readBody(req);

      if (!isGeminiConfigured()) {
        return sendJSON(res, 200, {
          success: false,
          fallback: true,
          message: 'Gemini API key is not configured in .env. Using local AI engine.'
        });
      }

      const geminiResult = await callGemini(profile);
      return sendJSON(res, 200, {
        success: true,
        provider: 'gemini',
        data: geminiResult
      });
    } catch (err) {
      console.error('Gemini Analysis Failed:', err.message);
      return sendJSON(res, 200, {
        success: false,
        fallback: true,
        error: err.message,
        message: 'Gemini request failed. Seamlessly falling back to local analysis.'
      });
    }
  }

  // 8. Static File Serving
  let safePath = path.normalize(pathname);
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(__dirname, safePath);

  // Security check: ensure file path remains inside workspace directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Gemini API configured: ${isGeminiConfigured() ? 'YES' : 'NO (add key to .env)'}`);
  console.log(`Authentication system: ACTIVE`);
});
