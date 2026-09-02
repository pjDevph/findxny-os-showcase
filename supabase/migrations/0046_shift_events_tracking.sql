-- Create shift_events table for tracking clock in/out/break events with photos
CREATE TABLE IF NOT EXISTS shift_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  photo_url TEXT,
  photo_bucket_path TEXT,
  notes TEXT,
  location_lat FLOAT8,
  location_lon FLOAT8,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(shift_id, event_type, event_timestamp)
);

-- Index for efficient querying
CREATE INDEX idx_shift_events_shift_id ON shift_events(shift_id);
CREATE INDEX idx_shift_events_staff_id ON shift_events(staff_id);
CREATE INDEX idx_shift_events_workspace_id ON shift_events(workspace_id);
CREATE INDEX idx_shift_events_event_type ON shift_events(event_type);
CREATE INDEX idx_shift_events_timestamp ON shift_events(event_timestamp DESC);

-- Extend shifts table with current_status, total_break_minutes, last_clock_in_at
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'clocked_out' CHECK (current_status IN ('clocked_in', 'on_break', 'clocked_out'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_break_minutes INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS last_clock_in_at TIMESTAMP WITH TIME ZONE;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_shifts_current_status ON shifts(current_status);
CREATE INDEX IF NOT EXISTS idx_shifts_last_clock_in_at ON shifts(last_clock_in_at);

-- Enable RLS on shift_events
ALTER TABLE shift_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for shift_events
CREATE POLICY "Users can view shift events for their workspace"
  ON shift_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert shift events for their workspace"
  ON shift_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update shift events for their workspace"
  ON shift_events FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Function to update shift status based on events
CREATE OR REPLACE FUNCTION update_shift_status_from_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'clock_in' THEN
    UPDATE shifts
    SET current_status = 'clocked_in',
        last_clock_in_at = NEW.event_timestamp
    WHERE id = NEW.shift_id;
  ELSIF NEW.event_type = 'clock_out' THEN
    UPDATE shifts
    SET current_status = 'clocked_out'
    WHERE id = NEW.shift_id;
  ELSIF NEW.event_type = 'break_start' THEN
    UPDATE shifts
    SET current_status = 'on_break'
    WHERE id = NEW.shift_id;
  ELSIF NEW.event_type = 'break_end' THEN
    UPDATE shifts
    SET current_status = 'clocked_in',
        total_break_minutes = total_break_minutes + (EXTRACT(EPOCH FROM (NEW.event_timestamp -
          (SELECT event_timestamp FROM shift_events
           WHERE shift_id = NEW.shift_id AND event_type = 'break_start'
           ORDER BY event_timestamp DESC LIMIT 1)))/60)::INT
    WHERE id = NEW.shift_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update shift status
CREATE TRIGGER trigger_update_shift_status
AFTER INSERT ON shift_events
FOR EACH ROW
EXECUTE FUNCTION update_shift_status_from_event();
