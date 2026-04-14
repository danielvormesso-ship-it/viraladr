-- Allow admins to read all editor activity in the admin panel
CREATE POLICY "Admins can read all activity"
ON public.editor_activity FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);
