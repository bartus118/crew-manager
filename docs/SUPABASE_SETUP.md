# Konfiguracja Supabase

## Tabele wymagane

### 1. Tabela `vacation_limits`
Przechowuje limity urlopów dla pracowników na dany rok.

```sql
CREATE TABLE vacation_limits (
  id BIGSERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  limit_days INTEGER DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, year)
);

CREATE INDEX idx_vacation_limits_employee_year 
  ON vacation_limits(employee_id, year);
```

### 2. Tabela `vacation_plans`
Przechowuje plany urlopów pracowników (planowanie na rok).

```sql
CREATE TABLE vacation_plans (
  id BIGSERIAL PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  plan_data JSONB DEFAULT '{"days": {}}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, year)
);

CREATE INDEX idx_vacation_plans_employee_year 
  ON vacation_plans(employee_id, year);
```

Struktura `plan_data`:
```json
{
  "days": {
    "2025-01-15": "Urlop wypoczynkowy",
    "2025-01-16": "Urlop wypoczynkowy",
    "2025-02-10": "Wolne"
  }
}
```

- `"Urlop wypoczynkowy"` - liczy się do limitu
- `"Wolne"` - zaznaczenie bez limitu

## Istniejące tabele

### `vacation` - Tabela nieobecności
Przechowuje rzeczywiste nieobecności pracowników (dostępne i zatwierdzone).

Kolumny:
- `id` - BIGSERIAL PRIMARY KEY
- `employee_id` - UUID (FOREIGN KEY do employees)
- `start_date` - DATE
- `end_date` - DATE
- `reason` - TEXT ('Urlop wypoczynkowy', 'Urlop na żądanie', 'L4', 'Delegacja', 'Szkolenie')
- `approved` - BOOLEAN (true = zatwierdzona)
- `notes` - TEXT (opcjonalnie)
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

### `employees` - Tabela pracowników
- `id` - UUID PRIMARY KEY
- `surname` - TEXT
- `firstname` - TEXT
- `other_info` - JSONB

### `machine_status_schedule` - Tabela statusów maszyn na datę
Przechowuje statusy maszyn na konkretne daty (przesłania globalny status).

```sql
CREATE TABLE machine_status_schedule (
  id BIGSERIAL PRIMARY KEY,
  machine_number VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(machine_number, date)
);

CREATE INDEX idx_machine_status_schedule_date 
  ON machine_status_schedule(date);
CREATE INDEX idx_machine_status_schedule_machine_date 
  ON machine_status_schedule(machine_number, date);
```

## Kroki konfiguracji

1. Zaloguj się do Supabase Dashboard
2. Wybierz project
3. Przejdź do SQL Editor
4. Utwórz nową query
5. Skopiuj i uruchom SQL dla `vacation_limits`
6. Utwórz nową query
7. Skopiuj i uruchom SQL dla `vacation_plans`
8. Utwórz nową query
9. Skopiuj i uruchom SQL dla `machine_status_schedule`
10. Zweryfikuj że tabele się pojawiły w Data Browser

## Uwagi

- Obie tabele `vacation_*` używają JSONB dla elastyczności
- Indeksy zoptymalizowane dla najczęstszych zapytań
- UNIQUE constraint zapobiega duplikowaniu planów dla tego samego pracownika i roku / statusu dla tej samej maszyny i daty
- Kolumna `plan_data` zawiera obiekty z datami w formacie `YYYY-MM-DD`
- Tabela `machine_status_schedule` przechowuje statusy per-dzień dla maszyn, przesłaniając globalny status z tabeli `machines`
