import { Container, getContainer } from "@cloudflare/containers";

const ENV_KEYS = [
  "PORT",
  "MONGO_URI",
  "JWT_SECRET",

  "CLIENT_URL",
  "FRONTEND_URL",
  "APP_BASE_URL",
  "APP_URL",
  "BASE_URL",
  "PUBLIC_BASE_URL",
  "API_URL",

  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "GOOGLE_PLACES_API_KEY",

  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY_PATH",
  "APPLE_CALLBACK_URL",
  "APPLE_BUNDLE_ID",

  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_SECURE",
  "EMAIL_USER",
  "EMAIL_PASS",
  "EMAIL_FROM_NAME",

  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",

  // Original S3/CloudFront distribution — still live, still holds every
  // legacy upload from before the R2 migration. publicUrl.js rewrites old
  // api.bebsmart.in/uploads/... links here, not to the (dedicated, newer)
  // R2 bucket, which only ever holds NEW uploads.
  "CLOUDFRONT_BASE_URL",

  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_PUBLISHING_PLAN_ID",
  "RAZORPAY_WEBHOOK_SECRET",

  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",

  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_MAILTO",

  // SNSClient (pushNotification.service.js) authenticates with these same
  // three — still needed even though new file uploads go to R2, not S3.
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "SNS_PLATFORM_APP_ARN_ANDROID",

  "FIREBASE_SERVICE_ACCOUNT_JSON",

  "CLICK_FRAUD_THRESHOLD",

  "CLOUDFLARE_REALTIME_APP_ID",
  "CLOUDFLARE_REALTIME_APP_TOKEN",

  "APNS_KEY_PATH",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_VOIP_BUNDLE_ID",
];

export class BsmartDev extends Container {
  defaultPort = 5000;
  sleepAfter = "30m";
  pingEndpoint = "api/health";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { NODE_ENV: "production" };
    for (const key of ENV_KEYS) {
      if (env[key] !== undefined) this.envVars[key] = env[key];
    }
  }
}

// Identical to BsmartDev — kept as a separate class (rather than reusing
// BsmartDev under a second binding) so the production Worker's own
// wrangler config/migration history never touches the dev one.
export class BsmartProd extends Container {
  defaultPort = 5000;
  sleepAfter = "30m";
  pingEndpoint = "api/health";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { NODE_ENV: "production" };
    for (const key of ENV_KEYS) {
      if (env[key] !== undefined) this.envVars[key] = env[key];
    }
  }
}

export default {
  async fetch(request, env) {
    // Each deployed Worker (dev vs. production) only ever has one of these
    // two bindings defined, per its own wrangler config — so this never
    // actually chooses between two live containers on the same deployment.
    const container = getContainer(env.BSMART_PROD || env.BSMART_DEV);
    return container.fetch(request);
  },
};
