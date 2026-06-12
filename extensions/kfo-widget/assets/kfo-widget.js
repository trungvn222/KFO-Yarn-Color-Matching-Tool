(function () {
  'use strict';

  const ALGOLIA_CDN = 'https://cdn.jsdelivr.net/npm/algoliasearch@4/dist/algoliasearch-lite.umd.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.algoliasearch) { resolve(); return; }
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function init() {
    const root = document.getElementById('kfo-widget');
    if (!root) return;

    const appId      = root.dataset.appId;
    const searchKey  = root.dataset.searchKey;
    const idxComb    = root.dataset.combinationsIndex || 'kfo_combinations';
    const idxColors  = root.dataset.colorsIndex       || 'kfo_colors';
    const idxTags    = root.dataset.tagsIndex         || 'kfo_tags';
    const perPage    = parseInt(root.dataset.perPage) || 12;
    const showSearch = root.dataset.showSearch !== 'false';
    const showColors = root.dataset.showColors !== 'false';
    const showTags         = root.dataset.showTags   !== 'false';
    const colorFilterLabel = root.dataset.colorFilterLabel || 'FILTER BY COLORS:';
    const heartUrl         = root.dataset.heartUrl || '';
    const heartActiveUrl   = root.dataset.heartActiveUrl || heartUrl;
    const favoritesUrl     = root.dataset.favoritesUrl || '/pages/favorites';
    const defaultColors = root.dataset.defaultColors ? root.dataset.defaultColors.split(',').map(s => s.trim()).filter(Boolean) : [];
    const defaultTags   = root.dataset.defaultTags   ? root.dataset.defaultTags.split(',').map(s => s.trim()).filter(Boolean)   : [];

    await loadScript(ALGOLIA_CDN);
    const client = window.algoliasearch(appId, searchKey);
    const combIndex   = client.initIndex(idxComb);
    const colorsIndex = showColors ? client.initIndex(idxColors) : null;
    const tagsIndex   = showTags   ? client.initIndex(idxTags)   : null;

    // --- State ---
    let query          = '';
    let selectedColors = [...defaultColors];
    let selectedTags   = [...defaultTags];
    let page           = 0;
    let nbPages        = 1;
    let allColors      = [];
    let allTags        = [];
    let debounceTimer  = null;
    const sectionPerPage = {}; // colorId → hitsPerPage shown so far
    const COLORS_COLLAPSED = 8;
    const COLORS_COLLAPSED_MOBILE = 4;
    const colorsCollapsedCount = () =>
      window.matchMedia('(max-width: 480px)').matches
        ? COLORS_COLLAPSED_MOBILE
        : COLORS_COLLAPSED;
    let colorsExpanded = false;
    let sectionObserver = null;

    // --- Favorites (localStorage) ---
    const FAV_KEY = 'kfo_favorites';
    function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
    function isFav(id) { return getFavs().includes(id); }
    function toggleFav(id) {
      const favs = getFavs();
      const idx = favs.indexOf(id);
      if (idx >= 0) favs.splice(idx, 1); else favs.push(id);
      localStorage.setItem(FAV_KEY, JSON.stringify(favs));
      window.dispatchEvent(new CustomEvent('kfo:favorites-changed'));
    }

    // --- "Added to favorite" toast ---
    let toastEl = null;
    let toastTimer = null;
    function ensureToast() {
      if (toastEl) return toastEl;
      toastEl = document.createElement('div');
      toastEl.className = 'kfo-toast';
      toastEl.setAttribute('role', 'status');
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
      toastEl.querySelector('.kfo-toast-close').addEventListener('click', hideToast);
      return toastEl;
    }
    function hideToast() {
      clearTimeout(toastTimer);
      toastEl?.classList.remove('kfo-toast--visible');
    }
    function showFavoriteToast(combo) {
      const el = ensureToast();
      const thumb = el.querySelector('.kfo-toast-thumb');
      thumb.innerHTML = combo.image_url
        ? `<img src="${combo.image_url}" alt="${combo.name || ''}" />`
        : '';
      // force reflow so re-triggering restarts the transition
      void el.offsetWidth;
      el.classList.add('kfo-toast--visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 4000);
    }

    // --- Load filter options ---
    const [colorsRes, tagsRes] = await Promise.all([
      showColors ? colorsIndex.search('', { hitsPerPage: 1000 }) : Promise.resolve({ hits: [] }),
      showTags   ? tagsIndex.search('', { hitsPerPage: 1000 })   : Promise.resolve({ hits: [] }),
    ]);
    allColors = colorsRes.hits;
    allTags   = tagsRes.hits;

    // --- Render shell ---
    root.innerHTML = `
      ${showSearch ? `
      <div class="kfo-header">
        <input class="kfo-search" type="text" placeholder="Search combinations…" autocomplete="off" />
      </div>` : ''}
      <div class="kfo-filters">
        ${showColors ? `
          <div class="kfo-filter-header">
            <span class="kfo-filter-label">${colorFilterLabel}</span>
            <button class="kfo-clear-btn" id="kfo-clear-btn">CLEAR ALL</button>
          </div>
          <div class="kfo-color-grid" id="kfo-color-filters"></div>
        ` : '<button class="kfo-clear-btn" id="kfo-clear-btn">CLEAR ALL</button>'}
        ${showTags ? '<div class="kfo-filter-group" id="kfo-tag-filters"></div>' : ''}
      </div>
      <div id="kfo-grid"></div>
      <div class="kfo-pagination" id="kfo-pagination"></div>
    `;

    // --- Mount modal vào body ---
    const modalEl = document.createElement('div');
    modalEl.innerHTML = `
      <div class="kfo-modal-overlay" id="kfo-modal-overlay">
        <div class="kfo-modal" id="kfo-modal">
          <div id="kfo-modal-body" class="kfo-modal-body"></div>
        </div>
      </div>`;
    document.body.appendChild(modalEl.firstElementChild);

    if (showColors) renderColorFilters();
    if (showTags)   renderTagFilters();
    renderContent();

    // --- Event bindings ---
    root.querySelector('.kfo-search')?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        query = e.target.value;
        page = 0;
        renderContent();
      }, 300);
    });

    document.getElementById('kfo-clear-btn').addEventListener('click', () => {
      query          = '';
      selectedColors = [...defaultColors];
      selectedTags   = [...defaultTags];
      page           = 0;
      const searchEl = root.querySelector('.kfo-search');
      if (searchEl) searchEl.value = '';
      // Sync active states in place instead of re-rendering — re-rendering
      // would reload every swatch image and cause flicker.
      if (showColors) syncColorActiveStates();
      if (showTags)   syncTagActiveStates();
      updateClearBtn();
      renderContent();
    });

    document.getElementById('kfo-modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    window.addEventListener('kfo:favorites-changed', () => {
      root.querySelectorAll('.kfo-heart-btn').forEach(btn => {
        const active = isFav(btn.dataset.id);
        btn.classList.toggle('active', active);
        btn.querySelector('.kfo-heart-icon').src = active ? heartActiveUrl : heartUrl;
      });
    });

    // Re-render color filters when crossing the mobile breakpoint so the
    // collapsed count (4 on mobile, 8 on desktop) stays in sync.
    if (showColors) {
      let lastCollapsed = colorsCollapsedCount();
      let resizeTimer = null;
      window.addEventListener('resize', () => {
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
      document.querySelectorAll('#kfo-color-filters .kfo-color-item').forEach((btn) => {
        btn.classList.toggle('active', selectedColors.includes(btn.dataset.id));
      });
    }

    function syncTagActiveStates() {
      document.querySelectorAll('#kfo-tag-filters .kfo-tag-badge').forEach((btn) => {
        const slug = btn.dataset.slug;
        const isActive = selectedTags.includes(slug);
        const t = allTags.find((x) => x.slug === slug);
        btn.classList.toggle('active', isActive);
        btn.style.cssText = isActive && t ? `background:${t.color};border-color:${t.color}` : '';
      });
    }

    // Show/hide the collapsed overflow via CSS instead of adding/removing
    // DOM nodes — keeps swatch <img> elements alive so they don't reload.
    function applyColorsCollapsed() {
      const el = document.getElementById('kfo-color-filters');
      const collapsed = colorsCollapsedCount();
      el.classList.toggle('kfo-colors-collapsed', !colorsExpanded);
      el.querySelectorAll('.kfo-color-item').forEach((btn, i) => {
        btn.classList.toggle('kfo-color-item--overflow', i >= collapsed);
      });
      const toggleBtn = el.querySelector('#kfo-see-toggle');
      if (toggleBtn) toggleBtn.textContent = colorsExpanded ? 'SEE LESS' : 'SEE MORE';
    }

    // --- Filter renderers ---
    function renderColorFilters() {
      const el = document.getElementById('kfo-color-filters');
      const hasToggle = allColors.length > colorsCollapsedCount();

      // Render every color once; collapsing only toggles CSS visibility.
      el.innerHTML = allColors.map((c) => `
        <button class="kfo-color-item ${selectedColors.includes(c.objectID) ? 'active' : ''}" data-id="${c.objectID}">
          <span class="kfo-color-item-main">
            ${c.image_url
              ? `<img class="kfo-color-swatch" src="${c.image_url}" alt="${c.name}" />`
              : `<span class="kfo-color-swatch" style="background:${c.hex}"></span>`
            }
            <span class="kfo-color-name">${c.name}</span>
          </span>
          <span class="kfo-color-close" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.20857L10.7914 0L6 4.79143L1.20857 0L0 1.20857L4.79143 6L0 10.7914L1.20857 12L6 7.20857L10.7914 12L12 10.7914L7.20857 6L12 1.20857Z" fill="currentColor"/></svg>
          </span>
        </button>
      `).join('') + (hasToggle ? `
        <button class="kfo-see-more-btn" id="kfo-see-toggle">${colorsExpanded ? 'SEE LESS' : 'SEE MORE'}</button>
      ` : '');

      applyColorsCollapsed();

      el.querySelectorAll('.kfo-color-item').forEach((btn) => {
        btn.addEventListener('click', () => {
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
          btn.classList.toggle('active', selectedColors.includes(id));
          updateClearBtn();
          renderContent();
        });
      });

      el.querySelector('#kfo-see-toggle')?.addEventListener('click', () => {
        colorsExpanded = !colorsExpanded;
        applyColorsCollapsed();
      });
    }

    function renderTagFilters() {
      const el = document.getElementById('kfo-tag-filters');
      el.innerHTML = allTags.map((t) => `
        <button
          class="kfo-tag-badge ${selectedTags.includes(t.slug) ? 'active' : ''}"
          data-slug="${t.slug}"
          style="${selectedTags.includes(t.slug) ? `background:${t.color};border-color:${t.color}` : ''}"
        >${t.name}</button>
      `).join('');
      el.querySelectorAll('.kfo-tag-badge').forEach((btn) => {
        btn.addEventListener('click', () => {
          const slug = btn.dataset.slug;
          const t = allTags.find((x) => x.slug === slug);
          selectedTags = selectedTags.includes(slug)
            ? selectedTags.filter((x) => x !== slug)
            : [...selectedTags, slug];
          page = 0;
          // Toggle only this badge — avoid re-rendering the whole list.
          const isActive = selectedTags.includes(slug);
          btn.classList.toggle('active', isActive);
          btn.style.cssText = isActive && t ? `background:${t.color};border-color:${t.color}` : '';
          updateClearBtn();
          renderContent();
        });
      });
    }

    function updateClearBtn() {
      // Clear All is always visible.
      const btn = document.getElementById('kfo-clear-btn');
      btn.style.display = '';
    }

    // --- Content rendering ---
    async function renderContent() {
      document.getElementById('kfo-pagination').innerHTML = '';
      await renderSections();
    }

    // Flat mode: no color selected → single grid + pagination
    async function renderFlat() {
      const grid = document.getElementById('kfo-grid');
      grid.className = 'kfo-grid';
      grid.innerHTML = '<div class="kfo-loading"><span class="kfo-spinner"></span></div>';

      const facetFilters = [];
      if (selectedTags.length) facetFilters.push(selectedTags.map((s) => `tags:${s}`));

      const params = { hitsPerPage: perPage, page, facets: ['tags', 'colors'] };
      if (facetFilters.length) params.facetFilters = facetFilters;

      const res = await combIndex.search(query, params);
      nbPages = res.nbPages || 1;

      if (!res.hits.length) {
        grid.innerHTML = '<p class="kfo-empty">No combinations found.</p>';
        renderPagination();
        return;
      }

      const colorMap = Object.fromEntries(allColors.map((c) => [c.objectID, c]));
      grid.innerHTML = res.hits.map(c => cardHtml(c)).join('');
      bindCards(grid, res.hits, colorMap);
      renderPagination();
    }

    // Section mode: render shells immediately, lazy-load cards via IntersectionObserver
    async function renderSections() {
      const grid = document.getElementById('kfo-grid');
      grid.className = 'kfo-sections';

      const colorMap = Object.fromEntries(allColors.map(c => [c.objectID, c]));

      const colorIds = selectedColors.length > 0 ? selectedColors : allColors.map(c => c.objectID);
      const sorted = [...colorIds].sort(
        (a, b) => allColors.findIndex(c => c.objectID === a) - allColors.findIndex(c => c.objectID === b)
      );

      // Disconnect previous observer before re-rendering
      if (sectionObserver) { sectionObserver.disconnect(); sectionObserver = null; }

      // Render section shells immediately (header visible, grid pending)
      grid.innerHTML = sorted.map(colorId => {
        const color = colorMap[colorId];
        if (!color) return '';
        return `
          <div class="kfo-section" data-color-id="${colorId}">
            <div class="kfo-section-header">
              <div class="kfo-section-img-wrap">
                ${(color.content_image_url || color.image_url)
                  ? `<img class="kfo-section-img" src="${color.content_image_url || color.image_url}" alt="${color.name}" />`
                  : `<div class="kfo-section-img kfo-section-img--color" style="background:${color.hex}"></div>`
                }
              </div>
              <div class="kfo-section-info">
                <h3 class="kfo-section-title">${color.content_title || color.name}</h3>
                ${color.description ? `<div class="kfo-section-desc">${color.description}</div>` : ''}
              </div>
            </div>
            <div class="kfo-section-body">
              <div class="kfo-loading"><span class="kfo-spinner"></span></div>
            </div>
          </div>
        `;
      }).join('');

      if (!grid.querySelector('.kfo-section')) {
        grid.innerHTML = '<p class="kfo-empty">No combinations found.</p>';
        return;
      }

      // Observe each section — load cards when it enters the viewport
      sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const sectionEl = entry.target;
          sectionObserver.unobserve(sectionEl);
          // Reveal happens inside loadSectionCards, only once we know the
          // section actually has combinations (empty sections stay hidden).
          loadSectionCards(sectionEl.dataset.colorId, sectionEl, colorMap);
        });
      }, { rootMargin: '200px 0px' });

      grid.querySelectorAll('.kfo-section').forEach(s => sectionObserver.observe(s));
    }

    async function loadSectionCards(colorId, sectionEl, colorMap) {
      const body = sectionEl.querySelector('.kfo-section-body');
      if (!sectionPerPage[colorId]) sectionPerPage[colorId] = 12;

      const facetFilters = [[`colors:${colorId}`]];
      if (selectedTags.length) facetFilters.push(selectedTags.map(s => `tags:${s}`));

      const res = await combIndex.search(query, { hitsPerPage: sectionPerPage[colorId], facetFilters });

      if (!res.hits.length) {
        sectionEl.style.display = 'none';
        return;
      }

      // Has combinations → reveal the section now.
      sectionEl.classList.add('kfo-section--visible');

      const remaining = res.nbHits - res.hits.length;
      // If more results exist: show first N-1 cards + "Show all" overlay on the Nth slot
      const visibleHits = remaining > 0 ? res.hits.slice(0, -1) : res.hits;
      const showAllHit  = remaining > 0 ? res.hits[res.hits.length - 1] : null;

      body.innerHTML = `
        <div class="kfo-section-grid">
          ${visibleHits.map(h => cardHtml(h)).join('')}
          ${showAllHit ? `
            <div class="kfo-show-all-card" role="button" tabindex="0">
              ${showAllHit.image_url ? `<img src="${showAllHit.image_url}" alt="" />` : '<div class="kfo-show-all-card-bg"></div>'}
              <div class="kfo-show-all-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                <span>Show all</span>
              </div>
            </div>
          ` : ''}
        </div>
      `;

      body.querySelectorAll('.kfo-card').forEach(card => {
        const combo = res.hits.find(h => h.objectID === card.dataset.id);

        card.querySelector('.kfo-heart-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFav(combo.objectID);
          const active = isFav(combo.objectID);
          const btn = e.currentTarget;
          btn.classList.toggle('active', active);
          btn.querySelector('.kfo-heart-icon').src = active ? heartActiveUrl : heartUrl;
          if (active) showFavoriteToast(combo);
        });

        card.querySelector('.kfo-view-detail-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(combo, colorMap);
        });

        card.addEventListener('click', () => openModal(combo, colorMap));
        card.addEventListener('keydown', e => { if (e.key === 'Enter') openModal(combo, colorMap); });
      });

      const showAllCard = body.querySelector('.kfo-show-all-card');
      showAllCard?.addEventListener('click', async () => {
        // Avoid double-clicks; keep the current grid visible while loading so the
        // section height only grows (no collapse) — prevents the page from jumping.
        if (showAllCard.classList.contains('is-loading')) return;
        showAllCard.classList.add('is-loading');
        sectionPerPage[colorId] = res.nbHits;
        await loadSectionCards(colorId, sectionEl, colorMap);
      });
    }

    // --- Card helpers ---
    function cardHtml(c) {
      return `
        <div class="kfo-card" data-id="${c.objectID}">
          <div class="kfo-card-img">
            ${c.image_url
              ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" />`
              : '<div class="kfo-card-img-placeholder"></div>'
            }
            <button class="kfo-heart-btn ${isFav(c.objectID) ? 'active' : ''}" data-id="${c.objectID}" aria-label="Favorite">
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
      container.querySelectorAll('.kfo-card').forEach((card) => {
        const combo = hits.find((h) => h.objectID === card.dataset.id);

        card.querySelector('.kfo-view-detail-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(combo, colorMap);
        });

        card.querySelector('.kfo-heart-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFav(combo.objectID);
          const active = isFav(combo.objectID);
          const btn = e.currentTarget;
          btn.classList.toggle('active', active);
          btn.querySelector('.kfo-heart-icon').src = active ? heartActiveUrl : heartUrl;
          if (active) showFavoriteToast(combo);
        });

        card.addEventListener('click', () => openModal(combo, colorMap));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openModal(combo, colorMap); });
      });
    }

    // --- Pagination (flat mode only) ---
    function renderPagination() {
      const el = document.getElementById('kfo-pagination');
      if (nbPages <= 1) { el.innerHTML = ''; return; }
      el.innerHTML = `
        <button class="kfo-page-btn" id="kfo-prev" ${page === 0 ? 'disabled' : ''}>&#8592; Prev</button>
        <span class="kfo-page-label">${page + 1} / ${nbPages}</span>
        <button class="kfo-page-btn" id="kfo-next" ${page >= nbPages - 1 ? 'disabled' : ''}>Next &#8594;</button>
      `;
      el.querySelector('#kfo-prev')?.addEventListener('click', () => { page--; renderContent(); window.scrollTo({ top: root.offsetTop - 20, behavior: 'smooth' }); });
      el.querySelector('#kfo-next')?.addEventListener('click', () => { page++; renderContent(); window.scrollTo({ top: root.offsetTop - 20, behavior: 'smooth' }); });
    }

    // --- Cart message helper (shared banner above products grid) ---
    function showCartMsg(btn, text, isError) {
      const el = document.getElementById('kfo-cart-msg');
      if (!el) return;
      el.textContent = text;
      el.style.color = isError ? '#e53e3e' : '#22a06b';
      el.style.display = text ? 'block' : 'none';
    }

    // --- fetch live variant images from Shopify AJAX API ---
    async function fetchVariantImages(products) {
      const handles = [...new Set(products.map(p => p.handle).filter(Boolean))];
      if (!handles.length) return {};
      const map = {};
      await Promise.all(handles.map(async (handle) => {
        try {
          const res = await fetch(`/products/${handle}.js`);
          if (!res.ok) return;
          const data = await res.json();
          const productImg = data.featured_image || '';
          for (const v of data.variants) {
            map[String(v.id)] = v.featured_image?.src || productImg || '';
          }
        } catch {}
      }));
      return map;
    }

    // --- Modal ---
    async function openModal(combo, colorMap) {
      const overlay = document.getElementById('kfo-modal-overlay');
      const body = document.getElementById('kfo-modal-body');

      body.innerHTML = `
        <div class="kfo-modal-skeleton">
          <div class="kfo-skel kfo-skel-left"></div>
          <div class="kfo-skel-right">
            <div class="kfo-skel kfo-skel-title"></div>
            <div class="kfo-skel kfo-skel-fav"></div>
            <div class="kfo-skel-products">
              <div class="kfo-skel-product"><div class="kfo-skel kfo-skel-product-img"></div><div class="kfo-skel kfo-skel-product-btn"></div></div>
              <div class="kfo-skel-product"><div class="kfo-skel kfo-skel-product-img"></div><div class="kfo-skel kfo-skel-product-btn"></div></div>
              <div class="kfo-skel-product"><div class="kfo-skel kfo-skel-product-img"></div><div class="kfo-skel kfo-skel-product-btn"></div></div>
              <div class="kfo-skel-product"><div class="kfo-skel kfo-skel-product-img"></div><div class="kfo-skel kfo-skel-product-btn"></div></div>
            </div>
          </div>
        </div>`;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      const imageMap = await fetchVariantImages(combo.products || []);
      const products = (combo.products || []).map(p => ({
        ...p,
        image_url: imageMap[String(p.variant_id)] || p.image_url || '',
      }));

      const favActive = isFav(combo.objectID);

      body.innerHTML = `
        <div class="kfo-modal-left">
          ${combo.image_url
            ? `<img class="kfo-modal-main-img" src="${combo.image_url}" alt="${combo.name}" />`
            : '<div class="kfo-modal-main-img kfo-modal-main-img--placeholder"></div>'
          }
          <div class="kfo-modal-img-actions">
            <button class="kfo-modal-img-btn" id="kfo-modal-img-fav" aria-label="Favorite">
              <img src="${favActive ? heartActiveUrl : heartUrl}" class="kfo-modal-img-heart" alt="" />
            </button>
            <button class="kfo-modal-img-btn" id="kfo-modal-zoom" aria-label="Zoom">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
          </div>
        </div>
        <div class="kfo-modal-right">
          <button class="kfo-modal-close" id="kfo-modal-close">&#x2715;</button>
          <h2 class="kfo-modal-title">${(combo.popup_name || combo.name).toUpperCase()}</h2>
          <button class="kfo-modal-fav-btn ${favActive ? 'active' : ''}" id="kfo-modal-fav">
            <img src="${favActive ? heartActiveUrl : heartUrl}" class="kfo-modal-fav-icon" alt="" />
            ${favActive ? 'ADDED TO FAVORITE' : 'ADD TO FAVORITE'}
          </button>
          ${combo.description ? `<div class="kfo-modal-desc">${combo.description}</div>` : ''}
          <p class="kfo-cart-msg" id="kfo-cart-msg"></p>
          <div class="kfo-modal-products-grid">
            ${products.map((p) => `
              <div class="kfo-modal-product">
                ${p.image_url
                  ? `<img src="${p.image_url}" alt="${p.product_name}" class="kfo-modal-product-img" />`
                  : '<div class="kfo-modal-product-img kfo-modal-product-img--placeholder"></div>'
                }
                <button class="kfo-add-to-cart-btn" data-variant-id="${p.variant_id}">ADD TO CART</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // Close
      body.querySelector('#kfo-modal-close').addEventListener('click', closeModal);

      // Add to cart
      body.querySelectorAll('.kfo-add-to-cart-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const variantId = btn.dataset.variantId;
          if (!variantId) return;

          // Handle GID format: gid://shopify/ProductVariant/123456
          const numericId = Number(String(variantId).split('/').pop());
          if (!numericId) return;

          btn.disabled = true;
          btn.textContent = '...';

          try {
            const payload = { items: [{ id: numericId, quantity: 1 }] };
            console.log('[KFO] add to cart →', payload);
            const res = await fetch('/cart/add.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              console.error('[KFO] cart error', res.status, err);
              throw err;
            }

            btn.textContent = 'ADDED ✓';
            btn.style.background = '#111';
            btn.style.color = '#fff';
            showCartMsg(btn, '', false);

            // Notify theme cart (drawer/bubble update)
            document.dispatchEvent(new CustomEvent('cart:refresh'));
            document.dispatchEvent(new CustomEvent('theme:cart:open'));

            // Merchant-defined success hook (set in Theme Editor → "On add-to-cart success")
            if (typeof window.kfoOnAddToCart === 'function') {
              try {
                window.kfoOnAddToCart({ variantId, numericId, button: btn, combination: combo });
              } catch (e) {
                console.error('[KFO] kfoOnAddToCart hook error:', e);
              }
            }

            setTimeout(() => {
              btn.textContent = 'ADD TO CART';
              btn.style.background = '';
              btn.style.color = '';
              btn.disabled = false;
            }, 2000);
          } catch (err) {
            btn.textContent = 'FAILED';
            btn.style.color = '#e53e3e';
            const msg = err?.description || err?.message || 'Could not add to cart.';
            showCartMsg(btn, msg, true);
            setTimeout(() => {
              btn.textContent = 'ADD TO CART';
              btn.style.color = '';
              btn.disabled = false;
              showCartMsg(btn, '', false);
            }, 3000);
          }
        });
      });

      // Favorite (image overlay button)
      body.querySelector('#kfo-modal-img-fav').addEventListener('click', () => {
        toggleFav(combo.objectID);
        const active = isFav(combo.objectID);
        const src = active ? heartActiveUrl : heartUrl;
        body.querySelector('.kfo-modal-img-heart').src = src;
        body.querySelector('.kfo-modal-fav-icon').src = src;
        const favBtn = body.querySelector('#kfo-modal-fav');
        favBtn.classList.toggle('active', active);
        favBtn.querySelector('img').src = src;
        favBtn.childNodes[favBtn.childNodes.length - 1].textContent = active ? 'ADDED TO FAVORITE' : 'ADD TO FAVORITE';
        // sync card heart if visible
        const cardHeart = root.querySelector(`.kfo-heart-btn[data-id="${combo.objectID}"] .kfo-heart-icon`);
        if (cardHeart) cardHeart.src = src;
        root.querySelector(`.kfo-heart-btn[data-id="${combo.objectID}"]`)?.classList.toggle('active', active);
        if (active) showFavoriteToast(combo);
      });

      // Favorite (right panel button) — reuse same handler
      body.querySelector('#kfo-modal-fav').addEventListener('click', () => {
        body.querySelector('#kfo-modal-img-fav').click();
      });

      // Zoom — lightbox
      if (combo.image_url) {
        body.querySelector('#kfo-modal-zoom').addEventListener('click', () => {
          const lb = document.createElement('div');
          lb.className = 'kfo-lightbox';
          lb.innerHTML = `
            <button class="kfo-lightbox-close">&#x2715;</button>
            <img src="${combo.image_url}" alt="${combo.name}" class="kfo-lightbox-img" />
          `;
          lb.addEventListener('click', (e) => { if (e.target === lb) lb.remove(); });
          lb.querySelector('.kfo-lightbox-close').addEventListener('click', () => lb.remove());
          document.body.appendChild(lb);
        });
      }

    }

    function closeModal() {
      document.getElementById('kfo-modal-overlay').classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
