/**
 * Eco Green Solar - WhatsApp Master Relay
 * Background Service Worker (Manifest V3)
 */

const DEFAULT_SERVER_URL = "https://eco-green-complain.vprotech.online";
let isProcessing = false;
let currentJob = null;
let jobTimeoutTimer = null;

// Initialize configuration on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["serverUrl", "relayActive", "sentCount"]);
  if (!data.serverUrl) {
    await chrome.storage.local.set({ serverUrl: DEFAULT_SERVER_URL });
  }
  if (data.relayActive === undefined) {
    await chrome.storage.local.set({ relayActive: true });
  }
  if (!data.sentCount) {
    await chrome.storage.local.set({ sentCount: 0 });
  }
  console.log("[MasterRelay] Service Worker Installed & Configured.");
});

// Periodic polling alarm (every 15 seconds as backup) + fast interval while active
chrome.alarms.create("pollPendingQueue", { periodInMinutes: 0.2 }); // Every 12 seconds
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pollPendingQueue") {
    checkQueue();
  }
});

// Fast poll interval
setInterval(checkQueue, 4000);

async function checkQueue() {
  if (isProcessing) return;

  try {
    const config = await chrome.storage.local.get(["serverUrl", "relayActive"]);
    if (config.relayActive === false) return;

    const serverUrl = (config.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, "");
    const res = await fetch(`${serverUrl}/api/whatsapp/relay/pending`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.success || !data.pending || data.pending.length === 0) {
      return;
    }

    // Next job to dispatch
    const nextJob = data.pending[0];
    await dispatchJob(nextJob, serverUrl);
  } catch (err) {
    console.debug("[MasterRelay] Heartbeat / poll check:", err.message);
  }
}

async function dispatchJob(job, serverUrl) {
  isProcessing = true;
  currentJob = { ...job, serverUrl };
  console.log(`[MasterRelay] Dispatching Job #${job.id} to ${job.phone}...`);

  try {
    // 1. Find or open WhatsApp Web tab
    const waTabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
    let targetTab = null;

    if (waTabs.length > 0) {
      targetTab = waTabs[0];
    } else {
      console.log("[MasterRelay] Opening WhatsApp Web pinned tab...");
      targetTab = await chrome.tabs.create({
        url: "https://web.whatsapp.com",
        active: false,
        pinned: true
      });
      // Allow initial login check
      await new Promise((r) => setTimeout(r, 6000));
    }

    // 2. Navigate tab to direct send URL
    const sendUrl = `https://web.whatsapp.com/send?phone=${job.phone}&text=${encodeURIComponent(job.message)}`;
    await chrome.tabs.update(targetTab.id, { url: sendUrl });

    // 3. Set safety timeout (35 seconds max for slow connections)
    clearTimeout(jobTimeoutTimer);
    jobTimeoutTimer = setTimeout(async () => {
      if (isProcessing && currentJob?.id === job.id) {
        console.warn(`[MasterRelay] Timeout waiting for WhatsApp Web to send #${job.id}`);
        await updateJobStatus(job.id, "failed", "WhatsApp Web timed out or number not on WhatsApp", serverUrl);
        isProcessing = false;
        currentJob = null;
      }
    }, 35000);

  } catch (err) {
    console.error("[MasterRelay] Failed to start dispatch:", err);
    await updateJobStatus(job.id, "failed", err.message, serverUrl);
    isProcessing = false;
    currentJob = null;
  }
}

// Listen to Content Script completion signals
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "RELAY_MESSAGE_SENT") {
    clearTimeout(jobTimeoutTimer);
    handleSendSuccess(request);
    sendResponse({ received: true });
    return true;
  }

  if (request.type === "RELAY_MESSAGE_FAILED") {
    clearTimeout(jobTimeoutTimer);
    handleSendFailure(request);
    sendResponse({ received: true });
    return true;
  }

  if (request.type === "CHECK_JOB_ACTIVE") {
    sendResponse({ activeJob: currentJob });
    return true;
  }
});

async function handleSendSuccess(info) {
  if (!currentJob) return;
  console.log(`[MasterRelay] SUCCESS: Message delivered for Job #${currentJob.id}`);

  const serverUrl = currentJob.serverUrl;
  const jobId = currentJob.id;

  await updateJobStatus(jobId, "sent", null, serverUrl);

  // Update local stats
  const { sentCount = 0 } = await chrome.storage.local.get("sentCount");
  await chrome.storage.local.set({
    sentCount: sentCount + 1,
    lastSentTime: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  });

  // Human breathing delay before next message (2.5 seconds)
  setTimeout(() => {
    isProcessing = false;
    currentJob = null;
    checkQueue();
  }, 2500);
}

async function handleSendFailure(info) {
  if (!currentJob) return;
  console.warn(`[MasterRelay] FAILED for Job #${currentJob.id}:`, info.error);

  const serverUrl = currentJob.serverUrl;
  const jobId = currentJob.id;

  await updateJobStatus(jobId, "failed", info.error || "Unknown Error", serverUrl);

  setTimeout(() => {
    isProcessing = false;
    currentJob = null;
    checkQueue();
  }, 2000);
}

async function updateJobStatus(id, status, error, serverUrl) {
  try {
    await fetch(`${serverUrl}/api/whatsapp/relay/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, error })
    });
  } catch (e) {
    console.warn("[MasterRelay] Status update error:", e.message);
  }
}
