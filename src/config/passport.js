const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
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

module.exports = passport;
