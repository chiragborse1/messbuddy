
-- Insert configuration for auto notification toggle
INSERT INTO menu_items (created_at, name, category, votes, image_url)
SELECT NOW(), 'auto_notification', 'config', 1, 'notification_config.png'
WHERE NOT EXISTS (
    SELECT 1 FROM menu_items WHERE name = 'auto_notification' AND category = 'config'
);

-- Select to verify
SELECT * FROM menu_items WHERE category = 'config';
