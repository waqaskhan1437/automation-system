# Automation Content Audit Report — Auto Title/Description, Repetition & YouTube Stuck

**Date:** 2026-06-05
**Scope:** Auto Content from Video Title (channel URL), title/description repetition across runs/platforms, YouTube "processing stuck" duplicate-content issue.
**Mode:** Read-only audit — koi code change nahi kiya gaya.

---

## TL;DR (Roman Urdu)

1. **Content "hardcoded" nahi hai** — AI generation ka code sahi hai, lekin **generated content kabhi rotate nahi hota**: posting har run pe `cursor = 0` use karti hai kyunki cursor kabhi save (persist) nahi hota. Isliye har run pe **wahi pehla title/description** repeat hota hai — yeh "hardcoded jaisa" lagta hai.
2. **Channel URL har run pe wahi (newest) video uthata hai** — runner channel resolve karte waqt processed-videos list check hi nahi karta. Same video → same title → same AI content → duplicate.
3. **Title/Description ka pairing bug hai** — title index `N` ke sath description index `N+1` jati hai (description #0 kabhi use nahi hoti, mismatch pair banta hai).
4. **YouTube stuck/duplicate** in sab ka combined result hai: same video + same title + same description + same tags har run pe → YouTube duplicate content detect kar ke processing stuck kar deta hai. Code mein **koi duplicate-title guard nahi** hai post karne se pehle.
5. **Live AI API key kaam nahi kar rahi** — `atk_bfa9e9bd...ae010` har endpoint pe `401 Unauthorized` deti hai (header + query token dono). Live verification is wajah se possible nahi thi.

---

## Issue 1 — `post_content_cursor` kabhi persist nahi hota → har run same title (CRITICAL)

**Yeh duplicate content ka sab se bara sabab hai.**

### Flow
1. AI 10 titles + 10 descriptions generate karta hai (`social_count` default 10).
2. Runner `post-via-postforme.js` title sequentially pick karta hai cursor se:
   - `runner-scripts/post-via-postforme.js:469-485` — cursor `config.rotation_state.post_content_cursor` se aata hai, default `0`.
3. Runner `content_cursor_next` ko sirf `output/post_result.json` mein likhta hai (`post-via-postforme.js:617`).
4. **Worker webhook handler (`worker/src/index.ts:1330-1522`) `content_cursor_next` ko kabhi read nahi karta** — `rotation_state.post_content_cursor` automation config mein update hi nahi hota video automations ke liye.
5. Worker-side cursor persistence sirf do jagah hai:
   - Image automations (`automation-scheduler.ts:1747-1763` via `rotation_state_next`) — video ke liye nahi.
   - Worker-side posting path `processPendingUploads` (`automation-scheduler.ts:2024-2035`) — yeh sirf tab chalta hai jab upload `post_status='pending'` ho. Runner khud PostForMe pe post kar deta hai aur `post_status='posted'` report karta hai, isliye yeh path **kabhi execute nahi hota** normal runs mein.

### Result
Har run: `cursor = 0` → `titles[0]`, `descriptions[1]` (issue 2 dekhen) → **wahi content har bar**. User ko lagta hai "hardcoded hai, naya generate nahi ho raha" — actually naya generate hota hai (ya purana config se aata hai) lekin **hamesha index 0 hi post hota hai**.

### Side-effect
`automation-scheduler.ts:1987,2038-2042` — "all titles used → mark automation completed" logic bhi kabhi trigger nahi hota kyunki cursor aage barhta hi nahi.

---

## Issue 2 — Title/Description pairing off-by-one (HIGH)

`runner-scripts/post-via-postforme.js:480-481`:

```js
const titleResult = pickSequentialItem(titles, contentCursor);
const descResult = pickSequentialItem(descriptions, titleResult.nextCursor); // ← BUG: cursor+1
```

Description ko `titleResult.nextCursor` (yani `cursor + 1`) pass hota hai. **Mock test (verified locally):**

```
cursor=0 -> title=T0  desc=D1   (D0 kabhi use nahi hoti)
cursor=1 -> title=T1  desc=D2
cursor=2 -> title=T2  desc=D2   (clamp pe duplicate desc)
```

- Title #0 ke sath description #1 jati hai — **mismatched pair** (AI title #0 ke liye description #0 likhta hai).
- `nextCursor` bhi `max(titleResult.nextCursor, descResult.nextCursor)` = `cursor + 2` ban jata hai — agar cursor persist hota bhi, to har run **ek title skip** ho jata.

Worker-side path (`buildPostformeContentSelection`, `automation-scheduler.ts:2332-2334`) yeh **sahi** karta hai (dono ko same `clampedCursor` deta hai) — sirf runner script mein bug hai. Do implementations out-of-sync hain.

---

## Issue 3 — Channel resolution processed-videos check nahi karta → har run same video (CRITICAL)

`runner-scripts/steps/download.js:251-298` (`resolveSingleVideoFromChannel`):

- `--flat-playlist --playlist-end N` se channel ke newest N videos list hote hain.
- `newest` strategy: **hamesha `urls[0]`** (newest video) select hota hai.
- **Worker ke `processed_videos` table se koi cross-check nahi hota.** Runner ke paas processed list ka access hai (`GET /api/automations/:id/processed-videos` endpoint maujood hai, `automations.ts:527-539`) lekin download step usay call hi nahi karta.

### Result
Jab tak channel pe naya video upload nahi hota, **har scheduled run wahi newest video dobara download, process, aur post karta hai**:
- Same source video → same `yt-video-title.txt` → AI same topic se same/similar titles → duplicate posts.
- Commit `4e9a98b` ne resolved URL ko `processed_videos` mein store karna fix kiya (tracking side), lekin **resolution side ab bhi list consult nahi karti** — to tracking ho rahi hai, filtering nahi.
- Worker dispatch-time rotation filter (`automation-scheduler.ts:1455-1492`) sirf **channel URL** ko filter karta hai (jo ab kabhi processed mark nahi hota — resolved video URL hota hai), isliye woh filter bhi channel sources ke liye effectively no-op hai.

---

## Issue 4 — Local runner pe AI content generation kabhi nahi chalti (HIGH)

`runner-scripts/main.js:620-646` — channel URL fallback AI generation ke liye 3 env vars chahiye:
`WORKER_WEBHOOK_URL`, `JOB_ID`, `RUNTIME_CONFIG_TOKEN`.

- GitHub workflow yeh set karta hai (`.github/workflows/video-automation.yml:44-48`). ✅
- **Local runner (`local-runner/runner.js:747-758`) `RUNTIME_CONFIG_TOKEN` set nahi karta.** ❌

### Result
Local execution mode mein `use_video_title_for_content` ke sath channel URL pe runner log karega:
`[CONTENT] Missing WORKER_WEBHOOK_URL, JOB_ID, or RUNTIME_CONFIG_TOKEN — cannot generate AI content`
→ fallback config (Social tab ke purane/saved titles) use hota hai → **yahan content genuinely "purana/hardcoded" hota hai**.

---

## Issue 5 — Dispatch-time AI generation channel URLs ke liye sirf "first video title" pe chalti hai (MEDIUM)

`automation-scheduler.ts:1496-1564`:

- `firstVideoTitle` sirf ytdown.to extraction se aata hai. Channel URL (`youtube.com/@...`) ytdown.to pe resolve nahi hota → `firstVideoTitle` undefined → dispatch-time generation **skip** → runner-side fallback pe depend (jo local mode pe broken hai, Issue 4).
- Multi-video runs (`videos_per_run > 1`): sirf **pehle video ke title** se content banta hai; baqi videos ko bhi wahi titles array milta hai → video #2, #3 ka content unke apne title se match nahi karta.
- Runner-side regeneration (`main.js:615-653`) har video ke liye chalti hai lekin `config.titles` ko **overwrite** karti hai — aur cursor 0 hone ki wajah se har video phir bhi `titles[0]` hi use karta hai (Issue 1 se compound hota hai). Ek hi run ke multiple videos ko bhi same title milne ka risk hai agar generation fail ho jaye.

---

## Issue 6 — YouTube "processing stuck" / duplicate upload (root-cause chain)

User ka observation sahi hai: YouTube same title + same description + same tags pe video processing stuck kar deta hai / duplicate detect karta hai. System mein yeh chain banti hai:

```
Issue 3 (same video har run)
   → same yt-video-title.txt
      → AI same topic → similar titles (temperature 0.7, koi "avoid previous titles" context nahi)
         → Issue 1 (cursor=0 hamesha) → exactly same title[0] post hota hai
            → PostForMe → YouTube: same file + same title + same desc + same tags
               → YouTube duplicate-content flag → processing stuck
```

**Koi safeguard nahi hai:**
- Post karne se pehle koi check nahi ke yeh title pehle kisi post mein use ho chuka hai (na runner mein, na worker mein, na `processed_videos`/`video_uploads` lookup).
- `getSocialMessages` prompt mein previously-used titles ka koi exclusion list nahi jata (`worker/src/services/ai.ts:597-648`) — AI har bar same input pe similar output de sakta hai.
- Hashtags: `normalizeSocialResult` (ai.ts:1476-1496) hashtags pura array as-is post hota hai — har run same tags.
- YouTube platform config hamesha `privacyStatus: "public", categoryId: "22"` (post-via-postforme.js:340-347) — koi variation nahi.

**Nota bene:** Video file bhi byte-level same hota hai (same source, same processing) — sirf title change karna kafi nahi hoga; same video file re-upload bhi YouTube duplicate detection trigger karta hai. Asal fix Issue 3 hai (naya video pick karna / already-processed skip karna).

---

## Issue 7 — Live AI Developer API key Unauthorized (BLOCKER for live verification)

Test kiya gaya (2026-06-05):

| Test | Result |
|---|---|
| `GET /api/ai/manifest` with `Authorization: Bearer atk_bfa9e9bd...ae010` | `401 Unauthorized` |
| `GET /api/ai/snapshot?ai_token=atk_bfa9e9bd...` | `401 Unauthorized` |
| `GET /api/ai/monitor?ai_token=...`, `/api/ai/instructions`, `/api/ai/browser-links` | `401 Unauthorized` |
| `X-Access-Token` header | `401 Unauthorized` |
| Vercel proxy (`frontend-nine-jet-27.vercel.app/api/ai/manifest?ai_token=...`) | `401 Unauthorized` |
| Purana stored token (`local-runner/config.txt` ka `atk_7c5b...`) | `401 Unauthorized` |
| Runner token (`rnr_8705...`) body mein | `Invalid or revoked runner token` |

Auth code path (`worker/src/services/auth.ts:180-218`) SHA-256 hash se `api_keys.key_hash` match karta hai with `revoked_at IS NULL AND expires_at > now AND u.status='active'`. Possible causes:
1. Key kisi **dusri DB/deployment** pe create hui (deployed worker vs UI mismatch).
2. Key create hone ke baad **revoke/expire** ho gayi.
3. `api_keys` insert silently fail hua (migration issue) — UI ne phir bhi key show kar di.
4. User row `status != 'active'`.

**Yeh khud audit-worthy bug hai:** key creation UI ne success dikhaya lekin key live API pe kaam nahi karti. Iski wajah se live automations/configs/logs verify nahi ho sake — yeh report **code-path audit + local mock tests** pe based hai.

---

## Secondary observations (chhote issues)

| # | Observation | Location |
|---|---|---|
| S1 | `pickPostformeTextByCursor` clamp karta hai (`Math.min(cursor, len-1)`) — agar cursor kabhi persist ho bhi jaye, titles khatam hone par **aakhri title repeat** hota hai jab tak "completed" mark na ho. | `automation-scheduler.ts:2311-2319` |
| S2 | `pickSequentialItem` (runner) bhi clamp karta hai — same repeat-last-title behavior. | `post-via-postforme.js:29-34` |
| S3 | Worker-side aur runner-side posting logic **duplicate implementations** hain (caption build, platform configs, cursor) — drift ho chuka hai (Issue 2 sirf runner mein hai). | dono files |
| S4 | `generate-content` endpoint har call pe **fresh random** content deta hai — same job ke retries pe titles badal jate hain, `post_result` metadata aur actual posted content mismatch ho sakta hai. | `worker/src/index.ts:817-894` |
| S5 | Channel URL ke sath `videos_per_run > 1` effectively kaam nahi karta — `resolveSingleVideoFromChannel` sirf **1 URL** return karta hai per source entry. | `download.js:251-298` |
| S6 | `markVideoProcessed(getResolvedChannelUrl() || url)` — agar ek run mein multiple source URLs hon, `yt-resolved-url.txt` stale ho sakta hai (pichhle video ka resolved URL agle non-channel video pe bhi apply ho sakta hai; file kabhi delete nahi hoti). | `main.js:160-169, 731, 779, 815` |
| S7 | `webhook.final(successCount, successCount, ...)` — `totalProcessed` argument mein bhi `successCount` pass hota hai (actual attempted count nahi), error messages misleading ho sakte hain. | `main.js:848` |

---

## Verification summary

| Claim | Method | Status |
|---|---|---|
| AI generation code real hai (hardcoded nahi) | Code read: `ai.ts getSocialMessages/normalizeSocialResult`, `generate-content` endpoint | ✅ Confirmed — generation real hai; **delivery/rotation broken hai** |
| Title repeat hota hai har run | Code trace (cursor persist nahi hota) + local mock test of `pickSequentialItem` | ✅ Confirmed |
| Title/desc mismatch | Local mock test (output: `cursor=0 → T0 + D1`) | ✅ Confirmed |
| Channel se same video repeat | Code read `resolveSingleVideoFromChannel` — no processed check | ✅ Confirmed |
| YouTube stuck on duplicates | Root-cause chain (upar) — external YouTube behavior, code mein koi guard nahi | ✅ Plausible, code-side guards absent |
| Live API se config/log verification | curl tests with provided key | ❌ Blocked — key `401 Unauthorized` (Issue 7) |

---

## Recommended fixes (priority order — abhi implement NAHI kiye gaye)

1. **(Issue 1)** Worker webhook handler mein `output_data.content_cursor_next` read kar ke automation `config.rotation_state.post_content_cursor` persist karo (video automations ke liye).
2. **(Issue 2)** `post-via-postforme.js` mein description ko **same cursor** do jo title ko mila (`pickSequentialItem(descriptions, contentCursor)`), aur `nextCursor = contentCursor + 1`.
3. **(Issue 3)** `resolveSingleVideoFromChannel` se pehle worker ka `GET /api/automations/:id/processed-videos` call karo aur listed URLs ko candidates se exclude karo — pehla **un-processed** video pick ho.
4. **(Issue 4)** Local runner env mein `RUNTIME_CONFIG_TOKEN` add karo (ya local mode ke liye generate-content ka alternate auth path).
5. **(Issue 6)** Post se pehle duplicate-title guard: last N posted titles (`video_uploads.post_metadata`) se compare; match ho to next cursor / regenerate with exclusion list in prompt.
6. **(Issue 7)** API key creation flow debug karo — create ke foran baad ek self-test call (`GET /api/ai/manifest`) UI se karwao taake dead key issue create hote hi pakra jaye.

---

*Report generated by code-path audit + local mock tests. Live API verification blocked by Issue 7.*
