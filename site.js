document.getElementById("year").textContent = new Date().getFullYear();
const dateInput = document.getElementById("preferred-date");
if (dateInput) dateInput.min = new Date().toISOString().split("T")[0];

document.getElementById("booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const message = document.getElementById("form-message");
  const data = Object.fromEntries(new FormData(form).entries());
  button.disabled = true; button.textContent = "SENDING...";
  message.className = "form-message"; message.textContent = "";
  try {
    const response = await fetch("/api/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not send your request.");
    message.className = "form-message success";
    message.textContent = result.message;
    form.reset();
    dateInput.min = new Date().toISOString().split("T")[0];
  } catch (error) {
    message.className = "form-message error";
    message.textContent = error.message;
  } finally {
    button.disabled = false; button.innerHTML = 'SEND BOOKING REQUEST <span>↗</span>';
  }
});
