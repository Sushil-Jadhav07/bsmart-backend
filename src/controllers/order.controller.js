const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const InfluencerProduct = require('../models/InfluencerProduct');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const runMongoTransaction = require('../utils/runMongoTransaction');
const emitToUser = require('../utils/emitToUser');
const {
  notifyOrderPlaced,
  notifyOrderStatus,
  notifyOrderCancelled,
  notifyOrderRefunded,
  notifyOrderPaymentFailed,
  notifyOrderRefundFailed,
} = require('../services/orderNotification.service');

const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

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

const generateOrderNumber = () =>
  `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

// ─── Checkout: builds the order from the cart, charges via razorpay or wallet ─
exports.checkout = async (req, res) => {
  try {
    const { payment_method, shipping_address } = req.body;

    if (!['razorpay', 'wallet'].includes(payment_method)) {
      return res.status(400).json({ message: "payment_method must be 'razorpay' or 'wallet'" });
    }

    const cart = await Cart.findOne({ user_id: req.userId });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // Resolve shipping address: body > user's saved address > error
    const user = await User.findById(req.userId);
    const addr = shipping_address || {
      name: user.full_name || user.username,
      phone: user.phone || '',
      address_line1: user.address?.address_line1 || '',
      address_line2: user.address?.address_line2 || '',
      city: user.address?.city || '',
      state: user.address?.state || '',
      pincode: user.address?.pincode || '',
      country: user.address?.country || 'India',
    };
    if (!addr.address_line1 || !addr.city || !addr.pincode) {
      return res.status(400).json({ message: 'shipping_address (address_line1, city, pincode) is required' });
    }

    // Validate every cart item and build order line items with live pricing
    const productIds = cart.items.map((i) => i.product_id);
    const products = await InfluencerProduct.find({ _id: { $in: productIds }, isDeleted: false, status: 'active' }).lean();
    const productMap = Object.fromEntries(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let subtotal = 0;
    for (const item of cart.items) {
      const product = productMap[String(item.product_id)];
      if (!product) {
        return res.status(400).json({ message: `A product in your cart is no longer available` });
      }
      if (product.track_inventory && product.stock_quantity < item.quantity) {
        return res.status(400).json({ message: `Only ${product.stock_quantity} left in stock for "${product.name}"` });
      }
      const lineTotal = product.selling_price * item.quantity;
      subtotal += lineTotal;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      orderItems.push({
        product_id: product._id,
        seller_id: product.user_id,
        name: product.name,
        image: product.images?.[0] ? resolveMediaUrl(product.images[0].fileName, product.images[0].fileUrl, baseUrl) : '',
        variant: item.variant,
        unit_price: product.selling_price,
        quantity: item.quantity,
        subtotal: lineTotal,
      });
    }

    const totalAmount = subtotal; // shipping_fee kept at 0 for now

    if (payment_method === 'wallet') {
      const result = await runMongoTransaction({
        work: async (session) => {
          const wallet = await Wallet.findOne({ user_id: req.userId }).session(session);
          if (!wallet || wallet.balance < totalAmount) {
            const err = new Error(`Insufficient wallet balance. Required: ${totalAmount}, Available: ${wallet?.balance || 0}`);
            err.statusCode = 400;
            throw err;
          }

          const order = await Order.create([{
            order_number: generateOrderNumber(),
            user_id: req.userId,
            items: orderItems,
            subtotal_amount: subtotal,
            total_amount: totalAmount,
            payment_method: 'wallet',
            payment_status: 'paid',
            order_status: 'confirmed',
            shipping_address: addr,
            placed_at: new Date(),
          }], { session }).then((docs) => docs[0]);

          await Wallet.updateOne({ user_id: req.userId }, { $inc: { balance: -totalAmount } }).session(session);

          const [txn] = await WalletTransaction.create([{
            user_id: req.userId,
            order_id: order._id,
            type: 'MARKETPLACE_ORDER_PAYMENT',
            amount: totalAmount,
            description: `Payment for order ${order.order_number}`,
            status: 'SUCCESS',
          }], { session });

          order.wallet_transaction_id = txn._id;
          await order.save({ session });

          for (const item of orderItems) {
            await InfluencerProduct.updateOne(
              { _id: item.product_id, track_inventory: true },
              { $inc: { stock_quantity: -item.quantity } }
            ).session(session);
          }

          await Cart.updateOne({ user_id: req.userId }, { items: [] }).session(session);

          return order;
        },
      });

      notifyOrderPlaced(req.app, result);
      return res.status(201).json({ success: true, order: result });
    }

    // ── Razorpay path ────────────────────────────────────────────────────────
    if (!razorpay) {
      return res.status(500).json({ message: 'Razorpay is not configured on the server' });
    }

    const order = await Order.create({
      order_number: generateOrderNumber(),
      user_id: req.userId,
      items: orderItems,
      subtotal_amount: subtotal,
      total_amount: totalAmount,
      payment_method: 'razorpay',
      payment_status: 'pending',
      order_status: 'pending',
      shipping_address: addr,
    });

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt: order.order_number,
      notes: { order_id: String(order._id), user_id: String(req.userId) },
    });

    order.razorpay_order_id = rzpOrder.id;
    await order.save();

    return res.status(201).json({
      success: true,
      order,
      razorpay: {
        order_id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('[checkout]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Verify Razorpay payment & finalize the order ────────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }

    const order = await Order.findOne({ _id: id, user_id: req.userId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.payment_method !== 'razorpay') {
      return res.status(400).json({ message: 'This order is not a Razorpay order' });
    }
    if (order.payment_status === 'paid') {
      return res.json({ success: true, order, message: 'Already verified' });
    }
    if (order.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ message: 'razorpay_order_id does not match this order' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      order.payment_status = 'failed';
      await order.save();
      notifyOrderPaymentFailed(req.app, order);
      return res.status(400).json({ message: 'Payment verification failed — invalid signature' });
    }

    const result = await runMongoTransaction({
      work: async (session) => {
        order.payment_status = 'paid';
        order.order_status = 'confirmed';
        order.razorpay_payment_id = razorpay_payment_id;
        order.razorpay_signature = razorpay_signature;
        order.placed_at = new Date();
        await order.save({ session });

        for (const item of order.items) {
          await InfluencerProduct.updateOne(
            { _id: item.product_id, track_inventory: true },
            { $inc: { stock_quantity: -item.quantity } }
          ).session(session);
        }

        await Cart.updateOne({ user_id: req.userId }, { items: [] }).session(session);

        return order;
      },
    });

    notifyOrderPlaced(req.app, result);
    return res.json({ success: true, order: result });
  } catch (error) {
    console.error('[verifyPayment]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Buyer: list own orders ───────────────────────────────────────────────────
exports.listMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const [total, orders] = await Promise.all([
      Order.countDocuments({ user_id: req.userId }),
      Order.find({ user_id: req.userId })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({ success: true, total, page: pageNum, limit: limitNum, orders });
  } catch (error) {
    console.error('[listMyOrders]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Buyer: get a single order ────────────────────────────────────────────────
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Viewable by the buyer, any seller with items on the order, or an admin —
    // not the buyer alone. The seller's own "Fulfill order" page calls this
    // same endpoint to refresh order details.
    const isBuyer = String(order.user_id) === String(req.userId);
    const isSeller = order.items.some((i) => String(i.seller_id) === String(req.userId));
    const isAdmin = req.user?.role === 'admin';
    if (!isBuyer && !isSeller && !isAdmin) {
      return res.status(404).json({ message: 'Order not found' });
    }

    return res.json({ success: true, order });
  } catch (error) {
    console.error('[getOrderById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Buyer: cancel an order (before it ships) ─────────────────────────────────
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const isBuyer = String(order.user_id) === String(req.userId);
    const isAdmin = req.user?.role === 'admin';
    if (!isBuyer && !isAdmin) return res.status(404).json({ message: 'Order not found' });

    if (!['pending', 'confirmed', 'processing'].includes(order.order_status)) {
      return res.status(400).json({ message: `Cannot cancel an order that is already ${order.order_status}` });
    }

    order.order_status = 'cancelled';
    order.cancelled_at = new Date();
    order.cancelled_reason = reason || '';

    if (order.payment_status === 'paid') {
      if (order.payment_method === 'wallet') {
        await Wallet.updateOne({ user_id: order.user_id }, { $inc: { balance: order.total_amount } });
        await WalletTransaction.create({
          user_id: order.user_id,
          order_id: order._id,
          type: 'MARKETPLACE_ORDER_REFUND',
          amount: order.total_amount,
          description: `Refund for cancelled order ${order.order_number}`,
          status: 'SUCCESS',
        });
        order.payment_status = 'refunded';
      } else if (order.payment_method === 'razorpay' && razorpay && order.razorpay_payment_id) {
        try {
          await razorpay.payments.refund(order.razorpay_payment_id, {
            amount: Math.round(order.total_amount * 100),
          });
          order.payment_status = 'refunded';
        } catch (refundErr) {
          console.error('[cancelOrder] Razorpay refund failed:', refundErr.message);
          // Order is still marked cancelled; payment_status stays 'paid' so this can be handled manually.
          order.refund_failed = true;
          order.refund_error = refundErr.message || 'Razorpay refund failed';
        }
      }

      // Restock cancelled items
      for (const item of order.items) {
        await InfluencerProduct.updateOne(
          { _id: item.product_id, track_inventory: true },
          { $inc: { stock_quantity: item.quantity } }
        );
      }
    }

    await order.save();

    notifyOrderCancelled(req.app, order, { reason: order.cancelled_reason });
    if (order.payment_status === 'refunded') {
      notifyOrderRefunded(req.app, order, order.total_amount);
    }
    if (order.refund_failed) {
      notifyOrderRefundFailed(req.app, order);
    }
    return res.json({ success: true, order });
  } catch (error) {
    console.error('[cancelOrder]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Seller (influencer): list orders containing their products ─────────────
// ─── Admin: list every order across all buyers and sellers ──────────────────
exports.adminListAllOrders = async (req, res) => {
  try {
    const { status, payment_status, buyer, seller, q, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      query.order_status = status;
    }
    if (payment_status && ['pending', 'paid', 'failed', 'refunded'].includes(payment_status)) {
      query.payment_status = payment_status;
    }
    if (req.query.refund_failed === 'true') query.refund_failed = true;
    if (buyer && mongoose.Types.ObjectId.isValid(buyer)) query.user_id = buyer;
    if (seller && mongoose.Types.ObjectId.isValid(seller)) query['items.seller_id'] = seller;
    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      query.$or = [{ order_number: regex }, { razorpay_payment_id: regex }];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const [total, orders] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .populate('user_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      orders,
    });
  } catch (error) {
    console.error('[adminListAllOrders]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listSellerOrders = async (req, res) => {
  try {
    if (req.user.role !== 'influencer') {
      return res.status(403).json({ message: 'Only influencers can view seller orders' });
    }

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const query = { 'items.seller_id': req.userId };
    const [total, orders] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    // Only expose this seller's own line items within each order
    const scoped = orders.map((o) => ({
      ...o,
      items: o.items.filter((i) => String(i.seller_id) === String(req.userId)),
    }));

    return res.json({ success: true, total, page: pageNum, limit: limitNum, orders: scoped });
  } catch (error) {
    console.error('[listSellerOrders]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Seller/Admin: update order fulfillment status ───────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const order_status = req.body.order_status || req.body.status;
    const { confirmed_items, packed, courier, tracking_number, notify_customer } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const allowed = ['confirmed', 'processing', 'shipped', 'delivered'];
    if (!allowed.includes(order_status)) {
      return res.status(400).json({ message: `order_status must be one of: ${allowed.join(', ')}` });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const isSeller = order.items.some((i) => String(i.seller_id) === String(req.userId));
    const isAdmin = req.user.role === 'admin';
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this order' });
    }
    if (order.order_status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot update a cancelled order' });
    }

    // Shipping requires knowing how the package is actually being sent.
    const effectiveCourier = courier !== undefined ? courier : order.courier;
    const effectiveTracking = tracking_number !== undefined ? tracking_number : order.tracking_number;
    if (order_status === 'shipped' && (!effectiveCourier || !effectiveTracking)) {
      return res.status(400).json({ message: 'courier and tracking_number are required to mark an order as shipped' });
    }

    if (confirmed_items !== undefined) order.confirmed_items = !!confirmed_items;
    if (packed !== undefined) order.packed = !!packed;
    if (courier !== undefined) order.courier = courier;
    if (tracking_number !== undefined) order.tracking_number = tracking_number;
    if (notify_customer !== undefined) order.notify_customer = !!notify_customer;

    order.order_status = order_status;
    if (order_status === 'shipped' && !order.shipped_at) order.shipped_at = new Date();
    if (order_status === 'delivered' && !order.delivered_at) order.delivered_at = new Date();

    await order.save();

    // ── Real-time push to the buyer (and the seller's own other tabs) ─────────
    const eventPayload = {
      order_id: order._id,
      order_number: order.order_number,
      order_status: order.order_status,
      courier: order.courier,
      tracking_number: order.tracking_number,
      updated_at: order.updatedAt,
    };
    emitToUser(req.app, order.user_id, 'order-status-updated', eventPayload);
    for (const sellerId of new Set(order.items.map((i) => String(i.seller_id)))) {
      emitToUser(req.app, sellerId, 'order-status-updated', eventPayload);
    }

    notifyOrderStatus(req.app, order, order_status);

    return res.json({ success: true, order });
  } catch (error) {
    console.error('[updateOrderStatus]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
