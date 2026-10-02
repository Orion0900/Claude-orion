import type { FaceShape } from '../face/faceShape'
import type { ShapeText } from './types'

/**
 * Styling ideas per face shape. Each shape is described by what to balance:
 * length against width, and the forehead, cheekbones and jaw against each other.
 */
export const SHAPE_TEXT: Record<FaceShape, ShapeText> = {
  oval: {
    name: 'Oval',
    description: 'Your face is longer than it is wide and widest at the cheekbones, with a forehead slightly wider than a softly rounded jaw. These are close to average proportions, so most styles suit you.',
    hair: {
      female: [
        'Almost any length works, so choose by your hair’s texture and the feature you want to show off.',
        'Long layers or a blunt lob keep the natural balance.',
        'Curtain fringes and side parts draw attention to the cheekbones.',
        'Sleek ponytails and buns show off the balanced outline.',
      ],
      male: [
        'Most cuts suit you: a textured crop, a quiff, a side part or longer swept-back hair.',
        'A classic taper with some length on top is a reliable default.',
        'Medium-length, tousled styles work as well as short, neat ones.',
      ],
    },
    glasses: [
      'Most frames suit you; pick a width that matches your face at the temples.',
      'Rectangular and wayfarer frames add structure; round frames keep the look soft.',
      'Keep the top of the frame close to your brow line.',
    ],
    beard: [
      'Most beard styles suit; a short boxed beard keeps the balance.',
      'Stubble or a light beard follows the jaw’s natural line without adding length.',
      'Keep the neckline about a finger’s width above the Adam’s apple.',
    ],
    makeup: [
      'Light contour under the cheekbones is enough; there is little to rebalance.',
      'Follow your brows’ natural arch, peaking above the outer edge of the iris.',
      'Sweep blush from the apples of the cheeks towards the temples.',
    ],
  },

  round: {
    name: 'Round',
    description: 'Your face is only a little longer than it is wide, with full cheeks, a soft jawline and a rounded chin. It reads youthful and approachable; height and angles add length and definition.',
    hair: {
      female: [
        'Height at the crown and long layers that fall past the chin lengthen the face.',
        'Side parts and asymmetric cuts break up the curves.',
        'Long, side-swept fringes add angles; blunt, full fringes shorten the face.',
        'Avoid chin-length bobs with volume at the cheeks, which add width.',
      ],
      male: [
        'Height on top with shorter sides, as in a quiff or textured crop, lengthens the face.',
        'Keep the sides tight; volume there widens a round face.',
        'An angular side part or a fade adds definition.',
      ],
    },
    glasses: [
      'Angular, rectangular or square frames add definition to soft curves.',
      'Frames slightly wider than they are deep make the face look longer and slimmer.',
      'Avoid small, round frames, which echo the roundness.',
    ],
    beard: [
      'Keep the beard short on the cheeks and longer at the chin to lengthen the face.',
      'A defined cheek line and squared-off jawline add structure to soft curves.',
      'A goatee or anchor beard draws the eye downwards.',
    ],
    makeup: [
      'Contour along the sides of the face and under the cheekbones to add angles.',
      'Place blush slightly above the apples and sweep it up towards the temples.',
      'Highlight down the centre: forehead, bridge of the nose and chin.',
      'A defined brow with a higher arch adds height and structure.',
    ],
  },

  square: {
    name: 'Square',
    description: 'Your forehead, cheekbones and jaw are close in width, with a strong, angular jaw and a broad chin. It reads strong and structured; soft lines and a little extra length balance it.',
    hair: {
      female: [
        'Soft layers and waves around the jaw soften its corners.',
        'Long, layered cuts past the shoulders lengthen the face.',
        'Side parts and wispy, side-swept fringes add movement against straight lines.',
        'Avoid blunt bobs that end exactly at the jaw’s widest point.',
      ],
      male: [
        'A classic short back and sides shows off a strong jaw.',
        'A textured crop or side part with some height adds length.',
        'Slightly longer, softer styles take the edge off very angular features.',
      ],
    },
    glasses: [
      'Round or oval frames soften strong angles.',
      'Thin metal or rimless frames keep a strong face from looking heavy.',
      'Avoid sharply square frames, which echo the jaw.',
    ],
    beard: [
      'Stubble or a short beard shows off a square jaw.',
      'Keep the sides short and add a little length at the chin to lengthen the face.',
      'A rounded line at the chin softens the corners.',
    ],
    makeup: [
      'Soft contour on the jaw corners and temples rounds the outline.',
      'Blush on the apples, blended in soft circles, adds curves.',
      'Softly arched brows balance a strong jawline.',
    ],
  },

  oblong: {
    name: 'Oblong',
    description: 'Your face is noticeably longer than it is wide, with forehead, cheekbones and jaw of similar width and fairly straight sides. It reads elegant and refined; width at the sides balances the length.',
    hair: {
      female: [
        'Fringes, whether full, curtain or side-swept, shorten the face.',
        'Volume at the sides, from waves or curls, adds width.',
        'Chin- to shoulder-length cuts suit better than very long, straight hair.',
        'Avoid height at the crown, which adds length.',
      ],
      male: [
        'Keep height on top modest; tall quiffs and pompadours add length.',
        'Fuller sides rather than skin fades add width.',
        'A forward fringe or textured crop shortens the face.',
      ],
    },
    glasses: [
      'Deep or oversized frames cover more of the face’s length.',
      'Frames with decorative or contrasting temples add width.',
      'Avoid small, narrow frames that emphasise length.',
    ],
    beard: [
      'Keep the beard fuller on the cheeks and shorter at the chin to add width.',
      'A moustache with a short beard breaks up the face’s length.',
      'Avoid long, pointed beards, which add length.',
    ],
    makeup: [
      'Bronzer along the hairline and under the chin shortens the face.',
      'Blush applied horizontally across the apples adds width.',
      'Straighter, fuller brows create a horizontal line that shortens the face.',
    ],
  },

  heart: {
    name: 'Heart',
    description: 'Your forehead is the widest part of your face, narrowing through the cheekbones to a slim jaw and a pointed chin. It reads striking and delicate; width low on the face balances the forehead.',
    hair: {
      female: [
        'Chin-length bobs and lobs with volume at the jaw add width where the face narrows.',
        'Side-swept or curtain fringes soften a wide forehead.',
        'Waves or curls from mid-length down balance a narrow chin.',
        'Avoid lots of height or volume at the crown and temples.',
      ],
      male: [
        'Medium-length styles with some fringe soften a wide forehead.',
        'Avoid slicked-back styles that expose the forehead’s full width.',
        'Avoid tall, voluminous tops, which make the upper face look heavier.',
      ],
    },
    glasses: [
      'Light rimless or semi-rimless frames keep the upper face from looking heavy.',
      'Aviators and frames wider at the bottom add width low on the face.',
      'Avoid heavy or decorated top bars that draw the eye upwards.',
    ],
    beard: [
      'A full beard adds width and weight to a narrow jaw and chin.',
      'Keep fullness at the jaw corners rather than length at the chin.',
      'A boxed or full beard suits better than a goatee, which narrows the chin further.',
    ],
    makeup: [
      'Contour at the temples and sides of the forehead narrows the upper face.',
      'A soft highlight at the jaw corners adds width below.',
      'Rounded brow arches balance the tapering lower face.',
    ],
  },

  diamond: {
    name: 'Diamond',
    description: 'Your cheekbones are the widest part of your face, with a narrower forehead and jaw and a defined chin. It reads striking and angular; width at the forehead and jaw balances the cheekbones.',
    hair: {
      female: [
        'Side-swept or curtain fringes add width at the forehead.',
        'Chin-length bobs and waves at jaw level fill out the lower face.',
        'Volume at the temples and below the cheekbones evens out the outline.',
        'Avoid extra volume at cheekbone level, the widest point.',
      ],
      male: [
        'A textured fringe or side-swept top adds width at the forehead.',
        'Keep the sides a little fuller at the temples rather than shaved tight.',
        'Medium-length styles soften prominent cheekbones.',
      ],
    },
    glasses: [
      'Browline and cat-eye frames add width at the forehead.',
      'Oval and rimless frames soften angular cheekbones.',
      'Avoid frames narrower than your cheekbones, which exaggerate them.',
    ],
    beard: [
      'A fuller beard at the chin and jaw adds width below the cheekbones.',
      'A boxed or full beard broadens a narrow jaw.',
      'Keep the cheek line low and natural so the beard’s width sits along the jaw.',
    ],
    makeup: [
      'Soft contour on the outer cheekbones tones down the widest point.',
      'Highlight at the temples and the centre of the forehead adds width up top.',
      'Straighter, slightly longer brows widen the upper face.',
    ],
  },

  triangle: {
    name: 'Triangle',
    description: 'Your jaw is the widest part of your face, with a narrower forehead and a broad chin. It reads grounded and strong; width and volume above the cheekbones balance it.',
    hair: {
      female: [
        'Volume at the crown and temples widens the upper face.',
        'Side-swept fringes or layers above the cheekbones draw the eye upwards.',
        'Layers that fall past the jaw soften its width.',
        'Avoid blunt cuts ending at the jaw, which emphasise its width.',
      ],
      male: [
        'Fuller sides and texture on top widen the upper face.',
        'Avoid very tight fades, which narrow the temples above a wide jaw.',
        'A side-swept top or quiff draws the eye upwards.',
      ],
    },
    glasses: [
      'Browline, cat-eye or bold top-rimmed frames widen the upper face.',
      'Frames slightly wider than your forehead balance the jaw.',
      'Avoid bottom-heavy frames, which add weight low on the face.',
    ],
    beard: [
      'Keep the beard short at the sides of the jaw to avoid adding width.',
      'Stubble or a short, rounded beard softens a wide jaw.',
      'A little extra length at the chin, with short sides, draws the eye to the centre.',
    ],
    makeup: [
      'Contour along the jaw corners slims the lower face.',
      'Highlight at the temples and forehead widens the upper face.',
      'Full, slightly longer brows add width to the upper face.',
    ],
  },
}
