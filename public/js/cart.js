(async function () {
  const { api, esc, money, $, placeholder, icon, Cart, toast, ready } = Store;
  await ready;
  const root = $('#cart-root');
  let coupon = sessionStorage.getItem('coupon') || '';
  let district = sessionStorage.getItem('district') || '';
  const rates = await api('/api/shipping-rates');

  function empty() {
    root.innerHTML = `<div class="empty-state" style="margin-bottom:80px">${icon.bag}<h2>Your cart is empty</h2><p class="muted">Looks like you haven't added anything yet.</p><a class="btn" href="/shop">Start shopping</a></div>`;
  }

  async function render() {
    if (!Cart.items().length) return empty();
    let q;
    try { q = await api('/api/cart/quote', { method: 'POST', body: { items: Cart.payload(), couponCode: coupon, district } }); }
    catch (err) { root.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; return; }

    // Drop items that no longer exist
    const known = new Set(q.lines.map((l) => l.variantId));
    const gone = Cart.items().filter((i) => !known.has(i.variantId));
    if (gone.length) { gone.forEach((i) => Cart.remove(i.variantId)); toast('Some unavailable items were removed from your cart', { type: 'error' }); if (!Cart.items().length) return empty(); }
    if (coupon && q.couponError) { toast(q.couponError, { type: 'error' }); coupon = ''; sessionStorage.removeItem('coupon'); }

    const problem = (id) => q.problems.find((p) => p.variantId === id);
    const freePct = q.freeDeliveryThreshold ? Math.min(100, ((q.subtotal - q.discount) / q.freeDeliveryThreshold) * 100) : 0;

    root.innerHTML = `
      <div class="cart-layout">
        <section aria-label="Cart items">
          ${q.lines.map((l) => `
            <div class="cart-item">
              <a href="/product/${esc(l.slug)}">${placeholder(l.image)}</a>
              <div>
                <a class="title" href="/product/${esc(l.slug)}">${esc(l.productName)}</a>
                <div class="opts">Colour: ${esc(l.colour)} &middot; Size: ${esc(l.size)} &middot; ${money(l.unitPrice)}${l.originalPrice > l.unitPrice ? ` <s>${money(l.originalPrice)}</s>` : ''}</div>
                <div class="controls">
                  <div class="qty qty-sm">
                    <button type="button" data-dec="${l.variantId}" aria-label="Decrease quantity">&minus;</button>
                    <input type="number" min="1" max="${Math.min(20, Math.max(1, l.stock))}" value="${l.quantity}" data-qty="${l.variantId}" aria-label="Quantity for ${esc(l.productName)}">
                    <button type="button" data-inc="${l.variantId}" aria-label="Increase quantity">+</button>
                  </div>
                  <button class="btn-link" type="button" data-remove="${l.variantId}">Remove</button>
                </div>
                ${problem(l.variantId) ? `<div class="problem">${esc(problem(l.variantId).message)}</div>` : ''}
              </div>
              <div class="line-total">${money(l.lineTotal)}</div>
            </div>`).join('')}
          <a href="/shop" class="link-arrow" style="display:inline-block;margin-top:24px">&larr; Continue shopping</a>
        </section>

        <aside class="summary" aria-label="Order summary">
          <h3>Order summary</h3>
          ${q.freeDeliveryThreshold ? `<div class="free-bar">${q.amountToFreeDelivery > 0 ? `Add <strong>${money(q.amountToFreeDelivery)}</strong> more for free delivery` : '<strong>You qualify for free delivery!</strong>'}<div class="bar"><i style="width:${freePct}%"></i></div></div>` : ''}
          <div class="summary-row"><span>Subtotal</span><span>${money(q.subtotal)}</span></div>
          ${q.discount ? `<div class="summary-row"><span>Discount (${esc(q.coupon.code)}) <button class="btn-link" type="button" id="remove-coupon">remove</button></span><span class="discount">&minus;${money(q.discount)}</span></div>` : ''}
          <div class="field" style="margin:14px 0 10px">
            <label for="district">Estimate delivery for</label>
            <select id="district"><option value="">Select district</option>${rates.map((r) => `<option ${r.district === district ? 'selected' : ''}>${esc(r.district)}</option>`).join('')}</select>
          </div>
          <div class="summary-row"><span>Delivery ${q.district ? `<span class="muted">(${esc(q.estimatedDays)} days)</span>` : '<span class="muted">(estimate)</span>'}</span><span>${q.deliveryFee ? money(q.deliveryFee) : 'Free'}</span></div>
          <form class="promo-form" id="promo-form">
            <label class="sr-only" for="promo">Promo code</label>
            <input id="promo" placeholder="Promo code" value="${esc(q.coupon?.code || '')}" maxlength="40">
            <button class="btn btn-outline btn-sm" type="submit">Apply</button>
          </form>
          <div class="summary-row total"><span>Total</span><span>${money(q.total)}</span></div>
          <a class="btn btn-block ${q.problems.length ? 'is-loading' : ''}" href="/checkout" style="margin-top:16px" ${q.problems.length ? 'aria-disabled="true"' : ''}>Proceed to checkout</a>
          ${q.problems.length ? '<p class="problem" style="color:var(--danger);font-size:.82rem;margin-top:10px">Please update the highlighted items before checking out.</p>' : ''}
          <div class="secure-note">${icon.lock} Secure checkout &middot; COD available</div>
        </aside>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const t = e.target;
    const items = Cart.items();
    const find = (id) => items.find((i) => i.variantId === Number(id));
    if (t.dataset.inc) { const it = find(t.dataset.inc); Cart.setQty(it.variantId, it.quantity + 1); render(); }
    if (t.dataset.dec) { const it = find(t.dataset.dec); if (it.quantity > 1) { Cart.setQty(it.variantId, it.quantity - 1); render(); } }
    if (t.dataset.remove) { Cart.remove(Number(t.dataset.remove)); toast('Item removed'); render(); }
    if (t.id === 'remove-coupon') { coupon = ''; sessionStorage.removeItem('coupon'); render(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.qty) { Cart.setQty(Number(e.target.dataset.qty), Number(e.target.value) || 1); render(); }
    if (e.target.id === 'district') { district = e.target.value; sessionStorage.setItem('district', district); render(); }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'promo-form') return;
    e.preventDefault();
    const code = $('#promo').value.trim();
    if (!code) return;
    const q = await api('/api/cart/quote', { method: 'POST', body: { items: Cart.payload(), couponCode: code, district } });
    if (q.couponError) return toast(q.couponError, { type: 'error' });
    coupon = q.coupon.code; sessionStorage.setItem('coupon', coupon);
    toast(`Promo code ${coupon} applied`);
    render();
  });

  render();
})();
