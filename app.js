/* ================================================
   SPITBALL — Application
   No delete. No backspace. No media. No mercy.
   ================================================ */

'use strict';

// ── Constants ────────────────────────────────────
const STORAGE_USER        = 'spitball_user';
const STORAGE_POSTS       = 'spitball_posts';
const STORAGE_LIKES       = 'spitball_likes';
const STORAGE_DRAFT       = 'spitball_draft';
const STORAGE_REPLY_DRAFT = 'spitball_reply_draft';
const MAX_CHARS           = 280;
const SYSTEM_USER         = 'SPITBALL';

// ── State ─────────────────────────────────────────
const state = {
  user:                null,
  posts:               [],
  likes:               new Set(),
  draft:               '',
  replyDraft:          '',
  currentView:         'feed',       // 'feed' | 'post' | 'profile'
  currentPostId:       null,
  mainComposerActive:  false,
  replyComposerActive: false,
};

// ── Storage ───────────────────────────────────────
function loadFromStorage() {
  try {
    const u = localStorage.getItem(STORAGE_USER);
    if (u) state.user = JSON.parse(u);

    const p = localStorage.getItem(STORAGE_POSTS);
    if (p) state.posts = JSON.parse(p);

    const l = localStorage.getItem(STORAGE_LIKES);
    if (l) state.likes = new Set(JSON.parse(l));

    state.draft      = localStorage.getItem(STORAGE_DRAFT)       || '';
    state.replyDraft = localStorage.getItem(STORAGE_REPLY_DRAFT) || '';
  } catch(e) {
    console.warn('Storage load error:', e);
  }
}

function saveUser()       { localStorage.setItem(STORAGE_USER,  JSON.stringify(state.user)); }
function savePosts()      { localStorage.setItem(STORAGE_POSTS, JSON.stringify(state.posts)); }
function saveLikes()      { localStorage.setItem(STORAGE_LIKES, JSON.stringify([...state.likes])); }
function saveDraft()      { localStorage.setItem(STORAGE_DRAFT,       state.draft); }
function saveReplyDraft() { localStorage.setItem(STORAGE_REPLY_DRAFT, state.replyDraft); }

// ── Utilities ─────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s`;
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d <  7) return `${d}d`;
  return new Date(ts).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
}

function isPrintableKey(key) {
  return key.length === 1;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function el(id) { return document.getElementById(id); }

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Denied animation ─────────────────────────────
function showDenied(composerId) {
  const composer = el(composerId);
  if (!composer) return;

  composer.classList.remove('shake');
  void composer.offsetWidth; // force reflow to restart animation
  composer.classList.add('shake');
  setTimeout(() => composer.classList.remove('shake'), 400);

  const header = composer.querySelector('.composer-header');
  const label  = composer.querySelector('.composer-label');
  if (!header || !label) return;

  const orig = label.textContent;
  header.classList.add('denied');
  label.textContent = 'REDACTED';

  setTimeout(() => {
    header.classList.remove('denied');
    label.textContent = orig;
  }, 300);
}

// ── Seed posts ────────────────────────────────────
function buildSeedPosts() {
  const now = Date.now();
  const h   = 3_600_000;
  const d   = 86_400_000;

  return [
    {
      id:        generateId(),
      username:  SYSTEM_USER,
      content:   'Welcome to SPITBALL.\n\nWords land here. Forever.\n\nNo delete. No backspace. No images. No video. Just text — permanent, unedited, exactly as you typed it.',
      createdAt: now - 2 * d,
      parentId:  null,
      likeCount: 0,
    },
    {
      id:        generateId(),
      username:  SYSTEM_USER,
      content:   'THE RULES:\n\n— Backspace is disabled.\n— There are no drafts.\n— No images. No video. Ever.\n— Once typed, a character is permanent.\n— "Spit it" is just a formality. You\'ve already said it.',
      createdAt: now - d - 4 * h,
      parentId:  null,
      likeCount: 0,
    },
    {
      id:        generateId(),
      username:  SYSTEM_USER,
      content:   'A typo is not a mistake.\n\nIt is a record of how fast you were thinking.',
      createdAt: now - 6 * h,
      parentId:  null,
      likeCount: 0,
    },
  ];
}

// ── Routing ───────────────────────────────────────
function navigate(view, data) {
  deactivateComposer('main');
  deactivateComposer('reply');

  state.currentView   = view;
  state.currentPostId = data || null;

  el('view-feed').classList.toggle('hidden',    view !== 'feed');
  el('view-post').classList.toggle('hidden',    view !== 'post');
  el('view-profile').classList.toggle('hidden', view !== 'profile');

  el('nav-feed-link').classList.toggle('active',    view === 'feed');
  el('nav-profile-link').classList.toggle('active', view === 'profile');

  if (view === 'feed')    renderFeed();
  if (view === 'post')    renderPostView(data);
  if (view === 'profile') renderProfile();

  const hashMap = { feed: 'feed', profile: 'profile', post: `post/${data}` };
  history.replaceState(null, '', `#${hashMap[view]}`);

  window.scrollTo(0, 0);
}

function handleHashChange() {
  const hash = window.location.hash.replace('#', '');

  if (hash.startsWith('post/')) {
    const id     = hash.slice(5);
    const exists = state.posts.find(p => p.id === id);
    navigate(exists ? 'post' : 'feed', id);
  } else if (hash === 'profile') {
    navigate('profile');
  } else {
    navigate('feed');
  }
}

// ── Rendering: single post ────────────────────────
function buildPostHTML(post, opts = {}) {
  const { isDetail = false, isReply = false } = opts;
  const isLiked    = state.likes.has(post.id);
  const isSystem   = post.username === SYSTEM_USER;
  const replyCount = state.posts.filter(p => p.parentId === post.id).length;

  const wrapperClass = [
    'post',
    isDetail ? 'is-detail' : '',
    isReply  ? 'is-reply'  : '',
  ].filter(Boolean).join(' ');

  // "↩ replying to @user" — shown inside reply posts
  let replyContextHTML = '';
  if (isReply && post.parentId) {
    const parent = state.posts.find(p => p.id === post.parentId);
    if (parent) {
      replyContextHTML = `<div class="reply-context">↩ replying to @${escapeHTML(parent.username)}</div>`;
    }
  }

  // "Continue thread →" — shown when a reply has its own replies
  let continueHTML = '';
  if (isReply && replyCount > 0) {
    continueHTML = `<div class="thread-continue">Continue thread (${replyCount}) →</div>`;
  }

  return `
    <article class="${wrapperClass}" data-post-id="${post.id}">
      ${replyContextHTML}
      <div class="post-header">
        <span class="post-username${isSystem ? ' is-system' : ''}">@${escapeHTML(post.username)}</span>
        <span class="post-time">${formatRelativeTime(post.createdAt)}</span>
      </div>
      <div class="post-content">${escapeHTML(post.content)}</div>
      <div class="post-actions">
        <button
          class="action-btn mark-btn${isLiked ? ' is-marked' : ''}"
          data-post-id="${post.id}"
          ${isLiked ? 'disabled' : ''}
          aria-label="${isLiked ? 'Already marked' : 'Mark this spit'}"
        >${isLiked ? '■' : '□'} <span class="mark-count">${post.likeCount}</span></button>
        ${!isReply ? `
        <button
          class="action-btn reply-btn"
          data-post-id="${post.id}"
          aria-label="Reply"
        >↩ ${replyCount}</button>` : ''}
      </div>
      ${continueHTML}
    </article>`;
}

// Wrap a reply post in a thread-item (with spine/connector line)
function buildThreadItemHTML(reply, isLast) {
  return `
    <div class="thread-item">
      <div class="thread-spine">
        <div class="thread-spine-line"></div>
        <div class="thread-spine-cap"></div>
      </div>
      ${buildPostHTML(reply, { isReply: true })}
    </div>`;
}

// ── Event binding ─────────────────────────────────
function bindPostActions(container) {
  container.querySelectorAll('.mark-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!btn.disabled) markPost(btn.dataset.postId);
    });
  });

  container.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navigate('post', btn.dataset.postId);
    });
  });

  // Clicking a post (non-detail) → open its page
  container.querySelectorAll('.post:not(.is-detail)').forEach(post => {
    post.addEventListener('click', () => navigate('post', post.dataset.postId));
  });
}

// ── Rendering: feed ───────────────────────────────
function renderFeed() {
  syncComposerUI('main');
  el('draft-notice').classList.toggle('hidden', state.draft.length === 0);

  const topLevel = state.posts
    .filter(p => !p.parentId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const feedEl = el('feed');
  if (topLevel.length === 0) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-heading">Nothing here yet.</div>
        <div class="empty-state-sub">Start a spit above.</div>
      </div>`;
  } else {
    feedEl.innerHTML = topLevel.map(p => buildPostHTML(p)).join('');
    bindPostActions(feedEl);
  }
}

// ── Rendering: post detail ────────────────────────
function renderPostView(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (!post) { navigate('feed'); return; }

  const detailEl = el('post-detail-container');
  detailEl.innerHTML = buildPostHTML(post, { isDetail: true });
  bindPostActions(detailEl);

  syncComposerUI('reply');
  renderReplies(postId);
}

function renderReplies(postId) {
  const replies = state.posts
    .filter(p => p.parentId === postId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const repliesEl = el('replies-container');
  if (replies.length === 0) {
    repliesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-sub">No replies yet.</div>
      </div>`;
  } else {
    repliesEl.innerHTML = replies
      .map((r, i) => buildThreadItemHTML(r, i === replies.length - 1))
      .join('');
    bindPostActions(repliesEl);
  }
}

// ── Rendering: profile ────────────────────────────
function renderProfile() {
  const u          = state.user;
  const userPosts  = state.posts.filter(p => p.username === u.username && !p.parentId)
                                .sort((a, b) => b.createdAt - a.createdAt);
  const userReplies = state.posts.filter(p => p.username === u.username && p.parentId);
  const totalMarks  = state.posts
    .filter(p => p.username === u.username)
    .reduce((acc, p) => acc + (p.likeCount || 0), 0);

  const joinDate = new Date(u.joinedAt).toLocaleDateString('en-US',
    { month: 'long', day: 'numeric', year: 'numeric' });

  el('profile-header-container').innerHTML = `
    <div class="profile-header">
      <div class="profile-handle">@${escapeHTML(u.username)}</div>
      <div class="profile-meta">Member since ${joinDate}</div>
      <div class="profile-badge">Permanent Record</div>
      <div class="profile-stats">
        <div class="stat">
          <span class="stat-value">${userPosts.length}</span>
          <span class="stat-label">Spits</span>
        </div>
        <div class="stat">
          <span class="stat-value">${userReplies.length}</span>
          <span class="stat-label">Replies</span>
        </div>
        <div class="stat">
          <span class="stat-value">${totalMarks}</span>
          <span class="stat-label">Marks</span>
        </div>
      </div>
    </div>`;

  const postsEl = el('profile-posts-container');
  if (userPosts.length === 0) {
    postsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-sub">No spits yet.</div>
      </div>`;
  } else {
    postsEl.innerHTML = userPosts.map(p => buildPostHTML(p)).join('');
    bindPostActions(postsEl);
  }
}

// ── Composer UI sync ─────────────────────────────
function syncComposerUI(type) {
  if (type === 'main') {
    const draft  = state.draft;
    const active = state.mainComposerActive;

    setText('main-composer-chars', draft);
    setText('main-char-count', draft.length);

    const countEl = el('main-char-count').parentElement;
    countEl.classList.toggle('near-limit', draft.length >= 240);
    countEl.classList.toggle('at-limit',   draft.length >= MAX_CHARS);

    el('btn-blot').disabled = draft.trim().length === 0;
    el('main-composer-body').classList.toggle('active', active);
    el('main-cursor').classList.toggle('fast', active);

    const hint = el('main-composer-hint');
    if (active) {
      hint.textContent = 'Composing — no backspace — no mercy';
    } else if (draft.length > 0) {
      hint.textContent = 'Click to resume — draft saved forever';
    } else {
      hint.textContent = 'Click to compose — no backspace — no mercy';
    }
  } else {
    const draft  = state.replyDraft;
    const active = state.replyComposerActive;

    setText('reply-composer-chars', draft);
    setText('reply-char-count', draft.length);

    const countEl = el('reply-char-count').parentElement;
    countEl.classList.toggle('near-limit', draft.length >= 240);
    countEl.classList.toggle('at-limit',   draft.length >= MAX_CHARS);

    el('btn-blot-reply').disabled = draft.trim().length === 0;
    el('reply-composer-body').classList.toggle('active', active);
    el('reply-cursor').classList.toggle('fast', active);

    const hint = el('reply-composer-hint');
    if (active) {
      hint.textContent = 'Composing reply — no take-backs';
    } else if (draft.length > 0) {
      hint.textContent = 'Click to resume reply';
    } else {
      hint.textContent = 'Click to reply — no take-backs';
    }
  }
}

// ── Composer activation ──────────────────────────
function activateComposer(type) {
  state.mainComposerActive  = type === 'main';
  state.replyComposerActive = type === 'reply';

  syncComposerUI('main');
  syncComposerUI('reply');

  // Sync + focus hidden input to open mobile keyboard
  const hidden = el('hidden-input');
  const draft  = type === 'main' ? state.draft : state.replyDraft;
  hidden.value  = draft;
  prevHiddenValue = draft;
  hidden.focus();
}

function deactivateComposer(type) {
  if (type === 'main'  && !state.mainComposerActive)  return;
  if (type === 'reply' && !state.replyComposerActive) return;

  state.mainComposerActive  = false;
  state.replyComposerActive = false;

  syncComposerUI('main');
  syncComposerUI('reply');
}

// ── Keystroke handling ────────────────────────────
function handleDocumentKeyDown(e) {
  const active = state.mainComposerActive || state.replyComposerActive;
  if (!active) return;

  const type       = state.mainComposerActive ? 'main' : 'reply';
  const composerId = type === 'main' ? 'main-composer' : 'reply-composer';

  // Allow standard browser shortcuts (Ctrl+C, Ctrl+A, F-keys, etc.)
  if (e.metaKey || e.ctrlKey) {
    if (e.key === 'v' || e.key === 'V') {
      // No paste!
      e.preventDefault();
      showDenied(composerId);
    }
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    showDenied(composerId);
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    deactivateComposer(type);
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    appendToDraft(type, '\n');
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    appendToDraft(type, '  ');
    return;
  }

  if (!isPrintableKey(e.key)) return;

  e.preventDefault();
  appendToDraft(type, e.key);
}

// Hidden input: mobile keyboard fallback
let prevHiddenValue  = '';
let isRestoringInput = false;

function handleHiddenInput() {
  if (isRestoringInput) { isRestoringInput = false; return; }

  const hidden = el('hidden-input');
  const newVal = hidden.value;
  const active = state.mainComposerActive || state.replyComposerActive;
  if (!active) return;

  const type       = state.mainComposerActive ? 'main' : 'reply';
  const composerId = type === 'main' ? 'main-composer' : 'reply-composer';

  if (newVal.length < prevHiddenValue.length) {
    // Deletion detected — restore and deny
    isRestoringInput = true;
    hidden.value     = prevHiddenValue;
    showDenied(composerId);
    return;
  }

  const added = newVal.slice(prevHiddenValue.length);
  prevHiddenValue = newVal;

  for (const char of added) {
    appendToDraft(type, char);
  }
}

function handleHiddenPaste(e) {
  const active = state.mainComposerActive || state.replyComposerActive;
  if (!active) return;
  e.preventDefault();
  const composerId = state.mainComposerActive ? 'main-composer' : 'reply-composer';
  showDenied(composerId);
}

function appendToDraft(type, char) {
  const composerId = type === 'main' ? 'main-composer' : 'reply-composer';
  const current    = type === 'main' ? state.draft : state.replyDraft;

  if (current.length >= MAX_CHARS) {
    showDenied(composerId);
    return;
  }

  if (type === 'main') {
    state.draft += char;
    saveDraft();
    syncComposerUI('main');
    el('draft-notice').classList.toggle('hidden', state.draft.length === 0);
  } else {
    state.replyDraft += char;
    saveReplyDraft();
    syncComposerUI('reply');
  }

  // Keep hidden input in sync
  const hidden = el('hidden-input');
  const val    = type === 'main' ? state.draft : state.replyDraft;
  hidden.value    = val;
  prevHiddenValue = val;
}

// ── Post actions ─────────────────────────────────
function markPost(postId) {
  if (state.likes.has(postId)) return; // permanent — can't un-mark

  state.likes.add(postId);
  const post = state.posts.find(p => p.id === postId);
  if (post) post.likeCount = (post.likeCount || 0) + 1;

  savePosts();
  saveLikes();

  if (state.currentView === 'feed')    renderFeed();
  if (state.currentView === 'post')    renderPostView(state.currentPostId);
  if (state.currentView === 'profile') renderProfile();
}

function spit() {
  if (!state.draft.trim()) return;

  const post = {
    id:        generateId(),
    username:  state.user.username,
    content:   state.draft,
    createdAt: Date.now(),
    parentId:  null,
    likeCount: 0,
  };

  state.posts.unshift(post);
  state.draft = '';

  savePosts();
  saveDraft();
  deactivateComposer('main');
  renderFeed();

  // Success flash
  const label = el('main-composer-label');
  if (label) {
    label.textContent = 'SPAT — PERMANENT';
    setTimeout(() => { label.textContent = 'New Spit'; }, 2000);
  }
}

function spitReply() {
  if (!state.replyDraft.trim() || !state.currentPostId) return;

  const reply = {
    id:        generateId(),
    username:  state.user.username,
    content:   state.replyDraft,
    createdAt: Date.now(),
    parentId:  state.currentPostId,
    likeCount: 0,
  };

  state.posts.push(reply);
  state.replyDraft = '';

  savePosts();
  saveReplyDraft();
  deactivateComposer('reply');

  // Re-render replies and the detail post (reply count updates)
  renderReplies(state.currentPostId);
  syncComposerUI('reply');

  const parent = state.posts.find(p => p.id === state.currentPostId);
  const detailEl = el('post-detail-container');
  if (detailEl && parent) {
    detailEl.innerHTML = buildPostHTML(parent, { isDetail: true });
    bindPostActions(detailEl);
  }

  const label = el('reply-composer-label');
  if (label) {
    label.textContent = 'REPLY SPAT';
    setTimeout(() => { label.textContent = 'Your Reply'; }, 2000);
  }
}

// ── Username setup ────────────────────────────────
let usernameDraft = '';

function initUsernameSetup() {
  document.addEventListener('keydown', handleUsernameKey);
  el('btn-confirm-username').addEventListener('click', confirmUsername);
  el('username-input-display').addEventListener('click', () => el('hidden-input').focus());
}

function handleUsernameKey(e) {
  if (el('modal-setup').classList.contains('hidden')) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (!el('btn-confirm-username').disabled) confirmUsername();
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    const d = el('username-input-display');
    d.classList.remove('shake');
    void d.offsetWidth;
    d.classList.add('shake');
    setTimeout(() => d.classList.remove('shake'), 400);
    return;
  }

  if (e.metaKey || e.ctrlKey) return;
  if (!isPrintableKey(e.key)) return;

  e.preventDefault();

  if (usernameDraft.length >= 20) return;

  if (!/[a-zA-Z0-9_]/.test(e.key)) {
    const feedbackEl = el('username-feedback');
    feedbackEl.textContent = 'Letters, numbers, and underscores only';
    feedbackEl.classList.remove('hidden');
    setTimeout(() => feedbackEl.classList.add('hidden'), 1800);
    return;
  }

  usernameDraft += e.key.toLowerCase();
  setText('username-chars', usernameDraft);
  el('btn-confirm-username').disabled = usernameDraft.length < 2;
}

function confirmUsername() {
  if (usernameDraft.length < 2) return;

  state.user = {
    id:       generateId(),
    username: usernameDraft,
    joinedAt: Date.now(),
  };

  state.posts = buildSeedPosts();
  savePosts();
  saveUser();

  document.removeEventListener('keydown', handleUsernameKey);
  el('modal-setup').classList.add('hidden');
  bootApp();
}

// ── Click-outside deactivation ───────────────────
function handleDocumentClick(e) {
  const mainWrapper  = el('main-composer-wrapper');
  const replyWrapper = el('reply-composer-wrapper');

  if (state.mainComposerActive && mainWrapper && !mainWrapper.contains(e.target)) {
    deactivateComposer('main');
  }
  if (state.replyComposerActive && replyWrapper && !replyWrapper.contains(e.target)) {
    deactivateComposer('reply');
  }
}

// ── Boot ─────────────────────────────────────────
function bootApp() {
  el('app').classList.remove('hidden');
  setText('nav-username-display', state.user.username);

  // Nav
  el('nav-home-link').addEventListener('click', e => { e.preventDefault(); navigate('feed'); });
  el('nav-feed-link').addEventListener('click', e => { e.preventDefault(); navigate('feed'); });
  el('nav-profile-link').addEventListener('click', e => { e.preventDefault(); navigate('profile'); });

  // Main composer
  el('main-composer-wrapper').addEventListener('click', e => {
    if (!e.target.closest('#btn-blot')) activateComposer('main');
  });
  el('btn-blot').addEventListener('click', e => { e.stopPropagation(); spit(); });

  // Reply composer
  el('reply-composer-wrapper').addEventListener('click', e => {
    if (!e.target.closest('#btn-blot-reply')) activateComposer('reply');
  });
  el('btn-blot-reply').addEventListener('click', e => { e.stopPropagation(); spitReply(); });

  // Back button
  el('btn-back').addEventListener('click', () => navigate('feed'));

  // Global keyboard capture (desktop)
  document.addEventListener('keydown', handleDocumentKeyDown);

  // Hidden input (mobile fallback)
  const hidden = el('hidden-input');
  hidden.addEventListener('input', handleHiddenInput);
  hidden.addEventListener('paste', handleHiddenPaste);

  // Click-outside deactivation
  document.addEventListener('click', handleDocumentClick);

  // Hash routing
  window.addEventListener('hashchange', handleHashChange);

  // Initial view
  handleHashChange();
}

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();

  if (!state.user) {
    // Setup modal is visible by default
    initUsernameSetup();
  } else {
    el('modal-setup').classList.add('hidden');
    bootApp();
  }
});
