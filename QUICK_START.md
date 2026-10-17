# Quick Start Guide

Get the Nivora clone up and running in 5 minutes!

## Prerequisites Check

- ✅ Node.js installed (`node --version` should show v16+)
- ✅ MongoDB running locally OR MongoDB Atlas account
- ✅ Terminal/Command Prompt ready

## Step-by-Step Setup

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure Backend Environment

Create `backend/.env` file:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/mygate
JWT_SECRET=your_secret_key_here_change_in_production
JWT_EXPIRE=7d
FRONTEND_URL=http://localhost:5173
```

**Note**: For MongoDB Atlas, use:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mygate
```

### 3. Start Backend Server

```bash
cd backend
npm run dev
```

You should see:
```
MongoDB connected successfully
Server running on port 5000
```

### 4. Install Frontend Dependencies

Open a **new terminal window**:

```bash
cd frontend
npm install
```

### 5. Start Frontend Server

```bash
cd frontend
npm run dev
```

You should see:
```
VITE v4.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

### 6. Access the Application

Open your browser and go to: **http://localhost:5173**

## First Steps

### 1. Create Super Admin (Optional)

If you need a super admin to create societies, you can:

**Option A**: Use MongoDB Compass/CLI to manually create a user with `role: 'super_admin'`

**Option B**: Temporarily modify the registration route to allow super_admin registration

### 2. Register as Resident

1. Click "Sign up" on the login page
2. Fill in your details
3. Select a society (or create one if you're super admin)
4. Complete registration

### 3. Approve Resident (If Admin)

1. Login as society admin
2. Go to Users > Pending Approvals
3. Approve the resident

### 4. Test Features

- ✅ Invite a visitor
- ✅ Expect a delivery
- ✅ Register a vehicle
- ✅ View notices
- ✅ Raise a complaint

## Common Issues & Solutions

### Issue: MongoDB Connection Failed

**Solution:**
- Check if MongoDB is running: `mongod --version`
- Verify connection string in `.env`
- For MongoDB Atlas: Check IP whitelist and credentials

### Issue: Port Already in Use

**Solution:**
- Backend: Change `PORT` in `.env` to another port (e.g., 5001)
- Frontend: Change port in `vite.config.js`

### Issue: CORS Errors

**Solution:**
- Ensure `FRONTEND_URL` in backend `.env` matches frontend URL
- Check `server.js` CORS configuration

### Issue: Module Not Found

**Solution:**
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

## Testing the API

You can test the API using:

1. **Browser**: Visit `http://localhost:5000/api/health`
2. **Postman**: Import the API endpoints
3. **cURL**: 
   ```bash
   curl http://localhost:5000/api/health
   ```

## Next Steps

1. **Configure Email**: Add email credentials for password reset
2. **Setup Razorpay**: Add payment gateway keys for payments
3. **Configure Cloudinary**: Add image upload credentials (optional)
4. **Read Full Documentation**: Check `README.md` and `DESIGN_DOCUMENT.md`

## Development Tips

- Use `npm run dev` for auto-reload during development
- Check browser console for frontend errors
- Check terminal for backend errors
- Use React DevTools for debugging React components
- Use MongoDB Compass to view database data

## Need Help?

- Check `README.md` for detailed documentation
- Check `DEPLOYMENT.md` for production deployment
- Review `DESIGN_DOCUMENT.md` for architecture details

---

**Happy Coding! 🚀**
