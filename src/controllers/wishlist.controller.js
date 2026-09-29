const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const InfluencerProduct = require('../models/InfluencerProduct');

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

// Builds the wishlist response with live product data (dropping items whose product is gone)
const buildWishlistResponse = async (wishlist, baseUrl) => {
  const productIds = wishlist.items.map((i) => i.product_id);
  const products = await InfluencerProduct.find({ _id: { $in: productIds }, isDeleted: false })
    .populate('user_id', 'username full_name avatar_url')
    .lean();
  const productMap = Object.fromEntries(products.map((p) => [String(p._id), p]));

  const addedAtMap = Object.fromEntries(wishlist.items.map((i) => [String(i.product_id), i.added_at]));

  const items = wishlist.items
    .filter((i) => productMap[String(i.product_id)])
    .map((i) => ({
      ...transformProduct(productMap[String(i.product_id)], baseUrl),
      wishlisted_at: addedAtMap[String(i.product_id)],
    }))
    .sort((a, b) => new Date(b.wishlisted_at) - new Date(a.wishlisted_at));

  return { success: true, total: items.length, products: items };
};

// ─── Get current user's wishlist (full product data) ─────────────────────────
exports.getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user_id: req.userId });
    if (!wishlist) wishlist = await Wishlist.create({ user_id: req.userId, items: [] });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildWishlistResponse(wishlist, baseUrl));
  } catch (error) {
    console.error('[getWishlist]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Add a product to the wishlist (idempotent) ──────────────────────────────
exports.addItem = async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: 'Invalid product_id' });
    }

    const product = await InfluencerProduct.findOne({ _id: product_id, isDeleted: false });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let wishlist = await Wishlist.findOne({ user_id: req.userId });
    if (!wishlist) wishlist = new Wishlist({ user_id: req.userId, items: [] });

    const alreadyIn = wishlist.items.some((i) => String(i.product_id) === String(product_id));
    if (!alreadyIn) {
      wishlist.items.push({ product_id });
      await wishlist.save();
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildWishlistResponse(wishlist, baseUrl));
  } catch (error) {
    console.error('[addItem]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Remove a product from the wishlist ──────────────────────────────────────
exports.removeItem = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const wishlist = await Wishlist.findOne({ user_id: req.userId });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });

    wishlist.items = wishlist.items.filter((i) => String(i.product_id) !== String(productId));
    await wishlist.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildWishlistResponse(wishlist, baseUrl));
  } catch (error) {
    console.error('[removeItem]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Clear the entire wishlist ────────────────────────────────────────────────
exports.clearWishlist = async (req, res) => {
  try {
    await Wishlist.findOneAndUpdate({ user_id: req.userId }, { items: [] }, { upsert: true });
    return res.json({ success: true, message: 'Wishlist cleared', total: 0, products: [] });
  } catch (error) {
    console.error('[clearWishlist]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
