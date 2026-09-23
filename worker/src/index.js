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

  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",

  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",

  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_MAILTO",

  "SNS_PLATFORM_APP_ARN_ANDROID",

  "FIREBASE_SERVICE_ACCOUNT_JSON",

  "CLICK_FRAUD_THRESHOLD",
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

export default {
  async fetch(request, env) {
    const container = getContainer(env.BSMART_DEV);
    return container.fetch(request);
  },
};
