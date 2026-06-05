// Front-end controller for the Etsy -> Shopify migrator PWA.
const form = document.getElementById("creds-form");
const statusEl = document.getElementById("status");
const logSection = document.getElementById("log");
const logList = document.getElementById("log-list");
const progressFill = document.getElementById("progress-fill");
const migrateBtn = document.getElementById("migrate-btn");
const verifyBtn = document.getElementById("verify-btn");

const LS_KEY = "etsy2shopify.creds";

// Restore non-secret-ish fields the user typed before (kept locally only).
restore();

function readCreds() {
  const f = new FormData(form);
  return {
    etsy: {
      apiKey: f.get("etsyApiKey")?.toString().trim(),
      accessToken: f.get("etsyAccessToken")?.toString().trim(),
      shopId: f.get("etsyShopId")?.toString().trim(),
    },
    shopify: {
      storeDomain: f.get("shopifyStoreDomain")?.toString().trim(),
      adminToken: f.get("shopifyAdminToken")?.toString().trim(),
    },
    dryRun: f.get("dryRun") === "on",
  };
}

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function persist() {
  const f = new FormData(form);
  // Persist only the store domain + shop id for convenience; never tokens.
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({
      etsyShopId: f.get("etsyShopId"),
      shopifyStoreDomain: f.get("shopifyStoreDomain"),
    }),
  );
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (saved.etsyShopId) form.elements.etsyShopId.value = saved.etsyShopId;
    if (saved.shopifyStoreDomain)
      form.elements.shopifyStoreDomain.value = saved.shopifyStoreDomain;
  } catch {}
}

verifyBtn.addEventListener("click", async () => {
  persist();
  setStatus("Verifying Shopify credentials…");
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readCreds()),
    });
    const data = await res.json();
    if (data.ok) setStatus(`Connected to "${data.shop.name}" (${data.shop.domain})`, "ok");
    else setStatus(data.error || "Verification failed", "err");
  } catch (err) {
    setStatus(String(err), "err");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  persist();
  logList.innerHTML = "";
  logSection.hidden = false;
  progressFill.style.width = "0";
  migrateBtn.disabled = true;
  verifyBtn.disabled = true;
  setStatus("Starting migration…");

  try {
    const res = await fetch("/api/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readCreds()),
    });

    if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const data = await res.json();
      throw new Error(data.error || "Migration failed to start");
    }

    await consumeSSE(res);
  } catch (err) {
    setStatus(String(err), "err");
  } finally {
    migrateBtn.disabled = false;
    verifyBtn.disabled = false;
  }
});

// Parse a Server-Sent Events stream coming back from /api/migrate.
async function consumeSSE(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) handleEvent(chunk);
  }
}

function handleEvent(chunk) {
  const lines = chunk.split("\n");
  let event = "message";
  let dataStr = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return;
  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }

  if (event === "progress") {
    if (data.type === "fetched") setStatus(data.message);
    if (data.type === "item" && data.total) {
      progressFill.style.width = `${Math.round((data.index / data.total) * 100)}%`;
      const li = document.createElement("li");
      li.className = data.item?.status || "";
      li.textContent = `${data.index}/${data.total} — ${data.message}`;
      logList.appendChild(li);
      logList.scrollTop = logList.scrollHeight;
    }
  } else if (event === "summary") {
    progressFill.style.width = "100%";
    setStatus(
      `Done ✓ created ${data.created}, skipped ${data.skipped}, failed ${data.failed} (of ${data.totalFetched}).`,
      data.failed ? "err" : "ok",
    );
  } else if (event === "error") {
    setStatus(data.error || "Migration error", "err");
  }
}

// Register the service worker so the app is installable on phones & laptops.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
