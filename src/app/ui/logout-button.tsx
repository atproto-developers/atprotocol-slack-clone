"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/oauth/logout", { method: "POST" });
    window.location.assign("/");
  }
  return <button className="profile-menu" onClick={logout} aria-label="Sign out">⋯</button>;
}
