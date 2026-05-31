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

    await loadScript(ALGOLIA_CDN);
    const combIndex = window.algoliasearch(appId, searchKey).initIndex(idxComb);

    // Shell
    root.innerHTML = `<div id="kfo-fav-grid" class="kfo-grid"></div>`;

    // Modal — appended to body
    const modalEl = document.createElement('div');
    modalEl.innerHTML = `
      <div class="kfo-modal-overlay" id="kfo-fav-modal-overlay">
        <div class="kfo-modal" id="kfo-fav-modal">
          <div id="kfo-fav-modal-body" class="kfo-modal-body"></div>
        </div>
      </div>`;
    document.body.appendChild(modalEl.firstElementChild);

    document.getElementById('kfo-fav-modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
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
          openModal(combo);
        });

        card.addEventListener('click', () => openModal(combo));
        card.addEventListener('keydown', e => { if (e.key === 'Enter') openModal(combo); });
      });
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
    async function openModal(combo) {
      const overlay = document.getElementById('kfo-fav-modal-overlay');
      const body = document.getElementById('kfo-fav-modal-body');

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
            <button class="kfo-modal-img-btn" id="kfo-fav-modal-img-fav" aria-label="Favorite">
              <img src="${favActive ? heartActiveUrl : heartUrl}" class="kfo-modal-img-heart" alt="" />
            </button>
            <button class="kfo-modal-img-btn" id="kfo-fav-modal-zoom" aria-label="Zoom">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
          </div>
        </div>
        <div class="kfo-modal-right">
          <button class="kfo-modal-close" id="kfo-fav-modal-close">&#x2715;</button>
          <h2 class="kfo-modal-title">${(combo.popup_name || combo.name).toUpperCase()}</h2>
          <button class="kfo-modal-fav-btn ${favActive ? 'active' : ''}" id="kfo-fav-modal-fav">
            <img src="${favActive ? heartActiveUrl : heartUrl}" class="kfo-modal-fav-icon" alt="" />
            ${favActive ? 'ADDED TO FAVORITE' : 'ADD TO FAVORITE'}
          </button>
          ${combo.description ? `<p class="kfo-modal-desc">${combo.description}</p>` : ''}
          <p class="kfo-cart-msg" id="kfo-fav-cart-msg"></p>
          <div class="kfo-modal-products-grid">
            ${products.map(p => `
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
      body.querySelector('#kfo-fav-modal-close').addEventListener('click', closeModal);

      // Add to cart
      body.querySelectorAll('.kfo-add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const variantId = btn.dataset.variantId;
          if (!variantId) return;
          const numericId = Number(String(variantId).split('/').pop());
          if (!numericId) return;

          btn.disabled = true;
          btn.textContent = '...';

          try {
            const payload = { items: [{ id: numericId, quantity: 1 }] };
            const res = await fetch('/cart/add.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw err;
            }
            btn.textContent = 'ADDED ✓';
            btn.style.background = '#111';
            btn.style.color = '#fff';
            showCartMsg('', false);
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
            setTimeout(() => { btn.textContent = 'ADD TO CART'; btn.style.background = ''; btn.style.color = ''; btn.disabled = false; }, 2000);
          } catch (err) {
            btn.textContent = 'FAILED';
            btn.style.color = '#e53e3e';
            showCartMsg(err?.description || err?.message || 'Could not add to cart.', true);
            setTimeout(() => { btn.textContent = 'ADD TO CART'; btn.style.color = ''; btn.disabled = false; showCartMsg('', false); }, 3000);
          }
        });
      });

      // Favorite toggle
      body.querySelector('#kfo-fav-modal-img-fav').addEventListener('click', () => {
        toggleFav(combo.objectID);
        const active = isFav(combo.objectID);
        const src = active ? heartActiveUrl : heartUrl;
        body.querySelector('.kfo-modal-img-heart').src = src;
        body.querySelector('.kfo-modal-fav-icon').src = src;
        const favBtn = body.querySelector('#kfo-fav-modal-fav');
        favBtn.classList.toggle('active', active);
        favBtn.querySelector('img').src = src;
        favBtn.childNodes[favBtn.childNodes.length - 1].textContent = active ? 'ADDED TO FAVORITE' : 'ADD TO FAVORITE';
        // If unfavorited, remove card from grid
        if (!active) {
          const card = document.querySelector(`.kfo-card[data-id="${combo.objectID}"]`);
          if (card) {
            card.remove();
            const grid = document.getElementById('kfo-fav-grid');
            if (grid && !grid.querySelector('.kfo-card')) {
              grid.innerHTML = '<p class="kfo-empty">No favorites yet.<br>Click &#9825; on a combination in the shop to save it here.</p>';
            }
          }
        }
      });

      body.querySelector('#kfo-fav-modal-fav').addEventListener('click', () => {
        body.querySelector('#kfo-fav-modal-img-fav').click();
      });

      // Zoom — lightbox
      if (combo.image_url) {
        body.querySelector('#kfo-fav-modal-zoom').addEventListener('click', () => {
          const lb = document.createElement('div');
          lb.className = 'kfo-lightbox';
          lb.innerHTML = `
            <button class="kfo-lightbox-close">&#x2715;</button>
            <img src="${combo.image_url}" alt="${combo.name}" class="kfo-lightbox-img" />
          `;
          lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
          lb.querySelector('.kfo-lightbox-close').addEventListener('click', () => lb.remove());
          document.body.appendChild(lb);
        });
      }

    }

    function closeModal() {
      document.getElementById('kfo-fav-modal-overlay').classList.remove('open');
      document.body.style.overflow = '';
    }

    function showCartMsg(text, isError) {
      const el = document.getElementById('kfo-fav-cart-msg');
      if (!el) return;
      el.textContent = text;
      el.style.color = isError ? '#e53e3e' : '#22a06b';
      el.style.display = text ? 'block' : 'none';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
