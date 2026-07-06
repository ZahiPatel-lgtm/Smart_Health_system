/* =====================================================
   Smart Health AI — script.js  (fully dynamic)
   Auth is handled by Supabase Auth (real accounts, real
   sessions). Uploaded CSV data is still cached locally
   per browser, keyed by the Supabase user id, until it
   is migrated into Postgres tables in a later step.
   ===================================================== */

// ─── Supabase Client ─────────────────────────────────
// Fill these in from your Supabase project: Project Settings → API.
// The anon/public key is safe to ship in frontend code — access control
// is enforced by Row Level Security policies on the database tables,
// not by keeping this key secret. See supabase-schema.sql.
const SUPABASE_URL      = "https://awvwbktynboirvkmbybl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_aLaPe2rM6fDNdGXWbQKd6A_ls0loWS4";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null; // { id, email, name, hospital, initials } — set after sign-in

// Per-user data key (still localStorage-backed, keyed by Supabase user id)
function dataKey(userId) { return "sha_data_" + (userId || "guest"); }
function getUserData()  {
  if (!currentUser) return null;
  return JSON.parse(localStorage.getItem(dataKey(currentUser.id)) || "null");
}
function saveUserData(d) {
  if (!currentUser) return;
  localStorage.setItem(dataKey(currentUser.id), JSON.stringify(d));
}

// ─── Page Fade In ────────────────────────────────────
window.addEventListener("load", () => { document.body.style.opacity = 1; });

// ─── Remember Me ─────────────────────────────────────
const rememberEl       = document.getElementById("remember-me");
const signinUsernameEl = document.getElementById("signin-username");
const savedUser = localStorage.getItem("sha_rememberUser");
if (savedUser && signinUsernameEl) {
  signinUsernameEl.value = savedUser;
  if (rememberEl) rememberEl.checked = true;
}
if (rememberEl) {
  rememberEl.addEventListener("change", () => {
    if (rememberEl.checked) localStorage.setItem("sha_rememberUser", signinUsernameEl.value);
    else localStorage.removeItem("sha_rememberUser");
  });
}

// ─── Auto-login (restore existing Supabase session) ──
(async function () {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await loadProfileAndShowDashboard(session.user);
})();

// Keep local state in sync if the session ends elsewhere (e.g. another tab)
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") currentUser = null;
});

// ─── Tab Switching ───────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.getElementById("signin-form").classList.toggle("active", tab === "signin");
  document.getElementById("signup-form").classList.toggle("active", tab === "signup");
}
document.querySelectorAll(".tab-btn").forEach(btn =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab))
);

// ─── Password toggle ─────────────────────────────────
function togglePassword(id, btn) {
  const el = document.getElementById(id);
  const isText = el.type === "text";
  el.type = isText ? "password" : "text";
  btn.innerHTML = isText ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
}

// ─── Sign In ─────────────────────────────────────────
async function handleSignIn() {
  const email    = document.getElementById("signin-username").value.trim();
  const password = document.getElementById("signin-password").value;
  const errEl    = document.getElementById("signin-error");
  if (!email || !password) { showError(errEl, "Please enter your email and password."); return; }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { showError(errEl, error.message); return; }

  if (rememberEl && rememberEl.checked) localStorage.setItem("sha_rememberUser", email);
  await loadProfileAndShowDashboard(data.user);
}

// ─── Sign Up ─────────────────────────────────────────
async function handleSignUp() {
  const name     = document.getElementById("signup-name").value.trim();
  const hospital = document.getElementById("signup-hospital").value.trim();
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const errEl    = document.getElementById("signup-error");

  if (!name || !email || !password) { showError(errEl, "Please fill in all fields."); return; }
  if (!hospital)                     { showError(errEl, "Please enter your hospital name."); return; }
  if (!/\S+@\S+\.\S+/.test(email))   { showError(errEl, "Enter a valid email."); return; }
  if (password.length < 6)           { showError(errEl, "Password must be at least 6 characters."); return; }

  // name + hospital travel as user_metadata; a Postgres trigger
  // (see supabase-schema.sql) copies them into the `profiles` table.
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name, hospital } }
  });
  if (error) { showError(errEl, error.message); return; }

  // If "Confirm email" is enabled in Supabase Auth settings, there's no
  // session yet — the user must click the confirmation link first.
  if (!data.session) {
    showError(errEl, "Account created! Check your email to confirm before signing in.");
    switchTab("signin");
    return;
  }
  await loadProfileAndShowDashboard(data.user);
}

// ─── Load profile row + show dashboard ───────────────
async function loadProfileAndShowDashboard(authUser) {
  const { data: profile, error } = await sb
    .from("profiles")
    .select("name, hospital, initials")
    .eq("id", authUser.id)
    .single();

  if (error) console.error("Failed to load profile:", error.message);

  const name = profile?.name || authUser.email;
  currentUser = {
    id: authUser.id,
    email: authUser.email,
    name,
    hospital: profile?.hospital || "Administrator",
    initials: profile?.initials || name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  };

  showDashboard(currentUser);
}

// ─── Logout ──────────────────────────────────────────
async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  // reset chart flags
  chartsInitialized = analyticsInitialized = supplyInitialized = false;
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(chartInstances).forEach(k => delete chartInstances[k]);
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-overlay").style.display = "flex";
  document.getElementById("signin-password").value = "";
  document.getElementById("signin-error").classList.add("hidden");
}

// ─── Show Dashboard ──────────────────────────────────
function showDashboard(user) {
  document.getElementById("auth-overlay").style.display = "none";
  document.getElementById("dashboard").classList.remove("hidden");

  const initials    = user.initials || (user.name || user.username).slice(0, 2).toUpperCase();
  const displayName = user.name || user.username;
  const hospital    = user.hospital || "Administrator";

  document.getElementById("sidebar-avatar").textContent  = initials;
  document.getElementById("sidebar-name").textContent    = displayName;
  document.getElementById("sidebar-hospital").textContent= hospital;
  document.getElementById("topbar-avatar").textContent   = initials;
  document.getElementById("topbar-name").textContent     = displayName.split(" ")[0];

  // Settings page
  document.getElementById("st-name").textContent    = displayName;
  document.getElementById("st-email").textContent   = user.email || "—";
  document.getElementById("st-hospital").textContent = hospital;

  // Load existing data if any
  setTimeout(() => renderDashboard(), 50);
}

// ─── Error helper ────────────────────────────────────
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

// ─── Keyboard enter ──────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const si = document.getElementById("signin-form");
  const su = document.getElementById("signup-form");
  if (si && si.classList.contains("active")) handleSignIn();
  else if (su && su.classList.contains("active")) handleSignUp();
});

// ─── Sidebar nav ─────────────────────────────────────
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", e => {
    e.preventDefault();
    navTo(item.dataset.page);
  });
});
function navTo(page) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add("active"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = document.getElementById("page-" + page);
  if (target) target.classList.add("active");
  if (window.innerWidth <= 768) document.getElementById("sidebar").classList.remove("open");
  const titles = { overview:"Dashboard", centres:"Health Centres", analytics:"Analytics",
                   supply:"Supply Chain", staff:"Staff", alerts:"Alerts",
                   upload:"Upload Data", settings:"Settings" };
  document.getElementById("topbar-title").textContent = titles[page] || "Dashboard";
  // Lazy chart init for sub-pages
  if (page === "analytics") setTimeout(initAnalyticsCharts, 50);
  if (page === "supply")    setTimeout(initSupplyCharts, 50);
}

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }

// ─── CSV Parser ──────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || "");
    return obj;
  });
}

// ─── Upload staging (in-memory before apply) ─────────
const staged = { stock: null, footfall: null, bed: null, attendance: null, scoring: null };

function handleCSVUpload(event, type) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("us-" + type);
  statusEl.textContent = "Parsing…";
  statusEl.style.color = "#f59e0b";

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = parseCSV(e.target.result);
      if (rows.length === 0) throw new Error("Empty or invalid CSV");
      staged[type] = rows;
      statusEl.textContent = `✓ ${rows.length.toLocaleString()} rows loaded — "${file.name}"`;
      statusEl.style.color = "#10b981";
      document.getElementById("uc-" + type).classList.add("uploaded");
    } catch(err) {
      statusEl.textContent = "✗ Error: " + err.message;
      statusEl.style.color = "#ef4444";
    }
  };
  reader.onerror = () => {
    statusEl.textContent = "✗ Failed to read file.";
    statusEl.style.color = "#ef4444";
  };
  reader.readAsText(file);
}

function applyUploadedData() {
  const has = Object.values(staged).filter(Boolean).length;
  if (has === 0) { showUploadMsg("Please upload at least one CSV file first.", "error"); return; }

  // Build stored data object
  const stored = getUserData() || {};
  if (staged.stock)      stored.stock      = staged.stock;
  if (staged.footfall)   stored.footfall   = staged.footfall;
  if (staged.bed)        stored.bed        = staged.bed;
  if (staged.attendance) stored.attendance = staged.attendance;
  if (staged.scoring)    stored.scoring    = staged.scoring;
  stored.uploadedAt = new Date().toISOString();

  try {
    saveUserData(stored);
  } catch(e) {
    showUploadMsg("Storage limit exceeded. Try uploading fewer/smaller files.", "error");
    return;
  }

  // Reset chart flags so they re-render with new data
  chartsInitialized = analyticsInitialized = supplyInitialized = false;
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(ex){} });
  Object.keys(chartInstances).forEach(k => delete chartInstances[k]);

  showUploadMsg(`✓ ${has} dataset(s) applied successfully! Dashboard updated.`, "success");
  renderDashboard();
  setTimeout(() => navTo("overview"), 1200);
}

function clearAllData() {
  if (!confirm("Clear all uploaded data for this account?")) return;
  if (currentUser) localStorage.removeItem(dataKey(currentUser.id));
  Object.keys(staged).forEach(k => staged[k] = null);
  chartsInitialized = analyticsInitialized = supplyInitialized = false;
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(chartInstances).forEach(k => delete chartInstances[k]);
  // Reset upload statuses
  ["stock","footfall","bed","attendance","scoring"].forEach(t => {
    const el = document.getElementById("us-" + t);
    if (el) { el.textContent = "Not uploaded"; el.style.color = ""; }
    const card = document.getElementById("uc-" + t);
    if (card) card.classList.remove("uploaded");
  });
  renderDashboard();
  showUploadMsg("All data cleared.", "success");
}

function showUploadMsg(msg, type) {
  const el = document.getElementById("upload-msg");
  el.textContent = msg;
  el.className = "upload-msg " + type;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

// ─── Compute derived data from CSVs ──────────────────
function computeStats(data) {
  const { scoring, footfall, stock, bed, attendance } = data;

  // Latest date in scoring
  const scoringDates = [...new Set((scoring||[]).map(r => r.date))].sort();
  const latestDate   = scoringDates[scoringDates.length - 1] || "";

  const latestScoring = (scoring||[]).filter(r => r.date === latestDate);
  const centreMap = {};
  latestScoring.forEach(r => centreMap[r.centre_id] = r);

  // Centres list
  const centres = Object.values(centreMap).sort((a,b) => a.centre_id.localeCompare(b.centre_id));

  // KPIs
  const totalOPD  = centres.reduce((s,r) => s + (parseInt(r.opd_count)||0), 0);
  const totalIPD  = centres.reduce((s,r) => s + (parseInt(r.ipd_count)||0), 0);
  const totalBeds = centres.reduce((s,r) => s + (parseInt(r.beds_total)||0), 0);
  const totalOcc  = centres.reduce((s,r) => s + (parseInt(r.beds_occupied)||0), 0);
  const avgScore  = centres.length
    ? (centres.reduce((s,r) => s + (parseFloat(r.centre_health_score)||0), 0) / centres.length).toFixed(1)
    : 0;
  const critCount = centres.filter(r => r.centre_tier === "red").length;
  const occPct    = totalBeds ? ((totalOcc / totalBeds) * 100).toFixed(1) : 0;

  // Last 7 days footfall
  const footfallDates = [...new Set((footfall||[]).map(r => r.date))].sort();
  const last7Dates    = footfallDates.slice(-7);
  const dailyOPD = {}, dailyIPD = {};
  (footfall||[]).forEach(r => {
    if (!last7Dates.includes(r.date)) return;
    dailyOPD[r.date] = (dailyOPD[r.date]||0) + (parseInt(r.opd_count)||0);
    dailyIPD[r.date] = (dailyIPD[r.date]||0) + (parseInt(r.ipd_count)||0);
  });
  const labels7  = last7Dates.map(d => d.slice(5)); // MM-DD
  const opd7     = last7Dates.map(d => dailyOPD[d]||0);
  const ipd7     = last7Dates.map(d => dailyIPD[d]||0);

  // Monthly OPD
  const monthlyOPD = {};
  (footfall||[]).forEach(r => {
    const m = r.date ? r.date.slice(0,7) : "";
    if (m) monthlyOPD[m] = (monthlyOPD[m]||0) + (parseInt(r.opd_count)||0);
  });
  const months6Keys = Object.keys(monthlyOPD).sort().slice(-6);
  const months6     = months6Keys.map(m => {
    const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return mn[parseInt(m.slice(5))-1] || m;
  });
  const opdMonthly = months6Keys.map(m => monthlyOPD[m]);

  // Stock stats (latest date)
  const stockDates  = [...new Set((stock||[]).map(r => r.date))].sort();
  const latestStock = stockDates[stockDates.length-1] || latestDate;
  const stockLatest = (stock||[]).filter(r => r.date === latestStock);
  const sTotal      = stockLatest.length;
  const sIn         = stockLatest.filter(r => r.stockout_flag === "0" && parseFloat(r.stockout_risk_score||0) < 0.5).length;
  const sLow        = stockLatest.filter(r => r.stockout_flag === "0" && parseFloat(r.stockout_risk_score||0) >= 0.5).length;
  const sOut        = stockLatest.filter(r => r.stockout_flag === "1").length;
  const stockPct    = sTotal > 0
    ? [Math.round(sIn/sTotal*100), Math.round(sLow/sTotal*100), Math.round(sOut/sTotal*100)]
    : [0,0,0];

  // Stockout risk per centre (latest)
  const riskByCentre = {};
  (stock||[]).filter(r => r.date === latestStock).forEach(r => {
    if (!riskByCentre[r.centre_name]) riskByCentre[r.centre_name] = [];
    riskByCentre[r.centre_name].push(parseFloat(r.stockout_risk_score||0));
  });
  const centreNames  = Object.keys(riskByCentre).sort();
  const stockRisk    = centreNames.map(n => {
    const arr = riskByCentre[n];
    return +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(3);
  });

  // Bed occupancy by centre (latest bed data)
  const bedDates  = [...new Set((bed||[]).map(r => r.date))].sort();
  const latestBed = bedDates[bedDates.length-1] || latestDate;
  const bedLatest = (bed||[]).filter(r => r.date === latestBed);
  const bedNames  = bedLatest.map(r => r.centre_name || r.centre_id).slice(0, 8);
  const bedOcc    = bedLatest.map(r => parseFloat(r.bed_occupancy_pct||0)).slice(0, 8);

  // Centres table data
  const centresTable = centres.map(r => ({
    id:           r.centre_id,
    name:         r.centre_name || r.centre_id,
    type:         r.centre_type || "—",
    district:     r.district_name || "—",
    opd:          parseInt(r.opd_count)||0,
    ipd:          parseInt(r.ipd_count)||0,
    beds:         parseInt(r.beds_total)||0,
    occupied:     parseInt(r.beds_occupied)||0,
    occupancy:    parseFloat(r.bed_occupancy_pct||0).toFixed(1),
    score:        parseInt(r.centre_health_score)||0,
    tier:         r.centre_tier || "—",
    attendance:   parseFloat(r.attendance_rate||0),
    stockout_risk:parseFloat(r.avg_stockout_risk||0).toFixed(3),
  }));

  // Staff/attendance table (anomalies only — absence_flag=1, last 30 days)
  const attDates  = [...new Set((attendance||[]).map(r => r.date))].sort();
  const last30    = attDates.slice(-30);
  const staffRows = (attendance||[])
    .filter(r => last30.includes(r.date))
    .sort((a,b) => b.date.localeCompare(a.date));

  // Alerts
  const alerts = [];
  centresTable.forEach(c => {
    if (c.tier === "red") {
      alerts.push({ level:"red", text: `<strong>${c.name}</strong> — Health score ${c.score}/100. Critical tier. Stockout risk: ${c.stockout_risk}.` });
    }
  });
  centresTable.forEach(c => {
    if (parseFloat(c.stockout_risk) > 0.8 && c.tier !== "red") {
      alerts.push({ level:"orange", text: `<strong>${c.name}</strong> — High stockout risk (${c.stockout_risk}).` });
    }
  });
  // Attendance alerts from latest data
  (attendance||[]).filter(r => r.date === latestDate && r.absence_flag === "1").forEach(r => {
    const already = alerts.some(a => a.text.includes(r.centre_name));
    if (!already) alerts.push({ level:"orange", text: `<strong>${r.centre_name||r.centre_id}</strong> — Doctor absent on ${r.date}.` });
  });

  return {
    latestDate, totalOPD, totalIPD, totalBeds, totalOcc, occPct, avgScore, critCount,
    labels7, opd7, ipd7,
    months6, opdMonthly,
    stockPct, sTotal, sIn, sLow, sOut,
    centreNames, stockRisk,
    bedNames, bedOcc,
    centresTable, staffRows, alerts,
    centreCount: centres.length,
    districts: [...new Set(centres.map(r => r.district).filter(Boolean))],
    totalOpd6: opdMonthly.reduce((a,b)=>a+b,0),
  };
}

// ─── Render Dashboard ────────────────────────────────
function renderDashboard() {
  const data = getUserData();
  const hasData = data && (data.scoring || data.footfall || data.stock || data.bed || data.attendance);

  // No-data banner on overview
  document.getElementById("no-data-banner").classList.toggle("hidden", !!hasData);
  document.getElementById("overview-content").classList.toggle("hidden", !hasData);

  // Update settings
  const st = document.getElementById("st-date");
  const sr = document.getElementById("st-records");
  if (data && data.uploadedAt) {
    if (st) st.textContent = new Date(data.uploadedAt).toLocaleString();
    const total = ((data.scoring||[]).length + (data.footfall||[]).length +
                   (data.stock||[]).length + (data.bed||[]).length +
                   (data.attendance||[]).length);
    if (sr) sr.textContent = total.toLocaleString();
  } else {
    if (st) st.textContent = "Never";
    if (sr) sr.textContent = "0";
  }

  if (!hasData) {
    document.getElementById("data-date").textContent = "No data loaded";
    document.getElementById("alert-badge").textContent = "0";
    document.getElementById("centres-tbody").innerHTML = '<tr><td colspan="9" class="empty-cell">No data loaded. Please upload your CSV files.</td></tr>';
    document.getElementById("staff-tbody").innerHTML = '<tr><td colspan="7" class="empty-cell">No data loaded.</td></tr>';
    document.getElementById("full-alerts-list").innerHTML = '<div class="empty-cell">No alerts. Upload data to generate alerts.</div>';
    document.getElementById("analytics-stats").innerHTML = "";
    document.getElementById("supply-kpi").innerHTML = "";
    return;
  }

  const s = computeStats(data);

  // Topbar date badge
  document.getElementById("data-date").textContent = "Data: " + (s.latestDate || "—");

  // Alert badge
  document.getElementById("alert-badge").textContent = s.alerts.length;

  // Overview header
  document.getElementById("overview-title").textContent = "Health System Overview";
  document.getElementById("overview-sub").textContent =
    `${s.centreCount} centres · ${s.districts.join(", ")} · Data: ${s.latestDate}`;

  // KPI cards
  document.getElementById("kpi-grid").innerHTML = `
    <div class="kpi-card blue">
      <div class="kpi-icon"><i class="fa-solid fa-person-walking-dashed-line-arrow-right"></i></div>
      <div class="kpi-info"><div class="kpi-value">${s.totalOPD.toLocaleString()}</div><div class="kpi-label">Today's OPD Visits</div></div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-icon"><i class="fa-solid fa-bed-pulse"></i></div>
      <div class="kpi-info"><div class="kpi-value">${s.totalOcc}<span style="font-size:.6em">/${s.totalBeds}</span></div><div class="kpi-label">Beds Occupied (${s.occPct}%)</div></div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-icon"><i class="fa-solid fa-star"></i></div>
      <div class="kpi-info"><div class="kpi-value">${s.avgScore}</div><div class="kpi-label">Avg Health Score</div></div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <div class="kpi-info"><div class="kpi-value">${s.critCount}</div><div class="kpi-label">Critical Centres</div></div>
    </div>`;

  // Stock sub & legend
  document.getElementById("stock-sub").textContent = `${s.sTotal} drug records · ${s.latestDate}`;
  document.getElementById("stock-legend").innerHTML = `
    <div><span class="dot green"></span> In Stock (${s.stockPct[0]}%)</div>
    <div><span class="dot orange"></span> Low Stock (${s.stockPct[1]}%)</div>
    <div><span class="dot red"></span> Stockout (${s.stockPct[2]}%)</div>`;
  document.getElementById("footfall-sub").textContent = `OPD & IPD across ${s.centreCount} centres`;

  // Alerts (overview)
  const alertsHTML = s.alerts.length
    ? s.alerts.map(a => `<div class="alert-item ${a.level}"><i class="fa-solid fa-triangle-exclamation"></i><div>${a.text}</div></div>`).join("")
    : '<div class="alert-item" style="background:#f0fdf4;border-left:4px solid #10b981;color:#065f46;display:flex;gap:12px;padding:14px 16px;border-radius:10px"><i class="fa-solid fa-circle-check"></i><div>No critical alerts.</div></div>';
  document.getElementById("alerts-list").innerHTML = alertsHTML;
  document.getElementById("full-alerts-list").innerHTML = alertsHTML;

  // Centres table
  const centreRows = s.centresTable.map(c => {
    const tierCls = c.tier === "red" ? "tier-red" : c.tier === "green" ? "tier-green" : "tier-yellow";
    const tierLbl = c.tier === "red" ? "🔴 Critical" : c.tier === "green" ? "🟢 Good" : "🟡 Monitor";
    const attPct  = Math.round(c.attendance * 100);
    const attCls  = attPct < 50 ? "badge-red" : attPct < 100 ? "badge-yellow" : "badge-green";
    const rsk     = parseFloat(c.stockout_risk);
    const rskCls  = rsk > 0.8 ? "badge-red" : rsk > 0.6 ? "badge-yellow" : "badge-green";
    return `<tr>
      <td><strong>${c.name}</strong><br><small>${c.district}</small></td>
      <td><span class="badge badge-blue">${c.type}</span></td>
      <td>${c.opd}</td><td>${c.ipd}</td>
      <td>${c.occupied}/${c.beds} (${c.occupancy}%)</td>
      <td><span class="score-pill ${tierCls}">${c.score}</span></td>
      <td><span class="badge ${attCls}">${attPct}%</span></td>
      <td><span class="badge ${rskCls}">${c.stockout_risk}</span></td>
      <td>${tierLbl}</td>
    </tr>`;
  }).join("");
  document.getElementById("centres-tbody").innerHTML = centreRows || '<tr><td colspan="9" class="empty-cell">No centre data in scoring CSV.</td></tr>';
  document.getElementById("centres-sub").textContent = `${s.centreCount} centres · Data: ${s.latestDate}`;

  // Staff table
  const staffRows = s.staffRows.slice(0, 200).map(r => {
    const att = parseFloat(r.attendance_rate||0);
    const cls = r.absence_flag === "1" ? "badge-red" : "badge-green";
    const lbl = r.absence_flag === "1" ? "Absent" : "Present";
    return `<tr>
      <td>${r.centre_name||r.centre_id||"—"}</td>
      <td>${r.district_name||"—"}</td>
      <td>${r.date||"—"}</td>
      <td>${(att*100).toFixed(0)}%</td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td>${r.opd_count||"—"}</td>
      <td>${r.doctors_present||"—"}/${r.doctors_scheduled||"—"}</td>
    </tr>`;
  }).join("");
  document.getElementById("staff-tbody").innerHTML = staffRows || '<tr><td colspan="7" class="empty-cell">No attendance data loaded.</td></tr>';
  document.getElementById("staff-sub").textContent = `Showing last 30 days · ${s.staffRows.length} records`;

  // Analytics stats
  document.getElementById("analytics-sub").textContent = `${s.centreCount} centres · ${s.districts.join(", ")}`;
  document.getElementById("analytics-stats").innerHTML = `
    <div class="stat-card"><div class="stat-num">${s.totalOpd6.toLocaleString()}</div><div class="stat-lbl">Total OPD (last 6 months)</div></div>
    <div class="stat-card"><div class="stat-num">${s.occPct}%</div><div class="stat-lbl">Avg Bed Occupancy</div></div>
    <div class="stat-card"><div class="stat-num">${s.centreCount}</div><div class="stat-lbl">Active Centres</div></div>
    <div class="stat-card"><div class="stat-num">${s.districts.length} District${s.districts.length!==1?"s":""}</div><div class="stat-lbl">Coverage Area</div></div>`;

  // Supply KPIs
  document.getElementById("supply-sub").textContent = `${s.sTotal} drug records · ${s.latestDate}`;
  document.getElementById("supply-kpi").innerHTML = `
    <div class="kpi-card green"><div class="kpi-icon"><i class="fa-solid fa-check-circle"></i></div><div class="kpi-info"><div class="kpi-value">${s.sIn}</div><div class="kpi-label">In Stock (${s.stockPct[0]}%)</div></div></div>
    <div class="kpi-card orange"><div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="kpi-info"><div class="kpi-value">${s.sLow}</div><div class="kpi-label">Low/At Risk (${s.stockPct[1]}%)</div></div></div>
    <div class="kpi-card red-card"><div class="kpi-icon"><i class="fa-solid fa-circle-xmark"></i></div><div class="kpi-info"><div class="kpi-value">${s.sOut}</div><div class="kpi-label">Stockout (${s.stockPct[2]}%)</div></div></div>
    <div class="kpi-card blue"><div class="kpi-icon"><i class="fa-solid fa-pills"></i></div><div class="kpi-info"><div class="kpi-value">${s.sTotal}</div><div class="kpi-label">Total Drug Records</div></div></div>`;
  document.getElementById("supply-legend2").innerHTML = `
    <div><span class="dot green"></span> In Stock (${s.stockPct[0]}%)</div>
    <div><span class="dot orange"></span> At Risk (${s.stockPct[1]}%)</div>
    <div><span class="dot red"></span> Stockout (${s.stockPct[2]}%)</div>`;

  // Store computed for charts
  window._STATS = s;

  // Init/refresh charts
  setTimeout(initCharts, 50);
}

// ─── Chart instances registry ────────────────────────
const chartInstances = {};
let chartsInitialized    = false;
let analyticsInitialized = false;
let supplyInitialized    = false;

function destroyChart(id) {
  if (chartInstances[id]) {
    try { chartInstances[id].destroy(); } catch(e){}
    delete chartInstances[id];
  }
}

function initCharts() {
  const s = window._STATS;
  if (!s) { chartsInitialized = false; return; }
  chartsInitialized = true;

  destroyChart("admissionsChart");
  const admCtx = document.getElementById("admissionsChart")?.getContext("2d");
  if (admCtx) {
    chartInstances["admissionsChart"] = new Chart(admCtx, {
      type: "line",
      data: {
        labels: s.labels7,
        datasets: [
          { label:"OPD", data: s.opd7, borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.08)", fill:true, tension:0.4, pointBackgroundColor:"#2563eb", pointRadius:4 },
          { label:"IPD", data: s.ipd7, borderColor:"#10b981", backgroundColor:"rgba(16,185,129,.06)", fill:true, tension:0.4, pointBackgroundColor:"#10b981", pointRadius:4 },
        ],
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
        scales:{ x:{grid:{display:false},ticks:{font:{size:11},color:"#94a3b8"}}, y:{grid:{color:"#f1f5f9"},ticks:{font:{size:11},color:"#94a3b8"}} } },
    });
  }

  destroyChart("supplyChart");
  const supCtx = document.getElementById("supplyChart")?.getContext("2d");
  if (supCtx) {
    chartInstances["supplyChart"] = new Chart(supCtx, {
      type: "doughnut",
      data: { labels:["In Stock","Low Stock","Stockout"], datasets:[{ data:s.stockPct, backgroundColor:["#10b981","#f59e0b","#ef4444"], borderWidth:0, hoverOffset:6 }] },
      options: { cutout:"72%", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } },
    });
  }
}

function initAnalyticsCharts() {
  const s = window._STATS;
  if (!s) return;
  analyticsInitialized = true;

  destroyChart("trendChart");
  const tCtx = document.getElementById("trendChart")?.getContext("2d");
  if (tCtx) {
    chartInstances["trendChart"] = new Chart(tCtx, {
      type:"bar",
      data:{ labels:s.months6, datasets:[{ label:"OPD Visits", data:s.opdMonthly, backgroundColor:"rgba(37,99,235,.75)", borderRadius:6 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{grid:{display:false},ticks:{color:"#94a3b8",font:{size:11}}}, y:{grid:{color:"#f1f5f9"},ticks:{color:"#94a3b8",font:{size:11}}} } },
    });
  }

  destroyChart("occupancyChart");
  const oCtx = document.getElementById("occupancyChart")?.getContext("2d");
  if (oCtx && s.bedNames.length) {
    chartInstances["occupancyChart"] = new Chart(oCtx, {
      type:"radar",
      data:{ labels:s.bedNames, datasets:[{ label:"Occupancy %", data:s.bedOcc, borderColor:"#8b5cf6", backgroundColor:"rgba(139,92,246,.15)", pointBackgroundColor:"#8b5cf6", pointRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ r:{ min:0, max:100, ticks:{stepSize:25,font:{size:10},color:"#94a3b8"}, grid:{color:"#e2e8f0"}, pointLabels:{font:{size:10},color:"#64748b"} } } },
    });
  }
}

function initSupplyCharts() {
  const s = window._STATS;
  if (!s) return;
  supplyInitialized = true;

  destroyChart("supplyChart2");
  const s2 = document.getElementById("supplyChart2")?.getContext("2d");
  if (s2) {
    chartInstances["supplyChart2"] = new Chart(s2, {
      type:"doughnut",
      data:{ labels:["In Stock","At Risk","Stockout"], datasets:[{ data:s.stockPct, backgroundColor:["#10b981","#f59e0b","#ef4444"], borderWidth:0, hoverOffset:6 }] },
      options:{ cutout:"72%", responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} },
    });
  }

  destroyChart("stockRiskChart");
  const srCtx = document.getElementById("stockRiskChart")?.getContext("2d");
  if (srCtx && s.centreNames.length) {
    chartInstances["stockRiskChart"] = new Chart(srCtx, {
      type:"bar",
      data:{ labels:s.centreNames, datasets:[{ label:"Stockout Risk", data:s.stockRisk,
        backgroundColor: s.stockRisk.map(v => v>0.8?"rgba(239,68,68,.75)":v>0.65?"rgba(245,158,11,.75)":"rgba(16,185,129,.75)"),
        borderRadius:4 }] },
      options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{min:0,max:1,grid:{color:"#f1f5f9"},ticks:{color:"#94a3b8",font:{size:10}}},
                 y:{ticks:{color:"#64748b",font:{size:10}},grid:{display:false}} } },
    });
  }
}

// ─── Table helpers ───────────────────────────────────
function filterTable(input, tableId) {
  const q = input.value.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}
function filterBadge(select, tableId, colIdx) {
  const val = select.value.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(r => {
    if (!val) { r.style.display = ""; return; }
    r.style.display = (r.cells[colIdx]?.textContent.toLowerCase().includes(val)) ? "" : "none";
  });
}


// ══════════════════════════════════════════════════════
// AI PREDICTION MODALS — Dynamic (CSV + Manual + Download)
// ══════════════════════════════════════════════════════

// ── File state per modal prefix ─────────────────────
const uploadedFiles = { ff: null, bed: null, so: null };
const csvMode = { ff: "csv", bed: "csv", so: "csv" };

// ── Modal open/close ────────────────────────────────
function openModal(id) {
  const today = new Date().toISOString().split("T")[0];
  ["ff-date","bed-date","so-date"].forEach(elId => {
    const el = document.getElementById(elId);
    if (el && !el.value) el.value = today;
  });
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
}
function closeModalOutside(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape")
    ["footfall-modal","bed-modal","stockout-modal"].forEach(closeModal);
});

// ── Mode switch (CSV / Manual) ──────────────────────
function switchMode(prefix, mode, btn) {
  csvMode[prefix] = mode;
  // Tab buttons
  btn.closest(".modal-mode-tabs").querySelectorAll(".mode-tab")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  // Panels
  document.getElementById(`${prefix}-csv-mode`).classList.toggle("active", mode === "csv");
  document.getElementById(`${prefix}-manual-mode`).classList.toggle("active", mode === "manual");
  // Button label
  const lbl = document.getElementById(`${prefix}-btn-label`);
  if (lbl) lbl.textContent = mode === "csv" ? "Run Batch Prediction" : "Run Prediction";
}

// ── CSV parsing ─────────────────────────────────────
function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }

function dropFile(e, prefix) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) storeFile(file, prefix);
}

function loadFile(e, prefix) {
  const file = e.target.files[0];
  if (file) storeFile(file, prefix);
}

function storeFile(file, prefix) {
  const allowed = [".csv", ".xlsx", ".xls", ".pdf"];
  const ext     = "." + file.name.split(".").pop().toLowerCase();
  const statusEl = document.getElementById(`${prefix}-csv-status`);
  const zoneEl   = document.getElementById(`${prefix}-csv-zone`);
  const previewEl = document.getElementById(`${prefix}-csv-preview`);

  if (!allowed.includes(ext)) {
    statusEl.className = "csv-status error";
    statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Unsupported file type "${ext}". Use CSV, Excel, or PDF.`;
    statusEl.classList.remove("hidden");
    return;
  }

  uploadedFiles[prefix] = file;
  zoneEl.classList.add("uploaded");
  statusEl.className = "csv-status success";
  statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>"${file.name}"</strong> ready to upload (${(file.size/1024).toFixed(1)} KB)`;
  statusEl.classList.remove("hidden");
  previewEl.classList.add("hidden");

  const lbl = document.getElementById(`${prefix}-btn-label`);
  if (lbl) lbl.textContent = `Upload & Run Batch Prediction`;
}

// ── Shared helpers ───────────────────────────────────
function showLoading(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = "ai-result loading";
  el.innerHTML = `<div class="ai-spinner"></div> ${msg || "Running AI prediction…"}`;
  el.classList.remove("hidden");
}

function showApiError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = "ai-result error-result";
  el.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${msg}`;
  el.classList.remove("hidden");
}

function setBtn(id, disabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = disabled;
}

// ── Single result renderer ───────────────────────────
function renderSingleResult(elId, data, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  const isHigh = data.prediction === 1;
  const pct    = (data.probability * 100).toFixed(1);
  let colorClass, badgeClass, badgeIcon, label;
  if (type === "footfall") {
    isHigh ? (colorClass="danger-result", badgeClass="red",    label=data.risk_label||"High Footfall",    badgeIcon="fa-circle-exclamation")
           : (colorClass="success-result",badgeClass="green",  label=data.risk_label||"Normal Footfall",  badgeIcon="fa-circle-check");
  } else if (type === "bed") {
    isHigh ? (colorClass="danger-result", badgeClass="red",    label=data.risk_label||"High Occupancy",   badgeIcon="fa-circle-exclamation")
           : (colorClass="success-result",badgeClass="green",  label=data.risk_label||"Normal Occupancy", badgeIcon="fa-circle-check");
  } else {
    isHigh ? (colorClass="warn-result",   badgeClass="orange", label=data.risk_label||"Stockout Risk",    badgeIcon="fa-triangle-exclamation")
           : (colorClass="success-result",badgeClass="green",  label=data.risk_label||"Stock OK",         badgeIcon="fa-circle-check");
  }
  el.className = `ai-result ${colorClass}`;
  el.innerHTML = `
    <div class="result-badge ${badgeClass}"><i class="fa-solid ${badgeIcon}"></i> ${label}</div>
    <div class="result-confidence">Confidence: <strong>${pct}%</strong></div>
    ${data.explanation_english ? `
    <div class="result-explanation">
      <div class="exp-label"><i class="fa-solid fa-globe"></i> English</div>
      <p>${data.explanation_english}</p>
    </div>` : ""}
    ${data.explanation_hindi ? `
    <div class="result-explanation hindi">
      <div class="exp-label"><i class="fa-solid fa-language"></i> हिंदी</div>
      <p>${data.explanation_hindi}</p>
    </div>` : ""}
    <button class="btn-download-single" onclick="downloadSingleResult(${JSON.stringify(data).replace(/"/g,'&quot;')}, '${type}')">
      <i class="fa-solid fa-download"></i> Download Report
    </button>
  `;
}

// ── API call wrapper ─────────────────────────────────
async function callAPI(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function apiErrorMsg(url, err) {
  const label = url.includes("patient-footfall-api")   ? "patient-footfall-api"
              : url.includes("bed-occupancy-api")      ? "bed-occupancy-api"
              : url.includes("medicine-stockout-api")  ? "medicine-stockout-api"
              :                                          "the API";
  return `Cannot reach ${label}.<br><br>
    Error: ${err.message}`;
}

// ── Build payloads from CSV row ──────────────────────
function rowToFootfallPayload(row) {
  return {
    Patient_Count:    parseFloat(row.Patient_Count)    || 0,
    Holiday:          parseInt(row.Holiday)            || 0,
    Weekend:          parseInt(row.Weekend)            || 0,
    Disease_Outbreak: parseInt(row.Disease_Outbreak)   || 0,
    Population:       parseFloat(row.Population)       || 0,
    Doctors:          parseFloat(row.Doctors)          || 1,
    Rainfall:         parseFloat(row.Rainfall)         || 0,
    Date:             row.Date || new Date().toISOString().split("T")[0],
  };
}
function rowToBedPayload(row) {
  return {
    Total_Beds:             parseFloat(row.Total_Beds)             || 0,
    Occupied_Beds:          parseFloat(row.Occupied_Beds)          || 0,
    Admissions:             parseFloat(row.Admissions)             || 0,
    Discharges:             parseFloat(row.Discharges)             || 0,
    Average_Length_of_Stay: parseFloat(row.Average_Length_of_Stay)|| 0,
    Disease_Outbreak:       parseInt(row.Disease_Outbreak)         || 0,
    Date:                   row.Date || new Date().toISOString().split("T")[0],
  };
}
function rowToStockoutPayload(row) {
  return {
    Medicine_ID:        row.Medicine_ID        || "MED-001",
    Current_Stock:      parseFloat(row.Current_Stock)      || 0,
    Received_Stock:     parseFloat(row.Received_Stock)     || 0,
    Issued_Stock:       parseFloat(row.Issued_Stock)       || 0,
    Supplier_Lead_Time: parseFloat(row.Supplier_Lead_Time) || 0,
    Pending_Order:      parseInt(row.Pending_Order)        || 0,
    Disease_Season:     row.Disease_Season || "None",
    Festival:           row.Festival       || "None",
    Date:               row.Date || new Date().toISOString().split("T")[0],
  };
}

// ── Backend file upload batch runner ─────────────────
async function runUploadBatch(prefix, uploadUrl, type) {
  const file    = uploadedFiles[prefix];
  const batchEl = document.getElementById(`${prefix}-batch-result`);

  if (!file) {
    batchEl.className = "batch-result";
    batchEl.classList.remove("hidden");
    batchEl.innerHTML = `<div class="ai-result error-result"><i class="fa-solid fa-circle-xmark"></i> No file selected. Please drop or choose a file first.</div>`;
    return;
  }

  batchEl.className = "batch-result loading";
  batchEl.innerHTML = `<div class="ai-spinner"></div> Uploading "${file.name}" to backend…<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:40%"></div></div>`;
  batchEl.classList.remove("hidden");
  setBtn(`${prefix}-btn`, true);

  const statusEl = document.getElementById(`${prefix}-csv-status`);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(uploadUrl, { method: "POST", body: formData });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    const data = await res.json();

    batchEl.className = "batch-result";
    renderBatchResult(prefix, data, type);

    if (statusEl) {
      statusEl.className = "csv-status success";
      statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Processed <strong>${data.total_rows} rows</strong> from "${file.name}"`;
    }

  } catch (err) {
    batchEl.className = "batch-result";
    const label = uploadUrl.includes("patient-footfall-api")   ? "patient-footfall-api"
                : uploadUrl.includes("bed-occupancy-api")      ? "bed-occupancy-api"
                : uploadUrl.includes("medicine-stockout-api")  ? "medicine-stockout-api"
                :                                                "the API";
    batchEl.innerHTML = `<div class="ai-result error-result">
      <i class="fa-solid fa-circle-xmark"></i> Upload failed.<br><br>
      Could not reach <strong>${label}</strong>.<br><br>
      Error: ${err.message}
    </div>`;
  } finally {
    setBtn(`${prefix}-btn`, false);
  }
}

// ── Batch result renderer (now uses backend BatchOutput) ──
function renderBatchResult(prefix, data, type) {
  const el = document.getElementById(`${prefix}-batch-result`);
  if (!el) return;

  const { total_rows, high_risk, normal, risk_rate_pct, results } = data;

  const typeLabels = {
    footfall: { high: "High Footfall",     low: "Normal Footfall",  col: "Risk Level"    },
    bed:      { high: "High Occupancy",    low: "Normal Occupancy", col: "Risk Level"     },
    stockout: { high: "Stockout Risk",     low: "Safe",             col: "Stockout Risk"  },
  };
  const lbl = typeLabels[type];

  const displayRows = results.slice(0, 50);
  const tableRows = displayRows.map(r => {
    const isHigh   = r.prediction === 1;
    const badgeCls = isHigh ? (type === "stockout" ? "badge-orange" : "badge-red") : "badge-green";
    const badgeTxt = isHigh ? lbl.high : lbl.low;
    const pct      = (r.probability * 100).toFixed(1);
    const idLabel  = r.medicine_id || r.row_id;
    return `<tr>
      <td>${idLabel}</td>
      <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
      <td>${pct}%</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="batch-summary">
      <div class="batch-stat red">  <div class="bs-num">${high_risk}</div><div class="bs-lbl">${lbl.high}</div></div>
      <div class="batch-stat green"><div class="bs-num">${normal}</div>  <div class="bs-lbl">${lbl.low}</div></div>
      <div class="batch-stat blue"> <div class="bs-num">${total_rows}</div><div class="bs-lbl">Total Rows</div></div>
      <div class="batch-stat orange"><div class="bs-num">${risk_rate_pct}%</div><div class="bs-lbl">Risk Rate</div></div>
    </div>
    <div class="batch-progress">
      <div class="bp-bar"><div class="bp-fill ${type === 'stockout' ? 'orange' : 'red'}" style="width:${risk_rate_pct}%"></div></div>
      <span>${risk_rate_pct}% rows flagged as high risk</span>
    </div>
    <div class="batch-table-wrap">
      <table class="batch-table">
        <thead><tr><th>Row / ID</th><th>${lbl.col}</th><th>Confidence</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${results.length > 50 ? `<div class="preview-label" style="margin-top:8px">Showing first 50 of ${results.length} rows. Download report for full data.</div>` : ""}
    </div>
    <button class="btn-download-batch" onclick="downloadBatchReport(window._lastBatch['${prefix}'], '${type}')">
      <i class="fa-solid fa-download"></i> Download Full Report (CSV)
    </button>
  `;
  el.classList.remove("hidden");

  if (!window._lastBatch) window._lastBatch = {};
  window._lastBatch[prefix] = data;
}

// ── Download batch report ─────────────────────────────
function downloadBatchReport(data, type) {
  if (!data || !data.results) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const header = ["Row_ID","Medicine_ID","Prediction","Risk_Label","Probability_%","English_Explanation"].join(",");
  const rows = data.results.map(r => [
    `"${r.row_id}"`,
    `"${r.medicine_id || ""}"`,
    r.prediction,
    `"${r.risk_label}"`,
    (r.probability * 100).toFixed(1),
    `"${(r.explanation_english || "").replace(/"/g, "'").replace(/\n/g, " ")}"`
  ].join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `sha_${type}_batch_${timestamp}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function downloadSingleResult(data, type) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const lines = [
    `Smart Health AI — ${type} Prediction Report`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `Prediction,${data.risk_label || data.prediction}`,
    `Confidence,${(data.probability * 100).toFixed(1)}%`,
    ``,
    `English Explanation`,
    `"${(data.explanation_english || "").replace(/"/g, "'")}"`,
    ``,
    `Hindi Explanation`,
    `"${(data.explanation_hindi || "").replace(/"/g, "'")}"`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `sha_${type}_report_${timestamp}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Entry points ─────────────────────────────────────
function runFootfall() {
  if (csvMode.ff === "csv") {
    runUploadBatch("ff", "https://patient-footfall-api.onrender.com/upload/footfall", "footfall");
  } else {
    const payload = {
      Patient_Count:    parseFloat(document.getElementById("ff-patient-count").value) || 0,
      Doctors:          parseFloat(document.getElementById("ff-doctors").value)        || 1,
      Population:       parseFloat(document.getElementById("ff-population").value)     || 0,
      Rainfall:         parseFloat(document.getElementById("ff-rainfall").value)       || 0,
      Date:             document.getElementById("ff-date").value,
      Disease_Outbreak: parseInt(document.getElementById("ff-outbreak").value),
      Holiday:          parseInt(document.getElementById("ff-holiday").value),
      Weekend:          parseInt(document.getElementById("ff-weekend").value),
    };
    if (!payload.Date) { showApiError("ff-result", "Please select a date."); return; }
    showLoading("ff-result");
    setBtn("ff-btn", true);
    callAPI("https://patient-footfall-api.onrender.com/predict/footfall", payload)
      .then(d => renderSingleResult("ff-result", d, "footfall"))
      .catch(err => showApiError("ff-result", apiErrorMsg("https://patient-footfall-api.onrender.com", err)))
      .finally(() => setBtn("ff-btn", false));
  }
}

function runBed() {
  if (csvMode.bed === "csv") {
    runUploadBatch("bed", "https://bed-occupancy-api.onrender.com/upload/bed", "bed");
  } else {
    const payload = {
      Total_Beds:             parseFloat(document.getElementById("bed-total").value)      || 0,
      Occupied_Beds:          parseFloat(document.getElementById("bed-occupied").value)   || 0,
      Admissions:             parseFloat(document.getElementById("bed-admissions").value) || 0,
      Discharges:             parseFloat(document.getElementById("bed-discharges").value) || 0,
      Average_Length_of_Stay: parseFloat(document.getElementById("bed-los").value)       || 0,
      Disease_Outbreak:       parseInt(document.getElementById("bed-outbreak").value),
      Date:                   document.getElementById("bed-date").value,
    };
    if (!payload.Date) { showApiError("bed-result", "Please select a date."); return; }
    showLoading("bed-result");
    setBtn("bed-btn", true);
    callAPI("https://bed-occupancy-api.onrender.com/predict/bed", payload)
      .then(d => renderSingleResult("bed-result", d, "bed"))
      .catch(err => showApiError("bed-result", apiErrorMsg("https://bed-occupancy-api.onrender.com", err)))
      .finally(() => setBtn("bed-btn", false));
  }
}

function runStockout() {
  if (csvMode.so === "csv") {
    runUploadBatch("so", "https://medicine-stockout-api.onrender.com/upload/stockout", "stockout");
  } else {
    const payload = {
      Medicine_ID:        document.getElementById("so-medicine-id").value || "MED-001",
      Current_Stock:      parseFloat(document.getElementById("so-current-stock").value) || 0,
      Received_Stock:     parseFloat(document.getElementById("so-received").value)      || 0,
      Issued_Stock:       parseFloat(document.getElementById("so-issued").value)        || 0,
      Supplier_Lead_Time: parseFloat(document.getElementById("so-lead-time").value)     || 0,
      Pending_Order:      parseInt(document.getElementById("so-pending").value),
      Disease_Season:     document.getElementById("so-season").value,
      Festival:           document.getElementById("so-festival").value,
      Date:               document.getElementById("so-date").value,
    };
    if (!payload.Date) { showApiError("so-result", "Please select a date."); return; }
    showLoading("so-result");
    setBtn("so-btn", true);
    callAPI("https://medicine-stockout-api.onrender.com/predict/stockout", payload)
      .then(d => renderSingleResult("so-result", d, "stockout"))
      .catch(err => showApiError("so-result", apiErrorMsg("https://medicine-stockout-api.onrender.com", err)))
      .finally(() => setBtn("so-btn", false));
  }
}