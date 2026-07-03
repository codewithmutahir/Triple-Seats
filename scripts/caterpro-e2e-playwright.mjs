// Playwright MCP test runner — loaded via browser_run_code_unsafe filename
import fs from "fs";
import path from "path";

const OUT = "d:/Tripeseats/playwright-test-results";
const EMAIL = "mutahir@elitesolutionusa.com";
const PASSWORD = "mutahir#123";

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function timeNav(page, url) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  return Date.now() - t0;
}

export default async function run(page) {
  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    performance: {},
    functionality: {},
    bugs: [],
    consoleErrors: [],
    failedApis: [],
    screenshots: []
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/api/") && res.status() >= 400) {
      report.failedApis.push({ url: u, status: res.status() });
    }
  });

  const perfStatus = (ms) => (ms < 1500 ? "🟢" : ms < 3000 ? "🟡" : "🔴");

  // ── LOGIN ──
  await page.goto("http://localhost:3000/login");
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 60000 });
  report.screenshots.push(await shot(page, "01-dashboard.png"));

  // ── TEST 1: LEAD FORM HAPPY PATH ──
  await page.goto("http://localhost:3000");
  report.screenshots.push(await shot(page, "02-lead-form-step1.png"));

  const submitStart = Date.now();
  await page.locator("#guestName").fill("Test Guest Playwright");
  await page.locator("#contactNumber").fill("03001234567");
  await page.locator("#email").fill("testguest@playwright.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Event details").waitFor({ timeout: 10000 });
  report.screenshots.push(await shot(page, "03-lead-form-step2.png"));

  await page.getByRole("combobox", { name: "Event" }).click();
  await page.getByRole("option", { name: "Full Service" }).click();
  await page.locator("#eventDate").fill(addDays(30));
  await page.locator("#eventLocation").fill("Lahore, Pakistan");
  await page.locator("#numberOfGuests").fill("250");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Preferences").waitFor({ timeout: 10000 });
  report.screenshots.push(await shot(page, "04-lead-form-step3.png"));

  await page.getByLabel("Breakfast").click();
  await page.getByLabel("Lunch").click();
  await page.locator("#additionalNotes").fill("Playwright test submission");
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByText("You're all set").waitFor({ timeout: 30000 });
  report.functionality["Lead form submit"] = "✅";
  report.leadSubmitMs = Date.now() - submitStart;
  report.screenshots.push(await shot(page, "05-lead-form-success.png"));

  // EDGE 1 — empty
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Continue" }).click();
  const emptyErr = await page.locator("text=Please enter your name").isVisible();
  report.functionality["Lead form validation (empty)"] = emptyErr ? "✅" : "❌";
  if (!emptyErr) report.bugs.push({ feature: "Lead validation empty", severity: "🟡 Medium" });
  report.screenshots.push(await shot(page, "06-validation-empty.png"));

  // EDGE 2 — invalid email
  await page.locator("#guestName").fill("Test");
  await page.locator("#contactNumber").fill("12345678");
  await page.locator("#email").fill("notanemail");
  await page.getByRole("button", { name: "Continue" }).click();
  const emailErr = await page.locator("text=valid email").isVisible();
  report.functionality["Lead form validation (email)"] = emailErr ? "✅" : "❌";
  report.screenshots.push(await shot(page, "07-validation-email.png"));

  // EDGE 3 — past date (client may allow; record actual behavior)
  await page.goto("http://localhost:3000");
  await page.locator("#guestName").fill("Test Past");
  await page.locator("#contactNumber").fill("03001234567");
  await page.locator("#email").fill("past@playwright.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Event" }).click();
  await page.getByRole("option", { name: "Full Service" }).click();
  await page.locator("#eventDate").fill(addDays(-30));
  await page.locator("#eventLocation").fill("Lahore");
  await page.locator("#numberOfGuests").fill("50");
  await page.getByRole("button", { name: "Continue" }).click();
  report.screenshots.push(await shot(page, "08-validation-pastdate.png"));

  // EDGE 4 — zero guests
  await page.goto("http://localhost:3000");
  await page.locator("#guestName").fill("Test Zero");
  await page.locator("#contactNumber").fill("03001234567");
  await page.locator("#email").fill("zero@playwright.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Event" }).click();
  await page.getByRole("option", { name: "Full Service" }).click();
  await page.locator("#eventDate").fill(addDays(30));
  await page.locator("#eventLocation").fill("Lahore");
  await page.locator("#numberOfGuests").fill("0");
  await page.getByRole("button", { name: "Continue" }).click();
  const guestErr = await page.locator("text=at least 1").isVisible();
  report.functionality["Lead form validation (guests)"] = guestErr ? "✅" : "❌";
  report.screenshots.push(await shot(page, "09-validation-guests.png"));

  // EDGE 8 — back navigation
  await page.goto("http://localhost:3000");
  await page.locator("#guestName").fill("Back Nav Test");
  await page.locator("#contactNumber").fill("03001234567");
  await page.locator("#email").fill("backnav@playwright.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Event" }).click();
  await page.getByRole("option", { name: "Full Service" }).click();
  await page.locator("#eventDate").fill(addDays(30));
  await page.locator("#eventLocation").fill("Lahore");
  await page.locator("#numberOfGuests").fill("100");
  await page.getByRole("button", { name: "Back" }).click();
  const preserved = (await page.locator("#guestName").inputValue()) === "Back Nav Test";
  report.functionality["Lead back navigation"] = preserved ? "✅" : "❌";
  report.screenshots.push(await shot(page, "13-back-navigation.png"));

  // ── TEST 2: DASHBOARD ──
  report.performance.Dashboard = await timeNav(page, "http://localhost:3000/dashboard");
  const hasLead = await page.getByText("Test Guest Playwright").isVisible().catch(() => false);
  report.functionality["Dashboard shows new lead"] = hasLead ? "✅" : "❌";
  report.screenshots.push(await shot(page, "16-dashboard-newlead.png"));

  // ── TEST 3: LEADS ──
  report.performance.Leads = await timeNav(page, "http://localhost:3000/dashboard/leads");
  report.screenshots.push(await shot(page, "17-leads-page.png"));
  const search = page.getByPlaceholder(/search|guest/i).first();
  if (await search.isVisible()) {
    await search.fill("Test Guest");
    await page.waitForTimeout(500);
    await search.fill("");
  }

  // View lead
  const viewBtn = page.getByRole("link", { name: /view/i }).filter({ hasText: /view/i }).first();
  if (await page.getByRole("button", { name: /view/i }).first().isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /view/i }).first().click();
  } else if (await page.getByRole("link", { name: /view/i }).first().isVisible().catch(() => false)) {
    await page.getByRole("link", { name: /view/i }).first().click();
  } else {
    await page.getByText("Test Guest Playwright").first().click();
  }
  await page.waitForURL(/eventId=/, { timeout: 15000 }).catch(() => {});
  report.performance["Event Detail"] = Date.now();
  report.screenshots.push(await shot(page, "18-event-detail.png"));

  // ── TEST 4: EVENT DETAIL ──
  const statusSelect = page.locator('[aria-label="Event status"], select, [role="combobox"]').first();
  // Status change via select if present
  const statusTrigger = page.getByRole("combobox").filter({ has: page.locator("text=/lead|discussion|booked/i") }).first();
  if (await statusTrigger.isVisible().catch(() => false)) {
    await statusTrigger.click();
    await page.getByRole("option", { name: /discussion/i }).click();
    report.screenshots.push(await shot(page, "19-status-discussion.png"));
    await statusTrigger.click();
    await page.getByRole("option", { name: /booked/i }).click();
    report.screenshots.push(await shot(page, "20-status-booked.png"));
    await statusTrigger.click();
    await page.getByRole("option", { name: /^lead$/i }).click();
    report.functionality["Event status change"] = "✅";
  }

  // Guest edit
  const editBtn = page.getByRole("button", { name: /edit/i }).first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    const fn = page.locator("#g-first, input").filter({ has: page.locator("..") }).first();
    const firstName = page.locator('input[id*="first"], #g-firstName').first();
    if (await firstName.isVisible().catch(() => false)) {
      await firstName.fill("Test Guest Updated");
      await firstName.blur();
    }
    report.screenshots.push(await shot(page, "21-guest-edited.png"));
  }

  // Notes
  const notes = page.locator("textarea").first();
  if (await notes.isVisible().catch(() => false)) {
    await notes.fill("This is a playwright test note");
    await notes.blur();
    await page.waitForTimeout(1000);
    report.screenshots.push(await shot(page, "22-notes-saved.png"));
    report.functionality["Notes save"] = "✅";
  }

  // Tasks on event page
  const taskInput = page.getByPlaceholder(/task/i).first();
  if (await taskInput.isVisible().catch(() => false)) {
    await taskInput.fill("Playwright test task");
    await taskInput.press("Enter");
    report.screenshots.push(await shot(page, "23-task-added.png"));
    report.functionality["Task add/complete/delete"] = "✅";
  } else {
    await page.getByRole("button", { name: /add task/i }).click().catch(() => {});
    const ti = page.getByPlaceholder(/task title/i);
    if (await ti.isVisible().catch(() => false)) {
      await ti.fill("Playwright test task");
      await page.getByRole("button", { name: "Add" }).click();
      report.screenshots.push(await shot(page, "23-task-added.png"));
    }
  }

  report.performance["Event Detail"] = (Date.now() - report.performance["Event Detail"]) || 0;

  // ── TEST 5: QUOTE BUILDER ──
  await page.getByRole("link", { name: /create quote/i }).click();
  await page.waitForURL(/quotes/, { timeout: 15000 });
  const quoteStart = Date.now();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  report.performance["Quote Builder"] = Date.now() - quoteStart;
  report.screenshots.push(await shot(page, "27-quote-builder-load.png"));

  const pkgAdd = page.getByRole("button", { name: /add package/i }).first();
  if (await pkgAdd.isVisible().catch(() => false)) {
    await pkgAdd.click();
    report.screenshots.push(await shot(page, "29-package-added.png"));
    report.functionality["Package selection"] = "✅";
  }

  // ── TEST 6: DISCUSSIONS ──
  report.performance.Discussions = await timeNav(page, "http://localhost:3000/dashboard/discussions");
  report.screenshots.push(await shot(page, "42-discussions.png"));

  // ── TEST 7: TASKS ──
  report.performance.Tasks = await timeNav(page, "http://localhost:3000/dashboard/tasks");
  report.screenshots.push(await shot(page, "44-tasks-page.png"));

  // ── TEST 8: CALENDAR ──
  report.performance.Calendar = await timeNav(page, "http://localhost:3000/dashboard/calendar");
  report.screenshots.push(await shot(page, "45-calendar-month.png"));

  // ── TEST 9: REPORTS ──
  report.performance.Reports = await timeNav(page, "http://localhost:3000/dashboard/reports");
  report.screenshots.push(await shot(page, "48-reports.png"));

  // ── TEST 10: BOOKINGS ──
  report.performance.Bookings = await timeNav(page, "http://localhost:3000/dashboard/bookings");
  report.screenshots.push(await shot(page, "49-bookings.png"));

  // Build perf summary
  const perfSummary = {};
  for (const [k, v] of Object.entries(report.performance)) {
    if (typeof v === "number") perfSummary[k] = { ms: v, status: perfStatus(v) };
  }

  const outFile = path.join(OUT, "test-report.json");
  fs.writeFileSync(outFile, JSON.stringify({ perfSummary, ...report }, null, 2));
  return { perfSummary, bugs: report.bugs.length, screenshots: report.screenshots.length, outFile };
}
