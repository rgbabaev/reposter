CREATE TABLE notification_preferences (channel TEXT PRIMARY KEY CHECK(channel IN ('email','telegram')), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
INSERT INTO notification_preferences VALUES('email',1),('telegram',1);
