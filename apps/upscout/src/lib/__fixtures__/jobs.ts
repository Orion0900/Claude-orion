import type { Job, Profile } from '../types'

export const NOW = new Date('2026-03-10T12:00:00.000Z')

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: '~01abc',
    title: 'React dashboard for a logistics tool',
    description: 'We need a React and TypeScript developer to build an internal dashboard.',
    url: 'https://www.upwork.com/jobs/~01abc',
    postedAt: '2026-03-10T10:00:00.000Z',
    budget: { type: 'hourly', min: 60, max: 90, currency: 'USD' },
    skills: ['React', 'TypeScript'],
    proposals: 3,
    connects: 8,
    client: { country: 'United States', paymentVerified: true, rating: 4.9, totalSpend: 50_000, hireRate: 0.8 },
    source: 'test',
    fetchedAt: NOW.toISOString(),
    ...overrides,
  }
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'Sam Rivera',
    headline: 'Front-end engineer',
    targetHourly: 70,
    minHourly: 40,
    minFixed: 500,
    skills: ['React', 'TypeScript', 'Node.js'],
    strengths: ['dashboard', 'design systems'],
    avoid: ['unpaid'],
    portfolio: 'https://example.com',
    timezone: 'Europe/London',
    ...overrides,
  }
}
