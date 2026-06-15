const DEFAULT_LISTS = ["Saved", "Skincare Routine", "Makeup Routine", "Didn't Work"];

// Track products detected on active tabs
const detectedProducts = new Map(); // tabId -> product

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PRODUCT_DETECTED" && sender.tab) {
    detectedProducts.set(sender.tab.id, msg.product);
    chrome.action.setBadgeText({ text: "!", tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#e75480", tabId: sender.tab.id });
  }

  if (msg.type === "GET_DETECTED_PRODUCT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const product = detectedProducts.get(tabs[0]?.id) || null;
      sendResponse({ product });
    });
    return true;
  }

  if (msg.type === "SAVE_PRODUCT") {
    saveProduct(msg.product, msg.listName, sendResponse);
    return true;
  }

  if (msg.type === "GET_LISTS") {
    getLists(sendResponse);
    return true;
  }

  if (msg.type === "GET_LIST_PRODUCTS") {
    chrome.storage.local.get("lists", (data) => {
      const lists = data.lists || {};
      sendResponse({ products: lists[msg.listName] || [] });
    });
    return true;
  }

  if (msg.type === "CREATE_LIST") {
    createList(msg.listName, sendResponse);
    return true;
  }

  if (msg.type === "DELETE_LIST") {
    chrome.storage.local.get("lists", (data) => {
      const lists = data.lists || {};
      delete lists[msg.listName];
      chrome.storage.local.set({ lists }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (msg.type === "DELETE_PRODUCT") {
    chrome.storage.local.get("lists", (data) => {
      const lists = data.lists || {};
      if (lists[msg.listName]) {
        lists[msg.listName] = lists[msg.listName].filter((p) => p.savedAt !== msg.savedAt);
      }
      chrome.storage.local.set({ lists }, () => sendResponse({ success: true }));
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedProducts.delete(tabId);
});

function getLists(sendResponse) {
  chrome.storage.local.get("lists", (data) => {
    // Ensure default lists always exist
    const lists = data.lists || {};
    let changed = false;
    for (const name of DEFAULT_LISTS) {
      if (!lists[name]) { lists[name] = []; changed = true; }
    }
    if (changed) {
      chrome.storage.local.set({ lists }, () => sendResponse({ lists }));
    } else {
      sendResponse({ lists });
    }
  });
}

function createList(name, sendResponse) {
  chrome.storage.local.get("lists", (data) => {
    const lists = data.lists || {};
    if (!lists[name]) lists[name] = [];
    chrome.storage.local.set({ lists }, () => sendResponse({ success: true }));
  });
}

function saveProduct(product, listName, sendResponse) {
  chrome.storage.local.get("lists", (data) => {
    const lists = data.lists || {};
    if (!lists[listName]) lists[listName] = [];
    product.savedAt = Date.now();
    // Avoid exact duplicate URLs in the same list
    const alreadyExists = product.url && lists[listName].some((p) => p.url && p.url === product.url);
    if (!alreadyExists) lists[listName].unshift(product);
    chrome.storage.local.set({ lists }, () => sendResponse({ success: true, alreadyExists }));
  });
}
