const mongoose = require('mongoose');
const Cart = require('../models/Cart');
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

// Builds the cart response with live product info (current price, stock, availability)
const buildCartResponse = async (cart, baseUrl) => {
  const productIds = cart.items.map((i) => i.product_id);
  const products = await InfluencerProduct.find({ _id: { $in: productIds } }).lean();
  const productMap = Object.fromEntries(products.map((p) => [String(p._id), p]));

  let subtotal = 0;
  const items = cart.items.map((item) => {
    const product = productMap[String(item.product_id)];
    if (!product || product.isDeleted) {
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        variant: item.variant,
        unavailable: true,
        reason: 'Product no longer available',
      };
    }
    const unitPrice = product.selling_price;
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    return {
      product_id: product._id,
      name: product.name,
      image: product.images?.[0] ? resolveMediaUrl(product.images[0].fileName, product.images[0].fileUrl, baseUrl) : '',
      unit_price: unitPrice,
      quantity: item.quantity,
      variant: item.variant,
      line_total: lineTotal,
      in_stock: product.status === 'active' && (!product.track_inventory || product.stock_quantity >= item.quantity),
      available_stock: product.stock_quantity,
    };
  });

  return {
    success: true,
    items,
    item_count: items.length,
    subtotal_amount: subtotal,
  };
};

// ─── Get current user's cart ──────────────────────────────────────────────────
exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user_id: req.userId });
    if (!cart) cart = await Cart.create({ user_id: req.userId, items: [] });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildCartResponse(cart, baseUrl));
  } catch (error) {
    console.error('[getCart]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Add an item to the cart ──────────────────────────────────────────────────
exports.addItem = async (req, res) => {
  try {
    const { product_id, quantity = 1, variant } = req.body;

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: 'Invalid product_id' });
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: 'quantity must be a positive integer' });
    }

    const product = await InfluencerProduct.findOne({ _id: product_id, isDeleted: false, status: 'active' });
    if (!product) return res.status(404).json({ message: 'Product not found or unavailable' });

    let cart = await Cart.findOne({ user_id: req.userId });
    if (!cart) cart = new Cart({ user_id: req.userId, items: [] });

    const existing = cart.items.find((i) => String(i.product_id) === String(product_id));
    const newQty = existing ? existing.quantity + qty : qty;

    if (product.track_inventory && newQty > product.stock_quantity) {
      return res.status(400).json({ message: `Only ${product.stock_quantity} in stock` });
    }

    if (existing) {
      existing.quantity = newQty;
      if (variant) existing.variant = { color: variant.color || '', size: variant.size || '' };
    } else {
      cart.items.push({
        product_id,
        quantity: qty,
        variant: { color: variant?.color || '', size: variant?.size || '' },
      });
    }

    await cart.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildCartResponse(cart, baseUrl));
  } catch (error) {
    console.error('[addItem]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Update an item's quantity/variant ───────────────────────────────────────
exports.updateItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, variant } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const cart = await Cart.findOne({ user_id: req.userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.find((i) => String(i.product_id) === String(productId));
    if (!item) return res.status(404).json({ message: 'Item not in cart' });

    if (quantity !== undefined) {
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty < 0) {
        return res.status(400).json({ message: 'quantity must be a non-negative integer' });
      }
      if (qty === 0) {
        cart.items = cart.items.filter((i) => String(i.product_id) !== String(productId));
      } else {
        const product = await InfluencerProduct.findOne({ _id: productId, isDeleted: false });
        if (product?.track_inventory && qty > product.stock_quantity) {
          return res.status(400).json({ message: `Only ${product.stock_quantity} in stock` });
        }
        item.quantity = qty;
      }
    }
    if (variant && cart.items.some((i) => String(i.product_id) === String(productId))) {
      const stillItem = cart.items.find((i) => String(i.product_id) === String(productId));
      stillItem.variant = { color: variant.color || '', size: variant.size || '' };
    }

    await cart.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildCartResponse(cart, baseUrl));
  } catch (error) {
    console.error('[updateItem]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Remove an item from the cart ────────────────────────────────────────────
exports.removeItem = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const cart = await Cart.findOne({ user_id: req.userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter((i) => String(i.product_id) !== String(productId));
    await cart.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(await buildCartResponse(cart, baseUrl));
  } catch (error) {
    console.error('[removeItem]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Clear the entire cart ────────────────────────────────────────────────────
exports.clearCart = async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ user_id: req.userId }, { items: [] }, { upsert: true });
    return res.json({ success: true, message: 'Cart cleared', items: [], item_count: 0, subtotal_amount: 0 });
  } catch (error) {
    console.error('[clearCart]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
