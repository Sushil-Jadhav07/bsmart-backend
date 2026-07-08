'use strict';

/**
 * Xoxoday Plum API service
 *
 * Env vars required:
 *   XOXODAY_CLIENT_ID       – API client id from Xoxoday dashboard
 *   XOXODAY_CLIENT_SECRET   – API client secret
 *   XOXODAY_API_BASE_URL    – https://stagingaccount.xoxoday.com/chef/v1 (staging)
 *                             https://accounts.xoxoday.com/chef/v1        (prod)
 *
 * Docs: https://docs.xoxoday.com/
 */

const https = require('https');
const http  = require('http');

const BASE_URL = (process.env.XOXODAY_API_BASE_URL || 'https://stagingaccount.xoxoday.com/chef/v1').replace(/\/+$/, '');

// ─── Token cache (in-memory, per process) ────────────────────────────────────
let _cachedToken   = null;
let _tokenExpiresAt = 0;

async function _request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url  = new URL(BASE_URL + path);
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            const err = new Error(json?.message || `Xoxoday API error ${res.statusCode}`);
            err.status     = res.statusCode;
            err.xoxoday    = json;
            return reject(err);
          }
          resolve(json);
        } catch {
          reject(new Error(`Xoxoday non-JSON response: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken;

  const res = await _request('POST', '/token/', {
    grant_type:    'client_credentials',
    client_id:     process.env.XOXODAY_CLIENT_ID,
    client_secret: process.env.XOXODAY_CLIENT_SECRET,
  });

  // Xoxoday returns: { data: { token: { access_token, expires_in } } }
  const token = res?.data?.token ?? res?.token ?? res;
  _cachedToken    = token.access_token;
  _tokenExpiresAt = Date.now() + ((token.expires_in || 3600) - 60) * 1000;
  return _cachedToken;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

/**
 * @param {{ limit?: number, offset?: number, search?: string, country?: string }} opts
 * Returns the raw Xoxoday voucher list.
 */
async function getVouchers(opts = {}) {
  const token  = await getAccessToken();
  const limit  = opts.limit  || 20;
  const offset = opts.offset || 0;

  let path = `/vouchers/?filter[limit]=${limit}&filter[offset]=${offset}`;
  if (opts.country) path += `&filter[country_code]=${opts.country}`;
  if (opts.search)  path += `&filter[name]=${encodeURIComponent(opts.search)}`;
  if (opts.min_price) path += `&filter[min_price]=${opts.min_price}`;
  if (opts.max_price) path += `&filter[max_price]=${opts.max_price}`;

  const res = await _request('GET', path, null, token);
  // Xoxoday: { data: { vouchers: [...], total: N } }
  return res?.data ?? res;
}

/**
 * Get a single voucher/product by its productId.
 */
async function getVoucherById(productId) {
  const token = await getAccessToken();
  const res   = await _request('GET', `/vouchers/${productId}/`, null, token);
  return res?.data?.voucher ?? res?.data ?? res;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * Place a voucher order on Xoxoday.
 *
 * @param {{ poNumber: string, email: string, productId: string, quantity: number, price: number, name?: string }} params
 */
async function placeOrder(params) {
  const token = await getAccessToken();

  const payload = {
    poNumber: params.poNumber,
    email:    params.email,
    tag:      'bsmart-redemption',
    orderItems: [
      {
        productId: params.productId,
        quantity:  params.quantity || 1,
        price:     params.price,
      },
    ],
  };

  if (params.name) payload.name = params.name;

  const res = await _request('POST', '/orders/', payload, token);
  // Xoxoday: { data: { orderId, status, vouchers: [...] } }
  return res?.data ?? res;
}

/**
 * Get order status by Xoxoday order ID.
 */
async function getOrderStatus(xoxodayOrderId) {
  const token = await getAccessToken();
  const res   = await _request('GET', `/orders/${xoxodayOrderId}/`, null, token);
  return res?.data ?? res;
}

module.exports = { getAccessToken, getVouchers, getVoucherById, placeOrder, getOrderStatus };
