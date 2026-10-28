// Order confirmation + order tracking (shared order view)
(async function () {
  const { api, esc, money, $, icon, fmtDate, label, pill, formData, setLoading, ready } = Store;
  await ready;
  const root = $('#order-root');
  const STEPS = ['RECEIVED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
  const PAY = { COD: 'Cash on delivery', BANK_TRANSFER: 'Bank transfer', CARD: 'Card payment' };

  function timeline(o) {
    if (['CANCELLED', 'RETURNED'].includes(o.status)) return `<div class="form-error">This order was ${label(o.status).toLowerCase()}.</div>`;
    const steps = o.status === 'PENDING_PAYMENT' || o.paymentMethod !== 'COD' ? ['PENDING_PAYMENT', ...STEPS] : STEPS;
    let idx = steps.indexOf(o.status);
    if (o.status === 'PENDING_PAYMENT') idx = 0;
    return `<ol class="timeline" style="grid-template-columns:repeat(${steps.length},1fr)">${steps.map((st, i) => `<li class="${i <= idx ? 'done' : ''}">${label(st === 'PENDING_PAYMENT' ? 'Awaiting payment' : st)}</li>`).join('')}</ol>`;
  }

  function view(o, { confirmation }) {
    const a = o.address;
    return `
      ${confirmation ? `<div class="confirm-hero"><span class="tick">${icon.check}</span><h1>Thank you, ${esc(o.name.split(' ')[0])}!</h1><p class="muted">Your order <strong>${esc(o.orderNumber)}</strong> has been placed. A confirmation has been sent to ${esc(o.email)}.</p></div>` : `<h2 style="margin-top:32px">Order ${esc(o.orderNumber)}</h2>`}

      ${o.bank && o.paymentStatus === 'PENDING' ? `<div class="bank-box"><h3 style="margin:0">Complete your bank transfer</h3><p style="margin:6px 0 0" class="muted">Please transfer <strong>${money(o.total)}</strong> using your order number <strong>${esc(o.orderNumber)}</strong> as the reference, then send the slip to us on WhatsApp or email.</p>
        <dl><dt>Bank</dt><dd>${esc(o.bank.bankName)}</dd><dt>Account name</dt><dd>${esc(o.bank.accountName)}</dd><dt>Account number</dt><dd>${esc(o.bank.accountNumber)}</dd><dt>Branch</dt><dd>${esc(o.bank.branch)}</dd></dl></div>` : ''}
      ${o.paymentMethod === 'CARD' && o.paymentStatus === 'PENDING' ? '<div class="bank-box"><strong>Card payment pending.</strong> <span class="muted">The online payment gateway is not connected yet in this build. Our team will contact you to complete payment.</span></div>' : ''}

      <div class="card">${timeline(o)}</div>

      <div class="info-cards">
        <div class="info-card"><h4>Order status</h4>${pill(o.status)}<p class="muted" style="margin:8px 0 0;font-size:.82rem">Placed ${fmtDate(o.createdAt)}</p></div>
        <div class="info-card"><h4>Payment</h4>${pill(o.paymentStatus)}<p class="muted" style="margin:8px 0 0;font-size:.82rem">${PAY[o.paymentMethod] || o.paymentMethod}</p></div>
        <div class="info-card"><h4>Delivery</h4>
          ${o.deliveryMethod === 'PICKUP' ? 'Store pickup' : `${o.estimatedDays ? `Estimated ${esc(o.estimatedDays)} working days` : 'Islandwide delivery'}`}
          ${o.shipment?.trackingNumber ? `<p style="margin:8px 0 0;font-size:.85rem">${esc(o.shipment.courier || 'Courier')}: <strong>${esc(o.shipment.trackingNumber)}</strong></p>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">
        <div class="card">
          <h3>Items</h3>
          ${o.items.map((i) => `<div class="summary-row"><span>${esc(i.productName)} <span class="muted">&times; ${i.quantity}<br>${esc(i.colour)} / ${esc(i.size)}</span></span><span>${money(i.unitPrice * i.quantity)}</span></div>`).join('')}
          <div class="summary-row" style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
          ${o.discount ? `<div class="summary-row"><span>Discount${o.couponCode ? ` (${esc(o.couponCode)})` : ''}</span><span class="discount" style="color:var(--success)">&minus;${money(o.discount)}</span></div>` : ''}
          <div class="summary-row"><span>Delivery</span><span>${o.deliveryFee ? money(o.deliveryFee) : 'Free'}</span></div>
          <div class="summary-row total"><span>Total</span><span>${money(o.total)}</span></div>
        </div>
        <div>
          <div class="card">
            <h3>Delivery address</h3>
            <p style="margin:0">${esc(o.name)}<br>${esc(a.line1)}${a.line2 ? `<br>${esc(a.line2)}` : ''}<br>${esc(a.city)}, ${esc(a.district)} ${esc(a.postalCode || '')}<br>${esc(o.phone)}</p>
          </div>
          ${o.history.length ? `<div class="card"><h3>Order history</h3><ul class="history-list">${o.history.map((h) => `<li><span>${esc(label(h.status))}${h.note ? ` <span class="muted">- ${esc(h.note)}</span>` : ''}</span><span class="muted">${fmtDate(h.createdAt)}</span></li>`).join('')}</ul></div>` : ''}
        </div>
      </div>

      ${confirmation ? `<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:24px"><a class="btn" href="/shop">Continue shopping</a><a class="btn btn-outline" href="/track-order">Track this order</a></div>` : ''}`;
  }

  if (document.body.dataset.page === 'order-confirmation') {
    const p = new URLSearchParams(location.search);
    try {
      const o = await api(`/api/orders/${encodeURIComponent(p.get('order') || '')}?token=${encodeURIComponent(p.get('token') || '')}`);
      root.innerHTML = view(o, { confirmation: true });
    } catch {
      root.innerHTML = '<div class="empty-state" style="margin:48px 0"><h2>Order not found</h2><p class="muted">Use the order tracking page with your order number and email.</p><a class="btn" href="/track-order">Track an order</a></div>';
    }
  } else {
    const form = $('#track-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button', form); const msg = $('.t-msg', form);
      msg.innerHTML = '';
      setLoading(btn, true, 'Searching...');
      try { root.innerHTML = view(await api('/api/orders/track', { method: 'POST', body: formData(form) }), { confirmation: false }); }
      catch (err) { msg.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; root.innerHTML = ''; }
      setLoading(btn, false);
    });
  }
})();
