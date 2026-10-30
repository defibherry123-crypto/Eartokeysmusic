// These additions are injected into dist/index.html only; localhost keeps the real backend.
(() => {
  PreviewSite.refresh = () => refreshMe();
  const banner = document.createElement("div");
  banner.className = "client-preview-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Client design preview");
  banner.innerHTML =
    '<span><b>Work in progress</b> · Design preview. Sample data; no live payments or uploads.</span><nav aria-label="Preview pages"><a href="#/home">Website</a><button type="button">Student Preview</button><a href="#/login">Sign In Design</a><a href="#/signup">Sign Up Design</a></nav>';
  banner.querySelector("button").onclick = () => PreviewSite.openStudent();
  document.body.prepend(banner);
  const success = V.success;
  V.success = () =>
    success()
      .replace(
        "Payment verified by the server",
        "Demo access — no payment collected",
      )
      .replace("Active Now", "Preview Access")
      .replace(
        "Your subscription is now active",
        "You are viewing sample subscription details",
      );
  const saveProfile = StudentUI.saveProfile;
  StudentUI.saveProfile = async (event) => {
    await saveProfile(event);
    toast("Preview changes last until this page is reloaded.");
  };
})();
