// Shared storefront code: API helper, cart, wishlist, header/footer, product cards.
(function () {
  'use strict';

  // ---------- Utilities ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-LK');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const label = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Please try again.');
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ } },
  };

  // ---------- Icons ----------
  const icon = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20s-7-4.4-9-9.1C1.7 7.6 4 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.9 1.4-1.8 2.8-2.9 4.8-2.9 3.2 0 5.5 3.1 4.2 6.4C19 15.6 12 20 12 20Z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    image: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="9" width="38" height="30" rx="3"/><circle cx="17" cy="20" r="4"/><path d="m5 34 11-10 9 8 6-5 12 10"/></svg>',
    hanger: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 14a4 4 0 1 1 4-4"/><path d="M24 14v4L5 32c-2 1.5-1 4 1.5 4h35c2.5 0 3.5-2.5 1.5-4L24 18"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
    return: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 5 5 9-10"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c.4 2.3 1.9 3.7 4 3.9v3.3a7.3 7.3 0 0 1-4-1.3v6.3A6 6 0 1 1 10.4 9v3.4a2.7 2.7 0 1 0 2.8 2.7V3h3.3Z"/></svg>',
  };

  // Labelled image placeholder: swap for <img> once product photography is available.
  // Each label gets one of five warm tones so grids of placeholders don't look like one flat block.
  function toneFor(text) {
    let h = 0;
    for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `ph-t${(h % 5) + 1}`;
  }
  function placeholder(text = 'Image', cls = '', svg = icon.hanger) {
    const tone = /ph-dark|ph-t\d/.test(cls) ? '' : toneFor(text.split(' - ')[0]);
    return `<div class="ph ${tone} ${cls}" role="img" aria-label="${esc(text)} image placeholder">${svg}<span class="ph-label">${esc(text)}</span></div>`;
  }

  // ---------- Toasts ----------
  function toast(message, { type = '', link } = {}) {
    let wrap = $('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${esc(message)}</span>${link ? `<a href="${esc(link.href)}">${esc(link.text)}</a>` : ''}`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ---------- Cart (stored in the browser; prices & stock re-checked by the server) ----------
  const Cart = {
    items() { return store.get('cart', []); },
    save(items) { store.set('cart', items); Cart.updateBadge(); },
    add(item) {
      const items = Cart.items();
      const existing = items.find((i) => i.variantId === item.variantId);
      if (existing) existing.quantity = Math.min(20, existing.quantity + item.quantity);
      else items.push(item);
      Cart.save(items);
    },
    setQty(variantId, quantity) {
      Cart.save(Cart.items().map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(20, quantity)) } : i)));
    },
    remove(variantId) { Cart.save(Cart.items().filter((i) => i.variantId !== variantId)); },
    clear() { Cart.save([]); },
    count() { return Cart.items().reduce((a, i) => a + i.quantity, 0); },
    updateBadge() { $$('[data-cart-count]').forEach((el) => { const c = Cart.count(); el.textContent = c || ''; el.dataset.count = c; }); },
    payload() { return Cart.items().map((i) => ({ variantId: i.variantId, quantity: i.quantity })); },
  };

  // ---------- Session ----------
  let currentUser;
  async function getUser() {
    if (currentUser !== undefined) return currentUser;
    try { currentUser = (await api('/api/auth/me')).user; } catch { currentUser = null; }
    return currentUser;
  }
  function setUser(u) { currentUser = u; }

  // ---------- Wishlist (browser copy, synced to the account when logged in) ----------
  const Wishlist = {
    ids() { return store.get('wishlist', []); },
    has(id) { return Wishlist.ids().includes(id); },
    async toggle(id) {
      const ids = Wishlist.ids();
      const on = !ids.includes(id);
      store.set('wishlist', on ? [...ids, id] : ids.filter((x) => x !== id));
      Wishlist.updateUI();
      const user = await getUser();
      if (user) {
        try { on ? await api('/api/account/wishlist', { method: 'POST', body: { productId: id } }) : await api(`/api/account/wishlist/${id}`, { method: 'DELETE' }); } catch { /* keep local copy */ }
      }
      return on;
    },
    async sync() {
      const user = await getUser();
      if (!user) return;
      try {
        const local = Wishlist.ids();
        const remote = await api('/api/account/wishlist');
        const missing = local.filter((id) => !remote.includes(id));
        if (missing.length) await api('/api/account/wishlist', { method: 'POST', body: { productIds: missing } });
        store.set('wishlist', [...new Set([...remote, ...local])]);
        Wishlist.updateUI();
      } catch { /* offline */ }
    },
    updateUI() {
      const ids = Wishlist.ids();
      $$('[data-wish]').forEach((b) => {
        const on = ids.includes(Number(b.dataset.wish));
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
        b.setAttribute('aria-label', on ? 'Remove from wishlist' : 'Add to wishlist');
      });
      $$('[data-wish-count]').forEach((el) => { el.textContent = ids.length || ''; el.dataset.count = ids.length; });
    },
  };

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-wish]');
    if (!btn) return;
    e.preventDefault();
    const on = await Wishlist.toggle(Number(btn.dataset.wish));
    toast(on ? 'Saved to your wishlist' : 'Removed from wishlist', on ? { link: { href: '/wishlist', text: 'View' } } : {});
    if (!on && document.body.dataset.page === 'wishlist') btn.closest('.product-card')?.remove();
  });

  // ---------- Product card ----------
  function stars(rating) {
    const r = Math.round(rating || 0);
    return `<span class="stars" aria-label="${rating} out of 5 stars">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`;
  }
  function priceHtml(p) {
    return p.onSale
      ? `<span class="price"><span class="now on-sale">${money(p.finalPrice)}</span><span class="was">${money(p.price)}</span></span>`
      : `<span class="price"><span class="now">${money(p.finalPrice)}</span></span>`;
  }
  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'S/M', 'L/XL'];
  const sortSizes = (sizes) => [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a); const ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, undefined, { numeric: true });
  });
  function productCard(p) {
    const isNew = Date.now() - new Date(p.createdAt) < 21 * 864e5;
    const imgs = p.images.length ? p.images : [{ alt: 'Front' }];
    return `
      <article class="product-card">
        <a class="media" href="/product/${esc(p.slug)}" aria-label="${esc(p.name)}">
          ${placeholder(imgs[0].alt, toneFor(p.name))}
          ${imgs[1] ? placeholder(imgs[1].alt, `ph-alt ${toneFor(p.name)}`) : ''}
          ${p.inStock ? `<span class="quick-sizes" aria-hidden="true"><span>Sizes</span>${sortSizes(p.sizes).slice(0, 6).map((s) => `<b>${esc(s)}</b>`).join('')}</span>` : ''}
        </a>
        <div class="badges">
          ${p.onSale ? `<span class="tag tag-sale">-${Math.round((1 - p.finalPrice / p.price) * 100)}%</span>` : ''}
          ${!p.inStock ? '<span class="tag tag-out">Sold out</span>' : ''}
          ${isNew && p.inStock ? '<span class="tag tag-new">New</span>' : ''}
        </div>
        <button class="wish-btn ${Wishlist.has(p.id) ? 'active' : ''}" type="button" data-wish="${p.id}" aria-label="Add to wishlist">${icon.heart}</button>
        <div class="info">
          ${p.category ? `<span class="cat">${esc(p.category.name)}</span>` : ''}
          <a class="name" href="/product/${esc(p.slug)}">${esc(p.name)}</a>
          ${priceHtml(p)}
          <div class="swatches">${p.colours.map((c) => `<span class="swatch-dot" title="${esc(c.name)}" style="background:${esc(c.hex || '#ccc')}"></span>`).join('')}</div>
        </div>
      </article>`;
  }
  function skeletonCards(n = 4) {
    return Array.from({ length: n }, () => '<div><div class="skeleton" style="aspect-ratio:3/4"></div><div class="skeleton" style="height:14px;margin-top:12px;width:70%"></div><div class="skeleton" style="height:14px;margin-top:8px;width:40%"></div></div>').join('');
  }

  // ---------- Settings ----------
  let settingsPromise;
  function getSettings() {
    if (!settingsPromise) settingsPromise = api('/api/settings').catch(() => ({ storeName: 'STORE' }));
    return settingsPromise;
  }

  // ---------- Header & footer ----------
  function renderHeader(s) {
    const path = location.pathname;
    const nav = [
      ['/shop', 'Shop all'], ['/new-arrivals', 'New in'], ['/shop?category=women', 'Women'], ['/shop?category=men', 'Men'],
      ['/shop?category=kids', 'Kids'], ['/shop?category=accessories', 'Accessories'], ['/sale', 'Sale'],
    ];
    const isActive = (href) => (href.includes('?') ? location.pathname + location.search === href : path === href);
    const header = $('#site-header');
    if (!header) return;
    header.outerHTML = `
      <a class="skip-link" href="#main">Skip to content</a>
      ${s.announcement ? `<div class="announcement">${esc(s.announcement)}</div>` : ''}
      <header class="site-header">
        <div class="wrap header-row">
          <div style="display:flex;align-items:center;gap:20px">
            <button class="icon-btn menu-toggle" type="button" aria-label="Open menu" data-open-menu>${icon.menu}</button>
            <nav class="main-nav" aria-label="Main">
              ${nav.slice(0, 4).map(([h, t]) => `<a href="${h}" class="${isActive(h) ? 'active' : ''}">${t}</a>`).join('')}
            </nav>
          </div>
          <a href="/" class="logo">${esc(s.storeName || 'STORE')}</a>
          <div class="header-actions">
            <nav class="main-nav" aria-label="More" style="margin-right:14px">
              ${nav.slice(4).map(([h, t]) => `<a href="${h}" class="${isActive(h) ? 'active' : ''} ${t === 'Sale' ? 'nav-sale' : ''}">${t}</a>`).join('')}
            </nav>
            <button class="icon-btn" type="button" aria-label="Search" aria-expanded="false" data-toggle-search>${icon.search}</button>
            <a class="icon-btn hide-sm" href="/account" aria-label="Account">${icon.user}</a>
            <a class="icon-btn hide-sm" href="/wishlist" aria-label="Wishlist">${icon.heart}<span class="badge-count" data-wish-count></span></a>
            <a class="icon-btn" href="/cart" aria-label="Cart">${icon.bag}<span class="badge-count" data-cart-count></span></a>
          </div>
        </div>
        <div class="search-bar hidden" id="search-bar">
          <form class="wrap" action="/search" role="search">
            <label class="sr-only" for="site-search">Search products</label>
            <input id="site-search" name="q" type="search" placeholder="Search for t-shirts, dresses, linen..." autocomplete="off" />
            <button class="btn" type="submit">Search</button>
          </form>
        </div>
      </header>
      <div class="mobile-nav" id="mobile-nav" aria-hidden="true">
        <nav class="mobile-nav-panel" aria-label="Mobile">
          <button class="icon-btn close" type="button" aria-label="Close menu" data-close-menu>${icon.close}</button>
          ${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}
          <a href="/account">My account</a><a href="/wishlist">Wishlist</a><a href="/track-order">Track order</a><a href="/contact">Contact</a>
        </nav>
      </div>`;

    $('[data-toggle-search]').addEventListener('click', (e) => {
      const bar = $('#search-bar');
      bar.classList.toggle('hidden');
      e.currentTarget.setAttribute('aria-expanded', !bar.classList.contains('hidden'));
      if (!bar.classList.contains('hidden')) $('#site-search').focus();
    });
    const mnav = $('#mobile-nav');
    $('[data-open-menu]').addEventListener('click', () => { mnav.classList.add('open'); mnav.setAttribute('aria-hidden', 'false'); });
    mnav.addEventListener('click', (e) => { if (e.target === mnav || e.target.closest('[data-close-menu]')) { mnav.classList.remove('open'); mnav.setAttribute('aria-hidden', 'true'); } });
  }

  function renderFooter(s) {
    const footer = $('#site-footer');
    if (!footer) return;
    footer.outerHTML = `
      <section class="newsletter" aria-labelledby="nl-title">
        <div class="wrap">
          <div>
            <span class="eyebrow">Newsletter</span>
            <h2 id="nl-title" style="margin:0">New arrivals & offers, first.</h2>
            <p class="muted" style="margin:8px 0 0">Join our list for early access to new collections and members-only sales.</p>
          </div>
          <form id="newsletter-form" novalidate>
            <div class="row">
              <label class="sr-only" for="nl-email">Email address</label>
              <input id="nl-email" type="email" name="email" placeholder="Your email address" required />
              <button class="btn" type="submit">Subscribe</button>
            </div>
            <label class="check"><input type="checkbox" name="consent" required /> I agree to receive marketing emails and can unsubscribe at any time.</label>
            <div class="nl-msg" aria-live="polite"></div>
          </form>
        </div>
      </section>
      <footer class="site-footer">
        <div class="wrap">
          <div class="footer-grid">
            <div class="footer-brand">
              <a href="/" class="logo">${esc(s.storeName)}</a>
              <p>${esc(s.tagline)}</p>
              <p style="margin:0">${esc(s.address)}<br>${esc(s.phone)} &middot; ${esc(s.email)}</p>
              <div class="socials">
                ${s.instagram ? `<a href="${esc(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${icon.instagram}</a>` : ''}
                ${s.facebook ? `<a href="${esc(s.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${icon.facebook}</a>` : ''}
                ${s.tiktok ? `<a href="${esc(s.tiktok)}" target="_blank" rel="noopener" aria-label="TikTok">${icon.tiktok}</a>` : ''}
                ${s.whatsapp ? `<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon.whatsapp}</a>` : ''}
              </div>
            </div>
            <div><h4>Shop</h4><ul>
              <li><a href="/new-arrivals">New arrivals</a></li><li><a href="/shop?category=women">Women</a></li>
              <li><a href="/shop?category=men">Men</a></li><li><a href="/shop?category=kids">Kids</a></li>
              <li><a href="/shop?category=accessories">Accessories</a></li><li><a href="/sale">Sale</a></li></ul></div>
            <div><h4>Help</h4><ul>
              <li><a href="/track-order">Track your order</a></li><li><a href="/shipping">Delivery information</a></li>
              <li><a href="/returns">Returns & exchanges</a></li><li><a href="/faq">FAQ</a></li><li><a href="/contact">Contact us</a></li></ul></div>
            <div><h4>Company</h4><ul>
              <li><a href="/about">About us</a></li><li><a href="/account">My account</a></li>
              <li><a href="/privacy-policy">Privacy policy</a></li><li><a href="/terms">Terms & conditions</a></li></ul></div>
          </div>
          <div class="footer-bottom">
            <span>&copy; ${new Date().getFullYear()} ${esc(s.storeName)}. All rights reserved. Website by E-POCH IT Solutions.</span>
            <div class="pay-badges" aria-label="Accepted payments">
              ${s.cardEnabled === 'true' ? '<span>VISA</span><span>MASTERCARD</span>' : ''}${s.codEnabled === 'true' ? '<span>CASH ON DELIVERY</span>' : ''}${s.bankTransferEnabled === 'true' ? '<span>BANK TRANSFER</span>' : ''}
            </div>
          </div>
        </div>
      </footer>
      ${s.whatsapp ? `<a class="whatsapp-fab" href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">${icon.whatsapp}</a>` : ''}`;

    $('#newsletter-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget; const msg = $('.nl-msg', f);
      try {
        const r = await api('/api/newsletter', { method: 'POST', body: { email: f.email.value, consent: f.consent.checked } });
        msg.innerHTML = `<div class="form-success">${esc(r.message)}</div>`; f.reset();
      } catch (err) { msg.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
    });
  }

  // Helpers shared by forms
  function formData(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value;
    }
    return o;
  }
  function setLoading(btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.text = btn.textContent; btn.textContent = text || 'Please wait...'; btn.classList.add('is-loading'); }
    else { btn.textContent = btn.dataset.text || btn.textContent; btn.classList.remove('is-loading'); }
  }
  function statusClass(s) {
    if (['DELIVERED', 'PAID', 'CONFIRMED', 'PROCESSED', 'ACTIVE'].includes(s)) return 'ok';
    if (['PENDING_PAYMENT', 'PENDING', 'RECEIVED', 'REQUESTED', 'DRAFT'].includes(s)) return 'warn';
    if (['CANCELLED', 'FAILED', 'RETURNED', 'REFUNDED', 'REJECTED'].includes(s)) return 'bad';
    return 'info';
  }
  const pill = (s) => `<span class="status-pill ${statusClass(s)}">${esc(label(s))}</span>`;

  // ---------- Boot ----------
  const ready = (async () => {
    const s = await getSettings();
    renderHeader(s);
    renderFooter(s);
    Cart.updateBadge();
    Wishlist.updateUI();
    Wishlist.sync();
    if (s.storeName && document.title.includes('{store}')) document.title = document.title.replace('{store}', s.storeName);

    // Header gains a shadow once the page scrolls
    const header = $('.site-header');
    const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return s;
  })();

  // Fade sections in as they scroll into view. Elements added later can call Store.reveal().
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' })
    : null;
  function reveal(root = document) {
    $$('.reveal:not(.in)', root).forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
  }
  document.addEventListener('DOMContentLoaded', () => reveal());

  window.Store = {
    reveal, api, esc, money, $, $$, fmtDate, label, icon, placeholder, toast, Cart, Wishlist, getUser, setUser, productCard, skeletonCards, priceHtml, stars, getSettings, formData, setLoading, pill, statusClass, ready };
})();
