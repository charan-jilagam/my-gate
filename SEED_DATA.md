# Seed Data Guide

This guide explains how to populate your database with dummy data for testing and development.

## Quick Start

Run the seed script to populate all collections with realistic dummy data:

```bash
cd backend
npm run seed
```

## What Gets Created

The seed script creates:

### 1. **Societies** (2)
- Green Valley Apartments (Bangalore)
- Sunset Heights (Mumbai)
- Each with blocks, amenities, and settings

### 2. **Users** (~30)
- 1 Super Admin
- 2 Society Admins (one per society)
- 20 Residents (with various approval statuses)
- 4 Security Guards
- 3 Staff Members

### 3. **Visitors** (30)
- Various statuses: pending, approved, rejected, checked_in, checked_out
- Different purposes: personal, business, delivery, service, other
- Linked to residents

### 4. **Deliveries** (25)
- Various statuses: pending, approved, rejected, in_transit, delivered
- Different companies: Amazon, Flipkart, Swiggy, etc.
- With tracking numbers and items

### 5. **Vehicles** (15)
- Cars, bikes, scooters, bicycles
- Some inside, some outside
- Entry/exit logs

### 6. **Notices** (20)
- Different types: notice, announcement, poll, event, maintenance
- Various priorities and categories
- Some with poll options

### 7. **Complaints** (25)
- Different categories: maintenance, security, cleaning, etc.
- Various statuses: open, in_progress, resolved, closed
- Some assigned to staff

### 8. **Payments** (40)
- Different types: maintenance, fine, amenity_booking
- Various statuses: pending, completed, failed
- With transaction details

### 9. **Bookings** (20)
- Amenity bookings: Swimming Pool, Gym, Clubhouse, etc.
- Various statuses: pending, approved, rejected, cancelled
- With time slots

### 10. **Notifications** (50)
- Various notification types
- Some read, some unread
- Linked to different users

### 11. **Home services and community** (per society with approved residents)
- 4 vendors (plumber, electrician and AC, carpenter and painter, cleaning and pest control) with schedules and ratings
- 9 service bookings in every state: completed with reviews, confirmed, waiting for the vendor, cancelled, declined
- 6 community posts, 6 emergency numbers, 3 daily helpers with about 3 weeks of attendance, 6 expenses, RSVPs on events

## Default Login Credentials

After seeding, you can login with these credentials:

### Super Admin
```
Email: superadmin@mygate.com
Password: admin123
```

### Society Admin
```
Email: admin1@society.com
Password: admin123
```

### Resident
```
Email: resident1@example.com
Password: resident123
```

### Security Guard
```
Email: security1@example.com
Password: security123
```

### Vendor
The seed prints the exact address. It looks like `vendor1.<4 characters>@example.com`; find them in the database or in the
society admin's Home services screen.
```
Password: vendor123
```

### Staff
```
Email: staff1@example.com
Password: staff123
```

**Note**: Multiple residents, security guards, and staff are created. You can use `resident2@example.com`, `resident3@example.com`, etc.

## Important Notes

### Data Clearing
The seed script **clears all existing data** before seeding. If you want to keep existing data, comment out the delete operations in `scripts/seedData.js`:

```javascript
// Comment out these lines:
// await User.deleteMany({});
// await Society.deleteMany({});
// etc.
```

### Relationships
All data is properly linked:
- Residents belong to societies
- Visitors/Deliveries linked to residents
- Vehicles linked to residents
- Complaints linked to residents and staff
- Payments linked to residents
- Bookings linked to residents and amenities
- Notifications linked to users

### Randomization
The seed script uses randomization for:
- Dates (within 2024)
- Statuses
- Assignments
- Phone numbers
- Vehicle numbers

## Customization

You can modify `backend/scripts/seedData.js` to:
- Change the number of records created
- Modify default values
- Add more societies
- Change user details
- Adjust date ranges

## Troubleshooting

### Error: "Cannot read property '_id' of undefined"
- Make sure MongoDB is running
- Check that societies are created before users

### Error: "Validation failed"
- Check that all required fields are provided
- Verify data types match the schema

### Error: "Duplicate key error"
- The script clears existing data first
- If you see this, check for unique constraints

## Re-seeding

To re-seed the database:
```bash
npm run seed
```

This will clear existing data and create fresh dummy data.

## Production Warning

⚠️ **Never run seed scripts in production!** This script is only for development and testing purposes.

## Added in round 3 (per society that has approved residents)

- 5 library documents (one visible to admins only), 2 votes (one open, one closed), 4 upkeep jobs (one overdue, one due soon),
  and three days of shifts for every guard and staff member (alternating day and night for guards).
- The seed clears these collections too: documents, votes, ballots, upkeep, shifts.
- Document links point to a placeholder, replace them before demos that open files.
