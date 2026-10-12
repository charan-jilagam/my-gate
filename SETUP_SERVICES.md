# Setting up email and online payments

Both are optional. The app runs without them.

## Password-reset email (Gmail)

Without these settings, "Forgot password" still works in development: the reset link is printed in the backend terminal. In production (`NODE_ENV=production`) users are told email is unavailable.

1. Turn on 2-Step Verification for the Google account: https://myaccount.google.com/security
2. Create an App Password: https://myaccount.google.com/apppasswords (name it "MyGate"). Copy the 16 characters, without spaces.
3. In `backend/.env`:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=you@gmail.com
   EMAIL_PASS=the16characterapppassword
   FRONTEND_URL=http://localhost:5173
   ```
   `FRONTEND_URL` must be the address users open, because the reset link is built from it.
4. Restart the backend, then try Forgot password with a real account.

Port 465 also works (it switches to SSL automatically). Any SMTP provider (Brevo, SendGrid, Zoho) works with its own host, user and password.

## Online payments (Razorpay)

Without keys, residents see "Online payments are not set up" and admins can still create dues and record cash, cheque or UPI payments.

1. Sign up at https://dashboard.razorpay.com and stay in **Test Mode**.
2. Settings > API Keys > Generate Test Key. Copy the Key Id and Key Secret.
3. In `backend/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
4. Restart the backend.
5. Test: admin opens Payments > Create dues. Resident opens Payments > Pay now. Use Razorpay's test card `4111 1111 1111 1111`, any future expiry, any CVV, and any OTP.

Going live needs Razorpay KYC approval, then swapping in the `rzp_live_` keys. Never commit the secret or put it in the frontend.

## Money flow

- Admin: Payments > Create dues bills every approved resident. Flats already billed for the same month are skipped.
- Resident: Pay now on a pending due (online), or pays the admin directly.
- Admin: Record payment on a pending row marks cash, cheque or UPI as received. The resident is notified and the Collected total updates.

## Photos (complaints and profile)

Photos work out of the box: without Cloudinary they are saved in `backend/uploads` on the server. That is fine for development, but many hosts erase the disk on every deploy, so use Cloudinary in production.

1. Create a free account at https://cloudinary.com and open the Dashboard.
2. In `backend/.env`:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
3. Restart the backend. Uploads are limited to 5 MB and to JPG, PNG, GIF and WebP.

## Browser (push) notifications

Needs VAPID keys. Generate a pair once and keep them:

```
cd backend
npx web-push generate-vapid-keys
```

Put them in `backend/.env`, then restart the backend:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

Each person turns it on from **Profile > Notifications > This device**. Browsers only allow push on **https://** pages (and on `localhost` while developing). On iPhone, the site must first be added to the Home Screen.

## SMS (Twilio)

SMS is sent only for the important events: a visitor at the gate, a delivery arriving, new dues and account approval. Each person can switch it off in Profile.

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM=+1xxxxxxxxxx
SMS_DEFAULT_COUNTRY_CODE=+91
```

A Twilio trial account can only text numbers you have verified in the Twilio console. Sending to Indian numbers from a production account also needs DLT registration, which Twilio's India documentation walks through. Without these settings nothing is sent (the text is printed in the backend console in development).

## Camera QR scanning

Guards tap **Scan** in the Gate console. Browsers only allow the camera on **https://** pages (or `localhost`), so it works after you deploy with HTTPS. On a phone testing over your Wi-Fi address without HTTPS, type the pass code instead.
