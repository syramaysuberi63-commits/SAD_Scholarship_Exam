/* Client-side HTML/CSS/JavaScript + Supabase. No Node.js backend. */
// Supabase connection settings are stored in config.js.
const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || "";
const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes("YOUR_");
const $ = (id) => document.getElementById(id);
let supabaseClient = null,
  currentUser = null,
  currentProfile = null,
  isPasswordRecovery =
    new URLSearchParams(window.location.hash.slice(1)).get("type") ===
    "recovery",
  programMap = new Map(),
  allStaffRows = [];
const show = (id, yes = true) => $(id).classList.toggle("hidden", !yes);
const message = (id, text, ok = false) => {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("success", !!ok);
};
const escapeHtml = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const badge = (text) =>
  `<span class="status ${text === "Verified" || text === "Compliant" || text === "Approved" ? "good" : text === "Returned" || text === "With Deficiency" || text === "Held" ? "bad" : text === "Pending" ? "warn" : ""}">${escapeHtml(text || "—")}</span>`;
function showAuthForm(id) {
  ["loginForm", "signupForm", "resetRequestForm", "updatePasswordForm"].forEach(
    (formId) => show(formId, formId === id),
  );
}
function initTabs() {
  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      showAuthForm(b.dataset.tab === "login" ? "loginForm" : "signupForm");
      message("authMessage", "");
    }),
  );
}
async function loadPrograms() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("programs")
    .select("*")
    .order("id");
  if (error) {
    message(
      "authMessage",
      "Could not load scholarship policies: " + error.message,
    );
    return;
  }
  const programs = data || [];
  programMap = new Map(programs.map((p) => [String(p.id), p]));
  if (!programs.length) {
    $("signupProgram").innerHTML =
      '<option value="">No scholarship programs configured</option>';
    message(
      "authMessage",
      "Scholar registration is unavailable because no programs are configured. Ask the administrator to run supabase/schema.sql in Supabase.",
    );
    return;
  }
  $("signupProgram").innerHTML =
    '<option value="">Choose a program</option>' +
    programs
      .map((program) => `<option value="${program.id}">${escapeHtml(program.name)}</option>`)
      .join("");
}
async function login(e) {
  e.preventDefault();
  message("authMessage", "Signing in…");
  const email = $("loginEmail").value.trim(),
    password = $("loginPassword").value;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      message("authMessage", "Login failed: " + error.message);
      return;
    }
    await openDashboard(data.user);
  } catch (error) {
    message(
      "authMessage",
      "Login could not be completed: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
async function requestPasswordReset(e) {
  e.preventDefault();
  const email = $("resetEmail").value.trim();
  message("authMessage", "Sending password reset link…");
  const redirectTo =
    window.location.origin === "null"
      ? undefined
      : window.location.href.split(/[?#]/, 1)[0];
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) {
      message("authMessage", "Could not send reset link: " + error.message);
      return;
    }
    message(
      "authMessage",
      "If an account exists for that email, a password reset link has been sent. Check your inbox.",
      true,
    );
  } catch (error) {
    message(
      "authMessage",
      "Could not send reset link: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
async function updateRecoveredPassword(e) {
  e.preventDefault();
  const password = $("newPassword").value;
  if (password !== $("confirmPassword").value) {
    message("authMessage", "The passwords do not match.");
    return;
  }
  message("authMessage", "Updating password…");
  try {
    const { data, error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
      message("authMessage", "Could not update password: " + error.message);
      return;
    }
    message("authMessage", "Password updated. Opening your dashboard…", true);
    await openDashboard(data.user);
  } catch (error) {
    message(
      "authMessage",
      "Could not update password: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
async function register(e) {
  e.preventDefault();
  message("authMessage", "Creating scholar account…");
  const name = $("signupName").value.trim(),
    studentId = $("signupStudentId").value.trim(),
    email = $("signupEmail").value.trim(),
    password = $("signupPassword").value,
    programId = Number($("signupProgram").value);
  if (!programId) {
    message(
      "authMessage",
      $("signupProgram").options.length > 1
        ? "Choose a scholarship program."
        : "No scholarship programs are configured. Ask the administrator to run supabase/schema.sql in Supabase.",
    );
    return;
  }
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        student_id: studentId,
        role: "scholar",
        program_id: programId,
      },
    },
  });
  if (error) {
    message("authMessage", "Registration failed: " + error.message);
    return;
  }
  if (data.session) {
    message("authMessage", "Account created. Opening dashboard…", true);
    await openDashboard(data.user);
  } else {
    message(
      "authMessage",
      "Account created. If email confirmation is enabled, confirm the email first, then log in.",
      true,
    );
    $("loginEmail").value = email;
    document.querySelector('[data-tab="login"]').click();
  }
}
async function openDashboard(user) {
  currentUser = user;
  message("authMessage", "");
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select(
      "id,student_id,full_name,email,role,program_id,programs(id,name,max_gwa,min_units,allowed_failed,allowed_incomplete,allowed_dropped,deadline)",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    await supabaseClient.auth.signOut();
    message("authMessage", "Could not load your profile: " + error.message);
    return;
  }
  if (!profile) {
    await supabaseClient.auth.signOut();
    message(
      "authMessage",
      "Login succeeded, but no profile exists for this account. Ask the project administrator to create the matching profiles record in Supabase.",
    );
    return;
  }
  currentProfile = profile;
  show("authView", false);
  show("dashboardView", true);
  show("logoutBtn", true);
  $("welcomeTitle").textContent = "Welcome, " + profile.full_name;
  $("roleLabel").textContent =
    profile.role === "staff" ? "SCHOLARSHIP STAFF" : "SCHOLAR DASHBOARD";
  $("welcomeSub").textContent =
    profile.role === "staff"
      ? "Review submissions, verify records, evaluate policy compliance, and record renewal decisions."
      : "Submit your semester summary and track your scholarship status.";
  $("programChip").textContent =
    profile.programs?.name ||
    (profile.role === "staff" ? "Staff access" : "Program not assigned");
  show("staffView", profile.role === "staff");
  show("scholarView", profile.role === "scholar");
  if (profile.role === "staff") await loadStaff();
  else await loadScholar();
}
function evaluate(record, program) {
  const reasons = [];
  if (Number(record.gwa) > Number(program.max_gwa))
    reasons.push(`GWA exceeds ${program.max_gwa}`);
  if (Number(record.enrolled_units) < Number(program.min_units))
    reasons.push(`Units below ${program.min_units}`);
  if (Number(record.failed_count) > Number(program.allowed_failed))
    reasons.push("Failed subjects exceed allowance");
  if (Number(record.incomplete_count) > Number(program.allowed_incomplete))
    reasons.push("Incomplete subjects exceed allowance");
  if (Number(record.dropped_count) > Number(program.allowed_dropped))
    reasons.push("Dropped subjects exceed allowance");
  return { status: reasons.length ? "With Deficiency" : "Compliant", reasons };
}
async function loadScholar() {
  const { data, error } = await supabaseClient
    .from("submissions")
    .select("*")
    .eq("scholar_id", currentUser.id)
    .order("submitted_at", { ascending: false });
  if (error) {
    message(
      "submissionMessage",
      "Could not load submissions: " + error.message,
    );
    return;
  }
  const rows = data || [];
  $("mySubmissionCount").textContent = rows.length;
  $("myVerification").textContent = rows[0]?.verification_status || "—";
  $("myCompliance").textContent = rows[0]?.compliance_status || "—";
  $("myRenewal").textContent = rows[0]?.renewal_decision || "—";
  $("mySubmissionsBody").innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.academic_year)}<div class="muted">${escapeHtml(r.semester)}</div></td><td>${Number(r.gwa).toFixed(2)}</td><td>${badge(r.verification_status)}</td><td>${badge(r.compliance_status)}</td><td>${badge(r.renewal_decision)}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5">No submissions yet.</td></tr>';
}
async function submitSummary(e) {
  e.preventDefault();
  if (currentProfile?.role !== "scholar") {
    message(
      "submissionMessage",
      "Only scholar accounts can submit records. Log out and sign in with a scholar account.",
    );
    return;
  }
  message("submissionMessage", "Submitting…");
  const row = {
    scholar_id: currentUser.id,
    academic_year: $("academicYear").value.trim(),
    semester: $("semester").value,
    gwa: Number($("gwa").value),
    enrolled_units: Number($("units").value),
    failed_count: Number($("failed").value),
    incomplete_count: Number($("incomplete").value),
    dropped_count: Number($("dropped").value),
    evidence_ref: $("evidenceRef").value.trim(),
  };
  if (
    row.gwa < 1 ||
    row.gwa > 5 ||
    ![
      row.enrolled_units,
      row.failed_count,
      row.incomplete_count,
      row.dropped_count,
    ].every((n) => Number.isInteger(n) && n >= 0)
  ) {
    message(
      "submissionMessage",
      "Check the GWA (1.00–5.00) and nonnegative whole-number counts/units.",
    );
    return;
  }
  if (new Date() > new Date("2026-10-30T17:00:00+08:00")) {
    message(
      "submissionMessage",
      "The submission deadline has passed (October 30, 2026 at 5:00 PM Manila time).",
    );
    return;
  }
  const { error } = await supabaseClient.from("submissions").insert(row);
  if (error) {
    message(
      "submissionMessage",
      error.code === "23505"
        ? "A submission already exists for this academic year and semester."
        : error.message,
    );
    return;
  }
  message(
    "submissionMessage",
    "Semester summary submitted. It must be verified by staff before compliance is evaluated.",
    true,
  );
  $("evidenceRef").value = "";
  await loadScholar();
}
async function loadStaff() {
  const { data, error } = await supabaseClient
    .from("submissions")
    .select(
      "*,profiles!submissions_scholar_id_fkey(id,student_id,full_name,email,program_id,programs(id,name,max_gwa,min_units,allowed_failed,allowed_incomplete,allowed_dropped))",
    )
    .order("submitted_at", { ascending: false });
  if (error) {
    message("staffMessage", "Could not load submissions: " + error.message);
    return;
  }
  allStaffRows = data || [];
  $("staffTotal").textContent = allStaffRows.length;
  $("staffPending").textContent = allStaffRows.filter(
    (r) => r.verification_status === "Pending",
  ).length;
  $("staffVerified").textContent = allStaffRows.filter(
    (r) => r.verification_status === "Verified",
  ).length;
  $("staffReturned").textContent = allStaffRows.filter(
    (r) => r.verification_status === "Returned",
  ).length;
  renderStaffRows();
}
function renderStaffRows() {
  const q = $("searchInput").value.trim().toLowerCase(),
    status = $("statusFilter").value;
  const rows = allStaffRows.filter(
    (r) =>
      (status === "All" || r.verification_status === status) &&
      `${r.profiles?.full_name || ""} ${r.profiles?.student_id || ""} ${r.profiles?.email || ""}`
        .toLowerCase()
        .includes(q),
  );
  $("staffSubmissionsBody").innerHTML = rows.length
    ? rows
        .map((r) => {
          const p = r.profiles?.programs;
          const ev = p
            ? evaluate(r, p)
            : {
                status: "Not Evaluated",
                reasons: ["Program policy unavailable"],
              };
          return `<tr><td><strong>${escapeHtml(r.profiles?.full_name || "Unknown scholar")}</strong><div class="muted">${escapeHtml(r.profiles?.student_id || r.profiles?.email || "")}</div><div class="muted">${escapeHtml(r.profiles?.programs?.name || "")}</div></td><td>${escapeHtml(r.academic_year)}<div class="muted">${escapeHtml(r.semester)}</div></td><td>${Number(r.gwa).toFixed(2)} / ${r.enrolled_units}</td><td>F:${r.failed_count} I:${r.incomplete_count} D:${r.dropped_count}<div class="muted">${escapeHtml(r.evidence_ref)}</div></td><td>${badge(r.verification_status)}${r.verification_reason ? `<div class="muted">${escapeHtml(r.verification_reason)}</div>` : ""}</td><td>${badge(r.compliance_status)}${r.deficiency_reasons?.length ? `<div class="muted">${escapeHtml(r.deficiency_reasons.join(", "))}</div>` : ""}</td><td>${badge(r.renewal_decision)}${r.decision_note ? `<div class="muted">${escapeHtml(r.decision_note)}</div>` : ""}</td><td><div class="action-stack">${r.verification_status !== "Verified" ? `<button class="small-btn" data-action="verify" data-id="${r.id}">Verify</button>` : ""}<button class="small-btn return" data-action="return" data-id="${r.id}">Return</button>${r.verification_status === "Verified" && r.compliance_status !== "Not Evaluated" ? `<button class="small-btn" data-action="approve" data-id="${r.id}">Approve renewal</button><button class="small-btn hold" data-action="hold" data-id="${r.id}">Hold renewal</button>` : ""}</div></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="8">No matching submissions.</td></tr>';
}
async function audit(submissionId, action, details) {
  const { error } = await supabaseClient
    .from("audit_log")
    .insert({
      submission_id: submissionId,
      actor_id: currentUser.id,
      action,
      details,
    });
  if (error) console.warn("Audit log write failed:", error.message);
}
async function staffAction(action, id) {
  const r = allStaffRows.find((x) => String(x.id) === String(id));
  if (!r) return;
  let patch = {},
    note = "";
  if (action === "verify") {
    patch = { verification_status: "Verified", verification_reason: null };
  } else if (action === "return") {
    note = prompt("Reason for returning this submission:");
    if (!note || !note.trim()) return;
    patch = {
      verification_status: "Returned",
      verification_reason: note.trim(),
      compliance_status: "Not Evaluated",
      deficiency_reasons: [],
      renewal_decision: "Pending",
      decision_note: null,
    };
  } else if (action === "approve" || action === "hold") {
    if (
      r.verification_status !== "Verified" ||
      r.compliance_status === "Not Evaluated"
    ) {
      message(
        "staffMessage",
        "Verify the submission before recording compliance or renewal.",
      );
      return;
    }
    note = prompt("Decision note (optional):") || "";
    patch = {
      renewal_decision: action === "approve" ? "Approved" : "Held",
      decision_note: note.trim(),
    };
  }
  const { error } = await supabaseClient
    .from("submissions")
    .update(patch)
    .eq("id", r.id);
  if (error) {
    message("staffMessage", "Action failed: " + error.message);
    return;
  }
  await audit(
    r.id,
    action,
    note || (action === "verify" ? "Record verified" : ""),
  );
  if (action === "verify") {
    const policy = r.profiles?.programs;
    if (!policy) {
      message("staffMessage", "Verified, but program policy is missing.");
      return;
    }
    const ev = evaluate(r, policy);
    const { error: evalError } = await supabaseClient
      .from("submissions")
      .update({
        compliance_status: ev.status,
        deficiency_reasons: ev.reasons,
        renewal_decision: "Pending",
        decision_note: null,
      })
      .eq("id", r.id);
    if (evalError) {
      message(
        "staffMessage",
        "Verified, but compliance evaluation failed: " + evalError.message,
      );
      return;
    }
    await audit(
      r.id,
      "compliance_evaluated",
      ev.reasons.join("; ") || "No deficiencies",
    );
  }
  message("staffMessage", "Record updated.", true);
  await loadStaff();
}
async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  show("dashboardView", false);
  show("authView", true);
  show("logoutBtn", false);
  $("loginPassword").value = "";
  message("authMessage", "You have logged out.", true);
}
async function start() {
  initTabs();
  if (!configured) {
    show("setupNotice", true);
    $("setupNotice").textContent =
      "Setup required: open config.js and set your Supabase project URL and publishable/anon key. Do not put a service-role key in this file.";
    message("authMessage", "Supabase settings have not been configured yet.");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  $("resetPasswordBtn").addEventListener("click", () => {
    $("resetEmail").value = $("loginEmail").value.trim();
    showAuthForm("resetRequestForm");
    message("authMessage", "");
  });
  $("resetRequestForm").addEventListener("submit", requestPasswordReset);
  $("updatePasswordForm").addEventListener("submit", updateRecoveredPassword);
  document.querySelectorAll("[data-return-login]").forEach((button) =>
    button.addEventListener("click", () => {
      showAuthForm("loginForm");
      message("authMessage", "");
    }),
  );
  $("loginForm").addEventListener("submit", login);
  $("signupForm").addEventListener("submit", register);
  $("submissionForm").addEventListener("submit", submitSummary);
  $("logoutBtn").addEventListener("click", logout);
  $("searchInput").addEventListener("input", renderStaffRows);
  $("statusFilter").addEventListener("change", renderStaffRows);
  $("staffSubmissionsBody").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-action]");
    if (b) staffAction(b.dataset.action, b.dataset.id);
  });
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      isPasswordRecovery = true;
      showAuthForm("updatePasswordForm");
      message("authMessage", "Choose a new password to finish resetting your account.");
    }
    if (event === "SIGNED_OUT") {
      show("dashboardView", false);
      show("authView", true);
      show("logoutBtn", false);
      showAuthForm("loginForm");
    }
  });
  await loadPrograms();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session && !isPasswordRecovery) await openDashboard(session.user);
}
document.addEventListener("DOMContentLoaded", start);
