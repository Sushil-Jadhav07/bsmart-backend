// ─── Re-ranking: diversity, exploration, promotion blending ─────────────────
// Items here only need { key, type, authorId, topics }.

// Greedy re-rank with soft caps. An item that would break a cap is deferred,
// not dropped — when nothing else fits, the best remaining item is used — so
// a platform with few creators never ends up with an empty feed.
const diversify = (items, opts = {}) => {
  const { window = 10, maxPerAuthor = 2, maxPerTopic = 3, maxConsecutiveType = 3 } = opts;
  const out = [];
  const pending = items.slice();

  const fits = (item) => {
    const recent = out.slice(-window);
    const sameAuthor = recent.filter((r) => r.authorId && r.authorId === item.authorId).length;
    if (sameAuthor >= maxPerAuthor) return false;
    const topic = item.topics?.[0];
    if (topic && recent.filter((r) => r.topics?.[0] === topic).length >= maxPerTopic) return false;
    if (maxConsecutiveType > 0 && out.length >= maxConsecutiveType) {
      const tail = out.slice(-maxConsecutiveType);
      if (tail.every((r) => r.type === item.type)) return false;
    }
    return true;
  };

  while (pending.length) {
    const index = pending.findIndex(fits);
    out.push(pending.splice(index === -1 ? 0 : index, 1)[0]);
  }
  return out;
};

// Reserves roughly `rate` of the slots for exploration items (new content from
// creators the viewer does not follow), so fresh posts get measured at all.
const injectExploration = (ranked, pool, rate) => {
  if (!(rate > 0) || !pool.length) return ranked.slice();
  const every = Math.max(2, Math.round(1 / rate));
  const used = new Set();
  const out = [];
  let r = 0;
  let p = 0;

  const nextFrom = (list, cursor) => {
    let i = cursor;
    while (i < list.length && used.has(list[i].key)) i++;
    return i;
  };

  while (true) {
    const slotIsExploration = (out.length + 1) % every === 0;
    p = nextFrom(pool, p);
    r = nextFrom(ranked, r);
    let item = null;
    if (slotIsExploration && p < pool.length) {
      item = { ...pool[p], exploration: true };
      p++;
    } else if (r < ranked.length) {
      item = ranked[r];
      r++;
    } else if (p < pool.length) {
      item = { ...pool[p], exploration: true };
      p++;
    }
    if (!item) break;
    used.add(item.key);
    out.push(item);
  }
  return out;
};

// Promotions go after `firstSlot` organic items, then after every `every`.
const interleave = (organic, promos, { every, firstSlot }) => {
  if (!(every > 0) || !promos.length) return organic.slice();
  const first = firstSlot > 0 ? firstSlot : every;
  const out = [];
  let p = 0;
  organic.forEach((item, i) => {
    out.push(item);
    const count = i + 1;
    if (p < promos.length && count >= first && (count - first) % every === 0) out.push(promos[p++]);
  });
  return out;
};

module.exports = { diversify, injectExploration, interleave };
