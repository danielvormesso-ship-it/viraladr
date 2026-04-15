-- Indexes for editor_activity (frequently queried in AdminPanel)
CREATE INDEX IF NOT EXISTS idx_editor_activity_user_id ON editor_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_editor_activity_created_at ON editor_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_editor_activity_action_type ON editor_activity(action_type);
