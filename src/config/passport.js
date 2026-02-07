const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const Wallet = require('../models/Wallet');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // 1. Check if user exists by googleId
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          return done(null, user);
        }

        // 2. Check if user exists by email
        // Note: Google provides an array of emails
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        
        if (email) {
            user = await User.findOne({ email });
            if (user) {
                // Link googleId to existing user
                user.googleId = profile.id;
                // Update avatar if not present
                if (!user.avatar_url) {
                    user.avatar_url = profile.photos && profile.photos[0] ? profile.photos[0].value : '';
                }
                await user.save();
                return done(null, user);
            }
        }

        // 3. Create new user
        // We need to generate a username since it's required. 
        // We'll use the name + random number or part of email.
        const baseUsername = profile.displayName.replace(/\s+/g, '').toLowerCase();
        const uniqueUsername = `${baseUsername}${Math.floor(Math.random() * 10000)}`;

        const newUser = new User({
          googleId: profile.id,
          username: uniqueUsername,
          email: email,
          full_name: profile.displayName,
          avatar_url: profile.photos && profile.photos[0] ? profile.photos[0].value : '',
          provider: 'google',
          // Default role for OAuth users
          role: 'member'
        });

        await newUser.save();
        
        // Create Wallet for new Google user
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

module.exports = passport;
