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

  // Inline heart glyph for the "ADD TO FAVORITE" text button — same heart shape
  // as the kfo-heart assets but without the translucent circle badge, using
  // currentColor so it tracks the button's text colour.
  function favHeartSvg(active) {
    return active
      ? `<svg viewBox="0 0 63 63" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M45.009 33.6348C46.7774 31.8478 47.8757 29.4279 47.8757 26.7288C47.8757 24.1369 46.8461 21.6512 45.0133 19.8184C43.1806 17.9857 40.6949 16.9561 38.103 16.9561C34.8454 16.9561 31.9601 18.5383 30.1918 20.9955C29.2891 19.7418 28.1006 18.7214 26.7247 18.0189C25.3489 17.3164 23.8253 16.952 22.2805 16.9561C19.6886 16.9561 17.2029 17.9857 15.3702 19.8184C13.5374 21.6512 12.5078 24.1369 12.5078 26.7288C12.5078 29.4279 13.6061 31.8478 15.3745 33.6348L30.1918 48.4521L45.009 33.6348Z" fill="currentColor"/></svg>`
      : `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.2181 19.7518C10.7507 19.2875 10.3804 18.7349 10.1288 18.1261C9.87712 17.5173 9.74916 16.8644 9.75234 16.2057C9.75234 14.8733 10.2816 13.5956 11.2237 12.6534C12.1658 11.7113 13.4436 11.1821 14.776 11.1821C16.6436 11.1821 18.2748 12.1986 19.1377 13.7116H20.4616C20.9002 12.9422 21.535 12.3027 22.3011 11.8584C23.0673 11.414 23.9376 11.1807 24.8232 11.1821C26.1556 11.1821 27.4334 11.7113 28.3755 12.6534C29.3176 13.5956 29.8469 14.8733 29.8469 16.2057C29.8469 17.5887 29.2559 18.8653 28.3812 19.7518L19.7996 28.3215L11.2181 19.7518ZM29.2086 20.591C30.3315 19.4563 31.0289 17.9196 31.0289 16.2057C31.0289 14.5598 30.3751 12.9814 29.2113 11.8176C28.0475 10.6538 26.4691 10 24.8232 10C22.7547 10 20.9225 11.0047 19.7996 12.565C19.2264 11.7689 18.4717 11.121 17.5981 10.6749C16.7244 10.2288 15.7569 9.99744 14.776 10C13.1301 10 11.5517 10.6538 10.3879 11.8176C9.22412 12.9814 8.57031 14.5598 8.57031 16.2057C8.57031 17.9196 9.26771 19.4563 10.3906 20.591L19.7996 30L29.2086 20.591Z" fill="currentColor"/></svg>`;
  }

  // Full-screen image viewer. Close (×) sits on the image; clicking the image
  // toggles zoom in / out, clicking the backdrop or pressing Esc closes.
  function openLightbox(src, alt) {
    const lb = document.createElement('div');
    lb.className = 'kfo-lightbox';
    lb.innerHTML = `
      <div class="kfo-lightbox-stage">
        <img src="${src}" alt="${alt || ''}" class="kfo-lightbox-img" />
        <button class="kfo-lightbox-close" type="button" aria-label="Close">&#x2715;</button>
      </div>`;

    function close() {
      lb.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    lb.querySelector('.kfo-lightbox-img').addEventListener('click', (e) => {
      e.stopPropagation();
      lb.classList.toggle('zoomed');
    });
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    lb.querySelector('.kfo-lightbox-close').addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
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
              <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="44" height="44" rx="22" fill="white" fill-opacity="0.5"/><path d="M33.5534 33.5505L27.9799 27.9769M27.9799 27.9769C28.9332 27.0236 29.6895 25.8918 30.2055 24.6461C30.7214 23.4005 30.987 22.0654 30.987 20.7171C30.987 19.3689 30.7214 18.0338 30.2055 16.7881C29.6895 15.5425 28.9332 14.4107 27.9799 13.4573C27.0265 12.5039 25.8947 11.7477 24.649 11.2317C23.4034 10.7158 22.0683 10.4502 20.7201 10.4502C19.3718 10.4502 18.0367 10.7158 16.7911 11.2317C15.5454 11.7477 14.4136 12.5039 13.4602 13.4573C11.5348 15.3827 10.4531 17.9942 10.4531 20.7171C10.4531 23.4401 11.5348 26.0515 13.4602 27.9769C15.3857 29.9024 17.9971 30.9841 20.7201 30.9841C23.443 30.9841 26.0544 29.9024 27.9799 27.9769ZM20.7201 16.8671V24.5671M16.8701 20.7171H24.5701" stroke="#3D3A35" stroke-width="1.28333" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        <div class="kfo-modal-right">
          <button class="kfo-modal-close" id="kfo-fav-modal-close">&#x2715;</button>
          <h2 class="kfo-modal-title">${(combo.popup_name || combo.name).toUpperCase()}</h2>
          <button class="kfo-modal-fav-btn ${favActive ? 'active' : ''}" id="kfo-fav-modal-fav">
            <span class="kfo-modal-fav-icon">${favHeartSvg(favActive)}</span>
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
        body.querySelector('.kfo-modal-fav-icon').innerHTML = favHeartSvg(active);
        const favBtn = body.querySelector('#kfo-fav-modal-fav');
        favBtn.classList.toggle('active', active);
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
          openLightbox(combo.image_url, combo.name);
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
