// ============================================
// 🍔 GLOBALER MENU CODE
// ============================================

// Toggle Funktion (Öffnen/Schließen)
function toggleMenu(event) {
    if(event) event.stopPropagation(); // Verhindert sofortiges Schließen
    
    const menu = document.getElementById('main-dropdown');
    if(menu) {
        menu.classList.toggle('show');
        // Haptisches Feedback (Vibration)
        if(navigator.vibrate) navigator.vibrate(10);
    }
}

// Menü schließen, wenn man daneben klickt
document.addEventListener('click', function(event) {
    const menu = document.getElementById('main-dropdown');
    const btn = document.querySelector('.hamburger-btn');
    
    // Wenn Menü offen ist UND Klick nicht auf Menü UND nicht auf Button war
    if (menu && menu.classList.contains('show') && !menu.contains(event.target) && event.target !== btn) {
        menu.classList.remove('show');
    }
});

// Admin Check (Global verfügbar machen)
function checkAdminAccess() {
    const password = prompt("🔒 Admin-Bereich\nBitte Passwort eingeben:");
    // Hier dein Passwort anpassen
    if (password === "09052023") {
        window.location.href = "admin.html";
    } else if (password !== null) {
        alert("Zugriff verweigert ⛔");
    }
}

// Damit die Funktionen im HTML (onclick="...") gefunden werden:
window.toggleMenu = toggleMenu;
window.checkAdminAccess = checkAdminAccess;
