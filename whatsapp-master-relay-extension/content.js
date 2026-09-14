/**
 * Eco Green Solar - WhatsApp Master Relay
 * Content Script (Injected into web.whatsapp.com)
 */

console.log("[MasterRelay Content] Injected into WhatsApp Web");

let isRunning = false;
let checkInterval = null;

// Listen for direct trigger from background script
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "TRIGGER_SEND_NOW") {
    isRunning = false;
    clearInterval(checkInterval);
    checkForAutoSend(true);
    sendResponse({ ok: true });
    return true;
  }
});

// Poll DOM when page URL contains "send?phone=" or force triggered
function checkForAutoSend(force = false) {
  if (isRunning) return;
  if (!force && !window.location.href.includes("send?phone=") && !window.location.href.includes("send/?phone=")) {
    return;
  }

  isRunning = true;
  let attempts = 0;
  const maxAttempts = 35; // ~28 seconds

  checkInterval = setInterval(() => {
    attempts++;

    // 1. Check for invalid number error modal
    const invalidDialog = document.querySelector('div[data-animate-modal-popup="true"]') ||
                          document.querySelector('div[role="dialog"]');
    if (invalidDialog) {
      const dialogText = invalidDialog.innerText || "";
      if (dialogText.toLowerCase().includes("invalid") || dialogText.toLowerCase().includes("not on whatsapp") || dialogText.toLowerCase().includes("अमान्य")) {
        console.warn("[MasterRelay Content] Invalid number dialog detected.");
        clearInterval(checkInterval);
        const okBtn = invalidDialog.querySelector("button");
        if (okBtn) okBtn.click();

        chrome.runtime.sendMessage({
          type: "RELAY_MESSAGE_FAILED",
          error: "Phone number is invalid or not registered on WhatsApp"
        });
        isRunning = false;
        return;
      }
    }

    // 2. Find Send Button in active chat footer
    const sendButton = findSendButton();

    if (sendButton) {
      console.log("[MasterRelay Content] Send button found! Preparing human click...");
      clearInterval(checkInterval);

      // Human delay (1.2 to 1.8 seconds)
      setTimeout(() => {
        try {
          sendButton.click();
          console.log("[MasterRelay Content] Send button clicked successfully!");

          // Wait for message bubble animation
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: "RELAY_MESSAGE_SENT" });
            isRunning = false;
          }, 1500);
        } catch (clickErr) {
          console.error("[MasterRelay Content] Click error:", clickErr);
          // Fallback: Dispatch Enter key
          triggerEnterKey();
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: "RELAY_MESSAGE_SENT" });
            isRunning = false;
          }, 1500);
        }
      }, 1400);

      return;
    }

    if (attempts >= maxAttempts) {
      clearInterval(checkInterval);
      console.warn("[MasterRelay Content] Timeout waiting for send button.");
      chrome.runtime.sendMessage({
        type: "RELAY_MESSAGE_FAILED",
        error: "Timeout waiting for WhatsApp chat to load message box"
      });
      isRunning = false;
    }
  }, 800);
}

function findSendButton() {
  // Method A: span[data-icon="send"] parent button
  const iconSend = document.querySelector('span[data-icon="send"]');
  if (iconSend) {
    const btn = iconSend.closest("button");
    if (btn && !btn.disabled) return btn;
  }

  // Method B: aria-label
  const ariaSend = document.querySelector('button[aria-label="Send"], button[aria-label="भेजें"]');
  if (ariaSend && !ariaSend.disabled) return ariaSend;

  // Method C: data-tab="11" (standard send button in WhatsApp Web)
  const tabSend = document.querySelector('button[data-tab="11"]');
  if (tabSend && !tabSend.disabled) return tabSend;

  return null;
}

function triggerEnterKey() {
  const inputBox = document.querySelector('footer div[contenteditable="true"]') ||
                    document.querySelector('div[data-tab="10"]');
  if (inputBox) {
    inputBox.focus();
    inputBox.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
  }
}

// Observe URL changes (SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    if (currentUrl.includes("send?phone=") || currentUrl.includes("send/?phone=")) {
      console.log("[MasterRelay Content] Detected send URL navigation:", currentUrl);
      isRunning = false;
      checkForAutoSend();
    }
  }
}).observe(document, { subtree: true, childList: true });

// Initial check
checkForAutoSend();
