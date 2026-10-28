// Shop / New arrivals / Sale / Search. Filter state lives in the URL query string.
(async function () {
  const { api, esc, $, $$, productCard, skeletonCards, icon, ready } = Store;
  await ready;

  const path = location.pathname;
  const mode = { '/new-arrivals': 'new', '/sale': 'sale', '/search': 'search' }[path] || 'shop';
  const params = new URLSearchParams(location.search);
  const state = {
    category: params.get('category') || '',
    size: params.getAll('size').flatMap((s) => s.split(',')).filter(Boolean),
    colour: params.getAll('colour').flatMap((s) => s.split(',')).filter(Boolean),
    min: params.get('min') || '', max: params.get('max') || '',
    inStock: params.get('inStock') === '1', sale: mode === 'sale' || params.get('sale') === '1',
    sort: params.get('sort') || 'newest', page: Number(params.get('page')) || 1, q: params.get('q') || '',
  };

  const [cats, filters] = await Promise.all([api('/api/categories'), api('/api/filters')]);

  const titles = {
    shop: ['Shop all', 'Everyday essentials, thoughtfully made.'],
    new: ['New arrivals', 'The latest pieces, just landed.'],
    sale: ['Sale', 'Selected styles at special prices - while stocks last.'],
    search: [state.q ? `Results for "${state.q}"` : 'Search', 'Search our full collection.'],
  };
  function setHeading() {
    let [t, sub] = titles[mode];
    const cat = cats.find((c) => c.slug === state.category);
    if (mode === 'shop' && cat) { t = cat.name; sub = cat.description || sub; }
    $('#page-title').textContent = t;
    $('#page-sub').textContent = sub;
    $('#crumb').textContent = t;
    document.title = document.title.replace(/^[^|]+/, t + ' ');
  }

  // Close button icon for the mobile drawer
  $$('.filter-toggle-head [data-close-filters]').forEach((b) => { b.innerHTML = icon.close; });

  function renderFilters() {
    $('#f-category').innerHTML = [{ slug: '', name: 'All', productCount: cats.reduce((a, c) => a + c.productCount, 0) }, ...cats]
      .map((c) => `<li><a href="#" data-cat="${esc(c.slug)}" class="${state.category === c.slug ? 'active' : ''}">${esc(c.name)} <span class="muted">(${c.productCount})</span></a></li>`).join('');
    $('#f-size').innerHTML = filters.sizes.map((s) => `<button type="button" class="chip ${state.size.includes(s) ? 'active' : ''}" data-size="${esc(s)}" aria-pressed="${state.size.includes(s)}">${esc(s)}</button>`).join('');
    $('#f-colour').innerHTML = filters.colours.map((c) => `<button type="button" class="chip colour-chip ${state.colour.includes(c.name) ? 'active' : ''}" data-colour="${esc(c.name)}" aria-pressed="${state.colour.includes(c.name)}"><i style="background:${esc(c.hex || '#ccc')}"></i>${esc(c.name)}</button>`).join('');
    $('#p-min').value = state.min; $('#p-max').value = state.max;
    $('#p-min').placeholder = `Min ${filters.minPrice}`; $('#p-max').placeholder = `Max ${filters.maxPrice}`;
    $('#f-instock').checked = state.inStock;
    $('#f-sale').checked = state.sale;
    $('#f-sale').disabled = mode === 'sale';
    $('#sort').value = state.sort;

    const chips = [];
    if (state.category) chips.push(['category', '', cats.find((c) => c.slug === state.category)?.name || state.category]);
    state.size.forEach((s) => chips.push(['size', s, `Size: ${s}`]));
    state.colour.forEach((c) => chips.push(['colour', c, c]));
    if (state.min || state.max) chips.push(['price', '', `Rs. ${state.min || 0} - ${state.max || 'any'}`]);
    if (state.inStock) chips.push(['inStock', '', 'In stock']);
    if (state.sale && mode !== 'sale') chips.push(['sale', '', 'On sale']);
    $('#active-filters').innerHTML = chips.map(([k, v, t]) => `<button type="button" data-remove="${k}" data-value="${esc(v)}">${esc(t)} &times;</button>`).join('');
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category);
    if (state.size.length) p.set('size', state.size.join(','));
    if (state.colour.length) p.set('colour', state.colour.join(','));
    if (state.min) p.set('min', state.min);
    if (state.max) p.set('max', state.max);
    if (state.inStock) p.set('inStock', '1');
    if (state.sale && mode !== 'sale') p.set('sale', '1');
    if (state.sort !== 'newest') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', state.page);
    history.replaceState(null, '', path + (p.toString() ? '?' + p : ''));
  }

  async function load() {
    setHeading(); renderFilters(); syncUrl();
    const grid = $('#grid');
    grid.innerHTML = skeletonCards(8);
    const p = new URLSearchParams({ sort: state.sort, page: state.page, limit: 12 });
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category);
    if (state.size.length) p.set('size', state.size.join(','));
    if (state.colour.length) p.set('colour', state.colour.join(','));
    if (state.min) p.set('min', state.min);
    if (state.max) p.set('max', state.max);
    if (state.inStock) p.set('inStock', '1');
    if (state.sale) p.set('sale', '1');
    if (mode === 'new') p.set('new', '1');
    try {
      const data = await api('/api/products?' + p);
      $('#result-count').textContent = `${data.total} ${data.total === 1 ? 'product' : 'products'}`;
      grid.innerHTML = data.products.length
        ? data.products.map(productCard).join('')
        : `<div class="empty-state" style="grid-column:1/-1">${icon.search}<h3>No products found</h3><p class="muted">Try removing a filter or searching for something else.</p><a class="btn btn-outline btn-sm" href="/shop">View all products</a></div>`;
      const pages = data.pages;
      $('#pagination').innerHTML = pages > 1
        ? `<button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">&lsaquo;</button>`
          + Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}" class="${i + 1 === state.page ? 'active' : ''}" ${i + 1 === state.page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')
          + `<button type="button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Next page">&rsaquo;</button>`
        : '';
    } catch (err) {
      grid.innerHTML = `<div class="form-error" style="grid-column:1/-1">${esc(err.message)}</div>`;
    }
  }

  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const update = (fn) => { fn(); state.page = 1; load(); };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat],[data-size],[data-colour],[data-remove],[data-page]');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.cat !== undefined) update(() => { state.category = t.dataset.cat; });
    else if (t.dataset.size) update(() => { state.size = toggle(state.size, t.dataset.size); });
    else if (t.dataset.colour) update(() => { state.colour = toggle(state.colour, t.dataset.colour); });
    else if (t.dataset.page) { state.page = Number(t.dataset.page); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (t.dataset.remove) update(() => {
      const k = t.dataset.remove; const v = t.dataset.value;
      if (k === 'category') state.category = '';
      if (k === 'size') state.size = state.size.filter((x) => x !== v);
      if (k === 'colour') state.colour = state.colour.filter((x) => x !== v);
      if (k === 'price') { state.min = ''; state.max = ''; }
      if (k === 'inStock') state.inStock = false;
      if (k === 'sale') state.sale = false;
    });
  });
  $('#f-price').addEventListener('submit', (e) => { e.preventDefault(); update(() => { state.min = $('#p-min').value; state.max = $('#p-max').value; }); });
  $('#f-instock').addEventListener('change', (e) => update(() => { state.inStock = e.target.checked; }));
  $('#f-sale').addEventListener('change', (e) => update(() => { state.sale = e.target.checked; }));
  $('#sort').addEventListener('change', (e) => update(() => { state.sort = e.target.value; }));
  $('#clear-filters').addEventListener('click', () => update(() => { Object.assign(state, { category: '', size: [], colour: [], min: '', max: '', inStock: false, sale: mode === 'sale' }); }));
  $('#open-filters').addEventListener('click', () => $('#filters').classList.add('open'));
  $$('[data-close-filters]').forEach((b) => b.addEventListener('click', () => $('#filters').classList.remove('open')));

  if (mode === 'search') { const input = $('#site-search'); if (input) input.value = state.q; }
  load();
})();
