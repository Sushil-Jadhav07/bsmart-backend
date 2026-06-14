const Follow = require('../models/Follow');

/**
 * Returns 'owner' | 'follower' | 'public'
 * - owner  → the viewer IS the profile owner
 * - follower → viewer follows the owner
 * - public → everyone else (including unauthenticated)
 */
async function getViewerRelationship(viewerId, ownerId) {
  if (!viewerId) return 'public';
  if (String(viewerId) === String(ownerId)) return 'owner';
  const isFollowing = await Follow.exists({ follower_id: viewerId, followed_id: ownerId });
  return isFollowing ? 'follower' : 'public';
}

/**
 * Given a visibility string and the viewer's relationship, returns true if allowed.
 * - 'everyone'       → always allowed
 * - 'followers_only' → only owner or followers
 * - 'nobody'         → only the owner themselves
 */
function canView(visibility, relationship) {
  if (relationship === 'owner') return true;
  if (!visibility || visibility === 'everyone') return true;
  if (visibility === 'followers_only') return relationship === 'follower';
  // 'nobody'
  return false;
}

/**
 * Convenience: fetch relationship once and check multiple sections in one go.
 * Returns { relationship, sections: { sectionName: bool, ... } }
 *
 * @param {string|ObjectId|null} viewerId
 * @param {object} owner — lean User object with _id and privacy populated
 * @param {string[]} sections — keys from owner.privacy.profile_visibility + 'messaging'
 */
async function checkSections(viewerId, owner, sections) {
  const relationship = await getViewerRelationship(viewerId, owner._id);
  const result = { relationship };
  const pv = owner?.privacy?.profile_visibility || {};
  for (const section of sections) {
    const visibility = pv[section] ?? 'everyone';
    result[section] = canView(visibility, relationship);
  }
  return result;
}

module.exports = { getViewerRelationship, canView, checkSections };
