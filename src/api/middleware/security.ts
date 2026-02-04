/**
 * Security Headers Middleware
 * 
 * Configures security headers using Helmet.
 * Includes CSP, HSTS, X-Frame-Options, and more.
 */

import helmet from 'helmet';
import { Express } from 'express';

/**
 * Security header configuration
 */
export const securityHeadersConfig = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for some React features
        // Add specific script sources if needed
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for styled-components/emotion
        // Add specific style sources if needed
      ],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'ws://localhost:*', // WebSocket for development
        'wss://localhost:*',
      ],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"], // Prevent clickjacking
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  // X-Frame-Options (legacy, CSP frame-ancestors is preferred)
  frameguard: {
    action: 'deny' as const,
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection (legacy, CSP is preferred)
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin' as const,
  },
  
  // Permissions Policy
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"],
    },
  },
  
  // Cross-Origin policies
  crossOriginEmbedderPolicy: false, // Can break some resources
  crossOriginOpenerPolicy: { policy: 'same-origin' as const },
  crossOriginResourcePolicy: true,
  
  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },
  
  // Hide X-Powered-By
  hidePoweredBy: true,
  
  // IE No Open
  ieNoOpen: true,
  
  // Origin Agent Cluster
  originAgentCluster: true,
};

/**
 * Development CSP (more permissive for local dev)
 */
export const developmentSecurityConfig = {
  ...securityHeadersConfig,
  contentSecurityPolicy: {
    directives: {
      ...securityHeadersConfig.contentSecurityPolicy.directives,
      connectSrc: [
        "'self'",
        'ws://localhost:*',
        'wss://localhost:*',
        'http://localhost:*',
        'https://localhost:*',
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // Required for React Fast Refresh
      ],
    },
  },
  hsts: false, // Disable HSTS in development
};

/**
 * Apply security headers to Express app
 */
export function applySecurityHeaders(app: Express): void {
  const isDev = process.env['NODE_ENV'] === 'development';
  const config = isDev ? developmentSecurityConfig : securityHeadersConfig;
  
  app.use(helmet(config as any));
  
  // Additional custom headers
  app.use((req, res, next) => {
    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Additional security headers not covered by Helmet
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-Download-Options', 'noopen');
    
    next();
  });
}

/**
 * CORS configuration with security considerations
 */
export function getCorsConfig() {
  const allowedOrigins = process.env['DASH_CORS_ORIGINS']
    ? process.env['DASH_CORS_ORIGINS'].split(',').map(o => o.trim())
    : ['http://localhost:3000'];

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin) || process.env['NODE_ENV'] === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With',
      'Accept',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-CSRF-Token',
    ],
    maxAge: 86400, // 24 hours
  };
}

export default applySecurityHeaders;
