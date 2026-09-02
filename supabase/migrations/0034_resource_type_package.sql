-- Broaden bookable resources beyond rooms/amenities so the same booking system
-- can sell event / catering / party "packages" (Bookings hub, not just Staycation).
alter type resource_type add value if not exists 'package';
