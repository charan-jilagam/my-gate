<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

## Project Overview

Nivora web app manages apartment societies using MERN stack (MongoDB, Express.js, React.js, Node.js). It supports role-based access for admins, residents, security, and staff with core features like visitor management and payments. Designed as Cursor-friendly with modular components for easy AI-assisted development.[^1][^2][^3]

## Tech Stack

- **Frontend**: React.js (with hooks, Context/Redux for state), Tailwind CSS/Bootstrap for responsive UI, React Router for navigation.
- **Backend**: Node.js/Express.js, JWT for authentication, bcrypt for passwords.
- **Database**: MongoDB (Mongoose ODM) for users, societies, visitors, payments.
- **Additional**: Stripe/Razorpay for payments, Socket.io for real-time notifications, Cloudinary for media uploads.[^3][^4][^5]


## User Roles \& Permissions

- **Super Admin**: Create/manage societies, oversee all data.
- **Society Admin**: Manage residents/staff, notices, complaints, billing for their society.
- **Resident**: View/pay bills, approve visitors/deliveries, book amenities, raise complaints.
- **Security/Guard**: Log visitors/vehicles, patrolling check-ins, view approvals.
- **Staff/Vendor**: Attendance, service tickets, vendor ratings.[^6][^1][^3]


## Core Features

### Authentication \& Onboarding

- User registration/login (email/password, Google OAuth).
- Society selection during signup; admin approval for new residents.
- Role-based dashboards with JWT-protected routes.
- Password reset via email (Nodemailer/SendGrid).[^5][^3]


### Visitor \& Delivery Management

- Residents invite visitors/deliveries with pre-approval; QR code/digital pass generation.
- Security scans/approves entries; real-time notifications via WebSocket.
- Logs with entry/exit timestamps, photos; masked directory for privacy.[^7][^1][^6]


### Payments \& Billing

- Monthly maintenance billing; online payments (UPI/cards via Razorpay).
- Payment history, receipts, auto-reconciliation.
- Fine/penalty tracking for late payments.[^8][^1][^3]


### Complaints \& Helpdesk

- Residents submit tickets with photos/descriptions; auto-assignment/escalation.
- Status tracking (open/in-progress/resolved); admin/staff resolution.
- Reports/export for audits.[^1][^3]


### Notice Board \& Communication

- Admin posts notices/polls/surveys; push notifications/emails.
- Community forum/discussion; event calendars.
- SMS/Email integration for alerts.[^2][^8]


### Amenities \& Booking

- Book gym/clubhouse/parking slots; real-time availability calendar.
- Admin approval/usage logs.[^9][^3]


### Staff \& Vendor Management

- Selfie/attendance tracking; shift schedules, leave requests.
- Vendor contracts/ratings, service SLAs.[^6][^1]


## Database Schema (MongoDB Collections)

```
Users: { _id, name, email, role, societyId, flatNo, phone, profilePic }
Societies: { _id, name, address, admins[], blocks[], totalFlats }
Visitors: { _id, residentId, name, phone, purpose, approved, entryTime, exitTime, qrCode }
Payments: { _id, residentId, amount, status, txId, month, receiptUrl }
Complaints: { _id, residentId, title, description, status, assignedTo, images[] }
Bookings: { _id, residentId, amenity, slotDate, status }
Notices: { _id, societyId, title, content, type(poll/notice), createdBy }
```

Use indexes on societyId, residentId for queries.[^4][^3]

## API Endpoints (RESTful)

```
Auth: POST /api/auth/register, /login, /forgot-password
Societies: GET/POST /api/societies, GET /:id/residents
Visitors: POST /api/visitors/invite, PUT /:id/approve, GET /logs
Payments: POST /api/payments/create, GET /history
Complaints: POST /api/complaints, PUT /:id/status, GET /my-complaints
Notices: GET /api/notices, POST /api/polls/vote
```

Error handling with try-catch; validation with Joi.[^3][^5]

## Frontend Structure (Cursor-Friendly)

```
src/
  components/ (reusable: Navbar, Modal, Card)
  pages/ (Login, Dashboard, Visitors, Payments)
  hooks/ (useAuth, useApi)
  contexts/ (AuthContext, SocietyContext)
  services/ (api.js with axios)
```

Modular pages as React.lazy() for easy Cursor generation.[^3]

## Non-Functional Requirements

- Responsive design (mobile-first for guards/residents).
- Real-time updates (Socket.io for approvals/notices).
- Security: Input sanitization, rate-limiting, HTTPS.
- Performance: Pagination, lazy loading; deploy on Vercel backend + MongoDB Atlas.
- Testing: Jest for unit, Cypress for E2E.[^10]


## Development Phases

1. Setup MERN boilerplate, auth.
2. Society/resident CRUD.
3. Core modules (visitors, payments).
4. UI polish, real-time, deploy.[^11][^10]
<span style="display:none">[^12][^13][^14][^15][^16][^17][^18][^19][^20]</span>

<div align="center">⁂</div>

[^1]: https://play.google.com/store/apps/details?id=com.mygate.user\&hl=en_IN

[^2]: https://mygates.techletsolutions.com

[^3]: https://www.linkedin.com/posts/pratik-gabani-329000286_webdevelopment-fullstackdevelopment-mernstack-activity-7360860098467966978-vNQj

[^4]: https://github.com/KiruthikaJanakiraman/Apartment-Management-System

[^5]: https://github.com/rhaelfixer/MERN-Society-CMS

[^6]: https://mygate.com/offerings/

[^7]: https://docsbot.ai/prompts/technical/mygate-clone

[^8]: https://www.softwaresuggest.com/mygate

[^9]: https://www.linkedin.com/posts/dhruv-giri-goswami-290074255_webapp-apartmentmanagement-reactjs-activity-7353770872542846976-qhd5

[^10]: https://www.scribd.com/document/818223207/Software-Requirements-Specification

[^11]: https://www.scribd.com/doc/120170020/Apartment-Management-System-Analysis-Design

[^12]: https://www.youtube.com/watch?v=mbpRfoYqInA

[^13]: https://play.google.com/store/apps/details?hl=en\&id=com.mygate.user

[^14]: https://apps.apple.com/in/app/mygate-premium/id1101762651

[^15]: https://www.dexbytes.com/portfolio/mygate-app-clone

[^16]: https://github.com/topics/society-management

[^17]: https://github.com/kanscerr/society-management-system

[^18]: https://www.scribd.com/doc/253149692/Apartment-Management-System

[^19]: https://www.youtube.com/watch?v=SsMn8tT3ZBQ

[^20]: https://github.com/lahin31/society-management-system

