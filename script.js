/**
 * Daily Quote - client-side logic
 * Features:
 * - Quote rendering with category filtering
 * - Autoplay (interval-based) with speed control
 * - Favorites (persisted to localStorage) with drawer management
 * - Theme toggle (light/dark) persisted
 * - Copy, Speak (SpeechSynthesis), and Share (Web Share API with fallbacks)
 */

(function () {
  "use strict";

  // ---------- Utilities ----------
  function $(selector, root = document) {
    const el = root.querySelector(selector);
    if (!el) {
      console.warn("Selector not found:", selector);
    }
    return el;
  }

  function on(el, event, handler, options) {
    el.addEventListener(event, handler, options || false);
  }

  function computeId(text, author) {
    // Simple deterministic hash-based ID from text and author
    const str = `${text}—${author}`;
    let hash = 0;
    for (const ch of str) {
      const code = ch.codePointAt(0);
      hash = (hash << 5) - hash + code;
      hash |= 0;
    }
    return `q${Math.abs(hash)}`;
  }

  function saveLS(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }
  }

  function loadLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // ---------- Data ----------
  const CATEGORIES = ["All", "Motivation", "Wisdom", "Humor", "Productivity", "Perseverance"];

  const QUOTES = [
    // Motivation
    { text: "The future depends on what you do today.", author: "Mahatma Gandhi", category: "Motivation" },
    { text: "You miss 100% of the shots you don’t take.", author: "Wayne Gretzky", category: "Motivation" },
    { text: "Dream big and dare to fail.", author: "Norman Vaughan", category: "Motivation" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James", category: "Motivation" },

    // Wisdom
    { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle", category: "Wisdom" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein", category: "Wisdom" },
    { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates", category: "Wisdom" },
    { text: "Do not seek to follow in the footsteps of the wise; seek what they sought.", author: "Matsuo Basho", category: "Wisdom" },

    // Humor
    { text: "I can resist everything except temptation.", author: "Oscar Wilde", category: "Humor" },
    { text: "I am so clever that sometimes I don’t understand a single word of what I am saying.", author: "Oscar Wilde", category: "Humor" },
    { text: "If you think nobody cares if you’re alive, try missing a couple of payments.", author: "Earl Wilson", category: "Humor" },
    { text: "I find television very educating. Every time somebody turns on the set, I go into the other room and read a book.", author: "Groucho Marx", category: "Humor" },

    // Productivity
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss", category: "Productivity" },
    { text: "It’s not that I’m so smart, it’s just that I stay with problems longer.", author: "Albert Einstein", category: "Productivity" },
    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", category: "Productivity" },
    { text: "Simplicity boils down to two steps: Identify the essential. Eliminate the rest.", author: "Leo Babauta", category: "Productivity" },

    // Perseverance
    { text: "It always seems impossible until it’s done.", author: "Nelson Mandela", category: "Perseverance" },
    { text: "Fall seven times, stand up eight.", author: "Japanese Proverb", category: "Perseverance" },
    { text: "Perseverance is not a long race; it is many short races one after the other.", author: "Walter Elliot", category: "Perseverance" },
    { text: "Courage is not having the strength to go on; it is going on when you don’t have the strength.", author: "Theodore Roosevelt", category: "Perseverance" },

    // Extras to reduce repetition
    { text: "What we think, we become.", author: "Buddha", category: "Wisdom" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt", category: "Motivation" },
    { text: "Well done is better than well said.", author: "Benjamin Franklin", category: "Productivity" },
    { text: "If you’re going through hell, keep going.", author: "Winston Churchill", category: "Perseverance" }
  ].map(q => ({ ...q, id: computeId(q.text, q.author) }));

  // ---------- Elements ----------
  const el = {
    quoteText: $("#quoteText"),
    quoteAuthor: $("#quoteGenius"),
    quoteCategory: $("#quoteCategory"),
    quoteButton: $("#quoteButton"),

    copyBtn: $("#copyBtn"),
    speakBtn: $("#speakBtn"),
    shareBtn: $("#shareBtn"),
    favBtn: $("#favBtn"),

    themeToggle: $("#themeToggle"),

    favoritesCount: $("#favoritesCount"),
    favoritesOpenBtn: $("#favoritesOpenBtn"),
    favoritesCloseBtn: $("#favoritesCloseBtn"),
    favoritesDrawer: $("#favoritesDrawer"),
    favoritesList: $("#favoritesList"),
    overlay: $("#overlay"),

    categorySelect: $("#categorySelect"),
    autoplayToggle: $("#autoplayToggle"),
    autoplaySpeed: $("#autoplaySpeed")
  };

  // ---------- State ----------
  let currentQuote = null;
  let favorites = loadLS("dq_favorites", []);
  let autoplayTimer = null;

  // Theme: "light" | "dark"
  let theme = loadLS("dq_theme", null);

  // ---------- Initialization ----------
  function init() {
    // Restore controls
    const savedCategory = loadLS("dq_category", "All");
    if (CATEGORIES.includes(savedCategory)) {
      el.categorySelect.value = savedCategory;
    }

    const savedAutoplayEnabled = !!loadLS("dq_autoplayEnabled", false);
    const savedAutoplaySpeed = parseInt(loadLS("dq_autoplaySpeed", 10), 10);
    el.autoplayToggle.checked = savedAutoplayEnabled;
    if ([5, 10, 20].includes(savedAutoplaySpeed)) {
      el.autoplaySpeed.value = String(savedAutoplaySpeed);
    }

    // Init theme
    initTheme();

    // Wire events
    wireEvents();

    // Initial render
    updateFavoritesCount();
    renderFavoritesList();

    // Show initial quote
    showNewQuote();

    // Maybe start autoplay
    if (el.autoplayToggle.checked) {
      startAutoplay();
    }
  }

  function wireEvents() {
    // Quote actions
    on(el.quoteButton, "click", () => showNewQuote(true));
    on(el.copyBtn, "click", copyCurrentQuote);
    on(el.speakBtn, "click", toggleSpeakCurrentQuote);
    on(el.shareBtn, "click", shareCurrentQuote);
    on(el.favBtn, "click", toggleFavoriteCurrentQuote);

    // Category and autoplay controls
    on(el.categorySelect, "change", onCategoryChange);
    on(el.autoplayToggle, "change", onAutoplayToggle);
    on(el.autoplaySpeed, "change", onAutoplaySpeedChange);

    // Theme
    on(el.themeToggle, "click", toggleTheme);

    // Favorites drawer
    on(el.favoritesOpenBtn, "click", openFavoritesDrawer);
    on(el.favoritesCloseBtn, "click", closeFavoritesDrawer);
    on(el.overlay, "click", closeFavoritesDrawer);
    on(document, "keydown", (e) => {
      if (e.key === "Escape" && !isDrawerHidden()) {
        closeFavoritesDrawer();
      }
    });

    // Favorites list event delegation
    on(el.favoritesList, "click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      const fav = favorites.find(f => f.id === id);
      if (!fav) return;
      if (action === "remove") {
        removeFavoriteById(id);
      } else if (action === "copy") {
        copyQuote(fav);
      } else if (action === "share") {
        shareQuote(fav);
      }
    });
  }

  // ---------- Theme ----------
  function initTheme() {
    const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = theme || (systemPrefersDark ? "dark" : "light");
    setTheme(initial);
    // React to system changes only if user hasn't chosen explicitly
    if (!theme && window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (!theme) {
          setTheme(e.matches ? "dark" : "light");
        }
      });
    }
  }

  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    // Update button icon
    const icon = el.themeToggle.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-sun", "fa-moon");
      icon.classList.add(mode === "dark" ? "fa-sun" : "fa-moon");
      el.themeToggle.setAttribute("title", mode === "dark" ? "Switch to Light" : "Switch to Dark");
      el.themeToggle.setAttribute("aria-label", el.themeToggle.getAttribute("title"));
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    theme = next;
    saveLS("dq_theme", theme);
    setTheme(next);
  }

  // ---------- Quotes ----------
  function getPoolForCategory(category) {
    if (!category || category === "All") return QUOTES;
    return QUOTES.filter(q => q.category === category);
  }

  function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function getRandomQuote(category) {
    const pool = getPoolForCategory(category);
    if (!pool.length) return null;
    let q = randomFrom(pool);
    // Avoid immediate repeat
    if (currentQuote && pool.length > 1) {
      let safety = 10;
      while (q.id === currentQuote.id && safety-- > 0) {
        q = randomFrom(pool);
      }
    }
    return q;
  }

  function showNewQuote(userInitiated = false) {
    const category = el.categorySelect.value || "All";
    const q = getRandomQuote(category);
    if (!q) {
      // Should not happen with provided data
      el.quoteText.textContent = "No quotes available.";
      el.quoteAuthor.textContent = "";
      el.quoteCategory.textContent = "";
      return;
    }
    currentQuote = q;
    renderCurrentQuote();

    // If user clicks "New Quote", and autoplay is running, reset the timer to feel responsive
    if (userInitiated && autoplayTimer) {
      restartAutoplay();
    }
  }

  function renderCurrentQuote() {
    if (!currentQuote) return;
    el.quoteText.textContent = currentQuote.text;
    el.quoteAuthor.textContent = `— ${currentQuote.author}`;
    el.quoteCategory.textContent = currentQuote.category;
    updateFavButtonState();
  }

  // ---------- Favorites ----------
  function isFavorite(id) {
    return favorites.some(f => f.id === id);
  }

  function toggleFavoriteCurrentQuote() {
    if (!currentQuote) return;
    if (isFavorite(currentQuote.id)) {
      removeFavoriteById(currentQuote.id);
    } else {
      addFavorite(currentQuote);
    }
    updateFavButtonState();
  }

  function addFavorite(q) {
    if (isFavorite(q.id)) return;
    favorites.unshift({ ...q, savedAt: Date.now() });
    saveLS("dq_favorites", favorites);
    updateFavoritesCount();
    renderFavoritesList();
    toast(el.favBtn, "Saved!");
  }

  function removeFavoriteById(id) {
    const idx = favorites.findIndex(f => f.id === id);
    if (idx >= 0) {
      favorites.splice(idx, 1);
      saveLS("dq_favorites", favorites);
      updateFavoritesCount();
      renderFavoritesList();
      if (currentQuote && currentQuote.id === id) {
        updateFavButtonState();
      }
    }
  }

  function updateFavButtonState() {
    const pressed = currentQuote ? isFavorite(currentQuote.id) : false;
    el.favBtn.setAttribute("aria-pressed", String(pressed));
    const icon = el.favBtn.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-regular", "fa-solid");
      icon.classList.add(pressed ? "fa-solid" : "fa-regular");
      // Ensure it's heart
      icon.classList.add("fa-heart");
    }
    el.favBtn.lastChild && (el.favBtn.lastChild.nodeType === Node.TEXT_NODE) && (el.favBtn.lastChild.textContent = pressed ? " Favorited" : " Favorite");
  }

  function updateFavoritesCount() {
    const count = favorites.length;
    el.favoritesCount.textContent = String(count);
  }

  function renderFavoritesList() {
    if (!favorites.length) {
      el.favoritesList.innerHTML = `<div class="empty-state">
        <p>No favorites yet.</p>
        <p>Add some quotes you love and they’ll show up here.</p>
      </div>`;
      return;
    }
    el.favoritesList.innerHTML = favorites
      .map(f => {
        const safeText = escapeHtml(f.text);
        const safeAuthor = escapeHtml(f.author);
        const safeCategory = escapeHtml(f.category);
        return `
          <div class="fav-item" data-id="${f.id}">
            <div class="fav-quote">
              <p class="quote"><i class="fa-solid fa-quote-left" aria-hidden="true"></i> ${safeText} <i class="fa-solid fa-quote-right" aria-hidden="true"></i></p>
              <p class="author">— ${safeAuthor}</p>
              <span class="tag">${safeCategory}</span>
            </div>
            <div class="fav-actions">
              <button class="btn ghost" data-action="copy" data-id="${f.id}" title="Copy"><i class="fa-solid fa-copy"></i></button>
              <button class="btn ghost" data-action="share" data-id="${f.id}" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
              <button class="btn ghost" data-action="remove" data-id="${f.id}" title="Remove"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Drawer ----------
  function isDrawerHidden() {
    return el.favoritesDrawer.getAttribute("aria-hidden") === "true";
  }

  function openFavoritesDrawer() {
    el.favoritesDrawer.setAttribute("aria-hidden", "false");
    el.overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeFavoritesDrawer() {
    el.favoritesDrawer.setAttribute("aria-hidden", "true");
    el.overlay.hidden = true;
    document.body.style.overflow = "";
  }

  // ---------- Controls handlers ----------
  function onCategoryChange() {
    const val = el.categorySelect.value;
    saveLS("dq_category", val);
    showNewQuote(true);
  }

  function onAutoplayToggle() {
    const enabled = el.autoplayToggle.checked;
    saveLS("dq_autoplayEnabled", enabled);
    if (enabled) {
      startAutoplay();
    } else {
      stopAutoplay();
    }
  }

  function onAutoplaySpeedChange() {
    const speed = clamp(parseInt(el.autoplaySpeed.value, 10) || 10, 5, 60);
    saveLS("dq_autoplaySpeed", speed);
    if (autoplayTimer) {
      restartAutoplay();
    }
  }

  function startAutoplay() {
    stopAutoplay();
    const speedSec = clamp(parseInt(el.autoplaySpeed.value, 10) || 10, 5, 60);
    autoplayTimer = setInterval(() => {
      showNewQuote(false);
    }, speedSec * 1000);
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function restartAutoplay() {
    if (!el.autoplayToggle.checked) return;
    startAutoplay();
  }

  // ---------- Copy / Speak / Share ----------
  function getQuoteText(q) {
    return `“${q.text}” — ${q.author}`;
  }

  async function copyQuote(q) {
    const text = getQuoteText(q);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  async function copyCurrentQuote() {
    if (!currentQuote) return;
    await copyQuote(currentQuote);
    toast(el.copyBtn, "Copied!");
  }

  function toggleSpeakCurrentQuote() {
    if (!currentQuote) return;
    if (!("speechSynthesis" in window)) {
      toast(el.speakBtn, "Not supported");
      return;
    }
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      synth.cancel();
      return;
    }
    const utter = new SpeechSynthesisUtterance(`${currentQuote.text}. — ${currentQuote.author}`);
    utter.rate = 1;
    utter.pitch = 1;
    // Prefer a voice matching document language
    const lang = document.documentElement.lang || "en-US";
    utter.lang = lang;
    synth.speak(utter);
  }

  async function shareQuote(q) {
    const text = getQuoteText(q);
    const shareData = {
      title: "Daily Quote",
      text
    };
    if (navigator.share && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // Ignore cancellation
      }
    }
    // Fallback: try Twitter or copy
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // If pop-up blocked, copy instead
      await copyQuote(q);
    }
  }

  async function shareCurrentQuote() {
    if (!currentQuote) return;
    await shareQuote(currentQuote);
    toast(el.shareBtn, "Ready to share");
  }

  // ---------- Small UI feedback ----------
  let toastTimer = null;
  function toast(buttonEl, message) {
    if (!buttonEl) return;
    const original = buttonEl.textContent.trim();
    const icon = buttonEl.querySelector("i");
    buttonEl.disabled = true;
    if (icon) icon.style.opacity = "0.75";
    buttonEl.textContent = " " + message;
    if (icon) {
      // Put the icon back as first child
      buttonEl.prepend(icon);
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      buttonEl.textContent = " " + original;
      if (icon) buttonEl.prepend(icon);
      buttonEl.disabled = false;
      if (icon) icon.style.opacity = "";
    }, 1200);
  }

  // ---------- Start ----------
  document.addEventListener("DOMContentLoaded", init);
})();