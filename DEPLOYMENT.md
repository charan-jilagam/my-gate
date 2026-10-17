# Deployment Guide

This guide covers deploying the Nivora clone application to production environments.

## Prerequisites

- MongoDB Atlas account (or MongoDB instance)
- Razorpay account (for payments)
- Cloudinary account (for image uploads, optional)
- Email service credentials (Gmail/SendGrid)
- Hosting accounts (Heroku, Railway, Vercel, etc.)

## Backend Deployment

### Option 1: Railway

1. **Create Railway Account**
   - Sign up at [railway.app](https://railway.app)
   - Create a new project

2. **Deploy Backend**
   - Connect your GitHub repository
   - Select the `backend` folder as root
   - Railway will auto-detect Node.js

3. **Set Environment Variables**
   ```
   PORT=5000
   NODE_ENV=production
   MONGODB_URI=<your-mongodb-atlas-uri>
   JWT_SECRET=<strong-random-secret>
   JWT_EXPIRE=7d
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=<your-email>
   EMAIL_PASS=<app-password>
   RAZORPAY_KEY_ID=<razorpay-key>
   RAZORPAY_KEY_SECRET=<razorpay-secret>
   FRONTEND_URL=<your-frontend-url>
   ```

4. **Deploy**
   - Railway will automatically deploy on push
   - Note the generated URL (e.g., `https://mygate-backend.railway.app`)

### Option 2: Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   heroku login
   ```

2. **Create Heroku App**
   ```bash
   cd backend
   heroku create mygate-backend
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set MONGODB_URI=<your-mongodb-uri>
   heroku config:set JWT_SECRET=<secret>
   # ... set all other variables
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

### Option 3: DigitalOcean App Platform

1. **Create App**
   - Go to DigitalOcean App Platform
   - Connect repository
   - Select `backend` folder

2. **Configure**
   - Set build command: `npm install`
   - Set run command: `npm start`
   - Add environment variables

3. **Deploy**

## Frontend Deployment

### Option 1: Vercel

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   cd frontend
   vercel
   ```

3. **Configure**
   - Set build command: `npm run build`
   - Set output directory: `dist`
   - Add environment variables if needed

4. **Update API URL**
   - Update `baseURL` in `src/services/api.js` to your backend URL

### Option 2: Netlify

1. **Build Locally**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy**
   - Drag and drop `dist` folder to Netlify
   - Or connect GitHub for auto-deploy

3. **Configure**
   - Set redirects: `/* /index.html 200`
   - Add environment variables

### Option 3: GitHub Pages

1. **Install gh-pages**
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Update package.json**
   ```json
   {
     "homepage": "https://yourusername.github.io/mygate",
     "scripts": {
       "predeploy": "npm run build",
       "deploy": "gh-pages -d dist"
     }
   }
   ```

3. **Deploy**
   ```bash
   npm run deploy
   ```

## MongoDB Atlas Setup

1. **Create Cluster**
   - Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free cluster

2. **Configure Access**
   - Add your IP address to whitelist
   - Create database user

3. **Get Connection String**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy connection string
   - Replace `<password>` with your password

## Razorpay Setup

1. **Create Account**
   - Sign up at [razorpay.com](https://razorpay.com)

2. **Get API Keys**
   - Go to Settings > API Keys
   - Generate test keys (for testing)
   - Generate live keys (for production)

3. **Configure Webhook** (Optional)
   - Set webhook URL: `https://your-backend-url/api/payments/webhook`
   - Enable events: `payment.captured`, `payment.failed`

## Email Configuration

### Gmail Setup

1. **Enable 2-Factor Authentication**
2. **Generate App Password**
   - Go to Google Account > Security
   - App passwords > Generate
   - Use this password in `EMAIL_PASS`

### SendGrid Setup

1. **Create Account** at [sendgrid.com](https://sendgrid.com)
2. **Create API Key**
3. **Update Environment Variables**
   ```
   EMAIL_HOST=smtp.sendgrid.net
   EMAIL_PORT=587
   EMAIL_USER=apikey
   EMAIL_PASS=<your-sendgrid-api-key>
   ```

## Cloudinary Setup (Optional)

1. **Create Account** at [cloudinary.com](https://cloudinary.com)
2. **Get Credentials**
   - Cloud Name
   - API Key
   - API Secret
3. **Add to Environment Variables**

## Post-Deployment Checklist

- [ ] Backend deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] MongoDB connection working
- [ ] Environment variables set correctly
- [ ] CORS configured for frontend URL
- [ ] Payment gateway configured
- [ ] Email service working
- [ ] Socket.io connections working
- [ ] Test user registration/login
- [ ] Test core features (visitors, deliveries, etc.)

## Environment Variables Reference

### Backend (.env)
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/mygate
JWT_SECRET=<generate-strong-secret>
JWT_EXPIRE=7d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
FRONTEND_URL=https://your-frontend.vercel.app
```

### Frontend (if needed)
```env
VITE_API_URL=https://your-backend.railway.app/api
```

## Troubleshooting

### Backend Issues

1. **MongoDB Connection Failed**
   - Check connection string
   - Verify IP whitelist
   - Check credentials

2. **CORS Errors**
   - Verify `FRONTEND_URL` matches frontend domain
   - Check CORS configuration in `server.js`

3. **Socket.io Not Working**
   - Verify Socket.io CORS settings
   - Check WebSocket support on hosting platform

### Frontend Issues

1. **API Calls Failing**
   - Verify backend URL in `api.js`
   - Check CORS configuration
   - Verify authentication tokens

2. **Build Errors**
   - Check Node.js version compatibility
   - Verify all dependencies installed
   - Check for TypeScript errors

## Monitoring

### Recommended Tools

- **Backend Monitoring**: PM2, New Relic, or hosting platform monitoring
- **Error Tracking**: Sentry
- **Analytics**: Google Analytics
- **Uptime Monitoring**: UptimeRobot

## Security Checklist

- [ ] Use strong JWT secrets
- [ ] Enable HTTPS
- [ ] Set secure CORS origins
- [ ] Use environment variables (never commit secrets)
- [ ] Enable rate limiting
- [ ] Regular security updates
- [ ] Database backups enabled
- [ ] Input validation on all endpoints

## Scaling Considerations

- Use MongoDB Atlas for database scaling
- Implement Redis for session management (if needed)
- Use CDN for static assets
- Consider load balancing for backend
- Implement caching strategies
- Monitor database query performance

## Support

For deployment issues, check:
- Hosting platform documentation
- MongoDB Atlas documentation
- Razorpay integration guide
- Socket.io deployment guide
