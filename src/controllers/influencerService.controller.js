const mongoose = require('mongoose');
const InfluencerService = require('../models/InfluencerService');

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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

const transformService = (service, baseUrl) => {
  const obj = service.toObject ? service.toObject() : service;
  obj.images = Array.isArray(obj.images)
    ? obj.images.map((img) => ({ ...img, fileUrl: resolveMediaUrl(img.fileName, img.fileUrl, baseUrl) }))
    : [];
  return obj;
};

// ─── Validation helpers ───────────────────────────────────────────────────────
const REQUIRED_TOP_LEVEL = [
  'name', 'category', 'short_description',
  'price', 'rate_type', 'duration', 'service_method',
];

const validateServiceBody = (body) => {
  for (const field of REQUIRED_TOP_LEVEL) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `${field} is required`;
    }
  }

  if (!Array.isArray(body.key_highlights) || body.key_highlights.length === 0) {
    return 'At least one key highlight is required';
  }
  if (body.key_highlights.length > 5) {
    return 'Maximum 5 key highlights allowed';
  }

  if (!['starting_from', 'fixed', 'per_hour', 'per_session'].includes(body.rate_type)) {
    return 'rate_type must be starting_from, fixed, per_hour, or per_session';
  }

  if (!['at_customer_location', 'online', 'at_my_location'].includes(body.service_method)) {
    return 'service_method must be at_customer_location, online, or at_my_location';
  }

  if (Number(body.price) < 0) {
    return 'price cannot be negative';
  }

  if (body.images !== undefined && !Array.isArray(body.images)) {
    return 'images must be an array';
  }
  for (const img of body.images || []) {
    if (!img.fileName) return 'Each image must have a fileName';
  }

  if (body.subservices !== undefined && !Array.isArray(body.subservices)) {
    return 'subservices must be an array';
  }

  if (body.weekly_availability !== undefined) {
    if (typeof body.weekly_availability !== 'object' || Array.isArray(body.weekly_availability)) {
      return 'weekly_availability must be an object keyed by weekday';
    }
    for (const [day, slots] of Object.entries(body.weekly_availability)) {
      if (!WEEKDAYS.includes(day)) {
        return `weekly_availability has an unknown day: ${day}`;
      }
      if (!Array.isArray(slots)) {
        return `weekly_availability.${day} must be an array of {start, end} slots`;
      }
      for (const slot of slots) {
        if (!slot.start || !slot.end) {
          return `weekly_availability.${day} slots require both start and end`;
        }
      }
    }
  }

  return null;
};

const buildServiceData = (body) => {
  const weekly_availability = {};
  for (const day of WEEKDAYS) {
    const slots = body.weekly_availability?.[day];
    weekly_availability[day] = Array.isArray(slots)
      ? slots.map((s) => ({ start: s.start, end: s.end }))
      : [];
  }

  return {
    images: (body.images || []).map((img) => ({ fileName: img.fileName, fileUrl: img.fileUrl || '' })),
    name: String(body.name).trim(),
    category: body.category,
    provider: body.provider || '',
    short_description: body.short_description,
    key_highlights: body.key_highlights,

    price: Number(body.price),
    rate_type: body.rate_type,
    duration: body.duration,
    subservices: (body.subservices || []).map((s) => ({
      name: s.name || '',
      hours: Number(s.hours) || 0,
      price: Number(s.price) || 0,
    })),

    service_method: body.service_method,
    weekly_availability,
    visible_to_customers: body.visible_to_customers !== undefined ? !!body.visible_to_customers : true,
    status: ['active', 'inactive', 'draft'].includes(body.status) ? body.status : 'active',
  };
};

// ─── Create a service (influencer only) ──────────────────────────────────────
exports.createService = async (req, res) => {
  try {
    if (req.user.role !== 'influencer') {
      return res.status(403).json({ message: 'Only influencers can create services' });
    }

    const validationError = validateServiceBody(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const service = await InfluencerService.create({
      user_id: req.userId,
      ...buildServiceData(req.body),
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({ success: true, service: transformService(service, baseUrl) });
  } catch (error) {
    console.error('[createService]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Update a service (owner only) ───────────────────────────────────────────
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid service ID' });
    }

    const service = await InfluencerService.findOne({ _id: id, isDeleted: false });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    if (String(service.user_id) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized to update this service' });
    }

    const allowedFields = [
      'images', 'name', 'category', 'provider', 'short_description', 'key_highlights',
      'price', 'rate_type', 'duration', 'subservices',
      'service_method', 'weekly_availability', 'visible_to_customers', 'status',
    ];

    const merged = { ...service.toObject(), ...req.body };
    const validationError = validateServiceBody(merged);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const data = buildServiceData(merged);
    for (const field of allowedFields) {
      service[field] = data[field];
    }

    await service.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({ success: true, service: transformService(service, baseUrl) });
  } catch (error) {
    console.error('[updateService]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Delete a service (owner only, soft delete) ──────────────────────────────
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid service ID' });
    }

    const service = await InfluencerService.findOne({ _id: id, isDeleted: false });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    if (String(service.user_id) !== String(req.userId)) {
      return res.status(403).json({ message: 'Not authorized to delete this service' });
    }

    service.isDeleted = true;
    service.deletedBy = req.userId;
    service.deletedAt = new Date();
    await service.save();

    return res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    console.error('[deleteService]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── List my own services (influencer) ───────────────────────────────────────
exports.listMyServices = async (req, res) => {
  try {
    const services = await InfluencerService.find({ user_id: req.userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      total: services.length,
      services: services.map((s) => transformService(s, baseUrl)),
    });
  } catch (error) {
    console.error('[listMyServices]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Public marketplace feed (members explore) ───────────────────────────────
exports.listServices = async (req, res) => {
  try {
    const { category, q, page = 1, limit = 20 } = req.query;

    const query = { visible_to_customers: true, status: 'active', isDeleted: false };
    if (category) query.category = category;
    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      query.$or = [
        { name: regex },
        { short_description: regex },
        { category: regex },
        { provider: regex },
        { key_highlights: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const [total, services] = await Promise.all([
      InfluencerService.countDocuments(query),
      InfluencerService.find(query)
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
      services: services.map((s) => transformService(s, baseUrl)),
    });
  } catch (error) {
    console.error('[listServices]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Get a single service by ID ───────────────────────────────────────────────
exports.getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid service ID' });
    }

    const service = await InfluencerService.findOne({ _id: id, isDeleted: false })
      .populate('user_id', 'username full_name avatar_url')
      .lean();
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({ success: true, service: transformService(service, baseUrl) });
  } catch (error) {
    console.error('[getServiceById]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
