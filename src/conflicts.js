// Each rule defines two ingredient groups that conflict, and a reason why.
// If a product contains any ingredient from groupA AND any from groupB, it's a conflict.
const CONFLICT_RULES = [
  {
    groupA: ["retinol", "retinoid", "tretinoin", "retin-a", "retinyl palmitate", "retinaldehyde", "adapalene", "tazarotene"],
    groupB: ["glycolic acid", "lactic acid", "mandelic acid", "citric acid", "aha", "alpha hydroxy", "salicylic acid", "bha", "beta hydroxy"],
    reason: "Retinoids + AHA/BHA can cause severe irritation and over-exfoliation.",
  },
  {
    groupA: ["retinol", "retinoid", "tretinoin", "retin-a", "retinyl palmitate", "retinaldehyde", "adapalene"],
    groupB: ["benzoyl peroxide"],
    reason: "Benzoyl peroxide oxidizes and deactivates retinoids, reducing their effectiveness.",
  },
  {
    groupA: ["retinol", "retinoid", "tretinoin", "retin-a", "retinaldehyde", "adapalene"],
    groupB: ["vitamin c", "ascorbic acid", "l-ascorbic acid", "ascorbyl", "sodium ascorbyl phosphate"],
    reason: "Retinoids + Vitamin C can destabilize each other and cause irritation.",
  },
  {
    groupA: ["niacinamide", "nicotinamide"],
    groupB: ["vitamin c", "ascorbic acid", "l-ascorbic acid", "ascorbyl glucoside", "sodium ascorbyl phosphate"],
    reason: "Niacinamide + Vitamin C can reduce the efficacy of both ingredients.",
  },
  {
    groupA: ["copper peptide", "copper tripeptide", "ghk-cu"],
    groupB: ["vitamin c", "ascorbic acid", "l-ascorbic acid"],
    reason: "Copper peptides + Vitamin C can oxidize and cancel each other out.",
  },
  {
    groupA: ["copper peptide", "copper tripeptide", "ghk-cu"],
    groupB: ["glycolic acid", "lactic acid", "aha", "alpha hydroxy", "salicylic acid", "bha"],
    reason: "Acids break down copper peptides, reducing their effectiveness.",
  },
  {
    groupA: ["benzoyl peroxide"],
    groupB: ["vitamin c", "ascorbic acid", "l-ascorbic acid"],
    reason: "Benzoyl peroxide oxidizes Vitamin C, rendering it ineffective.",
  },
  {
    groupA: ["salicylic acid", "bha", "beta hydroxy"],
    groupB: ["glycolic acid", "lactic acid", "aha", "alpha hydroxy", "mandelic acid"],
    reason: "Combining multiple exfoliating acids increases irritation risk.",
  },
  {
    groupA: ["spf", "sunscreen", "zinc oxide", "titanium dioxide", "avobenzone", "octinoxate"],
    groupB: ["benzoyl peroxide"],
    reason: "Benzoyl peroxide can degrade certain sunscreen actives.",
  },
  {
    groupA: ["peptide", "palmitoyl", "matrixyl", "argireline", "acetyl hexapeptide"],
    groupB: ["glycolic acid", "lactic acid", "aha", "alpha hydroxy", "salicylic acid", "bha"],
    reason: "Acids can break down peptide bonds, reducing anti-aging benefits.",
  },
  {
    groupA: ["kojic acid"],
    groupB: ["benzoyl peroxide", "hydrogen peroxide"],
    reason: "Peroxides oxidize kojic acid, making it ineffective.",
  },
  {
    groupA: ["azelaic acid"],
    groupB: ["retinol", "retinoid", "tretinoin", "adapalene"],
    reason: "Using azelaic acid with retinoids can cause excess irritation for sensitive skin.",
  },
];

// Normalize ingredient text for matching
function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s\/\-]/g, " ").replace(/\s+/g, " ").trim();
}

function containsIngredient(ingredientText, terms) {
  const normalized = normalizeText(ingredientText);
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

// Key actives worth tracking for similarity.
// Excludes ubiquitous fillers (hyaluronic acid, ceramide, glycerin, etc.)
// that appear in almost every product and carry no meaningful signal on their own.
const KEY_ACTIVES = [
  "retinol", "retinoid", "tretinoin", "adapalene", "retinaldehyde",
  "glycolic acid", "lactic acid", "mandelic acid", "salicylic acid", "azelaic acid",
  "kojic acid", "tranexamic acid", "phytic acid",
  "vitamin c", "ascorbic acid", "ascorbyl glucoside", "sodium ascorbyl phosphate",
  "niacinamide",
  "benzoyl peroxide",
  "peptide", "palmitoyl", "matrixyl", "argireline",
  "copper peptide", "ghk-cu",
  "resveratrol",
  "arbutin", "alpha-arbutin",
  "ferulic acid",
  "snail secretion", "snail filtrate",
  "centella", "madecassoside", "asiaticoside",
  "bakuchiol",
  "pha", "gluconolactone", "lactobionic",
  "propolis",
  "tea tree", "melaleuca",
  "sulfur",
  "zinc oxide",
];

// Returns the key actives found in an ingredient string
function extractActives(ingredientText) {
  if (!ingredientText) return [];
  const normalized = normalizeText(ingredientText);
  return KEY_ACTIVES.filter((active) => normalized.includes(active.toLowerCase()));
}

// Returns shared actives between two ingredient strings
function sharedActives(ingredientsA, ingredientsB) {
  const activesA = extractActives(ingredientsA);
  const activesB = extractActives(ingredientsB);
  return activesA.filter((a) => activesB.includes(a));
}

// Generate all subsets of an array of size >= minSize
function subsets(arr, minSize = 2) {
  const result = [];
  const total = 1 << arr.length;
  for (let mask = 0; mask < total; mask++) {
    const subset = arr.filter((_, i) => mask & (1 << i));
    if (subset.length >= minSize) result.push(subset);
  }
  return result;
}

// Serialize a sorted subset as a key for counting
function subsetKey(subset) {
  return [...subset].sort().join("|");
}

// Check a product against the "Didn't Work" list.
// Two types of warnings:
// 1. High compositional overlap (3+ shared actives) with a single saved product
// 2. A combination of actives (any size >= 2) that co-occurs across 2+ "Didn't Work"
//    products AND is fully present in the new product — indicates a recurring pattern
function checkSimilarityAgainstDidntWork(newIngredients, lists) {
  const didntWork = lists["Didn't Work"] || [];
  if (!didntWork.length || !newIngredients) return { similar: [], recurringCombos: [] };

  const newActives = extractActives(newIngredients);

  // Step 1: find per-product overlap
  const similar = [];
  // Step 2: count how often each combination of actives co-occurs in "Didn't Work" products
  const comboCount = {}; // key -> count
  const comboMap = {};   // key -> subset array (for display)

  for (const saved of didntWork) {
    if (!saved.ingredients) continue;
    const savedActives = extractActives(saved.ingredients);

    const shared = newActives.filter((a) => savedActives.includes(a));
    if (shared.length >= 3) {
      similar.push({ productName: saved.name, shared });
    }

    // Count all subsets of this product's actives
    for (const subset of subsets(savedActives, 2)) {
      const key = subsetKey(subset);
      comboCount[key] = (comboCount[key] || 0) + 1;
      comboMap[key] = subset;
    }
  }

  // Step 3: find combos that appear in 2+ "Didn't Work" products AND are all in the new product
  const matchingCombos = Object.entries(comboCount)
    .filter(([key, count]) => {
      if (count < 2) return false;
      const subset = comboMap[key];
      return subset.every((a) => newActives.includes(a));
    })
    .map(([key]) => comboMap[key]);

  // Deduplicate: remove subsets that are already covered by a larger combo
  const recurringCombos = matchingCombos.filter((combo) =>
    !matchingCombos.some((other) => other.length > combo.length && combo.every((a) => other.includes(a)))
  );

  return { similar, recurringCombos };
}

// Given two ingredient strings, return all conflicts between them
function findConflicts(ingredientsA, ingredientsB) {
  if (!ingredientsA || !ingredientsB) return [];
  const conflicts = [];
  for (const rule of CONFLICT_RULES) {
    const aHasGroupA = containsIngredient(ingredientsA, rule.groupA);
    const bHasGroupB = containsIngredient(ingredientsB, rule.groupB);
    const aHasGroupB = containsIngredient(ingredientsA, rule.groupB);
    const bHasGroupA = containsIngredient(ingredientsB, rule.groupA);
    if ((aHasGroupA && bHasGroupB) || (aHasGroupB && bHasGroupA)) {
      conflicts.push(rule.reason);
    }
  }
  // Deduplicate
  return [...new Set(conflicts)];
}

// Check a product's ingredients against all saved products across all lists.
// Returns array of { productName, listName, conflicts[] }
function checkConflictsAgainstLists(newIngredients, lists) {
  const warnings = [];
  for (const [listName, products] of Object.entries(lists)) {
    for (const saved of products) {
      if (!saved.ingredients) continue;
      const conflicts = findConflicts(newIngredients, saved.ingredients);
      if (conflicts.length) {
        warnings.push({ productName: saved.name, listName, conflicts });
      }
    }
  }
  return warnings;
}

