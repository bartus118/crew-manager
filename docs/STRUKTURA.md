# Szczegółowa Struktura Projektu Crew Manager

## 🏗️ Architektura

```
Projekt obsad/
│
├── 📄 Strony publiczne
│   ├── public/index.html ................. Tabela główna z przypisaniami
│   ├── public/rdnst.html ................. Import pracowników czasowych
│   ├── public/vacation.html .............. Zarządzanie urlopami
│   ├── public/admin.html ................. Panel administratora
│   └── public/js/
│       ├── script.js .................... Moduł główny
│       ├── rdnst.js .................... Moduł RDNST
│       ├── vacation.js ................. Moduł urlopów
│       └── admin.js .................... Logika panelu administratora
│
├── 🎨 Stylizacja CSS
│   └── css/
│       ├── common.css .................. Style wspólne dla całej aplikacji
│       ├── main.css ................... Stylizacja tabeli głównej
│       ├── admin.css .................. Stylizacja panelu administracyjnego
│       ├── rdnst.css .................. Stylizacja RDNST
│       └── vacation.css ............... Stylizacja urlopów
│
├── ⚙️ Konfiguracja
│   ├── config.js ...................... Konfiguracja Supabase i hasło
│   ├── .env.example ................... Template zmiennych środowiskowych
│   ├── .gitignore ..................... Pliki do pomijania w Git
│   └── package.json (opcjonalnie) ..... Zależności (jeśli używane)
│
└── 📚 Dokumentacja
    ├── README.md ...................... Opis główny projektu
    └── docs/STRUKTURA.md .............. Ten plik

```

## 📊 Przepływ danych

### Inicjalizacja aplikacji
```
1. Browser ładuje public/index.html
   ↓
2. Wczytywane style (CSS)
   ↓
3. Wczytywany config.js (Supabase URL, KEY)
   ↓
4. Wczytywany script.js (main logic)
   ↓
5. Inicjalizacja Supabase
   ↓
6. loadEmployees() → Pobierz pracowników
7. loadMachines() → Pobierz maszyny
8. Ustawienie date input na dzisiaj
   ↓
9. Oczekiwanie na akcję użytkownika
```

## 🔄 Zmienne globalne

### script.js
```javascript
let sb;                      // Instancja Supabase
let employees = [];          // Tablica pracowników
let machines = [];           // Tablica maszyn
let assignments = {};        // Obiekt: {date: {machineNumber: [...]}}
let vacationsByDate = {};    // Obiekt: {date: [{employee_id, start_date, end_date, reason, employeeName}]}
let currentDate;             // Obecnie wybrany dzień
let isLoggedInAsAdmin;       // Czy zalogowany admin
let rdnstWorkers = [];       // Pracownicy RDNST
```

## 📱 Responsywność

### Breakpointy CSS
- **Mobile**: < 768px
  - Tabela se scrolla horyzontalnie
  - Kolumna urlopów się zmieniają
- **Tablet**: 768px - 1024px
  - Layout się dostosowuje
- **Desktop**: > 1024px
  - Pełny layout

## 🔐 Hasła i dostępy

### Admin
- URL: `public/admin.html`
- Hasło: zdefiniowane w `config.js` (ADMIN_PASSWORD)
- Session: Przez całą sesję przeglądarki

### Supabase
- URL w `config.js`
- Klucz ANON w `config.js`
- RLS policies dla bezpieczeństwa

## 🐛 Debugging

### Console logs
W `script.js` zaloguj się jako admin i sprawdź:
- `console.log('Loaded vacations for', date)` - Urlopy
- `console.log('INSERT payload:', payload)` - Przypisania
- `console.log('Loaded assignments:', dateData)` - Dane przypisań

### Network tab
- `assignments` - Sprawdź zapytania do API
- `vacation` - Sprawdź wczytywanie urlopów
- `employees`, `machines` - Sprawdź dane startowe

## ✅ Checklist uruchomienia

- [ ] config.js ma poprawne klucze Supabase
- [ ] Baza danych ma tabele: employees, machines, assignments, vacation
- [ ] CSS ładuje się prawidłowo (bez 404)
- [ ] JS wczytuje się bez błędów
- [ ] Pracownicy widoczni w tabelach
- [ ] Można dodawać przypisania
- [ ] Można zarządzać urlopami
- [ ] Admin może się zalogować
- [ ] Pracownicy na urlopie są filtrywani

## 📞 Support

Dla problemów:
1. Otwórz DevTools (F12)
2. Sprawdź Console na błędy
3. Sprawdź Network na failed requests
4. Sprawdź czy Supabase jest dostępny
