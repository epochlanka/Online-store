(async function () {
  const { api, esc, money, $, $$, placeholder, icon, Cart, toast, formData, setLoading, ready } = Store;
  const s = await ready;
  const form = $('#checkout-form');
  $('#lock').innerHTML = icon.lock;

  if (!Cart.items().length) { location.href = '/cart'; return; }

  // One key per checkout visit: a double click or retry returns the same order
  const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  let coupon = sessionStorage.getItem('coupon') || '';
  let quote = null;

  const rates = await api('/api/shipping-rates');
  $('#district').innerHTML += rates.map((r) => `<option value="${esc(r.district)}">${esc(r.district)}</option>`).join('');
  const savedDistrict = sessionStorage.getItem('district');
  if (savedDistrict) $('#district').value = savedDistrict;
  $('#promo').value = coupon;

  // Delivery methods
  const methods = [
    ['STANDARD', 'Standard delivery', 'Islandwide courier delivery'],
    ['EXPRESS', 'Express delivery', `Priority dispatch (+${money(s.expressSurcharge || 0)})`],
  ];
  if (s.pickupEnabled === 'true') methods.push(['PICKUP', 'Store pickup', s.address || 'Collect from our store']);
  $('#delivery-methods').innerHTML = methods.map(([v, t, d], i) => `
    <label class="choice"><input type="radio" name="deliveryMethod" value="${v}" ${i === 0 ? 'checked' : ''}>
      <span class="c-body"><span class="c-title">${t}<span data-fee="${v}"></span></span><span class="c-desc">${esc(d)}</span></span></label>`).join('');

  // Payment methods
  const pays = [];
  if (s.codEnabled === 'true') pays.push(['COD', 'Cash on delivery', 'Pay in cash when your order arrives.']);
  if (s.bankTransferEnabled === 'true') pays.push(['BANK_TRANSFER', 'Bank transfer', 'Bank details are shown after you place your order. We dispatch once payment is confirmed.']);
  if (s.cardEnabled === 'true') pays.push(['CARD', 'Credit / debit card', 'Visa & Mastercard via secure payment gateway.']);
  $('#payment-methods').innerHTML = pays.map(([v, t, d], i) => `
    <label class="choice" data-pay="${v}"><input type="radio" name="paymentMethod" value="${v}" ${i === 0 ? 'checked' : ''}>
      <span class="c-body"><span class="c-title">${t}</span><span class="c-desc">${esc(d)}</span></span></label>`).join('');

  // Prefill for logged-in customers
  const user = await Store.getUser();
  if (user) {
    form.elements.name.value = user.name || '';
    form.elements.email.value = user.email;
    form.elements.phone.value = user.phone || '';
    $('#login-hint').textContent = `Signed in as ${user.email}`;
    const addresses = await api('/api/account/addresses').catch(() => []);
    if (addresses.length) {
      $('#saved-wrap').classList.remove('hidden');
      $('#saved').innerHTML = '<option value="">Enter a new address</option>' + addresses.map((a) => `<option value="${a.id}">${esc(a.label)} - ${esc(a.line1)}, ${esc(a.city)}</option>`).join('');
      const fill = (a) => {
        ['line1', 'line2', 'city', 'district', 'postalCode'].forEach((k) => { form.elements[k].value = a ? a[k] || '' : ''; });
        if (a?.phone && !form.elements.phone.value) form.elements.phone.value = a.phone;
        refresh();
      };
      $('#saved').addEventListener('change', (e) => fill(addresses.find((a) => a.id === Number(e.target.value))));
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      $('#saved').value = def.id; fill(def);
    }
  } else {
    $('#login-hint').innerHTML = 'Have an account? <a href="/account?next=/checkout" style="text-decoration:underline">Log in</a> for faster checkout, or continue as a guest.';
  }

  async function refresh() {
    const deliveryMethod = form.elements.deliveryMethod.value;
    try {
      quote = await api('/api/cart/quote', { method: 'POST', body: { items: Cart.payload(), couponCode: coupon, district: form.elements.district.value, deliveryMethod } });
    } catch (err) { $('#form-error').innerHTML = `<div class="form-error">${esc(err.message)}</div>`; return; }
    if (coupon && quote.couponError) { toast(quote.couponError, { type: 'error' }); coupon = ''; sessionStorage.removeItem('coupon'); return refresh(); }

    $('#summary-items').innerHTML = quote.lines.map((l) => `
      <div class="summary-item">
        <div class="thumb">${placeholder(l.image, 'ph-square')}<span class="qty-badge">${l.quantity}</span></div>
        <div><strong style="font-weight:600">${esc(l.productName)}</strong><div class="muted">${esc(l.colour)} / ${esc(l.size)}</div></div>
        <span>${money(l.lineTotal)}</span>
      </div>`).join('');
    $('#totals').innerHTML = `
      <div class="summary-row"><span>Subtotal</span><span>${money(quote.subtotal)}</span></div>
      ${quote.discount ? `<div class="summary-row"><span>Discount (${esc(quote.coupon.code)})</span><span class="discount">&minus;${money(quote.discount)}</span></div>` : ''}
      <div class="summary-row"><span>Delivery${quote.estimatedDays && form.elements.district.value ? ` <span class="muted">(${esc(quote.estimatedDays)} days)</span>` : ''}</span><span>${form.elements.district.value || deliveryMethod === 'PICKUP' ? (quote.deliveryFee ? money(quote.deliveryFee) : 'Free') : 'Select district'}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(quote.total)}</span></div>
      ${quote.problems.length ? `<div class="form-error" style="margin-top:12px">${esc(quote.problems[0].message)} <a href="/cart" style="text-decoration:underline">Update cart</a></div>` : ''}`;

    // COD availability rules
    const cod = $('[data-pay="COD"]');
    if (cod) {
      const input = $('input', cod);
      input.disabled = !quote.codAvailable;
      cod.classList.toggle('disabled', !quote.codAvailable);
      $('.c-desc', cod).textContent = quote.codAvailable ? 'Pay in cash when your order arrives.' : `Not available for this order${s.codMaxAmount ? ` (limit ${money(s.codMaxAmount)})` : ''}.`;
      if (!quote.codAvailable && input.checked) { const next = $$('input[name=paymentMethod]').find((i) => !i.disabled); if (next) next.checked = true; }
    }
  }

  $('#billingDifferent').addEventListener('change', (e) => $('#billing-fields').classList.toggle('hidden', !e.target.checked));
  form.addEventListener('change', (e) => { if (['district', 'deliveryMethod'].includes(e.target.name)) { sessionStorage.setItem('district', form.elements.district.value); refresh(); } });
  $('#apply-promo').addEventListener('click', async () => {
    const code = $('#promo').value.trim();
    coupon = code;
    if (code) sessionStorage.setItem('coupon', code); else sessionStorage.removeItem('coupon');
    await refresh();
    if (coupon && quote?.coupon) toast(`Promo code ${quote.coupon.code} applied`);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#form-error');
    err.innerHTML = '';
    // Native validation for required fields
    $$('[data-billing]').forEach((i) => { i.required = $('#billingDifferent').checked && i.dataset.billing !== 'postalCode'; });
    if (!form.checkValidity()) {
      const bad = form.querySelector(':invalid');
      err.innerHTML = `<div class="form-error">${bad?.name === 'acceptTerms' ? 'Please accept the terms and privacy policy.' : 'Please complete all required fields.'}</div>`;
      bad?.focus();
      if (bad?.name !== 'acceptTerms') err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const data = formData(form);
    const billing = {};
    $$('[data-billing]').forEach((i) => { billing[i.dataset.billing] = i.value; });
    const btn = $('#place-order');
    setLoading(btn, true, 'Placing order...');
    try {
      const r = await api('/api/orders', {
        method: 'POST',
        body: { ...data, billing, items: Cart.payload(), couponCode: coupon, idempotencyKey },
      });
      Cart.clear();
      sessionStorage.removeItem('coupon');
      location.href = `/order-confirmation?order=${encodeURIComponent(r.orderNumber)}&token=${encodeURIComponent(r.accessToken)}`;
    } catch (e2) {
      setLoading(btn, false);
      err.innerHTML = `<div class="form-error">${esc(e2.message)}${e2.status === 409 ? ' <a href="/cart" style="text-decoration:underline">Review cart</a>' : ''}</div>`;
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refresh();
    }
  });

  refresh();
})();
