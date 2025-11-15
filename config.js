/* ============================================================
   CENTRALNA KONFIGURACJA PROJEKTU
   ============================================================
   Wszystkie stałe i klucze API w jednym miejscu.
   Importuj: window.CONFIG
*/

window.CONFIG = {
  // Supabase Configuration
  supabase: {
    url: 'https://vuptrwfxgirrkvxkjmnn.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY'
  },

  // Machine Types Configuration
  machineTypes: {
    focke: ['F350', 'F550', 'GD', 'GDX', '751', '401', '411', '407', '408', '409', '707', '487', '489'],
    protos: ['P100', 'P70']
  },

  // Admin Panel Options
  admin: {
    permissions: ['P100', 'P70', 'F350', 'F550', 'GD', 'GDX', '751', '401', '411', '407', '408', '409', '707', '487', '489'],
    bus: ['', 'BU1', 'BU2', 'BU3', 'BU4'],
    roles: ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'operator_krosowy']
  },

  // Helper function to wait for Supabase SDK
  waitForSupabase: function(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if(window.supabase) {
          resolve();
        } else if(Date.now() - start > timeoutMs) {
          reject(new Error('Supabase SDK timeout'));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
};
