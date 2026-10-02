import type { Sex } from '../face/types'
import type { Advice, AdviceKind, MetricText } from './types'

const advice =
  (kind: AdviceKind) =>
  (text: string, only?: Sex): Advice =>
    only ? { kind, text, only } : { kind, text }
const style = advice('style')
const grooming = advice('grooming')
const makeup = advice('makeup')
const habits = advice('habits')
/** Information only: phrased as what a specialist might discuss, never as a recommendation. */
const clinical = advice('clinical')
/** Facial hair, shown only for the male comparison. */
const beard = (text: string): Advice => ({ kind: 'grooming', text, only: 'male' })

/**
 * The words for every measurement, keyed by metric id and then by result key.
 * Ranges describe averages of the faces studied; a result outside one is a
 * difference, and the copy treats it that way.
 */
export const METRIC_TEXT: Record<string, MetricText> = {
  // Proportions

  thirds: {
    title: 'Facial thirds',
    measures: 'Your face’s height from hairline to chin, split at the brow line between your brows and at the base of your nose.',
    why: 'The neoclassical canon divides a balanced face into three equal parts: forehead, midface and lower face. Real faces often depart from it, as Farkas’s anthropometric surveys showed, and a slightly longer lower third is common and reads more masculine.',
    note: 'If your hairline couldn’t be found, only the middle and lower thirds are compared. Hairlines shift with age and styling, so treat the upper third as the least certain of the three.',
    outcomes: {
      balanced: {
        verdict: 'Balanced thirds',
        meaning: 'Your forehead, midface and lower face are close to equal in height, the classical proportion. It gives the face an even rhythm from top to bottom, so no one zone dominates.',
        advice: [style('Fringes, side parts and off-the-face styles all keep this balance, so choose by hair texture and taste.')],
      },
      'upper-long': {
        verdict: 'Longer upper third',
        meaning: 'Your forehead takes up more than its third of your face’s height. It draws attention upwards and can make the features below look shorter by comparison.',
        advice: [
          style('A fringe, whether full, wispy or curtain, shortens the visible forehead and brings focus to the eyes.', 'female'),
          style('A textured crop or forward-styled fringe shortens the forehead; slicked-back styles show its full height.', 'male'),
          makeup('Bronzer blended along the hairline and temples, a shade deeper than your skin, visually lowers a tall forehead.', 'female'),
          grooming('Keep your brows full and well defined; a strong brow line breaks up the height above the eyes.'),
          habits('Hold the camera at eye level or slightly below; shooting from above enlarges the forehead.'),
          clinical('Options a specialist might discuss include hairline-lowering surgery or a hair transplant to bring the hairline forward.'),
        ],
      },
      'upper-short': {
        verdict: 'Shorter upper third',
        meaning: 'Your forehead takes up less than its third of your face’s height. A lower hairline frames the face closely and puts more visual weight on the eyes, nose and jaw.',
        advice: [
          style('Off-the-face styles and side parts show the forehead’s full height; heavy, blunt fringes shorten it further.', 'female'),
          style('Height at the front, as in a quiff or a textured, swept-up top, adds length above the brows.', 'male'),
          makeup('A soft highlight down the centre of the forehead catches the light and makes it look taller.'),
          grooming('Tidying fine stray hairs along the hairline, by threading or waxing, gives a crisper, slightly higher edge.'),
          habits('A camera slightly above eye level gives the forehead more presence in photos.'),
          clinical('Clinics offer laser hair removal along the hairline, which can raise it slightly.'),
        ],
      },
      'middle-long': {
        verdict: 'Longer middle third',
        meaning: 'The zone from your brow line to the base of your nose takes up more than its share of your face’s height, which usually reflects a longer nose. It reads mature and composed, and gives the nose more prominence.',
        advice: [
          makeup('Stop the highlight on your nose before the tip and shade just under the tip; it shortens the nose visually.'),
          style('Glasses with a low, solid bridge sit across the nose and visually shorten the middle third.'),
          style('Volume at cheekbone level, from waves or face-framing layers, adds width that balances the length.', 'female'),
          beard('A beard with some fullness at the sides adds width and draws attention away from the midface’s length.'),
          habits('Keep your chin level in photos; tipping it down makes the nose and middle third look longer.'),
          clinical('Options a specialist might discuss include rhinoplasty to shorten the nose or lift its tip.'),
        ],
      },
      'middle-short': {
        verdict: 'Shorter middle third',
        meaning: 'The zone from your brow line to the base of your nose takes up less than its share of your face’s height, which usually means a shorter nose. It reads youthful and compact, and gives the forehead and lower face more presence.',
        advice: [
          makeup('Run the nose highlight the full length of the bridge, right to the tip, to lengthen it visually.'),
          style('Glasses with a high or keyhole bridge show more of the nose and lengthen the middle third.'),
          habits('A camera slightly above eye level makes the nose look a little longer in photos.'),
        ],
      },
      'lower-long': {
        verdict: 'Longer lower third',
        meaning: 'The zone from the base of your nose to your chin takes up more than its share of your face’s height. A slightly longer lower third is common and reads strong and more masculine; well beyond the range it can make the whole face look long.',
        advice: [
          beard('Keep the beard short under the chin and fuller at the sides to add width rather than length.'),
          makeup('Bronzer blended just under the tip of the chin shortens the lower face visually.', 'female'),
          style('Volume at jaw or chin level, as in a textured lob or soft waves, balances a longer lower face.', 'female'),
          style('Keep height on top modest and the sides fuller; tall styles add to the face’s length.', 'male'),
          habits('Hold the camera at eye level or slightly above; low angles enlarge the chin and jaw.'),
          clinical('Options a specialist might discuss include an orthodontic or jaw assessment, or chin reduction (genioplasty) where the chin itself is long.'),
        ],
      },
      'lower-short': {
        verdict: 'Shorter lower third',
        meaning: 'The zone from the base of your nose to your chin takes up less than its share of your face’s height, which puts more weight on the forehead and midface. It reads youthful and soft, and the chin can look less prominent.',
        advice: [
          beard('A beard grown slightly longer at the chin and shorter at the sides lengthens the lower face.'),
          makeup('A touch of highlight on the centre of the chin brings it forward and adds apparent length.'),
          style('V-necks and open collars extend the line below the chin.'),
          habits('A camera slightly below eye level gives the chin and jaw more presence in photos.'),
          clinical('Options a specialist might discuss include chin filler or an implant to add height, or an orthodontic assessment of the bite.'),
        ],
      },
    },
  },

  fifths: {
    title: 'Facial fifths',
    measures: 'Your face’s width between the cheekbones, divided at the outer and inner corners of each eye into five parts.',
    why: 'The neoclassical canon divides the face into five equal eye-widths from ear to ear, with the gap between the eyes matching one eye. When the parts are close to their classical shares, the eyes look well placed across the face.',
    note: 'The canon runs ear to ear, but a photo shows the cheekbones far more reliably, and measured cheek to cheek the outer parts are naturally narrower. So each part is compared with its share on an ideally proportioned face: 17.5% for each outer part, 21.5% for each eye and 22% between the eyes.',
    outcomes: {
      balanced: {
        verdict: 'Balanced fifths',
        meaning: 'Your eyes, the gap between them and the outer cheeks share the width close to the classical proportions, so the eyes sit evenly across the face.',
        advice: [style('Most frames suit balanced fifths; choose a width that matches your face at the temples.')],
      },
      'outer-wide': {
        verdict: 'Wider outer fifths',
        meaning: 'The space from your outer eye corners to your cheekbones is wider than its classical share, so the eyes take up a little less of the face’s width. It often comes with broad, prominent cheekbones, which read strong.',
        advice: [
          makeup('Extend liner or shadow slightly past the outer corners to carry the eyes into the space beside them.'),
          grooming('Brows that extend a little past the outer eye corners widen the eye area.'),
          style('Frames about as wide as your cheekbones, with strong outer corners, fill the space beside the eyes.'),
          style('Face-framing layers that fall at cheekbone level soften the outer face.', 'female'),
          habits('A slight three-quarter angle in photos narrows the far cheek, so the eyes take up more of the width.'),
        ],
      },
      'outer-narrow': {
        verdict: 'Narrower outer fifths',
        meaning: 'The space from your outer eye corners to your cheekbones is narrower than its classical share, so your eyes take up more of the face’s width. The eyes look large for the face, which often reads youthful.',
        advice: [
          makeup('Sweep blush and bronzer outwards towards the temples to add width beyond the eyes.'),
          style('Volume at eye and cheek level, from waves or layers, widens the outer face.', 'female'),
          style('Keep some length at the sides rather than a tight fade to add width beside the eyes.', 'male'),
          style('Choose frames no wider than your face; frames that overhang the cheeks make the outer face look narrower.'),
          clinical('Options a specialist might discuss include cheekbone filler or implants to add width at the outer cheeks.'),
        ],
      },
      'eyes-wide': {
        verdict: 'Wider eye fifths',
        meaning: 'Each eye takes up more of the face’s width than its classical share, so the space beside or between the eyes is narrower in turn. Long, wide eyes draw attention and read expressive.',
        advice: [
          makeup('Define the lash line and inner corners rather than winging out; it keeps long eyes crisp without adding length.'),
          grooming('Keep the brow heads full and close to the inner eye corners to anchor the eyes towards the centre.'),
          style('Pick glasses with lenses comfortably wider than your eyes; narrow lenses crowd long eyes.'),
        ],
      },
      'eyes-narrow': {
        verdict: 'Narrower eye fifths',
        meaning: 'Each eye takes up less of the face’s width than its classical share, so the cheeks or the gap between the eyes take up more. The eyes can look small for the face; definition and framing help them hold their share.',
        advice: [
          makeup('A soft wing or shadow extended past the outer corner lengthens the eye horizontally.'),
          grooming('Keep the brow tails full, extending them slightly past the outer eye corners if needed, to widen the eye area.'),
          style('Frames with upswept outer corners or detail at the sides extend the line of the eyes.'),
        ],
      },
      'middle-wide': {
        verdict: 'Wider middle fifth',
        meaning: 'The gap between your inner eye corners takes up more of the face’s width than its classical share, so the eyes sit further apart. Wide-set eyes read open, calm and youthful.',
        advice: [
          makeup('Deepen the inner third of the lid and define the inner corners to draw the eyes visually closer.'),
          makeup('A soft contour down the sides of the nose bridge narrows the space between the eyes.'),
          grooming('Let the brow heads start directly above the inner eye corners, or just inside them; avoid over-plucking the centre.'),
          style('Frames with a dark or solid bridge make wide-set eyes look closer together.'),
        ],
      },
      'middle-narrow': {
        verdict: 'Narrower middle fifth',
        meaning: 'The gap between your inner eye corners takes up less of the face’s width than its classical share, so the eyes sit closer together. Close-set eyes read focused and intense, and draw attention to the centre of the face.',
        advice: [
          makeup('Brighten the inner corners and keep deeper shadow to the outer third of the lid to open up the centre.'),
          grooming('Start the brows at, or slightly outside, the inner eye corners, and keep the space between them clear.'),
          style('Glasses with a thin, light or clear bridge keep the space between the eyes open.'),
        ],
      },
    },
  },

  fwhr: {
    title: 'Facial width-to-height ratio',
    measures: 'The width between your cheekbones divided by the height from your brow line to the top of your upper lip.',
    why: 'Known as FWHR, it captures how broad the central face is for its height. Research by Weston et al. and Carré & McCormick links a higher ratio with perceived dominance and strength in men, and the comparison range for women sits a little lower.',
    note: 'Fuller cheeks add width at the cheekbones, so this ratio can shift with body weight.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your cheekbone width and midface height are in balance for your comparison, so the central face reads neither narrow nor broad.',
        advice: [habits('Light from the front and slightly to one side, rather than overhead, shows your cheekbone structure in photos.')],
      },
      low: {
        verdict: 'Narrower, longer face',
        meaning: 'Your cheekbone width is small for the height from brows to lip, so the central face reads longer and more slender. It looks refined and elegant; in men it reads less broad than average.',
        advice: [
          style('Waves, curls or layers with volume at cheekbone level add width where the face is narrowest.', 'female'),
          style('Fuller sides rather than a tight fade, with modest height on top, avoid adding length.', 'male'),
          beard('A beard kept fuller at the sides and shorter at the chin adds width to the face.'),
          makeup('Blush applied horizontally across the apples of the cheeks, rather than angled up, adds width.', 'female'),
          style('Frames with deep lenses and detailed temples add width across the face.'),
          clinical('Options a specialist might discuss include cheekbone filler or implants to add width.'),
        ],
      },
      high: {
        verdict: 'Broader, compact face',
        meaning: 'Your cheekbones are wide for the height from brows to lip, so the central face reads broad and compact. In men this is linked with a strong, dominant impression; in women it gives a bold, wide-cheeked look.',
        advice: [
          style('Height at the crown and long layers that fall past the chin add length and soften the width.', 'female'),
          style('Height on top, as in a quiff or textured crop, with shorter sides lengthens the face.', 'male'),
          beard('A beard slightly longer at the chin and shorter on the cheeks lengthens the face.'),
          makeup('Angle blush and bronzer up towards the temples rather than straight across to lengthen the face.', 'female'),
          style('Angular, rectangular frames add structure to a broad face.'),
          habits('Facial fat adds width at the cheeks; a healthy body-fat level keeps the cheekbones defined.'),
        ],
      },
    },
  },

  midface: {
    title: 'Midface ratio',
    measures: 'The distance between your pupils divided by the height from your pupils down to where your lips meet.',
    why: 'This modern facial-harmony measure compares eye spacing with midface height. Close to 1:1 the midface reads compact and balanced; a longer midface reads more mature.',
    note: 'Smiling or parting your lips moves the lip line, so keep your lips relaxed and together for this one.',
    outcomes: {
      ideal: {
        verdict: 'Compact midface',
        meaning: 'Your eye spacing and midface height are close to 1:1, so the features sit together compactly. It supports a balanced, youthful look.',
        advice: [],
      },
      low: {
        verdict: 'Longer midface',
        meaning: 'The height from your pupils to your lips is long for your eye spacing, so the features spread out vertically. It reads mature and composed, and can make the face look longer overall.',
        advice: [
          makeup('Define the lower lash line softly; it visually lowers the eyes and shortens the midface.'),
          makeup('Slightly overlining the centre of the upper lip shortens the space between nose and mouth.', 'female'),
          beard('A moustache, with or without a beard, breaks up the space between nose and lips.'),
          style('Glasses with deeper lenses fill more of the space between eyes and mouth.'),
          habits('A camera slightly above eye level foreshortens the midface a little in photos.'),
          clinical('Options a specialist might discuss include a lip lift, which shortens the space between the nose and the upper lip.'),
        ],
      },
      high: {
        verdict: 'Very compact midface',
        meaning: 'The height from your pupils to your lips is short for your eye spacing, so the features sit close together vertically. It reads youthful and wide-eyed, and the eyes can look set far apart.',
        advice: [
          makeup('A highlight down the bridge of the nose adds vertical length through the centre of the face.'),
          makeup('Deepen the inner corners of the eyes to bring widely spaced eyes visually closer.'),
          style('Frames with a dark or solid bridge bring the eyes visually closer together.'),
          grooming('Keep the brow heads full, starting just above the inner eye corners.'),
        ],
      },
    },
  },

  faceIndex: {
    title: 'Facial index',
    measures: 'The height from the top of your nose, between the eyes, to the bottom of your chin, divided by the width between your cheekbones.',
    why: 'This is the morphological facial index used in anthropometry, including Farkas’s work, to class faces from broad to long. It describes your face’s build rather than grading it.',
    note: 'The index leaves out the forehead; your face shape result covers the whole outline.',
    outcomes: {
      broad: {
        verdict: 'Broad face',
        meaning: 'Your face is wide for its height below the brows. Broad faces read strong and open, and often pair with full cheeks or a wide jaw.',
        advice: [
          style('Height at the crown and lengths that fall past the chin add vertical lines.', 'female'),
          style('Some height on top with tidy sides lengthens a broad face.', 'male'),
          style('Angular, rectangular frames add structure across a broad face.'),
        ],
      },
      medium: {
        verdict: 'Medium face',
        meaning: 'Your face’s height and width below the brows are in middle proportion, neither broad nor long. It is a versatile build for hair and frames.',
        advice: [style('Choose hairstyles and frames by your features and taste; the outline itself needs no balancing.')],
      },
      long: {
        verdict: 'Long face',
        meaning: 'Your face is tall for its width below the brows. Long faces read refined and composed, especially with defined cheekbones.',
        advice: [
          style('Chin-length cuts, curtain fringes and volume at the sides add width.', 'female'),
          style('Fuller sides and a modest top, or a textured fringe, keep a long face from looking longer.', 'male'),
          style('Deep frames with detailed temples add width across the face.'),
        ],
      },
      'very-long': {
        verdict: 'Very long face',
        meaning: 'Your face is notably tall for its width below the brows. It reads striking and refined, and width at the sides helps it look in proportion.',
        advice: [
          style('Fringes and chin- to shoulder-length cuts with volume at the sides shorten and widen the outline.', 'female'),
          style('Avoid height on top; fuller sides and a forward fringe shorten the face.', 'male'),
          beard('A beard fuller on the cheeks and short at the chin adds width rather than length.'),
          style('Oversized, deep frames cover more of the face’s length.'),
        ],
      },
    },
  },

  // Eyes & brows

  canthalTilt: {
    title: 'Canthal tilt',
    measures: 'The angle of the line from your inner to your outer eye corner, against the horizontal.',
    why: 'A slight upward tilt towards the outer corner gives the eyes a lifted, alert look, and since the outer corners tend to settle lower with age, a positive tilt also reads youthful. The comparison range sits a degree higher for women.',
    note: 'Eyelid shape and epicanthic folds vary with ancestry and change where the corners appear. Squinting, smiling or looking up or down also shift the angle, so compare photos taken the same way.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your outer eye corners sit a little above the inner ones, giving the eyes a lifted, alert look.',
        advice: [makeup('A fine liner that follows your natural upward line, flicked slightly at the end, emphasises the tilt.')],
      },
      low: {
        verdict: 'Neutral or downturned',
        meaning: 'Your outer eye corners sit level with or below the inner ones. It reads soft and gentle; a stronger downturn can make the eyes look tired.',
        advice: [
          makeup('Angle winged liner upwards from the outer corner rather than following the lower lash line; it lifts the eye.'),
          makeup('Keep lower-lash liner and shadow to the inner two-thirds; heavy definition at the outer lower corner pulls the eye down.'),
          grooming('Shape the brows with a slightly lifted tail; a tail that drops emphasises a downturn.'),
          habits('Sleep and cool compresses reduce puffiness, which can exaggerate a downturned look.'),
          clinical('Options a specialist might discuss include a temporary botulinum toxin brow lift, a surgical brow lift or canthoplasty.'),
        ],
      },
      high: {
        verdict: 'Strongly upswept',
        meaning: 'Your outer eye corners sit well above the inner ones, a pronounced, cat-eye tilt. It reads bold and striking, and on some faces intense.',
        advice: [
          makeup('Liner that runs straight out along the lash line, without a wing, softens a steep tilt.'),
          makeup('A little definition along the outer lower lash line balances the upward sweep.'),
          grooming('A straighter, flatter brow tail balances a steep upward tilt.'),
          style('Round or softly curved frames soften the angular line of the eyes.'),
        ],
      },
    },
  },

  eyeSpacing: {
    title: 'Eye spacing',
    measures: 'The distance between your inner eye corners divided by the width of one eye.',
    why: 'The neoclassical canon sets the gap between the eyes equal to one eye’s width, a 1:1 proportion Farkas used as a reference when measuring real faces. Near it, the eyes look evenly spaced.',
    note: 'Epicanthic folds, which vary with ancestry, cover part of the inner corner, so the eyes measure further apart and slightly shorter.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'The gap between your eyes is close to one eye’s width, so your eyes look evenly spaced.',
        advice: [],
      },
      low: {
        verdict: 'Close-set eyes',
        meaning: 'The gap between your inner eye corners is less than one eye’s width. Close-set eyes read focused and intense, and draw attention to the centre of the face.',
        advice: [
          makeup('Brighten the inner corners and place deeper shadow on the outer third of the lid to widen the gap visually.'),
          makeup('Extend liner or lashes towards the outer corners to pull the focus outwards.'),
          grooming('Start the brows at, or a touch outside, the inner eye corners, and keep the space between them clear.'),
          style('A thin, light or clear bridge on your glasses keeps the space between the eyes open.'),
        ],
      },
      high: {
        verdict: 'Wide-set eyes',
        meaning: 'The gap between your inner eye corners is more than one eye’s width. Wide-set eyes read open, calm and youthful.',
        advice: [
          makeup('Concentrate deeper shadow on the inner half of the lid and line the inner corners to draw the eyes closer.'),
          makeup('Soft contour along the sides of the nose bridge narrows the space between the eyes.'),
          grooming('Let the brow heads sit slightly inside the inner eye corners; don’t over-pluck between them.'),
          style('A dark or solid bridge on your glasses makes the eyes look closer together.'),
        ],
      },
    },
  },

  eyeSeparation: {
    title: 'Eye separation',
    measures: 'The distance between your pupils as a share of the width between your cheekbones.',
    why: 'Pallett, Link & Lee (2010) found faces were rated most attractive when the pupils sat about 46% of the face’s width apart. Between 44% and 48% the eyes look well placed for the width of the face.',
    note: 'Fuller cheeks widen the face and lower this share, so it can shift with weight.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your pupils sit close to the spacing Pallett et al. found most attractive, so your eyes look well placed for your face’s width.',
        advice: [],
      },
      low: {
        verdict: 'Narrow eye separation',
        meaning: 'Your pupils sit closer together than average for the width of your face, so the cheeks take up more of it. The face reads broad around the eyes, and the eyes look close-set within it.',
        advice: [
          makeup('Light shadow at the inner corners and depth at the outer corners spread the eyes across more of the face.'),
          makeup('Soft contour under the cheekbones slims the outer face so the eyes hold a larger share.'),
          grooming('Let the brow tails run slightly past the outer eye corners to widen the eye area.'),
          style('Face-framing layers at cheekbone level narrow the outer face.', 'female'),
          style('Keep the sides short so the width at the cheekbones doesn’t dominate.', 'male'),
        ],
      },
      high: {
        verdict: 'Wide eye separation',
        meaning: 'Your pupils sit further apart than average for the width of your face, so the eyes take up much of it. The look is open and youthful, and the face can read narrow around the eyes.',
        advice: [
          makeup('Deepen the inner corners and keep the outer corners soft to draw the eyes towards the centre.'),
          grooming('Keep the brow heads full and close together, starting just inside the inner eye corners.'),
          style('Frames with a dark or solid bridge bring the eyes visually closer.'),
          style('Volume at the sides, at cheekbone level, widens the face around the eyes.', 'female'),
          style('Keep some length at the sides rather than a skin fade to add width.', 'male'),
        ],
      },
    },
  },

  eyeShape: {
    title: 'Eye shape',
    measures: 'The height of your eye opening divided by its width from corner to corner.',
    why: 'It describes the shape of your eyes rather than grading it: narrow, almond, open and round eyes each suit different liner and lash styles.',
    note: 'Eyelid shape, ancestry, expression and tiredness all change the opening; a relaxed face and a straight gaze give the truest reading.',
    outcomes: {
      narrow: {
        verdict: 'Narrow',
        meaning: 'Your eye opening is slim for its width, which reads calm and intent.',
        advice: [
          makeup('Tightline the upper waterline and curl the lashes to open the eye without hiding the lid.'),
          makeup('Keep liner thin at the centre of the lid; thick lines hide more of the opening.'),
          grooming('Well-groomed, fuller brows frame narrow eyes and give them more presence.', 'male'),
        ],
      },
      almond: {
        verdict: 'Almond',
        meaning: 'Your eye opening is about a third as tall as it is wide, the balanced almond shape that suits almost any style.',
        advice: [makeup('Almost any liner works; a fine wing follows and extends the natural almond line.')],
      },
      open: {
        verdict: 'Open',
        meaning: 'Your eyes are fairly tall for their width, which reads bright, expressive and youthful.',
        advice: [
          makeup('Smudged liner along both lash lines defines open eyes without making them look rounder.'),
          makeup('A slight outward wing stretches the eye towards an almond line if you want a longer shape.'),
        ],
      },
      round: {
        verdict: 'Round',
        meaning: 'Your eyes are tall for their width, so more of the iris and the white shows. Round eyes read wide-awake, youthful and expressive.',
        advice: [
          makeup('Liner extended past the outer corner, thicker towards the end, lengthens a round eye towards almond.'),
          makeup('Place deeper shadow on the outer corners and keep shimmer off the centre of the lid, which rounds it further.'),
          grooming('Straighter, fuller brows give round eyes a calmer, more grounded frame.'),
        ],
      },
    },
  },

  browPosition: {
    title: 'Brow position',
    measures: 'The height from each pupil to the lower edge of the brow above it, relative to the distance between your pupils.',
    why: 'Brow height changes how the eyes read: lower-set, flatter brows read more masculine and intense, higher arched brows more feminine and open. The bands shift with your comparison, as men’s brows typically sit lower.',
    note: 'Raised brows, a frown and plucking all change this a lot, so measure with a relaxed forehead.',
    outcomes: {
      low: {
        verdict: 'Low-set brows',
        meaning: 'Your brows sit close to your eyes, which reads intense and focused, and more masculine. They can shade the eyes and make the upper lid look smaller.',
        advice: [
          grooming('Tidy hairs below the brow’s lower edge to open the space above the eye.'),
          makeup('A matte highlight just under the arch lifts the brow visually.'),
        ],
      },
      medium: {
        verdict: 'Medium height',
        meaning: 'Your brows sit at a moderate height above your eyes, balancing openness and definition.',
        advice: [grooming('Shaping can nudge it either way: filling the lower edge lowers the brow, tidying underneath lifts it.')],
      },
      high: {
        verdict: 'High-set brows',
        meaning: 'Your brows sit well above your eyes, which reads open, expressive and more feminine. Very high brows can make the face look surprised.',
        advice: [
          grooming('Fill the lower edge of the brow slightly to bring it closer to the eye.'),
          grooming('Avoid plucking from underneath, which raises the brow further.'),
        ],
      },
    },
  },

  browTilt: {
    title: 'Brow shape',
    measures: 'The angle from the head to the tail of each brow along its lower edge, together with how high its arch rises.',
    why: 'Brows frame the eyes and set much of the face’s resting expression. Straighter, flatter brows read calmer and more masculine; lifted, arched brows read livelier and more feminine.',
    note: 'Brow shape is the most changeable thing measured here: plucking, filling and habitual expressions all alter it.',
    outcomes: {
      rising: {
        verdict: 'Rising brows',
        meaning: 'Your brows climb from head to tail, which lifts the outer eye and reads alert and confident. At a steep angle they can look stern.',
        advice: [
          grooming('Fill the top edge of the brow heads slightly for a softer, less steep line.'),
          grooming('Let the tails taper along their natural line rather than trimming them higher.'),
        ],
      },
      falling: {
        verdict: 'Downturned tails',
        meaning: 'Your brow tails sit lower than the heads, a shape that reads gentle and approachable but can make the eyes look tired.',
        advice: [
          grooming('Remove a few hairs from under the tail and fill its top edge to lift it.'),
          makeup('A touch of matte highlight under the tail lifts it visually.'),
        ],
      },
      arched: {
        verdict: 'Arched brows',
        meaning: 'Your brows rise to a defined peak, which reads expressive and polished, and more feminine.',
        advice: [
          grooming('Keep the peak above the outer edge of the iris for a classic arch.'),
          grooming('For a softer look, let the hairs just before the peak grow in to round the arch.'),
        ],
      },
      soft: {
        verdict: 'Softly arched',
        meaning: 'Your brows have a gentle, rounded arch, a versatile shape that reads natural and relaxed.',
        advice: [grooming('Brush the brows up and set them with clear gel to show their shape.')],
      },
      straight: {
        verdict: 'Straight brows',
        meaning: 'Your brows run fairly flat with little arch. Straight brows read calm and youthful, and more masculine.',
        advice: [grooming('Keep the brows full; a slight lift at the tail adds definition without losing the straight line.')],
      },
    },
  },

  // Nose

  noseWidth: {
    title: 'Nose width',
    measures: 'The width across your nostril wings divided by the distance between your inner eye corners.',
    why: 'The neoclassical canon makes the nose as wide as the gap between the eyes, a 1:1 proportion that Farkas tested against real faces. The comparison range is a little wider for men, whose noses are broader on average.',
    note: 'Nose width varies substantially with ancestry, and the classical canon came from European art, so a result outside the range often reflects heritage rather than anything to change. Close-up selfies also make the nose look wider than it is.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your nose is about as wide as the gap between your eyes, the classical proportion, so the centre of the face sits in balance.',
        advice: [],
      },
      low: {
        verdict: 'Narrow nose',
        meaning: 'Your nose is narrower than the gap between your eyes. It reads refined and delicate, and the eyes can look further apart by comparison.',
        advice: [
          makeup('Skip contour on the sides of the nose, which narrows it further; a soft highlight down the bridge is enough.'),
          makeup('If your eyes are wide-set, defining the inner corners draws them closer and evens out the proportion.'),
          style('Look for frames with adjustable nose pads or a narrow bridge fit so they sit level and don’t slip.'),
        ],
      },
      high: {
        verdict: 'Wider nose',
        meaning: 'Your nose is wider than the gap between your eyes. It reads strong and grounded, and can make the eyes look closer together.',
        advice: [
          makeup('Soft contour down each side of the nose with a narrow highlight on the bridge slims it visually.'),
          makeup('Defined lips, with colour or liner, give the mouth more presence and balance a wider nose.', 'female'),
          beard('A well-groomed moustache or beard adds structure to the lower face that balances a wider nose.'),
          habits('Take photos from 1.5 m or more with zoom; at arm’s length the nose looks wider than it is.'),
          clinical('Options a specialist might discuss include alar base reduction, which narrows the nostril wings.'),
        ],
      },
    },
  },

  // Lips & mouth

  mouthNose: {
    title: 'Mouth-to-nose width',
    measures: 'The width of your mouth, corner to corner, divided by the width across your nostril wings.',
    why: 'The neoclassical canon puts the mouth at about one and a half times the width of the nose. The ratio is often said to match the golden ratio of 1.618, but that is folklore rather than a finding.',
    note: 'Smiling widens the mouth considerably, so this assumes a relaxed, closed mouth. Because nose width varies with ancestry, this ratio does too.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your mouth is about one and a half times the width of your nose, which keeps the lower face in balance.',
        advice: [],
      },
      low: {
        verdict: 'Narrower mouth',
        meaning: 'Your mouth is narrow relative to your nose, so the nose carries more visual weight in the lower face. A smaller mouth can read delicate and youthful.',
        advice: [
          makeup('Line right to the corners and keep colour even across the lips; a darker centre narrows the mouth.'),
          makeup('Soft contour down the sides of the nose brings it into balance with a smaller mouth.'),
          beard('Keep a moustache trimmed clear of the lip corners so the mouth’s full width shows.'),
          habits('A relaxed, slight smile in photos widens the mouth naturally.'),
        ],
      },
      high: {
        verdict: 'Wide mouth',
        meaning: 'Your mouth is wide relative to your nose. A wide mouth reads expressive and warm, and makes the nose look smaller.',
        advice: [
          makeup('Concentrate colour or gloss in the centre of the lips and blend it lighter towards the corners.'),
          makeup('Line within the natural corners rather than past them to keep the edges soft.'),
          beard('A goatee or chin-focused beard draws the eye to the centre of the lower face.'),
          habits('A softer, closed-mouth smile in photos keeps the width in proportion.'),
        ],
      },
    },
  },

  lipRatio: {
    title: 'Lip ratio',
    measures: 'The height of your lower lip divided by the height of your upper lip, at the centre of the mouth.',
    why: 'Lower lips are usually fuller than upper lips, and a ratio of about 1:1.6 is the one most often described as balanced. Between 1:1.4 and 1:2 the lips read in proportion to each other.',
    note: 'Lip fullness varies with ancestry, and lips thin with age. Pursing, smiling and lip liner all change the reading, so use a relaxed, closed mouth.',
    outcomes: {
      ideal: {
        verdict: 'Balanced lips',
        meaning: 'Your lower lip is about one and a half to two times the height of your upper lip, the classic balance of a defined upper lip over a fuller lower one.',
        advice: [habits('Lip balm with SPF keeps the lip border crisp; sun exposure blurs it over time.')],
      },
      low: {
        verdict: 'Fuller upper lip',
        meaning: 'Your upper lip is nearly as tall as your lower lip, or taller. It gives a full, prominent upper lip, and the lower lip carries less weight by comparison.',
        advice: [
          makeup('A slightly deeper shade or a touch of gloss on the lower lip adds fullness where it’s needed.'),
          makeup('Line the upper lip exactly on its border, not over it, to keep its size in balance.'),
          habits('Keep your lips hydrated; a smooth lower lip catches the light and looks fuller.'),
          beard('Keep a moustache trimmed above the lip line; hair over the upper lip adds weight there.'),
          clinical('Options a specialist might discuss include filler in the lower lip to rebalance the ratio.'),
        ],
      },
      high: {
        verdict: 'Thinner upper lip',
        meaning: 'Your lower lip is much taller than your upper lip, so the upper lip reads thin by comparison and the mouth’s weight sits low.',
        advice: [
          makeup('Line on, or a hair above, the upper lip’s border and highlight the Cupid’s bow to add height.'),
          makeup('Use a lighter or glossier shade on the upper lip and a deeper one on the lower to even them out.'),
          beard('A neatly trimmed moustache adds weight above the mouth and balances a thin upper lip.'),
          habits('Lip balm with SPF protects the upper lip’s border, which sun exposure blurs over time.'),
          clinical('Options a specialist might discuss include upper-lip filler or a lip lift, which shows more of the upper lip.'),
        ],
      },
    },
  },

  // Jaw & chin

  lowerThird: {
    title: 'Lower-face ratio',
    measures: 'The height from where your lips meet to the bottom of your chin, divided by the height from the base of your nose to where your lips meet.',
    why: 'The classical canon divides the lower third so the lips-to-chin part is about twice the nose-to-lips part, a 1:2 split. The comparison range sits slightly higher for men, whose chins are typically taller.',
    note: 'Parting your lips or tensing your chin changes this, so keep your lips together and relaxed.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'The space from your nose to your lips is about half the space from your lips to your chin, the classical 1:2 split, giving the lower face a balanced rhythm.',
        advice: [],
      },
      low: {
        verdict: 'Longer lip, shorter chin',
        meaning: 'The space from your lips to your chin is less than twice the space from your nose to your lips. The chin can look small and the upper lip long, which softens the lower face.',
        advice: [
          beard('A beard grown slightly longer at the chin adds height and definition below the mouth.'),
          makeup('A soft highlight on the centre of the chin brings it forward and adds apparent height.'),
          makeup('Slightly overlining the centre of the upper lip shortens the space between nose and lip.', 'female'),
          habits('A camera slightly below eye level gives the chin more presence in photos.'),
          clinical('Options a specialist might discuss include chin filler or an implant for height, or a lip lift to shorten a long upper lip.'),
        ],
      },
      high: {
        verdict: 'Longer chin, shorter lip',
        meaning: 'The space from your lips to your chin is more than twice the space from your nose to your lips. The chin reads long and strong, and the upper lip short.',
        advice: [
          beard('Keep the beard short under the chin and fuller on the cheeks to shorten the chin visually.'),
          makeup('A touch of bronzer on the tip of the chin shortens it visually.'),
          style('Chin-length cuts, or waves with volume at jaw level, balance a longer chin.', 'female'),
          habits('Hold the camera at eye level or slightly above so the chin doesn’t look longer.'),
          clinical('Options a specialist might discuss include a sliding genioplasty to reduce the chin’s height.'),
        ],
      },
    },
  },

  jawCheek: {
    title: 'Jaw-to-cheekbone width',
    measures: 'The width of your jaw at its corners divided by the width between your cheekbones.',
    why: 'It shows how much your face tapers from cheekbones to jaw. A tapered lower face reads more feminine and a wider, squarer jaw more masculine, so the comparison ranges differ by sex.',
    note: 'Hair, beards and soft tissue can hide the jaw corners, so treat this as approximate if yours are covered.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your face tapers from cheekbones to jaw by about the typical amount for your comparison, giving a defined, balanced lower face.',
        advice: [habits('Good posture, with your head stacked over your shoulders, keeps the jawline crisp in photos.')],
      },
      low: {
        verdict: 'Tapered jaw',
        meaning: 'Your jaw is narrow relative to your cheekbones, so the face tapers noticeably towards the chin. It reads soft and delicate, more feminine, and lets the cheekbones stand out.',
        advice: [
          beard('A beard kept fuller along the jawline and at the corners squares off a tapered jaw.'),
          style('Chin-length bobs and waves with volume at jaw level add width to the lower face.', 'female'),
          style('Avoid lots of width at the temples; tidy sides keep the upper face from overpowering the jaw.', 'male'),
          makeup('A soft highlight at the jaw corners, with contour under the cheekbones, evens out the taper.'),
          style('Frames with a heavier lower rim, or aviator shapes, add width low on the face.'),
          clinical('Options a specialist might discuss include jawline filler or jaw implants to widen the jaw corners.'),
        ],
      },
      high: {
        verdict: 'Wide, square jaw',
        meaning: 'Your jaw is wide relative to your cheekbones, so the face stays broad down to the jaw corners. A square jaw reads strong and more masculine.',
        advice: [
          beard('A beard shorter at the sides and slightly longer at the chin softens the width and lengthens the face.'),
          style('Long layers and soft waves that fall past the jaw curve over its corners and soften them.', 'female'),
          makeup('Soft contour just under the jaw corners, blended down onto the neck, narrows the lower face.', 'female'),
          style('Round or oval frames soften strong jaw angles.'),
          habits('Habitual clenching or grinding can enlarge the chewing muscles; a dentist can check for it.'),
          clinical('Options a specialist might discuss include botulinum toxin to slim the chewing (masseter) muscles, which can narrow the jaw.'),
        ],
      },
    },
  },

  // Side profile

  nasofrontal: {
    title: 'Nasofrontal angle',
    measures: 'The angle at the top of your nose, between the line up to your forehead and the line down to your nose tip.',
    why: 'It describes how your forehead flows into your nose and is one of the angles in Powell & Humphreys’ aesthetic triangle. The comparison range is a little more open for women, whose brow-to-nose transition is usually softer.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your forehead flows into your nose at a balanced angle, neither sharply stepped nor flat.',
        advice: [],
      },
      low: {
        verdict: 'Deep, sharp bridge',
        meaning: 'Your nose meets your forehead at a sharp, deep angle, often with a prominent brow ridge. It reads strong and defined, and more masculine.',
        advice: [
          style('Glasses with adjustable nose pads sit at the right height across a deep bridge.'),
          makeup('A soft highlight at the top of the bridge, between the brows, fills the step visually.'),
          grooming('Keep the area between the brows tidy so a strong brow ridge reads clean rather than heavy.'),
          habits('A slight three-quarter angle in photos shows less of the bridge’s depth than a full profile.'),
          clinical('Options a specialist might discuss include filler or a graft to build up the top of the bridge (radix).'),
        ],
      },
      high: {
        verdict: 'Shallow, flat bridge',
        meaning: 'Your forehead flows into your nose with little step, close to a straight line. It reads smooth and soft, like the straight profile of a classical statue.',
        advice: [
          makeup('A soft shadow at the sides of the bridge, just below the brow heads, defines the transition.'),
          grooming('Full, well-defined brow heads create a clearer line where the forehead meets the nose.'),
          style('Frames with adjustable nose pads or a low-bridge fit sit at the right height.'),
          clinical('Options a specialist might discuss include rhinoplasty to deepen the transition at the top of the nose.'),
        ],
      },
    },
  },

  nasolabial: {
    title: 'Nasolabial angle',
    measures: 'The angle at the base of your nose, between the underside of the nose and your upper lip.',
    why: 'It shows how upturned or downturned your nose tip is, and how your upper lip angles beneath it. Profile analysis favours a slightly more open angle for women, a gently upturned tip, than for men.',
    note: 'Smiling pulls the tip down and closes this angle, so use a relaxed, neutral expression.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your nose tip and upper lip meet at a balanced angle: the tip is neither drooping nor strongly upturned.',
        advice: [],
      },
      low: {
        verdict: 'Downturned tip',
        meaning: 'The underside of your nose angles down towards your lip, or your upper lip leans forward, so the angle closes. It gives a strong, mature profile, and a lower tip can make the nose look longer.',
        advice: [
          habits('Keep your chin level or very slightly raised in profile photos; tucking it makes the tip look lower.'),
          habits('A gentle, closed-lip smile pulls the tip down less than a wide grin.'),
          makeup('A touch of highlight on top of the tip and soft shade underneath lifts it visually.'),
          clinical('Options a specialist might discuss include tip rhinoplasty, or botulinum toxin to relax the muscle that pulls the tip down.'),
        ],
      },
      high: {
        verdict: 'Upturned tip',
        meaning: 'The underside of your nose angles upwards, or your upper lip sits back, so the angle opens. The tip reads upturned, youthful and more feminine, and more of the nostrils show from the front.',
        advice: [
          habits('Lower your chin slightly in photos; tilting it up shows more of the nostrils.'),
          makeup('A little matte shade on the underside of the tip makes the nostrils less noticeable.'),
          grooming('Trim visible nostril hair regularly; an upturned tip shows more of it.'),
          clinical('Options a specialist might discuss include rhinoplasty to adjust the tip’s rotation.'),
        ],
      },
    },
  },

  nasofacial: {
    title: 'Nasofacial angle',
    measures: 'The angle between the line of your nasal bridge and a line from your forehead to your chin.',
    why: 'Part of Powell & Humphreys’ aesthetic triangle, it shows how far your nose stands out from the face. Between 30° and 40° the nose projects in balance with the forehead and chin.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your nose stands out from your face at a balanced angle, in proportion with your forehead and chin.',
        advice: [],
      },
      low: {
        verdict: 'Lower projection',
        meaning: 'Your nose sits close to the line of your face, so it projects less than average. The profile reads soft through the middle, and the lips and chin stand out more.',
        advice: [
          makeup('A highlight down the bridge and on the tip brings the nose forward visually.'),
          habits('A slight three-quarter angle shows your nose’s shape better than a strict profile.'),
          style('Glasses with adjustable nose pads keep frames from resting too low on a lower bridge.'),
          clinical('Options a specialist might discuss include filler or rhinoplasty to add projection to the bridge and tip.'),
        ],
      },
      high: {
        verdict: 'Prominent nose',
        meaning: 'Your nose stands out from the line of your face more than average, making it a defining feature of your profile. It reads strong and distinctive.',
        advice: [
          habits('Face the camera straight on or at a slight angle; a full profile shows the nose’s projection most.'),
          style('Volume at the back of the head and a soft fringe balance a strong nose in profile.'),
          beard('A beard with some length at the chin balances a strong nose in profile.'),
          makeup('Soft contour on the sides, with a highlight that stops before the tip, reduces the nose’s apparent size.'),
          clinical('Options a specialist might discuss include rhinoplasty to reduce projection, or chin augmentation to balance it.'),
        ],
      },
    },
  },

  nasomental: {
    title: 'Nasomental angle',
    measures: 'The angle at your nose tip, between the line up to the top of your nose and the line down to your chin.',
    why: 'Also part of Powell & Humphreys’ aesthetic triangle, it weighs the nose’s projection against the chin’s. Between 120° and 132° the nose and chin balance each other in profile.',
    note: 'This angle depends on both your nose and your chin, so read it alongside your other profile results.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your nose and chin project in balance with each other, so neither dominates your profile.',
        advice: [],
      },
      low: {
        verdict: 'Nose leads the profile',
        meaning: 'The angle at your nose tip is tight: your nose projects strongly relative to your chin, because the nose stands out, the chin sits back, or both. It gives a bold, strongly featured profile.',
        advice: [
          beard('A beard with some length at the chin brings the lower profile forward to balance the nose.'),
          style('Volume at the back of the head balances a forward-projecting nose in profile.'),
          habits('Keep your chin level, not tucked, in profile photos; tucking sets it further back.'),
          makeup('A soft highlight on the centre of the chin brings it forward visually.'),
          clinical('Options a specialist might discuss include chin augmentation, rhinoplasty to reduce projection, or both.'),
        ],
      },
      high: {
        verdict: 'Chin leads the profile',
        meaning: 'The angle at your nose tip is open: your nose projects less relative to your chin, because the nose is modest, the chin is prominent, or both. The profile reads soft through the nose and strong at the chin.',
        advice: [
          makeup('A highlight down the bridge and on the tip brings a modest nose forward visually.'),
          beard('Keep a beard short at the chin so it doesn’t add projection; fullness at the sides balances better.'),
          habits('Lowering your chin slightly in profile photos softens a strong chin.'),
          clinical('Options a specialist might discuss include rhinoplasty or filler to add nose projection, or chin reduction.'),
        ],
      },
    },
  },

  tipProjection: {
    title: 'Nose tip projection',
    measures: 'How far your nose tip stands out from a line between the top of your nose and the back of your nostril, divided by the nose’s length.',
    why: 'Known as the Goode ratio, it is a standard way surgeons describe tip projection. Between 0.55 and 0.60 the tip stands out in proportion to the nose’s length.',
    note: 'It depends on placing the back-of-the-nostril point precisely, so zoom in when you place it.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your nose tip stands out in proportion to the nose’s length.',
        advice: [],
      },
      low: {
        verdict: 'Low tip projection',
        meaning: 'Your nose tip sits close to your face for the nose’s length, so the nose reads flatter and longer in profile.',
        advice: [
          makeup('Shade the sides of the nose and leave a dot of highlight on the very tip to bring it forward.'),
          habits('A slight three-quarter angle shows the tip’s shape better than a full profile.'),
          clinical('Options a specialist might discuss include tip rhinoplasty with cartilage grafts to add projection.'),
        ],
      },
      high: {
        verdict: 'High tip projection',
        meaning: 'Your nose tip stands well out from your face for the nose’s length, making the tip a defining feature of your profile.',
        advice: [
          makeup('Keep highlight off the tip and add a little matte shade at its end to soften its projection.'),
          habits('Face the camera straight on or slightly angled; a full profile shows the tip’s projection most.'),
          beard('A beard with some length at the chin balances a projecting tip in profile.'),
          clinical('Options a specialist might discuss include rhinoplasty to reduce tip projection.'),
        ],
      },
    },
  },

  convexity: {
    title: 'Facial convexity',
    measures: 'The angle at the base of your nose, between the line up to your forehead and the line down to your chin.',
    why: 'It sums up the whole profile: 180° would be a straight line from forehead to chin. Balanced adult profiles are gently convex, with the midface slightly ahead of the forehead and chin.',
    note: 'Keep your teeth lightly together for the side photo; an open mouth moves the chin back.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your profile is gently convex: the midface sits slightly ahead of your forehead and chin, the balanced adult profile.',
        advice: [],
      },
      low: {
        verdict: 'More convex profile',
        meaning: 'Your midface sits well ahead of the line from forehead to chin, usually because the chin sits back or the upper jaw projects. The profile reads curved, with a softer chin.',
        advice: [
          beard('A beard with length and shape at the chin brings the lower profile forward.'),
          makeup('Keep contour off the chin and add a touch of highlight at its centre to bring it forward.'),
          habits('Keep your chin level, not tucked, in photos; tucking sets it further back.'),
          clinical('Options a specialist might discuss include chin augmentation, or an orthodontic and jaw assessment where the bite is involved.'),
        ],
      },
      high: {
        verdict: 'Straighter profile',
        meaning: 'Your profile is close to a straight line from forehead to chin, or slightly concave, usually because the chin sits forward or the midface is flatter. It reads strong at the jaw and chin.',
        advice: [
          beard('Keep a beard short at the chin and fuller at the sides to avoid adding projection.'),
          makeup('Highlight on the cheekbones and the bridge of the nose brings the midface forward visually.'),
          habits('Lowering your chin slightly in profile photos softens a forward chin.'),
          clinical('Options a specialist might discuss include an orthodontic and jaw assessment, or cheek and midface filler.'),
        ],
      },
    },
  },

  eLineUpper: {
    title: 'Upper lip to E-line',
    measures: 'How far your upper lip sits in front of or behind a line from your nose tip to your chin.',
    why: 'Ricketts’ E-line, from nose tip to chin, is a classic orthodontic reference for lip position. In balanced adult profiles the lips sit a little behind it, the upper lip slightly further back than the lower.',
    note: 'Norms differ by ancestry, and lips thin and sit further back with age. A prominent nose or chin also moves the line, not just the lips.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your upper lip sits slightly behind the line from nose tip to chin, the balanced position.',
        advice: [],
      },
      low: {
        verdict: 'Upper lip set back',
        meaning: 'Your upper lip sits well behind the line from nose tip to chin, so it reads thin or set back in profile, or your nose and chin are prominent.',
        advice: [
          makeup('Liner on the upper lip’s border, with gloss at the centre, adds fullness in profile.'),
          habits('Lip balm with SPF keeps the lips smooth and their border defined.'),
          beard('A moustache adds weight above the mouth and fills out the profile.'),
          clinical('Options a specialist might discuss include upper-lip filler, or an orthodontic assessment if the teeth sit back.'),
        ],
      },
      high: {
        verdict: 'Upper lip forward',
        meaning: 'Your upper lip sits close to or ahead of the line from nose tip to chin, so the lips read full and forward in profile, or your nose and chin are less prominent.',
        advice: [
          makeup('Matte, mid-tone lip colours define full lips without adding volume; heavy gloss adds more.'),
          habits('Rest your lips gently together in profile photos rather than pushing them forward.'),
          beard('A beard with some length at the chin brings the chin line forward to balance the lips.'),
          clinical('Options a specialist might discuss include an orthodontic assessment, as tooth position strongly affects lip position.'),
        ],
      },
    },
  },

  eLineLower: {
    title: 'Lower lip to E-line',
    measures: 'How far your lower lip sits in front of or behind a line from your nose tip to your chin.',
    why: 'Ricketts’ E-line, from nose tip to chin, is a classic orthodontic reference for lip position. In balanced adult profiles the lower lip sits on or just behind it.',
    note: 'Norms differ by ancestry, and lips thin and sit further back with age. A prominent nose or chin also moves the line, not just the lips.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your lower lip sits on or just behind the line from nose tip to chin, the balanced position.',
        advice: [],
      },
      low: {
        verdict: 'Lower lip set back',
        meaning: 'Your lower lip sits well behind the line from nose tip to chin, so the lower face reads flat in profile, or your nose and chin are prominent.',
        advice: [
          makeup('A touch of gloss at the centre of the lower lip catches the light and adds fullness in profile.'),
          habits('Keep your lips relaxed and hydrated; pressing them together flattens them in photos.'),
          beard('Keep a beard short at the chin so it doesn’t push the line further forward.'),
          clinical('Options a specialist might discuss include lower-lip filler, or an orthodontic assessment if the teeth sit back.'),
        ],
      },
      high: {
        verdict: 'Lower lip forward',
        meaning: 'Your lower lip sits ahead of the line from nose tip to chin, so it reads full and prominent in profile, or your chin is less prominent.',
        advice: [
          makeup('Keep the lower lip matte and a shade deeper than the upper to reduce its prominence.'),
          habits('Rest your lips gently together in profile photos; pouting pushes the lower lip forward.'),
          beard('A beard with some length at the chin brings the chin forward to balance the lower lip.'),
          clinical('Options a specialist might discuss include an orthodontic assessment, or chin augmentation to bring the line forward.'),
        ],
      },
    },
  },

  mentolabial: {
    title: 'Mentolabial angle',
    measures: 'The angle in the crease between your lower lip and your chin.',
    why: 'The depth of this crease defines the transition from lip to chin. A moderate crease, between 110° and 135°, separates the two clearly without looking deep or flat.',
    note: 'Tensing or pouting the lower lip deepens the crease, so relax your mouth for the photo.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'The crease between your lower lip and chin is moderate, separating the two clearly.',
        advice: [],
      },
      low: {
        verdict: 'Deep chin crease',
        meaning: 'The crease between your lower lip and chin is deep and sharp, often with a prominent chin or a full, turned-out lower lip. It reads strong and defined.',
        advice: [
          makeup('A soft highlight in the crease, blended well, lightens its shadow.'),
          beard('A beard or goatee fills the crease and smooths the line from lip to chin.'),
          habits('Relax your lower lip in photos; tension deepens the crease.'),
          clinical('Options a specialist might discuss include filler to soften a deep crease.'),
        ],
      },
      high: {
        verdict: 'Shallow chin crease',
        meaning: 'The crease between your lower lip and chin is shallow, so the lip flows into the chin with little definition. It often goes with a chin that sits back or a long lower face.',
        advice: [
          beard('A short beard or goatee shaped at the chin adds definition below the lip.'),
          makeup('Soft shade just under the lower lip, with highlight on the chin, defines the crease.'),
          habits('Keep your lips gently closed without straining in photos; straining flattens the crease.'),
          clinical('Options a specialist might discuss include chin augmentation, which deepens the crease by bringing the chin forward.'),
        ],
      },
    },
  },

  cervicomental: {
    title: 'Cervicomental angle',
    measures: 'The angle under your jaw where the underside of your chin meets your neck.',
    why: 'A crisp angle under the jaw is one of the clearest signs of a defined jawline in profile. Between 95° and 120° the chin and neck read as clearly separate.',
    note: 'Posture, body fat and skin all affect this angle, as does head position, so hold your head level, as if looking at the horizon.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your chin and neck meet at a clean, defined angle, giving a clear jaw-neck line in profile.',
        advice: [style('Open collars and crew necks show off a defined jaw-neck line.')],
      },
      low: {
        verdict: 'Very sharp angle',
        meaning: 'Your chin and neck meet at a sharper angle than the typical range, a very crisp, sculpted jaw-neck line.',
        advice: [
          style('Open collars and crew necks show off a defined jaw-neck line; high collars hide it.'),
          habits('Check the side photo was taken with your head level, since head position changes this angle.'),
          grooming('Extend skincare and sun protection down to your neck to keep the skin there firm and smooth.'),
          beard('Keep the beard’s neckline about a finger’s width above the Adam’s apple so the line stays clean.'),
        ],
      },
      high: {
        verdict: 'Softer jaw-neck line',
        meaning: 'Your chin and neck meet at an open angle, so the jaw-neck line reads soft and less defined in profile. Posture, body fat, skin and a chin that sits back can all contribute.',
        advice: [
          habits('Stand tall with your head stacked over your shoulders; a forward head posture softens this line.'),
          habits('In photos, push your face slightly forward and tip your chin a little down to sharpen the line.'),
          beard('A beard with a neckline about a finger’s width above the Adam’s apple defines the jaw.'),
          makeup('Soft contour along the underside of the jaw, blended down the neck, sharpens the line.', 'female'),
          habits('Lower body fat often sharpens this angle, since fat under the chin softens it.'),
          clinical('Options a specialist might discuss include fat reduction under the chin, a neck lift or chin augmentation.'),
        ],
      },
    },
  },

  gonial: {
    title: 'Gonial angle',
    measures: 'The angle at the corner of your jaw, between the line up towards your ear and the jawline running to your chin.',
    why: 'It sets how square or sloped your jaw looks from the side. A lower, squarer angle reads more masculine and a higher one softer, so the comparison ranges differ by sex.',
    note: 'Hair, beards and soft tissue can hide the jaw corner, so treat this as approximate if yours is covered.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'Your jaw corner has a defined angle for your comparison, neither boxy nor steeply sloped.',
        advice: [],
      },
      low: {
        verdict: 'Square jaw angle',
        meaning: 'Your jaw corner is sharp and square, with a fairly horizontal jawline. It reads strong, angular and more masculine.',
        advice: [
          style('Long layers or soft waves that fall over the jaw corners soften a square angle.', 'female'),
          style('Oval or rounded rimless frames balance the angular line of the jaw.'),
          beard('A rounded beard line at the corners softens a square jaw; stubble shows it off.'),
          habits('Habitual clenching can enlarge the chewing muscles at the jaw corners; a dentist can check for night-time grinding.'),
          clinical('Options a specialist might discuss include botulinum toxin to slim the masseter muscle, which softens the corners’ bulk.'),
        ],
      },
      high: {
        verdict: 'Sloped jaw angle',
        meaning: 'Your jaw corner is open and the jawline slopes more steeply towards the chin. It reads soft and smooth, and the face can look longer.',
        advice: [
          beard('A beard kept fuller at the jaw corners and trimmed straight along the jaw adds angularity.'),
          makeup('Contour just under the jawline and highlight the jaw corners to create a sharper angle.'),
          style('A blunt cut ending at jaw level creates a crisp horizontal line where the jaw is soft.', 'female'),
          habits('A lower body-fat level makes the jaw corners easier to see.'),
          clinical('Options a specialist might discuss include jaw-angle filler or implants to define the corner.'),
        ],
      },
    },
  },

  mentocervical: {
    title: 'Mentocervical angle',
    measures: 'The angle between a line from your forehead to your chin and the underside of your chin.',
    why: 'Also part of Powell & Humphreys’ aesthetic triangle, it shows how the underside of the chin sits against the face’s overall line. Between 80° and 95° the chin is well defined underneath.',
    note: 'Looking up or down changes this angle, so hold your head level, as if looking at the horizon.',
    outcomes: {
      ideal: {
        verdict: 'Ideal',
        meaning: 'The underside of your chin sits at a balanced angle to the line of your face, giving a clean chin outline in profile.',
        advice: [],
      },
      low: {
        verdict: 'Sloping chin underside',
        meaning: 'The underside of your chin slopes steeply down towards your neck, so the chin blends into the neck rather than standing out. It often goes with a chin that sits back or fullness under the chin.',
        advice: [
          habits('Hold your head level with your face slightly forward in photos; tucking the chin adds fullness underneath.'),
          beard('A beard with a clean neckline above the Adam’s apple creates a defined chin underside.'),
          makeup('Contour under the chin, blended onto the neck, defines its underside.', 'female'),
          habits('Lower body fat reduces fullness under the chin, one of the main influences on this angle.'),
          clinical('Options a specialist might discuss include chin augmentation or fat reduction under the chin.'),
        ],
      },
      high: {
        verdict: 'Flat chin underside',
        meaning: 'The underside of your chin runs flat, or even rises towards your neck, against the line of your face. It reads very defined and usually comes with a strong, forward chin.',
        advice: [
          beard('Keep a beard short at the chin to avoid adding projection.'),
          habits('Tip your chin a fraction down in side-on photos to soften its projection.'),
          style('Volume at the back of the head balances a strong chin in profile.'),
          clinical('Options a specialist might discuss include an orthodontic and jaw assessment where the chin sits well forward.'),
        ],
      },
    },
  },
}
