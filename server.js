// Clothing store server: serves the HTML/CSS storefront + admin and a JSON API backed by Prisma.
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV === 'production';

const ORDER_STATUSES = ['PENDING_PAYMENT', 'RECEIVED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const REFUND_STATUSES = ['REQUESTED', 'APPROVED', 'PROCESSED', 'REJECTED'];
const PAYMENT_METHODS = { COD: 'codEnabled', BANK_TRANSFER: 'bankTransferEnabled', CARD: 'cardEnabled' };
const SESSION_DAYS = 14;

// Settings safe to expose to the storefront (everything else is admin-only)
const PUBLIC_SETTINGS = [
  'storeName', 'tagline', 'email', 'phone', 'whatsapp', 'address', 'openingHours', 'instagram', 'facebook', 'tiktok',
  'announcement', 'heroTitle', 'heroSubtitle', 'heroCta', 'promoTitle', 'promoText', 'aboutStory', 'aboutMission',
  'currency', 'flatDeliveryFee', 'freeDeliveryThreshold', 'expressSurcharge', 'pickupEnabled', 'codEnabled',
  'codMaxAmount', 'bankTransferEnabled', 'cardEnabled',
];

// ---------- Helpers ----------

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const fail = (message, status = 400, details) => new HttpError(status, message, details);
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');

function str(v, max = 255, { required = false, label = 'Field' } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw fail(`${label} is required.`);
  if (s.length > max) throw fail(`${label} is too long (max ${max} characters).`);
  return s || null;
}
function int(v, { min = 0, max = 10_000_000, label = 'Value', required = false } = {}) {
  if (v === '' || v == null) { if (required) throw fail(`${label} is required.`); return null; }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw fail(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}
function email(v) {
  const e = str(v, 160, { required: true, label: 'Email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw fail('Please enter a valid email address.');
  return e;
}
function phone(v) {
  const p = str(v, 20, { required: true, label: 'Phone number' });
  if (!/^\+?[0-9 ()-]{9,16}$/.test(p)) throw fail('Please enter a valid phone number.');
  return p;
}
function password(v) {
  const p = v == null ? '' : String(v);
  if (p.length < 8 || p.length > 128) throw fail('Password must be at least 8 characters.');
  return p;
}
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const effectivePrice = (p) => (p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price);
const money = (n) => `Rs. ${Number(n).toLocaleString('en-LK')}`;
const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, newsletter: u.newsletter };

async function getSettings(db = prisma) {
  const rows = await db.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
const isOn = (v) => v === 'true';

// Notification stub: connect an SMTP / SMS provider here before launch.
function notify(to, subject, body) {
  console.log(`[notify] to=${to} | ${subject}\n  ${body}`);
}

// Simple in-memory rate limiter for sensitive endpoints
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now > rec.reset) { hits.set(key, { count: 1, reset: now + windowMs }); return next(); }
    if (++rec.count > max) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    next();
  };
}

// ---------- Middleware ----------

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// CSRF guard: state-changing API calls must come from our own fetch() (custom header can't be sent cross-site)
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('X-Requested-With') !== 'fetch') {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  next();
});

// Load the logged-in user from the session cookie
app.use(ah(async (req, res, next) => {
  const sid = req.cookies.sid;
  if (sid) {
    const s = await prisma.session.findUnique({ where: { id: sha256(sid) }, include: { user: true } });
    if (s && s.expiresAt > new Date() && s.user.active) req.user = s.user;
  }
  next();
}));

async function startSession(res, userId) {
  const raw = token();
  await prisma.session.create({ data: { id: sha256(raw), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) } });
  res.cookie('sid', raw, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: SESSION_DAYS * 864e5, path: '/' });
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please log in to continue.' }));
const requireStaff = (req, res, next) => (req.user && ['ADMIN', 'STAFF'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Staff access only.' }));
const requireAdmin = (req, res, next) => (req.user && req.user.role === 'ADMIN' ? next() : res.status(403).json({ error: 'Administrator access only.' }));

// ---------- Public: settings, catalogue ----------

app.get('/api/settings', ah(async (req, res) => {
  const s = await getSettings();
  res.json(Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? ''])));
}));

app.get('/api/categories', ah(async (req, res) => {
  const cats = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
  });
  res.json(cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, productCount: c._count.products })));
}));

function cardShape(p) {
  const totalStock = p.variants.reduce((a, v) => a + v.stock, 0);
  const colours = [...new Map(p.variants.map((v) => [v.colour, { name: v.colour, hex: v.colourHex }])).values()];
  const ratings = (p.reviews || []).map((r) => r.rating);
  return {
    id: p.id, name: p.name, slug: p.slug, sku: p.sku, price: p.price, salePrice: p.salePrice,
    finalPrice: effectivePrice(p), onSale: effectivePrice(p) < p.price, featured: p.featured,
    category: p.category && { name: p.category.name, slug: p.category.slug },
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    colours, sizes: [...new Set(p.variants.map((v) => v.size))],
    inStock: totalStock > 0, createdAt: p.createdAt,
    rating: ratings.length ? +(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null,
    reviewCount: ratings.length,
  };
}
const cardInclude = {
  category: true, variants: true,
  images: { orderBy: { sortOrder: 'asc' } },
  reviews: { where: { approved: true }, select: { rating: true } },
};

app.get('/api/filters', ah(async (req, res) => {
  const variants = await prisma.productVariant.findMany({ where: { product: { status: 'ACTIVE' } }, select: { size: true, colour: true, colourHex: true } });
  const agg = await prisma.product.aggregate({ where: { status: 'ACTIVE' }, _min: { price: true, salePrice: true }, _max: { price: true } });
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const sizes = [...new Set(variants.map((v) => v.size))].sort((a, b) => {
    const ia = sizeOrder.indexOf(a); const ib = sizeOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const colours = [...new Map(variants.map((v) => [v.colour, { name: v.colour, hex: v.colourHex }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  res.json({ sizes, colours, minPrice: Math.min(agg._min.price ?? 0, agg._min.salePrice ?? Infinity), maxPrice: agg._max.price ?? 0 });
}));

app.get('/api/products', ah(async (req, res) => {
  const q = req.query;
  const where = { status: 'ACTIVE', AND: [] };
  if (q.category) where.category = { slug: String(q.category) };
  if (q.featured === '1') where.featured = true;
  if (q.q) {
    const term = String(q.q).slice(0, 80);
    where.AND.push({ OR: [{ name: { contains: term } }, { description: { contains: term } }, { sku: { contains: term } }, { category: { name: { contains: term } } }] });
  }
  if (q.ids) where.id = { in: String(q.ids).split(',').map(Number).filter(Number.isInteger).slice(0, 100) };
  const sizes = q.size ? String(q.size).split(',') : [];
  const colours = q.colour ? String(q.colour).split(',') : [];
  if (sizes.length || colours.length || q.inStock === '1') {
    const vw = {};
    if (sizes.length) vw.size = { in: sizes };
    if (colours.length) vw.colour = { in: colours };
    if (q.inStock === '1') vw.stock = { gt: 0 };
    where.AND.push({ variants: { some: vw } });
  }
  if (q.new === '1') where.createdAt = { gte: new Date(Date.now() - 45 * 864e5) };
  if (q.sale === '1') where.salePrice = { not: null };

  let products = await prisma.product.findMany({ where, include: cardInclude });
  let cards = products.map(cardShape);
  if (q.sale === '1') cards = cards.filter((c) => c.onSale);
  const min = Number(q.min); const max = Number(q.max);
  if (q.min && !Number.isNaN(min)) cards = cards.filter((c) => c.finalPrice >= min);
  if (q.max && !Number.isNaN(max)) cards = cards.filter((c) => c.finalPrice <= max);

  const sorters = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    'price-asc': (a, b) => a.finalPrice - b.finalPrice,
    'price-desc': (a, b) => b.finalPrice - a.finalPrice,
    popular: (a, b) => (products.find((p) => p.id === b.id).soldCount - products.find((p) => p.id === a.id).soldCount),
  };
  cards.sort(sorters[q.sort] || sorters.newest);

  const perPage = Math.min(48, int(q.limit, { min: 1, max: 48 }) || 12);
  const page = Math.max(1, int(q.page, { min: 1, max: 1000 }) || 1);
  res.json({ total: cards.length, page, pages: Math.max(1, Math.ceil(cards.length / perPage)), products: cards.slice((page - 1) * perPage, page * perPage) });
}));

app.get('/api/products/:slug', ah(async (req, res) => {
  const p = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: {
      category: true, images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { id: 'asc' } },
      reviews: { where: { approved: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!p || (p.status !== 'ACTIVE' && !(req.user && req.user.role !== 'CUSTOMER'))) throw fail('Product not found.', 404);
  const related = await prisma.product.findMany({
    where: { status: 'ACTIVE', categoryId: p.categoryId, id: { not: p.id } }, include: cardInclude, take: 4, orderBy: { soldCount: 'desc' },
  });
  const settings = await getSettings();
  res.json({
    ...cardShape(p),
    description: p.description, material: p.material, care: p.care,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, colour: v.colour, colourHex: v.colourHex, sku: v.sku, stock: v.stock })),
    reviews: p.reviews.map((r) => ({ id: r.id, name: r.name, rating: r.rating, comment: r.comment, createdAt: r.createdAt })),
    related: related.map(cardShape),
    lowStockThreshold: Number(settings.lowStockThreshold) || 3,
  });
}));

app.post('/api/products/:id/reviews', rateLimit(5, 60_000), ah(async (req, res) => {
  const productId = int(req.params.id, { min: 1, label: 'Product' });
  const rating = int(req.body.rating, { min: 1, max: 5, label: 'Rating', required: true });
  const comment = str(req.body.comment, 1000, { required: true, label: 'Review' });
  const name = str(req.body.name, 60, { required: !req.user, label: 'Name' }) || req.user.name;
  if (!(await prisma.product.findUnique({ where: { id: productId } }))) throw fail('Product not found.', 404);
  await prisma.review.create({ data: { productId, rating, comment, name, userId: req.user?.id } });
  res.status(201).json({ ok: true, message: 'Thank you! Your review will appear once approved.' });
}));

app.get('/api/reviews/featured', ah(async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { approved: true, rating: { gte: 4 } }, orderBy: { createdAt: 'desc' }, take: 3, include: { product: { select: { name: true, slug: true } } },
  });
  res.json(reviews.map((r) => ({ name: r.name, rating: r.rating, comment: r.comment, product: r.product })));
}));

app.get('/api/shipping-rates', ah(async (req, res) => {
  res.json(await prisma.shippingRate.findMany({ orderBy: { district: 'asc' }, select: { district: true, fee: true, codAvailable: true, estimatedDays: true } }));
}));

// ---------- Cart quote & checkout ----------

// Prices, stock, coupons and delivery are always recalculated on the server.
async function buildQuote(db, { items, couponCode, district, deliveryMethod = 'STANDARD' }) {
  if (!Array.isArray(items) || !items.length) throw fail('Your cart is empty.');
  if (items.length > 50) throw fail('Too many items in cart.');
  const settings = await getSettings(db);
  const ids = items.map((i) => Number(i.variantId)).filter(Number.isInteger);
  const variants = await db.productVariant.findMany({ where: { id: { in: ids } }, include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } } });

  const lines = []; const problems = [];
  for (const it of items) {
    const v = variants.find((x) => x.id === Number(it.variantId));
    const quantity = Math.max(1, Math.min(20, parseInt(it.quantity, 10) || 1));
    if (!v || v.product.status !== 'ACTIVE') { problems.push({ variantId: Number(it.variantId), message: 'An item in your cart is no longer available.' }); continue; }
    if (v.stock < quantity) problems.push({ variantId: v.id, message: v.stock ? `Only ${v.stock} left of ${v.product.name} (${v.colour}, ${v.size}).` : `${v.product.name} (${v.colour}, ${v.size}) is sold out.` });
    const unitPrice = effectivePrice(v.product);
    lines.push({
      variantId: v.id, productId: v.productId, productName: v.product.name, slug: v.product.slug, sku: v.sku,
      size: v.size, colour: v.colour, unitPrice, originalPrice: v.product.price, quantity, lineTotal: unitPrice * quantity,
      stock: v.stock, image: v.product.images[0]?.alt || 'Front',
    });
  }
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);

  let discount = 0; let coupon = null; let couponError = null;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase().slice(0, 40);
    const c = await db.coupon.findUnique({ where: { code } });
    const now = new Date();
    if (!c || !c.active) couponError = 'This promo code is not valid.';
    else if ((c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt < now)) couponError = 'This promo code has expired.';
    else if (c.maxUses != null && c.usedCount >= c.maxUses) couponError = 'This promo code has reached its usage limit.';
    else if (subtotal < c.minOrder) couponError = `Spend ${money(c.minOrder)} or more to use this code.`;
    else {
      coupon = { code: c.code, type: c.type, value: c.value, description: c.description };
      discount = c.type === 'PERCENT' ? Math.round((subtotal * Math.min(c.value, 100)) / 100) : Math.min(c.value, subtotal);
    }
  }

  let rate = null;
  if (district) rate = await db.shippingRate.findUnique({ where: { district: String(district) } });
  const freeOver = Number(settings.freeDeliveryThreshold) || 0;
  let deliveryFee;
  if (deliveryMethod === 'PICKUP') deliveryFee = 0;
  else {
    deliveryFee = rate ? rate.fee : Number(settings.flatDeliveryFee) || 0;
    if (freeOver && subtotal - discount >= freeOver) deliveryFee = 0;
    if (deliveryMethod === 'EXPRESS') deliveryFee += Number(settings.expressSurcharge) || 0;
  }
  const total = subtotal - discount + deliveryFee;
  const codMax = Number(settings.codMaxAmount) || 0;
  return {
    lines, problems, subtotal, discount, coupon, couponError, deliveryFee, total,
    district: rate?.district || null, estimatedDays: deliveryMethod === 'PICKUP' ? null : rate?.estimatedDays || '2-5',
    codAvailable: isOn(settings.codEnabled) && (rate ? rate.codAvailable : true) && (!codMax || total <= codMax),
    freeDeliveryThreshold: freeOver, amountToFreeDelivery: freeOver ? Math.max(0, freeOver - (subtotal - discount)) : null,
  };
}

app.post('/api/cart/quote', ah(async (req, res) => {
  if (!Array.isArray(req.body.items) || !req.body.items.length) return res.json({ lines: [], problems: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0 });
  res.json(await buildQuote(prisma, req.body));
}));

app.post('/api/orders', rateLimit(10, 60_000), ah(async (req, res) => {
  const b = req.body;
  const idempotencyKey = str(b.idempotencyKey, 64);
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) return res.json({ orderNumber: existing.orderNumber, accessToken: existing.accessToken });
  }
  const settings = await getSettings();
  const customer = {
    name: str(b.name, 100, { required: true, label: 'Name' }),
    email: email(b.email),
    phone: phone(b.phone),
    line1: str(b.line1, 200, { required: true, label: 'Address' }),
    line2: str(b.line2, 200),
    city: str(b.city, 80, { required: true, label: 'City' }),
    district: str(b.district, 40, { required: true, label: 'District' }),
    postalCode: str(b.postalCode, 12),
    notes: str(b.notes, 500),
  };
  const deliveryMethod = ['STANDARD', 'EXPRESS', 'PICKUP'].includes(b.deliveryMethod) ? b.deliveryMethod : 'STANDARD';
  if (deliveryMethod === 'PICKUP' && !isOn(settings.pickupEnabled)) throw fail('Store pickup is not available.');
  const paymentMethod = b.paymentMethod;
  if (!PAYMENT_METHODS[paymentMethod] || !isOn(settings[PAYMENT_METHODS[paymentMethod]])) throw fail('Please choose a valid payment method.');
  if (b.acceptTerms !== true) throw fail('Please accept the terms and privacy policy to place your order.');
  let billingAddress = null;
  if (b.billingDifferent) {
    billingAddress = JSON.stringify({
      name: str(b.billing?.name, 100, { required: true, label: 'Billing name' }),
      line1: str(b.billing?.line1, 200, { required: true, label: 'Billing address' }),
      city: str(b.billing?.city, 80, { required: true, label: 'Billing city' }),
      district: str(b.billing?.district, 40),
      postalCode: str(b.billing?.postalCode, 12),
    });
  }
  if (!(await prisma.shippingRate.findUnique({ where: { district: customer.district } }))) throw fail('Please choose a delivery district.');

  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(10, 99)}`;
  const accessToken = token();

  const order = await prisma.$transaction(async (tx) => {
    const q = await buildQuote(tx, { items: b.items, couponCode: b.couponCode, district: customer.district, deliveryMethod });
    if (q.problems.length) throw fail(q.problems[0].message, 409, { problems: q.problems });
    if (b.couponCode && q.couponError) throw fail(q.couponError, 409);
    if (paymentMethod === 'COD' && !q.codAvailable) throw fail('Cash on delivery is not available for this order.', 409);

    // Decrement stock only if enough is still available (prevents overselling)
    for (const l of q.lines) {
      const r = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (r.count === 0) throw fail(`Sorry, ${l.productName} (${l.colour}, ${l.size}) just sold out.`, 409);
      await tx.inventoryMovement.create({ data: { variantId: l.variantId, change: -l.quantity, reason: 'ORDER', note: orderNumber } });
      await tx.product.update({ where: { id: l.productId }, data: { soldCount: { increment: l.quantity } } });
    }
    if (q.coupon) await tx.coupon.update({ where: { code: q.coupon.code }, data: { usedCount: { increment: 1 } } });

    const status = paymentMethod === 'COD' ? 'RECEIVED' : 'PENDING_PAYMENT';
    return tx.order.create({
      data: {
        orderNumber, accessToken, idempotencyKey, userId: req.user?.id, ...customer, billingAddress, deliveryMethod,
        subtotal: q.subtotal, discount: q.discount, deliveryFee: q.deliveryFee, total: q.total, couponCode: q.coupon?.code,
        paymentMethod, paymentStatus: 'PENDING', status, estimatedDays: q.estimatedDays,
        items: { create: q.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, productName: l.productName, sku: l.sku, size: l.size, colour: l.colour, unitPrice: l.unitPrice, quantity: l.quantity })) },
        history: { create: { status, note: 'Order placed' } },
        payments: { create: { method: paymentMethod, amount: q.total, status: 'PENDING' } },
        shipment: { create: {} },
      },
    });
  });

  if (b.newsletter) await prisma.newsletterSubscriber.upsert({ where: { email: customer.email }, update: {}, create: { email: customer.email } });
  notify(customer.email, `Order ${order.orderNumber} received`, `Thank you ${customer.name}. Total ${money(order.total)}. Payment: ${paymentMethod}.`);
  // CARD: redirect to the payment gateway's hosted checkout here (PayHere / WEBXPAY), then confirm via verified webhook.
  res.status(201).json({ orderNumber: order.orderNumber, accessToken });
}));

function orderView(o, settings) {
  return {
    orderNumber: o.orderNumber, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod, deliveryMethod: o.deliveryMethod, name: o.name, email: o.email, phone: o.phone,
    address: { line1: o.line1, line2: o.line2, city: o.city, district: o.district, postalCode: o.postalCode },
    subtotal: o.subtotal, discount: o.discount, deliveryFee: o.deliveryFee, total: o.total, couponCode: o.couponCode,
    estimatedDays: o.estimatedDays, notes: o.notes,
    items: o.items.map((i) => ({ productName: i.productName, sku: i.sku, size: i.size, colour: i.colour, unitPrice: i.unitPrice, quantity: i.quantity, slug: i.product?.slug })),
    history: (o.history || []).map((h) => ({ status: h.status, note: h.note, createdAt: h.createdAt })),
    shipment: o.shipment && { courier: o.shipment.courier, trackingNumber: o.shipment.trackingNumber, status: o.shipment.status, shippedAt: o.shipment.shippedAt },
    refunds: (o.refunds || []).map((r) => ({ amount: r.amount, reason: r.reason, status: r.status, createdAt: r.createdAt })),
    bank: o.paymentMethod === 'BANK_TRANSFER' && settings ? { bankName: settings.bankName, accountName: settings.bankAccountName, accountNumber: settings.bankAccountNumber, branch: settings.bankBranch } : null,
  };
}
const orderInclude = { items: { include: { product: { select: { slug: true } } } }, history: { orderBy: { createdAt: 'asc' } }, shipment: true, refunds: true };

// Confirmation page: needs the order's access token, or the logged-in owner
app.get('/api/orders/:orderNumber', ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { orderNumber: req.params.orderNumber }, include: orderInclude });
  const tokenOk = o && req.query.token && crypto.timingSafeEqual(Buffer.from(sha256(String(req.query.token))), Buffer.from(sha256(o.accessToken)));
  if (!o || !(tokenOk || (req.user && (req.user.id === o.userId || req.user.role !== 'CUSTOMER')))) throw fail('Order not found.', 404);
  res.json(orderView(o, await getSettings()));
}));

// Guest tracking: order number + email in the request body
app.post('/api/orders/track', rateLimit(10, 60_000), ah(async (req, res) => {
  const orderNumber = str(req.body.orderNumber, 40, { required: true, label: 'Order number' }).toUpperCase();
  const e = email(req.body.email);
  const o = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
  if (!o || o.email !== e) throw fail('We could not find an order with those details.', 404);
  res.json(orderView(o, await getSettings()));
}));

app.post('/api/newsletter', rateLimit(5, 60_000), ah(async (req, res) => {
  const e = email(req.body.email);
  if (req.body.consent !== true) throw fail('Please confirm you would like to receive emails from us.');
  await prisma.newsletterSubscriber.upsert({ where: { email: e }, update: { consent: true }, create: { email: e } });
  res.json({ ok: true, message: 'You are subscribed. Welcome!' });
}));

app.post('/api/contact', rateLimit(5, 60_000), ah(async (req, res) => {
  await prisma.contactMessage.create({
    data: {
      name: str(req.body.name, 100, { required: true, label: 'Name' }), email: email(req.body.email),
      phone: str(req.body.phone, 20), subject: str(req.body.subject, 120),
      message: str(req.body.message, 2000, { required: true, label: 'Message' }),
    },
  });
  res.status(201).json({ ok: true, message: 'Thanks for getting in touch. We will reply within one business day.' });
}));

// ---------- Auth ----------

app.post('/api/auth/register', rateLimit(5, 60_000), ah(async (req, res) => {
  const e = email(req.body.email);
  const name = str(req.body.name, 100, { required: true, label: 'Name' });
  const pw = password(req.body.password);
  if (await prisma.user.findUnique({ where: { email: e } })) throw fail('An account with this email already exists. Try logging in.', 409);
  const user = await prisma.user.create({ data: { email: e, name, phone: str(req.body.phone, 20), passwordHash: await bcrypt.hash(pw, 12), newsletter: req.body.newsletter === true } });
  await startSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', rateLimit(8, 60_000), ah(async (req, res) => {
  const e = email(req.body.email);
  const user = await prisma.user.findUnique({ where: { email: e } });
  const ok = user && user.active && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash));
  if (!ok) throw fail('Incorrect email or password.', 401);
  await startSession(res, user.id);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', ah(async (req, res) => {
  if (req.cookies.sid) await prisma.session.deleteMany({ where: { id: sha256(req.cookies.sid) } });
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) || null }));

app.post('/api/auth/forgot', rateLimit(3, 60_000), ah(async (req, res) => {
  const e = email(req.body.email);
  const user = await prisma.user.findUnique({ where: { email: e } });
  if (user) {
    const raw = token();
    await prisma.passwordReset.create({ data: { id: sha256(raw), userId: user.id, expiresAt: new Date(Date.now() + 3600e3) } });
    notify(e, 'Reset your password', `Open this link within 1 hour: ${req.protocol}://${req.get('host')}/reset-password?token=${raw}`);
  }
  // Same response either way so accounts can't be discovered
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
}));

app.post('/api/auth/reset', rateLimit(5, 60_000), ah(async (req, res) => {
  const pw = password(req.body.password);
  const r = await prisma.passwordReset.findUnique({ where: { id: sha256(String(req.body.token || '')) } });
  if (!r || r.usedAt || r.expiresAt < new Date()) throw fail('This reset link is invalid or has expired.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: r.userId }, data: { passwordHash: await bcrypt.hash(pw, 12) } }),
    prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: r.userId } }),
  ]);
  res.json({ ok: true, message: 'Password updated. You can now log in.' });
}));

// ---------- Customer account ----------

const account = express.Router();
account.use(requireAuth);

account.put('/profile', ah(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { name: str(req.body.name, 100, { required: true, label: 'Name' }), phone: str(req.body.phone, 20), newsletter: req.body.newsletter === true },
  });
  res.json({ user: publicUser(user) });
}));

account.put('/password', rateLimit(5, 60_000), ah(async (req, res) => {
  if (!(await bcrypt.compare(String(req.body.currentPassword || ''), req.user.passwordHash))) throw fail('Your current password is incorrect.');
  const pw = password(req.body.newPassword);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(pw, 12) } });
  // Sign out other devices
  await prisma.session.deleteMany({ where: { userId: req.user.id, NOT: { id: sha256(req.cookies.sid) } } });
  res.json({ ok: true, message: 'Password changed.' });
}));

function addressData(b) {
  return {
    label: str(b.label, 30) || 'Home', fullName: str(b.fullName, 100, { required: true, label: 'Full name' }), phone: phone(b.phone),
    line1: str(b.line1, 200, { required: true, label: 'Address' }), line2: str(b.line2, 200), city: str(b.city, 80, { required: true, label: 'City' }),
    district: str(b.district, 40, { required: true, label: 'District' }), postalCode: str(b.postalCode, 12), isDefault: b.isDefault === true,
  };
}
account.get('/addresses', ah(async (req, res) => {
  res.json(await prisma.address.findMany({ where: { userId: req.user.id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }));
}));
account.post('/addresses', ah(async (req, res) => {
  const data = addressData(req.body);
  if (data.isDefault) await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
  res.status(201).json(await prisma.address.create({ data: { ...data, userId: req.user.id } }));
}));
account.put('/addresses/:id', ah(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const data = addressData(req.body);
  if (!(await prisma.address.findFirst({ where: { id, userId: req.user.id } }))) throw fail('Address not found.', 404);
  if (data.isDefault) await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
  res.json(await prisma.address.update({ where: { id }, data }));
}));
account.delete('/addresses/:id', ah(async (req, res) => {
  await prisma.address.deleteMany({ where: { id: int(req.params.id, { min: 1 }), userId: req.user.id } });
  res.json({ ok: true });
}));

account.get('/orders', ah(async (req, res) => {
  const orders = await prisma.order.findMany({ where: { OR: [{ userId: req.user.id }, { email: req.user.email }] }, include: orderInclude, orderBy: { createdAt: 'desc' } });
  res.json(orders.map((o) => orderView(o)));
}));

account.post('/orders/:orderNumber/return', ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { orderNumber: req.params.orderNumber }, include: { refunds: true } });
  if (!o || (o.userId !== req.user.id && o.email !== req.user.email)) throw fail('Order not found.', 404);
  if (o.status !== 'DELIVERED') throw fail('Returns can be requested once the order is delivered.');
  if (o.refunds.some((r) => r.status === 'REQUESTED')) throw fail('A return request is already open for this order.');
  await prisma.refund.create({ data: { orderId: o.id, amount: o.total - o.deliveryFee, reason: str(req.body.reason, 500, { required: true, label: 'Reason' }) } });
  await prisma.orderStatusHistory.create({ data: { orderId: o.id, status: o.status, note: 'Customer requested a return', changedBy: req.user.email } });
  res.status(201).json({ ok: true, message: 'Return request sent. Our team will contact you shortly.' });
}));

account.get('/wishlist', ah(async (req, res) => {
  const items = await prisma.wishlistItem.findMany({ where: { userId: req.user.id }, select: { productId: true } });
  res.json(items.map((i) => i.productId));
}));
account.post('/wishlist', ah(async (req, res) => {
  const ids = (Array.isArray(req.body.productIds) ? req.body.productIds : [req.body.productId]).map(Number).filter(Number.isInteger).slice(0, 100);
  const existing = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
  for (const { id } of existing) {
    await prisma.wishlistItem.upsert({ where: { userId_productId: { userId: req.user.id, productId: id } }, update: {}, create: { userId: req.user.id, productId: id } });
  }
  res.json({ ok: true });
}));
account.delete('/wishlist/:productId', ah(async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.user.id, productId: int(req.params.productId, { min: 1 }) } });
  res.json({ ok: true });
}));

app.use('/api/account', account);

// ---------- Admin ----------

const admin = express.Router();
admin.use(requireStaff);

admin.get('/stats', ah(async (req, res) => {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const live = { status: { notIn: ['CANCELLED', 'RETURNED'] } };
  const settings = await getSettings();
  const low = Number(settings.lowStockThreshold) || 3;
  const [sales, today, totalOrders, pending, stock, lowStock, customers, best, recent, last14] = await Promise.all([
    prisma.order.aggregate({ where: live, _sum: { total: true } }),
    prisma.order.aggregate({ where: { ...live, createdAt: { gte: startToday } }, _sum: { total: true }, _count: true }),
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: ['PENDING_PAYMENT', 'RECEIVED'] } } }),
    prisma.productVariant.aggregate({ _sum: { stock: true } }),
    prisma.productVariant.findMany({ where: { stock: { lte: low } }, include: { product: { select: { name: true } } }, orderBy: { stock: 'asc' }, take: 10 }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.product.findMany({ orderBy: { soldCount: 'desc' }, take: 5, select: { id: true, name: true, soldCount: true, price: true, salePrice: true } }),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, orderNumber: true, name: true, total: true, status: true, paymentStatus: true, createdAt: true } }),
    prisma.order.findMany({ where: { ...live, createdAt: { gte: new Date(Date.now() - 14 * 864e5) } }, select: { total: true, createdAt: true } }),
  ]);
  const lowCount = await prisma.productVariant.count({ where: { stock: { lte: low } } });
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startToday.getTime() - i * 864e5);
    const next = d.getTime() + 864e5;
    days.push({ date: d.toISOString().slice(0, 10), total: last14.filter((o) => o.createdAt >= d && o.createdAt.getTime() < next).reduce((a, o) => a + o.total, 0) });
  }
  res.json({
    totalSales: sales._sum.total || 0, todaySales: today._sum.total || 0, todayOrders: today._count,
    totalOrders, pendingOrders: pending, unitsInStock: stock._sum.stock || 0, lowStockCount: lowCount,
    lowStock: lowStock.map((v) => ({ id: v.id, product: v.product.name, size: v.size, colour: v.colour, sku: v.sku, stock: v.stock })),
    totalCustomers: customers, bestSellers: best, recentOrders: recent, salesByDay: days,
  });
}));

// Products
admin.get('/products', ah(async (req, res) => {
  const products = await prisma.product.findMany({ include: { category: true, variants: true, images: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  res.json(products.map((p) => ({ ...p, totalStock: p.variants.reduce((a, v) => a + v.stock, 0) })));
}));
admin.get('/products/:id', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: int(req.params.id, { min: 1 }) }, include: { variants: { orderBy: { id: 'asc' } }, images: { orderBy: { sortOrder: 'asc' } } } });
  if (!p) throw fail('Product not found.', 404);
  res.json(p);
}));

function productData(b) {
  const name = str(b.name, 150, { required: true, label: 'Product name' });
  const price = int(b.price, { min: 1, label: 'Price', required: true });
  const salePrice = int(b.salePrice, { min: 1, label: 'Sale price' });
  if (salePrice != null && salePrice >= price) throw fail('Sale price must be lower than the regular price.');
  return {
    name, price, salePrice,
    slug: slugify(str(b.slug, 160) || name),
    sku: str(b.sku, 40, { required: true, label: 'SKU' }).toUpperCase(),
    description: str(b.description, 5000, { required: true, label: 'Description' }),
    material: str(b.material, 200), care: str(b.care, 1000),
    status: b.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    featured: b.featured === true,
    categoryId: int(b.categoryId, { min: 1, label: 'Category' }),
  };
}
function variantList(b) {
  if (!Array.isArray(b.variants) || !b.variants.length) throw fail('Add at least one size / colour variant.');
  const seen = new Set();
  return b.variants.map((v) => {
    const size = str(v.size, 20, { required: true, label: 'Variant size' });
    const colour = str(v.colour, 40, { required: true, label: 'Variant colour' });
    const key = `${size}|${colour}`.toLowerCase();
    if (seen.has(key)) throw fail(`Duplicate variant: ${colour} / ${size}.`);
    seen.add(key);
    const hex = str(v.colourHex, 7);
    return { id: int(v.id, { min: 1 }), size, colour, colourHex: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null, sku: str(v.sku, 60, { required: true, label: 'Variant SKU' }).toUpperCase(), stock: int(v.stock, { min: 0, max: 100000, label: 'Stock', required: true }) };
  });
}
function imageList(b) {
  const imgs = Array.isArray(b.images) && b.images.length ? b.images : [{ alt: 'Front' }];
  return imgs.slice(0, 10).map((i, idx) => ({ alt: str(i.alt, 60) || `Image ${idx + 1}`, url: null, sortOrder: idx }));
}

admin.post('/products', ah(async (req, res) => {
  const data = productData(req.body);
  const variants = variantList(req.body);
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...data, images: { create: imageList(req.body) }, variants: { create: variants.map(({ id, ...v }) => v) } }, include: { variants: true } });
    for (const v of p.variants) if (v.stock) await tx.inventoryMovement.create({ data: { variantId: v.id, change: v.stock, reason: 'RESTOCK', note: 'Initial stock' } });
    return p;
  });
  res.status(201).json(product);
}));

admin.put('/products/:id', ah(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const data = productData(req.body);
  const variants = variantList(req.body);
  const product = await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id }, include: { variants: true } });
    if (!current) throw fail('Product not found.', 404);
    await tx.product.update({ where: { id }, data });
    await tx.productImage.deleteMany({ where: { productId: id } });
    await tx.productImage.createMany({ data: imageList(req.body).map((i) => ({ ...i, productId: id })) });
    const keepIds = variants.filter((v) => v.id).map((v) => v.id);
    await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keepIds } } });
    for (const { id: vid, ...v } of variants) {
      const before = current.variants.find((x) => x.id === vid);
      if (before) {
        await tx.productVariant.update({ where: { id: vid }, data: v });
        if (before.stock !== v.stock) await tx.inventoryMovement.create({ data: { variantId: vid, change: v.stock - before.stock, reason: 'ADJUSTMENT', note: `Product edit by ${req.user.email}` } });
      } else {
        const nv = await tx.productVariant.create({ data: { ...v, productId: id } });
        if (v.stock) await tx.inventoryMovement.create({ data: { variantId: nv.id, change: v.stock, reason: 'RESTOCK', note: 'New variant' } });
      }
    }
    return tx.product.findUnique({ where: { id }, include: { variants: true, images: true } });
  });
  res.json(product);
}));

admin.delete('/products/:id', requireAdmin, ah(async (req, res) => {
  await prisma.product.delete({ where: { id: int(req.params.id, { min: 1 }) } });
  res.json({ ok: true });
}));

// Categories
admin.get('/categories', ah(async (req, res) => {
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } });
  res.json(cats);
}));
function categoryData(b) {
  const name = str(b.name, 80, { required: true, label: 'Category name' });
  return { name, slug: slugify(str(b.slug, 80) || name), description: str(b.description, 500), sortOrder: int(b.sortOrder, { min: 0, max: 999 }) || 0 };
}
admin.post('/categories', ah(async (req, res) => res.status(201).json(await prisma.category.create({ data: categoryData(req.body) }))));
admin.put('/categories/:id', ah(async (req, res) => res.json(await prisma.category.update({ where: { id: int(req.params.id, { min: 1 }) }, data: categoryData(req.body) }))));
admin.delete('/categories/:id', requireAdmin, ah(async (req, res) => {
  await prisma.category.delete({ where: { id: int(req.params.id, { min: 1 }) } });
  res.json({ ok: true });
}));

// Inventory
admin.get('/inventory', ah(async (req, res) => {
  const settings = await getSettings();
  const variants = await prisma.productVariant.findMany({ include: { product: { select: { id: true, name: true, status: true } } }, orderBy: [{ productId: 'asc' }, { colour: 'asc' }, { size: 'asc' }] });
  const movements = await prisma.inventoryMovement.findMany({ take: 30, orderBy: { createdAt: 'desc' }, include: { variant: { include: { product: { select: { name: true } } } } } });
  res.json({ lowStockThreshold: Number(settings.lowStockThreshold) || 3, variants, movements });
}));
admin.post('/inventory/:variantId/adjust', ah(async (req, res) => {
  const variantId = int(req.params.variantId, { min: 1 });
  const change = int(req.body.change, { min: -100000, max: 100000, label: 'Change', required: true });
  if (change === 0) throw fail('Enter a non-zero change.');
  const reason = ['RESTOCK', 'ADJUSTMENT', 'RETURN'].includes(req.body.reason) ? req.body.reason : 'ADJUSTMENT';
  const v = await prisma.$transaction(async (tx) => {
    const cur = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!cur) throw fail('Variant not found.', 404);
    if (cur.stock + change < 0) throw fail('Stock cannot go below zero.');
    await tx.inventoryMovement.create({ data: { variantId, change, reason, note: str(req.body.note, 200) || `By ${req.user.email}` } });
    return tx.productVariant.update({ where: { id: variantId }, data: { stock: { increment: change } } });
  });
  res.json(v);
}));

// Orders
admin.get('/orders', ah(async (req, res) => {
  const where = {};
  if (req.query.status && ORDER_STATUSES.includes(req.query.status)) where.status = req.query.status;
  if (req.query.paymentStatus && PAYMENT_STATUSES.includes(req.query.paymentStatus)) where.paymentStatus = req.query.paymentStatus;
  if (req.query.q) {
    const t = String(req.query.q).slice(0, 80);
    where.OR = [{ orderNumber: { contains: t } }, { name: { contains: t } }, { email: { contains: t } }, { phone: { contains: t } }];
  }
  res.json(await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, include: { _count: { select: { items: true } } }, take: 200 }));
}));
admin.get('/orders/:id', ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: int(req.params.id, { min: 1 }) }, include: { items: true, history: { orderBy: { createdAt: 'asc' } }, payments: true, refunds: true, shipment: true, user: { select: { id: true, name: true, email: true } } } });
  if (!o) throw fail('Order not found.', 404);
  res.json(o);
}));

async function restock(tx, order, reason) {
  for (const i of order.items) {
    if (!i.variantId) continue;
    await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
    await tx.inventoryMovement.create({ data: { variantId: i.variantId, change: i.quantity, reason, note: order.orderNumber } });
    if (i.productId) await tx.product.update({ where: { id: i.productId }, data: { soldCount: { decrement: i.quantity } } });
  }
}

admin.patch('/orders/:id/status', ah(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const status = req.body.status;
  if (!ORDER_STATUSES.includes(status)) throw fail('Invalid order status.');
  const note = str(req.body.note, 300);
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id }, include: { items: true, shipment: true } });
    if (!o) throw fail('Order not found.', 404);
    if (o.status === status) throw fail('The order already has this status.');
    const wasClosed = ['CANCELLED', 'RETURNED'].includes(o.status);
    const closing = ['CANCELLED', 'RETURNED'].includes(status);
    if (wasClosed && !closing) throw fail('Cancelled or returned orders cannot be reopened.');
    if (closing && !wasClosed) await restock(tx, o, status === 'CANCELLED' ? 'CANCEL' : 'RETURN');
    const data = { status };
    if (status === 'DELIVERED' && o.paymentMethod === 'COD' && o.paymentStatus === 'PENDING') {
      data.paymentStatus = 'PAID';
      await tx.payment.updateMany({ where: { orderId: id, method: 'COD' }, data: { status: 'PAID', note: 'Cash collected on delivery' } });
    }
    const shipData = status === 'SHIPPED' ? { status: 'SHIPPED', shippedAt: new Date() } : status === 'DELIVERED' ? { status: 'DELIVERED', deliveredAt: new Date() } : status === 'RETURNED' ? { status: 'RETURNED' } : null;
    if (shipData) await tx.shipment.upsert({ where: { orderId: id }, update: shipData, create: { orderId: id, ...shipData } });
    await tx.orderStatusHistory.create({ data: { orderId: id, status, note, changedBy: req.user.email } });
    return tx.order.update({ where: { id }, data, include: { shipment: true } });
  });
  if (status === 'SHIPPED') notify(updated.email, `Order ${updated.orderNumber} has been dispatched`, `Courier: ${updated.shipment?.courier || '-'}, tracking: ${updated.shipment?.trackingNumber || '-'}`);
  else notify(updated.email, `Order ${updated.orderNumber} update`, `Your order status is now ${status.replace(/_/g, ' ').toLowerCase()}.`);
  res.json(updated);
}));

admin.patch('/orders/:id/payment', ah(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const paymentStatus = req.body.paymentStatus;
  if (!PAYMENT_STATUSES.includes(paymentStatus)) throw fail('Invalid payment status.');
  const reference = str(req.body.reference, 100);
  const o = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw fail('Order not found.', 404);
    const pay = await tx.payment.findFirst({ where: { orderId: id }, orderBy: { createdAt: 'desc' } });
    const payStatus = ['PAID', 'FAILED', 'PENDING'].includes(paymentStatus) ? paymentStatus : pay?.status;
    if (pay) await tx.payment.update({ where: { id: pay.id }, data: { status: payStatus, reference: reference || pay.reference } });
    const data = { paymentStatus };
    if (paymentStatus === 'PAID' && order.status === 'PENDING_PAYMENT') {
      data.status = 'CONFIRMED';
      await tx.orderStatusHistory.create({ data: { orderId: id, status: 'CONFIRMED', note: 'Payment received', changedBy: req.user.email } });
    }
    return tx.order.update({ where: { id }, data });
  });
  res.json(o);
}));

admin.patch('/orders/:id/shipment', ah(async (req, res) => {
  const orderId = int(req.params.id, { min: 1 });
  const data = { courier: str(req.body.courier, 60), trackingNumber: str(req.body.trackingNumber, 60), note: str(req.body.note, 300) };
  if (req.body.status === 'FAILED') data.status = 'FAILED';
  res.json(await prisma.shipment.upsert({ where: { orderId }, update: data, create: { orderId, ...data } }));
}));

admin.post('/orders/:id/refunds', ah(async (req, res) => {
  const orderId = int(req.params.id, { min: 1 });
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o) throw fail('Order not found.', 404);
  const amount = int(req.body.amount, { min: 1, max: o.total, label: 'Refund amount', required: true });
  res.status(201).json(await prisma.refund.create({ data: { orderId, amount, reason: str(req.body.reason, 500, { required: true, label: 'Reason' }), status: 'APPROVED' } }));
}));

admin.patch('/refunds/:id', ah(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!REFUND_STATUSES.includes(req.body.status)) throw fail('Invalid refund status.');
  const refund = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.update({ where: { id }, data: { status: req.body.status }, include: { order: { include: { refunds: true } } } });
    if (r.status === 'PROCESSED') {
      const refunded = r.order.refunds.filter((x) => x.status === 'PROCESSED').reduce((a, x) => a + x.amount, 0);
      await tx.order.update({ where: { id: r.orderId }, data: { paymentStatus: refunded >= r.order.total ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      await tx.orderStatusHistory.create({ data: { orderId: r.orderId, status: r.order.status, note: `Refund of ${money(r.amount)} processed`, changedBy: req.user.email } });
    }
    return r;
  });
  res.json(refund);
}));

// Payments overview
admin.get('/payments', ah(async (req, res) => {
  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { order: { select: { id: true, orderNumber: true, name: true } } } }),
    prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, include: { order: { select: { id: true, orderNumber: true, name: true } } } }),
  ]);
  res.json({ payments, refunds });
}));

// Customers
admin.get('/customers', ah(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER' }, orderBy: { createdAt: 'desc' },
    include: { addresses: true, orders: { select: { id: true, orderNumber: true, total: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
  });
  res.json(users.map((u) => ({ ...publicUser(u), active: u.active, createdAt: u.createdAt, addresses: u.addresses, orders: u.orders, totalSpent: u.orders.filter((o) => !['CANCELLED', 'RETURNED'].includes(o.status)).reduce((a, o) => a + o.total, 0) })));
}));
admin.patch('/customers/:id', requireAdmin, ah(async (req, res) => {
  const u = await prisma.user.update({ where: { id: int(req.params.id, { min: 1 }) }, data: { active: req.body.active === true } });
  if (!u.active) await prisma.session.deleteMany({ where: { userId: u.id } });
  res.json(publicUser(u));
}));

// Coupons
function couponData(b) {
  const type = b.type === 'FIXED' ? 'FIXED' : 'PERCENT';
  const value = int(b.value, { min: 1, max: type === 'PERCENT' ? 100 : 1_000_000, label: 'Discount value', required: true });
  const date = (v) => (v ? new Date(v) : null);
  return {
    code: str(b.code, 40, { required: true, label: 'Code' }).toUpperCase().replace(/\s+/g, ''), description: str(b.description, 200), type, value,
    minOrder: int(b.minOrder, { min: 0, label: 'Minimum order' }) || 0, maxUses: int(b.maxUses, { min: 1, label: 'Max uses' }),
    startsAt: date(b.startsAt), endsAt: date(b.endsAt), active: b.active !== false,
  };
}
admin.get('/coupons', ah(async (req, res) => res.json(await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }))));
admin.post('/coupons', ah(async (req, res) => res.status(201).json(await prisma.coupon.create({ data: couponData(req.body) }))));
admin.put('/coupons/:id', ah(async (req, res) => res.json(await prisma.coupon.update({ where: { id: int(req.params.id, { min: 1 }) }, data: couponData(req.body) }))));
admin.delete('/coupons/:id', ah(async (req, res) => { await prisma.coupon.delete({ where: { id: int(req.params.id, { min: 1 }) } }); res.json({ ok: true }); }));

// Shipping rates
admin.get('/shipping-rates', ah(async (req, res) => res.json(await prisma.shippingRate.findMany({ orderBy: { district: 'asc' } }))));
admin.put('/shipping-rates/:id', ah(async (req, res) => {
  res.json(await prisma.shippingRate.update({
    where: { id: int(req.params.id, { min: 1 }) },
    data: { fee: int(req.body.fee, { min: 0, max: 100000, label: 'Fee', required: true }), codAvailable: req.body.codAvailable === true, estimatedDays: str(req.body.estimatedDays, 20) || '2-4' },
  }));
}));

// Reviews
admin.get('/reviews', ah(async (req, res) => res.json(await prisma.review.findMany({ orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true, slug: true } } } }))));
admin.patch('/reviews/:id', ah(async (req, res) => res.json(await prisma.review.update({ where: { id: int(req.params.id, { min: 1 }) }, data: { approved: req.body.approved === true } }))));
admin.delete('/reviews/:id', ah(async (req, res) => { await prisma.review.delete({ where: { id: int(req.params.id, { min: 1 }) } }); res.json({ ok: true }); }));

// Reports
admin.get('/reports', ah(async (req, res) => {
  const days = Math.min(365, int(req.query.days, { min: 1, max: 365 }) || 30);
  const since = new Date(Date.now() - days * 864e5);
  const orders = await prisma.order.findMany({ where: { createdAt: { gte: since } }, include: { items: { include: { product: { include: { category: true } } } } } });
  const live = orders.filter((o) => !['CANCELLED', 'RETURNED'].includes(o.status));
  const group = (arr, keyFn, valFn) => Object.entries(arr.reduce((m, x) => { const k = keyFn(x); m[k] = (m[k] || 0) + valFn(x); return m; }, {})).map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
  const items = live.flatMap((o) => o.items);
  res.json({
    days, revenue: live.reduce((a, o) => a + o.total, 0), orders: orders.length, liveOrders: live.length,
    averageOrder: live.length ? Math.round(live.reduce((a, o) => a + o.total, 0) / live.length) : 0,
    unitsSold: items.reduce((a, i) => a + i.quantity, 0), discounts: live.reduce((a, o) => a + o.discount, 0),
    byStatus: group(orders, (o) => o.status, () => 1),
    byPayment: group(live, (o) => o.paymentMethod, (o) => o.total),
    byDistrict: group(live, (o) => o.district, (o) => o.total).slice(0, 10),
    byCategory: group(items, (i) => i.product?.category?.name || 'Uncategorised', (i) => i.unitPrice * i.quantity),
    topProducts: group(items, (i) => i.productName, (i) => i.quantity).slice(0, 10),
  });
}));

// Website content: messages & subscribers
admin.get('/messages', ah(async (req, res) => res.json(await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } }))));
admin.patch('/messages/:id', ah(async (req, res) => res.json(await prisma.contactMessage.update({ where: { id: int(req.params.id, { min: 1 }) }, data: { handled: req.body.handled === true } }))));
admin.get('/subscribers', ah(async (req, res) => res.json(await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' } }))));

// Settings (content settings editable by staff; store/payment settings admin-only)
const CONTENT_KEYS = ['announcement', 'heroTitle', 'heroSubtitle', 'heroCta', 'promoTitle', 'promoText', 'aboutStory', 'aboutMission', 'tagline'];
admin.get('/settings', ah(async (req, res) => res.json(await getSettings())));
admin.put('/settings', ah(async (req, res) => {
  const allowed = req.user.role === 'ADMIN' ? null : CONTENT_KEYS;
  const entries = Object.entries(req.body || {}).filter(([k]) => /^[a-zA-Z]{2,40}$/.test(k) && (!allowed || allowed.includes(k)));
  if (!allowed) {
    const existing = new Set(Object.keys(await getSettings()));
    for (const [k] of entries) if (!existing.has(k)) throw fail(`Unknown setting: ${k}`);
  }
  await prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value: String(value).slice(0, 2000) }, create: { key, value: String(value).slice(0, 2000) } })));
  res.json(await getSettings());
}));

// Staff & roles
admin.get('/staff', requireAdmin, ah(async (req, res) => {
  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'STAFF'] } }, orderBy: { createdAt: 'asc' } });
  res.json(staff.map((u) => ({ ...publicUser(u), active: u.active, createdAt: u.createdAt })));
}));
admin.post('/staff', requireAdmin, ah(async (req, res) => {
  const e = email(req.body.email);
  const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'STAFF';
  const existing = await prisma.user.findUnique({ where: { email: e } });
  let user;
  if (existing) user = await prisma.user.update({ where: { id: existing.id }, data: { role } });
  else user = await prisma.user.create({ data: { email: e, role, name: str(req.body.name, 100, { required: true, label: 'Name' }), passwordHash: await bcrypt.hash(password(req.body.password), 12) } });
  res.status(201).json(publicUser(user));
}));
admin.patch('/staff/:id', requireAdmin, ah(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (id === req.user.id) throw fail('You cannot change your own role or access.');
  const data = {};
  if (['ADMIN', 'STAFF', 'CUSTOMER'].includes(req.body.role)) data.role = req.body.role;
  if (typeof req.body.active === 'boolean') data.active = req.body.active;
  const u = await prisma.user.update({ where: { id }, data });
  if (!u.active || u.role === 'CUSTOMER') await prisma.session.deleteMany({ where: { userId: id } });
  res.json(publicUser(u));
}));

app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- Pages ----------

const PAGES = {
  '/': 'index.html', '/shop': 'shop.html', '/new-arrivals': 'shop.html', '/sale': 'shop.html', '/search': 'shop.html',
  '/cart': 'cart.html', '/checkout': 'checkout.html', '/order-confirmation': 'order-confirmation.html', '/track-order': 'track-order.html',
  '/account': 'account.html', '/reset-password': 'account.html', '/wishlist': 'wishlist.html', '/about': 'about.html',
  '/contact': 'contact.html', '/faq': 'faq.html', '/shipping': 'shipping.html', '/returns': 'returns.html',
  '/privacy-policy': 'privacy-policy.html', '/terms': 'terms.html', '/admin': 'admin/index.html',
};
// Pages are sent with the store name filled into the <title> so the tab never shows the {store} placeholder.
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function sendPage(file, status = 200) {
  return ah(async (req, res) => {
    const [html, s] = await Promise.all([fs.readFile(path.join(PUBLIC, file), 'utf8'), getSettings()]);
    res.status(status).type('html').send(html.replaceAll('{store}', escHtml(s.storeName || 'Store')));
  });
}
for (const [route, file] of Object.entries(PAGES)) app.get(route, sendPage(file));
app.get('/product/:slug', sendPage('product.html'));
app.use(express.static(PUBLIC, { index: false }));
app.use(sendPage('404.html', 404));

// ---------- Errors ----------

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.details });
  if (err.code === 'P2002') return res.status(409).json({ error: `That ${err.meta?.target?.join?.(', ') || 'value'} is already in use.` });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
  if (err.code === 'P2003') return res.status(409).json({ error: 'This record is linked to other data and cannot be removed.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => console.log(`Store running at http://localhost:${PORT}  (admin: /admin)`));
