/** Building names in the way brokers and owners actually name buildings. */
import { MARKETS } from './data'
import type { Rng } from './rng'
import type { MarketId, PropertyType } from './types'

const STREETS = [
  'Market', 'Commerce', 'Main', 'Park', 'Lake', 'Union', 'Liberty', 'Franklin', 'Madison', 'Monroe', 'Spring',
  'Peachtree', 'Congress', 'Broadway', 'Elm', 'Cedar', 'Harbor', 'Water', 'Pine', 'Grand', 'Washington', 'Mercer',
]
const OFFICE_NAMES = [
  'Meridian', 'Pinnacle', 'Summit', 'Gateway', 'Sterling', 'Granite', 'Keystone', 'Lakeshore', 'Riverfront', 'Westlake',
  'Paramount', 'Halcyon', 'Beacon', 'Crescent', 'Monarch', 'Atrium', 'Corbel', 'Lantern',
]
const OFFICE_SUFFIX = ['Tower', 'Plaza', 'Center', 'Place', 'Square', 'Commons', 'Corporate Center', 'Building']
const RESI_NAMES = [
  'The Ashford', 'The Linden', 'The Merritt', 'The Calloway', 'The Wren', 'The Harlow', 'The Juniper', 'The Sawyer',
  'The Everly', 'The Marlowe', 'The Beacon', 'The Foundry', 'The Larkin', 'The Odessa', 'The Whitley', 'The Cordelia',
]
const RESI_PLAIN = ['Cedar Ridge', 'Magnolia', 'Willow Creek', 'Parkside', 'Stonebridge', 'Highland', 'Brookhaven', 'Oak Hollow', 'Sycamore', 'Riverbend']
const RESI_SUFFIX = ['Apartments', 'Flats', 'Lofts', 'Residences', 'Commons']
const INDUSTRIAL_SUFFIX = ['Logistics Center', 'Distribution Park', 'Commerce Center', 'Industrial Park', 'Logistics Hub', 'Business Park']
const RETAIL_SUFFIX = ['Marketplace', 'Town Center', 'Crossing', 'Commons', 'Village', 'Shopping Center']
const HOTEL_NAMES = ['Alder', 'Corsair', 'Wexley', 'Marigold', 'Halston', 'Bellwether', 'Carrow', 'Ledger', 'Juno', 'Sable']
const HOTEL_FORMS = ['The {n} Hotel', 'Hotel {n}', 'The {n}', '{n} Inn & Suites', '{n} House']
const LAB_SUFFIX = ['Labs', 'Innovation Center', 'Research Park', 'Science Center', 'Biocampus']
const STORAGE_BRANDS = ['StowAway', 'Keepwell', 'BoxLot', 'SpareRoom', 'Lockline']
const DC_CODES: Partial<Record<MarketId, string>> = {
  dc: 'IAD', dal: 'DFW', phx: 'PHX', atl: 'ATL', chi: 'ORD', sea: 'SEA', sf: 'SJC', nyc: 'EWR', aus: 'AUS', la: 'LAX', bos: 'BOS', mia: 'MIA', nash: 'BNA',
}

/** "the Gulch" reads as "Gulch" at the front of a name. */
function bare(place: string): string {
  return place.replace(/^the /, '').replace(/ submarket$/, '')
}

export function propertyName(rng: Rng, type: PropertyType, market: MarketId, count: number): string {
  const place = bare(rng.pick(MARKETS[market].places))
  if (count > 1) {
    const what: Record<PropertyType, string> = {
      multifamily: 'Apartment Portfolio', industrial: 'Logistics Portfolio', office: 'Office Portfolio', retail: 'Retail Portfolio',
      hotel: 'Hotel Portfolio', datacenter: 'Data Center Portfolio', storage: 'Storage Portfolio', lifescience: 'Lab Portfolio',
    }
    return `${MARKETS[market].name} ${what[type]}`
  }
  switch (type) {
    case 'office':
      return rng.chance(0.45)
        ? `${rng.int(1, 19) * 100 + (rng.chance(0.5) ? 0 : 50)} ${rng.pick(STREETS)} Street`
        : `${rng.pick(OFFICE_NAMES)} ${rng.pick(OFFICE_SUFFIX)}`
    case 'multifamily':
      if (rng.chance(0.5)) return rng.chance(0.4) ? `${rng.pick(RESI_NAMES)} at ${place}` : rng.pick(RESI_NAMES)
      return `${rng.pick(RESI_PLAIN)} ${rng.pick(RESI_SUFFIX)}`
    case 'industrial':
      return rng.chance(0.3) ? `${rng.pick(['I-', 'Route ', 'Highway '])}${rng.int(10, 95)} ${rng.pick(INDUSTRIAL_SUFFIX)}` : `${place} ${rng.pick(INDUSTRIAL_SUFFIX)}`
    case 'retail':
      return rng.chance(0.25) ? `The Shops at ${place}` : `${place} ${rng.pick(RETAIL_SUFFIX)}`
    case 'hotel':
      return rng.pick(HOTEL_FORMS).replace('{n}', rng.chance(0.3) ? place : rng.pick(HOTEL_NAMES))
    case 'datacenter':
      return rng.chance(0.5) ? `${DC_CODES[market] ?? 'DC'}-${rng.int(1, 9)} Data Campus` : `${place} Digital Campus`
    case 'storage':
      return `${rng.pick(STORAGE_BRANDS)} Storage ${place}`
    case 'lifescience':
      return rng.chance(0.3) ? `The Lab at ${place}` : `${place} ${rng.pick(LAB_SUFFIX)}`
  }
}
