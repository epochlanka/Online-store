(async function () {
  const { api, esc, $, placeholder, productCard, skeletonCards, stars, icon, reveal, ready } = Store;

  $('#hero-main').innerHTML = placeholder('Hero campaign image', 'ph-fill');
  $('#hero-side').innerHTML = placeholder('Detail shot', 'ph-fill');
  $('#promo-media').innerHTML = placeholder('Sale campaign image', 'ph-dark');
  $('#story-media').innerHTML = placeholder('Brand story photograph', 'ph-fill');
  ['#new-arrivals', '#best-sellers', '#featured'].forEach((s) => { $(s).innerHTML = skeletonCards(4); });
  const m = new Date().getMonth();
  $('#season').textContent = `${['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(((m + 10) % 12) / 3)]} ${new Date().getFullYear()}`;

  const s = await ready;
  document.querySelectorAll('[data-setting]').forEach((el) => { if (s[el.dataset.setting]) el.textContent = s[el.dataset.setting]; });
  if (s.instagram) $('#insta-link').href = s.instagram;

  const free = Number(s.freeDeliveryThreshold);
  $('#hero-points').innerHTML = [
    [icon.truck, free ? `Free delivery over Rs. ${free.toLocaleString('en-LK')}` : 'Islandwide delivery'],
    [icon.cash, 'Cash on delivery'],
    [icon.return, '14-day easy returns'],
  ].map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join('');

  const tick = ['New season edit', 'Islandwide delivery', 'Breathable linen & cotton', 'Cash on delivery', 'Designed in Colombo', 'Easy 14-day returns'];
  // Two copies so the CSS loop is seamless
  $('#ticker').innerHTML = [...tick, ...tick].map((t) => `<span>${t}</span><i>✦</i>`).join('');

  const [cats, newest, popular, featured, reviews] = await Promise.all([
    api('/api/categories'),
    api('/api/products?sort=newest&limit=4'),
    api('/api/products?sort=popular&limit=4'),
    api('/api/products?featured=1&limit=4'),
    api('/api/reviews/featured'),
  ]);

  $('#hero-count').textContent = `${newest.total} new styles`;

  $('#categories').innerHTML = cats.map((c) => `
    <a class="cat-card" href="/shop?category=${esc(c.slug)}">
      ${placeholder(c.name + ' category')}
      <div class="cat-label"><div><h3>${esc(c.name)}</h3><span>${c.productCount} styles</span></div><span class="cat-arrow" aria-hidden="true">&rarr;</span></div>
    </a>`).join('');

  $('#new-arrivals').innerHTML = newest.products.map(productCard).join('');
  $('#best-sellers').innerHTML = popular.products.map(productCard).join('');
  $('#featured').innerHTML = featured.products.map(productCard).join('');

  const collections = [
    { title: 'The Linen Edit', text: 'Breathable linen for warm days.', href: '/search?q=linen' },
    { title: 'Workwear Essentials', text: 'Smart pieces for the office.', href: '/shop?category=men' },
  ];
  $('#collections').innerHTML = collections.map((c) => `
    <a class="collection-banner" href="${c.href}">
      ${placeholder(c.title + ' banner', 'ph-dark')}
      <div class="copy"><span class="eyebrow" style="color:rgba(255,255,255,.7)">Collection</span><h3>${esc(c.title)}</h3><p style="margin:0 0 16px">${esc(c.text)}</p><span class="btn btn-light btn-sm">Explore</span></div>
    </a>`).join('');

  if (reviews.length) {
    const avg = (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1);
    $('#rating-badge').innerHTML = `<strong>${avg}</strong>${stars(Number(avg))}<span>from verified buyers</span>`;
  }
  $('#reviews').innerHTML = reviews.length
    ? reviews.map((r) => `
      <figure class="review-card">
        <span class="quote-mark" aria-hidden="true">&ldquo;</span>
        ${stars(r.rating)}
        <blockquote>${esc(r.comment)}</blockquote>
        <figcaption class="who"><span class="avatar">${esc(r.name[0])}</span><span><strong>${esc(r.name)}</strong><br>on <a href="/product/${esc(r.product.slug)}">${esc(r.product.name)}</a></span></figcaption>
      </figure>`).join('')
    : '<p class="muted">Reviews will appear here once customers start sharing them.</p>';

  $('#gallery').innerHTML = ['Look 01', 'Look 02', 'Look 03', 'Look 04', 'Look 05', 'Look 06']
    .map((t) => `<a href="${esc(s.instagram || '#')}" target="_blank" rel="noopener" class="g-tile">${placeholder(t, 'ph-square')}<span class="g-over">${icon.instagram}</span></a>`).join('');

  reveal();
})();
