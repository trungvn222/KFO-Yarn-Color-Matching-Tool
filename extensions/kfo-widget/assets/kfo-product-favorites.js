(function () {
  'use strict';

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

  // --- Heart button block (product page) ---
  function initHeartBtn() {
    const root = document.getElementById('kfo-product-fav-btn');
    if (!root) return;

    const handle       = root.dataset.handle;
    const heartUrl     = root.dataset.heartUrl || '';
    const heartActiveUrl = root.dataset.heartActiveUrl || heartUrl;

    if (!handle) return;

    const btn = document.createElement('button');
    btn.className = 'kfo-product-fav-btn' + (isFav(handle) ? ' active' : '');
    btn.setAttribute('aria-label', isFav(handle) ? kfoT('Remove from favorites') : kfoT('Add to favorites'));
    btn.innerHTML = `<img src="${isFav(handle) ? heartActiveUrl : heartUrl}" class="kfo-product-fav-icon" alt="" />`;
    root.appendChild(btn);

    btn.addEventListener('click', () => {
      toggleFav(handle);
      const active = isFav(handle);
      btn.classList.toggle('active', active);
      btn.querySelector('.kfo-product-fav-icon').src = active ? heartActiveUrl : heartUrl;
      btn.setAttribute('aria-label', active ? kfoT('Remove from favorites') : kfoT('Add to favorites'));
    });

    window.addEventListener('kfo:product-favorites-changed', () => {
      const active = isFav(handle);
      btn.classList.toggle('active', active);
      btn.querySelector('.kfo-product-fav-icon').src = active ? heartActiveUrl : heartUrl;
    });
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
        const product = products.find(p => p.handle === handle);

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

        // Variant select — update price display, block card click
        const variantSelect = card.querySelector('.kfo-pfav-variant-select');
        if (variantSelect) {
          variantSelect.addEventListener('click', (e) => e.stopPropagation());
          variantSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            const price = Number(e.target.selectedOptions[0].dataset.price);
            const priceEl = card.querySelector('.kfo-pfav-price');
            if (priceEl) priceEl.textContent = formatMoney(price);
          });
        }

        // Add to cart — read variant from select or first variant
        card.querySelector('.kfo-pfav-add-btn')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          const variantId = variantSelect ? variantSelect.value : (product?.variants?.[0]?.id || '');
          if (!variantId) return;

          btn.disabled = true;
          btn.textContent = '...';

          try {
            const res = await fetch('/cart/add.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
            });
            if (!res.ok) throw await res.json().catch(() => ({}));
            btn.textContent = kfoT('ADDED ✓');
            btn.style.background = '#111';
            btn.style.color = '#fff';
            document.dispatchEvent(new CustomEvent('cart:refresh'));
            document.dispatchEvent(new CustomEvent('theme:cart:open'));
            setTimeout(() => { btn.textContent = kfoT('ADD TO CART'); btn.style.background = ''; btn.style.color = ''; btn.disabled = false; }, 2000);
          } catch (err) {
            btn.textContent = 'FAILED';
            btn.style.color = '#e53e3e';
            setTimeout(() => { btn.textContent = kfoT('ADD TO CART'); btn.style.color = ''; btn.disabled = false; }, 3000);
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

  function productCardHtml(product, heartUrl, heartActiveUrl) {
    const active    = isFav(product.handle);
    const img       = product.featured_image || '';
    const variants  = product.variants || [];
    const available = variants.filter(v => v.available);
    const firstVariant = available[0] || variants[0];
    const hasVariantSelector = variants.length > 1 && variants[0]?.title !== 'Default Title';
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
        </div>
        <div class="kfo-card-body">
          <p class="kfo-card-name">${product.title}</p>
          <p class="kfo-pfav-price">${priceLabel}</p>
          ${hasVariantSelector ? `
            <select class="kfo-pfav-variant-select">
              ${variants.map(v => `
                <option value="${v.id}" data-price="${v.price}" ${!v.available ? 'disabled' : ''}>
                  ${v.title}${!v.available ? kfoT(' — Sold out') : ''}
                </option>`).join('')}
            </select>
          ` : ''}
          ${firstVariant
            ? `<button class="kfo-pfav-add-btn kfo-view-detail-btn">${kfoT('ADD TO CART')}</button>`
            : `<p class="kfo-pfav-unavailable">${kfoT('Unavailable')}</p>`
          }
        </div>
      </div>
    `;
  }

  function init() {
    initHeartBtn();
    initGallery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
