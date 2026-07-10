(function () {
  const ALGOLIA_CDN =
    "https://cdn.jsdelivr.net/npm/algoliasearch@4/dist/algoliasearch-lite.umd.js";

  function loadScript(src) {
    console.log("[KFO] loadScript called:", src);
    return new Promise((resolve, reject) => {
      if (window.algoliasearch) {
        console.log("[KFO] algoliasearch already present, skipping load");
        resolve();
        return;
      }
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        console.log(
          "[KFO] script tag already in DOM, waiting for it to finish loading",
        );
        existing.addEventListener("load", () => {
          console.log("[KFO] existing script loaded:", src);
          resolve();
        });
        existing.addEventListener("error", (e) => {
          console.error("[KFO] existing script failed:", src, e);
          reject(e);
        });
        return;
      }
      console.log("[KFO] injecting new script tag:", src);
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => {
        console.log("[KFO] script loaded:", src);
        resolve();
      };
      s.onerror = (e) => {
        console.error("[KFO] script failed to load:", src, e);
        reject(e);
      };
      document.head.appendChild(s);
    });
  }

  async function init() {
    console.log("[KFO] init() started");
    const root = document.getElementById("kfo-widget");
    if (!root) {
      console.warn("[KFO] init() aborted: #kfo-widget element not found");
      return;
    }
    console.log("[KFO] mount element found, dataset:", { ...root.dataset });

    const appId = root.dataset.appId;
    const searchKey = root.dataset.searchKey;
    const idxComb = root.dataset.combinationsIndex || "kfo_combinations";
    const idxColors = root.dataset.colorsIndex || "kfo_colors";
    const idxTags = root.dataset.tagsIndex || "kfo_tags";
    const perPage = parseInt(root.dataset.perPage) || 12;
    const colorsPerPage = parseInt(root.dataset.colorsPerPage) || 5;
    const showSearch = root.dataset.showSearch !== "false";
    const showColors = root.dataset.showColors !== "false";
    const showTags = root.dataset.showTags !== "false";
    const colorFilterLabel =
      root.dataset.colorFilterLabel || "FILTER BY COLORS:";
    const heartUrl = root.dataset.heartUrl || "";
    const heartActiveUrl = root.dataset.heartActiveUrl || heartUrl;
    const favoritesUrl = root.dataset.favoritesUrl || "/pages/favorites";
    const defaultColors = root.dataset.defaultColors
      ? root.dataset.defaultColors
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const defaultTags = root.dataset.defaultTags
      ? root.dataset.defaultTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    await Promise.all([
      loadScript(ALGOLIA_CDN),
      loadScript(root.dataset.modalJsUrl),
    ]);
    console.log(
      "[KFO] algoliasearch ready, initializing client for app:",
      appId,
    );
    const client = window.algoliasearch(appId, searchKey);
    const combIndex = client.initIndex(idxComb);
    const colorsIndex = showColors ? client.initIndex(idxColors) : null;
    const tagsIndex = showTags ? client.initIndex(idxTags) : null;

    // --- State ---
    let query = "";
    let selectedColors = [...defaultColors];
    let selectedTags = [...defaultTags];
    let page = 0;
    let nbPages = 1;
    let allColors = [];
    let allTags = [];
    let debounceTimer = null;
    const sectionPerPage = {}; // colorId → hitsPerPage shown so far
    const COLORS_COLLAPSED = 8;
    const COLORS_COLLAPSED_MOBILE = 4;
    const colorsCollapsedCount = () =>
      window.matchMedia("(max-width: 480px)").matches
        ? COLORS_COLLAPSED_MOBILE
        : COLORS_COLLAPSED;
    // Initial combination cards shown per color section before "Show all".
    // Fewer at narrower widths so the page doesn't scroll as long; the
    // number roughly matches 2 rows at each breakpoint's column count
    // (4 cols on mobile/tablet, 4 cols at 1440, more on wide desktop).
    const SECTION_INITIAL = 12;
    const SECTION_INITIAL_1440 = 8;
    const SECTION_INITIAL_MOBILE = 4;
    const sectionInitialCount = () => {
      if (window.matchMedia("(max-width: 1024px)").matches)
        return SECTION_INITIAL_MOBILE;
      if (window.matchMedia("(max-width: 1440px)").matches)
        return SECTION_INITIAL_1440;
      return SECTION_INITIAL;
    };
    let colorsExpanded = false;
    let sectionObserver = null;

    // --- Favorites (localStorage) ---
    const FAV_KEY = "kfo_favorites";
    function getFavs() {
      try {
        return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      } catch {
        return [];
      }
    }
    function isFav(id) {
      return getFavs().includes(id);
    }
    function toggleFav(id) {
      const favs = getFavs();
      const idx = favs.indexOf(id);
      if (idx >= 0) favs.splice(idx, 1);
      else favs.push(id);
      localStorage.setItem(FAV_KEY, JSON.stringify(favs));
      window.dispatchEvent(new CustomEvent("kfo:favorites-changed"));
    }

    // --- "Added to favorite" toast ---
    let toastEl = null;
    let toastTimer = null;
    function ensureToast() {
      if (toastEl) return toastEl;
      toastEl = document.createElement("div");
      toastEl.className = "kfo-toast";
      toastEl.setAttribute("role", "status");
      toastEl.innerHTML = `
        <div class="kfo-toast-thumb"></div>
        <div class="kfo-toast-body">
          <span class="kfo-toast-title">ADDED TO FAVORITE!</span>
          <a class="kfo-toast-link" href="${favoritesUrl}">VIEW FAVORITES</a>
        </div>
        <button class="kfo-toast-close" type="button" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.20857L10.7914 0L6 4.79143L1.20857 0L0 1.20857L4.79143 6L0 10.7914L1.20857 12L6 7.20857L10.7914 12L12 10.7914L7.20857 6L12 1.20857Z" fill="currentColor"/></svg>
        </button>
      `;
      document.body.appendChild(toastEl);
      toastEl
        .querySelector(".kfo-toast-close")
        .addEventListener("click", hideToast);
      return toastEl;
    }
    function hideToast() {
      clearTimeout(toastTimer);
      toastEl?.classList.remove("kfo-toast--visible");
    }
    function showFavoriteToast(combo) {
      const el = ensureToast();
      const thumb = el.querySelector(".kfo-toast-thumb");
      thumb.innerHTML = combo.image_url
        ? `<img src="${combo.image_url}" alt="${combo.name || ""}" />`
        : "";
      // force reflow so re-triggering restarts the transition
      void el.offsetWidth;
      el.classList.add("kfo-toast--visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 4000);
    }

    // --- Load filter options ---
    const [colorsRes, tagsRes] = await Promise.all([
      showColors
        ? colorsIndex.search("", { hitsPerPage: 1000 })
        : Promise.resolve({ hits: [] }),
      showTags
        ? tagsIndex.search("", { hitsPerPage: 1000 })
        : Promise.resolve({ hits: [] }),
    ]);
    allColors = colorsRes.hits;
    allTags = tagsRes.hits;

    // --- Render shell ---
    root.innerHTML = `
      ${
        showSearch
          ? `
      <div class="kfo-header">
        <input class="kfo-search" type="text" placeholder="Search combinations…" autocomplete="off" />
      </div>`
          : ""
      }
      <div class="kfo-filters">
        ${
          showColors
            ? `
          <div class="kfo-filter-header">
            <span class="kfo-filter-label">${colorFilterLabel}</span>
            <button class="kfo-clear-btn" id="kfo-clear-btn">CLEAR ALL</button>
          </div>
          <div class="kfo-color-grid" id="kfo-color-filters"></div>
        `
            : '<button class="kfo-clear-btn" id="kfo-clear-btn">CLEAR ALL</button>'
        }
        ${showTags ? '<div class="kfo-filter-group" id="kfo-tag-filters"></div>' : ""}
      </div>
      <div id="kfo-grid"></div>
      <div class="kfo-pagination" id="kfo-pagination"></div>
    `;

    // --- Mount shared modal (kfo-modal.js) ---
    const modal = window.KfoModal.mount({
      heartUrl,
      heartActiveUrl,
      isFav,
      toggleFav,
      onFavoriteChange(combo, active) {
        // Keep the card grid's heart icon in sync with the modal.
        const cardHeart = root.querySelector(
          `.kfo-heart-btn[data-id="${combo.objectID}"] .kfo-heart-icon`,
        );
        if (cardHeart) cardHeart.src = active ? heartActiveUrl : heartUrl;
        root
          .querySelector(`.kfo-heart-btn[data-id="${combo.objectID}"]`)
          ?.classList.toggle("active", active);
        if (active) showFavoriteToast(combo);
      },
    });

    if (showColors) renderColorFilters();
    if (showTags) renderTagFilters();
    renderContent();

    // --- Event bindings ---
    root.querySelector(".kfo-search")?.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        query = e.target.value;
        page = 0;
        renderContent();
      }, 300);
    });

    document.getElementById("kfo-clear-btn").addEventListener("click", () => {
      query = "";
      selectedColors = [...defaultColors];
      selectedTags = [...defaultTags];
      page = 0;
      const searchEl = root.querySelector(".kfo-search");
      if (searchEl) searchEl.value = "";
      // Sync active states in place instead of re-rendering — re-rendering
      // would reload every swatch image and cause flicker.
      if (showColors) syncColorActiveStates();
      if (showTags) syncTagActiveStates();
      updateClearBtn();
      renderContent();
    });

    window.addEventListener("kfo:favorites-changed", () => {
      root.querySelectorAll(".kfo-heart-btn").forEach((btn) => {
        const active = isFav(btn.dataset.id);
        btn.classList.toggle("active", active);
        btn.querySelector(".kfo-heart-icon").src = active
          ? heartActiveUrl
          : heartUrl;
      });
    });

    // Re-render color filters when crossing the mobile breakpoint so the
    // collapsed count (4 on mobile, 8 on desktop) stays in sync.
    if (showColors) {
      let lastCollapsed = colorsCollapsedCount();
      let resizeTimer = null;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const next = colorsCollapsedCount();
          if (next !== lastCollapsed) {
            lastCollapsed = next;
            renderColorFilters();
          }
        }, 150);
      });
    }

    // Update active classes on existing filter buttons without re-rendering
    // (preserves <img> elements so swatch images don't reload / flicker).
    function syncColorActiveStates() {
      document
        .querySelectorAll("#kfo-color-filters .kfo-color-item")
        .forEach((btn) => {
          btn.classList.toggle(
            "active",
            selectedColors.includes(btn.dataset.id),
          );
        });
    }

    function syncTagActiveStates() {
      document
        .querySelectorAll("#kfo-tag-filters .kfo-tag-badge")
        .forEach((btn) => {
          const slug = btn.dataset.slug;
          const isActive = selectedTags.includes(slug);
          const t = allTags.find((x) => x.slug === slug);
          btn.classList.toggle("active", isActive);
          btn.style.cssText =
            isActive && t
              ? `background:${t.color};border-color:${t.color}`
              : "";
        });
    }

    // Show/hide the collapsed overflow via CSS instead of adding/removing
    // DOM nodes — keeps swatch <img> elements alive so they don't reload.
    function applyColorsCollapsed() {
      const el = document.getElementById("kfo-color-filters");
      const collapsed = colorsCollapsedCount();
      el.classList.toggle("kfo-colors-collapsed", !colorsExpanded);
      el.querySelectorAll(".kfo-color-item").forEach((btn, i) => {
        btn.classList.toggle("kfo-color-item--overflow", i >= collapsed);
      });
      const toggleBtn = el.querySelector("#kfo-see-toggle");
      if (toggleBtn)
        toggleBtn.textContent = colorsExpanded ? "SEE LESS" : "SEE MORE";
    }

    // --- Filter renderers ---
    function renderColorFilters() {
      const el = document.getElementById("kfo-color-filters");
      const hasToggle = allColors.length > colorsCollapsedCount();

      // Render every color once; collapsing only toggles CSS visibility.
      el.innerHTML =
        allColors
          .map(
            (c) => `
        <button class="kfo-color-item ${selectedColors.includes(c.objectID) ? "active" : ""}" data-id="${c.objectID}">
          <span class="kfo-color-item-main">
            ${
              c.image_url
                ? `<img class="kfo-color-swatch" src="${c.image_url}" alt="${c.name}" />`
                : `<span class="kfo-color-swatch" style="background:${c.hex}"></span>`
            }
            <span class="kfo-color-name">${c.name}</span>
          </span>
          <span class="kfo-color-close" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.20857L10.7914 0L6 4.79143L1.20857 0L0 1.20857L4.79143 6L0 10.7914L1.20857 12L6 7.20857L10.7914 12L12 10.7914L7.20857 6L12 1.20857Z" fill="currentColor"/></svg>
          </span>
        </button>
      `,
          )
          .join("") +
        (hasToggle
          ? `
        <button class="kfo-see-more-btn" id="kfo-see-toggle">${colorsExpanded ? "SEE LESS" : "SEE MORE"}</button>
      `
          : "");

      applyColorsCollapsed();

      el.querySelectorAll(".kfo-color-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          if (selectedColors.includes(id)) {
            selectedColors = selectedColors.filter((x) => x !== id);
            delete sectionPerPage[id];
          } else {
            selectedColors = [...selectedColors, id];
          }
          page = 0;
          // Toggle only this button's state — avoid re-rendering the whole
          // list, which would reload every swatch image and cause flicker.
          btn.classList.toggle("active", selectedColors.includes(id));
          updateClearBtn();
          renderContent();
        });
      });

      el.querySelector("#kfo-see-toggle")?.addEventListener("click", () => {
        colorsExpanded = !colorsExpanded;
        applyColorsCollapsed();
      });
    }

    function renderTagFilters() {
      const el = document.getElementById("kfo-tag-filters");
      el.innerHTML = allTags
        .map(
          (t) => `
        <button
          class="kfo-tag-badge ${selectedTags.includes(t.slug) ? "active" : ""}"
          data-slug="${t.slug}"
          style="${selectedTags.includes(t.slug) ? `background:${t.color};border-color:${t.color}` : ""}"
        >${t.name}</button>
      `,
        )
        .join("");
      el.querySelectorAll(".kfo-tag-badge").forEach((btn) => {
        btn.addEventListener("click", () => {
          const slug = btn.dataset.slug;
          const t = allTags.find((x) => x.slug === slug);
          selectedTags = selectedTags.includes(slug)
            ? selectedTags.filter((x) => x !== slug)
            : [...selectedTags, slug];
          page = 0;
          // Toggle only this badge — avoid re-rendering the whole list.
          const isActive = selectedTags.includes(slug);
          btn.classList.toggle("active", isActive);
          btn.style.cssText =
            isActive && t
              ? `background:${t.color};border-color:${t.color}`
              : "";
          updateClearBtn();
          renderContent();
        });
      });
    }

    function updateClearBtn() {
      // Clear All is always visible.
      const btn = document.getElementById("kfo-clear-btn");
      btn.style.display = "";
    }

    // --- Content rendering ---
    async function renderContent() {
      document.getElementById("kfo-pagination").innerHTML = "";
      await renderSections();
    }

    // Flat mode: no color selected → single grid + pagination
    async function renderFlat() {
      const grid = document.getElementById("kfo-grid");
      grid.className = "kfo-grid";
      grid.innerHTML =
        '<div class="kfo-loading"><span class="kfo-spinner"></span></div>';

      const facetFilters = [];
      if (selectedTags.length)
        facetFilters.push(selectedTags.map((s) => `tags:${s}`));

      const params = { hitsPerPage: perPage, page, facets: ["tags", "colors"] };
      if (facetFilters.length) params.facetFilters = facetFilters;

      const res = await combIndex.search(query, params);
      nbPages = res.nbPages || 1;

      if (!res.hits.length) {
        grid.innerHTML = '<p class="kfo-empty">No combinations found.</p>';
        renderPagination();
        return;
      }

      const colorMap = Object.fromEntries(
        allColors.map((c) => [c.objectID, c]),
      );
      grid.innerHTML = res.hits.map((c) => cardHtml(c)).join("");
      bindCards(grid, res.hits, colorMap);
      renderPagination();
    }

    // Section mode: render shells immediately, lazy-load cards via IntersectionObserver
    async function renderSections() {
      const grid = document.getElementById("kfo-grid");
      grid.className = "kfo-sections";

      const colorMap = Object.fromEntries(
        allColors.map((c) => [c.objectID, c]),
      );

      const colorIds =
        selectedColors.length > 0
          ? selectedColors
          : allColors.map((c) => c.objectID);
      const sorted = [...colorIds].sort(
        (a, b) =>
          allColors.findIndex((c) => c.objectID === a) -
          allColors.findIndex((c) => c.objectID === b),
      );

      // Paginate by color: only the current page's colors render as sections.
      nbPages = Math.max(1, Math.ceil(sorted.length / colorsPerPage));
      if (page > nbPages - 1) page = nbPages - 1;
      if (page < 0) page = 0;
      const pageColors = sorted.slice(
        page * colorsPerPage,
        (page + 1) * colorsPerPage,
      );

      // Disconnect previous observer before re-rendering
      if (sectionObserver) {
        sectionObserver.disconnect();
        sectionObserver = null;
      }

      // Render section shells immediately (header visible, grid pending)
      grid.innerHTML = pageColors
        .map((colorId) => {
          const color = colorMap[colorId];
          if (!color) return "";
          return `
          <div class="kfo-section" data-color-id="${colorId}">
            <div class="kfo-section-header">
              <div class="kfo-section-img-wrap">
                ${
                  color.content_image_url || color.image_url
                    ? `<img class="kfo-section-img" src="${color.content_image_url || color.image_url}" alt="${color.name}" />`
                    : `<div class="kfo-section-img kfo-section-img--color" style="background:${color.hex}"></div>`
                }
              </div>
              <div class="kfo-section-info">
                <h3 class="kfo-section-title">${color.content_title || color.name}</h3>
                ${color.description ? `<div class="kfo-section-desc">${color.description}</div>` : ""}
              </div>
            </div>
            <div class="kfo-section-body">
              <div class="kfo-loading"><span class="kfo-spinner"></span></div>
            </div>
          </div>
        `;
        })
        .join("");

      if (!grid.querySelector(".kfo-section")) {
        grid.innerHTML = '<p class="kfo-empty">No combinations found.</p>';
        return;
      }

      // Observe each section — load cards when it enters the viewport
      sectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const sectionEl = entry.target;
            sectionObserver.unobserve(sectionEl);
            // Reveal happens inside loadSectionCards, only once we know the
            // section actually has combinations (empty sections stay hidden).
            loadSectionCards(sectionEl.dataset.colorId, sectionEl, colorMap);
          });
        },
        { rootMargin: "200px 0px" },
      );

      grid
        .querySelectorAll(".kfo-section")
        .forEach((s) => sectionObserver.observe(s));

      renderPagination();
    }

    async function loadSectionCards(colorId, sectionEl, colorMap) {
      const body = sectionEl.querySelector(".kfo-section-body");
      const INITIAL = sectionInitialCount();
      if (!sectionPerPage[colorId]) sectionPerPage[colorId] = INITIAL;

      const facetFilters = [[`colors:${colorId}`]];
      if (selectedTags.length)
        facetFilters.push(selectedTags.map((s) => `tags:${s}`));

      const res = await combIndex.search(query, {
        hitsPerPage: sectionPerPage[colorId],
        facetFilters,
      });

      if (!res.hits.length) {
        sectionEl.style.display = "none";
        return;
      }

      // Has combinations → reveal the section now.
      sectionEl.classList.add("kfo-section--visible");

      const remaining = res.nbHits - res.hits.length;
      // If more results exist: show first N-1 cards + "Show all" overlay on the Nth slot
      const visibleHits = remaining > 0 ? res.hits.slice(0, -1) : res.hits;
      const showAllHit = remaining > 0 ? res.hits[res.hits.length - 1] : null;
      // Fully expanded beyond the first page → offer a "Show less" tile to collapse.
      const showLess = remaining === 0 && res.nbHits > INITIAL;

      body.innerHTML = `
        <div class="kfo-section-grid">
          ${visibleHits.map((h) => cardHtml(h)).join("")}
          ${
            showAllHit
              ? `
            <div class="kfo-show-all-card" role="button" tabindex="0">
              ${showAllHit.image_url ? `<img src="${showAllHit.image_url}" alt="" />` : '<div class="kfo-show-all-card-bg"></div>'}
              <div class="kfo-show-all-overlay">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22.1509 4.18994C23.2586 4.83611 23.9971 6.01767 23.9971 7.38385V16.6148C23.9971 20.6949 20.6924 23.9996 16.6124 23.9996H7.38141C6.01523 23.9996 4.83367 23.2611 4.1875 22.1534H16.6124C19.6586 22.1534 22.1509 19.661 22.1509 16.6148V4.18994ZM13.8431 9.23004C14.0879 9.23004 14.3227 9.32729 14.4958 9.50041C14.6689 9.67352 14.7662 9.90831 14.7662 10.1531C14.7662 10.398 14.6689 10.6327 14.4958 10.8059C14.3227 10.979 14.0879 11.0762 13.8431 11.0762H6.45831C6.21349 11.0762 5.9787 10.979 5.80559 10.8059C5.63247 10.6327 5.53522 10.398 5.53522 10.1531C5.53522 9.90831 5.63247 9.67352 5.80559 9.50041C5.9787 9.32729 6.21349 9.23004 6.45831 9.23004H13.8431Z" fill="currentColor"/><path d="M9.49793 5.80889C9.32482 5.98201 9.22756 6.2168 9.22756 6.46162V13.8464C9.22756 14.0912 9.32482 14.326 9.49793 14.4991C9.67104 14.6722 9.90584 14.7695 10.1507 14.7695C10.3955 14.7695 10.6303 14.6722 10.8034 14.4991C10.9765 14.326 11.0738 14.0912 11.0738 13.8464V6.46162C11.0738 6.2168 10.9765 5.98201 10.8034 5.80889C10.6303 5.63578 10.3955 5.53852 10.1507 5.53852C9.90584 5.53852 9.67104 5.63578 9.49793 5.80889Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.6157 0C18.6521 0 20.3081 1.65603 20.3081 3.69238V16.6157C20.3081 18.6521 18.6521 20.3081 16.6157 20.3081H3.69238C1.65603 20.3081 0 18.6521 0 16.6157V3.69238C0 1.65603 1.65603 0 3.69238 0H16.6157ZM3.69238 1.84619C2.67513 1.84619 1.84619 2.67513 1.84619 3.69238V16.6157C1.84619 17.6348 2.67513 18.4619 3.69238 18.4619H16.6157C17.633 18.4619 18.4619 17.6348 18.4619 16.6157V3.69238C18.4619 2.67513 17.633 1.84619 16.6157 1.84619H3.69238Z" fill="currentColor"/></svg>
                <span>Show all</span>
              </div>
            </div>
          `
              : ""
          }
          ${
            showLess
              ? `
            <div class="kfo-show-less-card" role="button" tabindex="0">
              <span class="kfo-show-less-inner">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14.7648 2.79346C15.5033 3.22424 15.9956 4.01196 15.9956 4.92276V11.0768C15.9956 13.7969 13.7925 16 11.0724 16H4.91836C4.00756 16 3.21985 15.5077 2.78906 14.7692H11.0724C13.1032 14.7692 14.7648 13.1076 14.7648 11.0768V2.79346ZM9.2262 6.15357C9.38941 6.15357 9.54594 6.2184 9.66135 6.33382C9.77676 6.44923 9.8416 6.60576 9.8416 6.76897C9.8416 6.93219 9.77676 7.08872 9.66135 7.20413C9.54594 7.31954 9.38941 7.38438 9.2262 7.38438H4.30296C4.13974 7.38438 3.98321 7.31954 3.8678 7.20413C3.75239 7.08872 3.68755 6.93219 3.68755 6.76897C3.68755 6.60576 3.75239 6.44923 3.8678 6.33382C3.98321 6.2184 4.13974 6.15357 4.30296 6.15357H9.2262Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M11.0773 0C12.4349 0 13.5389 1.10404 13.5389 2.46162V11.0773C13.5389 12.4349 12.4349 13.5389 11.0773 13.5389H2.46162C1.10404 13.5389 0 12.4349 0 11.0773V2.46162C0 1.10404 1.10404 0 2.46162 0H11.0773ZM2.46162 1.23081C1.78344 1.23081 1.23081 1.78344 1.23081 2.46162V11.0773C1.23081 11.7567 1.78344 12.3081 2.46162 12.3081H11.0773C11.7555 12.3081 12.3081 11.7567 12.3081 11.0773V2.46162C12.3081 1.78344 11.7555 1.23081 11.0773 1.23081H2.46162Z" fill="currentColor"/></svg>
                <span>Show less</span>
              </span>
            </div>
          `
              : ""
          }
        </div>
      `;

      body.querySelectorAll(".kfo-card").forEach((card) => {
        const combo = res.hits.find((h) => h.objectID === card.dataset.id);

        card.querySelector(".kfo-heart-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          toggleFav(combo.objectID);
          const active = isFav(combo.objectID);
          const btn = e.currentTarget;
          btn.classList.toggle("active", active);
          btn.querySelector(".kfo-heart-icon").src = active
            ? heartActiveUrl
            : heartUrl;
          if (active) showFavoriteToast(combo);
        });

        card
          .querySelector(".kfo-view-detail-btn")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            modal.open(combo);
          });

        card.addEventListener("click", () => modal.open(combo));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter") modal.open(combo);
        });
      });

      const showAllCard = body.querySelector(".kfo-show-all-card");
      showAllCard?.addEventListener("click", async () => {
        // Avoid double-clicks; keep the current grid visible while loading so the
        // section height only grows (no collapse) — prevents the page from jumping.
        if (showAllCard.classList.contains("is-loading")) return;
        showAllCard.classList.add("is-loading");
        sectionPerPage[colorId] = res.nbHits;
        await loadSectionCards(colorId, sectionEl, colorMap);
      });

      const showLessCard = body.querySelector(".kfo-show-less-card");
      showLessCard?.addEventListener("click", async () => {
        sectionPerPage[colorId] = INITIAL;
        await loadSectionCards(colorId, sectionEl, colorMap);
      });
    }

    // --- Card helpers ---
    function cardHtml(c) {
      return `
        <div class="kfo-card" data-id="${c.objectID}">
          <div class="kfo-card-img">
            ${
              c.image_url
                ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" />`
                : '<div class="kfo-card-img-placeholder"></div>'
            }
            <button class="kfo-heart-btn ${isFav(c.objectID) ? "active" : ""}" data-id="${c.objectID}" aria-label="Favorite">
              <img src="${isFav(c.objectID) ? heartActiveUrl : heartUrl}" alt="" class="kfo-heart-icon" />
            </button>
          </div>
          <div class="kfo-card-body">
            <p class="kfo-card-name">${c.name}</p>
            <button class="kfo-view-detail-btn" data-id="${c.objectID}">VIEW DETAIL</button>
          </div>
        </div>
      `;
    }

    function bindCards(container, hits, colorMap) {
      container.querySelectorAll(".kfo-card").forEach((card) => {
        const combo = hits.find((h) => h.objectID === card.dataset.id);

        card
          .querySelector(".kfo-view-detail-btn")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            modal.open(combo);
          });

        card.querySelector(".kfo-heart-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          toggleFav(combo.objectID);
          const active = isFav(combo.objectID);
          const btn = e.currentTarget;
          btn.classList.toggle("active", active);
          btn.querySelector(".kfo-heart-icon").src = active
            ? heartActiveUrl
            : heartUrl;
          if (active) showFavoriteToast(combo);
        });

        card.addEventListener("click", () => modal.open(combo));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter") modal.open(combo);
        });
      });
    }

    // --- Pagination (paginates color sections, 5 per page by default) ---
    // Build a compact page list with ellipses, always showing first/last,
    // the current page, and one neighbour on each side. e.g. 1 … 4 5 6 … 10
    function pageList(current, total) {
      const out = [];
      for (let i = 0; i < total; i++) {
        if (i === 0 || i === total - 1 || Math.abs(i - current) <= 1) {
          out.push(i);
        } else if (out[out.length - 1] !== "…") {
          out.push("…");
        }
      }
      return out;
    }

    function goToPage(p) {
      page = p;
      renderContent();
      // Scroll to the top of the widget. getBoundingClientRect + pageYOffset
      // gives the absolute position (root.offsetTop is relative to its
      // offsetParent, which is often not the document, so it scrolls short).
      const top = root.getBoundingClientRect().top + window.pageYOffset - 20;
      window.scrollTo({ top, behavior: "smooth" });
    }

    function renderPagination() {
      const el = document.getElementById("kfo-pagination");
      if (nbPages <= 1) {
        el.innerHTML = "";
        return;
      }
      const numbers = pageList(page, nbPages)
        .map((p) =>
          p === "…"
            ? `<span class="kfo-page-ellipsis">…</span>`
            : `<button class="kfo-page-num ${p === page ? "active" : ""}" data-page="${p}">${p + 1}</button>`,
        )
        .join("");
      el.innerHTML = `
        <button class="kfo-page-btn" id="kfo-prev" ${page === 0 ? "disabled" : ""}>&#8592; Prev</button>
        <div class="kfo-page-numbers">${numbers}</div>
        <button class="kfo-page-btn" id="kfo-next" ${page >= nbPages - 1 ? "disabled" : ""}>Next &#8594;</button>
      `;
      el.querySelector("#kfo-prev")?.addEventListener("click", () => {
        if (page > 0) goToPage(page - 1);
      });
      el.querySelector("#kfo-next")?.addEventListener("click", () => {
        if (page < nbPages - 1) goToPage(page + 1);
      });
      el.querySelectorAll(".kfo-page-num").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = parseInt(btn.dataset.page);
          if (p !== page) goToPage(p);
        });
      });
    }

  }

  console.log(
    "[KFO] kfo-widget.js evaluated, readyState:",
    document.readyState,
  );
  if (document.readyState === "loading") {
    console.log(
      "[KFO] document still loading, deferring init to DOMContentLoaded",
    );
    document.addEventListener("DOMContentLoaded", init);
  } else {
    console.log("[KFO] document ready, calling init() immediately");
    init();
  }
})();
