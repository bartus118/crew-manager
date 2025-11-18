# Crew Manager 📊

Aplikacja do zarządzania przypisaniami pracowników na maszyny produkcyjne.

## Funkcjonalności

### 🎯 Główne strony
- **Tabela obsady** (`public/index.html`) - Główny widok z przypisaniami pracowników do maszyn
- **Panel administratora** (`public/admin.html`) - Zarządzanie maszynami i pracownikami
- **RDNST** (`public/rdnst.html`) - Import pracowników czasowych
- **Nieobecności** (`public/vacation.html`) - Zarządzanie urlopami i nieobecnościami

### ✨ Moduły

#### 1. **Moduł przypisań** 👥
- Dodawanie/usuwanie przypisań pracowników do maszyn
- Widok pracowników pogrupowany po BU
- Filtrowanie kierowników do przypisania
- Obsługa pracowników z niewystarczającą dostępnością (0%) - ukrywanie w liście
- System procentów stanowisk dla każdej maszyny
- Obliczanie dostępnego procenta na dzień dla każdego pracownika
- Detekcja konfliktów stanowisk (Mech Focke ↔ Protos, Operator Focke ↔ Protos)
- Ostrzeżenie przy próbie przypisania pracownika z 0% dostępności

#### 2. **System kierowników** 🎓
- Zarządzanie kierownikami (CRUD)
- Filtrowanie pracowników po kierowniku
- Uprawnienia do jazdy (checkbox "Może jeździć")
- Uprawnienia do poszczególnych maszyn
- Widok kierowników jako kart z danymi
- Sortowanie alfabetyczne
- Drag-drop przenoszenia pracowników między kierownikami

#### 3. **Konfiguracja obciążenia** ⚙️
- Zarządzanie procentami stanowisk dla każdej maszyny
- Edycja/Anuluj workflow zamiast auto-save
- Przycisk "Edytuj" włącza tryb edycji
- Przycisk "Zapisz" zapisuje wszystkie zmiany jednocześnie
- Przycisk "Anuluj" odrzuca zmiany i wychodzi z trybu edycji
- Przycisk "Przywróć domyślne" resetuje wartości
- Zakresy: 0-200% dla każdej roli
- Informacja o stanie (widok/edycja)

#### 4. **Moduł RDNST** 🔄
- Import pracowników czasowych
- Format: `Nazwisko imie (PP)`
- Generowanie ID: `rdnst_XXX`
- Dostępni do 7 dni wstecz
- Archiwizacja starych rekordów

#### 5. **Moduł nieobecności** 📅
- Zarządzanie urlopami i nieobecnościami
- Typy: Urlopy, L4, Delegacje, Szkolenia
- Automatyczne obliczanie liczby dni
- Wyświetlanie z datą końca w głównej tabeli
- Grupowanie po typach nieobecności

#### 6. **Funkcje pomocnicze**
- **Eksport CSV** - Eksport danych przypisań na wybrany dzień
- **Synchronizacja** - Real-time aktualizacja z bazą Supabase
- **Filtrowanie maszyn** - Sortowanie po numerze (ord), wszystkie maszyny widoczne
- **Widok główny** - Kolumna nieobecności ze skróconymi informacjami

## 📁 Struktura projektu

```
Projekt obsad/
├── public/                 # Strony publiczne
│   ├── index.html         # Strona główna
│   ├── rdnst.html         # Zarządzanie RDNST
│   ├── vacation.html      # Zarządzanie urlopami
│   ├── admin.html         # Panel administratora
│   └── js/
│       ├── script.js      # Logika główna
│       ├── rdnst.js       # Moduł RDNST
│       ├── vacation.js    # Moduł urlopów
│       └── admin.js       # Logika panelu admin
│
├── css/                    # Stylizacja globalna
│   ├── common.css         # Style wspólne
│   ├── main.css           # Stylizacja tabeli głównej
│   ├── admin.css          # Stylizacja panelu
│   ├── rdnst.css          # Stylizacja RDNST
│   └── vacation.css       # Stylizacja urlopów
│
├── config.js              # Konfiguracja (Supabase)
├── .env.example          # Szablon zmiennych środowiskowych
├── README.md             # Ten plik
└── docs/                  # Dokumentacja
    └── STRUKTURA.md      # Szczegółowa struktura projektu
```

## 🚀 Uruchomienie

1. **Otwórz stronę główną:**
   - `public/index.html` - Tabela obsady

2. **Dostęp do panelu administratora:**
   - `public/admin.html` - Wymaga hasła

3. **Zarządzanie pracownikami:**
   - RDNST: `public/rdnst.html`
   - Urlopy: `public/vacation.html`

## 🔧 Konfiguracja

1. Skopiuj `.env.example` na `.env`
2. Dodaj klucze Supabase:
   ```javascript
   const SUPABASE_URL = 'https://your-project.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   const ADMIN_PASSWORD = 'your-password';
   ```

## 📊 Baza danych

### Tabele
- `employees` - Pracownicy
- `machines` - Maszyny
- `assignments` - Przypisania pracownik→maszyna
- `vacation` - Nieobecności
- `rdnst_workers` - Pracownicy czasowi (RDNST)

### Uwaga o employee_id
Kolumna `assignments.employee_id` jest typu **TEXT** (nie UUID), aby obsługiwać zarówno:
- UUID pracowników stałych
- `rdnst_XXX` format dla pracowników czasowych

## 🎨 Stylizacja

- **Schemat kolorów:** Niebieski (#234a75), szary (#555)
- **CSS Variables:** Używane w `common.css`
- **Responsywność:** Mobile-first design
- **Tabelaryczne widoki:** `border-collapse: separate` dla zaokrąglenia

## 🔐 Bezpieczeństwo

- Hasło administratora przechowywane w `config.js` (klient)
- Session-based authentication (do końca sesji)
- RLS (Row Level Security) w Supabase dla dodatkowej ochrony

## 📝 Notatki

### Kolumna Urlopy/Nieobecności
Wyświetla się w ostatniej kolumnie tabeli głównej z podziałem na:
- **Urlopy** (suma: X) - urlopy wypoczynkowe + na żądanie
- **L4** (suma: X) - chorobowe
- **Delegacje** (suma: X) - delegacje
- **Szkolenia** (suma: X) - szkolenia

Każda grupa pokazuje listę pracowników z datą końca nieobecności.

### Import RDNST
Format: `Nazwisko imie (PP)`
- Pracownicy importowani bez UUID
- Generowane ID: `rdnst_XXX`
- Dostępni do 7 dni wstecz

## 👨‍💻 Autor
Bartłomiej Kolasa

## 📄 Licencja
Wewnętrzne użytkowanie
