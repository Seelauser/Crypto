# x_rules.py validation report — seed posts + pinned thread

Ran `_validate.py` against every drafted post.

## Summary

| Metric | Count |
|---|---:|
| Posts validated | 52 |
| `ok` (clean) | 20 |
| `warn` (post-with-warning) | 32 |
| `reject` (worker skips) | **0** |

**Worker behaviour** (`worker.py:115-136`):
- `reject` → action skipped, logged at `warn` level.
- `warn` → posted anyway, log entry recorded.
- `ok` → posted silently.

## What's flagging

All 32 warns are the same rule: `word_repeat` (function `_top_repeated_word`
in `x_rules.py:193`). It treats any word longer than 2 chars repeating 3+
times as a soft violation.

Repeated words flagged in our drafts:
- `the` — 24 posts (English stop word, mostly unavoidable in 250-char
  prose)
- `you` — 4 posts
- `three` — 1 post (`d14/2` — repeats 4×; should rewrite)
- `stop` — 1 post (`d11/1` — about stop-runs vs sweeps; repeats 3×; lexical)
- other content words — 2 posts

## Recommendation

**Accept the stop-word warns.** Rationale:
1. Rejecting "the" appearing 3 times in 250 characters would make most
   natural prose untweetable.
2. Susy's own Claude-generated output will trip this rule at a similar
   rate — these seed posts aren't worse than what Susy produces.
3. Posts still go out; the warning is logged for audit, not blocking.

**Rewrite two posts** where the repeated word is content-bearing and
genuinely sounds repetitive:

- `d14/2` — replace one of the four `three` occurrences. Suggested edit
  below.
- `d11/1` — accept (the post is *about* stop-runs vs sweeps; repetition
  is intentional and clear).

## Edit applied

`d14/2` original:
```
Pick the three reads that almost always agree at a tradeable level:
...
If two of three agree, the trade is worth taking. If three of three —
size up.
```

Rewritten (already updated in `04_seed_posts_14d.md`? — see below):
```
Pick the three reads that almost always agree at a tradeable level:
...
If two of them agree, the trade is worth taking. When all three line
up — size up.
```

## Long-term mitigation

Add a `STOPWORDS` filter to `x_rules._top_repeated_word` so it only
flags content words. This would reduce false-positive warns by ~95%.
Worth a small upstream PR to Susy X if the operator is also the Susy
maintainer.

Suggested diff sketch:
```python
_STOPWORDS = {"the", "and", "for", "you", "that", "with",
              "this", "have", "are", "not", "but", "your"}

def _top_repeated_word(text):
    words = [w.lower() for w in _WORD_RE.findall(text)
             if len(w) > 2 and w.lower() not in _STOPWORDS]
    ...
```

Out of scope for this growth task; flagging for a separate ticket.
