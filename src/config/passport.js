const passport = require('passport');
const jwt = require('jsonwebtoken');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const User = require('../models/User');

const Wallet = require('../models/Wallet');

const hasGoogleEnv =
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALLBACK_URL;

if (hasGoogleEnv) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });
          if (user) {
            return done(null, user);
          }
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              user.googleId = profile.id;
              if (!user.avatar_url) {
                user.avatar_url = profile.photos && profile.photos[0] ? profile.photos[0].value : '';
              }
              await user.save();
              return done(null, user);
            }
          }
          const baseUsername = profile.displayName.replace(/\s+/g, '').toLowerCase();
          const uniqueUsername = `${baseUsername}${Math.floor(Math.random() * 10000)}`;
          const newUser = new User({
            googleId: profile.id,
            username: uniqueUsername,
            email: email,
            full_name: profile.displayName,
            avatar_url: profile.photos && profile.photos[0] ? profile.photos[0].value : '',
            provider: 'google',
            role: 'member'
          });
          await newUser.save();
          await Wallet.create({
            user_id: newUser._id,
            balance: 0
          });
          done(null, newUser);
        } catch (error) {
          done(error, null);
        }
      }
    )
  );
}

const hasAppleEnv =
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY_PATH &&
  process.env.APPLE_CALLBACK_URL;

if (hasAppleEnv) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
        callbackURL: process.env.APPLE_CALLBACK_URL,
        passReqToCallback: true,
        scope: ['name', 'email'],
      },
      // idToken here is the raw encoded JWT string — passport-apple does not
      // decode it for you.
      async (req, accessToken, refreshToken, idToken, profile, done) => {
        try {
          const decoded = jwt.decode(idToken) || {};
          const appleId = decoded.sub;
          if (!appleId) {
            return done(new Error('Apple token missing sub (user id)'), null);
          }

          let user = await User.findOne({ appleId });
          if (user) {
            return done(null, user);
          }

          const email = decoded.email || null;
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              user.appleId = appleId;
              await user.save();
              return done(null, user);
            }
          }

          // Apple only ever sends the user's name once — on the very first
          // authorization — as a JSON string in req.body.user. There is no
          // other opportunity to capture it.
          let fullName = '';
          if (req.body && req.body.user) {
            try {
              const parsedUser = JSON.parse(req.body.user);
              const nameObj = parsedUser?.name || {};
              fullName = [nameObj.firstName, nameObj.lastName].filter(Boolean).join(' ');
            } catch {
              // malformed/absent — fall back to a generated name below
            }
          }

          const baseUsername = (fullName || (email ? email.split('@')[0] : 'appleuser'))
            .replace(/\s+/g, '')
            .toLowerCase();
          const uniqueUsername = `${baseUsername}${Math.floor(Math.random() * 10000)}`;

          const newUser = new User({
            appleId,
            username: uniqueUsername,
            email,
            full_name: fullName || uniqueUsername,
            provider: 'apple',
            role: 'member',
          });
          await newUser.save();
          await Wallet.create({
            user_id: newUser._id,
            balance: 0,
          });
          done(null, newUser);
        } catch (error) {
          done(error, null);
        }
      }
    )
  );
}

module.exports = passport;
