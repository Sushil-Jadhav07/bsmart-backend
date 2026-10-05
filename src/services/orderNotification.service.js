const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');
const { sendEmail } = require('./email.service');
const {
  orderPlacedTemplate,
  orderStatusTemplate,
  orderCancelledTemplate,
  orderRefundedTemplate,
  sellerNewOrderTemplate,
} = require('../templates/email.templates');

const CLIENT = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
const buyerUrl = (order) => `${CLIENT()}/orders/${order._id}`;
const sellerUrl = (order) => `${CLIENT()}/market/my-store/orders/${order._id}`;
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS_COPY = {
  confirmed:  { label: 'Confirmed',  message: 'The seller has confirmed your order.' },
  processing: { label: 'Processing', message: 'Your order is being packed.' },
  shipped:    { label: 'Shipped',    message: 'Your order is on its way!' },
  delivered:  { label: 'Delivered',  message: 'Your order has been delivered. Enjoy!' },
};

const sellerIdsOf = (order) => [...new Set(order.items.map((i) => String(i.seller_id)))];

const loadUsers = async (ids) =>
  User.find({ _id: { $in: ids } }).select('email full_name username').lean();

const sendSafely = (label, promise) => {
  promise.catch((err) => console.error(`[OrderNotify] ${label} failed:`, err.message));
};

const emailTo = (user, subject, html) => {
  if (!user?.email) return Promise.resolve();
  return sendEmail({ to: user.email, subject, html });
};

// ─── Placed: buyer gets confirmation, each seller gets a "new order" alert ───
const notifyOrderPlaced = async (app, order) => {
  try {
    const sellerIds = sellerIdsOf(order);
    const users = await loadUsers([order.user_id, ...sellerIds]);
    const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
    const buyer = byId[String(order.user_id)];

    sendNotification(app, {
      recipient: order.user_id,
      type: 'order_placed',
      message: `Your order ${order.order_number} has been placed.`,
      link: `/orders/${order._id}`,
    }).catch(() => {});
    sendSafely('buyer placed email', emailTo(buyer, `Order placed — ${order.order_number}`,
      orderPlacedTemplate({
        full_name: buyer?.full_name || buyer?.username,
        order_number: order.order_number,
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal })),
        total_amount: order.total_amount,
        order_url: buyerUrl(order),
      })));

    for (const sellerId of sellerIds) {
      const seller = byId[sellerId];
      const items = order.items.filter((i) => String(i.seller_id) === sellerId);
      const sellerTotal = items.reduce((sum, i) => sum + i.subtotal, 0);

      sendNotification(app, {
        recipient: sellerId,
        sender: order.user_id,
        type: 'order_seller_new',
        message: `New order ${order.order_number} with ${items.length} item${items.length === 1 ? '' : 's'}.`,
        link: `/market/my-store/orders/${order._id}`,
      }).catch(() => {});
      sendSafely('seller new-order email', emailTo(seller, `New order — ${order.order_number}`,
        sellerNewOrderTemplate({
          seller_name: seller?.full_name || seller?.username,
          order_number: order.order_number,
          items: items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal })),
          seller_total: sellerTotal,
          order_url: sellerUrl(order),
        })));
    }
  } catch (err) {
    console.error('[OrderNotify] placed failed:', err.message);
  }
};

// ─── Status change: buyer only, respects the seller's "notify customer" toggle ─
const notifyOrderStatus = async (app, order, status) => {
  try {
    if (!order.notify_customer) return;
    const copy = STATUS_COPY[status];
    if (!copy) return;
    const buyer = (await loadUsers([order.user_id]))[0];

    sendNotification(app, {
      recipient: order.user_id,
      type: 'order_status',
      message: `${order.order_number}: ${copy.message}`,
      link: `/orders/${order._id}`,
    }).catch(() => {});
    sendSafely('status email', emailTo(buyer, `Order ${copy.label} — ${order.order_number}`,
      orderStatusTemplate({
        full_name: buyer?.full_name || buyer?.username,
        order_number: order.order_number,
        status_label: copy.label,
        message: copy.message,
        courier: order.courier,
        tracking_number: order.tracking_number,
        order_url: buyerUrl(order),
      })));
  } catch (err) {
    console.error('[OrderNotify] status failed:', err.message);
  }
};

// ─── Cancelled: buyer and every seller on the order ───────────────────────────
const notifyOrderCancelled = async (app, order, { reason, refundAmount } = {}) => {
  try {
    const sellerIds = sellerIdsOf(order);
    const users = await loadUsers([order.user_id, ...sellerIds]);
    const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
    const buyer = byId[String(order.user_id)];

    sendNotification(app, {
      recipient: order.user_id,
      type: 'order_cancelled',
      message: `Your order ${order.order_number} was cancelled.`,
      link: `/orders/${order._id}`,
    }).catch(() => {});
    sendSafely('buyer cancel email', emailTo(buyer, `Order cancelled — ${order.order_number}`,
      orderCancelledTemplate({
        full_name: buyer?.full_name || buyer?.username,
        order_number: order.order_number,
        reason,
        refund_amount: refundAmount,
        audience: 'buyer',
        order_url: buyerUrl(order),
      })));

    for (const sellerId of sellerIds) {
      const seller = byId[sellerId];
      sendNotification(app, {
        recipient: sellerId,
        type: 'order_cancelled',
        message: `Order ${order.order_number} was cancelled.`,
        link: `/market/my-store/orders/${order._id}`,
      }).catch(() => {});
      sendSafely('seller cancel email', emailTo(seller, `Order cancelled — ${order.order_number}`,
        orderCancelledTemplate({
          full_name: seller?.full_name || seller?.username,
          order_number: order.order_number,
          reason,
          audience: 'seller',
          order_url: sellerUrl(order),
        })));
    }
  } catch (err) {
    console.error('[OrderNotify] cancelled failed:', err.message);
  }
};

// ─── Refunded: buyer only ─────────────────────────────────────────────────────
const notifyOrderRefunded = async (app, order, refundAmount) => {
  try {
    const buyer = (await loadUsers([order.user_id]))[0];

    sendNotification(app, {
      recipient: order.user_id,
      type: 'order_refunded',
      message: `Refund of ${money(refundAmount)} for ${order.order_number} has been processed.`,
      link: `/orders/${order._id}`,
    }).catch(() => {});
    sendSafely('refund email', emailTo(buyer, `Refund processed — ${order.order_number}`,
      orderRefundedTemplate({
        full_name: buyer?.full_name || buyer?.username,
        order_number: order.order_number,
        refund_amount: refundAmount,
        order_url: buyerUrl(order),
      })));
  } catch (err) {
    console.error('[OrderNotify] refunded failed:', err.message);
  }
};

// ─── Payment failed: in-app and push only (no email) ─────────────────────────
const notifyOrderPaymentFailed = (app, order) => {
  sendNotification(app, {
    recipient: order.user_id,
    type: 'order_payment_failed',
    message: `Payment for order ${order.order_number} could not be verified. Please try again.`,
    link: `/orders/${order._id}`,
  }).catch(() => {});
};

// ─── Automatic refund failed after cancel: alert admins, tell the buyer ───────
const notifyOrderRefundFailed = async (app, order) => {
  try {
    const admins = await User.find({ role: 'admin', isDeleted: { $ne: true } }).select('_id').lean();
    for (const admin of admins) {
      sendNotification(app, {
        recipient: admin._id,
        type: 'order_refund_failed',
        message: `Refund failed for cancelled order ${order.order_number} (${money(order.total_amount)}). Please refund manually.`,
        link: `/admin/orders/${order._id}`,
      }).catch(() => {});
    }

    sendNotification(app, {
      recipient: order.user_id,
      type: 'order_refund_pending',
      message: `Your order ${order.order_number} was cancelled. Your refund of ${money(order.total_amount)} is being processed manually and will be credited soon.`,
      link: `/orders/${order._id}`,
    }).catch(() => {});
  } catch (err) {
    console.error('[OrderNotify] refund failed alert failed:', err.message);
  }
};

module.exports = {
  notifyOrderPlaced,
  notifyOrderStatus,
  notifyOrderCancelled,
  notifyOrderRefunded,
  notifyOrderPaymentFailed,
  notifyOrderRefundFailed,
};
