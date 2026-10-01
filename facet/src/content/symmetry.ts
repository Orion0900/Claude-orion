import type { SymmetryFinding } from '../face/symmetry'
import type { FindingText } from './types'

type Side = 'right' | 'left'
const other = (side: Side): Side => (side === 'right' ? 'left' : 'right')

/**
 * Words for each nameable asymmetry. Sides are the person's own right and
 * left; `amount` arrives formatted ("1.8 mm", "2.1°", "5%").
 */
export const FINDING_TEXT: Record<SymmetryFinding['id'], FindingText> = {
  eyeLevel: {
    title: 'Eye height',
    describe: (amount, side) => `Your ${side} eye sits ${amount} higher than your ${other(side)}.`,
    tip: 'Nearly everyone has small asymmetries of 1–3 mm, and they are rarely noticeable in person; a very slight head tilt levels the eyes in photos.',
  },
  browLevel: {
    title: 'Brow height',
    describe: (amount, side) => `Your ${side} brow sits ${amount} higher than your ${other(side)}.`,
    tip: 'Uneven brows are very common and easy to even out: fill the top edge of the lower brow to raise its line.',
  },
  mouthTilt: {
    title: 'Mouth tilt',
    describe: (amount, side) => `Your mouth tilts by ${amount}, with your ${side} corner higher.`,
    tip: 'Most mouths are slightly uneven, especially when smiling; practising a relaxed, even smile in a mirror helps it look level in photos.',
  },
  noseDeviation: {
    title: 'Nose alignment',
    describe: (amount, side) => `Your nose tip leans ${amount} towards your ${side}.`,
    tip: 'A slightly off-centre nose is very common; a straight line of highlight down the centre of your face, not along the nose, makes it look straighter.',
  },
  chinDeviation: {
    title: 'Chin alignment',
    describe: (amount, side) => `Your chin sits ${amount} off-centre, towards your ${side}.`,
    tip: 'Small chin offsets are common, as the two sides of the jaw rarely grow identically; a slight turn of the head in photos makes them hard to spot.',
  },
  eyeSize: {
    title: 'Eye size',
    describe: (amount, side) => `Your ${side} eye is ${amount} wider than your ${other(side)}.`,
    tip: 'Eyes often differ a little in size; extending liner slightly further at the outer corner of the smaller eye evens them out.',
  },
  faceHalves: {
    title: 'Face halves',
    describe: (amount, side) => `Your face is ${amount} wider on your ${side} side.`,
    tip: 'Nearly every face has a slightly wider half, and many people find they have a favourite side in photos; angle the wider side a little away from the camera.',
  },
}
