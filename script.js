/* ===================================================
   Smart Health AI — script.js
   =================================================== */

// ─── Page Fade In ───────────────────────────────────
window.addEventListener("load", () => {
  document.body.style.opacity = 1;
});

// ─── Auth State ──────────────────────────────────────
const USERS_KEY = "sha_users";
const SESSION_KEY = "sha_session";

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
}
function saveUsers(u) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}
function getSession() {
  return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
}
function saveSession(u) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ─── Remember Me ─────────────────────────────────────
const remember = document.getElementById("remember-me");
const signinUsernameEl = document.getElementById("signin-username");
const savedUser = localStorage.getItem("sha_rememberUser");
if (savedUser) {
  signinUsernameEl.value = savedUser;
  if (remember) remember.checked = true;
}
if (remember) {
  remember.addEventListener("change", () => {
    if (remember.checked) {
      localStorage.setItem("sha_rememberUser", signinUsernameEl.value);
    } else {
      localStorage.removeItem("sha_rememberUser");
    }
  });
}

// ─── Auto-login if session exists ────────────────────
(function checkSession() {
  const session = getSession();
  if (session) {
    showDashboard(session);
  }
})();

// ─── Tab Switching ────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("signin-form").classList.toggle("active", tab === "signin");
  document.getElementById("signup-form").classList.toggle("active", tab === "signup");
}
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ─── Toggle Password Visibility ──────────────────────
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === "text";
  input.type = isText ? "password" : "text";
  btn.innerHTML = isText ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
}

// ─── Sign In ─────────────────────────────────────────
function handleSignIn() {
  const username = document.getElementById("signin-username").value.trim();
  const password = document.getElementById("signin-password").value;
  const errorEl = document.getElementById("signin-error");

  if (!username || !password) {
    showError(errorEl, "Please enter both username and password.");
    return;
  }

  // Accept demo credentials always
  if (username === "admin" && password === "admin123") {
    const user = { username: "admin", name: "Admin User", initials: "AU" };
    completeSignIn(user);
    return;
  }

  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    completeSignIn(user);
  } else {
    showError(errorEl, "Incorrect username or password.");
  }
}

function completeSignIn(user) {
  saveSession(user);
  if (remember && remember.checked) {
    localStorage.setItem("sha_rememberUser", user.username);
  }
  showDashboard(user);
}

// ─── Sign Up ──────────────────────────────────────────
function handleSignUp() {
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const errorEl = document.getElementById("signup-error");

  if (!name || !email || !password) {
    showError(errorEl, "Please fill in all fields.");
    return;
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    showError(errorEl, "Please enter a valid email address.");
    return;
  }
  if (password.length < 6) {
    showError(errorEl, "Password must be at least 6 characters.");
    return;
  }

  const users = getUsers();
  if (users.find(u => u.email === email)) {
    showError(errorEl, "An account with this email already exists.");
    return;
  }

  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const username = email.split("@")[0];
  const user = { username, name, email, password, initials };
  users.push(user);
  saveUsers(users);
  saveSession(user);
  showDashboard(user);
}

// ─── Logout ───────────────────────────────────────────
function handleLogout() {
  clearSession();
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-overlay").style.display = "flex";
  document.getElementById("signin-password").value = "";
  document.getElementById("signin-error").classList.add("hidden");
}

// ─── Show Dashboard ───────────────────────────────────
function showDashboard(user) {
  document.getElementById("auth-overlay").style.display = "none";
  document.getElementById("dashboard").classList.remove("hidden");

  const initials = user.initials || (user.name || user.username).slice(0, 2).toUpperCase();
  const displayName = user.name || user.username;

  document.getElementById("sidebar-avatar").textContent = initials;
  document.getElementById("sidebar-name").textContent = displayName;
  document.getElementById("topbar-avatar").textContent = initials;
  document.getElementById("topbar-name").textContent = displayName.split(" ")[0];

  animateCounters();
  initCharts();
}

// ─── Error Helper ─────────────────────────────────────
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

// ─── Sidebar Navigation ──────────────────────────────
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", e => {
    e.preventDefault();
    const page = item.dataset.page;
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + page)?.classList.add("active");
    if (window.innerWidth <= 768) {
      document.getElementById("sidebar").classList.remove("open");
    }
    if (page === "analytics") initAnalyticsCharts();
  });
});

// ─── Sidebar Toggle (mobile) ─────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

// ─── Counter Animation ───────────────────────────────
function animateCounters() {
  document.querySelectorAll(".kpi-value[data-count]").forEach(el => {
    const target = parseInt(el.dataset.count);
    let current = 0;
    const step = Math.ceil(target / 60);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current.toLocaleString();
      if (current >= target) clearInterval(timer);
    }, 16);
  });
}

// ─── Charts ───────────────────────────────────────────
let chartsInitialized = false;

function initCharts() {
  if (chartsInitialized) return;
  chartsInitialized = true;

  // Admissions Line Chart
  const admCtx = document.getElementById("admissionsChart")?.getContext("2d");
  if (admCtx) {
    new Chart(admCtx, {
      type: "line",
      data: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [
          {
            label: "Admissions",
            data: [65, 78, 90, 81, 95, 72, 88],
            borderColor: "#2563eb",
            backgroundColor: "rgba(37,99,235,.08)",
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "#2563eb",
            pointRadius: 4,
          },
          {
            label: "Discharged",
            data: [50, 60, 75, 70, 80, 65, 74],
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,.06)",
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "#10b981",
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#94a3b8" } },
          y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 }, color: "#94a3b8" } },
        },
      },
    });
  }

  // Supply Donut Chart
  const supCtx = document.getElementById("supplyChart")?.getContext("2d");
  if (supCtx) {
    new Chart(supCtx, {
      type: "doughnut",
      data: {
        labels: ["In Stock", "Low Stock", "Critical"],
        datasets: [{
          data: [68, 22, 10],
          backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: "72%",
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } } },
      },
    });
  }
}

// Analytics charts (lazy-loaded)
let analyticsInitialized = false;
function initAnalyticsCharts() {
  if (analyticsInitialized) return;
  analyticsInitialized = true;

  const trendCtx = document.getElementById("trendChart")?.getContext("2d");
  if (trendCtx) {
    new Chart(trendCtx, {
      type: "bar",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [{
          label: "Patients",
          data: [980, 1100, 1050, 1200, 1150, 1248],
          backgroundColor: "rgba(37,99,235,.7)",
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 11 } } },
          y: { grid: { color: "#f1f5f9" }, ticks: { color: "#94a3b8", font: { size: 11 } } },
        },
      },
    });
  }

  const occCtx = document.getElementById("occupancyChart")?.getContext("2d");
  if (occCtx) {
    new Chart(occCtx, {
      type: "radar",
      data: {
        labels: ["ICU", "General", "Surgery", "Cardio", "Emergency", "Paediatrics"],
        datasets: [{
          label: "Occupancy %",
          data: [94, 72, 80, 65, 88, 55],
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139,92,246,.15)",
          pointBackgroundColor: "#8b5cf6",
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, font: { size: 10 }, color: "#94a3b8" },
            grid: { color: "#e2e8f0" },
            pointLabels: { font: { size: 11 }, color: "#64748b" },
          },
        },
      },
    });
  }
}

// ─── Table Filter ─────────────────────────────────────
function filterTable(input, tableId) {
  const query = input.value.toLowerCase();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
  });
}

// ─── Keyboard Enter for Sign In ──────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const signinForm = document.getElementById("signin-form");
    const signupForm = document.getElementById("signup-form");
    if (signinForm.classList.contains("active")) handleSignIn();
    else if (signupForm.classList.contains("active")) handleSignUp();
  }
});