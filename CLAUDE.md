# SPITBALL

## Vision

**Spitball** is a Twitter clone with one defining gag: **you cannot delete anything. Ever.**

- No backspace key. No delete key. No editing. No drafts.
- The moment you press a key, that character is part of your post — forever.
- Posts are "spat" (published) by clicking **Spit it**, but the content was locked in keystroke by keystroke.
- Marks (likes) cannot be un-marked.
- Usernames are set once, at account creation, with the same no-backspace rule.
- **No media. No images. No video. No GIFs. No attachments. Text only, always.** This is a core constitutional rule, not a roadmap item.

The aesthetic is deliberately minimal: **black and white, high contrast, monospace**, like a newspaper police blotter or a typewriter. No rounded corners, no colors, no bubbly UI. Sharp borders. Inverted headers. Editorial voice.

## The Core Mechanic

The "no backspace" rule is enforced via two layers:

1. **`document` keydown listener** — active when a composer is open. Intercepts `Backspace`, `Delete`, paste (`Ctrl+V`), and other destructive keys. Shows a "shake + REDACTED flash" denied animation instead.
2. **Hidden `<input>` element** — receives focus when a composer activates (also opens the mobile keyboard). Its `input` event detects value shrinkage (deletions) and restores the previous value. This acts as a mobile fallback where `keydown` interception is unreliable.

Composers activate on click. They deactivate (but preserve the draft) on Escape or clicking outside. The draft persists to `localStorage` on every keystroke — it survives a reload. The only way to clear the composer is to **Spit** (publish it).

## Tech Stack

- **Pure HTML / CSS / JS** — no framework, no build step, no dependencies.
- **localStorage** for all persistence. This is a single-user experience; there is no backend.
- **Hash-based routing** (`#feed`, `#post/<id>`, `#profile`) for SPA behavior.
- **GitHub Pages** for hosting — push to `main`, it's live.

## Vocabulary

| Spitball term | Twitter equivalent |
|---|---|
| Spit (noun)   | Tweet / Post |
| Spit it (verb)| Tweet / Post (action) |
| Spat          | Posted (past tense of spit) |
| Respit        | Retweet / Repost |
| Quote spit    | Quote tweet |
| Mark (■)      | Like (♥) |
| Reply         | Reply |
| Feed          | Home timeline |

## Constitutional Rules (non-negotiable, forever)

1. **No delete.** Nothing can be removed once posted.
2. **No backspace.** Not while composing, not in username entry, nowhere.
3. **No drafts.** Each keystroke is committed immediately to localStorage.
4. **No media.** No images, no video, no GIFs, no attachments. Text only.
5. **No edit.** Posts cannot be modified after spitting.
6. **No unlike.** Marks are permanent.
7. **No username changes.** Your handle is forever.

## Data Model (localStorage)

All data lives in `localStorage`. Keys use the `spitball_` prefix:

| Key | Value |
|---|---|
| `spitball_user` | `{ id, username, joinedAt }` as JSON |
| `spitball_posts` | `Post[]` as JSON |
| `spitball_likes` | `string[]` (post IDs this user has marked) |
| `spitball_draft` | `string` — in-progress main composer text |
| `spitball_reply_draft` | `string` — in-progress reply composer text |

**Post schema:**
```ts
{
  id:        string;          // generateId() — timestamp36 + random
  username:  string;          // author handle
  content:   string;          // full text, may contain newlines
  createdAt: number;          // Date.now()
  parentId:  string | null;   // null = top-level spit, else reply
  likeCount: number;
}
```

## Files

```
/
├── index.html   — App shell. All views present in DOM, shown/hidden by JS.
├── style.css    — All styles. CSS custom properties. No preprocessor.
├── app.js       — All application logic. Zero dependencies.
├── CLAUDE.md    — This file. Vision + context for future sessions.
└── README.md    — Public-facing description.
```

## Threading Model

Threading is handled through the `parentId` field on posts:
- Top-level spits have `parentId: null`
- Direct replies have `parentId` pointing to their parent post
- There is no depth limit — a reply can have replies, which can have replies

The post detail view shows:
- The original spit (large, detail style)
- The reply composer
- All direct replies to that spit, rendered as a **thread** with spine/connector lines and "↩ replying to @user" context
- Each reply is clickable — navigating to that reply's own detail page to continue the thread

Nested threads are accessed by clicking into them (navigating to a reply's page), not expanded inline. This keeps the UI simple and works naturally with hash routing.

## Feed Algorithm (future)

Currently: reverse-chronological (newest top-level spit first).

When a real shared backend exists, an algorithm could use signals specific to Spitball's constraints:
- **Mark velocity** (marks/hour in first 24h) — better than raw mark count
- **Reply depth** — threads that go deep have something going on
- **Age as a non-decay factor** — unlike Twitter, nothing goes stale by design; a spit from 3 years ago is equally permanent to one from 3 minutes ago
- **Chaos mode** — surface heavily-typo'd spits for cultural/entertainment value
- **Archeology mode** — surface old posts that are still getting new marks, proving their longevity

The algorithm should NOT optimize for engagement at the cost of readability — that would be ironic given the app's premise. Consider curation by humans (mark-curated lists) over pure engagement signals.

**Do not build an algorithm before there is a real shared backend.** With localStorage, it's a single-user experience and rankings are meaningless.

## Feature Backlog

These are planned but not yet built:

- **Shared backend** (Supabase recommended — Postgres + REST, free tier) — real multi-user feed, the app's full potential
- **Respits** — forwarding a spit to your own feed. Cannot be un-respat.
- **Quote spits** — embed a spit in your own, with your commentary. Permanent.
- **Mobile polish** — the no-backspace mechanic works imperfectly on iOS/Android virtual keyboards; needs more robust `input` event handling
- **Sound design** — typewriter click per keystroke; stamp sound on Spit; "DENIED" buzzer on backspace attempt
- **"Errata" system** — can't delete, but could append a clearly-marked correction to a spit (the original remains visible above it)
- **Character countdown animation** — visual urgency as you approach 280
- **Export / "Your Permanent Record"** — download all your spits as a plain text file or PDF

## Design Principles

- **Monospace everything.** The font is Courier New (system-available, no CDN). Headings use Arial Black (also system-available).
- **No external dependencies.** No Google Fonts, no CDN, no npm. The site works offline after first load.
- **Inverted headers.** Black-on-white for content. White-on-black for structural chrome (composer header, section labels, masthead).
- **Sharp corners everywhere.** No `border-radius`. This is not a friendly app.
- **No icons.** Use typographic characters: ■/□ for marks, ↩ for replies, ← for back.

## Hosting

GitHub Pages, root of `main` branch.
`Settings → Pages → Source: main / (root)`

Live at: `https://billywojcicki.github.io/blotter/`
