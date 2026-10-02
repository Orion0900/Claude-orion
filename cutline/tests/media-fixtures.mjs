// Test media for tests/media.mjs, made with ffmpeg, and the ffmpeg/ffprobe
// helpers the checks use to look inside what the export wrote.
//
// talk.webm is the main fixture: a 720x1280 VP9/Opus clip whose picture is
// ffmpeg's testsrc2 (a running timecode in the corner, so any frame says
// which source moment it is) over 25.8 s of speech: 0.6 s silence, 11 s
// talking, 2 s silence, 11 s talking, 1.2 s silence. If the directory
// already has it (with real speech) it's used as is; otherwise a stand-in
// with a speech-like soundtrack in the same pattern is generated.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function run(cmd, args, { input } = {}) {
  const res = spawnSync(cmd, args, { input, maxBuffer: 1 << 30 })
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${res.stderr?.toString()}`)
  return res.stdout
}

export const ffmpeg = (...args) => run('ffmpeg', ['-v', 'error', '-y', ...args])

export function probe(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString())
}

export function videoFrameCount(file) {
  const out = run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file])
  return Number(out.toString().trim())
}

/** The first audio stream, mixed to mono, as 32-bit floats at `rate`, after an optional filter. */
export function audioSamples(file, rate = 48000, filter = null) {
  const buf = run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', ...(filter ? ['-af', filter] : []), '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'])
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

/** PPM ("P6\n<w> <h>\n255\n" then RGB bytes) to { width, height, data }. */
function parsePpm(buf) {
  if (!buf || buf.length < 16) throw new Error('ffmpeg gave no frame')
  const header = buf.subarray(0, 64).toString('latin1').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/)
  if (!header) throw new Error('not a PPM frame')
  return { width: Number(header[1]), height: Number(header[2]), data: buf.subarray(header[0].length) }
}

/** Frame `index` (counting from 0) as RGB bytes, after an optional filter chain. */
export function frameRgb(file, index, filter = null) {
  const vf = [`select=eq(n\\,${index})`, filter].filter(Boolean).join(',')
  return parsePpm(run('ffmpeg', ['-v', 'error', '-i', file, '-vf', vf, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'ppm', '-']))
}

/** Presentation times of every video frame, in order. */
export function frameTimes(file) {
  const out = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file])
  return out.toString().trim().split('\n').map(Number)
}


export function savePng(file, index, out, filter = null) {
  const vf = [`select=eq(n\\,${index})`, filter].filter(Boolean).join(',')
  ffmpeg('-i', file, '-vf', vf, '-frames:v', '1', out)
}

/** Mean squared error over the rows [y0, y1) of two same-sized RGB frames. */
export function mse(a, b, y0 = 0, y1 = a.height) {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`)
  let sum = 0
  const from = y0 * a.width * 3
  const to = y1 * a.width * 3
  for (let i = from; i < to; i++) {
    const d = a.data[i] - b.data[i]
    sum += d * d
  }
  return sum / (to - from)
}

function make(dir, name, build) {
  const file = join(dir, name)
  if (!existsSync(file)) {
    const tmp = join(dir, `.tmp-${name}`)
    build(tmp)
    renameSync(tmp, file)
  }
  return file
}

// Harmonics with a syllable-rate wobble plus breathy noise, gated to the talking spans.
const TALKING = '(between(t,0.6,11.6)+between(t,13.6,24.6))'
const SPEECHLIKE = `aevalsrc='${TALKING}*0.25*(sin(2*PI*170*t)+0.5*sin(2*PI*340*t+1)+0.3*sin(2*PI*520*t+2))*(0.5+0.5*sin(2*PI*3.7*t))':s=48000:d=25.8`

export function ensureFixtures(dir) {
  mkdirSync(dir, { recursive: true })
  const speech = make(dir, 'speech.wav', (out) =>
    ffmpeg('-f', 'lavfi', '-i', SPEECHLIKE, '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.08:seed=7:r=48000:d=25.8',
      '-filter_complex', `[1]volume='${TALKING}':eval=frame,lowpass=f=4000[n];[0][n]amix=inputs=2:normalize=0`, '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', out),
  )
  const talkFrom = (size) => (out) =>
    ffmpeg('-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=25.8`, '-i', speech, '-c:v', 'libvpx-vp9', '-b:v', '1500k',
      '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '96k', '-shortest', '-f', 'webm', out)
  const talk = make(dir, 'talk.webm', talkFrom('720x1280'))
  const landscape = make(dir, 'talk-landscape.webm', talkFrom('1280x720'))
  const mp4 = make(dir, 'talk.mp4', (out) => ffmpeg('-i', talk, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-f', 'mp4', out))

  // An iPhone-style portrait clip: frames stored sideways with a -90° display
  // matrix, but VP9/Opus so Chromium can decode it. Shown right, it's talk.webm.
  const rotated = make(dir, 'rotated.mp4', (out) => {
    const tmp = `${out}.coded.mp4`
    ffmpeg('-i', talk, '-vf', 'transpose=cclock', '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-c:a', 'copy', '-f', 'mp4', tmp)
    ffmpeg('-display_rotation:v:0', '-90', '-i', tmp, '-c', 'copy', '-f', 'mp4', out)
  })
  const noAudio = make(dir, 'noaudio.webm', (out) => ffmpeg('-i', talk, '-an', '-c:v', 'copy', '-f', 'webm', out))
  // 4K60 portrait, stored landscape + rotated like an iPhone's, 6 s.
  const uhd = make(dir, '4k60.mp4', (out) => {
    const tmp = `${out}.coded.mp4`
    ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=2160x3840:rate=60:duration=6', '-i', speech, '-t', '6', '-vf', 'transpose=cclock', '-c:v', 'libvpx-vp9', '-b:v', '8M',
      '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-tile-columns', '2', '-threads', '8', '-c:a', 'libopus', '-b:a', '96k', '-f', 'mp4', tmp)
    ffmpeg('-display_rotation:v:0', '-90', '-i', tmp, '-c', 'copy', '-f', 'mp4', out)
  })
  // 3.4 minutes (talk.webm eight times over, ~30 MB): well past BlobSource's 8 MB cache, to show reads stay local.
  const long = make(dir, 'long.webm', (out) => {
    const list = `${out}.txt`
    writeFileSync(list, Array.from({ length: 8 }, () => `file '${talk.replace(/'/g, "'\\''")}'`).join('\n'))
    ffmpeg('-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-f', 'webm', out)
  })
  const hevc = make(dir, 'hevc.mp4', (out) => ffmpeg('-i', talk, '-t', '3', '-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1', '-c:a', 'aac', '-f', 'mp4', out))
  // Music: a chord over pink noise, 9 s, 44.1 kHz stereo (so it has to be resampled and looped).
  const music = make(dir, 'music.wav', (out) =>
    ffmpeg('-f', 'lavfi', '-i', "aevalsrc='0.12*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))|0.12*(sin(2*PI*246.9*t)+sin(2*PI*311.1*t)+sin(2*PI*370*t))':s=44100:d=9",
      '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.15:seed=3:r=44100:d=9', '-filter_complex', '[1]aformat=channel_layouts=stereo[n];[0][n]amix=inputs=2:normalize=0',
      '-c:a', 'pcm_s16le', '-f', 'wav', out),
  )
  return { dir, speech, talk, landscape, mp4, rotated, noAudio, uhd, long, hevc, music }
}
