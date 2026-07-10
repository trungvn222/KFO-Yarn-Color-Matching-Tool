(function () {
  'use strict';

  const ALGOLIA_CDN = 'https://cdn.jsdelivr.net/npm/algoliasearch@4/dist/algoliasearch-lite.umd.js';
  const FAV_KEY = 'kfo_favorites';

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
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
  function isFav(id) { return getFavs().includes(id); }
  function toggleFav(id) {
    const favs = getFavs();
    const idx = favs.indexOf(id);
    if (idx >= 0) favs.splice(idx, 1); else favs.push(id);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    window.dispatchEvent(new CustomEvent('kfo:favorites-changed'));
  }

  async function init() {
    const root = document.getElementById('kfo-favorites');
    if (!root) return;

    const appId           = root.dataset.appId;
    const searchKey       = root.dataset.searchKey;
    const idxComb         = root.dataset.combinationsIndex || 'kfo_combinations';
    const heartUrl        = root.dataset.heartUrl || '';
    const heartActiveUrl  = root.dataset.heartActiveUrl || heartUrl;

    await Promise.all([
      loadScript(ALGOLIA_CDN),
      loadScript(root.dataset.modalJsUrl),
    ]);
    const combIndex = window.algoliasearch(appId, searchKey).initIndex(idxComb);

    // Shell
    root.innerHTML = `<div id="kfo-fav-grid" class="kfo-grid"></div>`;

    // Modal (shared with kfo-widget.js — see kfo-modal.js)
    const modal = window.KfoModal.mount({
      heartUrl,
      heartActiveUrl,
      isFav,
      toggleFav,
      onFavoriteChange(combo, active) {
        // This is a favorites-only view — unfavoriting removes the card.
        if (active) return;
        const card = document.querySelector(`.kfo-card[data-id="${combo.objectID}"]`);
        if (!card) return;
        card.remove();
        const grid = document.getElementById('kfo-fav-grid');
        if (grid && !grid.querySelector('.kfo-card')) {
          grid.innerHTML = '<p class="kfo-empty">No favorites yet.<br>Click &#9825; on a combination in the shop to save it here.</p>';
        }
      },
    });

    window.addEventListener('kfo:favorites-changed', () => renderFavorites());

    await renderFavorites();

    // --- Render ---
    async function renderFavorites() {
      const grid = document.getElementById('kfo-fav-grid');
      const favIds = getFavs();

      if (!favIds.length) {
        grid.innerHTML = '<p class="kfo-empty">No favorites yet.<br>Click &#9825; on a combination in the shop to save it here.</p>';
        return;
      }

      grid.innerHTML = '<div class="kfo-loading"><span class="kfo-spinner"></span></div>';

      const { hits } = await combIndex.search('', {
        filters: favIds.map(id => `objectID:"${id}"`).join(' OR '),
        hitsPerPage: favIds.length,
      });

      if (!hits.length) {
        grid.innerHTML = '<p class="kfo-empty">No favorites found.</p>';
        return;
      }

      grid.innerHTML = hits.map(c => cardHtml(c)).join('');
      bindCards(grid, hits);
    }

    // --- Card ---
    function cardHtml(c) {
      return `
        <div class="kfo-card" data-id="${c.objectID}">
          <div class="kfo-card-img">
            ${c.image_url
              ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" />`
              : '<div class="kfo-card-img-placeholder"></div>'
            }
            <button class="kfo-heart-btn active" data-id="${c.objectID}" aria-label="Remove from favorites">
              <img src="${heartActiveUrl}" alt="" class="kfo-heart-icon" />
            </button>
          </div>
          <div class="kfo-card-body">
            <p class="kfo-card-name">${c.name}</p>
            <button class="kfo-view-detail-btn" data-id="${c.objectID}">VIEW DETAIL</button>
          </div>
        </div>
      `;
    }

    function bindCards(container, hits) {
      container.querySelectorAll('.kfo-card').forEach((card) => {
        const combo = hits.find(h => h.objectID === card.dataset.id);

        card.querySelector('.kfo-heart-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFav(combo.objectID);
          // Remove card immediately since this is favorites-only view
          card.remove();
          const grid = document.getElementById('kfo-fav-grid');
          if (!grid.querySelector('.kfo-card')) {
            grid.innerHTML = '<p class="kfo-empty">No favorites yet.<br>Click &#9825; on a combination in the shop to save it here.</p>';
          }
        });

        card.querySelector('.kfo-view-detail-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          modal.open(combo);
        });

        card.addEventListener('click', () => modal.open(combo));
        card.addEventListener('keydown', e => { if (e.key === 'Enter') modal.open(combo); });
      });
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
