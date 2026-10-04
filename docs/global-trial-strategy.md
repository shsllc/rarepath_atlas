# Global trial-provider strategy

Access was checked on 2026-10-04 against official documentation, with one or two unauthenticated test requests per source. RarePath uses only free, documented sources. It doesn't scrape and it doesn't bypass authentication.

## WHO ICTRP: available with approval, not immediately

| Item | Status |
|---|---|
| XML Web Service | It exists, for research use by primary registries, member-state agencies and research institutions. Access goes through the ICTRP Secretariat, and the **cost is "provided upon request"**. ([WHO](https://www.who.int/tools/clinical-trials-registry-platform/the-ictrp-search-portal/ictrp-search-portal-web-service)) |
| Crawling service | **"Currently not available."** When it ran, it needed credentials and its terms forbade redistribution. ([WHO](https://www.who.int/tools/clinical-trials-registry-platform/the-ictrp-search-portal/ictrp-search-portal-crawling-service)) |
| New / updated records feed | A SharePoint folder, available by request form. |
| Portal CSV/XML export | Manual export only; automating it would be scraping. |
| Licence | No marketing, promotional or commercial use; WHO ICTRP must be credited along with the processing date. ([WHO](https://www.who.int/tools/clinical-trials-registry-platform/network/who-data-set/downloading-records-from-the-ictrp-database)) |

To pursue full global coverage after the hackathon, email ictrpinfo@who.int.

## The four tiers

| Tier | Sources | In RarePath |
|---|---|---|
| **1. Live APIs** | ClinicalTrials.gov API v2; **ISRCTN** (official keyless API; records CC BY, metadata CC0); Orphadata (disease normalization) | **Implemented** |
| **2. Cached / periodic** | **EU Clinical Trials Register** (legacy EudraCT, via the register's own summary download; reproduction allowed with acknowledgement); EU CTIS (undocumented portal JSON); DRKS (UI export, records from 2025 onward CC BY 4.0); CRiS (KDCA XML dataset) | **EU CTR implemented** (one page per search, cached by the orchestrator). CTIS not used because its API is undocumented and unendorsed. DRKS and CRiS not used (no automatable, documented endpoint confirmed). |
| **3. Approval required** | WHO ICTRP Web Service and SharePoint feed; DDrare (NIBN); Orphanet clinical-trials dataset (data transfer agreement); Epistemonikos API (token) | Documented on `/sources`, not integrated |
| **4. Not practical** | ICTRP crawling (unavailable); ANZCTR (blocks automated clients, XML export unavailable); jRCT (terms **prohibit automated download**); ChiCTR, CTRI, PACTR, RPCEC, IRCT, ReBEC bulk (no API); Cochrane CENTRAL (paid licence); OpenTrials (defunct) | Not integrated |

## Registry by registry

| Registry | API | Bulk | Auth | Format | Identifiers | Decision |
|---|---|---|---|---|---|---|
| ClinicalTrials.gov | Yes (v2) | Via the API | None | JSON | NCT, `secondaryIdInfos` | Live |
| ISRCTN | Yes (`/api/query/format/default`) | Date-sliced queries | None | XML | ISRCTN, NCT, EudraCT, IRAS, sponsor protocol | **Live** |
| EU CTR (EudraCT) | No formal API; official download endpoint | Text download, RSS | None | Text | EudraCT, sponsor protocol | **Live, one page, cached** |
| EU CTIS | Undocumented | UI CSV | None in practice | JSON | EU CT number | Not used |
| ANZCTR | No | XLS (UI); XML unavailable | — | — | ACTRN | Not practical |
| DRKS | Planned | UI JSON export | None | JSON | DRKS | Not yet |
| ChiCTR, CTRI, PACTR, RPCEC | No | No | — | HTML | Registry ids | Through ICTRP only |
| jRCT / JPRN | No | No | — | HTML | jRCT, UMIN | Automated download prohibited |
| ReBEC | Per-record XML | No | — | XML | RBR | Not practical in bulk |
| CRiS | data.go.kr XML dataset | Yes (file) | Free (KOGL-1) | XML | KCT | Candidate for caching |
| IRCT | Unverified | Export after login | Account | — | IRCT | Not practical |

**ICTRP-consuming platforms:**

- **DDrare** (NIBN, Japan): active and highly relevant. It covers drug development for intractable diseases, with trials from jRCT, ClinicalTrials.gov, EU CTR and ChiCTR via ICTRP, mapped to drug targets and pathways. It has no API, and its terms require permission in advance, so RarePath links to it rather than ingesting it.
- **Orphanet's trial data** requires a data transfer agreement.
- **Cochrane CENTRAL** is paid.
- **Epistemonikos** needs a token.
- **OpenTrials** is defunct.

## Deduplication across registries

- **What merges trials:** shared registry identifiers only — NCT, EudraCT, EU CT (CTIS), WHO UTN, ISRCTN, DRKS, ANZCTR, CTRI, jRCT, ChiCTR. A sponsor protocol id counts only together with the same normalized sponsor.
- **What blocks a merge:** two records with different primary ids from the same registry are never merged, whatever else they share (for example, an extension study that reuses a protocol number).
- **Look-alikes:** records with the same normalized title, or the same sponsor and start date, but no shared identifier stay separate and are flagged **POSSIBLE DUPLICATE**.
- **Provenance:** a merged trial lists every registration, for example ClinicalTrials.gov NCT… + ISRCTN… + EU CTR ….

## Is a paid scraping platform (e.g. Apify) needed?

**No.** ClinicalTrials.gov and ISRCTN cover live search legitimately, and EU CTR adds legacy EU trials. Commercial scrapers for CTIS, ChiCTR or ReBEC hit the same public pages or undocumented endpoints. They add cost without adding legitimacy, and for jRCT they would breach the registry's terms. The legitimate route to complete global coverage is WHO ICTRP access with approval.
