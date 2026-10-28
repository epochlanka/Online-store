// Admin dashboard (single page, hash-routed). All data comes from /api/admin/*.
(function () {
  'use strict';

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-LK');
  const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
  const dateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
  const label = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { showLogin(); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`; el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3500);
  }
  function pillClass(s) {
    if (['DELIVERED', 'PAID', 'CONFIRMED', 'PROCESSED', 'ACTIVE', 'APPROVED'].includes(s)) return 'ok';
    if (['PENDING_PAYMENT', 'PENDING', 'RECEIVED', 'REQUESTED', 'DRAFT', 'PARTIALLY_REFUNDED'].includes(s)) return 'warn';
    if (['CANCELLED', 'FAILED', 'RETURNED', 'REFUNDED', 'REJECTED'].includes(s)) return 'bad';
    return 'info';
  }
  const pill = (s) => `<span class="pill ${pillClass(s)}">${esc(label(s))}</span>`;
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
  const field = (name, lbl, value = '', attrs = '') => `<div class="field"><label for="f-${name}">${lbl}</label><input id="f-${name}" name="${name}" value="${esc(value ?? '')}" ${attrs}></div>`;

  // Modal
  function openModal(title, html, onSubmit) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    $('#modal').classList.add('open');
    const form = $('#modal-body form');
    if (form && onSubmit) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', form);
        btn.disabled = true;
        try { await onSubmit(form); closeModal(); }
        catch (err) { const m = $('.form-msg', form); if (m) m.innerHTML = `<div class="msg-error">${esc(err.message)}</div>`; else toast(err.message, 'error'); }
        btn.disabled = false;
      });
    }
    setTimeout(() => $('#modal-body input:not([type=hidden]), #modal-body select')?.focus(), 30);
  }
  function closeModal() { $('#modal').classList.remove('open'); }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ---------- Auth ----------
  let me = null;
  let meta = { categories: [], settings: {} };

  function showLogin() {
    $('#admin').classList.add('hidden');
    $('#login-screen').classList.remove('hidden');
    fetch('/api/settings').then((r) => r.json()).then((s) => { $('#login-brand').textContent = s.storeName || 'Store'; }).catch(() => {});
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/login', { method: 'POST', body: formData(e.target) });
      if (!['ADMIN', 'STAFF'].includes(r.user.role)) { await api('/auth/logout', { method: 'POST' }); throw new Error('This account does not have staff access.'); }
      boot();
    } catch (err) { $('#login-msg').innerHTML = `<div class="msg-error">${esc(err.message)}</div>`; }
  });
  $('#logout').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); });

  // Mobile sidebar
  const closeSidebar = () => { $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('show'); };
  $('#menu-btn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebar-backdrop').classList.add('show'); });
  $('#sidebar-backdrop').addEventListener('click', closeSidebar);

  // Profile menu
  $('#profile-btn').addEventListener('click', (e) => {
    const menu = $('#profile-menu');
    menu.classList.toggle('hidden');
    e.currentTarget.setAttribute('aria-expanded', !menu.classList.contains('hidden'));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#profile')) $('#profile-menu').classList.add('hidden'); });

  // Top search jumps to the orders list
  $('#top-search').addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem('orderFilters', new URLSearchParams({ q: $('#top-q').value.trim() }));
    if (location.hash === '#orders') route(); else location.hash = 'orders';
  });

  // ---------- Navigation ----------
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    products: svg('<path d="M9 3 4 6l2 4 2-1v12h8V9l2 1 2-4-5-3a3 3 0 0 1-6 0Z"/>'),
    categories: svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>'),
    inventory: svg('<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>'),
    orders: svg('<path d="M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6l2-4Z"/><path d="M4 6h16M9 11a3 3 0 0 0 6 0"/>'),
    customers: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>'),
    payments: svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>'),
    shipping: svg('<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'),
    discounts: svg('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.5"/>'),
    reviews: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>'),
    reports: svg('<path d="M3 21h18M6 17V11M11 17V6M16 17v-4M21 17V8"/>'),
    content: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    staff: svg('<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>'),
    sales: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    today: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
    pending: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    alert: svg('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5v.01"/>'),
    star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
  };
  const NAV = [
    ['dashboard', 'Dashboard', 'Overview'],
    ['orders', 'Orders', 'Sales'], ['payments', 'Payments', 'Sales'], ['shipping', 'Shipping', 'Sales'], ['discounts', 'Discounts', 'Sales'], ['reports', 'Reports', 'Sales'],
    ['products', 'Products', 'Catalogue'], ['categories', 'Categories', 'Catalogue'], ['inventory', 'Inventory', 'Catalogue'], ['reviews', 'Reviews', 'Catalogue'],
    ['customers', 'Customers', 'People'], ['staff', 'Staff & Roles', 'People', true],
    ['content', 'Website Content', 'Store'], ['settings', 'Settings', 'Store', true],
  ];
  function renderNav(counts = {}) {
    const current = (location.hash.slice(1) || 'dashboard').split('/')[0];
    let group = '';
    $('#side-nav').innerHTML = NAV.filter(([, , , adminOnly]) => !adminOnly || me.role === 'ADMIN').map(([k, t, g]) => {
      const head = g !== group ? `<span class="nav-group">${g}</span>` : '';
      group = g;
      return `${head}<a href="#${k}" class="${current === k ? 'active' : ''}" ${current === k ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${ICONS[k]}</span>${t}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</a>`;
    }).join('');
  }
  let navCounts = {};
  window.addEventListener('hashchange', route);

  async function route() {
    const [view, id] = (location.hash.slice(1) || 'dashboard').split('/');
    const def = NAV.find(([k]) => k === view) || NAV[0];
    $('#view-title').textContent = def[1];
    $('#view-sub').textContent = def[0] === 'dashboard' ? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : def[2];
    document.title = `${def[1]} | Admin`;
    renderNav(navCounts);
    closeSidebar();
    const el = $('#view');
    el.innerHTML = '<div class="empty">Loading...</div>';
    try { await (views[def[0]] || views.dashboard)(el, id); }
    catch (err) { el.innerHTML = `<div class="msg-error">${esc(err.message)}</div>`; }
    el.focus({ preventScroll: true });
  }

  async function boot() {
    let user;
    try { user = (await api('/auth/me')).user; } catch { user = null; }
    if (!user || !['ADMIN', 'STAFF'].includes(user.role)) return showLogin();
    me = user;
    $('#login-screen').classList.add('hidden');
    $('#admin').classList.remove('hidden');
    $('#who-name').textContent = me.name;
    $('#who-role').textContent = label(me.role);
    $('#avatar').textContent = me.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const [cats, settings] = await Promise.all([api('/admin/categories'), api('/admin/settings')]);
    meta = { categories: cats, settings };
    $('#store-name').textContent = settings.storeName || 'Store';
    $('#brand-logo').textContent = (settings.storeName || 'S')[0];
    refreshCounts();
    route();
  }
  async function refreshCounts() {
    try {
      const [s, reviews] = await Promise.all([api('/admin/stats'), api('/admin/reviews')]);
      navCounts = { orders: s.pendingOrders, inventory: s.lowStockCount, reviews: reviews.filter((r) => !r.approved).length };
      renderNav(navCounts);
    } catch { /* ignore */ }
  }

  // ---------- Views ----------
  const views = {};

  // Smooth area chart drawn as inline SVG
  function areaChart(points, fmt) {
    const W = 640; const H = 220; const P = 8;
    const max = Math.max(1, ...points.map((p) => p.value));
    const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / Math.max(1, points.length - 1), H - 26 - ((H - 46) * p.value) / max]);
    const line = xy.map(([x, y], i) => {
      if (!i) return `M${x},${y}`;
      const [px, py] = xy[i - 1]; const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    }).join(' ');
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${W}" y1="${H - 26 - (H - 46) * f}" y2="${H - 26 - (H - 46) * f}" class="grid"/>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales chart">
      <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${line} L${xy[xy.length - 1][0]},${H - 26} L${xy[0][0]},${H - 26} Z" fill="url(#ga)"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
      ${xy.map(([x, y], i) => `<g class="pt"><rect x="${x - (W / points.length) / 2}" y="0" width="${W / points.length}" height="${H}" fill="transparent"><title>${points[i].label}: ${fmt(points[i].value)}</title></rect><circle cx="${x}" cy="${y}" r="4"/></g>`).join('')}
    </svg><div class="chart-x">${points.map((p, i) => `<span>${i % 2 === 0 ? esc(p.short) : ''}</span>`).join('')}</div></div>`;
  }
  const STATUS_COLORS = { PENDING_PAYMENT: '#d9a441', RECEIVED: '#e2c27a', CONFIRMED: '#6f9ed6', PROCESSING: '#4a6fa5', SHIPPED: '#8a6fc4', DELIVERED: '#3f9a63', CANCELLED: '#c9564c', RETURNED: '#9a8f86' };

  views.dashboard = async (el) => {
    const [s, rep] = await Promise.all([api('/admin/stats'), api('/admin/reports?days=30')]);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const week = s.salesByDay.slice(7).reduce((a, d) => a + d.total, 0);
    const prevWeek = s.salesByDay.slice(0, 7).reduce((a, d) => a + d.total, 0);
    const change = prevWeek ? Math.round(((week - prevWeek) / prevWeek) * 100) : null;
    const statusTotal = rep.byStatus.reduce((a, x) => a + x.value, 0);
    let acc = 0;
    const donut = rep.byStatus.map((x) => { const from = acc; acc += (x.value / Math.max(1, statusTotal)) * 360; return `${STATUS_COLORS[x.key] || '#ccc'} ${from}deg ${acc}deg`; }).join(', ');
    const stat = (icon, tone, k, v, sub, href) => `<${href ? `a href="${href}"` : 'div'} class="stat tone-${tone}"><span class="stat-icon">${ICONS[icon]}</span><div><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div></${href ? 'a' : 'div'}>`;

    el.innerHTML = `
      <section class="welcome">
        <div>
          <h2>${greet}, ${esc(me.name.split(' ')[0])}</h2>
          <p>${s.pendingOrders ? `You have <strong>${s.pendingOrders} order${s.pendingOrders === 1 ? '' : 's'}</strong> waiting for confirmation` : 'All orders are up to date'}${s.lowStockCount ? ` and <strong>${s.lowStockCount}</strong> low-stock variants.` : '.'}</p>
        </div>
        <div class="welcome-actions">
          <a class="btn btn-light" href="#orders">${ICONS.orders} View orders</a>
          <a class="btn btn-ghost" href="#products" id="quick-add">${ICONS.plus} Add product</a>
        </div>
      </section>

      <div class="stats">
        ${stat('sales', 'accent', 'Total sales', money(s.totalSales), change == null ? 'Excludes cancelled & returned' : `<span class="trend ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%</span> vs previous week`)}
        ${stat('today', 'blue', "Today's sales", money(s.todaySales), `${s.todayOrders} ${s.todayOrders === 1 ? 'order' : 'orders'} today`)}
        ${stat('orders', 'violet', 'Total orders', s.totalOrders, `<span class="${s.pendingOrders ? 'warn-text' : ''}">${s.pendingOrders} pending</span>`, '#orders')}
        ${stat('alert', s.lowStockCount ? 'red' : 'green', 'Low-stock variants', s.lowStockCount, `${s.unitsInStock.toLocaleString()} units in stock`, '#inventory')}
      </div>

      <div class="cols">
        <div class="panel"><div class="panel-head"><div><h2>Sales overview</h2><span class="muted small">Last 14 days &middot; ${money(s.salesByDay.reduce((a, d) => a + d.total, 0))}</span></div><a class="btn btn-outline btn-sm" href="#reports">Full report</a></div>
          <div class="panel-body">${areaChart(s.salesByDay.map((d) => ({ value: d.total, label: date(d.date), short: d.date.slice(8) })), money)}</div></div>
        <div class="panel"><div class="panel-head"><div><h2>Order status</h2><span class="muted small">Last 30 days</span></div></div>
          <div class="panel-body donut-wrap">
            <div class="donut" style="background:conic-gradient(${donut || '#eee 0deg 360deg'})"><div><strong>${statusTotal}</strong><span>orders</span></div></div>
            <ul class="legend">${rep.byStatus.map((x) => `<li><i style="background:${STATUS_COLORS[x.key] || '#ccc'}"></i>${esc(label(x.key))}<b>${x.value}</b></li>`).join('')}</ul>
          </div></div>
      </div>

      <div class="cols">
        <div class="panel"><div class="panel-head"><h2>Recent orders</h2><a class="btn btn-outline btn-sm" href="#orders">All orders</a></div>
          <div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th class="num">Total</th></tr></thead><tbody>
          ${s.recentOrders.map((o) => `<tr class="row-link" data-href="#orders/${o.id}"><td><strong>${esc(o.orderNumber)}</strong><div class="sub">${dateTime(o.createdAt)}</div></td><td><div class="cell-flex"><span class="avatar sm">${esc(o.name[0])}</span>${esc(o.name)}</div></td><td>${pill(o.status)}</td><td>${pill(o.paymentStatus)}</td><td class="num"><strong>${money(o.total)}</strong></td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="panel"><div class="panel-head"><h2>Best sellers</h2><a class="btn btn-outline btn-sm" href="#products">Products</a></div>
          <div class="panel-body rank">${s.bestSellers.map((p, i) => `<div class="rank-row"><span class="rank-n">${i + 1}</span><span class="thumb ${'t' + ((i % 5) + 1)}"></span><div class="rank-info"><strong>${esc(p.name)}</strong><span class="track"><i style="width:${(p.soldCount / Math.max(1, s.bestSellers[0].soldCount)) * 100}%"></i></span></div><b>${p.soldCount}<small> sold</small></b></div>`).join('')}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><div><h2>Low-stock alerts</h2><span class="muted small">Variants at or below the alert level</span></div><a class="btn btn-outline btn-sm" href="#inventory">Manage inventory</a></div>
        <div class="panel-body">${s.lowStock.length ? `<div class="low-grid">${s.lowStock.map((v) => `<div class="low-card ${v.stock === 0 ? 'out' : ''}"><div><strong>${esc(v.product)}</strong><span>${esc(v.colour)} / ${esc(v.size)}</span></div><b>${v.stock === 0 ? 'Sold out' : `${v.stock} left`}</b></div>`).join('')}</div>` : '<div class="empty">All variants are well stocked.</div>'}</div></div>`;
    $('#quick-add').onclick = (e) => { e.preventDefault(); productForm(); };
  };

  // ----- Products -----
  views.products = async (el) => {
    const products = await api('/admin/products');
    const draw = (q = '', status = '', cat = '') => {
      const list = products.filter((p) => (!q || (p.name + p.sku).toLowerCase().includes(q.toLowerCase())) && (!status || p.status === status) && (!cat || String(p.categoryId) === cat));
      $('#tbody', el).innerHTML = list.length ? list.map((p) => `
        <tr>
          <td><div class="cell-flex"><span class="thumb t${(p.id % 5) + 1}"></span><div><strong>${esc(p.name)}</strong><div class="sub">${esc(p.sku)} ${p.featured ? '· ★ Featured' : ''}</div></div></div></td>
          <td>${esc(p.category?.name || '-')}</td>
          <td class="num">${p.salePrice ? `<s class="sub">${money(p.price)}</s><br>${money(p.salePrice)}` : money(p.price)}</td>
          <td class="num"><span class="stock-badge ${p.totalStock === 0 ? 'out' : p.totalStock < 10 ? 'low' : ''}">${p.totalStock}</span><div class="sub">${p.variants.length} variants</div></td>
          <td>${pill(p.status)}</td>
          <td class="num">${p.soldCount}</td>
          <td class="num"><a class="btn btn-outline btn-sm" href="/product/${esc(p.slug)}" target="_blank" rel="noopener">View</a> <button class="btn btn-outline btn-sm" data-edit="${p.id}">Edit</button> ${me.role === 'ADMIN' ? `<button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty">No products match.</td></tr>';
    };
    el.innerHTML = `
      <div class="toolbar">
        <input type="search" id="q" placeholder="Search name or SKU" aria-label="Search products">
        <select id="st" aria-label="Status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option></select>
        <select id="ct" aria-label="Category"><option value="">All categories</option>${meta.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <span class="spacer"></span><button class="btn" id="add">+ Add product</button>
      </div>
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th><th class="num">Sold</th><th></th></tr></thead><tbody id="tbody"></tbody></table></div></div>`;
    const redraw = () => draw($('#q').value, $('#st').value, $('#ct').value);
    ['#q', '#st', '#ct'].forEach((s) => $(s).addEventListener('input', redraw));
    $('#add').addEventListener('click', () => productForm());
    el.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) productForm(await api(`/admin/products/${ed.dataset.edit}`));
      const del = e.target.closest('[data-del]');
      if (del && confirm('Delete this product permanently? Past orders keep their item details.')) {
        try { await api(`/admin/products/${del.dataset.del}`, { method: 'DELETE' }); toast('Product deleted'); route(); } catch (err) { toast(err.message, 'error'); }
      }
    };
    redraw();
  };

  function productForm(p) {
    const variants = p?.variants?.length ? p.variants : [];
    const images = p?.images?.length ? p.images.map((i) => i.alt) : ['Front', 'Back', 'Detail'];
    const vRow = (v = {}) => `<tr>
      <td><input type="hidden" data-v="id" value="${v.id || ''}"><input data-v="size" value="${esc(v.size || '')}" placeholder="M" required aria-label="Size"></td>
      <td><input data-v="colour" value="${esc(v.colour || '')}" placeholder="Black" required aria-label="Colour"></td>
      <td><input type="color" data-v="colourHex" value="${esc(v.colourHex || '#cccccc')}" aria-label="Colour swatch"></td>
      <td><input data-v="sku" value="${esc(v.sku || '')}" placeholder="TSH-001-BLK-M" required aria-label="Variant SKU"></td>
      <td style="width:90px"><input type="number" min="0" data-v="stock" value="${v.stock ?? 0}" required aria-label="Stock"></td>
      <td><button type="button" class="btn btn-danger btn-sm" data-rm-variant aria-label="Remove variant">&times;</button></td></tr>`;
    openModal(p ? `Edit: ${p.name}` : 'Add product', `
      <form novalidate>
        <div class="grid-2">${field('name', 'Product name *', p?.name, 'required maxlength="150"')}${field('sku', 'Product SKU *', p?.sku, 'required maxlength="40"')}</div>
        <div class="grid-3">
          <div class="field"><label for="f-categoryId">Category</label><select id="f-categoryId" name="categoryId"><option value="">None</option>${meta.categories.map((c) => `<option value="${c.id}" ${p?.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          ${field('price', 'Price (Rs.) *', p?.price, 'type="number" min="1" required')}
          ${field('salePrice', 'Sale price (Rs.)', p?.salePrice, 'type="number" min="1"')}
        </div>
        <div class="field"><label for="f-description">Description *</label><textarea id="f-description" name="description" required maxlength="5000">${esc(p?.description || '')}</textarea></div>
        <div class="grid-2">${field('material', 'Material', p?.material, 'maxlength="200" placeholder="100% cotton"')}${field('slug', 'URL slug', p?.slug, 'placeholder="auto from name"')}</div>
        <div class="field"><label for="f-care">Washing / care instructions</label><textarea id="f-care" name="care" style="min-height:60px" maxlength="1000">${esc(p?.care || '')}</textarea></div>
        <div class="field"><label for="f-images">Image slots</label><input id="f-images" name="images" value="${esc(images.join(', '))}"><span class="hint">Comma-separated labels, e.g. Front, Back, Detail. Placeholders are shown until real photos are uploaded.</span></div>
        <div style="display:flex;gap:24px;margin-bottom:16px">
          <label class="check"><input type="checkbox" name="active" ${!p || p.status === 'ACTIVE' ? 'checked' : ''}> Active (visible in store)</label>
          <label class="check"><input type="checkbox" name="featured" ${p?.featured ? 'checked' : ''}> Featured</label>
        </div>
        <div class="panel" style="margin:0">
          <div class="panel-head"><h2>Variants (size × colour × stock)</h2>
            <div style="display:flex;gap:6px;flex-wrap:wrap"><input id="gen-sizes" placeholder="Sizes: S,M,L,XL" style="width:150px"><input id="gen-colours" placeholder="Colours: Black,White" style="width:170px"><button type="button" class="btn btn-outline btn-sm" id="gen">Generate</button><button type="button" class="btn btn-outline btn-sm" id="add-variant">+ Row</button></div></div>
          <div class="table-wrap"><table class="variant-table"><thead><tr><th>Size</th><th>Colour</th><th></th><th>SKU</th><th>Stock</th><th></th></tr></thead><tbody id="variants">${variants.map(vRow).join('')}</tbody></table></div>
        </div>
        <div class="form-msg" style="margin-top:12px"></div>
        <div class="form-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn" type="submit">${p ? 'Save changes' : 'Create product'}</button></div>
      </form>`, async (form) => {
      const d = formData(form);
      const vars = $$('#variants tr', form).map((tr) => Object.fromEntries($$('[data-v]', tr).map((i) => [i.dataset.v, i.value])));
      const body = { ...d, status: d.active ? 'ACTIVE' : 'DRAFT', images: d.images.split(',').map((s) => ({ alt: s.trim() })).filter((i) => i.alt), variants: vars };
      if (p) await api(`/admin/products/${p.id}`, { method: 'PUT', body }); else await api('/admin/products', { method: 'POST', body });
      toast(p ? 'Product updated' : 'Product created');
      route();
    });
    const tbody = $('#variants');
    if (!variants.length) tbody.innerHTML = vRow();
    $('#add-variant').onclick = () => tbody.insertAdjacentHTML('beforeend', vRow());
    tbody.onclick = (e) => { if (e.target.closest('[data-rm-variant]')) e.target.closest('tr').remove(); };
    $('#gen').onclick = () => {
      const sizes = $('#gen-sizes').value.split(',').map((s) => s.trim()).filter(Boolean);
      const colours = $('#gen-colours').value.split(',').map((s) => s.trim()).filter(Boolean);
      const base = ($('#f-sku').value || 'SKU').toUpperCase();
      const existing = new Set($$('tr', tbody).map((tr) => `${$('[data-v=size]', tr).value}|${$('[data-v=colour]', tr).value}`.toLowerCase()));
      $$('tr', tbody).forEach((tr) => { if (!$('[data-v=size]', tr).value && !$('[data-v=colour]', tr).value) tr.remove(); });
      for (const c of colours) for (const s of sizes) {
        if (existing.has(`${s}|${c}`.toLowerCase())) continue;
        tbody.insertAdjacentHTML('beforeend', vRow({ size: s, colour: c, sku: `${base}-${c.slice(0, 3).toUpperCase()}-${s.replace(/[^a-z0-9]/gi, '').toUpperCase()}`, stock: 0 }));
      }
    };
  }

  // ----- Categories -----
  views.categories = async (el) => {
    const cats = await api('/admin/categories');
    meta.categories = cats;
    el.innerHTML = `<div class="toolbar"><span class="spacer"></span><button class="btn" id="add">+ Add category</button></div>
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Slug</th><th>Description</th><th class="num">Products</th><th class="num">Order</th><th></th></tr></thead><tbody>
      ${cats.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td>/shop?category=${esc(c.slug)}</td><td class="sub">${esc(c.description || '')}</td><td class="num">${c._count.products}</td><td class="num">${c.sortOrder}</td>
        <td class="num"><button class="btn btn-outline btn-sm" data-edit="${c.id}">Edit</button> ${me.role === 'ADMIN' ? `<button class="btn btn-danger btn-sm" data-del="${c.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    const form = (c) => openModal(c ? 'Edit category' : 'Add category', `<form novalidate>
      ${field('name', 'Name *', c?.name, 'required')}${field('slug', 'Slug', c?.slug, 'placeholder="auto from name"')}
      <div class="field"><label for="f-description">Description</label><textarea id="f-description" name="description">${esc(c?.description || '')}</textarea></div>
      ${field('sortOrder', 'Display order', c?.sortOrder ?? 0, 'type="number" min="0"')}
      <div class="form-msg"></div><div class="form-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`,
    async (f) => { await api(c ? `/admin/categories/${c.id}` : '/admin/categories', { method: c ? 'PUT' : 'POST', body: formData(f) }); toast('Category saved'); route(); });
    $('#add').onclick = () => form();
    el.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) form(cats.find((c) => c.id === Number(ed.dataset.edit)));
      const del = e.target.closest('[data-del]');
      if (del && confirm('Delete this category? Its products will become uncategorised.')) { try { await api(`/admin/categories/${del.dataset.del}`, { method: 'DELETE' }); toast('Category deleted'); route(); } catch (err) { toast(err.message, 'error'); } }
    };
  };

  // ----- Inventory -----
  views.inventory = async (el) => {
    const data = await api('/admin/inventory');
    const low = data.lowStockThreshold;
    const draw = () => {
      const q = $('#q').value.toLowerCase(); const f = $('#flt').value;
      const list = data.variants.filter((v) => (!q || (v.product.name + v.sku + v.colour + v.size).toLowerCase().includes(q)) && (f === 'low' ? v.stock <= low && v.stock > 0 : f === 'out' ? v.stock === 0 : true));
      $('#tbody').innerHTML = list.map((v) => `<tr>
        <td><strong>${esc(v.product.name)}</strong> ${v.product.status === 'DRAFT' ? pill('DRAFT') : ''}</td><td>${esc(v.colour)}</td><td>${esc(v.size)}</td><td class="sub">${esc(v.sku)}</td>
        <td class="num"><span class="stock-badge ${v.stock === 0 ? 'out' : v.stock <= low ? 'low' : ''}">${v.stock}</span></td>
        <td class="num"><button class="btn btn-outline btn-sm" data-adjust="${v.id}">Adjust</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No variants match.</td></tr>';
    };
    el.innerHTML = `
      <div class="toolbar"><input type="search" id="q" placeholder="Search product, SKU, colour, size" aria-label="Search inventory">
        <select id="flt" aria-label="Filter"><option value="">All stock</option><option value="low">Low stock (≤ ${low})</option><option value="out">Sold out</option></select></div>
      <div class="cols">
        <div class="panel"><div class="panel-head"><h2>Stock by size & colour</h2><span class="muted">${data.variants.length} variants</span></div>
          <div class="table-wrap"><table><thead><tr><th>Product</th><th>Colour</th><th>Size</th><th>SKU</th><th class="num">Stock</th><th></th></tr></thead><tbody id="tbody"></tbody></table></div></div>
        <div class="panel"><div class="panel-head"><h2>Recent stock movements</h2></div>
          <div class="table-wrap"><table><tbody>${data.movements.map((m) => `<tr><td>${esc(m.variant.product.name)}<div class="sub">${esc(m.variant.colour)} / ${esc(m.variant.size)} · ${esc(label(m.reason))}${m.note ? ' · ' + esc(m.note) : ''}</div><div class="sub">${dateTime(m.createdAt)}</div></td><td class="num" style="color:${m.change < 0 ? 'var(--bad)' : 'var(--ok)'};font-weight:700">${m.change > 0 ? '+' : ''}${m.change}</td></tr>`).join('')}</tbody></table></div></div>
      </div>`;
    $('#q').oninput = draw; $('#flt').onchange = draw;
    el.onclick = (e) => {
      const b = e.target.closest('[data-adjust]'); if (!b) return;
      const v = data.variants.find((x) => x.id === Number(b.dataset.adjust));
      openModal(`Adjust stock: ${v.product.name} (${v.colour} / ${v.size})`, `<form novalidate>
        <p>Current stock: <strong>${v.stock}</strong></p>
        <div class="grid-2">${field('change', 'Change (+ add, − remove) *', '', 'type="number" required placeholder="e.g. 10 or -2"')}
        <div class="field"><label for="f-reason">Reason</label><select id="f-reason" name="reason"><option value="RESTOCK">Restock</option><option value="ADJUSTMENT">Adjustment / count</option><option value="RETURN">Customer return</option></select></div></div>
        ${field('note', 'Note', '', 'maxlength="200" placeholder="Optional"')}
        <div class="form-msg"></div><div class="form-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`,
      async (f) => { await api(`/admin/inventory/${v.id}/adjust`, { method: 'POST', body: formData(f) }); toast('Stock updated'); route(); refreshCounts(); });
    };
    draw();
  };

  // ----- Orders -----
  const ORDER_STATUSES = ['PENDING_PAYMENT', 'RECEIVED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
  views.orders = async (el, id) => {
    if (id) return orderDetail(el, id);
    const params = new URLSearchParams(sessionStorage.getItem('orderFilters') || '');
    const load = async () => {
      const p = new URLSearchParams({ q: $('#q').value, status: $('#st').value, paymentStatus: $('#ps').value });
      sessionStorage.setItem('orderFilters', p);
      const orders = await api('/admin/orders?' + p);
      $('#tbody').innerHTML = orders.length ? orders.map((o) => `<tr class="row-link" data-href="#orders/${o.id}">
        <td><strong>${esc(o.orderNumber)}</strong><div class="sub">${dateTime(o.createdAt)}</div></td>
        <td>${esc(o.name)}<div class="sub">${esc(o.phone)} · ${esc(o.district)}</div></td>
        <td>${o._count.items}</td><td>${esc(label(o.paymentMethod))}</td><td>${pill(o.paymentStatus)}</td><td>${pill(o.status)}</td><td class="num"><strong>${money(o.total)}</strong></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No orders found.</td></tr>';
    };
    el.innerHTML = `<div class="toolbar">
        <input type="search" id="q" placeholder="Order #, name, email or phone" value="${esc(params.get('q') || '')}" aria-label="Search orders">
        <select id="st" aria-label="Order status"><option value="">All statuses</option>${ORDER_STATUSES.map((s) => `<option value="${s}" ${params.get('status') === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
        <select id="ps" aria-label="Payment status"><option value="">All payments</option>${['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => `<option value="${s}" ${params.get('paymentStatus') === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
      </div>
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Method</th><th>Payment</th><th>Status</th><th class="num">Total</th></tr></thead><tbody id="tbody"></tbody></table></div></div>`;
    let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
    $('#st').onchange = load; $('#ps').onchange = load;
    load();
  };

  async function orderDetail(el, id) {
    const o = await api(`/admin/orders/${id}`);
    $('#view-title').textContent = `Order ${o.orderNumber}`;
    const billing = o.billingAddress ? JSON.parse(o.billingAddress) : null;
    const closed = ['CANCELLED', 'RETURNED'].includes(o.status);
    el.innerHTML = `
      <div class="toolbar"><a class="btn btn-outline btn-sm" href="#orders">&larr; All orders</a><span class="spacer"></span>${pill(o.status)} ${pill(o.paymentStatus)}<button class="btn btn-outline btn-sm" onclick="window.print()">Print</button></div>
      <div class="cols">
        <div>
          <div class="panel"><div class="panel-head"><h2>Items</h2><span class="muted">Placed ${dateTime(o.createdAt)}</span></div>
            <div class="table-wrap"><table><thead><tr><th>Product</th><th>Variant</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Total</th></tr></thead><tbody>
            ${o.items.map((i) => `<tr><td><div class="cell-flex"><span class="thumb t${(i.productId % 5) + 1}"></span><div><strong>${esc(i.productName)}</strong><div class="sub">${esc(i.sku)}</div></div></div></td><td>${esc(i.colour)} / ${esc(i.size)}</td><td class="num">${money(i.unitPrice)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.unitPrice * i.quantity)}</td></tr>`).join('')}
            <tr><td colspan="4" class="num">Subtotal</td><td class="num">${money(o.subtotal)}</td></tr>
            ${o.discount ? `<tr><td colspan="4" class="num">Discount ${o.couponCode ? `(${esc(o.couponCode)})` : ''}</td><td class="num">−${money(o.discount)}</td></tr>` : ''}
            <tr><td colspan="4" class="num">Delivery (${esc(label(o.deliveryMethod))})</td><td class="num">${money(o.deliveryFee)}</td></tr>
            <tr><td colspan="4" class="num"><strong>Total</strong></td><td class="num"><strong>${money(o.total)}</strong></td></tr>
            </tbody></table></div></div>

          <div class="cols-2">
            <div class="panel"><div class="panel-head"><h2>Update order status</h2></div><div class="panel-body">
              <form id="status-form">
                <div class="field"><label for="f-status">New status</label><select id="f-status" name="status" ${closed ? 'disabled' : ''}>${ORDER_STATUSES.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></div>
                ${field('note', 'Note (optional)', '', 'maxlength="300"')}
                <p class="muted" style="font-size:.78rem;margin-top:0">Cancelling or returning puts the items back into stock. The customer is notified of each change.</p>
                <button class="btn btn-block" type="submit" ${closed ? 'disabled' : ''}>Update status</button>
              </form></div></div>
            <div class="panel"><div class="panel-head"><h2>Payment</h2></div><div class="panel-body">
              <dl class="kv" style="margin-bottom:12px"><dt>Method</dt><dd>${esc(label(o.paymentMethod))}</dd><dt>Status</dt><dd>${pill(o.paymentStatus)}</dd>${o.payments.map((p) => `<dt>Reference</dt><dd>${esc(p.reference || '-')}</dd>`).join('')}</dl>
              <form id="pay-form">
                <div class="grid-2"><div class="field"><label for="f-ps">Payment status</label><select id="f-ps" name="paymentStatus">${['PENDING', 'PAID', 'FAILED'].map((s) => `<option ${o.paymentStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
                ${field('reference', 'Reference', o.payments[0]?.reference || '', 'placeholder="Slip / txn ID"')}</div>
                <button class="btn btn-outline btn-block" type="submit">Save payment</button>
              </form></div></div>
          </div>

          <div class="panel"><div class="panel-head"><h2>Shipment</h2>${o.shipment ? pill(o.shipment.status) : ''}</div><div class="panel-body">
            <form id="ship-form"><div class="grid-3">
              ${field('courier', 'Courier', o.shipment?.courier || '', 'placeholder="Domex, Pronto, Koombiyo..."')}
              ${field('trackingNumber', 'Tracking number', o.shipment?.trackingNumber || '')}
              <div class="field"><label for="f-shst">Delivery issue</label><select id="f-shst" name="status"><option value="">None</option><option value="FAILED" ${o.shipment?.status === 'FAILED' ? 'selected' : ''}>Failed delivery</option></select></div>
            </div>${field('note', 'Shipment note', o.shipment?.note || '')}
            <button class="btn btn-outline" type="submit">Save shipment</button></form>
            <p class="muted" style="font-size:.78rem;margin-bottom:0">Shipped ${dateTime(o.shipment?.shippedAt)} · Delivered ${dateTime(o.shipment?.deliveredAt)}</p>
          </div></div>

          <div class="panel"><div class="panel-head"><h2>Refunds & returns</h2><button class="btn btn-outline btn-sm" id="add-refund">+ Record refund</button></div>
            <div class="table-wrap"><table><tbody>${o.refunds.length ? o.refunds.map((r) => `<tr><td>${money(r.amount)}<div class="sub">${esc(r.reason)} · ${date(r.createdAt)}</div></td><td>${pill(r.status)}</td>
              <td class="num"><select data-refund="${r.id}" aria-label="Refund status" style="width:auto">${['REQUESTED', 'APPROVED', 'PROCESSED', 'REJECTED'].map((s) => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('') : '<tr><td class="empty">No refunds or return requests.</td></tr>'}</tbody></table></div></div>
        </div>

        <div>
          <div class="panel"><div class="panel-head"><h2>Customer</h2>${o.user ? '<span class="pill info">Registered</span>' : '<span class="pill">Guest</span>'}</div><div class="panel-body">
            <dl class="kv"><dt>Name</dt><dd>${esc(o.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd><dt>Phone</dt><dd><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></dd></dl></div></div>
          <div class="panel"><div class="panel-head"><h2>Delivery address</h2></div><div class="panel-body">
            ${esc(o.line1)}${o.line2 ? `<br>${esc(o.line2)}` : ''}<br>${esc(o.city)}<br>${esc(o.district)} ${esc(o.postalCode || '')}
            ${o.estimatedDays ? `<p class="muted" style="margin-bottom:0">Estimate: ${esc(o.estimatedDays)} working days</p>` : ''}
            ${billing ? `<h3 style="font-size:.85rem;margin-top:14px">Billing address</h3>${esc(billing.name)}<br>${esc(billing.line1)}<br>${esc(billing.city)} ${esc(billing.postalCode || '')}` : ''}
          </div></div>
          ${o.notes ? `<div class="panel"><div class="panel-head"><h2>Customer notes</h2></div><div class="panel-body">${esc(o.notes)}</div></div>` : ''}
          <div class="panel"><div class="panel-head"><h2>Status history</h2></div><div class="panel-body">
            <ul class="timeline">${o.history.map((h) => `<li><strong>${esc(label(h.status))}</strong>${h.note ? ` - ${esc(h.note)}` : ''}<div class="muted" style="font-size:.76rem">${dateTime(h.createdAt)}${h.changedBy ? ` · ${esc(h.changedBy)}` : ''}</div></li>`).join('')}</ul>
          </div></div>
        </div>
      </div>`;

    const reload = () => { orderDetail(el, id); refreshCounts(); };
    $('#status-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (['CANCELLED', 'RETURNED'].includes(d.status) && !confirm(`Mark this order as ${label(d.status)}? Items will be returned to stock and this cannot be undone.`)) return;
      try { await api(`/admin/orders/${id}/status`, { method: 'PATCH', body: d }); toast('Order status updated'); reload(); } catch (err) { toast(err.message, 'error'); }
    };
    $('#pay-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/admin/orders/${id}/payment`, { method: 'PATCH', body: formData(e.target) }); toast('Payment updated'); reload(); } catch (err) { toast(err.message, 'error'); }
    };
    $('#ship-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/admin/orders/${id}/shipment`, { method: 'PATCH', body: formData(e.target) }); toast('Shipment saved'); reload(); } catch (err) { toast(err.message, 'error'); }
    };
    $('#add-refund').onclick = () => openModal('Record refund', `<form novalidate>
      ${field('amount', 'Amount (Rs.) *', o.total - o.deliveryFee, `type="number" min="1" max="${o.total}" required`)}
      ${field('reason', 'Reason *', '', 'required maxlength="500"')}
      <div class="form-msg"></div><div class="form-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`,
    async (f) => { await api(`/admin/orders/${id}/refunds`, { method: 'POST', body: formData(f) }); toast('Refund recorded'); reload(); });
    $$('[data-refund]', el).forEach((s) => { s.onchange = async () => { try { await api(`/admin/refunds/${s.dataset.refund}`, { method: 'PATCH', body: { status: s.value } }); toast('Refund updated'); reload(); } catch (err) { toast(err.message, 'error'); } }; });
  }

  // ----- Customers -----
  views.customers = async (el) => {
    const list = await api('/admin/customers');
    el.innerHTML = `<div class="toolbar"><input type="search" id="q" placeholder="Search name, email or phone" aria-label="Search customers"><span class="spacer"></span><span class="muted">${list.length} customers</span></div>
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Joined</th><th class="num">Orders</th><th class="num">Total spent</th><th>Status</th><th></th></tr></thead><tbody id="tbody"></tbody></table></div></div>`;
    const draw = () => {
      const q = $('#q').value.toLowerCase();
      $('#tbody').innerHTML = list.filter((c) => !q || (c.name + c.email + (c.phone || '')).toLowerCase().includes(q)).map((c) => `<tr>
        <td><strong>${esc(c.name)}</strong><div class="sub">${esc(c.email)}</div></td><td>${esc(c.phone || '-')}</td><td>${date(c.createdAt)}</td>
        <td class="num">${c.orders.length}</td><td class="num">${money(c.totalSpent)}</td><td>${c.active ? pill('ACTIVE') : '<span class="pill bad">Disabled</span>'}</td>
        <td class="num"><button class="btn btn-outline btn-sm" data-view="${c.id}">View</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No customers yet.</td></tr>';
    };
    $('#q').oninput = draw; draw();
    el.onclick = (e) => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      const c = list.find((x) => x.id === Number(b.dataset.view));
      openModal(c.name, `
        <dl class="kv" style="margin-bottom:18px"><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Phone</dt><dd>${esc(c.phone || '-')}</dd><dt>Joined</dt><dd>${date(c.createdAt)}</dd><dt>Newsletter</dt><dd>${c.newsletter ? 'Subscribed' : 'No'}</dd><dt>Total spent</dt><dd>${money(c.totalSpent)}</dd></dl>
        <h3 style="font-size:.95rem;margin-bottom:8px">Addresses</h3>
        ${c.addresses.map((a) => `<p style="margin:0 0 10px">${esc(a.label)}${a.isDefault ? ' (default)' : ''}: ${esc(a.line1)}, ${esc(a.city)}, ${esc(a.district)}</p>`).join('') || '<p class="muted">None saved.</p>'}
        <h3 style="font-size:.95rem;margin:16px 0 8px">Order history</h3>
        <div class="panel"><table><tbody>${c.orders.map((o) => `<tr class="row-link" data-href="#orders/${o.id}"><td>${esc(o.orderNumber)}</td><td>${date(o.createdAt)}</td><td>${pill(o.status)}</td><td class="num">${money(o.total)}</td></tr>`).join('') || '<tr><td class="empty">No orders.</td></tr>'}</tbody></table></div>
        ${me.role === 'ADMIN' ? `<div class="form-actions"><button class="btn ${c.active ? 'btn-danger' : ''}" id="toggle-active">${c.active ? 'Disable account' : 'Enable account'}</button></div>` : ''}`);
      const t = $('#toggle-active');
      if (t) t.onclick = async () => { await api(`/admin/customers/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); closeModal(); toast('Customer updated'); route(); };
    };
  };

  // ----- Payments -----
  views.payments = async (el) => {
    const { payments, refunds } = await api('/admin/payments');
    const s = meta.settings;
    const sum = (st) => payments.filter((p) => p.status === st).reduce((a, p) => a + p.amount, 0);
    el.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">Collected</div><div class="v">${money(sum('PAID'))}</div></div>
        <div class="stat"><div class="k">Pending</div><div class="v">${money(sum('PENDING'))}</div></div>
        <div class="stat"><div class="k">Failed</div><div class="v">${money(sum('FAILED'))}</div></div>
        <div class="stat"><div class="k">Open refunds</div><div class="v">${refunds.filter((r) => ['REQUESTED', 'APPROVED'].includes(r.status)).length}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Payment methods</h2>${me.role === 'ADMIN' ? '<a class="btn btn-outline btn-sm" href="#settings">Configure</a>' : ''}</div><div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap">
        <span class="pill ${s.codEnabled === 'true' ? 'ok' : ''}">Cash on delivery ${s.codEnabled === 'true' ? 'on' : 'off'}</span>
        <span class="pill ${s.bankTransferEnabled === 'true' ? 'ok' : ''}">Bank transfer ${s.bankTransferEnabled === 'true' ? 'on' : 'off'}</span>
        <span class="pill ${s.cardEnabled === 'true' ? 'warn' : ''}">Card ${s.cardEnabled === 'true' ? 'on - gateway not yet connected' : 'off'}</span>
      </div></div>
      <div class="cols">
        <div class="panel"><div class="panel-head"><h2>Transactions</h2></div><div class="table-wrap"><table><thead><tr><th>Order</th><th>Method</th><th>Reference</th><th>Status</th><th class="num">Amount</th></tr></thead><tbody>
          ${payments.map((p) => `<tr class="row-link" data-href="#orders/${p.order.id}"><td><strong>${esc(p.order.orderNumber)}</strong><div class="sub">${esc(p.order.name)} · ${dateTime(p.createdAt)}</div></td><td>${esc(label(p.method))}</td><td class="sub">${esc(p.reference || '-')}</td><td>${pill(p.status)}</td><td class="num">${money(p.amount)}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="panel"><div class="panel-head"><h2>Refunds</h2></div><div class="table-wrap"><table><tbody>
          ${refunds.map((r) => `<tr class="row-link" data-href="#orders/${r.order.id}"><td>${esc(r.order.orderNumber)}<div class="sub">${esc(r.reason)}</div></td><td>${pill(r.status)}</td><td class="num">${money(r.amount)}</td></tr>`).join('') || '<tr><td class="empty">No refunds.</td></tr>'}
        </tbody></table></div></div>
      </div>`;
  };

  // ----- Shipping -----
  views.shipping = async (el) => {
    const rates = await api('/admin/shipping-rates');
    const s = meta.settings;
    el.innerHTML = `
      <div class="panel"><div class="panel-head"><h2>Delivery rules</h2>${me.role === 'ADMIN' ? '<a class="btn btn-outline btn-sm" href="#settings">Edit in settings</a>' : ''}</div><div class="panel-body">
        <dl class="kv"><dt>Free delivery over</dt><dd>${Number(s.freeDeliveryThreshold) ? money(s.freeDeliveryThreshold) : 'Disabled'}</dd><dt>Fallback flat fee</dt><dd>${money(s.flatDeliveryFee)}</dd><dt>Express surcharge</dt><dd>${money(s.expressSurcharge)}</dd><dt>Store pickup</dt><dd>${s.pickupEnabled === 'true' ? 'Enabled' : 'Disabled'}</dd><dt>COD limit</dt><dd>${Number(s.codMaxAmount) ? money(s.codMaxAmount) : 'No limit'}</dd></dl>
      </div></div>
      <div class="panel"><div class="panel-head"><h2>District rates</h2><span class="muted">Edit a row and press Save</span></div><div class="table-wrap"><table><thead><tr><th>District</th><th>Fee (Rs.)</th><th>Estimated days</th><th>COD available</th><th></th></tr></thead><tbody>
        ${rates.map((r) => `<tr data-rate="${r.id}"><td><strong>${esc(r.district)}</strong></td><td><input type="number" min="0" name="fee" value="${r.fee}" style="width:110px" aria-label="Fee for ${esc(r.district)}"></td>
          <td><input name="estimatedDays" value="${esc(r.estimatedDays)}" style="width:110px" aria-label="Estimated days for ${esc(r.district)}"></td>
          <td><label class="check"><input type="checkbox" name="codAvailable" ${r.codAvailable ? 'checked' : ''}> COD</label></td>
          <td class="num"><button class="btn btn-outline btn-sm" data-save>Save</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    el.onclick = async (e) => {
      const b = e.target.closest('[data-save]'); if (!b) return;
      const tr = b.closest('tr');
      try {
        await api(`/admin/shipping-rates/${tr.dataset.rate}`, { method: 'PUT', body: { fee: $('[name=fee]', tr).value, estimatedDays: $('[name=estimatedDays]', tr).value, codAvailable: $('[name=codAvailable]', tr).checked } });
        toast('Rate saved');
      } catch (err) { toast(err.message, 'error'); }
    };
  };

  // ----- Discounts -----
  views.discounts = async (el) => {
    const coupons = await api('/admin/coupons');
    el.innerHTML = `<div class="toolbar"><p class="muted" style="margin:0">Product sale prices are set on each product. Coupons apply at the cart.</p><span class="spacer"></span><button class="btn" id="add">+ Add coupon</button></div>
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th class="num">Min. order</th><th>Usage</th><th>Valid</th><th>Status</th><th></th></tr></thead><tbody>
      ${coupons.map((c) => `<tr><td><strong>${esc(c.code)}</strong><div class="sub">${esc(c.description || '')}</div></td><td>${c.type === 'PERCENT' ? `${c.value}%` : money(c.value)}</td><td class="num">${money(c.minOrder)}</td>
        <td>${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}</td><td class="sub">${c.startsAt ? date(c.startsAt) : 'Any time'} → ${c.endsAt ? date(c.endsAt) : 'No end'}</td><td>${c.active ? pill('ACTIVE') : '<span class="pill">Inactive</span>'}</td>
        <td class="num"><button class="btn btn-outline btn-sm" data-edit="${c.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del="${c.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No coupons yet.</td></tr>'}
      </tbody></table></div></div>`;
    const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
    const form = (c) => openModal(c ? 'Edit coupon' : 'Add coupon', `<form novalidate>
      <div class="grid-2">${field('code', 'Code *', c?.code, 'required style="text-transform:uppercase"')}${field('description', 'Description', c?.description)}</div>
      <div class="grid-3"><div class="field"><label for="f-type">Type</label><select id="f-type" name="type"><option value="PERCENT" ${c?.type === 'PERCENT' ? 'selected' : ''}>Percentage (%)</option><option value="FIXED" ${c?.type === 'FIXED' ? 'selected' : ''}>Fixed amount (Rs.)</option></select></div>
        ${field('value', 'Value *', c?.value, 'type="number" min="1" required')}${field('minOrder', 'Minimum order (Rs.)', c?.minOrder ?? 0, 'type="number" min="0"')}</div>
      <div class="grid-3">${field('maxUses', 'Max uses', c?.maxUses ?? '', 'type="number" min="1" placeholder="Unlimited"')}${field('startsAt', 'Starts', d(c?.startsAt), 'type="date"')}${field('endsAt', 'Ends', d(c?.endsAt), 'type="date"')}</div>
      <label class="check"><input type="checkbox" name="active" ${!c || c.active ? 'checked' : ''}> Active</label>
      <div class="form-msg" style="margin-top:12px"></div><div class="form-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`,
    async (f) => { await api(c ? `/admin/coupons/${c.id}` : '/admin/coupons', { method: c ? 'PUT' : 'POST', body: formData(f) }); toast('Coupon saved'); route(); });
    $('#add').onclick = () => form();
    el.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) form(coupons.find((c) => c.id === Number(ed.dataset.edit)));
      const del = e.target.closest('[data-del]'); if (del && confirm('Delete this coupon?')) { await api(`/admin/coupons/${del.dataset.del}`, { method: 'DELETE' }); toast('Coupon deleted'); route(); }
    };
  };

  // ----- Reviews -----
  views.reviews = async (el) => {
    const reviews = await api('/admin/reviews');
    el.innerHTML = `<div class="panel"><div class="table-wrap"><table><thead><tr><th>Review</th><th>Product</th><th>Rating</th><th>Status</th><th></th></tr></thead><tbody>
      ${reviews.map((r) => `<tr><td style="max-width:420px">${esc(r.comment)}<div class="sub">${esc(r.name)} · ${date(r.createdAt)}</div></td><td><a href="/product/${esc(r.product.slug)}" target="_blank" rel="noopener">${esc(r.product.name)}</a></td>
        <td style="color:#b07a12">${'★'.repeat(r.rating)}<span style="color:#ddd">${'★'.repeat(5 - r.rating)}</span></td><td>${r.approved ? pill('APPROVED') : pill('PENDING')}</td>
        <td class="num"><button class="btn btn-outline btn-sm" data-toggle="${r.id}" data-approved="${r.approved}">${r.approved ? 'Hide' : 'Approve'}</button> <button class="btn btn-danger btn-sm" data-del="${r.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No reviews yet.</td></tr>'}
      </tbody></table></div></div>`;
    el.onclick = async (e) => {
      const t = e.target.closest('[data-toggle]');
      if (t) { await api(`/admin/reviews/${t.dataset.toggle}`, { method: 'PATCH', body: { approved: t.dataset.approved !== 'true' } }); toast('Review updated'); route(); refreshCounts(); }
      const d = e.target.closest('[data-del]');
      if (d && confirm('Delete this review?')) { await api(`/admin/reviews/${d.dataset.del}`, { method: 'DELETE' }); toast('Review deleted'); route(); refreshCounts(); }
    };
  };

  // ----- Reports -----
  views.reports = async (el) => {
    const days = Number(sessionStorage.getItem('reportDays')) || 30;
    const r = await api(`/admin/reports?days=${days}`);
    const hbars = (rows, fmt = (v) => v) => { const max = Math.max(1, ...rows.map((x) => x.value)); return rows.map((x) => `<div class="hbar"><span class="name" title="${esc(x.key)}">${esc(label(x.key))}</span><span class="track"><i style="width:${(x.value / max) * 100}%"></i></span><span>${fmt(x.value)}</span></div>`).join('') || '<p class="muted">No data for this period.</p>'; };
    el.innerHTML = `
      <div class="toolbar"><label class="lbl" for="days">Period</label><select id="days" style="min-width:0">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>Last ${d} days</option>`).join('')}</select><span class="spacer"></span><button class="btn btn-outline btn-sm" id="csv">Export orders CSV</button></div>
      <div class="stats">
        <div class="stat"><div class="k">Revenue</div><div class="v">${money(r.revenue)}</div><div class="s">${r.liveOrders} completed / active orders</div></div>
        <div class="stat"><div class="k">Average order</div><div class="v">${money(r.averageOrder)}</div></div>
        <div class="stat"><div class="k">Units sold</div><div class="v">${r.unitsSold}</div></div>
        <div class="stat"><div class="k">Discounts given</div><div class="v">${money(r.discounts)}</div></div>
      </div>
      <div class="cols-2">
        <div class="panel"><div class="panel-head"><h2>Top products (units)</h2></div><div class="panel-body">${hbars(r.topProducts)}</div></div>
        <div class="panel"><div class="panel-head"><h2>Sales by category</h2></div><div class="panel-body">${hbars(r.byCategory, money)}</div></div>
        <div class="panel"><div class="panel-head"><h2>Revenue by payment method</h2></div><div class="panel-body">${hbars(r.byPayment, money)}</div></div>
        <div class="panel"><div class="panel-head"><h2>Orders by status</h2></div><div class="panel-body">${hbars(r.byStatus)}</div></div>
        <div class="panel"><div class="panel-head"><h2>Top districts</h2></div><div class="panel-body">${hbars(r.byDistrict, money)}</div></div>
      </div>`;
    $('#days').onchange = (e) => { sessionStorage.setItem('reportDays', e.target.value); route(); };
    $('#csv').onclick = async () => {
      const orders = await api('/admin/orders');
      const rows = [['Order', 'Date', 'Customer', 'Email', 'Phone', 'District', 'Payment method', 'Payment status', 'Status', 'Subtotal', 'Discount', 'Delivery', 'Total']]
        .concat(orders.map((o) => [o.orderNumber, new Date(o.createdAt).toISOString(), o.name, o.email, o.phone, o.district, o.paymentMethod, o.paymentStatus, o.status, o.subtotal, o.discount, o.deliveryFee, o.total]));
      const csv = rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };
  };

  // ----- Website content -----
  views.content = async (el) => {
    const [settings, messages, subs] = await Promise.all([api('/admin/settings'), api('/admin/messages'), api('/admin/subscribers')]);
    const area = (k, l) => `<div class="field"><label for="f-${k}">${l}</label><textarea id="f-${k}" name="${k}" style="min-height:70px">${esc(settings[k] || '')}</textarea></div>`;
    el.innerHTML = `
      <div class="cols">
        <form class="panel" id="content-form"><div class="panel-head"><h2>Homepage & brand content</h2><button class="btn btn-sm" type="submit">Save content</button></div><div class="panel-body">
          ${field('announcement', 'Announcement bar', settings.announcement)}
          <div class="grid-2">${field('heroTitle', 'Hero title', settings.heroTitle)}${field('heroCta', 'Hero button text', settings.heroCta)}</div>
          ${area('heroSubtitle', 'Hero subtitle')}
          <div class="grid-2">${field('promoTitle', 'Promo banner title', settings.promoTitle)}${field('tagline', 'Footer tagline', settings.tagline)}</div>
          ${area('promoText', 'Promo banner text')}${area('aboutStory', 'About page - brand story')}${area('aboutMission', 'About page - mission')}
          <p class="muted" style="font-size:.78rem;margin:0">Banner and product images show as placeholders until photography is added. Policy pages (FAQ, delivery, returns, privacy, terms) are HTML files in /public.</p>
        </div></form>
        <div>
          <div class="panel"><div class="panel-head"><h2>Contact messages</h2><span class="muted">${messages.filter((m) => !m.handled).length} open</span></div><div class="table-wrap"><table><tbody>
            ${messages.map((m) => `<tr><td><strong>${esc(m.name)}</strong> <span class="sub">${esc(m.email)}${m.phone ? ' · ' + esc(m.phone) : ''}</span><div style="font-size:.8rem;margin-top:4px"><em>${esc(m.subject || '')}</em> ${esc(m.message)}</div><div class="sub">${dateTime(m.createdAt)}</div></td>
              <td class="num"><label class="check" style="justify-content:flex-end"><input type="checkbox" data-msg="${m.id}" ${m.handled ? 'checked' : ''}> Done</label></td></tr>`).join('') || '<tr><td class="empty">No messages.</td></tr>'}
          </tbody></table></div></div>
          <div class="panel"><div class="panel-head"><h2>Newsletter subscribers</h2><span class="muted">${subs.length}</span></div><div class="panel-body" style="max-height:240px;overflow:auto;font-size:.84rem">
            ${subs.map((s) => `<div>${esc(s.email)} <span class="sub muted">· ${date(s.createdAt)}</span></div>`).join('') || '<span class="muted">No subscribers yet.</span>'}
          </div></div>
        </div>
      </div>`;
    $('#content-form').onsubmit = async (e) => {
      e.preventDefault();
      try { meta.settings = await api('/admin/settings', { method: 'PUT', body: formData(e.target) }); toast('Content saved - visible on the store now'); } catch (err) { toast(err.message, 'error'); }
    };
    $$('[data-msg]', el).forEach((c) => { c.onchange = () => api(`/admin/messages/${c.dataset.msg}`, { method: 'PATCH', body: { handled: c.checked } }).then(() => toast('Message updated')); });
  };

  // ----- Settings (admin only) -----
  views.settings = async (el) => {
    if (me.role !== 'ADMIN') { el.innerHTML = '<div class="msg-error">Administrator access only.</div>'; return; }
    const s = await api('/admin/settings');
    const f = (k, l, attrs = '') => field(k, l, s[k], attrs);
    const toggle = (k, l) => `<label class="check" style="margin-bottom:12px"><input type="checkbox" data-bool name="${k}" ${s[k] === 'true' ? 'checked' : ''}> ${l}</label>`;
    el.innerHTML = `<form id="settings-form">
      <div class="cols-2">
        <div class="panel"><div class="panel-head"><h2>Store details</h2></div><div class="panel-body">
          ${f('storeName', 'Store name')}${f('email', 'Contact email', 'type="email"')}<div class="grid-2">${f('phone', 'Phone')}${f('whatsapp', 'WhatsApp number', 'placeholder="94771234567"')}</div>
          ${f('address', 'Store address')}${f('openingHours', 'Opening hours')}
          <div class="grid-3">${f('instagram', 'Instagram URL')}${f('facebook', 'Facebook URL')}${f('tiktok', 'TikTok URL')}</div>
        </div></div>
        <div class="panel"><div class="panel-head"><h2>Payments</h2></div><div class="panel-body">
          ${toggle('codEnabled', 'Cash on delivery')}${toggle('bankTransferEnabled', 'Bank transfer')}${toggle('cardEnabled', 'Online card payment (requires gateway integration)')}
          ${f('codMaxAmount', 'COD maximum order (Rs., 0 = no limit)', 'type="number" min="0"')}
          <div class="grid-2">${f('bankName', 'Bank name')}${f('bankBranch', 'Branch')}</div><div class="grid-2">${f('bankAccountName', 'Account name')}${f('bankAccountNumber', 'Account number')}</div>
        </div></div>
        <div class="panel"><div class="panel-head"><h2>Delivery</h2></div><div class="panel-body">
          <div class="grid-2">${f('flatDeliveryFee', 'Fallback flat fee (Rs.)', 'type="number" min="0"')}${f('freeDeliveryThreshold', 'Free delivery over (Rs., 0 = off)', 'type="number" min="0"')}</div>
          ${f('expressSurcharge', 'Express surcharge (Rs.)', 'type="number" min="0"')}${toggle('pickupEnabled', 'Allow store pickup')}
          <p class="muted" style="font-size:.78rem;margin:0">District fees are managed under <a href="#shipping">Shipping</a>.</p>
        </div></div>
        <div class="panel"><div class="panel-head"><h2>Inventory & tax</h2></div><div class="panel-body">
          <div class="grid-2">${f('lowStockThreshold', 'Low-stock alert at (units)', 'type="number" min="0"')}${f('taxRate', 'Tax rate (%)', 'type="number" min="0" step="0.01"')}</div>
          ${f('currency', 'Currency', 'readonly')}
        </div></div>
      </div>
      <div class="form-actions" style="border:0"><button class="btn" type="submit">Save settings</button></div></form>`;
    $('#settings-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      $$('[data-bool]', e.target).forEach((c) => { d[c.name] = c.checked ? 'true' : 'false'; });
      try { meta.settings = await api('/admin/settings', { method: 'PUT', body: d }); $('#store-name').textContent = meta.settings.storeName; toast('Settings saved'); } catch (err) { toast(err.message, 'error'); }
    };
  };

  // ----- Staff & roles (admin only) -----
  views.staff = async (el) => {
    if (me.role !== 'ADMIN') { el.innerHTML = '<div class="msg-error">Administrator access only.</div>'; return; }
    const staff = await api('/admin/staff');
    el.innerHTML = `<div class="toolbar"><p class="muted" style="margin:0"><strong>Admin:</strong> full access. <strong>Staff:</strong> products, inventory, orders, customers and content - cannot delete products or change store settings and staff.</p><span class="spacer"></span><button class="btn" id="add">+ Add staff member</button></div>
      <div class="panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Since</th><th></th></tr></thead><tbody>
      ${staff.map((u) => `<tr><td><strong>${esc(u.name)}</strong>${u.id === me.id ? ' <span class="sub">(you)</span>' : ''}</td><td>${esc(u.email)}</td>
        <td>${u.id === me.id ? pill(u.role) : `<select data-role="${u.id}" style="width:auto" aria-label="Role for ${esc(u.name)}"><option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>Admin</option><option value="STAFF" ${u.role === 'STAFF' ? 'selected' : ''}>Staff</option><option value="CUSTOMER">Remove staff access</option></select>`}</td>
        <td>${u.active ? pill('ACTIVE') : '<span class="pill bad">Disabled</span>'}</td><td>${date(u.createdAt)}</td>
        <td class="num">${u.id === me.id ? '' : `<button class="btn btn-outline btn-sm" data-active="${u.id}" data-on="${u.active}">${u.active ? 'Disable' : 'Enable'}</button>`}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    $('#add').onclick = () => openModal('Add staff member', `<form novalidate>
      <p class="muted" style="margin-top:0">If the email already has a customer account, it will be upgraded to the selected role.</p>
      <div class="grid-2">${field('name', 'Name', '', 'maxlength="100"')}${field('email', 'Email *', '', 'type="email" required')}</div>
      <div class="grid-2">${field('password', 'Temporary password', '', 'type="password" minlength="8" autocomplete="new-password"')}<div class="field"><label for="f-role">Role</label><select id="f-role" name="role"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></div></div>
      <div class="form-msg"></div><div class="form-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn" type="submit">Add</button></div></form>`,
    async (f) => { await api('/admin/staff', { method: 'POST', body: formData(f) }); toast('Staff member saved'); route(); });
    $$('[data-role]', el).forEach((s) => { s.onchange = async () => { if (s.value === 'CUSTOMER' && !confirm('Remove staff access for this person?')) { route(); return; } await api(`/admin/staff/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Role updated'); route(); }; });
    el.onclick = async (e) => {
      const b = e.target.closest('[data-active]'); if (!b) return;
      await api(`/admin/staff/${b.dataset.active}`, { method: 'PATCH', body: { active: b.dataset.on !== 'true' } }); toast('Account updated'); route();
    };
  };

  // Clickable table rows
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,select,input')) { closeModal(); location.hash = row.dataset.href; }
  });

  boot();
})();
