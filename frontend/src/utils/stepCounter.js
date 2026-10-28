// Counts steps from the phone's motion sensor while Nivora is open (a web page cannot count in the background).
// Method: take the strength of the accelerometer reading, subtract a slow average (gravity), and count a step each time
// the result rises above a threshold, no faster than a person can walk or run. A few steps in a row are needed before
// counting starts, so shaking the phone once does not add steps.

const MIN_GAP_MS = 280 // faster than about 3.5 steps a second is not walking
const MAX_GAP_MS = 2000 // a longer pause ends the walking spell
const THRESHOLD = 1.1 // m/s^2 above the slow average
const WARM_UP = 4 // steps in a row before counting begins
const GRAVITY_SMOOTHING = 0.92

export const motionSupported = () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window

// iPhones ask permission, and only from a tap. Other phones do not need to.
export const needsMotionPermission = () => motionSupported() && typeof window.DeviceMotionEvent.requestPermission === 'function'

export const askMotionPermission = async () => {
  if (!needsMotionPermission()) return true
  try {
    return (await window.DeviceMotionEvent.requestPermission()) === 'granted'
  } catch (e) {
    return false
  }
}

/**
 * Makes a step detector. feed(x, y, z, now) takes one accelerometer reading (m/s^2) and returns how many steps to add (0 or 1).
 * Kept separate from the browser event so it can be tested.
 */
export const createDetector = () => {
  let gravity = 9.8
  let prev = 0
  let lastStep = 0
  let streak = 0

  return {
    feed(x, y, z, now) {
      const magnitude = Math.sqrt(x * x + y * y + z * z)
      gravity = GRAVITY_SMOOTHING * gravity + (1 - GRAVITY_SMOOTHING) * magnitude
      const signal = magnitude - gravity
      const rising = signal > THRESHOLD && prev <= THRESHOLD
      prev = signal
      if (!rising) return 0
      const gap = now - lastStep
      if (gap < MIN_GAP_MS) return 0
      lastStep = now
      if (gap > MAX_GAP_MS) {
        streak = 1
        return 0
      }
      streak += 1
      if (streak < WARM_UP) return 0
      // The step that completes the warm-up also counts the earlier ones of the spell.
      return streak === WARM_UP ? WARM_UP : 1
    }
  }
}

/** Starts listening. onSteps(n) is called with the steps to add. Returns a function that stops listening. */
export const startCounting = (onSteps) => {
  const detector = createDetector()
  const handler = (e) => {
    const a = e.accelerationIncludingGravity
    if (!a || a.x == null || a.y == null || a.z == null) return
    const n = detector.feed(a.x, a.y, a.z, performance.now())
    if (n) onSteps(n)
  }
  window.addEventListener('devicemotion', handler)
  return () => window.removeEventListener('devicemotion', handler)
}

// Keeps the screen on while counting, where the browser allows it (the count stops if the page is switched off).
export const keepAwake = async () => {
  try {
    if ('wakeLock' in navigator) return await navigator.wakeLock.request('screen')
  } catch (e) {
    /* not allowed (low battery, background): counting still works while the screen is on */
  }
  return null
}
