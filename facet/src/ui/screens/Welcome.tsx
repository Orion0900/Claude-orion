import { useState } from 'react'
import type { Sex } from '../../face/types'
import { go } from '../../router'
import { useSettings } from '../../store/settings'
import { FaceArt } from '../components/FaceArt'
import { Check, Lock } from '../components/Icons'

export function Welcome() {
  const [settings, update] = useSettings()
  const [step, setStep] = useState(0)
  const [sex, setSex] = useState<Sex>(settings.sex)

  const finish = () => {
    update({ sex, onboarded: true })
    go({ name: 'home' }, true)
  }

  return (
    <div className="screen">
      {step === 0 && (
        <>
          <div style={{ paddingTop: 24 }}>
            <FaceArt className="hero-art" />
          </div>
          <div className="stack fade-up" style={{ gap: 12, textAlign: 'center' }}>
            <div className="eyebrow">Facet</div>
            <h1>Your face, measured</h1>
            <p className="muted">
              Thirty measurements of proportion, symmetry and shape — the kind of facial analysis an aesthetics consultant would give you — made on your phone.
            </p>
          </div>
          <ul className="check-list card">
            <li>
              <Check style={{ color: 'var(--accent)' }} />
              <span>Facial thirds and fifths, eye tilt and spacing, nose, lips, jaw and chin, each against its ideal range.</span>
            </li>
            <li>
              <Check style={{ color: 'var(--accent)' }} />
              <span>Symmetry mapped point by point, your face shape, and an optional side-profile analysis.</span>
            </li>
            <li>
              <Check style={{ color: 'var(--accent)' }} />
              <span>Practical ideas for hair, brows, grooming and glasses that suit your proportions.</span>
            </li>
            <li>
              <Lock style={{ color: 'var(--accent)' }} />
              <span>Private by design: the analysis runs on this device and your photos are never uploaded.</span>
            </li>
          </ul>
          <div className="sticky-actions">
            <button className="btn primary" onClick={() => setStep(1)}>
              Get started
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="stack fade-up" style={{ gap: 12, paddingTop: 40 }}>
            <div className="eyebrow">Step 1 of 2</div>
            <h1>Which ideals should we compare with?</h1>
            <p className="muted">
              Several ideal ranges differ between women’s and men’s faces — canthal tilt, jaw width, brow height, the chin. Pick the set you’d like your measurements held against. You can switch at any time, even for a single report.
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Compare with">
            <button aria-pressed={sex === 'female'} onClick={() => setSex('female')}>
              Female ideals
            </button>
            <button aria-pressed={sex === 'male'} onClick={() => setSex('male')}>
              Male ideals
            </button>
          </div>
          <div className="sticky-actions">
            <button className="btn" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn primary" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="stack fade-up" style={{ gap: 12, paddingTop: 40 }}>
            <div className="eyebrow">Step 2 of 2</div>
            <h1>Before you start</h1>
          </div>
          <div className="card stack" style={{ gap: 12 }}>
            <p>
              Facet compares the geometry of your face with averages from aesthetic research. Those ranges come mostly from studies of young adults, much of the older work on people of European descent — they describe an average, not a standard anyone needs to meet.
            </p>
            <p className="muted">
              Attractiveness is far broader than proportions: expression, skin, hair, style and how you carry yourself matter at least as much, and plenty of striking faces sit well outside these numbers.
            </p>
            <p className="muted">
              It’s for curiosity and styling ideas, not medical advice. Facet is intended for adults.
            </p>
          </div>
          <div className="sticky-actions">
            <button className="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn primary" onClick={finish}>
              I understand
            </button>
          </div>
        </>
      )}
    </div>
  )
}
