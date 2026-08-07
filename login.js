// ============================================================
// StockFlow — Sign in / Sign up (Supabase Auth)
// ============================================================

function showAuthError(message, isInfo = false) {
    const el = document.getElementById('authError');
    el.textContent = message;
    el.classList.toggle('info', isInfo);
    el.hidden = false;
}

function hideAuthError() {
    const el = document.getElementById('authError');
    el.hidden = true;
    el.classList.remove('info');
}

// ---------------- Sign in ----------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        showAuthError(error.message);
        return;
    }
    window.location.href = 'index.html';
});

// ---------------- Create account ----------------
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();

    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        showAuthError(error.message);
        return;
    }

    // If email confirmation is still enabled in your Supabase project,
    // there won't be a session yet — the user has to confirm by email first.
    if (!data.session) {
        showAuthError('Account created. Check your email to confirm it, then sign in.', true);
        return;
    }

    window.location.href = 'index.html';
});

// ---------------- Toggle between sign in / create account ----------------
document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    hideAuthError();
    document.getElementById('loginForm').hidden = true;
    document.getElementById('registerForm').hidden = false;
    document.getElementById('toRegisterWrap').hidden = true;
    document.getElementById('toLoginWrap').hidden = false;
});

document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    hideAuthError();
    document.getElementById('registerForm').hidden = true;
    document.getElementById('loginForm').hidden = false;
    document.getElementById('toLoginWrap').hidden = true;
    document.getElementById('toRegisterWrap').hidden = false;
});

// ---------------- Already signed in? Skip straight to the dashboard ----------------
(async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) window.location.href = 'index.html';
})();
