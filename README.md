# Nivora - Every Community. One Platform.

A comprehensive society management application built with the MERN stack. This system enables secure management of apartment societies with features for visitor management, deliveries, vehicle tracking, payments, complaints, and community communication.

## 🚀 Features

### Core Functionalities

- **Secure Authentication**: JWT-based authentication with role-based access control
- **Visitor Management**: Invite, approve/reject visitors with QR code generation
- **Delivery Management**: Track and manage deliveries with OTP verification
- **Vehicle Management**: Register vehicles and track entry/exit logs
- **Community Communication**: Notices, announcements, polls, and event management
- **Help Desk/Complaints**: Ticket system with status tracking and assignment
- **Payment Integration**: Razorpay integration for maintenance and other payments
- **Amenity Booking**: Book society amenities with availability checking
- **Real-time Notifications**: Socket.io powered real-time updates

### New: services, community and safety

- **Home services marketplace**: electricians, plumbers, carpenters and more; vendors publish free slots, residents book them
- **Community**: neighbours' forum, buy and sell, lost and found
- **SOS** with emergency numbers, **daily help** attendance at the gate, **event RSVP**, **society accounts**
- Phone-first navigation with a bottom tab bar, quick actions and working notification links

See [FEATURES.md](FEATURES.md) for how each works, the rules, the API and the tests.

### New: documents, votes, upkeep, shift roster, guide, languages
Documents library, secret-ballot votes, facility upkeep schedule, guard and staff shift roster with clock in/out, online payment of
service bills, English / Hindi / Telugu, and a role-based user guide (each role sees only its own manual). See `FEATURES.md`.

### User Roles

- **Super Admin**: Manage all societies and oversee system
- **Society Admin**: Manage residents, staff, notices, and billing for their society
- **Resident**: View/pay bills, approve visitors/deliveries, book amenities, raise complaints
- **Security/Guard**: Log visitors/vehicles, patrolling check-ins, view approvals
- **Staff/Vendor**: Service tickets, attendance tracking

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **Real-time**: Socket.io
- **Payment Gateway**: Razorpay
- **File Upload**: Cloudinary (optional)
- **Email**: Nodemailer
- **QR Code**: qrcode library

### Frontend
- **Framework**: React.js 18 with Hooks
- **Routing**: React Router v6
- **State Management**: Context API
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **HTTP Client**: Axios
- **Notifications**: React Hot Toast
- **Icons**: React Icons
- **Real-time**: Socket.io Client

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn package manager

## 🔧 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd mygate
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/mygate

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRE=7d

# Email Configuration (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Razorpay Payment Gateway
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Frontend URL (for CORS and email links)
FRONTEND_URL=http://localhost:5173
```

Start the backend server:

```bash
npm run dev
```

The backend will run on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## 📁 Project Structure

```
mygate/
├── backend/
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API routes
│   ├── middleware/      # Auth & error handling
│   ├── utils/           # Helper functions
│   ├── server.js        # Express server setup
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── contexts/    # React contexts
│   │   ├── services/   # API services
│   │   └── App.jsx     # Main app component
│   └── package.json
└── README.md
```

## 🔐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `PUT /api/auth/reset-password/:token` - Reset password

### Visitors
- `POST /api/visitors/invite` - Invite visitor
- `GET /api/visitors` - Get visitors list
- `PUT /api/visitors/:id/approve` - Approve visitor
- `PUT /api/visitors/:id/reject` - Reject visitor
- `PUT /api/visitors/:id/check-in` - Check in visitor
- `PUT /api/visitors/:id/check-out` - Check out visitor

### Deliveries
- `POST /api/deliveries/invite` - Expect delivery
- `GET /api/deliveries` - Get deliveries list
- `PUT /api/deliveries/:id/approve` - Approve delivery
- `PUT /api/deliveries/:id/check-in` - Check in delivery
- `PUT /api/deliveries/:id/deliver` - Mark as delivered

### Vehicles
- `POST /api/vehicles/register` - Register vehicle
- `GET /api/vehicles` - Get vehicles list
- `POST /api/vehicles/:id/entry` - Log entry
- `POST /api/vehicles/:id/exit` - Log exit

### Notices
- `POST /api/notices` - Create notice (Admin)
- `GET /api/notices` - Get notices
- `POST /api/notices/:id/vote` - Vote on poll

### Complaints
- `POST /api/complaints` - Create complaint
- `GET /api/complaints` - Get complaints
- `PUT /api/complaints/:id/assign` - Assign complaint
- `PUT /api/complaints/:id/status` - Update status

### Payments
- `POST /api/payments/create-order` - Create Razorpay order
- `POST /api/payments/verify` - Verify payment
- `GET /api/payments` - Get payment history

## 🗄️ Database Schema

### Collections
- **Users**: User accounts with roles and permissions
- **Societies**: Society information and settings
- **Visitors**: Visitor invitations and logs
- **Deliveries**: Delivery tracking and management
- **Vehicles**: Vehicle registration and entry/exit logs
- **Notices**: Community notices, announcements, polls
- **Complaints**: Help desk tickets and resolutions
- **Payments**: Payment transactions and history
- **Bookings**: Amenity bookings
- **Notifications**: User notifications

## 🚀 Deployment

### Backend Deployment (Example: Heroku/Railway)

1. Set environment variables in your hosting platform
2. Ensure MongoDB Atlas connection string is set
3. Deploy backend code
4. Update `FRONTEND_URL` in backend `.env`

### Frontend Deployment (Example: Vercel/Netlify)

1. Build the frontend: `npm run build`
2. Deploy the `dist` folder
3. Set environment variables if needed
4. Update API base URL in production

## 🔒 Security Features

- JWT token-based authentication
- Password hashing with bcrypt
- Role-based access control (RBAC)
- Input validation and sanitization
- Rate limiting on API endpoints
- CORS configuration
- Helmet.js for security headers

## 📱 Usage

1. **Super Admin** creates societies
2. **Society Admin** manages residents and settings
3. **Residents** register and wait for approval
4. **Residents** can invite visitors, expect deliveries, book amenities
5. **Security** logs entries/exits and manages gate operations
6. **Admins** post notices, manage complaints, and oversee operations

## 🧪 Testing

```bash
# Backend tests (391 tests)
cd backend
npm test

# Frontend tests (when configured)
cd frontend
npm test
```

## 📝 License

This project is created for educational purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue in the repository.

---

**Note**: This is a clone/educational project. Ensure you have proper licenses and permissions before using payment gateways and other third-party services in production.
