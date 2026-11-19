/* ====================================================
   SkillSync AI - app.js
  Main application logic + local profile analysis
==================================================== */

'use strict';

// =====================================================
// STATE
// =====================================================
const state = {
  currentStep: 1,
  dsaRating: 3,
  projCount: '1-2',
  selectedSkills: new Set(),
  selectedRoles: new Set(),
  selectedCompanyTypes: new Set(),
  analysisResult: null,
  currentUser: null,
  token: localStorage.getItem('skillsync_token') || null
};

// =====================================================
// AUTH SYSTEM (Login / Register / Sessions)
// =====================================================
function openAuthModal(defaultTab = 'register') {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');
  switchAuthTab(defaultTab);
  clearAuthAlert();
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
  clearAuthAlert();
}

function switchAuthTab(tab) {
  const loginBtn = document.getElementById('tab-login-btn');
  const registerBtn = document.getElementById('tab-register-btn');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  const switchText = document.getElementById('auth-switch-text');

  clearAuthAlert();

  if (tab === 'register') {
    loginBtn?.classList.remove('active');
    registerBtn?.classList.add('active');
    formLogin?.classList.add('hidden');
    formRegister?.classList.remove('hidden');
    if (title) title.textContent = '1. Create Student Account';
    if (sub) sub.textContent = 'Sign up to build your profile & run AI placement analysis';
    if (switchText) switchText.innerHTML = `Already have an account? <a href="#" id="auth-switch-link" style="color: #818cf8; font-weight: 600; text-decoration: none;">Log In here</a>`;
  } else {
    registerBtn?.classList.remove('active');
    loginBtn?.classList.add('active');
    formRegister?.classList.add('hidden');
    formLogin?.classList.remove('hidden');
    if (title) title.textContent = 'Log In to SkillSync AI';
    if (sub) sub.textContent = 'Sign in to access your profile, roadmap, and company matches';
    if (switchText) switchText.innerHTML = `New student? <a href="#" id="auth-switch-link" style="color: #818cf8; font-weight: 600; text-decoration: none;">Create an account here</a>`;
  }

  document.getElementById('auth-switch-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchAuthTab(tab === 'register' ? 'login' : 'register');
  });
}

function showAuthAlert(msg, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) {
    alertEl.textContent = msg;
    alertEl.className = `auth-alert ${type}`;
    alertEl.classList.remove('hidden');
  }
}

function clearAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) alertEl.classList.add('hidden');
}

function updateUserUI(user) {
  state.currentUser = user;
  const navAuth = document.getElementById('nav-auth-section');
  const profilePill = document.getElementById('profile-user-pill');
  const dashPill = document.getElementById('dash-user-pill');

  if (user) {
    const initial = (user.name || user.email || 'U')[0].toUpperCase();
    const firstName = (user.name || 'User').split(' ')[0];

    const userBadgeHtml = `
      <div class="user-profile-badge">
        <div class="user-avatar">${initial}</div>
        <span class="user-name">${firstName}</span>
        <button class="btn-logout" onclick="handleLogout()" title="Sign Out">Logout</button>
      </div>
    `;

    if (navAuth) navAuth.innerHTML = userBadgeHtml;
    if (profilePill) profilePill.innerHTML = userBadgeHtml;
    if (dashPill) dashPill.innerHTML = userBadgeHtml;

    // Prefill user's name if form field is empty
    const nameInput = document.getElementById('student-name');
    if (nameInput && !nameInput.value) {
      nameInput.value = user.name;
    }
  } else {
    const loggedOutHtml = `
      <button class="btn-nav-login" id="nav-btn-login" onclick="openAuthModal('login')">Log In</button>
      <button class="btn-nav-cta" id="nav-get-started" onclick="openAuthModal('register')">Sign Up</button>
    `;
    if (navAuth) navAuth.innerHTML = loggedOutHtml;
    if (profilePill) profilePill.innerHTML = `<button class="btn-nav-login" style="padding:6px 12px;font-size:0.78rem;" onclick="openAuthModal('login')">Log In</button>`;
    if (dashPill) dashPill.innerHTML = `<button class="btn-nav-login" style="padding:6px 12px;font-size:0.78rem;" onclick="openAuthModal('login')">Log In</button>`;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email')?.value;
  const password = document.getElementById('login-password')?.value;
  const btn = document.getElementById('btn-submit-login');
  const spinner = document.getElementById('login-spinner');
  const btnText = document.getElementById('login-btn-text');

  if (!email || !password) return;

  btn.disabled = true;
  btnText.textContent = 'Logging in...';
  spinner?.classList.remove('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showAuthAlert(data.message || 'Login failed. Please check your credentials.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('skillsync_token', data.token);
    updateUserUI(data.user);

    if (data.user.savedProfile) {
      populateProfileFromData(data.user.savedProfile);
    }
    if (data.user.lastAnalysis) {
      state.analysisResult = data.user.lastAnalysis;
    }

    showAuthAlert('✓ Logged in successfully!', 'success');
    setTimeout(() => {
      closeAuthModal();
      if (data.user.lastAnalysis) {
        renderDashboard(data.user.lastAnalysis, data.user.savedProfile || collectProfile());
        showPage('page-dashboard');
      } else {
        showPage('page-profile');
      }
    }, 500);

  } catch (err) {
    showAuthAlert('Network error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Log In';
    spinner?.classList.add('hidden');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name')?.value;
  const email = document.getElementById('register-email')?.value;
  const password = document.getElementById('register-password')?.value;
  const btn = document.getElementById('btn-submit-register');
  const spinner = document.getElementById('register-spinner');
  const btnText = document.getElementById('register-btn-text');

  if (!name || !email || !password) return;

  btn.disabled = true;
  btnText.textContent = 'Creating account...';
  spinner?.classList.remove('hidden');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showAuthAlert(data.message || 'Registration failed.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('skillsync_token', data.token);
    updateUserUI(data.user);

    showAuthAlert('✓ Account created successfully!', 'success');
    setTimeout(() => {
      closeAuthModal();
      showPage('page-profile');
    }, 500);

  } catch (err) {
    showAuthAlert('Network error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Create Account';
    spinner?.classList.add('hidden');
  }
}

async function handleLogout() {
  if (state.token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
    } catch {}
  }
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('skillsync_token');
  updateUserUI(null);
  showPage('page-landing');
}

async function checkAuthOnLoad() {
  const token = localStorage.getItem('skillsync_token');
  if (!token) {
    updateUserUI(null);
    return;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        state.token = token;
        updateUserUI(data.user);
        if (data.user.savedProfile) {
          populateProfileFromData(data.user.savedProfile);
        }
        if (data.user.lastAnalysis) {
          state.analysisResult = data.user.lastAnalysis;
        }
        return;
      }
    }
  } catch {}
  localStorage.removeItem('skillsync_token');
  updateUserUI(null);
}

function populateProfileFromData(p) {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  setVal('student-name', p.name);
  setVal('college', p.college);
  setVal('branch', p.branch);
  setVal('year', p.year);
  setVal('cgpa', p.cgpa);
  setVal('graduation-year', p.graduationYear);
  setVal('backlogs', p.backlogs);

  if (Array.isArray(p.skills)) {
    document.querySelectorAll('.skill-chip').forEach(chip => {
      if (p.skills.includes(chip.dataset.skill)) {
        chip.classList.add('selected');
        state.selectedSkills.add(chip.dataset.skill);
      }
    });
  }

  setVal('leetcode', p.leetcodeCount);
  setVal('internships', p.internships);
  setVal('internship-desc', p.internshipDesc);
  setVal('projects-desc', p.projectsDesc);
  setVal('hackathons', p.hackathons);
  setVal('github', p.github);
  setVal('linkedin', p.linkedin);
  setVal('prep-time', p.prepTime);
  setVal('placement-date', p.placementDate);
  setVal('additional-info', p.additionalInfo);

  updateCompletion();
}

// Modal Listeners
document.getElementById('auth-modal-close')?.addEventListener('click', closeAuthModal);
document.getElementById('tab-login-btn')?.addEventListener('click', () => switchAuthTab('login'));
document.getElementById('tab-register-btn')?.addEventListener('click', () => switchAuthTab('register'));
document.getElementById('form-login')?.addEventListener('submit', handleLogin);
document.getElementById('form-register')?.addEventListener('submit', handleRegister);
document.getElementById('btn-continue-guest')?.addEventListener('click', () => {
  closeAuthModal();
  showPage('page-profile');
});
document.getElementById('nav-btn-login')?.addEventListener('click', () => openAuthModal('login'));

// Close modal when clicking outside card
document.getElementById('auth-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'auth-modal') closeAuthModal();
});

// =====================================================
// PAGE NAVIGATION & AUTH GUARDS
// =====================================================
function showPage(pageId) {
  // Enforce authentication before accessing profile builder or dashboard
  if ((pageId === 'page-profile' || pageId === 'page-dashboard') && !state.currentUser) {
    openAuthModal('register');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId)?.classList.add('active');
  window.scrollTo(0, 0);
}

document.getElementById('nav-get-started')?.addEventListener('click', () => {
  if (!state.currentUser) openAuthModal('register');
  else showPage('page-profile');
});
document.getElementById('hero-get-started')?.addEventListener('click', () => {
  if (!state.currentUser) openAuthModal('register');
  else showPage('page-profile');
});
document.getElementById('cta-start')?.addEventListener('click', () => {
  if (!state.currentUser) openAuthModal('register');
  else showPage('page-profile');
});
document.getElementById('back-to-landing')?.addEventListener('click', () => showPage('page-landing'));

document.getElementById('btn-quick-fill')?.addEventListener('click', () => {
  quickFillProfile();
});

function quickFillProfile() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  
  setVal('student-name', 'Rahul Sharma');
  setVal('college', 'IIT Bombay');
  setVal('branch', 'Computer Science & Engineering');
  setVal('year', '3rd Year');
  setVal('cgpa', '8.7');
  setVal('graduation-year', '2026');
  setVal('backlogs', '0');

  // Select key skills
  const skillsToSelect = ['Python', 'C++', 'Java', 'JavaScript', 'React', 'Node.js', 'SQL', 'Docker', 'System Design', 'Data Structures', 'Algorithms', 'DBMS'];
  document.querySelectorAll('#chips-languages .skill-chip, #chips-web .skill-chip, #chips-ai .skill-chip, #chips-devops .skill-chip, #chips-cs .skill-chip').forEach(chip => {
    const s = chip.dataset.skill;
    if (skillsToSelect.includes(s)) {
      chip.classList.add('selected');
      state.selectedSkills.add(s);
    }
  });

  setRating(4); // Advanced DSA
  setProj('3-5');
  setVal('leetcode', '240');
  setVal('internships', '1');
  setVal('internship-desc', 'SDE Intern at FinTech Startup: Developed high-throughput REST APIs using Node.js & Redis.');
  setVal('projects-desc', 'Full-stack Placement Portal in React/Node.js; Distributed Key-Value store in Go.');
  setVal('hackathons', 'top3');
  setVal('github', 'https://github.com/rahul-sharma');
  setVal('linkedin', 'https://linkedin.com/in/rahul-sharma');

  // Target roles
  const rolesToSelect = ['Software Engineer', 'Backend Developer', 'Full Stack Developer'];
  document.querySelectorAll('#chips-roles .skill-chip').forEach(chip => {
    if (rolesToSelect.includes(chip.dataset.skill)) {
      chip.classList.add('selected');
      state.selectedRoles.add(chip.dataset.skill);
    }
  });

  // Company types
  const companiesToSelect = ['FAANG', 'Product', 'Fintech'];
  document.querySelectorAll('#chips-company-type .skill-chip').forEach(chip => {
    if (companiesToSelect.includes(chip.dataset.skill)) {
      chip.classList.add('selected');
      state.selectedCompanyTypes.add(chip.dataset.skill);
    }
  });

  setVal('prep-time', '3');
  setVal('placement-date', '2026-08');
  setVal('additional-info', 'Targeting Tier-1 product companies. Consistent LeetCode contest participant.');

  updateCompletion();

  // Gentle feedback toast/animation
  const btn = document.getElementById('btn-quick-fill');
  if (btn) {
    const oldText = btn.innerHTML;
    btn.innerHTML = '✓ Sample Data Loaded!';
    btn.style.background = 'rgba(16, 185, 129, 0.2)';
    btn.style.borderColor = '#10b981';
    btn.style.color = '#6ee7b7';
    setTimeout(() => {
      btn.innerHTML = oldText;
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 1800);
  }
}

function goToProfile() { showPage('page-profile'); }

// =====================================================
// PROFILE FORM STEPS
// =====================================================
function nextStep(step) {
  document.getElementById(`step-${state.currentStep}`)?.classList.remove('active');
  document.querySelectorAll('.ps-step').forEach(s => {
    if (parseInt(s.dataset.step) < step) s.classList.add('done');
    s.classList.remove('active');
    if (parseInt(s.dataset.step) === step) s.classList.add('active');
  });
  state.currentStep = step;
  document.getElementById(`step-${step}`)?.classList.add('active');
  updateCompletion();
  window.scrollTo(0, 0);
}

function prevStep(step) {
  document.getElementById(`step-${state.currentStep}`)?.classList.remove('active');
  document.querySelectorAll('.ps-step').forEach(s => {
    if (parseInt(s.dataset.step) >= state.currentStep) s.classList.remove('done');
    s.classList.remove('active');
    if (parseInt(s.dataset.step) === step) s.classList.add('active');
  });
  state.currentStep = step;
  document.getElementById(`step-${step}`)?.classList.add('active');
  updateCompletion();
}

function updateCompletion() {
  const pct = ((state.currentStep - 1) / 4) * 100;
  const bar = document.getElementById('profile-comp-bar');
  const txt = document.getElementById('profile-comp-pct');
  if (bar) bar.style.width = `${pct}%`;
  if (txt) txt.textContent = `${Math.round(pct)}%`;
}

// =====================================================
// SKILL CHIPS
// =====================================================
document.querySelectorAll('.skill-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('selected');
    const skill = chip.dataset.skill;
    if (chip.classList.contains('selected')) {
      state.selectedSkills.add(skill);
    } else {
      state.selectedSkills.delete(skill);
    }
  });
});

// Role chips (separate tracking)
document.querySelectorAll('#chips-roles .skill-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const skill = chip.dataset.skill;
    if (chip.classList.contains('selected')) {
      state.selectedRoles.add(skill);
    } else {
      state.selectedRoles.delete(skill);
    }
  });
});

// Company type chips
document.querySelectorAll('#chips-company-type .skill-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const skill = chip.dataset.skill;
    if (chip.classList.contains('selected')) {
      state.selectedCompanyTypes.add(skill);
    } else {
      state.selectedCompanyTypes.delete(skill);
    }
  });
});

// =====================================================
// RATING & PROJECT BUTTONS
// =====================================================
function setRating(val) {
  state.dsaRating = val;
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.rating) === val);
  });
}

function setProj(val) {
  state.projCount = val;
  document.querySelectorAll('.proj-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.proj === String(val));
  });
}

// =====================================================
// COLLECT PROFILE DATA
// =====================================================
function collectProfile() {
  const skills = Array.from(document.querySelectorAll('#chips-languages .skill-chip.selected, #chips-web .skill-chip.selected, #chips-ai .skill-chip.selected, #chips-devops .skill-chip.selected, #chips-cs .skill-chip.selected')).map(c => c.dataset.skill);
  const roles = Array.from(document.querySelectorAll('#chips-roles .skill-chip.selected')).map(c => c.dataset.skill);
  const companyTypes = Array.from(document.querySelectorAll('#chips-company-type .skill-chip.selected')).map(c => c.dataset.skill);

  const dsaLevelMap = { 1: 'Beginner', 2: 'Basic', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };

  return {
    name: document.getElementById('student-name')?.value || 'Student',
    college: document.getElementById('college')?.value || '',
    branch: document.getElementById('branch')?.value || '',
    year: document.getElementById('year')?.value || '',
    cgpa: document.getElementById('cgpa')?.value || '',
    graduationYear: document.getElementById('graduation-year')?.value || '',
    backlogs: document.getElementById('backlogs')?.value || '0',
    skills,
    dsaLevel: dsaLevelMap[state.dsaRating] || 'Intermediate',
    leetcodeCount: document.getElementById('leetcode')?.value || '0',
    internships: document.getElementById('internships')?.value || 'none',
    internshipDesc: document.getElementById('internship-desc')?.value || '',
    projectCount: state.projCount,
    projectsDesc: document.getElementById('projects-desc')?.value || '',
    hackathons: document.getElementById('hackathons')?.value || 'none',
    github: document.getElementById('github')?.value || '',
    linkedin: document.getElementById('linkedin')?.value || '',
    targetRoles: roles,
    companyTypes,
    ctcExpectation: document.getElementById('ctc-expectation')?.value || 'any',
    prepTime: document.getElementById('prep-time')?.value || '2',
    placementDate: document.getElementById('placement-date')?.value || '',
    additionalInfo: document.getElementById('additional-info')?.value || ''
  };
}

// =====================================================
// LOCAL AI ENGINE  (no API key needed)
// =====================================================

const COMPANY_DB = [
  { name:'Google',      emoji:'🔵', type:'FAANG',    base:95, ctc:'40-60 LPA',  difficulty:'Very Hard', roles:['Software Engineer','SWE-II','Data Scientist'],           req:['Data Structures','Algorithms','System Design','Python','Machine Learning'] },
  { name:'Microsoft',   emoji:'🟦', type:'FAANG',    base:90, ctc:'35-55 LPA',  difficulty:'Very Hard', roles:['Software Engineer','Cloud Developer','Data Scientist'],   req:['Data Structures','Algorithms','System Design','Azure','OOP'] },
  { name:'Amazon',      emoji:'🟠', type:'FAANG',    base:88, ctc:'30-50 LPA',  difficulty:'Hard',      roles:['SDE-I','SDE-II','Data Engineer'],                         req:['Data Structures','Algorithms','System Design','AWS','SQL'] },
  { name:'Meta',        emoji:'🔵', type:'FAANG',    base:93, ctc:'40-65 LPA',  difficulty:'Very Hard', roles:['Software Engineer','ML Engineer'],                         req:['Data Structures','Algorithms','System Design','Python','Machine Learning'] },
  { name:'Flipkart',    emoji:'🛒', type:'Product',  base:78, ctc:'25-40 LPA',  difficulty:'Hard',      roles:['SDE-I','Data Analyst','Backend Developer'],                 req:['Data Structures','Algorithms','Java','SQL','System Design'] },
  { name:'Razorpay',    emoji:'💳', type:'Fintech',  base:75, ctc:'20-35 LPA',  difficulty:'Hard',      roles:['Backend Developer','Full Stack Developer','SDE'],           req:['Node.js','JavaScript','SQL','System Design','Docker'] },
  { name:'Atlassian',   emoji:'🔷', type:'Product',  base:80, ctc:'28-42 LPA',  difficulty:'Hard',      roles:['Software Engineer','SDE-I'],                               req:['Data Structures','Algorithms','Java','OOP','System Design'] },
  { name:'Walmart',     emoji:'🏪', type:'Product',  base:72, ctc:'18-30 LPA',  difficulty:'Medium',    roles:['Software Engineer','Data Analyst'],                         req:['Data Structures','Java','SQL','DBMS','OOP'] },
  { name:'Infosys',     emoji:'🏢', type:'Service',  base:55, ctc:'6-10 LPA',   difficulty:'Easy',      roles:['Software Engineer','System Engineer','Analyst'],            req:['Java','Python','SQL','OOP','DBMS'] },
  { name:'TCS',         emoji:'🏗️', type:'Service',  base:50, ctc:'4-8 LPA',    difficulty:'Easy',      roles:['Associate Software Engineer','Developer'],                  req:['Java','Python','SQL','OOP','Computer Networks'] },
  { name:'Wipro',       emoji:'🔵', type:'Service',  base:52, ctc:'5-8 LPA',    difficulty:'Easy',      roles:['Project Engineer','Software Engineer'],                     req:['Java','Python','SQL','OOP','DBMS'] },
  { name:'Capgemini',   emoji:'🔶', type:'Service',  base:54, ctc:'5-9 LPA',    difficulty:'Easy',      roles:['Analyst','Developer','Software Engineer'],                  req:['Python','Java','SQL','OOP','Computer Networks'] },
  { name:'Adobe',       emoji:'🔴', type:'Product',  base:82, ctc:'25-45 LPA',  difficulty:'Hard',      roles:['Member of Technical Staff','Software Engineer'],            req:['Data Structures','Algorithms','C++','System Design','OOP'] },
  { name:'Zomato',      emoji:'🍕', type:'Startup',  base:70, ctc:'15-25 LPA',  difficulty:'Medium',    roles:['Backend Developer','SDE-I','Data Engineer'],               req:['Python','SQL','System Design','Node.js','Docker'] },
  { name:'Meesho',      emoji:'🛍️', type:'Startup',  base:68, ctc:'15-22 LPA',  difficulty:'Medium',    roles:['SDE-I','Backend Developer','Full Stack Developer'],          req:['Java','Python','SQL','React','Node.js'] },
  { name:'Swiggy',      emoji:'🛵', type:'Startup',  base:71, ctc:'16-26 LPA',  difficulty:'Medium',    roles:['SDE-I','Backend Developer','Data Analyst'],                 req:['Python','SQL','System Design','AWS','Node.js'] },
  { name:'PayPal',      emoji:'💰', type:'Fintech',  base:77, ctc:'22-38 LPA',  difficulty:'Hard',      roles:['Software Engineer','Backend Developer'],                    req:['Java','Data Structures','Algorithms','SQL','System Design'] },
  { name:'Oracle',      emoji:'🔴', type:'Product',  base:74, ctc:'18-32 LPA',  difficulty:'Medium',    roles:['Applications Developer','Cloud Engineer'],                  req:['Java','SQL','DBMS','OOP','System Design'] },
  { name:'IBM',         emoji:'🔵', type:'Service',  base:58, ctc:'8-14 LPA',   difficulty:'Easy',      roles:['Application Developer','Cloud Developer'],                  req:['Python','Java','SQL','Docker','Linux'] },
  { name:'Deloitte',    emoji:'🟢', type:'Consulting',base:60,ctc:'8-15 LPA',  difficulty:'Easy',      roles:['Business Analyst','Software Engineer','Data Analyst'],     req:['Python','SQL','Data Analysis','OOP','Excel'] },
  { name:'Hasura',      emoji:'⚡', type:'Startup',  base:73, ctc:'18-30 LPA',  difficulty:'Medium',    roles:['Backend Engineer','Full Stack Developer'],                  req:['JavaScript','Node.js','React','SQL','Docker'] },
  { name:'Freshworks',  emoji:'🟢', type:'Product',  base:76, ctc:'18-32 LPA',  difficulty:'Medium',    roles:['Software Development Engineer','Full Stack Developer'],     req:['Java','JavaScript','React','SQL','OOP'] }
];

const RESOURCES_DB = [
  { name:'LeetCode – Top 150 Interview Questions', type:'practice', description:'Curated list of most-asked coding problems', forSkill:'Data Structures & Algorithms', url:'https://leetcode.com/studyplan/top-interview-150/' },
  { name:'Striver A2Z DSA Sheet', type:'practice', description:'Comprehensive DSA practice from basics to advanced', forSkill:'Data Structures & Algorithms', url:'https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2/' },
  { name:'System Design Primer (GitHub)', type:'course', description:'Free open-source system design guide for interviews', forSkill:'System Design', url:'https://github.com/donnemartin/system-design-primer' },
  { name:'Grokking System Design (Educative)', type:'course', description:'Best paid course for system design concepts', forSkill:'System Design', url:'https://www.educative.io/courses/grokking-the-system-design-interview' },
  { name:'CS50 by Harvard (Free)', type:'course', description:'World-renowned intro to computer science', forSkill:'Core CS Concepts', url:'https://cs50.harvard.edu/' },
  { name:'GATE Overflow – OS & DBMS', type:'practice', description:'Practice problems for Operating Systems and DBMS', forSkill:'Core CS Concepts', url:'https://gateoverflow.in/' },
  { name:'Full Stack Open (University of Helsinki)', type:'course', description:'Free modern web development course (React, Node, GraphQL)', forSkill:'Web Development', url:'https://fullstackopen.com/' },
  { name:'The Odin Project', type:'course', description:'Free full-stack web development curriculum', forSkill:'Web Development', url:'https://www.theodinproject.com/' },
  { name:'fast.ai – Practical Deep Learning', type:'course', description:'Free practical ML & deep learning course', forSkill:'Machine Learning', url:'https://www.fast.ai/' },
  { name:'Kaggle Learn', type:'practice', description:'Free micro-courses + competitions for data science', forSkill:'Machine Learning', url:'https://www.kaggle.com/learn' },
  { name:'Codeforces – Practice Rounds', type:'practice', description:'Competitive programming practice', forSkill:'Competitive Programming', url:'https://codeforces.com/' },
  { name:'DDIA – Designing Data-Intensive Applications', type:'book', description:'Must-read book on system design & databases', forSkill:'System Design', url:'https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/' },
  { name:'Cracking the Coding Interview', type:'book', description:'Classic interview prep book for software roles', forSkill:'Data Structures & Algorithms', url:'https://www.crackingthecodinginterview.com/' },
  { name:'AWS Free Tier + Cloud Practitioner', type:'course', description:'Official AWS free training for cloud basics', forSkill:'Cloud & DevOps', url:'https://aws.amazon.com/training/digital/aws-cloud-practitioner-essentials/' },
  { name:'Docker Official Get Started Guide', type:'course', description:'Official Docker tutorial from beginner to intermediate', forSkill:'Cloud & DevOps', url:'https://docs.docker.com/get-started/' }
];

function analyzeProfile(profile) {
  const skillSet = new Set(profile.skills.map(s => s.toLowerCase()));
  const has = (s) => skillSet.has(s.toLowerCase());

  // ---- Scores ----
  const cgpa = parseFloat(profile.cgpa) || 6.0;
  const lcCount = parseInt(profile.leetcodeCount) || 0;
  const dsaMap = { Beginner:15, Basic:30, Intermediate:55, Advanced:75, Expert:92 };
  const dsaScore = dsaMap[profile.dsaLevel] || 40;
  const internMap = { none:0, '1':30, '2':55, '3+':80 };
  const internScore = internMap[profile.internships] || 0;
  const projMap = { '0':0, '1-2':35, '3-5':65, '5+':90 };
  const projScore = projMap[profile.projectCount] || 20;
  const hackMap = { none:0, participated:15, top3:40, multiple:70 };
  const hackScore = hackMap[profile.hackathons] || 0;
  const backlogPenalty = parseInt(profile.backlogs) * 8;

  const academic   = Math.max(0, Math.min(100, Math.round(cgpa * 10 - backlogPenalty)));
  const technical  = Math.min(100, Math.round((profile.skills.length * 4) + (lcCount * 0.3) + dsaScore * 0.4));
  const experience = Math.min(100, Math.round(internScore * 0.5 + hackScore * 0.3 + (profile.github ? 15 : 0) + (profile.linkedin ? 5 : 0)));
  const projects   = Math.min(100, Math.round(projScore + hackScore * 0.2 + (profile.projectsDesc.length > 50 ? 10 : 0)));
  const overall    = Math.round(academic*0.2 + technical*0.35 + experience*0.2 + projects*0.25);

  const labels = ['Not Ready','Early Stage','Building Up','Good Shape','Interview Ready','Highly Competitive'];
  const readinessLabel = overall < 20 ? labels[0] : overall < 35 ? labels[1] : overall < 50 ? labels[2] : overall < 65 ? labels[3] : overall < 80 ? labels[4] : labels[5];

  // ---- AI Insights (personalised text) ----
  const strengths = [];
  if (profile.skills.length >= 8) strengths.push('a strong and diverse technical skill set');
  if (lcCount >= 100) strengths.push(`solid algorithmic practice (${lcCount} problems solved)`);
  if (profile.internships !== 'none') strengths.push('real-world internship experience');
  if (profile.projectCount !== '0') strengths.push(`hands-on project portfolio (${profile.projectCount} projects)`);
  if (profile.hackathons === 'top3' || profile.hackathons === 'multiple') strengths.push('competitive hackathon achievements');
  if (cgpa >= 8.0) strengths.push(`strong academic record (${cgpa} CGPA)`);

  const insightStrength = strengths.length > 0
    ? `Your profile shows ${strengths.slice(0,3).join(', ')}. These give you a competitive edge during the initial screening rounds.`
    : `Your profile has room to grow. Focus on building consistent hands-on skills and increasing your project count.`;

  const roleStr = profile.targetRoles.length ? profile.targetRoles.join(', ') : 'software roles';
  const insightTarget = `For your target roles (${roleStr}), companies specifically look for strong DSA fundamentals, project demonstrations, and problem-solving ability under time constraints. Your current readiness is "${readinessLabel}".`;

  const insightAction = `With ${profile.prepTime} hour(s) of daily preparation, focus on the skill gaps identified below. Prioritize High-priority gaps first — these directly block shortlisting at your target companies. Consistency over intensity is the key to placement success.`;

  const aiInsights = `${insightStrength}\n\n${insightTarget}\n\n${insightAction}`;

  // ---- Skill Gaps ----
  const GAP_DEFS = [
    { skill:'Data Structures & Algorithms', check: () => dsaScore, required:80, priority:'High',   color:'#ef4444', action:'Solve 150+ LeetCode problems (Easy→Medium→Hard). Use Striver Sheet.' },
    { skill:'System Design',               check: () => has('system design') ? 55 : 10, required:70, priority:'High',   color:'#ef4444', action:'Study System Design Primer on GitHub. Practice designing 3-4 real-world systems.' },
    { skill:'Core CS (OS/DBMS/Networks)',  check: () => (has('operating systems') ? 30 : 0) + (has('dbms') ? 30 : 0) + (has('computer networks') ? 20 : 0), required:75, priority:'High',   color:'#ef4444', action:'Revise key OS, DBMS, and CN concepts from GATE Overflow or GeeksforGeeks.' },
    { skill:'Web Development',             check: () => Math.min(90,(has('react')?25:0)+(has('node.js')?25:0)+(has('javascript')?20:0)+(has('html')?10:0)+(has('css')?10:0)), required:60, priority:'Medium', color:'#f59e0b', action:'Build 2 full-stack projects using React + Node.js or Django + React.' },
    { skill:'Cloud & DevOps',              check: () => Math.min(90,(has('aws')?35:0)+(has('docker')?25:0)+(has('kubernetes')?20:0)+(has('ci/cd')?15:0)), required:50, priority:'Medium', color:'#f59e0b', action:'Complete AWS Cloud Practitioner (free) and Docker Get Started guide.' },
    { skill:'Machine Learning / AI',       check: () => Math.min(90,(has('machine learning')?35:0)+(has('deep learning')?25:0)+(has('tensorflow')?15:0)+(has('pytorch')?15:0)), required:60, priority:'Medium', color:'#f59e0b', action:'Complete fast.ai course and do 2 Kaggle competitions to build portfolio.' },
    { skill:'SQL & Databases',             check: () => Math.min(90,(has('sql')?50:0)+(has('dbms')?30:0)+(has('pandas')?20:0)), required:65, priority:'Low',    color:'#10b981', action:'Practice SQL on LeetCode database section + study DBMS normalization.' },
    { skill:'Competitive Programming',     check: () => Math.min(90, Math.round(lcCount * 0.5 + (has('competitive programming')?30:0))), required:55, priority:'Low', color:'#10b981', action:'Participate in Codeforces/LeetCode weekly contests regularly.' }
  ];

  const skillGaps = GAP_DEFS.map(g => ({
    skill: g.skill,
    currentLevel: Math.min(g.required - 1, g.check()),
    requiredLevel: g.required,
    priority: g.priority,
    color: g.color,
    actionPlan: g.action
  })).filter(g => g.currentLevel < g.requiredLevel);

  // ---- Radar Data ----
  const radarStudent = [
    Math.round(dsaScore * 0.9),
    has('system design') ? 55 : 12,
    Math.min(90, (has('react')?20:0)+(has('node.js')?20:0)+(has('javascript')?15:0)+(has('python')?15:0)+(has('java')?15:0)),
    Math.min(90, (has('operating systems')?25:0)+(has('dbms')?25:0)+(has('computer networks')?20:0)+(has('oop')?15:0)),
    Math.min(90, projScore + (profile.projectsDesc.length > 50 ? 15 : 0)),
    Math.min(90, 45 + (profile.internships!=='none'?20:0) + (profile.hackathons!=='none'?15:0))
  ];
  const radarBenchmark = [80, 70, 65, 75, 70, 65];

  // ---- Resources (pick relevant ones) ----
  const allGapSkills = skillGaps.map(g => g.skill.toLowerCase());
  const resources = RESOURCES_DB.filter(r => {
    const fs = r.forSkill.toLowerCase();
    return allGapSkills.some(g => fs.includes(g.split(' ')[0]) || g.includes(fs.split(' ')[0]));
  }).slice(0, 8);
  if (resources.length < 4) resources.push(...RESOURCES_DB.slice(0, 4 - resources.length));

  // ---- Companies ----
  const companies = COMPANY_DB.map(c => {
    const studentHasSkills = c.req.filter(r => has(r));
    const matchRatio = studentHasSkills.length / c.req.length;
    let score = Math.round(c.base * matchRatio * 0.6 + overall * 0.4);
    // bonus for CGPA
    if (cgpa >= 8.5) score = Math.min(99, score + 5);
    else if (cgpa < 6.0) score = Math.max(10, score - 10);
    // internship bonus
    if (profile.internships !== 'none' && c.type === 'FAANG') score = Math.min(99, score + 5);

    const verdict = buildVerdict(c, studentHasSkills, score, profile);
    return {
      name: c.name, emoji: c.emoji, type: c.type,
      matchScore: Math.max(10, Math.min(98, score)),
      roles: c.roles, ctc: c.ctc, difficulty: c.difficulty,
      requiredSkills: c.req, studentHasSkills, verdict
    };
  }).sort((a, b) => b.matchScore - a.matchScore);

  // ---- Roadmap ----
  const prepHours = parseInt(profile.prepTime) || 2;
  const weeks = Math.max(8, Math.round(80 / (prepHours * 3)));
  const roadmap = buildRoadmap(profile, skillGaps, weeks);

  return { profileScore: { overall, breakdown: { technical, projects, academics: academic, experience } }, readinessLabel, aiInsights, skillGaps, radarData: { labels:['DSA/Algorithms','System Design','Web/Dev Skills','Core CS','Projects/Portfolio','Soft Skills'], student: radarStudent, benchmark: radarBenchmark }, resources, companies, roadmap };
}

function buildVerdict(c, has, score, profile) {
  const missing = c.req.filter(r => !has.includes(r));
  if (score >= 75) return `Great match! Your profile aligns well with ${c.name}'s requirements. ${missing.length > 0 ? 'Focus on strengthening: ' + missing.slice(0,2).join(', ') + '.' : 'Keep practising DSA and mock interviews to stay sharp.'}`;
  if (score >= 50) return `Moderate match. You have the foundation for ${c.name} but need to bridge gaps in: ${missing.slice(0,3).join(', ')}. Aim for this after 2-3 months of prep.`;
  return `Stretch goal — ${c.name} requires stronger fundamentals in: ${missing.join(', ')}. Target after solidifying your core skills. Great long-term goal!`;
}

function buildRoadmap(profile, gaps, totalWeeks) {
  const highGaps = gaps.filter(g => g.priority === 'High').map(g => g.skill);
  const medGaps  = gaps.filter(g => g.priority === 'Medium').map(g => g.skill);
  const lcCount  = parseInt(profile.leetcodeCount) || 0;

  return [
    {
      phase: 'Foundation Phase',
      duration: 'Weeks 1-' + Math.round(totalWeeks * 0.25),
      weeks: [
        { week:'Week 1', focus:'DSA Fundamentals', tasks:['Revise Arrays, Strings, Linked Lists','Solve 15 Easy LeetCode problems','Study Time & Space Complexity','Watch NeetCode Roadmap overview'] },
        { week:'Week 2', focus:'Core CS Revision', tasks:['Revise OS: Processes, Threads, Scheduling','Revise DBMS: Normalization, Transactions, Indexing','Revise Computer Networks: TCP/IP, HTTP, DNS','Solve 10 GATE-level MCQs per topic'] },
        { week:'Week 3', focus:'OOP & Language Mastery', tasks:['Deep-dive OOP: Inheritance, Polymorphism, SOLID','Practice coding patterns in your primary language','Solve 20 Easy–Medium LeetCode problems','Build a small CLI project using OOP concepts'] }
      ],
      resources: ['GeeksforGeeks DSA Sheet', 'GATE Overflow', 'Striver A2Z Sheet (Phase 1)']
    },
    {
      phase: 'Core DSA Phase',
      duration: `Weeks ${Math.round(totalWeeks*0.25)+1}-${Math.round(totalWeeks*0.55)}`,
      weeks: [
        { week:'Week 4', focus:'Trees & Graphs', tasks:['Binary Trees: Traversals, LCA, Height','BST operations & balancing','Graph: BFS, DFS, Dijkstra','Solve 20 Medium LeetCode problems (trees + graphs)'] },
        { week:'Week 5', focus:'Dynamic Programming', tasks:['DP: Memoization vs Tabulation','Classic DP: Knapsack, LCS, LIS, Coin Change','Solve 15 Medium DP problems on LeetCode','Attempt 2 LeetCode contests'] },
        { week:'Week 6', focus:'Advanced Patterns', tasks:['Sliding Window, Two Pointers, Binary Search on Answer','Backtracking: N-Queens, Sudoku Solver','Heap & Priority Queue problems','Solve 20 Hard-level problems'] }
      ],
      resources: ['LeetCode Top 150', 'NeetCode 150', 'Striver A2Z Sheet (Phase 2-3)']
    },
    {
      phase: 'System Design Phase',
      duration: `Weeks ${Math.round(totalWeeks*0.55)+1}-${Math.round(totalWeeks*0.75)}`,
      weeks: [
        { week:'Week 7', focus:'System Design Basics', tasks:['Load Balancing, Caching, CDN, Sharding','Design URL Shortener & Pastebin','Study CAP Theorem, Consistency models','Watch Gaurav Sen System Design playlist'] },
        { week:'Week 8', focus:'Advanced System Design', tasks:['Design Twitter, Instagram Feed, WhatsApp','Study Microservices vs Monolith','API Rate Limiting, Message Queues (Kafka/RabbitMQ)','Practice explaining designs out loud in 30 min'] }
      ],
      resources: ['System Design Primer (GitHub)', 'Grokking System Design', 'Gaurav Sen YouTube']
    },
    {
      phase: 'Company-Specific Prep',
      duration: `Weeks ${Math.round(totalWeeks*0.75)+1}-${Math.round(totalWeeks*0.9)}`,
      weeks: [
        { week:'Week 9', focus:'Target Company Patterns', tasks:['Research last 3 years of interview questions for each target company','Practice company-tagged problems on LeetCode','Revise behavioral questions (STAR format)','Study target company tech stack & engineering blog'] },
        { week:'Week 10', focus:'Portfolio & Resume Polish', tasks:['Update GitHub with 2+ strong projects','Write clear README for each project','Tailor resume for each target role','Get resume reviewed by peers or mentors'] }
      ],
      resources: ['LeetCode Company Tags', 'LinkedIn for research', 'Glassdoor Interview Reviews']
    },
    {
      phase: 'Mock Interview & Final Sprint',
      duration: `Weeks ${Math.round(totalWeeks*0.9)+1}-${totalWeeks}`,
      weeks: [
        { week:'Final Week 1', focus:'Mock Interviews', tasks:['Do 5+ mock interviews on Pramp / interviewing.io','Record yourself and review posture + clarity','Solve 10 problems in timed 45-min sessions','Practise system design mock with a friend'] },
        { week:'Final Week 2', focus:'Confidence & Wrap-Up', tasks:['Light revision of weak areas only','Read about companies: culture, products, mission','Sleep well — peak performance on interview day!','Keep a positive mindset; you\'ve prepared well!'] }
      ],
      resources: ['Pramp.com', 'interviewing.io', 'Blind (for company culture intel)']
    }
  ];
}

// =====================================================
// LOADING ANIMATION
// =====================================================
function animateLoadingSteps() {
  const steps = ['ls-1', 'ls-2', 'ls-3', 'ls-4', 'ls-5'];
  let i = 0;
  const interval = setInterval(() => {
    if (i > 0) {
      const prev = document.getElementById(steps[i - 1]);
      if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
    }
    if (i < steps.length) {
      const cur = document.getElementById(steps[i]);
      if (cur) cur.classList.add('active');
      i++;
    } else {
      clearInterval(interval);
    }
  }, 1200);
  return interval;
}

// =====================================================
// MAIN ANALYSIS  (Gemini API + Local fallback engine)
// =====================================================
async function startAnalysis() {
  if (!state.currentUser) {
    openAuthModal('register');
    return;
  }

  const btn     = document.getElementById('analyze-btn');
  const btnText = document.getElementById('analyze-btn-text');
  const spinner = document.getElementById('analyze-spinner');

  btn.disabled = true;
  btnText.textContent = state.geminiConfigured ? 'Analyzing with Gemini AI...' : 'Analyzing locally...';
  spinner?.classList.remove('hidden');

  showPage('page-dashboard');
  const overlay = document.getElementById('loading-overlay');
  overlay?.classList.remove('hidden');

  const loadingInterval = animateLoadingSteps();
  await sleep(200);

  try {
    const profile = collectProfile();
    // 1. Calculate local base metrics (scores, radar, gaps, companies, roadmap)
    const result = analyzeProfile(profile);

    // 2. Request Gemini AI enhanced insights from server API
    try {
      const apiRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.success && apiData.data) {
          result.geminiData = apiData.data;
          if (apiData.data.aiInsights) {
            result.aiInsights = apiData.data.aiInsights;
          }
          if (apiData.data.readinessLabel) {
            result.readinessLabel = apiData.data.readinessLabel;
          }
          result.isGemini = true;
        } else {
          result.isGemini = false;
        }
      }
    } catch (apiErr) {
      console.warn('API call skipped or offline, using local engine:', apiErr);
      result.isGemini = false;
    }

    state.analysisResult = result;
    state.profile = profile;

    clearInterval(loadingInterval);
    ['ls-1','ls-2','ls-3','ls-4','ls-5'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('active'); el.classList.add('done'); }
    });
    await sleep(400);
    overlay?.classList.add('hidden');
    renderDashboard(result, profile);

    // Auto-save to user account if logged in
    if (state.token) {
      fetch('/api/user/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ profile, analysis: result })
      }).catch(err => console.warn('Could not auto-save profile:', err));
    }

  } catch (err) {
    clearInterval(loadingInterval);
    overlay?.classList.add('hidden');
    showPage('page-profile');
    alert(`Analysis Failed\n\n${err.message}`);
    console.error(err);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Analyze My Profile';
    spinner?.classList.add('hidden');
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =====================================================
// RENDER DASHBOARD
// =====================================================
function renderDashboard(result, profile) {
  document.getElementById('greeting-name').textContent = `Hello, ${profile.name}!`;
  document.getElementById('greeting-sub').textContent = 'Your placement analysis is ready';

  // Readiness badge
  const badge = document.getElementById('readiness-badge');
  const label = document.getElementById('readiness-label');
  if (label) label.textContent = result.readinessLabel || 'Analyzing...';
  if (badge && result.readinessLabel) {
    const colorMap = {
      'Not Ready': 'rgba(239,68,68,0.15)', 'Early Stage': 'rgba(245,158,11,0.15)',
      'Building Up': 'rgba(245,158,11,0.15)', 'Good Shape': 'rgba(16,185,129,0.15)',
      'Interview Ready': 'rgba(16,185,129,0.15)', 'Highly Competitive': 'rgba(124,58,237,0.15)'
    };
    const textMap = {
      'Not Ready': '#fca5a5', 'Early Stage': '#fcd34d',
      'Building Up': '#fcd34d', 'Good Shape': '#6ee7b7',
      'Interview Ready': '#6ee7b7', 'Highly Competitive': '#c4b5fd'
    };
    badge.style.background = colorMap[result.readinessLabel] || 'rgba(16,185,129,0.15)';
    badge.style.color = textMap[result.readinessLabel] || '#6ee7b7';
    badge.style.borderColor = (textMap[result.readinessLabel] || '#6ee7b7').replace(')', ',0.3)').replace('rgb', 'rgba');
  }

  // Update AI engine badge
  const engineBadge = document.getElementById('ai-engine-badge');
  if (engineBadge) {
    if (result.isGemini) {
      engineBadge.textContent = 'Google Gemini AI';
      engineBadge.style.background = 'rgba(124,58,237,0.2)';
      engineBadge.style.color = '#c4b5fd';
    } else {
      engineBadge.textContent = 'Local Analysis';
      engineBadge.style.background = '';
      engineBadge.style.color = '';
    }
  }

  // Render Gemini interview tips & questions card
  const geminiCard = document.getElementById('gemini-questions-card');
  const geminiList = document.getElementById('gemini-questions-list');
  if (geminiCard && geminiList) {
    if (result.isGemini && result.geminiData && result.geminiData.companyInterviewTips) {
      const tips = result.geminiData.companyInterviewTips;
      geminiList.innerHTML = tips.map(tip => `
        <div class="gemini-focus-group">
          <div class="gemini-focus-title">
            <span>${tip.companyType || 'Target Company'}</span>
          </div>
          <div class="gemini-focus-hiring">${tip.hiringFocus || ''}</div>
          <div class="gemini-q-list">
            ${(tip.predictedQuestions || []).map(q => `
              <div class="gemini-q-item">
                <span class="gemini-q-icon">Q:</span>
                <span>${q}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
      geminiCard.style.display = 'block';
    } else {
      geminiCard.style.display = 'none';
    }
  }

  renderProfileScore(result.profileScore);
  renderTopCompanies(result.companies);
  renderAISummary(result.aiInsights);
  renderSkillGaps(result.skillGaps, result.radarData);
  renderResources(result.resources);
  renderCompanies(result.companies, profile.skills);
  renderRoadmap(result.roadmap);
}

// =====================================================
// PROFILE SCORE
// =====================================================
function renderProfileScore(scoreData) {
  if (!scoreData) return;
  const score = scoreData.overall || 0;
  const numEl = document.getElementById('score-num');
  const ringEl = document.getElementById('score-ring-fill');

  // Animate counter
  let current = 0;
  const target = score;
  const step = target / 60;
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    if (numEl) numEl.textContent = Math.round(current);
    if (current >= target) clearInterval(interval);
  }, 16);

  // Animate ring (circumference = 364.4)
  if (ringEl) {
    setTimeout(() => {
      const offset = 364.4 - (364.4 * score / 100);
      ringEl.style.transition = 'stroke-dashoffset 1.5s ease';
      ringEl.style.strokeDashoffset = offset;
    }, 100);
  }

  // Breakdown
  const breakdown = scoreData.breakdown || {};
  const breakdownEl = document.getElementById('score-breakdown');
  if (breakdownEl) {
    const items = [
      { label: 'Technical', key: 'technical', color: '#6366f1' },
      { label: 'Projects', key: 'projects', color: '#06b6d4' },
      { label: 'Academics', key: 'academics', color: '#10b981' },
      { label: 'Experience', key: 'experience', color: '#f59e0b' }
    ];
    breakdownEl.innerHTML = items.map(item => `
      <div class="score-item">
        <span class="score-item-label">${item.label}</span>
        <div class="score-item-bar">
          <div class="score-item-fill" style="width:${breakdown[item.key] || 0}%; background:${item.color}"></div>
        </div>
        <span class="score-item-val" style="color:${item.color}">${breakdown[item.key] || 0}</span>
      </div>
    `).join('');
  }
}

// =====================================================
// COMPANY LOGO HELPER (Real Vector SVGs)
// =====================================================
function getCompanyLogo(name) {
  const n = (name || '').toLowerCase();
  
  // Google
  if (n.includes('google')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/><path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.1-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z"/></svg>`;
  }
  
  // Microsoft
  if (n.includes('microsoft')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>`;
  }
  
  // Amazon
  if (n.includes('amazon')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><path fill="#FF9900" d="M18.8 18.2c-5.8 4.2-13.8 2.3-17.7-1-.3-.2-.1-.6.2-.4 4.5 2.5 12.3 2.8 17.1-1.3.3-.3.6.4.4.7z"/><path fill="#FF9900" d="M20.4 16.5c-.2-.3-1.6-.2-2.4 0-.3 0-.3-.3 0-.5 1.5-1 4.1-.7 4.4-.3.3.4-.2 3.1-1.6 4.3-.2.2-.4.1-.4-.2 0-.9 0-2.8 0-3.3z"/><path fill="#FFF" d="M14.6 11.2c0-1.8-.8-2.6-2.6-2.6-1.3 0-2.4.6-2.8 1.1-.2.2 0 .4.2.5l.7.5c.2.1.4 0 .5-.2.3-.3.8-.6 1.4-.6 1 0 1.3.5 1.3 1.4v.3c-2.8.1-4.7.7-4.7 2.4 0 1.2.9 1.9 2.1 1.9 1.3 0 2.2-.6 2.6-1.3v1.1c0 .2.2.3.4.3h1c.2 0 .4-.1.4-.3v-5.5zm-1.3 3.6c-.3.5-.9.9-1.6.9-.7 0-1.2-.4-1.2-1.1 0-.9.9-1.2 2.8-1.3v1.5z"/></svg>`;
  }
  
  // Meta
  if (n.includes('meta')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><path fill="#0081FB" d="M16.8 5c-2.3 0-4.3 1.4-5.3 3.4C10.5 6.4 8.5 5 6.2 5 2.8 5 0 7.8 0 11.2c0 3.7 2.8 7.8 6.7 7.8 2.2 0 4.1-1.2 5.1-3 1 1.8 2.9 3 5.1 3 3.9 0 6.7-4.1 6.7-7.8C23.6 7.8 20.8 5 16.8 5zm-10.6 11.4c-2.4 0-4.3-2.6-4.3-5.2 0-2.2 1.7-4 3.9-4 1.8 0 3.3 1.2 4.1 3.1-.9 3.4-2.5 6.1-3.7 6.1zm11.1 0c-1.2 0-2.8-2.7-3.7-6.1.8-1.9 2.3-3.1 4.1-3.1 2.2 0 3.9 1.8 3.9 4 0 2.6-1.9 5.2-4.3 5.2z"/></svg>`;
  }
  
  // Flipkart
  if (n.includes('flipkart')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#2874F0"/><path fill="#FFE500" d="M7 6h7c1.7 0 3 1.3 3 3s-1.3 3-3 3h-4v6H7V6zm3 4h4c.6 0 1-.4 1-1s-.4-1-1-1h-4v2z"/></svg>`;
  }
  
  // Razorpay
  if (n.includes('razorpay')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0C2340"/><path fill="#0284C7" d="M14.6 4l-5.8 9h3.8l-3.1 7 8-9.8h-4l2.8-6.2h-1.7z"/></svg>`;
  }

  // Atlassian
  if (n.includes('atlassian')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><path fill="#0052CC" d="M11.6 12.3c-.3-.4-.8-.7-1.3-.7-.6 0-1.1.3-1.4.7L4.1 19.5c-.3.4-.3.9 0 1.3.2.3.6.5 1 .5h7.6c.4 0 .8-.2 1-.5.3-.4.3-.9 0-1.3l-2.1-7.2z"/><path fill="#2684FF" d="M12.4 4.2l5.8 9.3c.3.4.3.9 0 1.3-.3.4-.7.6-1.2.6h-3.6c-.4 0-.8-.2-1-.5-.3-.4-.3-.9 0-1.3l2-4.9c.3-.4.8-.7 1.3-.7.5 0 1 .3 1.3.7z"/></svg>`;
  }

  // Adobe
  if (n.includes('adobe')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#FA0F00"/><path fill="#FFF" d="M14.8 5H21v14zm-5.6 0H3v14zm2.8 6.5l3.5 7.5h-2.5l-1.3-3h-2.8l2.2-4.5z"/></svg>`;
  }

  // Oracle
  if (n.includes('oracle')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#C74634"/><path fill="#FFF" d="M8 8a4 4 0 0 0 0 8h8a4 4 0 0 0 0-8H8zm0 2h8a2 2 0 0 1 0 4H8a2 2 0 0 1 0-4z"/></svg>`;
  }

  // IBM
  if (n.includes('ibm')) {
    return `<svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#054ADA"/><text x="12" y="16" fill="#FFF" font-family="'Inter', sans-serif" font-weight="900" font-size="9" text-anchor="middle" letter-spacing="1">IBM</text></svg>`;
  }

  // Fallback monogram badge
  const initials = (name || 'Co').slice(0, 2).toUpperCase();
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = [
    ['#6366f1', '#4f46e5'],
    ['#06b6d4', '#0891b2'],
    ['#10b981', '#059669'],
    ['#f59e0b', '#d97706'],
    ['#ec4899', '#db2777'],
    ['#8b5cf6', '#7c3aed']
  ];
  const [c1, c2] = colors[hash % colors.length];
  
  return `<svg width="22" height="22" viewBox="0 0 24 24"><defs><linearGradient id="g_${initials}_${hash}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#g_${initials}_${hash})"/><text x="12" y="16" fill="#FFF" font-family="'Inter', sans-serif" font-weight="700" font-size="9.5" text-anchor="middle">${initials}</text></svg>`;
}

// =====================================================
// TOP COMPANIES
// =====================================================
function renderTopCompanies(companies) {
  const el = document.getElementById('top-companies-list');
  if (!el || !companies) return;
  const top = companies.slice(0, 4);
  el.innerHTML = top.map(c => `
    <div class="company-row" onclick="showTab('companies')">
      <div class="company-logo">${getCompanyLogo(c.name)}</div>
      <div class="company-row-info">
        <div class="company-row-name">${c.name}</div>
        <div class="company-row-role">${(c.roles || ['Software Engineer'])[0]} • ${c.ctc || 'N/A'}</div>
      </div>
      <div class="company-row-score">${c.matchScore}%</div>
    </div>
  `).join('');
}

// =====================================================
// AI SUMMARY
// =====================================================
function renderAISummary(text) {
  const el = document.getElementById('ai-summary-text');
  if (!el || !text) return;
  const paragraphs = text.split('\n').filter(p => p.trim());
  el.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
}

// =====================================================
// SKILL GAPS + RADAR
// =====================================================
function renderSkillGaps(gaps, radarData) {
  if (!gaps) return;

  const listEl = document.getElementById('gaps-list');
  if (listEl) {
    listEl.innerHTML = gaps.map(g => {
      const gapPct = g.currentLevel || 0;
      const reqPct = g.requiredLevel || 80;
      const actual = Math.min(gapPct, reqPct);
      return `
        <div class="gap-item">
          <div class="gap-header">
            <span class="gap-skill-name">${g.skill}</span>
            <span class="gap-score" style="color:${g.color || '#f59e0b'}">${g.priority || 'Medium'} Priority</span>
          </div>
          <div class="gap-full-bar">
            <div class="gap-full-fill" style="width:${actual}%; background:${g.color || '#7c3aed'}"></div>
          </div>
          <div class="gap-action">${g.actionPlan || 'Focus on building this skill'} (${gapPct}% → ${reqPct}% needed)</div>
        </div>
      `;
    }).join('');
  }

  // Draw radar chart
  if (radarData) drawRadar(radarData);
}

// =====================================================
// RADAR CHART (Canvas)
// =====================================================
function drawRadar(data) {
  const canvas = document.getElementById('radarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = data.labels || [];
  const studentData = data.student || [];
  const benchmarkData = data.benchmark || [];
  const n = labels.length;

  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 40;

  ctx.clearRect(0, 0, W, H);

  const angle = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;
  const point = (r, i) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  // Grid circles
  [20, 40, 60, 80, 100].forEach(pct => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = point(R * pct / 100, i);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Axes
  for (let i = 0; i < n; i++) {
    const [x, y] = point(R, i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Benchmark polygon
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x, y] = point(R * (benchmarkData[i] || 80) / 100, i);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,182,212,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,182,212,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Student polygon
  const gradFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  gradFill.addColorStop(0, 'rgba(99,102,241,0.4)');
  gradFill.addColorStop(1, 'rgba(99,102,241,0.05)');

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x, y] = point(R * (studentData[i] || 0) / 100, i);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = gradFill;
  ctx.fill();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots
  for (let i = 0; i < n; i++) {
    const [x, y] = point(R * (studentData[i] || 0) / 100, i);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#818cf8';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Labels
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const [x, y] = point(R + 24, i);
    const lines = labels[i].split('/');
    const lineH = 15;
    const startY = y - ((lines.length - 1) * lineH / 2);
    lines.forEach((line, li) => {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(line.trim(), x, startY + li * lineH);
    });
  }

  // Legend
  const lx = 20, ly = H - 40;
  ctx.beginPath(); ctx.rect(lx, ly, 12, 3); ctx.fillStyle = '#6366f1'; ctx.fill();
  ctx.fillStyle = '#94a3b8'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Your Skills', lx + 16, ly + 4);

  ctx.beginPath(); ctx.rect(lx + 100, ly, 12, 3); ctx.fillStyle = 'rgba(6,182,212,0.6)'; ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Industry Bar', lx + 116, ly + 4);
}

// =====================================================
// RESOURCES
// =====================================================
function renderResources(resources) {
  const el = document.getElementById('resources-grid');
  if (!el || !resources) return;
  el.innerHTML = resources.map(r => `
    <div class="resource-card" onclick="window.open('${r.url || '#'}','_blank')">
      <div class="resource-type ${r.type || 'course'}">${r.type || 'Course'}</div>
      <div class="resource-name">${r.name}</div>
      <div class="resource-desc">${r.description} <br/><span style="color:#7c3aed;font-size:0.72rem;">For: ${r.forSkill}</span></div>
    </div>
  `).join('');
}

// =====================================================
// COMPANIES
// =====================================================
function renderCompanies(companies, studentSkills) {
  const el = document.getElementById('companies-grid');
  if (!el || !companies) return;

  const skillSet = new Set(studentSkills);

  el.innerHTML = companies.map(c => {
    const required = c.requiredSkills || [];
    const has = new Set(c.studentHasSkills || []);

    const chipsHtml = required.map(s => `
      <span class="csn-chip ${has.has(s) ? 'ok-chip' : 'gap-chip'}">${has.has(s) ? '✓' : '✗'} ${s}</span>
    `).join('');

    return `
      <div class="company-card">
        <div class="company-card-header">
          <div class="company-logo">${getCompanyLogo(c.name)}</div>
          <div>
            <div class="company-card-name">${c.name}</div>
            <div class="company-card-type">${c.type || 'Company'}</div>
          </div>
        </div>
        <div class="company-match-bar">
          <div class="cmb-header">
            <span class="cmb-label">Profile Match</span>
            <span class="cmb-pct">${c.matchScore}%</span>
          </div>
          <div class="cmb-bar">
            <div class="cmb-fill" style="width:${c.matchScore}%"></div>
          </div>
        </div>
        <div class="company-details">
          <div class="company-detail"><span class="cd-label">Roles</span><span class="cd-value">${(c.roles || []).join(', ')}</span></div>
          <div class="company-detail"><span class="cd-label">Package</span><span class="cd-value">${c.ctc || 'N/A'}</span></div>
          <div class="company-detail"><span class="cd-label">Difficulty</span><span class="cd-value">${c.difficulty || 'Medium'}</span></div>
        </div>
        <div class="company-skills-needed">
          <div class="csn-label">Required Skills</div>
          <div class="csn-chips">${chipsHtml}</div>
        </div>
        <div class="company-verdict">${c.verdict || ''}</div>
      </div>
    `;
  }).join('');
}

// =====================================================
// =====================================================
// ROADMAP: TREE & FLOW EXPERIENCE
// =====================================================
const PHASE_THEMES = [
  {
    badge: 'Phase 01',
    accent: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.18)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
  },
  {
    badge: 'Phase 02',
    accent: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.18)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>`
  },
  {
    badge: 'Phase 03',
    accent: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.18)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`
  },
  {
    badge: 'Phase 04',
    accent: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.18)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="22.01"></line><line x1="15" y1="22" x2="15" y2="22.01"></line><line x1="9" y1="6" x2="9" y2="6.01"></line><line x1="15" y1="6" x2="15" y2="6.01"></line><line x1="9" y1="10" x2="9" y2="10.01"></line><line x1="15" y1="10" x2="15" y2="10.01"></line></svg>`
  },
  {
    badge: 'Phase 05',
    accent: '#10b981',
    bg: 'rgba(16, 185, 129, 0.18)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`
  }
];

let currentRoadmapData = null;

function getCompletedTasks() {
  const userKey = state.currentUser ? state.currentUser.email : 'guest';
  try {
    return JSON.parse(localStorage.getItem(`skillsync_completed_${userKey}`) || '[]');
  } catch (e) {
    return [];
  }
}

function saveCompletedTasks(tasks) {
  const userKey = state.currentUser ? state.currentUser.email : 'guest';
  localStorage.setItem(`skillsync_completed_${userKey}`, JSON.stringify(tasks));
}

function toggleTask(taskId, e) {
  if (e) e.stopPropagation();
  const completed = getCompletedTasks();
  const set = new Set(completed);
  if (set.has(taskId)) {
    set.delete(taskId);
  } else {
    set.add(taskId);
  }
  saveCompletedTasks(Array.from(set));

  const taskEl = document.getElementById(taskId);
  if (taskEl) {
    taskEl.classList.toggle('completed', set.has(taskId));
  }
  updateRoadmapProgress();
}

function togglePhase(idx) {
  const phaseEl = document.getElementById(`tree-phase-${idx}`);
  if (phaseEl) {
    phaseEl.classList.toggle('collapsed');
  }
}

function toggleAllPhases(expand) {
  document.querySelectorAll('.tree-phase-node').forEach(node => {
    node.classList.toggle('collapsed', !expand);
  });
}

function scrollToPhase(idx) {
  const phaseEl = document.getElementById(`tree-phase-${idx}`);
  if (phaseEl) {
    phaseEl.classList.remove('collapsed');
    phaseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.flow-step-item').forEach((item, i) => {
      item.classList.toggle('active', i === idx);
    });
  }
}

function updateRoadmapProgress() {
  if (!currentRoadmapData) return;
  const completed = new Set(getCompletedTasks());
  let totalTasks = 0;
  let totalCompleted = 0;

  currentRoadmapData.forEach((phase, pIdx) => {
    let phaseTotal = 0;
    let phaseDone = 0;

    (phase.weeks || []).forEach((week, wIdx) => {
      let weekTotal = (week.tasks || []).length;
      let weekDone = 0;

      (week.tasks || []).forEach((_, tIdx) => {
        const taskId = `task_${pIdx}_${wIdx}_${tIdx}`;
        if (completed.has(taskId)) {
          weekDone++;
          phaseDone++;
          totalCompleted++;
        }
        totalTasks++;
      });

      phaseTotal += weekTotal;

      // Update week UI indicators
      const weekStatsEl = document.getElementById(`week-stats-${pIdx}-${wIdx}`);
      const branchDotEl = document.getElementById(`branch-dot-${pIdx}-${wIdx}`);
      const isWeekAllDone = weekTotal > 0 && weekDone === weekTotal;

      if (weekStatsEl) {
        weekStatsEl.textContent = `${weekDone}/${weekTotal} done`;
        weekStatsEl.classList.toggle('all-done', isWeekAllDone);
      }
      if (branchDotEl) {
        branchDotEl.classList.toggle('all-done', isWeekAllDone);
      }
    });

    // Update phase hub pill
    const phasePillEl = document.getElementById(`phase-pill-${pIdx}`);
    const isPhaseAllDone = phaseTotal > 0 && phaseDone === phaseTotal;
    if (phasePillEl) {
      phasePillEl.textContent = isPhaseAllDone ? 'Completed' : `${phaseDone}/${phaseTotal} done`;
      phasePillEl.classList.toggle('all-done', isPhaseAllDone);
    }
  });

  // Update Global Header Progress
  const pct = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const fillEl = document.getElementById('roadmap-progress-fill');
  const statsEl = document.getElementById('roadmap-progress-stats');
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (statsEl) statsEl.textContent = `${totalCompleted} / ${totalTasks} Tasks Completed (${pct}%)`;
}

function renderRoadmap(roadmap) {
  const ribbonEl = document.getElementById('roadmap-flow-ribbon');
  const treeEl = document.getElementById('roadmap-container');
  if (!treeEl || !roadmap) return;

  currentRoadmapData = roadmap;
  const completed = new Set(getCompletedTasks());

  // 1. Render Flow Ribbon Highway
  if (ribbonEl) {
    ribbonEl.innerHTML = roadmap.map((phase, idx) => {
      const theme = PHASE_THEMES[idx % PHASE_THEMES.length];
      const isLast = idx === roadmap.length - 1;
      const cleanPhaseName = phase.phase.replace(/\sPhase$/i, '');
      return `
        <div class="flow-step-item ${idx === 0 ? 'active' : ''}" onclick="scrollToPhase(${idx})" title="Jump to ${phase.phase}">
          <div class="flow-step-circle" style="background: ${theme.accent};">${idx + 1}</div>
          <div class="flow-step-text">
            <span class="flow-step-name">${cleanPhaseName}</span>
            <span class="flow-step-time">${phase.duration || ''}</span>
          </div>
        </div>
        ${!isLast ? '<div class="flow-step-connector"></div>' : ''}
      `;
    }).join('');
  }

  // 2. Render Tree Spine & Branching Nodes
  treeEl.innerHTML = roadmap.map((phase, pIdx) => {
    const theme = PHASE_THEMES[pIdx % PHASE_THEMES.length];
    const isCollapsed = pIdx > 1; // expand first 2 phases by default

    const weeksHtml = (phase.weeks || []).map((w, wIdx) => {
      const tasksHtml = (w.tasks || []).map((t, tIdx) => {
        const taskId = `task_${pIdx}_${wIdx}_${tIdx}`;
        const isDone = completed.has(taskId);
        return `
          <div class="task-item ${isDone ? 'completed' : ''}" id="${taskId}" onclick="toggleTask('${taskId}', event)">
            <div class="task-check-box">
              <svg class="task-check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <span class="task-item-text">${t}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="tree-branch-item">
          <div class="branch-dot" id="branch-dot-${pIdx}-${wIdx}"></div>
          <div class="branch-card">
            <div class="branch-card-header">
              <div class="bch-left">
                <span class="branch-week-badge">${w.week}</span>
                <span class="branch-focus-title">${w.focus || ''}</span>
              </div>
              <span class="branch-week-stats" id="week-stats-${pIdx}-${wIdx}">0/0 done</span>
            </div>
            <div class="branch-tasks">
              ${tasksHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const resourcesHtml = phase.resources && phase.resources.length > 0 ? `
      <div class="tree-resources-branch">
        <div class="resources-pod">
          <span class="resources-pod-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            Key Resources
          </span>
          <div class="resources-pod-chips">
            ${phase.resources.map(r => `<span class="res-leaf-chip">${r}</span>`).join('')}
          </div>
        </div>
      </div>
    ` : '';

    return `
      <div class="tree-phase-node ${isCollapsed ? 'collapsed' : ''}" id="tree-phase-${pIdx}">
        <div class="phase-hub" onclick="togglePhase(${pIdx})">
          <div class="phase-hub-icon" style="background: ${theme.accent};">
            ${theme.icon}
          </div>
          <div class="phase-hub-details">
            <div class="phase-hub-meta">
              <span class="phase-hub-badge">${theme.badge}</span>
              <span class="phase-hub-duration">${phase.duration || ''}</span>
            </div>
            <h3 class="phase-hub-title">${phase.phase}</h3>
          </div>
          <span class="phase-progress-pill" id="phase-pill-${pIdx}">0 done</span>
          <div class="phase-hub-toggle">&#9660;</div>
        </div>
        <div class="tree-branches">
          ${weeksHtml}
        </div>
        ${resourcesHtml}
      </div>
    `;
  }).join('');

  // 3. Sync progress stats & check states
  updateRoadmapProgress();
}

// =====================================================
// TABS
// =====================================================
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-content-${tabId}`)?.classList.add('active');
  document.getElementById(`tab-btn-${tabId}`)?.classList.add('active');
}

// =====================================================
// DOWNLOAD REPORT
// =====================================================
function downloadReport() {
  if (!state.analysisResult || !state.profile) {
    alert('No analysis data available. Please complete your profile analysis first.');
    return;
  }

  const result = state.analysisResult;
  const profile = state.profile;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>SkillSync AI Report – ${profile.name}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1e293b; }
  h1 { color: #7c3aed; } h2 { color: #0891b2; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  .badge { display: inline-block; padding: 6px 16px; border-radius: 100px; background: #f0fdf4; color: #16a34a; font-weight: bold; }
  .score { font-size: 3rem; font-weight: 900; color: #7c3aed; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #f8fafc; text-align: left; padding: 10px; }
  td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
  .gap-bar { height: 8px; background: #e2e8f0; border-radius: 4px; }
  .gap-fill { height: 8px; background: #7c3aed; border-radius: 4px; }
  footer { margin-top: 40px; color: #94a3b8; font-size: 0.85rem; text-align: center; }
</style>
</head>
<body>
<h1>SkillSync AI – Placement Analysis Report</h1>
<p><strong>Student:</strong> ${profile.name} | <strong>College:</strong> ${profile.college} | <strong>Branch:</strong> ${profile.branch} | <strong>CGPA:</strong> ${profile.cgpa}</p>
<p><strong>Readiness:</strong> <span class="badge">${result.readinessLabel}</span></p>

<h2>Profile Score</h2>
<div class="score">${result.profileScore?.overall}/100</div>
<table>
  <tr><th>Category</th><th>Score</th></tr>
  ${Object.entries(result.profileScore?.breakdown || {}).map(([k, v]) => `<tr><td>${k}</td><td>${v}/100</td></tr>`).join('')}
</table>

<h2>AI Insights</h2>
<p>${(result.aiInsights || '').replace(/\n/g, '</p><p>')}</p>

<h2>Skill Gaps</h2>
<table>
  <tr><th>Skill</th><th>Current</th><th>Required</th><th>Priority</th><th>Action</th></tr>
  ${(result.skillGaps || []).map(g => `<tr><td>${g.skill}</td><td>${g.currentLevel}%</td><td>${g.requiredLevel}%</td><td>${g.priority}</td><td>${g.actionPlan}</td></tr>`).join('')}
</table>

<h2>Company Recommendations</h2>
<table>
  <tr><th>Company</th><th>Match</th><th>Role</th><th>Package</th><th>Difficulty</th></tr>
  ${(result.companies || []).map(c => `<tr><td>${c.name}</td><td>${c.matchScore}%</td><td>${(c.roles || [])[0]}</td><td>${c.ctc}</td><td>${c.difficulty}</td></tr>`).join('')}
</table>

${result.geminiData?.companyInterviewTips ? `
<h2>AI Predicted Interview Questions</h2>
${result.geminiData.companyInterviewTips.map(t => `
  <h3>${t.companyType}</h3>
  <p><strong>Hiring Focus:</strong> ${t.hiringFocus}</p>
  <ul>
    ${(t.predictedQuestions || []).map(q => `<li>${q}</li>`).join('')}
  </ul>
`).join('')}
` : ''}

<h2>Preparation Roadmap</h2>
${(result.roadmap || []).map(p => `
<h3>${p.phase} (${p.duration})</h3>
${(p.weeks || []).map(w => `<p><strong>${w.week}:</strong> ${w.focus} – ${(w.tasks || []).join(' | ')}</p>`).join('')}
`).join('')}

<footer>Generated by SkillSync AI | ${new Date().toLocaleDateString()}</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SkillSync_Report_${profile.name.replace(/\s+/g, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================
// SMOOTH SCROLL FOR ANCHOR LINKS
// =====================================================
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

// =====================================================
// INTERSECTION OBSERVER – animate feature cards
// =====================================================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .step-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});

// =====================================================
// API STATUS CHECK
// =====================================================
async function checkApiStatus() {
  const badge = document.getElementById('api-status-badge');
  const textEl = document.getElementById('api-status-text');
  const hintEl = document.getElementById('engine-hint');
  const dotEl = badge?.querySelector('.status-dot');

  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      state.geminiConfigured = Boolean(data.geminiConfigured);
      if (data.geminiConfigured) {
        if (dotEl) { dotEl.className = 'status-dot active'; }
        if (textEl) textEl.textContent = 'Gemini AI Active';
        if (hintEl) hintEl.innerHTML = '<strong>Google Gemini API</strong> is connected via <code>.env</code>. Placement insights will use real-time LLM intelligence.';
      } else {
        if (dotEl) { dotEl.className = 'status-dot idle'; }
        if (textEl) textEl.textContent = 'Local AI Engine';
        if (hintEl) hintEl.innerHTML = 'Running on <strong>Local AI Engine</strong>. To enable Google Gemini API, add your key to <code>.env</code>.';
      }
      return;
    }
  } catch (e) {
    // standalone file / offline
  }
  if (dotEl) { dotEl.className = 'status-dot idle'; }
  if (textEl) textEl.textContent = 'Local AI Engine';
}

checkApiStatus();
checkAuthOnLoad();

console.log('🚀 SkillSync AI loaded successfully!');
