import * as THREE from 'three'
import { CHARACTERS } from '../data/characters'
import { createPose, computePose } from './animation'
import { createCharacterModel } from './PlayerModel'

function bounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(root)
}

describe('PlayerModel', () => {
  for (const def of CHARACTERS) {
    it(`builds a standing ${def.model} for ${def.name}`, () => {
      const rig = createCharacterModel(def)
      const box = bounds(rig.root)
      // Feet on the ground, roughly person-sized, chunky but not absurd.
      expect(box.min.y).toBeGreaterThan(-0.05)
      expect(box.min.y).toBeLessThan(0.1)
      expect(box.max.y).toBeGreaterThan(1.6)
      expect(box.max.y).toBeLessThan(2.4)
      expect(box.max.x - box.min.x).toBeLessThan(1.9)
      expect(rig.height).toBeGreaterThan(1.4)

      let meshes = 0
      rig.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        meshes++
        const geo = o.geometry as THREE.BufferGeometry
        expect(geo.getAttribute('color')).toBeTruthy()
        expect(geo.getAttribute('position').count).toBe(geo.getAttribute('color').count)
        expect(o.material).toBe(rig.material)
      })
      // One draw call per body part.
      expect(meshes).toBeLessThanOrEqual(7)
      rig.dispose()
    })
  }

  it('drops low in the slide pose and keeps the feet near the ground', () => {
    const rig = createCharacterModel(CHARACTERS[0])
    const standing = bounds(rig.root).max.y
    rig.applyPose(computePose('slide', 0, 0, 0, createPose()))
    const sliding = bounds(rig.root)
    expect(sliding.max.y).toBeLessThan(standing - 0.3)
    expect(sliding.min.y).toBeGreaterThan(-0.3)
    rig.dispose()
  })
})
