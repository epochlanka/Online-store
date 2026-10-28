(async function () {
  const { api, esc, money, $, $$, fmtDate, pill, formData, setLoading, toast, Wishlist, setUser, ready } = Store;
  await ready;
  const root = $('#account-root');
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  const msg = (el, text, ok) => { el.innerHTML = `<div class="${ok ? 'form-success' : 'form-error'}">${esc(text)}</div>`; };

  // ---------- Password reset (from emailed link) ----------
  if (location.pathname === '/reset-password') {
    $('#account-title').textContent = 'Reset password';
    root.innerHTML = `<div class="auth-wrap"><form id="reset-form" class="card" novalidate>
      <div class="field"><label for="r-pw">New password</label><input id="r-pw" name="password" type="password" minlength="8" autocomplete="new-password" required><span class="hint">At least 8 characters.</span></div>
      <div class="r-msg" aria-live="polite"></div><button class="btn btn-block" type="submit">Update password</button></form></div>`;
    $('#reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await api('/api/auth/reset', { method: 'POST', body: { token: params.get('token'), password: e.target.elements.password.value } }); msg($('.r-msg'), r.message, true); setTimeout(() => { location.href = '/account'; }, 1500); }
      catch (err) { msg($('.r-msg'), err.message); }
    });
    return;
  }

  const user = await Store.getUser();
  if (!user) return renderAuth();
  if (safeNext) { location.href = safeNext; return; }
  renderAccount(user);

  // ---------- Login / register / forgot ----------
  function renderAuth() {
    $('#account-title').textContent = 'Welcome';
    root.innerHTML = `
      <div class="auth-wrap">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" class="active" data-tab="login">Log in</button>
          <button type="button" role="tab" data-tab="register">Create account</button>
          <button type="button" role="tab" data-tab="forgot">Forgot password</button>
        </div>
        <form class="card" data-panel="login" novalidate>
          <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="l-pw">Password</label><input id="l-pw" name="password" type="password" autocomplete="current-password" required></div>
          <div class="f-msg" aria-live="polite"></div>
          <button class="btn btn-block" type="submit">Log in</button>
        </form>
        <form class="card hidden" data-panel="register" novalidate>
          <div class="field"><label for="g-name">Full name</label><input id="g-name" name="name" autocomplete="name" required maxlength="100"></div>
          <div class="field"><label for="g-email">Email</label><input id="g-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="g-phone">Mobile number</label><input id="g-phone" name="phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label for="g-pw">Password</label><input id="g-pw" name="password" type="password" minlength="8" autocomplete="new-password" required><span class="hint">At least 8 characters.</span></div>
          <label class="check"><input type="checkbox" name="newsletter"> Send me news about new arrivals and offers</label>
          <div class="f-msg" aria-live="polite"></div>
          <button class="btn btn-block" type="submit">Create account</button>
        </form>
        <form class="card hidden" data-panel="forgot" novalidate>
          <p class="muted">Enter your email and we'll send you a link to reset your password.</p>
          <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
          <div class="f-msg" aria-live="polite"></div>
          <button class="btn btn-block" type="submit">Send reset link</button>
        </form>
        <p class="center muted" style="font-size:.85rem">Just want to check an order? <a href="/track-order" style="text-decoration:underline">Track it here</a>.</p>
      </div>`;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      $$('[data-tab]').forEach((b) => b.classList.toggle('active', b === t));
      $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t.dataset.tab));
    });
    root.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const kind = f.dataset.panel; const out = $('.f-msg', f); const btn = $('button[type=submit]', f);
      setLoading(btn, true);
      try {
        if (kind === 'forgot') { const r = await api('/api/auth/forgot', { method: 'POST', body: formData(f) }); msg(out, r.message, true); }
        else {
          const r = await api(`/api/auth/${kind}`, { method: 'POST', body: formData(f) });
          setUser(r.user);
          await Wishlist.sync();
          if (r.user.role !== 'CUSTOMER' && !safeNext) { location.href = '/admin'; return; }
          location.href = safeNext || '/account';
          return;
        }
      } catch (err) { msg(out, err.message); }
      setLoading(btn, false);
    });
  }

  // ---------- Logged-in account ----------
  function renderAccount(u) {
    $('#account-title').textContent = `Hello, ${u.name.split(' ')[0]}`;
    root.innerHTML = `
      <div class="account-layout">
        <nav class="account-nav" aria-label="Account sections">
          <button type="button" class="active" data-view="orders">Orders</button>
          <button type="button" data-view="profile">Profile</button>
          <button type="button" data-view="addresses">Addresses</button>
          <button type="button" data-view="password">Password</button>
          <a href="/wishlist">Wishlist</a>
          ${u.role !== 'CUSTOMER' ? '<a href="/admin">Admin dashboard</a>' : ''}
          <button type="button" data-logout>Log out</button>
        </nav>
        <section id="view"></section>
      </div>`;
    root.addEventListener('click', async (e) => {
      const v = e.target.closest('[data-view]');
      if (v) { $$('[data-view]').forEach((b) => b.classList.toggle('active', b === v)); show(v.dataset.view); }
      if (e.target.closest('[data-logout]')) { await api('/api/auth/logout', { method: 'POST' }); localStorage.removeItem('wishlist'); location.href = '/'; }
    });
    show('orders');

    async function show(view) {
      const el = $('#view');
      if (view === 'orders') {
        el.innerHTML = '<div class="skeleton" style="height:120px"></div>';
        const orders = await api('/api/account/orders');
        el.innerHTML = `<h2 style="font-size:1.5rem">Order history</h2>` + (orders.length ? orders.map((o) => `
          <details class="order-card">
            <summary><span><strong>${esc(o.orderNumber)}</strong><br><span class="muted" style="font-size:.82rem">${fmtDate(o.createdAt)} &middot; ${((n) => `${n} ${n === 1 ? 'item' : 'items'}`)(o.items.reduce((a, i) => a + i.quantity, 0))}</span></span>
              <span class="o-total">${money(o.total)}</span>${pill(o.status)}</summary>
            <div class="body">
              ${o.items.map((i) => `<div class="summary-row"><span>${i.slug ? `<a href="/product/${esc(i.slug)}">${esc(i.productName)}</a>` : esc(i.productName)} <span class="muted">${esc(i.colour)} / ${esc(i.size)} &times; ${i.quantity}</span></span><span>${money(i.unitPrice * i.quantity)}</span></div>`).join('')}
              <div class="summary-row" style="margin-top:10px"><span>Payment</span><span>${pill(o.paymentStatus)}</span></div>
              ${o.shipment?.trackingNumber ? `<div class="summary-row"><span>Tracking</span><span>${esc(o.shipment.courier || '')} ${esc(o.shipment.trackingNumber)}</span></div>` : ''}
              <ul class="history-list" style="margin-top:10px">${o.history.map((h) => `<li><span>${esc(Store.label(h.status))}${h.note ? ` <span class="muted">- ${esc(h.note)}</span>` : ''}</span><span class="muted">${fmtDate(h.createdAt)}</span></li>`).join('')}</ul>
              ${o.refunds.length ? `<p style="margin-top:10px">Return / refund: ${o.refunds.map((r) => `${pill(r.status)} ${money(r.amount)}`).join(' ')}</p>` : ''}
              ${o.status === 'DELIVERED' && !o.refunds.some((r) => r.status === 'REQUESTED') ? `<form class="return-form" data-order="${esc(o.orderNumber)}" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><input class="input" name="reason" placeholder="Reason for return / exchange" required maxlength="500" style="flex:1;min-width:200px"><button class="btn btn-outline btn-sm" type="submit">Request return</button></form>` : ''}
            </div>
          </details>`).join('') : '<div class="empty-state"><h3>No orders yet</h3><p class="muted">When you place an order, it will appear here.</p><a class="btn" href="/shop">Start shopping</a></div>');
        $$('.return-form', el).forEach((f) => f.addEventListener('submit', async (e) => {
          e.preventDefault();
          try { const r = await api(`/api/account/orders/${encodeURIComponent(f.dataset.order)}/return`, { method: 'POST', body: { reason: f.elements.reason.value } }); toast(r.message); show('orders'); }
          catch (err) { toast(err.message, { type: 'error' }); }
        }));
      }

      if (view === 'profile') {
        el.innerHTML = `<form class="card" id="profile-form" style="max-width:560px" novalidate><h2 style="font-size:1.5rem">Profile</h2>
          <div class="field"><label for="p-name">Full name</label><input id="p-name" name="name" value="${esc(u.name)}" required maxlength="100"></div>
          <div class="field"><label for="p-email">Email</label><input id="p-email" value="${esc(u.email)}" disabled><span class="hint">Contact us to change your email address.</span></div>
          <div class="field"><label for="p-phone">Mobile number</label><input id="p-phone" name="phone" type="tel" value="${esc(u.phone || '')}"></div>
          <label class="check"><input type="checkbox" name="newsletter" ${u.newsletter ? 'checked' : ''}> Receive news about new arrivals and offers</label>
          <div class="f-msg" aria-live="polite"></div><button class="btn" type="submit">Save changes</button></form>`;
        $('#profile-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          try { const r = await api('/api/account/profile', { method: 'PUT', body: formData(e.target) }); Object.assign(u, r.user); msg($('.f-msg', e.target), 'Profile updated.', true); }
          catch (err) { msg($('.f-msg', e.target), err.message); }
        });
      }

      if (view === 'password') {
        el.innerHTML = `<form class="card" id="pw-form" style="max-width:560px" novalidate><h2 style="font-size:1.5rem">Change password</h2>
          <div class="field"><label for="c-cur">Current password</label><input id="c-cur" name="currentPassword" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="c-new">New password</label><input id="c-new" name="newPassword" type="password" minlength="8" autocomplete="new-password" required><span class="hint">At least 8 characters. Other devices will be signed out.</span></div>
          <div class="f-msg" aria-live="polite"></div><button class="btn" type="submit">Update password</button></form>`;
        $('#pw-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          try { const r = await api('/api/account/password', { method: 'PUT', body: formData(e.target) }); msg($('.f-msg', e.target), r.message, true); e.target.reset(); }
          catch (err) { msg($('.f-msg', e.target), err.message); }
        });
      }

      if (view === 'addresses') {
        const list = await api('/api/account/addresses');
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2 style="font-size:1.5rem;margin:0">Saved addresses</h2><button class="btn btn-sm" type="button" data-add-address>Add address</button></div>
          ${list.length ? `<div class="address-grid">${list.map((a) => `<div class="address-card">${a.isDefault ? '<span class="status-pill ok" style="position:absolute;top:14px;right:14px">Default</span>' : ''}<strong>${esc(a.label)}</strong><p style="margin:6px 0 0">${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ''}<br>${esc(a.city)}, ${esc(a.district)} ${esc(a.postalCode || '')}<br>${esc(a.phone)}</p><div class="actions"><button class="btn-link" type="button" data-edit-address="${a.id}">Edit</button><button class="btn-link" type="button" data-delete-address="${a.id}">Delete</button></div></div>`).join('')}</div>` : '<div class="empty-state"><p class="muted" style="margin:0">No saved addresses yet.</p></div>'}`;
        const modal = $('#address-modal'); const form = $('#address-form');
        if (!$('#a-district').options.length) {
          const rates = await api('/api/shipping-rates');
          $('#a-district').innerHTML = '<option value="">Select district</option>' + rates.map((r) => `<option>${esc(r.district)}</option>`).join('');
        }
        const open = (a) => {
          form.reset(); $('.a-msg', form).innerHTML = '';
          if (a) for (const k of ['id', 'label', 'fullName', 'phone', 'line1', 'line2', 'city', 'district', 'postalCode']) form.elements[k].value = a[k] || '';
          else { form.elements.id.value = ''; form.elements.fullName.value = u.name; form.elements.phone.value = u.phone || ''; }
          form.elements.isDefault.checked = !!a?.isDefault;
          modal.classList.add('open');
        };
        el.onclick = async (e) => {
          if (e.target.closest('[data-add-address]')) open();
          const ed = e.target.closest('[data-edit-address]');
          if (ed) open(list.find((a) => a.id === Number(ed.dataset.editAddress)));
          const del = e.target.closest('[data-delete-address]');
          if (del && confirm('Delete this address?')) { await api(`/api/account/addresses/${del.dataset.deleteAddress}`, { method: 'DELETE' }); show('addresses'); }
        };
        modal.onclick = (e) => { if (e.target === modal || e.target.closest('[data-close-modal]')) modal.classList.remove('open'); };
        form.onsubmit = async (e) => {
          e.preventDefault();
          const d = formData(form);
          try {
            await api(d.id ? `/api/account/addresses/${d.id}` : '/api/account/addresses', { method: d.id ? 'PUT' : 'POST', body: d });
            modal.classList.remove('open'); toast('Address saved'); show('addresses');
          } catch (err) { msg($('.a-msg', form), err.message); }
        };
      }
    }
  }
})();
