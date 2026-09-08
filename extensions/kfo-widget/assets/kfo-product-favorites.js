(function () {
  'use strict';

  // The script can arrive twice on one page (theme app block + app embed);
  // binding the favorite listeners twice would toggle favorites back off.
  if (window.__kfoProductFavoritesLoaded) return;
  window.__kfoProductFavoritesLoaded = true;

  const FAV_KEY = 'kfo_product_favorites';

  // Danish UI strings for the .dk storefront (keyed by the English text, so
  // English is the automatic fallback everywhere else).
  const KFO_DA = {
    'No favorited items or pairings for now': 'Ingen favoritter',
    'EXPLORE OUR WEBSITE': 'UDFORSK VORES HJEMMESIDE',
    'Prev': 'Forrige',
    'Next': 'Næste',
    'ADD TO CART': 'LÆG I KURVEN',
    'ADDED ✓': 'TILFØJET ✓',
    'Remove from favorites': 'Fjern fra favoritter',
    'Add to favorites': 'Tilføj til favoritter',
    'ADD TO FAVORITE': 'TILFØJ TIL FAVORITTER',
    'ADDED TO FAVORITE': 'TILFØJET TIL FAVORITTER',
    'VIEW PRODUCT': 'SE PRODUKT',
    'ADDED TO FAVORITE!': 'TILFØJET TIL FAVORITTER!',
    'VIEW FAVORITES': 'SE FAVORITTER',
    'From': 'Fra',
    ' — Sold out': ' — Udsolgt',
    'Unavailable': 'Ikke tilgængelig',
    'No favorite products found.': 'Ingen favoritprodukter fundet.',
  };
  const kfoT = (s) => {
    let lang = '';
    try {
      lang = String(window.KFO_LANG || '').toLowerCase();
      if (lang !== 'da' && lang !== 'en') {
        const detected = String(
          (window.Shopify && window.Shopify.locale) ||
            document.documentElement.lang ||
            '',
        ).toLowerCase();
        lang =
          detected.indexOf('da') === 0 ||
          location.hostname.indexOf('knittingforolive.dk') !== -1
            ? 'da'
            : 'en';
      }
    } catch (e) {
      lang = 'en';
    }
    return (lang === 'da' && KFO_DA[s]) || s;
  };
  const EMPTY_HTML = `<div class="kfo-empty"><p class="kfo-empty-text">${kfoT('No favorited items or pairings for now')}</p><a class="kfo-empty-btn" href="/">${kfoT('EXPLORE OUR WEBSITE')}</a></div>`;

  function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
  function isFav(handle) { return getFavs().includes(handle); }
  function toggleFav(handle) {
    const favs = getFavs();
    const idx = favs.indexOf(handle);
    if (idx >= 0) favs.splice(idx, 1); else favs.push(handle);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    window.dispatchEvent(new CustomEvent('kfo:product-favorites-changed'));
  }

  // --- "Added to favorite" toast (same design as the combinations widget) ---
  let toastEl = null;
  let toastTimer = null;
  function favoritesUrl() {
    return window.KFO_PRODUCT_FAVORITES_URL || '/pages/your-favorites-gallery';
  }
  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = document.createElement('div');
    toastEl.className = 'kfo-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = `
      <div class="kfo-toast-thumb"></div>
      <div class="kfo-toast-body">
        <span class="kfo-toast-title">${kfoT('ADDED TO FAVORITE!')}</span>
        <a class="kfo-toast-link" href="${favoritesUrl()}">${kfoT('VIEW FAVORITES')}</a>
      </div>
      <button class="kfo-toast-close" type="button" aria-label="Close">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.20857L10.7914 0L6 4.79143L1.20857 0L0 1.20857L4.79143 6L0 10.7914L1.20857 12L6 7.20857L10.7914 12L12 10.7914L7.20857 6L12 1.20857Z" fill="currentColor"/></svg>
      </button>`;
    document.body.appendChild(toastEl);
    toastEl.querySelector('.kfo-toast-close').addEventListener('click', hideToast);
    return toastEl;
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl?.classList.remove('kfo-toast--visible');
  }
  // Thumb image: prefer the mount's data-image (set by theme liquid); fall
  // back to one fetch of the product JSON, cached per handle.
  const productImgCache = {};
  async function productImage(handle, provided) {
    if (provided) return provided;
    if (productImgCache[handle] !== undefined) return productImgCache[handle];
    try {
      const res = await fetch(`/products/${handle}.js`);
      productImgCache[handle] = res.ok ? ((await res.json()).featured_image || '') : '';
    } catch {
      productImgCache[handle] = '';
    }
    return productImgCache[handle];
  }
  async function showFavoriteToast(handle, imageUrl) {
    const el = ensureToast();
    el.querySelector('.kfo-toast-thumb').innerHTML = '';
    const img = await productImage(handle, imageUrl);
    el.querySelector('.kfo-toast-thumb').innerHTML = img ? `<img src="${img}" alt="" />` : '';
    // force reflow so re-triggering restarts the transition
    void el.offsetWidth;
    el.classList.add('kfo-toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  }

  // --- Heart button block (product page) ---
  // Rendered as "♡ ADD TO FAVORITE" (outline heart + uppercase label), same
  // look as the combination modal's favorite button. The SVGs are the modal's
  // favHeartSvg glyphs, inlined here so product pages don't need kfo-modal.js.
  function heartSvg(active) {
    return active
      ? `<svg viewBox="0 0 63 63" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M45.009 33.6348C46.7774 31.8478 47.8757 29.4279 47.8757 26.7288C47.8757 24.1369 46.8461 21.6512 45.0133 19.8184C43.1806 17.9857 40.6949 16.9561 38.103 16.9561C34.8454 16.9561 31.9601 18.5383 30.1918 20.9955C29.2891 19.7418 28.1006 18.7214 26.7247 18.0189C25.3489 17.3164 23.8253 16.952 22.2805 16.9561C19.6886 16.9561 17.2029 17.9857 15.3702 19.8184C13.5374 21.6512 12.5078 24.1369 12.5078 26.7288C12.5078 29.4279 13.6061 31.8478 15.3745 33.6348L30.1918 48.4521L45.009 33.6348Z" fill="currentColor"/></svg>`
      : `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.2181 19.7518C10.7507 19.2875 10.3804 18.7349 10.1288 18.1261C9.87712 17.5173 9.74916 16.8644 9.75234 16.2057C9.75234 14.8733 10.2816 13.5956 11.2237 12.6534C12.1658 11.7113 13.4436 11.1821 14.776 11.1821C16.6436 11.1821 18.2748 12.1986 19.1377 13.7116H20.4616C20.9002 12.9422 21.535 12.3027 22.3011 11.8584C23.0673 11.414 23.9376 11.1807 24.8232 11.1821C26.1556 11.1821 27.4334 11.7113 28.3755 12.6534C29.3176 13.5956 29.8469 14.8733 29.8469 16.2057C29.8469 17.5887 29.2559 18.8653 28.3812 19.7518L19.7996 28.3215L11.2181 19.7518ZM29.2086 20.591C30.3315 19.4563 31.0289 17.9196 31.0289 16.2057C31.0289 14.5598 30.3751 12.9814 29.2113 11.8176C28.0475 10.6538 26.4691 10 24.8232 10C22.7547 10 20.9225 11.0047 19.7996 12.565C19.2264 11.7689 18.4717 11.121 17.5981 10.6749C16.7244 10.2288 15.7569 9.99744 14.776 10C13.1301 10 11.5517 10.6538 10.3879 11.8176C9.22412 12.9814 8.57031 14.5598 8.57031 16.2057C8.57031 17.9196 9.26771 19.4563 10.3906 20.591L19.7996 30L29.2086 20.591Z" fill="currentColor"/></svg>`;
  }

  function initHeartBtn() {
    const root = document.getElementById('kfo-product-fav-btn');
    if (!root) return;

    const handle = root.dataset.handle;
    if (!handle) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kfo-product-fav-btn';
    root.appendChild(btn);

    function render() {
      const active = isFav(handle);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-label', active ? kfoT('Remove from favorites') : kfoT('Add to favorites'));
      btn.innerHTML =
        `<span class="kfo-product-fav-heart">${heartSvg(active)}</span>` +
        `<span class="kfo-product-fav-label">${active ? kfoT('ADDED TO FAVORITE') : kfoT('ADD TO FAVORITE')}</span>`;
    }
    render();

    btn.addEventListener('click', () => {
      toggleFav(handle);
      if (isFav(handle)) showFavoriteToast(handle, root.dataset.image);
    });
    window.addEventListener('kfo:product-favorites-changed', render);
  }

  // --- Gallery block ---
  function initGallery() {
    const root = document.getElementById('kfo-product-favorites');
    if (!root) return;

    const heartUrl     = root.dataset.heartUrl || '';
    const heartActiveUrl = root.dataset.heartActiveUrl || heartUrl;
    const perPage      = parseInt(root.dataset.perPage) || 12;

    let page = 1;

    root.innerHTML = `
      <div id="kfo-pfav-grid" class="kfo-grid"></div>
      <div class="kfo-pagination" id="kfo-pfav-pagination"></div>
    `;

    window.addEventListener('kfo:product-favorites-changed', () => {
      page = 1;
      renderGallery();
    });

    renderGallery();

    async function renderGallery() {
      const grid = document.getElementById('kfo-pfav-grid');
      const handles = getFavs();

      if (!handles.length) {
        grid.innerHTML = EMPTY_HTML;
        document.getElementById('kfo-pfav-pagination').innerHTML = '';
        return;
      }

      grid.innerHTML = '<div class="kfo-loading"><span class="kfo-spinner"></span></div>';

      const start = (page - 1) * perPage;
      const pageHandles = handles.slice(start, start + perPage);
      const nbPages = Math.ceil(handles.length / perPage);

      const results = await Promise.all(
        pageHandles.map(handle =>
          fetch(`/products/${handle}.js`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );

      const products = results.filter(Boolean);

      if (!products.length) {
        grid.innerHTML = `<p class="kfo-empty">${kfoT('No favorite products found.')}</p>`;
        document.getElementById('kfo-pfav-pagination').innerHTML = '';
        return;
      }

      grid.innerHTML = products.map(p => productCardHtml(p, heartUrl, heartActiveUrl)).join('');
      bindGalleryCards(grid, products, handles, heartUrl, heartActiveUrl);
      renderPagination(nbPages);
    }

    function renderPagination(nbPages) {
      const el = document.getElementById('kfo-pfav-pagination');
      if (nbPages <= 1) { el.innerHTML = ''; return; }
      el.innerHTML = `
        <button class="kfo-page-btn" id="kfo-pfav-prev" ${page === 1 ? 'disabled' : ''}>&#8592; ${kfoT('Prev')}</button>
        <span class="kfo-page-label">${page} / ${nbPages}</span>
        <button class="kfo-page-btn" id="kfo-pfav-next" ${page >= nbPages ? 'disabled' : ''}>${kfoT('Next')} &#8594;</button>
      `;
      el.querySelector('#kfo-pfav-prev')?.addEventListener('click', () => { page--; renderGallery(); window.scrollTo({ top: root.offsetTop - 20, behavior: 'smooth' }); });
      el.querySelector('#kfo-pfav-next')?.addEventListener('click', () => { page++; renderGallery(); window.scrollTo({ top: root.offsetTop - 20, behavior: 'smooth' }); });
    }

    function bindGalleryCards(container, products, handles, heartUrl, heartActiveUrl) {
      container.querySelectorAll('.kfo-pfav-card').forEach(card => {
        const handle = card.dataset.handle;

        // Heart toggle
        card.querySelector('.kfo-heart-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFav(handle);
          const active = isFav(handle);
          const btn = e.currentTarget;
          btn.classList.toggle('active', active);
          btn.querySelector('.kfo-heart-icon').src = active ? heartActiveUrl : heartUrl;
          if (!active) {
            card.remove();
            const grid = document.getElementById('kfo-pfav-grid');
            if (grid && !grid.querySelector('.kfo-pfav-card')) {
              grid.innerHTML = EMPTY_HTML;
            }
          }
        });

        // Click card → product page
        card.addEventListener('click', () => {
          window.location.href = `/products/${handle}`;
        });
      });
    }
  }

  function formatMoney(cents) {
    if (window.Shopify?.formatMoney) return window.Shopify.formatMoney(cents);
    return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: window.Shopify?.currency?.active || 'USD' });
  }

  // Card mirrors the theme's product card: portrait image, centered uppercase
  // title, centered price — no variant picker / add-to-cart (the card links to
  // the product page instead).
  function productCardHtml(product, heartUrl, heartActiveUrl) {
    const active    = isFav(product.handle);
    const img       = product.featured_image || '';
    const variants  = product.variants || [];
    const firstVariant = variants.find(v => v.available) || variants[0];
    const priceMin  = product.price_min ?? firstVariant?.price ?? 0;
    const priceMax  = product.price_max ?? firstVariant?.price ?? 0;
    const priceLabel = priceMin === priceMax ? formatMoney(priceMin) : `${kfoT('From')} ${formatMoney(priceMin)}`;

    return `
      <div class="kfo-card kfo-pfav-card" data-handle="${product.handle}" style="cursor:pointer">
        <div class="kfo-card-img">
          ${img
            ? `<img src="${img}" alt="${product.title}" loading="lazy" />`
            : '<div class="kfo-card-img-placeholder"></div>'
          }
          <button class="kfo-heart-btn ${active ? 'active' : ''}" data-handle="${product.handle}" aria-label="${active ? kfoT('Remove from favorites') : kfoT('Add to favorites')}">
            <img src="${active ? heartActiveUrl : heartUrl}" alt="" class="kfo-heart-icon" />
          </button>
          <span class="kfo-pfav-view-btn">${kfoT('VIEW PRODUCT')}</span>
        </div>
        <div class="kfo-pfav-info">
          <p class="kfo-pfav-title">${product.title}</p>
          <p class="kfo-pfav-price">${priceLabel}</p>
        </div>
      </div>
    `;
  }

  // --- Card overlay hearts (collection / product list) ---
  // The theme drops `<div class="kfo-product-fav-mount" data-handle="...">`
  // inside each product card's media wrapper; we render a small overlay heart
  // (same icon assets as the gallery cards) into every mount. Cards are
  // re-rendered by the theme on filtering/pagination, so a MutationObserver
  // re-binds new mounts as they appear.
  function initCardHearts() {
    const heartUrl = window.KFO_HEART_URL || '';
    const heartActiveUrl = window.KFO_HEART_ACTIVE_URL || heartUrl;
    if (!heartUrl) return;

    document.querySelectorAll('.kfo-product-fav-mount').forEach(mount => {
      if (mount.__kfoBound) return;
      mount.__kfoBound = true;
      const handle = mount.dataset.handle;
      if (!handle) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kfo-pcard-fav-btn';

      function render() {
        const active = isFav(handle);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-label', active ? kfoT('Remove from favorites') : kfoT('Add to favorites'));
        btn.innerHTML = `<img src="${active ? heartActiveUrl : heartUrl}" alt="" />`;
      }
      render();

      // Cards are usually wrapped in an <a> — keep the click on the heart.
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFav(handle);
        if (isFav(handle)) showFavoriteToast(handle, mount.dataset.image);
      });
      window.addEventListener('kfo:product-favorites-changed', render);
      mount.appendChild(btn);
    });
  }

  function init() {
    initHeartBtn();
    initGallery();
    initCardHearts();
    new MutationObserver(() => initCardHearts())
      .observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
