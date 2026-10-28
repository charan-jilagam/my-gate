const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'
let loading = null

/** Loads Razorpay Checkout once, on first use. */
export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(true)
  if (loading) return loading
  loading = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.onload = () => resolve(true)
    script.onerror = () => {
      loading = null
      resolve(false)
    }
    document.body.appendChild(script)
  })
  return loading
}

/**
 * Opens Razorpay Checkout for an existing order.
 * Resolves with the signed response on success, or rejects with { dismissed: true } / { message } otherwise.
 */
export const openCheckout = async ({ keyId, order, name, description, prefill }) => {
  const ready = await loadRazorpay()
  if (!ready) throw new Error('Could not load the payment window. Check your connection and try again.')

  return new Promise((resolve, reject) => {
    const instance = new window.Razorpay({
      key: keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      name,
      description,
      prefill,
      theme: { color: '#0F766E' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject({ dismissed: true }) }
    })
    instance.on('payment.failed', (res) => reject({ message: res?.error?.description || 'The payment failed. You have not been charged.' }))
    instance.open()
  })
}
