import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 upload sessions per hour per IP
  message: {
    success: false,
    error: 'UPLOAD_LIMIT_EXCEEDED',
    message: 'Upload limit exceeded. Please wait before uploading another movie.',
  },
});

