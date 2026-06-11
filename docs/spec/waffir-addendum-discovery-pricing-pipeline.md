# Addendum to Waffir Master Prompt — Store Discovery, Source Qualification, Actual-Price Solution & Daily Update Pipeline

> **Append this to the master prompt.** It replaces the simple "seed stores manually" assumption with a dynamic, city-driven store discovery system inspired by flyer aggregators (D4D, ClicFlyer) but extended to solve their core weakness: **flyers only cover offer prices, not everyday shelf prices.**

---

## 13. City-Based Store Discovery Pipeline (Google Places)

**Goal:** the user picks/detects a city → the app automatically knows which grocery/supermarket/household stores exist there, and only shows stores that have a *usable price source*.

### 13.1 Discovery (per city, scheduled + admin-triggered)
Implement `/server/services/discovery.ts`:

1. **Google Places API (New) — Text Search + Nearby Search** over a grid of points covering the city polygon (store city polygons/bounding boxes in `cities`). Query types: `supermarket`, `grocery_store`, `convenience_store`, plus Arabic text queries: "هايبر ماركت"، "أسواق"، "تموينات"، "مواد غذائية"، "منظفات وبلاستيك".
2. For each result, store in `discovered_places` (place_id, name, lat/lng, city_id, types, website, phone, rating, user_ratings_total, status).
3. **Chain clustering:** normalize names (same Arabic normalization function) and cluster branches into a `store` chain (e.g., 14 بندة branches in jeddah → one chain). Singleton groceries remain standalone stores.
4. Respect Places API cost: cache results, refresh discovery **monthly** per city (places don't change daily), and only run discovery for cities that have at least one active user.

### 13.2 Source Qualification — "هل لهذا المتجر مصدر أسعار؟"
For every discovered chain, run an automated **Source Qualification Job** that fills `store_source_profiles`:

| Check | Method | Result |
|---|---|---|
| Official website with products | Places `website` field → crawl homepage → detect product/price pages or e-commerce platform (Salla, Zid, Shopify, custom) | `source_type = web_catalog` |
| Public API / app endpoints | Probe common JSON endpoints of known platforms (Salla/Zid have predictable storefront APIs) | `source_type = api` |
| Offers flyer/magazine | Check website "العروض" pages + known aggregator presence + social accounts (X/Instagram links from website) for weekly flyer posts | `source_type = flyer` |
| Nothing found | — | `source_type = none` |

**Rules:**
- A chain can have multiple source types (e.g., flyer + web_catalog). Store all, ranked.
- `source_type = none` → store is **excluded from the catalog by default** (exactly as the user specified). It remains in `discovered_places` with status `excluded_no_source`, visible only in the admin panel with a one-click "promote" if a source is later found, and optionally surfaced to users as "متجر قريب منك — لا تتوفر أسعاره بعد، ساعدنا بإضافة أسعاره" (crowdsource mode, off by default).
- Qualification results require **admin confirmation once per chain** before going live (review screen: detected website, sample scraped product, sample flyer). After confirmation, everything is automatic.
- Re-qualification runs monthly to catch stores that launch a website/flyer later.

### 13.3 Schema additions
- `cities.polygon` (geojson) — or min/max bounds.
- `discovered_places` (place_id PK, raw payload, chain_match, status: pending|active|excluded_no_source|rejected)
- `store_source_profiles` (store_id, source_type enum[api|web_catalog|flyer|user_only], endpoint_or_url, platform_hint, priority, is_confirmed, last_success_at, failure_count)

---

## 14. Solving the Actual-Price Problem (the core hard problem)

Flyer-only apps (D4D model) are accurate **only for items currently on offer (~5–10% of a store's catalog, ~1 week validity)**. Everyday shelf prices are the gap. Solve it with **five converging sources**, each feeding the same `prices` table with `source` + `confidence`:

### 14.1 Flyer prices (highest accuracy while valid)
- Flyer prices are printed commitments → confidence **95** during validity window, auto-expire at `offer_ends_at` (drop to 0, never shown after expiry).
- **Flyer Watcher Job (daily):** for each chain with `source_type=flyer`, check its offers page / known flyer URL pattern for a new publication (hash/ETag comparison). New flyer → download → OCR pipeline → review queue. Most Saudi chains publish weekly (Wed/Thu); the watcher learns each chain's publication weekday and checks more aggressively around it.

### 14.2 Web catalog prices (daily refresh)
- For `web_catalog`/`api` chains, scrape full catalog **daily** (or every 2 days for low-traffic stores). Confidence **80**, decaying ~5 points/day.
- **Important caveat to encode:** delivery-app prices (نعناع/توصيل) and even some retailer websites are often **higher than shelf prices**. Mark each source profile with `price_basis: shelf|online|unknown`. Online-basis prices display with a label "سعر المتجر الإلكتروني — قد يختلف عن الرف" and are *corrected over time* by the calibration layer (14.5).

### 14.3 Receipt OCR (the killer feature — bulk ground truth)
- In Shopping Mode (and standalone), the user photographs the **receipt (الفاتورة)**. Saudi receipts are ZATCA-compliant and structured: store name, branch, datetime, line items with name/qty/price, VAT.
- Pipeline: image → preprocessing (deskew, contrast) → tesseract.js (ara+eng) → line-item parser → match lines to canonical products via `product_aliases` + fuzzy normalized matching → unmatched lines go to a quick user confirmation screen ("هل هذا المنتج هو…؟").
- Every matched line = a **verified shelf price**, confidence **99**, at an exact branch and timestamp. One receipt can verify 30+ prices in 20 seconds — this is how the app reaches and *maintains* the 99% target at scale, and it costs the user nothing extra (they already have the receipt).
- ZATCA QR on receipts encodes seller + total (TLV/Base64) — decode it to verify store identity and receipt authenticity (anti-spam for future multi-user crowdsourcing).

### 14.4 Manual user price entry
- Single-item entry in Shopping Mode (already specced). Confidence **90** (typos possible), boosted to 99 if a receipt later confirms it.

### 14.5 Calibration & conflict resolution layer
Implement `/server/services/priceResolver.ts`:
- **Display price** per (product, branch) = highest-confidence non-stale price; ties broken by recency.
- **Online→shelf calibration:** when both an online price and a receipt/manual shelf price exist for the same product+chain within 7 days, compute the delta; maintain a rolling per-chain calibration factor and apply it (with the "estimated" label) to online prices lacking shelf verification.
- **Anomaly guard:** reject/queue any new price deviating >40% from the product's trailing median for that chain (catches OCR errors and unit mismatches) — goes to review queue instead of publishing.
- **Accuracy KPI:** admin dashboard metric = % of displayed prices with confidence ≥ 90 and age ≤ 7 days, per city and per store. This is the measurable definition of "دقة 99%".

---

## 15. Continuous Daily Update Pipeline

Implement a job framework in `/server/jobs/` (node-cron + a `job_runs` table for observability):

| Job | Schedule | Action |
|---|---|---|
| `flyer-watcher` | daily 06:00 + hourly on each chain's learned publish day | Detect new flyers → OCR → review queue |
| `catalog-refresh` | daily 03:00, staggered per chain | Scrape web/API catalogs; diff against last run (hash per product) and only write changed prices |
| `offer-expiry` | hourly | Expire offers past `offer_ends_at`; recompute affected list recommendations |
| `staleness-sweep` | daily 04:00 | Decay confidence; flag/stale prices; demote from "cheapest" picks |
| `source-health` | daily 05:00 | Ping every source profile; 3 consecutive failures → alert admin + mark chain prices stale |
| `requalification` | monthly | Re-run discovery + source qualification per active city |
| `monthly-list-gen` | daily 07:00 | Generate lists for users whose shopping_day − 3 = today |
| `kpi-snapshot` | daily | Record accuracy KPI history |

**Pipeline principles (encode as code review checklist):**
- Idempotent jobs (safe to rerun), append-only prices, diff-based writes (don't rewrite 10k unchanged rows nightly).
- Per-chain politeness: rate limits, randomized delays, caching, user-agent identification; failures isolate to the chain, never the pipeline.
- Everything observable: `job_runs` (job, started_at, duration, items_in/out, errors) shown in the admin dashboard with red/green status per store source.
- Review queue SLA surfaced to admin: "X عرض بانتظار المراجعة منذ أمس".

---

## 16. Updated E2E tests (add to Section 9)
- Discovery: seed a fake Places response fixture → run discovery for مكة → chains clustered → one chain auto-qualified with flyer source → one place excluded with `excluded_no_source` and hidden from user catalog.
- Receipt flow: upload a fixture receipt image → OCR → ≥80% lines auto-matched → confirm one ambiguous line → prices appear with confidence 99 and correct branch.
- Daily pipeline: run `catalog-refresh` twice with identical fixture data → second run writes zero new price rows (diff logic verified). Run `offer-expiry` past a fixture offer's end date → offer disappears from product page and from cheapest-pick logic.
- Calibration: insert online price 12.0 + receipt price 10.5 for same product/chain → calibration factor applied to a sibling product's online-only price with the "estimated" label.

## 17. Cost & API keys note
- `GOOGLE_MAPS_API_KEY` in `.env.example`; wrap all Places calls in a quota-aware client with caching (Places API is paid — discovery monthly, never per user request; user-facing maps use static branch data from our DB).
