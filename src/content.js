const SCRAPERS = {
  "sephora.com": scrapeSephora,
  "yesstyle.com": scrapeYesStyle,
  "oliveyoung.com": scrapeOliveYoung,
  "ulta.com": scrapeUlta,
};

// Pull structured product data from JSON-LD scripts embedded in the page.
// Most e-commerce sites include this for SEO — it's far more stable than CSS classes.
function extractJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product") return item;
        // Sometimes nested inside @graph
        if (item["@graph"]) {
          const found = item["@graph"].find((n) => n["@type"] === "Product");
          if (found) return found;
        }
      }
    } catch {}
  }
  return null;
}

// Pull from Open Graph / standard meta tags as a fallback
function extractMeta(property) {
  const el =
    document.querySelector(`meta[property="${property}"]`) ||
    document.querySelector(`meta[name="${property}"]`);
  return el?.getAttribute("content")?.trim() || null;
}

function extractIngredients(text) {
  if (!text) return null;
  const match = text.match(/ingredients?[:\s]+([\s\S]{10,})/i);
  return match ? match[1].trim() : null;
}

function scrapeSephora() {
  const product = {};
  const ld = extractJsonLd();

  product.name = ld?.name || document.querySelector('h1[data-comp="DisplayName"] span, h1')?.innerText?.trim() || null;
  product.brand = ld?.brand?.name || document.querySelector('[data-comp="BrandName"] a')?.innerText?.trim() || null;

  const offer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  product.price = offer?.price
    ? `${offer.priceCurrency || ""}${offer.price}`
    : document.querySelector('[data-comp="Price"] b, [aria-label*="price"]')?.innerText?.trim() || null;

  product.rating = ld?.aggregateRating?.ratingValue
    ? `${ld.aggregateRating.ratingValue} / 5 (${ld.aggregateRating.reviewCount || 0} reviews)`
    : null;

  const ldImageSephora = ld?.image;
  product.image = (Array.isArray(ldImageSephora) ? ldImageSephora[0] : ldImageSephora) || extractMeta("og:image");

  // Shade & size from DOM (not in JSON-LD)
  product.shade = document.querySelector('[data-comp="ColorName"], [class*="colorName"]')?.innerText?.trim() || null;
  product.size = document.querySelector('[data-comp="SizeName"], [class*="sizeContainer"] button[aria-pressed="true"]')?.innerText?.trim() || null;

  // Description
  const rawDesc = ld?.description || document.querySelector('[data-comp="ProductDescription"] p')?.innerText?.trim() || null;
  product.description = rawDesc;
  product.ingredients = extractIngredients(rawDesc) ||
    document.querySelector('[data-comp="Ingredients"], [id*="ingredients"]')?.innerText?.trim() || null;

  product.url = window.location.href;
  product.site = "sephora";
  return product;
}

function scrapeYesStyle() {
  const product = {};
  const ld = extractJsonLd();

  product.name = ld?.name || document.querySelector('h1')?.innerText?.trim() || extractMeta("og:title");
  product.brand = ld?.brand?.name || extractMeta("product:brand") || null;

  const offer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  product.price = offer?.price
    ? `${offer.priceCurrency || "USD"} ${offer.price}`
    : extractMeta("product:price:amount")
      ? `${extractMeta("product:price:currency") || "USD"} ${extractMeta("product:price:amount")}`
      : null;

  product.rating = ld?.aggregateRating?.ratingValue
    ? `${ld.aggregateRating.ratingValue} (${ld.aggregateRating.reviewCount || 0} reviews)`
    : null;

  const ldImageYS = ld?.image;
  product.image = (Array.isArray(ldImageYS) ? ldImageYS[0] : ldImageYS) || extractMeta("og:image");

  // Description — JSON-LD first, then the visible page text blocks
  const rawDesc = ld?.description ||
    document.querySelector('[id*="description"] p, [class*="description"] p')?.innerText?.trim() || null;
  product.description = rawDesc;

  // Ingredients — YesStyle uses an h4 accordion header; content is the next sibling div
  // Accordion is collapsed so innerText is empty — read textContent from the inner span instead
  const ingredientHeader = [...document.querySelectorAll("h4")]
    .find((el) => /ingredient/i.test(el.textContent));
  const ingredientContainer = ingredientHeader?.nextElementSibling;
  product.ingredients = ingredientContainer
    ? (ingredientContainer.querySelector("span")?.textContent?.trim() || ingredientContainer.textContent?.trim() || null)
    : extractIngredients(rawDesc);

  // Shade / size from DOM
  product.shade = document.querySelector('[class*="selectedColor"], [class*="colorSelected"]')?.innerText?.trim() || null;
  product.size = offer?.name || null;

  product.url = window.location.href;
  product.site = "yesstyle";
  return product;
}

function scrapeOliveYoung() {
  const product = {};
  const ld = extractJsonLd();

  product.name = ld?.name || document.querySelector('h1')?.innerText?.trim() || extractMeta("og:title");
  product.brand = ld?.brand?.name || null;

  const offer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  product.price = offer?.price ? `${offer.priceCurrency || "USD"} ${offer.price}` : null;

  product.rating = ld?.aggregateRating?.ratingValue
    ? `${ld.aggregateRating.ratingValue} (${ld.aggregateRating.reviewCount || 0} reviews)`
    : null;

  const ldImage = ld?.image;
  product.image = (Array.isArray(ldImage) ? ldImage[0] : ldImage) || extractMeta("og:image");

  product.description = ld?.description || null;

  // Ingredients — Olive Young uses a similar accordion pattern
  const ingredientHeader = [...document.querySelectorAll("h4, h3, strong, dt")]
    .find((el) => /ingredient/i.test(el.textContent));
  const ingredientContainer = ingredientHeader?.nextElementSibling;
  product.ingredients = ingredientContainer
    ? (ingredientContainer.querySelector("span, p")?.textContent?.trim() || ingredientContainer.textContent?.trim() || null)
    : extractIngredients(ld?.description);

  product.shade = null;
  product.size = offer?.name || null;
  product.url = window.location.href;
  product.site = "oliveyoung";
  return product;
}

function scrapeUlta() {
  const product = {};
  const ld = extractJsonLd();

  product.name = ld?.name || document.querySelector('h1')?.innerText?.trim() || extractMeta("og:title");

  // Ulta puts brand as a plain string, not an object
  product.brand = typeof ld?.brand === "string" ? ld.brand : ld?.brand?.name || null;

  const offer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  product.price = offer?.price ? `${offer.priceCurrency || "USD"} ${offer.price}` : null;

  product.rating = ld?.aggregateRating?.ratingValue
    ? `${ld.aggregateRating.ratingValue} / 5 (${ld.aggregateRating.reviewCount || 0} reviews)`
    : null;

  const ldImage = ld?.image;
  product.image = (Array.isArray(ldImage) ? ldImage[0] : ldImage) || extractMeta("og:image");

  // Ulta has color directly on the Product object
  product.shade = ld?.color || null;

  product.description = ld?.description || null;

  // Ingredients — look for a section heading
  const ingredientHeader = [...document.querySelectorAll("h2, h3, h4, button, dt")]
    .find((el) => /ingredient/i.test(el.textContent));
  const ingredientContainer = ingredientHeader?.nextElementSibling;
  product.ingredients = ingredientContainer
    ? (ingredientContainer.querySelector("span, p, div")?.textContent?.trim() || ingredientContainer.textContent?.trim() || null)
    : extractIngredients(ld?.description);

  product.size = null;
  product.url = window.location.href;
  product.site = "ulta";
  return product;
}

function getActiveScraper() {
  const host = window.location.hostname;
  for (const [domain, fn] of Object.entries(SCRAPERS)) {
    if (host.includes(domain)) return fn;
  }
  return null;
}

// Listen for popup requesting product data
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SCRAPE_PRODUCT") {
    const scraper = getActiveScraper();
    if (scraper) {
      sendResponse({ success: true, product: scraper() });
    } else {
      sendResponse({ success: false, error: "No scraper for this site." });
    }
  }
  return true;
});

// Wait for a key element to appear before auto-detecting, since React may not
// have rendered accordion content yet at document_idle
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

(async function autoDetect() {
  const scraper = getActiveScraper();
  if (!scraper) return;

  // Wait for accordion/product content to render for JS-heavy sites
  const host = window.location.hostname;
  if (host.includes("yesstyle.com") || host.includes("oliveyoung.com")) {
    await waitForElement("h4");
  } else if (host.includes("ulta.com")) {
    await waitForElement('script[type="application/ld+json"]');
  }

  const product = scraper();
  if (product.name) {
    chrome.runtime.sendMessage({ type: "PRODUCT_DETECTED", product });
  }
})();
