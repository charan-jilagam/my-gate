# Nivora - Design Document

## 1. System Overview

### 1.1 Purpose
This document describes the architecture, design, and implementation of a comprehensive society management system that replicates core functionalities of the Nivora application.

### 1.2 Scope
The system provides:
- Multi-role user management (Super Admin, Society Admin, Residents, Security, Staff)
- Visitor and delivery management with approval workflows
- Vehicle entry/exit tracking
- Community communication (notices, polls, announcements)
- Help desk/complaint management
- Payment processing integration
- Amenity booking system
- Real-time notifications

### 1.3 Technology Stack

**Backend:**
- Node.js + Express.js (RESTful API)
- MongoDB + Mongoose (Database)
- Socket.io (Real-time communication)
- JWT (Authentication)
- Razorpay (Payment gateway)
- Nodemailer (Email service)

**Frontend:**
- React.js 18 (UI Framework)
- React Router v6 (Routing)
- Context API (State Management)
- Tailwind CSS (Styling)
- Axios (HTTP Client)
- Socket.io Client (Real-time)

## 2. Architecture

### 2.1 System Architecture

```
┌─────────────────┐
│   React Frontend │
│   (Port 5173)    │
└────────┬─────────┘
         │ HTTP/WebSocket
         │
┌────────▼─────────┐
│  Express Backend  │
│   (Port 5000)     │
└────────┬─────────┘
         │
┌────────▼─────────┐
│   MongoDB         │
│   (Port 27017)    │
└───────────────────┘
```

### 2.2 Component Architecture

**Backend Structure:**
```
backend/
├── models/          # Database schemas
├── routes/          # API route handlers
├── middleware/      # Authentication, validation
├── utils/           # Helper functions
└── server.js        # Entry point
```

**Frontend Structure:**
```
frontend/src/
├── components/      # Reusable UI components
├── pages/           # Page components
├── contexts/        # React contexts (Auth, Socket)
├── services/        # API service layer
└── App.jsx          # Root component
```

## 3. Database Design

### 3.1 Entity Relationship Diagram

```
Users ──┬──> Societies
         │
         ├──> Visitors
         ├──> Deliveries
         ├──> Vehicles
         ├──> Complaints
         ├──> Payments
         ├──> Bookings
         └──> Notifications

Societies ──> Notices
```

### 3.2 Schema Details

#### Users Collection
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  phone: String,
  role: Enum ['super_admin', 'society_admin', 'resident', 'security', 'staff', 'vendor'],
  societyId: ObjectId (ref: Society),
  flatNo: String,
  block: String,
  isApproved: Boolean,
  profilePic: String
}
```

#### Visitors Collection
```javascript
{
  residentId: ObjectId (ref: User),
  societyId: ObjectId (ref: Society),
  name: String,
  phone: String,
  purpose: Enum ['personal', 'business', 'delivery', 'service', 'other'],
  approved: Boolean,
  status: Enum ['pending', 'approved', 'rejected', 'checked_in', 'checked_out'],
  qrCode: String,
  entryTime: Date,
  exitTime: Date
}
```

#### Similar schemas for Deliveries, Vehicles, Notices, Complaints, Payments, Bookings

## 4. API Design

### 4.1 RESTful Conventions

- **GET** - Retrieve resources
- **POST** - Create resources
- **PUT** - Update resources
- **DELETE** - Delete resources

### 4.2 Authentication Flow

```
1. User registers/logs in
2. Backend validates credentials
3. JWT token generated
4. Token sent to frontend
5. Frontend stores token
6. Token included in subsequent requests
7. Middleware validates token
8. Request processed if valid
```

### 4.3 Authorization Levels

- **Public Routes**: Login, Register, Password Reset
- **Protected Routes**: All other routes require authentication
- **Role-Based Access**: Routes check user role before processing

## 5. Feature Specifications

### 5.1 Visitor Management

**Flow:**
1. Resident invites visitor (provides details)
2. System generates QR code
3. Security receives notification
4. Resident/Security approves/rejects
5. Visitor arrives, QR scanned
6. Entry logged with timestamp
7. Exit logged when visitor leaves

**Key Features:**
- Pre-approval workflow
- QR code generation
- Real-time notifications
- Entry/exit logging
- Photo capture (optional)

### 5.2 Delivery Management

**Flow:**
1. Resident expects delivery
2. System generates QR code and OTP
3. Delivery person arrives
4. Security verifies and checks in
5. OTP sent to resident
6. Delivery completed with OTP verification

**Key Features:**
- OTP-based verification
- Tracking number support
- Item details tracking
- Delivery status updates

### 5.3 Vehicle Management

**Flow:**
1. Resident registers vehicle
2. Vehicle details stored
3. Security logs entry (scans/enters vehicle number)
4. Entry timestamp recorded
5. Security logs exit
6. Exit timestamp recorded

**Key Features:**
- Vehicle registration
- Entry/exit logging
- Parking slot assignment
- Vehicle history tracking

### 5.4 Community Communication

**Notices:**
- Admin creates notice
- Target audience selection (all/residents/specific blocks)
- Publishing with priority levels
- View tracking

**Polls:**
- Create poll with options
- Residents vote
- Real-time results
- Poll expiration

**Events:**
- Event creation with date/location
- RSVP functionality (optional)

### 5.5 Complaint Management

**Flow:**
1. Resident raises complaint
2. Complaint assigned to staff/admin
3. Status updates (open → in_progress → resolved)
4. Updates added throughout lifecycle
5. Resolution with feedback

**Key Features:**
- Category-based classification
- Priority levels
- Assignment workflow
- Status tracking
- Image attachments
- Public/private complaints

### 5.6 Payment Integration

**Flow:**
1. Payment order created
2. Razorpay order generated
3. User redirected to payment page
4. Payment completed
5. Webhook verifies payment
6. Payment status updated
7. Receipt generated

**Key Features:**
- Multiple payment types (maintenance, fines, bookings)
- Payment history
- Receipt generation
- Late fee calculation
- Payment reminders

## 6. Security Considerations

### 6.1 Authentication Security
- JWT tokens with expiration
- Password hashing with bcrypt
- Token refresh mechanism
- Secure token storage

### 6.2 Authorization Security
- Role-based access control
- Route-level protection
- Resource-level authorization
- Society-level isolation

### 6.3 Data Security
- Input validation and sanitization
- SQL injection prevention (MongoDB)
- XSS protection
- CSRF protection
- Rate limiting

### 6.4 API Security
- HTTPS enforcement
- CORS configuration
- Helmet.js security headers
- Request size limits
- Error message sanitization

## 7. Real-time Features

### 7.1 Socket.io Implementation

**Events:**
- `join-room`: User joins their notification room
- `notification`: Real-time notification sent
- `visitor-update`: Visitor status changes
- `delivery-update`: Delivery status changes

**Use Cases:**
- Visitor approval notifications
- Delivery arrival alerts
- Vehicle entry/exit notifications
- Complaint status updates
- New notice announcements

## 8. User Experience Design

### 8.1 Design Principles
- Mobile-first responsive design
- Intuitive navigation
- Clear visual hierarchy
- Consistent UI components
- Accessible design

### 8.2 Key UI Components
- Dashboard with statistics
- Data tables with filters
- Modal forms for actions
- Status badges
- Notification system
- Loading states
- Error handling

## 9. Performance Optimization

### 9.1 Backend Optimization
- Database indexing
- Query optimization
- Pagination for large datasets
- Caching strategies
- Connection pooling

### 9.2 Frontend Optimization
- Code splitting
- Lazy loading
- Image optimization
- Bundle size optimization
- Memoization

## 10. Testing Strategy

### 10.1 Backend Testing
- Unit tests for utilities
- Integration tests for APIs
- Authentication tests
- Authorization tests

### 10.2 Frontend Testing
- Component tests
- Integration tests
- E2E tests (optional)

## 11. Deployment Architecture

### 11.1 Production Setup
- Backend: Railway/Heroku/DigitalOcean
- Frontend: Vercel/Netlify
- Database: MongoDB Atlas
- CDN: Cloudflare (optional)

### 11.2 Environment Configuration
- Development: Local MongoDB
- Staging: Separate environment
- Production: MongoDB Atlas + Production APIs

## 12. Future Enhancements

- Mobile app (React Native)
- Advanced analytics dashboard
- Document management
- Staff attendance system
- Vendor management
- Maintenance scheduling
- Community forum
- Event management
- Package tracking
- Visitor pre-registration via SMS

## 13. Conclusion

This design document outlines a comprehensive society management system with robust features, security, and scalability considerations. The modular architecture allows for easy extension and maintenance.
