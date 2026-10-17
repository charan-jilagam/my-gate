# Admin Login Setup Guide

This guide explains how to create and login as an admin user in the Nivora clone application.

## Methods to Create Admin Users

### Method 1: Using the Script (Recommended for First-Time Setup)

The easiest way to create your first admin user is using the provided script:

```bash
cd backend
npm run create-admin
```

This will create a super admin with default credentials:
- **Email**: `admin@mygate.com`
- **Password**: `admin123`
- **Role**: `super_admin`

#### Custom Admin Creation

You can also create a custom admin with specific details:

```bash
npm run create-admin <email> <password> <name> <phone> <role>
```

**Example:**
```bash
npm run create-admin admin@example.com mypassword123 "John Admin" 9876543210 super_admin
```

**Available Roles:**
- `super_admin` - Can create/manage all societies
- `society_admin` - Manages a specific society

### Method 2: Using the API Endpoint (Development Mode)

Once you have a super admin, you can create more admins via the API (or from the Societies page in the app). Sign in first and send the token:

**Create Super Admin:**
```bash
curl -X POST http://localhost:5000/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -d '{
    "name": "Super Admin",
    "email": "admin@mygate.com",
    "password": "admin12345",
    "phone": "1234567890",
    "role": "super_admin"
  }'
```

**Create Society Admin:**
```bash
curl -X POST http://localhost:5000/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -d '{
    "name": "Society Admin",
    "email": "societyadmin@mygate.com",
    "password": "admin12345",
    "phone": "1234567890",
    "role": "society_admin",
    "societyId": "<society-id-here>"
  }'
```

**Note:** This endpoint requires a signed-in super admin (send their token as `Authorization: Bearer <token>`). Create the very first super admin with `npm run create-admin`.

### Method 3: Using MongoDB Directly

You can also create an admin user directly in MongoDB:

1. Connect to your MongoDB database
2. Insert a user document:

```javascript
db.users.insertOne({
  name: "Super Admin",
  email: "admin@mygate.com",
  password: "<bcrypt-hashed-password>", // Use bcrypt to hash password
  phone: "1234567890",
  role: "super_admin",
  isApproved: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**To hash password using Node.js:**
```javascript
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash('admin123', 12);
console.log(hashedPassword);
```

## Login as Admin

Once you've created an admin user:

1. **Start the backend server:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start the frontend server:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open the application:**
   - Navigate to `http://localhost:5173`
   - Click on "Sign in"
   - Enter your admin credentials:
     - Email: `admin@mygate.com` (or your custom email)
     - Password: `admin123` (or your custom password)

4. **Access Admin Features:**
   - Super Admin: Can create/manage societies, view all data
   - Society Admin: Can manage residents, notices, complaints for their society

## Default Admin Credentials (Script Method)

If you used the default script without parameters:

```
Email: admin@mygate.com
Password: admin123
Role: super_admin
```

**⚠️ Security Note:** Change the default password immediately after first login in production!

## Troubleshooting

### Issue: "User already exists"
**Solution:** The email is already registered. Either:
- Use a different email
- Delete the existing user from MongoDB
- Login with existing credentials

### Issue: "Society not found" (for society_admin)
**Solution:** 
- First create a society as super admin
- Then create society admin with the correct `societyId`

### Issue: Cannot login after creation
**Solution:**
- Verify the user was created: Check MongoDB `users` collection
- Ensure `isApproved: true` and `isActive: true`
- Check password is correctly hashed
- Verify backend server is running

## Next Steps After Admin Login

1. **Create a Society** (Super Admin only):
   - Go to Societies section
   - Create a new society with details

2. **Create Society Admin** (Super Admin):
   - Create a society admin user for the society
   - Assign them to the created society

3. **Manage Residents**:
   - View pending resident approvals
   - Approve/reject resident registrations

4. **Post Notices**:
   - Create notices and announcements
   - Create polls for residents

5. **Manage Complaints**:
   - View and assign complaints
   - Update complaint status

## Security Best Practices

1. **Change Default Password**: Always change default admin passwords
2. **Use Strong Passwords**: Minimum 8 characters with mix of letters, numbers, symbols
3. **Limit Admin Access**: Only create admin users when necessary
4. **Monitor Admin Activity**: Keep logs of admin actions
5. **Production Mode**: Disable public admin creation endpoint in production
