// Shared formatting for anonymized community flips (Dashboard ticker,
// Community feed/leaderboard). The credibility of these rows comes from
// the real item/buy/sell/profit/days details, NOT from a person label -
// showing the same "A reseller" text on every row is what made real data
// read as templated/fake. These formatters lead with the real specifics
// and rotate between several real phrasings so a scrolling list doesn't
// look like one string on loop.
import { CommunityFlip } from "./api";

function dayWord(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

// Stable per-flip hash (not Math.random()) so the SAME flip always picks
// the SAME template on every re-render - only different flips, which
// naturally have different item/date/profit, land on different templates.
// Exported so other per-flip-but-consistent choices (e.g. avatarForFlip
// below) can reuse the same hash instead of each rolling their own.
export function stableIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

// Reseller-relevant emoji set for the community feed avatar - every row
// used to render the identical 🛍️, which read as one templated card
// repeated N times. Hashing on item_name (real, always-present data) keeps
// the SAME flip on the SAME emoji across re-renders/refreshes while
// different flips land on different ones - no identity implied, just visual
// variety across a real, varied set of items.
const AVATAR_EMOJIS = ["👟","👜","⌚","📱","🎮","🧥","👕","💍","🎨","📚","🏀","🧸","🪑","💻"];
export function avatarForFlip(flip: CommunityFlip): string {
  return AVATAR_EMOJIS[stableIndex(flip.item_name, AVATAR_EMOJIS.length)];
}

// Dashboard ticker: the longer "bought $X, sold $Y" phrasing put the item
// name at the END of the string, so a single numberOfLines-truncated Text
// node would clip the item mid-word AND still risk crowding out the
// profit - the one number that actually has to stay visible (it's the
// hook). Kept deliberately dumb: item first, profit last, nothing else -
// the caller renders these as two separate Text nodes (item ellipsizes,
// profit never shrinks) rather than one pre-joined string, so profit can
// never be the part that gets cut.
export function formatTickerItem(flip: CommunityFlip): string {
  return flip.item_name;
}
export function formatTickerProfit(flip: CommunityFlip): string {
  return `+$${flip.profit}`;
}

// Detail line for feed/leaderboard cards (item name is already its own
// bold line above this - this is the subtitle, replacing what used to be
// a repeated "A reseller" identity line).
export function formatFeedDetail(flip: CommunityFlip): string {
  const hasBuySell = flip.buy_price != null && flip.sell_price != null;
  const hasDays = flip.days_to_sale != null;
  const parts: string[] = [];
  if (hasBuySell) parts.push(`Bought $${flip.buy_price} → sold $${flip.sell_price}`);
  else if (hasDays) parts.push(`Sold in ${dayWord(flip.days_to_sale!)}`);
  if (flip.platform) parts.push(flip.platform);
  return parts.length ? parts.join(" · ") : "Real community flip";
}
