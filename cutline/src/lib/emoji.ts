/**
 * Emoji and keyword picks made on the phone, with no network: a curated
 * dictionary of common creator-video words, and a few rules for which words
 * deserve the emphasis colour. Both are deterministic and run in a few
 * milliseconds on a long transcript.
 */
import { isFiller } from './cuts'
import type { Word } from './types'

/**
 * Emoji, then the words that suggest it. A word ending in ! is a strong,
 * vivid match; one ending in ~ is weak, used only when nothing better is
 * near. Base forms only: plurals, -ing and -ed are found by stemming.
 * Words with a second meaning that would land badly ("fired", "shot")
 * are left out on purpose.
 */
export const EMOJI_DICTIONARY: readonly (readonly [string, string])[] = [
  // money and work
  ['💰', 'money! cash! income salary profit! earnings revenue wealth wealthy fortune million millions'],
  ['💵', 'dollar bucks paycheck'],
  ['🤑', 'rich! millionaire! billionaire! billion'],
  ['💸', 'expensive spend spending budget cost costs'],
  ['💳', 'credit debit payment pay'],
  ['🏦', 'bank banking loan mortgage'],
  ['📈', 'growth invest! investing investment stocks increase trending'],
  ['💼', 'business! job career office~ work~ boss'],
  ['🏢', 'company corporate'],
  ['🤝', 'deal partnership partner team teamwork collab collaboration'],
  ['🛍️', 'shopping shop haul mall'],
  ['🛒', 'groceries grocery cart'],
  ['🏷️', 'price sale discount cheap coupon'],
  ['🆓', 'free!'],
  ['🎯', 'goal! target focus aim'],
  ['🏆', 'win! winner champion trophy success! successful'],
  ['🥇', 'gold medal'],
  ['🚀', 'rocket! launch! startup viral! skyrocket boost'],
  ['💡', 'idea! tip tips hack hacks lightbulb insight genius'],
  ['🧠', 'brain! smart mindset psychology memory'],
  ['📚', 'book books study studying library education'],
  ['🎓', 'college university graduate graduation degree student'],
  ['🏫', 'school teacher'],
  ['📝', 'notes list plan planning checklist'],
  ['✍️', 'journal journaling'],
  ['❓', 'question'],
  ['🤔', 'curious wonder'],
  ['✅', 'done finished complete'],
  ['❌', 'mistake wrong~ fail failure'],
  ['⚠️', 'warning careful danger risk risky problem~'],
  ['🛑', 'stop'],
  ['🤫', 'secret! quiet shh'],
  ['🔑', 'key! unlock'],
  ['🔒', 'lock privacy security secure password'],
  // time
  ['⏰', 'time~ clock alarm late hour~'],
  ['⏳', 'deadline wait~ patience'],
  ['⏱️', 'minute timer seconds~'],
  ['⚡', 'fast! quick quickly speed instant energy power~'],
  ['🐢', 'slow slowly'],
  ['🌅', 'morning! sunrise early~'],
  ['🌙', 'night! tonight midnight moon'],
  ['😴', 'sleep! sleepy tired nap'],
  ['📅', 'today~ tomorrow schedule calendar week~ monday tuesday wednesday thursday friday'],
  ['🎂', 'birthday!'],
  ['🎉', 'party! celebrate celebration congrats congratulations weekend saturday sunday'],
  ['🎁', 'gift giveaway!'],
  ['🎄', 'christmas'],
  ['🎃', 'halloween'],
  // weather, places, travel
  ['❄️', 'winter snow freezing'],
  ['☀️', 'summer sun sunny sunshine'],
  ['🌸', 'spring flower blossom'],
  ['🍂', 'autumn'],
  ['🌧️', 'rain rainy'],
  ['🌊', 'ocean sea wave surf'],
  ['🏖️', 'beach vacation holiday'],
  ['🏝️', 'island tropical'],
  ['⛰️', 'mountain'],
  ['🥾', 'hike trail'],
  ['🏕️', 'camping camp tent'],
  ['✈️', 'travel! flight plane airport trip'],
  ['🌍', 'world! earth planet global globe international climate environment'],
  ['🧭', 'adventure explore journey'],
  ['🗺️', 'map'],
  ['🏨', 'hotel'],
  ['🚗', 'car drive road~'],
  ['🚲', 'bike cycling'],
  ['🏠', 'home! house apartment'],
  ['🛏️', 'bed bedroom'],
  ['🏡', 'family'],
  // food and drink
  ['🍳', 'cook breakfast kitchen recipe'],
  ['🍔', 'food! burger'],
  ['🍕', 'pizza!'],
  ['🌮', 'taco'],
  ['🍣', 'sushi'],
  ['🍝', 'pasta spaghetti'],
  ['🍜', 'ramen noodles soup'],
  ['🥗', 'salad healthy diet'],
  ['🍰', 'cake dessert'],
  ['🍪', 'cookie'],
  ['🍫', 'chocolate'],
  ['🍩', 'donut'],
  ['🍿', 'popcorn snack'],
  ['🍎', 'apple fruit'],
  ['🥑', 'avocado'],
  ['🍗', 'chicken'],
  ['🥩', 'steak meat'],
  ['🥚', 'egg'],
  ['🧀', 'cheese'],
  ['🍞', 'bread toast'],
  ['☕', 'coffee! cafe espresso latte'],
  ['🍵', 'tea matcha'],
  ['💧', 'water hydrate hydration'],
  ['🍷', 'wine'],
  ['🍺', 'beer'],
  ['🌶️', 'spicy'],
  ['😋', 'delicious! yummy tasty hungry'],
  ['🍽️', 'dinner lunch eat~ restaurant meal'],
  // feelings
  ['❤️', 'love! heart romance romantic'],
  ['😍', 'obsessed gorgeous adorable'],
  ['😊', 'happy happiness smile glad'],
  ['😂', 'funny! laugh joke lol hilarious'],
  ['😢', 'sad cry tears upset'],
  ['💔', 'heartbreak heartbroken breakup broken'],
  ['😠', 'angry annoyed annoying frustrated frustrating'],
  ['😱', 'scary scared shocking shocked terrifying omg'],
  ['😨', 'fear afraid'],
  ['😬', 'nervous awkward anxious anxiety'],
  ['😫', 'stress stressful exhausted'],
  ['🤩', 'amazing! excited! exciting incredible awesome'],
  ['🤯', 'insane! mindblowing unbelievable'],
  ['😮', 'wow! surprise surprising'],
  ['😎', 'cool chill confident'],
  ['😌', 'relax calm peaceful'],
  ['🙏', 'thanks thank grateful gratitude please~ blessed'],
  ['🤞', 'hope hopefully wish'],
  ['🍀', 'luck lucky'],
  ['😅', 'oops embarrassing'],
  ['🥱', 'boring bored'],
  ['😕', 'confused confusing'],
  ['🤗', 'hug welcome~'],
  ['👋', 'hello hey~ hi~ bye goodbye'],
  ['👻', 'ghost ghosted'],
  ['👏', 'applause clap proud'],
  ['🙌', 'yay hooray'],
  ['🫶', 'community support supportive'],
  // body and health
  ['💪', 'gym! workout! strong strength muscle fitness exercise protein'],
  ['🏋️', 'lifting weights'],
  ['🏃', 'run runner marathon cardio'],
  ['🧘', 'yoga meditation meditate mindfulness breathe'],
  ['🩺', 'doctor health medical'],
  ['💊', 'medicine vitamins supplements'],
  ['🦷', 'teeth dentist'],
  ['💇', 'hair haircut'],
  ['💄', 'makeup lipstick beauty'],
  ['🧴', 'skincare skin lotion sunscreen'],
  ['💅', 'nails manicure'],
  ['👗', 'dress fashion outfit'],
  ['👟', 'shoes sneakers'],
  ['👕', 'shirt clothes clothing'],
  ['👓', 'glasses'],
  ['💍', 'wedding married engaged marriage'],
  ['👶', 'baby babies'],
  ['🧒', 'kids kid children child'],
  // animals
  ['🐶', 'dog puppy puppies'],
  ['🐱', 'cat kitten kitty'],
  ['🐾', 'pet'],
  ['🐦', 'bird'],
  ['🐟', 'fish fishing'],
  ['🐻', 'bear'],
  ['🦁', 'lion'],
  ['🐝', 'bee'],
  ['🦋', 'butterfly'],
  ['🦄', 'unicorn'],
  ['🦖', 'dinosaur'],
  ['🦈', 'shark'],
  ['🐐', 'goat'],
  ['🐴', 'horse'],
  // tech and making things
  ['📱', 'phone! iphone smartphone app mobile'],
  ['💻', 'computer laptop code coding programming software tech technology developer'],
  ['🤖', 'ai! robot automation'],
  ['🌐', 'internet website online web'],
  ['📶', 'wifi'],
  ['🔋', 'battery charge charging'],
  ['📷', 'camera'],
  ['📸', 'photo picture selfie'],
  ['🎥', 'video! filming record recording vlog'],
  ['🎬', 'movie film cinema content creator'],
  ['✂️', 'edit editing'],
  ['🎙️', 'podcast mic microphone interview'],
  ['🎤', 'sing singer karaoke concert'],
  ['🎵', 'music! song playlist'],
  ['🎧', 'listen headphones'],
  ['🎸', 'guitar'],
  ['🎹', 'piano'],
  ['🥁', 'drums drummer'],
  ['🎨', 'art artist design designer creative paint painting draw drawing color colors'],
  ['🎮', 'game gaming gamer'],
  ['⚽', 'soccer'],
  ['🏀', 'basketball'],
  ['🎾', 'tennis'],
  ['⛳', 'golf'],
  ['🏊', 'swim swimming pool'],
  ['📖', 'story stories'],
  ['📰', 'news'],
  ['📧', 'email inbox'],
  ['💬', 'comment! chat message text~'],
  ['🔔', 'subscribe! notification bell'],
  ['👍', 'likes recommend'],
  ['👀', 'eyes views sneak peek'],
  ['💯', '100! hundred'],
  ['📊', 'data stats statistics chart results numbers percent percentage analytics'],
  ['🔬', 'science research scientist experiment'],
  ['🧪', 'chemistry lab'],
  ['🛠️', 'tools tool build fix diy setup'],
  ['⚙️', 'settings system process'],
  ['🔍', 'search'],
  ['🔗', 'link'],
  ['🆕', 'new~ brandnew'],
  ['✨', 'magic! beautiful sparkle glow aesthetic vibe vibes'],
  ['🔥', 'fire! motivation motivated passion streak'],
  ['💥', 'boom! explosion impact massive'],
  ['👑', 'king queen crown royal'],
  ['💎', 'diamond gem valuable'],
  ['⭐', 'star rating review'],
  ['🌈', 'rainbow'],
  ['🌱', 'plant grow vegan sustainable'],
  ['🌳', 'tree forest park nature'],
  ['♻️', 'recycle recycling'],
  ['🧹', 'clean cleaning declutter organize organized'],
  ['🧺', 'laundry'],
  ['🗑️', 'trash garbage'],
  ['📦', 'package box delivery unboxing'],
  ['🚚', 'shipping truck moving'],
  ['🗣️', 'talk speak speech voice'],
  ['👥', 'audience followers people~'],
  ['❗', 'important! attention'],
  ['🚨', 'alert emergency'],
  ['🔄', 'routine repeat'],
  ['📍', 'location'],
]

interface Match {
  emoji: string
  /** 3 vivid, 2 ordinary, 1 weak. */
  strength: number
}

const DICTIONARY = new Map<string, Match>()
for (const [emoji, list] of EMOJI_DICTIONARY) {
  for (const entry of list.split(' ')) {
    const strength = entry.endsWith('!') ? 3 : entry.endsWith('~') ? 1 : 2
    const word = entry.replace(/[!~]$/, '')
    if (!DICTIONARY.has(word)) DICTIONARY.set(word, { emoji, strength })
  }
}

/** Forms that would stem onto a dictionary word with the wrong meaning. */
const NEVER = new Set(['fired', 'firing', 'fires', 'tipped', 'tipping', 'killing', 'boxing', 'starring', 'wished'])

/** Lowercase, apostrophes dropped, anything but letters and digits stripped. */
function bare(text: string): string {
  return text.toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]/gu, '')
}

/** The word and the base forms it might be: plurals, -ing, -ed. */
function forms(w: string): string[] {
  const out = [w]
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    out.push(w.slice(0, -1))
    if (w.endsWith('es')) out.push(w.slice(0, -2))
    if (w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`)
  }
  if (w.length > 5 && w.endsWith('ing')) {
    const stem = w.slice(0, -3)
    out.push(stem, `${stem}e`)
    if (/(.)\1$/.test(stem)) out.push(stem.slice(0, -1))
  }
  if (w.length > 4 && w.endsWith('ed')) {
    const stem = w.slice(0, -2)
    out.push(stem, `${stem}e`)
    if (/(.)\1$/.test(stem)) out.push(stem.slice(0, -1))
    if (w.endsWith('ied')) out.push(`${w.slice(0, -3)}y`)
  }
  return out
}

function match(text: string): Match | null {
  const raw = text.trim()
  // Amounts of money read as money, and 100% as 💯, whatever the number.
  if (/^[$€£¥]\d/.test(raw)) return { emoji: '💰', strength: 2 }
  if (/^100%?[.,!?]*$/.test(raw)) return { emoji: '💯', strength: 3 }
  // The dictionary is curated, so it alone decides; stopwords only matter for emphasis.
  const w = bare(raw)
  if (!w || NEVER.has(w) || isFiller(raw)) return null
  for (const form of forms(w)) {
    const hit = DICTIONARY.get(form)
    if (hit) return hit
  }
  return null
}

/** The dictionary's emoji for one word, or null. */
export function emojiFor(text: string): string | null {
  return match(text)?.emoji ?? null
}

/** Emojis this many words apart at least: about one per caption page. */
const EMOJI_SPACING = 4
/** A weak match needs more room around it. */
const WEAK_SPACING = 8
/** The same emoji doesn't come back within this many words. */
const REPEAT_SPACING = 16

/**
 * Keyword to emoji suggestions without any network, from the dictionary
 * above. At most one emoji every ~4 words (one per caption page or so),
 * stronger matches first, the same emoji not repeated close together.
 * Removed words get none. Returns wordId to emoji.
 */
export function suggestEmojis(words: Word[]): Map<string, string> {
  const live = words.filter((w) => !w.removed)
  const found = live.flatMap((w, i) => {
    const m = match(w.text)
    return m ? [{ i, id: w.id, ...m }] : []
  })
  found.sort((a, b) => b.strength - a.strength || a.i - b.i)
  const taken: { i: number; emoji: string }[] = []
  const out = new Map<string, string>()
  for (const c of found) {
    const room = c.strength === 1 ? WEAK_SPACING : EMOJI_SPACING
    const crowded = taken.some(
      (t) => Math.abs(t.i - c.i) < room || (t.emoji === c.emoji && Math.abs(t.i - c.i) < REPEAT_SPACING),
    )
    if (crowded) continue
    taken.push({ i: c.i, emoji: c.emoji })
    out.set(c.id, c.emoji)
  }
  return out
}

/** About one word in this many gets the emphasis colour, at most. */
const EMPHASIS_EVERY = 7
/** Emphasised words this many words apart at least. */
const EMPHASIS_SPACING = 4
const NUMBER_WORDS = new Set(['hundred', 'thousand', 'million', 'millions', 'billion', 'billions', 'trillion', 'double', 'triple', 'twice', 'half'])
/** Upper-case words that are just how the word is written, not shouting. */
const PLAIN_CAPS = new Set(['I', 'OK', 'A'])

/**
 * Keyword picks for the emphasis colour without any network: numbers,
 * money and percentages first, then ALL-CAPS words, words carrying an "!",
 * and long or unusual content words, never stopwords or fillers. A word
 * the speaker keeps repeating stops being special. At most about one word
 * in seven, spread out. Returns word ids.
 */
export function suggestEmphasis(words: Word[]): Set<string> {
  const live = words.filter((w) => !w.removed && !isFiller(w.text))
  const counts = new Map<string, number>()
  for (const w of live) {
    const b = bare(w.text)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  const scored = live.flatMap((w, i) => {
    const s = score(w.text, counts)
    return s > 0 ? [{ i, id: w.id, s }] : []
  })
  scored.sort((a, b) => b.s - a.s || a.i - b.i)
  const budget = Math.max(1, Math.floor(live.length / EMPHASIS_EVERY))
  const taken: number[] = []
  const out = new Set<string>()
  for (const c of scored) {
    if (out.size >= budget) break
    if (taken.some((t) => Math.abs(t - c.i) < EMPHASIS_SPACING)) continue
    taken.push(c.i)
    out.add(c.id)
  }
  return out
}

/** How much a word deserves the emphasis colour; 0 for not at all. */
function score(text: string, counts: ReadonlyMap<string, number>): number {
  const raw = text.trim()
  const b = bare(raw)
  if (!b || STOPWORDS.has(b)) return 0
  const letters = raw.replace(/[^\p{L}]/gu, '')
  const exclaims = /!["'”’)]*$/.test(raw)
  if (/\d/.test(b) || /^[$€£¥]/.test(raw) || NUMBER_WORDS.has(b)) return 6 + (exclaims ? 1 : 0)
  let s = 0
  if (letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase() && !PLAIN_CAPS.has(letters)) s += 4
  if (exclaims) s += 3
  if (letters.length >= 7) s += 2 + Math.min(1.5, (letters.length - 7) * 0.3)
  else if (letters.length >= 5 && counts.get(b) === 1) s += 1
  const m = match(raw)
  if (m && m.strength >= 2) s += m.strength - 1
  // Said over and over, it's the topic rather than a highlight.
  if ((counts.get(b) ?? 0) > 3) s -= 1.5
  return s >= 2 ? s : 0
}

const STOPWORDS = new Set(
  `a an the and or but nor if so to of in on at by for with from up down out off about into onto over under
  after before then than too very just also really actually basically literally honestly totally like kind sort
  thing things stuff i me my mine myself you your yours yourself yall he him his she her hers it its we us our
  ours they them their theirs this that these those there here what which who whom whose when where why how
  all any both each few more most other others some such no not only own same can could will would shall should
  may might must do does did doing done have has had having be is am are was were been being get got gets
  getting gotten go goes going gone went come comes came coming make makes made making know knew known think
  thought say says said see saw seen look looks want wants need needs let lets gonna wanna gotta yeah yes yep
  okay ok oh well im youre hes shes its were theyre ive youve weve theyve ill youll well theyll id youd dont
  doesnt didnt cant couldnt wont wouldnt shouldnt isnt arent wasnt werent havent hasnt hadnt thats whats
  theres heres lets guys everyone everybody something anything nothing everything someone anyone somebody
  anybody one ones way lot lots maybe now right back again still even much many because cause cuz while
  through though although around always never ever every whatever mean means sure pretty quite gets put take
  takes took give gives gave tell told try trying use used using day days year years first last next new old
  good great bad big little long better best part side point today time times people person`
    .split(/\s+/)
    .filter(Boolean),
)
