import passport from 'passport';
import { redisClient } from '../redis-client.js';

async function findUserById(id) {
  try {
    if (!redisClient) return null;
    const data = await redisClient.get(id);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

passport.serializeUser((user, done) => {
  done(null, user.id || user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id);
    return done(null, user || false);
  } catch (e) {
    return done(e);
  }
});

export default passport;
