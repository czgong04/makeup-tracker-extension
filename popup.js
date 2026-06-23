const BACKEND = "https://makeup-tracker-backend-production.up.railway.app";

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((t) => {
      t.classList.remove("active");
      t.classList.add("hidden");
    });
    btn.classList.add("active");
    const tab = document.getElementById(`tab-${btn.dataset.tab}`);
    tab.classList.remove("hidden");
    tab.classList.add("active");
    if (btn.dataset.tab === "lists") loadListsTab();
    if (btn.dataset.tab !== "manual") resetManualForm();
  });
});

// ── On open: load lists into selects + auto-detect ────────────────────────
chrome.runtime.sendMessage({ type: "GET_LISTS" }, (res) => {
  populateListSelect(document.getElementById("list-select"), res.lists);
  populateListSelect(document.getElementById("manual-list-select"), res.lists);
});

chrome.runtime.sendMessage({ type: "GET_DETECTED_PRODUCT" }, (res) => {
  if (res?.product?.name) renderProduct(res.product);
});

// ── Scan page ─────────────────────────────────────────────────────────────
document.getElementById("btn-scan").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: "SCRAPE_PRODUCT" }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        document.getElementById("no-product").querySelector("p").textContent =
          "Could not read a product on this page.";
        return;
      }
      renderProduct(res.product);
    });
  });
});

// ── Manual entry ──────────────────────────────────────────────────────────
document.getElementById("btn-save-manual").addEventListener("click", () => {
  const name = document.getElementById("manual-name").value.trim();
  const errorEl = document.getElementById("manual-error");
  if (!name) {
    errorEl.classList.remove("hidden");
    return;
  }
  errorEl.classList.add("hidden");

  const product = {
    name,
    brand: document.getElementById("manual-brand").value.trim() || null,
    site: document.getElementById("manual-site").value.trim() || "manual",
    price: document.getElementById("manual-price").value.trim() || null,
    shade: document.getElementById("manual-shade").value.trim() || null,
    description: document.getElementById("manual-description").value.trim() || null,
    ingredients: document.getElementById("manual-ingredients").value.trim() || null,
    url: document.getElementById("manual-url").value.trim() || null,
    image: null,
    rating: null,
  };

  const saveBtn = document.getElementById("btn-save-manual");
  const listName = document.getElementById("manual-list-select").value || "Saved";
  const isEditing = !!saveBtn.dataset.editingSavedAt;

  const save = () => {
    chrome.runtime.sendMessage({ type: "SAVE_PRODUCT", product, listName }, () => {
      const confirmEl = document.getElementById("manual-save-confirm");
      confirmEl.classList.remove("hidden");
      resetManualForm();
      setTimeout(() => confirmEl.classList.add("hidden"), 2000);
    });
  };

  if (isEditing) {
    const oldSavedAt = Number(saveBtn.dataset.editingSavedAt);
    const oldListName = saveBtn.dataset.editingList;
    chrome.runtime.sendMessage({
      type: "DELETE_PRODUCT",
      listName: oldListName,
      savedAt: oldSavedAt,
    }, save);
  } else {
    save();
  }
});

// ── Search ────────────────────────────────────────────────────────────────
document.getElementById("btn-search").addEventListener("click", runSearch);
document.getElementById("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

async function runSearch() {
  const query = document.getElementById("search-input").value.trim();
  if (!query) return;

  const resultsEl = document.getElementById("search-results");
  const loadingEl = document.getElementById("search-loading");
  const errorEl = document.getElementById("search-error");
  const listEl = document.getElementById("search-list");

  resultsEl.classList.remove("hidden");
  loadingEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
  listEl.innerHTML = "";

  // Hide product card while showing search results
  document.getElementById("product-card").classList.add("hidden");
  document.getElementById("no-product").classList.add("hidden");

  try {
    const res = await fetch(`${BACKEND}/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    loadingEl.classList.add("hidden");

    if (data.error) {
      errorEl.textContent = `Search error: ${data.error}`;
      errorEl.classList.remove("hidden");
      return;
    }

    if (!data.products?.length) {
      errorEl.textContent = "No results found.";
      errorEl.classList.remove("hidden");
      return;
    }

    data.products.forEach((product) => {
      const li = document.createElement("li");
      li.className = "search-item";
      li.innerHTML = `
        ${product.image
          ? `<img src="${product.image}" alt="" />`
          : `<div class="search-item-placeholder"></div>`}
        <div class="search-item-info">
          <div class="search-item-name">${product.name || "Unknown Product"}</div>
          <div class="search-item-meta">
            <span class="search-item-site">${product.site || ""}</span>
            ${product.price ? `· ${product.price}` : ""}
          </div>
        </div>
      `;
      li.addEventListener("click", async () => {
        resultsEl.classList.add("hidden");
        document.getElementById("search-input").value = "";
        document.getElementById("no-product").classList.add("hidden");

        // Show a loading state in the card area
        const card = document.getElementById("product-card");
        card.classList.remove("hidden");
        document.getElementById("product-name").textContent = "Loading...";
        document.getElementById("product-brand").textContent = "";
        document.getElementById("product-site").textContent = product.site || "";
        document.getElementById("product-price").textContent = "";
        document.getElementById("product-rating").textContent = "";
        document.getElementById("product-image").classList.add("hidden");
        ["product-shade-row","product-size-row","product-desc-row","product-ingredients-row"]
          .forEach((id) => document.getElementById(id).classList.add("hidden"));

        try {
          const scrapeRes = await fetch(`${BACKEND}/scrape?url=${encodeURIComponent(product.url)}`);
          const scrapeData = await scrapeRes.json();
          if (scrapeData.error) {
            document.getElementById("product-name").textContent = "Could not load product details.";
          } else {
            renderProduct(scrapeData.product);
          }
        } catch {
          document.getElementById("product-name").textContent = "Could not reach server.";
        }
      });
      listEl.appendChild(li);
    });
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.textContent = "Could not reach search server. Is it running?";
    errorEl.classList.remove("hidden");
  }
}

// ── Save ──────────────────────────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", () => {
  const product = currentProduct();
  const listName = document.getElementById("list-select").value;
  if (!product || !listName) return;

  chrome.runtime.sendMessage({ type: "SAVE_PRODUCT", product, listName }, (res) => {
    const confirmEl = document.getElementById("save-confirm");
    const dupEl = document.getElementById("save-duplicate");
    if (res.alreadyExists) {
      dupEl.classList.remove("hidden");
      setTimeout(() => dupEl.classList.add("hidden"), 2000);
    } else {
      confirmEl.classList.remove("hidden");
      setTimeout(() => confirmEl.classList.add("hidden"), 2000);
    }
  });
});

// ── Render product card ───────────────────────────────────────────────────
function renderProduct(product) {
  document.getElementById("no-product").classList.add("hidden");
  document.getElementById("search-results").classList.add("hidden");
  const card = document.getElementById("product-card");
  card.classList.remove("hidden");

  document.getElementById("product-site").textContent = product.site || "";
  document.getElementById("product-brand").textContent = product.brand || "";
  document.getElementById("product-name").textContent = product.name || "Unknown Product";
  document.getElementById("product-price").textContent = product.price || "";
  document.getElementById("product-rating").textContent = product.rating || "";
  document.getElementById("btn-link").href = product.url || "#";

  const imgEl = document.getElementById("product-image");
  if (product.image) {
    imgEl.src = product.image;
    imgEl.classList.remove("hidden");
  } else {
    imgEl.classList.add("hidden");
  }

  setMetaRow("product-shade-row", "product-shade", product.shade);
  setMetaRow("product-size-row", "product-size", product.size);
  setMetaRow("product-desc-row", "product-description", product.description);
  setIngredientsRow(product.ingredients);

  // Check ingredient conflicts against saved lists
  const conflictEl = document.getElementById("conflict-warnings");
  conflictEl.innerHTML = "";
  conflictEl.classList.add("hidden");
  if (product.ingredients) {
    chrome.runtime.sendMessage({ type: "GET_LISTS" }, (res) => {
      const lists = res?.lists || {};

      // Conflicts with saved routine products
      const warnings = checkConflictsAgainstLists(product.ingredients, lists);
      warnings.forEach(({ productName, listName, conflicts }) => {
        conflictEl.classList.remove("hidden");
        conflicts.forEach((reason) => {
          conflictEl.insertAdjacentHTML("beforeend", `
            <div class="conflict-banner">
              <div class="conflict-title">⚠ Conflicts with ${productName} <span style="font-weight:400;color:#999">(${listName})</span></div>
              <div class="conflict-reason">${reason}</div>
            </div>
          `);
        });
      });

      // Similarity warnings from "Didn't Work" list
      const { similar, recurringCombos } = checkSimilarityAgainstDidntWork(product.ingredients, lists);

      similar.forEach(({ productName, shared }) => {
        conflictEl.classList.remove("hidden");
        conflictEl.insertAdjacentHTML("beforeend", `
          <div class="conflict-banner conflict-dnw">
            <div class="conflict-title">🚫 Similar to ${productName} (Didn't Work)</div>
            <div class="conflict-reason">Shares ${shared.length} key ingredients: ${shared.join(", ")}. This product may not work for your skin.</div>
          </div>
        `);
      });

      recurringCombos.forEach((combo) => {
        conflictEl.classList.remove("hidden");
        conflictEl.insertAdjacentHTML("beforeend", `
          <div class="conflict-banner conflict-dnw">
            <div class="conflict-title">🚫 Recurring ingredient pattern from your Didn't Work list</div>
            <div class="conflict-reason">The combination ${combo.join(" + ")} has appeared in multiple products that didn't work for you.</div>
          </div>
        `);
      });
    });
  }

  card.dataset.product = JSON.stringify(product);
}

function setMetaRow(rowId, fieldId, value) {
  const row = document.getElementById(rowId);
  if (value) {
    document.getElementById(fieldId).textContent = value;
    row.classList.remove("hidden");
  } else {
    row.classList.add("hidden");
  }
}

function setIngredientsRow(ingredients) {
  const row = document.getElementById("product-ingredients-row");
  const textEl = document.getElementById("product-ingredients");
  const btn = document.getElementById("btn-expand-ingredients");

  if (!ingredients) { row.classList.add("hidden"); return; }

  row.classList.remove("hidden");
  textEl.textContent = ingredients;
  textEl.classList.add("collapsed");
  btn.textContent = "Show all";
  btn.classList.add("hidden");

  setTimeout(() => {
    if (textEl.scrollHeight > textEl.clientHeight) btn.classList.remove("hidden");
  }, 50);

  btn.onclick = () => {
    const isCollapsed = textEl.classList.contains("collapsed");
    textEl.classList.toggle("collapsed", !isCollapsed);
    btn.textContent = isCollapsed ? "Show less" : "Show all";
  };
}

function currentProduct() {
  const card = document.getElementById("product-card");
  try { return JSON.parse(card.dataset.product); } catch { return null; }
}

// ── Lists tab ─────────────────────────────────────────────────────────────
function populateListSelect(selectEl, lists) {
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  Object.keys(lists).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
  if (prev && selectEl.querySelector(`option[value="${prev}"]`)) selectEl.value = prev;
}

function loadListsTab() {
  // Always return to the browser view, not a previously open product card
  document.getElementById("list-product-card").classList.add("hidden");
  document.getElementById("list-browser").classList.remove("hidden");

  chrome.runtime.sendMessage({ type: "GET_LISTS" }, (res) => {
    const viewSelect = document.getElementById("list-view-select");
    populateListSelect(viewSelect, res.lists);
    populateListSelect(document.getElementById("list-select"), res.lists);
    renderListProducts(viewSelect.value, res.lists);
    viewSelect.onchange = () => renderListProducts(viewSelect.value, res.lists);
  });
}

function renderListProducts(listName, lists) {
  const ul = document.getElementById("list-products");
  const emptyEl = document.getElementById("list-empty");
  const products = lists[listName] || [];
  ul.innerHTML = "";

  if (!products.length) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  products.forEach((p) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div class="li-top">
        ${p.image
          ? `<img class="li-img" src="${p.image}" alt="" />`
          : `<div class="li-img-placeholder"></div>`}
        <div class="li-body">
          <div class="li-site">${p.site || ""}</div>
          ${p.brand ? `<div class="li-brand">${p.brand}</div>` : ""}
          <div class="li-name">${p.name || "Unknown"}</div>
          <div class="li-meta">
            ${p.price ? `<span>${p.price}</span>` : ""}
            ${p.shade ? `<span>${p.shade}</span>` : ""}
            ${p.rating ? `<span>${p.rating}</span>` : ""}
          </div>
        </div>
      </div>
      <button class="li-delete" data-saved-at="${p.savedAt}" title="Remove">×</button>
    `;
    // Click on the item (but not the delete button) opens the detail card
    li.addEventListener("click", (e) => {
      if (e.target.closest(".li-delete")) return;
      renderListCard(p);
    });
    li.querySelector(".li-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage(
        { type: "DELETE_PRODUCT", listName, savedAt: p.savedAt },
        () => loadListsTab()
      );
    });
    ul.appendChild(li);
  });
}

function renderListCard(product) {
  document.getElementById("list-browser").classList.add("hidden");
  const card = document.getElementById("list-product-card");
  card.classList.remove("hidden");

  document.getElementById("lc-site").textContent = product.site || "";
  document.getElementById("lc-brand").textContent = product.brand || "";
  document.getElementById("lc-name").textContent = product.name || "Unknown Product";
  document.getElementById("lc-price").textContent = product.price || "";
  document.getElementById("lc-rating").textContent = product.rating || "";

  const imgEl = document.getElementById("lc-image");
  if (product.image) {
    imgEl.src = product.image;
    imgEl.classList.remove("hidden");
  } else {
    imgEl.classList.add("hidden");
  }

  setMetaRowById("lc-shade-row", "lc-shade", product.shade);
  setMetaRowById("lc-size-row", "lc-size", product.size);
  setMetaRowById("lc-desc-row", "lc-description", product.description);

  // Ingredients
  const lcRow = document.getElementById("lc-ingredients-row");
  const lcText = document.getElementById("lc-ingredients");
  const lcBtn = document.getElementById("lc-btn-expand");
  if (product.ingredients) {
    lcRow.classList.remove("hidden");
    lcText.textContent = product.ingredients;
    lcText.classList.add("collapsed");
    lcBtn.classList.add("hidden");
    setTimeout(() => {
      if (lcText.scrollHeight > lcText.clientHeight) lcBtn.classList.remove("hidden");
    }, 50);
    lcBtn.onclick = () => {
      const isCollapsed = lcText.classList.contains("collapsed");
      lcText.classList.toggle("collapsed", !isCollapsed);
      lcBtn.textContent = isCollapsed ? "Show less" : "Show all";
    };
  } else {
    lcRow.classList.add("hidden");
  }

  // URL link
  const linkEl = document.getElementById("lc-link");
  if (product.url) {
    linkEl.href = product.url;
    linkEl.classList.remove("hidden");
  } else {
    linkEl.classList.add("hidden");
  }

  // Edit button — only for manually added products
  const editBtn = document.getElementById("lc-btn-edit");
  if (product.site === "manual" || !product.url) {
    editBtn.classList.remove("hidden");
    editBtn.onclick = () => openEditForm(product);
  } else {
    editBtn.classList.add("hidden");
  }

  // Conflict warnings
  const conflictEl = document.getElementById("lc-conflicts");
  conflictEl.innerHTML = "";
  conflictEl.classList.add("hidden");
  if (product.ingredients) {
    chrome.runtime.sendMessage({ type: "GET_LISTS" }, (res) => {
      const lists = res?.lists || {};
      const warnings = checkConflictsAgainstLists(product.ingredients, lists);
      warnings.forEach(({ productName, listName, conflicts }) => {
        conflictEl.classList.remove("hidden");
        conflicts.forEach((reason) => {
          conflictEl.insertAdjacentHTML("beforeend", `
            <div class="conflict-banner">
              <div class="conflict-title">⚠ Conflicts with ${productName} <span style="font-weight:400;color:#999">(${listName})</span></div>
              <div class="conflict-reason">${reason}</div>
            </div>
          `);
        });
      });
      const { similar, recurringCombos } = checkSimilarityAgainstDidntWork(product.ingredients, lists);
      similar.forEach(({ productName, shared }) => {
        conflictEl.classList.remove("hidden");
        conflictEl.insertAdjacentHTML("beforeend", `
          <div class="conflict-banner conflict-dnw">
            <div class="conflict-title">🚫 Similar to ${productName} (Didn't Work)</div>
            <div class="conflict-reason">Shares ${shared.length} key ingredients: ${shared.join(", ")}.</div>
          </div>
        `);
      });
      recurringCombos.forEach((combo) => {
        conflictEl.classList.remove("hidden");
        conflictEl.insertAdjacentHTML("beforeend", `
          <div class="conflict-banner conflict-dnw">
            <div class="conflict-title">🚫 Recurring ingredient pattern from your Didn't Work list</div>
            <div class="conflict-reason">The combination ${combo.join(" + ")} has appeared in multiple products that didn't work for you.</div>
          </div>
        `);
      });
    });
  }
}

function setMetaRowById(rowId, fieldId, value) {
  const row = document.getElementById(rowId);
  if (value) {
    document.getElementById(fieldId).textContent = value;
    row.classList.remove("hidden");
  } else {
    row.classList.add("hidden");
  }
}

document.getElementById("btn-back-to-list").addEventListener("click", () => {
  document.getElementById("list-product-card").classList.add("hidden");
  document.getElementById("list-browser").classList.remove("hidden");
});

// ── Edit manually added product ───────────────────────────────────────────
function openEditForm(product) {
  // Switch to the Add tab
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => {
    t.classList.remove("active");
    t.classList.add("hidden");
  });
  document.querySelector('.tab-btn[data-tab="manual"]').classList.add("active");
  const manualTab = document.getElementById("tab-manual");
  manualTab.classList.remove("hidden");
  manualTab.classList.add("active");

  // Pre-fill form
  document.getElementById("manual-name").value = product.name || "";
  document.getElementById("manual-brand").value = product.brand || "";
  document.getElementById("manual-site").value = product.site === "manual" ? "" : product.site || "";
  document.getElementById("manual-price").value = product.price || "";
  document.getElementById("manual-shade").value = product.shade || "";
  document.getElementById("manual-description").value = product.description || "";
  document.getElementById("manual-ingredients").value = product.ingredients || "";
  document.getElementById("manual-url").value = product.url || "";

  // Find which list this product is in and pre-select it
  chrome.runtime.sendMessage({ type: "GET_LISTS" }, (res) => {
    const lists = res?.lists || {};
    const listName = Object.keys(lists).find((l) =>
      lists[l].some((p) => p.savedAt === product.savedAt)
    ) || "Saved";
    const select = document.getElementById("manual-list-select");
    populateListSelect(select, lists);
    select.value = listName;

    // Change save button to update mode
    const saveBtn = document.getElementById("btn-save-manual");
    saveBtn.textContent = "Update";
    saveBtn.dataset.editingSavedAt = product.savedAt;
    saveBtn.dataset.editingList = listName;
  });
}

// Reset the manual form back to "add" mode
function resetManualForm() {
  ["manual-name","manual-brand","manual-site","manual-price","manual-shade",
   "manual-description","manual-ingredients","manual-url"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  const saveBtn = document.getElementById("btn-save-manual");
  saveBtn.textContent = "Save";
  delete saveBtn.dataset.editingSavedAt;
  delete saveBtn.dataset.editingList;
}

// ── New list form ─────────────────────────────────────────────────────────
document.getElementById("btn-new-list").addEventListener("click", () => {
  const form = document.getElementById("new-list-form");
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) document.getElementById("new-list-input").focus();
});

document.getElementById("btn-create-list").addEventListener("click", createNewList);
document.getElementById("new-list-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") createNewList();
});

function createNewList() {
  const input = document.getElementById("new-list-input");
  const name = input.value.trim();
  if (!name) return;
  chrome.runtime.sendMessage({ type: "CREATE_LIST", listName: name }, () => {
    input.value = "";
    document.getElementById("new-list-form").classList.add("hidden");
    loadListsTab();
  });
}
