import { supabase } from "./supabase.js";

/* PASSWORD VISIBILITY TOGGLE (shared for both password fields) */
document.querySelectorAll(".toggle-pass").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.querySelector("i").className = isPassword ? "ri-eye-off-line" : "ri-eye-line";
  });
});

const registerForm = document.getElementById("registerForm");
const submitButton = document.getElementById("registerBtn");

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const role = registerForm.querySelector('input[name="role"]:checked')?.value;
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const contactNumber = document.getElementById("contactNumber").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  /* VALIDATION */
  if (!role) {
    alert("Please select whether you are registering as a Driver or Operator.");
    return;
  }

  if (!fullName || !email || !contactNumber) {
    alert("Please fill in all the required fields.");
    return;
  }

  if (password.length < 6) {
    alert("Password must be at least 6 characters long.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match. Please try again.");
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Creating account...';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // After the user clicks the confirmation link in their email, send them
      // back to the login page. login.js will detect the session and sign them
      // in automatically.
      emailRedirectTo: new URL("http://127.0.0.1:5500/html/index.html", window.location.href).href,
      data: {
        role,
        full_name: fullName,
        contact_number: contactNumber,
      },
    },
  });

  if (error) {
    console.error("Supabase sign-up error:", error);
    alert(`Registration failed: ${error.message}`);
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="ri-user-add-line"></i> Create Account';
    return;
  }

  if (!data?.user) {
    alert("Something went wrong. Please try again.");
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="ri-user-add-line"></i> Create Account';
    return;
  }

  /*
    Insert the profile row directly. If email confirmation is enabled, this may be
    the primary sign-up and the user row is pending confirmation. In that case we
    will still redirect and let login guide them after they confirm their email.
  */
  const { error: profileInsertError } = await supabase.from("profiles").upsert(
    {
      id: data.user.id,
      role,
      full_name: fullName,
      contact_number: contactNumber,
    },
    { onConflict: "id" }
  );

  if (profileInsertError) {
    console.error("Profile insert error:", profileInsertError);
    // The auth account was created, but the profiles row could not be written
    // (usually because supabase/setup-auth.sql has not been run yet). The login
    // page will still work because it falls back to the role in user metadata.
  }

  localStorage.setItem("role", role);
  localStorage.setItem("userId", data.user.id);

  if (!data.session) {
    alert(
      "Account created! Please check your email to confirm your account before signing in."
    );
    window.location.href = "index.html";
    return;
  }

  alert("Account created successfully!");
  window.location.replace(
    role === "operator" ? "operatorportal.html" : "driverportal.html"
  );
});

