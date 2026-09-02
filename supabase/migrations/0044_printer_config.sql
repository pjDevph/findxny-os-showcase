-- Add printer_config JSON column to workspaces table
-- Stores array of printer configurations (name, type, device address, model)
-- Each device reads/writes to this shared config

alter table workspaces
  add column if not exists printer_config jsonb default '{"printers": [], "lastUpdated": null}'::jsonb;

-- Example printer_config structure:
-- {
--   "printers": [
--     {
--       "id": "uuid-or-temp-id",
--       "name": "Kitchen Receipt",
--       "type": "thermal",
--       "deviceAddress": "192.168.1.100",
--       "model": "Zebra ZD400",
--       "isDefault": true
--     },
--     {
--       "id": "uuid-or-temp-id",
--       "name": "Bluetooth Label",
--       "type": "label",
--       "deviceAddress": "00:1A:2B:3C:4D:5E",
--       "model": "Brother QL-810W",
--       "isDefault": false
--     }
--   ],
--   "lastUpdated": "2026-06-13T10:30:00.000Z"
-- }

comment on column workspaces.printer_config is 'Workspace printer configurations: thermal/label/bluetooth_receipt printers with IP/MAC/device-name addresses';
