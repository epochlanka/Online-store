// Seeds the database with demo categories, products, shipping rates and an admin account.
// Run with: npm run db:seed
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Demo login accounts (change these before going live)
const ADMIN = { email: 'admin@store.local', password: 'Admin@12345', name: 'Store Admin' };
const STAFF = { email: 'staff@store.local', password: 'Staff@12345', name: 'Store Staff' };
const CUSTOMER = { email: 'customer@store.local', password: 'Customer@12345', name: 'Nimali Perera' };

const DISTRICTS = [
  ['Colombo', 350, '1-2'], ['Gampaha', 400, '1-3'], ['Kalutara', 400, '2-3'],
  ['Kandy', 450, '2-3'], ['Matale', 450, '2-4'], ['Nuwara Eliya', 500, '3-4'],
  ['Galle', 450, '2-3'], ['Matara', 450, '2-3'], ['Hambantota', 500, '3-4'],
  ['Jaffna', 550, '3-5'], ['Kilinochchi', 550, '3-5'], ['Mannar', 550, '3-5'],
  ['Vavuniya', 550, '3-5'], ['Mullaitivu', 550, '3-5'], ['Batticaloa', 550, '3-5'],
  ['Ampara', 550, '3-5'], ['Trincomalee', 550, '3-5'], ['Kurunegala', 450, '2-3'],
  ['Puttalam', 450, '2-4'], ['Anuradhapura', 500, '3-4'], ['Polonnaruwa', 500, '3-4'],
  ['Badulla', 500, '3-4'], ['Monaragala', 550, '3-5'], ['Ratnapura', 450, '2-4'],
  ['Kegalle', 450, '2-3'],
];

const SETTINGS = {
  storeName: 'MAISON',
  tagline: 'Modern essentials, made for the island.',
  email: 'hello@maison.lk',
  phone: '+94 77 123 4567',
  whatsapp: '94771234567',
  address: 'No. 12, Flower Road, Colombo 07, Sri Lanka',
  openingHours: 'Mon - Sat: 10.00 am - 7.00 pm, Sunday: closed',
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  tiktok: 'https://tiktok.com/',
  announcement: 'Free islandwide delivery on orders over Rs. 10,000',
  heroTitle: 'The New Season Edit',
  heroSubtitle: 'Relaxed silhouettes in breathable fabrics, designed for everyday island life.',
  heroCta: 'Shop the collection',
  promoTitle: 'Mid-Season Sale',
  promoText: 'Up to 30% off selected styles. While stocks last.',
  aboutStory: 'Founded in Colombo, we create considered everyday clothing using breathable fabrics suited to the tropical climate. Every piece is designed to be worn often and kept for years.',
  aboutMission: 'To make well-made, comfortable clothing accessible to everyone in Sri Lanka - with honest pricing and dependable service.',
  currency: 'LKR',
  flatDeliveryFee: '450',
  freeDeliveryThreshold: '10000',
  expressSurcharge: '300',
  pickupEnabled: 'true',
  codEnabled: 'true',
  codMaxAmount: '50000',
  bankTransferEnabled: 'true',
  cardEnabled: 'true',
  bankName: 'Commercial Bank',
  bankAccountName: 'Maison Clothing (Pvt) Ltd',
  bankAccountNumber: '1234 5678 9012',
  bankBranch: 'Colombo 07',
  lowStockThreshold: '3',
  taxRate: '0',
};

const CATEGORIES = [
  { name: 'Women', slug: 'women', description: 'Dresses, tops and everyday staples.', sortOrder: 1 },
  { name: 'Men', slug: 'men', description: 'Shirts, tees and trousers.', sortOrder: 2 },
  { name: 'Kids', slug: 'kids', description: 'Comfortable clothing for little ones.', sortOrder: 3 },
  { name: 'Accessories', slug: 'accessories', description: 'Bags, caps and finishing touches.', sortOrder: 4 },
];

const COLOURS = {
  Black: '#1a1a1a', White: '#f5f5f2', Beige: '#d9c7a7', Navy: '#1f2a44', Olive: '#6b6b3a',
  Sage: '#a3b19b', Terracotta: '#b5562f', Grey: '#9a9a9a', Cream: '#efe6d2', Blue: '#4a6fa5',
};

const PRODUCTS = [
  ['Oversized Cotton T-Shirt', 'TSH-001', 'men', 3500, 2990, ['S', 'M', 'L', 'XL'], ['Black', 'White', 'Beige'], '100% cotton', true],
  ['Linen Relaxed Shirt', 'SHT-002', 'men', 5900, null, ['S', 'M', 'L', 'XL'], ['White', 'Sage', 'Navy'], '100% linen', true],
  ['Tailored Chino Trousers', 'TRS-003', 'men', 6500, null, ['30', '32', '34', '36'], ['Beige', 'Navy', 'Olive'], '98% cotton, 2% elastane', false],
  ['Classic Polo', 'POL-004', 'men', 4200, 3600, ['S', 'M', 'L', 'XL'], ['Navy', 'White', 'Olive'], 'Cotton pique', false],
  ['Everyday Shorts', 'SHO-005', 'men', 3800, null, ['S', 'M', 'L', 'XL'], ['Beige', 'Black'], 'Cotton twill', false],
  ['Wrap Midi Dress', 'DRS-006', 'women', 7900, 6500, ['XS', 'S', 'M', 'L'], ['Terracotta', 'Black', 'Sage'], 'Viscose crepe', true],
  ['Linen Co-ord Set', 'SET-007', 'women', 9500, null, ['XS', 'S', 'M', 'L'], ['Cream', 'Sage'], '100% linen', true],
  ['Ribbed Knit Top', 'TOP-008', 'women', 3200, null, ['XS', 'S', 'M', 'L'], ['Black', 'Cream', 'Terracotta'], 'Cotton blend rib', false],
  ['Wide-Leg Trousers', 'TRS-009', 'women', 5800, 4900, ['XS', 'S', 'M', 'L'], ['Black', 'Beige'], 'Crepe', false],
  ['Tiered Maxi Skirt', 'SKT-010', 'women', 5200, null, ['XS', 'S', 'M', 'L'], ['White', 'Terracotta'], 'Cotton voile', true],
  ['Batik Print Blouse', 'BLS-011', 'women', 4800, null, ['XS', 'S', 'M', 'L'], ['Blue', 'Terracotta'], 'Cotton batik', false],
  ['Kids Graphic Tee', 'KTS-012', 'kids', 1900, null, ['2-3Y', '4-5Y', '6-7Y', '8-9Y'], ['White', 'Blue'], '100% cotton', false],
  ['Kids Cotton Dress', 'KDR-013', 'kids', 2900, 2400, ['2-3Y', '4-5Y', '6-7Y', '8-9Y'], ['Cream', 'Sage'], '100% cotton', false],
  ['Canvas Tote Bag', 'BAG-014', 'accessories', 2500, null, ['One Size'], ['Beige', 'Black'], 'Heavy canvas', false],
  ['Cotton Bucket Hat', 'HAT-015', 'accessories', 1800, null, ['One Size'], ['Beige', 'Olive', 'Black'], 'Cotton twill', false],
  ['Woven Belt', 'BLT-016', 'accessories', 2200, 1800, ['S/M', 'L/XL'], ['Black', 'Beige'], 'Woven cotton, metal buckle', false],
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  console.log('Clearing existing data...');
  // Children first so foreign keys don't block deletes
  for (const model of [
    'inventoryMovement', 'orderStatusHistory', 'payment', 'refund', 'shipment', 'orderItem', 'order',
    'review', 'wishlistItem', 'productImage', 'productVariant', 'product', 'category',
    'address', 'session', 'passwordReset', 'user', 'coupon', 'shippingRate', 'setting',
    'newsletterSubscriber', 'contactMessage',
  ]) {
    await prisma[model].deleteMany();
  }

  console.log('Creating settings, shipping rates and coupons...');
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.create({ data: { key, value } });
  }
  for (const [district, fee, estimatedDays] of DISTRICTS) {
    await prisma.shippingRate.create({ data: { district, fee, estimatedDays, codAvailable: true } });
  }
  await prisma.coupon.createMany({
    data: [
      { code: 'WELCOME10', description: '10% off your first order', type: 'PERCENT', value: 10, minOrder: 3000 },
      { code: 'SAVE500', description: 'Rs. 500 off orders over Rs. 7,500', type: 'FIXED', value: 500, minOrder: 7500 },
    ],
  });

  console.log('Creating users...');
  const hash = (p) => bcrypt.hash(p, 10);
  await prisma.user.create({ data: { email: ADMIN.email, name: ADMIN.name, role: 'ADMIN', passwordHash: await hash(ADMIN.password) } });
  await prisma.user.create({ data: { email: STAFF.email, name: STAFF.name, role: 'STAFF', passwordHash: await hash(STAFF.password) } });
  const customer = await prisma.user.create({
    data: {
      email: CUSTOMER.email, name: CUSTOMER.name, phone: '0771234567', passwordHash: await hash(CUSTOMER.password),
      addresses: { create: { label: 'Home', fullName: CUSTOMER.name, phone: '0771234567', line1: '45 Galle Road', city: 'Dehiwala', district: 'Colombo', postalCode: '10350', isDefault: true } },
    },
  });

  console.log('Creating categories and products...');
  const cats = {};
  for (const c of CATEGORIES) cats[c.slug] = await prisma.category.create({ data: c });

  const created = [];
  let dayOffset = 0;
  for (const [name, sku, cat, price, salePrice, sizes, colours, material, featured] of PRODUCTS) {
    const variants = [];
    for (const colour of colours) {
      for (const size of sizes) {
        // Varied stock so some sizes show as low / sold out
        const stock = (sku.charCodeAt(5) * 7 + size.charCodeAt(0) * 3 + colour.length * 5) % 25;
        variants.push({ size, colour, colourHex: COLOURS[colour], sku: `${sku}-${colour.slice(0, 3).toUpperCase()}-${size.replace(/[^A-Z0-9]/gi, '')}`, stock });
      }
    }
    const product = await prisma.product.create({
      data: {
        name, sku, slug: slugify(name), price, salePrice, material, featured,
        status: 'ACTIVE',
        description: `${name} - a versatile wardrobe essential cut for comfort in warm weather. Easy to dress up or down, and designed to last wash after wash.`,
        care: 'Machine wash cold with similar colours. Do not bleach. Line dry in shade. Warm iron if needed.',
        categoryId: cats[cat].id,
        soldCount: (price % 37) + (featured ? 20 : 0),
        createdAt: new Date(Date.now() - dayOffset++ * 3 * 864e5),
        images: { create: ['Front', 'Back', 'Detail', 'On model'].map((alt, i) => ({ alt, sortOrder: i })) },
        variants: { create: variants },
      },
      include: { variants: true },
    });
    created.push(product);
  }

  console.log('Creating reviews...');
  const reviewTexts = [
    ['Ayesha', 5, 'Beautiful quality and fits true to size. Delivery to Kandy took just two days.'],
    ['Kasun', 4, 'Very comfortable fabric for the heat. Would love more colours.'],
    ['Dilini', 5, 'Exactly like the photos. Lovely packaging and quick COD delivery.'],
    ['Ravi', 5, 'Great value for the price. Already ordered a second one.'],
  ];
  for (let i = 0; i < 8; i++) {
    const [rname, rating, comment] = reviewTexts[i % reviewTexts.length];
    await prisma.review.create({ data: { productId: created[i].id, name: rname, rating, comment, approved: i < 6 } });
  }

  console.log('Creating sample orders...');
  const statuses = ['DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED', 'RECEIVED', 'PENDING_PAYMENT', 'DELIVERED', 'CANCELLED'];
  for (let i = 0; i < statuses.length; i++) {
    const p = created[i * 2 % created.length];
    const v = p.variants.find((x) => x.stock > 0) || p.variants[0];
    const unit = p.salePrice || p.price;
    const qty = (i % 2) + 1;
    const subtotal = unit * qty;
    const deliveryFee = subtotal >= 10000 ? 0 : 400;
    const status = statuses[i];
    const method = status === 'PENDING_PAYMENT' ? 'BANK_TRANSFER' : i % 3 === 0 ? 'CARD' : 'COD';
    const paid = method === 'CARD' || status === 'DELIVERED';
    const createdAt = new Date(Date.now() - (statuses.length - i) * 864e5 * 1.5);
    await prisma.order.create({
      data: {
        orderNumber: `ORD-1000${i + 1}`,
        accessToken: `seed-token-${i + 1}`,
        userId: i < 3 ? customer.id : null,
        name: i < 3 ? customer.name : ['Saman Silva', 'Fathima Rizvi', 'Tharindu Jayasuriya', 'Priya Nadarajah', 'Chamari Fernando'][i - 3],
        email: i < 3 ? customer.email : `guest${i}@example.com`,
        phone: '0771234567', line1: '12 Temple Road', city: 'Kandy', district: 'Kandy',
        subtotal, deliveryFee, total: subtotal + deliveryFee, paymentMethod: method,
        paymentStatus: status === 'CANCELLED' ? 'FAILED' : paid ? 'PAID' : 'PENDING',
        status, estimatedDays: '2-3', createdAt,
        items: { create: { productId: p.id, variantId: v.id, productName: p.name, sku: v.sku, size: v.size, colour: v.colour, unitPrice: unit, quantity: qty } },
        history: { create: [{ status: method === 'COD' ? 'RECEIVED' : 'PENDING_PAYMENT', note: 'Order placed', createdAt }, ...(status !== 'RECEIVED' && status !== 'PENDING_PAYMENT' ? [{ status, note: 'Updated by staff', changedBy: ADMIN.email }] : [])] },
        payments: { create: { method, amount: subtotal + deliveryFee, status: status === 'CANCELLED' ? 'FAILED' : paid ? 'PAID' : 'PENDING' } },
        shipment: ['SHIPPED', 'DELIVERED'].includes(status) ? { create: { courier: 'Domex', trackingNumber: `DX${100200 + i}`, status, shippedAt: createdAt } } : undefined,
      },
    });
  }

  await prisma.newsletterSubscriber.create({ data: { email: 'fan@example.com' } });
  await prisma.contactMessage.create({ data: { name: 'Sajith', email: 'sajith@example.com', subject: 'Bulk order', message: 'Do you offer discounts for bulk orders for a company event?' } });

  console.log('\nSeed complete.');
  console.log(`  Admin:    ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`  Staff:    ${STAFF.email} / ${STAFF.password}`);
  console.log(`  Customer: ${CUSTOMER.email} / ${CUSTOMER.password}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
