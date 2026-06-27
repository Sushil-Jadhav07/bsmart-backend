const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const getPublicBaseUrl = (req) => {
  const configuredBaseUrl = trimTrailingSlash(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '');
  if (configuredBaseUrl) return configuredBaseUrl;

  const forwardedProtoHeader = req.headers['x-forwarded-proto'];
  const forwardedHostHeader = req.headers['x-forwarded-host'];

  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : String(forwardedProtoHeader || '').split(',')[0].trim();

  const forwardedHost = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : String(forwardedHostHeader || '').split(',')[0].trim();

  const protocol = forwardedProto || req.protocol || 'https';
  const host = forwardedHost || req.get('host');

  return `${protocol}://${host}`;
};

const absolutizeUploadUrl = (value, req) => {
  if (!value) return '';

  const raw = String(value).trim();
  if (!raw) return '';

  const cloudfront = process.env.CLOUDFRONT_BASE_URL
    ? process.env.CLOUDFRONT_BASE_URL.replace(/\/+$/, '')
    : null;

  if (/^https?:\/\//i.test(raw)) {
    if (cloudfront && raw.includes('api.bebsmart.in/uploads/')) {
      return raw.replace(/https?:\/\/api\.bebsmart\.in\/uploads\//, `${cloudfront}/uploads/`);
    }
    return raw.replace(/^http:\/\/api\.bebsmart\.in/i, 'https://api.bebsmart.in');
  }

  const normalized = raw.replace(/^\/+/, '');
  const relativePath = normalized.startsWith('uploads/') ? normalized : `uploads/${normalized}`;
  if (cloudfront) return `${cloudfront}/${relativePath}`;
  return `${getPublicBaseUrl(req)}/${relativePath}`;
};

module.exports = {
  getPublicBaseUrl,
  absolutizeUploadUrl,
};
