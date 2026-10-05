const mongoose = require('mongoose');
const InfluencerProduct = require('../models/InfluencerProduct');

// ─── URL Helper (R2-first, CloudFront fallback) ──────────────────────────────
const resolveMediaUrl = (fileName, fileUrl, baseUrl) => {
  const cloudfront = (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFRONT_BASE_URL)
    ? (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFRONT_BASE_URL).replace(/\/+$/, '')
    : null;

  if (fileUrl && fileUrl.startsWith('http')) return fileUrl;

  if (fileName) {
    const key = fileName.replace(/^\/+/, '');
    if (cloudfront) return `${cloudfront}/${key.startsWith('uploads/') ? key : `uploads/${key}`}`;
    return `${baseUrl}/${key.startsWith('uploads/') ? key : `uploads/${key}`}`;
  }

  return '';
};

const transformProduct = (product, baseUrl) => {
  const obj = product.toObject ? product.toObject() : product;
  obj.images = Array.isArray(obj.images)
    ? obj.images.map((img) => ({ ...img, fileUrl: resolveMediaUrl(img.fileName, img.fileUrl, baseUrl) }))
    : [];
  return obj;
};

// ─── Validation helpers ───────────────────────────────────────────────────────
const REQUIRED_TOP_LEVEL = [
  'name', 'category', 'short_description',
  'mrp', 'selling_price', 'stock_quantity', 'seller_sku', 'status',
  'package_weight', 'dimensions', 'dispatch_time', 'country_of_origin', 'return_policy',
];

const validateProductBody = (body) => {
  for (const field of REQUIRED_TOP_LEVEL) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `${field} is required`;
    }
  }

  if (!Array.isArray(body.images) || body.images.length === 0) {
    return 'At least one product image is required';
  }
  for (const img of body.images) {
    if (!img.fileName) return 'Each image must have a fileName';
  }

  if (!Array.isArray(body.key_highlights) || body.key_highlights.length === 0) {
    return 'At least one key highlight is required';
  }
  if (body.key_highlights.length > 5) {
    return 'Maximum 5 key highlights allowed';
  }

  if (!['active', 'inactive', 'draft', 'out_of_stock'].includes(body.status)) {
    return 'status must be active, inactive, draft, or out_of_stock';
  }

  const dims = body.dimensions;
  if (!dims || typeof dims !== 'object' ||
      dims.length === undefined || dims.width === undefined || dims.height === undefined) {
    return 'dimensions.length, dimensions.width and dimensions.height are required';
  }

  if (Number(body.mrp) < 0 || Number(body.selling_price) < 0) {
    return 'mrp and selling_price cannot be negative';
  }
  if (Number(body.stock_quantity) < 0) {
    return 'stock_quantity cannot be negative';
  }
  if (Number(body.package_weight) < 0) {
    return 'package_weight cannot be negative';
  }

  if (body.variants !== undefined && !Array.isArray(body.variants)) {
    return 'variants must be an array';
  }

  return null;
};

const buildProductData = (body) => {
  const mrp = Number(body.mrp);
  const sellingPrice = Number(body.selling_price);
  const discount = body.discount !== undefined && body.discount !== null && body.discount !== ''
    ? Number(body.discount)
    : (mrp > 0 ? Math.round((1 - sellingPrice / mrp) * 100) : 0);

  return {
    images: body.images,
    name: String(body.name).trim(),
    category: body.category,
    brand: body.brand || '',
    short_description: body.short_description,
    key_highlights: body.key_highlights,

    mrp,
    selling_price: sellingPrice,
    discount,
    stock_quantity: Number(body.stock_quantity),
    seller_sku: body.seller_sku,
    track_inventory: body.track_inventory !== undefined ? !!body.track_inventory : true,
    status: body.status,
    variants: (body.variants || []).map((v) => ({
      color: v.color || '',
      size: v.size || '',
      stock_quantity: Number(v.stock_quantity) || 0,
      price: Number(v.price) || 0,
    })),

    package_weight: Number(body.package_weight),
    weight_unit: body.weight_unit || 'kg',
    dimensions: {
      length: Number(body.dimensions.length),
      width: Number(body.dimensions.width),
      height: Number(body.dimensions.height),
      unit: body.dimensions.unit || 'cm',
    },
    dispatch_time: body.dispatch_time,
    hsn_gst: body.hsn_gst || '',
    country_of_origin: body.country_of_origin,
    return_policy: body.return_policy,
    use_store_delivery_settings: body.use_store_delivery_settings !== undefined ? !!body.use_store_delivery_settings : true,
    use_store_return_policy: body.use_store_return_policy !== undefined ? !!body.use_store_return_policy : true,
    warranty: body.warranty || 'None',
  };
};

// ─── Create a product (influencer only) ──────────────────────────────────────
exports.createProduct = async (req, res) => {
  try {
    if (req.user.role !== 'influencer') {
      return res.status(403).json({ message: 'Only influencers can create products' });
    }
    if (req.user.influencer_profile?.is_suspended) {
      return res.status(403).json({
        message: 'Your selling privileges are suspended. Reason: ' + (req.user.influencer_profile.suspension_reason || 'Not specified'),
      });
    }

    const validationError = validateProductBody(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const product = await InfluencerProduct.create({
      user_id: req.userId,
      ...buildProductData(req.body),
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({ success: true, product: transformProduct(product, baseUrl) });
  } catch (error) {
    console.error('[createProduct]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Update a product (owner only) ───────────────────────────────────────────
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await InfluencerProduct.findOne({ _id: id, isDeleted: false });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (String(product.user_id) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }
    if (req.user.influencer_profile?.is_suspended) {
      return res.status(403).json({
        message: 'Your selling privileges are suspended. Reason: ' + (req.user.influencer_profile.suspension_reason || 'Not specified'),
      });
    }

    const allowedFields = [
      'images', 'name', 'category', 'brand', 'short_description', 'key_highlights',
      'mrp', 'selling_price', 'discount', 'stock_quantity', 'seller_sku', 'track_inventory', 'status', 'variants',
      'package_weight', 'weight_unit', 'dimensions', 'dispatch_time', 'hsn_gst', 'country_of_origin',
      'return_policy', 'use_store_delivery_settings', 'use_store_return_policy', 'warranty',
    ];

    const merged = { ...product.toObject(), ...req.body };
    const validationError = validateProductBody(merged);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const data = buildProductData(merged);
    for (const field of allowedFields) {
      product[field] = data[field];
    }

    await product.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({ success: true, product: transformProduct(product, baseUrl) });
  } catch (error) {
    console.error('[updateProduct]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Restock a product (owner only) ──────────────────────────────────────────
// Adds to the current stock_quantity rather than replacing it — avoids the
// classic "two people editing the form at once overwrite each other's stock"
// bug that plain PATCH /:id would have. Auto-reactivates a product that was
// marked Out of Stock, since restocking it implies it's sellable again.
exports.addStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'quantity must be a positive whole number' });
    }

    const product = await InfluencerProduct.findOne({ _id: id, isDeleted: false });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (String(product.user_id) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }

    product.stock_quantity += quantity;
    if (product.status === 'out_of_stock') {
      product.status = 'active';
    }
    await product.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({ success: true, product: transformProduct(product, baseUrl) });
  } catch (error) {
    console.error('[addStock]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Delete a product (owner only, soft delete) ──────────────────────────────
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await InfluencerProduct.findOne({ _id: id, isDeleted: false });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (String(product.user_id) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized to delete this product' });
    }

    product.isDeleted = true;
    product.deletedBy = req.userId;
    product.deletedAt = new Date();
    await product.save();

    return res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('[deleteProduct]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── List my own products (influencer) ───────────────────────────────────────
exports.listMyProducts = async (req, res) => {
  try {
    const products = await InfluencerProduct.find({ user_id: req.userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      total: products.length,
      products: products.map((p) => transformProduct(p, baseUrl)),
    });
  } catch (error) {
    console.error('[listMyProducts]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Public marketplace feed (members explore) ───────────────────────────────
exports.listProducts = async (req, res) => {
  try {
    const { category, q, seller, page = 1, limit = 20 } = req.query;

    const query = { status: 'active', isDeleted: false };
    if (category) query.category = category;
    if (seller && mongoose.Types.ObjectId.isValid(seller)) query.user_id = seller;
    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      query.$or = [
        { name: regex },
        { short_description: regex },
        { category: regex },
        { brand: regex },
        { key_highlights: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const [total, products] = await Promise.all([
      InfluencerProduct.countDocuments(query),
      InfluencerProduct.find(query)
        .populate('user_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      products: products.map((p) => transformProduct(p, baseUrl)),
    });
  } catch (error) {
    console.error('[listProducts]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Admin: list every product, any status, any seller ──────────────────────
exports.adminListAllProducts = async (req, res) => {
  try {
    const { seller, status, category, q, page = 1, limit = 20 } = req.query;

    const query = { isDeleted: false };
    if (seller && mongoose.Types.ObjectId.isValid(seller)) query.user_id = seller;
    if (status && ['active', 'inactive', 'draft', 'out_of_stock'].includes(status)) query.status = status;
    if (category) query.category = category;
    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      query.$or = [
        { name: regex },
        { short_description: regex },
        { category: regex },
        { brand: regex },
        { seller_sku: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const [total, products] = await Promise.all([
      InfluencerProduct.countDocuments(query),
      InfluencerProduct.find(query)
        .populate('user_id', 'username full_name avatar_url influencer_profile.store_name influencer_profile.is_suspended')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      products: products.map((p) => transformProduct(p, baseUrl)),
    });
  } catch (error) {
    console.error('[adminListAllProducts]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Get a single product by ID ───────────────────────────────────────────────
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await InfluencerProduct.findOne({ _id: id, isDeleted: false })
      .populate('user_id', 'username full_name avatar_url')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({ success: true, product: transformProduct(product, baseUrl) });
  } catch (error) {
    console.error('[getProductById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
