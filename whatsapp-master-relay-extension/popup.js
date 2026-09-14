document.addEventListener("DOMContentLoaded", async () => {
  const toggleRelay = document.getElementById("toggleRelay");
  const serverUrlInput = document.getElementById("serverUrl");
  const sentCountEl = document.getElementById("sentCount");
  const lastSentEl = document.getElementById("lastSent");
  const statusText = document.getElementById("statusText");
  const dot = document.querySelector(".dot");
  const btnSync = document.getElementById("btnSync");
  const btnOpenWA = document.getElementById("btnOpenWA");

  // Load storage state
  const data = await chrome.storage.local.get(["serverUrl", "relayActive", "sentCount", "lastSentTime"]);

  if (data.serverUrl) serverUrlInput.value = data.serverUrl;
  sentCountEl.textContent = data.sentCount || 0;
  lastSentEl.textContent = data.lastSentTime || "--";

  const isActive = data.relayActive !== false;
  toggleRelay.checked = isActive;
  updateStatusDisplay(isActive);

  // Toggle switch
  toggleRelay.addEventListener("change", async () => {
    const active = toggleRelay.checked;
    await chrome.storage.local.set({ relayActive: active });
    updateStatusDisplay(active);
  });

  // Server URL change
  serverUrlInput.addEventListener("change", async () => {
    const cleanUrl = serverUrlInput.value.trim().replace(/\/$/, "");
    await chrome.storage.local.set({ serverUrl: cleanUrl });
  });

  // Force check queue
  btnSync.addEventListener("click", async () => {
    btnSync.textContent = "Checking...";
    btnSync.disabled = true;
    try {
      const serverUrl = serverUrlInput.value.trim().replace(/\/$/, "");
      const res = await fetch(`${serverUrl}/api/whatsapp/relay/pending`);
      const resData = await res.json();
      if (resData.success) {
        alert(`Queue Checked: ${resData.pending?.length || 0} pending messages in server queue.`);
      }
    } catch (e) {
      alert("Error checking server queue: " + e.message);
    } finally {
      btnSync.textContent = "⚡ Check & Dispatch Queue Now";
      btnSync.disabled = false;
    }
  });

  // Send Test Message
  const btnSendTest = document.getElementById("btnSendTest");
  const testPhoneInput = document.getElementById("testPhone");
  const testMsgInput = document.getElementById("testMsg");

  btnSendTest.addEventListener("click", async () => {
    const phone = testPhoneInput.value.trim();
    const message = testMsgInput.value.trim();
    if (!phone) {
      alert("Please enter a mobile number to test!");
      return;
    }
    btnSendTest.disabled = true;
    btnSendTest.textContent = "Adding to queue...";
    try {
      const serverUrl = serverUrlInput.value.trim().replace(/\/$/, "");
      const res = await fetch(`${serverUrl}/api/whatsapp/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message, recipient_name: "Test User" })
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Test message queued! The relay will pick it up and send it via WhatsApp Web in a few seconds.");
      } else {
        alert("Server Error: " + (data.error || "Could not enqueue"));
      }
    } catch (e) {
      alert("Network Error: " + e.message);
    } finally {
      btnSendTest.disabled = false;
      btnSendTest.textContent = "🚀 Send Test via Relay";
    }
  });

  // Open WhatsApp Web
  btnOpenWA.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://web.whatsapp.com" });
  });

  function updateStatusDisplay(active) {
    if (active) {
      statusText.textContent = "Relay Active (Listening)";
      statusText.style.color = "#059669";
      dot.style.background = "#22c55e";
    } else {
      statusText.textContent = "Relay Paused";
      statusText.style.color = "#64748b";
      dot.style.background = "#94a3b8";
    }
  }
});
