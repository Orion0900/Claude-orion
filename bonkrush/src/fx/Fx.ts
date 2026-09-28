import * as THREE from 'three'
import type { CameraApi, FxApi, GameContext, Vec3 } from '../game/types'
import { addTrauma, alwaysShown, decayTrauma, shakeMagnitude, shakeNoise } from './fxMath'
import { NumberLayer } from './NumberLayer'
import { Particles } from './Particles'
import { Rings } from './Rings'

/** Largest camera displacement at full trauma, metres. */
const MAX_SHAKE = 0.6
/** Flash opacity lost per second. */
const FLASH_FADE = 3.2
const MAX_FLASH = 0.6
const MAX_BURST = 80
const COLOR_CACHE_LIMIT = 128

const UP = new THREE.Vector3(0, 1, 0)
const _normal = new THREE.Vector3()
const _tilt = new THREE.Quaternion()

/**
 * Visual juice: particle bursts, ground rings, floating numbers, camera
 * shake and screen flashes. Built per stage right after the World and
 * disposed with it.
 */
export class Fx implements FxApi {
  readonly shakeOffset = new THREE.Vector3()
  private readonly particles: Particles
  private readonly rings: Rings
  private readonly numbers: NumberLayer | null = null
  private readonly flashEl: HTMLDivElement | null = null
  private flashAlpha = 0
  private flashVisible = false
  private trauma = 0
  private shakeTime = 0
  private readonly colors = new Map<string, THREE.Color>()
  private rafId = 0
  private drawRequested = false
  private disposed = false

  constructor(
    private readonly ctx: GameContext,
    host: HTMLElement,
  ) {
    this.particles = new Particles(ctx.scene)
    this.rings = new Rings(ctx.scene)
    if (typeof document !== 'undefined') {
      const flash = document.createElement('div')
      flash.className = 'fx-flash'
      flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;display:none;will-change:opacity;'
      host.appendChild(flash)
      this.flashEl = flash
      this.numbers = new NumberLayer(host, ctx.renderer.domElement)
    }
    this.shakeTime = Math.random() * 100
  }

  burst(pos: Vec3, color: string, count: number, speed = 7, size = 0.22): void {
    if (this.disposed || !finite(pos)) return
    const wanted = this.ctx.settings.quality === 'low' ? Math.ceil(count * 0.5) : Math.round(count)
    const n = Math.min(MAX_BURST, wanted)
    if (!(n > 0)) return
    const world = this.ctx.world
    const ground = world ? world.heightAt(pos.x, pos.z) : pos.y - 50
    this.particles.emit(pos.x, pos.y, pos.z, ground, this.color(color), n, speed > 0 ? speed : 7, size > 0 ? size : 0.22)
  }

  number(pos: Vec3, text: string, kind: 'damage' | 'crit' | 'heal' | 'player' | 'gold' | 'xp' | 'info'): void {
    if (this.disposed || !this.numbers || !finite(pos)) return
    if (!this.ctx.settings.showDamageNumbers && !alwaysShown(kind)) return
    this.numbers.pool.spawn(pos.x, pos.y + 0.2, pos.z, String(text), kind)
  }

  ring(pos: Vec3, radius: number, color: string, duration = 0.5): void {
    if (this.disposed || !finite(pos) || !(radius > 0)) return
    const world = this.ctx.world
    let y = pos.y
    _tilt.identity()
    if (world) {
      // Lie on the slope and lift a little more for big rings so their rims clear bumps.
      y = world.heightAt(pos.x, pos.z) + 0.1 + Math.min(radius, 12) * 0.03
      world.normalAt(pos.x, pos.z, _normal)
      if (_normal.lengthSq() > 0.5) _tilt.setFromUnitVectors(UP, _normal)
    }
    this.rings.spawn(pos.x, y, pos.z, _tilt, radius, this.color(color), duration > 0 ? duration : 0.5)
  }

  shake(strength: number): void {
    if (this.disposed) return
    this.trauma = addTrauma(this.trauma, strength)
  }

  flash(color: string, strength: number): void {
    if (this.disposed || !this.flashEl || !(strength > 0)) return
    this.flashEl.style.backgroundColor = color
    this.flashAlpha = Math.max(this.flashAlpha, Math.min(MAX_FLASH, strength * MAX_FLASH))
    this.applyFlash()
  }

  update(dt: number): void {
    if (this.disposed) return
    const step = dt > 0 ? Math.min(dt, 0.25) : 0
    this.numbers?.pool.update(step)
    if (step > 0) {
      this.particles.update(step)
      this.rings.update(step)
      this.trauma = decayTrauma(this.trauma, step)
      this.shakeTime += step
      if (this.flashAlpha > 0) {
        this.flashAlpha = Math.max(0, this.flashAlpha - FLASH_FADE * step)
        this.applyFlash()
      }
    }
    this.updateShake()
    this.requestDraw()
  }

  clear(): void {
    this.particles.clear()
    this.rings.clear()
    this.numbers?.pool.clear()
    this.trauma = 0
    this.shakeOffset.set(0, 0, 0)
    this.flashAlpha = 0
    this.applyFlash()
    this.requestDraw()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.rafId !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.particles.dispose()
    this.rings.dispose()
    this.numbers?.dispose()
    this.flashEl?.remove()
    this.colors.clear()
    this.shakeOffset.set(0, 0, 0)
  }

  private updateShake(): void {
    if (!this.ctx.settings.screenShake || this.trauma <= 0) {
      this.shakeOffset.set(0, 0, 0)
      return
    }
    const m = shakeMagnitude(this.trauma, MAX_SHAKE)
    const t = this.shakeTime
    this.shakeOffset.set(m * shakeNoise(t, 0.3), m * 0.8 * shakeNoise(t, 5.1), m * shakeNoise(t, 9.7))
  }

  private applyFlash(): void {
    const el = this.flashEl
    if (!el) return
    const visible = this.flashAlpha > 0.005
    if (visible) el.style.opacity = this.flashAlpha.toFixed(3)
    if (visible !== this.flashVisible) {
      el.style.display = visible ? 'block' : 'none'
      this.flashVisible = visible
    }
  }

  /**
   * Numbers are drawn in an animation-frame callback queued from `update`.
   * The game requests its next frame before it updates, so this callback
   * always runs right after the game has moved the camera and rendered: the
   * text sits exactly on the 3D scene instead of trailing it by a frame
   * during fast mouse turns. It keeps re-queuing itself while `update`
   * keeps asking for draws.
   */
  private requestDraw(): void {
    this.drawRequested = true
    if (this.rafId !== 0) return
    if (typeof requestAnimationFrame === 'function') this.rafId = requestAnimationFrame(this.drawFrame)
    else this.drawNumbers()
  }

  private readonly drawFrame = (): void => {
    this.rafId = 0
    if (this.disposed) return
    this.drawNumbers()
    if (!this.drawRequested) return
    this.drawRequested = false
    this.rafId = requestAnimationFrame(this.drawFrame)
  }

  private drawNumbers(): void {
    // The camera is built after the first stage's Fx, so it may not exist yet.
    const camera = (this.ctx as { camera?: CameraApi }).camera?.camera ?? null
    this.numbers?.draw(camera)
  }

  private color(css: string): THREE.Color {
    let c = this.colors.get(css)
    if (!c) {
      if (this.colors.size >= COLOR_CACHE_LIMIT) this.colors.clear()
      c = new THREE.Color(0xffffff)
      try {
        c.set(css)
      } catch {
        c.set(0xffffff)
      }
      this.colors.set(css, c)
    }
    return c
  }
}

function finite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}
