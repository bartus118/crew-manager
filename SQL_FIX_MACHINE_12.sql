-- SQL: Sprawdź maszyn 12
SELECT * FROM machines WHERE number = '12';

-- SQL: Ustaw default_view na true dla maszyny 12
UPDATE machines SET default_view = true WHERE number = '12';

-- SQL: Sprawdź wszystkie maszyny i ich default_view
SELECT number, default_view, ord FROM machines ORDER BY ord;

-- Jeśli maszyna 12 nie istnieje, możesz ją dodać:
-- INSERT INTO machines (number, ord, default_view, status) 
-- VALUES ('12', 12, true, 'Produkcja');
