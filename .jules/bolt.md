## 2025-05-15 - Linear Search Bottleneck in Scheduling
**Learning:** Found a linear O(N) search in `findNextCalendarSlot` that could iterate up to 20,160 times (minutes in 2 weeks) for every scheduled automation check. Each iteration calls `Intl.DateTimeFormat.formatToParts`, which is extremely slow on V8/Node. `Object.fromEntries` on every iteration also creates unnecessary GC pressure.
**Action:** Always prefer jumping/leaping algorithms for calendar calculations. Avoid `Object.fromEntries` and `map` in hot paths; use simple loops for parsing `formatToParts` results.

## 2025-05-15 - YouTube Download Performance & Bot Detection
**Learning:** YouTube downloads can be significantly throttled by default or blocked by bot detection. Using `aria2c` as an external downloader with multi-connection (`-x 16`) increases download speeds by up to 5-10x. Additionally, providing `ios` player client in extractor args bypasses common "Sign in to confirm you're not a bot" errors when cookies aren't available.
**Action:** Always use `aria2c` for large video downloads and configure `yt-dlp` to use multiple player clients (ios, web, android) to ensure high reliability.
