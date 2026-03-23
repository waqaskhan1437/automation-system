## 2025-05-15 - Linear Search Bottleneck in Scheduling
**Learning:** Found a linear O(N) search in `findNextCalendarSlot` that could iterate up to 20,160 times (minutes in 2 weeks) for every scheduled automation check. Each iteration calls `Intl.DateTimeFormat.formatToParts`, which is extremely slow on V8/Node. `Object.fromEntries` on every iteration also creates unnecessary GC pressure.
**Action:** Always prefer jumping/leaping algorithms for calendar calculations. Avoid `Object.fromEntries` and `map` in hot paths; use simple loops for parsing `formatToParts` results.
