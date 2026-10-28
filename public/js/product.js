(async function () {
  const { api, esc, money, $, $$, placeholder, productCard, priceHtml, stars, icon, toast, Cart, Wishlist, fmtDate, ready } = Store;
  const s = await ready;
  const slug = decodeURIComponent(location.pathname.split('/').pop());
  const root = $('#product-root');

  let p;
  try { p = await api(`/api/products/${encodeURIComponent(slug)}`); }
  catch {
    root.innerHTML = '<div class="empty-state" style="margin:40px 0 80px"><h2>Product not found</h2><p class="muted">This product may have been removed.</p><a class="btn" href="/shop">Continue shopping</a></div>';
    return;
  }

  document.title = `${p.name} | ${s.storeName}`;
  $('#crumbs').innerHTML += p.category ? `<span>/</span><a href="/shop?category=${esc(p.category.slug)}">${esc(p.category.name)}</a>` : '';
  $('#crumbs').innerHTML += `<span>/</span><span aria-current="page">${esc(p.name)}</span>`;

  const colours = [...new Map(p.variants.map((v) => [v.colour, v.colourHex])).entries()];
  const sizes = [...new Set(p.variants.map((v) => v.size))];
  // Pick the first colour that has stock
  let colour = (colours.find(([c]) => p.variants.some((v) => v.colour === c && v.stock > 0)) || colours[0])[0];
  let size = null;
  const images = p.images.length ? p.images : [{ alt: 'Front' }];
  const free = Number(s.freeDeliveryThreshold);

  root.innerHTML = `
    <div class="pdp">
      <div class="gallery">
        <div class="thumbs" role="tablist" aria-label="Product images">
          ${images.map((img, i) => `<button type="button" role="tab" class="${i === 0 ? 'active' : ''}" data-thumb="${i}" aria-label="Show ${esc(img.alt)} image">${placeholder(img.alt)}</button>`).join('')}
        </div>
        <div class="main-image" id="main-image" tabindex="0" aria-label="Product image, click to zoom">
          ${placeholder(`${p.name} - ${images[0].alt}`)}
          <span class="zoom-hint">Click to zoom</span>
        </div>
      </div>

      <div class="pdp-info">
        <span class="sku">SKU: <span id="sku">${esc(p.sku)}</span></span>
        <h1>${esc(p.name)}</h1>
        ${p.rating ? `<a href="#reviews" style="display:inline-flex;gap:8px;align-items:center;font-size:.85rem">${stars(p.rating)} <span class="muted">${p.rating} (${p.reviewCount} reviews)</span></a>` : ''}
        <div style="margin-top:14px">${priceHtml(p)}</div>
        ${p.onSale ? `<span class="save">You save ${money(p.price - p.finalPrice)}</span>` : ''}

        <div class="option-block">
          <div class="option-head"><span>Colour: <strong id="colour-name">${esc(colour)}</strong></span></div>
          <div class="colour-options" role="radiogroup" aria-label="Colour">
            ${colours.map(([c, hex]) => `<button type="button" role="radio" class="colour-opt" data-colour="${esc(c)}" aria-label="${esc(c)}" title="${esc(c)}"><span style="background:${esc(hex || '#ccc')}"></span></button>`).join('')}
          </div>
        </div>

        <div class="option-block">
          <div class="option-head"><span>Size: <strong id="size-name">Select a size</strong></span><button type="button" class="btn-link" data-open-modal="size-guide">Size guide</button></div>
          <div class="size-options" id="sizes" role="radiogroup" aria-label="Size"></div>
        </div>

        <div class="stock-line" id="stock-line" aria-live="polite">Select a size to see availability</div>

        <div class="buy-row">
          <div class="qty" aria-label="Quantity">
            <button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button>
            <input id="qty" type="number" value="1" min="1" max="20" aria-label="Quantity">
            <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn" type="button" id="add-to-cart">Add to cart</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px">
          <button class="btn btn-accent" type="button" id="buy-now">Buy now</button>
          <button class="btn btn-outline wish-pdp" type="button" data-wish="${p.id}" aria-label="Add to wishlist" style="padding:0 16px">${icon.heart}</button>
        </div>

        <div class="pdp-perks">
          <div>${icon.truck}<span>Islandwide delivery${free ? ` &middot; free over ${money(free)}` : ''}</span></div>
          <div>${icon.cash}<span>Cash on delivery available</span></div>
          <div>${icon.return}<span>Easy 14-day exchanges &middot; <a href="/returns" style="text-decoration:underline">Returns policy</a></span></div>
        </div>

        <div class="accordion">
          <details open><summary>Description</summary><div class="acc-body">${esc(p.description)}</div></details>
          <details><summary>Material & care</summary><div class="acc-body">${p.material ? `<p><strong>Material:</strong> ${esc(p.material)}</p>` : ''}${p.care ? `<p style="margin:0"><strong>Care:</strong> ${esc(p.care)}</p>` : ''}</div></details>
          <details><summary>Delivery & returns</summary><div class="acc-body">
            <p>Delivered islandwide within 1-5 working days depending on your district. Delivery fees are calculated at checkout.</p>
            <p style="margin:0">Unworn items with tags attached can be exchanged or returned within 14 days. See our <a href="/shipping" style="text-decoration:underline">delivery</a> and <a href="/returns" style="text-decoration:underline">returns</a> pages.</p>
          </div></details>
        </div>
      </div>
    </div>

    <section class="section" id="reviews" style="border-top:1px solid var(--line)">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:40px">
        <div>
          <h2>Reviews</h2>
          ${p.rating ? `<div class="review-summary"><span class="big">${p.rating}</span><div>${stars(p.rating)}<div class="muted" style="font-size:.85rem">Based on ${p.reviewCount} reviews</div></div></div>` : '<p class="muted">No reviews yet. Be the first to share your thoughts.</p>'}
          <div class="review-list">
            ${p.reviews.map((r) => `<div class="review-item">${stars(r.rating)}<p style="margin:8px 0">${esc(r.comment)}</p><div class="muted" style="font-size:.8rem">${esc(r.name)} &middot; ${fmtDate(r.createdAt)}</div></div>`).join('')}
          </div>
        </div>
        <form class="card" id="review-form" novalidate>
          <h3>Write a review</h3>
          <div class="field"><span class="label">Your rating</span>
            <div class="rating-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="r${n}" name="rating" value="${n}"><label for="r${n}" title="${n} stars">★</label>`).join('')}</div>
          </div>
          <div class="field"><label for="rv-name">Name</label><input id="rv-name" name="name" maxlength="60" required></div>
          <div class="field"><label for="rv-comment">Review</label><textarea id="rv-comment" name="comment" maxlength="1000" required></textarea></div>
          <div class="rv-msg" aria-live="polite"></div>
          <button class="btn" type="submit">Submit review</button>
        </form>
      </div>
    </section>

    ${p.related.length ? `<section class="section" style="padding-top:0"><div class="section-head"><h2>You may also like</h2></div><div class="product-grid">${p.related.map(productCard).join('')}</div></section>` : ''}

    <div class="sticky-atc" id="sticky-atc">
      <div class="meta"><strong>${esc(p.name)}</strong><span id="sticky-meta">${money(p.finalPrice)}</span></div>
      <button class="btn btn-sm" type="button" id="sticky-add">Add to cart</button>
    </div>`;
  document.body.classList.add('has-sticky-atc');
  Wishlist.updateUI();

  const variantFor = (c, sz) => p.variants.find((v) => v.colour === c && v.size === sz);

  function renderOptions() {
    $$('.colour-opt').forEach((b) => { const on = b.dataset.colour === colour; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); });
    $('#colour-name').textContent = colour;
    $('#sizes').innerHTML = sizes.map((sz) => {
      const v = variantFor(colour, sz);
      const out = !v || v.stock <= 0;
      return `<button type="button" role="radio" class="size-opt ${out ? 'sold-out' : ''} ${size === sz ? 'active' : ''}" data-size="${esc(sz)}" aria-checked="${size === sz}" aria-label="${esc(sz)}${out ? ' - sold out' : ''}" ${out ? 'aria-disabled="true"' : ''}>${esc(sz)}</button>`;
    }).join('');
    const v = size && variantFor(colour, size);
    const line = $('#stock-line');
    line.className = 'stock-line';
    $('#size-name').textContent = size || 'Select a size';
    if (!size) { line.textContent = 'Select a size to see availability'; line.classList.add('low'); }
    else if (!v || v.stock <= 0) { line.textContent = 'Sold out in this size'; line.classList.add('out'); }
    else if (v.stock <= p.lowStockThreshold) { line.textContent = `Hurry - only ${v.stock} left in stock`; line.classList.add('low'); }
    else line.textContent = `In stock (${v.stock} available)`;
    $('#sku').textContent = v ? v.sku : p.sku;
    const soldOut = v && v.stock <= 0;
    ['#add-to-cart', '#buy-now', '#sticky-add'].forEach((id) => { $(id).disabled = !!soldOut; });
    $('#add-to-cart').textContent = soldOut ? 'Sold out' : 'Add to cart';
    $('#sticky-meta').textContent = `${money(p.finalPrice)}${size ? ` · ${colour} / ${size}` : ''}`;
    const qty = $('#qty');
    if (v && v.stock > 0) { qty.max = Math.min(20, v.stock); if (+qty.value > +qty.max) qty.value = qty.max; }
  }

  function addToCart() {
    if (!size) {
      toast('Please select a size', { type: 'error' });
      $('#sizes').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    const v = variantFor(colour, size);
    if (!v || v.stock <= 0) { toast('This size is sold out', { type: 'error' }); return false; }
    const quantity = Math.max(1, Math.min(Number($('#qty').value) || 1, v.stock));
    const inCart = Cart.items().find((i) => i.variantId === v.id)?.quantity || 0;
    if (inCart + quantity > v.stock) { toast(`Only ${v.stock} available - you already have ${inCart} in your cart`, { type: 'error' }); return false; }
    Cart.add({ variantId: v.id, productId: p.id, slug: p.slug, name: p.name, size, colour, price: p.finalPrice, image: images[0].alt, quantity });
    toast(`Added ${p.name} to your cart`, { link: { href: '/cart', text: 'View cart' } });
    return true;
  }

  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-colour]');
    if (c) { colour = c.dataset.colour; const v = size && variantFor(colour, size); if (!v || v.stock <= 0) size = null; renderOptions(); return; }
    const sz = e.target.closest('[data-size]');
    if (sz && !sz.classList.contains('sold-out')) { size = sz.dataset.size; renderOptions(); return; }
    const q = e.target.closest('[data-qty]');
    if (q) { const input = $('#qty'); input.value = Math.max(1, Math.min(Number(input.max) || 20, Number(input.value) + Number(q.dataset.qty))); return; }
    const t = e.target.closest('[data-thumb]');
    if (t) {
      $$('[data-thumb]').forEach((b) => b.classList.toggle('active', b === t));
      const img = images[Number(t.dataset.thumb)];
      $('#main-image .ph').outerHTML = placeholder(`${p.name} - ${img.alt}`);
    }
  });
  $('#add-to-cart').addEventListener('click', addToCart);
  $('#sticky-add').addEventListener('click', addToCart);
  $('#buy-now').addEventListener('click', () => { if (addToCart()) location.href = '/checkout'; });

  // Hover / click zoom
  const main = $('#main-image');
  const zoomToggle = () => { main.classList.toggle('zoomed'); };
  main.addEventListener('click', zoomToggle);
  main.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomToggle(); } });
  main.addEventListener('mousemove', (e) => {
    const r = main.getBoundingClientRect();
    $('.ph', main).style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });
  main.addEventListener('mouseleave', () => main.classList.remove('zoomed'));

  // Size guide modal
  const modal = $('#size-guide');
  $('[data-close-modal]', modal).innerHTML = icon.close;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-modal]')) { modal.classList.add('open'); $('[data-close-modal]', modal).focus(); }
    if (e.target === modal || e.target.closest('[data-close-modal]')) modal.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.remove('open'); });

  // Review form
  const user = await Store.getUser();
  if (user) $('#rv-name').value = user.name;
  $('#review-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; const msg = $('.rv-msg', f);
    try {
      const r = await api(`/api/products/${p.id}/reviews`, { method: 'POST', body: { rating: f.elements.rating.value, name: f.elements.name.value, comment: f.elements.comment.value } });
      msg.innerHTML = `<div class="form-success">${esc(r.message)}</div>`; f.reset();
    } catch (err) { msg.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
  });

  renderOptions();
})();
